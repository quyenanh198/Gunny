# Protocol WebSocket v2

Endpoint mở socket:

```text
/ws?mode=create&visibility=private&name=An
/ws?mode=join&room=ABCDEF&name=An
/ws?mode=spectate&room=ABCDEF&name=An
/ws?mode=resume&room=ABCDEF
```

Reconnect credential không được đặt trong URL.

## Resume handshake

Sau khi socket `mode=resume` mở, client phải gửi trong 5 giây:

```json
{
  "t": "resume",
  "protocolVersion": 2,
  "room": "ABCDEF",
  "reconnectToken": "opaque-secret"
}
```

Server kiểm tra room/token/disconnect grace, rotate token ngay khi thành công và gửi full snapshot. Token cũ không thể replay. Handshake lỗi đóng socket bằng policy violation.

## Client command

Mọi command gameplay/lobby là JSON object tối đa 4096 byte:

- `protocolVersion: 2`.
- `clientSeq`: số nguyên dương tăng đơn điệu trên logical session, giữ nguyên qua reconnect.
- `requestId`: chuỗi `[A-Za-z0-9_-]`, dài 1–64, duy nhất cho thao tác.
- `t`: `team`, `ready`, `loadout`, `setup`, `start`, `restart`, `lobby`, `keys`, `aim`, `charge`, `release`, `cancel`, `action`, `chat` hoặc `kick`.

Server chỉ tăng `lastAckSeq` sau khi command qua schema, authorization, phase và room invariant. Command bị từ chối không consume sequence, nên client có thể gửi command hợp lệ với cùng sequence kế tiếp.

Command được nhận:

```json
{ "t": "ack", "requestId": "...", "clientSeq": 12 }
```

Command bị từ chối:

```json
{ "t": "error", "code": "COMMAND_REJECTED", "requestId": "...", "clientSeq": 12 }
```

Client dùng `requestId` để đóng pending operation; snapshot `lastAckSeq` vẫn là mốc resync authoritative.

## Server snapshot

Snapshot `room` có:

- `protocolVersion`, `serverTick`, `lastAckSeq`, `roomVersion`.
- Reconnect token hiện hành, room/player/role state và match snapshot khi đang chơi.
- Terrain chỉ gửi khi `terrainVersion` đổi hoặc sau reconnect.

## Error codes

- Schema/version: `INVALID_JSON`, `INVALID_MESSAGE`, `INVALID_PAYLOAD`, `INVALID_SEQUENCE`, `INVALID_REQUEST_ID`, `VERSION_MISMATCH`, `UNKNOWN_MESSAGE`, `MESSAGE_TOO_LARGE`.
- Lifecycle: `ROOM_NOT_FOUND`, `ROOM_FULL`, `SPECTATOR_FULL`, `RECONNECT_EXPIRED`, `RESUME_REQUIRED`, `RESUME_TIMEOUT`.
- Command/rate: `STALE_SEQUENCE`, `COMMAND_REJECTED`, `RATE_LIMITED`.

## Heartbeat và reconnect

Server ping mỗi 10 giây và đóng socket không pong. Client reconnect sau 1 giây; server giữ seat/host/match trong 30 giây. Resume thành công rotate credential và buộc full terrain resync.
