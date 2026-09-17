import { createHash, randomBytes, randomUUID } from "node:crypto";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const token = () => randomBytes(32).toString("base64url");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const publicSession = (row, rawToken) => ({
  token: rawToken,
  expiresAt: new Date(row.expires_at).toISOString(),
  user: { id: row.user_id, kind: row.kind },
  profile: { displayName: row.display_name, version: row.version },
});

export class PostgresIdentityStore {
  constructor(pool, { sessionTtlMs = SESSION_TTL_MS } = {}) {
    this.pool = pool;
    this.sessionTtlMs = sessionTtlMs;
  }

  async createGuest(displayName = "Guest") {
    const userId = randomUUID();
    const sessionId = randomUUID();
    const rawToken = token();
    const expiresAt = new Date(Date.now() + this.sessionTtlMs);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("INSERT INTO users(id, kind) VALUES ($1, 'guest')", [userId]);
      await client.query("INSERT INTO profiles(user_id, display_name) VALUES ($1, $2)", [userId, displayName]);
      await client.query("INSERT INTO sessions(id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)",
        [sessionId, userId, hash(rawToken), expiresAt]);
      await client.query("COMMIT");
      return publicSession({ user_id: userId, kind: "guest", display_name: displayName, version: 1,
        expires_at: expiresAt }, rawToken);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async authenticate(rawToken) {
    if (!rawToken) return null;
    const result = await this.pool.query(`
      UPDATE sessions s SET last_seen_at = now()
      FROM users u JOIN profiles p ON p.user_id = u.id
      WHERE s.user_id = u.id AND s.token_hash = $1 AND s.revoked_at IS NULL
        AND s.rotated_at IS NULL AND s.expires_at > now() AND u.deleted_at IS NULL
      RETURNING s.expires_at, u.id AS user_id, u.kind, p.display_name, p.version`, [hash(rawToken)]);
    return result.rowCount ? publicSession(result.rows[0], rawToken) : null;
  }

  async rotate(rawToken) {
    const replacement = token();
    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + this.sessionTtlMs);
    const result = await this.pool.query(`
      WITH old AS (
        UPDATE sessions SET rotated_at = now()
        WHERE token_hash = $1 AND revoked_at IS NULL AND rotated_at IS NULL AND expires_at > now()
        RETURNING user_id
      ), fresh AS (
        INSERT INTO sessions(id, user_id, token_hash, expires_at)
        SELECT $2, user_id, $3, $4 FROM old RETURNING user_id, expires_at
      )
      SELECT fresh.user_id, fresh.expires_at, u.kind, p.display_name, p.version
      FROM fresh JOIN users u ON u.id = fresh.user_id JOIN profiles p ON p.user_id = fresh.user_id`,
      [hash(rawToken), sessionId, hash(replacement), expiresAt]);
    return result.rowCount ? publicSession(result.rows[0], replacement) : null;
  }
}
