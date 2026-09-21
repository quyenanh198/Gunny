// Chat (chat.lazybutts.com) là nơi giữ đăng nhập của cả nhà. Khi Gunny chạy dưới
// /gunny/* của chính host đó, trình duyệt gửi kèm cookie `lb_session`; Gunny hỏi
// Chat "cookie này là ai" rồi gắn người đó vào một user của mình. Không có mật
// khẩu hay secret dùng chung ở đây — Chat là trọng tài duy nhất.
const CACHE_TTL_MS = 10000;
const MAX_CACHE = 500;

/** Lấy đúng cookie phiên của Chat; cookie khác (kể cả gunny_session) không liên quan. */
export function chatSessionCookie(header = "") {
  const item = header.split(";").map((part) => part.trim()).find((part) => part.startsWith("lb_session="));
  return item || "";
}

export function createChatIdentity({ baseUrl, fetchImpl = fetch, ttlMs = CACHE_TTL_MS, now = Date.now } = {}) {
  if (!baseUrl) return null;
  const root = baseUrl.replace(/\/+$/, "");
  // Mỗi lần mở trang client gọi một lần, nhưng reconnect liên tục thì cache vài
  // giây đủ để không biến Chat thành nút thắt. Khoá theo cookie của Chat chứ
  // không theo cả header: gunny_session đổi sau khi gắn, cache sẽ trượt oan.
  const cache = new Map();
  return {
    async resolve(cookieHeader) {
      const cookie = chatSessionCookie(cookieHeader || "");
      if (!cookie) return null;
      const hit = cache.get(cookie);
      if (hit && hit.until > now()) return hit.user;
      let response;
      try {
        response = await fetchImpl(`${root}/api/me`, { headers: { cookie } });
      } catch {
        // Chat sập thì không chặn đường chơi: client tự lùi về phiên khách.
        return null;
      }
      let user = null;
      if (response.ok) {
        const body = await response.json().catch(() => null);
        if (body?.id !== undefined && body?.id !== null) {
          user = {
            id: String(body.id),
            displayName: String(body.display_name || body.username || "Guest").slice(0, 24),
          };
        }
      }
      if (cache.size >= MAX_CACHE) {
        for (const [key, value] of cache) if (value.until <= now()) cache.delete(key);
        if (cache.size >= MAX_CACHE) cache.clear();
      }
      cache.set(cookie, { user, until: now() + ttlMs });
      return user;
    },
  };
}
