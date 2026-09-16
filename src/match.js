// Match state and rules. No DOM, no canvas: game.js renders this and feeds input.
import {
  WIDTH,
  HEIGHT,
  makeTerrain,
  MAPS,
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

export const MAX_ROUNDS = 30;
export const TURN_TIME = 25;
export const START_HP = 100;
export const DIFFICULTIES = [
  { id: "easy", name: "Dễ", angleJitter: 10, powerJitter: 14, angleStep: 6, powerStep: 4 },
  { id: "normal", name: "Vừa", angleJitter: 5, powerJitter: 8, angleStep: 3, powerStep: 2 },
  { id: "hard", name: "Khó", angleJitter: 2, powerJitter: 3, angleStep: 3, powerStep: 2 },
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
  constructor({ seed, character = "mochi", weapon = "carrot", difficulty = "normal", map = MAPS[0].id } = {}) {
    this.seed = seed;
    this.map = MAPS.find((m) => m.id === map) || MAPS[0];
    this.character = character;
    this.weapon = weapon;
    this.difficulty = DIFFICULTIES.find((d) => d.id === difficulty) || DIFFICULTIES[1];
    this.keys = new Set();
    this.reset();
  }
  reset() {
    this.random = this.seed === undefined ? Math.random : mulberry32(this.seed);
    this.terrain = makeTerrain(this.map);
    this.originalTerrain = [...this.terrain];
    this.terrainDirty = true;
    const player = CHARACTERS.find((c) => c.id === this.character);
    const others = CHARACTERS.filter((c) => c.id !== this.character);
    const bot = others[Math.floor(this.random() * others.length)];
    this.actors = [
      { x: 205, hp: START_HP, color: "#7ebbc9", name: player.name, skin: player.id, weapon: this.weapon, angle: 45 },
      { x: 980, hp: START_HP, color: "#ec9b6c", name: bot.name, skin: bot.id, weapon: "acorn", angle: 135 },
    ];
    for (const a of this.actors) {
      a.y = this.terrain[Math.floor(a.x)];
      a.hurt = 0;
      a.walking = false;
      a.animation = createAnimation();
    }
    this.turn = 0;
    this.round = 1;
    this.wind = this.randomWind();
    this.time = TURN_TIME;
    this.energy = ENERGY;
    this.phase = "aim";
    this.projectile = null;
    this.charge = 0;
    this.charging = false;
    this.wait = 0;
    this.particles = [];
    this.blasts = [];
    this.trail = [];
    this.popups = [];
    this.shake = 0;
    this.keys.clear();
    this.setAim(45);
    this.status = "Đến lượt bạn — ngắm và giữ để bắn!";
  }
  randomWind() {
    return Math.round((this.random() - 0.5) * 60);
  }
  tiltOf(actor) {
    return slopeAngle(this.terrain, actor.x);
  }
  get playerCanAct() {
    return this.turn === 0 && this.phase === "aim";
  }
  // Player aim, kept inside the weapon's range; see settleAim for the dead zone.
  setAim(value) {
    const a = this.actors[0];
    a.angle = settleAim(value, a.angle, ammoOf(a).angles);
    return a.angle;
  }
  // Loadout changes are cosmetic mid-turn except the weapon's angle range.
  setLoadout({ character, weapon }) {
    if (!this.playerCanAct || this.charging) return false;
    const a = this.actors[0];
    if (character) {
      this.character = character;
      a.skin = character;
      a.name = CHARACTERS.find((c) => c.id === character).name;
      a.animation = createAnimation();
    }
    if (weapon) {
      this.weapon = weapon;
      a.weapon = weapon;
      this.setAim(a.angle);
    }
    this.keys.clear();
    return true;
  }
  // Changing the map restarts the match.
  setMap(id) {
    this.map = MAPS.find((m) => m.id === id) || this.map;
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
    if (this.playerCanAct) this.shoot(this.actors[0].angle, this.charge);
    else this.charging = false;
  }
  cancelCharge() {
    this.charging = false;
    this.keys.clear();
  }
  shoot(angle, power) {
    const actor = this.actors[this.turn],
      ammo = ammoOf(actor);
    angle = clampAngle(angle, ammo.angles);
    actor.angle = angle;
    playAnimation(actor.animation, "shoot");
    this.charging = false;
    this.projectile = launch(actor, launchAngle(angle, this.tiltOf(actor)), power, ammo);
    this.trail = [];
    this.phase = "flight";
    this.status = this.turn ? "Cẩn thận! Đạn đang tới…" : "Một phát bắn đầy hy vọng!";
  }
  // Launch angle the player's shot would use right now, for the aim preview.
  previewShot(power) {
    const a = this.actors[0];
    return launch(a, launchAngle(a.angle, this.tiltOf(a)), power, ammoOf(a));
  }
  explode(p) {
    this.blasts.push({ x: p.x, y: p.y, age: 0 });
    crater(this.terrain, p.x, p.y, p.ammo.craterWidth, p.ammo.craterDepth);
    this.terrainDirty = true;
    for (const a of this.actors) {
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
    const a = this.actors[0],
      cost = moveCost(this.terrain, a.x, dir);
    if (cost === Infinity) return;
    const distance = Math.min(this.energy / cost, 65 * dt),
      x = Math.max(25, Math.min(WIDTH - 26, a.x + dir * distance));
    if (Math.abs(x - this.actors[1].x) < 45) return;
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
      const [a, b] = this.actors;
      this.status =
        a.hp === b.hp
          ? "Hết lượt, hòa! ↻ Thử một trận nữa?"
          : a.hp > b.hp
            ? `Hết lượt! ${a.name} nhiều máu hơn, thắng! ✦`
            : `Hết lượt! ${b.name} nhiều máu hơn, thắng. ↻ Thử lại nhé!`;
      return;
    }
    this.turn = 1 - this.turn;
    this.round++;
    this.time = TURN_TIME;
    this.energy = ENERGY;
    this.wind = this.randomWind();
    this.phase = "aim";
    this.wait = 1.1;
    this.charge = 0;
    this.charging = false;
    this.keys.clear();
    this.status = this.turn
      ? `${this.actors[1].name} đang ngắm…`
      : "Đến lượt bạn — ngắm và giữ để bắn!";
  }
  checkWinner() {
    for (const a of this.actors) if (a.y > HEIGHT - 20) a.hp = 0;
    if (!this.actors.some((a) => a.hp <= 0)) return false;
    this.phase = "over";
    this.charging = false;
    const [a, b] = this.actors;
    this.status =
      a.hp <= 0 && b.hp <= 0
        ? "Hòa rồi! ↻ Thử một trận nữa?"
        : b.hp <= 0
          ? `Chiến thắng! ${a.name} làm được rồi! ✦`
          : `${b.name} thắng! ↻ Thử lại nhé!`;
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
      if (this.turn === 0) {
        const keys = this.keys,
          a = this.actors[0];
        if (keys.has("left")) this.move(-1, dt);
        if (keys.has("right")) this.move(1, dt);
        if (keys.has("up")) this.setAim(a.angle + 45 * dt);
        if (keys.has("down")) this.setAim(a.angle - 45 * dt);
        if (this.charging) this.charge = Math.min(100, this.charge + 45 * dt);
      } else {
        this.wait -= dt;
        if (this.wait <= 0) {
          const [bot, player] = [this.actors[1], this.actors[0]];
          const shot = botShot(
            bot,
            player,
            this.wind,
            this.terrain,
            this.random,
            ammoOf(bot),
            this.tiltOf(bot),
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
