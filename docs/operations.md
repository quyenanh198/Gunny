# Runbook production

## Deploy

1. `git pull --ff-only && npm ci --omit=dev`.
2. `npm test && npm run check` trước khi restart.
3. Dùng `deploy/com.gunny.server.plist` hoặc Docker restart policy để chạy `npm start`.
4. Đặt Caddy/Cloudflare Tunnel phía trước và xác minh WebSocket upgrade tại `/ws`.
5. Kiểm tra `GET /healthz`, `GET /readyz` và `GET /metrics`.

## Quan sát

- Log bootstrap là JSON trên stdout; launchd ghi tại `/tmp/gunny-server.log`.
- Metrics gồm connections, rooms, tick drift lớn nhất, snapshot bytes, message reject và reconnect.
- Chạy `CLIENTS=30 npm run test:load` trên staging; tăng tới 100 và theo dõi tick drift thay vì suy đoán tải.

## Rollback

1. Checkout commit/tag trước.
2. `npm ci --omit=dev`.
3. Restart service và kiểm tra ba endpoint trên.

SIGTERM/SIGINT đóng WebSocket với code 1001, dừng room timers và HTTP server. Match state nằm trong RAM và được phép mất khi restart.
