// Gunny online server: serves the game and runs rooms. A room is a lobby until
// the host starts it, then an authoritative Match ticking at the fixed step.
// One Node process with PostgreSQL-backed identity in production. Run: npm start
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
import { MemoryIdentityStore } from "./memory-identity-store.js";
import { PostgresIdentityStore } from "./identity-store.js";
import { createPool, migrate } from "./database.js";
import { MatchmakingQueue } from "./matchmaking.js";
import { PartyService } from "./party.js";
import { PresenceService } from "./presence.js";

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
let nextClientId = 1;

const bearerToken = (req) => {
  const match = /^Bearer ([A-Za-z0-9_-]{20,})$/.exec(req.headers.authorization || "");
  return match?.[1] || "";
};

async function jsonBody(req, limit = 2048) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error("body too large"), { status: 413 });
    chunks.push(chunk);
  }
  try { return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}; }
  catch { throw Object.assign(new Error("invalid json"), { status: 400 }); }
}

const sendJson = (res, status, value, headers = {}) => {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", ...headers });
  res.end(JSON.stringify(value));
};
const sessionCookie = (value) => `gunny_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
const cookieSession = (req) => {
  const item = (req.headers.cookie || "").split(";").map((part) => part.trim())
    .find((part) => part.startsWith("gunny_session="));
  return item ? item.slice("gunny_session=".length) : "";
};
const requestCredential = (req) => bearerToken(req) || cookieSession(req);

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
  identityStore = new MemoryIdentityStore(),
  requireRealtimeIdentity = false,
} = {}) {
  const roomManager = new RoomManager({ matchLifecycle: identityStore });
  const presence = new PresenceService();
  const matchmaking = new MatchmakingQueue(roomManager, { presence });
  const parties = new PartyService();
  const ipOptions = { trustProxy, trustedProxies };
  const activeByIp = new Map();
  const handshakeLimiter = new FixedWindowLimiter({ limit: handshakesPerMinute, windowMs: 60000 });
  const roomCreateLimiter = new FixedWindowLimiter({ limit: roomCreatesPerMinute, windowMs: 60000 });
  const httpLimiter = new FixedWindowLimiter({ limit: httpRequestsPerMinute, windowMs: 60000 });
  const server = http.createServer(async (req, res) => {
    try {
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
    if (req.url === "/api/sessions/guest" && req.method === "POST") {
      const body = await jsonBody(req);
      const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "Guest";
      if (!displayName || displayName.length > 24) return sendJson(res, 400, { error: "INVALID_DISPLAY_NAME" });
      const session = await identityStore.createGuest(displayName);
      return sendJson(res, 201, session, { "set-cookie": sessionCookie(session.token) });
    }
    if (req.url === "/api/sessions/rotate" && req.method === "POST") {
      const session = await identityStore.rotate(requestCredential(req));
      return session ? sendJson(res, 200, session, { "set-cookie": sessionCookie(session.token) })
        : sendJson(res, 401, { error: "INVALID_SESSION" });
    }
    if (req.url === "/api/profile" && req.method === "GET") {
      const session = await identityStore.authenticate(requestCredential(req));
      return session ? sendJson(res, 200, { user: session.user, profile: session.profile })
        : sendJson(res, 401, { error: "INVALID_SESSION" });
    }
    if (req.url === "/api/profile" && req.method === "PATCH") {
      const body = await jsonBody(req);
      const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
      if (!displayName || displayName.length > 24 || !Number.isInteger(body.expectedVersion) || body.expectedVersion < 1)
        return sendJson(res, 400, { error: "INVALID_PROFILE" });
      const credential = requestCredential(req);
      if (!await identityStore.authenticate(credential)) return sendJson(res, 401, { error: "INVALID_SESSION" });
      const profile = await identityStore.updateProfile(credential, {
        displayName, expectedVersion: body.expectedVersion,
      });
      return profile ? sendJson(res, 200, { profile })
        : sendJson(res, 409, { error: "PROFILE_VERSION_CONFLICT" });
    }
    if (req.url === "/api/matches" && req.method === "GET") {
      const credential = requestCredential(req);
      const session = await identityStore.authenticate(credential);
      if (!session) return sendJson(res, 401, { error: "INVALID_SESSION" });
      return sendJson(res, 200, { matches: await identityStore.listMatches(credential) });
    }
    if (req.url === "/api/matchmaking/enqueue" && req.method === "POST") {
      const session = await identityStore.authenticate(requestCredential(req));
      if (!session) return sendJson(res, 401, { error: "INVALID_SESSION" });
      const body = await jsonBody(req);
      const party = parties.partyOf(session.user.id);
      if (body.partyId && (!party || party.id !== body.partyId)) return sendJson(res, 404, { error: "PARTY_NOT_FOUND" });
      if (party && party.leaderId !== session.user.id) return sendJson(res, 403, { error: "LEADER_REQUIRED" });
      const queued = party ? matchmaking.enqueueGroup(session.user.id,
        party.members.map((member) => member.userId), body) : matchmaking.enqueue(session.user.id, body);
      return queued.error ? sendJson(res, 400, queued) : sendJson(res, 202, queued);
    }
    if (req.url === "/api/presence" && req.method === "GET") {
      const session = await identityStore.authenticate(requestCredential(req));
      return session ? sendJson(res, 200, presence.get(session.user.id))
        : sendJson(res, 401, { error: "INVALID_SESSION" });
    }
    if (req.url === "/api/matchmaking/status" && req.method === "GET") {
      const session = await identityStore.authenticate(requestCredential(req));
      if (!session) return sendJson(res, 401, { error: "INVALID_SESSION" });
      const ticket = matchmaking.status(session.user.id);
      return ticket ? sendJson(res, 200, ticket) : sendJson(res, 404, { error: "NOT_QUEUED" });
    }
    if (req.url === "/api/matchmaking/queue" && req.method === "DELETE") {
      const session = await identityStore.authenticate(requestCredential(req));
      if (!session) return sendJson(res, 401, { error: "INVALID_SESSION" });
      return matchmaking.cancel(session.user.id) ? sendJson(res, 204, null)
        : sendJson(res, 409, { error: "NOT_CANCELLABLE" });
    }
    if (req.url === "/api/party" && req.method === "POST") {
      const session = await identityStore.authenticate(requestCredential(req));
      return session ? sendJson(res, 201, parties.create(session.user.id))
        : sendJson(res, 401, { error: "INVALID_SESSION" });
    }
    if (req.url === "/api/party" && req.method === "GET") {
      const session = await identityStore.authenticate(requestCredential(req));
      if (!session) return sendJson(res, 401, { error: "INVALID_SESSION" });
      const party = parties.state(session.user.id);
      return party ? sendJson(res, 200, party) : sendJson(res, 404, { error: "PARTY_NOT_FOUND" });
    }
    if (req.url === "/api/party" && req.method === "DELETE") {
      const session = await identityStore.authenticate(requestCredential(req));
      if (!session) return sendJson(res, 401, { error: "INVALID_SESSION" });
      if (matchmaking.active(session.user.id)) return sendJson(res, 409, { error: "PARTY_QUEUE_LOCKED" });
      const party = parties.leave(session.user.id);
      return party ? sendJson(res, 200, party) : sendJson(res, 404, { error: "PARTY_NOT_FOUND" });
    }
    if (req.url === "/api/party/invites" && req.method === "POST") {
      const session = await identityStore.authenticate(requestCredential(req));
      if (!session) return sendJson(res, 401, { error: "INVALID_SESSION" });
      if (matchmaking.active(session.user.id)) return sendJson(res, 409, { error: "PARTY_QUEUE_LOCKED" });
      const body = await jsonBody(req);
      const invite = parties.invite(session.user.id, body.userId);
      return invite.error ? sendJson(res, 409, invite) : sendJson(res, 201, invite);
    }
    const acceptInvite = /^\/api\/party\/invites\/([0-9a-f-]+)\/accept$/.exec(req.url);
    if (acceptInvite && req.method === "POST") {
      const session = await identityStore.authenticate(requestCredential(req));
      if (!session) return sendJson(res, 401, { error: "INVALID_SESSION" });
      const invite = parties.invites.get(acceptInvite[1]);
      const leader = invite && parties.parties.get(invite.partyId)?.leaderId;
      if (matchmaking.active(session.user.id) || (leader && matchmaking.active(leader)))
        return sendJson(res, 409, { error: "PARTY_QUEUE_LOCKED" });
      const party = parties.accept(session.user.id, acceptInvite[1]);
      return party.error ? sendJson(res, 409, party) : sendJson(res, 200, party);
    }
    const kickMember = /^\/api\/party\/members\/([0-9a-f-]+)$/.exec(req.url);
    if (kickMember && req.method === "DELETE") {
      const session = await identityStore.authenticate(requestCredential(req));
      if (!session) return sendJson(res, 401, { error: "INVALID_SESSION" });
      if (matchmaking.active(session.user.id)) return sendJson(res, 409, { error: "PARTY_QUEUE_LOCKED" });
      const party = parties.kick(session.user.id, kickMember[1]);
      return party.error ? sendJson(res, 409, party) : sendJson(res, 200, party);
    }
    if (req.url === "/api/privacy/consent" && req.method === "POST") {
      const consentedAt = await identityStore.recordConsent(requestCredential(req));
      return consentedAt ? sendJson(res, 200, { consentedAt }) : sendJson(res, 401, { error: "INVALID_SESSION" });
    }
    if (req.url === "/api/privacy/export" && req.method === "GET") {
      const data = await identityStore.exportUser(requestCredential(req));
      return data ? sendJson(res, 200, data) : sendJson(res, 401, { error: "INVALID_SESSION" });
    }
    if (req.url === "/api/session" && req.method === "DELETE") {
      return await identityStore.revoke(requestCredential(req)) ? sendJson(res, 204, null,
        { "set-cookie": "gunny_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0" })
        : sendJson(res, 401, { error: "INVALID_SESSION" });
    }
    if (req.url === "/api/account" && req.method === "DELETE") {
      return await identityStore.deleteUser(requestCredential(req)) ? sendJson(res, 204, null,
        { "set-cookie": "gunny_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0" })
        : sendJson(res, 401, { error: "INVALID_SESSION" });
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
    await serveStatic(req, res);
    } catch (error) {
      if (!res.headersSent) sendJson(res, error.status || 500,
        { error: error.status ? "INVALID_REQUEST" : "INTERNAL_ERROR" });
      if (!error.status) console.error(JSON.stringify({ event: "http_error", message: error.message }));
    }
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
  const syncPresence = (room) => {
    for (const member of room.clients) if (member.userId && member.connected)
      presence.set(member.userId, member.role === "spectator" ? "spectating" : room.state,
        { roomId: room.id, role: member.role });
  };
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
      syncPresence(room);
    });
    ws.on("close", () => {
      room.disconnect(client);
      presence.set(client.userId, "reconnecting", { roomId: room.id, role: client.role,
        reconnectUntil: Date.now() + 30000 });
    });
  };
  wss.on("connection", async (ws, req) => {
    let identity;
    try { identity = await identityStore.authenticate(cookieSession(req)); }
    catch (error) {
      console.error(JSON.stringify({ event: "realtime_auth_failed", message: error.message }));
      sendError(ws, "SERVER_UNAVAILABLE");
      ws.close(1011, "identity service unavailable");
      return;
    }
    if (requireRealtimeIdentity && !identity) {
      sendError(ws, "AUTH_REQUIRED");
      ws.close(1008, "authentication required");
      return;
    }
    if (identity) presence.set(identity.user.id, "online");
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
        const client = room?.reconnect(message.reconnectToken, ws, randomUUID(), identity?.user.id || null);
        if (!client) {
          sendError(ws, "RECONNECT_EXPIRED");
          ws.close(1008, "reconnect expired");
          return;
        }
        activate(ws, room, client);
        syncPresence(room);
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
    if (role === "player" && room.reservedUserIds.size && !room.reservedUserIds.has(identity?.user.id)) {
      sendError(ws, "NOT_RESERVED");
      ws.close(1008, "seat not reserved");
      return;
    }
    if (role === "player" && identity && [...room.clients].some((client) => client.userId === identity.user.id)) {
      sendError(ws, "ALREADY_JOINED");
      ws.close(1008, "identity already joined");
      return;
    }
    if (!room.canJoin(role)) {
      ws.send(JSON.stringify({ t: "error", code: role === "spectator"
        ? (room.allowSpectators ? "SPECTATOR_FULL" : "SPECTATOR_DISABLED") : "ROOM_FULL" }));
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
      afkTurns: 0,
      leftMatch: false,
      team: null,
      ready: false,
      host: false,
      character: "mochi",
      weapon: "carrot",
      name: params.name,
      userId: identity?.user.id || null,
      terrainVersion: -1,
      role,
    };
    room.join(client, role, room.reservedTeams.get(client.userId));
    activate(ws, room, client);
    syncPresence(room);
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
  server.roomManager = roomManager;
  server.matchmaking = matchmaking;
  server.parties = parties;
  server.presence = presence;
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = +process.env.PORT || 8080;
  let identityStore;
  let pool;
  if (process.env.DATABASE_URL) {
    pool = createPool();
    await migrate(pool);
    identityStore = new PostgresIdentityStore(pool);
    const recovered = await identityStore.abandonStaleMatches(new Date(Date.now() - 5 * 60 * 1000));
    if (recovered) console.warn(JSON.stringify({ event: "stale_matches_abandoned", count: recovered }));
  } else {
    if (process.env.NODE_ENV === "production") throw new Error("DATABASE_URL is required in production");
    console.warn(JSON.stringify({ event: "ephemeral_identity_store", warning: "identity is lost on restart" }));
    identityStore = new MemoryIdentityStore();
  }
  const server = createServer({ identityStore, requireRealtimeIdentity: !!process.env.DATABASE_URL });
  server.listen(port, () => console.log(JSON.stringify({ event: "server_started", port })));
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => {
    server.gracefulShutdown();
    await pool?.end();
  });
}
