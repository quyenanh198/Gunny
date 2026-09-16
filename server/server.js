// Gunny online server: serves the game and runs rooms. A room is a lobby until
// the host starts it, then an authoritative Match ticking at the fixed step.
// One Node process, no database. Run: npm start
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { randomUUID } from "node:crypto";
import { RoomManager } from "./room-manager.js";
import { connectionParams, parseMessage } from "./validation.js";

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
const roomManager = new RoomManager();
export const rooms = roomManager.rooms;
let nextClientId = 1;


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
    if (req.url === "/healthz") {
      res.writeHead(200, { "content-type": "text/plain" }).end("ok");
      return;
    }
    if (req.url === "/readyz") {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ready: true }));
      return;
    }
    if (req.url === "/api/quick-join") {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ room: roomManager.quickJoin()?.id || "" }));
      return;
    }
    if (req.url === "/metrics") {
      const metrics = roomManager.metrics();
      res.writeHead(200, { "content-type": "text/plain; version=0.0.4" });
      res.end(Object.entries(metrics).map(([name, value]) => `gunny_${name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)} ${value}`).join("\n") + "\n");
      return;
    }
    if (req.url === "/api/rooms") {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(
        JSON.stringify(
          roomManager.list(),
        ),
      );
      return;
    }
    serveStatic(req, res);
  });
  const wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (ws, req) => {
    const params = connectionParams(req.url);
    const existing = params.room && params.reconnectToken
      ? roomManager.get(params.room)?.reconnect(params.reconnectToken, ws)
      : null;
    if (params.reconnectToken && !existing) {
      ws.send(JSON.stringify({ t: "error", code: "RECONNECT_EXPIRED" }));
      ws.close(1008, "reconnect expired");
      return;
    }
    // An unknown or empty code opens a new room, so an invite link always works.
    const room = existing ? roomManager.get(params.room) : roomManager.getOrCreate(params.room);
    const client = existing || {
      id: nextClientId++,
      ws,
      connected: true,
      disconnectedAt: 0,
      reconnectToken: randomUUID(),
      lastAckSeq: 0,
      rateWindow: Date.now(),
      rateCount: 0,
      team: null,
      ready: false,
      host: false,
      character: "mochi",
      weapon: "carrot",
      name: params.name,
      terrainVersion: -1,
    };
    if (!existing) room.join(client);
    ws.on("message", (data) => {
      const now = Date.now();
      if (now - client.rateWindow >= 1000) {
        client.rateWindow = now;
        client.rateCount = 0;
      }
      if (++client.rateCount > 60) {
        ws.send(JSON.stringify({ t: "error", code: "RATE_LIMITED" }));
        return;
      }
      const parsed = parseMessage(data);
      if (parsed.error) {
        ws.send(JSON.stringify({ t: "error", code: parsed.error }));
        return;
      }
      room.handle(client, parsed.message);
    });
    ws.on("close", () => room.disconnect(client));
    ws.isAlive = true;
    ws.on("pong", () => (ws.isAlive = true));
  });
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) ws.terminate();
      else {
        ws.isAlive = false;
        ws.ping();
      }
    }
  }, 10000);
  heartbeat.unref();
  server.on("close", () => clearInterval(heartbeat));
  server.gracefulShutdown = () => {
    for (const ws of wss.clients) ws.close(1001, "server shutdown");
    roomManager.close();
    server.closeAllConnections();
    server.close();
  };
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = +process.env.PORT || 8080;
  const server = createServer();
  server.listen(port, () => console.log(JSON.stringify({ event: "server_started", port })));
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.gracefulShutdown());
}
