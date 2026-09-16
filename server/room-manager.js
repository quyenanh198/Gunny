import { Room } from "./room.js";

export class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  newCode() {
    let code = "";
    for (let i = 0; i < 4; i++) code += "ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 24)];
    return this.rooms.has(code) ? this.newCode() : code;
  }

  getOrCreate(wanted) {
    const id = wanted && this.rooms.has(wanted) ? wanted : wanted || this.newCode();
    if (!this.rooms.has(id)) this.rooms.set(id, new Room(id, (roomId) => this.rooms.delete(roomId)));
    return this.rooms.get(id);
  }

  get(id) {
    return this.rooms.get(id) || null;
  }

  quickJoin() {
    return [...this.rooms.values()].find((room) =>
      room.state === "lobby" && [...room.clients].filter((client) => client.connected && client.team !== null).length < 6,
    ) || null;
  }

  metrics() {
    const rooms = [...this.rooms.values()];
    return {
      rooms: rooms.length,
      activeConnections: rooms.reduce((sum, room) => sum + [...room.clients].filter((client) => client.connected).length, 0),
      tickDrift: Math.max(0, ...rooms.map((room) => room.maxTickDrift)),
      snapshotBytes: rooms.reduce((sum, room) => sum + room.snapshotBytes, 0),
      rejectedMessages: rooms.reduce((sum, room) => sum + room.rejectedMessages, 0),
      reconnects: rooms.reduce((sum, room) => sum + room.reconnects, 0),
    };
  }

  close() {
    for (const room of this.rooms.values()) clearInterval(room.timer);
    this.rooms.clear();
  }

  list() {
    return [...this.rooms.values()].map((room) => ({
      id: room.id,
      state: room.state,
      players: room.clients.size,
      teams: [room.teamSize(0), room.teamSize(1)],
      map: room.map,
    }));
  }
}
