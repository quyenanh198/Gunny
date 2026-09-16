# M6 — Quick Join, chat, spectator

| | |
|---|---|
| Trạng thái | Chưa bắt đầu |
| Phụ thuộc | M2 |
| Chặn bước | M7 |
| Cập nhật | 2026-09-16 |

## Mục tiêu

Người mới vào trận nhanh và ở lại được, không cần hệ thống tài khoản.

## Bối cảnh khi bàn giao

Đã có:

- Sảnh liệt kê phòng từ `GET /api/rooms`, trả `id`, `state`, `players`, `teams`, `map`.
- Vào phòng bằng mã 4 chữ cái hoặc link mời. Mã lạ thì tạo phòng mới cùng mã đó.
- Người vào được xếp vào phe ít người hơn, có thể chuyển sang khán giả bằng nút "Xem trận".
- Chủ phòng là người vào đầu, rời thì chuyển cho người kế, chỉ chủ phòng chỉnh cấu hình và bắt đầu.
- Tên người chơi lấy từ URL hoặc ô nhập, cắt 16 ký tự, nhớ trong `localStorage`.

Chưa có:

- Quick Join. Người chơi phải tự đọc danh sách và bấm đúng phòng.
- Chat.
- Kick bởi chủ phòng.
- Khán giả vào giữa trận: hiện `join` lúc đang chơi đặt `team = null` nhưng chưa có full snapshot riêng cho người mới vào.
- Lịch sử trận.

Điểm an toàn cần giữ: tên người chơi hiện render bằng `textContent` trong `playerRow` và `botRow` dùng `innerHTML` nhưng chỉ với chuỗi cố định. Khi thêm chat, tuyệt đối không dùng `innerHTML` cho nội dung người dùng.

## Phạm vi

Làm: Quick Join, chat có giới hạn, ready check và kick, spectator giữa trận, lịch sử ngắn trong RAM.

Không làm: database, tài khoản, xếp hạng. Nguyên tắc số 6 của roadmap.

## Các bước

1. **Quick Join.** Nút ở sảnh chọn phòng còn ghế, ưu tiên phòng đang ở trạng thái chờ và đông người nhất mà chưa đầy. Không có phòng nào thì tạo mới.
   Kiểm chứng: từ sảnh vào được trận trong tối đa 3 thao tác.
2. **Chat.** Message `chat` với độ dài tối đa 200 ký tự, tối đa 3 tin mỗi 5 giây mỗi người, hiện trong phòng chờ và trong trận. Render bằng `textContent`.
   Kiểm chứng: test gửi thẻ HTML trong tin nhắn, DOM không tạo phần tử mới.
3. **Kick và ready check.** Chủ phòng kick được người chơi trước trận. Người bị kick nhận mã lỗi rõ ràng.
   Kiểm chứng: test kick rồi vào lại được bằng mã phòng.
4. **Spectator giữa trận.** Người vào khi `state === "playing"` nhận full snapshot kèm địa hình ngay lập tức, không gửi được input gameplay.
   Kiểm chứng: test vào giữa trận thấy đúng HP, lượt, địa hình đã bị khoét.
5. **Lịch sử ngắn.** Giữ 20 trận gần nhất trong RAM mỗi phòng: ai thắng, bao lâu, map nào. Hiện ở phòng chờ.
   Kiểm chứng: restart server thì mất, và đó là chấp nhận được ở quy mô này.

## Tiêu chí hoàn thành

- Người mới từ sảnh vào trận trong tối đa 3 thao tác với Quick Join.
- Khán giả vào giữa trận thấy đúng trạng thái.
- Spam chat hoặc input không làm chậm vòng tick.

## Rủi ro

- **Chat là bề mặt tấn công XSS đầu tiên của dự án.** Không `innerHTML`, không `dangerouslySetInnerHTML` tương đương. Test phải có ca thẻ HTML và ca chuỗi rất dài.
- **Spectator tốn băng thông.** Mỗi người xem là một bản snapshot 20 Hz. Đo lại byte mỗi giây khi có 10 khán giả, so với baseline M0.
- **Quick Join dồn người vào một phòng** rồi phòng đó đầy ngay. Chọn phòng theo số ghế trống thật, không theo thứ tự danh sách.

## Bàn giao cho bước sau

M7 cần số khán giả và số tin nhắn để đưa vào metrics, và cần biết chat có làm tăng kích thước snapshot không.

## Nhật ký

- 2026-09-16: tạo hand-off. Ghi chú `botRow` dùng `innerHTML` với chuỗi cố định, phải đổi cách làm khi thêm chat.
