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

The resulting private room reserves player seats for the matched user UUIDs, disables bots, and cannot start until every reserved player arrives. Presence/reconnect routing remains a separate R3 milestone.

## Party contract

- `POST /api/party`, `GET /api/party`, and `DELETE /api/party` create/read/leave the current identity's party.
- Leader creates a five-minute target-bound invite with `POST /api/party/invites`; the target accepts through `POST /api/party/invites/:id/accept`.
- Leader removes another member with `DELETE /api/party/members/:userId`. A leader who leaves transfers leadership to the earliest remaining member; the last member leaving disbands the party.
- Beta party capacity is two. Only the leader may enqueue/cancel its matchmaking ticket, and membership is locked while queued or matched.
- Matchmaking treats a party as an indivisible ticket and assigns every member to the same reserved team. It may combine a party with compatible solo tickets but never split it.

## Presence, reconnect and leaver policy

- `GET /api/presence` returns the authenticated user's state: `online`, `queued`, `matched`, `lobby`, `playing`, `spectating`, `reconnecting`, or `offline`, plus its room route when applicable.
- Socket loss publishes `reconnecting` for the existing 30-second resume grace. When that deadline expires, presence resolves to `offline` and the seat is removed by the room.
- A player removed after the grace period is marked as a leaver for the entire match. Reconnecting later cannot erase this fact from settlement.
- A disconnected player forfeits its turn after 30 seconds. Two such AFK turns eliminate that actor and mark it as a leaver; authoritative winner/settlement then follows normal rules.
- Matchmade rooms reject spectators with `SPECTATOR_DISABLED`. Direct rooms keep the existing maximum-six spectator policy.
