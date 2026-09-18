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
- `READY_EVENT_LOOP_LAG_MS` (mặc định 200): ngưỡng event-loop lag để `/readyz` trả `503`.
- `MODERATION_TOKEN`: bắt buộc nếu muốn dùng đường xác thực token chia sẻ cho `/api/admin/reports*`; admin session (R6, `users.role='admin'`) là đường thay thế có định danh thật, gán qua `scripts/promote-admin.mjs`.

## PostgreSQL và session

- Khi có `DATABASE_URL`, tiến trình chạy các file tăng dần trong `server/db/migrations` trước khi mở cổng HTTP.
- Migration đã áp dụng được ghi trong `schema_migrations`; không sửa migration đã release, hãy thêm version mới.
- Development không có database dùng memory store và log cảnh báo; dữ liệu này mất khi restart và không được phép trong production.
- Session bearer là credential: không ghi raw token vào log, URL hoặc database. Database chỉ giữ SHA-256 digest.
- CI dùng PostgreSQL thật và kiểm tra session tồn tại qua lần đóng/mở connection pool.
- Khi khởi động, match `playing` cũ hơn 5 phút được chuyển sang `abandoned` với recovery reason; không tự cấp kết quả/reward sau crash.
- Realtime server ghi match `playing` trước, sau đó finalize đúng hàng đó bằng result key duy nhất. Lỗi persistence được log bằng `match_begin_failed`/`match_complete_failed` và phải alert; không retry bằng cách tạo result key mới.
- Thực thi retention trong `docs/privacy.md` bằng scheduled database job có audit cho tới khi có automation ở R7/R8.

## Readiness

- `/healthz` chỉ xác nhận process còn chạy (luôn `200 ok`), dùng cho liveness probe.
- `/readyz` (R7) phản ánh trạng thái thật: `{ ready, db, eventLoopLagMs, shuttingDown }`, trả `503` khi `ready: false`. `db` kiểm tra bằng một `SELECT 1` qua `identityStore.ping()` (memory store luôn coi là khỏe vì không có dependency ngoài). `eventLoopLagMs` đo bằng `perf_hooks.monitorEventLoopDelay()`, reset sau mỗi lần đọc nên phản ánh độ trễ gần nhất chứ không phải trung bình từ lúc khởi động; ngưỡng mặc định 200 ms, chỉnh bằng `READY_EVENT_LOOP_LAG_MS`. `shuttingDown` bật ngay khi `gracefulShutdown()` bắt đầu, để load balancer ngừng route trước khi tiến trình thực sự đóng — đặt readiness probe của orchestrator trỏ vào `/readyz`, không phải `/healthz`, nếu muốn drain traffic đúng lúc shutdown.
- Trước R7, `/readyz` luôn trả `ready: true` bất kể trạng thái thật (bug đã ghi trong M8 audit và `ONLINE_GAME_ROADMAP.md`); đã sửa dứt điểm ở đây.

## Bảo mật HTTP

- Mọi response (static lẫn API) đều có `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` và một `Content-Security-Policy` cho phép script/style/font cùng-origin cộng Google Fonts (theo `@import` trong `style.css`), chặn khung nhúng (`frame-ancestors 'none'`).
- `Strict-Transport-Security` chỉ được gửi khi `TRUST_PROXY=true` **và** request có header `X-Forwarded-Proto: https` từ proxy đã cấu hình tin cậy — không tự suy ra HTTPS từ client tự khai để tránh bị giả mạo.
- Đã xác minh CSP không phá trang thật bằng browser smoke thật (Playwright/Chromium chạy được trong môi trường này ở thời điểm R7 — khác các milestone trước ghi "không có Chromium"; kiểm tra lại nếu môi trường CI/dev thay đổi).

## Dependency và secret scan

- `npm run verify` giờ chạy thêm `npm audit --audit-level=high` sau syntax/test, trước browser smoke — build fail nếu có lỗ hổng mức high trở lên trong dependency.
- Chưa có secret scan tự động (ví dụ gitleaks/trufflehog) trong CI; đây vẫn là khoảng trống, thêm khi có công cụ được chọn và xác nhận không false-positive tràn lan trên codebase hiện tại.

## SLO tạm thời (paper SLO — chưa có alert thật)

Đây là mục tiêu ghi lại để đo và tranh luận, **không phải alert đang chạy**. R7 chưa có hệ alerting thật; các ngưỡng dưới đây so với số đo được trong `/metrics` (Prometheus, R1C) và `/readyz`:

| Tín hiệu | Nguồn | Ngưỡng tạm |
|---|---|---|
| API/HTTP availability | uptime `/healthz` | ≥ 99.5% mỗi ngày trong giai đoạn beta |
| Readiness | `/readyz` `ready:false` | không quá 1% thời gian ngoài lúc deploy |
| Tick drift | `/metrics` `gunny_tick_drift_p95` | < 50 ms |
| Event-loop lag | `/readyz` `eventLoopLagMs` | < 200 ms (mặc định `READY_EVENT_LOOP_LAG_MS`) |
| Disconnect rate | tính từ match summary `leavers` | theo dõi xu hướng, chưa chốt ngưỡng cụ thể |
| Report rate | `GET /api/admin/actions`/reports | theo dõi xu hướng, chưa chốt ngưỡng cụ thể |

Khi có hệ alerting thật (Prometheus Alertmanager, Grafana, hoặc dịch vụ tương đương), nối các ngưỡng này vào alert rule thay vì chỉ đọc bằng mắt.

## Quan sát

- Log bootstrap là JSON trên stdout; launchd ghi tại `/tmp/gunny-server.log`.
- Metrics gồm connections, rooms, tick drift p50/p95/p99, heap, snapshot bytes, message reject, reconnect và slow-consumer drop/close.
- Chạy `CLIENTS=30 npm run test:load` trên staging; tăng tới 100 và theo dõi tick drift thay vì suy đoán tải.
- `npm run benchmark:balance` (R4) không phải observability sản xuất, chỉ để đo balance combat offline.

## Backup và restore drill

Chưa tự động hóa; đây là quy trình thủ công operator phải chạy định kỳ (khuyến nghị hàng tháng trước beta) và ghi lại kết quả:

1. `pg_dump --format=custom --file=gunny-$(date +%Y%m%d).dump "$DATABASE_URL"`.
2. Lưu file dump vào object storage tách biệt khỏi database chính, có versioning/lifecycle policy.
3. Drill định kỳ: restore vào một database tạm (`createdb gunny_drill && pg_restore --dbname=gunny_drill gunny-*.dump`), chạy `node scripts/promote-admin.mjs` hoặc một truy vấn xác minh để chắc bản restore đọc được, rồi xoá database tạm.
4. Ghi lại thời điểm drill, người thực hiện, thời gian restore mất bao lâu — đây là dữ liệu để tính RTO/RPO thật, chưa có số nào được chốt.

`tests/database.test.js` xác minh `migrate()` idempotent (chạy lại không áp lại migration cũ) — điều kiện cần cho một restore/redeploy an toàn, nhưng không thay thế drill thật ở trên.

## Rollback

1. Checkout commit/tag trước.
2. `npm ci --omit=dev`.
3. Restart service và kiểm tra ba endpoint trên.
4. Idempotency đã có sẵn ở tầng dữ liệu (không phải riêng rollback): `result_key` (match), `request_id` (currency ledger), `resultKey`/trạng thái `playing` guard (settlement) đều chặn ghi trùng nếu cùng một request được xử lý lại sau rollback/redeploy. Không có migration rollback tự động — nếu một migration mới cần lùi lại, viết migration ngược thành file mới, không sửa file đã release.

SIGTERM/SIGINT đóng WebSocket với code 1001, dừng room timers và HTTP server. Match state nằm trong RAM và được phép mất khi restart.
