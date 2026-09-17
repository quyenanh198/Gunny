# Threat model — online foundation

Ngày review: 2026-09-17. Phạm vi: browser client, HTTP endpoints, WebSocket gateway, room lifecycle và authoritative match runtime.

## Tài sản cần bảo vệ

- Identity/session/reconnect credentials.
- Quyền điều khiển seat, host và lượt hiện tại.
- Match state, result và reward settlement.
- Availability của event loop, room manager và outbound snapshot queue.
- Chat/player-generated text, moderation evidence và private room metadata.

## Trust boundaries

1. Browser là không đáng tin; mọi payload, timing và client state có thể bị sửa.
2. Reverse proxy chỉ đáng tin khi cấu hình explicit trusted proxy; không tin trực tiếp forwarded headers.
3. WebSocket connection không đồng nghĩa với authenticated player/seat.
4. Match runtime được tin cho gameplay outcome nhưng persistence phải idempotent và transactional.
5. Admin tooling là boundary riêng, bắt buộc RBAC, MFA và audit.

## Mối đe dọa hiện hữu

| Threat | Bằng chứng hiện tại | Mức | Remediation |
|---|---|---:|---|
| Room/connection exhaustion | Room lạ tự tạo; chưa cap IP/room | Critical | Tách create/join, quota tại edge và app |
| Reconnect token leakage | Token nằm trong WebSocket query | High | Auth message/cookie, redact proxy log, rotate token |
| Cross-site WebSocket hijacking | Chưa validate `Origin` | High | Origin allowlist trên upgrade |
| Seat overflow | `team` không enforce `MAX_TEAM` | High | Capacity invariant ở `Room.handle` và test race |
| Slow consumer memory growth | Broadcast không đọc `bufferedAmount` | High | Coalesce/drop snapshot, close slow client |
| Command ambiguity/replay | Sequence consume trước authorization; reject im lặng | Medium | Accepted ack/error, request ID, idempotency |
| Enumeration/privacy | `/api/rooms` public toàn bộ room | Medium | Chỉ list public room, không lộ private metadata |
| Metrics exposure | `/metrics` public | Medium | Bind nội bộ hoặc bảo vệ tại proxy |
| Chat abuse | Chỉ giới hạn 160 ký tự/750 ms | Medium | Mute/block/report, moderation log và sanctions |
| Process loss | Match/history/reconnect ở RAM | Medium | Recovery policy và durable settlement |

## Security invariants cho R1

- Một identity chỉ giữ tối đa một seat trong room; mỗi team không vượt capacity.
- Unknown room không được tạo từ join request.
- Spectator không thể gửi gameplay command.
- Chỉ current seat được tác động match; rejected command không thay đổi state hoặc sequence được chấp nhận.
- Credential không nằm trong URL, analytics, error hoặc access log.
- Origin không cho phép bị từ chối trước khi cấp room resources.
- Mỗi IP/session có quota handshake, room create và message; slow client không giữ snapshot queue vô hạn.
- Mọi close/reject có machine-readable code nhưng không tiết lộ secret/internal stack.

## Test bắt buộc

- Hai client đồng thời tranh seat cuối: đúng một client thành công.
- Duplicate/out-of-order/unauthorized command không đổi checksum match.
- Reconnect token cũ không dùng lại được sau rotation/expiry.
- Origin sai, payload quá lớn, handshake flood và room-create flood bị chặn.
- Client có `bufferedAmount` vượt ngưỡng bị coalesce hoặc disconnect.
- Fuzz protocol không crash process và không tạo room/player state rác.
