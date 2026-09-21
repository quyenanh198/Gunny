import test from "node:test";
import assert from "node:assert/strict";
import { RaidBoss, RAID_TEMPLATES, BOSS_PARTS, BOSS_PHASES } from "../src/core/boss.js";

test("RaidBoss initializes with template stats and multi-part hitboxes", () => {
  const boss = new RaidBoss(RAID_TEMPLATES.MECHA_DREADNOUGHT, { x: 900, y: 400 });

  assert.equal(boss.name, "Tàu Chiến Cơ Giới");
  assert.equal(boss.maxHp, 1200);
  assert.equal(boss.hp, 1200);
  assert.equal(boss.phase, BOSS_PHASES.PHASE_1);
  assert.equal(boss.defeated, false);
  assert.equal(boss.parts.length, 3);

  const core = boss.parts.find((p) => p.id === BOSS_PARTS.CORE);
  assert.ok(core);
  assert.equal(core.multiplier, 2.0);

  const chassis = boss.parts.find((p) => p.id === BOSS_PARTS.CHASSIS);
  assert.ok(chassis);
  assert.equal(chassis.multiplier, 0.75);
});

test("RaidBoss hitbox calculates part multipliers and critical strikes", () => {
  const boss = new RaidBoss(RAID_TEMPLATES.MECHA_DREADNOUGHT, { x: 900, y: 400 });

  // 1. Hit Core weak point (x: 900, y: 400 - 50 = 350)
  const coreHit = boss.takeDamage(900, 350, 100);
  assert.equal(coreHit.partId, BOSS_PARTS.CORE);
  assert.equal(coreHit.critical, true);
  assert.equal(coreHit.totalDamage, 200); // 100 * 2.0
  assert.equal(boss.hp, 1000);

  // 2. Hit Chassis (x: 900, y: 400 - 20 = 380)
  const chassisHit = boss.takeDamage(900, 380, 100);
  assert.equal(chassisHit.partId, BOSS_PARTS.CHASSIS);
  assert.equal(chassisHit.critical, false);
  assert.equal(chassisHit.totalDamage, 75); // 100 * 0.75
  assert.equal(boss.hp, 925);
});

test("RaidBoss transitions phases and enrages at HP thresholds", () => {
  const boss = new RaidBoss(RAID_TEMPLATES.ANCIENT_GOLEM, { x: 800, y: 400 });
  assert.equal(boss.maxHp, 800);
  assert.equal(boss.phase, BOSS_PHASES.PHASE_1);

  // Deal damage to drop below 60% HP (<= 480 HP)
  boss.takeDamage(800, 340, 160); // 160 * 2.2 = 352 dmg -> HP: 448 (56%)
  assert.equal(boss.phase, BOSS_PHASES.PHASE_2);
  assert.equal(boss.enraged, false);

  // Deal damage to drop below 25% HP (<= 200 HP)
  boss.takeDamage(800, 340, 120); // 120 * 2.2 = 264 dmg -> HP: 184 (23%)
  assert.equal(boss.phase, BOSS_PHASES.ENRAGE);
  assert.equal(boss.enraged, true);
});

test("RaidBoss telegraphed hazard zones detonate and damage players in range", () => {
  const boss = new RaidBoss(RAID_TEMPLATES.MECHA_DREADNOUGHT, { x: 900, y: 400 });
  const players = [
    { name: "Player1", x: 200, y: 350, hp: 100 },
    { name: "Player2", x: 600, y: 350, hp: 100 },
  ];

  // Telegraph hazard targeted at Player 1
  const hazards = boss.telegraphHazards(players);
  assert.ok(hazards.length >= 1);
  assert.equal(boss.hazards.length, hazards.length);

  // Force one hazard directly at player 1's position for deterministic test
  boss.hazards[0].x = 200;
  boss.hazards[0].radius = 50;
  boss.hazards[0].damage = 60;
  boss.hazards[0].turnsLeft = 1;

  // Advance turn: hazard detonates
  const result = boss.advanceTurn(players);
  assert.equal(result.turn, 1);
  assert.ok(result.detonatedCount >= 1);

  // Player 1 caught in blast takes damage; Player 2 is far away and safe
  assert.ok(players[0].hp < 100, "Player 1 should take hazard damage");
  assert.equal(players[1].hp, 100, "Player 2 outside blast radius should be unharmed");
});

test("RaidBoss victory distributes fair in-game gold rewards and MVP status", () => {
  const boss = new RaidBoss(RAID_TEMPLATES.ANCIENT_GOLEM, { x: 800, y: 400 });
  const participants = [
    { name: "Alice", damageDealt: 600 },
    { name: "Bob", damageDealt: 200 },
  ];

  // Rewards null before defeat
  assert.equal(boss.calculateRewards(participants), null);

  // Defeat boss
  boss.takeDamage(800, 340, 400); // Massive hit
  assert.equal(boss.defeated, true);

  const rewards = boss.calculateRewards(participants);
  assert.ok(rewards);
  assert.equal(rewards.bossName, "Cự Thần Rừng Đá");
  assert.equal(rewards.rewards.length, 2);

  const aliceReward = rewards.rewards.find((r) => r.name === "Alice");
  const bobReward = rewards.rewards.find((r) => r.name === "Bob");

  assert.ok(aliceReward.gold > bobReward.gold, "Top damage dealer should earn more gold");
  assert.equal(aliceReward.isMvp, true);
  assert.equal(aliceReward.badge, "Dũng Sĩ Diệt Boss");
  assert.equal(bobReward.isMvp, false);
});

