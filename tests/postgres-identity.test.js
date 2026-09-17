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
