// Multi-Stage PvE Dungeon System for Gunny MMO-Lite (Milestone M33)
// Players embark on continuous 3-stage dungeon expeditions:
// - Stage 1: Minion Wave (Excavator adds)
// - Stage 2: Hazard Arena (Gale force winds & falling hazards)
// - Stage 3: Boss Raid (Multi-part Boss with shifting weak points)

import { RaidBoss, RAID_TEMPLATES } from "./boss.js";
import { EGG_TYPES } from "./pet.js";

export const DUNGEON_STAGES = {
  STAGE_1_MINIONS: 1,
  STAGE_2_HAZARDS: 2,
  STAGE_3_BOSS: 3,
};

export const DUNGEON_TEMPLATES = {
  ANT_CAVERN: {
    id: "ant_cavern",
    name: "Huyệt Kiến Ma Cổ Đại",
    title: "Vương Quốc Dưới Lòng Đất",
    recommendedLevel: 1,
    turnLimits: [6, 5, 10], // Turns allowed per stage
    stage1Minions: [
      { id: "minion_1", name: "Kiến Thợ Đào Đất", hp: 120, maxHp: 120, x: 750, y: 360 },
      { id: "minion_2", name: "Kiến Chiến Binh", hp: 160, maxHp: 160, x: 920, y: 380 },
    ],
    stage2Hazard: { name: "Gió Độc Ngược Hướng", windFactor: -24, hazardDamage: 40 },
    bossTemplate: RAID_TEMPLATES.ANCIENT_GOLEM,
    rewards: {
      minGold: 300,
      maxGold: 500,
      stones: 2,
      eggChance: 0.45,
      eggType: EGG_TYPES.COMMON.id,
    },
  },
  MECHA_CITADEL: {
    id: "mecha_citadel",
    name: "Pháo Đài Cơ Giới Hắc Ám",
    title: "Căn Cứ Bất Khả Xâm Phạm",
    recommendedLevel: 5,
    turnLimits: [7, 6, 12],
    stage1Minions: [
      { id: "drone_1", name: "Drone Xạ Thủ", hp: 180, maxHp: 180, x: 720, y: 350 },
      { id: "drone_2", name: "Drone Oanh Tạc", hp: 200, maxHp: 200, x: 880, y: 370 },
      { id: "drone_3", name: "Pháo Tự Hành", hp: 240, maxHp: 240, x: 1020, y: 390 },
    ],
    stage2Hazard: { name: "Lốc Xoáy Điện Từ", windFactor: 28, hazardDamage: 60 },
    bossTemplate: RAID_TEMPLATES.MECHA_DREADNOUGHT,
    rewards: {
      minGold: 600,
      maxGold: 1000,
      stones: 5,
      eggChance: 0.75,
      eggType: EGG_TYPES.MYTHIC.id,
    },
  },
};

export class DungeonSession {
  constructor(dungeonTemplate = DUNGEON_TEMPLATES.ANT_CAVERN, { party = [] } = {}) {
    this.dungeon = dungeonTemplate;
    this.stage = DUNGEON_STAGES.STAGE_1_MINIONS;
    this.stageTurn = 0;
    this.totalTurns = 0;
    this.party = party.map((p) => ({
      id: p.id || p.name,
      name: p.name,
      hp: p.hp || 100,
      maxHp: p.maxHp || 100,
      damageDealt: 0,
    }));
    this.minions = dungeonTemplate.stage1Minions.map((m) => ({ ...m }));
    this.boss = null;
    this.completed = false;
    this.failed = false;
  }

  // Check if entire player party is wiped out
  isPartyDefeated() {
    return this.party.every((p) => p.hp <= 0);
  }

  // Record a round of action in the current stage
  recordTurn({ partyDamage = 0, enemyDamageDealt = 0 } = {}) {
    if (this.completed || this.failed) return null;

    this.stageTurn++;
    this.totalTurns++;
    const turnLimit = this.dungeon.turnLimits[this.stage - 1];

    if (this.stage === DUNGEON_STAGES.STAGE_1_MINIONS) {
      // Distribute damage among living minions
      let remainingDamage = partyDamage;
      for (const m of this.minions) {
        if (m.hp > 0 && remainingDamage > 0) {
          const dmg = Math.min(m.hp, remainingDamage);
          m.hp -= dmg;
          remainingDamage -= dmg;
        }
      }

      // Check if all minions cleared
      const minionsCleared = this.minions.every((m) => m.hp <= 0);
      if (minionsCleared) {
        this.advanceStage();
        return { event: "stage_cleared", nextStage: this.stage };
      }
    } else if (this.stage === DUNGEON_STAGES.STAGE_2_HAZARDS) {
      // Stage 2 hazard survival: survive hazard waves
      if (partyDamage >= 150 || this.stageTurn >= turnLimit) {
        this.advanceStage();
        return { event: "stage_cleared", nextStage: this.stage };
      }
    } else if (this.stage === DUNGEON_STAGES.STAGE_3_BOSS) {
      // Boss raid damage resolution
      if (this.boss) {
        // Assume direct hit to boss
        this.boss.takeDamage(this.boss.x, this.boss.y - 30, partyDamage);
        if (this.boss.defeated) {
          this.completed = true;
          return { event: "dungeon_cleared", rewards: this.generateRewards() };
        }
      }
    }

    // Party takes incoming damage
    if (enemyDamageDealt > 0) {
      const perPlayer = Math.ceil(enemyDamageDealt / Math.max(1, this.party.filter((p) => p.hp > 0).length));
      for (const p of this.party) {
        if (p.hp > 0) p.hp = Math.max(0, p.hp - perPlayer);
      }
    }

    if (this.isPartyDefeated() || (this.stageTurn > turnLimit && this.stage !== DUNGEON_STAGES.STAGE_2_HAZARDS)) {
      this.failed = true;
      return { event: "dungeon_failed", reason: this.isPartyDefeated() ? "Tổ đội bị tiêu diệt." : "Quá số lượt quy định." };
    }

    return { event: "turn_continue", stageTurn: this.stageTurn, stage: this.stage };
  }

  // Advance to next stage with checkpoint heal
  advanceStage() {
    this.stage++;
    this.stageTurn = 0;

    // Checkpoint recovery: heal 30% max HP
    for (const p of this.party) {
      if (p.hp > 0) {
        p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * 0.3));
      }
    }

    if (this.stage === DUNGEON_STAGES.STAGE_3_BOSS) {
      this.boss = new RaidBoss(this.dungeon.bossTemplate, { x: 920, y: 380 });
    }
  }

  // Calculate guaranteed dungeon rewards upon clearing Stage 3
  generateRewards(randomFn = Math.random) {
    const config = this.dungeon.rewards;
    const gold = Math.round(config.minGold + randomFn() * (config.maxGold - config.minGold));
    const stones = config.stones;
    const gotEgg = randomFn() < config.eggChance;

    const gems = ["ruby", "topaz", "emerald"];
    const bonusGem = gems[Math.floor(randomFn() * gems.length)];

    return {
      dungeonId: this.dungeon.id,
      dungeonName: this.dungeon.name,
      totalTurns: this.totalTurns,
      gold,
      stones,
      gemShard: bonusGem,
      egg: gotEgg ? config.eggType : null,
    };
  }
}

