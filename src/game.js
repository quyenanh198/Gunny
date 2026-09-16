import {
  WIDTH,
  HEIGHT,
  DT,
  launch,
  step,
  collides,
  crater,
  damage,
  botShot,
} from "./physics.js";
import { MAPS } from "./maps.js";
import { CHARACTERS, WEAPONS, assetURL, loadAssets } from "./assets.js";
import {
  createAnimation,
  playAnimation,
  advanceAnimation,
} from "./animation.js";
import {
  terrainLayer,
  drawCharacter,
  drawWeapon,
  drawMuzzle,
  drawBlast,
} from "./sprites.js";
const $ = (id) => document.getElementById(id),
  canvas = $("game"),
  ctx = canvas.getContext("2d");
let terrain,
  actors,
  turn,
  round,
  wind,
  time,
  energy,
  phase,
  projectile,
  charge,
  charging,
  wait,
  particles = [],
  trail = [],
  keys = new Set(),
  last = 0,
  accumulator = 0,
  paused = false;
let images = new Map(),
  groundLayer = null,
  originalTerrain;
const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
let reducedMotion = motionPreference.matches;
motionPreference.addEventListener(
  "change",
  (event) => (reducedMotion = event.matches),
);
let blasts = [];
let activeMap = MAPS[0];
let selectedCharacter = "mochi",
  selectedWeapon = "carrot";
function refreshGround() {
  groundLayer = images.has(activeMap.ground)
    ? terrainLayer(images.get(activeMap.ground), originalTerrain, terrain)
    : null;
}
const randomWind = () => Math.round((Math.random() - 0.5) * 60);
function reset() {
  terrain = activeMap.createTerrain();
  $("mapTitle").firstChild.nodeValue = activeMap.name;
  $("mapNumber").textContent = activeMap.number;
  $("mapDescription").textContent = activeMap.description;
  $("mapLabel").textContent = `✧ ${activeMap.name.toUpperCase()} • 1 VS 1`;
  document
    .querySelectorAll(".map-card")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.map === activeMap.id),
      ),
    );
  originalTerrain = [...terrain];
  refreshGround();
  actors = [
    { x: activeMap.spawns[0], hp: 100, color: "#7ebbc9", name: "Mochi" },
    { x: activeMap.spawns[1], hp: 100, color: "#ec9b6c", name: "Hạt Dẻ" },
  ];
  actors[0].skin = selectedCharacter;
  actors[0].weapon = selectedWeapon;
  actors[0].name = CHARACTERS.find((c) => c.id === selectedCharacter).name;
  actors[1].skin = "hat-de";
  actors[1].weapon = "acorn";
  actors[1].angle = 135;
  actors.forEach((a) => {
    a.y = terrain[Math.floor(a.x)];
    a.animation = createAnimation();
    a.walking = false;
  });
  turn = 0;
  round = 1;
  wind = randomWind();
  time = 25;
  energy = 60;
  phase = "aim";
  projectile = null;
  charge = 0;
  charging = false;
  wait = 0;
  particles = [];
  blasts = [];
  trail = [];
  keys.clear();
  $("angle").value = 45;
  message("Đến lượt bạn — ngắm và giữ để bắn!");
  sync();
}
function message(s) {
  $("status").textContent = s;
}
function sync() {
  actors.forEach((a, i) => {
    $("name" + i).textContent = a.name;
    $("hp" + i).value = a.hp;
    $("health" + i).textContent = `${a.hp} / 100 HP`;
  });
  $("round").textContent = `LƯỢT ${String(round).padStart(2, "0")}`;
  $("timer").textContent = Math.ceil(time);
  $("wind").textContent = `GIÓ ${wind < 0 ? "←" : "→"} ${Math.abs(wind)}`;
  $("energy").textContent = `${Math.ceil(energy)} / 60`;
  $("angleValue").textContent = Math.round(+$("angle").value) + "°";
  $("powerValue").textContent = Math.round(charge) + "%";
  $("powerFill").style.width = charge + "%";
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
}
function nextTurn() {
  turn = 1 - turn;
  round++;
  time = 25;
  energy = 60;
  wind = randomWind();
  phase = "aim";
  wait = 1.1;
  charge = 0;
  charging = false;
  keys.clear();
  message(turn ? "Hạt Dẻ đang ngắm…" : "Đến lượt bạn — ngắm và giữ để bắn!");
}
function checkWinner() {
  actors.forEach((a) => {
    if (a.y > HEIGHT - 20) a.hp = 0;
  });
  if (actors.some((a) => a.hp <= 0)) {
    phase = "over";
    charging = false;
    message(
      actors.every((a) => a.hp <= 0)
        ? "Hòa rồi! ↻ Thử một trận nữa?"
        : actors[1].hp <= 0
          ? `Chiến thắng! ${actors[0].name} làm được rồi! ✦`
          : "Hạt Dẻ thắng! ↻ Thử lại nhé!",
    );
    return true;
  }
  return false;
}
function shoot(angle, power) {
  actors[turn].angle = angle;
  playAnimation(actors[turn].animation, "shoot");
  charging = false;
  projectile = launch(actors[turn], angle, power);
  trail = [];
  phase = "flight";
  message(turn ? "Cẩn thận! Đạn đang tới…" : "Một phát bắn đầy hy vọng!");
}
function beginCharge() {
  if (phase === "aim" && turn === 0 && !paused && !charging) {
    charging = true;
    charge = 0;
  }
}
function release() {
  if (charging) {
    if (!paused && phase === "aim" && turn === 0)
      shoot(+$("angle").value, charge);
    else charging = false;
  }
}
function explode(p) {
  blasts.push({ x: p.x, y: p.y, age: 0 });
  crater(terrain, p.x, p.y);
  refreshGround();
  actors.forEach((a) => {
    const amount = damage(a, p.x, p.y);
    if (amount > 0) playAnimation(a.animation, "hurt");
    a.hp = Math.max(0, a.hp - amount);
    a.y = terrain[Math.floor(a.x)];
  });
  for (let i = 0; i < 28; i++) {
    const a = Math.random() * Math.PI * 2,
      s = 40 + Math.random() * 150;
    particles.push({
      x: p.x,
      y: p.y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 0.7,
      color: i % 2 ? "#ffe49b" : "#f4a779",
    });
  }
  projectile = null;
  phase = "settle";
  wait = 1.1;
  checkWinner();
}
function move(dir, dt) {
  if (phase !== "aim" || turn !== 0 || energy <= 0 || charging) return;
  const a = actors[0],
    distance = Math.min(energy, 65 * dt),
    x = Math.max(25, Math.min(WIDTH - 26, a.x + dir * distance));
  if (Math.abs(x - actors[1].x) < 45) return;
  a.walking = Math.abs(x - a.x) > 0.001;
  if (a.walking) a.animation.moveDirection = dir;
  energy -= Math.abs(x - a.x);
  a.x = x;
  a.y = terrain[Math.floor(x)];
  checkWinner();
}
function update(dt) {
  if (paused) return;
  actors.forEach((a) => (a.walking = false));
  blasts.forEach((blast) => (blast.age += dt));
  blasts = blasts.filter((blast) => blast.age < 0.55);
  particles.forEach((p) => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 250 * dt;
    p.life -= dt;
  });
  particles = particles.filter((p) => p.life > 0);
  if (phase === "aim") {
    time = Math.max(0, time - dt);
    if (time === 0) {
      charging = false;
      nextTurn();
      return;
    }
    if (turn === 0) {
      if (keys.has("left")) move(-1, dt);
      if (keys.has("right")) move(1, dt);
      if (keys.has("up"))
        $("angle").value = Math.min(170, +$("angle").value + 45 * dt);
      if (keys.has("down"))
        $("angle").value = Math.max(10, +$("angle").value - 45 * dt);
      if (charging) charge = Math.min(100, charge + 45 * dt);
    } else {
      wait -= dt;
      if (wait <= 0) {
        const shot = botShot(actors[1], actors[0], wind, terrain);
        shoot(shot.angle, shot.power);
      }
    }
  } else if (phase === "flight") {
    step(projectile, wind, dt);
    if (Math.random() < 0.4) trail.push({ x: projectile.x, y: projectile.y });
    if (trail.length > 50) trail.shift();
    if (
      collides(projectile, terrain) ||
      actors.some(
        (a, i) =>
          i !== turn &&
          Math.hypot(a.x - projectile.x, a.y - 25 - projectile.y) < 24,
      )
    )
      explode(projectile);
    else if (
      projectile.x < 0 ||
      projectile.x >= WIDTH ||
      projectile.y > HEIGHT ||
      projectile.age > 15
    ) {
      projectile = null;
      phase = "settle";
      wait = 0.6;
      message("Chệch một chút rồi!");
    }
  } else if (phase === "settle") {
    wait -= dt;
    if (wait <= 0 && !checkWinner()) nextTurn();
  }
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
function cloud(x, y, s = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ellipse(0, 0, 64, 18, "#f4fcf0");
  ellipse(-23, -13, 28, 23, "#f4fcf0");
  ellipse(14, -21, 34, 29, "#f4fcf0");
  ctx.restore();
}
function tree(x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  path(
    [
      [-6, 0],
      [7, 0],
      [4, -87],
      [-3, -87],
    ],
    "#69836a",
  );
  ellipse(0, -92, 39, 42, "#78ae8c");
  ellipse(-22, -76, 29, 31, "#78ae8c");
  ellipse(27, -79, 29, 29, "#83b693");
  ellipse(-10, -107, 18, 17, "#91c39c");
  ctx.restore();
}
function character(a, i) {
  const angle = i === 0 ? +$("angle").value : a.angle;
  const sprite = images.get(a.skin);
  if (sprite) {
    drawCharacter(
      ctx,
      sprite,
      a,
      a.animation.state === "walk"
        ? a.animation.moveDirection
        : angle > 90
          ? -1
          : 1,
      turn === i && phase !== "over",
      images.get(`${a.skin}-animation`),
      reducedMotion,
    );
    const weapon = images.get(a.weapon);
    drawWeapon(ctx, weapon, a, angle, reducedMotion);
    drawMuzzle(ctx, a, angle, reducedMotion);
    return;
  }
  ctx.save();
  ctx.translate(a.x, a.y);
  ellipse(0, 0, 28, 6, "#263d3930");
  ellipse(-11, -5, 11, 7, "#384e57");
  ellipse(11, -5, 11, 7, "#384e57");
  ellipse(0, -23, 20, 24, a.color);
  ellipse(0, -19, 11, 13, "#f6e5c3");
  if (i === 0) {
    ellipse(-14, -85, 9, 26, "#f3f0dc");
    ellipse(12, -86, 9, 26, "#f3f0dc");
    ellipse(-14, -87, 4, 16, "#e8bcb2");
    ellipse(12, -88, 4, 16, "#e8bcb2");
  } else {
    path(
      [
        [-29, -63],
        [-29, -96],
        [-7, -77],
      ],
      "#d78654",
    );
    path(
      [
        [7, -77],
        [29, -96],
        [29, -63],
      ],
      "#d78654",
    );
    path(
      [
        [-25, -77],
        [-24, -89],
        [-15, -77],
      ],
      "#f1ceb0",
    );
    path(
      [
        [15, -77],
        [24, -89],
        [25, -77],
      ],
      "#f1ceb0",
    );
  }
  ellipse(0, -57, 31, 29, i === 0 ? "#f8f0dd" : "#e8a775");
  ellipse(0, -51, 24, 21, "#fff0d5");
  ellipse(-10, -57, 3, 5, "#344647");
  ellipse(10, -57, 3, 5, "#344647");
  ellipse(-18, -48, 5, 3, "#eeae9d");
  ellipse(18, -48, 5, 3, "#eeae9d");
  ctx.strokeStyle = "#6c5c4b";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, -51, 5, 0.2, Math.PI - 0.2);
  ctx.stroke();
  ctx.fillStyle = i === 0 ? "#76acb3" : "#c77750";
  ctx.fillRect(-27, -76, 54, 7);
  ellipse(-14, -77, 12, 7, i === 0 ? "#aacb9b" : "#e8be7c");
  const radians = ((i === 0 ? +$("angle").value : 135) * Math.PI) / 180;
  ctx.save();
  ctx.translate(0, -30);
  ctx.rotate(-radians);
  ctx.fillStyle = "#43585e";
  ctx.fillRect(4, -7, 33, 14);
  ctx.fillStyle = "#e8d4a0";
  ctx.fillRect(27, -9, 10, 18);
  ctx.restore();
  ellipse(i === 0 ? 15 : -15, -28, 7, 8, "#f3dab3");
  if (turn === i && phase !== "over") {
    path(
      [
        [-6, -121],
        [6, -121],
        [0, -112],
      ],
      "#ffde86",
    );
  }
  ctx.restore();
}
function render() {
  if (images.has(activeMap.background)) {
    ctx.drawImage(images.get(activeMap.background), 0, 0, WIDTH, HEIGHT);
  } else {
    const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(0, "#a6d9df");
    sky.addColorStop(1, "#f2f3cc");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ellipse(930, 134, 51, 51, "#fff2bf99");
    cloud(190, 165, 0.9);
    cloud(660, 108, 0.65);
    cloud(1060, 207, 0.7);
    path(
      [
        [0, 375],
        [90, 272],
        [190, 365],
        [355, 193],
        [530, 373],
        [685, 260],
        [830, 380],
        [1035, 242],
        [1200, 360],
        [1200, 620],
        [0, 620],
      ],
      "#92c5b2",
    );
    path(
      [
        [295, 255],
        [355, 193],
        [413, 260],
        [369, 241],
        [350, 260],
        [332, 237],
      ],
      "#daecce",
    );
    path(
      [
        [0, 430],
        [195, 315],
        [353, 413],
        [570, 303],
        [793, 416],
        [998, 321],
        [1200, 427],
        [1200, 620],
        [0, 620],
      ],
      "#aad0ad",
    );
    tree(93, 435, 1.3);
    tree(1120, 430, 1.6);
    tree(730, 425, 0.65);
  }
  if (groundLayer) {
    ctx.drawImage(groundLayer, 0, 0);
  } else {
    ctx.beginPath();
    ctx.moveTo(0, HEIGHT);
    terrain.forEach((y, x) => ctx.lineTo(x, y));
    ctx.lineTo(WIDTH, HEIGHT);
    ctx.closePath();
    ctx.fillStyle = "#aa8760";
    ctx.fill();
    ctx.save();
    ctx.clip();
    for (let row = 0; row < 5; row++)
      for (let x = 0; x < WIDTH; x += 51)
        ellipse(x + (row % 2) * 23, 473 + row * 36, 3, 2, "#d8b984");
    ctx.restore();
    ctx.beginPath();
    terrain.forEach((y, x) => (x ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = "#71984f";
    ctx.lineWidth = 15;
    ctx.stroke();
    ctx.beginPath();
    terrain.forEach((y, x) =>
      x ? ctx.lineTo(x, y - 4) : ctx.moveTo(x, y - 4),
    );
    ctx.strokeStyle = "#bbd780";
    ctx.lineWidth = 6;
    ctx.stroke();
    for (let x = 35; x < WIDTH; x += 77) {
      let y = terrain[x];
      if (y < 490) {
        ctx.strokeStyle = "#6e944d";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y - 5);
        ctx.lineTo(x - 4, y - 15);
        ctx.moveTo(x, y - 5);
        ctx.lineTo(x + 4, y - 18);
        ctx.stroke();
        ellipse(x + 4, y - 19, 3, 3, x % 2 ? "#faf0bf" : "#eeb69b");
      }
    }
  }
  actors.forEach(character);
  if (turn === 0 && phase === "aim") {
    const p = launch(actors[0], +$("angle").value, charging ? charge : 50);
    for (let n = 0; n < 38; n++) {
      step(p, wind, 0.025);
      if (collides(p, terrain)) break;
      if (n % 4 === 0) ellipse(p.x, p.y, 2.5, 2.5, "#ffffefaa");
    }
  }
  trail.forEach((p, i) =>
    ellipse(
      p.x,
      p.y,
      (3 * i) / trail.length,
      (3 * i) / trail.length,
      "#fff9dfbb",
    ),
  );
  if (projectile) {
    ellipse(
      projectile.x,
      projectile.y,
      8,
      8,
      WEAPONS.find((w) => w.id === actors[turn].weapon).color,
    );
    ellipse(projectile.x - 2, projectile.y - 3, 3, 3, "#fff0b7");
  }
  blasts.forEach((blast) => drawBlast(ctx, blast, reducedMotion));
  particles.forEach((p) => {
    ctx.globalAlpha = Math.max(0, p.life / 0.7);
    ellipse(p.x, p.y, 5, 5, p.color);
  });
  ctx.globalAlpha = 1;
}
function frame(now) {
  const elapsed = Math.min((now - last) / 1000, 0.1);
  last = now;
  accumulator += elapsed;
  while (accumulator >= DT) {
    update(DT);
    if (!paused)
      actors.forEach((a) =>
        advanceAnimation(a.animation, DT, {
          moving: a.walking,
          dead: a.hp <= 0,
        }),
      );
    accumulator -= DT;
  }
  render();
  sync();
  requestAnimationFrame(frame);
}
$("fire").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  $("fire").setPointerCapture(e.pointerId);
  beginCharge();
});
$("fire").addEventListener("pointerup", release);
$("fire").addEventListener("pointercancel", () => (charging = false));
for (const id of ["left", "right"]) {
  $(id).addEventListener("pointerdown", (e) => {
    e.preventDefault();
    $(id).setPointerCapture(e.pointerId);
    keys.add(id);
  });
  $(id).addEventListener("pointerup", () => keys.delete(id));
  $(id).addEventListener("pointercancel", () => keys.delete(id));
}
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
    keys.add(keyMap[e.key]);
  }
  if (e.code === "Space") {
    e.preventDefault();
    if (!e.repeat) beginCharge();
  }
});
window.addEventListener("keyup", (e) => {
  if (keyMap[e.key]) keys.delete(keyMap[e.key]);
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
window.addEventListener("blur", () => {
  keys.clear();
  charging = false;
});
document.addEventListener("visibilitychange", () => {
  paused = document.hidden || $("guide").open;
  keys.clear();
  charging = false;
});
$("restart").onclick = () => {
  reset();
  updateLoadout();
};
$("help").onclick = () => {
  keys.clear();
  charging = false;
  paused = true;
  $("guide").showModal();
};
$("closeHelp").onclick = () => $("guide").close();
$("guide").addEventListener("close", () => (paused = document.hidden));
await start();

function updateLoadout() {
  for (const [index, actor] of actors.entries()) {
    const img = $("avatar" + index);
    img.src = assetURL(CHARACTERS.find((c) => c.id === actor.skin).file);
    img.alt = actor.name;
  }
  document.querySelectorAll(".loadout button").forEach((button) => {
    const selected =
      button.dataset.kind === "character" ? selectedCharacter : selectedWeapon;
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
      button.onclick = () => {
        if (turn !== 0 || phase !== "aim" || paused || charging) return;
        if (kind === "character") {
          selectedCharacter = entry.id;
          actors[0].skin = entry.id;
          actors[0].animation = createAnimation();
          actors[0].name = entry.name;
        } else {
          selectedWeapon = entry.id;
          actors[0].weapon = entry.id;
        }
        keys.clear();
        updateLoadout();
      };
      $(kind + "Choices").append(button);
    }
  }
}
async function start() {
  paused = true;
  reset();
  paused = true;
  sync();
  $("restart").disabled = true;
  $("help").disabled = true;
  message("Đang tải sân đấu và sprite…");
  const loaded = await loadAssets();
  images = loaded.images;
  buildLoadout();
  buildMapChoices();
  reset();
  updateLoadout();
  $("assetStatus").textContent = loaded.failed.length
    ? `Thiếu ${loaded.failed.length} hình — đang dùng hình dự phòng. Tải lại trang để thử lại.`
    : "4 nhân vật · 6 vũ khí · Chọn trong lượt của bạn";
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
      if (paused || activeMap.id === map.id) return;
      activeMap = map;
      reset();
      updateLoadout();
    };
    $("mapChoices").append(button);
  }
}
