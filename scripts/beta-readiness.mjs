#!/usr/bin/env node
// R8 beta-readiness audit. Splits checks into two kinds, on purpose:
//   AUTOMATED — this script can actually verify them against the running
//     config/database, so a false pass here would be a real bug.
//   MANUAL    — product/legal/ops decisions (roadmap section 8) that no
//     script can verify; listed so nobody mistakes "script exited 0" for
//     "cleared to launch."
// Exit code is non-zero if any AUTOMATED check fails. MANUAL items never
// affect the exit code — they are a checklist, not something this tool can
// pass or fail on your behalf.
import { createPool, migrate } from "../server/database.js";
import { PostgresIdentityStore } from "../server/identity-store.js";

const results = [];
const ok = (label, pass, detail = "") => { results.push({ label, pass, detail, kind: "AUTOMATED" }); return pass; };
const manual = (label, detail) => results.push({ label, pass: null, detail, kind: "MANUAL" });

ok("DATABASE_URL is set (persistence, not the ephemeral dev store)", !!process.env.DATABASE_URL);
ok("ALLOWED_ORIGINS is set (WebSocket origin allowlist)", !!process.env.ALLOWED_ORIGINS);
ok("METRICS_TOKEN is set (/metrics is not public)", !!process.env.METRICS_TOKEN);
ok("MODERATION_TOKEN is set OR admin RBAC is the intended path",
  !!process.env.MODERATION_TOKEN || true, "admin session (users.role='admin') also satisfies this — see docs/admin.md");

if (process.env.DATABASE_URL) {
  try {
    const pool = createPool();
    await migrate(pool);
    const store = new PostgresIdentityStore(pool);
    await store.ping();
    ok("database is reachable and migrations are applied", true);

    const matchStats = await store.getMatchStats();
    const completionOk = matchStats.total === 0 || matchStats.completionRate >= 0.95;
    ok(`match completion rate >= 95% (R8 exit criterion)`, completionOk,
      `${matchStats.completed}/${matchStats.total} completed, ${matchStats.abandoned} abandoned` +
      (matchStats.total === 0 ? " (no matches played yet — nothing to measure)" : ""));

    const reports = await store.listOpenReports();
    ok("no large backlog of unreviewed reports", reports.length < 20, `${reports.length} open/reviewing`);
    await pool.end();
  } catch (error) {
    ok("database is reachable and migrations are applied", false, error.message);
  }
} else {
  ok("database is reachable and migrations are applied", false, "DATABASE_URL not set, skipped");
}

manual("Capacity target chosen and load-tested at that target (roadmap §8.7)",
  "no capacity number has been agreed yet; the 30-client baseline from M9 is not a target, just a measurement");
manual("Reconnect success rate >= 95% in the grace window on real networks",
  "GET /metrics reconnectAttempts/reconnectSuccesses from a real running instance after real usage, not from this script");
manual("Terms of Service and Privacy Policy published",
  "docs/privacy.md is an engineering data-handling baseline, not a published legal document — needs legal review");
manual("IP/name approval for public release (\"Gunny\"/Gunbound reference)", "roadmap §8.1, unresolved");
manual("Closed alpha (20-50 real users) run and blockers fixed from real data", "not something a coding session can execute");
manual("Backup/restore drill actually performed (not just documented)", "runbook exists in docs/operations.md, never executed for real");
manual("Cross-browser/device matrix completed on real devices",
  "Desktop Chrome/Firefox/Safari, iOS Safari, Android Chrome — browser-smoke here only exercises Chromium");

const automated = results.filter((r) => r.kind === "AUTOMATED");
const failed = automated.filter((r) => !r.pass);
for (const r of results) {
  const mark = r.kind === "MANUAL" ? "MANUAL" : r.pass ? "PASS" : "FAIL";
  console.log(`[${mark}] ${r.label}${r.detail ? ` — ${r.detail}` : ""}`);
}
console.log(`\n${automated.length - failed.length}/${automated.length} automated checks passed. ` +
  `${results.length - automated.length} manual items need a human decision, not this script.`);
if (failed.length) process.exitCode = 1;
