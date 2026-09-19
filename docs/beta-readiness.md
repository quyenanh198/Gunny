# R8 beta readiness

R8 is "closed alpha → online beta." Almost none of it is code: it's running a
real alpha with real people, making product/legal decisions, and executing
drills that only mean something on real infrastructure. This document is the
checklist; `scripts/beta-readiness.mjs` automates the slice of it that's
actually machine-checkable, and refuses to pretend about the rest.

Run it against a real deployment: `DATABASE_URL=... node scripts/beta-readiness.mjs`.

## What the script checks (automated, can genuinely fail)

- `DATABASE_URL`, `ALLOWED_ORIGINS`, `METRICS_TOKEN` are set — the difference
  between a dev toy and a deployment that isn't leaking metrics or accepting
  any origin's WebSocket.
- Database reachable, migrations applied (`identityStore.ping()`, `migrate()`).
- Match completion rate ≥ 95% (`getMatchStats()` — the R8 exit criterion,
  read from real `matches` rows, not guessed).
- Open report backlog isn't piling up unreviewed.

## What no script can check (manual, needs a human decision)

Pulled directly from `ONLINE_GAME_ROADMAP.md` R8 and section 8:

1. **Capacity target and load test at that target** (§8.7) — nobody has
   picked a number yet. The 30-client baseline from M9 is a measurement, not
   a target. Load-testing "capacity đã công bố" is meaningless until a
   number is chosen.
2. **Reconnect success rate ≥ 95%** on real, varied networks — `/metrics`
   now tracks `reconnectAttempts`/`reconnectSuccesses` cumulatively (R8), but
   that number is only meaningful after real usage on a real deployment, not
   from a script running against an empty dev server.
3. **Terms of Service and Privacy Policy published.** `docs/privacy.md` is
   an engineering data-handling baseline (what's collected, retention
   windows, player controls) — it has never been legal-reviewed and isn't
   phrased as a legal document a player agrees to. Don't ship it as one
   without that review.
4. **IP/name approval** (§8.1) — Chủ dự án đã chốt tên chính thức là "Gunny" (quyết định ngày 2026-09-18).
5. **Closed alpha with 20–50 real people, run and iterated on from their
   data** — the actual point of R8. No amount of code changes this.
6. **Backup/restore drill performed for real.** The runbook in
   `docs/operations.md` describes the `pg_dump`/`pg_restore` procedure; it
   has never been executed against a real database by a real operator.
7. **Cross-browser/device matrix on real hardware** — desktop Chrome/
   Firefox/Safari, iOS Safari, Android Chrome. `npm run verify`'s browser
   smoke only exercises Chromium (confirmed working in this environment as
   of R7 — see `HANDOFF.md` M25 — but that's one engine on one platform).

## Beta exit criteria, status as of R7

| Criterion | Status |
|---|---|
| ≥95% matches start-to-completion or valid outcome | Measurable now (`getMatchStats`); not yet measured on a real run |
| ≥95% reconnect success in grace window | Measurable now (`/metrics`); not yet measured on a real run |
| No open severity-1 bug; restore/rollback drilled | Restore/rollback not drilled for real |
| Completes a match on Desktop Chrome/Firefox/Safari, iOS Safari, Android Chrome | Only Chromium verified |
| Terms/Privacy, contact/support, moderation flow, IP/name approval | Contact/support exists (`POST /api/support/feedback`, R8); moderation flow exists (R3D–R6); IP/name approval đã chốt là "Gunny"; Terms/Privacy chờ duyệt pháp lý |

Do not move R8 to "in progress" in the roadmap based on this document alone —
it's a checklist and a measurement tool, not a launch decision.
