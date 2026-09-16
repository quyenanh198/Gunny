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
  const session = new OnlineSession({ room: "ABCD", name: "An" });
  session.send({ t: "ready", value: true });
  assert.deepEqual(session.ws.sent[0], {
    protocolVersion: PROTOCOL_VERSION,
    clientSeq: 1,
    t: "ready",
    value: true,
  });
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
