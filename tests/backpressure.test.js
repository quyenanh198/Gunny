import test from "node:test";
import assert from "node:assert/strict";
import { Room, HARD_BACKPRESSURE_BYTES, SOFT_BACKPRESSURE_BYTES } from "../server/room.js";

function client(bufferedAmount) {
  return {
    id: 1, connected: true, team: null, ready: false, host: false, role: "spectator",
    character: "mochi", weapon: "carrot", name: "Slow", terrainVersion: -1,
    reconnectToken: "token", lastAckSeq: 0,
    ws: { readyState: 1, bufferedAmount, sent: 0, closed: null,
      send() { this.sent++; }, close(code, reason) { this.closed = { code, reason }; } },
  };
}

test("room coalesces snapshots for a soft-backpressured client", () => {
  const room = new Room("ABCDEF", () => {});
  const slow = client(SOFT_BACKPRESSURE_BYTES + 1);
  room.join(slow, "spectator");
  assert.equal(slow.ws.sent, 0);
  assert.equal(room.slowConsumerDrops, 1);
  room.close();
});

test("room closes a hard-backpressured client with retry-later code", () => {
  const room = new Room("ABCDEF", () => {});
  const slow = client(HARD_BACKPRESSURE_BYTES + 1);
  room.join(slow, "spectator");
  assert.deepEqual(slow.ws.closed, { code: 1013, reason: "slow consumer" });
  assert.equal(room.slowConsumerCloses, 1);
  room.close();
});
