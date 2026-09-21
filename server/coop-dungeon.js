// Real-time Co-op Dungeon Matchmaking & Match Lifecycle (Milestone M36)
// Allows 1-4 players in a party or room to team up on Team 0 (Allies)
// to conquer the 3-stage PvE Dungeons against AI Minions and Bosses.

import { DUNGEON_TEMPLATES, DUNGEON_STAGES, DungeonSession } from "../src/core/dungeon.js";
import { mmoStore } from "./mmo-store.js";

export class CoopDungeonRoom {
  constructor({
    roomId,
    dungeonTemplateId = "ant_cavern",
    hostUser,
    mmoStoreInstance = mmoStore,
  } = {}) {
    this.roomId = roomId;
    this.template = DUNGEON_TEMPLATES.MECHA_CITADEL?.id === dungeonTemplateId
      ? DUNGEON_TEMPLATES.MECHA_CITADEL
      : DUNGEON_TEMPLATES.ANT_CAVERN;
    this.mmoStore = mmoStoreInstance;
    this.players = [];
    if (hostUser) this.addPlayer(hostUser);
    this.session = null;
    this.state = "lobby"; // lobby | in_progress | victory | defeated
    this.rewards = null;
  }

  // Add party member (max 4 players)
  addPlayer(user) {
    if (this.players.length >= 4) {
      return { success: false, reason: "Phòng phó bản đã đầy (tối đa 4 người)." };
    }
    if (this.players.some((p) => p.id === user.id)) {
      return { success: false, reason: "Người chơi đã có mặt trong phòng." };
    }
    const playerObj = {
      id: user.id,
      name: user.displayName || user.name || "Hiệp Sĩ",
      character: user.character || "mochi",
      weapon: user.weapon || "carrot",
      ready: user.host || false,
      host: user.host || (this.players.length === 0),
    };
    this.players.push(playerObj);
    return { success: true, players: this.players };
  }

  removePlayer(userId) {
    const idx = this.players.findIndex((p) => p.id === userId);
    if (idx !== -1) {
      const removed = this.players.splice(idx, 1)[0];
      if (removed.host && this.players.length > 0) {
        this.players[0].host = true;
      }
      return { success: true, removed };
    }
    return { success: false, reason: "Không tìm thấy người chơi." };
  }

  // Set ready status
  setReady(userId, ready = true) {
    const player = this.players.find((p) => p.id === userId);
    if (!player) return { success: false };
    player.ready = ready;
    return { success: true, player };
  }

  canStart() {
    return this.players.length >= 1 && this.players.every((p) => p.ready || p.host);
  }

  // Start the dungeon expedition
  start() {
    if (!this.canStart()) {
      return { success: false, reason: "Tất cả thành viên tổ đội phải bấm Sẵn sàng." };
    }

    this.session = new DungeonSession(this.template, {
      party: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        hp: 100,
        maxHp: 100,
      })),
    });

    this.state = "in_progress";
    return {
      success: true,
      stage: this.session.stage,
      stageTitle: this.session.stageTitle,
      party: this.session.party,
    };
  }

  // Execute a combat turn round in the co-op dungeon
  processTurn({ partyDamage = 0, enemyDamageDealt = 0 } = {}) {
    if (this.state !== "in_progress" || !this.session) {
      return { success: false, reason: "Phó bản chưa bắt đầu hoặc đã kết thúc." };
    }

    const turnResult = this.session.recordTurn({ partyDamage, enemyDamageDealt });

    if (turnResult.event === "stage_cleared") {
      return {
        event: "stage_cleared",
        stage: this.session.stage,
        stageTitle: this.session.stageTitle,
        party: this.session.party,
        message: `Vượt ải thành công! Trạm tiếp tế hồi phục +30% HP cho toàn đội. Tiến vào Ải ${this.session.stage}!`,
      };
    }

    if (turnResult.event === "dungeon_cleared") {
      this.state = "victory";
      this.rewards = turnResult.rewards;

      // Authoritative distribution of dungeon rewards to all party members
      for (const p of this.players) {
        this.mmoStore.recordDungeonClear(p.id, this.template.id, this.rewards);
      }

      return {
        event: "dungeon_cleared",
        state: "victory",
        rewards: this.rewards,
        message: "CHIẾN THẮNG HOÀNG GIA! Toàn bộ tổ đội nhận được rương báu phó bản!",
      };
    }

    if (turnResult.event === "dungeon_failed") {
      this.state = "defeated";
      return {
        event: "dungeon_failed",
        state: "defeated",
        reason: turnResult.reason,
      };
    }

    return {
      event: "turn_continue",
      stage: this.session.stage,
      stageTurn: this.session.stageTurn,
      party: this.session.party,
    };
  }

  // Get current room snapshot
  getSnapshot() {
    return {
      roomId: this.roomId,
      dungeonName: this.template.name,
      state: this.state,
      stage: this.session ? this.session.stage : 1,
      players: this.players,
      party: this.session ? this.session.party : [],
      rewards: this.rewards,
    };
  }
}

export class CoopDungeonManager {
  constructor(mmoStoreInstance = mmoStore) {
    this.rooms = new Map(); // roomId -> CoopDungeonRoom
    this.mmoStore = mmoStoreInstance;
  }

  createRoom({ roomId, dungeonTemplateId, hostUser }) {
    const id = roomId || `DUNG_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const room = new CoopDungeonRoom({
      roomId: id,
      dungeonTemplateId,
      hostUser,
      mmoStoreInstance: this.mmoStore,
    });
    this.rooms.set(id, room);
    return room;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId) || null;
  }

  removeRoom(roomId) {
    return this.rooms.delete(roomId);
  }

  listPublicRooms() {
    return [...this.rooms.values()]
      .filter((r) => r.state === "lobby")
      .map((r) => r.getSnapshot());
  }
}

export const coopDungeonManager = new CoopDungeonManager();

