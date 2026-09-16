import test from "node:test";
import assert from "node:assert/strict";
import { SnapshotBuffer } from "../src/play/snapshot-buffer.js";

const snapshot = (x) => ({ actors: [{ x, y: x }], projectile: { x, y: x } });

test("snapshot buffer renders behind real time and interpolates positions", () => {
  const buffer = new SnapshotBuffer(100);
  buffer.push(snapshot(0), 0);
  buffer.push(snapshot(20), 200);
  const sampled = buffer.sample(200);
  assert.equal(sampled.actors[0].x, 10);
  assert.equal(sampled.projectile.y, 10);
});

test("snapshot buffer snaps large corrections and resets cleanly", () => {
  const buffer = new SnapshotBuffer(100, 80);
  buffer.push(snapshot(0), 0);
  buffer.push(snapshot(200), 200);
  assert.equal(buffer.sample(200).actors[0].x, 200);
  buffer.clear();
  assert.equal(buffer.sample(200), null);
});

test("snapshot buffer discards stale server ticks", () => {
  const buffer = new SnapshotBuffer();
  assert.equal(buffer.push(snapshot(10), 100, 10), true);
  assert.equal(buffer.push(snapshot(9), 110, 9), false);
  assert.equal(buffer.sample(300).actors[0].x, 10);
});
