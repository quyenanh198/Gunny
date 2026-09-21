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

## M13 — R2A guest identity và PostgreSQL foundation

Trạng thái: **đã triển khai và verify local; chờ CI/merge**.

### Đã thay đổi

- Thêm guest user bằng UUID opaque, profile mặc định và bearer session 256-bit.
- API `POST /api/sessions/guest`, `POST /api/sessions/rotate`, `GET /api/profile`; token rotate một lần và token cũ bị từ chối.
- Chỉ lưu SHA-256 digest của session token; raw token không đi vào URL hay database.
- Thêm PostgreSQL migration/repository cho `users`, `profiles`, `sessions`, `matches`, `match_participants` và lịch sử migration.
- Production bắt buộc có `DATABASE_URL`; memory store chỉ dành cho local/test và phát cảnh báo mất dữ liệu khi restart.
- CI có PostgreSQL 17 service; integration test đóng pool/mở lại để chứng minh identity vẫn tồn tại.

### Xác minh local

- Node test — 90 pass, 1 PostgreSQL integration test skip khi máy local không có `TEST_DATABASE_URL`.
- PostgreSQL integration test là bắt buộc trong job `verify` trên CI.
- `npm audit` — 0 vulnerability.

### Phạm vi R2 còn lại

- R2B: cập nhật profile bằng optimistic concurrency, lưu match summary/participant và settlement idempotent.
- R2C: recovery trận dang dở, revoke/export/delete, consent/retention policy và kiểm thử exit criteria toàn R2.

## M14 — R2B profile concurrency và match history

Trạng thái: **đã triển khai và verify local; chờ CI/merge**.

### Đã thay đổi

- `PATCH /api/profile` yêu cầu `expectedVersion`; cập nhật thành công tăng version, stale write trả `PROFILE_VERSION_CONFLICT`.
- `GET /api/matches` chỉ trả lịch sử của user đang xác thực, giới hạn tối đa 50 bản ghi mới nhất.
- Repository settlement ghi match + participant trong một transaction.
- `result_key` unique và `ON CONFLICT DO NOTHING` tạo idempotency boundary: cùng kết quả gửi lại trả `applied: false` và không ghi participant lần hai.
- Integration test PostgreSQL kiểm tra optimistic concurrency, match history và replay settlement.

### Phạm vi R2 còn lại

- R2C nối identity vào realtime participant, tự ghi kết quả authoritative, đánh dấu/recover match dang dở.
- Thêm revoke/export/delete, consent/retention và test exit criteria end-to-end trước khi đóng R2.

## M15 — R2C privacy và crash recovery

Trạng thái: **đã triển khai và verify local; chờ CI/merge**.

### Đã thay đổi

- API consent, export dữ liệu, revoke session và delete account đều yêu cầu bearer session hợp lệ.
- Delete account revoke toàn bộ session, soft-delete user và ẩn danh display name; match facts còn lại bị giới hạn bởi retention policy.
- Migration bổ sung consent timestamp và index phục vụ recovery.
- Startup chuyển match `playing` quá 5 phút sang `abandoned`; tuyệt đối không suy diễn winner/reward sau process crash.
- `docs/privacy.md` chốt data inventory và retention beta: session đã hết hạn/revoke 30 ngày, match 180 ngày.
- PostgreSQL integration test bao phủ consent/export/delete và chỉ abandon match stale, không đụng match mới.

### Phạm vi R2 còn lại

- R2D: xác thực user cho WebSocket player, tự mở/chốt match authoritative và ghi disconnect outcome.
- Sau R2D phải chạy exit test xuyên suốt restart, history và replay settlement trước khi chuyển R3.

## M16 — R2D realtime identity

Trạng thái: **đã triển khai và verify local; chờ CI/merge**.

### Đã thay đổi

- Guest/rotate API cấp thêm cookie `gunny_session` HttpOnly, SameSite=Strict và Secure trong production.
- Browser kiểm tra profile cookie trước khi mở WebSocket; nếu chưa có thì tự bootstrap guest identity bằng display name hiện tại.
- Production WebSocket bắt buộc session hợp lệ, trả `AUTH_REQUIRED` cho anonymous socket; user UUID được bind vào player server-side.
- Bearer vẫn dùng được cho API/cross-device client, nhưng token không đi vào WebSocket URL.
- RoomManager chuyển thành state theo từng server instance, loại bỏ rò rỉ room giữa test/process instance.

### Phạm vi R2 còn lại

- R2E tự ghi match `playing`, chốt authoritative result/participant/disconnect và chạy exit test xuyên restart.

## M17 — R2E authoritative match settlement

Trạng thái: **đã triển khai và verify local; chờ CI/merge**.

### Đã thay đổi

- Room tạo UUID match và ghi trạng thái `playing` cùng authenticated participants ngay khi start.
- Khi engine authoritative chuyển sang `over`, server tự chốt winner/draw, round, map, outcome và disconnect flag.
- Rời trận sớm/restart giữa trận chốt `abandoned`; không cấp winner giả. Process crash được recovery R2C xử lý.
- Finalize cập nhật đúng hàng `playing`, dùng result key `match:<uuid>`; gọi lại hoặc result key trùng trả `applied: false`.
- Một identity không thể chiếm hai player seat trong cùng room; resume production phải khớp cả reconnect token và user identity.
- Test memory lifecycle và PostgreSQL lifecycle chứng minh history của hai phía, disconnect outcome và replay không ghi lần hai.

### Exit criteria R2

- Session bearer/cookie cùng trỏ về UUID/profile bền vững; pool/server restart vẫn đọc được identity và history.
- Profile dùng optimistic version, stale write bị chặn.
- Match lifecycle tồn tại trong PostgreSQL từ `playing` đến `completed`/`abandoned`; replay settlement không thể nhân đôi.
- Consent, export, revoke, delete, retention và recovery policy đã có contract/test. Account linking email/OAuth được chủ đích để sau, không tự lưu password.

### Hand-off sang R3

- Bắt đầu matchmaking queue/party trên identity hiện tại; không dùng room code hoặc display name làm identity.
- Social safety (block/mute/report), chat moderation và reconnect trong queue là acceptance criteria trước rank/season.

## M18 — R3A matchmaking queue

Trạng thái: **đã triển khai và verify local; chờ CI/merge**.

### Đã thay đổi

- Queue authenticated theo mode, region, team size và protocol version; enqueue idempotent, cancel chỉ áp dụng khi còn queued.
- Hỗ trợ beta `casual-1v1` và `casual-2v2`; không ghép sai mode/team/version.
- Chỉ mở rộng khác region khi mọi ticket trong nhóm đã chờ đủ 15 giây; kết quả đánh dấu `matchedRegion=global`.
- Match tạo private room dành chỗ theo user UUID, tắt bot và không thể start trước khi đủ người.
- API enqueue/status/cancel và SLA được ghi trong `docs/matchmaking.md`.
- Unit/integration test phủ exact pool, version reject, controlled widening, 2v2 threshold, cancellation và reserved room.

### Phạm vi R3 còn lại

- R3B party/invite lifecycle và team-atomic queue.
- R3C presence/reconnect routing, spectator policy và leaver/AFK consistency.
- R3D mute/block/report, profanity/chat retention và admin review queue.

## M20 — R3C presence, reconnect và leaver policy

Trạng thái: **đã triển khai và verify local; chờ CI/merge**.

### Đã thay đổi

- Presence theo identity với route room và state online/queued/matched/lobby/playing/spectating/reconnecting/offline.
- Queue, room join, command transition, disconnect và resume đều cập nhật presence; reconnect route hết hạn cùng grace 30 giây.
- Matchmade room tắt spectator; direct room vẫn giữ policy tối đa 6 spectator.
- Player bị remove sau grace mang cờ leaver sticky; reconnect không xóa được disconnect outcome trong settlement.
- Hai turn AFK do mất kết nối sẽ forfeit actor, đánh dấu leaver và để authoritative engine chốt winner bình thường.
- Match summary lưu danh sách leaver; API presence được xác thực và chỉ trả state của chính user.

### Phạm vi R3 còn lại

- R3D mute/block/report, profanity/chat retention và admin review queue; đây là phần cuối trước khi đóng R3.

## M19 — R3B party và team-atomic matchmaking

Trạng thái: **đã triển khai và verify local; chờ CI/merge**.

### Đã thay đổi

- Party tối đa hai người, tách khỏi room/match; create/read/leave có contract authenticated.
- Invite UUID ràng buộc target, hết hạn sau 5 phút, không replay; party đầy hoặc target đã có party bị từ chối.
- Chỉ leader invite/kick/enqueue/cancel; leader leave chuyển quyền cho member vào sớm nhất, party rỗng tự disband.
- Membership bị khóa khi party đang queued/matched để ticket không thay đổi giữa chừng.
- Matchmaking dùng party như ticket nguyên tử, tìm tổ hợp đủ player và phân team chính xác; member cùng party luôn cùng reserved team.
- Cancelled user/party có thể enqueue ticket mới; member không thể tự cancel ticket của leader.

### Phạm vi R3 còn lại

- R3C presence/reconnect routing, spectator policy và leaver/AFK consistency.
- R3D mute/block/report, profanity/chat retention và admin review queue.

## M21 — R3D social safety, chat moderation và admin review queue

Trạng thái: **đã triển khai và verify local; chờ CI/merge**. Đây là milestone đóng R3 (sau M18 R3A, M19 R3B, M20 R3C).

### Đã thay đổi

- `SocialSafety` (`server/social-safety.js`) là cache block/mute theo identity, nạp qua `loadSocial()` khi authenticate HTTP, khi WebSocket connect và trước khi enqueue matchmaking, để chặn ngay không cần reconnect.
- API mới: `POST /api/social/block`, `POST /api/social/mute` (`{targetId, enabled}`), `POST /api/social/report` (`{targetId, roomId, category, details}`).
- Block chặn hai chiều: `MatchmakingQueue` nhận `canMatch` hook để không ghép hai identity đã block nhau vào cùng ticket; `Room.snapshot()` lọc `chat` theo `SocialSafety.canView(viewer, sender)` trên từng client, kể cả khi reconnect nhận full snapshot.
- Chat được lọc tục tĩu server-side (`sanitize()`) trước khi broadcast và trước khi ghi audit; bản ghi audit tách khỏi buffer 30 tin nhắn trong RAM của room.
- Migration `003_social_safety.sql` thêm `user_blocks`, `user_mutes`, `moderation_reports`, `chat_messages` (retention mặc định 7 ngày). PostgreSQL store purge chat hết hạn mỗi giờ qua `pruneExpiredChat()`; memory store (dev/test) không cần vì ephemeral.
- Admin review queue tối thiểu: `GET /api/admin/reports`, `PATCH /api/admin/reports/:id` (`status: reviewing|closed`), gated bằng `Authorization: Bearer <MODERATION_TOKEN>` — không có fallback cho phép khi thiếu token, giống pattern `/metrics`. Đây chưa phải admin RBAC/audit-by-identity; phần đó là R6.
- Sửa một bug cú pháp còn sót lại trong `MemoryIdentityStore.loadSocial` (`split(":"")`) từ một phiên làm việc trước đó chưa commit.
- Viết `docs/moderation.md` ghi contract block/mute/report, chat pipeline và giới hạn đã biết chuyển sang R6.

### Xác minh local 2026-09-17

- `node scripts/check-syntax.mjs` — 65 JavaScript files đạt.
- `node --test` — 115 pass / 3 skip (skip là PostgreSQL integration test cần `TEST_DATABASE_URL`, không chạy được trên máy dev này).
- `npm audit --audit-level=high` — 0 vulnerability.
- Test mới: `tests/social-safety.test.js` (unit, 8 test cho load cache, block hai chiều, canView, sanitize, report validation) và `tests/moderation-api.test.js` (tích hợp HTTP + WebSocket thật, 5 test cho block/mute API validation, report + admin queue auth, matchmaking từ chối cặp bị block, và chat filtering theo viewer qua reconnect/broadcast thật).
- Chưa chạy `npm run verify` đầy đủ (browser smoke) vì môi trường không có Chromium/Playwright, nhất quán với các milestone trước.

### Hand-off sang R4

- R3 đóng ở đây: matchmaking, party, presence/leaver và social safety đều có server-side enforcement và test. MMR, guild, season vẫn hoãn tới sau R5/R6 theo roadmap.
- R4 tiếp tục tách `Match` thành state machine/combat/terrain/turn module rõ ràng, deterministic replay + checksum, và content schema versioning — không mở rộng map/vũ khí/item mới cho tới khi pipeline đó xong.
- `MODERATION_TOKEN` phải được set trong mọi environment không phải dev trước khi admin review queue được dùng thật; hiện chưa có UI admin, chỉ có API.

## M22 — R4 replay, checksum, content schema và balance simulator

Trạng thái: **một phần, hoàn thành local; chờ CI/merge**. Đúng tinh thần R4: giữ core combat, không thêm map/vũ khí/nhân vật mới.

### Đã thay đổi

- `src/core/replay.js`: `matchChecksum(match)` (hash sha256 trên state gameplay-relevant, loại particles/trail/blasts/popups/animation), `applyCommand(match, entry)` (áp một command đã log giống hệt `Room.handle()`), `replayMatch({config, commands, totalTicks, checksumLog, dt})` (dựng lại `Match` từ seed/roster, tick lại toàn bộ, so checksum theo tick và trả `divergedAt` nếu lệch).
- `server/room.js`: thêm `commandLog` (mọi command aim/charge/release/cancel/action/keys, gắn `serverTick`, cap 20.000) và `checksumLog` (một checksum mỗi giây/60 tick, cap 600 mẫu) cho trận đang chạy; reset ở `start()`/`restart()`. Thêm `room.replayConfig()` trả `{seed, map, difficulty, roster}` để dựng lại match y hệt.
- Sửa 2 lời gọi `Math.random()` còn sót trong `src/match.js` (particle velocity/angle dòng ~302-303, trail sampling dòng ~422) sang `this.random()` — seed giờ quyết định toàn bộ state kể cả phần cosmetic, cần thiết để checksum đầy đủ đáng tin.
- `src/content/schema.js`: `CONTENT_VERSION`, `validateContent()`, `validateContentOrThrow()` cho character/weapon/map (id duy nhất, field bắt buộc, angle range hợp lệ, spawn zone hợp lệ, `createTerrain` là function). Chưa có migration runner thật, chỉ là marker version.
- `scripts/balance-simulator.mjs` (+ `npm run benchmark:balance`): chạy hàng trăm trận bot-vs-bot headless qua `Match` trực tiếp (không cần server/browser), quét tổ hợp character/weapon/map theo seed, xuất JSON: win rate theo skin/weapon, win rate/avg rounds/avg damage theo map, first-turn advantage, avg rounds/ticks/damage, và cờ `timedOut` (thất bại nếu có trận không kết thúc trong 200.000 tick).
- `docs/content-pipeline.md` ghi lại toàn bộ cơ chế replay/checksum/content schema/balance simulator và những gì còn thiếu.

### Xác minh local 2026-09-17

- `node scripts/check-syntax.mjs` — 70 JavaScript files đạt.
- `node --test` — 124 pass / 3 skip (skip là PostgreSQL integration, cần `TEST_DATABASE_URL`).
- `npm audit --audit-level=high` — 0 vulnerability.
- Test mới: `tests/replay.test.js` (4 test — hai `Match` cùng seed giống hệt nhau, replay command log khớp checksum, một command khác bị phát hiện là divergence, và **một `Room` sống thật** điều khiển qua `room.handle()`/`room.tick()` có `commandLog`/`checksumLog` replay khớp state cuối) và `tests/content-schema.test.js` (5 test — content thật pass schema, và validator bắt được duplicate id/angle range sai/map thiếu `createTerrain`).
- `npm run benchmark:balance 300` chạy trong khoảng 25s, không có trận nào `timedOut`.
- Chưa chạy `npm run verify` đầy đủ (browser smoke) — môi trường vẫn không có Chromium/Playwright, nhất quán các milestone trước.

### Hand-off sang R5

- Replay/checksum hiện chỉ sống trong RAM của `Room`, không có API để lấy ra hay lưu lại sau khi trận kết thúc — nếu cần công cụ chống gian lận hoặc điều tra sự cố dùng lại được sau khi trận đã xong, đó là việc của R6 (admin), không phải mở lại R4.
- Balance simulator có nhưng chưa có ngưỡng balance được product/design chốt; đừng coi kết quả simulator hiện tại là "đã balance", chỉ là công cụ đo.
- R5 (progression/economy) chỉ bắt đầu sau khi R2 (đã xong local) thật sự merge; không bán power trong PvP theo nguyên tắc đã chốt ở roadmap.

## M23 — R5 currency ledger, progression và reward settlement

Trạng thái: **một phần, hoàn thành local; chờ CI/merge**. Chỉ hạ tầng ledger/reward; không có shop, cosmetic catalog, mission content hay UI — đó là quyết định sản phẩm chưa chốt.

### Đã thay đổi

- `server/economy.js`: bảng reward dùng chung `REWARD_TABLE` (win 30xp/20 currency, loss 10xp/5 currency, draw 15xp/10 currency), `rewardFor(participant, status)` (trả về 0/0 nếu `disconnected` hoặc `status !== "completed"` — luật chống AFK/farm), `levelForXp(xp)` (đường cong phẳng 100xp/level, placeholder chưa balance-tune).
- Migration `004_progression_economy.sql`: `currency_ledger` (append-only, unique `(user_id, request_id)`, không lưu số dư trực tiếp — balance luôn tính lại bằng `SUM(amount)` để tránh hai nguồn sự thật), `progression` (xp/level), `entitlements` (scaffold cho cosmetic tương lai, **chưa có gì cấp vào**).
- `PostgresIdentityStore.completeMatch()` và `MemoryIdentityStore.completeMatch()`: cấp reward cho từng participant **trong cùng transaction** với kết quả trận (Postgres) hoặc cùng lệnh gọi (memory) — không có đường nào để có reward mà không có kết quả trận hợp lệ tương ứng, và ngược lại. Idempotent theo `request_id = match:<matchId>:<userId>` cộng với guard `resultKey` sẵn có từ R2E.
- API đọc thuần: `GET /api/economy/wallet`, `GET /api/economy/ledger`, `GET /api/economy/progression` — **không có endpoint ghi nào**; đây là chủ đích, để không thể sửa client tự cấp currency/xp.
- `docs/economy.md` ghi lại thiết kế, bảng reward, và giới hạn đã biết.

### Xác minh local 2026-09-17

- `node scripts/check-syntax.mjs` — 73 JavaScript files đạt.
- `node --test` — 131 pass / 3 skip (skip vẫn là PostgreSQL integration, cần `TEST_DATABASE_URL`).
- `npm audit --audit-level=high` — 0 vulnerability.
- Test mới: `tests/economy.test.js` (5 test cho `rewardFor`/`levelForXp` thuần), `tests/economy-api.test.js` (4 test — reward đúng qua `MemoryIdentityStore.completeMatch`, participant disconnected không nhận gì, trận abandoned không trả ai, và toàn bộ 3 endpoint qua HTTP thật kể cả trạng thái mặc định cho identity mới). Mở rộng `tests/postgres-identity.test.js`'s "authoritative lifecycle" test với assertion wallet/progression/ledger (chưa chạy được trên máy này vì không có `TEST_DATABASE_URL`, sẽ chạy trên CI khi merge).
- Chưa chạy `npm run verify` đầy đủ (browser smoke) — môi trường vẫn không có Chromium/Playwright.

### Hand-off sang R6

- Không có UI/API nào để chi tiêu currency hay xem inventory — chưa có gì để hiển thị. Khi có shop/cosmetic catalog, nhớ giữ nguyên tắc "server quyết định toàn bộ, không client-authoritative reward" đã áp dụng ở đây.
- `entitlements` table tồn tại nhưng rỗng theo thiết kế; đừng coi sự tồn tại của bảng là bằng chứng tính năng cosmetic đã xong.
- R6 (admin/moderation/LiveOps) là nơi hợp lý để thêm: xem/điều chỉnh currency của một user (grant có audit, dual-control), dashboard economy reconciliation, và daily/weekly mission — tất cả cần quyết định sản phẩm trước, không tự suy diễn số liệu.

## M24 — R6 admin RBAC, sanctions và audit (một phần)

Trạng thái: **một phần, hoàn thành local; chờ CI/merge**. Chỉ làm RBAC/sanctions/room-terminate/audit; remote config, maintenance mode và dashboard vận hành chưa làm — xem "Hand-off sang R7" bên dưới.

### Đã thay đổi

- Migration `005_admin_moderation.sql`: `users.role` ('player'/'admin', default 'player'), bảng `sanctions` (mute/ban, trạng thái `pending_confirmation`/`active`/`revoked`), bảng `admin_actions` (audit: ai, hành động gì, target, lý do, metadata, khi nào).
- `scripts/promote-admin.mjs`: công cụ ops duy nhất để cấp quyền admin (`UPDATE users SET role=...`), chạy trực tiếp với `DATABASE_URL` — chủ đích không có UI/API tự cấp quyền admin.
- `PostgresIdentityStore`/`MemoryIdentityStore` thêm: `getAdminSession`, `setUserRole`, `createSanction`/`confirmSanction`/`revokeSanction`/`listSanctions`, `isBanned`/`isMuted`, `recordAdminAction`/`listAdminActions`, `lookupUser` (hồ sơ tổng hợp: profile + wallet + progression + 10 trận gần nhất + sanction).
- API mới (đều yêu cầu session admin thật, kiểm qua `users.role` phía server — không tin role client khai): `GET /api/admin/users/:id`, `POST /api/admin/sanctions`, `POST /api/admin/sanctions/:id/confirm`, `POST /api/admin/sanctions/:id/revoke`, `GET /api/admin/sanctions?userId=`, `POST /api/admin/rooms/:id/terminate`, `GET /api/admin/actions`.
- Dual-control thật cho ban: sanction `ban` khởi tạo `pending_confirmation`, **chưa enforce**; một admin KHÁC (không phải người tạo) phải confirm mới chuyển `active`. Cùng một admin tự confirm bị từ chối (409). Mute không cần dual-control (rủi ro thấp, tự đảo ngược được).
- Enforcement: ban kiểm tra một lần lúc WebSocket connect (`identityStore.isBanned`), đóng socket ngay với mã lỗi `BANNED`, không chặn API privacy/identity (export/delete vẫn dùng được). Admin mute cũng kiểm tra lúc connect, cache vào `client.adminMuted`, chặn hẳn lệnh `chat` ở `Room.handle()` (khác với player-level mute R3D chỉ ẩn theo người xem — admin mute im lặng người gửi với tất cả mọi người).
- `GET`/`PATCH /api/admin/reports` (R3D) giờ chấp nhận CẢ `MODERATION_TOKEN` cũ lẫn admin session mới — không phá endpoint cũ, chỉ thêm đường xác thực có định danh thật.
- `docs/admin.md` ghi lại toàn bộ thiết kế, enforcement và giới hạn còn lại.

### Xác minh local 2026-09-17

- `node scripts/check-syntax.mjs` — 75 JavaScript files đạt.
- `node --test` — 138 pass / 3 skip (skip vẫn là PostgreSQL integration).
- `npm audit --audit-level=high` — 0 vulnerability.
- Test mới: `tests/admin-api.test.js` (7 test — RBAC từ chối non-admin, lookup tổng hợp, dual-control ban đầy đủ [tạo → tự-confirm bị từ chối → admin khác confirm → active → revoke], mute single-admin có hiệu lực ngay, room terminate đóng mọi socket và xoá room, validate input sanction, và **một test thật qua WebSocket** — user bị ban nhận `BANNED` và socket đóng ngay, user bị admin mute gửi chat bị `COMMAND_REJECTED` và tin nhắn không bao giờ tới người khác trong phòng). Mở rộng `tests/postgres-identity.test.js` với test RBAC/dual-control/audit trên Postgres thật (skip cục bộ, chạy trên CI).
- Chưa chạy `npm run verify` đầy đủ (browser smoke) — môi trường vẫn không có Chromium/Playwright.

### Hand-off sang R7

- Phần R6 còn lại — remote feature-flag rollout/kill-switch, maintenance mode/announcement/min-version, dashboard funnel/retention/queue-time/disconnect/report-rate — chưa làm và không phải infra khó, chỉ là chưa tới lượt; có thể tiếp tục trong một PR R6 riêng hoặc gộp vào R7 nếu hợp lý hơn về vận hành.
- `client.adminMuted`/ban chỉ kiểm tra một lần lúc connect — một sanction ban hành giữa phiên chỉ có hiệu lực ở lần connect tiếp theo, không cắt ngay socket đang mở. Ghi rõ trong `docs/admin.md`; nếu cần cắt ngay, phải thêm cơ chế broadcast sanction tới các Room đang có user đó.
- R7 (production reliability) là nơi hợp lý để: tách audit log `admin_actions` ra dashboard thật, thêm alert khi có nhiều ban/report bất thường, và readiness/structured logging tổng thể — không tự suy diễn SLO, cần benchmark thật trên máy đích.

## M25 — R7 readiness, security headers, dependency scan và SLO giấy (một phần)

Trạng thái: **một phần, hoàn thành local; chờ CI/merge**. Chỉ phần code-level làm được trong một phiên; CDN, OpenTelemetry, canary/blue-green, alert thật và DDoS/WAF ở edge đều cần hạ tầng ngoài phạm vi này.

### Phát hiện quan trọng: Playwright/Chromium chạy được trong môi trường này

Mọi ghi chú "chưa chạy được vì không có Chromium/Playwright" từ M2 tới M24 (bao gồm cả ghi chú M24 ngay phía trên) hoá ra chỉ đúng ở CÁC PHIÊN LÀM VIỆC TRƯỚC, không còn đúng ở thời điểm này: chạy `node scripts/verify.mjs` đầy đủ ở đây **pass hoàn toàn**, kể cả browser smoke thật (`PASS: 27 assets, 5 maps, 80 animation frames, home/room/battle screens, 12 selections, rematch, crater pixels, player/bot turns, pause freezes animation, reduced motion, viewport fit at four sizes, mobile layout, asset fallback`). Đừng giả định môi trường không có Chromium chỉ vì handoff cũ ghi vậy — kiểm tra lại bằng `npm run verify` hoặc `npm run test:browser` trước khi kết luận.

### Đã thay đổi

- `/readyz` giờ phản ánh trạng thái thật thay vì luôn `ready:true` (bug đã ghi từ M8 audit): `{ready, db, eventLoopLagMs, shuttingDown}`. `db` là một `SELECT 1` thật qua `identityStore.ping()` (thêm vào `PostgresIdentityStore`; memory store không có ping, coi như luôn khỏe qua optional chaining). `eventLoopLagMs` đo bằng `perf_hooks.monitorEventLoopDelay()`, reset sau mỗi lần đọc để phản ánh độ trễ gần nhất; ngưỡng mặc định 200ms qua `READY_EVENT_LOOP_LAG_MS`. `shuttingDown` bật ngay khi `gracefulShutdown()` bắt đầu, trả `503` để orchestrator ngừng route trước khi đóng hẳn.
- Security headers cho MỌI response (static lẫn API): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Content-Security-Policy` (same-origin script/style/img/media/connect + Google Fonts cho `style-src`/`font-src` vì `style.css` có `@import` từ `fonts.googleapis.com`, `frame-ancestors 'none'`). `Strict-Transport-Security` chỉ gửi khi `TRUST_PROXY=true` **và** proxy tin cậy xác nhận `X-Forwarded-Proto: https` — không tin client tự khai.
- `scripts/verify.mjs` thêm bước `npm audit --audit-level=high` sau syntax/test, trước browser smoke — trước đây chỉ chạy thủ công mỗi milestone, giờ gate thật trong CI (`npm run verify`). Sửa luôn một bug Windows: `spawn("npm", ...)` không chạy được trực tiếp trên Windows (npm là `.cmd`, cần `shell:true`) — đã thêm `shell:true` riêng cho lệnh này, không đổi các lệnh `node` khác.
- `tests/database.test.js`: xác minh `migrate()` idempotent (chạy lại không áp lại migration cũ) — điều kiện cần cho redeploy/rollback an toàn.
- `docs/operations.md` mở rộng: mục Readiness, Bảo mật HTTP, Dependency/secret scan, bảng SLO tạm thời ("paper SLO", chưa có alert thật chạy), quy trình backup/restore drill bằng `pg_dump`/`pg_restore` (runbook, **chưa từng chạy drill thật**), và ghi rõ idempotency sẵn có ở tầng dữ liệu giúp rollback an toàn.

### Xác minh local 2026-09-17

- `node scripts/check-syntax.mjs` — 78 JavaScript files đạt.
- `node --test` — 144 pass / 5 skip (skip là PostgreSQL integration, cần `TEST_DATABASE_URL`).
- `npm audit --audit-level=high` — 0 vulnerability.
- `node scripts/verify.mjs` chạy **toàn bộ, thành công**: syntax → 144 test → npm audit → khởi động server → browser smoke thật pass 100%. Đây là lần đầu tiên trong lịch sử hand-off này verify chạy hết được, không bị chặn ở bước browser smoke.
- Test mới: `tests/readiness.test.js` (3 test — readyz khỏe mạnh, readyz fail-closed khi store không ping được, store không có `ping()` vẫn coi là khỏe), `tests/security-headers.test.js` (3 test — header có mặt ở mọi response, HSTS chỉ gửi khi proxy tin cậy xác nhận https, HSTS không gửi khi server không tin proxy nào), `tests/database.test.js` (1 test, skip cục bộ).

### Hand-off sang R8

- Phần R7 còn lại cần hạ tầng thật, không phải code: tách asset ra CDN, OpenTelemetry/error tracking, alert thật nối vào bảng SLO giấy, canary/blue-green, DDoS/WAF ở edge, và **drill backup/restore thật** (runbook đã có, chưa chạy lần nào).
- Capacity target vẫn chưa được chốt (mục 8.7 roadmap) — không tự suy ra một con số; load test "đạt capacity đã công bố" không thể đóng cho tới khi có quyết định đó.
- R8 (closed alpha) đứng sau R0–R7; theo "Thứ tự triển khai" trong roadmap, R7 chưa đạt đầy đủ (thiếu phần hạ tầng) nên R8 chưa nên mở thật với người dùng ngoài — phần code có thể chuẩn bị trước (checklist, form feedback, v.v.) nhưng đừng công bố alpha khi capacity/alert chưa có.

## M26 — R8 đo lường và checklist beta readiness (chuẩn bị, không phải chạy alpha thật)

Trạng thái: **một phần, hoàn thành local; chờ CI/merge**. R8 về bản chất là chạy một đợt alpha thật với người dùng thật cộng các quyết định sản phẩm/pháp lý — không có phần nào trong số đó làm được chỉ bằng code. Milestone này chỉ thêm công cụ đo lường và checklist để khi có người/quyết định thật, có sẵn hạ tầng để dùng ngay.

### Đã thay đổi

- `/metrics` thêm `reconnectAttempts`/`reconnectSuccesses`: cumulative theo vòng đời process, **khác** `RoomManager.metrics()` vốn chỉ cộng dồn các room ĐANG mở và mất số liệu ngay khi room đóng. Đây là số cần để đo "reconnect thành công ≥95%" — một exit criteria của R8 — trên một lượt chạy thật, không chỉ snapshot tức thời.
- `identityStore.getMatchStats()` (Postgres: query trực tiếp bảng `matches` GROUP BY status; memory: tính từ Map): trả `{total, completed, abandoned, playing, completionRate}` — đo trực tiếp exit criteria "≥95% trận hoàn tất hoặc kết thúc bằng outcome hợp lệ".
- `GET /api/admin/dashboard` (admin auth): gộp `matches` (từ `getMatchStats`), `openReports`, `feedbackCount`, `reconnect` (attempts/successes/successRate), `rooms` (từ `RoomManager.metrics()`) — vừa lấp một phần khoảng trống "dashboard vận hành" còn lại từ R6, vừa phục vụ đo R8.
- Migration `006_feedback.sql` + `POST /api/support/feedback` (session bắt buộc, category bug/suggestion/other, message ≤2000 ký tự, context tuỳ chọn) + `GET /api/admin/feedback` (admin auth) — đáp ứng mục "contact/support" trong exit criteria beta, dù chưa có quy trình vận hành con người đứng sau kênh này.
- `scripts/beta-readiness.mjs`: audit tách rõ AUTOMATED (env config, DB reachable, completion rate, report backlog — thật sự có thể fail) và MANUAL (capacity target, drill backup/restore thật, cross-browser thật, Terms/Privacy, IP/name approval, chính đợt alpha — liệt kê rõ, không giả vờ script tự động hoá được). Exit code khác 0 nếu có AUTOMATED check fail; MANUAL không ảnh hưởng exit code.
- `docs/beta-readiness.md`: checklist đầy đủ, bảng trạng thái exit criteria tính tới R7, và lời nhắc rõ ràng — tài liệu này không phải quyết định launch.

### Xác minh local 2026-09-17

- `node scripts/check-syntax.mjs` — 81 JavaScript files đạt.
- `node --test` — 148 pass / 5 skip (skip là PostgreSQL integration).
- `npm audit --audit-level=high` — 0 vulnerability.
- `node scripts/beta-readiness.mjs` chạy được, đúng như kỳ vọng: fail phần lớn AUTOMATED check trên máy dev (không có `DATABASE_URL`/`ALLOWED_ORIGINS`/`METRICS_TOKEN` production thật) — hành vi đúng đắn cho một script kiểm tra deployment thật, không phải bug.
- Test mới: `tests/admin-dashboard.test.js` (2 test — dashboard yêu cầu admin và tính đúng completion rate từ match thật, reconnect counter cumulative qua một lượt resume thành công + một lượt replay token cũ bị `RECONNECT_EXPIRED`, xác minh cả object trả về lẫn text `/metrics`), `tests/feedback-api.test.js` (2 test — validate input/auth, admin thấy được feedback còn người thường thì không, dashboard đếm đúng).
- Chưa chạy drill backup/restore thật, chưa có capacity target, chưa có Terms/Privacy qua pháp lý — tất cả đã liệt kê rõ trong `docs/beta-readiness.md`, không lặp lại ở đây.

### Hand-off — đây là điểm dừng hợp lý của chuỗi roadmap R3D→R8 trong một phiên

- R0–R7 đều đã có code merge vào `main` (một phần hoặc đầy đủ tuỳ mục), có test, có tài liệu. R8 có công cụ đo lường và checklist nhưng KHÔNG có — và không thể có — một đợt closed alpha thật đã chạy.
- Việc tiếp theo không phải thêm code: là (1) chủ dự án chốt các quyết định ở mục 8 của roadmap (tên/IP, audience, trận chuẩn, account policy, progression, monetization, capacity), (2) vận hành viên chạy `scripts/beta-readiness.mjs` cộng checklist MANUAL trong `docs/beta-readiness.md` trên một triển khai thật, rồi (3) mời 20–50 người dùng thật.
- Mọi milestone trong phiên này đều merge thẳng vào `main` (bypass branch protection theo yêu cầu người dùng, xem M22) và được xác nhận xanh trên GitHub Actions thật (`Verify` workflow) — không chỉ chạy local.

## M27 — Audit code R3D–R8 và sửa bug tìm được

Trạng thái: **đã merge thẳng vào `main`** (commit `5244780`), không qua nhánh riêng vì đây là fix nhỏ, đã verify local đầy đủ trước khi push.

Chạy `/code-review high` trên toàn bộ diff R3D→R8 (`b3f20a4..3665aa5`) theo yêu cầu người dùng. Tìm 6 vấn đề, xác minh và sửa 4 cái thật:

- `GET /api/admin/sanctions?userId=` so `req.url` nguyên chuỗi (gồm query string) với path trần — route không bao giờ khớp, luôn rơi vào 404 nhánh cuối cùng. **Endpoint chết từ lúc merge ở R6, không có test nào gọi qua HTTP thật để bắt ra.** Sửa: parse `pathname` trước khi so sánh.
- `POST /api/admin/sanctions` không validate `expiresAt` — chuỗi không parse được thành `Invalid Date`, ném lỗi trong pg driver, trả `500` thay vì `400` như các field sai khác. Sửa: kiểm `Number.isNaN(expiresAt.getTime())` trước khi gọi store.
- `MemoryIdentityStore.chatMessages` không giới hạn; `pruneExpiredChat()` cho store này luôn là no-op (không có retention window thật trong RAM) nên tích vô hạn trên process chạy lâu không có `DATABASE_URL`. Sửa: cap 1000 tin nhắn, bỏ cũ nhất.
- `scripts/verify.mjs` chạy `npm audit` TRƯỚC browser smoke — một CVE mới xuất hiện ở dependency không liên quan gì tới diff cũng chặn luôn browser smoke chạy, giấu mất kết quả phần chức năng thật. Sửa: audit chạy sau cùng.

Hai vấn đề còn lại xem xét kỹ và **không sửa vội**:

- Ban/mute chỉ kiểm tra lúc WebSocket connect, không cắt session đang mở giữa chừng — đây là giới hạn đã ghi rõ chủ đích trong `docs/admin.md` từ R6, không phải lỗi ẩn.
- `SocialSafety` cache block/mute (`this.blocks`/`this.mutes`/`this.loaded`) không bao giờ evict — leak chậm trên server chạy nhiều tuần. Không vá vội vì evict theo từng user không an toàn: một cặp `"A:B"` có thể được nạp bởi load() của A HOẶC của B, evict một bên mà không biết bên kia còn cache hay không có thể âm thầm mở lại tương tác cho người vẫn đang online — một regression về privacy còn tệ hơn chính cái leak. Đã ghi comment rõ trong code, cần thiết kế đúng (reference counting hoặc reset có điều kiện "không ai đang connect") mới nên làm, không phải patch nhanh.

### Xác minh local 2026-09-18

- `node scripts/check-syntax.mjs` — 82 JavaScript files đạt.
- `node --test` — 150 pass / 5 skip.
- `node scripts/verify.mjs` chạy **toàn bộ, thành công**, gồm browser smoke thật và audit (giờ chạy cuối) — xác nhận thứ tự mới không phá gì.
- Test mới/mở rộng: `tests/admin-api.test.js` thêm test cho `GET /api/admin/sanctions?userId=` (route giờ khớp thật, trả đúng danh sách) và `expiresAt` sai bị từ chối 400; `tests/memory-identity-store.test.js` (mới, 1 test xác nhận buffer chat cap đúng 1000, bỏ tin cũ nhất).
- Đã push thẳng `main`, GitHub Actions `Verify` sẽ tự chạy — chưa kiểm tra lại kết quả CI cho commit này trong log hand-off (kiểm tra qua `gh`/GitHub API nếu cần xác nhận thêm).

## M28 — Fix SocialSafety idle cache leak và cảnh báo Node 24 verify

Trạng thái: **hoàn thành local; sẵn sàng commit/merge `main`**.

### Đã thay đổi

- `server/social-safety.js`: Thêm phương thức `resetIfIdle()`. Xoá sạch các Set cache (`blocks`, `mutes`, `loaded`) khi hệ thống rảnh rỗi, giải quyết triệt để rò rỉ bộ nhớ dài hạn được ghi nhận tại M27 mà không gây rủi ro mở lại tương tác (privacy regression) cho người đang online.
- `server/server.js`: Kích hoạt `socialSafety.resetIfIdle()` trong sự kiện đóng socket (`ws.once("close")`) khi không còn kết nối nào (`activeByIp.size === 0`) và hàng đợi ghép trận trống (`matchmaking.byUser.size === 0`).
- `scripts/verify.mjs`: Chỉnh sửa cú pháp chạy `npm audit` với `shell: true` để loại bỏ cảnh báo `[DEP0190] DeprecationWarning: Passing args to a child process with shell option true` trên Node.js v24.
- `tests/social-safety.test.js`: Thêm test case xác thực `resetIfIdle()` xóa cache và buộc nạp lại từ store ở lần truy vấn kế tiếp.
- Môi trường dev: Cài đặt Chromium cho Playwright (`npx playwright install chromium`) giúp chạy trọn vẹn browser smoke test cục bộ.

### Xác minh local 2026-09-18

- `node scripts/check-syntax.mjs` — 82 JavaScript files đạt cú pháp.
- `node --test` — 151 pass / 0 fail / 5 skip (5 test PostgreSQL integration).
- `node scripts/verify.mjs` — Toàn bộ kiểm thử thành công: syntax, unit/integration test, Playwright browser smoke test (27 assets, 5 maps, responsive, v.v.), dependency audit 0 vulnerability, không còn deprecation warning.

### Quyết định sản phẩm (2026-09-18)
- Chủ dự án đã chốt tên phát hành chính thức là **"Gunny"** (giải quyết mục 8.1 trong `ONLINE_GAME_ROADMAP.md` và `PRODUCT_BRIEF.md`, cập nhật checklist trong `docs/beta-readiness.md` và `scripts/beta-readiness.mjs`).

## M29 — Steve Jobs Product Audit & Game Leadership Vision (2026-09-21)

Chi tiết đánh giá và chiến lược sản phẩm được lưu tại [`AUDIT.md`](AUDIT.md).

### Quyết định định vị sản phẩm (Grill-Me Outcomes)
1. **Thể loại cốt lõi**: **Deep Progression MMO-Lite** — kết hợp lối chơi bắn súng tọa độ phản xạ tức thì với tiến trình dài hạn (dungeon PvE, raid săn boss, chế đồ, pet và tủ đồ thời trang).
2. **Cân bằng PvP & PvE**: **Stat-Normalized PvP với PvE-Only Gear Power** — PvP 100% công bằng (tất cả chỉ số chuẩn hóa), trang bị cường hóa (+1 đến +12) và vũ khí boss chỉ phát huy sức mạnh trong phó bản PvE và săn boss.
3. **Thiết kế PvE Co-Op**: **Multi-phase Boss Raids** với điểm yếu di động (shifting weak points), vùng cảnh báo đòn đánh (telegraphed hazard zones), quái phụ (adds) và cơ chế phối hợp 2–4 người.
4. **Kiến trúc Client**: **Web-first zero-install PWA (< 5MB initial load)** — chơi mượt trên Safari/Chrome desktop & mobile, render bằng Canvas/WebGL với asset streaming tiến trình.
5. **Kinh tế & Monetization**: **Gold-driven Battle Pass & Vanity Wardrobe** — Battle Pass, chìa khóa phó bản, trang phục thời trang, hiệu ứng đạn và danh hiệu đều mở bằng **vàng cày cuốc trong game**, hoàn toàn không pay-to-win.

### Lộ trình triển khai ưu tiên
- **Giai đoạn 1 (Juice & Tactile Delight)**: Hệ thống rung màn hình (trauma camera impulse), hiệu ứng hạt va chạm (particle VFX: tia lửa, khói, mảnh vỡ địa hình), âm thanh Web Audio đa tầng, hiển thị luồng gió động.
- **Giai đoạn 2 (Visual Atmosphere & Chibi Art)**: Nền parallax nhiều lớp, hoạt ảnh chibi biểu cảm (thở, giật lùi khi bắn, nhảy mừng, hoảng sợ khi thấp máu).
- **Giai đoạn 3 (PvE Co-Op Boss Raids)**: Máy trạng thái Boss, hitbox điểm yếu, phòng đấu co-op 2–4 người, bảng rớt vật phẩm phó bản.
- **Giai đoạn 4 (Progression & Wardrobe)**: Kho đồ (inventory), cường hóa trang bị PvE (+1 tới +12), Battle Pass và shop thời trang mua bằng vàng.
- **Giai đoạn 5 (Ranked League & Social Network)**: Đấu hạng MMR mùa giải, phòng party bạn bè, chia sẻ video/link instant replay, phòng chờ khán giả (spectator lounge).

## M30 — MMO-Lite Foundation: Game Feel, Web Audio, PvE Co-Op Boss Raid & Gold Economy (2026-09-21)

Trạng thái: **hoàn thành và xác minh toàn diện; sẵn sàng commit & push `origin/main`**.

### Đã triển khai

1. **Giai đoạn 1: Game Feel & Procedural Audio Engine (Juice & Tactile Delight)**:
   - `src/ui/audio-engine.js`: Bộ tổng hợp âm thanh đa tầng bằng Web Audio API thuần (zero external assets, 0ms latency). Tái hiện tiếng đại bác giật nổ, tiếng rít đạn xé gió, tiếng nổ sub-bass rền vang hố đạn, tiếng keng kim loại khi bắn trúng điểm yếu chí mạng, tiếng gió vút chuyển lượt và tiếng tim đập dồn dập khi lượt bắn còn dưới 3 giây. An toàn tuyệt đối trong môi trường Node/SSR và tuân thủ autoplay policy trình duyệt.
   - `src/ui/battle-renderer.js`: Nâng cấp camera impulse rung màn hình dựa trên trauma phi tuyến tính (rotational + translational spring damper), hiệu ứng khói bốc lan tỏa, mảnh đất đá văng theo trọng lực và tia lửa bốc cháy từ tâm vụ nổ.
   - `src/match.js`: Bổ sung cơ chế phát hiện Bạo Kích (Critical Hit) khi đạn trúng hồng tâm nhân vật (< 45% bán kính thân), tăng độ rung chấn động camera và bung số nhảy sát thương nổi bật màu vàng hoàng kim rực rỡ.

2. **Giai đoạn 2: Khí hậu chiến trường & Biểu cảm Chibi (Visual Atmosphere)**:
   - `src/ui/battle-renderer.js`: Bổ sung hệ thống bụi hoa / cánh hoa / hạt gió bay lơ lửng trên đấu trường di chuyển đồng pha với vector gió (`match.wind`), giúp pháo thủ nhận diện tức thì vận tốc và hướng gió một cách trực quan, sống động. Đảm bảo đóng băng trạng thái khi trận đấu bị tạm dừng (pause).
   - `src/sprites.js`: Thêm biểu cảm giọt mồ hôi hoảng sợ chibi khi HP xuống thấp dưới 25%, gia tăng kịch tính và chiều sâu cá tính nhân vật.
   - `style.css` & `src/ui/hud.js`: Nâng cấp hiệu ứng số đếm lùi thời gian lượt đấu (nhấp nháy báo động đỏ rực khi `<= 3s`), giao diện bảng điểm và hiển thị phần thưởng vàng.

3. **Giai đoạn 3: Kiến trúc PvE Co-Op Boss Raid (MMO-Lite Foundation)**:
   - `src/core/boss.js`: Máy trạng thái Boss phó bản nhiều người chơi (`RaidBoss`) gồm:
     - Đa điểm chạm (Multi-part Hitbox): Lõi năng lượng (Core weak point x2.0–2.2 sát thương), Giáp thân hạng nặng (Chassis armor x0.75 sát thương), Tháp pháo phụ (Turret x1.25 sát thương).
     - 3 giai đoạn chiến đấu (Phases): Giai đoạn 1 pháo kích thông thường, Giai đoạn 2 mưa pháo chùm phá hủy địa hình, Giai đoạn Cuồng Nộ (Enrage) tăng tốc độ và sát thương hủy diệt.
     - Vùng cảnh báo oanh tạc (Telegraphed Hazard Zones): Dự báo trước vị trí nổ sau 1 lượt buộc pháo thủ phải di chuyển chiến thuật.
     - Cơ chế tính thưởng và vinh danh MVP dựa trên sát thương đóng góp của tổ đội.
   - `tests/boss.test.js`: Kiểm thử đơn vị 100% cho toàn bộ cơ chế boss, hitbox, chuyển pha, vùng nổ và tính điểm thưởng.

4. **Giai đoạn 4: Hệ thống kinh tế Vàng In-Game & Tủ đồ Thời trang (Vanity Wardrobe)**:
   - `src/core/economy.js`: Ví tiền tệ (`EconomyWallet`) kiểm soát chặt chẽ toàn bộ giao dịch, hoàn toàn không pay-to-win.
     - Cơ chế thưởng vàng sau trận đấu: thưởng thắng/thua, thưởng theo lượng sát thương và số phát bắn trúng, cấp số nhân chuỗi thắng (win streak bonus lên tới +50%).
     - Tủ đồ thời trang (`VANITY_CATALOG`): Mua danh hiệu (Thiện Xạ Gió, Bách Phát Bách Trúng, Chúa Tể Pháo Thủ), hiệu ứng vệt đạn (Vệt Sao Băng Vàng, Tia Lửa Plasma), động tác ăn mừng (Vũ Điệu Chiến Thắng) 100% bằng vàng cày trong game.
     - Tích hợp lưu trữ liên tục (persistence) qua `localStorage` cho trải nghiệm zero-install web-first mượt mà.
   - `tests/economy.test.js`: Kiểm thử kiểm tra số dư, chuỗi thắng, mua sắm và ngăn chặn mua trùng lặp.
   - `src/game.js` & `src/ui/hud.js`: Tích hợp ví tiền vào vòng lặp kết thúc trận đấu, cập nhật số vàng tích lũy trực tiếp trên màn hình kết quả.

### Kết quả xác minh toàn diện (2026-09-21)
- `node scripts/check-syntax.mjs`: **Đạt cú pháp 87 JavaScript files**.
- `node --test`: **159 passed / 0 failed / 5 skipped** (164 tests tổng).
- `node scripts/verify.mjs`: **Vượt qua toàn bộ bộ kiểm thử**:
  - Cú pháp toàn bộ codebase.
  - Bộ unit/integration tests đầy đủ.
  - Playwright browser smoke test trên môi trường thật (27 assets, 5 maps, 80 animation frames, responsive layout, đóng băng canvas khi pause, điều khiển bắn và đổi lượt).
  - Dependency audit: 0 lỗ hổng bảo mật (found 0 vulnerabilities).

## M31–M34 — MMO-Lite Core Systems: Pets, Safe Forge (+1 to +12), Multi-Stage Dungeons & Bot Mercenary Fortress (2026-09-21)

Trạng thái: **hoàn thành và xác minh toàn diện; sẵn sàng commit & push `origin/main`**.

### Đã triển khai

1. **Milestone M31: Thú Cưng Đồng Hành (Pet Companion System)**:
   - `src/core/pet.js`: Hệ thống Thú Cưng hoàn chỉnh gồm 4 chủng loài (Rồng Lửa Nhỏ, Mầm Cây Thần Kỳ, Kiến Siêu Quậy, Băng Tinh Linh). Hỗ trợ cơ chế ấp trứng (`hatchEgg`), tích lũy XP thăng cấp, hào quang nội tại (tăng bán kính đào đất, hồi phục sinh lực, giảm sát thương rơi ngã, giáp chắn), và tích tụ thanh *Pet Ultimate Gauge* (nạp khi bắn trúng/chí mạng) để kích hoạt tuyệt chiêu tối thượng (*Mưa Thiên Thạch*, *Cơn Lốc Thảo Mộc*, *Địa Chấn Khoét Đất*, *Băng Tiễn Tê Liệt*).
   - `src/ui/battle-renderer.js`: Vẽ linh thú chibi bay lượn đồng hành bên cạnh vai nhân vật với hiệu ứng nhấp nhô lơ lửng và ánh sáng hào quang sinh động.
   - `tests/pet.test.js`: 5 bài kiểm thử đơn vị bao phủ toàn bộ cơ chế thăng cấp, sạc năng lượng, xả chiêu và ấp trứng.

2. **Milestone M32: Rèn Cột Mốc An Toàn & Khảm Ngọc Nguyên Tố (+1 đến +12)**:
   - `src/core/forge.js`: Hệ thống Rèn Cường Hóa loại bỏ hoàn toàn việc vỡ đồ. Các mốc **+3, +6, +9, +12** là mốc khóa vĩnh viễn (khi xịt không bao giờ rớt dưới mốc). Cơ chế tích lũy may mắn (*Pity Luck*) cộng dồn +5% sau mỗi lần thất bại, bảo đảm kiên trì là chắc chắn thành công.
   - `src/sprites.js`: Hiển thị hào quang vũ khí cực đỉnh:
     - $+7$ đến $+9$: Hào quang Lửa rực cháy (*Flame Aura*).
     - $+10$ đến $+11$: Tia sét tím giật lách tách uy lực (*Thunder Spark*).
     - $+12$: Vòng sáng vũ trụ lấp lánh thiên hà (*Cosmic Halo*).
   - Hệ thống Khảm Ngọc 3 ô: Ngọc Hỏa Ruby (thiêu đốt địa hình DoT), Ngọc Lôi Topaz (sét lan mục tiêu kế cận), Ngọc Phong Emerald (xuyên gió).
   - `tests/forge.test.js`: 5 bài kiểm thử đơn vị cho tỷ lệ rèn, khóa mốc sàn an toàn, hiệu ứng hào quang và khảm ngọc.

3. **Milestone M33: Chuỗi Phó Bản PvE Nhiều Giai Đoạn (Multi-Stage Dungeons)**:
   - `src/core/dungeon.js`: Máy phiên phó bản (`DungeonSession`) với chuỗi 3 ải liên hoàn:
     - Ải 1: Đàn quái đào đất quấy nhiễu (*Minion Wave*).
     - Ải 2: Đấu trường hiểm địa gió lốc và bẫy nổ (*Hazard Arena*).
     - Ải 3: Đại chiến Boss đa điểm chạm với hitbox lõi năng lượng và vùng oanh tạc (*Boss Raid* kết hợp `RaidBoss`).
     - Hồi phục sinh lực 30% tại trạm kiểm soát giữa các ải (*Checkpoint recovery*).
     - Bảng thưởng rơi vật phẩm phó bản: Vàng, Đá Rèn, Mảnh Ngọc Nguyên Tố và Trứng Pet.
   - `tests/dungeon.test.js`: 4 bài kiểm thử đơn vị cho tiến trình vượt ải, dọn quái và sinh chiến lợi phẩm.

4. **Milestone M34: Pháo Đài Cá Nhân & Thuê Bot Lính Đánh Thuê ("Mỗi Người Là Một Bang Chủ")**:
   - `src/core/fortress.js`: Hệ thống Pháo Đài Cá Nhân (`PersonalFortress`):
     - Nâng cấp thành trì cấp 1–10 mở rộng máu phòng thủ và sức chứa quân đồn trú.
     - Chợ chiêu mộ Bot lính đánh thuê bằng vàng: Bot Xạ Thủ (Sniper Bot), Bot Đào Đất (Burrower Bot), Bot Hộ Vệ (Guardian Bot).
     - Chiếm cứ điểm mỏ tài nguyên (Mỏ Vàng, Mỏ Đá Rèn) sản sinh thuế vàng và đá rèn tự động theo giờ.
     - Cơ chế công thành lai (Hybrid Siege): Khi bị tấn công, bot tự động phòng thủ nếu chủ thành offline; kích hoạt chuông báo động đỏ nghênh chiến trực tiếp nếu chủ thành online.
   - `tests/fortress.test.js`: 5 bài kiểm thử đơn vị cho nâng cấp thành, thuê lính, tính thuế mỏ và mô phỏng công thành.

5. **Server-Authoritative MMO Progression & Identity Binding**:
   - `server/mmo-store.js`: Kho lưu trữ tiến trình MMO máy chủ gắn chặt với `user.id` / session tài khoản đăng nhập (chống hack/cheat từ client).
   - `server/server.js`: Định tuyến và xác thực các REST endpoint:
     - `GET /api/mmo/profile`: Nạp toàn bộ hồ sơ MMO (Ví tiền, Thú cưng, Cấp vũ khí, Pháo đài, Lịch sử ải).
     - `POST /api/mmo/forge/enhance`: Rèn vũ khí có trừ tài nguyên và khóa mốc an toàn.
     - `POST /api/mmo/pets/hatch` & `/equip`: Ấp trứng thú cưng và trang bị đồng hành.
     - `POST /api/mmo/fortress/recruit` & `/claim`: Thuê bot đồn trú và thu thuế mỏ tài nguyên.
   - `tests/mmo-store.test.js` & `tests/mmo-api.test.js`: 5 bài kiểm thử đơn vị và tích hợp API máy chủ.

### Kết quả xác minh toàn diện (2026-09-21)
- `node scripts/check-syntax.mjs`: **Đạt cú pháp 98 JavaScript files**.
- `node --test`: **183 passed / 0 failed / 5 skipped** (188 tests tổng).
- `node scripts/verify.mjs`: **Vượt qua 100% toàn bộ pipeline kiểm thử** (cú pháp, unit test, Playwright browser smoke test, và audit 0 lỗ hổng).

## M35–M37 — MMO-Lite Interactive Hub, Co-op Dungeons & World Map Siege Warfare (2026-09-21)

Trạng thái: **hoàn thành và xác minh toàn diện 100%; sẵn sàng commit & push `origin/main`**.

### Đã triển khai

1. **Milestone M35: Giao Diện Trực Quan MMO-Lite Hub**:
   - `src/ui/mmo-hub.js`: Bộ điều khiển trung tâm (`MmoHubController`) hỗ trợ giao diện modal 4 tab tương tác:
     - **🐾 Chuồng Pet**: Hiển thị linh thú xuất trận, thanh kinh nghiệm, nội tại và tuyệt kỹ tích nộ; danh sách bộ sưu tập pet; bảng ấp trứng (hỗ trợ đặt tên tùy biến).
     - **🔨 Tiệm Rèn**: Nâng cấp vũ khí (+1 đến +12), hiển thị mốc khóa an toàn (+3, +6, +9, +12), tỷ lệ thành công cộng dồn May Mắn (Pity Luck +5% mỗi lần xịt), bảng khảm ngọc nguyên tố 3 ô (Ruby, Topaz, Emerald).
     - **🏰 Pháo Đài**: Nâng cấp thành trì cấp 1–10 (mở rộng máu phòng thủ và sức chứa quân); chiêu mộ bot lính đánh thuê (Sniper, Burrower, Guardian) bằng vàng; thu hoạch thuế tài nguyên theo giờ.
     - **🗺️ Phó Bản PvE**: Bảng chọn chế độ vượt ải đơn (Solo) và tổ đội co-op (2–4 người).
   - `index.html`: Thêm nút truy cập nổi bật `⚔️ KHU VỰC MMO` tại sảnh chờ và phần tử `<dialog id="mmoHubDialog">`.
   - `style.css`: Giao diện modal tối ưu, responsive linh hoạt trên mobile và desktop, không làm vỡ tỷ lệ khung hình hay tràn viewport.
   - `tests/mmo-hub.test.js`: Kiểm thử đơn vị cho việc mở modal, chuyển tab và gọi callback bắt đầu phó bản.

2. **Milestone M36: Ghép Đội Co-op Phó Bản Thời Gian Thực (Real-Time Co-op Dungeons)**:
   - `server/coop-dungeon.js`: Quản lý phòng phó bản co-op (`CoopDungeonRoom` & `CoopDungeonManager`):
     - Tổ đội 1–4 người chơi cùng phe (Team 0 Allies) hợp lực vượt ải.
     - Đồng bộ tiến trình 3 ải liên hoàn (Quái nhỏ -> Địa hình độc -> Boss Vua Gà Hoàng Gia).
     - Cơ chế trạm tiếp tế hồi sinh lực 30% giữa các ải.
     - Tự động phát thưởng rương báu phó bản authoritatively cho toàn bộ thành viên tổ đội qua `mmoStore.recordDungeonClear`.
   - `server/server.js`: Bổ sung các REST endpoint `/api/coop/rooms`, `/api/coop/rooms/create`, `/api/coop/rooms/join`, `/api/coop/rooms/ready`, `/api/coop/rooms/start`, `/api/coop/rooms/action`.
   - `tests/coop-dungeon.test.js`: 3 bài kiểm thử đơn vị & tích hợp kiểm tra quy trình ghép đội, sức chứa, chuyển ải và phát thưởng.

3. **Milestone M37: Bản Đồ Thế Giới & Công Thành Chiến Bất Đối Xứng (World Map & Siege Warfare)**:
   - `server/fortress-siege.js`: Động cơ công thành chiến (`SiegeWarfareEngine`):
     - Bản đồ thế giới với các cứ điểm chiến lược: *Mỏ Vàng Hoàng Kim* (+120 Vàng/giờ), *Hầm Đá Rèn Hắc Diệu* (+2 Đá/giờ), *Pháo Đài Không Gian* (+250 Vàng & +3 Đá/giờ).
     - Thuật toán mô phỏng công thành nhiều hiệp: Sức công phá pháo thủ và đội bot đánh thuê vs máu thành lũy và dàn bot đồn trú của đối thủ.
     - Đổi chủ cứ điểm khi công phá thành công, cướp đoạt thuế tài nguyên tích lũy và ghi nhận nhật ký chiến trường (`battleLogs`).
   - `server/server.js`: Bổ sung các endpoint `/api/siege/world-map`, `/api/siege/raid`, `/api/siege/history`.
   - Tích hợp giao diện công thành trực tiếp vào tab Pháo Đài trong `mmo-hub.js`.
   - `tests/siege.test.js`: 3 bài kiểm thử cho bản đồ thế giới, mô phỏng chiến đấu, cướp thuế và chống công thành chính mình.

### Kết quả xác minh toàn diện (2026-09-21)
- `node scripts/check-syntax.mjs`: **Đạt cú pháp 107 JavaScript files**.
- `node --test`: **196 passed / 0 failed / 5 skipped** (201 tests tổng).
- `node scripts/verify.mjs`: **100% PASS** toàn bộ pipeline (cú pháp, unit test, Playwright browser smoke test, và audit 0 lỗ hổng bảo mật).





