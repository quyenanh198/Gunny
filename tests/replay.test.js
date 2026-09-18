import test from "node:test";
import assert from "node:assert/strict";
import { Match } from "../src/match.js";
import { DT } from "../src/physics.js";
import { Room } from "../server/room.js";
import { matchChecksum, applyCommand, replayMatch } from "../src/core/replay.js";

const config = () => ({ seed: 42, map: "sky", difficulty: "normal",
  teams: [{ humans: 1, bots: 0 }, { humans: 0, bots: 1 }] });

test("two matches built from the same seed and config start identical", () => {
  const a = new Match(config());
  const b = new Match(config());
  assert.equal(matchChecksum(a), matchChecksum(b));
});

test("replaying the same command log against a fresh match reproduces the exact same state", () => {
  const live = new Match(config());
  const commands = [
    { tick: 3, t: "aim", angle: 40 },
    { tick: 4, t: "charge" },
    { tick: 20, t: "release" },
  ];
  const byTick = new Map(commands.map((entry) => [entry.tick, entry]));
  const checksumLog = [];
  for (let tick = 0; tick < 60; tick++) {
    const entry = byTick.get(tick);
    if (entry) applyCommand(live, entry);
    live.update(DT);
    if ((tick + 1) % 10 === 0) checksumLog.push({ tick: tick + 1, checksum: matchChecksum(live) });
  }
  const replay = replayMatch({ config: config(), commands, totalTicks: 60, checksumLog });
  assert.equal(replay.divergedAt, null);
  assert.equal(replay.checksum, matchChecksum(live));
});

test("a different command in the log is caught as a divergence, not silently accepted", () => {
  const baseline = new Match(config());
  const commands = [{ tick: 3, t: "aim", angle: 40 }, { tick: 4, t: "charge" }, { tick: 20, t: "release" }];
  const checksumLog = [];
  for (let tick = 0; tick < 60; tick++) {
    const entry = commands.find((c) => c.tick === tick);
    if (entry) applyCommand(baseline, entry);
    baseline.update(DT);
    if ((tick + 1) % 10 === 0) checksumLog.push({ tick: tick + 1, checksum: matchChecksum(baseline) });
  }
  const divergent = [{ tick: 3, t: "aim", angle: 80 }, { tick: 4, t: "charge" }, { tick: 20, t: "release" }];
  const replay = replayMatch({ config: config(), commands: divergent, totalTicks: 60, checksumLog });
  assert.notEqual(replay.divergedAt, null, "a different aim angle must change the outcome and be detected");
});

const player = (id, team) => ({ id, userId: `user-${id}`, ws: { readyState: 0 }, connected: true,
  disconnectedAt: 0, reconnectToken: `token-${id}`, lastAckSeq: 0, team, ready: true, host: id === 1,
  character: "mochi", weapon: "carrot", name: `P${id}`, terrainVersion: -1, role: "player" });
const advance = (room, ticks) => { for (let i = 0; i < ticks; i++) { room.acc = 1 / 60; room.last = Date.now(); room.tick(); } };

test("a room's captured command log and checksum samples replay to the same final state", () => {
  const room = new Room("REPLAY1", () => {});
  const human = player(1, 0);
  try {
    room.join(human);
    human.team = 0;
    room.bots = [0, 1];
    assert.equal(room.start(), true);

    room.handle(human, { t: "aim", angle: 42 });
    advance(room, 2);
    room.handle(human, { t: "charge" });
    advance(room, 15);
    room.handle(human, { t: "release" });
    advance(room, 120);

    assert.ok(room.commandLog.length >= 3, "aim/charge/release must all have been logged");
    assert.ok(room.checksumLog.length >= 1, "at least one periodic checksum sample must have been captured");

    const replay = replayMatch({
      config: room.replayConfig(), commands: room.commandLog,
      totalTicks: room.serverTick, checksumLog: room.checksumLog,
    });
    assert.equal(replay.divergedAt, null, "the room's own live run must not diverge from its own log");
    assert.equal(replay.checksum, matchChecksum(room.match));
  } finally { room.close(); }
});
