// World Map & Asynchronous Fortress Siege Warfare (Milestone M37)
// Supports territory nodes, raiding rival player strongholds,
// mercenary bot defense simulation, tax plundering, and battle history logs.

import { PersonalFortress, MERCENARY_CATALOG, OUTPOST_CATALOG } from "../src/core/fortress.js";
import { mmoStore } from "./mmo-store.js";

export const WORLD_TERRITORIES = [
  {
    id: "territory_gold_mine",
    name: "Mỏ Vàng Hoàng Kim",
    desc: "Vùng đất dồi dào tài nguyên, sản sinh +120 Vàng/giờ cho lãnh chúa chiếm giữ.",
    resource: "gold",
    yieldPerHour: 120,
    baseDefenseHp: 2000,
    occupant: {
      ownerId: "bot_lord_1",
      ownerName: "Lãnh Chúa Gà Rừng",
      level: 3,
      defenseHp: 2000,
      garrison: ["sniper_bot", "guardian_bot"],
    },
  },
  {
    id: "territory_stone_forge",
    name: "Hầm Đá Rèn Hắc Diệu",
    desc: "Cứ điểm khai thác đá rèn quý giá, sản sinh +2 Viên Đá Rèn/giờ.",
    resource: "stones",
    yieldPerHour: 2,
    baseDefenseHp: 3000,
    occupant: {
      ownerId: "bot_lord_2",
      ownerName: "Hắc Long Tướng",
      level: 5,
      defenseHp: 3000,
      garrison: ["sniper_bot", "burrower_bot", "guardian_bot"],
    },
  },
  {
    id: "territory_sky_citadel",
    name: "Pháo Đài Không Gian",
    desc: "Đỉnh tháp gió bão tối thượng, cung cấp +250 Vàng và +3 Đá Rèn mỗi giờ.",
    resource: "hybrid",
    yieldPerHour: 250,
    baseDefenseHp: 5000,
    occupant: {
      ownerId: "bot_lord_3",
      ownerName: "Đại Tướng Quân Cơ Giới",
      level: 8,
      defenseHp: 5000,
      garrison: ["sniper_bot", "sniper_bot", "guardian_bot", "burrower_bot"],
    },
  },
];

export class SiegeWarfareEngine {
  constructor(mmoStoreInstance = mmoStore) {
    this.mmoStore = mmoStoreInstance;
    this.territories = new Map(WORLD_TERRITORIES.map((t) => [t.id, { ...t }]));
    this.battleLogs = []; // Global and player siege logs
  }

  // Get world map territory nodes
  getWorldMap() {
    return [...this.territories.values()];
  }

  // Retrieve battle logs for a specific player (as attacker or defender)
  getLogsForUser(userId) {
    return this.battleLogs
      .filter((log) => log.attackerId === userId || log.defenderId === userId)
      .slice(-20)
      .reverse();
  }

  // Simulate asynchronous siege raid against a territory or player fortress
  raidTerritory({ attackerId, attackerName, territoryId, weaponLevel = 0 } = {}) {
    const territory = this.territories.get(territoryId);
    if (!territory) {
      return { success: false, reason: "Cứ điểm không tồn tại trên bản đồ thế giới." };
    }

    if (territory.occupant.ownerId === attackerId) {
      return { success: false, reason: "Bạn đang là lãnh chúa chiếm giữ cứ điểm này!" };
    }

    const attackerProfile = this.mmoStore.getProfile(attackerId, attackerName);
    const attackerFort = PersonalFortress.deserialize(attackerProfile.fortress);

    // Calculate attacker combat strength
    const attackerGarrison = attackerFort.garrison || [];
    let attackerPower = (attackerFort.level * 100) + (weaponLevel * 45);
    for (const bot of attackerGarrison) {
      attackerPower += (bot.power || 40);
    }

    // Calculate defender combat strength
    const defender = territory.occupant;
    let defenderHp = defender.defenseHp || 1000;
    let defenderPower = (defender.level * 80);
    for (const botId of (defender.garrison || [])) {
      const template = MERCENARY_CATALOG.find((m) => m.id === (typeof botId === "string" ? botId : botId.id));
      defenderPower += template ? template.power : 35;
    }

    // Round-by-round siege battle simulation (max 5 rounds)
    let rounds = 0;
    let attackerHp = 500 + attackerFort.level * 150;
    let attackerDamageDealt = 0;
    let defenderDamageDealt = 0;

    while (rounds < 5 && attackerHp > 0 && defenderHp > 0) {
      rounds++;
      // Attacker fires artillery barrage
      const attDmg = Math.floor(attackerPower * (0.85 + Math.random() * 0.3));
      defenderHp -= attDmg;
      attackerDamageDealt += attDmg;

      if (defenderHp <= 0) break;

      // Defender bot garrison counter-fires
      const defDmg = Math.floor(defenderPower * (0.8 + Math.random() * 0.4));
      attackerHp -= defDmg;
      defenderDamageDealt += defDmg;
    }

    const isVictory = defenderHp <= 0 && attackerHp > 0;

    // Calculate plunder & rewards
    let plunderedGold = 0;
    let plunderedStones = 0;

    if (isVictory) {
      plunderedGold = territory.resource === "gold" || territory.resource === "hybrid"
        ? Math.floor(territory.yieldPerHour * 3)
        : 150;
      plunderedStones = territory.resource === "stones" || territory.resource === "hybrid"
        ? Math.max(1, territory.yieldPerHour)
        : 1;

      // Credit rewards authoritatively to attacker
      attackerProfile.wallet.gold += plunderedGold;
      attackerProfile.wallet.stones += plunderedStones;

      // Transfer territory ownership to attacker
      const previousOwnerName = territory.occupant.ownerName;
      territory.occupant = {
        ownerId: attackerId,
        ownerName: attackerName,
        level: attackerFort.level,
        defenseHp: attackerFort.defenseHp,
        garrison: attackerGarrison.map((g) => g.id),
      };

      const logEntry = {
        id: `siege_${Date.now()}`,
        timestamp: Date.now(),
        territoryName: territory.name,
        attackerId,
        attackerName,
        defenderId: defender.ownerId,
        defenderName: previousOwnerName,
        outcome: "victory",
        rounds,
        plunderedGold,
        plunderedStones,
        message: `${attackerName} đã công phá thành công ${territory.name}, đánh bại ${previousOwnerName} sau ${rounds} hiệp chiến đấu ác liệt!`,
      };
      this.battleLogs.push(logEntry);

      return {
        success: true,
        victory: true,
        rounds,
        territoryName: territory.name,
        plunderedGold,
        plunderedStones,
        wallet: attackerProfile.wallet,
        log: logEntry,
      };
    }

    // Attacker failed
    const failEntry = {
      id: `siege_${Date.now()}`,
      timestamp: Date.now(),
      territoryName: territory.name,
      attackerId,
      attackerName,
      defenderId: defender.ownerId,
      defenderName: defender.ownerName,
      outcome: "defeat",
      rounds,
      message: `${attackerName} đã bị đội quân phòng thủ của ${defender.ownerName} đẩy lùi tại ${territory.name}.`,
    };
    this.battleLogs.push(failEntry);

    return {
      success: true,
      victory: false,
      rounds,
      territoryName: territory.name,
      reason: `Quân lực phòng thủ của ${defender.ownerName} quá kiên cố!`,
      log: failEntry,
    };
  }
}

export const siegeWarfareEngine = new SiegeWarfareEngine();

