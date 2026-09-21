// Một chỗ duy nhất lo phiên người chơi. Trước đây chỉ màn hình phòng mới tạo phiên,
// nên ai mở thẳng Khu vực MMO sẽ ăn 401 ở mọi thao tác và hồ sơ rơi về localStorage
// — tức là vàng với thú cưng không được server ghi nhận.
import { apiUrl } from "./base-url.js";

let inFlight = null;

/**
 * Bảo đảm trình duyệt có phiên chơi, trả về tên hiển thị của phiên đó (nếu biết).
 * Gọi bao nhiêu lần cũng được: những lời gọi chồng nhau dùng chung một lần dựng
 * phiên, khỏi tạo hai người khách cho cùng một người.
 */
export function ensureIdentity(displayName = "Khách") {
  inFlight ??= bootstrap(displayName).finally(() => { inFlight = null; });
  return inFlight;
}

async function bootstrap(displayName) {
  const current = await fetch(apiUrl("api/profile"), { credentials: "same-origin" });
  if (current.ok) {
    const session = await current.json().catch(() => null);
    return session?.profile?.displayName || null;
  }
  // Mở từ trong Chat thì đã có người đăng nhập sẵn — hỏi Chat trước, hỏng thì mới
  // tạo khách. Ở gunny.lazybutts.com endpoint này trả 404 và rơi xuống nhánh dưới.
  const linked = await fetch(apiUrl("api/sessions/chat"), { method: "POST", credentials: "same-origin" })
    .catch(() => null);
  if (linked?.ok) {
    const session = await linked.json().catch(() => null);
    return session?.profile?.displayName || null;
  }
  const created = await fetch(apiUrl("api/sessions/guest"), {
    method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName: displayName || "Khách" }),
  });
  if (!created.ok) throw new Error("identity bootstrap failed");
  const session = await created.json().catch(() => null);
  return session?.profile?.displayName || null;
}
