# M5 — Delay, bộ ba vũ khí, item

| | |
|---|---|
| Trạng thái | Chưa bắt đầu |
| Phụ thuộc | M1 đến M3 |
| Chặn bước | Không |
| Cập nhật | 2026-09-16 |

## Mục tiêu

Tạo chiều sâu kiểu Gunbound: thứ tự lượt theo delay, mỗi nhân vật một bộ ba vũ khí, vài item trả bằng delay.

## Bối cảnh khi bàn giao

Vì sao làm việc này, đọc `docs/gunbound-review.md` mục 1.1 đến 1.3. Tóm tắt: trong Gunbound ai có delay thấp nhất thì đi; mỗi giây suy nghĩ cộng 10 delay; Shot 1 rẻ, Shot 2 đắt hơn, SS rất đắt; item Dual cộng 550 delay còn Blood cộng 0 nhưng mất 8% máu.

Trạng thái hiện tại:

- `Match.nextTurn()` xen kẽ cứng hai đội, trong đội xoay vòng bằng `cursor[team]`.
- Hết 30 lượt thì so tổng HP. Luật này mất nghĩa khi lượt không còn xen kẽ.
- Mỗi actor có đúng một vũ khí, chọn từ 7 vũ khí dùng chung. Vũ khí đã có tham số riêng: trọng lực, bám gió, hình hố, sát thương, dải góc.
- Chưa có item.
- `botShot` chấm nước đi bằng sai số điểm rơi, không biết delay.

## Phạm vi

Làm theo đúng thứ tự dưới. Mỗi mục là một PR riêng, không gộp.

1. `TurnQueue` thay xen kẽ cứng.
2. Hàng đợi lượt trên HUD.
3. Đồng hồ cộng delay.
4. Bộ ba S1, S2, SS cho từng nhân vật.
5. SS có nạp.
6. Ba đến bốn item.
7. Bot biết delay.

Không làm: avatar, chỉ số ngoài trận, gacha. Xem mục 4.2 của `docs/gunbound-review.md`.

## Các bước

1. **`core/turn-queue.js` thuần.** API: `nextActor(entries)`, `addDelay(entries, id, amount)`, `tickThinking(entries, id, dt, perSecond)`. Không biết gì về actor hay `Match`.
   Kiểm chứng: unit test riêng cho module, không cần `Match`.
2. **Nối vào `Match`.** Thay `turn` và `cursor` bằng hàng đợi. Đổi luật thắng sang giới hạn thời gian trận hoặc tổng số phát bắn, vì 30 lượt không còn nghĩa.
   Kiểm chứng: `tests/match.test.js` phải sửa; sửa xong phải có test mới cho tình huống đi hai lượt liên tiếp.
3. **HUD.** Hiện 5 đến 8 lượt kế tiếp. Không có nó thì delay là con số vô hình.
   Kiểm chứng: smoke test đọc được thứ tự từ DOM.
4. **Đồng hồ cộng delay.** Chỉ server cộng. Client chỉ hiển thị.
   Kiểm chứng: test hai client thấy cùng hàng đợi sau khi một người ngắm lâu.
5. **Bộ ba vũ khí.** `content/characters.js` khai báo `shots: {s1, s2, ss}`; `content/weapons.js` thêm `delay`. HUD đổi từ kho 7 vũ khí sang 3 nút của chính nhân vật.
   Kiểm chứng: smoke test đổi từ đếm 7 nút sang 3 nút.
6. **Item.** `Match.useItem(id)` trừ ô, cộng delay, đặt cờ cho phát bắn kế tiếp. Hiệu lực áp trong `combat.fire`, không rải khắp nơi.
   Kiểm chứng: test mỗi item đổi đúng một đại lượng.
7. **Bot.** Hàm chi phí đổi thành `khoảngCáchTớiMụcTiêu + w * delayCủaHànhĐộng`, `w` theo mức khó.
   Kiểm chứng: bot Khó không còn luôn chọn chiêu nặng nhất.

## Tiêu chí hoàn thành

- Có tình huống hợp lệ đi hai lượt liên tiếp vì delay thấp.
- Replay cùng seed giữ đúng thứ tự hàng đợi.
- Client không sửa được delay, SS, item.
- Không shot hay item nào luôn tối ưu trong test cân bằng.

## Rủi ro

- **Luật thắng.** Đây là thay đổi lan rộng nhất, đụng `checkWinner`, HUD, bảng kết quả, và cả test. Làm riêng một PR.
- **Bot chậm.** Bot đang duyệt khoảng 1.900 lần mô phỏng mỗi lượt. Nhân thêm 3 loại shot là gấp ba. Đo trước, chỉ đưa sang worker khi profiling chứng minh cần (nguyên tắc ở mục 6 của roadmap).
- **Cần asset đạn mới** cho S2 và SS. Danh sách đặt hàng ở `REVIEW.md` mục 12.

## Bàn giao cho bước sau

Không chặn bước nào. Nhưng khi xong, cập nhật `docs/gunbound-review.md` mục 4.1: đánh dấu các mục 1 đến 6 đã làm, và ghi số delay thật đã chọn để lần cân bằng sau có mốc.

## Nhật ký

- 2026-09-16: tạo hand-off. Ghi rõ luật 30 lượt sẽ phải đổi và đó là phần rủi ro nhất.
