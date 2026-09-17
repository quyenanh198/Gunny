# Matchmaking contract

R3A exposes an authenticated, server-owned queue:

- `POST /api/matchmaking/enqueue` with `{ mode, region, teamSize, protocolVersion }`.
- `GET /api/matchmaking/status` to poll the current identity's ticket.
- `DELETE /api/matchmaking/queue` to cancel a ticket that is still queued.

Supported beta pools are `casual-1v1`/team size 1 and `casual-2v2`/team size 2, in `na`, `eu`, or `ap`. Protocol version must equal the running server version. Enqueue is idempotent per identity, and a matched ticket cannot be cancelled.

## SLA and widening

- Exact mode, region, team size and protocol matches immediately when enough solo players exist.
- After every participant has waited 15 seconds, region may widen to `global`; mode, team size and protocol never widen.
- Clients poll status at most once per second. The beta target is assignment within 1 second of enough compatible players becoming available.
- Matched/cancelled tickets are retained for 120 seconds. Empty reserved rooms use the normal room TTL.

The resulting private room reserves player seats for the matched user UUIDs, disables bots, and cannot start until every reserved player arrives. Party atomicity and presence/reconnect routing are separate R3 milestones.
