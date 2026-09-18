import test from "node:test";
import assert from "node:assert/strict";
import { rewardFor, levelForXp } from "../server/economy.js";

test("reward depends on outcome, and a disconnected participant gets nothing regardless of outcome", () => {
  assert.deepEqual(rewardFor({ outcome: "win", disconnected: false }), { xp: 30, currency: 20 });
  assert.deepEqual(rewardFor({ outcome: "loss", disconnected: false }), { xp: 10, currency: 5 });
  assert.deepEqual(rewardFor({ outcome: "draw", disconnected: false }), { xp: 15, currency: 10 });
  assert.deepEqual(rewardFor({ outcome: "win", disconnected: true }), { xp: 0, currency: 0 });
  assert.deepEqual(rewardFor({ outcome: "abandoned", disconnected: false }), { xp: 0, currency: 0 });
});

test("an abandoned match pays nobody, even a participant who did not disconnect", () => {
  assert.deepEqual(rewardFor({ outcome: "win", disconnected: false }, "abandoned"), { xp: 0, currency: 0 });
});

test("level is a flat curve derived from xp, never below 1", () => {
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(99), 1);
  assert.equal(levelForXp(100), 2);
  assert.equal(levelForXp(250), 3);
  assert.equal(levelForXp(-5), 1);
});
