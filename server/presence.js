export class PresenceService {
  constructor({ now = () => Date.now() } = {}) { this.now = now; this.states = new Map(); }
  set(userId, state, details = {}) {
    if (!userId) return;
    this.states.set(userId, { userId, state, roomId: details.roomId || null,
      role: details.role || null, reconnectUntil: details.reconnectUntil || null, updatedAt: this.now() });
  }
  get(userId) {
    const presence = this.states.get(userId);
    if (presence?.state === "reconnecting" && presence.reconnectUntil <= this.now()) {
      this.set(userId, "offline");
      return this.states.get(userId);
    }
    return presence || { userId, state: "offline", roomId: null, role: null, reconnectUntil: null, updatedAt: null };
  }
  clear(userId) { if (userId) this.states.delete(userId); }
}
