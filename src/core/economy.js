// In-Game Gold Economy & Vanity Wardrobe Architecture for Gunny MMO-Lite
// Principles:
// - 100% Earnable in-game (Zero Pay-to-Win)
// - Vanity unlocks: Titles, Shell Trails, Emotes, Victory Celebrations
// - Performance-based gold rewards from PvP matches and PvE raids

export const VANITY_CATALOG = [
  {
    id: "title_wind_marksman",
    type: "title",
    name: "Thiện Xạ Gió",
    desc: "Danh hiệu dành cho người làm chủ mọi góc bắn ngược gió.",
    price: 300,
  },
  {
    id: "title_deadeye",
    type: "title",
    name: "Bách Phát Bách Trúng",
    desc: "Danh hiệu xạ thủ bắn trúng tâm pháo đài địch.",
    price: 800,
  },
  {
    id: "title_artillery_lord",
    type: "title",
    name: "Chúa Tể Pháo Thủ",
    desc: "Danh hiệu tối thượng của đấu trường đại bác chibi.",
    price: 1800,
  },
  {
    id: "trail_golden_meteor",
    type: "trail",
    name: "Vệt Sao Băng Vàng",
    desc: "Hiệu ứng đạn bay rực sáng lấp lánh như sao băng.",
    price: 600,
    color: "#ffd700",
  },
  {
    id: "trail_neon_cyan",
    type: "trail",
    name: "Tia Lửa Plasma",
    desc: "Vệt đạn phát sáng ánh neon công nghệ tương lai.",
    price: 900,
    color: "#00e5ff",
  },
  {
    id: "emote_victory_dance",
    type: "emote",
    name: "Vũ Điệu Chiến Thắng",
    desc: "Động tác ăn mừng nhảy múa khi hạ gục pháo thủ đối phương.",
    price: 450,
  },
];

export class EconomyWallet {
  constructor({ initialGold = 100, inventory = [], winStreak = 0 } = {}) {
    this.gold = Math.max(0, initialGold | 0);
    this.inventory = new Set(inventory);
    this.winStreak = Math.max(0, winStreak | 0);
    this.history = [];
  }

  // Calculate and award gold for completing a match
  awardMatchRewards({ won = false, damage = 0, hits = 0 } = {}) {
    const baseGold = won ? 100 : 40;
    const damageBonus = Math.floor(damage / 10);
    const hitBonus = hits * 10;

    if (won) {
      this.winStreak++;
    } else {
      this.winStreak = 0;
    }

    // Win streak bonus up to +50%
    const streakMultiplier = 1 + Math.min(0.5, this.winStreak * 0.1);
    const totalEarned = Math.round((baseGold + damageBonus + hitBonus) * streakMultiplier);

    this.gold += totalEarned;
    this.history.push({
      type: "match_reward",
      won,
      damage,
      hits,
      winStreak: this.winStreak,
      earned: totalEarned,
      timestamp: Date.now(),
    });

    return {
      earned: totalEarned,
      baseGold,
      damageBonus,
      hitBonus,
      winStreak: this.winStreak,
      newBalance: this.gold,
    };
  }

  // Award PvE raid boss clear rewards
  awardRaidRewards(raidResult) {
    if (!raidResult || raidResult.gold <= 0) return 0;
    this.gold += raidResult.gold;
    this.history.push({
      type: "raid_reward",
      bossId: raidResult.bossId,
      earned: raidResult.gold,
      timestamp: Date.now(),
    });
    return this.gold;
  }

  // Purchase a vanity item from the catalog
  purchase(itemId) {
    const item = VANITY_CATALOG.find((i) => i.id === itemId);
    if (!item) {
      return { success: false, reason: "Vật phẩm không tồn tại." };
    }
    if (this.inventory.has(itemId)) {
      return { success: false, reason: "Bạn đã sở hữu vật phẩm này rồi." };
    }
    if (this.gold < item.price) {
      return { success: false, reason: `Không đủ vàng. Cần ${item.price} vàng (hiện có ${this.gold}).` };
    }

    this.gold -= item.price;
    this.inventory.add(itemId);
    this.history.push({
      type: "purchase",
      itemId,
      cost: item.price,
      timestamp: Date.now(),
    });

    return {
      success: true,
      item,
      remainingGold: this.gold,
    };
  }

  hasItem(itemId) {
    return this.inventory.has(itemId);
  }

  getItems() {
    return Array.from(this.inventory);
  }

  // Export state for localStorage persistence
  serialize() {
    return JSON.stringify({
      gold: this.gold,
      inventory: Array.from(this.inventory),
      winStreak: this.winStreak,
    });
  }

  // Import state
  static deserialize(json) {
    try {
      const data = JSON.parse(json);
      return new EconomyWallet({
        initialGold: data.gold,
        inventory: data.inventory,
        winStreak: data.winStreak,
      });
    } catch {
      return new EconomyWallet();
    }
  }
}

