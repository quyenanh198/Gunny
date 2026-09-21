// Online session: the server owns the room and the match, this mirrors both so
// the screens in game.js work the same as with a LocalSession.
import { step, launch, launchAngle, settleAim, slopeAngle } from "./physics.js";
import { MAPS } from "./maps.js";
import { Match, DIFFICULTIES, ammoOf } from "./match.js";
import { advanceAnimation } from "./animation.js";
import { PROTOCOL_VERSION } from "./play/protocol.js";
import { SnapshotBuffer } from "./play/snapshot-buffer.js";
import { apiUrl, socketUrl } from "./base-url.js";

const ERROR_MESSAGES = {
  INVALID_JSON: "Dữ liệu gửi lên không hợp lệ.",
  INVALID_MESSAGE: "Tin nhắn không hợp lệ.",
  INVALID_PAYLOAD: "Dữ liệu thao tác không hợp lệ.",
  INVALID_SEQUENCE: "Thứ tự thao tác không hợp lệ.",
  VERSION_MISMATCH: "Phiên bản game không tương thích với máy chủ.",
  UNKNOWN_MESSAGE: "Máy chủ không nhận ra thao tác.",
  MESSAGE_TOO_LARGE: "Tin nhắn vượt quá giới hạn.",
  RATE_LIMITED: "Bạn thao tác quá nhanh. Hãy thử lại.",
  RECONNECT_EXPIRED: "Phiên kết nối lại đã hết hạn.",
  ROOM_NOT_FOUND: "Phòng không tồn tại hoặc đã đóng.",
  ROOM_FULL: "Phòng đã đủ người chơi.",
  SPECTATOR_FULL: "Phòng đã đủ khán giả.",
  RESUME_TIMEOUT: "Kết nối lại không được xác thực kịp thời.",
  RESUME_REQUIRED: "Máy chủ yêu cầu xác thực kết nối lại.",
  INVALID_REQUEST_ID: "Mã thao tác không hợp lệ.",
  STALE_SEQUENCE: "Thao tác cũ hoặc trùng đã bị bỏ qua.",
  COMMAND_REJECTED: "Thao tác không hợp lệ ở trạng thái hiện tại.",
  ROOM_CREATE_LIMITED: "Bạn đã tạo quá nhiều phòng. Hãy thử lại sau.",
  ALREADY_JOINED: "Bạn đang mở phòng này ở một cửa sổ khác.",
  AUTH_REQUIRED: "Chưa có phiên người chơi. Hãy tải lại trang.",
  SERVER_UNAVAILABLE: "Máy chủ đang bận. Hãy thử lại sau.",
  NOT_RESERVED: "Ghế trong phòng này đã dành cho người khác.",
  SPECTATOR_DISABLED: "Phòng này không cho xem trận.",
  BANNED: "Tài khoản của bạn đang bị khoá.",
};

// A read-only view of the server's Match, smoothed between snapshots.
class RemoteMatch {
  constructor(session) {
    this.session = session;
    const seed = new Match({ seed: 0 });
    this.actors = seed.actors;
    this.terrain = seed.terrain;
    this.originalTerrain = seed.originalTerrain;
    this.teams = seed.teams;
    this.map = seed.map;
    this.terrainDirty = true;
    this.turn = 0;
    this.round = 1;
    this.wind = 0;
    this.time = 25;
    this.energy = 100;
    this.phase = "aim";
    this.charge = 0;
    this.charging = false;
    this.cursor = [0, 0];
    this.status = "";
    this.projectile = null;
    this.trail = [];
    this.particles = [];
    this.popups = [];
    this.blasts = [];
    this.shake = 0;
    this.keys = new Set();
    this.sentKeys = "";
    this.seenBlasts = 0;
    this.snapshotBuffer = new SnapshotBuffer();
  }
  get current() {
    return this.actors[this.turn];
  }
  get playerCanAct() {
    return (
      this.phase === "aim" &&
      this.current.control === "human" &&
      this.current.player === this.session.you.player
    );
  }
  apply(s) {
    const wasFlying = this.phase === "flight";
    for (const k of ["turn", "round", "wind", "time", "energy", "phase", "charge", "charging", "status", "cursor", "teams", "popups", "shotType", "item", "upcoming", "stats"])
      this[k] = s[k];
    this.map = MAPS.find((m) => m.id === s.map) || MAPS[0];
    this.actors = s.actors.map((a) => ({ ...a, animation: a.anim, walking: false }));
    if (s.terrain) {
      this.terrain = s.terrain.map((y) => y / 10);
      this.originalTerrain = this.map.createTerrain();
      this.terrainDirty = true;
      this.trail = [];
      this.particles = [];
      this.seenBlasts = 0;
    }
    if (s.projectile) {
      this.projectile = { ...s.projectile, ammo: ammoOf(this.current) };
      if (!wasFlying) this.trail = [];
    } else this.projectile = null;
    // Blasts the server reports for the first time spawn local particles.
    if (s.blasts.length < this.seenBlasts) this.seenBlasts = 0;
    for (const b of s.blasts.slice(this.seenBlasts)) this.spawnBlast(b);
    this.seenBlasts = s.blasts.length;
    this.blasts = s.blasts;
  }
  enqueue(s, serverTick, receivedAt = performance.now()) {
    const hadSnapshot = this.snapshotBuffer.items.length > 0;
    const actorPositions = this.actors.map(({ x, y }) => ({ x, y }));
    const projectilePosition = this.projectile && { x: this.projectile.x, y: this.projectile.y };
    if (!this.snapshotBuffer.push(s, receivedAt, serverTick)) return;
    this.apply(s);
    if (hadSnapshot) {
      actorPositions.forEach((position, index) => {
        if (this.actors[index]) Object.assign(this.actors[index], position);
      });
      if (projectilePosition && this.projectile) Object.assign(this.projectile, projectilePosition);
    }
  }
  spawnBlast(p) {
    this.shake = 0.3;
    for (let i = 0; i < 28; i++) {
      const angle = Math.random() * Math.PI * 2,
        speed = 40 + Math.random() * 150;
      this.particles.push({
        x: p.x,
        y: p.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.7,
        color: i % 2 ? "#ffe49b" : "#f4a779",
      });
    }
  }
  tiltOf(actor) {
    return slopeAngle(this.terrain, actor.x);
  }
  alive(team) {
    return this.actors.filter((a) => a.team === team && a.hp > 0);
  }
  teamHp(team) {
    return this.actors.filter((a) => a.team === team).reduce((sum, a) => sum + a.hp, 0);
  }
  previewShot(power) {
    const a = this.current;
    return launch(a, launchAngle(a.angle, this.tiltOf(a)), power, ammoOf(a));
  }
  // Between snapshots the client keeps the shot and the effects moving.
  update(dt) {
    const buffered = this.snapshotBuffer.sample();
    if (buffered) {
      buffered.actors.forEach((actor, index) => {
        if (this.actors[index]) Object.assign(this.actors[index], { x: actor.x, y: actor.y });
      });
      if (buffered.projectile && this.projectile)
        Object.assign(this.projectile, { x: buffered.projectile.x, y: buffered.projectile.y });
    }
    const keys = [...this.keys].sort().join(",");
    if (keys !== this.sentKeys) {
      this.sentKeys = keys;
      this.session.send({ t: "keys", keys: [...this.keys] });
    }
    if (this.projectile) {
      step(this.projectile, this.wind, dt);
      if (Math.random() < 0.4) this.trail.push({ x: this.projectile.x, y: this.projectile.y });
      if (this.trail.length > 50) this.trail.shift();
    }
    if (this.charging && this.playerCanAct) this.charge = Math.min(100, this.charge + 45 * dt);
    if (this.phase === "aim") this.time = Math.max(0, this.time - dt);
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 250 * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const b of this.blasts) b.age += dt;
    this.shake = Math.max(0, this.shake - dt);
    const moving = this.playerCanAct && (this.keys.has("left") || this.keys.has("right"));
    for (const a of this.actors) {
      a.hurt = Math.max(0, a.hurt - dt);
      advanceAnimation(a.animation, dt, { moving: moving && a === this.current, dead: a.hp <= 0 });
    }
  }
  setAim(value) {
    const a = this.current;
    if (!this.playerCanAct) return a.angle;
    a.angle = settleAim(value, a.angle, ammoOf(a).angles);
    this.session.send({ t: "aim", angle: a.angle });
    return a.angle;
  }
  beginCharge() {
    if (this.playerCanAct && !this.charging) {
      this.charging = true;
      this.charge = 0;
      this.session.send({ t: "charge" });
    }
  }
  release() {
    if (!this.charging) return;
    this.charging = false;
    this.session.send({ t: "release" });
  }
  cancelCharge() {
    this.charging = false;
    this.keys.clear();
    this.session.send({ t: "cancel" });
  }
  setAction(action) {
    if (!this.playerCanAct || this.charging) return false;
    if (action.shot) this.shotType = action.shot;
    if (action.item !== undefined) this.item = action.item;
    this.session.send({ t: "action", ...action });
    return true;
  }
}

export class OnlineSession {
  constructor({ room, name, mode = "join", visibility = "private", onUpdate = () => {} }) {
    this.online = true;
    this.id = room || "";
    this.state = "connecting";
    this.players = [];
    this.bots = [0, 1];
    this.map = MAPS[0].id;
    this.difficulty = "normal";
    this.canStart = false;
    this.chat = [];
    this.history = [];
    this.you = { id: 0, host: false, team: null, ready: false, character: "mochi", weapon: "carrot", player: null };
    this.error = "";
    this.name = name || "";
    this.mode = mode;
    this.visibility = visibility;
    this.clientSeq = 0;
    this.lastAckSeq = 0;
    this.serverTick = 0;
    this.roomVersion = 0;
    this.reconnectToken = "";
    this.pending = new Map();
    this.closed = false;
    this.onUpdate = onUpdate;
    this.match = new RemoteMatch(this);
    this.connect();
  }
  connect() {
    if (typeof document !== "undefined") {
      this.ensureIdentity().then(() => this.openSocket()).catch(() => {
        this.state = "offline";
        this.error = "Không thể tạo phiên người chơi.";
        this.onUpdate(this);
      });
      return;
    }
    this.openSocket();
  }
  async ensureIdentity() {
    const current = await fetch(apiUrl("api/profile"), { credentials: "same-origin" });
    if (current.ok) return;
    // Mở từ trong Chat thì đã có người đăng nhập sẵn — hỏi Chat trước, hỏng thì mới
    // tạo khách. Ở gunny.lazybutts.com endpoint này trả 404 và rơi xuống nhánh dưới.
    const linked = await fetch(apiUrl("api/sessions/chat"), { method: "POST", credentials: "same-origin" })
      .catch(() => null);
    if (linked?.ok) {
      const session = await linked.json().catch(() => null);
      if (session?.profile?.displayName) this.name = session.profile.displayName;
      return;
    }
    const created = await fetch(apiUrl("api/sessions/guest"), {
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: this.name || "Guest" }),
    });
    if (!created.ok) throw new Error("identity bootstrap failed");
  }
  openSocket() {
    const url = socketUrl("ws");
    url.searchParams.set("room", this.id);
    url.searchParams.set("name", this.name);
    url.searchParams.set("mode", this.reconnectToken ? "resume" : this.mode);
    if (this.mode === "create") url.searchParams.set("visibility", this.visibility);
    this.ws = new WebSocket(url);
    this.ws.onopen = () => {
      if (this.reconnectToken) this.ws.send(JSON.stringify({
        t: "resume",
        protocolVersion: PROTOCOL_VERSION,
        room: this.id,
        reconnectToken: this.reconnectToken,
      }));
    };
    this.ws.onmessage = (event) => this.receive(JSON.parse(event.data));
    this.ws.onclose = () => {
      if (this.closed) return;
      this.state = this.reconnectToken ? "reconnecting" : "offline";
      // Server đóng kèm lý do (phòng đầy, trùng phiên…) thì giữ nguyên câu đó:
      // "Mất kết nối tới máy chủ." làm người chơi tưởng mạng hỏng và thử lại mãi.
      const serverSaid = this.error && this.lastErrorAt && Date.now() - this.lastErrorAt < 2000;
      if (!serverSaid)
        this.error = this.reconnectToken ? "Mất kết nối, đang thử nối lại…" : "Mất kết nối tới máy chủ.";
      this.onUpdate(this);
      if (this.reconnectToken) this.reconnectTimer = setTimeout(() => this.connect(), 1000);
    };
  }
  get host() {
    return this.you.host;
  }
  teamSize(team) {
    return this.players.filter((p) => p.team === team).length + this.bots[team];
  }
  send(msg) {
    if (this.ws.readyState === 1) {
      const clientSeq = ++this.clientSeq;
      const requestId = globalThis.crypto?.randomUUID?.() || `r${Date.now()}_${clientSeq}`;
      this.pending.set(requestId, { clientSeq, type: msg.t });
      this.ws.send(JSON.stringify({ protocolVersion: PROTOCOL_VERSION, clientSeq, requestId, ...msg }));
      return requestId;
    }
    return null;
  }
  receive(s) {
    if (s.t === "ack") {
      this.pending.delete(s.requestId);
      this.lastAckSeq = Math.max(this.lastAckSeq, s.clientSeq || 0);
      return;
    }
    if (s.t === "error") {
      if (s.requestId) this.pending.delete(s.requestId);
      this.error = ERROR_MESSAGES[s.code] || "Máy chủ từ chối thao tác.";
      this.lastErrorAt = Date.now();
      if (s.code === "RECONNECT_EXPIRED" || s.code === "VERSION_MISMATCH") {
        this.closed = true;
        this.state = "offline";
      }
      this.onUpdate(this, this.state);
      return;
    }
    if (s.t !== "room") return;
    if (s.protocolVersion !== PROTOCOL_VERSION) {
      this.closed = true;
      this.state = "offline";
      this.error = "Phiên bản game không tương thích với máy chủ.";
      this.ws.close();
      this.onUpdate(this);
      return;
    }
    const was = this.state;
    this.lastAckSeq = s.lastAckSeq;
    this.serverTick = s.serverTick;
    this.roomVersion = s.roomVersion;
    this.reconnectToken = s.reconnectToken;
    for (const k of ["id", "state", "map", "difficulty", "bots", "canStart", "players", "you", "chat", "history"]) this[k] = s[k];
    if (was === "reconnecting") this.match.snapshotBuffer.clear();
    if (s.match) this.match.enqueue(s.match, s.serverTick);
    this.onUpdate(this, was);
  }
  chooseTeam(team) {
    this.send({ t: "team", team: this.you.team === team ? null : team });
  }
  setReady(value) {
    this.send({ t: "ready", value });
  }
  // Loadout is a lobby-only choice; the server ignores this once the match starts.
  setCharacter(id) {
    this.send({ t: "loadout", character: id });
  }
  setWeapon(id) {
    this.send({ t: "loadout", weapon: id });
  }
  setSetup(setup) {
    this.send({ t: "setup", ...setup });
  }
  start() {
    this.send({ t: "start" });
    return true;
  }
  restart() {
    this.send({ t: "restart" });
  }
  backToLobby() {
    this.send({ t: "lobby" });
  }
  sendChat(text) {
    this.send({ t: "chat", text });
  }
  kick(id) {
    this.send({ t: "kick", id });
  }
  leave() {
    this.closed = true;
    clearTimeout(this.reconnectTimer);
    // Báo server bỏ ghế trước khi đóng. Chỉ đóng socket thì server tưởng rớt mạng,
    // giữ chỗ 30 giây, và lần "Vào nhanh" ngay sau đó vào lại đúng phòng cũ sẽ bị
    // chặn vì trùng danh tính với chính mình.
    this.send({ t: "leave" });
    this.ws.close();
  }
}
