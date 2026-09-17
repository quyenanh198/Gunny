import test from "node:test";
import assert from "node:assert/strict";
import { SnapshotBuffer } from "../src/play/snapshot-buffer.js";

const snapshot = (tick) => ({ actors: [{ x: tick, y: 100 }], projectile: null });

test("300ms latency with jitter, loss and reorder never moves rendered state backward", () => {
  const buffer = new SnapshotBuffer(120, 80);
  const arrivals = [];
  for (let tick = 1; tick <= 40; tick++) {
    if (tick % 4 === 0) continue; // deterministic 25% packet loss
    const jitter = [40, -30, 70, 0][tick % 4];
    arrivals.push({ tick, at: tick * 50 + 300 + jitter });
  }
  // Inject a reordered stale packet after a newer one.
  arrivals.push({ tick: 7, at: 1000 });
  arrivals.sort((a, b) => a.at - b.at);
  let rendered = -Infinity;
  for (const packet of arrivals) {
    buffer.push(snapshot(packet.tick), packet.at, packet.tick);
    const value = buffer.sample(packet.at + 120)?.actors[0].x;
    if (value !== undefined) {
      assert.ok(value >= rendered, `${value} moved backward from ${rendered}`);
      rendered = value;
    }
  }
  assert.ok(rendered >= 35, "the buffer continues progressing despite loss and jitter");
});
