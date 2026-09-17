# Hand-off

> Cập nhật 2026-09-17: M1–M7 bên dưới là lịch sử triển khai prototype. Các nhãn “sẵn sàng beta/staging” cũ không còn là kết luận phát hành. Kế hoạch hiện hành là **M8 — Product reset audit** và `ONLINE_GAME_ROADMAP.md` v2.

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

## M8 — Product reset audit: từ room demo thành webgame online

Trạng thái: **audit hoàn thành; chưa triển khai remediation**. Đây là hand-off đang có hiệu lực.

### Vì sao phải reset

M1–M7 đã tạo một combat/room prototype đáng giữ, nhưng thứ tự đầu tư bị lệch: gameplay, animation, map, item và responsive đi trước identity, persistence, matchmaking, moderation và release safety. Kết quả hiện tại chơi demo tốt nhưng chưa có vòng đời của một webgame online và chưa đủ điều kiện public beta.

### Bằng chứng đã kiểm tra trên `main`

- `server/server.js` tự serve static, API và WebSocket trong một process; comment đầu file xác nhận không database.
- `server/room.js` giữ client, chat, history, reconnect token và match hoàn toàn trong RAM.
- `src/game.js` chỉ lưu display name trong `localStorage`; không có account/player identity bền vững.
- `/api/quick-join` gọi `RoomManager.quickJoin()`, chỉ lấy phòng lobby đầu tiên còn chỗ; chưa phải queue/matchmaking.
- WebSocket nhận reconnect token từ query string; chưa có `Origin` allowlist.
- Rate limit là counter 60 message/giây trên từng socket; chưa có handshake/IP/room-create limit.
- `Room.handle("team")` chưa enforce capacity; direct join không có hard cap tổng client/seat.
- `Room.broadcast()` gửi trực tiếp mà không kiểm tra `ws.bufferedAmount`.
- `/readyz` luôn trả `ready: true`; `/metrics` và `/api/rooms` không có access control.
- `game.js` 419 dòng, `match.js` 442 dòng, `room.js` 368 dòng và `net.js` 316 dòng; tuyên bố M1 hoàn tất cần hiểu là refactor bước đầu, chưa đạt ranh giới module mục tiêu.
- Repository có 74 test khai báo, nhưng máy audit không có Node/npm nên chưa chạy lại suite; không được kế thừa con số pass cũ như bằng chứng mới.
- Không tìm thấy CI workflow trong repository ở thời điểm audit.

### Quyết định giữ, sửa và dừng

Giữ:

- Pure combat rules, fixed-step simulation, authoritative room match, snapshot buffer, responsive battle shell và test hiện có.
- Vanilla JS hiện tại trong giai đoạn foundation; chưa có lý do đổi framework.

Sửa:

- Định nghĩa lại sản phẩm quanh loop identity → queue/party → match → settlement → progression.
- Đổi roadmap sang R0–R8 trong `ONLINE_GAME_ROADMAP.md`; thu hồi nhãn beta/staging cũ.
- Hardening protocol/room trước khi thêm account economy hoặc content.
- Thêm PostgreSQL cho identity/profile/result; Redis chỉ khi chạy nhiều process thực sự cần.
- Biến Quick Join thành matchmaking rõ mode/region/team/version.
- Bổ sung moderation, admin, telemetry, SLO, CI và recovery trước public beta.

Dừng/hoãn:

- Không thêm map, nhân vật, vũ khí, animation hoặc item cho tới khi R0–R2 qua exit criteria.
- Không làm rank/guild/season/shop/battle pass trước persistence và settlement idempotent.
- Không tách microservice hoặc đổi framework trước khi modular monolith và baseline tải chứng minh cần thiết.

### Backlog remediation ưu tiên

P0 — Product và delivery baseline:

1. Chốt product brief, beta slice, IP/name policy và capacity target.
2. Thêm `npm run verify` portable, CI required checks và branch protection.
3. Ghi benchmark có thể lặp lại: tick p50/p95/p99, event-loop lag, heap, snapshot bytes/s.

P0 — Network/security:

1. Tách create/join/spectate; bỏ hành vi room lạ tự động được tạo.
2. Kiểm tra room/team capacity ở server boundary.
3. Bỏ reconnect token khỏi URL; thêm origin allowlist và trusted-proxy policy.
4. Thêm handshake/IP/rate/backpressure controls và error/ack có ngữ nghĩa.
5. Viết chaos tests cho duplicate, reorder, loss, latency và reconnect race.

P1 — Nền tảng sản phẩm:

1. Guest identity, session rotation và account linking.
2. PostgreSQL migrations cho profile, match và result settlement idempotent.
3. Party/matchmaking/presence; sau đó mới tới MMR.
4. Mute/block/report/ban và admin audit trail.

P2 — Nội dung và kinh tế:

1. Engine/content version per match, deterministic replay và checksum.
2. Balance simulator trước khi mở rộng content.
3. Cosmetic-first progression, inventory và currency ledger sau persistence.
4. LiveOps/config rollout, kill switch và analytics funnel.

### Hợp đồng cho người tiếp nhận

- Bắt đầu tại R0, không tiếp tục “bước kế tiếp M5” trong hand-off cũ.
- Mọi PR phải ghi rõ roadmap item, user outcome, threat/failure case và cách verify.
- Không nâng trạng thái một milestone chỉ dựa trên code tồn tại; phải đạt exit criteria và có CI run/link hoặc benchmark artifact.
- Khi code và tài liệu lệch nhau, cập nhật cả `ONLINE_GAME_ROADMAP.md` và mục M8 này trong cùng PR.
- Thay đổi đầu tiên được khuyến nghị là một PR foundation nhỏ: product brief + verify/CI + protocol/room threat model; chưa đổi gameplay.

### Rủi ro chưa được giải quyết

- Pháp lý/IP của tên “Gunny” và mức độ tương đồng với game tham chiếu.
- Chưa có quyết định audience/độ tuổi, privacy, monetization và fairness.
- Chưa có capacity target nên chưa thể kết luận một process/Mac mini đủ hay không.
- Chưa có Node/npm trong môi trường audit này; 74 test chỉ là số lượng khai báo, không phải kết quả chạy mới.

## M9 — R0 product contract và delivery baseline

Trạng thái: **đã triển khai và verify local; chờ CI/merge**.

### Đã thay đổi

- Thay roadmap cũ bằng Product Reset v2 và chốt working product contract trong `PRODUCT_BRIEF.md`.
- Ghi threat model cho browser/HTTP/WebSocket/room/match trong `docs/threat-model.md`.
- Thêm feature flags có default an toàn; Quick Join và room chat có thể tắt ở deployment boundary.
- Thay syntax check phụ thuộc Unix bằng `scripts/check-syntax.mjs` chạy được trên Windows/Linux.
- Thêm `npm run verify`: syntax → unit/integration → khởi động server → browser smoke → shutdown.
- Thêm GitHub Actions cho verify và baseline 30 client; baseline được upload làm artifact 30 ngày.
- Thêm tick drift p50/p95/p99, heap metric và snapshot throughput report.
- Nâng Playwright 1.55.0 lên 1.55.1 để xử lý security advisory của browser download.

### Xác minh local 2026-09-17

- `npm run verify` — đạt.
- Syntax — 46 JavaScript files đạt.
- `node --test` — 76/76 đạt.
- Browser smoke — đạt: 27 assets, 5 maps, 80 animation frames, bốn viewport và fallback.
- `npm audit --audit-level=high` — 0 vulnerability.
- 30-client baseline — connect 73 ms; tick drift p50 9,33 ms, p95 12,33 ms, p99 23,33 ms; 263.606 snapshot bytes/s; heap 10.044.288 bytes.

### Điều kiện merge

- PR required checks `verify` và `baseline` phải xanh.
- Sau merge, bật branch protection cho `main` với required status check và pull-request workflow.
- R1 bắt đầu từ threat/invariant list; không thêm gameplay content trong PR kế tiếp.

## M10 — R1A room lifecycle, capacity và Origin policy

Trạng thái: **đã triển khai và verify local; chờ CI/merge**.

### Đã thay đổi

- Tách rõ WebSocket mode `create`, `join`, `spectate`; join mã không tồn tại trả `ROOM_NOT_FOUND`, không âm thầm tạo room.
- Tăng room code từ 4 lên 6 ký tự và cập nhật client/input/invite flow.
- Room có visibility `public`/`private`; danh sách phòng và Quick Join chỉ thấy phòng public.
- Join đang chơi phải dùng spectator mode; spectator không được cấp team/seat gameplay.
- Enforce tối đa 6 player và 6 spectator tại server boundary; chuyển team không thể vượt `MAX_TEAM`.
- Thêm same-origin WebSocket policy và allowlist cấu hình bằng `ALLOWED_ORIGINS`.
- Load benchmark tạo room explicit để tiếp tục đo đúng lifecycle mới.
- Snapshot trả role; room listing tách số player/spectator.

### Xác minh local

- `npm run verify` — đạt.
- Syntax — 46 JavaScript files đạt.
- Node test — 77/77 đạt.
- Browser smoke — đạt toàn bộ.
- `npm audit --audit-level=high` — 0 vulnerability.
- Integration test mới phủ unknown-room join, cross-origin rejection và client thứ bảy bị `ROOM_FULL`.

### Phạm vi R1 còn lại

- R1B: đưa reconnect credential ra khỏi URL; handshake/auth timeout; accepted ack/error và sequence semantics.
- R1C: IP/handshake/room-create quota, snapshot backpressure, slow-consumer policy và chaos/fuzz tests.

## M11 — R1B session credential và command acknowledgement

Trạng thái: **đã triển khai và verify local; chờ CI/merge**.

### Đã thay đổi

- Nâng protocol lên v2; mọi command có `requestId` và `clientSeq`.
- Server gửi `ack` cho command được chấp nhận và `error` kèm request/sequence cho command bị từ chối.
- Authorization/phase failure không consume sequence; duplicate/out-of-order trả `STALE_SEQUENCE`.
- Reconnect token không còn nằm trong WebSocket URL; client gửi token trong resume frame đầu tiên.
- Resume frame phải đến trong 5 giây, khớp protocol/room/token và không chứa field lạ.
- Reconnect thành công rotate token trước full snapshot; token cũ không replay được.
- Client theo dõi pending request theo request ID và đóng pending khi nhận ack/error.
- Viết lại `docs/protocol.md` theo contract v2.

### Xác minh local

- `npm run verify` — đạt.
- Node test — 80/80 đạt.
- Browser smoke — đạt toàn bộ.
- `npm audit --audit-level=high` — 0 vulnerability.
- Test mới chứng minh token không xuất hiện trong URL, token rotate/replay fail, rejected sequence được tái sử dụng và accepted command có ack.

### Phạm vi R1 còn lại

- R1C: quota theo IP/handshake/room creation, trusted proxy policy, outbound snapshot backpressure, slow-consumer close code và network chaos/fuzz coverage.

## M12 — R1C abuse controls, backpressure và chaos coverage

Trạng thái: **đã triển khai và verify local; chờ CI/merge**.

### Đã thay đổi

- Thêm fixed-window quota cho handshake, active connection/IP, room creation/IP và HTTP API/IP.
- `X-Forwarded-For` chỉ được tin khi `TRUST_PROXY=true` và remote address nằm trong `TRUSTED_PROXY_IPS`.
- Snapshot được coalesce khi socket vượt 256 KiB buffered; vượt 1 MiB đóng bằng WebSocket code 1013.
- Metrics thêm slow-consumer drop/close; `/metrics` yêu cầu bearer token trong production.
- Rate limiter tự prune để không tăng memory vô hạn theo số key.
- Thêm protocol fuzz 500 input, unit test trusted proxy/rate window và integration test quota.
- Thêm network-chaos simulation với 300 ms latency, jitter, 25% loss và reordered stale packet; render state không đi lùi.
- Cập nhật runbook cho secrets, origin, proxy và quota production.

### Xác minh local

- `npm run verify` — đạt.
- Syntax — 50 JavaScript files đạt.
- Node test — 88/88 đạt.
- Browser smoke — đạt toàn bộ.
- `npm audit --audit-level=high` — 0 vulnerability.

### Hand-off sang R2

- R1 đã đóng phần foundation trong một process. Volumetric DDoS phải chặn ở edge; network/device soak thật tiếp tục là gate R8.
- R2 phải xây guest identity, rotating session và PostgreSQL migrations trước profile/progression.
- Không dùng reconnect token hoặc display name làm player identity.
