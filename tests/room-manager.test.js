import test from "node:test";
import assert from "node:assert/strict";
import { percentile } from "../server/room-manager.js";

test("percentile reports deterministic p50/p95/p99 baseline values", () => {
  const samples = Array.from({ length: 100 }, (_, index) => index + 1);
  assert.equal(percentile(samples, 0.5), 50);
  assert.equal(percentile(samples, 0.95), 95);
  assert.equal(percentile(samples, 0.99), 99);
  assert.equal(percentile([], 0.95), 0);
});
