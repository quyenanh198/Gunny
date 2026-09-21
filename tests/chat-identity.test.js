import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../server/server.js";
import { MemoryIdentityStore } from "../server/memory-identity-store.js";
import { createChatIdentity, chatSessionCookie } from "../server/chat-identity.js";

const listen = (options) => new Promise((resolve) => {
  const server = createServer(options);
  server.listen(0, () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
});
const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });

test("chỉ gửi cookie phiên của Chat đi, bỏ qua cookie khác", () => {
  assert.equal(chatSessionCookie("gunny_session=abc; lb_session=xyz"), "lb_session=xyz");
  assert.equal(chatSessionCookie("gunny_session=abc"), "");
  assert.equal(chatSessionCookie(""), "");
});

test("hỏi Chat một lần rồi dùng cache cho những lần sau trong TTL", async () => {
  let calls = 0;
  let clock = 0;
  const identity = createChatIdentity({
    baseUrl: "http://chat:8082/",
    ttlMs: 1000,
    now: () => clock,
    fetchImpl: async (url, init) => {
      calls += 1;
      assert.equal(url, "http://chat:8082/api/me");
      assert.equal(init.headers.cookie, "lb_session=xyz");
      return reply(200, { id: 7, username: "ken", display_name: "Kèn" });
    },
  });

  assert.deepEqual(await identity.resolve("lb_session=xyz"), { id: "7", displayName: "Kèn" });
  assert.deepEqual(await identity.resolve("lb_session=xyz; gunny_session=mới"), { id: "7", displayName: "Kèn" });
  assert.equal(calls, 1, "cookie của Gunny đổi không được làm trượt cache");

  clock += 1001;
  await identity.resolve("lb_session=xyz");
  assert.equal(calls, 2, "hết TTL thì hỏi lại");
});

test("Chat sập hoặc từ chối thì trả null chứ không ném lỗi", async () => {
  const down = createChatIdentity({ baseUrl: "http://chat:8082", fetchImpl: async () => { throw new Error("ECONNREFUSED"); } });
  assert.equal(await down.resolve("lb_session=xyz"), null);

  const rejected = createChatIdentity({ baseUrl: "http://chat:8082", fetchImpl: async () => reply(401, { error: "unauthorized" }) });
  assert.equal(await rejected.resolve("lb_session=xyz"), null);
});

test("POST /api/sessions/chat gắn người đăng nhập Chat vào đúng một user của Gunny", async () => {
  const identityStore = new MemoryIdentityStore();
  const chatIdentity = createChatIdentity({
    baseUrl: "http://chat:8082",
    ttlMs: 0,
    fetchImpl: async () => reply(200, { id: 42, display_name: "Bo" }),
  });
  const { server, url } = await listen({ identityStore, chatIdentity });
  try {
    const first = await fetch(`${url}/api/sessions/chat`, { method: "POST", headers: { cookie: "lb_session=xyz" } });
    assert.equal(first.status, 201);
    const one = await first.json();
    assert.equal(one.profile.displayName, "Bo");
    assert.match(first.headers.get("set-cookie") || "", /^gunny_session=/);

    const two = await (await fetch(`${url}/api/sessions/chat`, {
      method: "POST", headers: { cookie: "lb_session=xyz" },
    })).json();
    assert.equal(two.user.id, one.user.id, "mở lại trang vẫn là người cũ, ví vàng không mất");
    assert.notEqual(two.token, one.token, "mỗi lần gắn là một phiên riêng");

    const anonymous = await fetch(`${url}/api/sessions/chat`, { method: "POST" });
    assert.equal(anonymous.status, 401, "chưa đăng nhập Chat thì không mượn được danh tính");
  } finally {
    server.gracefulShutdown();
  }
});

test("chạy ngoài Chat thì endpoint không tồn tại, client tự lùi về khách", async () => {
  const { server, url } = await listen({ identityStore: new MemoryIdentityStore(), chatIdentity: null });
  try {
    const res = await fetch(`${url}/api/sessions/chat`, { method: "POST", headers: { cookie: "lb_session=xyz" } });
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error, "CHAT_LINK_DISABLED");
  } finally {
    server.gracefulShutdown();
  }
});
