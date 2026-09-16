# Hand-off theo từng bước

Mỗi bước trong `ONLINE_GAME_ROADMAP.md` có một file bàn giao ở đây. Mục đích: một người (hoặc một phiên AI) chưa từng đọc repo vẫn cầm file lên là làm được bước đó, và biết phải để lại gì cho bước sau.

## Bảng trạng thái

| Bước | Tên | Trạng thái | Phụ thuộc | File |
|---|---|---|---|---|
| M0 | Baseline, tài liệu, CI | Chưa bắt đầu | Không | [M0-baseline.md](M0-baseline.md) |
| M1 | Tách module, giữ hành vi | Chưa bắt đầu | M0 | [M1-refactor.md](M1-refactor.md) |
| M2 | Protocol, reconnect, validation | Chưa bắt đầu | M1 | [M2-protocol.md](M2-protocol.md) |
| M3 | Đồng bộ và cảm giác chơi | Chưa bắt đầu | M2 | [M3-sync.md](M3-sync.md) |
| M4 | Responsive cross-platform | Một phần | M1, chốt sau M3 | [M4-responsive.md](M4-responsive.md) |
| M5 | Delay, S1/S2/SS, item | Chưa bắt đầu | M1 đến M3 | [M5-gameplay.md](M5-gameplay.md) |
| M6 | Quick Join, chat, spectator | Chưa bắt đầu | M2 | [M6-lifecycle.md](M6-lifecycle.md) |
| M7 | Production trên Mac mini | Chưa bắt đầu | M2 đến M6 | [M7-production.md](M7-production.md) |

Trạng thái chỉ có bốn giá trị: `Chưa bắt đầu`, `Đang làm`, `Một phần`, `Xong`.

## Quy ước cập nhật

Hand-off là tài liệu sống, không phải kế hoạch viết một lần:

1. **Bắt đầu một bước**: đổi trạng thái sang `Đang làm` ở cả bảng trên và đầu file bước đó, ghi ngày.
2. **Mỗi lần commit đụng vào bước**: thêm một dòng vào mục Nhật ký của file, ghi commit ngắn và cái gì đổi. Một dòng, không cần dài.
3. **Phát hiện tài liệu sai so với code**: sửa ngay trong hand-off, đừng để dồn. Ghi rõ "sai vì" để người sau hiểu.
4. **Đổi phạm vi**: sửa mục Phạm vi và ghi lý do vào Nhật ký. Nếu phạm vi lan sang bước khác thì sửa cả file bước đó.
5. **Kết thúc một bước**: đổi trạng thái `Xong`, điền mục Bàn giao cho bước sau bằng sự thật đã xảy ra, không phải dự định.

Quy tắc chung: khi code và hand-off lệch nhau, hand-off sai. Sửa hand-off trong cùng commit làm lệch nó.

## Đọc gì trước

- `ONLINE_GAME_ROADMAP.md`: toàn cảnh, nguyên tắc không đổi, thứ tự ưu tiên.
- `ARCHITECTURE.md`: kiến trúc hiện tại, hợp đồng bố cục, seam cho từng tính năng.
- `docs/gunbound-review.md`: vì sao chọn những thay đổi gameplay này.
- `REVIEW.md`: nhật ký quyết định theo thời gian, giải thích các chỗ trông lạ.
