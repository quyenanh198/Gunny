import test from "node:test";
import assert from "node:assert/strict";
import { PROTOCOL_VERSION } from "../src/play/protocol.js";

class FakeWebSocket {
  static instances = [];
  constructor(url) {
    this.url = url;
    this.readyState = 1;
    this.sent = [];
    FakeWebSocket.instances.push(this);
  }
  send(data) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
}

test("online session versions and sequences input, then enters reconnecting state", async () => {
  globalThis.location = new URL("http://localhost/");
  globalThis.WebSocket = FakeWebSocket;
  const { OnlineSession } = await import("../src/net.js");
  const session = new OnlineSession({ room: "ABCDEF", name: "An" });
  assert.match(String(session.ws.url), /mode=join/);
  session.send({ t: "ready", value: true });
  assert.equal(session.ws.sent[0].protocolVersion, PROTOCOL_VERSION);
  assert.equal(session.ws.sent[0].clientSeq, 1);
  assert.equal(session.ws.sent[0].t, "ready");
  assert.equal(session.ws.sent[0].value, true);
  assert.match(session.ws.sent[0].requestId, /^[A-Za-z0-9_-]+$/);
  session.receive({
    t: "room",
    protocolVersion: PROTOCOL_VERSION,
    serverTick: 12,
    roomVersion: 3,
    lastAckSeq: 1,
    reconnectToken: "token",
    id: "ABCD",
    state: "lobby",
    map: "sky",
    difficulty: "normal",
    bots: [0, 1],
    canStart: true,
    players: [],
    you: session.you,
  });
  session.ws.onclose();
  assert.equal(session.state, "reconnecting");
  assert.match(session.error, /đang thử nối lại/);
  session.leave();
});

test("reconnect credential is sent in the resume frame, never in the URL", async () => {
  globalThis.location = new URL("https://game.example/");
  globalThis.WebSocket = FakeWebSocket;
  const { OnlineSession } = await import("../src/net.js");
  const session = new OnlineSession({ room: "ABCDEF", name: "An" });
  session.reconnectToken = "1234567890abcdef";
  session.connect();
  const socket = session.ws;
  assert.doesNotMatch(String(socket.url), /reconnectToken|1234567890abcdef/);
  assert.match(String(socket.url), /mode=resume/);
  socket.onopen();
  assert.deepEqual(socket.sent[0], { t: "resume", protocolVersion: PROTOCOL_VERSION,
    room: "ABCDEF", reconnectToken: "1234567890abcdef" });
  session.leave();
});
