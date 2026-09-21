import test from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import { createServer } from "../server/server.js";
import { PROTOCOL_VERSION } from "../src/play/protocol.js";
import { MemoryIdentityStore } from "../server/memory-identity-store.js";

const listen = (options) => new Promise((resolve) => {
  const server = createServer(options);
  server.listen(0, () => resolve({ server, port: server.address().port }));
});

/** Một kết nối như client thật: mang cookie phiên, gom message để test chờ đúng cái mình cần. */
const connect = (port, query, cookie) => new Promise((resolve, reject) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?${new URLSearchParams(query)}`,
    { headers: { cookie } });
  const queue = [];
  let clientSeq = 0;
  const client = {
    ws,
    closed: new Promise((done) => ws.on("close", (code) => done(code))),
    send: (msg) => {
      clientSeq++;
      ws.send(JSON.stringify({ protocolVersion: PROTOCOL_VERSION, clientSeq, requestId: `r${clientSeq}`, ...msg }));
    },
    next: () => (queue.length ? Promise.resolve(queue.shift()) : new Promise((r) => { client.waiter = r; })),
  };
  ws.on("message", (data) => {
    const message = JSON.parse(data);
    if (client.waiter) { const w = client.waiter; client.waiter = null; w(message); }
    else queue.push(message);
  });
  ws.on("open", () => resolve(client));
  ws.on("error", reject);
});
const until = async (client, predicate, tries = 40) => {
  for (let i = 0; i < tries; i++) {
    const message = await client.next();
    if (predicate(message)) return message;
  }
  throw new Error("không thấy message mong đợi");
};

const withServer = async (run) => {
  const identityStore = new MemoryIdentityStore();
  const session = await identityStore.createGuest("Ken");
  const { server, port } = await listen({ identityStore, requireRealtimeIdentity: true });
  try {
    await run({ port, cookie: `gunny_session=${session.token}` });
  } finally {
    server.gracefulShutdown();
  }
};

// Đặt timeout: bản chưa sửa không đóng socket khi rời phòng, test sẽ treo thay vì báo hỏng.
test('bấm "Rời phòng" rồi vào lại ngay phòng đó thì vào được', { timeout: 10000 }, async () => {
  await withServer(async ({ port, cookie }) => {
    const host = await connect(port, { room: "", name: "Ken", mode: "create", visibility: "public" }, cookie);
    const room = await until(host, (m) => m.t === "room");
    host.send({ t: "leave" });
    assert.equal(await host.closed, 1000, "rời phòng là đóng bình thường, không phải lỗi");

    const again = await connect(port, { room: room.id, name: "Ken", mode: "join" }, cookie);
    const back = await until(again, (m) => m.t === "room" || m.t === "error");
    assert.equal(back.t, "room", `vào lại phải được, nhận được ${back.code || back.t}`);
    again.ws.close();
  });
});

test("ghế của kết nối đã đứt được trả lại cho chính chủ, không khoá người ta ngoài phòng", { timeout: 10000 }, async () => {
  await withServer(async ({ port, cookie }) => {
    const first = await connect(port, { room: "", name: "Ken", mode: "create", visibility: "public" }, cookie);
    const room = await until(first, (m) => m.t === "room");
    first.ws.terminate(); // rớt mạng thô: không kịp báo gì cho server
    await first.closed;

    const second = await connect(port, { room: room.id, name: "Ken", mode: "join" }, cookie);
    const back = await until(second, (m) => m.t === "room" || m.t === "error");
    assert.equal(back.t, "room", `vào lại phải được, nhận được ${back.code || back.t}`);
    assert.equal(back.players.filter((p) => p.name === "Ken").length, 1, "không để lại bóng ma trong danh sách");
    second.ws.close();
  });
});

test("mở cùng phòng ở hai cửa sổ cùng lúc thì vẫn bị chặn", { timeout: 10000 }, async () => {
  await withServer(async ({ port, cookie }) => {
    const first = await connect(port, { room: "", name: "Ken", mode: "create", visibility: "public" }, cookie);
    const room = await until(first, (m) => m.t === "room");

    const second = await connect(port, { room: room.id, name: "Ken", mode: "join" }, cookie);
    const answer = await until(second, (m) => m.t === "room" || m.t === "error");
    assert.equal(answer.t, "error");
    assert.equal(answer.code, "ALREADY_JOINED");
    first.ws.close();
  });
});
