# M2 — Protocol bền vững, reconnect, validation

| | |
|---|---|
| Trạng thái | Chưa bắt đầu |
| Phụ thuộc | M1 |
| Chặn bước | M3, M6, M7 |
| Cập nhật | 2026-09-16 |

## Mục tiêu

Chịu được mạng thật: gói tin trùng, sai thứ tự, tab nền, Wi-Fi rớt 10 giây, và client cố tình sửa payload.

## Bối cảnh khi bàn giao

Protocol hiện tại, đọc từ `server/server.js`:

- Client gửi 12 loại message, chỉ kiểm tra `typeof msg.t === "string"` rồi vào `switch`. Message lạ bị bỏ im lặng.
- Kiểm tra quyền có sẵn nhưng rải rác: `client.host` cho `setup`/`start`/`restart`/`lobby`, biến `mine` cho input trong trận.
- Không có version, không có số thứ tự, không có ack, không có heartbeat.
- Snapshot là một loại duy nhất tên `room`, gửi 20 lần mỗi giây, kèm `terrainVersion` để chỉ gửi địa hình khi đổi.
- Mất kết nối là mất ghế ngay: `ws.on("close")` gọi `room.leave(client)`. Ghế trống thì lượt tự bỏ sau 1,5 giây (`IDLE_SEAT_S`).
- Không giới hạn tần suất input, kích thước message, số kết nối mỗi IP, số phòng.

## Phạm vi

Làm:

- `protocolVersion` và schema validation cho mọi message.
- `clientSeq` trên input; `serverTick`, `lastAckSeq`, `roomVersion` trên snapshot.
- Heartbeat, timeout, trạng thái `connecting` / `reconnecting` / `disconnected` ở client.
- Reconnect token ngắn hạn, giữ ghế 30 đến 60 giây, resync bằng full snapshot.
- Input idempotent: bỏ message cũ, trùng, sai phase.
- Rate limit và giới hạn kích thước.
- Mã lỗi máy đọc được, UI dịch sang tiếng Việt.

Không làm:

- Chưa binary protocol. Chưa delta snapshot cho tới khi full snapshot ổn định.
- Không đụng gameplay.

## Các bước

1. **Schema trước, hành vi sau.** `validation.js` nhận `(type, payload)` trả về `{ok, value}` hoặc `{ok:false, code}`. Áp cho mọi message, kể cả message đang hợp lệ.
   Kiểm chứng: test gửi 12 message đúng và 12 biến thể sai (thiếu trường, sai kiểu, thừa trường, số ngoài dải).
2. **Số thứ tự.** Client gắn `clientSeq` tăng dần; server nhớ `lastSeq` mỗi client, bỏ message có seq nhỏ hơn hoặc bằng. Snapshot trả `lastAckSeq`.
   Kiểm chứng: gửi cùng một `release` ba lần, chỉ một phát bắn xảy ra.
3. **Heartbeat.** Ping 5 giây một lần, timeout 15 giây. Client hiện trạng thái kết nối trên header.
   Kiểm chứng: chặn mạng ở DevTools, header đổi trong 15 giây.
4. **Reconnect.** Khi đóng kết nối, giữ client trong phòng ở trạng thái `ghost` tối đa 45 giây kèm token. Vào lại đúng token thì nhận lại ghế, host, loadout. Hết hạn mới gọi `leave`.
   Kiểm chứng: test tự động ngắt socket, nối lại sau 10 giây, ghế và HP giữ nguyên.
5. **Rate limit.** Input tối đa 30 message mỗi giây mỗi client, message tối đa 8 KB, tối đa 5 kết nối mỗi IP, tối đa 50 phòng.
   Kiểm chứng: test spam 1000 message trong một giây không làm tick chậm quá ngưỡng baseline.

## Tiêu chí hoàn thành

- Mất mạng 10 giây rồi nối lại vẫn giữ ghế và state.
- Gửi trùng hoặc sai thứ tự không tạo hai phát bắn.
- Client sửa payload không tăng được HP, damage, energy, không chiếm được lượt.
- Test mô phỏng latency 50, 150, 300 ms kèm jitter và mất gói.

## Rủi ro

- **Giữ ghế cho người đã thoát làm treo trận.** Grace period phải nhỏ hơn hoặc bằng thời gian một lượt, và ghế `ghost` vẫn bị auto-skip như hiện nay. Đừng bỏ `IDLE_SEAT_S`.
- **Token reconnect bị lộ qua log.** Không log token. Ghi rõ điều này ở M7.
- **Rate limit quá chặt giết input hợp lệ.** `keys` gửi mỗi lần đổi phím, người chơi bấm nhanh có thể vượt ngưỡng. Đo trước khi chọn số.

## Bàn giao cho bước sau

M3 cần `serverTick` trên snapshot để nội suy và `roomVersion` để biết khi nào phải resync. M6 cần reconnect chạy được trước khi thêm spectator giữa trận. M7 cần mã lỗi và bộ đếm message bị từ chối để đưa vào metrics.

## Nhật ký

- 2026-09-16: tạo hand-off. Ghi rõ protocol hiện tại không có version, seq, heartbeat, rate limit.
