import { Match, MAX_TEAM, DIFFICULTIES } from "../src/match.js";
import { DT } from "../src/physics.js";
import { MAPS } from "../src/maps.js";
import { CHARACTERS, WEAPONS } from "../src/assets.js";
import { PROTOCOL_VERSION } from "../src/play/protocol.js";

const SNAPSHOT_MS = 50;
const EMPTY_ROOM_TTL_MS = 60000;
const IDLE_SEAT_S = 30;
const RECONNECT_GRACE_MS = 30000;

export class Room {
  constructor(id, onClose) {
    this.onClose = onClose;
    this.id = id;
    this.clients = new Set();
    this.state = "lobby";
    this.match = null;
    this.order = [];
    this.bots = [0, 1];
    this.map = MAPS[0].id;
    this.difficulty = "normal";
    this.terrainVersion = 0;
    this.serverTick = 0;
    this.roomVersion = 0;
    this.emptySince = Date.now();
    this.last = Date.now();
    this.acc = 0;
    this.sinceSnapshot = 0;
    this.idleSeat = 0;
    this.maxTickDrift = 0;
    this.tickDriftSamples = [];
    this.snapshotBytes = 0;
    this.rejectedMessages = 0;
    this.reconnects = 0;
    this.chat = [];
    this.history = [];
    // unref: an idle room must not keep the process alive on its own.
    this.timer = setInterval(() => this.tick(), 1000 / 60);
    this.timer.unref();
  }
  get host() {
    return [...this.clients].find((c) => c.host) || null;
  }
  teamPlayers(team) {
    return [...this.clients].filter((c) => c.team === team);
  }
  teamSize(team) {
    return this.teamPlayers(team).length + this.bots[team];
  }
  get canStart() {
    const seated = [...this.clients].filter((c) => c.team !== null);
    return this.teamSize(0) > 0 && this.teamSize(1) > 0 && seated.every((c) => c.ready || c.host);
  }
  promoteHost() {
    if (this.host || !this.clients.size) return;
    [...this.clients][0].host = true;
  }
  // Human actors are created team 0 first, so seat numbers follow this order.
  seatOrder() {
    return [...this.teamPlayers(0), ...this.teamPlayers(1)];
  }
  clientOfSeat(player) {
    return this.order[player - 1] || null;
  }
  // The lobby roster carries each member's name and loadout into the match.
  roster() {
    return [0, 1].map((t) => [
      ...this.teamPlayers(t).map((c) => ({
        control: "human",
        name: c.name,
        skin: c.character,
        weapon: c.weapon,
      })),
      ...Array.from({ length: this.bots[t] }, () => ({ control: "bot" })),
    ]);
  }
  start() {
    if (!this.canStart) return false;
    this.order = this.seatOrder();
    this.match = new Match({
      seed: Math.floor(Math.random() * 2 ** 31),
      map: this.map,
      difficulty: this.difficulty,
      roster: this.roster(),
    });
    this.terrainVersion++;
    this.match.terrainDirty = false;
    this.state = "playing";
    this.acc = 0;
    this.last = Date.now();
    return true;
  }
  restart() {
    this.match.reset();
    this.terrainVersion++;
    this.match.terrainDirty = false;
  }
  backToLobby() {
    if (this.match) {
      this.history.push({ at: Date.now(), status: this.match.status, rounds: this.match.round });
      this.history = this.history.slice(-10);
    }
    this.state = "lobby";
    this.match = null;
    for (const c of this.clients) c.ready = c.host;
  }
  tick() {
    const now = Date.now();
    const tickDrift = Math.max(0, now - this.last - 1000 / 60);
    this.maxTickDrift = Math.max(this.maxTickDrift, tickDrift);
    this.tickDriftSamples.push(tickDrift);
    if (this.tickDriftSamples.length > 3600) this.tickDriftSamples.shift();
    if (this.state === "playing") {
      this.acc += Math.min((now - this.last) / 1000, 0.1);
      const m = this.match;
      while (this.acc >= DT) {
        // A seat whose player left forfeits its turn instead of stalling the match.
        if (m.phase === "aim" && m.current.control === "human" && !this.clientOfSeat(m.current.player)?.connected) {
          this.idleSeat += DT;
          if (this.idleSeat > IDLE_SEAT_S) {
            this.idleSeat = 0;
            m.cancelCharge();
            m.nextTurn();
          }
        } else this.idleSeat = 0;
        m.update(DT);
        this.serverTick++;
        this.acc -= DT;
      }
      if (m.terrainDirty) {
        this.terrainVersion++;
        m.terrainDirty = false;
      }
    }
    this.sinceSnapshot += now - this.last;
    this.last = now;
    if (this.sinceSnapshot >= SNAPSHOT_MS) {
      this.sinceSnapshot = 0;
      this.broadcast();
    }
    for (const client of this.clients)
      if (!client.connected && now - client.disconnectedAt > RECONNECT_GRACE_MS) this.remove(client);
    if (!this.clients.size && now - this.emptySince > EMPTY_ROOM_TTL_MS) this.close();
  }
  snapshot(client) {
    const s = {
      t: "room",
      protocolVersion: PROTOCOL_VERSION,
      serverTick: this.serverTick,
      roomVersion: this.roomVersion,
      lastAckSeq: client.lastAckSeq,
      reconnectToken: client.reconnectToken,
      chat: this.chat,
      history: this.history,
      id: this.id,
      state: this.state,
      map: this.map,
      difficulty: this.difficulty,
      bots: this.bots,
      canStart: this.canStart,
      players: [...this.clients].map((c) => ({
        id: c.id,
        name: c.name,
        team: c.team,
        ready: c.ready,
        host: c.host,
        character: c.character,
        weapon: c.weapon,
        connected: c.connected,
      })),
      you: {
        id: client.id,
        host: client.host,
        team: client.team,
        ready: client.ready,
        character: client.character,
        weapon: client.weapon,
        player: this.state === "playing" ? this.order.indexOf(client) + 1 || null : null,
      },
    };
    if (this.state === "playing") {
      const m = this.match;
      s.match = {
        turn: m.turn,
        round: m.round,
        wind: m.wind,
        time: m.time,
        energy: m.energy,
        phase: m.phase,
        charge: m.charge,
        shotType: m.shotType,
        item: m.item,
        upcoming: m.turnQueue.upcoming((index) => m.actors[index].hp > 0),
        stats: m.stats,
        charging: m.charging,
        status: m.status,
        cursor: m.cursor,
        map: m.map.id,
        teams: m.teams,
        terrainVersion: this.terrainVersion,
        actors: m.actors.map((a) => ({
          team: a.team,
          control: a.control,
          player: a.player ?? null,
          x: a.x,
          y: a.y,
          hp: a.hp,
          skin: a.skin,
          weapon: a.weapon,
          name: a.name,
          angle: a.angle,
          hurt: a.hurt,
          ss: a.ss,
          anim: a.animation,
        })),
        projectile: m.projectile
          ? { x: m.projectile.x, y: m.projectile.y, vx: m.projectile.vx, vy: m.projectile.vy, age: m.projectile.age }
          : null,
        popups: m.popups,
        blasts: m.blasts,
      };
      if (client.terrainVersion !== this.terrainVersion) {
        s.match.terrain = m.terrain.map((y) => Math.round(y * 10));
        client.terrainVersion = this.terrainVersion;
      }
    } else client.terrainVersion = -1;
    return s;
  }
  broadcast() {
    for (const c of this.clients) if (c.connected && c.ws.readyState === 1) {
      const payload = JSON.stringify(this.snapshot(c));
      this.snapshotBytes += Buffer.byteLength(payload);
      c.ws.send(payload);
    }
  }
  join(client) {
    this.clients.add(client);
    this.roomVersion++;
    this.emptySince = Infinity;
    // Fill the emptier team so a fresh player can act right away.
    client.team = this.state === "lobby" ? (this.teamPlayers(0).length <= this.teamPlayers(1).length ? 0 : 1) : null;
    this.promoteHost();
    this.broadcast();
  }
  reconnect(token, ws) {
    const client = [...this.clients].find((candidate) => candidate.reconnectToken === token && !candidate.connected);
    if (!client || Date.now() - client.disconnectedAt > RECONNECT_GRACE_MS) return null;
    client.ws = ws;
    client.connected = true;
    client.disconnectedAt = 0;
    client.terrainVersion = -1;
    this.emptySince = Infinity;
    this.roomVersion++;
    this.reconnects++;
    this.broadcast();
    return client;
  }
  disconnect(client) {
    client.connected = false;
    client.disconnectedAt = Date.now();
    client.ws = null;
    this.roomVersion++;
    this.broadcast();
  }
  remove(client) {
    this.clients.delete(client);
    client.host = false;
    this.promoteHost();
    if (!this.clients.size) this.emptySince = Date.now();
    this.roomVersion++;
    if (this.clients.size) this.broadcast();
  }
  handle(client, msg) {
    if (msg.clientSeq <= client.lastAckSeq) {
      this.rejectedMessages++;
      return false;
    }
    client.lastAckSeq = msg.clientSeq;
    const m = this.match,
      mine = this.state === "playing" && m.current.control === "human" && this.clientOfSeat(m.current.player) === client;
    switch (msg.t) {
      case "team":
        if (this.state !== "lobby") return false;
        client.team = [0, 1].includes(msg.team) ? msg.team : null;
        client.ready = client.host;
        break;
      case "ready":
        if (this.state !== "lobby") return false;
        client.ready = !!msg.value;
        break;
      case "loadout":
        if (this.state !== "lobby") return false;
        if (msg.character && CHARACTERS.some((c) => c.id === msg.character)) client.character = msg.character;
        if (msg.weapon && WEAPONS.some((w) => w.id === msg.weapon)) client.weapon = msg.weapon;
        break;
      case "setup":
        if (!client.host || this.state !== "lobby") return false;
        if (msg.map && MAPS.some((x) => x.id === msg.map)) this.map = msg.map;
        if (msg.difficulty && DIFFICULTIES.some((d) => d.id === msg.difficulty)) this.difficulty = msg.difficulty;
        if (Array.isArray(msg.bots)) this.bots = msg.bots.map((n) => Math.max(0, Math.min(MAX_TEAM, n | 0)));
        break;
      case "start":
        if (!client.host || this.state !== "lobby") return false;
        this.start();
        break;
      case "restart":
        if (!client.host || this.state !== "playing") return false;
        this.restart();
        break;
      case "lobby":
        if (!client.host || this.state !== "playing") return false;
        this.backToLobby();
        break;
      // Gameplay input only counts on the sender's own turn.
      case "keys":
        if (!mine) return false;
        m.keys.clear();
        for (const k of msg.keys || []) if (["left", "right", "up", "down"].includes(k)) m.keys.add(k);
        this.roomVersion++;
        return true;
      case "aim":
        if (!mine) return false;
        m.setAim(msg.angle);
        this.roomVersion++;
        return true;
      case "charge":
        if (!mine) return false;
        m.beginCharge();
        this.roomVersion++;
        return true;
      case "release":
        if (!mine) return false;
        m.release();
        this.roomVersion++;
        return true;
      case "cancel":
        if (!mine) return false;
        m.cancelCharge();
        this.roomVersion++;
        return true;
      case "action":
        if (!mine) return false;
        m.setAction(msg);
        this.roomVersion++;
        return true;
      case "chat":
        if (Date.now() - (client.lastChatAt || 0) < 750) return false;
        client.lastChatAt = Date.now();
        this.chat.push({ id: client.id, name: client.name, text: msg.text.trim(), at: Date.now() });
        this.chat = this.chat.slice(-30);
        break;
      case "kick": {
        if (!client.host || this.state !== "lobby") return false;
        const target = [...this.clients].find((candidate) => candidate.id === msg.id && candidate !== client);
        if (!target) return false;
        target.ws?.close(1008, "kicked");
        this.remove(target);
        break;
      }
      default:
        return false;
    }
    this.roomVersion++;
    this.broadcast();
    return true;
  }
  close() {
    clearInterval(this.timer);
    this.onClose(this.id);
  }
}
