import { Room } from "./room.js";

export function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

export class RoomManager {
  constructor({ matchLifecycle = null } = {}) {
    this.rooms = new Map();
    this.matchLifecycle = matchLifecycle;
  }

  newCode() {
    let code = "";
    for (let i = 0; i < 6; i++) code += "ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 24)];
    return this.rooms.has(code) ? this.newCode() : code;
  }

  create(visibility = "private", { reservedUserIds = [], reservedTeams = new Map(), allowSpectators = true } = {}) {
    const id = this.newCode();
    const room = new Room(id, (roomId) => this.rooms.delete(roomId), visibility, this.matchLifecycle);
    room.reservedUserIds = new Set(reservedUserIds);
    room.reservedTeams = new Map(reservedTeams);
    room.allowSpectators = allowSpectators;
    room.expectedPlayerCount = reservedUserIds.length || 0;
    if (room.expectedPlayerCount) room.bots = [0, 0];
    this.rooms.set(id, room);
    return room;
  }

  get(id) {
    return this.rooms.get(id) || null;
  }

  quickJoin() {
    return [...this.rooms.values()].find((room) =>
      room.visibility === "public" && room.state === "lobby" && room.canJoin("player"),
    ) || null;
  }

  metrics() {
    const rooms = [...this.rooms.values()];
    const drift = rooms.flatMap((room) => room.tickDriftSamples);
    return {
      rooms: rooms.length,
      activeConnections: rooms.reduce((sum, room) => sum + [...room.clients].filter((client) => client.connected).length, 0),
      tickDrift: Math.max(0, ...rooms.map((room) => room.maxTickDrift)),
      tickDriftP50: percentile(drift, 0.5),
      tickDriftP95: percentile(drift, 0.95),
      tickDriftP99: percentile(drift, 0.99),
      heapUsedBytes: process.memoryUsage().heapUsed,
      snapshotBytes: rooms.reduce((sum, room) => sum + room.snapshotBytes, 0),
      rejectedMessages: rooms.reduce((sum, room) => sum + room.rejectedMessages, 0),
      reconnects: rooms.reduce((sum, room) => sum + room.reconnects, 0),
      slowConsumerDrops: rooms.reduce((sum, room) => sum + room.slowConsumerDrops, 0),
      slowConsumerCloses: rooms.reduce((sum, room) => sum + room.slowConsumerCloses, 0),
    };
  }

  close() {
    for (const room of this.rooms.values()) clearInterval(room.timer);
    this.rooms.clear();
  }

  list() {
    return [...this.rooms.values()].filter((room) => room.visibility === "public").map((room) => ({
      id: room.id,
      state: room.state,
      players: [...room.clients].filter((client) => client.role === "player").length,
      spectators: room.spectatorCount(),
      teams: [room.teamSize(0), room.teamSize(1)],
      map: room.map,
    }));
  }
}
