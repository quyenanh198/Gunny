import test from "node:test";
import assert from "node:assert/strict";
import { TurnQueue } from "../src/core/turn-queue.js";
import { combatLoadout, gainSs, resolveExplosion } from "../src/core/combat.js";
import { chooseBotAction } from "../src/core/bot.js";
import { Match } from "../src/match.js";
import { FOOT_WIDTH } from "../src/physics.js";

test("low delay can grant the same actor two consecutive turns", () => {
  const queue = new TurnQueue([{ team: 0 }, { team: 1 }]);
  assert.equal(queue.current, 0);
  assert.equal(queue.complete(0, 40, () => true), 0);
  assert.equal(queue.complete(0, 70, () => true), 1);
});

test("bot spends SS when ready and otherwise accounts for difficulty delay", () => {
  assert.equal(chooseBotAction({ ss: 100 }, { id: "easy" }).shot, "ss");
  assert.equal(chooseBotAction({ ss: 0 }, { id: "hard" }).shot, "s2");
  assert.equal(chooseBotAction({ ss: 0 }, { id: "easy" }).shot, "s1");
});

test("S2 and items add server-owned damage and delay", () => {
  const normal = combatLoadout("s1", null, 0);
  const boosted = combatLoadout("s2", "power", 0);
  assert.ok(boosted.damageScale > normal.damageScale);
  assert.ok(boosted.delay > normal.delay);
});

test("SS requires a full gauge and consumes it", () => {
  assert.equal(combatLoadout("ss", null, 99).shot, "s1");
  const ready = combatLoadout("ss", null, 100);
  assert.equal(ready.shot, "ss");
  assert.equal(ready.ssCost, 100);
  assert.equal(gainSs(95, 20), 100);
});

test("a crater narrower than the stance doesn't drop the actor standing over it", () => {
  const terrain = Array(1200).fill(440);
  const actor = { x: 600, y: 440, hp: 100 };
  const ammo = { craterWidth: FOOT_WIDTH / 2, craterDepth: FOOT_WIDTH / 2, damageMax: 0, damageRadius: 50 };
  resolveExplosion(terrain, [actor], { x: 600, y: 440, ammo }, combatLoadout("s1", null, 0));
  assert.equal(actor.y, 440);
});

test("a crater as wide as the stance does drop the actor standing over it", () => {
  const terrain = Array(1200).fill(440);
  const actor = { x: 600, y: 440, hp: 100 };
  const ammo = { craterWidth: FOOT_WIDTH * 2, craterDepth: FOOT_WIDTH * 2, damageMax: 0, damageRadius: 50 };
  resolveExplosion(terrain, [actor], { x: 600, y: 440, ammo }, combatLoadout("s1", null, 0));
  assert.ok(actor.y > 440);
});

test("match owns shot delay, SS spending and item cost", () => {
  const match = new Match({ seed: 7 });
  match.current.ss = 100;
  match.setAction({ shot: "ss", item: "blood" });
  match.shoot(match.current.angle, 50);
  assert.equal(match.projectile.rules.shot, "ss");
  assert.equal(match.current.ss, 0);
  assert.equal(match.current.hp, 90);
  assert.ok(match.pendingDelay >= 165);
});
