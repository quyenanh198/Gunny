import test from "node:test";
import assert from "node:assert/strict";
import { MmoStore } from "../server/mmo-store.js";

test("MmoStore initializes default profile with wallet, weapons, and fortress", () => {
  const store = new MmoStore();
  const profile = store.getProfile("user_alpha", "Chiến Tướng");

  assert.equal(profile.userId, "user_alpha");
  assert.equal(profile.displayName, "Chiến Tướng");
  assert.equal(profile.wallet.gold, 500);
  assert.equal(profile.wallet.stones, 5);
  assert.ok(profile.weapons.carrot);
  assert.equal(profile.weapons.carrot.level, 0);
  assert.ok(profile.fortress);
});

test("MmoStore enhances weapon authoritatively and deducts resources", () => {
  const store = new MmoStore();
  const res = store.enhanceWeapon("user_alpha", "carrot");

  // Enhancing +0 -> +1 succeeds (cost: 60 gold, 1 stone)
  assert.equal(res.success, true);
  assert.equal(res.level, 1);
  assert.equal(res.wallet.gold, 440); // 500 - 60
  assert.equal(res.wallet.stones, 4); // 5 - 1
  assert.equal(res.weapon.level, 1);
});

test("MmoStore hatches pet and equips it to active companion", () => {
  const store = new MmoStore();

  // Hatch common egg present in wallet
  const r1 = store.hatchPet("user_alpha", "common_egg", "Rồng Thần");
  assert.equal(r1.success, true);
  assert.equal(r1.pet.name, "Rồng Thần");
  assert.equal(r1.activePetId, r1.pet.id);
  assert.equal(r1.wallet.eggs.length, 0); // Egg consumed

  // Equip pet
  const r2 = store.equipPet("user_alpha", r1.pet.id);
  assert.equal(r2.success, true);
  assert.equal(r2.activePetId, r1.pet.id);
});

test("MmoStore recruits mercenary and claims territory yield", () => {
  const store = new MmoStore();

  // Recruit sniper bot (cost: 350 gold)
  const r1 = store.recruitMercenary("user_alpha", "sniper_bot");
  assert.equal(r1.success, true);
  assert.equal(r1.wallet.gold, 150); // 500 - 350
  assert.equal(r1.fortress.garrison.length, 1);

  // Claim yield
  const r2 = store.claimFortressYield("user_alpha");
  assert.ok(r2.claimed !== undefined);
});
