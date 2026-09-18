# Combat engine, replay and content pipeline (R4)

R4 is a partial milestone: the existing combat core is kept and the
determinism/tooling gaps around it are closed, but no new map, weapon,
character or item is added (the roadmap's "vertical slice first" rule).

## Module split

`src/match.js`'s `Match` class is the state machine/orchestration layer
(phases: `aim` → `flight` → `settle` → `over`/next turn). Pure combat math is
already split out:

- `src/core/combat.js` — shot/item rules, explosion resolution, SS gain.
- `src/core/turn-queue.js` — delay-based turn order (`TurnQueue`).
- `src/core/bot.js` — bot action/shot selection, seeded via `match.random`.
- `src/core/match-config.js` — constants, the `mulberry32` PRNG, roster normalisation.
- `src/physics.js` — trajectory, collision, terrain crater/slope math.

There is no dedicated terrain module yet (terrain mutation stays split between
`physics.js` and `Match.explode`) and no formal command/snapshot envelope —
`Room.snapshot()` remains the de facto snapshot shape and commands are plain
method calls. Both are still open for a future pass.

## Deterministic replay and checksums

`src/core/replay.js`:

- `matchChecksum(match)` hashes only gameplay-relevant state — actor
  team/control/hp/ss/weapon/skin/position/angle, terrain heights, turn, round,
  phase, wind, time, energy. Cosmetic fields (particles, blasts, trail,
  popups, animation) are excluded on purpose so two runs that look different
  for a frame but are gameplay-identical still match.
- `applyCommand(match, entry)` applies one logged command (`aim`, `charge`,
  `release`, `cancel`, `action`, `keys`) the same way `server/room.js`'s
  `handle()` does.
- `replayMatch({ config, commands, totalTicks, checksumLog, dt })` rebuilds a
  fresh `Match` from `config` (the same shape `Match`'s constructor takes —
  `Room.replayConfig()` produces it from a live room) and ticks it
  `totalTicks` times, applying queued commands at their logged tick before
  each `update()`. If `checksumLog` (periodic `{ tick, checksum }` samples) is
  given, the replay compares against it and reports `divergedAt`, the first
  tick where it no longer matches — this is the "detect divergence" half of
  the R4 requirement, exercised end-to-end in `tests/replay.test.js`.

`Room` (server/room.js) now captures this automatically for whatever match is
currently playing:

- `room.commandLog` — every accepted `aim`/`charge`/`release`/`cancel`/`action`/`keys`
  command, tagged with the `serverTick` it was applied on. Capped at 20,000
  entries and cleared on `start()`/`restart()`.
- `room.checksumLog` — one `matchChecksum()` sample per second of match time
  (every 60 ticks), capped at 600 samples (~10 minutes), also cleared on
  `start()`/`restart()`.
- `room.replayConfig()` returns the `{ seed, map, difficulty, roster }` needed
  to reconstruct that same match with `replayMatch()`.

This is intentionally in-memory and per-match only — there is no HTTP endpoint
to fetch a room's replay data yet, and nothing persists it past the room's
lifetime. Anti-cheat/incident tooling that wants to keep this after a match
ends is R6 (admin) work: snapshot `commandLog`/`checksumLog` into the match
record at `finalizeMatch()` time and add an authenticated admin endpoint to
fetch it.

**Determinism note**: two `Math.random()` calls in `match.js` (explosion
particle velocity/angle, projectile trail sampling) were switched to
`this.random()` — the match's seeded PRNG — so a fully-seeded match is
reproducible byte-for-byte, not just in gameplay outcome. Both were cosmetic;
this changes visuals' random distribution, not gameplay.

## Content schema (`src/content/schema.js`)

`CONTENT_VERSION` plus `validateContent({ characters, weapons, maps })` /
`validateContentOrThrow(...)` check the shape every character/weapon/map must
have (non-empty strings, valid angle ranges, spawn zones, a `createTerrain`
function, unique ids per kind). `tests/content-schema.test.js` runs this
against the actual shipped `CHARACTERS`/`WEAPONS`/`MAPS` as a required test —
today "reject content before deploy" means "this test is part of `npm test`",
since content is bundled JS rather than a runtime-loaded asset. There is no
migration runner: the version number is a marker for future schema changes,
not a working migration path yet — build one when a field is actually
renamed or reinterpreted.

## Balance simulator (`scripts/balance-simulator.mjs`)

Headless, no server/browser: drives `Match` directly through thousands of
bot-vs-bot matches (deterministic per seed) sweeping character/weapon/map
combinations, and prints a JSON report — win rate by skin and by weapon,
per-map win rate/avg rounds/avg damage, first-turn advantage, average
rounds/ticks/damage per match, and a `timedOut` counter (matches that hit a
200,000-tick safety valve without reaching `"over"`, which would indicate a
stuck match and fails the run with a non-zero exit code).

Run with `npm run benchmark:balance [matchCount]` (default 300 matches, about
25s). It is not part of `npm test`/`npm run verify` — like
`benchmark:load`, it is a manual/CI-optional tool, not a required gate yet.
Wiring a balance regression threshold into CI is future work once there is an
agreed acceptable variance per character/weapon.
