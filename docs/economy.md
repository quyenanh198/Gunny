# Progression and economy (R5)

R5 ships the ledger/reward infrastructure, not a finished game economy. There
is still no shop, no cosmetic catalog and no spend path — that is a product
decision (roadmap section 8, item 5/6) that hasn't been made yet.

## What exists

- **Currency ledger** (`currency_ledger`): append-only, one row per grant,
  `(user_id, request_id)` unique so a retried settlement can never pay twice.
  A wallet balance is never stored directly — `GET /api/economy/wallet`
  computes it as `SUM(amount)` over the ledger, so the ledger is the single
  source of truth and can always be reconciled by re-summing it.
- **Progression** (`progression`): `xp` and a `level` derived from it with a
  flat placeholder curve (`levelForXp` in `server/economy.js`, 100 xp/level).
  Not balance-tuned; change the curve in one place when product has a real
  one.
- **Entitlements** (`entitlements`): table exists as a scaffold for future
  cosmetic unlocks. Nothing grants into it yet — there is no cosmetic catalog
  to entitle against, so `GET /api/economy/inventory` doesn't exist either
  until there's content worth returning.
- Read-only API: `GET /api/economy/wallet`, `GET /api/economy/ledger` (last
  50 entries), `GET /api/economy/progression`. All require a valid session.

## How rewards are granted

There is no write endpoint for currency or xp, on purpose — every ledger row
and progression update is created by `completeMatch()` in
`server/identity-store.js` (and its `MemoryIdentityStore` counterpart for
dev/test), inside the exact same transaction as the match result it pays out
for. A client cannot grant itself currency by calling an API, because there
is no API that does that; only the server-authoritative match settlement path
(R2E) can trigger it. See `server/economy.js` for the reward table:

| outcome | xp | currency |
|---|---|---|
| win | 30 | 20 |
| loss | 10 | 5 |
| draw | 15 | 10 |
| disconnected participant, any outcome | 0 | 0 |
| any participant of an `abandoned` match | 0 | 0 |

The last two rows are the anti-AFK/farm rule the roadmap asks for: leaving a
match or getting it abandoned never pays out, so there's no way to farm
currency by disconnecting out of a losing match or repeatedly abandoning
matches.

## Fairness

No reward here affects combat power — it's currency and xp with nothing to
spend them on yet. When a shop or cosmetic catalog is designed, the roadmap's
existing rule stands: cosmetic-only, no pay-to-win, same combat power for
free and paying players in competitive modes. That rule doesn't need new code
today because there is nothing to violate it with yet; it constrains what
gets built next, not what's here now.

## Known gaps

- No inventory/entitlement API or content — nothing to grant yet.
- No daily/weekly missions — the roadmap asks for them, but a mission catalog
  is content/product design, not infrastructure; this milestone intentionally
  stops at the reward/ledger mechanism a mission system would sit on top of.
- No economy reconciliation job or dashboard — `SUM(currency_ledger)` per
  user is always correct by construction, but there's no operator-facing
  report yet (R7 territory).
- Level curve and reward amounts are placeholders, not balance-tuned or
  approved by product.
