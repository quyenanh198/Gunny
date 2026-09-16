import { WIDTH, HEIGHT, DT, step, collides, ROCK_Y } from "./physics.js";
import { MAPS } from "./maps.js";
import { CHARACTERS, WEAPONS, assetURL, loadAssets } from "./assets.js";
import { terrainLayer, drawCharacter, drawWeapon, drawMuzzle, drawBlast } from "./sprites.js";
import { MAX_ROUNDS, MAX_TEAM, DIFFICULTIES } from "./match.js";
import { LocalSession } from "./session.js";
import { OnlineSession } from "./net.js";

const $ = (id) => document.getElementById(id),
  canvas = $("canvas"),
  ctx = canvas.getContext("2d");
const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
let reducedMotion = motionPreference.matches;
motionPreference.addEventListener("change", (e) => (reducedMotion = e.matches));

let session = null,
  images = new Map(),
  groundLayer = null,
  lastTurn = -1,
  last = 0,
  accumulator = 0,
  paused = false;
const match = () => (session && session.state === "playing" ? session.match : null);
const screen = () => document.body.dataset.screen;
const savedName = () => {
  try {
    return localStorage.getItem("gunny-name") || "";
  } catch {
    return "";
  }
};

function setScreen(name) {
  document.body.dataset.screen = name;
  $("headerStatus").lastChild.textContent =
    name === "home" ? " SẢNH CHỜ" : name === "room" ? ` PHÒNG ${session.id}` : ` ĐANG ĐẤU · PHÒNG ${session.id}`;
  $("turnHint").textContent = name === "home" ? "Sảnh chờ" : name === "room" ? "Chuẩn bị" : "Vào trận";
}

// ---------------------------------------------------------------- home screen
async function refreshRooms() {
  const list = $("roomList");
  try {
    const rooms = await (await fetch("/api/rooms")).json();
    list.replaceChildren();
    if (!rooms.length) {
      list.innerHTML = '<li class="empty">Chưa có phòng nào. Tạo một phòng mới nhé!</li>';
      return;
    }
    for (const room of rooms) {
      const li = document.createElement("li");
      const map = MAPS.find((m) => m.id === room.map);
      li.innerHTML = `<strong>${room.id}</strong><span>${map ? map.name : ""} · ${room.teams[0]} vs ${room.teams[1]} · ${
        room.state === "playing" ? "đang đấu" : "chờ"
      }</span>`;
      li.title = map ? map.description : "";
      const join = document.createElement("button");
      join.type = "button";
      join.className = "subtle";
      join.textContent = "Vào";
      join.onclick = () => joinRoom(room.id);
      li.append(join);
      list.append(li);
    }
  } catch {
    list.innerHTML = '<li class="empty">Chế độ tĩnh: không có máy chủ, chỉ chơi luyện tập được.</li>';
  }
}

function playerName() {
  const name = $("playerName").value.trim() || "Khách";
  try {
    localStorage.setItem("gunny-name", name);
  } catch {}
  return name;
}

function joinRoom(code) {
  $("homeError").textContent = "";
  session = new OnlineSession({ room: code, name: playerName(), onUpdate: onSession });
  setScreen("room");
  updateRoom();
}

function startPractice() {
  session = new LocalSession({ name: playerName() });
  setScreen("room");
  updateRoom();
}

$("joinForm").onsubmit = (e) => {
  e.preventDefault();
  const code = $("roomCode").value.trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(code)) {
    $("homeError").textContent = "Mã phòng gồm 4 chữ cái. Hoặc bấm Tạo phòng mới.";
    return;
  }
  joinRoom(code);
};
$("newRoom").onclick = () => joinRoom("");
$("practice").onclick = startPractice;
$("refreshRooms").onclick = refreshRooms;

// ---------------------------------------------------------------- room screen
function onSession(s, was) {
  if (s.state === "offline") {
    $("homeError").textContent = s.error;
    setScreen("home");
    return;
  }
  if (s.state === "playing" && screen() !== "game") enterMatch();
  else if (s.state === "lobby" && screen() === "game") setScreen("room");
  if (screen() === "room") updateRoom();
  if (was !== s.state) setScreen(screen());
}

function playerRow(p) {
  const li = document.createElement("li");
  li.className = p.id === session.you.id ? "me" : "";
  const img = document.createElement("img");
  img.src = assetURL(CHARACTERS.find((c) => c.id === p.character).file);
  img.alt = "";
  const text = document.createElement("span");
  text.innerHTML = `<strong>${p.name}</strong><small>${CHARACTERS.find((c) => c.id === p.character).name} · ${
    WEAPONS.find((w) => w.id === p.weapon).name
  }</small>`;
  const tag = document.createElement("b");
  tag.textContent = p.host ? "CHỦ PHÒNG" : p.ready ? "SẴN SÀNG" : "CHỜ";
  tag.className = p.ready || p.host ? "ok" : "";
  li.append(img, text, tag);
  return li;
}

function botRow(index) {
  const li = document.createElement("li");
  li.className = "bot";
  li.innerHTML = `<span><strong>Bot ${index + 1}</strong><small>Máy điều khiển</small></span><b>BOT</b>`;
  return li;
}

function updateRoom() {
  const s = session;
  $("roomTitle").textContent = s.online ? `Phòng ${s.id}` : "Luyện tập với bot";
  $("roomHint").textContent = s.online
    ? "Gửi link cho bạn bè. Chủ phòng bấm Bắt đầu khi mọi người sẵn sàng."
    : "Chọn phe và nhân vật, rồi bấm Bắt đầu trận.";
  document.body.classList.toggle("is-online", !!s.online);
  document.body.classList.toggle("is-host", !!s.host);
  if (s.online) {
    const url = new URL(location.href);
    url.search = `?room=${s.id}`;
    $("roomLink").value = s.id ? url.href : "";
  }
  for (const team of [0, 1, null]) {
    const list = $("teamList" + (team === null ? "Null" : team));
    list.replaceChildren();
    for (const p of s.players.filter((p) => p.team === team)) list.append(playerRow(p));
    if (team !== null) {
      for (let i = 0; i < s.bots[team]; i++) list.append(botRow(i));
      $("teamCount" + team).textContent = `${s.teamSize(team)} thành viên`;
    }
  }
  document.querySelectorAll(".team-join").forEach((b) => {
    const team = b.dataset.join === "" ? null : +b.dataset.join;
    b.setAttribute("aria-pressed", String(s.you.team === team));
    b.disabled = team !== null && s.players.filter((p) => p.team === team).length >= MAX_TEAM && s.you.team !== team;
  });
  document.querySelectorAll("#characterChoices button").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.id === s.you.character));
  });
  document.querySelectorAll("#weaponChoices button").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.id === s.you.weapon));
  });
  const map = MAPS.find((x) => x.id === s.map) || MAPS[0];
  $("lobbyMapName").textContent = map.name;
  document.querySelectorAll(".map-card").forEach((card) => {
    card.setAttribute("aria-pressed", String(card.dataset.map === map.id));
    card.disabled = !s.host;
  });
  $("difficulty").value = s.difficulty;
  $("bots0").value = s.bots[0];
  $("bots1").value = s.bots[1];
  for (const id of ["difficulty", "bots0", "bots1"]) $(id).disabled = !s.host;
  $("ready").setAttribute("aria-pressed", String(s.you.ready));
  $("ready").textContent = s.you.ready ? "Đã sẵn sàng" : "Sẵn sàng";
  $("ready").hidden = !s.online || s.you.team === null || s.host;
  $("startMatch").hidden = !s.host;
  $("startMatch").disabled = !s.canStart;
  $("startHint").textContent = s.canStart
    ? s.host
      ? ""
      : "Chờ chủ phòng bắt đầu…"
    : "Mỗi đội cần ít nhất một thành viên và mọi người phải sẵn sàng.";
}

document.querySelectorAll(".team-join").forEach((b) => {
  b.onclick = () => {
    session.chooseTeam(b.dataset.join === "" ? null : +b.dataset.join);
    updateRoom();
  };
});
$("ready").onclick = () => {
  session.setReady(!session.you.ready);
  updateRoom();
};
$("startMatch").onclick = () => {
  if (session.start() && !session.online) enterMatch();
};
$("leaveRoom").onclick = () => {
  session.leave();
  session = null;
  setScreenHome();
};
$("copyLink").onclick = () => {
  $("roomLink").select();
  navigator.clipboard?.writeText($("roomLink").value);
  $("copyLink").textContent = "Đã sao chép!";
  setTimeout(() => ($("copyLink").textContent = "Sao chép link"), 1500);
};
for (const id of ["difficulty", "bots0", "bots1"]) {
  $(id).onchange = () => {
    session.setSetup({
      difficulty: $("difficulty").value,
      bots: [+$("bots0").value, +$("bots1").value],
    });
    updateRoom();
  };
}
function setScreenHome() {
  document.body.dataset.screen = "home";
  $("headerStatus").lastChild.textContent = " SẢNH CHỜ";
  $("turnHint").textContent = "Sảnh chờ";
  history.replaceState(null, "", location.pathname);
  refreshRooms();
}

// --------------------------------------------------------------- battle screen
function enterMatch() {
  lastTurn = -1;
  groundLayer = null;
  setScreen("game");
  updateBattleLoadout();
}
$("leaveMatch").onclick = () => {
  if (session.online && !session.host) return setScreenHome() || session.leave();
  session.backToLobby();
  setScreen("room");
  updateRoom();
};
$("toLobby").onclick = $("leaveMatch").onclick;
$("restart").onclick = () => session.restart();

function refreshGround(m) {
  groundLayer = images.has(m.map.ground)
    ? terrainLayer(images.get(m.map.ground), m.originalTerrain, m.terrain)
    : null;
  m.terrainDirty = false;
}
function teamFace(m, team) {
  if (m.current.team === team) return m.current;
  const alive = m.alive(team);
  return alive[m.cursor[team] % alive.length] || m.actors.find((a) => a.team === team);
}

function sync(m) {
  for (const team of [0, 1]) {
    const face = teamFace(m, team),
      size = m.actors.filter((a) => a.team === team).length;
    $("name" + team).textContent = face.name;
    $("tag" + team).textContent =
      face.control === "bot" ? "BOT" : face.player === session.you.player ? "BẠN" : `NGƯỜI ${face.player}`;
    $("hp" + team).max = size * 100;
    $("hp" + team).value = m.teamHp(team);
    $("health" + team).textContent = `${m.teamHp(team)} / ${size * 100} HP`;
    const img = $("avatar" + team),
      src = assetURL(CHARACTERS.find((c) => c.id === face.skin).file);
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
  ["fire", "angle", "left", "right"].forEach((id) => ($(id).disabled = disabled));
  document.querySelectorAll("#battleWeapons button").forEach((b) => {
    b.disabled = disabled || m.charging;
    b.setAttribute("aria-pressed", String(b.dataset.id === m.current.weapon));
  });
  $("battleHint").textContent = m.playerCanAct
    ? "Đổi vũ khí trước khi bắn."
    : `Đang chờ ${m.current.name}…`;
  $("turnHint").textContent =
    m.phase === "over" ? "Trận đấu kết thúc" : m.current.control === "human" ? `Lượt của ${m.current.name}` : "Bot đang ngắm";
  $("matchTag").textContent = session.online ? `PHÒNG ${session.id}` : "LUYỆN TẬP";
  $("mapName").textContent = m.map.name;
  $("mapNumber").textContent = m.map.number;
  $("mapDescription").textContent = m.map.description;
  $("mapLabel").textContent = m.map.name.toUpperCase();
  $("versus").textContent = m.teams.map((t) => t.humans + t.bots).join(" VS ");
  const over = m.phase === "over";
  $("result").hidden = !over;
  if (over) {
    $("resultText").textContent = m.status;
    $("restart").hidden = session.online && !session.host;
    $("toLobby").textContent = session.online && !session.host ? "Rời phòng" : "Về phòng chờ";
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
function character(m, a, i) {
  const sprite = images.get(a.skin),
    active = m.turn === i && m.phase !== "over";
  ctx.save();
  if (a.hp <= 0) ctx.globalAlpha = 0.45;
  // Stand perpendicular to the slope; the weapon inherits the tilt, matching launch().
  ctx.translate(a.x, a.y);
  ctx.rotate((-m.tiltOf(a) * Math.PI) / 180);
  ctx.translate(-a.x, -a.y);
  if (sprite) {
    const facing = a.animation.state === "walk" ? a.animation.moveDirection : a.angle > 90 ? -1 : 1;
    drawCharacter(ctx, sprite, a, facing, active, {
      flash: a.hurt / 0.3,
      sheet: images.get(`${a.skin}-animation`),
      reducedMotion,
    });
  } else {
    // Minimal stand-in when the sprite failed to load.
    ellipse(a.x, a.y, 25, 5, "#183a3e35");
    ellipse(a.x, a.y - 40, 22, 40, a.team ? "#ec9b6c" : "#7ebbc9");
    ellipse(a.x, a.y - 88, 24, 24, "#fff0d5");
    if (active)
      path(
        [
          [a.x - 7, a.y - 125],
          [a.x + 7, a.y - 125],
          [a.x, a.y - 116],
        ],
        "#ffe3a0",
      );
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
function render(m) {
  const { actors, projectile, trail } = m;
  ctx.save();
  if (m.shake > 0 && !reducedMotion) {
    const s = (m.shake / 0.3) * 6;
    ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
  }
  // Each arena brings its own sky and soil texture.
  if (images.has(m.map.background)) ctx.drawImage(images.get(m.map.background), 0, 0, WIDTH, HEIGHT);
  else {
    const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(0, "#a6d9df");
    sky.addColorStop(1, "#f2f3cc");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
  if (groundLayer) ctx.drawImage(groundLayer, 0, 0);
  else {
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
  actors.forEach((a, i) => character(m, a, i));
  if (m.playerCanAct) {
    const p = m.previewShot(m.charging ? m.charge : 50);
    for (let n = 0; n < 38; n++) {
      step(p, m.wind, 0.025);
      if (collides(p, m.terrain)) break;
      if (n % 4 === 0) ellipse(p.x, p.y, 2.5, 2.5, "#ffffefaa");
    }
  }
  const weaponColor = WEAPONS.find((w) => w.id === m.current.weapon).color;
  trail.forEach((p, i) => ellipse(p.x, p.y, (3 * i) / trail.length, (3 * i) / trail.length, weaponColor + "bb"));
  if (projectile) {
    ctx.save();
    ctx.translate(projectile.x, projectile.y);
    ctx.rotate(Math.atan2(projectile.vy, projectile.vx));
    ellipse(0, 0, 10, 7, weaponColor);
    ellipse(-3, -2, 3, 2.5, "#fff0b7");
    ctx.restore();
    if (projectile.y < 0) {
      // Above the frame: marker below the scoreboard plus height, so the shot stays trackable.
      const x = Math.max(30, Math.min(WIDTH - 30, projectile.x));
      path(
        [
          [x - 12, 140],
          [x + 12, 140],
          [x, 120],
        ],
        weaponColor,
      );
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
  const m = match();
  while (accumulator >= DT) {
    if (m && !paused) m.update(DT);
    accumulator -= DT;
  }
  if (m && screen() === "game") {
    if (m.terrainDirty || !groundLayer) refreshGround(m);
    if (lastTurn !== m.turn) {
      lastTurn = m.turn;
      updateBattleLoadout();
    }
    render(m);
    sync(m);
  }
  requestAnimationFrame(frame);
}

// --------------------------------------------------------------------- input
const active = () => screen() === "game" && match();
const beginCharge = () => {
  if (!paused) active()?.beginCharge();
};
const release = () => {
  const m = active();
  if (!m) return;
  if (paused) m.cancelCharge();
  else m.release();
};
$("fire").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  $("fire").setPointerCapture(e.pointerId);
  beginCharge();
});
$("fire").addEventListener("pointerup", release);
$("fire").addEventListener("pointercancel", () => active()?.cancelCharge());
for (const id of ["left", "right"]) {
  $(id).addEventListener("pointerdown", (e) => {
    e.preventDefault();
    $(id).setPointerCapture(e.pointerId);
    active()?.keys.add(id);
  });
  $(id).addEventListener("pointerup", () => active()?.keys.delete(id));
  $(id).addEventListener("pointercancel", () => active()?.keys.delete(id));
}
$("angle").addEventListener("input", () => active()?.setAim(+$("angle").value));
const keyMap = { a: "left", d: "right", ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
window.addEventListener("keydown", (e) => {
  if (paused || !active() || e.target.closest("input,button,select")) return;
  if (keyMap[e.key]) {
    e.preventDefault();
    active().keys.add(keyMap[e.key]);
  }
  if (e.code === "Space") {
    e.preventDefault();
    if (!e.repeat) beginCharge();
  }
});
window.addEventListener("keyup", (e) => {
  if (keyMap[e.key]) active()?.keys.delete(keyMap[e.key]);
  if (e.code === "Space" && active()) {
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
window.addEventListener("blur", () => active()?.cancelCharge());
document.addEventListener("visibilitychange", () => {
  paused = document.hidden || $("guide").open;
  active()?.cancelCharge();
});
$("help").onclick = () => {
  active()?.cancelCharge();
  paused = true;
  $("guide").showModal();
};
$("closeHelp").onclick = () => $("guide").close();
$("guide").addEventListener("close", () => (paused = document.hidden));

// ------------------------------------------------------------------- loadouts
function choiceButton(entry, kind) {
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
  return button;
}
function updateBattleLoadout() {
  const m = match();
  if (!m) return;
  const [lo] = WEAPONS.find((w) => w.id === m.current.weapon).ammo.angles;
  $("angle").min = lo;
  $("angle").max = 180 - lo;
  $("tickMin").textContent = lo + "°";
  $("tickMax").textContent = 180 - lo + "°";
}
function buildUI() {
  for (const entry of CHARACTERS) {
    const b = choiceButton(entry, "character");
    b.onclick = () => {
      session.setCharacter(entry.id);
      updateRoom();
    };
    $("characterChoices").append(b);
  }
  for (const entry of WEAPONS) {
    const b = choiceButton(entry, "weapon");
    b.onclick = () => {
      session.setWeapon(entry.id);
      updateRoom();
    };
    $("weaponChoices").append(b);
    const battle = choiceButton(entry, "weapon");
    battle.onclick = () => {
      session.setWeapon(entry.id);
      updateBattleLoadout();
    };
    $("battleWeapons").append(battle);
  }
  for (const entry of DIFFICULTIES) {
    const option = document.createElement("option");
    option.value = entry.id;
    option.textContent = entry.name;
    $("difficulty").append(option);
  }
  for (const map of MAPS) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "map-card";
    card.dataset.map = map.id;
    card.title = map.description;
    const image = document.createElement("img");
    image.src = assetURL(map.preview);
    image.alt = "";
    image.onerror = () => (image.hidden = true);
    const name = document.createElement("strong");
    name.textContent = `${map.number} · ${map.name}`;
    card.append(image, name);
    card.onclick = () => {
      session.setSetup({ map: map.id });
      updateRoom();
    };
    $("mapChoices").append(card);
  }
  for (const id of ["bots0", "bots1"])
    for (let n = 0; n <= MAX_TEAM; n++) {
      const option = document.createElement("option");
      option.value = n;
      option.textContent = n;
      $(id).append(option);
    }
}

async function start() {
  buildUI();
  $("playerName").value = savedName();
  const loaded = await loadAssets();
  images = loaded.images;
  $("assetStatus").textContent = loaded.failed.length
    ? `Thiếu ${loaded.failed.length} hình — đang dùng hình dự phòng. Tải lại trang để thử lại.`
    : `${CHARACTERS.length} nhân vật · ${WEAPONS.length} vũ khí · Chọn trước khi vào trận`;
  // An invite link prefills the code; a first-time visitor still names themselves.
  const room = new URLSearchParams(location.search).get("room");
  if (room) $("roomCode").value = room.toUpperCase();
  if (room && savedName()) joinRoom(room.toUpperCase());
  else {
    refreshRooms();
    if (room) $("homeError").textContent = "Nhập tên rồi bấm Vào phòng.";
    $("playerName").focus();
  }
  requestAnimationFrame(frame);
}
await start();
