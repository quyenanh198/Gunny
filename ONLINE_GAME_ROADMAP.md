# Roadmap Gunny Webgame Online — Product Reset v2

Ngày cập nhật: 2026-09-17

Trạng thái tài liệu: nguồn kế hoạch chính, thay thế roadmap M0–M7 cũ.

Phạm vi hiện tại: prototype phòng đấu online; **chưa phải online beta**.

## 1. Tuyên bố sản phẩm

Mục tiêu là một webgame bắn súng tọa độ theo lượt, chơi trực tiếp trên desktop/mobile browser:

- Trận 1v1, 2v2 và 3v3, server authoritative.
- Người mới có thể chơi thử nhanh; người chơi quay lại có tài khoản và tiến trình bền vững.
- Lobby, party, matchmaking và phòng riêng là các luồng chính, không chỉ là link phòng tạm.
- Kỹ năng đến từ góc, lực, gió, địa hình, lựa chọn đòn bắn và item.
- Nội dung, balance và sự kiện có thể vận hành mà không phải sửa trực tiếp source code.
- Art, tên gọi và nội dung phát hành phải là IP nguyên bản; “Gunny/Gunbound” chỉ là tham chiếu thể loại trong giai đoạn phát triển, không phải tài sản được phép sao chép.

North-star cho beta: một người chơi mới tạo danh tính, vào trận hợp lệ trong dưới 60 giây, hoàn thành trận, nhận kết quả bền vững và quay lại trên thiết bị khác mà không mất dữ liệu.

## 2. Kết luận audit

Code hiện tại làm tốt phần **combat prototype** nhưng đã đi quá sâu vào polish/gameplay trước khi có nền móng của một webgame online.

| Khu vực | Hiện trạng | Quyết định |
|---|---|---|
| Combat deterministic | Có core dùng chung, fixed-step, server authoritative, 74 test | Giữ và cô lập thành engine |
| Phòng/trận WebSocket | Có lobby, room, reconnect 30 giây, snapshot | Giữ, nhưng siết protocol/security/lifecycle |
| Client | Chạy được desktop/mobile, vẫn còn orchestration lớn trong `game.js`/`net.js` | Tách theo screen/store/transport, chưa đổi framework |
| Danh tính người chơi | Chỉ có tên trong URL/localStorage | Phải thêm guest identity, account linking, session an toàn |
| Dữ liệu bền vững | Không database; phòng, lịch sử và reconnect ở RAM | Phải thêm persistence trước progression/rank |
| Matchmaking | Quick Join chọn phòng đầu tiên còn chỗ | Thay bằng queue có region/mode/team/MMR và timeout |
| Progression/economy | Chưa có | Thiết kế sau identity/persistence, không pay-to-win |
| Moderation/admin | Chat rate-limit đơn giản; chưa mute/report/ban/admin | Bắt buộc trước public beta |
| Vận hành | Một Node process serve asset + API + WS; readiness luôn `true` | Chỉ phù hợp dev/staging nhỏ; chưa production-ready |
| Observability | Metrics tự viết, chưa histogram/alert/error tracking | Thay bằng telemetry có SLO và dashboard |
| CI/release | Có test script nhưng repository chưa có workflow CI chuẩn | Phải có quality gate trước feature mới |

Các khẳng định “M6 sẵn sàng beta” và “M7 sẵn sàng staging” trong tài liệu cũ bị thu hồi. Chúng chỉ đúng cho demo RAM trên một process, không đúng cho sản phẩm online public.

## 3. Những lệch hướng cần sửa ngay

### 3.1 Sản phẩm

- Chưa có loop ngoài trận: onboarding → identity → queue/party → trận → kết quả → tiến trình → quay lại.
- Nội dung S1/S2/SS, item, map và animation được làm trước hồ sơ người chơi, inventory, entitlement và content version.
- “Quick Join” hiện là chọn phòng đầu tiên, không phải matchmaking.
- Chưa chốt mô hình kiếm tiền, giới hạn độ tuổi, privacy, retention hoặc nguyên tắc công bằng.
- Chưa có original-IP checklist; tên dự án và các tham chiếu cần được legal/product review trước public launch.

### 3.2 Kiến trúc và dữ liệu

- `server/server.js` đang gộp static hosting, REST và WebSocket gateway.
- Mọi room chạy trong RAM của một process; restart làm mất trận, lịch sử và reconnect token.
- Không có user ID ổn định, database schema, migration, transaction hoặc idempotency.
- Không có versioned content/balance snapshot gắn với từng trận.
- `src/match.js`, `src/game.js`, `server/room.js` và `src/net.js` vẫn là các module orchestration lớn; M1 cũ chưa hoàn thành theo chính tiêu chí 300–400 dòng.

### 3.3 Network và security

- Chưa kiểm tra `Origin` khi WebSocket upgrade.
- Reconnect token nằm trong query string, có thể lọt vào proxy/access log.
- Mã phòng bốn ký tự và hành vi “mã lạ thì tạo phòng” khiến typo tạo room mới, khó phân biệt join/create.
- Rate limit hiện chỉ là 60 message/giây trên từng connection; chưa có giới hạn kết nối/IP, room/IP, handshake, HTTP hoặc backpressure.
- Direct join có thể vượt capacity; chuyển team chưa chặn `MAX_TEAM` ở boundary server.
- Snapshot gửi full state 20 Hz và không kiểm tra `bufferedAmount`; client chậm có thể tích hàng đợi bộ nhớ.
- Message bị từ chối không trả error/ack có ngữ nghĩa; sequence được consume trước authorization.
- `/metrics` và danh sách phòng đang public; readiness luôn trả `ready: true`.

### 3.4 Vận hành và chất lượng

- Chưa có CI workflow bắt buộc, coverage gate, dependency/security scan hoặc preview environment.
- `npm run check` phụ thuộc `find/xargs`, không portable trên Windows.
- Chưa có test network chaos thực sự cho latency, jitter, loss, reorder và reconnect race.
- Metrics `tickDrift` là lifetime maximum, không phải p95; chưa có SLO/alert.
- Chưa có audit log moderation, data retention, backup/restore drill hoặc incident runbook hoàn chỉnh.

## 4. Kiến trúc đích thực dụng

Không tách microservice sớm. Bắt đầu bằng modular monolith với ranh giới rõ và khả năng tách match worker khi tải yêu cầu.

```text
Browser client
  ├─ static assets từ CDN/object storage
  ├─ HTTPS API: identity, profile, inventory, queue, history
  └─ WSS gateway: party, room, match commands, snapshots

Node application
  ├─ identity/session module
  ├─ player/profile module
  ├─ matchmaking/party module
  ├─ authoritative match runtime
  ├─ moderation/admin module
  └─ telemetry/audit module

PostgreSQL
  ├─ users, identities, sessions
  ├─ profiles, inventory, currencies, progression
  ├─ matches, participants, results
  └─ sanctions, reports, audit log

Redis (chỉ thêm khi cần nhiều process)
  ├─ presence, queue, short-lived room routing
  └─ rate limits, reconnect lease, pub/sub
```

Nguyên tắc:

1. Server quyết định toàn bộ kết quả gameplay và reward.
2. Mỗi command có request ID/idempotency; không cấp reward từ callback client đơn thuần.
3. Mỗi trận khóa `engineVersion`, `contentVersion`, seed và roster.
4. API schema và protocol được version hóa, có compatibility window và close/error code rõ.
5. Guest-first nhưng identity không phụ thuộc tên hiển thị; account linking không tạo trùng profile.
6. Dữ liệu kinh tế dùng transaction/ledger; không chỉ cập nhật số dư trực tiếp.

## 5. Roadmap mới

### R0 — Chốt product contract và baseline

Trạng thái: **đã triển khai local; chờ CI/merge và branch protection**.

- Viết one-page product brief: audience, trận chuẩn, session length, modes, fairness, monetization và IP policy.
- Chốt beta slice: guest/account, 1v1 + phòng riêng, 3 nhân vật, 3 map, một progression loop; hoãn guild/season/shop trả phí.
- Chuẩn hóa một lệnh `npm run verify` chạy syntax, unit, integration và browser smoke.
- Thêm CI trên pull request, branch protection và artifact/log khi fail.
- Ghi baseline: snapshot bytes/s, tick p50/p95/p99, heap, event-loop lag với 1/10/30 trận.
- Tách feature flags cho gameplay thử nghiệm khỏi flow beta.

Exit criteria:

- Product brief được duyệt và mỗi feature roadmap truy được về một user outcome.
- Clone sạch chạy verify bằng một lệnh trên Linux và Windows.
- CI là required check; không còn trạng thái “pass theo ghi chú” mà không có run.

### R1 — Hardening protocol và room lifecycle

Trạng thái: **hoàn thành R1A–R1C và đã merge**. Field soak trên mạng/device thật vẫn là release gate của R8, không phải lý do mở rộng content sớm.

- Tách rõ `create room`, `join room`, `spectate`; room không tồn tại phải trả `ROOM_NOT_FOUND`.
- Room ID đủ entropy, có private/public flag và capacity invariant tại server boundary.
- Chuyển reconnect credential khỏi URL sang message xác thực đầu tiên hoặc secure session cookie.
- Origin allowlist, trusted-proxy policy, HTTP/WS handshake rate limit, connection/IP cap và room creation cap.
- Backpressure: ngừng/coalesce snapshot khi `bufferedAmount` vượt ngưỡng; disconnect slow consumer có lý do.
- Command envelope có `requestId`, `clientSeq`, ack/error cụ thể; không consume sequence cho command chưa được chấp nhận.
- Chaos tests cho duplicate, reorder, reconnect race, packet loss và tab sleep.

Exit criteria:

- Không thể vượt 6 ghế, chiếm lượt, tạo room vô hạn hoặc replay command.
- Reconnect 30 giây giữ đúng identity/seat; token không xuất hiện trong URL/log.
- Client 300 ms latency + jitter/loss vẫn kết thúc trận không desync.

### R2 — Identity, profile và persistence

Trạng thái: **đang triển khai — R2A/R2B đã merge; R2C privacy/recovery hoàn thành local, chờ CI/merge; còn R2D realtime settlement**.

- Guest identity bằng opaque ID + rotating session; hỗ trợ link email/OAuth sau, không lưu password tự chế.
- PostgreSQL migrations và repository layer; schema cho user, profile, session, match, participant.
- Profile version/optimistic concurrency; idempotent result settlement.
- Lưu match summary và disconnect outcome; recovery policy khi process chết giữa trận.
- Privacy baseline: consent, export/delete account, retention và secret management.

Exit criteria:

- Người chơi đăng nhập thiết bị khác thấy cùng profile.
- Restart server không mất identity/profile/history đã chốt.
- Cùng một match result gửi lại không thể cấp thưởng hai lần.

### R3 — Matchmaking, party và social safety

Trạng thái: **chưa bắt đầu**.

- Queue thật theo mode/region/team size; timeout mở rộng tiêu chí có kiểm soát.
- Party/invite lifecycle tách khỏi match room; leader transfer và leave/kick rõ.
- Presence và reconnect routing; spectator policy.
- Mute, block, report, profanity policy, chat retention ngắn và admin review queue.
- MMR chỉ triển khai sau khi match completion/disconnect data đáng tin.

Exit criteria:

- Solo player vào trận hợp lệ trong SLA đã chốt; không ghép sai team/mode/version.
- Block/mute có hiệu lực phía server và report có audit trail.
- Leaver/AFK policy nhất quán, không thể farm kết quả bằng reconnect.

### R4 — Combat engine và content pipeline

Trạng thái: **một phần; giữ core, ngừng mở rộng bề rộng**.

- Hoàn tất tách `Match` thành state machine/combat/terrain/turn modules với API snapshot/command rõ.
- Replay deterministic từ seed + command log; lưu checksum định kỳ để phát hiện divergence.
- Content schema versioned cho character/weapon/map/item; validator và migration.
- Balance simulator chạy hàng nghìn trận bot; xuất win rate, first-turn advantage, damage và duration.
- Chốt vertical slice trước: không thêm map/vũ khí mới cho tới khi pipeline/versioning hoàn thành.

Exit criteria:

- Replay server cho checksum giống bản gốc trên CI.
- Content lỗi bị từ chối trước deploy; trận đang chạy không đổi balance giữa chừng.
- Không character/shot/item vượt ngưỡng balance được chốt.

### R5 — Progression và economy công bằng

Trạng thái: **chưa bắt đầu; chỉ làm sau R2**.

- Chốt progression loop: XP/account level, mastery hoặc cosmetic collection.
- Inventory/entitlement và currency ledger có reason, request ID, before/after balance.
- Reward settlement từ server match result; anti-AFK/farm rule.
- Daily/weekly mission và cosmetic unlock qua content config.
- Không bán power trong PvP; nếu monetization có, ưu tiên cosmetic/battle pass và công bố odds khi pháp lý yêu cầu.

Exit criteria:

- Không thể sửa client để tự cấp item/currency/reward.
- Economy audit/reconcile được; rollback content không làm mất entitlement.
- Người chơi free và trả phí có cùng combat power trong mode cạnh tranh.

### R6 — LiveOps, admin và moderation

Trạng thái: **chưa bắt đầu**.

- Admin RBAC, player lookup, mute/ban/unban, room terminate, grant có audit và dual-control cho thao tác nhạy cảm.
- Remote config/content rollout theo environment, percentage và kill switch.
- Announcement, maintenance mode, minimum client/protocol version.
- Dashboard funnel, retention, match completion, queue time, disconnect, report rate.

Exit criteria:

- Có thể tắt feature lỗi mà không redeploy client.
- Mọi thao tác admin quan trọng truy được ai/lúc nào/lý do gì.
- Moderation xử lý được report mà không đọc log thủ công trên server.

### R7 — Production reliability và delivery

Trạng thái: **chưa đạt; runbook hiện tại chỉ là baseline**.

- Tách static asset khỏi game process khi public; asset hash/CDN/cache immutable.
- Readiness phản ánh DB, event-loop lag và khả năng nhận trận; metrics không public trực tiếp.
- OpenTelemetry/error tracking, structured log có correlation ID và redaction.
- SLO: API availability, queue latency, match tick delay, disconnect rate; alert dựa trên SLO.
- Backup/restore drill, migration rollback, canary/blue-green và capacity/load test.
- Dependency scan, secret scan, CSP/security headers, DDoS/WAF ở edge.

Exit criteria:

- Load test đạt capacity đã công bố với tick p95/p99 trong budget.
- Deploy/rollback không làm tạo hai settlement hoặc orphan queue.
- On-call có dashboard, alert và runbook đã diễn tập.

### R8 — Closed alpha → online beta

Trạng thái: **chưa bắt đầu**.

- Closed alpha 20–50 người: đo onboarding, queue, disconnect, trận hoàn tất và feedback điều khiển.
- Sửa blocker theo dữ liệu; không dùng số lượng content làm thước đo tiến độ.
- Online beta chỉ mở khi security checklist, moderation, privacy, recovery và capacity đều pass.

Exit criteria beta:

- ≥95% trận bắt đầu hoàn tất hoặc kết thúc bằng outcome hợp lệ.
- Reconnect thành công ≥95% trong grace window ở mạng được hỗ trợ.
- Không có lỗi severity-1 mở; restore và rollback đã diễn tập.
- Desktop Chrome/Firefox/Safari, iOS Safari và Android Chrome hoàn thành được trận.
- Có Terms/Privacy, contact/support, moderation flow và IP/name approval.

## 6. Thứ tự triển khai

```text
R0 → R1 → R2 → R3
          ├────→ R5 → R6
          └────→ R4
R0–R6 → R7 → R8
```

R4 có thể chạy song song sau khi R1 ổn định, nhưng chỉ ưu tiên tách engine, replay và content pipeline. Không mở rộng thêm nội dung trước khi R2/R3 hình thành loop online.

## 7. Dừng hoặc hoãn

Cho đến khi R0–R2 hoàn thành:

- Dừng thêm character, weapon, map, animation và item mới.
- Dừng rank, season, guild, auction, shop trả phí và battle pass.
- Không đổi framework/front-end stack chỉ để “trông hiện đại hơn”.
- Không tách microservice/Kubernetes trước khi modular monolith có đo tải chứng minh cần tách.
- Không coi localStorage name, room code hoặc reconnect token là account/session.
- Không dùng số test hiện tại thay cho kiểm chứng CI, browser/device và production readiness.

## 8. Các quyết định product cần chủ dự án chốt

1. Tên/IP phát hành chính thức và phạm vi tham chiếu Gunny/Gunbound.
2. Audience/độ tuổi, thị trường và ngôn ngữ đầu tiên.
3. Trận chuẩn: 1v1 hay 2v2; thời lượng mục tiêu; real-time room hay asynchronous challenge.
4. Guest-only hay bắt buộc account sau bao nhiêu trận.
5. Progression cosmetic-only hay có PvE power tách khỏi PvP.
6. Monetization dự kiến và nguyên tắc không pay-to-win.
7. Quy mô beta mục tiêu để chọn topology/capacity, không thiết kế theo con số mơ hồ.

Các quyết định này phải được ghi vào product brief ở R0 trước khi tiếp tục mở rộng gameplay.
