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

  async updateProfile(rawToken, { displayName, expectedVersion }) {
    const result = await this.pool.query(`
      UPDATE profiles p SET display_name = $2, version = version + 1, updated_at = now()
      FROM sessions s, users u
      WHERE s.token_hash = $1 AND s.user_id = u.id AND p.user_id = u.id
        AND s.revoked_at IS NULL AND s.rotated_at IS NULL AND s.expires_at > now()
        AND u.deleted_at IS NULL AND p.version = $3
      RETURNING p.display_name, p.version`, [hash(rawToken), displayName, expectedVersion]);
    return result.rowCount ? { displayName: result.rows[0].display_name, version: result.rows[0].version } : null;
  }

  async settleMatch({ id = randomUUID(), resultKey, roomId = null, status = "completed", startedAt,
    endedAt = new Date(), summary = {}, participants = [] }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query(`
        INSERT INTO matches(id, room_id, status, started_at, ended_at, result_key, summary)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (result_key) DO NOTHING RETURNING id`,
      [id, roomId, status, startedAt, endedAt, resultKey, summary]);
      if (!inserted.rowCount) {
        await client.query("ROLLBACK");
        return { applied: false };
      }
      for (const participant of participants) await client.query(`
        INSERT INTO match_participants(match_id, user_id, team, outcome, disconnected)
        VALUES ($1, $2, $3, $4, $5)`,
      [id, participant.userId, participant.team, participant.outcome, !!participant.disconnected]);
      await client.query("COMMIT");
      return { applied: true, matchId: id };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async listMatches(rawToken, limit = 20) {
    const result = await this.pool.query(`
      SELECT m.id, m.room_id, m.status, m.started_at, m.ended_at, m.summary,
             mp.team, mp.outcome, mp.disconnected
      FROM sessions s JOIN match_participants mp ON mp.user_id = s.user_id
      JOIN matches m ON m.id = mp.match_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.rotated_at IS NULL
        AND s.expires_at > now()
      ORDER BY m.started_at DESC LIMIT $2`, [hash(rawToken), Math.min(50, Math.max(1, limit))]);
    return result.rows.map((row) => ({ id: row.id, roomId: row.room_id, status: row.status,
      startedAt: row.started_at, endedAt: row.ended_at, summary: row.summary, team: row.team,
      outcome: row.outcome, disconnected: row.disconnected }));
  }

  async recordConsent(rawToken) {
    const result = await this.pool.query(`UPDATE users u SET privacy_consent_at = COALESCE(privacy_consent_at, now())
      FROM sessions s WHERE s.user_id = u.id AND s.token_hash = $1 AND s.revoked_at IS NULL
      AND s.rotated_at IS NULL AND s.expires_at > now() RETURNING u.privacy_consent_at`, [hash(rawToken)]);
    return result.rows[0]?.privacy_consent_at || null;
  }

  async revoke(rawToken) {
    const result = await this.pool.query(`UPDATE sessions SET revoked_at = now()
      WHERE token_hash = $1 AND revoked_at IS NULL RETURNING id`, [hash(rawToken)]);
    return result.rowCount > 0;
  }

  async exportUser(rawToken) {
    const session = await this.authenticate(rawToken);
    if (!session) return null;
    const user = await this.pool.query(`SELECT id, kind, created_at, privacy_consent_at FROM users WHERE id = $1`,
      [session.user.id]);
    return { exportedAt: new Date().toISOString(), user: user.rows[0], profile: session.profile,
      matches: await this.listMatches(rawToken, 50) };
  }

  async deleteUser(rawToken) {
    const session = await this.authenticate(rawToken);
    if (!session) return false;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE sessions SET revoked_at = now() WHERE user_id = $1", [session.user.id]);
      await client.query("UPDATE profiles SET display_name = 'Deleted player', version = version + 1, updated_at = now() WHERE user_id = $1",
        [session.user.id]);
      await client.query("UPDATE users SET deleted_at = now() WHERE id = $1", [session.user.id]);
      await client.query("COMMIT");
      return true;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }

  async abandonStaleMatches(before) {
    const result = await this.pool.query(`UPDATE matches SET status = 'abandoned', ended_at = COALESCE(ended_at, now()),
      summary = COALESCE(summary, '{}'::jsonb) || '{"recovery":"process_restart"}'::jsonb
      WHERE status = 'playing' AND started_at < $1 RETURNING id`, [before]);
    return result.rowCount;
  }
}
