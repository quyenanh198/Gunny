import { WIDTH, HEIGHT, DT } from "./physics.js";
import { MAPS } from "./maps.js";
import { CHARACTERS, WEAPONS, assetURL, loadAssets } from "./assets.js";
import { terrainLayer } from "./sprites.js";
import { renderBattle } from "./ui/battle-renderer.js";
import { MAX_TEAM, DIFFICULTIES } from "./match.js";
import { syncHud } from "./ui/hud.js";
import { bindBattleInput } from "./ui/input.js";
import { bindResponsive } from "./ui/responsive.js";
import { createScreenController } from "./ui/screens.js";
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
const screens = createScreenController({ $, getSession: () => session });
const screen = screens.get;
const active = () => (screen() === "game" ? match() : null);
bindBattleInput({
  $,
  getActive: active,
  getPaused: () => paused,
  setPaused: (value) => (paused = value),
});
const savedName = () => {
  try {
    return localStorage.getItem("gunny-name") || "";
  } catch {
    return "";
  }
};

const setScreen = screens.set;

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
$("quickJoin").onclick = async () => {
  try {
    const { room } = await (await fetch("/api/quick-join")).json();
    joinRoom(room || "");
  } catch {
    $("homeError").textContent = "Không thể tìm phòng lúc này.";
  }
};
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
  const strong = document.createElement("strong"), small = document.createElement("small");
  strong.textContent = p.name;
  small.textContent = `${CHARACTERS.find((c) => c.id === p.character).name} · ${WEAPONS.find((w) => w.id === p.weapon).name}`;
  text.append(strong, small);
  const tag = document.createElement("b");
  tag.textContent = p.host ? "CHỦ PHÒNG" : p.ready ? "SẴN SÀNG" : "CHỜ";
  tag.className = p.ready || p.host ? "ok" : "";
  li.append(img, text, tag);
  if (session.host && p.id !== session.you.id) {
    const kick = document.createElement("button");
    kick.type = "button";
    kick.textContent = "Mời ra";
    kick.onclick = () => session.kick(p.id);
    li.append(kick);
  }
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
  $("chatMessages").replaceChildren(...(s.chat || []).map((message) => {
    const li = document.createElement("li");
    li.textContent = `${message.name}: ${message.text}`;
    return li;
  }));
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
$("chatForm").onsubmit = (event) => {
  event.preventDefault();
  const text = $("chatText").value.trim();
  if (text && session.online) session.sendChat(text);
  $("chatText").value = "";
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
  fitStage();
  // The scoreboard height settles after the first paint of the new screen.
  requestAnimationFrame(fitStage);
}
$("leaveMatch").onclick = () => {
  if (session.online && !session.host) return setScreenHome() || session.leave();
  session.backToLobby();
  setScreen("room");
  updateRoom();
};
$("toLobby").onclick = $("leaveMatch").onclick;
$("restart").onclick = () => session.restart();

const fitStage = bindResponsive({ $, isBattle: () => screen() === "game" });

function refreshGround(m) {
  groundLayer = images.has(m.map.ground)
    ? terrainLayer(images.get(m.map.ground), m.originalTerrain, m.terrain)
    : null;
  m.terrainDirty = false;
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
    renderBattle(m, { ctx, images, groundLayer, reducedMotion });
    syncHud(m, { $, session, paused });
  }
  requestAnimationFrame(frame);
}

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
