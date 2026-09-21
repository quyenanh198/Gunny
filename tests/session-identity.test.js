import test from "node:test";
import assert from "node:assert/strict";
import { ensureIdentity } from "../src/session-identity.js";

const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
/** Thay fetch bằng bảng tra: đường dẫn nào trả gì, và ghi lại thứ tự gọi. */
const stubFetch = (routes) => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(url).pathname;
    calls.push(`${init.method || "GET"} ${path}`);
    const route = routes[path];
    if (!route) throw new Error(`không có route cho ${path}`);
    return typeof route === "function" ? route() : route;
  };
  return calls;
};

test("đã có phiên thì không tạo thêm gì", async () => {
  const calls = stubFetch({ "/api/profile": reply(200, { profile: { displayName: "Ken" } }) });
  assert.equal(await ensureIdentity("Khách"), "Ken");
  assert.deepEqual(calls, ["GET /api/profile"]);
});

test("chưa có phiên nhưng đang đăng nhập Chat thì mượn danh tính bên đó", async () => {
  const calls = stubFetch({
    "/api/profile": reply(401, {}),
    "/api/sessions/chat": reply(201, { profile: { displayName: "Người Chat" } }),
  });
  assert.equal(await ensureIdentity("Khách"), "Người Chat");
  assert.deepEqual(calls, ["GET /api/profile", "POST /api/sessions/chat"]);
});

test("chạy ngoài Chat thì tạo phiên khách", async () => {
  const calls = stubFetch({
    "/api/profile": reply(401, {}),
    "/api/sessions/chat": reply(404, { error: "CHAT_LINK_DISABLED" }),
    "/api/sessions/guest": reply(201, { profile: { displayName: "Bé Ba" } }),
  });
  assert.equal(await ensureIdentity("Bé Ba"), "Bé Ba");
  assert.deepEqual(calls, ["GET /api/profile", "POST /api/sessions/chat", "POST /api/sessions/guest"]);
});

test("hai chỗ cùng gọi một lúc chỉ dựng một phiên", async () => {
  const calls = stubFetch({
    "/api/profile": reply(401, {}),
    "/api/sessions/chat": reply(404, {}),
    "/api/sessions/guest": reply(201, { profile: { displayName: "Khách" } }),
  });
  // Màn hình phòng và Khu vực MMO có thể cùng khởi động một lúc.
  const [a, b] = await Promise.all([ensureIdentity("Khách"), ensureIdentity("Khách")]);
  assert.equal(a, "Khách");
  assert.equal(b, "Khách");
  assert.equal(calls.filter((c) => c.endsWith("/api/sessions/guest")).length, 1);
});

test("không tạo nổi phiên thì báo lỗi chứ không im lặng", async () => {
  stubFetch({
    "/api/profile": reply(401, {}),
    "/api/sessions/chat": reply(404, {}),
    "/api/sessions/guest": reply(500, {}),
  });
  await assert.rejects(() => ensureIdentity("Khách"), /identity bootstrap failed/);
});
