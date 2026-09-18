import { randomUUID } from "node:crypto";

const CATEGORIES = new Set(["chat", "cheating", "harassment", "afk", "other"]);
const DEFAULT_TERMS = ["fuck", "shit", "địt", "đụ", "dm"];
const pair = (a, b) => `${a}:${b}`;

export class SocialSafety {
  // `loaded`/`blocks`/`mutes` cache every user who has ever connected or
  // enqueued, for the life of the process, with no eviction. Known
  // long-running leak (flagged in a code-review audit, not fixed here): a
  // pair like "A:B" can be populated by either A's or B's load(), so
  // evicting one user's entries without knowing whether the other side is
  // still cached risks silently un-blocking them for whichever user stays
  // connected — a privacy/harassment regression that would be worse than
  // the leak. A correct fix needs per-user reference counting or a
  // full-cache reset gated on "no one currently connected", not a quick
  // patch. Low severity in practice (bounded by distinct users ever seen,
  // not by messages/connections), but real on a server kept up for weeks.
  constructor(store, { profanityTerms = DEFAULT_TERMS } = {}) {
    this.store = store; this.blocks = new Set(); this.mutes = new Set(); this.loaded = new Set();
    this.profanity = profanityTerms.map((term) => new RegExp(`(^|\\s)${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$)`, "giu"));
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
