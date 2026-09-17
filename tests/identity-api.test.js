import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../server/server.js";
import { MemoryIdentityStore } from "../server/memory-identity-store.js";

const listen = () => new Promise((resolve) => {
  const server = createServer({ identityStore: new MemoryIdentityStore() });
  server.listen(0, () => resolve({ server, port: server.address().port }));
});

test("guest session authenticates across requests and rotation rejects replay", async () => {
  const { server, port } = await listen();
  const url = `http://127.0.0.1:${port}`;
  try {
    const createdResponse = await fetch(`${url}/api/sessions/guest`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Traveler" }),
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    assert.equal(created.user.kind, "guest");
    assert.equal(created.profile.displayName, "Traveler");
    assert.equal(created.profile.version, 1);
    assert.ok(created.user.id);
    assert.ok(created.token.length >= 40);

    const authorization = { Authorization: `Bearer ${created.token}` };
    const profile = await (await fetch(`${url}/api/profile`, { headers: authorization })).json();
    assert.equal(profile.user.id, created.user.id);

    const updated = await (await fetch(`${url}/api/profile`, {
      method: "PATCH", headers: { ...authorization, "content-type": "application/json" },
      body: JSON.stringify({ displayName: "New Name", expectedVersion: 1 }),
    })).json();
    assert.deepEqual(updated.profile, { displayName: "New Name", version: 2 });
    assert.equal((await fetch(`${url}/api/profile`, {
      method: "PATCH", headers: { ...authorization, "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Stale Write", expectedVersion: 1 }),
    })).status, 409);
    assert.deepEqual((await (await fetch(`${url}/api/matches`, { headers: authorization })).json()).matches, []);

    const rotated = await (await fetch(`${url}/api/sessions/rotate`, {
      method: "POST", headers: authorization,
    })).json();
    assert.notEqual(rotated.token, created.token);
    assert.equal(rotated.user.id, created.user.id);
    assert.equal((await fetch(`${url}/api/profile`, { headers: authorization })).status, 401);
    assert.equal((await fetch(`${url}/api/profile`, {
      headers: { Authorization: `Bearer ${rotated.token}` },
    })).status, 200);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test("identity API validates input and authorization", async () => {
  const { server, port } = await listen();
  const url = `http://127.0.0.1:${port}`;
  try {
    assert.equal((await fetch(`${url}/api/profile`)).status, 401);
    assert.equal((await fetch(`${url}/api/matches`)).status, 401);
    assert.equal((await fetch(`${url}/api/sessions/guest`, {
      method: "POST", body: JSON.stringify({ displayName: "x".repeat(25) }),
    })).status, 400);
    assert.equal((await fetch(`${url}/api/sessions/guest`, { method: "POST", body: "{" })).status, 400);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});
