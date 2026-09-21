import test from "node:test";
import assert from "node:assert/strict";
import { DungeonSession, DUNGEON_TEMPLATES, DUNGEON_STAGES } from "../src/core/dungeon.js";

test("DungeonSession initializes at Stage 1 with minion adds", () => {
  const party = [{ name: "Player1", hp: 100, maxHp: 100 }];
  const session = new DungeonSession(DUNGEON_TEMPLATES.ANT_CAVERN, { party });

  assert.equal(session.stage, DUNGEON_STAGES.STAGE_1_MINIONS);
  assert.equal(session.stageTurn, 0);
  assert.equal(session.minions.length, 2);
  assert.equal(session.completed, false);
  assert.equal(session.failed, false);
});

test("DungeonSession clears Stage 1 when all minions defeated", () => {
  const party = [{ name: "Player1", hp: 100, maxHp: 100 }];
  const session = new DungeonSession(DUNGEON_TEMPLATES.ANT_CAVERN, { party });

  // Deal partial damage
  session.recordTurn({ partyDamage: 120 }); // Clears minion 1 (120 hp)
  assert.equal(session.minions[0].hp, 0);
  assert.equal(session.minions[1].hp, 160);
  assert.equal(session.stage, DUNGEON_STAGES.STAGE_1_MINIONS);

  // Clear minion 2
  const r2 = session.recordTurn({ partyDamage: 160 });
  assert.equal(r2.event, "stage_cleared");
  assert.equal(session.stage, DUNGEON_STAGES.STAGE_2_HAZARDS);
});

test("DungeonSession advances through Stage 2 and spawns Boss in Stage 3", () => {
  const party = [{ name: "Player1", hp: 80, maxHp: 100 }];
  const session = new DungeonSession(DUNGEON_TEMPLATES.ANT_CAVERN, { party });
  session.stage = DUNGEON_STAGES.STAGE_2_HAZARDS;

  // Clear stage 2 by dealing 150 hazard progression damage
  const r = session.recordTurn({ partyDamage: 160 });
  assert.equal(r.event, "stage_cleared");
  assert.equal(session.stage, DUNGEON_STAGES.STAGE_3_BOSS);
  assert.ok(session.boss, "RaidBoss should be spawned in Stage 3");
  assert.equal(session.party[0].hp, 100, "Checkpoint heal should restore HP");
});

test("DungeonSession clears Stage 3 and yields guaranteed loot, stones and egg", () => {
  const party = [{ name: "Player1", hp: 100, maxHp: 100 }];
  const session = new DungeonSession(DUNGEON_TEMPLATES.ANT_CAVERN, { party });
  session.stage = DUNGEON_STAGES.STAGE_2_HAZARDS;
  session.advanceStage(); // Advances from stage 2 to stage 3 and spawns boss

  // Deplete boss HP
  const r = session.recordTurn({ partyDamage: 2000 });
  assert.equal(r.event, "dungeon_cleared");
  assert.equal(session.completed, true);

  const rewards = r.rewards;
  assert.ok(rewards.gold >= 300 && rewards.gold <= 500);
  assert.equal(rewards.stones, 2);
  assert.ok(rewards.gemShard);
});
