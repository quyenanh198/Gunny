// Gunny online server: serves the static game and runs authoritative matches
// per room over WebSocket. One Node process, no database. Run: npm start
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
const rooms = new Map();

const code = () => {
  let s = "";
  for (let i = 0; i < 4; i++) s += "ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 24)];
  return rooms.has(s) ? code() : s;
};

class Room {
  constructor(id) {
    this.id = id;
    this.clients = new Set();
    this.match = new Match({ seed: Math.floor(Math.random() * 2 ** 31) });
    this.seq = 0;
    this.lastKeys = "";
    this.emptySince = Date.now();
    this.terrainVersion = 0;
    this.match.terrainDirty = true;
    this.timer = setInterval(() => this.tick(), 1000 / 60);
    this.acc = 0;
    this.last = Date.now();
    this.sinceSnapshot = 0;
    this.skipWait = 0;
  }
  get seats() {
    return this.match.actors.filter((a) => a.control === "human").map((a) => a.player);
  }
  seatOwner(player) {
    for (const c of this.clients) if (c.seat === player) return c;
    return null;
  }
  assignSeats() {
    const free = this.seats.filter((p) => !this.seatOwner(p));
    for (const c of this.clients) {
      if (c.seat !== null && !this.seats.includes(c.seat)) c.seat = null;
      if (c.seat === null && free.length) c.seat = free.shift();
    }
    if (![...this.clients].some((c) => c.host) && this.clients.size) [...this.clients][0].host = true;
  }
  tick() {
    const now = Date.now();
    this.acc += Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    const m = this.match;
    while (this.acc >= DT) {
      // A human seat with nobody connected forfeits its turn after a short pause.
      if (m.phase === "aim" && m.current.control === "human" && !this.seatOwner(m.current.player)) {
        this.skipWait += DT;
        if (this.skipWait > 1.5) {
          this.skipWait = 0;
          m.cancelCharge();
          m.nextTurn();
        }
      } else this.skipWait = 0;
      m.update(DT);
      this.acc -= DT;
    }
    if (m.terrainDirty) {
      this.terrainVersion++;
      m.terrainDirty = false;
    }
    this.sinceSnapshot += now - (this.snapshotAt || now);
    this.snapshotAt = now;
    if (this.sinceSnapshot >= SNAPSHOT_MS) {
      this.sinceSnapshot = 0;
      this.broadcast();
    }
    if (!this.clients.size && now - this.emptySince > EMPTY_ROOM_TTL_MS) this.close();
  }
  snapshot(client) {
    const m = this.match;
    const s = {
      t: "state",
      seq: ++this.seq,
      room: this.id,
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
      difficulty: m.difficulty.id,
      terrainVersion: this.terrainVersion,
      actors: m.actors.map((a) => ({
        team: a.team,
        control: a.control,
        player: a.player,
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
      seats: this.seats.map((p) => {
        const c = this.seatOwner(p);
        return { player: p, name: c ? c.name : null };
      }),
      spectators: [...this.clients].filter((c) => c.seat === null).length,
      you: { seat: client.seat, host: client.host },
    };
    if (client.terrainVersion !== this.terrainVersion) {
      s.terrain = m.terrain.map((y) => Math.round(y * 10));
      client.terrainVersion = this.terrainVersion;
    }
    return s;
  }
  broadcast() {
    for (const c of this.clients) if (c.ws.readyState === 1) c.ws.send(JSON.stringify(this.snapshot(c)));
  }
  join(client) {
    this.clients.add(client);
    this.emptySince = Infinity;
    this.assignSeats();
    client.terrainVersion = -1;
    this.broadcast();
  }
  leave(client) {
    this.clients.delete(client);
    client.seat = null;
    this.assignSeats();
    if (!this.clients.size) this.emptySince = Date.now();
    else this.broadcast();
  }
  handle(client, msg) {
    const m = this.match,
      mine = m.current.control === "human" && m.current.player === client.seat;
    switch (msg.t) {
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
      case "loadout":
        if (!mine) return;
        if (msg.character && CHARACTERS.some((c) => c.id === msg.character)) m.setLoadout({ character: msg.character });
        if (msg.weapon && WEAPONS.some((w) => w.id === msg.weapon)) m.setLoadout({ weapon: msg.weapon });
        return;
      case "setup":
        if (!client.host) return;
        if (msg.difficulty && DIFFICULTIES.some((d) => d.id === msg.difficulty)) m.setDifficulty(msg.difficulty);
        if (msg.map && MAPS.some((x) => x.id === msg.map)) m.setMap(msg.map);
        if (Array.isArray(msg.teams) && msg.teams.length === 2)
          m.setTeams(msg.teams.map((t) => ({ humans: Math.min(MAX_TEAM, +t.humans || 0), bots: Math.min(MAX_TEAM, +t.bots || 0) })));
        this.assignSeats();
        this.broadcast();
        return;
      case "restart":
        if (!client.host) return;
        m.reset();
        this.assignSeats();
        this.broadcast();
        return;
    }
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
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify([...rooms.values()].map((r) => ({ id: r.id, players: r.clients.size, seats: r.seats.length }))));
      return;
    }
    serveStatic(req, res);
  });
  const wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (ws, req) => {
    const params = new URL(req.url, "http://x").searchParams;
    let id = (params.get("room") || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
    if (!id || !rooms.has(id)) {
      id = id && !rooms.has(id) ? id : code();
      rooms.set(id, new Room(id));
    }
    const room = rooms.get(id);
    const client = { ws, seat: null, host: false, name: (params.get("name") || "Khách").slice(0, 16), terrainVersion: -1 };
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
