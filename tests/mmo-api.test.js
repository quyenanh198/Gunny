import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { MemoryIdentityStore } from "../server/memory-identity-store.js";
import { mmoStore } from "../server/mmo-store.js";

test("MMO API endpoints handle authentication and profile operations", async () => {
  const identityStore = new MemoryIdentityStore();
  const guest = await identityStore.createGuest("PlayerOne");
  const token = guest.token;

  // Verify getProfile directly
  const profile = mmoStore.getProfile(guest.user.id, "PlayerOne");
  assert.equal(profile.userId, guest.user.id);
  assert.equal(profile.displayName, "PlayerOne");
  assert.equal(profile.wallet.gold, 500);

  // Enhance weapon
  const enhanceRes = mmoStore.enhanceWeapon(guest.user.id, "carrot");
  assert.equal(enhanceRes.success, true);
  assert.equal(enhanceRes.level, 1);
  assert.equal(enhanceRes.wallet.gold, 440);

  // Hatch egg
  const hatchRes = mmoStore.hatchPet(guest.user.id, "common_egg", "Bé Rồng");
  assert.equal(hatchRes.success, true);
  assert.equal(hatchRes.pet.name, "Bé Rồng");

  // Recruit mercenary
  const recruitRes = mmoStore.recruitMercenary(guest.user.id, "sniper_bot");
  assert.equal(recruitRes.success, true);
  assert.equal(recruitRes.hiredBot.name, "Xạ Thủ Tinh Anh");

  // Claim yield
  const claimRes = mmoStore.claimFortressYield(guest.user.id);
  assert.ok(claimRes !== null);
});
