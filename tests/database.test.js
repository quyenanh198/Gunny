import test from "node:test";
import assert from "node:assert/strict";
import { createPool, migrate } from "../server/database.js";

const databaseUrl = process.env.TEST_DATABASE_URL;

test("migrate() is idempotent: running it twice applies nothing new the second time", { skip: !databaseUrl }, async () => {
  const pool = createPool(databaseUrl);
  try {
    await migrate(pool);
    const before = await pool.query("SELECT version FROM schema_migrations ORDER BY version");
    await migrate(pool);
    const after = await pool.query("SELECT version FROM schema_migrations ORDER BY version");
    assert.deepEqual(after.rows, before.rows,
      "a redeploy that re-runs migrate() on an already-migrated database must be a no-op");
    assert.ok(before.rowCount >= 5, "expected at least the 5 shipped migrations to be recorded");
  } finally { await pool.end(); }
});
