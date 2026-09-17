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
    room.remove(second);
    second.connected = true;
    room.match.actors.find((actor) => actor.team === 1).hp = 0;
    room.match.phase = "over";
    room.tick();
    assert.equal((await room.matchRecord.finish).applied, true);
    const stored = store.matches.get(room.matchRecord.id);
    assert.equal(stored.status, "completed");
    assert.equal(stored.summary.winnerTeam, 0);
    assert.equal(stored.participants.find((item) => item.userId === first.userId).outcome, "win");
    assert.equal(stored.participants.find((item) => item.userId === second.userId).disconnected, true);
    assert.deepEqual(stored.summary.leavers, [second.userId]);
    assert.deepEqual(await store.completeMatch(stored), { applied: false });
  } finally { room.close(); }
});

test("two disconnected AFK turns forfeit the actor and set sticky leaver state", () => {
  const room = new Room("AFK123", () => {});
  const first = player(1, 0);
  const second = player(2, 1);
  try {
    room.join(first); room.join(second);
    first.team = 0; second.team = 1; room.bots = [0, 0];
    assert.equal(room.start(), true);
    first.connected = false;
    for (let strike = 0; strike < 2; strike++) {
      room.match.turn = 0;
      room.match.phase = "aim";
      room.idleSeat = 31;
      room.acc = 1 / 60;
      room.last = Date.now();
      room.tick();
    }
    assert.equal(first.afkTurns, 2);
    assert.equal(first.leftMatch, true);
    assert.equal(room.match.actors[0].hp, 0);
    assert.equal(room.match.phase, "over");
  } finally { room.close(); }
});
