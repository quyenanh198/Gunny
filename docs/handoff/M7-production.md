# M7 — Production trên Mac mini

| | |
|---|---|
| Trạng thái | Chưa bắt đầu |
| Phụ thuộc | M2 đến M6 |
| Chặn bước | Phát hành beta |
| Cập nhật | 2026-09-16 |

## Mục tiêu

Chạy ổn định cho vài chục người, có thể xem log, biết khi nào hỏng, và quay lui được.

## Bối cảnh khi bàn giao

Đã có:

- `Dockerfile` chạy `node:22-alpine`, cổng 8080, `HEALTHCHECK` gọi `/healthz`.
- `/healthz` trả `ok` trong `server/server.js`.
- `deploy/com.gunny.server.plist` cho launchd, có `KeepAlive` và log ra `/tmp/gunny-server.log`.
- README hướng dẫn cài trên Mac mini, dùng Tailscale hoặc reverse proxy có HTTPS.
- Timer phòng dùng `unref()` nên tiến trình thoát sạch khi đóng server.

Chưa có:

- `/readyz` phân biệt tiến trình sống với vòng tick còn chạy.
- Metrics dưới mọi hình thức.
- Log có cấu trúc. Hiện chỉ một dòng `console.log` lúc khởi động.
- Graceful shutdown. `SIGTERM` giết ngay, client không biết vì sao mất kết nối.
- Load test.
- Runbook.

## Phạm vi

Làm: HTTPS/WSS, giám sát tiến trình, health và ready, metrics, log có cấu trúc, load test, runbook.

Không làm: backup state trận. Ở quy mô này, mất state khi restart là chấp nhận được và roadmap đã chốt như vậy.

## Các bước

1. **HTTPS/WSS.** Caddy hoặc Cloudflare Tunnel trước cổng 8080. Xác minh WebSocket upgrade đi qua được, vì đây là chỗ hay hỏng nhất.
   Kiểm chứng: mở link HTTPS từ máy khác, chơi hết một trận online.
2. **Graceful shutdown.** Bắt `SIGTERM`: ngừng nhận kết nối mới, gửi mã lỗi "server đang khởi động lại" cho mọi client, đóng sau tối đa 5 giây.
   Kiểm chứng: restart khi đang có trận, client hiện thông báo đúng thay vì im lặng mất kết nối.
3. **`/readyz`.** Trả không sẵn sàng nếu vòng tick trễ quá ngưỡng hoặc `RoomManager` chưa khởi tạo.
   Kiểm chứng: giả lập tick trễ, endpoint đổi trạng thái.
4. **Metrics.** Đếm: kết nối đang mở, số phòng, độ trễ tick p50 và p95, byte snapshot, số message bị từ chối, số lần reconnect. Xuất dạng text đơn giản ở `/metrics`, không cần Prometheus ngay.
   Kiểm chứng: đọc được khi đang có 2 phòng chạy.
5. **Log có cấu trúc.** Một dòng JSON mỗi sự kiện, có `roomId` và `sessionId`. Không log token reconnect của M2.
   Kiểm chứng: `grep` theo `roomId` dựng lại được một trận.
6. **Load test.** 30 đến 100 client WebSocket giả. Đặt ngưỡng theo tick p95, không theo cảm giác.
   Kiểm chứng: có số, ghi vào `docs/baseline.md` cạnh số của M0.
7. **Runbook** trong `docs/runbook.md`: deploy, rollback, xem log, kiểm tra health, xử lý khi tick trễ.
   Kiểm chứng: người chưa từng deploy làm theo được.

## Tiêu chí hoàn thành

- Tick p95 không trễ quá 16 ms ở tải mục tiêu.
- Restart không để tiến trình hoặc cổng treo; client nhận thông báo rõ ràng.
- Có runbook cho deploy, rollback, log, health.

## Rủi ro

- **Reverse proxy chặn WebSocket upgrade.** Đây là lỗi im lặng: trang tải được, phòng thì không vào được. Kiểm ngay ở bước 1, đừng để cuối.
- **Metrics tự nó làm chậm tick** nếu tính p95 mỗi tick. Lấy mẫu, đừng tính đủ.
- **Log quá nhiều** làm đầy đĩa Mac mini. Xoay vòng log hoặc giới hạn mức.

## Bàn giao cho bước sau

Phát hành beta cần đủ 7 tiêu chí ở mục 8 của `ONLINE_GAME_ROADMAP.md`. Khi xong M7, đối chiếu từng dòng và ghi kết quả vào đây.

## Nhật ký

- 2026-09-16: tạo hand-off. Xác nhận đã có `/healthz`, Dockerfile và plist; chưa có `/readyz`, metrics, log có cấu trúc, graceful shutdown.
