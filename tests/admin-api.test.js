import test from "node:test";
import assert from "node:assert/strict";
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
const makeAdmin = async (store, session) => store.setUserRole(session.user.id, "admin");

test("admin endpoints reject a non-admin session and an unauthenticated request alike", async () => {
  const identityStore = new MemoryIdentityStore();
  const { server, port } = await listen({ identityStore });
  const url = `http://127.0.0.1:${port}`;
  try {
    const player = await guest(url, "Player");
    assert.equal((await fetch(`${url}/api/admin/users/${player.user.id}`)).status, 401);
    assert.equal((await fetch(`${url}/api/admin/users/${player.user.id}`, { headers: auth(player) })).status, 401);
    assert.equal((await fetch(`${url}/api/admin/sanctions`, {
      method: "POST", headers: auth(player), body: JSON.stringify({ userId: player.user.id, type: "mute", reason: "x" }),
    })).status, 401);
  } finally { server.closeAllConnections(); server.close(); }
});

test("admin can look up a player's aggregate profile", async () => {
  const identityStore = new MemoryIdentityStore();
  const { server, port } = await listen({ identityStore });
  const url = `http://127.0.0.1:${port}`;
  try {
    const admin = await guest(url, "Admin");
    await makeAdmin(identityStore, admin);
    const player = await guest(url, "LookupTarget");
    const profile = await (await fetch(`${url}/api/admin/users/${player.user.id}`, { headers: auth(admin) })).json();
    assert.equal(profile.user.id, player.user.id);
    assert.deepEqual(profile.wallet, { balance: 0 });
    assert.deepEqual(profile.progression, { xp: 0, level: 1 });
    assert.deepEqual(profile.sanctions, []);
    assert.equal((await fetch(`${url}/api/admin/users/00000000-0000-0000-0000-000000000000`,
      { headers: auth(admin) })).status, 404);
  } finally { server.closeAllConnections(); server.close(); }
});

test("a ban requires a second, different admin to confirm before it takes effect", async () => {
  const identityStore = new MemoryIdentityStore();
  const { server, port } = await listen({ identityStore });
  const url = `http://127.0.0.1:${port}`;
  try {
    const adminA = await guest(url, "AdminA");
    const adminB = await guest(url, "AdminB");
    await makeAdmin(identityStore, adminA);
    await makeAdmin(identityStore, adminB);
    const target = await guest(url, "Target");

    const created = await (await fetch(`${url}/api/admin/sanctions`, {
      method: "POST", headers: auth(adminA),
      body: JSON.stringify({ userId: target.user.id, type: "ban", reason: "cheating" }),
    })).json();
    assert.equal(created.sanction.status, "pending_confirmation");
    assert.equal(await identityStore.isBanned(target.user.id), false, "not enforced until confirmed");

    assert.equal((await fetch(`${url}/api/admin/sanctions/${created.sanction.id}/confirm`, {
      method: "POST", headers: auth(adminA),
    })).status, 409, "the issuing admin cannot confirm their own ban");
    assert.equal(await identityStore.isBanned(target.user.id), false);

    const confirmed = await (await fetch(`${url}/api/admin/sanctions/${created.sanction.id}/confirm`, {
      method: "POST", headers: auth(adminB),
    })).json();
    assert.equal(confirmed.sanction.status, "active");
    assert.equal(await identityStore.isBanned(target.user.id), true);

    const actions = await (await fetch(`${url}/api/admin/actions`, { headers: auth(adminA) })).json();
    assert.ok(actions.actions.some((a) => a.action === "sanction_create" && a.targetUserId === target.user.id));
    assert.ok(actions.actions.some((a) => a.action === "sanction_confirm" && a.adminUserId === adminB.user.id));

    const revoked = await (await fetch(`${url}/api/admin/sanctions/${created.sanction.id}/revoke`, {
      method: "POST", headers: auth(adminA), body: JSON.stringify({ reason: "appeal accepted" }),
    })).json();
    assert.equal(revoked.sanction.status, "revoked");
    assert.equal(await identityStore.isBanned(target.user.id), false);
    assert.equal((await fetch(`${url}/api/admin/sanctions/${created.sanction.id}/revoke`, {
      method: "POST", headers: auth(adminA), body: "{}",
    })).status, 404, "an already-revoked sanction cannot be revoked again");
  } finally { server.closeAllConnections(); server.close(); }
});

test("a mute is single-admin (no dual control) and takes effect immediately", async () => {
  const identityStore = new MemoryIdentityStore();
  const { server, port } = await listen({ identityStore });
  const url = `http://127.0.0.1:${port}`;
  try {
    const admin = await guest(url, "Admin");
    await makeAdmin(identityStore, admin);
    const target = await guest(url, "Target");
    const created = await (await fetch(`${url}/api/admin/sanctions`, {
      method: "POST", headers: auth(admin),
      body: JSON.stringify({ userId: target.user.id, type: "mute", reason: "spam" }),
    })).json();
    assert.equal(created.sanction.status, "active");
    assert.equal(await identityStore.isMuted(target.user.id), true);
  } finally { server.closeAllConnections(); server.close(); }
});

test("admin room terminate closes every connected socket and removes the room", async () => {
  const identityStore = new MemoryIdentityStore();
  const { server, port } = await listen({ identityStore });
  const url = `http://127.0.0.1:${port}`;
  let host, guestClient;
  try {
    const admin = await guest(url, "Admin");
    await makeAdmin(identityStore, admin);
    host = await connect(port, "mode=create&name=Host");
    const room = host.first.id;
    guestClient = await connect(port, `mode=join&room=${room}&name=Guest`);
    assert.ok(server.roomManager.get(room));

    const terminated = await (await fetch(`${url}/api/admin/rooms/${room}/terminate`, {
      method: "POST", headers: auth(admin), body: JSON.stringify({ reason: "abuse report" }),
    })).json();
    assert.equal(terminated.terminated, room);
    assert.equal(server.roomManager.get(room), null, "the room must be gone after termination");

    await new Promise((r) => setTimeout(r, 200));
    const actions = await (await fetch(`${url}/api/admin/actions`, { headers: auth(admin) })).json();
    assert.ok(actions.actions.some((a) => a.action === "room_terminate" && a.targetRoomId === room));
    assert.equal((await fetch(`${url}/api/admin/rooms/${room}/terminate`, {
      method: "POST", headers: auth(admin), body: "{}",
    })).status, 404);
  } finally {
    host?.close(); guestClient?.close();
    server.closeAllConnections(); server.close();
  }
});

test("sanction creation validates type and requires a non-empty reason", async () => {
  const identityStore = new MemoryIdentityStore();
  const { server, port } = await listen({ identityStore });
  const url = `http://127.0.0.1:${port}`;
  try {
    const admin = await guest(url, "Admin");
    await makeAdmin(identityStore, admin);
    const target = await guest(url, "Target");
    assert.equal((await fetch(`${url}/api/admin/sanctions`, {
      method: "POST", headers: auth(admin), body: JSON.stringify({ userId: target.user.id, type: "kick", reason: "x" }),
    })).status, 400);
    assert.equal((await fetch(`${url}/api/admin/sanctions`, {
      method: "POST", headers: auth(admin), body: JSON.stringify({ userId: target.user.id, type: "mute", reason: "  " }),
    })).status, 400);
    assert.equal((await fetch(`${url}/api/admin/sanctions`, {
      method: "POST", headers: auth(admin),
      body: JSON.stringify({ userId: target.user.id, type: "mute", reason: "x", expiresAt: "not-a-date" }),
    })).status, 400, "an unparseable expiresAt must be rejected, not turned into a 500");
  } finally { server.closeAllConnections(); server.close(); }
});

test("GET /api/admin/sanctions?userId= actually lists that user's sanction history", async () => {
  const identityStore = new MemoryIdentityStore();
  const { server, port } = await listen({ identityStore });
  const url = `http://127.0.0.1:${port}`;
  try {
    const admin = await guest(url, "Admin");
    await makeAdmin(identityStore, admin);
    const target = await guest(url, "Target");
    assert.equal((await fetch(`${url}/api/admin/sanctions`, { headers: auth(admin) })).status, 400,
      "userId query param is required");
    const empty = await (await fetch(`${url}/api/admin/sanctions?userId=${target.user.id}`,
      { headers: auth(admin) })).json();
    assert.deepEqual(empty.sanctions, []);

    await fetch(`${url}/api/admin/sanctions`, {
      method: "POST", headers: auth(admin),
      body: JSON.stringify({ userId: target.user.id, type: "mute", reason: "spam" }),
    });
    const listed = await (await fetch(`${url}/api/admin/sanctions?userId=${target.user.id}`,
      { headers: auth(admin) })).json();
    assert.equal(listed.sanctions.length, 1);
    assert.equal(listed.sanctions[0].type, "mute");
  } finally { server.closeAllConnections(); server.close(); }
});

const connect = (port, query, session) => new Promise((resolve, reject) => {
  const ws = new WebSocketClient(`ws://127.0.0.1:${port}/ws?${query}`,
    session ? { headers: { Cookie: `gunny_session=${session.token}` } } : undefined);
  const messages = [];
  let clientSeq = 0;
  const client = { messages, close: () => ws.close(),
    send: (msg) => { clientSeq++; ws.send(JSON.stringify({ protocolVersion: PROTOCOL_VERSION, clientSeq,
      requestId: `request-${clientSeq}`, ...msg })); } };
  ws.on("message", (data) => messages.push(JSON.parse(data.toString())));
  ws.once("error", reject);
  ws.once("message", (data) => resolve(Object.assign(client, { first: JSON.parse(data.toString()) })));
});
const waitFor = async (client, pred, timeoutMs = 2000) => {
  const start = Date.now();
  for (;;) {
    const hit = client.messages.find(pred);
    if (hit) return hit;
    if (Date.now() - start > timeoutMs) throw new Error("condition not reached");
    await new Promise((r) => setTimeout(r, 20));
  }
};

test("a confirmed ban rejects the realtime socket, and an admin mute silently rejects chat", async () => {
  const identityStore = new MemoryIdentityStore();
  const { server, port } = await listen({ identityStore });
  const url = `http://127.0.0.1:${port}`;
  let banned, host, muted;
  try {
    const admin = await guest(url, "Admin");
    const adminB = await guest(url, "AdminB");
    await makeAdmin(identityStore, admin);
    await makeAdmin(identityStore, adminB);
    const bannedSession = await guest(url, "Banned");
    const mutedSession = await guest(url, "Muted");

    const ban = await (await fetch(`${url}/api/admin/sanctions`, {
      method: "POST", headers: auth(admin),
      body: JSON.stringify({ userId: bannedSession.user.id, type: "ban", reason: "cheat" }),
    })).json();
    await fetch(`${url}/api/admin/sanctions/${ban.sanction.id}/confirm`, { method: "POST", headers: auth(adminB) });

    banned = await new Promise((resolve, reject) => {
      const ws = new WebSocketClient(`ws://127.0.0.1:${port}/ws?mode=create&name=Banned`,
        { headers: { Cookie: `gunny_session=${bannedSession.token}` } });
      ws.once("error", reject);
      ws.once("message", (data) => resolve(JSON.parse(data.toString())));
    });
    assert.equal(banned.t, "error");
    assert.equal(banned.code, "BANNED");

    host = await connect(port, "mode=create&name=Host");
    const room = host.first.id;
    await fetch(`${url}/api/admin/sanctions`, {
      method: "POST", headers: auth(admin),
      body: JSON.stringify({ userId: mutedSession.user.id, type: "mute", reason: "spam" }),
    });
    muted = await connect(port, `mode=join&room=${room}&name=Muted`, mutedSession);
    muted.send({ t: "chat", text: "hello" });
    const rejected = await waitFor(muted, (m) => m.t === "error" && m.code === "COMMAND_REJECTED");
    assert.ok(rejected);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(host.messages.some((s) => (s.chat || []).some((c) => c.text === "hello")), false,
      "the muted user's chat must never reach the room");
  } finally {
    host?.close(); muted?.close();
    server.closeAllConnections(); server.close();
  }
});
