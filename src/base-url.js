// Game chạy ở hai chỗ: gunny.lazybutts.com/ và chat.lazybutts.com/gunny/ (mượn
// đăng nhập của Chat). Đường dẫn tuyệt đối kiểu "/api/rooms" sẽ bắn vào Chat khi
// ở chỗ thứ hai, nên mọi lời gọi đi qua đây: lấy gốc là thư mục của trang hiện
// tại. Caddy cắt tiền tố /gunny trước khi tới server, nên server không đổi gì.
const root = () => new URL(".", (typeof document !== "undefined" && document.baseURI) || "http://localhost/");

/** "api/rooms" -> "/gunny/api/rooms" hoặc "/api/rooms", tuỳ chỗ đang mở. */
export const apiUrl = (relativePath) => new URL(relativePath, root()).toString();

/** Như apiUrl nhưng đổi sang ws/wss để mở WebSocket. */
export function socketUrl(relativePath) {
  const url = new URL(relativePath, root());
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url;
}
