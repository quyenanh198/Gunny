import { randomUUID } from "node:crypto";
import { PROTOCOL_VERSION } from "../src/play/protocol.js";

export const MATCH_MODES = Object.freeze({
  "casual-1v1": 1,
  "casual-2v2": 2,
});
export const REGIONS = new Set(["na", "eu", "ap"]);

export class MatchmakingQueue {
  constructor(roomManager, { now = () => Date.now(), widenAfterMs = 15000, ticketTtlMs = 120000 } = {}) {
    this.roomManager = roomManager;
    this.now = now;
    this.widenAfterMs = widenAfterMs;
    this.ticketTtlMs = ticketTtlMs;
    this.byUser = new Map();
  }

  enqueue(userId, { mode, region, teamSize, protocolVersion }) {
    if (!(mode in MATCH_MODES) || MATCH_MODES[mode] !== teamSize || !REGIONS.has(region) ||
        protocolVersion !== PROTOCOL_VERSION) return { error: "INVALID_QUEUE" };
    const existing = this.byUser.get(userId);
    if (existing && existing.status !== "cancelled" && !this.expired(existing)) return this.public(existing);
    const ticket = { id: randomUUID(), userId, mode, region, teamSize, protocolVersion,
      status: "queued", queuedAt: this.now(), roomId: null, matchedRegion: null };
    this.byUser.set(userId, ticket);
    this.match();
    return this.public(ticket);
  }

  compatible(a, b, now) {
    if (a.mode !== b.mode || a.teamSize !== b.teamSize || a.protocolVersion !== b.protocolVersion) return false;
    return a.region === b.region || (now - a.queuedAt >= this.widenAfterMs && now - b.queuedAt >= this.widenAfterMs);
  }

  match() {
    const now = this.now();
    this.prune(now);
    const queued = [...this.byUser.values()].filter((ticket) => ticket.status === "queued")
      .sort((a, b) => a.queuedAt - b.queuedAt);
    while (queued.length) {
      const seed = queued.shift();
      const needed = seed.teamSize * 2 - 1;
      const candidates = queued.filter((ticket) => this.compatible(seed, ticket, now)).slice(0, needed);
      if (candidates.length !== needed) continue;
      const group = [seed, ...candidates];
      for (const ticket of candidates) queued.splice(queued.indexOf(ticket), 1);
      const regions = new Set(group.map((ticket) => ticket.region));
      const room = this.roomManager.create("private", { reservedUserIds: group.map((ticket) => ticket.userId) });
      for (const ticket of group) {
        ticket.status = "matched";
        ticket.roomId = room.id;
        ticket.matchedRegion = regions.size === 1 ? ticket.region : "global";
        ticket.matchedAt = now;
      }
    }
  }

  status(userId) {
    this.match();
    const ticket = this.byUser.get(userId);
    return ticket && !this.expired(ticket) ? this.public(ticket) : null;
  }

  cancel(userId) {
    const ticket = this.byUser.get(userId);
    if (!ticket || ticket.status !== "queued") return false;
    ticket.status = "cancelled";
    return true;
  }

  expired(ticket, now = this.now()) {
    return ticket.status !== "queued" && now - (ticket.matchedAt || ticket.queuedAt) > this.ticketTtlMs;
  }

  prune(now = this.now()) {
    for (const [userId, ticket] of this.byUser) if (this.expired(ticket, now)) this.byUser.delete(userId);
  }

  public(ticket) {
    return { ticketId: ticket.id, status: ticket.status, mode: ticket.mode, region: ticket.region,
      teamSize: ticket.teamSize, protocolVersion: ticket.protocolVersion, queuedAt: ticket.queuedAt,
      roomId: ticket.roomId, matchedRegion: ticket.matchedRegion };
  }
}
