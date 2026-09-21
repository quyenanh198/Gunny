// PvE Co-Op Boss Raid Architecture for Gunny MMO-Lite
// Supports 2-4 player cooperative encounters against massive multi-part raid bosses.
// Features:
// - Multi-part hitboxes (core weak points, armored chassis, sub-cannons)
// - 3-phase combat state machine with Enrage mechanics
// - Telegraphed hazard zones requiring tactical movement
// - Deterministic loot and gold drop distribution

export const BOSS_PARTS = {
  CORE: "core",         // Weak point: 2.0x damage
  CHASSIS: "chassis",   // Armored body: 0.75x damage
  TURRET: "turret",     // Weapon system: 1.25x damage
};

export const BOSS_PHASES = {
  PHASE_1: 1, // Standard Artillery Barrage (100% -> 60% HP)
  PHASE_2: 2, // Cluster Artillery & Ground Cratering (60% -> 25% HP)
  ENRAGE: 3,  // High-Damage Rapid Mortar / Laser (< 25% HP)
};

export const RAID_TEMPLATES = {
  MECHA_DREADNOUGHT: {
    id: "mecha_dreadnought",
    name: "Tàu Chiến Cơ Giới",
    title: "Chúa Tể Pháo Đài Cổ",
    maxHp: 1200,
    width: 140,
    height: 120,
    parts: [
      { id: BOSS_PARTS.CORE, name: "Lõi Năng Lượng", offsetX: 0, offsetY: -50, radius: 25, multiplier: 2.0 },
      { id: BOSS_PARTS.CHASSIS, name: "Giáp Thân Hạng Nặng", offsetX: 0, offsetY: -20, radius: 65, multiplier: 0.75 },
      { id: BOSS_PARTS.TURRET, name: "Tháp Pháo Đôi", offsetX: -40, offsetY: -75, radius: 32, multiplier: 1.25 },
    ],
    baseRewardGold: 600,
  },
  ANCIENT_GOLEM: {
    id: "ancient_golem",
    name: "Cự Thần Rừng Đá",
    title: "Thần Thú Ngủ Say",
    maxHp: 800,
    width: 120,
    height: 110,
    parts: [
      { id: BOSS_PARTS.CORE, name: "Viên Ngọc Nguyên Tố", offsetX: 0, offsetY: -60, radius: 20, multiplier: 2.2 },
      { id: BOSS_PARTS.CHASSIS, name: "Thân Đá Cương", offsetX: 0, offsetY: -25, radius: 55, multiplier: 0.8 },
      { id: BOSS_PARTS.TURRET, name: "Nắm Đấm Nham Thạch", offsetX: 35, offsetY: -40, radius: 28, multiplier: 1.3 },
    ],
    baseRewardGold: 450,
  },
};

export class RaidBoss {
  constructor(template = RAID_TEMPLATES.MECHA_DREADNOUGHT, { x = 950, y = 380 } = {}) {
    this.template = template;
    this.id = template.id;
    this.name = template.name;
    this.title = template.title;
    this.x = x;
    this.y = y;
    this.maxHp = template.maxHp;
    this.hp = template.maxHp;
    this.parts = template.parts.map((p) => ({ ...p }));
    this.phase = BOSS_PHASES.PHASE_1;
    this.hazards = []; // Telegraphed AOE ground hazards: { id, x, radius, damage, turnsLeft }
    this.hazardCounter = 0;
    this.turnCount = 0;
    this.defeated = false;
    this.enraged = false;
    this.partDamage = {
      [BOSS_PARTS.CORE]: 0,
      [BOSS_PARTS.CHASSIS]: 0,
      [BOSS_PARTS.TURRET]: 0,
    };
  }

  // Calculate damage taken from a blast centered at (hitX, hitY)
  takeDamage(hitX, hitY, rawDamage) {
    if (this.defeated || rawDamage <= 0) return { totalDamage: 0, partHit: null, critical: false };

    // Find closest part hitbox
    let bestPart = null;
    let minDistance = Infinity;

    for (const part of this.parts) {
      const partCenterX = this.x + part.offsetX;
      const partCenterY = this.y + part.offsetY;
      const dist = Math.hypot(hitX - partCenterX, hitY - partCenterY);

      if (dist <= part.radius && dist < minDistance) {
        minDistance = dist;
        bestPart = part;
      }
    }

    // Default to chassis if blast hits within general bounding radius
    if (!bestPart) {
      const distToCenter = Math.hypot(hitX - this.x, hitY - (this.y - 35));
      if (distToCenter <= this.template.width / 2) {
        bestPart = this.parts.find((p) => p.id === BOSS_PARTS.CHASSIS) || this.parts[0];
      }
    }

    if (!bestPart) {
      return { totalDamage: 0, partHit: null, critical: false };
    }

    const multiplier = bestPart.multiplier;
    const finalDamage = Math.round(rawDamage * multiplier);
    this.hp = Math.max(0, this.hp - finalDamage);
    this.partDamage[bestPart.id] = (this.partDamage[bestPart.id] || 0) + finalDamage;

    const isCritical = bestPart.id === BOSS_PARTS.CORE;
    this.checkPhase();

    if (this.hp === 0) {
      this.defeated = true;
    }

    return {
      totalDamage: finalDamage,
      partHit: bestPart.name,
      partId: bestPart.id,
      multiplier,
      critical: isCritical,
      remainingHp: this.hp,
      phase: this.phase,
    };
  }

  // Phase state transitions based on HP percentages
  checkPhase() {
    const hpRatio = this.hp / this.maxHp;
    if (hpRatio <= 0.25) {
      if (this.phase !== BOSS_PHASES.ENRAGE) {
        this.phase = BOSS_PHASES.ENRAGE;
        this.enraged = true;
      }
    } else if (hpRatio <= 0.6) {
      if (this.phase === BOSS_PHASES.PHASE_1) {
        this.phase = BOSS_PHASES.PHASE_2;
      }
    }
  }

  // Telegraphed hazards: create warning zones at target player locations
  telegraphHazards(playerPositions = []) {
    if (this.defeated || !playerPositions.length) return [];
    const count = this.phase === BOSS_PHASES.ENRAGE ? 3 : this.phase === BOSS_PHASES.PHASE_2 ? 2 : 1;
    const newHazards = [];

    // Target players or strategic terrain points
    for (let i = 0; i < count; i++) {
      const target = playerPositions[i % playerPositions.length];
      const scatter = (Math.random() - 0.5) * 60;
      const hazard = {
        id: `hazard_${++this.hazardCounter}`,
        x: Math.max(40, Math.min(1160, target.x + scatter)),
        radius: this.phase === BOSS_PHASES.ENRAGE ? 65 : 45,
        damage: this.phase === BOSS_PHASES.ENRAGE ? 120 : 75,
        turnsLeft: 1, // Explodes next turn giving players a turn to move away
      };
      this.hazards.push(hazard);
      newHazards.push(hazard);
    }
    return newHazards;
  }

  // Advance boss turn and resolve detonating hazards
  advanceTurn(playerActors = []) {
    this.turnCount++;
    const detonated = [];
    const remaining = [];

    for (const h of this.hazards) {
      h.turnsLeft--;
      if (h.turnsLeft <= 0) {
        detonated.push(h);
      } else {
        remaining.push(h);
      }
    }
    this.hazards = remaining;

    // Apply damage to any player caught inside the hazard AOE
    const casualties = [];
    for (const d of detonated) {
      for (const player of playerActors) {
        if (player.hp > 0) {
          const dist = Math.abs(player.x - d.x);
          if (dist <= d.radius) {
            const falloff = 1 - dist / d.radius;
            const dmg = Math.round(d.damage * (0.5 + 0.5 * falloff));
            player.hp = Math.max(0, player.hp - dmg);
            casualties.push({ player: player.name, damage: dmg, remainingHp: player.hp });
          }
        }
      }
    }

    return {
      turn: this.turnCount,
      detonatedCount: detonated.length,
      casualties,
    };
  }

  // Compute loot and gold distribution on victory
  calculateRewards(participants = []) {
    if (!this.defeated) return null;
    const baseGold = this.template.baseRewardGold;
    const rewards = [];

    // Distribute rewards proportional to participants
    for (const p of participants) {
      const damageContribution = p.damageDealt || 0;
      const totalPartyDamage = participants.reduce((s, x) => s + (x.damageDealt || 0), 0) || 1;
      const ratio = damageContribution / totalPartyDamage;

      // Base share + performance bonus
      const earnedGold = Math.round(baseGold * 0.5 + baseGold * 0.5 * ratio);
      const isMvp = participants.every((other) => (other.damageDealt || 0) <= damageContribution);

      rewards.push({
        playerId: p.id || p.name,
        name: p.name,
        gold: earnedGold,
        isMvp,
        badge: isMvp ? "Dũng Sĩ Diệt Boss" : "Thợ Săn Hầm Ngục",
      });
    }

    return {
      bossId: this.id,
      bossName: this.name,
      totalTurns: this.turnCount,
      rewards,
    };
  }
}

