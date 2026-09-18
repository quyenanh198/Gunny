import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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
    assert.ok(await restartedStore.recordConsent(created.token));
    const exported = await restartedStore.exportUser(created.token);
    assert.equal(exported.user.id, created.user.id);
    assert.equal(exported.matches.length, 1);

    const rotated = await restartedStore.rotate(created.token);
    assert.equal(rotated.user.id, created.user.id);
    assert.equal(await restartedStore.authenticate(created.token), null);
    assert.equal((await restartedStore.authenticate(rotated.token)).profile.displayName, "Renamed");
    assert.equal(await restartedStore.rotate(created.token), null, "rotated token cannot be replayed");
    assert.equal(await restartedStore.deleteUser(rotated.token), true);
    assert.equal(await restartedStore.authenticate(rotated.token), null);
  } finally {
    await restartedPool.query("DELETE FROM matches WHERE result_key = $1", [`result-${created.user.id}`]);
    await restartedPool.query("DELETE FROM users WHERE id = $1", [created.user.id]);
    await restartedPool.end();
  }
});

test("PostgreSQL recovery abandons stale playing matches only", { skip: !databaseUrl }, async () => {
  const pool = createPool(databaseUrl);
  await migrate(pool);
  const store = new PostgresIdentityStore(pool);
  const staleId = randomUUID();
  const freshId = randomUUID();
  try {
    await pool.query(`INSERT INTO matches(id, status, started_at, result_key) VALUES
      ($1, 'playing', now() - interval '10 minutes', $3), ($2, 'playing', now(), $4)`,
    [staleId, freshId, `stale-${staleId}`, `fresh-${freshId}`]);
    assert.equal(await store.abandonStaleMatches(new Date(Date.now() - 5 * 60 * 1000)), 1);
    const rows = await pool.query("SELECT id, status, summary FROM matches WHERE id = ANY($1::uuid[]) ORDER BY id",
      [[staleId, freshId]]);
    assert.equal(rows.rows.find((row) => row.id === staleId).status, "abandoned");
    assert.equal(rows.rows.find((row) => row.id === staleId).summary.recovery, "process_restart");
    assert.equal(rows.rows.find((row) => row.id === freshId).status, "playing");
  } finally {
    await pool.query("DELETE FROM matches WHERE id = ANY($1::uuid[])", [[staleId, freshId]]);
    await pool.end();
  }
});

test("PostgreSQL admin RBAC enforces dual-control on a ban and audits every action", { skip: !databaseUrl }, async () => {
  const pool = createPool(databaseUrl);
  await migrate(pool);
  const store = new PostgresIdentityStore(pool);
  const adminA = await store.createGuest("Admin A");
  const adminB = await store.createGuest("Admin B");
  const target = await store.createGuest("Target");
  try {
    await store.setUserRole(adminA.user.id, "admin");
    await store.setUserRole(adminB.user.id, "admin");
    assert.equal(await store.getAdminSession(adminA.token) !== null, true);
    assert.equal(await store.getAdminSession(target.token), null);

    const sanction = await store.createSanction({ userId: target.user.id, type: "ban", reason: "cheating", issuedBy: adminA.user.id });
    assert.equal(sanction.status, "pending_confirmation");
    assert.equal(await store.isBanned(target.user.id), false);
    assert.equal(await store.confirmSanction(sanction.id, adminA.user.id), null, "issuer cannot confirm their own ban");
    const confirmed = await store.confirmSanction(sanction.id, adminB.user.id);
    assert.equal(confirmed.status, "active");
    assert.equal(await store.isBanned(target.user.id), true);

    await store.recordAdminAction({ adminUserId: adminA.user.id, action: "sanction_create",
      targetUserId: target.user.id, reason: "cheating", metadata: { sanctionId: sanction.id } });
    const actions = await store.listAdminActions();
    assert.ok(actions.some((a) => a.action === "sanction_create" && a.target_user_id === target.user.id));

    const profile = await store.lookupUser(target.user.id);
    assert.equal(profile.sanctions.length, 1);
    assert.equal(profile.sanctions[0].status, "active");

    const revoked = await store.revokeSanction(sanction.id, adminA.user.id);
    assert.equal(revoked.status, "revoked");
    assert.equal(await store.isBanned(target.user.id), false);
  } finally {
    await pool.query("DELETE FROM admin_actions WHERE admin_user_id = ANY($1::uuid[])", [[adminA.user.id, adminB.user.id]]);
    await pool.query("DELETE FROM sanctions WHERE user_id = $1", [target.user.id]);
    await pool.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [[adminA.user.id, adminB.user.id, target.user.id]]);
    await pool.end();
  }
});

test("PostgreSQL authoritative lifecycle completes a playing match exactly once", { skip: !databaseUrl }, async () => {
  const pool = createPool(databaseUrl);
  await migrate(pool);
  const store = new PostgresIdentityStore(pool);
  const first = await store.createGuest("Lifecycle One");
  const second = await store.createGuest("Lifecycle Two");
  const id = randomUUID();
  const participants = [{ userId: first.user.id, team: 0 }, { userId: second.user.id, team: 1 }];
  try {
    assert.equal((await store.beginMatch({ id, roomId: "LIFE01", startedAt: new Date(), participants })).applied, true);
    const result = { id, resultKey: `match:${id}`, status: "completed", summary: { winnerTeam: 0 },
      participants: [{ userId: first.user.id, outcome: "win", disconnected: false },
        { userId: second.user.id, outcome: "loss", disconnected: true }] };
    assert.equal((await store.completeMatch(result)).applied, true);
    assert.deepEqual(await store.completeMatch(result), { applied: false });
    const history = await store.listMatches(first.token);
    assert.equal(history[0].outcome, "win");
    const otherHistory = await store.listMatches(second.token);
    assert.equal(otherHistory[0].disconnected, true);

    // Reward settlement rides in the same transaction as the match result (R5).
    assert.deepEqual(await store.getWallet(first.token), { balance: 20 });
    assert.deepEqual(await store.getProgression(first.token), { xp: 30, level: 1 });
    const ledger = await store.getLedger(first.token);
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0].matchId, id);
    assert.deepEqual(await store.getWallet(second.token), { balance: 0 }, "disconnected loser earns nothing");
    assert.deepEqual(await store.getProgression(second.token), { xp: 0, level: 1 });
  } finally {
    await pool.query("DELETE FROM currency_ledger WHERE user_id = ANY($1::uuid[])", [[first.user.id, second.user.id]]);
    await pool.query("DELETE FROM progression WHERE user_id = ANY($1::uuid[])", [[first.user.id, second.user.id]]);
    await pool.query("DELETE FROM matches WHERE id = $1", [id]);
    await pool.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [[first.user.id, second.user.id]]);
    await pool.end();
  }
});
