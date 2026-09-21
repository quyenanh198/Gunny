// Match state and rules. No DOM, no canvas: game.js renders this and feeds input.
// Two teams, each a mix of humans (hot-seat on one device) and bots.
import {
  WIDTH,
  HEIGHT,
  launch,
  step,
  collides,
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
import { resolveExplosion, combatLoadout, gainSs } from "./core/combat.js";
import { chooseBotAction, chooseBotShot } from "./core/bot.js";
import { TurnQueue } from "./core/turn-queue.js";
import {
  MAX_ROUNDS,
  TURN_TIME,
  START_HP,
  MAX_TEAM,
  DIFFICULTIES,
  mulberry32,
  normaliseRoster,
} from "./core/match-config.js";

export { MAX_ROUNDS, TURN_TIME, START_HP, MAX_TEAM, DIFFICULTIES, mulberry32 };
// Spawn columns per team: left half and right half of the island.
const SIDES = [
  [40, 540],
  [660, 1160],
];

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
    // Lobby roster: per team, members { control, name?, skin?, weapon? }. When
    // set it wins over `teams` (which is then derived from it for the HUD).
    roster = null,
  } = {}) {
    this.seed = seed;
    this.character = character;
    this.weapon = weapon;
    this.teams = teams;
    this.roster = null;
    this.map = MAPS.find((m) => m.id === map) || MAPS[0];
    this.difficulty = DIFFICULTIES.find((d) => d.id === difficulty) || DIFFICULTIES[1];
    this.keys = new Set();
    if (roster) this.setRoster(roster, { reset: false });
    this.reset();
  }
  // Normalise a lobby roster: clamp team sizes, fill names/skins/weapons, keep a
  // team from being empty (a lone bot steps in, as setTeams does).
  static normaliseRoster(roster) {
    return normaliseRoster(roster);
  }
  setRoster(roster, { reset = true } = {}) {
    this.roster = Match.normaliseRoster(roster);
    this.teams = this.roster.map((members) => ({
      humans: members.filter((m) => m.control === "human").length,
      bots: members.filter((m) => m.control === "bot").length,
    }));
    if (reset) this.reset();
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
    // Without a lobby roster, teams are counts: humans first, then bots.
    const roster =
      this.roster ||
      this.teams.map((team) => [
        ...Array.from({ length: team.humans }, () => ({ control: "human" })),
        ...Array.from({ length: team.bots }, () => ({ control: "bot" })),
      ]);
    roster.forEach((members, t) => {
      const spawns = this.spawnColumns(t, members.length);
      members.forEach((member, i) => {
        const human = member.control === "human";
        // The first human keeps the loadout chosen in the setup panel unless the lobby picked one.
        let skin = member.skin || (human && humanIndex === 0 ? this.character : null);
        if (skin) usedSkins.push(skin);
        else skin = pickSkin();
        const a = {
          team: t,
          control: human ? "human" : "bot",
          x: spawns[i],
          hp: START_HP,
          ss: 0,
          skin,
          name: member.name || CHARACTERS.find((c) => c.id === skin).name,
          weapon: member.weapon || (human ? this.weapon : "acorn"),
          angle: t === 0 ? 45 : 135,
          hurt: 0,
          walking: false,
          animation: createAnimation(),
        };
        if (human) a.player = ++humanIndex;
        a.y = this.terrain[Math.floor(a.x)];
        this.actors.push(a);
      });
    });
    this.cursor = [0, 0];
    this.turnQueue = new TurnQueue(this.actors);
    this.turn = this.turnQueue.current;
    this.cursor[0] = 1;
    this.round = 1;
    this.wind = this.randomWind();
    this.time = TURN_TIME;
    this.energy = ENERGY;
    this.phase = "aim";
    this.projectile = null;
    this.charge = 0;
    this.shotType = "s1";
    this.item = null;
    this.pendingDelay = 100;
    this.stats = this.actors.map(() => ({ shots: 0, hits: 0, damage: 0, terrainDamage: 0, totalDelay: 0 }));
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
    return Math.round((this.random() * 2 - 1) * this.map.windRange);
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
  // Changing the map or the team makeup restarts the match.
  setMap(id) {
    const map = MAPS.find((m) => m.id === id);
    if (!map || map === this.map) return false;
    this.map = map;
    this.reset();
    return true;
  }
  setTeams(teams) {
    this.roster = null;
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
  setAction({ shot, item }) {
    if (this.phase !== "aim" || this.charging) return false;
    if (["s1", "s2", "ss"].includes(shot)) this.shotType = shot;
    if ([null, "power", "blood", "teleport", "dual"].includes(item)) this.item = item;
    return true;
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
      ammo = ammoOf(actor),
      rules = combatLoadout(this.shotType, this.item, actor.ss);
    rules.craterScale /= this.map.groundHardness;
    actor.ss -= rules.ssCost;
    actor.hp = Math.max(1, actor.hp - rules.hpCost);
    angle = clampAngle(angle, ammo.angles);
    actor.angle = angle;
    playAnimation(actor.animation, "shoot");
    this.charging = false;
    this.projectile = launch(actor, launchAngle(angle, this.tiltOf(actor)), power, ammo);
    this.projectile.rules = rules;
    this.projectile.shooter = this.turn;
    this.pendingDelay = rules.delay + Math.round((TURN_TIME - this.time) * 2);
    this.stats[this.turn].shots++;
    this.stats[this.turn].totalDelay += this.pendingDelay;
    this.trail = [];
    this.phase = "flight";
    // Naming the shooter matters once several people share one match.
    this.status =
      actor.control === "bot"
        ? `${actor.name} bắn rồi — cẩn thận!`
        : `${actor.name} đã bắn — đạn đang bay!`;
  }
  // Launch the current human's shot would use right now, for the aim preview.
  previewShot(power) {
    const a = this.current;
    return launch(a, launchAngle(a.angle, this.tiltOf(a)), power, ammoOf(a));
  }
  explode(p) {
    this.blasts.push({ x: p.x, y: p.y, age: 0 });
    const before = [...this.terrain];
    const hits = resolveExplosion(this.terrain, this.actors, p, p.rules);
    const shooter = this.actors[p.shooter];
    const dealt = hits.reduce((sum, hit, index) => sum + (this.actors[index].team !== shooter.team ? hit : 0), 0);
    shooter.ss = gainSs(shooter.ss, dealt);
    this.stats[p.shooter].damage += dealt;
    this.stats[p.shooter].terrainDamage += this.terrain.reduce((sum, y, index) => sum + Math.max(0, y - before[index]), 0);
    if (dealt) this.stats[p.shooter].hits++;
    hits.forEach((hit, index) => {
      if (index !== p.shooter) this.actors[index].ss = gainSs(this.actors[index].ss, Math.ceil(hit / 2));
    });
    if (p.rules.teleport) {
      shooter.x = Math.max(25, Math.min(WIDTH - 26, p.x));
      shooter.y = this.terrain[Math.floor(shooter.x)];
    }
    this.terrainDirty = true;
    let isCritical = false;
    for (const [i, a] of this.actors.entries()) {
      const hit = hits[i];
      if (hit > 0) {
        const distToCenter = Math.hypot(a.x - p.x, a.y - BODY_OFFSET - p.y);
        const critical = distToCenter < HIT_RADIUS * 0.45;
        if (critical) isCritical = true;
        a.hurt = critical ? 0.45 : 0.3;
        playAnimation(a.animation, "hurt");
        this.popups.push({
          x: a.x,
          y: a.y - 130,
          text: critical ? `BẠO KÍCH! -${hit}` : `-${hit}`,
          critical,
          life: 1,
        });
      }
    }
    this.shake = isCritical ? 0.55 : 0.3;
    this.lastExplosion = { x: p.x, y: p.y, critical: isCritical, hits };
    if (typeof this.onExplosion === "function") {
      this.onExplosion(this.lastExplosion);
    }
    const particleCount = isCritical ? 42 : 28;
    for (let i = 0; i < particleCount; i++) {
      const angle = this.random() * Math.PI * 2,
        speed = 40 + this.random() * (isCritical ? 240 : 160);
      const isSmoke = i % 5 === 0;
      const isDebris = i % 4 === 0;
      this.particles.push({
        x: p.x,
        y: p.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (isDebris ? 50 : 0),
        gravity: isSmoke ? -40 : (isDebris ? 380 : 250),
        size: isSmoke ? 8 : (isDebris ? 5 : 3),
        life: isSmoke ? 0.9 : 0.7,
        maxLife: isSmoke ? 0.9 : 0.7,
        type: isSmoke ? "smoke" : (isDebris ? "debris" : "spark"),
        color: isSmoke ? "#524d5b" : (isDebris ? "#8b6849" : (i % 2 ? "#ffe49b" : "#f4a779")),
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
    this.turn = this.turnQueue.complete(this.turn, this.pendingDelay, (index) => this.actors[index].hp > 0);
    this.cursor[this.current.team]++;
    this.round++;
    this.time = TURN_TIME;
    this.energy = ENERGY;
    this.wind = this.randomWind();
    this.phase = "aim";
    this.wait = 1.1;
    this.charge = 0;
    this.shotType = "s1";
    this.item = null;
    this.pendingDelay = 180;
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
      p.vy += (p.gravity ?? 250) * dt;
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
          this.setAction(chooseBotAction(a, this.difficulty));
          const shot = chooseBotShot(this, a, ammoOf(a));
          this.shoot(shot.angle, shot.power);
        }
      }
    } else if (this.phase === "flight") {
      const p = this.projectile;
      step(p, this.wind, dt);
      if (this.random() < 0.4) this.trail.push({ x: p.x, y: p.y });
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
