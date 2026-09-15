import test from "node:test";
import assert from "node:assert/strict";
import { Match, MAX_ROUNDS, TURN_TIME, DIFFICULTIES } from "../src/match.js";
import { DT, HEIGHT, ENERGY } from "../src/physics.js";

const run = (m, seconds) => {
  for (let t = 0; t < seconds; t += DT) m.update(DT);
};
const untilPhase = (m, phase, max = 40) => {
  for (let t = 0; t < max && m.phase !== phase; t += DT) m.update(DT);
  assert.equal(m.phase, phase);
};

test("seeded matches replay identically and the bot never shares the player's skin", () => {
  const a = new Match({ seed: 7 }),
    b = new Match({ seed: 7 });
  assert.equal(a.wind, b.wind);
  assert.equal(a.actors[1].skin, b.actors[1].skin);
  assert.notEqual(a.actors[1].skin, a.actors[0].skin);
  a.nextTurn();
  b.nextTurn();
  assert.equal(a.wind, b.wind);
});

test("timer expiry passes the turn without a shot", () => {
  const m = new Match({ seed: 1 });
  run(m, TURN_TIME + DT);
  assert.equal(m.turn, 1);
  assert.equal(m.round, 2);
  assert.equal(m.phase, "aim");
  assert.equal(m.energy, ENERGY);
});

test("charging, releasing and a full exchange of turns", () => {
  const m = new Match({ seed: 3 });
  m.beginCharge();
  run(m, 1);
  assert.ok(m.charge > 40 && m.charge < 50);
  m.release();
  assert.equal(m.phase, "flight");
  assert.ok(m.projectile);
  untilPhase(m, "settle");
  untilPhase(m, "aim");
  assert.equal(m.turn, 1);
  untilPhase(m, "flight", 3);
  untilPhase(m, "settle");
  untilPhase(m, "aim");
  assert.equal(m.turn, 0);
  assert.equal(m.round, 3);
});

test("the bot's shot depends on difficulty and every level stays in range", () => {
  for (const d of DIFFICULTIES) {
    const m = new Match({ seed: 5, difficulty: d.id });
    m.nextTurn();
    untilPhase(m, "flight", 3);
    const e = m.actors[1].angle <= 90 ? m.actors[1].angle : 180 - m.actors[1].angle;
    assert.ok(e >= 45 && e <= 85, `${d.id}: ${e}`);
  }
  const easy = new Match({ seed: 5, difficulty: "easy" }),
    hard = new Match({ seed: 5, difficulty: "hard" });
  assert.ok(easy.difficulty.angleJitter > hard.difficulty.angleJitter);
  easy.setDifficulty("hard");
  assert.equal(easy.difficulty.id, "hard");
});

test("after the last round the higher HP wins", () => {
  const m = new Match({ seed: 2 });
  m.round = MAX_ROUNDS;
  m.actors[1].hp = 30;
  m.nextTurn();
  assert.equal(m.phase, "over");
  assert.match(m.status, /nhiều máu hơn, thắng/);
  assert.match(m.status, new RegExp(m.actors[0].name));
  const tie = new Match({ seed: 2 });
  tie.round = MAX_ROUNDS;
  tie.nextTurn();
  assert.match(tie.status, /hòa/);
});

test("falling off the island loses", () => {
  const m = new Match({ seed: 2 });
  m.actors[1].y = HEIGHT;
  assert.equal(m.checkWinner(), true);
  assert.equal(m.actors[1].hp, 0);
  assert.match(m.status, /Chiến thắng/);
});

test("aim stays in the weapon range and flips across the dead zone", () => {
  const m = new Match({ seed: 2, weapon: "acorn" });
  assert.equal(m.setAim(45), 45);
  assert.equal(m.setAim(20), 45);
  assert.equal(m.setAim(90), 95);
  assert.equal(m.setAim(90), 85);
  m.keys.add("up");
  run(m, 0.5);
  assert.ok(m.actors[0].angle > 95);
  m.setLoadout({ weapon: "carrot" });
  assert.ok(m.actors[0].angle >= 105 || m.actors[0].angle <= 75);
});

test("movement spends energy and is blocked outside the player's aim phase", () => {
  const m = new Match({ seed: 2 });
  const x0 = m.actors[0].x;
  m.keys.add("right");
  run(m, 1);
  assert.ok(m.actors[0].x > x0);
  assert.ok(m.energy < ENERGY);
  m.keys.clear();
  m.nextTurn();
  const energy = m.energy;
  m.move(1, 0.1);
  assert.equal(m.energy, energy);
});

test("loadout changes are refused while charging or off turn", () => {
  const m = new Match({ seed: 2 });
  m.beginCharge();
  assert.equal(m.setLoadout({ character: "bzz" }), false);
  m.cancelCharge();
  assert.equal(m.setLoadout({ character: "bzz" }), true);
  assert.equal(m.actors[0].name, "Bzz");
  m.nextTurn();
  assert.equal(m.setLoadout({ weapon: "star" }), false);
});
