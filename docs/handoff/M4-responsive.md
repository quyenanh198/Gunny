# M4 — Responsive cross-platform

| | |
|---|---|
| Trạng thái | Một phần |
| Phụ thuộc | M1; chốt sau M3 |
| Chặn bước | Không |
| Cập nhật | 2026-09-16 |

## Mục tiêu

Desktop, tablet và điện thoại đều chơi được thật, không phải desktop co nhỏ.

## Bối cảnh khi bàn giao

Đã làm ở commit `893058d`, mô tả đầy đủ ở mục 7b của `ARCHITECTURE.md`:

- Màn trận khóa `100dvh`, không cuộn. Ba dải: header, sân đấu co giãn, thanh điều khiển.
- `fitStage` trong `src/game.js` tính kích thước khung từ chỗ trống, giữ đúng tỉ lệ 1200×620. Theo dõi bằng `ResizeObserver` trên `#stage`, không nghe `resize` cửa sổ.
- Lớp phủ HUD nằm trong `.frame` nên luôn dính mép tranh. Bảng điểm đè lên tranh ở màn rộng, xếp phía trên tranh trên điện thoại.
- Màn hình thấp dưới 560 px dùng HUD thu gọn; dưới 450 px ẩn luôn header.
- Smoke test kiểm tra 1920×1080, 1366×768, 1024×640 và 390×844: không cuộn dọc, không tràn ngang, tỉ lệ lệch dưới 2%, khung nằm trọn trong viewport.

Còn thiếu so với roadmap:

- Chưa xử lý `devicePixelRatio`. Canvas vẫn là backing store 1200×620 cố định, nên màn hình DPR 2 bị mềm nét.
- Chưa dùng `env(safe-area-inset-*)`, nên iPhone có notch có thể bị che ở landscape.
- Chưa có nút tăng giảm góc 0,5° và 1°. Trên cảm ứng chỉ có slider, khó đạt độ chính xác.
- Chưa chia điều khiển thành hai cụm trái phải cho điện thoại nằm ngang.
- Chưa test 1440×900, iPad 1024×768 và 768×1024, Android 360×800 và 800×360, DPR 1/2/3, reduced motion, chỉ bàn phím.
- Chưa có gợi ý xoay ngang ở chế độ dọc.

## Phạm vi

Làm nốt phần còn thiếu ở trên. Không đổi kích thước thế giới logic theo thiết bị, đây là nguyên tắc số 3 của roadmap.

## Các bước

1. **DPR.** Đặt `canvas.width = 1200 * min(dpr, 2)` và scale context một lần; giữ CSS size do `fitStage` quyết định. Layer địa hình trong `sprites.js` phải nhân theo, nếu không hố đạn lệch.
   Kiểm chứng: test hố đạn hiện có vẫn xanh ở DPR 1 và 2; chụp màn hình so độ nét.
2. **Safe area.** Thêm padding theo `env(safe-area-inset-*)` cho `main` ở chế độ trận.
   Kiểm chứng: giả lập iPhone landscape, không phần tử nào nằm dưới notch.
3. **Tinh chỉnh góc.** Hai nút cạnh slider: bước 1° và 0,5°, giữ để lặp. Nhớ lực lần bắn trước.
   Kiểm chứng: trên cảm ứng đặt được đúng 45,5°.
4. **Bố cục hai cụm cho điện thoại ngang.** Trái: di chuyển. Phải: góc, lực, bắn. Sân đấu ở giữa.
   Kiểm chứng: 844×390 và 800×360 đều chạm được bằng hai ngón cái.
5. **Gợi ý xoay.** Ở chế độ dọc dưới 600 px, hiện dải gợi ý không chặn thao tác.
   Kiểm chứng: xoay qua lại không mất trạng thái trận.
6. **Mở rộng ma trận test** trong smoke: thêm 1440×900, 1024×768, 768×1024, 360×800, 800×360.
   Kiểm chứng: smoke xanh hai lần liên tiếp.

## Tiêu chí hoàn thành

- Không tràn hoặc cuộn ở mọi viewport trong ma trận.
- Nút chính tối thiểu 44×44 CSS px; chữ HUD chính tối thiểu 12 px thực tế.
- Ngắm chính xác tới 0,5° bằng cảm ứng.
- 60 FPS trên thiết bị trung bình; không dựng lại layer địa hình mỗi khung hình.

## Rủi ro

- **DPR làm chậm máy yếu.** Cap ở 2 và đo lại FPS trước khi giữ.
- **Đổi backing store làm lệch toạ độ chuột.** Mọi chỗ đổi từ toạ độ màn hình sang toạ độ thế giới phải đi qua một hàm duy nhất.
- **Chốt M4 quá sớm.** Roadmap nói rõ: chạy song song theo từng tính năng nhưng chỉ chốt sau M3, vì reconnect và tab nền ảnh hưởng mạnh tới điện thoại.

## Bàn giao cho bước sau

Không chặn bước nào, nhưng M5 thêm hàng đợi lượt và item vào HUD, nên phải biết trước chỗ nào còn trống ở màn hình nhỏ. Ghi lại ngân sách không gian HUD khi làm xong bước 4.

## Nhật ký

- 2026-09-16: tạo hand-off. Đánh dấu `Một phần`: viewport fit và ma trận 4 kích thước đã xong ở `893058d`; DPR, safe area, tinh chỉnh góc, bố cục hai cụm chưa làm.
