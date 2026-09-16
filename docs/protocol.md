# Protocol WebSocket v1

Endpoint: `/ws?room=ABCD&name=An&reconnectToken=...`.

## Client → server

Mọi message là JSON object, tối đa 4096 byte, có:

- `protocolVersion: 1`.
- `clientSeq`: số nguyên dương tăng đơn điệu trong một phiên người chơi.
- `t`: một trong `team`, `ready`, `loadout`, `setup`, `start`, `restart`, `lobby`, `keys`, `aim`, `charge`, `release`, `cancel`, `action`, `chat`, `kick`. `action` chỉ gửi lựa chọn shot/item; server tự tính SS, HP cost, damage và delay. Chat tối đa 160 ký tự; chỉ host được kick trước trận.

Server xác thực schema trước khi chuyển message cho phòng. Message có sequence cũ hoặc trùng bị bỏ qua; message sai trả `{ "t": "error", "code": "..." }`. Mỗi kết nối nhận tối đa 60 message/giây.

## Server → client

Snapshot `room` có:

- `protocolVersion`: version server đang dùng.
- `serverTick`: fixed-step authoritative hiện tại.
- `lastAckSeq`: input cuối server đã nhận từ client này.
- `roomVersion`: revision của phòng/input đã chấp nhận.
- `reconnectToken`: token bí mật dùng lại trong 30 giây sau khi mất kết nối.
- State phòng và, khi đang chơi, full match snapshot. Terrain chỉ gửi khi `terrainVersion` thay đổi hoặc client reconnect.

Error code hiện có: `INVALID_JSON`, `INVALID_MESSAGE`, `INVALID_PAYLOAD`, `INVALID_SEQUENCE`, `VERSION_MISMATCH`, `UNKNOWN_MESSAGE`, `MESSAGE_TOO_LARGE`, `RATE_LIMITED`, `RECONNECT_EXPIRED`.

## Reconnect và heartbeat

Server ping WebSocket mỗi 10 giây và đóng kết nối không pong. Client chuyển sang `reconnecting`, thử lại sau 1 giây với room ID và token. Trong grace period 30 giây, server giữ ID, ghế, host và match state; reconnect thành công luôn buộc full terrain resync.
