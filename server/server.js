// Gunny online server: serves the game and runs rooms. A room is a lobby until
// the host starts it, then an authoritative Match ticking at the fixed step.
// One Node process, no database. Run: npm start
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { Match, MAX_TEAM, DIFFICULTIES } from "../src/match.js";
import { DT, MAPS } from "../src/physics.js";
import { CHARACTERS, WEAPONS } from "../src/assets.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".json": "application/json",
  ".md": "text/plain; charset=utf-8",
};
const SNAPSHOT_MS = 50;
const EMPTY_ROOM_TTL_MS = 60000;
const IDLE_SEAT_S = 1.5;
export const rooms = new Map();
let nextClientId = 1;

const newCode = () => {
  let s = "";
  for (let i = 0; i < 4; i++) s += "ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 24)];
  return rooms.has(s) ? newCode() : s;
};

class Room {
  constructor(id) {
    this.id = id;
    this.clients = new Set();
    this.state = "lobby";
    this.match = null;
    this.order = [];
    this.bots = [0, 1];
    this.map = MAPS[0].id;
    this.difficulty = "normal";
    this.terrainVersion = 0;
    this.emptySince = Date.now();
    this.last = Date.now();
    this.acc = 0;
    this.sinceSnapshot = 0;
    this.idleSeat = 0;
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
  applyRoster() {
    for (const a of this.match.actors) {
      if (a.control !== "human") continue;
      const c = this.clientOfSeat(a.player);
      if (!c) continue;
      a.skin = c.character;
      a.weapon = c.weapon;
      a.name = CHARACTERS.find((x) => x.id === c.character).name;
      a.label = c.name;
    }
  }
  start() {
    if (!this.canStart) return false;
    this.order = this.seatOrder();
    this.match = new Match({
      seed: Math.floor(Math.random() * 2 ** 31),
      map: this.map,
      difficulty: this.difficulty,
      teams: [0, 1].map((t) => ({ humans: this.teamPlayers(t).length, bots: this.bots[t] })),
    });
    this.applyRoster();
    this.terrainVersion++;
    this.match.terrainDirty = false;
    this.state = "playing";
    this.acc = 0;
    this.last = Date.now();
    return true;
  }
  restart() {
    this.match.reset();
    this.applyRoster();
    this.terrainVersion++;
    this.match.terrainDirty = false;
  }
  backToLobby() {
    this.state = "lobby";
    this.match = null;
    for (const c of this.clients) c.ready = c.host;
  }
  tick() {
    const now = Date.now();
    if (this.state === "playing") {
      this.acc += Math.min((now - this.last) / 1000, 0.1);
      const m = this.match;
      while (this.acc >= DT) {
        // A seat whose player left forfeits its turn instead of stalling the match.
        if (m.phase === "aim" && m.current.control === "human" && !this.clientOfSeat(m.current.player)) {
          this.idleSeat += DT;
          if (this.idleSeat > IDLE_SEAT_S) {
            this.idleSeat = 0;
            m.cancelCharge();
            m.nextTurn();
          }
        } else this.idleSeat = 0;
        m.update(DT);
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
    if (!this.clients.size && now - this.emptySince > EMPTY_ROOM_TTL_MS) this.close();
  }
  snapshot(client) {
    const s = {
      t: "room",
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
          label: a.label ?? null,
          x: a.x,
          y: a.y,
          hp: a.hp,
          skin: a.skin,
          weapon: a.weapon,
          name: a.name,
          angle: a.angle,
          hurt: a.hurt,
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
    for (const c of this.clients) if (c.ws.readyState === 1) c.ws.send(JSON.stringify(this.snapshot(c)));
  }
  join(client) {
    this.clients.add(client);
    this.emptySince = Infinity;
    // Fill the emptier team so a fresh player can act right away.
    client.team = this.state === "lobby" ? (this.teamPlayers(0).length <= this.teamPlayers(1).length ? 0 : 1) : null;
    this.promoteHost();
    this.broadcast();
  }
  leave(client) {
    this.clients.delete(client);
    client.host = false;
    this.promoteHost();
    if (!this.clients.size) this.emptySince = Date.now();
    else this.broadcast();
  }
  handle(client, msg) {
    const m = this.match,
      mine = this.state === "playing" && m.current.control === "human" && this.clientOfSeat(m.current.player) === client;
    switch (msg.t) {
      case "team":
        if (this.state !== "lobby") return;
        client.team = [0, 1].includes(msg.team) ? msg.team : null;
        client.ready = client.host;
        break;
      case "ready":
        if (this.state !== "lobby") return;
        client.ready = !!msg.value;
        break;
      case "loadout": {
        if (msg.character && CHARACTERS.some((c) => c.id === msg.character)) client.character = msg.character;
        if (msg.weapon && WEAPONS.some((w) => w.id === msg.weapon)) client.weapon = msg.weapon;
        if (mine) m.setLoadout({ character: msg.character, weapon: msg.weapon });
        break;
      }
      case "setup":
        if (!client.host || this.state !== "lobby") return;
        if (msg.map && MAPS.some((x) => x.id === msg.map)) this.map = msg.map;
        if (msg.difficulty && DIFFICULTIES.some((d) => d.id === msg.difficulty)) this.difficulty = msg.difficulty;
        if (Array.isArray(msg.bots)) this.bots = msg.bots.map((n) => Math.max(0, Math.min(MAX_TEAM, n | 0)));
        break;
      case "start":
        if (!client.host || this.state !== "lobby") return;
        this.start();
        break;
      case "restart":
        if (!client.host || this.state !== "playing") return;
        this.restart();
        break;
      case "lobby":
        if (!client.host || this.state !== "playing") return;
        this.backToLobby();
        break;
      // Gameplay input only counts on the sender's own turn.
      case "keys":
        if (!mine) return;
        m.keys.clear();
        for (const k of msg.keys || []) if (["left", "right", "up", "down"].includes(k)) m.keys.add(k);
        return;
      case "aim":
        if (mine && Number.isFinite(msg.angle)) m.setAim(msg.angle);
        return;
      case "charge":
        if (mine) m.beginCharge();
        return;
      case "release":
        if (mine) m.release();
        return;
      case "cancel":
        if (mine) m.cancelCharge();
        return;
      default:
        return;
    }
    this.broadcast();
  }
  close() {
    clearInterval(this.timer);
    rooms.delete(this.id);
  }
}

async function serveStatic(req, res) {
  let file = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (file.endsWith("/")) file += "index.html";
  const full = path.join(ROOT, file);
  if (!full.startsWith(ROOT + path.sep) || /(^|\/)(server|node_modules|\.git)(\/|$)/.test(file)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const info = await stat(full);
    if (!info.isFile()) throw new Error("dir");
    res.writeHead(200, {
      "content-type": TYPES[path.extname(full)] || "application/octet-stream",
      "cache-control": full.includes(`${path.sep}assets${path.sep}`) ? "public, max-age=86400" : "no-cache",
    });
    res.end(await readFile(full));
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("not found");
  }
}

export function createServer() {
  const server = http.createServer((req, res) => {
    if (req.url === "/api/rooms") {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(
        JSON.stringify(
          [...rooms.values()].map((r) => ({
            id: r.id,
            state: r.state,
            players: r.clients.size,
            teams: [r.teamSize(0), r.teamSize(1)],
            map: r.map,
          })),
        ),
      );
      return;
    }
    serveStatic(req, res);
  });
  const wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (ws, req) => {
    const params = new URL(req.url, "http://x").searchParams;
    const wanted = (params.get("room") || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
    // An unknown or empty code opens a new room, so an invite link always works.
    const id = wanted && rooms.has(wanted) ? wanted : wanted || newCode();
    if (!rooms.has(id)) rooms.set(id, new Room(id));
    const room = rooms.get(id);
    const client = {
      id: nextClientId++,
      ws,
      team: null,
      ready: false,
      host: false,
      character: "mochi",
      weapon: "carrot",
      name: (params.get("name") || "Khách").slice(0, 16).trim() || "Khách",
      terrainVersion: -1,
    };
    room.join(client);
    ws.on("message", (data) => {
      let msg;
      try {
        msg = JSON.parse(data);
      } catch {
        return;
      }
      if (msg && typeof msg.t === "string") room.handle(client, msg);
    });
    ws.on("close", () => room.leave(client));
  });
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = +process.env.PORT || 8080;
  createServer().listen(port, () => console.log(`Gunny server: http://localhost:${port}`));
}
