# M1 — Tách module, giữ nguyên hành vi

| | |
|---|---|
| Trạng thái | Chưa bắt đầu |
| Phụ thuộc | M0 |
| Chặn bước | M2, M4, M5 |
| Cập nhật | 2026-09-16 |

## Mục tiêu

Đưa code về hình dạng ở mục 3 của `ONLINE_GAME_ROADMAP.md` mà không đổi một hành vi nào, để các bước sau sửa ít chỗ và dễ xác minh.

## Bối cảnh khi bàn giao

Kích thước hiện tại, đo trên `main` tại `1a82f12`:

| File | Dòng | Vấn đề |
|---|---|---|
| `src/game.js` | 689 | Ba màn hình, input, render, HUD chung một file |
| `src/match.js` | 469 | Luật lượt, đạn, hiệu ứng, bot, thắng thua chung một class |
| `server/server.js` | 385 | HTTP tĩnh, WebSocket, `Room`, validation chung một file |
| `src/net.js` | 240 | `OnlineSession` và `RemoteMatch` |
| `src/assets.js` | 118 | Vừa là danh mục ảnh vừa là bảng cân bằng vũ khí |

`Match` đã nhận `roster` nên `LocalSession` và `Room` chỉ dựng dữ liệu rồi đưa vào, không vá actor sau khi tạo.

## Phạm vi

Làm:

- `src/content/`: `characters.js`, `weapons.js`, `maps.js`. Tách metadata ảnh khỏi số cân bằng.
- `src/core/`: `physics.js` giữ nguyên, tách `combat.js` (bắn, nổ, sát thương, hố), `bot.js` (tìm nước đi), `turn-queue.js` (chỉ là chỗ trống có API, chưa đổi luật), `match.js` còn điều phối.
- `src/play/`: `local-session.js`, `online-session.js`, `remote-match.js`, `protocol.js` (hằng số và kiểm tra cơ bản).
- `src/ui/`: `screens/`, `input/`, `battle-renderer.js`, `hud.js`, `responsive.js`.
- `server/`: `server.js` chỉ bootstrap, thêm `room-manager.js`, `room.js`, `connection.js`, `validation.js`.

Không làm:

- Không đổi public interface của `LocalSession`, `OnlineSession`, `Match`.
- Không đổi protocol, gameplay, ảnh, layout.
- Không thêm `TurnQueue` thật. Chỉ để API rỗng cho M5.

## Các bước

Thứ tự này giữ test xanh sau mỗi bước, commit được từng bước:

1. `content/` trước, vì không ai phụ thuộc ngược vào nó. Cập nhật import ở `match.js`, `game.js`, `server.js`.
   Kiểm chứng: `npm run test:all` xanh, `tests/assets.test.js` và `tests/maps.test.js` không sửa.
2. `core/bot.js`: chuyển `botShot` và `simulate` ra khỏi `physics.js`. Giữ nguyên chữ ký hàm.
   Kiểm chứng: test bot trong `tests/physics.test.js` chỉ đổi dòng import.
3. `core/combat.js`: chuyển `explode`, `damage`, `crater`, `fallDamage` và phần bắn khỏi `Match`.
   Kiểm chứng: `tests/match.test.js` không sửa; nếu phải sửa nghĩa là hành vi đã đổi.
4. `server/`: tách `Room` và validation ra file riêng, `server.js` chỉ còn bootstrap và route.
   Kiểm chứng: `tests/server.test.js` không sửa.
5. `ui/`: tách `game.js` cuối cùng vì nó thay đổi nhiều nhất và smoke test là lưới an toàn duy nhất.
   Kiểm chứng: smoke test xanh hai lần liên tiếp.

## Tiêu chí hoàn thành

- Chạy lại cùng seed cho state cuối giống hệt trước refactor. Cách kiểm: viết một test tạm dựng `Match({seed: 7})`, chạy 2000 tick với input cố định, in hash của actor và terrain; so trước và sau.
- Protocol, gameplay, ảnh, layout không đổi.
- Không module điều phối nào vượt 300 đến 400 dòng mà không có lý do ghi trong file.
- `npm run test:all` xanh; số baseline không tệ hơn 20%.

## Rủi ro

- **Tách `game.js` làm hỏng thứ tự khởi tạo.** `game.js` hiện gọi `await start()` ở cấp module và dựa vào thứ tự gắn sự kiện. Tách theo màn hình trước, giữ một `main.js` điều phối, đừng tách ngẫu nhiên theo chức năng.
- **Import vòng** giữa `core` và `content`: `content` không được import `core`.
- **Mất tính deterministic** nếu chuyển nhầm một chỗ dùng `this.random` sang `Math.random`. Đây là lỗi im lặng, chỉ test replay bắt được. Làm test replay ở bước 0 của M1, trước khi tách.

## Bàn giao cho bước sau

M2 cần: `src/play/protocol.js` tồn tại và là nơi duy nhất khai báo tên message; `server/validation.js` là nơi duy nhất kiểm tra payload. M5 cần `core/turn-queue.js` có sẵn API rỗng và `core/combat.js` là nơi duy nhất áp hiệu ứng lên sát thương.

## Nhật ký

- 2026-09-16: tạo hand-off. Ghi kích thước file hiện tại làm mốc.
