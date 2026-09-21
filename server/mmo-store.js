// Server-Authoritative MMO Progression Store for Gunny
// Ties Pets, Weapon Enhancements (+1 to +12), Dungeons, and Fortresses
// securely to the authenticated user.id session.

import { Pet, hatchEgg } from "../src/core/pet.js";
import { WeaponForge } from "../src/core/forge.js";
import { PersonalFortress } from "../src/core/fortress.js";

export class MmoStore {
  constructor() {
    this.profiles = new Map(); // userId -> UserMmoProfile
  }

  // Get or initialize user's authoritative MMO profile
  getProfile(userId, displayName = "Khách") {
    if (!this.profiles.has(userId)) {
      const defaultProfile = {
        userId,
        displayName,
        wallet: {
          gold: 500,
          stones: 5,
          gems: ["ruby"],
          eggs: ["common_egg"],
        },
        activePetId: null,
        pets: [],
        weapons: {
          carrot: { level: 0, pityLuck: 0, sockets: [null, null, null] },
          canon: { level: 0, pityLuck: 0, sockets: [null, null, null] },
          laser: { level: 0, pityLuck: 0, sockets: [null, null, null] },
          boomer: { level: 0, pityLuck: 0, sockets: [null, null, null] },
        },
        fortress: new PersonalFortress({ ownerId: userId, ownerName: displayName }).serialize(),
        dungeonClears: {},
        updatedAt: Date.now(),
      };
      this.profiles.set(userId, defaultProfile);
    }
    return this.profiles.get(userId);
  }

  // Authoritative weapon enhancement
  enhanceWeapon(userId, weaponId) {
    const profile = this.getProfile(userId);
    const weapon = profile.weapons[weaponId];
    if (!weapon) {
      return { success: false, reason: "Vũ khí không hợp lệ." };
    }

    const gold = profile.wallet.gold;
    const stones = profile.wallet.stones;

    const result = WeaponForge.enhance(weapon, { gold, stones });
    if (result.success || result.spentGold) {
      profile.wallet.gold -= result.spentGold;
      profile.wallet.stones -= result.spentStones;
      profile.updatedAt = Date.now();
    }

    return {
      ...result,
      weapon,
      wallet: profile.wallet,
    };
  }

  // Authoritative egg hatching
  hatchPet(userId, eggType = "common_egg", customName = null) {
    const profile = this.getProfile(userId);
    const eggIndex = profile.wallet.eggs.indexOf(eggType);

    if (eggIndex === -1 && profile.wallet.gold < 400) {
      return { success: false, reason: "Không có Trứng và không đủ 400 vàng để ấp trứng mới." };
    }

    if (eggIndex !== -1) {
      profile.wallet.eggs.splice(eggIndex, 1);
    } else {
      profile.wallet.gold -= 400;
    }

    const newPet = hatchEgg(eggType, customName);
    profile.pets.push(newPet.serialize());
    if (!profile.activePetId) {
      profile.activePetId = newPet.id;
    }
    profile.updatedAt = Date.now();

    return {
      success: true,
      pet: newPet.serialize(),
      activePetId: profile.activePetId,
      wallet: profile.wallet,
    };
  }

  // Authoritative pet equip
  equipPet(userId, petId) {
    const profile = this.getProfile(userId);
    const petExists = profile.pets.some((p) => p.id === petId);
    if (!petExists) {
      return { success: false, reason: "Thú cưng không tồn tại trong túi đồ." };
    }

    profile.activePetId = petId;
    profile.updatedAt = Date.now();
    return { success: true, activePetId: petId };
  }

  // Authoritative mercenary recruitment
  recruitMercenary(userId, mercenaryId) {
    const profile = this.getProfile(userId);
    const fortress = PersonalFortress.deserialize(profile.fortress);
    const gold = profile.wallet.gold;

    const result = fortress.recruitMercenary(mercenaryId, gold);
    if (result.success) {
      profile.wallet.gold -= result.spentGold;
      profile.fortress = fortress.serialize();
      profile.updatedAt = Date.now();
    }

    return {
      ...result,
      wallet: profile.wallet,
      fortress: profile.fortress,
    };
  }

  // Authoritative territory tax collection
  claimFortressYield(userId) {
    const profile = this.getProfile(userId);
    const fortress = PersonalFortress.deserialize(profile.fortress);

    const result = fortress.claimYield();
    if (result.claimed) {
      profile.wallet.gold += result.gold;
      profile.wallet.stones += result.stones;
      profile.fortress = fortress.serialize();
      profile.updatedAt = Date.now();
    }

    return {
      ...result,
      wallet: profile.wallet,
    };
  }
}

export const mmoStore = new MmoStore();
