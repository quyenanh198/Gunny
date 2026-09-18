import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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

test("completing a match pays the winner and withholds reward from a disconnected loser", async () => {
  const store = new MemoryIdentityStore();
  const winner = await store.createGuest("Winner");
  const loser = await store.createGuest("Loser");
  const matchId = randomUUID();
  await store.beginMatch({ id: matchId, roomId: "ROOM01", startedAt: new Date(),
    participants: [{ userId: winner.user.id, team: 0 }, { userId: loser.user.id, team: 1 }] });

  const result = { id: matchId, resultKey: `match:${matchId}`, status: "completed", endedAt: new Date(),
    summary: {}, participants: [
      { userId: winner.user.id, outcome: "win", disconnected: false },
      { userId: loser.user.id, outcome: "loss", disconnected: true },
    ] };
  assert.equal((await store.completeMatch(result)).applied, true);

  assert.deepEqual(await store.getWallet(winner.token), { balance: 20 });
  assert.deepEqual(await store.getProgression(winner.token), { xp: 30, level: 1 });
  const winnerLedger = await store.getLedger(winner.token);
  assert.equal(winnerLedger.length, 1);
  assert.equal(winnerLedger[0].reason, "match_win");
  assert.equal(winnerLedger[0].matchId, matchId);

  assert.deepEqual(await store.getWallet(loser.token), { balance: 0 }, "a disconnected participant earns nothing");
  assert.deepEqual(await store.getProgression(loser.token), { xp: 0, level: 1 });

  // Retried settlement (e.g. a duplicate finalize call) must not pay twice.
  assert.equal((await store.completeMatch(result)).applied, false);
  assert.deepEqual(await store.getWallet(winner.token), { balance: 20 });
});

test("an abandoned match pays nobody even for a participant marked as the winner", async () => {
  const store = new MemoryIdentityStore();
  const a = await store.createGuest("A");
  const matchId = randomUUID();
  await store.beginMatch({ id: matchId, roomId: "ROOM02", startedAt: new Date(),
    participants: [{ userId: a.user.id, team: 0 }] });
  await store.completeMatch({ id: matchId, resultKey: `match:${matchId}`, status: "abandoned",
    endedAt: new Date(), summary: {}, participants: [{ userId: a.user.id, outcome: "win", disconnected: false }] });
  assert.deepEqual(await store.getWallet(a.token), { balance: 0 });
});

test("economy endpoints require auth and default to an empty wallet for a fresh identity", async () => {
  const { server, port } = await listen();
  const url = `http://127.0.0.1:${port}`;
  try {
    assert.equal((await fetch(`${url}/api/economy/wallet`)).status, 401);
    assert.equal((await fetch(`${url}/api/economy/ledger`)).status, 401);
    assert.equal((await fetch(`${url}/api/economy/progression`)).status, 401);

    const session = await guest(url, "Fresh");
    assert.deepEqual(await (await fetch(`${url}/api/economy/wallet`, { headers: auth(session) })).json(), { balance: 0 });
    assert.deepEqual(await (await fetch(`${url}/api/economy/ledger`, { headers: auth(session) })).json(), { ledger: [] });
    assert.deepEqual(await (await fetch(`${url}/api/economy/progression`, { headers: auth(session) })).json(),
      { xp: 0, level: 1 });
  } finally { server.closeAllConnections(); server.close(); }
});

test("wallet, ledger and progression reflect a settled match over HTTP", async () => {
  const identityStore = new MemoryIdentityStore();
  const { server, port } = await listen({ identityStore });
  const url = `http://127.0.0.1:${port}`;
  try {
    const session = await guest(url, "Player");
    const matchId = randomUUID();
    await identityStore.beginMatch({ id: matchId, roomId: "ROOM03", startedAt: new Date(),
      participants: [{ userId: session.user.id, team: 0 }] });
    await identityStore.completeMatch({ id: matchId, resultKey: `match:${matchId}`, status: "completed",
      endedAt: new Date(), summary: {}, participants: [{ userId: session.user.id, outcome: "draw", disconnected: false }] });

    assert.deepEqual(await (await fetch(`${url}/api/economy/wallet`, { headers: auth(session) })).json(), { balance: 10 });
    assert.deepEqual(await (await fetch(`${url}/api/economy/progression`, { headers: auth(session) })).json(),
      { xp: 15, level: 1 });
    const ledger = await (await fetch(`${url}/api/economy/ledger`, { headers: auth(session) })).json();
    assert.equal(ledger.ledger.length, 1);
    assert.equal(ledger.ledger[0].reason, "match_draw");
  } finally { server.closeAllConnections(); server.close(); }
});
