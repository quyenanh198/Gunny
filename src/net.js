// Online client: mirrors the server's authoritative Match so game.js can render
// and send input through the same interface it uses for a local Match.
import { step, launch, launchAngle, settleAim, slopeAngle, makeTerrain, MAPS } from "./physics.js";
import { CHARACTERS } from "./assets.js";
import { Match, DIFFICULTIES, ammoOf } from "./match.js";
import { advanceAnimation } from "./animation.js";

export class RemoteMatch {
  constructor({ room, name }) {
    // Placeholder state until the first snapshot arrives.
    const local = new Match({ seed: 0 });
    Object.assign(this, {
      actors: local.actors,
      turn: 0,
      round: 1,
      wind: 0,
      time: 25,
      energy: 100,
      phase: "aim",
      charge: 0,
      charging: false,
      cursor: [0, 0],
      teams: local.teams,
      map: local.map,
      difficulty: local.difficulty,
      terrain: local.terrain,
      originalTerrain: local.originalTerrain,
      terrainDirty: true,
      projectile: null,
      trail: [],
      particles: [],
      popups: [],
      blasts: [],
      shake: 0,
      keys: new Set(),
      seats: [],
      spectators: 0,
      you: { seat: null, host: false },
      roomId: room,
      ready: false,
      status: "Đang kết nối phòng…",
    });
    this.sentKeys = "";
    this.seenBlasts = 0;
    const url = new URL("/ws", location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("room", room || "");
    url.searchParams.set("name", name || "");
    this.ws = new WebSocket(url);
    this.ws.onmessage = (e) => this.receive(JSON.parse(e.data));
    this.ws.onclose = () => {
      this.ready = false;
      this.status = "Mất kết nối. Tải lại trang để vào lại.";
    };
  }
  get current() {
    return this.actors[this.turn];
  }
  get playerCanAct() {
    return this.ready && this.phase === "aim" && this.current.control === "human" && this.current.player === this.you.seat;
  }
  send(msg) {
    if (this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  }
  receive(s) {
    if (s.t !== "state") return;
    const wasFlying = this.phase === "flight";
    for (const k of ["turn", "round", "wind", "time", "energy", "phase", "charge", "charging", "status", "cursor", "teams", "popups", "seats", "spectators", "you"])
      this[k] = s[k];
    this.roomId = s.room;
    this.map = MAPS.find((m) => m.id === s.map) || MAPS[0];
    this.difficulty = DIFFICULTIES.find((d) => d.id === s.difficulty) || DIFFICULTIES[1];
    this.actors = s.actors.map((a, i) => ({ ...a, animation: a.anim, walking: false }));
    if (s.terrain) {
      this.terrain = s.terrain.map((y) => y / 10);
      this.originalTerrain = makeTerrain(this.map);
      this.terrainDirty = true;
    }
    if (s.projectile) {
      this.projectile = { ...s.projectile, ammo: ammoOf(this.current) };
      if (!wasFlying) this.trail = [];
    } else this.projectile = null;
    // New blasts spawn local particles and shake, like Match.explode does.
    for (const b of s.blasts.slice(this.seenBlasts)) this.spawnBlast(b);
    this.seenBlasts = s.blasts.length;
    if (s.phase === "aim" && s.blasts.length === 0) this.seenBlasts = 0;
    this.blasts = s.blasts;
    this.ready = true;
  }
  spawnBlast(p) {
    this.shake = 0.3;
    for (let i = 0; i < 28; i++) {
      const angle = Math.random() * Math.PI * 2,
        speed = 40 + Math.random() * 150;
      this.particles.push({ x: p.x, y: p.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.7, color: i % 2 ? "#ffe49b" : "#f4a779" });
    }
  }
  tiltOf(actor) {
    return slopeAngle(this.terrain, actor.x);
  }
  alive(team) {
    return this.actors.filter((a) => a.team === team && a.hp > 0);
  }
  teamHp(team) {
    return this.actors.filter((a) => a.team === team).reduce((s, a) => s + a.hp, 0);
  }
  previewShot(power) {
    const a = this.current;
    return launch(a, launchAngle(a.angle, this.tiltOf(a)), power, ammoOf(a));
  }
  // Extrapolate between snapshots so the shot and effects stay smooth.
  update(dt) {
    if (!this.ready) return;
    const keys = [...this.keys].sort().join(",");
    if (keys !== this.sentKeys) {
      this.sentKeys = keys;
      this.send({ t: "keys", keys: [...this.keys] });
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
    for (const a of this.actors) {
      a.hurt = Math.max(0, a.hurt - dt);
      advanceAnimation(a.animation, dt, { moving: this.keys.size > 0 && a === this.current && this.playerCanAct, dead: a.hp <= 0 });
    }
  }
  setAim(value) {
    if (!this.playerCanAct) return this.current.angle;
    const a = this.current;
    a.angle = settleAim(value, a.angle, ammoOf(a).angles);
    this.send({ t: "aim", angle: a.angle });
    return a.angle;
  }
  beginCharge() {
    if (this.playerCanAct && !this.charging) {
      this.charging = true;
      this.charge = 0;
      this.send({ t: "charge" });
    }
  }
  release() {
    if (this.charging) this.send({ t: "release" });
    this.charging = false;
  }
  cancelCharge() {
    this.charging = false;
    this.keys.clear();
    this.send({ t: "cancel" });
  }
  setLoadout(choice) {
    if (!this.playerCanAct || this.charging) return false;
    const a = this.current;
    if (choice.character) {
      a.skin = choice.character;
      a.name = CHARACTERS.find((c) => c.id === choice.character).name;
    }
    if (choice.weapon) a.weapon = choice.weapon;
    this.send({ t: "loadout", ...choice });
    return true;
  }
  setMap(id) {
    this.send({ t: "setup", map: id });
  }
  setTeams(teams) {
    this.send({ t: "setup", teams });
  }
  setDifficulty(id) {
    this.send({ t: "setup", difficulty: id });
  }
  reset() {
    this.send({ t: "restart" });
  }
}
