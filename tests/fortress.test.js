import test from "node:test";
import assert from "node:assert/strict";
import { PersonalFortress, MERCENARY_CATALOG } from "../src/core/fortress.js";

test("PersonalFortress initializes with default level, defense HP and capacity", () => {
  const fortress = new PersonalFortress({
    ownerId: "user_123",
    ownerName: "Lãnh Chúa Quyền",
    fortressName: "Thành Bão Tố",
    level: 1,
  });

  assert.equal(fortress.level, 1);
  assert.equal(fortress.defenseHp, 600);
  assert.equal(fortress.maxGarrisonCapacity, 2);
  assert.equal(fortress.garrison.length, 0);
  assert.equal(fortress.upgradeCost(), 500);
});

test("PersonalFortress upgrades level with gold and expands capacity", () => {
  const fortress = new PersonalFortress({ level: 1 });

  // Insufficient gold fails
  const r1 = fortress.upgrade(300);
  assert.equal(r1.success, false);
  assert.equal(fortress.level, 1);

  // Sufficient gold succeeds
  const r2 = fortress.upgrade(500);
  assert.equal(r2.success, true);
  assert.equal(fortress.level, 2);
  assert.equal(fortress.defenseHp, 1200);
  assert.equal(fortress.maxGarrisonCapacity, 3);
});

test("PersonalFortress recruits bot mercenaries into defense garrison", () => {
  const fortress = new PersonalFortress({ level: 1 });
  const sniper = MERCENARY_CATALOG.find((m) => m.id === "sniper_bot");
  assert.ok(sniper);

  // Insufficient gold fails
  const r1 = fortress.recruitMercenary("sniper_bot", 200);
  assert.equal(r1.success, false);
  assert.equal(fortress.garrison.length, 0);

  // Sufficient gold recruits bot
  const r2 = fortress.recruitMercenary("sniper_bot", 400);
  assert.equal(r2.success, true);
  assert.equal(fortress.garrison.length, 1);
  assert.equal(fortress.garrison[0].name, "Xạ Thủ Tinh Anh");

  // Recruit second bot to reach level 1 cap (capacity 2)
  const r3 = fortress.recruitMercenary("burrower_bot", 400);
  assert.equal(r3.success, true);
  assert.equal(fortress.garrison.length, 2);

  // Third recruitment exceeds capacity -> fails
  const r4 = fortress.recruitMercenary("guardian_bot", 500);
  assert.equal(r4.success, false);
  assert.match(r4.reason, /đầy/);
});

test("PersonalFortress calculates and claims territory hourly yield", () => {
  const pastTime = Date.now() - 2 * 60 * 60 * 1000; // 2 hours ago
  const fortress = new PersonalFortress({
    capturedOutposts: ["outpost_gold_valley", "outpost_stone_crag"],
    lastClaimedAt: pastTime,
  });

  const yieldData = fortress.calculateYield();
  assert.ok(yieldData.elapsedHours >= 2);
  // Gold valley: 80/hr * 2 = 160, Stone crag: 30/hr * 2 = 60 -> Total >= 220 gold
  assert.ok(yieldData.accumulatedGold >= 220);
  // Stone crag: 1 stone/hr * 2 = 2 stones
  assert.ok(yieldData.accumulatedStones >= 2);

  // Claim yield
  const claim = fortress.claimYield();
  assert.equal(claim.claimed, true);
  assert.ok(claim.gold >= 220);
  assert.ok(claim.stones >= 2);

  // Second immediate claim has 0 yield
  const claim2 = fortress.claimYield();
  assert.equal(claim2.claimed, false);
});

test("PersonalFortress resolves siege battle differently based on owner online status", () => {
  const fortress = new PersonalFortress({ level: 3 });
  fortress.recruitMercenary("guardian_bot", 500);
  fortress.recruitMercenary("sniper_bot", 500);

  // 1. Owner online triggers live response alert
  const liveResult = fortress.resolveSiege({ attackerPower: 80, isOwnerOnline: true });
  assert.equal(liveResult.mode, "live_duel");
  assert.equal(liveResult.requiresLiveResponse, true);

  // 2. Owner offline triggers automated garrison defense simulation
  const autoResult = fortress.resolveSiege({ attackerPower: 50, isOwnerOnline: false });
  assert.equal(autoResult.mode, "auto_resolved");
  assert.equal(autoResult.defenseWon, true);
});

