import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../server/server.js";
import { MemoryIdentityStore } from "../server/memory-identity-store.js";

const listen = (options) => new Promise((resolve) => {
  const server = createServer(options);
  server.listen(0, () => resolve({ server, port: server.address().port }));
});
const guest = async (url, displayName) => (await (await fetch(`${url}/api/sessions/guest`, {
  method: "POST", body: JSON.stringify({ displayName }),
})).json());
const auth = (session) => ({ Authorization: `Bearer ${session.token}` });

test("feedback requires a session and validates category/message", async () => {
  const { server, port } = await listen();
  const url = `http://127.0.0.1:${port}`;
  try {
    assert.equal((await fetch(`${url}/api/support/feedback`, {
      method: "POST", body: JSON.stringify({ category: "bug", message: "x" }),
    })).status, 401);
    const player = await guest(url, "Player");
    assert.equal((await fetch(`${url}/api/support/feedback`, {
      method: "POST", headers: auth(player), body: JSON.stringify({ category: "not-a-category", message: "x" }),
    })).status, 400);
    assert.equal((await fetch(`${url}/api/support/feedback`, {
      method: "POST", headers: auth(player), body: JSON.stringify({ category: "bug", message: "  " }),
    })).status, 400);
    const created = await (await fetch(`${url}/api/support/feedback`, {
      method: "POST", headers: auth(player),
      body: JSON.stringify({ category: "bug", message: "the turn timer is off by one", context: { screen: "game" } }),
    })).json();
    assert.equal(created.feedback.category, "bug");
    assert.equal(created.feedback.userId, player.user.id);
  } finally { server.closeAllConnections(); server.close(); }
});

test("submitted feedback is visible to an admin and to nobody else", async () => {
  const identityStore = new MemoryIdentityStore();
  const { server, port } = await listen({ identityStore });
  const url = `http://127.0.0.1:${port}`;
  try {
    const player = await guest(url, "Player");
    await fetch(`${url}/api/support/feedback`, {
      method: "POST", headers: auth(player), body: JSON.stringify({ category: "suggestion", message: "add a dark mode" }),
    });
    assert.equal((await fetch(`${url}/api/admin/feedback`, { headers: auth(player) })).status, 401);

    const admin = await guest(url, "Admin");
    await identityStore.setUserRole(admin.user.id, "admin");
    const listed = await (await fetch(`${url}/api/admin/feedback`, { headers: auth(admin) })).json();
    assert.equal(listed.feedback.length, 1);
    assert.equal(listed.feedback[0].message, "add a dark mode");

    const dashboard = await (await fetch(`${url}/api/admin/dashboard`, { headers: auth(admin) })).json();
    assert.equal(dashboard.feedbackCount, 1);
  } finally { server.closeAllConnections(); server.close(); }
});
