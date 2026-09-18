#!/usr/bin/env node
// Headless bot-vs-bot balance sweep (R4). Drives src/match.js directly — no
// server, no WebSocket, no browser — so it can run thousands of matches fast
// and stays exactly as deterministic as the engine itself (same seed, same
// outcome). Usage: node scripts/balance-simulator.mjs [matchCount]
import { Match, DIFFICULTIES } from "../src/match.js";
import { DT } from "../src/physics.js";
import { CHARACTERS, WEAPONS } from "../src/assets.js";
import { MAPS } from "../src/maps.js";

const MATCH_COUNT = Number(process.argv[2]) || 300;
const MAX_TICKS = 200000; // safety valve well above any real match (~48k ticks worst case at MAX_ROUNDS)

function runOne(seed) {
  const skinA = CHARACTERS[seed % CHARACTERS.length].id;
  const skinB = CHARACTERS[(seed + 1) % CHARACTERS.length].id;
  const weaponA = WEAPONS[seed % WEAPONS.length].id;
  const weaponB = WEAPONS[(seed + 2) % WEAPONS.length].id;
  const map = MAPS[seed % MAPS.length].id;
  const match = new Match({
    seed, map, difficulty: "normal",
    roster: [[{ control: "bot", skin: skinA, weapon: weaponA }], [{ control: "bot", skin: skinB, weapon: weaponB }]],
  });
  const firstTurnTeam = match.current.team;
  let ticks = 0;
  while (match.phase !== "over" && ticks < MAX_TICKS) { match.update(DT); ticks++; }
  const [hp0, hp1] = [match.teamHp(0), match.teamHp(1)];
  const winner = ticks >= MAX_TICKS ? null : hp0 === hp1 ? null : hp0 > hp1 ? 0 : 1;
  const damage = match.stats.reduce((sum, s) => sum + s.damage, 0);
  return {
    seed, map, skinA, skinB, weaponA, weaponB, firstTurnTeam, winner,
    rounds: match.round, ticks, timedOut: ticks >= MAX_TICKS, damage,
    shots: match.stats.reduce((sum, s) => sum + s.shots, 0),
  };
}

function win(table, key) {
  const row = table.get(key) || { matches: 0, wins: 0 };
  row.matches++;
  table.set(key, row);
  return row;
}
function played(table, key, rounds, damage) {
  const row = table.get(key) || { matches: 0, team0Wins: 0, draws: 0, totalRounds: 0, totalDamage: 0 };
  row.matches++; row.totalRounds += rounds; row.totalDamage += damage;
  table.set(key, row);
  return row;
}

function summarize(results) {
  const byMap = new Map(), bySkin = new Map(), byWeapon = new Map();
  let draws = 0, timedOut = 0, firstTurnWins = 0, decisive = 0;
  let totalRounds = 0, totalDamage = 0, totalTicks = 0;

  for (const r of results) {
    totalRounds += r.rounds; totalDamage += r.damage; totalTicks += r.ticks;
    if (r.timedOut) timedOut++;
    const mapRow = played(byMap, r.map, r.rounds, r.damage);
    if (r.winner === null) { draws++; mapRow.draws++; continue; }
    if (r.winner === 0) mapRow.team0Wins++;
    decisive++;
    if (r.winner === r.firstTurnTeam) firstTurnWins++;
    const winningSkin = r.winner === 0 ? r.skinA : r.skinB, losingSkin = r.winner === 0 ? r.skinB : r.skinA;
    win(bySkin, winningSkin).wins++; win(bySkin, losingSkin);
    const winningWeapon = r.winner === 0 ? r.weaponA : r.weaponB, losingWeapon = r.winner === 0 ? r.weaponB : r.weaponA;
    win(byWeapon, winningWeapon).wins++; win(byWeapon, losingWeapon);
  }
  const winTable = (table) => Object.fromEntries([...table].map(([id, row]) =>
    [id, { ...row, winRate: row.matches ? +(row.wins / row.matches).toFixed(3) : null }]));
  const mapTable = (table) => Object.fromEntries([...table].map(([id, row]) => [id, {
    matches: row.matches, draws: row.draws,
    team0WinRate: row.matches ? +(row.team0Wins / row.matches).toFixed(3) : null,
    avgRounds: +(row.totalRounds / row.matches).toFixed(2),
    avgDamage: +(row.totalDamage / row.matches).toFixed(1),
  }]));

  return {
    matchCount: results.length, draws, timedOut,
    firstTurnAdvantage: decisive ? +(firstTurnWins / decisive).toFixed(3) : null,
    avgRounds: +(totalRounds / results.length).toFixed(2),
    avgTicks: +(totalTicks / results.length).toFixed(1),
    avgDamagePerMatch: +(totalDamage / results.length).toFixed(1),
    winRateBySkin: winTable(bySkin),
    winRateByWeapon: winTable(byWeapon),
    byMap: mapTable(byMap),
  };
}

const results = [];
for (let seed = 0; seed < MATCH_COUNT; seed++) results.push(runOne(seed));
const report = summarize(results);
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), difficulty: DIFFICULTIES[1].id, report }, null, 2));
if (report.timedOut > 0) {
  console.error(`${report.timedOut} of ${report.matchCount} matches hit the ${MAX_TICKS}-tick safety valve without reaching "over" — investigate before trusting this report.`);
  process.exitCode = 1;
}
