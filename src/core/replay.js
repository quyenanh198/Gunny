// Deterministic replay: reconstructs a Match from its seed/roster and a command
// log, and hashes gameplay-relevant state so two runs can be compared without
// caring about cosmetic-only fields (particles, trail, popups, animation).
import { createHash } from "node:crypto";
import { Match } from "../match.js";
import { DT } from "../physics.js";

const round2 = (n) => Math.round(n * 100) / 100;

// Canonical, order-stable snapshot of everything that affects the outcome of a
// match: actor combat state, terrain heights, turn/round bookkeeping and wind.
// Deliberately excludes particles/blasts/trail/popups/animation, which are
// visual-only and were the last source of non-determinism (see match.js).
export function matchDigestState(match) {
  return {
    round: match.round,
    turn: match.turn,
    phase: match.phase,
    wind: match.wind,
    time: round2(match.time),
    energy: round2(match.energy),
    terrain: match.terrain.map((y) => Math.round(y)),
    actors: match.actors.map((a) => ({
      team: a.team, control: a.control, hp: a.hp, ss: a.ss, weapon: a.weapon, skin: a.skin,
      x: round2(a.x), y: round2(a.y), angle: round2(a.angle),
    })),
  };
}

export function matchChecksum(match) {
  return createHash("sha256").update(JSON.stringify(matchDigestState(match))).digest("hex");
}

// Applies one logged command to a match exactly as server/room.js's `handle()`
// does for the gameplay message types it accepts. `entry.t` mirrors the client
// message's `t` field so a room's command log can be replayed verbatim.
export function applyCommand(match, entry) {
  switch (entry.t) {
    case "aim": match.setAim(entry.angle); return true;
    case "charge": match.beginCharge(); return true;
    case "release": match.release(); return true;
    case "cancel": match.cancelCharge(); return true;
    case "action": match.setAction({ shot: entry.shot, item: entry.item }); return true;
    case "keys":
      match.keys.clear();
      for (const key of entry.keys || []) match.keys.add(key);
      return true;
    default: return false;
  }
}

// Rebuilds a match from `config` (the same object Match's constructor takes)
// by ticking it `totalTicks` times at fixed `dt`, applying any commands whose
// `tick` matches the update about to run. `checksumLog` is an optional list of
// `{ tick, checksum }` samples (as produced during the live match) to compare
// against while replaying; `divergedAt` is the first tick where they differ,
// or null if the replay matches every sample.
export function replayMatch({ config, commands = [], totalTicks, checksumLog = [], dt = DT }) {
  const match = new Match(config);
  const byTick = new Map();
  for (const entry of commands) {
    if (!byTick.has(entry.tick)) byTick.set(entry.tick, []);
    byTick.get(entry.tick).push(entry);
  }
  const expected = new Map(checksumLog.map((sample) => [sample.tick, sample.checksum]));
  let divergedAt = null;
  for (let tick = 0; tick < totalTicks; tick++) {
    for (const entry of byTick.get(tick) || []) applyCommand(match, entry);
    match.update(dt);
    const nextTick = tick + 1;
    const want = expected.get(nextTick);
    if (want !== undefined && divergedAt === null && matchChecksum(match) !== want) divergedAt = nextTick;
  }
  return { match, checksum: matchChecksum(match), divergedAt };
}
