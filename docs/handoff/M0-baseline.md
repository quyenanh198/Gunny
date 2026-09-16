# M0 — Chốt baseline, tài liệu và CI

| | |
|---|---|
| Trạng thái | Chưa bắt đầu |
| Phụ thuộc | Không |
| Chặn bước | M1 |
| Cập nhật | 2026-09-16 |

## Mục tiêu

Biết chính xác cái gì đang chạy, đo được, và chạy lại được bằng một lệnh, trước khi đụng vào bất cứ dòng code nào.

## Bối cảnh khi bàn giao

Đã kiểm tra trên `main` tại `1a82f12`:

- `npm test` chạy 50 unit test (`node --test`), xanh.
- `npm run check` là `node --check` cho 10 file, xanh.
- Smoke test trình duyệt nằm ở `scripts/browser-smoke.cjs`, **không có trong `package.json`**, phải chạy tay với Playwright cài ngoài và biến `GAME_URL`, `BROWSER_EXECUTABLE`.
- **Không có CI**, thư mục `.github/workflows` không tồn tại.
- README dòng 105 (mục Phạm vi) vẫn ghi "Chưa có PvP online", sai so với code và mâu thuẫn với chính mục "Chơi online và host trên Mac mini" phía trên cùng file.
- Chưa có tài liệu protocol. Danh sách message chỉ đọc được từ `switch` trong `server/server.js` khoảng dòng 242 đến 295.
- Chưa có số đo hiệu năng nào.

## Phạm vi

Làm:

- Sửa mọi chỗ tài liệu lệch code.
- Viết tài liệu protocol hiện tại, đúng như code đang chạy, không thiết kế lại.
- Đo baseline hiệu năng.
- Gom lệnh test thành `test:browser` và `test:all`.
- Thêm CI chạy đủ bốn loại test.

Không làm:

- Không đổi protocol. Việc đó là M2.
- Không tách file. Việc đó là M1.
- Không sửa gameplay.

## Các bước

1. **Sửa README.** Xóa mệnh đề "Chưa có PvP online" ở mục Phạm vi, viết lại đoạn đó theo trạng thái thật: online qua server tự host, phòng có mã, khán giả, chủ phòng, đội tối đa 3 người và 3 bot.
   Kiểm chứng: `grep -n "Chưa có PvP" README.md` không ra kết quả.
2. **Viết `docs/protocol.md`.** Với mỗi message client gửi (`team`, `ready`, `loadout`, `setup`, `start`, `restart`, `lobby`, `keys`, `aim`, `charge`, `release`, `cancel`): payload, ai được gửi, server kiểm tra gì, bỏ qua im lặng hay báo lỗi. Với snapshot `room`: từng trường, gửi lúc nào, trường nào chỉ gửi khi đổi (`terrain` theo `terrainVersion`).
   Kiểm chứng: đọc chéo với `server/server.js`; mỗi `case` trong `handle()` có đúng một mục trong tài liệu.
3. **Đo baseline.** Script nhỏ trong `scripts/` mở N phòng, mỗi phòng 2 client giả, chạy 60 giây, in: tick trung bình và p95, byte snapshot trung bình, RSS, CPU. Chạy với N = 1, 10, 30. Ghi kết quả vào `docs/baseline.md` kèm ngày và phiên bản Node.
   Kiểm chứng: chạy lại cho số cùng cỡ, lệch dưới 20%.
4. **Gom script.** `test:browser` khởi động server ở cổng tạm, chạy smoke, tắt server. `test:all` chạy `check`, `test`, `test:browser` nối tiếp.
   Kiểm chứng: trên clone sạch, `npm ci && npm run test:all` xanh, không cần biến môi trường thủ công.
5. **CI.** GitHub Actions: Node 22, `npm ci`, `npm run test:all`, cài Chromium cho Playwright. Chạy trên push và pull request.
   Kiểm chứng: một PR nháp cho tick xanh.

## Tiêu chí hoàn thành

- Clone sạch chạy được `npm ci && npm run test:all` trong một lệnh.
- README, `ARCHITECTURE.md`, `docs/protocol.md` và code cùng mô tả một trạng thái.
- Có số baseline lưu trong repo để so sánh regression về sau.
- CI xanh trên `main`.

## Rủi ro

- **Playwright trong CI tải Chromium chậm hoặc bị chặn.** Dùng action chính thức có cache, hoặc cho `test:browser` bỏ qua có thông báo khi không có trình duyệt, nhưng CI thì phải chạy thật.
- **Smoke test còn phụ thuộc thời gian.** Nếu flaky trong CI, đổi sang chờ theo điều kiện, đừng tăng `waitForTimeout`. Lỗi kiểu này đã gặp và ghi ở `REVIEW.md` mục 18.
- **Số đo baseline dễ gây hiểu nhầm** nếu đo trên máy khác nhau. Ghi rõ máy, Node, tải nền.

## Bàn giao cho bước sau

M1 cần từ M0: `docs/protocol.md` đúng thực tế (để refactor không đổi hành vi mà không biết), `test:all` chạy một lệnh (để so sánh trước và sau refactor), và số baseline (để biết refactor có làm chậm không).

## Nhật ký

- 2026-09-16: tạo hand-off. Xác nhận README dòng 105 sai, chưa có CI, smoke test chưa vào script.
