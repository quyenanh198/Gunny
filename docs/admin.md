# Admin, moderation and audit (R6, partial)

This covers the admin RBAC/sanctions/audit slice of R6. Remote config
rollout (feature-flag kill switches), maintenance mode/announcements and an
operator dashboard are **not** part of this slice — see "Known gaps" below.

## Granting the admin role

There is no UI or self-service API to become an admin, on purpose. An
operator runs `node scripts/promote-admin.mjs <userId> [admin|player]`
directly against the database (`DATABASE_URL` required). This keeps
"who can grant admin power" an out-of-band, auditable-by-git/ops-process step
rather than an in-app action with its own bootstrapping problem.

## Auth

Every `/api/admin/*` route (except the R3D report queue — see below) requires
a session belonging to a user with `role = 'admin'`, checked server-side via
`identityStore.getAdminSession()`. This replaces trusting a client-declared
role: the role lives in the `users` table, never in a token payload.

`GET`/`PATCH /api/admin/reports*` (R3D) additionally still accept the shared
`MODERATION_TOKEN` bearer, for ops/CI convenience. Neither auth path replaces
the other; an admin session is the individually-audited option, the token is
the coarse-grained one.

## Endpoints

- `GET /api/admin/users/:id` — aggregate view: profile, wallet balance,
  progression, last 10 matches, sanction history. Read-only, not audited
  (only mutating admin actions are).
- `POST /api/admin/sanctions` — `{ userId, type: "mute"|"ban", reason, expiresAt? }`.
  A `mute` is `active` immediately (single-admin, reversible, low-risk). A
  `ban` starts `pending_confirmation` and is **not enforced** until a second,
  different admin confirms it — dual-control for the highest-risk sanction.
- `POST /api/admin/sanctions/:id/confirm` — only valid for a
  `pending_confirmation` ban, and only by an admin other than the issuer
  (`409 CANNOT_CONFIRM` otherwise, including a same-admin retry).
- `POST /api/admin/sanctions/:id/revoke` — `{ reason? }`, valid for an
  `active` or still-`pending_confirmation` sanction.
- `GET /api/admin/sanctions?userId=` — a user's sanction history.
- `POST /api/admin/rooms/:id/terminate` — `{ reason? }`. Closes every
  connected socket in the room (`1008`) and closes the room.
- `GET /api/admin/actions` — the audit log (last 100), newest first.

Every mutating call above writes an `admin_actions` row: `adminUserId`,
`action`, `targetUserId`/`targetRoomId`, `reason`, `metadata`, `createdAt` —
this is what satisfies the R6 exit criteria "mọi thao tác admin quan trọng
truy được ai/lúc nào/lý do gì" (who/when/why for every important admin
action).

## Enforcement

- **Ban**: checked once, at WebSocket connect time, against
  `identityStore.isBanned(userId)`. A banned identity gets a `BANNED` error
  and the socket is closed immediately — it never reaches room join. HTTP
  identity/privacy endpoints (export, delete, session) are **not** blocked by
  a ban, so a banned player can still exercise their privacy rights.
- **Admin mute**: also checked once, at connect time, cached on the
  connection as `client.adminMuted`. A muted client's `chat` command is
  rejected server-side (`COMMAND_REJECTED`) before it ever reaches the room's
  chat buffer or the persisted audit log — the message never existed from
  anyone else's point of view. This is separate from and stacks with the
  player-level mute from R3D (`SocialSafety.setMute`), which only hides a
  sender from one specific viewer; an admin mute silences the sender for
  everyone.
- **Staleness**: both checks are point-in-time at connect, not continuously
  re-evaluated for an already-open socket. A ban or mute issued mid-session
  takes effect on that player's *next* connection, not retroactively against
  an already-open one. Acceptable for now because chat is already
  rate-limited and low-stakes; revisit if a faster in-session cutoff is
  needed later.

## Known gaps (rest of R6)

- No remote feature-flag rollout/kill-switch API. `src/content/feature-flags.js`
  still only reads deploy-time defaults; there is no runtime override or
  percentage rollout yet.
- No maintenance mode, announcement banner, or minimum client/protocol
  version gate.
- No operator dashboard (funnel, retention, queue time, disconnect rate,
  report rate). `/metrics` (R1C, Prometheus text) and `GET /api/admin/actions`
  are the only machine-readable views today.
- No admin UI — every endpoint above is API-only, driven by curl/scripts or a
  future internal tool.
