import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../server/server.js";

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
    const client = {
      ws,
      send: (msg) => ws.send(JSON.stringify(msg)),
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
    const promoted = await until(guest, (s) => s.you.host, 150);
    assert.equal(promoted.players.length, 1);
    guest.ws.close();
  } finally {
    server.closeAllConnections();
    server.close();
  }
});
