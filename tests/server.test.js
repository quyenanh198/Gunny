import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../server/server.js";

const listen = () =>
  new Promise((resolve) => {
    const server = createServer();
    server.listen(0, () => resolve({ server, port: server.address().port }));
  });
const connect = (port, query) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?${query}`);
    const client = { ws, states: [], next: () => new Promise((r) => (client.waiter = r)) };
    ws.onmessage = (e) => {
      const s = JSON.parse(e.data);
      client.states.push(s);
      if (client.waiter) {
        const w = client.waiter;
        client.waiter = null;
        w(s);
      }
    };
    ws.onopen = () => resolve(client);
    ws.onerror = reject;
  });
const until = async (client, pred, tries = 60) => {
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
    assert.equal((await fetch(`http://127.0.0.1:${port}/src/match.js`)).headers.get("content-type"), "text/javascript; charset=utf-8");
    assert.equal((await fetch(`http://127.0.0.1:${port}/server/server.js`)).status, 403);
    assert.equal((await fetch(`http://127.0.0.1:${port}/node_modules/ws/package.json`)).status, 403);
    assert.equal((await fetch(`http://127.0.0.1:${port}/nope.png`)).status, 404);
  } finally {
    server.close();
  }
});

test("rooms seat humans, the host configures teams, and input drives the match", async () => {
  const { server, port } = await listen();
  try {
    const host = await connect(port, "room=&name=An");
    const first = await until(host, (s) => s.you.host);
    assert.equal(first.you.seat, 1);
    assert.equal(first.room.length, 4);
    assert.ok(Array.isArray(first.terrain) && first.terrain.length === 1200);
    const guest = await connect(port, `room=${first.room}&name=Bình`);
    const g1 = await until(guest, (s) => s.seats.length > 0);
    assert.equal(g1.you.seat, null, "one human seat, guest spectates");
    assert.equal(g1.you.host, false);
    host.ws.send(JSON.stringify({ t: "setup", teams: [{ humans: 1, bots: 0 }, { humans: 1, bots: 1 }] }));
    const g2 = await until(guest, (s) => s.you.seat === 2);
    assert.deepEqual(g2.seats.map((s) => s.name), ["An", "Bình"]);
    assert.equal(g2.actors.filter((a) => a.control === "human").length, 2);
    // Guest cannot aim on the host's turn; host can.
    guest.ws.send(JSON.stringify({ t: "aim", angle: 60 }));
    host.ws.send(JSON.stringify({ t: "aim", angle: 60 }));
    const aimed = await until(host, (s) => s.actors[0].angle === 60);
    assert.equal(aimed.turn, 0);
    host.ws.send(JSON.stringify({ t: "charge" }));
    await new Promise((r) => setTimeout(r, 300));
    host.ws.send(JSON.stringify({ t: "release" }));
    const flying = await until(host, (s) => s.phase === "flight");
    assert.ok(flying.projectile);
    const guestSees = await until(guest, (s) => s.phase !== "aim" || s.turn !== 0, 200);
    assert.ok(guestSees);
    // Guest changes nothing as non-host.
    guest.ws.send(JSON.stringify({ t: "setup", map: "vuc-sau" }));
    const after = await guest.next();
    assert.notEqual(after.map, "vuc-sau");
    host.ws.close();
    const promoted = await until(guest, (s) => s.you.host, 120);
    assert.equal(promoted.seats[0].name, null, "host seat freed");
    guest.ws.close();
  } finally {
    server.close();
  }
});
