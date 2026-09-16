// Local session: the same shape as the online session in net.js, so the lobby,
// room and battle screens are written once and work with or without a server.
import { Match, DIFFICULTIES, MAX_TEAM } from "./match.js";
import { MAPS } from "./physics.js";

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
    this.match?.setLoadout({ character: id });
  }
  setWeapon(id) {
    this.you.weapon = id;
    this.match?.setLoadout({ weapon: id });
  }
  setSetup({ map, difficulty, bots }) {
    if (map && MAPS.some((m) => m.id === map)) this.map = map;
    if (difficulty && DIFFICULTIES.some((d) => d.id === difficulty)) this.difficulty = difficulty;
    if (bots) this.bots = bots.map((n) => Math.max(0, Math.min(MAX_TEAM, n | 0)));
  }
  // Human actors are created team 0 first, so seats follow this order.
  seatOrder() {
    return [0, 1].flatMap((t) => this.players.filter((p) => p.team === t));
  }
  applyRoster() {
    for (const a of this.match.actors) {
      if (a.control !== "human") continue;
      const p = this.order[a.player - 1];
      if (p) a.label = p.name;
    }
  }
  start() {
    if (!this.canStart) return false;
    this.order = this.seatOrder();
    const teams = [0, 1].map((t) => ({
      humans: this.players.filter((p) => p.team === t).length,
      bots: this.bots[t],
    }));
    this.match = new Match({
      map: this.map,
      difficulty: this.difficulty,
      teams,
      character: this.you.character,
      weapon: this.you.weapon,
    });
    this.applyRoster();
    this.state = "playing";
    return true;
  }
  restart() {
    this.match.reset();
    this.applyRoster();
  }
  backToLobby() {
    this.match = null;
    this.state = "lobby";
  }
  leave() {}
}
