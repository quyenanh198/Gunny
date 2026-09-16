import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../server/server.js";
import { PROTOCOL_VERSION } from "../src/play/protocol.js";

const listen = () =>
  new Promise((resolve) => {
    const server = createServer();
    server.listen(0, () => resolve({ server, port: server.address().port }));
  });
// Snapshots arrive continuously, so queue them: a test must never miss the one
// that carries a transition just because it was not awaiting yet.
const connect = (port, query) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?${query}`);
    const queue = [];
    let clientSeq = 0;
    const client = {
      ws,
      send: (msg) => ws.send(JSON.stringify({ protocolVersion: PROTOCOL_VERSION, clientSeq: ++clientSeq, ...msg })),
      sendRaw: (msg) => ws.send(JSON.stringify(msg)),
      next: () => (queue.length ? Promise.resolve(queue.shift()) : new Promise((r) => (client.waiter = r))),
    };
    ws.onmessage = (e) => {
      const s = JSON.parse(e.data);
      if (client.waiter) {
        const w = client.waiter;
        client.waiter = null;
        w(s);
      } else queue.push(s);
    };
    ws.onopen = () => resolve(client);
    ws.onerror = reject;
  });
const until = async (client, pred, tries = 80) => {
  for (let i = 0; i < tries; i++) {
    const s = await client.next();
    if (pred(s)) return s;
  }
  throw new Error("condition not reached");
};

test("static files are served and server internals are not", async () => {
  const { server, port } = await listen();
  try {
    const page = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Chibi Arena/);
    assert.equal(
      (await fetch(`http://127.0.0.1:${port}/src/match.js`)).headers.get("content-type"),
      "text/javascript; charset=utf-8",
    );
    assert.equal((await fetch(`http://127.0.0.1:${port}/server/server.js`)).status, 403);
    assert.equal((await fetch(`http://127.0.0.1:${port}/node_modules/ws/package.json`)).status, 403);
    assert.equal((await fetch(`http://127.0.0.1:${port}/nope.png`)).status, 404);
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test("the lobby seats players, only the host configures, and only the host starts", async () => {
  const { server, port } = await listen();
  try {
    const host = await connect(port, "room=&name=An");
    const first = await until(host, (s) => s.you.host);
    assert.equal(first.state, "lobby");
    assert.equal(first.id.length, 4);
    assert.equal(first.you.team, 0, "first player fills team 1");
    assert.equal(first.protocolVersion, PROTOCOL_VERSION);
    assert.equal(first.serverTick, 0);
    assert.equal(first.lastAckSeq, 0);
    assert.ok(first.reconnectToken);
    assert.equal(first.canStart, true, "one player plus the default bot is enough");
    const listed = await (await fetch(`http://127.0.0.1:${port}/api/rooms`)).json();
    assert.deepEqual(listed[0].id, first.id);

    const guest = await connect(port, `room=${first.id}&name=Binh`);
    const g1 = await until(guest, (s) => s.players.length === 2);
    assert.equal(g1.you.team, 1, "second player fills the other team");
    assert.equal(g1.you.host, false);
    assert.equal(g1.canStart, false, "the guest has not readied up");

    guest.send({ t: "setup", map: "death" });
    guest.send({ t: "start" });
    await new Promise((r) => setTimeout(r, 150));
    const ignored = await until(guest, (s) => s.players.length === 2);
    assert.equal(ignored.map, "sky", "a guest cannot change the setup");
    assert.equal(ignored.state, "lobby", "a guest cannot start the match");

    guest.send({ t: "loadout", character: "bzz", weapon: "star" });
    guest.send({ t: "ready", value: true });
    await until(host, (s) => s.canStart && s.players.some((p) => p.character === "bzz"));
    host.send({ t: "setup", map: "death", difficulty: "easy", bots: [1, 0] });
    host.send({ t: "start" });
    const playing = await until(host, (s) => s.state === "playing");
    assert.equal(playing.match.map, "death");
    assert.equal(playing.match.actors.length, 3, "two players and one bot");
    assert.equal(playing.you.player, 1);
    assert.ok(Array.isArray(playing.match.terrain));
    const gp = await until(guest, (s) => s.state === "playing");
    assert.equal(gp.you.player, 2);
    const mine = gp.match.actors.find((a) => a.player === 2);
    assert.equal(mine.skin, "bzz", "the lobby loadout carries into the match");
    assert.equal(mine.weapon, "star");
    assert.equal(mine.name, "Binh", "actors carry the player name");

    // Only the player whose turn it is can aim.
    guest.send({ t: "aim", angle: 70 });
    host.send({ t: "aim", angle: 70 });
    const aimed = await until(host, (s) => s.match.actors[0].angle === 70);
    assert.equal(aimed.match.turn, 0);
    host.send({ t: "charge" });
    await new Promise((r) => setTimeout(r, 300));
    host.send({ t: "release" });
    assert.ok(await until(host, (s) => s.match.phase === "flight"));
    assert.ok(await until(guest, (s) => s.match.phase !== "aim" || s.match.turn !== 0, 200));

    host.send({ t: "lobby" });
    const back = await until(guest, (s) => s.state === "lobby");
    assert.equal(back.you.ready, false, "everyone re-readies for the next match");
    host.ws.close();
    const retained = await until(guest, (s) => s.players.some((player) => player.id === first.you.id && !player.connected));
    assert.equal(retained.you.host, false, "host ownership is retained during the reconnect grace period");
    assert.equal(retained.players.length, 2);
    guest.ws.close();
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test("invalid and duplicate messages are rejected without applying twice", async () => {
  const { server, port } = await listen();
  try {
    const host = await connect(port, "room=&name=An");
    const first = await until(host, (snapshot) => snapshot.you.host);
    host.sendRaw({ t: "ready", value: true });
    assert.equal((await until(host, (message) => message.t === "error")).code, "VERSION_MISMATCH");

    const input = { protocolVersion: PROTOCOL_VERSION, clientSeq: 1, t: "team", team: 1 };
    host.sendRaw(input);
    const changed = await until(host, (snapshot) => snapshot.you.team === 1);
    assert.equal(changed.lastAckSeq, 1);
    host.sendRaw({ ...input, team: 0 });
    await new Promise((resolve) => setTimeout(resolve, 80));
    const unchanged = await until(host, (snapshot) => snapshot.t === "room");
    assert.equal(unchanged.you.team, 1);
    assert.equal(unchanged.lastAckSeq, 1);
    host.ws.close();
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test("reconnect token keeps the same seat and forces a full resync", async () => {
  const { server, port } = await listen();
  try {
    const original = await connect(port, "room=&name=An");
    const first = await until(original, (snapshot) => snapshot.you.host);
    original.ws.close();
    await new Promise((resolve) => setTimeout(resolve, 40));
    const resumed = await connect(
      port,
      `room=${first.id}&name=Ignored&reconnectToken=${encodeURIComponent(first.reconnectToken)}`,
    );
    const snapshot = await until(resumed, (message) => message.t === "room");
    assert.equal(snapshot.you.id, first.you.id);
    assert.equal(snapshot.you.host, true);
    assert.equal(snapshot.you.team, first.you.team);
    assert.ok(snapshot.roomVersion > first.roomVersion);
    resumed.ws.close();
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test("oversized messages and input floods return machine-readable errors", async () => {
  const { server, port } = await listen();
  try {
    const client = await connect(port, "room=&name=An");
    await until(client, (message) => message.t === "room");
    client.ws.send("x".repeat(4097));
    assert.equal((await until(client, (message) => message.t === "error")).code, "MESSAGE_TOO_LARGE");
    for (let sequence = 1; sequence <= 61; sequence++)
      client.sendRaw({ protocolVersion: PROTOCOL_VERSION, clientSeq: sequence, t: "ready", value: true });
    assert.equal((await until(client, (message) => message.t === "error", 200)).code, "RATE_LIMITED");
    client.ws.close();
  } finally {
    server.closeAllConnections();
    server.close();
  }
});

test("quick join and production probes expose live room state", async () => {
  const { server, port } = await listen();
  try {
    const client = await connect(port, "room=&name=An");
    const room = await until(client, (message) => message.t === "room");
    const quick = await (await fetch(`http://127.0.0.1:${port}/api/quick-join`)).json();
    assert.equal(quick.room.length, 4);
    assert.equal((await fetch(`http://127.0.0.1:${port}/readyz`)).status, 200);
    const metrics = await (await fetch(`http://127.0.0.1:${port}/metrics`)).text();
    assert.match(metrics, /gunny_active_connections [1-9]\d*/);
    assert.match(metrics, /gunny_rooms [1-9]\d*/);
    client.ws.close();
  } finally {
    server.closeAllConnections();
    server.close();
  }
});
