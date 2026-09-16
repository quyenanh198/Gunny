// Match state and rules. No DOM, no canvas: game.js renders this and feeds input.
// Two teams, each a mix of humans (hot-seat on one device) and bots.
import {
  WIDTH,
  HEIGHT,
  launch,
  step,
  collides,
  crater,
  damage,
  fallDamage,
  botShot,
  BODY_OFFSET,
  HIT_RADIUS,
  slopeAngle,
  clampAngle,
  settleAim,
  launchAngle,
  moveCost,
  ENERGY,
} from "./physics.js";
import { CHARACTERS, WEAPONS } from "./assets.js";
import { createAnimation, playAnimation, advanceAnimation } from "./animation.js";
import { MAPS } from "./maps.js";

export const MAX_ROUNDS = 30;
export const TURN_TIME = 25;
export const START_HP = 100;
export const MAX_TEAM = 3;
export const DIFFICULTIES = [
  { id: "easy", name: "Dễ", angleJitter: 10, powerJitter: 14, angleStep: 6, powerStep: 4 },
  { id: "normal", name: "Vừa", angleJitter: 5, powerJitter: 8, angleStep: 3, powerStep: 2 },
  { id: "hard", name: "Khó", angleJitter: 2, powerJitter: 3, angleStep: 3, powerStep: 2 },
];
// Spawn columns per team: left half and right half of the island.
const SIDES = [
  [40, 540],
  [660, 1160],
];

// Small seeded PRNG so a match can be replayed (?seed=123).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ammoOf = (actor) => WEAPONS.find((w) => w.id === actor.weapon).ammo;

export class Match {
  constructor({
    seed,
    character = "mochi",
    weapon = "carrot",
    difficulty = "normal",
    map = MAPS[0].id,
    teams = [
      { humans: 1, bots: 0 },
      { humans: 0, bots: 1 },
    ],
  } = {}) {
    this.seed = seed;
    this.character = character;
    this.weapon = weapon;
    this.teams = teams;
    this.map = MAPS.find((m) => m.id === map) || MAPS[0];
    this.difficulty = DIFFICULTIES.find((d) => d.id === difficulty) || DIFFICULTIES[1];
    this.keys = new Set();
    this.reset();
  }
  reset() {
    this.random = this.seed === undefined ? Math.random : mulberry32(this.seed);
    this.terrain = this.map.createTerrain();
    this.originalTerrain = [...this.terrain];
    this.terrainDirty = true;
    this.actors = [];
    let humanIndex = 0;
    const usedSkins = [];
    const pickSkin = () => {
      const fresh = CHARACTERS.filter((c) => !usedSkins.includes(c.id));
      const pool = fresh.length ? fresh : CHARACTERS;
      const skin = pool[Math.floor(this.random() * pool.length)].id;
      usedSkins.push(skin);
      return skin;
    };
    this.teams.forEach((team, t) => {
      const spawns = this.spawnColumns(t, team.humans + team.bots);
      for (let i = 0; i < team.humans + team.bots; i++) {
        const human = i < team.humans;
        // The first human keeps the loadout chosen in the setup panel.
        const skin = human && humanIndex === 0 ? this.character : pickSkin();
        if (human && humanIndex === 0) usedSkins.push(skin);
        const a = {
          team: t,
          control: human ? "human" : "bot",
          x: spawns[i],
          hp: START_HP,
          skin,
          name: CHARACTERS.find((c) => c.id === skin).name,
          weapon: human ? this.weapon : "acorn",
          angle: t === 0 ? 45 : 135,
          hurt: 0,
          walking: false,
          animation: createAnimation(),
        };
        if (human) a.player = ++humanIndex;
        a.y = this.terrain[Math.floor(a.x)];
        this.actors.push(a);
      }
    });
    this.cursor = [0, 0];
    this.turn = this.actors.findIndex((a) => a.team === 0);
    this.cursor[0] = 1;
    this.round = 1;
    this.wind = this.randomWind();
    this.time = TURN_TIME;
    this.energy = ENERGY;
    this.phase = "aim";
    this.projectile = null;
    this.charge = 0;
    this.charging = false;
    this.wait = this.current.control === "bot" ? 1.1 : 0;
    this.particles = [];
    this.blasts = [];
    this.trail = [];
    this.popups = [];
    this.shake = 0;
    this.keys.clear();
    for (const a of this.actors) if (a.control === "human") this.setAim(a.angle, a);
    this.status = this.turnMessage();
  }
  // Random columns on the team's side with spacing, never over a pit.
  spawnColumns(team, count) {
    const [lo, hi] = this.map.spawnZones?.[team] || SIDES[team],
      picked = [];
    for (let tries = 0; picked.length < count && tries < 200; tries++) {
      const x = Math.round(lo + this.random() * (hi - lo));
      const safe = this.terrain[x] < HEIGHT - 60 && picked.every((p) => Math.abs(p - x) >= 70);
      if (safe) picked.push(x);
    }
    while (picked.length < count) picked.push(lo + Math.round(((picked.length + 1) * (hi - lo)) / (count + 1)));
    return picked;
  }
  randomWind() {
    return Math.round((this.random() - 0.5) * 60);
  }
  tiltOf(actor) {
    return slopeAngle(this.terrain, actor.x);
  }
  get current() {
    return this.actors[this.turn];
  }
  get playerCanAct() {
    return this.current.control === "human" && this.phase === "aim";
  }
  alive(team) {
    return this.actors.filter((a) => a.team === team && a.hp > 0);
  }
  teamHp(team) {
    return this.actors.filter((a) => a.team === team).reduce((s, a) => s + a.hp, 0);
  }
  teamName(team) {
    const members = this.actors.filter((a) => a.team === team);
    return members.length === 1 ? members[0].name : `Đội ${team + 1}`;
  }
  turnMessage() {
    const a = this.current;
    if (a.control === "bot") return `${a.name} đang ngắm…`;
    const who = this.actors.filter((b) => b.control === "human").length > 1 ? ` (${a.name}, người ${a.player})` : "";
    return `Đến lượt bạn${who} — ngắm và giữ để bắn!`;
  }
  // Aim of a human actor, kept inside the weapon's range; see settleAim for the dead zone.
  setAim(value, actor = this.current) {
    actor.angle = settleAim(value, actor.angle, ammoOf(actor).angles);
    return actor.angle;
  }
  // Loadout changes are cosmetic mid-turn except the weapon's angle range.
  setLoadout({ character, weapon }) {
    if (!this.playerCanAct || this.charging) return false;
    const a = this.current;
    if (character) {
      if (a.player === 1) this.character = character;
      a.skin = character;
      a.name = CHARACTERS.find((c) => c.id === character).name;
      a.animation = createAnimation();
    }
    if (weapon) {
      if (a.player === 1) this.weapon = weapon;
      a.weapon = weapon;
      this.setAim(a.angle, a);
    }
    this.keys.clear();
    return true;
  }
  // Changing the map or the team makeup restarts the match.
  setMap(id) {
    const map = MAPS.find((m) => m.id === id);
    if (!map || map === this.map) return false;
    this.map = map;
    this.reset();
    return true;
  }
  setTeams(teams) {
    const clamp = (n) => Math.max(0, Math.min(MAX_TEAM, n | 0));
    this.teams = teams.map(({ humans, bots }) => {
      const h = clamp(humans),
        b = clamp(bots);
      return { humans: h, bots: h + b ? b : 1 };
    });
    this.reset();
  }
  setDifficulty(id) {
    this.difficulty = DIFFICULTIES.find((d) => d.id === id) || this.difficulty;
  }
  beginCharge() {
    if (this.playerCanAct && !this.charging) {
      this.charging = true;
      this.charge = 0;
    }
  }
  release() {
    if (!this.charging) return;
    if (this.playerCanAct) this.shoot(this.current.angle, this.charge);
    else this.charging = false;
  }
  cancelCharge() {
    this.charging = false;
    this.keys.clear();
  }
  shoot(angle, power) {
    const actor = this.current,
      ammo = ammoOf(actor);
    angle = clampAngle(angle, ammo.angles);
    actor.angle = angle;
    playAnimation(actor.animation, "shoot");
    this.charging = false;
    this.projectile = launch(actor, launchAngle(angle, this.tiltOf(actor)), power, ammo);
    this.trail = [];
    this.phase = "flight";
    this.status = actor.control === "bot" ? "Cẩn thận! Đạn đang tới…" : "Một phát bắn đầy hy vọng!";
  }
  // Launch the current human's shot would use right now, for the aim preview.
  previewShot(power) {
    const a = this.current;
    return launch(a, launchAngle(a.angle, this.tiltOf(a)), power, ammoOf(a));
  }
  explode(p) {
    this.blasts.push({ x: p.x, y: p.y, age: 0 });
    crater(this.terrain, p.x, p.y, p.ammo.craterWidth, p.ammo.craterDepth);
    this.terrainDirty = true;
    for (const a of this.actors) {
      if (a.hp <= 0) continue;
      const floor = this.terrain[Math.floor(a.x)];
      const hit = damage(a, p.x, p.y, p.ammo) + fallDamage(floor - a.y);
      a.hp = Math.max(0, a.hp - hit);
      a.y = floor;
      if (hit > 0) {
        a.hurt = 0.3;
        playAnimation(a.animation, "hurt");
        this.popups.push({ x: a.x, y: a.y - 130, text: `-${hit}`, life: 1 });
      }
    }
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
    this.projectile = null;
    this.phase = "settle";
    this.wait = 1.1;
    this.checkWinner();
  }
  move(dir, dt) {
    if (!this.playerCanAct || this.energy <= 0 || this.charging) return;
    const a = this.current,
      cost = moveCost(this.terrain, a.x, dir);
    if (cost === Infinity) return;
    const distance = Math.min(this.energy / cost, 65 * dt),
      x = Math.max(25, Math.min(WIDTH - 26, a.x + dir * distance));
    if (this.actors.some((b) => b !== a && b.hp > 0 && Math.abs(x - b.x) < 45)) return;
    this.energy -= Math.abs(x - a.x) * cost;
    a.walking = Math.abs(x - a.x) > 0.001;
    if (a.walking) a.animation.moveDirection = dir;
    a.x = x;
    a.y = this.terrain[Math.floor(x)];
  }
  nextTurn() {
    if (this.round >= MAX_ROUNDS) {
      this.phase = "over";
      this.charging = false;
      const [a, b] = [this.teamHp(0), this.teamHp(1)];
      this.status =
        a === b
          ? "Hết lượt, hòa! ↻ Thử một trận nữa?"
          : a > b
            ? `Hết lượt! ${this.teamName(0)} nhiều máu hơn, thắng! ✦`
            : `Hết lượt! ${this.teamName(1)} nhiều máu hơn, thắng. ↻ Thử lại nhé!`;
      return;
    }
    // Teams alternate; within a team the living members rotate.
    const team = 1 - this.current.team,
      members = this.alive(team);
    const next = members[this.cursor[team] % members.length];
    this.cursor[team]++;
    this.turn = this.actors.indexOf(next);
    this.round++;
    this.time = TURN_TIME;
    this.energy = ENERGY;
    this.wind = this.randomWind();
    this.phase = "aim";
    this.wait = 1.1;
    this.charge = 0;
    this.charging = false;
    this.keys.clear();
    this.status = this.turnMessage();
  }
  checkWinner() {
    for (const a of this.actors) if (a.y > HEIGHT - 20) a.hp = 0;
    const dead = [0, 1].map((t) => this.alive(t).length === 0);
    if (!dead[0] && !dead[1]) return false;
    this.phase = "over";
    this.charging = false;
    this.status =
      dead[0] && dead[1]
        ? "Hòa rồi! ↻ Thử một trận nữa?"
        : dead[1]
          ? `Chiến thắng! ${this.teamName(0)} làm được rồi! ✦`
          : `${this.teamName(1)} thắng! ↻ Thử lại nhé!`;
    return true;
  }
  update(dt) {
    for (const a of this.actors) a.walking = false;
    for (const b of this.blasts) b.age += dt;
    this.blasts = this.blasts.filter((b) => b.age < 0.55);
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 250 * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const p of this.popups) p.life -= dt;
    this.popups = this.popups.filter((p) => p.life > 0);
    this.shake = Math.max(0, this.shake - dt);
    for (const a of this.actors) a.hurt = Math.max(0, a.hurt - dt);
    this.tick(dt);
    // Animation is visual only; it advances on the same fixed step so pause freezes it.
    for (const a of this.actors)
      advanceAnimation(a.animation, dt, { moving: a.walking, dead: a.hp <= 0 });
  }
  tick(dt) {
    if (this.phase === "aim") {
      this.time = Math.max(0, this.time - dt);
      if (this.time === 0) {
        this.charging = false;
        this.nextTurn();
        return;
      }
      const a = this.current;
      if (a.control === "human") {
        const keys = this.keys;
        if (keys.has("left")) this.move(-1, dt);
        if (keys.has("right")) this.move(1, dt);
        if (keys.has("up")) this.setAim(a.angle + 45 * dt);
        if (keys.has("down")) this.setAim(a.angle - 45 * dt);
        if (this.charging) this.charge = Math.min(100, this.charge + 45 * dt);
      } else {
        this.wait -= dt;
        if (this.wait <= 0) {
          // Nearest living enemy.
          const enemies = this.alive(1 - a.team);
          const target = enemies.reduce((best, e) =>
            Math.abs(e.x - a.x) < Math.abs(best.x - a.x) ? e : best,
          );
          const shot = botShot(
            a,
            target,
            this.wind,
            this.terrain,
            this.random,
            ammoOf(a),
            this.tiltOf(a),
            this.difficulty,
          );
          this.shoot(shot.angle, shot.power);
        }
      }
    } else if (this.phase === "flight") {
      const p = this.projectile;
      step(p, this.wind, dt);
      if (Math.random() < 0.4) this.trail.push({ x: p.x, y: p.y });
      if (this.trail.length > 50) this.trail.shift();
      const direct = this.actors.some(
        (a, i) =>
          i !== this.turn &&
          a.hp > 0 &&
          Math.hypot(a.x - p.x, a.y - BODY_OFFSET - p.y) < HIT_RADIUS,
      );
      if (collides(p, this.terrain) || direct) this.explode(p);
      else if (p.x < 0 || p.x >= WIDTH || p.y > HEIGHT || p.age > 15) {
        this.projectile = null;
        this.phase = "settle";
        this.wait = 0.6;
        this.status = "Chệch một chút rồi!";
      }
    } else if (this.phase === "settle") {
      this.wait -= dt;
      if (this.wait <= 0 && !this.checkWinner()) this.nextTurn();
    }
  }
}
