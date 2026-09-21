import test from "node:test";
import assert from "node:assert/strict";
import { WeaponForge, MAX_ENHANCE_LEVEL, AURAS, ELEMENTAL_GEMS } from "../src/core/forge.js";

test("WeaponForge protects levels with milestone floor locks", () => {
  // +3 Floor check
  assert.equal(WeaponForge.getMilestoneFloor(2), 0);
  assert.equal(WeaponForge.getMilestoneFloor(3), 3);
  assert.equal(WeaponForge.getMilestoneFloor(5), 3);

  // +6 Floor check
  assert.equal(WeaponForge.getMilestoneFloor(6), 6);
  assert.equal(WeaponForge.getMilestoneFloor(8), 6);

  // +9 Floor check
  assert.equal(WeaponForge.getMilestoneFloor(9), 9);
  assert.equal(WeaponForge.getMilestoneFloor(11), 9);
});

test("WeaponForge calculates visual auras for +7, +10, and +12", () => {
  assert.equal(WeaponForge.getAura(5), AURAS.NONE);
  assert.equal(WeaponForge.getAura(7).id, "flame");
  assert.equal(WeaponForge.getAura(9).id, "flame");
  assert.equal(WeaponForge.getAura(10).id, "thunder");
  assert.equal(WeaponForge.getAura(11).id, "thunder");
  assert.equal(WeaponForge.getAura(12).id, "cosmic");
});

test("WeaponForge enhances successfully with sufficient resources", () => {
  const weapon = { level: 0, pityLuck: 0 };
  const alwaysSucceed = () => 0.01;

  // Enhance from +0 -> +1
  const res = WeaponForge.enhance(weapon, { gold: 1000, stones: 10, randomFn: alwaysSucceed });
  assert.equal(res.success, true);
  assert.equal(res.level, 1);
  assert.equal(weapon.level, 1);
  assert.equal(res.spentGold, 60);
  assert.equal(res.spentStones, 1);
});

test("WeaponForge applies milestone floor on failure and builds pity luck", () => {
  const weapon = { level: 6, pityLuck: 0 }; // At +6 milestone
  const alwaysFail = () => 0.99;

  // Try enhancing +6 -> +7 and fail
  const res = WeaponForge.enhance(weapon, { gold: 1000, stones: 10, randomFn: alwaysFail });
  assert.equal(res.success, false);
  // Level should drop by 1 (6 - 1 = 5), but wait: if current level is 6, floor is 6!
  assert.equal(res.level, 6);
  assert.equal(weapon.level, 6); // Protected by +6 floor!
  assert.equal(res.pityLuck, 0.05); // +5% pity accumulated
});

test("WeaponForge sockets elemental gemstones into 3 slots", () => {
  const weapon = { level: 8, sockets: [null, null, null] };

  // Socket Ruby in slot 0
  const r1 = WeaponForge.socketGem(weapon, 0, "ruby");
  assert.equal(r1.success, true);
  assert.equal(weapon.sockets[0], "ruby");

  // Socket Topaz in slot 1
  const r2 = WeaponForge.socketGem(weapon, 1, "topaz");
  assert.equal(r2.success, true);
  assert.equal(weapon.sockets[1], "topaz");

  // Invalid slot 3 fails
  const r3 = WeaponForge.socketGem(weapon, 5, "emerald");
  assert.equal(r3.success, false);
});
