// Personal Fortress & Bot Mercenary Territory System (Milestone M34)
// "Mỗi Người Là Một Bang Chủ"
// Players build and fortify personal strongholds, hire AI bot mercenaries with gold,
// and capture resource territory outposts yielding hourly tax.

export const MERCENARY_CATALOG = [
  {
    id: "sniper_bot",
    name: "Xạ Thủ Tinh Anh",
    role: "Xạ Thủ",
    desc: "Bắn góc cao chuẩn xác, dồn sát thương tầm xa vào yếu điểm địch.",
    costGold: 350,
    hp: 140,
    power: 55,
    angles: [50, 75],
  },
  {
    id: "burrower_bot",
    name: "Pháo Thủ Khoét Đất",
    role: "Đào Đất",
    desc: "Bắn góc thấp phá hủy địa hình dưới chân kẻ địch khiến đối thủ rơi vực.",
    costGold: 300,
    hp: 160,
    power: 45,
    angles: [20, 45],
  },
  {
    id: "guardian_bot",
    name: "Chiến Hạm Hộ Vệ",
    role: "Hộ Vệ",
    desc: "Giáp dày, máu khủng, bắn tạo vách đất che chắn cho chủ thành.",
    costGold: 450,
    hp: 240,
    power: 35,
    angles: [30, 60],
  },
];

export const OUTPOST_CATALOG = [
  {
    id: "outpost_gold_valley",
    name: "Mỏ Vàng Thung Lũng",
    goldPerHour: 80,
    stonesPerHour: 0,
    defendingDifficulty: "normal",
  },
  {
    id: "outpost_stone_crag",
    name: "Mỏ Đá Rèn Vực Thẳm",
    goldPerHour: 30,
    stonesPerHour: 1, // 1 stone per hour
    defendingDifficulty: "hard",
  },
];

export class PersonalFortress {
  constructor({
    ownerId,
    ownerName = "Lãnh Chúa",
    fortressName = "Pháo Đài Bão Tố",
    level = 1,
    garrison = [],
    capturedOutposts = ["outpost_gold_valley"],
    lastClaimedAt = Date.now(),
  } = {}) {
    this.ownerId = ownerId;
    this.ownerName = ownerName;
    this.fortressName = fortressName;
    this.level = Math.max(1, Math.min(10, level | 0));
    this.garrison = garrison.map((g) => ({ ...g })); // Array of hired mercenary bots
    this.capturedOutposts = new Set(capturedOutposts);
    this.lastClaimedAt = lastClaimedAt;
  }

  // Max garrison capacity scales with fortress level
  get maxGarrisonCapacity() {
    return Math.min(6, 2 + Math.floor(this.level / 2));
  }

  get defenseHp() {
    return this.level * 600;
  }

  // Upgrade fortress level using gold
  upgradeCost() {
    return this.level * 500;
  }

  upgrade(availableGold) {
    if (this.level >= 10) return { success: false, reason: "Pháo đài đã đạt cấp tối đa (Cấp 10)." };
    const cost = this.upgradeCost();
    if (availableGold < cost) {
      return { success: false, reason: `Không đủ vàng nâng cấp. Cần ${cost} vàng.` };
    }

    this.level++;
    return {
      success: true,
      newLevel: this.level,
      spentGold: cost,
      defenseHp: this.defenseHp,
      maxGarrison: this.maxGarrisonCapacity,
      message: `Chúc mừng! ${this.fortressName} đã thăng cấp lên Cấp ${this.level}!`,
    };
  }

  // Recruit a bot mercenary with gold
  recruitMercenary(mercenaryId, availableGold) {
    const template = MERCENARY_CATALOG.find((m) => m.id === mercenaryId);
    if (!template) {
      return { success: false, reason: "Lính đánh thuê không tồn tại." };
    }
    if (this.garrison.length >= this.maxGarrisonCapacity) {
      return { success: false, reason: `Đội đồn trú đã đầy (${this.garrison.length}/${this.maxGarrisonCapacity}). Hãy nâng cấp pháo đài.` };
    }
    if (availableGold < template.costGold) {
      return { success: false, reason: `Không đủ vàng chiêu mộ. Cần ${template.costGold} vàng.` };
    }

    const hiredBot = {
      instanceId: `merc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ...template,
      currentHp: template.hp,
    };
    this.garrison.push(hiredBot);

    return {
      success: true,
      hiredBot,
      spentGold: template.costGold,
      totalGarrison: this.garrison.length,
      message: `Đã chiêu mộ thành công ${template.name} vào đội đồn trú!`,
    };
  }

  // Calculate accumulated resource yield from captured territory outposts
  calculateYield(now = Date.now()) {
    const elapsedHours = Math.max(0, (now - this.lastClaimedAt) / (1000 * 60 * 60));
    let totalGold = 0;
    let totalStones = 0;

    for (const outpost of OUTPOST_CATALOG) {
      if (this.capturedOutposts.has(outpost.id)) {
        totalGold += Math.floor(outpost.goldPerHour * elapsedHours);
        totalStones += Math.floor(outpost.stonesPerHour * elapsedHours);
      }
    }

    return {
      elapsedHours: Number(elapsedHours.toFixed(2)),
      accumulatedGold: totalGold,
      accumulatedStones: totalStones,
    };
  }

  // Claim territory yield and update timestamp
  claimYield(now = Date.now()) {
    const yieldData = this.calculateYield(now);
    if (yieldData.accumulatedGold === 0 && yieldData.accumulatedStones === 0) {
      return { claimed: false, reason: "Chưa có tài nguyên tích lũy để thu thuế." };
    }

    this.lastClaimedAt = now;
    return {
      claimed: true,
      gold: yieldData.accumulatedGold,
      stones: yieldData.accumulatedStones,
    };
  }

  // Siege battle simulation: Attack on fortress
  resolveSiege({ attackerPower = 100, isOwnerOnline = false } = {}) {
    if (isOwnerOnline) {
      return {
        mode: "live_duel",
        requiresLiveResponse: true,
        message: "Cảnh báo đỏ! Kẻ thù đang công thành. Bạn có 30 giây để vào trực tiếp chỉ huy pháo thủ!",
      };
    }

    // Automated defense resolution by garrison bots
    const totalDefensePower = this.garrison.reduce((s, b) => s + b.power, 0) + this.level * 15;
    const totalDefenseHp = this.defenseHp + this.garrison.reduce((s, b) => s + b.currentHp, 0);

    const defenseWon = totalDefensePower >= attackerPower;
    return {
      mode: "auto_resolved",
      defenseWon,
      fortressHpRemaining: defenseWon ? Math.max(100, totalDefenseHp - attackerPower * 2) : 0,
      message: defenseWon
        ? "Đội lính đánh thuê đồn trú đã bắn tan hỏa lực kẻ địch, bảo vệ thành trì thành công!"
        : "Pháo đài bị phá thủng phòng tuyến! Mỏ tài nguyên tạm thời bị phong tỏa.",
    };
  }

  serialize() {
    return {
      ownerId: this.ownerId,
      ownerName: this.ownerName,
      fortressName: this.fortressName,
      level: this.level,
      garrison: this.garrison,
      capturedOutposts: Array.from(this.capturedOutposts),
      lastClaimedAt: this.lastClaimedAt,
    };
  }

  static deserialize(data) {
    if (!data) return null;
    return new PersonalFortress(data);
  }
}

