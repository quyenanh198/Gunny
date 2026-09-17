import test from "node:test";
import assert from "node:assert/strict";
import { PartyService } from "../server/party.js";

test("party invite is target-bound, expires, and respects capacity", () => {
  let now = 1000;
  const parties = new PartyService({ now: () => now, inviteTtlMs: 100 });
  const party = parties.create("leader");
  const invite = parties.invite("leader", "member");
  assert.equal(parties.accept("stranger", invite.inviteId).error, "INVITE_INVALID");
  const joined = parties.accept("member", invite.inviteId);
  assert.equal(joined.id, party.id);
  assert.equal(joined.members.length, 2);
  assert.equal(parties.accept("member", invite.inviteId).error, "INVITE_INVALID");
  assert.equal(parties.invite("leader", "third").error, "PARTY_FULL");

  const expiring = new PartyService({ now: () => now, inviteTtlMs: 100 });
  expiring.create("other-leader");
  const expired = expiring.invite("other-leader", "late");
  now += 101;
  assert.equal(expiring.accept("late", expired.inviteId).error, "INVITE_INVALID");
});

test("only leader kicks and leader leave transfers ownership deterministically", () => {
  const parties = new PartyService({ now: () => 1000 });
  parties.create("leader");
  const invite = parties.invite("leader", "member");
  parties.accept("member", invite.inviteId);
  assert.equal(parties.kick("member", "leader").error, "LEADER_REQUIRED");
  const transferred = parties.leave("leader");
  assert.equal(transferred.leaderId, "member");
  assert.equal(parties.state("member").leaderId, "member");
  assert.deepEqual(parties.leave("member"), { disbanded: true });
});
