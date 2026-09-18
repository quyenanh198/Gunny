import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../server/server.js";

const listen = (options) => new Promise((resolve) => {
  const server = createServer(options);
  server.listen(0, () => resolve({ server, port: server.address().port }));
});

test("readiness reports ok with a healthy store and a fresh event loop", async () => {
  const { server, port } = await listen();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/readyz`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ready, true);
    assert.equal(body.db, true);
    assert.equal(typeof body.eventLoopLagMs, "number");
    assert.equal(body.shuttingDown, false);
  } finally { server.closeAllConnections(); server.close(); }
});

test("readiness fails closed when the identity store cannot be reached", async () => {
  const identityStore = {
    async ping() { throw new Error("connection terminated"); },
    // Minimum surface createServer touches at construction time only.
    async authenticate() { return null; },
  };
  const { server, port } = await listen({ identityStore });
  try {
    const response = await fetch(`http://127.0.0.1:${port}/readyz`);
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.ready, false);
    assert.equal(body.db, false);
    assert.equal(body.dbError, "connection terminated");
  } finally { server.closeAllConnections(); server.close(); }
});

test("a store with no ping() method is treated as healthy (in-memory dev store)", async () => {
  const identityStore = { async authenticate() { return null; } };
  const { server, port } = await listen({ identityStore });
  try {
    const body = await (await fetch(`http://127.0.0.1:${port}/readyz`)).json();
    assert.equal(body.db, true);
  } finally { server.closeAllConnections(); server.close(); }
});
