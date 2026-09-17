import test from "node:test";
import assert from "node:assert/strict";
import { Room } from "../server/room.js";
import { MemoryIdentityStore } from "../server/memory-identity-store.js";

const player = (id, team) => ({ id, userId: `user-${id}`, ws: { readyState: 0 }, connected: true,
  disconnectedAt: 0, reconnectToken: `token-${id}`, lastAckSeq: 0, team, ready: true, host: id === 1,
  character: "mochi", weapon: "carrot", name: `P${id}`, terrainVersion: -1, role: "player" });

test("authoritative room finalizes one result with participant disconnect outcome", async () => {
  const store = new MemoryIdentityStore();
  const room = new Room("ABC123", () => {}, "private", store);
  const first = player(1, 0);
  const second = player(2, 1);
  try {
    room.join(first);
    room.join(second);
    first.team = 0; second.team = 1;
    room.bots = [0, 0];
    assert.equal(room.start(), true);
    second.connected = false;
    room.match.actors.find((actor) => actor.team === 1).hp = 0;
    room.match.phase = "over";
    room.tick();
    assert.equal((await room.matchRecord.finish).applied, true);
    const stored = store.matches.get(room.matchRecord.id);
    assert.equal(stored.status, "completed");
    assert.equal(stored.summary.winnerTeam, 0);
    assert.equal(stored.participants.find((item) => item.userId === first.userId).outcome, "win");
    assert.equal(stored.participants.find((item) => item.userId === second.userId).disconnected, true);
    assert.deepEqual(await store.completeMatch(stored), { applied: false });
  } finally { room.close(); }
});
