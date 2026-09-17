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
import { connectionParams, originAllowed, parseMessage } from "./validation.js";
import { validateResumeMessage } from "../src/play/protocol.js";
import { clientIp, FixedWindowLimiter } from "./rate-limiter.js";

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

export function createServer({
  allowedOrigins = (process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean),
  trustProxy = process.env.TRUST_PROXY === "true",
  trustedProxies = (process.env.TRUSTED_PROXY_IPS || "").split(",").filter(Boolean),
  maxConnectionsPerIp = Number(process.env.MAX_CONNECTIONS_PER_IP || 20),
  handshakesPerMinute = Number(process.env.HANDSHAKES_PER_MINUTE || 60),
  roomCreatesPerMinute = Number(process.env.ROOM_CREATES_PER_MINUTE || 10),
  httpRequestsPerMinute = Number(process.env.HTTP_REQUESTS_PER_MINUTE || 240),
  metricsToken = process.env.METRICS_TOKEN || "",
} = {}) {
  const ipOptions = { trustProxy, trustedProxies };
  const activeByIp = new Map();
  const handshakeLimiter = new FixedWindowLimiter({ limit: handshakesPerMinute, windowMs: 60000 });
  const roomCreateLimiter = new FixedWindowLimiter({ limit: roomCreatesPerMinute, windowMs: 60000 });
  const httpLimiter = new FixedWindowLimiter({ limit: httpRequestsPerMinute, windowMs: 60000 });
  const server = http.createServer((req, res) => {
    if ((req.url.startsWith("/api/") || req.url === "/metrics") && !httpLimiter.take(clientIp(req, ipOptions))) {
      res.writeHead(429, { "content-type": "application/json", "retry-after": "60" });
      res.end(JSON.stringify({ error: "RATE_LIMITED" }));
      return;
    }
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
      if ((metricsToken && req.headers.authorization !== `Bearer ${metricsToken}`) ||
          (!metricsToken && process.env.NODE_ENV === "production")) {
        res.writeHead(401, { "content-type": "text/plain", "www-authenticate": "Bearer" }).end("unauthorized");
        return;
      }
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
  const wss = new WebSocketServer({
    server,
    path: "/ws",
    verifyClient: ({ req }, done) => {
      if (!originAllowed(req, allowedOrigins)) return done(false, 403, "origin rejected");
      const ip = clientIp(req, ipOptions);
      if (!handshakeLimiter.take(ip) || (activeByIp.get(ip) || 0) >= maxConnectionsPerIp)
        return done(false, 429, "connection rate limited");
      done(true);
    },
  });
  const sendError = (ws, code, message = {}) => ws.send(JSON.stringify({ t: "error", code, ...message }));
  const activate = (ws, room, client) => {
    ws.on("message", (data) => {
      const now = Date.now();
      if (now - client.rateWindow >= 1000) {
        client.rateWindow = now;
        client.rateCount = 0;
      }
      if (++client.rateCount > 60) {
        sendError(ws, "RATE_LIMITED");
        return;
      }
      const parsed = parseMessage(data);
      if (parsed.error) {
        sendError(ws, parsed.error);
        return;
      }
      const message = parsed.message;
      if (message.clientSeq <= client.lastAckSeq) {
        room.rejectedMessages++;
        sendError(ws, "STALE_SEQUENCE", { requestId: message.requestId, clientSeq: message.clientSeq });
        return;
      }
      const previousAck = client.lastAckSeq;
      client.lastAckSeq = message.clientSeq;
      if (!room.handle(client, message)) {
        client.lastAckSeq = previousAck;
        room.rejectedMessages++;
        sendError(ws, "COMMAND_REJECTED", { requestId: message.requestId, clientSeq: message.clientSeq });
        return;
      }
      ws.send(JSON.stringify({ t: "ack", requestId: message.requestId, clientSeq: message.clientSeq }));
    });
    ws.on("close", () => room.disconnect(client));
  };
  wss.on("connection", (ws, req) => {
    const params = connectionParams(req.url);
    const ip = clientIp(req, ipOptions);
    activeByIp.set(ip, (activeByIp.get(ip) || 0) + 1);
    ws.once("close", () => {
      const remaining = Math.max(0, (activeByIp.get(ip) || 1) - 1);
      if (remaining) activeByIp.set(ip, remaining);
      else activeByIp.delete(ip);
    });
    ws.isAlive = true;
    ws.on("pong", () => (ws.isAlive = true));
    if (params.mode === "resume") {
      const timer = setTimeout(() => {
        sendError(ws, "RESUME_TIMEOUT");
        ws.close(1008, "resume timeout");
      }, 5000);
      timer.unref();
      ws.once("message", (data) => {
        clearTimeout(timer);
        let message;
        try { message = JSON.parse(data.toString()); }
        catch { sendError(ws, "INVALID_JSON"); ws.close(1008, "invalid resume"); return; }
        const validation = validateResumeMessage(message);
        if (!validation.ok || message.room !== params.room) {
          sendError(ws, validation.code || "INVALID_PAYLOAD");
          ws.close(1008, "invalid resume");
          return;
        }
        const room = roomManager.get(message.room);
        const client = room?.reconnect(message.reconnectToken, ws, randomUUID());
        if (!client) {
          sendError(ws, "RECONNECT_EXPIRED");
          ws.close(1008, "reconnect expired");
          return;
        }
        activate(ws, room, client);
      });
      return;
    }
    let room = roomManager.get(params.room);
    if (!room && params.mode === "create") {
      if (!roomCreateLimiter.take(ip)) {
        sendError(ws, "ROOM_CREATE_LIMITED");
        ws.close(1008, "room creation rate limited");
        return;
      }
      room = roomManager.create(params.visibility);
    }
    if (!room) {
      ws.send(JSON.stringify({ t: "error", code: "ROOM_NOT_FOUND" }));
      ws.close(1008, "room not found");
      return;
    }
    const role = params.mode === "spectate" ? "spectator" : "player";
    if (!room.canJoin(role)) {
      ws.send(JSON.stringify({ t: "error", code: role === "spectator" ? "SPECTATOR_FULL" : "ROOM_FULL" }));
      ws.close(1008, "room full");
      return;
    }
    const client = {
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
      role,
    };
    room.join(client, role);
    activate(ws, room, client);
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
