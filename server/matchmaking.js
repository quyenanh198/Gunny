import { randomUUID } from "node:crypto";
import { PROTOCOL_VERSION } from "../src/play/protocol.js";

export const MATCH_MODES = Object.freeze({ "casual-1v1": 1, "casual-2v2": 2 });
export const REGIONS = new Set(["na", "eu", "ap"]);

function chooseTickets(candidates, playersNeeded, chosen = [], index = 0) {
  const count = chosen.reduce((sum, ticket) => sum + ticket.userIds.length, 0);
  if (count === playersNeeded) return chosen;
  if (count > playersNeeded || index >= candidates.length) return null;
  return chooseTickets(candidates, playersNeeded, [...chosen, candidates[index]], index + 1) ||
    chooseTickets(candidates, playersNeeded, chosen, index + 1);
}

function assignTeams(tickets, teamSize, index = 0, teamZero = []) {
  const count = teamZero.reduce((sum, ticket) => sum + ticket.userIds.length, 0);
  if (count === teamSize) return new Set(teamZero);
  if (count > teamSize || index >= tickets.length) return null;
  return assignTeams(tickets, teamSize, index + 1, [...teamZero, tickets[index]]) ||
    assignTeams(tickets, teamSize, index + 1, teamZero);
}

export class MatchmakingQueue {
  constructor(roomManager, { now = () => Date.now(), widenAfterMs = 15000, ticketTtlMs = 120000 } = {}) {
    this.roomManager = roomManager; this.now = now; this.widenAfterMs = widenAfterMs;
    this.ticketTtlMs = ticketTtlMs; this.byUser = new Map();
  }
  valid(config) { return config.mode in MATCH_MODES && MATCH_MODES[config.mode] === config.teamSize &&
    REGIONS.has(config.region) && config.protocolVersion === PROTOCOL_VERSION; }
  enqueue(userId, config) { return this.enqueueGroup(userId, [userId], config); }
  enqueueGroup(ownerId, userIds, config) {
    userIds = [...new Set(userIds)];
    if (!this.valid(config) || !userIds.length || userIds.length > config.teamSize) return { error: "INVALID_QUEUE" };
    const existing = userIds.map((id) => this.byUser.get(id))
      .filter((ticket) => ticket && ticket.status !== "cancelled" && !this.expired(ticket));
    if (existing.length) {
      if (existing.length === userIds.length && existing.every((ticket) => ticket === existing[0]))
        return this.public(existing[0], ownerId);
      return { error: "ALREADY_QUEUED" };
    }
    const ticket = { id: randomUUID(), ownerId, userIds, ...config, status: "queued", queuedAt: this.now(),
      roomId: null, matchedRegion: null, teams: null };
    for (const id of userIds) this.byUser.set(id, ticket);
    this.match(); return this.public(ticket, ownerId);
  }
  compatible(a, b, now) { return a.mode === b.mode && a.teamSize === b.teamSize &&
    a.protocolVersion === b.protocolVersion && (a.region === b.region ||
      (now - a.queuedAt >= this.widenAfterMs && now - b.queuedAt >= this.widenAfterMs)); }
  match() {
    const now = this.now(); this.prune(now);
    const queued = [...new Set(this.byUser.values())].filter((ticket) => ticket.status === "queued")
      .sort((a, b) => a.queuedAt - b.queuedAt);
    while (queued.length) {
      const seed = queued.shift();
      const selected = chooseTickets(queued.filter((ticket) => this.compatible(seed, ticket, now)),
        seed.teamSize * 2 - seed.userIds.length);
      if (!selected) continue;
      const group = [seed, ...selected];
      const teamZero = assignTeams(group, seed.teamSize);
      if (!teamZero) continue;
      for (const ticket of selected) queued.splice(queued.indexOf(ticket), 1);
      const teams = new Map();
      for (const ticket of group) for (const userId of ticket.userIds) teams.set(userId, teamZero.has(ticket) ? 0 : 1);
      const userIds = group.flatMap((ticket) => ticket.userIds);
      const room = this.roomManager.create("private", { reservedUserIds: userIds, reservedTeams: teams });
      const regions = new Set(group.map((ticket) => ticket.region));
      for (const ticket of group) Object.assign(ticket, { status: "matched", roomId: room.id,
        matchedRegion: regions.size === 1 ? ticket.region : "global", matchedAt: now, teams });
    }
  }
  status(userId) { this.match(); const ticket = this.byUser.get(userId);
    return ticket && !this.expired(ticket) ? this.public(ticket, userId) : null; }
  cancel(userId) { const ticket = this.byUser.get(userId);
    if (!ticket || ticket.status !== "queued" || ticket.ownerId !== userId) return false;
    ticket.status = "cancelled"; return true; }
  active(userId) { const ticket = this.byUser.get(userId); return !!ticket && ["queued", "matched"].includes(ticket.status); }
  expired(ticket, now = this.now()) { return ticket.status !== "queued" &&
    now - (ticket.matchedAt || ticket.queuedAt) > this.ticketTtlMs; }
  prune(now = this.now()) { for (const [userId, ticket] of this.byUser)
    if (this.expired(ticket, now)) this.byUser.delete(userId); }
  public(ticket, userId) { return { ticketId: ticket.id, status: ticket.status, mode: ticket.mode,
    region: ticket.region, teamSize: ticket.teamSize, protocolVersion: ticket.protocolVersion,
    queuedAt: ticket.queuedAt, roomId: ticket.roomId, matchedRegion: ticket.matchedRegion,
    assignedTeam: ticket.teams?.get(userId) ?? null, partySize: ticket.userIds.length }; }
}
