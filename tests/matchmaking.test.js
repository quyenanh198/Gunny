import test from "node:test";
import assert from "node:assert/strict";
import { MatchmakingQueue } from "../server/matchmaking.js";
import { PROTOCOL_VERSION } from "../src/play/protocol.js";

const request = (overrides = {}) => ({ mode: "casual-1v1", region: "ap", teamSize: 1,
  protocolVersion: PROTOCOL_VERSION, ...overrides });
const manager = () => ({ created: [], create(visibility, options) {
  const room = { id: `ROOM${this.created.length + 1}`.padEnd(6, "X"), visibility, ...options };
  this.created.push(room);
  return room;
} });

test("queue matches exact mode, region, team size and protocol", () => {
  const rooms = manager();
  const queue = new MatchmakingQueue(rooms, { now: () => 1000 });
  const first = queue.enqueue("u1", request());
  assert.equal(first.status, "queued");
  assert.equal(queue.enqueue("u1", request()).ticketId, first.ticketId, "enqueue is idempotent per user");
  assert.equal(queue.enqueue("wrong-mode", request({ mode: "ranked-1v1" })).error, "INVALID_QUEUE");
  assert.equal(queue.enqueue("wrong-version", request({ protocolVersion: PROTOCOL_VERSION + 1 })).error, "INVALID_QUEUE");
  assert.equal(queue.enqueue("u2", request({ region: "eu" })).status, "queued");
  assert.equal(rooms.created.length, 0);
  assert.equal(queue.enqueue("u3", request()).status, "matched");
  assert.equal(queue.status("u1").roomId, queue.status("u3").roomId);
  assert.deepEqual(new Set(rooms.created[0].reservedUserIds), new Set(["u1", "u3"]));
});

test("queue widens region only after the controlled timeout", () => {
  let now = 0;
  const rooms = manager();
  const queue = new MatchmakingQueue(rooms, { now: () => now, widenAfterMs: 15000 });
  queue.enqueue("ap-player", request({ region: "ap" }));
  queue.enqueue("eu-player", request({ region: "eu" }));
  now = 14999;
  assert.equal(queue.status("ap-player").status, "queued");
  now = 15000;
  assert.equal(queue.status("ap-player").status, "matched");
  assert.equal(queue.status("eu-player").matchedRegion, "global");
});

test("2v2 waits for four identities and queued tickets can be cancelled", () => {
  const rooms = manager();
  const queue = new MatchmakingQueue(rooms, { now: () => 1000 });
  const config = request({ mode: "casual-2v2", teamSize: 2 });
  queue.enqueue("u1", config);
  queue.enqueue("u2", config);
  queue.enqueue("u3", config);
  assert.equal(rooms.created.length, 0);
  assert.equal(queue.cancel("u3"), true);
  assert.equal(queue.cancel("u3"), false);
  assert.notEqual(queue.enqueue("u3", config).status, "cancelled", "a cancelled user can queue again");
  queue.cancel("u3");
  queue.enqueue("u4", config);
  assert.equal(rooms.created.length, 0);
  queue.enqueue("u5", config);
  assert.equal(rooms.created.length, 1);
  assert.equal(rooms.created[0].reservedUserIds.length, 4);
});

test("party tickets stay atomic and receive one reserved team", () => {
  const rooms = manager();
  const queue = new MatchmakingQueue(rooms, { now: () => 1000 });
  const config = request({ mode: "casual-2v2", teamSize: 2 });
  assert.equal(queue.enqueueGroup("leader-a", ["leader-a", "member-a"], config).status, "queued");
  assert.equal(queue.enqueueGroup("leader-b", ["leader-b", "member-b"], config).status, "matched");
  const first = queue.status("leader-a");
  const member = queue.status("member-a");
  const opponent = queue.status("leader-b");
  assert.equal(first.roomId, opponent.roomId);
  assert.equal(first.assignedTeam, member.assignedTeam);
  assert.notEqual(first.assignedTeam, opponent.assignedTeam);
  assert.equal(first.partySize, 2);
  assert.equal(queue.cancel("member-a"), false, "only the ticket owner can cancel a party queue");
});
