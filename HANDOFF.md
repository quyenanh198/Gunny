# Hand-off

## M1 — Tách code, giữ nguyên hành vi

Trạng thái: hoàn thành; đích tích hợp là nhánh `main`.

### Phạm vi

- Tách logic chiến đấu, bot và thứ tự lượt khỏi `src/match.js`.
- Tách renderer/HUD/input khỏi `src/game.js`.
- Tách quản lý phòng và validation khỏi `server/server.js`.
- Chuyển nội dung asset/map vào `src/content/` và giữ các entry point tương thích.
- Không đổi protocol, gameplay, asset hoặc layout.

### Nhật ký

- Khởi tạo hand-off và chốt phạm vi M1.
- Baseline: `npm test` đạt 50/50; `npm run check` đạt.
- Đã chuyển asset/map sang `src/content/`; giữ `src/assets.js` và `src/maps.js` làm entry point tương thích.
- Đã tách xử lý nổ, chọn phát bắn bot và chọn lượt kế tiếp vào `src/core/`.
- Đã tách constants, PRNG và chuẩn hóa roster vào `src/core/match-config.js` nhưng giữ nguyên export công khai từ `src/match.js`.
- Đã tách lớp `Room` authoritative khỏi bootstrap HTTP/WebSocket vào `server/room.js`.
- Đã tách `RoomManager` và parsing/validation kết nối khỏi bootstrap server.
- Đã tách battle renderer, HUD, input adapter và responsive sizing khỏi `src/game.js` vào `src/ui/`.
- Đã tách screen controller khỏi `src/game.js` vào `src/ui/screens.js`.
- Đã cập nhật README, tài liệu kiến trúc và syntax check để bao phủ toàn bộ module mới.

### Xác minh gần nhất

- `git diff --check` — đạt.
- `npm test` — 50/50 test đạt sau toàn bộ refactor.
- `npm run check` — đạt và bao phủ mọi tệp JavaScript trong `src/` và `server/`.
- Browser smoke chưa chạy vì môi trường không có Chromium/Playwright; không có thay đổi chủ ý về layout hoặc giao diện.

### Bước tiếp theo

- Bắt đầu M2 bằng protocol version và schema validation trong một PR riêng.

## M2 — Protocol online bền vững

Trạng thái: đang thực hiện trên nhánh `main`.

### Phạm vi hiện tại

- Protocol version và schema validation cho client message.
- `clientSeq`, `lastAckSeq`, `serverTick` và `roomVersion`.
- Heartbeat, reconnect token và giữ ghế 30 giây.
- Giới hạn kích thước/tần suất message và error code máy đọc được.
- Playwright trong `devDependencies` cùng browser smoke script chuẩn.

### Nhật ký

- Chốt phạm vi M2 và tiêu chí test trước khi sửa protocol.
- Thêm test contract cho version, sequence, payload và loại message.
- Thêm protocol dùng chung và parser có giới hạn 4 KiB, error code cho JSON/schema sai.
- Server snapshot có tick/version/ack/token; duplicate/out-of-order bị bỏ, input bị rate-limit, WebSocket có heartbeat.
- Ghế và host được giữ 30 giây; reconnect cùng token nhận full terrain snapshot và tiếp tục client cũ.
- Mở rộng server integration test cho metadata protocol, invalid/duplicate input và reconnect giữ nguyên ID/ghế/host.
- Client tự gắn version/sequence, theo dõi ack/tick/version/token và chuyển `reconnecting` khi WebSocket rớt.
- Error code được dịch sang thông báo tiếng Việt; token hết hạn bị từ chối thay vì âm thầm tạo ghế mới.
- Khai báo `playwright` trong `devDependencies` và thêm `npm run test:browser`; registry của môi trường trả HTTP 403 nên chưa tải package/browser được.
- Ghi contract protocol v1 tại `docs/protocol.md` và cập nhật trạng thái M2 trong roadmap.
- Thêm unit test client cho versioned sequence và trạng thái reconnecting.
- Schema từ chối field thừa, bao gồm payload giả mạo như tự gửi `hp`.
- Đồng bộ README và ARCHITECTURE với protocol/reconnect hiện tại.
- Thêm integration test cho giới hạn 4 KiB và rate limit 60 message/giây.

### Bước tiếp theo

- Thêm network simulation cho latency/jitter/loss và đánh giá snapshot delta trước khi chốt M2.

### Xác minh gần nhất

- `git diff --check` — đạt.
- `npm run check` — đạt.
- `npm test` — 57/57 test đạt.
- `npm ci --ignore-scripts --dry-run --offline` — lockfile hợp lệ với Playwright.
- `npm run test:browser` — chưa chạy được vì registry chặn tải Playwright bằng HTTP 403, nên package chưa có trong `node_modules`.

## M3–M4 — Đồng bộ và responsive cross-platform

Trạng thái: đang thực hiện trên nhánh `main`.

### Phạm vi

- Buffer snapshot 100–150 ms, nội suy vị trí actor/projectile và snap khi sai khác lớn.
- Đồng hồ lượt bám snapshot server; tab nền/online không làm thay đổi authoritative state.
- Canvas backing store theo DPR tối đa 2, giữ hệ logic 1200×620.
- Safe-area, touch target 44 px, portrait/landscape và pointer lifecycle.

### Nhật ký

- Chốt phạm vi M3–M4 và tiêu chí kiểm thử trước khi thay đổi sync/render.
- Thêm test cho buffer trễ 100 ms, nội suy và snap correction lớn.
- Thêm `SnapshotBuffer` thuần với delay mặc định 120 ms và ngưỡng snap 80 px.
- `RemoteMatch` áp dụng state rời rạc từ server nhưng render actor/projectile qua buffer; timer aim đếm từ mốc server và reconnect xóa buffer cũ.
- Khi snapshot mới đến, giữ nguyên vị trí đang render cho tới fixed update kế tiếp để tránh một frame teleport trước nội suy.
- Buffer dùng `serverTick` để loại snapshot cũ/out-of-order trước khi nội suy theo thời điểm nhận.
- Auto-skip người mất kết nối sau 30 giây, khớp reconnect grace period thay vì 1,5 giây.
- Canvas backing store dùng DPR 1–2 nhưng giữ hệ tọa độ logic; thêm safe-area và touch target tối thiểu 44 px.
- Thêm nút tinh chỉnh góc ±0,5°/±1°, hủy input khi đổi orientation và gợi ý xoay ngang không chặn portrait.
- Bật `viewport-fit=cover` để safe-area hoạt động trên iOS.
- Thêm test programmatic cho DPR cap, safe-area, touch target, portrait hint và bốn nút aim chính xác.
- Cập nhật roadmap, README và kiến trúc theo trạng thái M3–M4 hiện tại.

### Xác minh gần nhất

- `git diff --check` — đạt.
- `npm run check` — đạt.
- `npm test` — 62/62 test đạt.
- `npm run test:browser` — không chạy được và không thể chụp screenshot vì môi trường không có Playwright/Chromium; registry vẫn trả HTTP 403.

### Bước tiếp theo

- Chạy browser smoke trên ma trận viewport và đo FPS khi registry cho phép cài Playwright/Chromium.
- Thêm network simulation latency/jitter/loss trước khi chốt M3; chỉ đánh giá snapshot delta sau khi full snapshot đã soak ổn định.

## M5 — Gameplay cốt lõi kiểu Gunbound

Trạng thái: đang thực hiện trên nhánh `work`.

### Phạm vi

- `TurnQueue` deterministic theo delay, có thể tạo hai lượt liên tiếp.
- S1/S2/SS và thanh SS authoritative.
- Item Power Up, Blood, Teleport, Dual trong core combat.
- Map profile, match stats và bot xét chi phí delay.

### Nhật ký

- Chốt luật tối thiểu cho M5 và bắt đầu bằng test core trước khi nối UI/protocol.
- Thêm test fail cho lượt liên tiếp theo delay, modifier S2/item và điều kiện SS.
- Thêm `TurnQueue`, S1/S2/SS, bốn item modifier và SS gain trong core deterministic.
- Nối delay queue, shot/item, SS, teleport và match stats vào `Match`; lựa chọn reset mỗi lượt.
- Mở rộng protocol/snapshot cho action, SS, upcoming queue và stats; cập nhật test luân phiên cũ sang luật delay mới.
- Thêm UI chọn S1/S2/SS, item, thanh SS dạng số và preview năm lượt kế tiếp.
- Thêm wind range và ground hardness riêng cho năm map; server dùng profile trong gió và crater.
- Bot chọn SS khi đầy và cân nhắc delay S2 theo độ khó; chưa tách Worker vì chưa có profiling.
- Thêm test chống client tự gửi SS và xác minh Match tự tính SS cost, HP cost và delay.
- Bảng kết quả hiển thị hit rate, damage, terrain damage và average action delay từ stats authoritative.
- Cập nhật roadmap/README/protocol; M5 còn character-specific shot behavior và balance simulation trước khi chốt.

### Xác minh gần nhất

- `git diff --check` — đạt.
- `npm run check` — đạt.
- `npm test` — 68/68 test đạt.
- `npm run test:browser` — chưa chạy/chụp screenshot được vì Playwright vẫn không có trong môi trường.

### Bước tiếp theo

- Thêm hành vi S1/S2/SS riêng theo nhân vật và balance simulation để chốt M5.

## M6–M7 — Vòng đời người chơi và production

Trạng thái: đã merge vào nhánh `main`; M7 chờ benchmark trên máy đích.

### Nhật ký

- Chốt phạm vi tối thiểu: Quick Join, chat/kick/history; readiness, metrics, graceful shutdown và runbook.
- Thêm integration test fail cho Quick Join, `/readyz` và metrics Prometheus.
- Thêm Quick Join room selection và counters cho connections/rooms/tick drift/snapshot bytes/reject/reconnect.
- Thêm nút Vào nhanh trên home; nếu không có phòng phù hợp thì tạo phòng mới trong cùng thao tác.
- Thêm chat 160 ký tự có rate limit, host kick trước trận và render tên/chat bằng `textContent` thay vì `innerHTML`.
- Lưu tối đa 10 kết quả trận gần nhất trong RAM khi phòng quay về lobby.
- Thêm graceful shutdown, structured bootstrap log, production runbook và load-smoke 30–100 client.
- Cập nhật roadmap M6 hoàn thành trong phạm vi RAM và M7 sẵn sàng staging; benchmark tick p95 phải chạy trên Mac mini đích.

### Xác minh gần nhất

- `git diff --check` — đạt.
- `npm run check` — đạt.
- `npm test` — 70/70 test đạt.
- Browser screenshot vẫn bị chặn vì Playwright/Chromium không có trong môi trường.

### Bước tiếp theo

- Chạy load smoke trên Mac mini để chốt tick p95 và thêm UI mute chat trước khi tuyên bố hoàn tất tuyệt đối.
