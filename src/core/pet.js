// Pet Companion System for Gunny MMO-Lite (Milestone M31)
// Pets accompany players into battle, grant passive combat auras, and build
// a Pet Ultimate Gauge to unleash devastating tactical signature shots.

export const PET_SPECIES = {
  FIRE_DRAKE: {
    id: "fire_drake",
    name: "Rồng Lửa Nhỏ",
    title: "Chúa Tể Lửa Đỏ",
    desc: "Tăng bán kính vụ nổ và giải phóng Mưa Thiên Thạch thiêu rụi đối thủ.",
    color: "#ff5252",
    aura: {
      blastRadiusBonus: 0.2, // +20% explosion radius
      damageBonus: 0.05,     // +5% raw damage
    },
    ultimate: {
      id: "meteor_barrage",
      name: "Mưa Thiên Thạch",
      desc: "Phóng loạt 3 thiên thạch nổ liên tiếp gây sát thương diện rộng.",
      projectileCount: 3,
      damage: 75,
      craterRadius: 38,
      spreadAngle: 0.12,
    },
  },
  LEAF_SPROUT: {
    id: "leaf_sprout",
    name: "Mầm Cây Thần Kỳ",
    title: "Thần Thú Trị Liệu",
    desc: "Hồi phục sinh lực mỗi lượt và giải phóng Cơn Lốc Thảo Mộc chữa lành.",
    color: "#69f0ae",
    aura: {
      regenPercent: 0.06,    // Heals 6% max HP at turn start
      fallDamageReduction: 0.3, // -30% fall damage
    },
    ultimate: {
      id: "leaf_tempest",
      name: "Cơn Lốc Thảo Mộc",
      desc: "Tạo lốc bão lá xanh vừa gây sát thương vừa hồi 50 HP cho pháo thủ.",
      projectileCount: 1,
      damage: 55,
      selfHeal: 50,
      craterRadius: 28,
      delayPenalty: 80, // +80 delay to target
    },
  },
  GOLDEN_ANT: {
    id: "golden_ant",
    name: "Kiến Siêu Quậy",
    title: "Bậc Thầy Đào Đất",
    desc: "Gia tăng sức khoét đất địa hình và kích hoạt Địa Chấn chôn vùi địch.",
    color: "#ffd740",
    aura: {
      diggingBonus: 0.35,      // +35% crater size on normal shots
      fallDamageReduction: 0.5, // -50% fall damage
    },
    ultimate: {
      id: "earthquake_burrow",
      name: "Địa Chấn Khoét Đất",
      desc: "Khoét một hố sâu khổng lồ dưới chân đối thủ khiến địch rơi xuống vực.",
      projectileCount: 1,
      damage: 60,
      craterRadius: 55, // Giant pit
    },
  },
  FROST_FAIRY: {
    id: "frost_fairy",
    name: "Băng Tinh Linh",
    title: "Vệ Thần Băng Giá",
    desc: "Tạo giáp chắn sát thương và bắn Băng Tiễn làm tê liệt bước di chuyển của địch.",
    color: "#40c4ff",
    aura: {
      armorBonus: 0.15, // Reduces incoming damage by 15%
    },
    ultimate: {
      id: "glacial_freeze",
      name: "Băng Tiễn Tê Liệt",
      desc: "Đóng băng mặt đất, gây 80 sát thương và triệt tiêu năng lượng di chuyển của địch.",
      projectileCount: 1,
      damage: 80,
      craterRadius: 25,
      drainEnergy: true,
    },
  },
};

export class Pet {
  constructor({
    id,
    speciesId = "fire_drake",
    name,
    level = 1,
    xp = 0,
    energy = 0,
  } = {}) {
    const template = PET_SPECIES[speciesId.toUpperCase()] ||
      Object.values(PET_SPECIES).find((s) => s.id === speciesId) ||
      PET_SPECIES.FIRE_DRAKE;

    this.id = id || `pet_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.speciesId = template.id;
    this.template = template;
    this.name = name || template.name;
    this.level = Math.max(1, Math.min(50, level | 0));
    this.xp = Math.max(0, xp | 0);
    this.energy = Math.max(0, Math.min(100, energy | 0)); // 0..100
  }

  // XP progression and level up
  xpToNextLevel() {
    return this.level * 120;
  }

  gainXp(amount) {
    if (amount <= 0 || this.level >= 50) return { leveledUp: false, levelsGained: 0 };
    this.xp += amount;
    let levelsGained = 0;

    while (this.level < 50 && this.xp >= this.xpToNextLevel()) {
      this.xp -= this.xpToNextLevel();
      this.level++;
      levelsGained++;
    }

    return {
      leveledUp: levelsGained > 0,
      levelsGained,
      currentLevel: this.level,
      currentXp: this.xp,
    };
  }

  // Charge Pet Ultimate gauge during combat
  // Normal hit: +18 energy, Critical hit: +30 energy
  chargeEnergy({ hits = 1, isCritical = false } = {}) {
    if (this.energy >= 100) return 100;
    const gain = (isCritical ? 30 : 18) * Math.max(1, hits);
    this.energy = Math.min(100, this.energy + gain);
    return this.energy;
  }

  isReady() {
    return this.energy >= 100;
  }

  // Activate Pet Ultimate and reset gauge
  activateUltimate() {
    if (!this.isReady()) return null;
    this.energy = 0;
    const ult = this.template.ultimate;
    const levelScale = 1 + (this.level - 1) * 0.03; // +3% power per level

    return {
      id: ult.id,
      name: ult.name,
      petName: this.name,
      damage: Math.round(ult.damage * levelScale),
      projectileCount: ult.projectileCount,
      craterRadius: Math.round(ult.craterRadius * (1 + (this.level - 1) * 0.015)),
      selfHeal: ult.selfHeal ? Math.round(ult.selfHeal * levelScale) : 0,
      delayPenalty: ult.delayPenalty || 0,
      drainEnergy: Boolean(ult.drainEnergy),
      spreadAngle: ult.spreadAngle || 0,
    };
  }

  // Get passive aura values scaled with pet level
  getAura() {
    const base = this.template.aura;
    const levelMultiplier = 1 + (this.level - 1) * 0.02; // +2% per level
    const scaled = {};

    for (const [key, value] of Object.entries(base)) {
      scaled[key] = Number((value * levelMultiplier).toFixed(3));
    }

    return scaled;
  }

  serialize() {
    return {
      id: this.id,
      speciesId: this.speciesId,
      name: this.name,
      level: this.level,
      xp: this.xp,
      energy: this.energy,
    };
  }

  static deserialize(data) {
    if (!data) return null;
    return new Pet(data);
  }
}

// Egg hatching system
export const EGG_TYPES = {
  COMMON: { id: "common_egg", name: "Trứng Thường", pool: ["fire_drake", "leaf_sprout", "golden_ant"] },
  MYTHIC: { id: "mythic_egg", name: "Trứng Huyền Thoại", pool: ["fire_drake", "leaf_sprout", "golden_ant", "frost_fairy"] },
};

export function hatchEgg(eggType = "common_egg", customName = null, randomFn = Math.random) {
  const egg = Object.values(EGG_TYPES).find((e) => e.id === eggType) || EGG_TYPES.COMMON;
  const pool = egg.pool;
  const pickedSpecies = pool[Math.floor(randomFn() * pool.length)];

  return new Pet({
    speciesId: pickedSpecies,
    name: customName || null,
    level: 1,
    xp: 0,
    energy: 0,
  });
}

