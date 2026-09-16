import { WIDTH, HEIGHT, DT, step, collides, ROCK_Y } from "./physics.js";
import { CHARACTERS, WEAPONS, assetURL, loadAssets } from "./assets.js";
import {
  terrainLayer,
  drawCharacter,
  drawWeapon,
  drawMuzzle,
  drawBlast,
} from "./sprites.js";
import { Match, MAX_ROUNDS, DIFFICULTIES, ammoOf } from "./match.js";
import { MAPS } from "./maps.js";
const $ = (id) => document.getElementById(id),
  canvas = $("game"),
  ctx = canvas.getContext("2d");
const seed = new URLSearchParams(location.search).get("seed");
const m = new Match({ seed: seed === null ? undefined : +seed });
let images = new Map(),
  groundLayer = null,
  last = 0,
  accumulator = 0,
  paused = false;
const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
let reducedMotion = motionPreference.matches;
motionPreference.addEventListener(
  "change",
  (event) => (reducedMotion = event.matches),
);
function refreshGround() {
  groundLayer = images.has(m.map.ground)
    ? terrainLayer(images.get(m.map.ground), m.originalTerrain, m.terrain)
    : null;
  m.terrainDirty = false;
}
function sync() {
  const { actors, turn, phase, charging } = m;
  actors.forEach((a, i) => {
    $("name" + i).textContent = a.name;
    $("hp" + i).value = a.hp;
    $("health" + i).textContent = `${a.hp} / 100 HP`;
  });
  $("round").textContent = `LƯỢT ${String(m.round).padStart(2, "0")}/${MAX_ROUNDS}`;
  $("timer").textContent = Math.ceil(m.time);
  $("wind").textContent = `GIÓ ${m.wind < 0 ? "←" : "→"} ${Math.abs(m.wind)}`;
  $("energy").textContent = `${Math.ceil(m.energy)} / 100`;
  const tilt = Math.round(m.tiltOf(actors[0]));
  $("angle").value = actors[0].angle;
  $("angleValue").firstChild.textContent = Math.round(actors[0].angle) + "° ";
  $("tiltValue").textContent = tilt ? `${tilt > 0 ? "+" : ""}${tilt}° dốc` : "";
  $("powerValue").textContent = Math.round(m.charge) + "%";
  $("powerFill").style.width = m.charge + "%";
  $("status").textContent = m.status;
  const disabled = turn !== 0 || phase !== "aim" || paused;
  ["fire", "angle", "left", "right"].forEach(
    (id) => ($(id).disabled = disabled),
  );
  document
    .querySelectorAll(".loadout button")
    .forEach((button) => (button.disabled = disabled || charging));
  $("turnHint").textContent =
    phase === "over"
      ? "Trận đấu kết thúc"
      : turn === 0
        ? "Lượt của bạn"
        : "Bot đang ngắm";
  $("mapTitle").firstChild.nodeValue = m.map.name;
  $("mapNumber").textContent = m.map.number;
  $("mapDescription").textContent = m.map.description;
  $("mapLabel").textContent = `✧ ${m.map.name.toUpperCase()} • 1 VS 1`;
  document
    .querySelectorAll(".map-card")
    .forEach((button) =>
      button.setAttribute("aria-pressed", String(button.dataset.map === m.map.id)),
    );
}
function ellipse(x, y, rx, ry, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}
function path(points, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
}
function character(a, i) {
  const sprite = images.get(a.skin),
    active = m.turn === i && m.phase !== "over";
  ctx.save();
  // Stand perpendicular to the slope; the weapon inherits the tilt, matching launch().
  ctx.translate(a.x, a.y);
  ctx.rotate((-m.tiltOf(a) * Math.PI) / 180);
  ctx.translate(-a.x, -a.y);
  if (sprite) {
    const facing =
      a.animation.state === "walk"
        ? a.animation.moveDirection
        : a.angle > 90
          ? -1
          : 1;
    drawCharacter(ctx, sprite, a, facing, active, {
      flash: a.hurt / 0.3,
      sheet: images.get(`${a.skin}-animation`),
      reducedMotion,
    });
  } else {
    // Minimal stand-in when the sprite failed to load.
    ellipse(a.x, a.y, 25, 5, "#183a3e35");
    ellipse(a.x, a.y - 40, 22, 40, a.color);
    ellipse(a.x, a.y - 88, 24, 24, "#fff0d5");
    if (active) path([[a.x - 7, a.y - 125], [a.x + 7, a.y - 125], [a.x, a.y - 116]], "#ffe3a0");
  }
  drawWeapon(ctx, images.get(a.weapon), a, a.angle, reducedMotion);
  drawMuzzle(ctx, a, a.angle, reducedMotion);
  ctx.restore();
}
function render() {
  const { actors, turn, phase, projectile, trail } = m;
  ctx.save();
  if (m.shake > 0 && !reducedMotion) {
    const s = (m.shake / 0.3) * 6;
    ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
  }
  if (images.has(m.map.background)) {
    ctx.drawImage(images.get(m.map.background), 0, 0, WIDTH, HEIGHT);
  } else {
    const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(0, "#a6d9df");
    sky.addColorStop(1, "#f2f3cc");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
  if (groundLayer) {
    ctx.drawImage(groundLayer, 0, 0);
  } else {
    ctx.beginPath();
    ctx.moveTo(0, HEIGHT);
    m.terrain.forEach((y, x) => ctx.lineTo(x, y));
    ctx.lineTo(WIDTH, HEIGHT);
    ctx.closePath();
    ctx.fillStyle = "#aa8760";
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = "#4a4552";
    ctx.fillRect(0, ROCK_Y, WIDTH, HEIGHT - ROCK_Y);
    ctx.fillStyle = "#7a7284";
    ctx.fillRect(0, ROCK_Y, WIDTH, 3);
    ctx.restore();
    ctx.beginPath();
    m.terrain.forEach((y, x) => (x ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = "#71984f";
    ctx.lineWidth = 15;
    ctx.stroke();
  }
  actors.forEach(character);
  if (turn === 0 && phase === "aim") {
    const p = m.previewShot(m.charging ? m.charge : 50);
    for (let n = 0; n < 38; n++) {
      step(p, m.wind, 0.025);
      if (collides(p, m.terrain)) break;
      if (n % 4 === 0) ellipse(p.x, p.y, 2.5, 2.5, "#ffffefaa");
    }
  }
  const weaponColor = WEAPONS.find((w) => w.id === actors[turn].weapon).color;
  trail.forEach((p, i) =>
    ellipse(p.x, p.y, (3 * i) / trail.length, (3 * i) / trail.length, weaponColor + "bb"),
  );
  if (projectile) {
    ctx.save();
    ctx.translate(projectile.x, projectile.y);
    ctx.rotate(Math.atan2(projectile.vy, projectile.vx));
    ellipse(0, 0, 10, 7, weaponColor);
    ellipse(-3, -2, 3, 2.5, "#fff0b7");
    ctx.restore();
    if (projectile.y < 0) {
      // Above the frame: marker below the scoreboard overlay plus height, so the shot stays trackable.
      const x = Math.max(30, Math.min(WIDTH - 30, projectile.x));
      path([[x - 12, 140], [x + 12, 140], [x, 120]], weaponColor);
      ctx.font = "800 26px 'Be Vietnam Pro', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#3a2a1d";
      ctx.strokeText(`${Math.round(-projectile.y)} px`, x, 168);
      ctx.fillStyle = "#ffffffdd";
      ctx.fillText(`${Math.round(-projectile.y)} px`, x, 168);
    }
  }
  m.blasts.forEach((blast) => drawBlast(ctx, blast, reducedMotion));
  m.particles.forEach((p) => {
    ctx.globalAlpha = Math.max(0, p.life / 0.7);
    ellipse(p.x, p.y, 5, 5, p.color);
  });
  ctx.globalAlpha = 1;
  // Large text so the number stays readable when the canvas is scaled to a phone.
  ctx.font = "900 34px 'Be Vietnam Pro', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.lineWidth = 5;
  m.popups.forEach((p) => {
    ctx.globalAlpha = Math.min(1, p.life * 2);
    const y = p.y - (1 - p.life) * 40;
    ctx.strokeStyle = "#3a2a1d";
    ctx.strokeText(p.text, p.x, y);
    ctx.fillStyle = "#ffd27b";
    ctx.fillText(p.text, p.x, y);
  });
  ctx.globalAlpha = 1;
  ctx.restore();
}
function frame(now) {
  const elapsed = Math.min((now - last) / 1000, 0.1);
  last = now;
  accumulator += elapsed;
  while (accumulator >= DT) {
    if (!paused) m.update(DT);
    accumulator -= DT;
  }
  if (m.terrainDirty) refreshGround();
  render();
  sync();
  requestAnimationFrame(frame);
}
const beginCharge = () => {
  if (!paused) m.beginCharge();
};
const release = () => {
  if (paused) m.cancelCharge();
  else m.release();
};
$("fire").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  $("fire").setPointerCapture(e.pointerId);
  beginCharge();
});
$("fire").addEventListener("pointerup", release);
$("fire").addEventListener("pointercancel", () => m.cancelCharge());
for (const id of ["left", "right"]) {
  $(id).addEventListener("pointerdown", (e) => {
    e.preventDefault();
    $(id).setPointerCapture(e.pointerId);
    m.keys.add(id);
  });
  $(id).addEventListener("pointerup", () => m.keys.delete(id));
  $(id).addEventListener("pointercancel", () => m.keys.delete(id));
}
$("angle").addEventListener("input", () => m.setAim(+$("angle").value));
const keyMap = {
  a: "left",
  d: "right",
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};
window.addEventListener("keydown", (e) => {
  if (paused || e.target.closest("input,button,select")) return;
  if (keyMap[e.key]) {
    e.preventDefault();
    m.keys.add(keyMap[e.key]);
  }
  if (e.code === "Space") {
    e.preventDefault();
    if (!e.repeat) beginCharge();
  }
});
window.addEventListener("keyup", (e) => {
  if (keyMap[e.key]) m.keys.delete(keyMap[e.key]);
  if (e.code === "Space") {
    e.preventDefault();
    release();
  }
});
$("fire").addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "Enter") {
    e.preventDefault();
    if (!e.repeat) beginCharge();
  }
});
$("fire").addEventListener("keyup", (e) => {
  if (e.code === "Space" || e.code === "Enter") {
    e.preventDefault();
    release();
  }
});
window.addEventListener("blur", () => m.cancelCharge());
document.addEventListener("visibilitychange", () => {
  paused = document.hidden || $("guide").open;
  m.cancelCharge();
});
$("restart").onclick = () => {
  m.reset();
  updateLoadout();
};
$("help").onclick = () => {
  m.cancelCharge();
  paused = true;
  $("guide").showModal();
};
$("closeHelp").onclick = () => $("guide").close();
$("guide").addEventListener("close", () => (paused = document.hidden));
$("difficulty").onchange = () => m.setDifficulty($("difficulty").value);
await start();

function updateLoadout() {
  for (const [index, actor] of m.actors.entries()) {
    const img = $("avatar" + index);
    img.src = assetURL(CHARACTERS.find((c) => c.id === actor.skin).file);
    img.alt = actor.name;
  }
  const [lo] = ammoOf(m.actors[0]).angles;
  $("angle").min = lo;
  $("angle").max = 180 - lo;
  $("tickMin").textContent = lo + "°";
  $("tickMax").textContent = 180 - lo + "°";
  document.querySelectorAll(".loadout button").forEach((button) => {
    const selected =
      button.dataset.kind === "character" ? m.character : m.weapon;
    button.setAttribute("aria-pressed", String(button.dataset.id === selected));
  });
}
function buildLoadout() {
  for (const [kind, entries] of [
    ["character", CHARACTERS],
    ["weapon", WEAPONS],
  ]) {
    for (const entry of entries) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.kind = kind;
      button.dataset.id = entry.id;
      const image = document.createElement("img");
      image.src = assetURL(entry.file);
      image.alt = "";
      image.onerror = () => (image.hidden = true);
      const name = document.createElement("span");
      name.textContent = entry.name;
      button.append(image, name);
      if (entry.ammo) {
        const desc = document.createElement("small");
        desc.textContent = `${entry.desc} · Góc ${entry.ammo.angles[0]}-${entry.ammo.angles[1]}`;
        button.append(desc);
      }
      button.onclick = () => {
        if (paused) return;
        if (m.setLoadout({ [kind]: entry.id })) updateLoadout();
      };
      $(kind + "Choices").append(button);
    }
  }
  for (const d of DIFFICULTIES) {
    const option = document.createElement("option");
    option.value = d.id;
    option.textContent = d.name;
    option.selected = d.id === m.difficulty.id;
    $("difficulty").append(option);
  }
}
async function start() {
  paused = true;
  sync();
  $("restart").disabled = true;
  $("help").disabled = true;
  $("status").textContent = "Đang tải sân đấu và sprite…";
  const loaded = await loadAssets();
  images = loaded.images;
  buildLoadout();
  buildMapChoices();
  m.reset();
  updateLoadout();
  $("assetStatus").textContent = loaded.failed.length
    ? `Thiếu ${loaded.failed.length} hình — đang dùng hình dự phòng. Tải lại trang để thử lại.`
    : `4 nhân vật · 6 vũ khí · ${MAPS.length} bản đồ`;
  paused = document.hidden;
  $("restart").disabled = false;
  $("help").disabled = false;
  requestAnimationFrame(frame);
}

function buildMapChoices() {
  for (const map of MAPS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "map-card";
    button.dataset.map = map.id;
    button.setAttribute("aria-label", `Bắt đầu trận tại ${map.name}`);
    const image = document.createElement("img");
    image.src = assetURL(map.preview);
    image.alt = "";
    image.onerror = () => (image.hidden = true);
    const title = document.createElement("strong");
    title.textContent = `${map.number} · ${map.name}`;
    button.append(image, title);
    button.onclick = () => {
      if (paused || !m.setMap(map.id)) return;
      refreshGround();
      updateLoadout();
      sync();
    };
    $("mapChoices").append(button);
  }
}
