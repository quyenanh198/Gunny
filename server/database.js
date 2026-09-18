import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), "db", "migrations");

export function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error("DATABASE_URL is required");
  return new pg.Pool({ connectionString, max: Number(process.env.DB_POOL_SIZE || 10) });
}

export async function migrate(pool) {
  await pool.query("CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const files = (await readdir(MIGRATIONS)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
  for (const version of files) {
    const exists = await pool.query("SELECT 1 FROM schema_migrations WHERE version = $1", [version]);
    if (exists.rowCount) continue;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(await readFile(path.join(MIGRATIONS, version), "utf8"));
      await client.query("INSERT INTO schema_migrations(version) VALUES ($1) ON CONFLICT DO NOTHING", [version]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
