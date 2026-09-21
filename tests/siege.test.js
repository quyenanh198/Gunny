// Tests for World Map & Asynchronous Fortress Siege Warfare (Milestone M37)
import test from "node:test";
import assert from "node:assert/strict";
import { SiegeWarfareEngine } from "../server/fortress-siege.js";
import { MmoStore } from "../server/mmo-store.js";

test("SiegeWarfareEngine provides world map territory nodes", () => {
  const store = new MmoStore();
  const engine = new SiegeWarfareEngine(store);

  const territories = engine.getWorldMap();
  assert.equal(territories.length, 3);
  assert.equal(territories[0].id, "territory_gold_mine");
  assert.equal(territories[1].id, "territory_stone_forge");
  assert.equal(territories[2].id, "territory_sky_citadel");
});

test("SiegeWarfareEngine simulates siege raid, transfers territory and loots tax", () => {
  const store = new MmoStore();
  const engine = new SiegeWarfareEngine(store);

  // Setup attacker with strong fortress and mercenaries
  const attackerProfile = store.getProfile("lord_attacker", "Bá Chủ Pháo Thủ");
  store.enhanceWeapon("lord_attacker", "carrot");
  store.recruitMercenary("lord_attacker", "sniper_bot");
  store.recruitMercenary("lord_attacker", "guardian_bot");

  const initialGold = attackerProfile.wallet.gold;

  // Execute raid against gold mine
  const result = engine.raidTerritory({
    attackerId: "lord_attacker",
    attackerName: "Bá Chủ Pháo Thủ",
    territoryId: "territory_gold_mine",
    weaponLevel: 7,
  });

  assert.equal(result.success, true);
  assert.ok(result.rounds >= 1);

  if (result.victory) {
    assert.ok(result.plunderedGold > 0);
    // Territory owner should now be the attacker
    const updatedTerritory = engine.getWorldMap().find((t) => t.id === "territory_gold_mine");
    assert.equal(updatedTerritory.occupant.ownerId, "lord_attacker");
    assert.equal(updatedTerritory.occupant.ownerName, "Bá Chủ Pháo Thủ");
  }

  // Verify battle log was created and retrieved
  const logs = engine.getLogsForUser("lord_attacker");
  assert.equal(logs.length, 1);
  assert.equal(logs[0].attackerId, "lord_attacker");
  assert.equal(logs[0].territoryName, "Mỏ Vàng Hoàng Kim");
});

test("SiegeWarfareEngine prevents raiding own territory", () => {
  const store = new MmoStore();
  const engine = new SiegeWarfareEngine(store);

  const territory = engine.getWorldMap()[0];
  const ownerId = territory.occupant.ownerId;

  const result = engine.raidTerritory({
    attackerId: ownerId,
    attackerName: territory.occupant.ownerName,
    territoryId: territory.id,
  });

  assert.equal(result.success, false);
  assert.match(result.reason, /đang là lãnh chúa/);
});

