import { randomUUID } from "node:crypto";

export class PartyService {
  constructor({ now = () => Date.now(), inviteTtlMs = 300000, maxMembers = 2 } = {}) {
    this.now = now; this.inviteTtlMs = inviteTtlMs; this.maxMembers = maxMembers;
    this.parties = new Map(); this.byUser = new Map(); this.invites = new Map();
  }
  create(userId) {
    const existing = this.partyOf(userId);
    if (existing) return this.public(existing);
    const party = { id: randomUUID(), leaderId: userId, members: [{ userId, joinedAt: this.now() }] };
    this.parties.set(party.id, party); this.byUser.set(userId, party.id); return this.public(party);
  }
  partyOf(userId) { return this.parties.get(this.byUser.get(userId)) || null; }
  state(userId) { const party = this.partyOf(userId); return party ? this.public(party) : null; }
  invite(leaderId, targetUserId) {
    const party = this.partyOf(leaderId);
    if (!party || party.leaderId !== leaderId) return { error: "LEADER_REQUIRED" };
    if (typeof targetUserId !== "string" || !targetUserId || targetUserId === leaderId || this.partyOf(targetUserId))
      return { error: "TARGET_UNAVAILABLE" };
    if (party.members.length >= this.maxMembers) return { error: "PARTY_FULL" };
    const invite = { id: randomUUID(), partyId: party.id, targetUserId, invitedBy: leaderId,
      expiresAt: this.now() + this.inviteTtlMs, status: "pending" };
    this.invites.set(invite.id, invite); return this.publicInvite(invite);
  }
  accept(userId, inviteId) {
    const invite = this.invites.get(inviteId);
    if (!invite || invite.targetUserId !== userId || invite.status !== "pending" || invite.expiresAt <= this.now())
      return { error: "INVITE_INVALID" };
    const party = this.parties.get(invite.partyId);
    if (!party || party.members.length >= this.maxMembers || this.partyOf(userId)) return { error: "PARTY_UNAVAILABLE" };
    invite.status = "accepted"; party.members.push({ userId, joinedAt: this.now() });
    this.byUser.set(userId, party.id); return this.public(party);
  }
  leave(userId) {
    const party = this.partyOf(userId); if (!party) return null;
    party.members = party.members.filter((member) => member.userId !== userId); this.byUser.delete(userId);
    if (!party.members.length) this.parties.delete(party.id);
    else if (party.leaderId === userId) party.leaderId = party.members[0].userId;
    return party.members.length ? this.public(party) : { disbanded: true };
  }
  kick(leaderId, targetUserId) {
    const party = this.partyOf(leaderId);
    if (!party || party.leaderId !== leaderId) return { error: "LEADER_REQUIRED" };
    if (targetUserId === leaderId || !party.members.some((member) => member.userId === targetUserId))
      return { error: "MEMBER_NOT_FOUND" };
    party.members = party.members.filter((member) => member.userId !== targetUserId);
    this.byUser.delete(targetUserId); return this.public(party);
  }
  public(party) { return { id: party.id, leaderId: party.leaderId,
    members: party.members.map((member) => ({ ...member })) }; }
  publicInvite(invite) { return { inviteId: invite.id, partyId: invite.partyId,
    targetUserId: invite.targetUserId, expiresAt: invite.expiresAt, status: invite.status }; }
}
