import { randomUUID } from "node:crypto";

const CATEGORIES = new Set(["chat", "cheating", "harassment", "afk", "other"]);
const DEFAULT_TERMS = ["fuck", "shit", "địt", "đụ", "dm"];
const pair = (a, b) => `${a}:${b}`;

export class SocialSafety {
  // `loaded`/`blocks`/`mutes` cache users who have connected or enqueued.
  // Cache is reset when idle (no active connections or queue) via resetIfIdle()
  // to prevent long-running memory leaks without risking privacy regressions.
  constructor(store, { profanityTerms = DEFAULT_TERMS } = {}) {
    this.store = store; this.blocks = new Set(); this.mutes = new Set(); this.loaded = new Set();
    this.profanity = profanityTerms.map((term) => new RegExp(`(^|\\s)${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`, "giu"));
  }
  resetIfIdle() {
    this.blocks.clear();
    this.mutes.clear();
    this.loaded.clear();
  }
  async load(userId) {
    if (!userId || this.loaded.has(userId)) return;
    const data = await this.store.loadSocial(userId);
    for (const [blocker, blocked] of data.blocks) this.blocks.add(pair(blocker, blocked));
    for (const muted of data.mutes) this.mutes.add(pair(userId, muted));
    this.loaded.add(userId);
  }
  blocked(a, b) { return !!a && !!b && (this.blocks.has(pair(a, b)) || this.blocks.has(pair(b, a))); }
  canInteract(a, b) { return a !== b && !this.blocked(a, b); }
  canMatchGroups(a, b) { return a.every((left) => b.every((right) => this.canInteract(left, right))); }
  canView(viewer, sender) { return !viewer || viewer === sender ||
    (!this.blocked(viewer, sender) && !this.mutes.has(pair(viewer, sender))); }
  async setBlock(userId, targetId, enabled) {
    if (!targetId || targetId === userId) return false;
    await this.store.setBlock(userId, targetId, enabled);
    if (enabled) this.blocks.add(pair(userId, targetId)); else this.blocks.delete(pair(userId, targetId));
    return true;
  }
  async setMute(userId, targetId, enabled) {
    if (!targetId || targetId === userId) return false;
    await this.store.setMute(userId, targetId, enabled);
    if (enabled) this.mutes.add(pair(userId, targetId)); else this.mutes.delete(pair(userId, targetId));
    return true;
  }
  sanitize(text) {
    let clean = text.trim().replace(/\s+/g, " ");
    for (const expression of this.profanity) clean = clean.replace(expression,
      (match, prefix) => `${prefix}${"*".repeat(match.trim().length)}`);
    return clean;
  }
  async recordChat(roomId, senderId, text, id = randomUUID()) {
    const message = { id, roomId, senderId, text: this.sanitize(text), at: Date.now() };
    await this.store.recordChat(message);
    return message;
  }
  async report(reporterId, { targetId, roomId = null, category, details = "" }) {
    if (!targetId || targetId === reporterId || !CATEGORIES.has(category) ||
        typeof details !== "string" || details.length > 500) return null;
    const report = { id: randomUUID(), reporterId, targetId, roomId,
      category, details: details.trim(), status: "open", createdAt: new Date().toISOString() };
    await this.store.createReport(report);
    return report;
  }
}
