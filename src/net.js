// Online session: the server owns the room and the match, this mirrors both so
// the screens in game.js work the same as with a LocalSession.
import { step, launch, launchAngle, settleAim, slopeAngle } from "./physics.js";
import { MAPS } from "./maps.js";
import { CHARACTERS } from "./assets.js";
import { Match, DIFFICULTIES, ammoOf } from "./match.js";
import { advanceAnimation } from "./animation.js";

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
    for (const k of ["turn", "round", "wind", "time", "energy", "phase", "charge", "charging", "status", "cursor", "teams", "popups"])
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
  setLoadout({ character, weapon }) {
    if (!this.playerCanAct || this.charging) return false;
    const a = this.current;
    if (character) {
      a.skin = character;
      a.name = CHARACTERS.find((c) => c.id === character).name;
    }
    if (weapon) a.weapon = weapon;
    this.session.send({ t: "loadout", character, weapon });
    return true;
  }
}

export class OnlineSession {
  constructor({ room, name, onUpdate = () => {} }) {
    this.online = true;
    this.id = room || "";
    this.state = "connecting";
    this.players = [];
    this.bots = [0, 1];
    this.map = MAPS[0].id;
    this.difficulty = "normal";
    this.canStart = false;
    this.you = { id: 0, host: false, team: null, ready: false, character: "mochi", weapon: "carrot", player: null };
    this.error = "";
    this.onUpdate = onUpdate;
    this.match = new RemoteMatch(this);
    const url = new URL("/ws", location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("room", room || "");
    url.searchParams.set("name", name || "");
    this.ws = new WebSocket(url);
    this.ws.onmessage = (e) => this.receive(JSON.parse(e.data));
    this.ws.onclose = () => {
      this.state = "offline";
      this.error = "Mất kết nối tới máy chủ. Tải lại trang để vào lại.";
      this.onUpdate(this);
    };
  }
  get host() {
    return this.you.host;
  }
  teamSize(team) {
    return this.players.filter((p) => p.team === team).length + this.bots[team];
  }
  send(msg) {
    if (this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  }
  receive(s) {
    if (s.t !== "room") return;
    const was = this.state;
    for (const k of ["id", "state", "map", "difficulty", "bots", "canStart", "players", "you"]) this[k] = s[k];
    if (s.match) this.match.apply(s.match);
    this.onUpdate(this, was);
  }
  chooseTeam(team) {
    this.send({ t: "team", team: this.you.team === team ? null : team });
  }
  setReady(value) {
    this.send({ t: "ready", value });
  }
  // In a match the RemoteMatch sends the message itself, so only one goes out.
  setCharacter(id) {
    if (this.state === "playing") this.match.setLoadout({ character: id });
    else this.send({ t: "loadout", character: id });
  }
  setWeapon(id) {
    if (this.state === "playing") this.match.setLoadout({ weapon: id });
    else this.send({ t: "loadout", weapon: id });
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
  leave() {
    this.ws.close();
  }
}
