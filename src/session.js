// Local session: the same shape as the online session in net.js, so the lobby,
// room and battle screens are written once and work with or without a server.
import { Match, DIFFICULTIES, MAX_TEAM } from "./match.js";
import { MAPS } from "./maps.js";

export class LocalSession {
  constructor({ name = "Bạn" } = {}) {
    this.online = false;
    this.id = "LUYỆN TẬP";
    this.state = "lobby";
    this.match = null;
    this.bots = [0, 1];
    this.map = MAPS[0].id;
    this.difficulty = "normal";
    this.players = [
      { id: 0, name, team: 0, ready: true, host: true, character: "mochi", weapon: "carrot" },
    ];
    this.you = this.players[0];
  }
  get host() {
    return true;
  }
  teamSize(team) {
    return this.players.filter((p) => p.team === team).length + this.bots[team];
  }
  get canStart() {
    return this.teamSize(0) > 0 && this.teamSize(1) > 0;
  }
  chooseTeam(team) {
    this.you.team = team === this.you.team ? null : team;
  }
  setReady() {}
  setCharacter(id) {
    this.you.character = id;
  }
  setWeapon(id) {
    this.you.weapon = id;
  }
  setSetup({ map, difficulty, bots }) {
    if (map && MAPS.some((m) => m.id === map)) this.map = map;
    if (difficulty && DIFFICULTIES.some((d) => d.id === difficulty)) this.difficulty = difficulty;
    if (bots) this.bots = bots.map((n) => Math.max(0, Math.min(MAX_TEAM, n | 0)));
  }
  // The lobby roster carries each member's name and loadout into the match.
  roster() {
    return [0, 1].map((t) => [
      ...this.players
        .filter((p) => p.team === t)
        .map((p) => ({ control: "human", name: p.name, skin: p.character, weapon: p.weapon })),
      ...Array.from({ length: this.bots[t] }, () => ({ control: "bot" })),
    ]);
  }
  start() {
    if (!this.canStart) return false;
    this.match = new Match({
      map: this.map,
      difficulty: this.difficulty,
      roster: this.roster(),
    });
    this.state = "playing";
    return true;
  }
  restart() {
    this.match.reset();
  }
  backToLobby() {
    this.match = null;
    this.state = "lobby";
  }
  leave() {}
}
