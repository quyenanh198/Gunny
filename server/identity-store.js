import { createHash, randomBytes, randomUUID } from "node:crypto";
import { rewardFor, levelForXp } from "./economy.js";

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

  async beginMatch({ id, roomId, startedAt, participants }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`INSERT INTO matches(id, room_id, status, started_at)
        VALUES ($1, $2, 'playing', $3)`, [id, roomId, startedAt]);
      for (const participant of participants) await client.query(`
        INSERT INTO match_participants(match_id, user_id, team, disconnected)
        VALUES ($1, $2, $3, false)`, [id, participant.userId, participant.team]);
      await client.query("COMMIT");
      return { applied: true, matchId: id };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async completeMatch({ id, resultKey, status = "completed", endedAt = new Date(), summary, participants }) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(`UPDATE matches SET status = $2, ended_at = $3,
        result_key = $4, summary = $5 WHERE id = $1 AND status = 'playing' RETURNING id`,
      [id, status, endedAt, resultKey, summary]);
      if (!updated.rowCount) {
        await client.query("ROLLBACK");
        return { applied: false };
      }
      for (const participant of participants) await client.query(`UPDATE match_participants
        SET outcome = $3, disconnected = $4 WHERE match_id = $1 AND user_id = $2`,
      [id, participant.userId, participant.outcome, !!participant.disconnected]);
      // Reward settlement lives in the same transaction as the match/participant
      // write it is derived from: either both commit or neither does, so a
      // crash mid-settlement can never leave a paid-out reward for a match
      // that didn't actually finalize (or vice versa).
      for (const participant of participants) {
        const reward = rewardFor(participant, status);
        if (reward.currency) await client.query(`INSERT INTO currency_ledger(id, user_id, amount, reason, request_id, match_id)
          VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (user_id, request_id) DO NOTHING`,
        [randomUUID(), participant.userId, reward.currency, `match_${participant.outcome}`, `match:${id}:${participant.userId}`, id]);
        if (reward.xp) await client.query(`INSERT INTO progression(user_id, xp, level) VALUES ($1, $2, $3)
          ON CONFLICT (user_id) DO UPDATE SET xp = progression.xp + EXCLUDED.xp,
            level = floor((progression.xp + EXCLUDED.xp) / 100.0) + 1, updated_at = now()`,
        [participant.userId, reward.xp, levelForXp(reward.xp)]);
      }
      await client.query("COMMIT");
      return { applied: true, matchId: id };
    } catch (error) {
      await client.query("ROLLBACK");
      if (error.code === "23505") return { applied: false };
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

  async loadSocial(userId) {
    const [blocks, mutes] = await Promise.all([
      this.pool.query("SELECT blocker_id, blocked_id FROM user_blocks WHERE blocker_id = $1 OR blocked_id = $1", [userId]),
      this.pool.query("SELECT muted_id FROM user_mutes WHERE user_id = $1", [userId]),
    ]);
    return { blocks: blocks.rows.map((row) => [row.blocker_id, row.blocked_id]),
      mutes: mutes.rows.map((row) => row.muted_id) };
  }
  async setBlock(userId, targetId, enabled) {
    if (enabled) await this.pool.query(`INSERT INTO user_blocks(blocker_id, blocked_id) VALUES ($1, $2)
      ON CONFLICT DO NOTHING`, [userId, targetId]);
    else await this.pool.query("DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2", [userId, targetId]);
  }
  async setMute(userId, targetId, enabled) {
    if (enabled) await this.pool.query(`INSERT INTO user_mutes(user_id, muted_id) VALUES ($1, $2)
      ON CONFLICT DO NOTHING`, [userId, targetId]);
    else await this.pool.query("DELETE FROM user_mutes WHERE user_id = $1 AND muted_id = $2", [userId, targetId]);
  }
  async createReport(report) {
    await this.pool.query(`INSERT INTO moderation_reports(id, reporter_id, target_id, room_id, category, details)
      VALUES ($1, $2, $3, $4, $5, $6)`, [report.id, report.reporterId, report.targetId,
      report.roomId, report.category, report.details]);
  }
  async recordChat(message) {
    await this.pool.query(`INSERT INTO chat_messages(id, room_id, sender_id, text)
      VALUES ($1, $2, $3, $4)`, [message.id, message.roomId, message.senderId, message.text]);
  }
  async listOpenReports(limit = 100) {
    const result = await this.pool.query(`SELECT id, reporter_id, target_id, room_id, category, details, status, created_at
      FROM moderation_reports WHERE status IN ('open', 'reviewing') ORDER BY created_at ASC LIMIT $1`,
    [Math.min(100, Math.max(1, limit))]);
    return result.rows;
  }
  async updateReportStatus(id, status) {
    const result = await this.pool.query(`UPDATE moderation_reports SET status = $2
      WHERE id = $1 AND status <> 'closed'
      RETURNING id, reporter_id, target_id, room_id, category, details, status, created_at`, [id, status]);
    return result.rows[0] || null;
  }
  async pruneExpiredChat() {
    const result = await this.pool.query("DELETE FROM chat_messages WHERE expires_at < now() RETURNING id");
    return result.rowCount;
  }
  // Currency has no direct-write API by design: every ledger row is created
  // by completeMatch() above, inside the same transaction as the match
  // result it pays out for. These are read-only.
  async getWallet(rawToken) {
    const session = await this.authenticate(rawToken);
    if (!session) return null;
    const result = await this.pool.query(
      "SELECT COALESCE(SUM(amount), 0) AS balance FROM currency_ledger WHERE user_id = $1", [session.user.id]);
    return { balance: Number(result.rows[0].balance) };
  }
  async getLedger(rawToken, limit = 50) {
    const session = await this.authenticate(rawToken);
    if (!session) return null;
    const result = await this.pool.query(`SELECT id, amount, reason, match_id, created_at FROM currency_ledger
      WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`, [session.user.id, Math.min(100, Math.max(1, limit))]);
    return result.rows.map((row) => ({ id: row.id, amount: row.amount, reason: row.reason,
      matchId: row.match_id, createdAt: row.created_at }));
  }
  async getProgression(rawToken) {
    const session = await this.authenticate(rawToken);
    if (!session) return null;
    const result = await this.pool.query("SELECT xp, level FROM progression WHERE user_id = $1", [session.user.id]);
    return result.rows[0] ? { xp: result.rows[0].xp, level: result.rows[0].level } : { xp: 0, level: 1 };
  }

  // --- Admin RBAC, sanctions and audit (R6) ---------------------------------

  async getAdminSession(rawToken) {
    const session = await this.authenticate(rawToken);
    if (!session) return null;
    const result = await this.pool.query("SELECT role FROM users WHERE id = $1", [session.user.id]);
    return result.rows[0]?.role === "admin" ? session : null;
  }
  async setUserRole(userId, role) {
    await this.pool.query("UPDATE users SET role = $2 WHERE id = $1", [userId, role]);
  }
  async createSanction({ userId, type, reason, issuedBy, expiresAt = null }) {
    const id = randomUUID();
    const status = type === "ban" ? "pending_confirmation" : "active";
    await this.pool.query(`INSERT INTO sanctions(id, user_id, type, reason, status, issued_by, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)`, [id, userId, type, reason, status, issuedBy, expiresAt]);
    return { id, userId, type, reason, status, issuedBy, expiresAt };
  }
  async confirmSanction(id, confirmedBy) {
    const result = await this.pool.query(`UPDATE sanctions SET status = 'active', confirmed_by = $2
      WHERE id = $1 AND status = 'pending_confirmation' AND issued_by <> $2 RETURNING *`, [id, confirmedBy]);
    return result.rows[0] || null;
  }
  async revokeSanction(id, revokedBy) {
    const result = await this.pool.query(`UPDATE sanctions SET status = 'revoked', revoked_by = $2, revoked_at = now()
      WHERE id = $1 AND status IN ('active', 'pending_confirmation') RETURNING *`, [id, revokedBy]);
    return result.rows[0] || null;
  }
  async listSanctions(userId) {
    const result = await this.pool.query("SELECT * FROM sanctions WHERE user_id = $1 ORDER BY created_at DESC", [userId]);
    return result.rows;
  }
  async isBanned(userId) {
    const result = await this.pool.query(`SELECT 1 FROM sanctions WHERE user_id = $1 AND type = 'ban'
      AND status = 'active' AND (expires_at IS NULL OR expires_at > now()) LIMIT 1`, [userId]);
    return result.rowCount > 0;
  }
  async isMuted(userId) {
    const result = await this.pool.query(`SELECT 1 FROM sanctions WHERE user_id = $1 AND type = 'mute'
      AND status = 'active' AND (expires_at IS NULL OR expires_at > now()) LIMIT 1`, [userId]);
    return result.rowCount > 0;
  }
  async recordAdminAction({ adminUserId, action, targetUserId = null, targetRoomId = null, reason = null, metadata = null }) {
    const id = randomUUID();
    await this.pool.query(`INSERT INTO admin_actions(id, admin_user_id, action, target_user_id, target_room_id, reason, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, adminUserId, action, targetUserId, targetRoomId, reason, metadata ? JSON.stringify(metadata) : null]);
    return { id, adminUserId, action, targetUserId, targetRoomId, reason, metadata };
  }
  async listAdminActions(limit = 100) {
    const result = await this.pool.query("SELECT * FROM admin_actions ORDER BY created_at DESC LIMIT $1",
      [Math.min(200, Math.max(1, limit))]);
    return result.rows;
  }
  async lookupUser(userId) {
    const profile = await this.pool.query(`SELECT u.id, u.kind, u.role, u.created_at, u.deleted_at,
      p.display_name, p.version FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.id = $1`, [userId]);
    if (!profile.rowCount) return null;
    const [wallet, progression, matches, sanctions] = await Promise.all([
      this.pool.query("SELECT COALESCE(SUM(amount), 0) AS balance FROM currency_ledger WHERE user_id = $1", [userId]),
      this.pool.query("SELECT xp, level FROM progression WHERE user_id = $1", [userId]),
      this.pool.query(`SELECT m.id, m.room_id, m.status, m.started_at, m.ended_at FROM matches m
        JOIN match_participants mp ON mp.match_id = m.id WHERE mp.user_id = $1 ORDER BY m.started_at DESC LIMIT 10`, [userId]),
      this.listSanctions(userId),
    ]);
    return {
      user: profile.rows[0],
      wallet: { balance: Number(wallet.rows[0].balance) },
      progression: progression.rows[0] || { xp: 0, level: 1 },
      recentMatches: matches.rows,
      sanctions,
    };
  }
}
