import test from "node:test";
import assert from "node:assert/strict";
import { createPool, migrate } from "../server/database.js";
import { PostgresIdentityStore } from "../server/identity-store.js";

const databaseUrl = process.env.TEST_DATABASE_URL;

test("PostgreSQL persists guest identity and rotates session atomically", { skip: !databaseUrl }, async () => {
  const firstPool = createPool(databaseUrl);
  await migrate(firstPool);
  const firstStore = new PostgresIdentityStore(firstPool);
  const created = await firstStore.createGuest("Persistent Guest");
  const stored = await firstPool.query("SELECT token_hash FROM sessions WHERE user_id = $1", [created.user.id]);
  assert.equal(stored.rowCount, 1);
  assert.notEqual(stored.rows[0].token_hash, created.token, "raw bearer token is never persisted");
  await firstPool.end();

  const restartedPool = createPool(databaseUrl);
  try {
    const restartedStore = new PostgresIdentityStore(restartedPool);
    assert.equal((await restartedStore.authenticate(created.token)).user.id, created.user.id);
    assert.deepEqual(await restartedStore.updateProfile(created.token,
      { displayName: "Renamed", expectedVersion: 1 }), { displayName: "Renamed", version: 2 });
    assert.equal(await restartedStore.updateProfile(created.token,
      { displayName: "Lost update", expectedVersion: 1 }), null);

    const result = {
      resultKey: `result-${created.user.id}`, roomId: "ABC123", startedAt: new Date(Date.now() - 1000),
      summary: { rounds: 2, winner: 0 },
      participants: [{ userId: created.user.id, team: 0, outcome: "win", disconnected: false }],
    };
    const settled = await restartedStore.settleMatch(result);
    assert.equal(settled.applied, true);
    assert.deepEqual(await restartedStore.settleMatch(result), { applied: false });
    const history = await restartedStore.listMatches(created.token);
    assert.equal(history.length, 1);
    assert.equal(history[0].id, settled.matchId);
    assert.equal(history[0].outcome, "win");
    assert.equal(history[0].summary.rounds, 2);

    const rotated = await restartedStore.rotate(created.token);
    assert.equal(rotated.user.id, created.user.id);
    assert.equal(await restartedStore.authenticate(created.token), null);
    assert.equal((await restartedStore.authenticate(rotated.token)).profile.displayName, "Persistent Guest");
    assert.equal(await restartedStore.rotate(created.token), null, "rotated token cannot be replayed");
  } finally {
    await restartedPool.query("DELETE FROM users WHERE id = $1", [created.user.id]);
    await restartedPool.end();
  }
});
