# Runbook production

## Deploy

1. `git pull --ff-only && npm ci --omit=dev`.
2. `npm test && npm run check` trước khi restart.
3. Dùng `deploy/com.gunny.server.plist` hoặc Docker restart policy để chạy `npm start`.
4. Đặt Caddy/Cloudflare Tunnel phía trước và xác minh WebSocket upgrade tại `/ws`.
5. Kiểm tra `GET /healthz`, `GET /readyz` và `GET /metrics`.

Biến môi trường production bắt buộc/khuyến nghị:

- `METRICS_TOKEN`: bắt buộc khi `NODE_ENV=production`; gọi metrics bằng `Authorization: Bearer <token>`.
- `DATABASE_URL`: bắt buộc khi `NODE_ENV=production`; lấy từ secret manager, không commit vào repository.
- `ALLOWED_ORIGINS`: danh sách origin browser được phép, phân cách dấu phẩy.
- `TRUST_PROXY=true` chỉ khi `TRUSTED_PROXY_IPS` liệt kê đúng địa chỉ reverse proxy; không tin `X-Forwarded-For` từ Internet.
- `MAX_CONNECTIONS_PER_IP`, `HANDSHAKES_PER_MINUTE`, `ROOM_CREATES_PER_MINUTE`, `HTTP_REQUESTS_PER_MINUTE`: điều chỉnh theo capacity test, không vô hiệu hóa tùy tiện.

## PostgreSQL và session

- Khi có `DATABASE_URL`, tiến trình chạy các file tăng dần trong `server/db/migrations` trước khi mở cổng HTTP.
- Migration đã áp dụng được ghi trong `schema_migrations`; không sửa migration đã release, hãy thêm version mới.
- Development không có database dùng memory store và log cảnh báo; dữ liệu này mất khi restart và không được phép trong production.
- Session bearer là credential: không ghi raw token vào log, URL hoặc database. Database chỉ giữ SHA-256 digest.
- CI dùng PostgreSQL thật và kiểm tra session tồn tại qua lần đóng/mở connection pool.
- Khi khởi động, match `playing` cũ hơn 5 phút được chuyển sang `abandoned` với recovery reason; không tự cấp kết quả/reward sau crash.
- Thực thi retention trong `docs/privacy.md` bằng scheduled database job có audit cho tới khi có automation ở R7/R8.

## Quan sát

- Log bootstrap là JSON trên stdout; launchd ghi tại `/tmp/gunny-server.log`.
- Metrics gồm connections, rooms, tick drift p50/p95/p99, heap, snapshot bytes, message reject, reconnect và slow-consumer drop/close.
- Chạy `CLIENTS=30 npm run test:load` trên staging; tăng tới 100 và theo dõi tick drift thay vì suy đoán tải.

## Rollback

1. Checkout commit/tag trước.
2. `npm ci --omit=dev`.
3. Restart service và kiểm tra ba endpoint trên.

SIGTERM/SIGINT đóng WebSocket với code 1001, dừng room timers và HTTP server. Match state nằm trong RAM và được phép mất khi restart.
