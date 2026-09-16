import test from "node:test";
import assert from "node:assert/strict";
import { LocalSession } from "../src/session.js";
import { MAX_TEAM } from "../src/match.js";

test("a practice session starts a match from the lobby choices", () => {
  const s = new LocalSession({ name: "Quyên" });
  assert.equal(s.state, "lobby");
  assert.equal(s.canStart, true, "you plus the default bot");
  s.setCharacter("nemu");
  s.setWeapon("star");
  s.setSetup({ map: "moon", difficulty: "hard", bots: [1, 2] });
  assert.equal(s.teamSize(0), 2);
  assert.equal(s.start(), true);
  assert.equal(s.state, "playing");
  assert.equal(s.match.map.id, "moon");
  assert.equal(s.match.difficulty.id, "hard");
  assert.equal(s.match.actors.length, 4);
  const you = s.match.actors.find((a) => a.control === "human");
  assert.equal(you.skin, "nemu");
  assert.equal(you.weapon, "star");
});

test("an empty team blocks the start, and the lobby comes back after a match", () => {
  const s = new LocalSession();
  s.setSetup({ bots: [0, 0] });
  s.chooseTeam(1);
  assert.equal(s.teamSize(0), 0);
  assert.equal(s.canStart, false);
  assert.equal(s.start(), false);
  s.setSetup({ bots: [9, 0] });
  assert.equal(s.bots[0], MAX_TEAM, "bot count is clamped");
  assert.equal(s.canStart, true);
  s.start();
  s.backToLobby();
  assert.equal(s.state, "lobby");
  assert.equal(s.match, null);
});

test("changing weapon mid-match reaches the running match", () => {
  const s = new LocalSession();
  s.start();
  s.setWeapon("honey");
  assert.equal(s.match.current.weapon, "honey");
});
