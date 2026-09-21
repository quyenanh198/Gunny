// Safe Milestone Forge & Elemental Infusion System (Milestone M32)
// Principles:
// - Milestone Protection: Weapons NEVER break, and levels NEVER drop below unlocked milestones (+3, +6, +9, +12).
// - Pity Luck: Each failed attempt adds cumulative success bonus guaranteeing progression.
// - Visual Auras: +7 Flame, +10 Thunder, +12 Cosmic Halo.
// - Elemental Gemstones: Ruby (Hỏa), Topaz (Lôi), Emerald (Phong).

export const MAX_ENHANCE_LEVEL = 12;
export const MILESTONES = [3, 6, 9, 12];

export const AURAS = {
  NONE: null,
  FLAME: { id: "flame", name: "Hào Quang Lửa Đỏ", color: "#ff6d00", minLevel: 7 },
  THUNDER: { id: "thunder", name: "Lôi Điểm Tím", color: "#b388ff", minLevel: 10 },
  COSMIC: { id: "cosmic", name: "Vòng Sáng Vũ Trụ", color: "#00e5ff", minLevel: 12 },
};

export const ELEMENTAL_GEMS = {
  RUBY: {
    id: "ruby",
    name: "Ngọc Hỏa Hồng",
    element: "fire",
    color: "#ff1744",
    desc: "Thiêu đốt địa hình nổ và gây 18 sát thương đốt cháy qua 2 lượt.",
    dotDamage: 18,
    dotDuration: 2,
  },
  TOPAZ: {
    id: "topaz",
    name: "Ngọc Lôi Thạch",
    element: "thunder",
    color: "#ffd600",
    desc: "Phát luồng điện giật lan 25 sát thương sang đối thủ trong bán kính 65px.",
    chainDamage: 25,
    chainRadius: 65,
  },
  EMERALD: {
    id: "emerald",
    name: "Ngọc Phong Bích",
    element: "wind",
    color: "#00e676",
    desc: "Xuyên gió, triệt tiêu 50% độ lệch của lực gió đối với đường đạn.",
    windDriftReduction: 0.5,
  },
};

export const ENHANCE_CONFIG = {
  // [level -> nextLevel]: { costGold, costStones, baseSuccessRate, milestoneFloor }
  1: { costGold: 60, costStones: 1, baseRate: 1.0, floor: 0 },
  2: { costGold: 100, costStones: 1, baseRate: 1.0, floor: 0 },
  3: { costGold: 160, costStones: 2, baseRate: 1.0, floor: 0 }, // Unlocks +3 Milestone
  4: { costGold: 240, costStones: 2, baseRate: 0.7, floor: 3 },
  5: { costGold: 340, costStones: 3, baseRate: 0.6, floor: 3 },
  6: { costGold: 480, costStones: 3, baseRate: 0.5, floor: 3 }, // Unlocks +6 Milestone
  7: { costGold: 650, costStones: 4, baseRate: 0.45, floor: 6 }, // Unlocks Flame Aura
  8: { costGold: 850, costStones: 5, baseRate: 0.38, floor: 6 },
  9: { costGold: 1100, costStones: 6, baseRate: 0.32, floor: 6 }, // Unlocks +9 Milestone
  10: { costGold: 1500, costStones: 8, baseRate: 0.28, floor: 9 }, // Unlocks Thunder Aura
  11: { costGold: 2000, costStones: 10, baseRate: 0.22, floor: 9 },
  12: { costGold: 2800, costStones: 12, baseRate: 0.18, floor: 9 }, // Unlocks Cosmic Halo
};

export class WeaponForge {
  static getMilestoneFloor(level) {
    if (level >= 9) return 9;
    if (level >= 6) return 6;
    if (level >= 3) return 3;
    return 0;
  }

  static getAura(level) {
    if (level >= 12) return AURAS.COSMIC;
    if (level >= 10) return AURAS.THUNDER;
    if (level >= 7) return AURAS.FLAME;
    return AURAS.NONE;
  }

  // PvE damage multiplier: +8% per enhance level
  static getPveDamageMultiplier(level) {
    return Number((1 + Math.max(0, level) * 0.08).toFixed(2));
  }

  // Execute weapon enhancement with milestone floor and pity luck
  static enhance(weaponState, { gold = 0, stones = 0, randomFn = Math.random } = {}) {
    const currentLevel = weaponState.level || 0;
    if (currentLevel >= MAX_ENHANCE_LEVEL) {
      return { success: false, reason: "Vũ khí đã đạt cấp tối đa (+12)." };
    }

    const nextLevel = currentLevel + 1;
    const config = ENHANCE_CONFIG[nextLevel];

    if (gold < config.costGold) {
      return { success: false, reason: `Không đủ vàng. Cần ${config.costGold} vàng (hiện có ${gold}).` };
    }
    if (stones < config.costStones) {
      return { success: false, reason: `Không đủ Đá Rèn. Cần ${config.costStones} viên (hiện có ${stones}).` };
    }

    const currentPity = weaponState.pityLuck || 0;
    const effectiveRate = Math.min(1.0, config.baseRate + currentPity);
    const roll = randomFn();
    const isSuccess = roll < effectiveRate;

    if (isSuccess) {
      weaponState.level = nextLevel;
      weaponState.pityLuck = 0; // Reset pity
      const aura = WeaponForge.getAura(weaponState.level);

      return {
        success: true,
        level: weaponState.level,
        aura,
        spentGold: config.costGold,
        spentStones: config.costStones,
        message: `Cường hóa thành công lên +${weaponState.level}!`,
      };
    }

    // On failure: Drop by 1 level but never below milestone floor
    const floor = WeaponForge.getMilestoneFloor(currentLevel);
    const newLevel = Math.max(floor, currentLevel - 1);
    weaponState.level = newLevel;
    // Build pity luck: +5% per failure
    weaponState.pityLuck = Math.min(0.6, currentPity + 0.05);

    return {
      success: false,
      level: weaponState.level,
      pityLuck: weaponState.pityLuck,
      spentGold: config.costGold,
      spentStones: config.costStones,
      message: `Cường hóa thất bại. Đã giữ cấp an toàn ở mốc +${weaponState.level}. (Tích lũy may mắn: +${Math.round(weaponState.pityLuck * 100)}%)`,
    };
  }

  // Socket an elemental gemstone into weapon slot (0, 1, or 2)
  static socketGem(weaponState, slotIndex, gemId) {
    if (slotIndex < 0 || slotIndex > 2) {
      return { success: false, reason: "Ô khảm không hợp lệ (tối đa 3 ô: 0, 1, 2)." };
    }

    const gem = Object.values(ELEMENTAL_GEMS).find((g) => g.id === gemId);
    if (!gem) {
      return { success: false, reason: "Ngọc nguyên tố không tồn tại." };
    }

    weaponState.sockets = weaponState.sockets || [null, null, null];
    weaponState.sockets[slotIndex] = gem.id;

    return {
      success: true,
      sockets: weaponState.sockets,
      socketedGem: gem,
      message: `Đã khảm thành công ${gem.name} vào ô ${slotIndex + 1}!`,
    };
  }
}

