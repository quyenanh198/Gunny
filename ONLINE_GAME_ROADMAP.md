# Lộ trình Gunny Chibi Arena thành game online kiểu Gunbound

## 1. Điểm xuất phát

Code trên `main` đã là **online MVP**, không còn là game offline cần gắn mạng từ đầu:

- `server/server.js` giữ phòng và chạy `Match` authoritative ở 120 Hz.
- WebSocket gửi snapshot 20 Hz; client chỉ gửi ý định.
- `OnlineSession`/`RemoteMatch` cho client online; `LocalSession` giữ chế độ luyện tập.
- Có sảnh, phòng chờ, khán giả, host, đội 1–3 người, bot, 5 map.
- Màn trận đã khóa trong `100dvh` và tự fit canvas 1200×620.

Vì vậy mục tiêu tiếp theo là: **ổn định mạng, tách kiến trúc, làm sâu gameplay kiểu Gunbound, hoàn thiện responsive và vận hành production**.

## 2. Nguyên tắc không đổi

1. Server là nguồn sự thật. Client không quyết định damage, lượt, vị trí, RNG hoặc kết quả.
2. `core` là logic thuần, deterministic, chạy được trên server và test.
3. Gameplay dùng hệ tọa độ logic cố định 1200×620 trên mọi thiết bị. View chỉ scale/crop UI, không đổi vật lý.
4. Desktop, tablet và mobile dùng cùng luật; khác layout và input adapter.
5. Mỗi giai đoạn phải deploy được, test xanh, có thể rollback độc lập.
6. Không thêm tài khoản, xếp hạng hoặc kinh tế trước khi reconnect và trận online ổn định.

## 3. Kiến trúc đích

```text
src/
  content/                 nhân vật, vũ khí, item, map
  core/                    luật thuần
    match.js
    combat.js
    turn-queue.js
    bot.js
    physics.js
  play/
    local-session.js
    online-session.js
    protocol.js
    remote-match.js
  ui/
    screens/               home, room, battle, result
    input/                 keyboard, pointer, touch
    battle-renderer.js
    hud.js
    responsive.js
server/
  server.js                bootstrap HTTP/WS
  room-manager.js
  room.js
  connection.js
  validation.js
  metrics.js
```

Luồng online:

```text
Input người chơi
  -> lệnh có sequence number
  -> server xác thực phòng/ghế/lượt/rate limit
  -> Match authoritative cập nhật fixed-step
  -> snapshot có tick + version
  -> client buffer, nội suy, render
  -> snapshot sai khác lớn: snap/correct
```

## 4. Lộ trình thực hiện

### Giai đoạn 0 — Chốt baseline và sửa tài liệu lệch nhau

Mục tiêu: biết chính xác cái gì đang chạy trước khi refactor.

- Sửa README đang ghi “chưa có PvP online”, trái với code và phần hướng dẫn online.
- Ghi protocol hiện tại: message type, payload, quyền gửi, response, lỗi.
- Ghi performance baseline: server tick, snapshot size, CPU/RAM với 1/10/30 phòng.
- Đưa smoke test vào script chuẩn: `test:browser`, `test:all`.
- CI chạy unit, syntax, server integration, browser smoke ở 4 viewport.

Hoàn thành khi:

- Clone sạch, `npm ci && npm run test:all` chạy một lệnh.
- README, `ARCHITECTURE.md`, code cùng mô tả một trạng thái.
- Có số baseline để phát hiện regression.

### Giai đoạn 1 — Tách code, giữ nguyên hành vi

Mục tiêu: giảm rủi ro trước khi thêm gameplay.

- Tách `match.js`: `combat.js`, `bot.js`, `turn-queue.js` placeholder, `match.js` điều phối.
- Tách `game.js`: screen controller, renderer, HUD, input adapters.
- Tách `server/server.js`: HTTP bootstrap, `RoomManager`, `Room`, connection validation.
- Chuyển `assets.js`/`maps.js` sang `content/`; tách metadata ảnh khỏi balance data.
- Giữ public interface của `LocalSession`, `OnlineSession`, `Match` trong bước này.

Hoàn thành khi:

- Replay cùng seed cho state cuối giống trước refactor.
- Không đổi protocol, gameplay, ảnh hoặc layout.
- Không module orchestration nào vượt khoảng 300–400 dòng mà không có lý do rõ.

### Giai đoạn 2 — Protocol online bền vững

Mục tiêu: chịu được mạng thật, tab nền, Wi-Fi chập chờn và client lỗi.

- Thêm `protocolVersion`, schema validation cho mọi message.
- Mỗi input có `clientSeq`; snapshot có `serverTick`, `lastAckSeq`, `roomVersion`.
- Heartbeat/ping, timeout rõ ràng, trạng thái `connecting/reconnecting/disconnected`.
- Reconnect token ngắn hạn; giữ ghế 30–60 giây; resync full snapshot khi quay lại.
- Input idempotent; bỏ message cũ, trùng hoặc sai phase.
- Giới hạn kích thước message, tần suất input, số kết nối/IP, số phòng.
- Error code máy đọc được; UI dịch thành thông báo tiếng Việt.
- Snapshot delta sau khi full snapshot ổn định; chưa cần binary protocol sớm.

Hoàn thành khi:

- Mất mạng 10 giây rồi nối lại vẫn giữ ghế và state.
- Client gửi trùng/out-of-order không tạo hai phát bắn.
- Client sửa payload không thể tự tăng HP, damage, energy hoặc chiếm lượt.
- Test mô phỏng latency 50/150/300 ms, jitter, packet loss, reconnect.

### Giai đoạn 3 — Đồng bộ và cảm giác chơi

Mục tiêu: hình ảnh mượt nhưng server vẫn authoritative.

- Buffer snapshot 100–150 ms; nội suy actor/projectile theo `serverTick`.
- Client prediction chỉ cho thao tác cục bộ ít rủi ro: aim, charge UI, nút di chuyển.
- Server reconciliation cho vị trí; sửa mềm dưới ngưỡng, snap khi sai lớn.
- Đồng hồ lượt lấy mốc server, không đếm độc lập trên client.
- Pause chỉ áp dụng luyện tập. Online: mở help/tab ẩn không dừng server.
- Khi người có lượt mất kết nối: chờ grace period rồi auto-skip.

Hoàn thành khi:

- Hai client thấy cùng lượt, HP, crater, kết quả.
- Không teleport đáng kể ở 150 ms latency.
- Tab nền quay lại tự resync, không phát input bị kẹt.

### Giai đoạn 4 — Responsive cross-platform

Mục tiêu: desktop, tablet, mobile chơi được; không chỉ “co nhỏ desktop”.

#### Layout chung

- Giữ battlefield logic 1200×620.
- Dùng `100dvh`, safe-area (`env(safe-area-inset-*)`), `ResizeObserver`.
- Canvas render theo `devicePixelRatio`, CSS size riêng; cap DPR 2 để giữ hiệu năng.
- HUD dùng DOM, không scale toàn bộ cùng canvas. Text/nút giữ kích thước đọc/chạm được.
- Không scroll trong battle; home/room/result được scroll.

#### Desktop ≥ 1024 px

- HUD hai cạnh, wind/turn queue trên cùng, control bar dưới.
- Keyboard: A/D, mũi tên, Space; pointer vẫn hoạt động.
- Có tooltip/phím tắt; focus state đầy đủ.

#### Tablet 600–1023 px

- HUD compact, control bar hai hàng nếu cần.
- Touch target tối thiểu 44×44 CSS px.
- Hỗ trợ landscape và portrait; landscape ưu tiên nhưng không khóa.

#### Mobile < 600 px

- Landscape là chế độ chơi ưu tiên.
- Portrait: trận vẫn xem/chơi được; hiện gợi ý xoay ngang không chặn người dùng.
- Điều khiển chia hai cụm: trái di chuyển; phải góc/lực/bắn.
- Nút tăng/giảm góc 0,5° và 1°; slider là thao tác nhanh.
- Nút bắn dùng pointer capture; xử lý `pointercancel`, mất focus, đổi orientation.
- Turn queue, item, chat mở bằng sheet/panel; không che mục tiêu và quỹ đạo.

#### Ma trận kiểm tra

- 1920×1080, 1440×900, 1366×768.
- iPad 1024×768 và 768×1024.
- iPhone 390×844, 844×390.
- Android nhỏ 360×800, 800×360.
- DPR 1/2/3, reduced motion, touch-only, keyboard-only.

Hoàn thành khi:

- Battle không tràn hoặc scroll ở mọi viewport trên.
- Nút chính ≥44×44 px; text HUD chính ≥12 px thực tế.
- Aim chính xác 0,5° trên touch.
- 60 FPS thiết bị trung bình; không rebuild terrain mỗi frame.

### Giai đoạn 5 — Gameplay cốt lõi kiểu Gunbound

Mục tiêu: tạo chiều sâu trước khi thêm nhiều nội dung.

- Thay xen kẽ cứng bằng `TurnQueue` theo delay.
- Thời gian suy nghĩ, loại shot, item cùng cộng delay trên server.
- HUD luôn hiển thị 5–8 lượt kế tiếp.
- Mỗi nhân vật có S1, S2, SS; SS nạp bằng damage nhận/gây ra theo thiết kế chốt.
- 3–4 item đầu: Power Up, Blood, Teleport, Dual; mọi hiệu ứng nằm trong `combat`.
- Map có wind range, ground hardness, spawn profile riêng.
- Thống kê trận: hit rate, damage, terrain damage, average action delay.
- Bot tính cả sai số điểm rơi và chi phí delay; bot chạy Worker/worker thread nếu profiling chứng minh cần.

Hoàn thành khi:

- Có tình huống hợp lệ đi hai lượt liên tiếp vì delay thấp.
- Replay deterministic giữ đúng turn queue.
- Client không thể sửa delay/SS/item.
- Balance test bảo đảm không shot/item nào luôn tối ưu.

### Giai đoạn 6 — Vòng đời người chơi

Mục tiêu: người chơi vào trận nhanh, ở lại được, không cần hệ thống quá lớn.

- Quick Join theo phòng còn ghế; private room bằng mã vẫn giữ.
- Chat phòng/trận với mute, rate limit, giới hạn độ dài.
- Ready check, kick bởi host trước trận, chuyển host ổn định.
- Spectator join giữa trận bằng full snapshot; spectator không gửi input gameplay.
- Match history ngắn trong RAM trước; chỉ thêm database khi thật sự cần tài khoản/lịch sử lâu dài.
- Tên người chơi có validation; không render bằng `innerHTML`.

Hoàn thành khi:

- Người mới từ home vào trận trong ≤3 thao tác với Quick Join.
- Spectator vào giữa trận thấy state đúng.
- Chat/input spam không làm chậm tick loop.

### Giai đoạn 7 — Production trên Mac mini

Mục tiêu: chạy ổn định cho vài chục người.

- HTTPS/WSS qua Caddy hoặc Cloudflare Tunnel; xác minh WebSocket upgrade.
- Process supervision: launchd hoặc Docker restart policy; graceful shutdown.
- Health: `/healthz` cho process; `/readyz` cho tick loop và room manager.
- Metrics: active connections, rooms, tick drift, snapshot bytes, message reject count, reconnect count.
- Structured logs có room ID/session ID; không log token reconnect.
- Backup chỉ cần config/deploy; state trận trong RAM chấp nhận mất khi restart ở quy mô hiện tại.
- Load test WebSocket 30–100 client; đặt ngưỡng dựa trên tick p95, không dựa cảm giác.

Hoàn thành khi:

- Tick p95 không trễ quá 16 ms ở tải mục tiêu.
- Restart không để process/cổng treo; client nhận trạng thái mất server rõ ràng.
- Có runbook deploy, rollback, xem log, kiểm tra health.

## 4b. Hand-off theo từng bước

Mỗi mốc M0 đến M7 có một file bàn giao ở `docs/handoff/`, đủ để một người chưa đọc repo cầm lên là làm được: trạng thái hiện tại đã kiểm chứng, phạm vi làm và không làm, các bước kèm cách kiểm chứng, rủi ro, và thứ phải để lại cho bước sau. Bảng trạng thái và quy ước cập nhật ở `docs/handoff/README.md`.

Khi code và hand-off lệch nhau thì hand-off sai; sửa nó trong cùng commit làm lệch.

## 5. Thứ tự ưu tiên đề xuất

| Mốc | Nội dung | Giá trị | Phụ thuộc |
|---|---|---:|---|
| M0 | Baseline, docs, CI | Bắt lỗi sớm | Không |
| M1 | Refactor giữ hành vi | Mở đường sửa an toàn | M0 |
| M2 | Protocol, reconnect, validation | Online dùng được ngoài LAN ổn định | M1 |
| M3 | Sync, interpolation, tab/background | Cảm giác chơi | M2 |
| M4 | Responsive/input cross-platform | Desktop/mobile thật sự chơi được | M1; kiểm cùng M2–M3 |
| M5 | Delay, S1/S2/SS, item | Bản sắc Gunbound | M1–M3 |
| M6 | Quick Join, chat, spectator | Vòng đời social | M2 |
| M7 | Production, metrics, load test | Vận hành | M2–M6 |

M4 nên chạy song song theo từng feature, nhưng chỉ chốt sau M3 vì reconnect và tab nền ảnh hưởng mạnh mobile.

## 6. Việc chưa nên làm

- Không chuyển framework chỉ vì `game.js` dài; tách module trước.
- Không dùng client lockstep thuần hoặc đồng bộ input ngang hàng; server authoritative hiện đúng.
- Không thêm database, account, rank, shop, guild trước reconnect và protocol validation.
- Không thêm auto-aim. Giữ skill bằng góc, lực, gió; chỉ hỗ trợ tinh chỉnh chính xác.
- Không gửi toàn bộ terrain 20 lần/giây. Giữ version/delta hoặc gửi crater events kèm resync.
- Không đổi kích thước thế giới theo viewport; sẽ làm vật lý và cân bằng khác giữa thiết bị.
- Không tối ưu bot bằng Worker trước profiling; online bot chạy server, nghẽn chính có thể là room tick hoặc serialization.

## 7. PR đầu tiên nên làm

Phạm vi nhỏ, không đổi gameplay:

1. Sửa README về trạng thái PvP online.
2. Thêm `src/play/protocol.js` chứa version, message constants, validation cơ bản.
3. Thêm `clientSeq/serverTick` vào message và snapshot nhưng giữ tương thích tạm một version.
4. Thêm test message sai, trùng, out-of-order.
5. Thêm test viewport 360×800 và 800×360.
6. Thêm `npm run test:all`.

Không gộp refactor toàn bộ, reconnect và hệ delay vào cùng PR.

## 8. Tiêu chí phát hành online beta

- 2–6 người chơi thật hoàn thành 20 trận không desync.
- Reconnect trong 30 giây giữ ghế và khôi phục trận.
- Không input giả nào thay đổi state ngoài lượt/quyền.
- Desktop, iOS Safari, Android Chrome chơi đủ một trận.
- Không scroll trong battle; touch không kẹt charge/move sau orientation change.
- Server chịu tải mục tiêu với tick p95 đạt ngưỡng.
- Có log, health check, rollback và thông báo khi server mất kết nối.

