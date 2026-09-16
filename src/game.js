import { WIDTH, HEIGHT, DT, step, collides, ROCK_Y } from "./physics.js";
import { CHARACTERS, WEAPONS, assetURL, loadAssets } from "./assets.js";
import {
  terrainLayer,
  drawCharacter,
  drawWeapon,
  drawMuzzle,
  drawBlast,
} from "./sprites.js";
import { Match, MAX_ROUNDS, MAX_TEAM, DIFFICULTIES, ammoOf } from "./match.js";
import { MAPS } from "./maps.js";
const $ = (id) => document.getElementById(id),
  canvas = $("game"),
  ctx = canvas.getContext("2d");
const params = new URLSearchParams(location.search);
const seed = params.get("seed");
const m = new Match({ seed: seed === null ? undefined : +seed });
// Lobby draft: what the start screen edits before a match exists.
const lobby = readInvite(params.get("lobby")) || {
  map: m.map.id,
  difficulty: m.difficulty.id,
  teams: [
    [{ control: "human", name: "Bạn", skin: "mochi", weapon: "carrot" }],
    [{ control: "bot", skin: "", weapon: "" }],
  ],
};
const inLobby = () => document.body.classList.contains("in-lobby");
let images = new Map(),
  groundLayer = null,
  lastTurn = -1,
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
// The actor a team card shows: the one acting now, else the next one to act.
function teamFace(team) {
  if (m.current.team === team) return m.current;
  const alive = m.alive(team);
  return alive[m.cursor[team] % alive.length] || m.actors.find((a) => a.team === team);
}
function sync() {
  const { actors, phase, charging } = m;
  for (const team of [0, 1]) {
    const face = teamFace(team),
      size = actors.filter((a) => a.team === team).length;
    $("name" + team).textContent = face.name;
    $("tag" + team).textContent =
      face.control === "bot" ? "BOT" : face.player === 1 && size === 1 ? "BẠN" : `NGƯỜI ${face.player}`;
    $("hp" + team).max = size * 100;
    $("hp" + team).value = m.teamHp(team);
    $("health" + team).textContent = `${m.teamHp(team)} / ${size * 100} HP`;
    const img = $("avatar" + team);
    const src = assetURL(CHARACTERS.find((c) => c.id === face.skin).file);
    if (img.getAttribute("src") !== src) img.src = src;
    img.alt = face.name;
  }
  $("round").textContent = `LƯỢT ${String(m.round).padStart(2, "0")}/${MAX_ROUNDS}`;
  $("timer").textContent = Math.ceil(m.time);
  // Wind is px/s² in physics (max 30); players see a 0..10 scale.
  $("wind").textContent = m.wind
    ? `GIÓ ${m.wind < 0 ? "←" : "→"} cấp ${Math.ceil(Math.abs(m.wind) / 3)}`
    : "GIÓ LẶNG";
  $("energy").textContent = `${Math.ceil(m.energy)} / 100`;
  const tilt = Math.round(m.tiltOf(m.current));
  $("angle").value = m.current.angle;
  $("angleValue").firstChild.textContent = Math.round(m.current.angle) + "° ";
  $("tiltValue").textContent = tilt ? `${tilt > 0 ? "+" : ""}${tilt}° dốc` : "";
  $("powerValue").textContent = Math.round(m.charge) + "%";
  $("powerFill").style.width = m.charge + "%";
  $("status").textContent = m.status;
  const disabled = !m.playerCanAct || paused;
  ["fire", "angle", "left", "right"].forEach(
    (id) => ($(id).disabled = disabled),
  );
  document
    .querySelectorAll(".loadout button")
    .forEach((button) => (button.disabled = disabled || charging));
  $("turnHint").textContent =
    phase === "over"
      ? "Trận đấu kết thúc"
      : m.current.control === "human"
        ? `Lượt của ${m.current.name}`
        : "Bot đang ngắm";
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
  if (a.hp <= 0) ctx.globalAlpha = 0.45;
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
  // Name tag so teams of several actors stay readable.
  ctx.font = "800 20px 'Be Vietnam Pro', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#1c3b41";
  ctx.strokeText(a.name, a.x, a.y - 134);
  ctx.fillStyle = a.team === 0 ? "#d2ef9c" : "#ffb494";
  ctx.fillText(a.name, a.x, a.y - 134);
}
function render() {
  const { actors, projectile, trail } = m;
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
  if (m.playerCanAct) {
    const p = m.previewShot(m.charging ? m.charge : 50);
    for (let n = 0; n < 38; n++) {
      step(p, m.wind, 0.025);
      if (collides(p, m.terrain)) break;
      if (n % 4 === 0) ellipse(p.x, p.y, 2.5, 2.5, "#ffffefaa");
    }
  }
  const weaponColor = WEAPONS.find((w) => w.id === m.current.weapon).color;
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
  if (lastTurn !== m.turn) {
    lastTurn = m.turn;
    updateLoadout();
  }
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
  if (paused || inLobby() || e.target.closest("input,button,select")) return;
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
  paused = document.hidden || $("guide").open || inLobby();
  m.cancelCharge();
});
$("restart").onclick = () => {
  m.reset();
  updateLoadout();
};
$("toLobby").onclick = () => {
  m.cancelCharge();
  lobby.map = m.map.id;
  lobby.difficulty = m.difficulty.id;
  openLobby();
};
$("startMatch").onclick = () => startMatch();
$("lobbyDifficulty").onchange = () => (lobby.difficulty = $("lobbyDifficulty").value);
document.querySelectorAll(".add-human, .add-bot").forEach((button) => {
  button.onclick = () => {
    const team = lobby.teams[+button.dataset.team];
    if (team.length >= MAX_TEAM) return;
    const humans = lobby.teams.flat().filter((p) => p.control === "human").length;
    team.push(
      button.classList.contains("add-human")
        ? { control: "human", name: `Người ${humans + 1}`, skin: freeSkin(), weapon: "carrot" }
        : { control: "bot", skin: "", weapon: "" },
    );
    renderLobby();
  };
});
$("copyInvite").onclick = async () => {
  const url = new URL(location.href);
  url.searchParams.set("lobby", encodeInvite(lobby));
  if (m.seed !== undefined) url.searchParams.set("seed", m.seed);
  try {
    await navigator.clipboard.writeText(url.toString());
    $("inviteStatus").textContent = "Đã sao chép! Gửi link cho bạn bè — mở ra là thấy đúng đội hình này.";
  } catch {
    $("inviteStatus").textContent = url.toString();
  }
};
$("help").onclick = () => {
  m.cancelCharge();
  paused = true;
  $("guide").showModal();
};
$("closeHelp").onclick = () => $("guide").close();
$("guide").addEventListener("close", () => (paused = document.hidden || inLobby()));
$("difficulty").onchange = () => m.setDifficulty($("difficulty").value);
$("map").onchange = () => {
  m.setMap($("map").value);
  refreshGround();
  updateLoadout();
};
await start();

// ---------- Lobby ----------
function encodeInvite(draft) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(draft)))).replace(/=+$/, "");
}
function readInvite(text) {
  if (!text) return null;
  try {
    const draft = JSON.parse(decodeURIComponent(escape(atob(text))));
    if (!Array.isArray(draft.teams) || draft.teams.length !== 2) return null;
    return {
      map: MAPS.some((map) => map.id === draft.map) ? draft.map : MAPS[0].id,
      difficulty: DIFFICULTIES.some((d) => d.id === draft.difficulty) ? draft.difficulty : "normal",
      teams: draft.teams.map((members) =>
        (Array.isArray(members) ? members : []).slice(0, MAX_TEAM).map((p) => ({
          control: p?.control === "bot" ? "bot" : "human",
          name: typeof p?.name === "string" ? p.name.slice(0, 16) : "",
          skin: CHARACTERS.some((c) => c.id === p?.skin) ? p.skin : "",
          weapon: WEAPONS.some((w) => w.id === p?.weapon) ? p.weapon : "",
        })),
      ),
    };
  } catch {
    return null;
  }
}
// A skin no lobby member has yet, so new players don't all look alike.
function freeSkin() {
  const used = lobby.teams.flat().map((p) => p.skin);
  return (CHARACTERS.find((c) => !used.includes(c.id)) || CHARACTERS[0]).id;
}
function openLobby() {
  paused = true;
  document.body.classList.add("in-lobby");
  renderLobby();
  window.scrollTo({ top: 0 });
}
function startMatch() {
  if ($("startMatch").disabled) return;
  m.setDifficulty(lobby.difficulty);
  if (m.map.id !== lobby.map) m.map = MAPS.find((map) => map.id === lobby.map) || m.map;
  m.setRoster(lobby.teams);
  refreshGround();
  document.body.classList.remove("in-lobby");
  paused = document.hidden;
  lastTurn = -1;
  updateLoadout();
  window.scrollTo({ top: 0 });
}
function option(select, value, text, selected) {
  const o = document.createElement("option");
  o.value = value;
  o.textContent = text;
  o.selected = selected;
  select.append(o);
}
function renderLobby() {
  $("lobbyMapName").textContent = (MAPS.find((map) => map.id === lobby.map) || MAPS[0]).name;
  $("lobbyDifficulty").value = lobby.difficulty;
  document
    .querySelectorAll(".map-card")
    .forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.map === lobby.map)));
  lobby.teams.forEach((members, t) => {
    const box = $("members" + t);
    box.replaceChildren();
    if (!members.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Chưa có ai — một bot sẽ được thêm khi bắt đầu.";
      box.append(empty);
    }
    members.forEach((member, i) => {
      const row = document.createElement("div");
      row.className = `member ${member.control}`;
      const skin = CHARACTERS.find((c) => c.id === member.skin) || null;
      const img = document.createElement("img");
      img.alt = "";
      img.src = assetURL((skin || CHARACTERS[i % CHARACTERS.length]).file);
      img.onerror = () => (img.hidden = true);
      const fields = document.createElement("div");
      fields.className = "fields";
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = member.control === "human" ? "NGƯỜI" : "BOT";
      if (member.control === "human") {
        const nameLabel = document.createElement("label");
        nameLabel.className = "wide";
        nameLabel.textContent = "TÊN";
        const name = document.createElement("input");
        name.maxLength = 16;
        name.value = member.name;
        name.placeholder = `Người ${i + 1}`;
        name.oninput = () => (member.name = name.value);
        nameLabel.append(name);
        fields.append(nameLabel);
      }
      const skinLabel = document.createElement("label");
      skinLabel.textContent = "NHÂN VẬT";
      const skinSelect = document.createElement("select");
      if (member.control === "bot") option(skinSelect, "", "Ngẫu nhiên", member.skin === "");
      for (const c of CHARACTERS) option(skinSelect, c.id, c.name, c.id === member.skin);
      skinSelect.onchange = () => {
        member.skin = skinSelect.value;
        renderLobby();
      };
      skinLabel.append(skinSelect);
      fields.append(skinLabel);
      if (member.control === "human") {
        const weaponLabel = document.createElement("label");
        weaponLabel.textContent = "VŨ KHÍ";
        const weaponSelect = document.createElement("select");
        for (const w of WEAPONS) option(weaponSelect, w.id, w.name, w.id === member.weapon);
        weaponSelect.onchange = () => (member.weapon = weaponSelect.value);
        weaponLabel.append(weaponSelect);
        fields.append(weaponLabel);
      } else {
        const hint = document.createElement("label");
        hint.textContent = "VŨ KHÍ";
        const note = document.createElement("span");
        note.textContent = "Hạt dẻ · độ khó chung";
        note.style.fontSize = "12px";
        note.style.color = "#ecf4ed";
        note.style.letterSpacing = "0";
        hint.append(note);
        fields.append(hint);
      }
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove";
      remove.title = "Bỏ khỏi đội";
      remove.textContent = "×";
      remove.onclick = () => {
        members.splice(i, 1);
        renderLobby();
      };
      const left = document.createElement("div");
      left.append(img, badge);
      left.style.display = "grid";
      left.style.gap = "6px";
      left.style.justifyItems = "center";
      row.append(left, fields, remove);
      box.append(row);
    });
    document.querySelectorAll(`.team-actions button[data-team="${t}"]`).forEach((b) => (b.disabled = members.length >= MAX_TEAM));
  });
  const humans = lobby.teams.flat().filter((p) => p.control === "human").length;
  $("lobbyStatus").textContent = `${humans} người · ${lobby.teams.flat().length - humans} bot · ${lobby.teams.map((t) => t.length || 1).join(" vs ")}`;
}

// Loadout buttons follow the human whose turn it is, else the first human.
function loadoutActor() {
  return m.current.control === "human"
    ? m.current
    : m.actors.find((a) => a.control === "human") || m.current;
}
function updateLoadout() {
  $("mapName").textContent = m.map.name;
  $("mapNumber").textContent = m.map.number;
  $("mapDescription").textContent = m.map.description;
  $("mapLabel").textContent = m.map.name.toUpperCase();
  $("map").value = m.map.id;
  document
    .querySelectorAll(".map-card")
    .forEach((button) =>
      button.setAttribute("aria-pressed", String(button.dataset.map === m.map.id)),
    );
  $("versus").textContent = m.teams.map((t) => t.humans + t.bots).join(" VS ");
  const actor = loadoutActor(),
    [lo] = ammoOf(actor).angles;
  $("angle").min = lo;
  $("angle").max = 180 - lo;
  $("tickMin").textContent = lo + "°";
  $("tickMax").textContent = 180 - lo + "°";
  document.querySelectorAll(".loadout button").forEach((button) => {
    const selected = button.dataset.kind === "character" ? actor.skin : actor.weapon;
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
  for (const [select, entries, current] of [
    ["difficulty", DIFFICULTIES, m.difficulty.id],
    ["lobbyDifficulty", DIFFICULTIES, lobby.difficulty],
    ["map", MAPS, m.map.id],
  ]) {
    for (const entry of entries) {
      const option = document.createElement("option");
      option.value = entry.id;
      option.textContent = entry.name;
      option.selected = entry.id === current;
      $(select).append(option);
    }
  }
}
async function start() {
  paused = true;
  sync();
  $("restart").disabled = true;
  $("help").disabled = true;
  $("startMatch").disabled = true;
  $("status").textContent = "Đang tải sân đấu và sprite…";
  const loaded = await loadAssets();
  images = loaded.images;
  buildLoadout();
  buildMapChoices();
  m.reset();
  updateLoadout();
  $("assetStatus").textContent = loaded.failed.length
    ? `Thiếu ${loaded.failed.length} hình — đang dùng hình dự phòng. Tải lại trang để thử lại.`
    : `${CHARACTERS.length} nhân vật · ${WEAPONS.length} vũ khí · ${MAPS.length} bản đồ`;
  $("restart").disabled = false;
  $("help").disabled = false;
  $("startMatch").disabled = false;
  openLobby();
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
      if (inLobby()) {
        lobby.map = map.id;
        renderLobby();
        return;
      }
      if (paused || !m.setMap(map.id)) return;
      refreshGround();
      updateLoadout();
    };
    $("mapChoices").append(button);
  }
}
