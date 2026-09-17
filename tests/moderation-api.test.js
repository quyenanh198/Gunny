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

// Realtime identity binding needs the session cookie on the WebSocket handshake,
// which the built-in WebSocket global cannot set, so connect through the ws package.
// Every received snapshot is kept (not consumed) so a test can both wait for one to
// arrive and later assert none of them, past or future, ever matched a predicate.
const connect = (port, query, session) => new Promise((resolve, reject) => {
  const ws = new WebSocketClient(`ws://127.0.0.1:${port}/ws?${query}`, {
    headers: { Cookie: `gunny_session=${session.token}` },
  });
  const messages = [];
  let clientSeq = 0;
  const client = {
    messages,
    send: (msg) => { clientSeq++; ws.send(JSON.stringify({ protocolVersion: PROTOCOL_VERSION, clientSeq,
      requestId: `request-${clientSeq}`, ...msg })); },
    close: () => ws.close(),
  };
  ws.on("message", (data) => messages.push(JSON.parse(data.toString())));
  ws.once("error", reject);
  ws.once("message", (data) => resolve(Object.assign(client, { first: JSON.parse(data.toString()) })));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (client, pred, timeoutMs = 2000) => {
  const start = Date.now();
  for (;;) {
    const hit = client.messages.find(pred);
    if (hit) return hit;
    if (Date.now() - start > timeoutMs) throw new Error("condition not reached");
    await sleep(20);
  }
};
// Waits for at least one more message than `sinceLength` and returns the latest one,
// for assertions that must inspect a specific post-action snapshot, not any snapshot ever.
const nextAfter = async (client, sinceLength, timeoutMs = 2000) => {
  const start = Date.now();
  while (client.messages.length <= sinceLength) {
    if (Date.now() - start > timeoutMs) throw new Error("no new message arrived");
    await sleep(20);
  }
  return client.messages[client.messages.length - 1];
};

test("block and mute APIs require an authenticated session and validate their payload", async () => {
  const { server, port } = await listen();
  const url = `http://127.0.0.1:${port}`;
  try {
    assert.equal((await fetch(`${url}/api/social/block`, {
      method: "POST", body: JSON.stringify({ targetId: "x", enabled: true }),
    })).status, 401);
    const alice = await guest(url, "Alice");
    assert.equal((await fetch(`${url}/api/social/block`, {
      method: "POST", headers: auth(alice), body: JSON.stringify({ targetId: "x" }),
    })).status, 400, "enabled must be a boolean");
    assert.equal((await fetch(`${url}/api/social/mute`, {
      method: "POST", headers: auth(alice), body: JSON.stringify({ enabled: true }),
    })).status, 400, "targetId is required");
    const blocked = await (await fetch(`${url}/api/social/block`, {
      method: "POST", headers: auth(alice), body: JSON.stringify({ targetId: "bob-id", enabled: true }),
    })).json();
    assert.deepEqual(blocked, { targetId: "bob-id", blocked: true });
  } finally { server.closeAllConnections(); server.close(); }
});

test("report API validates categories and the admin review queue is gated by the moderation token", async () => {
  const { server, port } = await listen({ moderationToken: "mod-secret" });
  const url = `http://127.0.0.1:${port}`;
  try {
    const alice = await guest(url, "Alice");
    const bob = await guest(url, "Bob");
    assert.equal((await fetch(`${url}/api/social/report`, {
      method: "POST", headers: auth(alice),
      body: JSON.stringify({ targetId: bob.user.id, category: "not-real" }),
    })).status, 400);
    const created = await (await fetch(`${url}/api/social/report`, {
      method: "POST", headers: auth(alice),
      body: JSON.stringify({ targetId: bob.user.id, category: "harassment", details: "spam" }),
    })).json();
    assert.equal(created.report.status, "open");

    assert.equal((await fetch(`${url}/api/admin/reports`)).status, 401, "no bearer token at all");
    assert.equal((await fetch(`${url}/api/admin/reports`, {
      headers: { Authorization: "Bearer wrong" },
    })).status, 401);
    const listed = await (await fetch(`${url}/api/admin/reports`, {
      headers: { Authorization: "Bearer mod-secret" },
    })).json();
    assert.equal(listed.reports.length, 1);
    assert.equal(listed.reports[0].id, created.report.id);

    assert.equal((await fetch(`${url}/api/admin/reports/${created.report.id}`, {
      method: "PATCH", headers: { Authorization: "Bearer mod-secret" },
      body: JSON.stringify({ status: "not-a-status" }),
    })).status, 400);
    const reviewed = await (await fetch(`${url}/api/admin/reports/${created.report.id}`, {
      method: "PATCH", headers: { Authorization: "Bearer mod-secret" },
      body: JSON.stringify({ status: "reviewing" }),
    })).json();
    assert.equal(reviewed.report.status, "reviewing");
    assert.equal((await fetch(`${url}/api/admin/reports/00000000-0000-0000-0000-000000000000`, {
      method: "PATCH", headers: { Authorization: "Bearer mod-secret" },
      body: JSON.stringify({ status: "closed" }),
    })).status, 404);
  } finally { server.closeAllConnections(); server.close(); }
});

test("admin review queue is unreachable when no moderation token is configured", async () => {
  const { server, port } = await listen();
  const url = `http://127.0.0.1:${port}`;
  try {
    assert.equal((await fetch(`${url}/api/admin/reports`, {
      headers: { Authorization: "Bearer " },
    })).status, 401);
  } finally { server.closeAllConnections(); server.close(); }
});

test("a mutual block keeps two identities out of the same matchmaking ticket", async () => {
  const identityStore = new MemoryIdentityStore();
  const { server, port } = await listen({ identityStore });
  const url = `http://127.0.0.1:${port}`;
  try {
    const alice = await guest(url, "Alice");
    const bob = await guest(url, "Bob");
    await fetch(`${url}/api/social/block`, {
      method: "POST", headers: auth(alice), body: JSON.stringify({ targetId: bob.user.id, enabled: true }),
    });
    const body = JSON.stringify({ mode: "casual-1v1", region: "ap", teamSize: 1, protocolVersion: PROTOCOL_VERSION });
    await fetch(`${url}/api/matchmaking/enqueue`, { method: "POST", headers: auth(alice), body });
    await fetch(`${url}/api/matchmaking/enqueue`, { method: "POST", headers: auth(bob), body });
    const aliceStatus = await (await fetch(`${url}/api/matchmaking/status`, { headers: auth(alice) })).json();
    const bobStatus = await (await fetch(`${url}/api/matchmaking/status`, { headers: auth(bob) })).json();
    assert.equal(aliceStatus.status, "queued", "blocked identities must not be paired together");
    assert.equal(bobStatus.status, "queued");

    const carol = await guest(url, "Carol");
    await fetch(`${url}/api/matchmaking/enqueue`, { method: "POST", headers: auth(carol), body });
    const resolved = await (await fetch(`${url}/api/matchmaking/status`, { headers: auth(alice) })).json();
    assert.equal(resolved.status, "matched", "an unblocked third player can still match with alice");
  } finally { server.closeAllConnections(); server.close(); }
});

test("realtime chat is filtered per viewer: a block hides messages both ways, a mute hides them one way", async () => {
  const identityStore = new MemoryIdentityStore();
  const { server, port } = await listen({ identityStore });
  const url = `http://127.0.0.1:${port}`;
  let host, bobClient, carolClient;
  try {
    const alice = await guest(url, "Alice");
    const bob = await guest(url, "Bob");
    const carol = await guest(url, "Carol");
    await fetch(`${url}/api/social/block`, {
      method: "POST", headers: auth(alice), body: JSON.stringify({ targetId: bob.user.id, enabled: true }),
    });

    host = await connect(port, "mode=create&name=Alice", alice);
    const room = host.first.id;
    bobClient = await connect(port, `mode=join&room=${room}&name=Bob`, bob);
    carolClient = await connect(port, `mode=join&room=${room}&name=Carol`, carol);

    bobClient.send({ t: "chat", text: "hello everyone" });
    await until(carolClient, (s) => (s.chat || []).some((m) => m.text === "hello everyone"));
    await sleep(300); // give alice's socket time to receive the same broadcast, if it were going to
    assert.equal(host.messages.some((s) => (s.chat || []).some((m) => m.text === "hello everyone")), false,
      "alice blocked bob and must never see his chat");

    await fetch(`${url}/api/social/mute`, {
      method: "POST", headers: auth(carol), body: JSON.stringify({ targetId: bob.user.id, enabled: true }),
    });
    await sleep(500); // room chat is cooled down per sender at 750ms; clear it before bob's second message
    const carolLengthBeforeMute = carolClient.messages.length;
    bobClient.send({ t: "chat", text: "after mute" });
    const carolSnapshotAfterMute = await nextAfter(carolClient, carolLengthBeforeMute);
    assert.ok(!carolSnapshotAfterMute.chat.some((m) => m.text === "after mute"),
      "carol muted bob after the fact and stops seeing his new messages");
    assert.ok(!carolSnapshotAfterMute.chat.some((m) => m.text === "hello everyone"),
      "the mute also retroactively hides bob's earlier messages from carol");

    const bobOwnView = await until(bobClient, (s) => (s.chat || []).some((m) => m.text === "after mute"));
    assert.ok(bobOwnView.chat.some((m) => m.text === "hello everyone"), "a sender always sees their own history");
  } finally {
    host?.close(); bobClient?.close(); carolClient?.close();
    server.closeAllConnections(); server.close();
  }
});
