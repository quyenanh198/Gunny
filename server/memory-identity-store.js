import { randomBytes, randomUUID } from "node:crypto";

export class MemoryIdentityStore {
  constructor() { this.sessions = new Map(); this.matches = new Map(); }
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
  async recordConsent(token) {
    const session = this.sessions.get(token);
    if (!session) return null;
    session.privacyConsentAt ||= new Date().toISOString();
    return session.privacyConsentAt;
  }
  async revoke(token) { return this.sessions.delete(token); }
  async exportUser(token) {
    const session = this.sessions.get(token);
    return session ? { exportedAt: new Date().toISOString(), user: session.user, profile: session.profile, matches: [] } : null;
  }
  async deleteUser(token) { return this.sessions.delete(token); }
  async abandonStaleMatches() { return 0; }
  async beginMatch(match) {
    if (this.matches.has(match.id)) return { applied: false };
    this.matches.set(match.id, { ...match, status: "playing" });
    return { applied: true, matchId: match.id };
  }
  async completeMatch(result) {
    const match = this.matches.get(result.id);
    if (!match || match.status !== "playing" || [...this.matches.values()].some((item) => item.resultKey === result.resultKey))
      return { applied: false };
    Object.assign(match, result);
    return { applied: true, matchId: result.id };
  }
}
