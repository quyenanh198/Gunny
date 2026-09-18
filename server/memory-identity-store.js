import { randomBytes, randomUUID } from "node:crypto";
import { rewardFor, levelForXp } from "./economy.js";

export class MemoryIdentityStore {
  constructor() { this.sessions = new Map(); this.matches = new Map(); this.blocks = new Set();
    this.mutes = new Set(); this.reports = []; this.chatMessages = []; this.ledger = [];
    this.progression = new Map(); this.roles = new Map(); this.sanctions = []; this.adminActions = [];
    this.feedback = []; }
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
    for (const participant of result.participants || []) {
      const reward = rewardFor(participant, result.status);
      const requestId = `match:${result.id}:${participant.userId}`;
      if (this.ledger.some((entry) => entry.userId === participant.userId && entry.requestId === requestId)) continue;
      if (reward.currency) this.ledger.push({ id: randomUUID(), userId: participant.userId, amount: reward.currency,
        reason: `match_${participant.outcome}`, requestId, matchId: result.id, createdAt: new Date().toISOString() });
      if (reward.xp) {
        const progress = this.progression.get(participant.userId) || { xp: 0, level: 1 };
        progress.xp += reward.xp;
        progress.level = levelForXp(progress.xp);
        this.progression.set(participant.userId, progress);
      }
    }
    return { applied: true, matchId: result.id };
  }
  async loadSocial(userId) { return { blocks: [...this.blocks].map((key) => key.split(":"))
    .filter(([a, b]) => a === userId || b === userId),
  mutes: [...this.mutes].map((key) => key.split(":")).filter(([a]) => a === userId).map(([, b]) => b) }; }
  async setBlock(userId, targetId, enabled) { const key = `${userId}:${targetId}`;
    if (enabled) this.blocks.add(key); else this.blocks.delete(key); }
  async setMute(userId, targetId, enabled) { const key = `${userId}:${targetId}`;
    if (enabled) this.mutes.add(key); else this.mutes.delete(key); }
  async createReport(report) { this.reports.push(report); }
  // The memory store has no expiry job (pruneExpiredChat is a no-op below,
  // since there is no real retention window to enforce), so cap the buffer
  // itself — otherwise a long-running process without DATABASE_URL leaks
  // memory here without bound.
  async recordChat(message) {
    this.chatMessages.push(message);
    if (this.chatMessages.length > 1000) this.chatMessages = this.chatMessages.slice(-1000);
  }
  async listOpenReports(limit = 100) {
    return this.reports.filter((report) => report.status === "open" || report.status === "reviewing").slice(0, limit);
  }
  async updateReportStatus(id, status) {
    const report = this.reports.find((item) => item.id === id && item.status !== "closed");
    if (!report) return null;
    report.status = status;
    return report;
  }
  async pruneExpiredChat() { return 0; }
  walletBalanceOf(userId) { return this.ledger.filter((e) => e.userId === userId).reduce((sum, e) => sum + e.amount, 0); }
  async getWallet(token) {
    const session = this.sessions.get(token);
    return session ? { balance: this.walletBalanceOf(session.user.id) } : null;
  }
  async getLedger(token, limit = 50) {
    const session = this.sessions.get(token);
    if (!session) return null;
    return this.ledger.filter((e) => e.userId === session.user.id).slice(-limit).reverse()
      .map((e) => ({ id: e.id, amount: e.amount, reason: e.reason, matchId: e.matchId, createdAt: e.createdAt }));
  }
  async getProgression(token) {
    const session = this.sessions.get(token);
    if (!session) return null;
    return this.progression.get(session.user.id) || { xp: 0, level: 1 };
  }

  // --- Admin RBAC, sanctions and audit (R6) ---------------------------------

  async getAdminSession(token) {
    const session = this.sessions.get(token);
    return session && this.roles.get(session.user.id) === "admin" ? session : null;
  }
  async setUserRole(userId, role) { this.roles.set(userId, role); }
  async createSanction({ userId, type, reason, issuedBy, expiresAt = null }) {
    const sanction = { id: randomUUID(), userId, type, reason, status: type === "ban" ? "pending_confirmation" : "active",
      issuedBy, confirmedBy: null, revokedBy: null, expiresAt, createdAt: new Date().toISOString(), revokedAt: null };
    this.sanctions.push(sanction);
    return sanction;
  }
  async confirmSanction(id, confirmedBy) {
    const sanction = this.sanctions.find((s) => s.id === id && s.status === "pending_confirmation" && s.issuedBy !== confirmedBy);
    if (!sanction) return null;
    sanction.status = "active"; sanction.confirmedBy = confirmedBy;
    return sanction;
  }
  async revokeSanction(id, revokedBy) {
    const sanction = this.sanctions.find((s) => s.id === id && ["active", "pending_confirmation"].includes(s.status));
    if (!sanction) return null;
    sanction.status = "revoked"; sanction.revokedBy = revokedBy; sanction.revokedAt = new Date().toISOString();
    return sanction;
  }
  async listSanctions(userId) {
    return this.sanctions.filter((s) => s.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  activeSanction(userId, type) {
    const now = Date.now();
    return this.sanctions.some((s) => s.userId === userId && s.type === type && s.status === "active" &&
      (!s.expiresAt || new Date(s.expiresAt).getTime() > now));
  }
  async isBanned(userId) { return this.activeSanction(userId, "ban"); }
  async isMuted(userId) { return this.activeSanction(userId, "mute"); }
  async recordAdminAction(entry) {
    const record = { id: randomUUID(), createdAt: new Date().toISOString(), ...entry };
    this.adminActions.push(record);
    return record;
  }
  async listAdminActions(limit = 100) { return this.adminActions.slice(-limit).reverse(); }
  async createFeedback({ userId, category, message, context = null }) {
    const record = { id: randomUUID(), userId, category, message, context, createdAt: new Date().toISOString() };
    this.feedback.push(record);
    return record;
  }
  async listFeedback(limit = 100) { return this.feedback.slice(-limit).reverse(); }
  async getMatchStats() {
    const matches = [...this.matches.values()];
    const total = matches.length;
    const completed = matches.filter((match) => match.status === "completed").length;
    const abandoned = matches.filter((match) => match.status === "abandoned").length;
    const playing = matches.filter((match) => match.status === "playing").length;
    return { total, completed, abandoned, playing, completionRate: total ? +(completed / total).toFixed(3) : null };
  }
  async lookupUser(userId) {
    const session = [...this.sessions.values()].find((s) => s.user.id === userId);
    if (!session) return null;
    return {
      user: { id: session.user.id, kind: session.user.kind, role: this.roles.get(userId) || "player" },
      wallet: { balance: this.walletBalanceOf(userId) },
      progression: this.progression.get(userId) || { xp: 0, level: 1 },
      recentMatches: [...this.matches.values()].filter((m) => (m.participants || []).some((p) => p.userId === userId)).slice(-10),
      sanctions: await this.listSanctions(userId),
    };
  }
}
