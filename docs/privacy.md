# Privacy baseline

## Data collected

- Guest UUID, display name, session timestamps and consent timestamp.
- Match summary, team/outcome and disconnect flag required for history and abuse investigation.
- Operational logs must not contain bearer/reconnect tokens or full database URLs.

No email, OAuth identity or password is collected in the guest-only milestone.

## Player controls

- `POST /api/privacy/consent` records the first consent timestamp.
- `GET /api/privacy/export` returns profile and up to 50 recent match records for the authenticated user.
- `DELETE /api/session` revokes the current bearer session.
- `DELETE /api/account` revokes every session, marks the user deleted and replaces the display name. Match facts remain pseudonymized for integrity and abuse review.

## Retention

- Expired/revoked sessions: purge after 30 days.
- Completed match summaries: retain 180 days for beta unless legal/abuse hold applies.
- Deleted-user match facts: retain at most the same 180-day match window; do not restore identity or profile.
- Aggregated metrics without player identifiers may be retained longer.

Retention purge automation is an operations deliverable before public launch (R7/R8). Until then, operators run an audited scheduled database job and record deletions.
