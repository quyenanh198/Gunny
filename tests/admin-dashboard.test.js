import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import WebSocketClient from "ws";
import { createServer } from "../server/server.js";
import { MemoryIdentityStore } from "../server/memory-identity-store.js";
import { PROTOCOL_VERSION } from "../src/play/protocol.js";

const listen = (options) => new Promise((resolve) => {
  const server = createServer(options);
  server.listen(0, () => resolve({ server, port: server.address().port }));
});
const guest = async (url, displayName) => (await (await fetch(`${url}/api/sessions/guest`, {
  method: "POST", body: JSON.stringify({ displayName }),
})).json());
const auth = (session) => ({ Authorization: `Bearer ${session.token}` });

test("dashboard requires admin auth and reports match completion stats", async () => {
  const identityStore = new MemoryIdentityStore();
  const { server, port } = await listen({ identityStore });
  const url = `http://127.0.0.1:${port}`;
  try {
    const admin = await guest(url, "Admin");
    assert.equal((await fetch(`${url}/api/admin/dashboard`, { headers: auth(admin) })).status, 401);
    await identityStore.setUserRole(admin.user.id, "admin");

    const completedId = randomUUID(), abandonedId = randomUUID();
    await identityStore.beginMatch({ id: completedId, roomId: "R1", startedAt: new Date(), participants: [] });
    await identityStore.completeMatch({ id: completedId, resultKey: `match:${completedId}`, status: "completed",
      endedAt: new Date(), summary: {}, participants: [] });
    await identityStore.beginMatch({ id: abandonedId, roomId: "R2", startedAt: new Date(), participants: [] });
    await identityStore.completeMatch({ id: abandonedId, resultKey: `match:${abandonedId}`, status: "abandoned",
      endedAt: new Date(), summary: {}, participants: [] });

    const dashboard = await (await fetch(`${url}/api/admin/dashboard`, { headers: auth(admin) })).json();
    assert.equal(dashboard.matches.total, 2);
    assert.equal(dashboard.matches.completed, 1);
    assert.equal(dashboard.matches.abandoned, 1);
    assert.equal(dashboard.matches.completionRate, 0.5);
    assert.equal(dashboard.openReports, 0);
    assert.equal(typeof dashboard.reconnect.attempts, "number");
    assert.ok(dashboard.rooms);
  } finally { server.closeAllConnections(); server.close(); }
});

test("reconnect attempts and successes are cumulative across the process, surviving room closure", async () => {
  const { server, port } = await listen();
  const url = `http://127.0.0.1:${port}`;
  let host, replay;
  try {
    host = await new Promise((resolve, reject) => {
      const ws = new WebSocketClient(`ws://127.0.0.1:${port}/ws?mode=create&name=Host`);
      ws.once("error", reject);
      ws.once("message", (data) => resolve({ ws, first: JSON.parse(data.toString()) }));
    });
    const room = host.first.id;
    const token = host.first.reconnectToken;
    host.ws.close();
    await new Promise((r) => setTimeout(r, 100));

    // A successful resume, then a replay of the now-rotated (stale) token.
    const resumeOnce = () => new Promise((resolve, reject) => {
      const ws = new WebSocketClient(`ws://127.0.0.1:${port}/ws?mode=resume&room=${room}`);
      ws.once("open", () => ws.send(JSON.stringify({ t: "resume", protocolVersion: PROTOCOL_VERSION, room, reconnectToken: token })));
      ws.once("error", reject);
      ws.once("message", (data) => resolve({ ws, message: JSON.parse(data.toString()) }));
    });
    const success = await resumeOnce();
    replay = await new Promise((resolve, reject) => {
      const ws = new WebSocketClient(`ws://127.0.0.1:${port}/ws?mode=resume&room=${room}`);
      ws.once("open", () => ws.send(JSON.stringify({ t: "resume", protocolVersion: PROTOCOL_VERSION, room, reconnectToken: token })));
      ws.once("error", reject);
      ws.once("message", (data) => resolve({ ws, message: JSON.parse(data.toString()) }));
    });
    assert.equal(replay.message.code, "RECONNECT_EXPIRED", "the same token cannot be replayed after a successful resume");

    const metrics = await (await fetch(`${url}/metrics`)).text();
    assert.match(metrics, /gunny_reconnect_attempts 2/);
    assert.match(metrics, /gunny_reconnect_successes 1/);
    success.ws.close();
  } finally {
    host?.ws.close(); replay?.ws.close();
    server.closeAllConnections(); server.close();
  }
});
