import test from "node:test";
import assert from "node:assert/strict";
import { clientIp, FixedWindowLimiter } from "../server/rate-limiter.js";

test("fixed-window limiter resets deterministically", () => {
  const limiter = new FixedWindowLimiter({ limit: 2, windowMs: 1000 });
  assert.equal(limiter.take("ip", 0), true);
  assert.equal(limiter.take("ip", 1), true);
  assert.equal(limiter.take("ip", 2), false);
  assert.equal(limiter.take("ip", 1000), true);
});

test("forwarded IP is trusted only from an explicit proxy", () => {
  const request = { socket: { remoteAddress: "127.0.0.1" }, headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.2" } };
  assert.equal(clientIp(request), "127.0.0.1");
  assert.equal(clientIp(request, { trustProxy: true, trustedProxies: ["10.0.0.2"] }), "127.0.0.1");
  assert.equal(clientIp(request, { trustProxy: true, trustedProxies: ["127.0.0.1"] }), "203.0.113.7");
});
