# M3 — Đồng bộ và cảm giác chơi

| | |
|---|---|
| Trạng thái | Chưa bắt đầu |
| Phụ thuộc | M2 |
| Chặn bước | M4 chốt, M5 |
| Cập nhật | 2026-09-16 |

## Mục tiêu

Hình ảnh mượt ở 150 ms latency mà server vẫn là nguồn sự thật duy nhất.

## Bối cảnh khi bàn giao

`RemoteMatch` trong `src/net.js` hiện đã:

- Nội suy đạn bằng chính `physics.step` giữa hai snapshot, nên đạn bay 60 khung hình dù snapshot 20 Hz.
- Tự sinh particle, rung màn hình, vệt đạn khi thấy blast mới (`seenBlasts`).
- Nạp lại địa hình khi `terrain` xuất hiện trong snapshot.

Còn thiếu:

- Không có buffer. Snapshot đến là áp ngay, nên jitter mạng thành giật hình.
- Đồng hồ lượt lấy thẳng `time` từ snapshot, không nội suy.
- `paused` áp cho cả online: mở hướng dẫn hoặc ẩn tab làm client ngừng `update`, trong khi server vẫn chạy. Đây là nguồn lệch trạng thái.
- Không có reconciliation cho vị trí khi client đoán trước.

## Phạm vi

Làm:

- Buffer snapshot 100 đến 150 ms, nội suy theo `serverTick`.
- Prediction chỉ cho thao tác cục bộ rẻ: góc ngắm, thanh lực, nút di chuyển.
- Reconciliation vị trí: lệch nhỏ thì kéo mềm, lệch lớn thì nhảy.
- Đồng hồ lượt neo theo mốc server.
- Tách `paused`: luyện tập thì dừng thật, online thì chỉ dừng vẽ.
- Người có lượt mất kết nối: chờ grace rồi auto-skip.

Không làm:

- Không rollback netcode. Game theo lượt không cần.
- Không đụng luật trận.

## Các bước

1. **Tách `paused`.** Đổi thành hai khái niệm: `renderPaused` (ẩn tab, mở hướng dẫn) và `simPaused` (chỉ có ở `LocalSession`). Online chỉ dùng cái đầu.
   Kiểm chứng: mở hướng dẫn 5 giây trong trận online, đồng hồ vẫn chạy đúng khi đóng.
2. **Buffer.** Giữ hàng đợi snapshot, render trạng thái tại `now - delay`. Bắt đầu với 120 ms, cho chỉnh bằng hằng số.
   Kiểm chứng: test với jitter 50 ms, vị trí actor không giật.
3. **Đồng hồ.** Client tính `time` từ `serverTick` và tốc độ tick, không tự trừ `dt`.
   Kiểm chứng: hai client hiện cùng số giây, lệch dưới 1.
4. **Prediction góc và lực.** Đã có sẵn cho `setAim` và `charge`; thêm điều kiện hoàn tác khi server trả khác.
   Kiểm chứng: giữ nút bắn rồi ngắt mạng, khi nối lại thanh lực khớp server.
5. **Auto-skip.** Kết hợp với `ghost` của M2: người có lượt mà mất kết nối thì chờ grace rồi `nextTurn`.
   Kiểm chứng: test ngắt socket đúng lượt mình, trận chạy tiếp.

## Tiêu chí hoàn thành

- Hai client thấy cùng lượt, HP, hố đạn, kết quả.
- Không teleport đáng kể ở 150 ms latency.
- Tab nền quay lại tự resync, không có input kẹt.

## Rủi ro

- **Buffer làm input trễ.** Chỉ buffer phần hiển thị của người khác; thao tác của chính mình vẽ ngay.
- **Nội suy đạn hai lần.** `RemoteMatch` đang tự chạy `physics.step`; khi thêm buffer phải chọn một trong hai, không cộng dồn.
- **Bỏ `paused` cho online làm mất tính năng dừng khi đọc hướng dẫn.** Đúng như vậy, và đó là chủ ý: trận online không dừng được. Ghi rõ trong hướng dẫn.

## Bàn giao cho bước sau

M4 cần `renderPaused` tách riêng để xử lý đổi hướng màn hình mà không chạm mô phỏng. M5 cần đồng hồ neo theo server trước khi thời gian suy nghĩ trở thành delay.

## Nhật ký

- 2026-09-16: tạo hand-off. Ghi rõ `paused` hiện áp cho cả online và đó là nguồn lệch.
