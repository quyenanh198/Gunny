import { randomBytes, randomUUID } from "node:crypto";

export class MemoryIdentityStore {
  constructor() { this.sessions = new Map(); }
  async createGuest(displayName = "Guest") {
    const session = { token: randomBytes(32).toString("base64url"),
      expiresAt: new Date(Date.now() + 86400000).toISOString(), user: { id: randomUUID(), kind: "guest" },
      profile: { displayName, version: 1 } };
    this.sessions.set(session.token, session);
    return session;
  }
  async authenticate(token) { return this.sessions.get(token) || null; }
  async rotate(token) {
    const current = this.sessions.get(token);
    if (!current) return null;
    this.sessions.delete(token);
    const next = { ...current, token: randomBytes(32).toString("base64url") };
    this.sessions.set(next.token, next);
    return next;
  }
  async updateProfile(token, { displayName, expectedVersion }) {
    const session = this.sessions.get(token);
    if (!session || session.profile.version !== expectedVersion) return null;
    session.profile = { displayName, version: expectedVersion + 1 };
    return session.profile;
  }
  async listMatches() { return []; }
}
