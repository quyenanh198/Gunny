# Social safety and moderation (R3D)

R3D closes R3 with player-controlled social safety and a minimal admin review path. It does not add account bans or RBAC; that is R6 scope.

## Player controls

- `POST /api/social/block` with `{ targetId, enabled }` blocks or unblocks another user. A block is mutual for matchmaking: neither side can be placed in the same ticket group, and the blocker stops seeing the target's chat.
- `POST /api/social/mute` with `{ targetId, enabled }` hides a target's chat from the caller only; it has no effect on matchmaking.
- `POST /api/social/report` with `{ targetId, roomId, category, details }` files a report. `category` is one of `chat`, `cheating`, `harassment`, `afk`, `other`; `details` is at most 500 characters. Self-reports are rejected.

Block/mute state loads into the in-process `SocialSafety` cache on session authentication (HTTP or WebSocket) and on matchmaking enqueue, so it is enforced immediately for the requesting identity without a reconnect.

## Chat pipeline

- Every room chat message is server-side profanity-filtered (`SocialSafety.sanitize`) before broadcast and before being persisted for audit.
- Persisted chat (`chat_messages`) is separate from the in-room rolling buffer (last 30 messages kept in `Room` for reconnect/spectator catch-up). Persisted rows default to a 7-day `expires_at` and are purged hourly by the PostgreSQL identity store in production (`pruneExpiredChat`); the in-memory store used for local/test runs is ephemeral and needs no purge job.
- A room's outbound snapshot filters chat history per recipient through `SocialSafety.canView`, so a blocked or muted sender's messages never reach the affected viewer, including on reconnect replay.

## Admin review queue

- `GET /api/admin/reports` lists open/reviewing reports, oldest first (max 100).
- `PATCH /api/admin/reports/:id` with `{ status: "reviewing" | "closed" }` transitions a report; a closed report cannot be reopened through this endpoint.
- Both endpoints require `Authorization: Bearer <MODERATION_TOKEN>`. `MODERATION_TOKEN` must be set for these routes to work at all — there is no default-allow fallback. This is a shared-secret gate, not per-admin identity; RBAC and audit-by-admin-identity are R6 deliverables.

## Known gaps carried to R6

- No mute/ban enforcement at the room or account level beyond client-side chat visibility.
- No admin identity/audit trail beyond the report's own status history.
- No automated profanity list management; `DEFAULT_TERMS` in `server/social-safety.js` is a minimal seed list, not a policy source of truth.
