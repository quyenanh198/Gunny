// Tests for Real-time Co-op Dungeon Matchmaking & Session Lifecycle (Milestone M36)
import test from "node:test";
import assert from "node:assert/strict";
import { CoopDungeonManager, CoopDungeonRoom } from "../server/coop-dungeon.js";
import { MmoStore } from "../server/mmo-store.js";

test("CoopDungeonRoom handles party formation, capacity, and ready check", () => {
  const store = new MmoStore();
  const room = new CoopDungeonRoom({
    roomId: "ROOM_COOP_1",
    hostUser: { id: "user_1", name: "Chủ Phòng" },
    mmoStoreInstance: store,
  });

  assert.equal(room.players.length, 1);
  assert.equal(room.players[0].host, true);

  // Add 3 more players
  assert.equal(room.addPlayer({ id: "user_2", name: "Xạ Thủ 2" }).success, true);
  assert.equal(room.addPlayer({ id: "user_3", name: "Xạ Thủ 3" }).success, true);
  assert.equal(room.addPlayer({ id: "user_4", name: "Xạ Thủ 4" }).success, true);
  assert.equal(room.players.length, 4);

  // 5th player must be rejected
  const overflow = room.addPlayer({ id: "user_5", name: "Xạ Thủ 5" });
  assert.equal(overflow.success, false);
  assert.match(overflow.reason, /đã đầy/);

  // Ready check
  assert.equal(room.canStart(), false); // other 3 not ready
  room.setReady("user_2", true);
  room.setReady("user_3", true);
  room.setReady("user_4", true);
  assert.equal(room.canStart(), true);
});

test("CoopDungeonRoom runs multi-stage expedition and awards authoritative loot", () => {
  const store = new MmoStore();
  const room = new CoopDungeonRoom({
    roomId: "ROOM_COOP_2",
    hostUser: { id: "user_alpha", name: "Alpha" },
    mmoStoreInstance: store,
  });
  room.addPlayer({ id: "user_beta", name: "Beta" });
  room.setReady("user_beta", true);

  // Start expedition
  const startResult = room.start();
  assert.equal(startResult.success, true);
  assert.equal(room.state, "in_progress");
  assert.equal(startResult.stage, 1);

  // Stage 1: Deal enough damage to wipe minions
  const s1Result = room.processTurn({ partyDamage: 400, enemyDamageDealt: 20 });
  assert.equal(s1Result.event, "stage_cleared");
  assert.equal(s1Result.stage, 2);
  assert.match(s1Result.message, /Vượt ải thành công/);

  // Stage 2: Survive hazard arena
  const s2Result = room.processTurn({ partyDamage: 200, enemyDamageDealt: 10 });
  assert.equal(s2Result.event, "stage_cleared");
  assert.equal(s2Result.stage, 3);

  // Stage 3: Defeat Boss
  const s3Result = room.processTurn({ partyDamage: 2500, enemyDamageDealt: 0 });
  assert.equal(s3Result.event, "dungeon_cleared");
  assert.equal(room.state, "victory");
  assert.ok(s3Result.rewards.gold > 0);

  // Verify authoritative loot was credited to both players in mmoStore
  const alphaProfile = store.getProfile("user_alpha");
  const betaProfile = store.getProfile("user_beta");
  assert.ok(alphaProfile.wallet.gold > 500); // started at 500
  assert.ok(betaProfile.wallet.gold > 500);
});

test("CoopDungeonManager creates and lists public rooms", () => {
  const manager = new CoopDungeonManager();
  const r1 = manager.createRoom({
    dungeonTemplateId: "ant_cavern",
    hostUser: { id: "u1", name: "Leader" },
  });

  const list = manager.listPublicRooms();
  assert.equal(list.length, 1);
  assert.equal(list[0].dungeonName, "Huyệt Kiến Ma Cổ Đại");

  manager.removeRoom(r1.roomId);
  assert.equal(manager.listPublicRooms().length, 0);
});

