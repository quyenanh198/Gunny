# Review Gunbound (bản PC và GunboundM) — gameplay và design

Tài liệu này đọc Gunbound như một bản mẫu để so với Gunny Chibi Arena, không phải để sao chép. Nguồn là tài liệu và bài đánh giá công khai, liệt kê ở cuối; người viết không chơi trực tiếp bản mobile, nên các con số cân bằng nên kiểm lại trong game trước khi dùng làm mục tiêu thiết kế.

## 1. Gameplay

### 1.1 Thứ tự lượt theo delay, không xen kẽ cứng

Đây là hệ thống định nghĩa Gunbound và là khác biệt lớn nhất so với game của chúng ta.

Mỗi người chơi có một chỉ số **delay**. Ai có delay thấp nhất thì được đi. Mọi hành động cộng delay: chọn vũ khí nào, dùng item gì, và cả thời gian suy nghĩ. Tài liệu ghi mỗi giây suy nghĩ cộng 10 delay (riêng mobile Turtle cộng 12).

Hệ quả thiết kế, theo thứ tự quan trọng:

- **Bắn hai lượt liên tiếp là một mục tiêu chơi được.** Nếu đối thủ vừa dùng SS (delay rất cao), bạn có thể đi hai lần trước khi tới lượt họ. Đây là khoảnh khắc "đã tay" mà người chơi kể lại cho nhau.
- **Thời gian là tài nguyên.** Ngắm lâu không miễn phí. Người chơi giỏi bắn nhanh để giữ nhịp, thay vì dùng hết đồng hồ như game của chúng ta.
- **Chọn vũ khí là chọn nhịp.** Shot 1 delay thấp nhất, Shot 2 cao hơn, SS cao nhất. Bắn nhẹ nhiều lượt hay bắn nặng một lượt là một quyết định thật, không phải chọn "vũ khí mạnh nhất".
- **Thứ tự lượt phải nhìn thấy được.** Người chơi cần một hàng đợi lượt hiển thị thường trực, nếu không toàn bộ chiều sâu này vô hình.

### 1.2 Ba vũ khí trên mỗi mobile

Mỗi mobile (xe) có Shot 1, Shot 2 và SS. Chúng khác nhau về quỹ đạo, sát thương, sức phá đất **và delay**. SS thường là chiêu có hình ảnh riêng và đổi cục diện, nhưng trả giá bằng lượt sau.

Điểm đáng học: bản sắc nhân vật nằm ở bộ ba vũ khí, không nằm ở chỉ số máu hay giáp. Người chơi nhớ "Armor bắn thế nào" chứ không nhớ "Armor có bao nhiêu HP".

### 1.3 Item tiêu hao, trả bằng delay

Item mua trước trận, nhét vào 6 ô, mỗi item chiếm 1 hoặc 2 ô. Vài ví dụ cùng chi phí delay:

| Item | Ô | Delay | Tác dụng |
|---|---|---|---|
| Dual | 2 | 550 | Bắn cùng một vũ khí hai lần trong một lượt |
| Dual+ | 2 | 400 | Hai phát liên tiếp, xen kẽ Shot 2 và Shot 1 |
| Power Up | 1 | 150 | Tăng 33% sát thương |
| Blood | 1 | 0 | Mất 8% máu bản thân, tăng 33% sát thương |
| Teleport | 2 | 100 | Dịch chuyển tới chỗ đạn vừa rơi |
| Team Teleport | 2 | 50 | Đổi chỗ với đồng đội ít máu nhất |
| Bunge Shot | 1 | 50 | Phá đất thêm 25% |

Hai điều đáng chú ý. Thứ nhất, **Blood delay 0**: chấp nhận rủi ro thì không mất nhịp, một thiết kế rất gọn. Thứ hai, item mạnh nhất (Dual) đắt hơn cả SS về delay, nên "dồn sát thương" luôn kéo theo "mất lượt sau".

### 1.4 Gió và ngắm

Gió đổi mỗi lượt, hiển thị bằng mũi tên và số. Người chơi giỏi quy đổi gió thành độ: tài liệu cộng đồng dạy kiểu "gió 2 hướng phải, bắn 90 độ lực đầy sẽ rơi đúng chỗ của 89 độ khi gió 1". Nghĩa là gió không phải yếu tố ngẫu nhiên gây bực, mà là một bảng tra mà người chơi học thuộc dần. Đó là lý do nó giữ chân người chơi lâu.

Ngắm là góc cộng lực, lực nạp bằng thanh chạy. Bản mobile thêm đường chấm dự đoán quỹ đạo và tuỳ chọn tự ngắm.

### 1.5 Bản đồ

Mỗi map có địa hình, khoảng cách hai bên, biên độ gió và mức phá huỷ khác nhau; nhiều map có bản A và B. Người chơi nói về map theo nghĩa "map này hợp mobile nào", ví dụ Miramo được xem là dễ bắn vì góc thoáng và gió ổn định. Map vì vậy là một phần của meta, không chỉ là phông nền.

## 2. Design

### 2.1 Bố cục màn chơi

Thông tin sống còn nằm ở ba chỗ cố định: gió ở giữa trên, máu và delay của từng người ở hai bên, góc/lực/item ở dưới. Người chơi không phải tìm. Đây là điểm bản PC làm tốt và là thứ nên giữ khi chuyển sang mobile.

### 2.2 Điều khiển cảm ứng, chỗ bản mobile bị chê

Đánh giá GunboundM khen giữ đúng chất chơi nhưng chê hai điểm: **tự ngắm kém** và **giao diện rối**. Nhiều người nói thích thanh lực của bản PC hơn cách bấm trên mobile.

Bài học rút ra: khi chuyển một game ngắm bắn sang màn cảm ứng, đừng thay kỹ năng bằng tự động. Cái người chơi muốn là **độ chính xác của thao tác** (kéo được đúng 1 độ, thả đúng lúc), không phải máy ngắm hộ. Trợ giúp nên là đường dự đoán và nút tinh chỉnh, không phải auto-aim.

### 2.3 Một trận nằm gọn trong một màn hình

Gunbound không bao giờ bắt người chơi cuộn trang trong trận. Sân đấu, máu hai bên, gió, đồng hồ và bảng điều khiển cùng nằm trong khung cửa sổ; cửa sổ nhỏ thì mọi thứ co lại chứ không đẩy nhau xuống dưới.

Lý do không chỉ là thẩm mỹ. Trong game bắn tọa độ, người chơi đọc gió, nhìn địa hình, ước lượng khoảng cách rồi mới chỉnh góc. Nếu phải cuộn để thấy nút bắn thì mỗi lượt có thêm một thao tác thừa, và khi đồng hồ chạy thì thao tác thừa đó là thua thiệt thật.

Game của chúng ta trước lần sửa này vi phạm đúng điểm ấy: canvas cố định cao 633 pixel bất kể màn hình, nên trên laptop 1366x768 trang cao 1285 pixel, phải cuộn 517 pixel mới thấy hết; điện thoại xoay ngang phải cuộn 751 pixel. Cảm giác đúng như một game Flash nhúng trong trang web, không phải một game.

Nguyên tắc rút ra: **màn trận đấu khóa theo viewport, màn sảnh và phòng chờ thì không.** Sảnh và phòng là trang nội dung, cuộn là bình thường. Trận đấu là ứng dụng, cuộn là lỗi.

### 2.4 Vòng lặp phiên chơi và kiếm tiền

Avatar lấy từ gacha, gắn thêm gem, cho chỉ số cộng thêm lên mobile. Người chơi phàn nàn giá gói cao. Đây là chỗ nên tránh: khi vật phẩm trả tiền cộng thẳng vào chỉ số chiến đấu, kỹ năng ngắm bị pha loãng và người chơi mới đọc được điều đó rất nhanh.

Với một game tự host, chơi cùng bạn bè, kết luận thẳng: **giữ mọi thứ ảnh hưởng chiến đấu ở trong trận**, cosmetic thì tuỳ ý.

## 3. Cái nên học và cái nên tránh

Nên học, xếp theo giá trị trên công sức:

1. Thứ tự lượt theo delay, kèm hàng đợi lượt hiển thị.
2. Ba vũ khí mỗi nhân vật thay cho sáu vũ khí dùng chung.
3. Item tiêu hao trả bằng delay, số lượng ít nhưng khác biệt rõ.
4. Bảng tra gió mà người chơi học được, thay vì gió thuần ngẫu nhiên.
5. Map có tính cách riêng, ảnh hưởng lựa chọn nhân vật.

Nên tránh:

1. Tự ngắm. Thay bằng đường dự đoán và tinh chỉnh góc theo bước nhỏ.
2. Chỉ số chiến đấu bán bằng tiền hoặc gacha.
3. Nhồi nút lên màn chơi. Bản mobile bị chê rối chính vì điều này.
4. Đặt toàn bộ chiều sâu vào con số ẩn. Nếu không hiển thị được thì người chơi không học được.

## 4. Feedback chỉnh sửa cho Gunny Chibi Arena

Đối chiếu hiện trạng của chúng ta với bản mẫu trên. Cột "Seam" trỏ tới nơi thay đổi sẽ nằm, xem `ARCHITECTURE.md`.

### 4.1 Nên làm, theo thứ tự

| # | Thay đổi | Vì sao | Seam | Công sức |
|---|---|---|---|---|
| 1 | Thứ tự lượt theo delay thay cho xen kẽ cứng | Mở ra toàn bộ chiều sâu chiến thuật, là thứ phân biệt game bắn tọa độ hay với game bắn tọa độ tạm | `TurnQueue` mới trong `match.js` | Trung bình |
| 2 | Hiển thị hàng đợi lượt trên HUD | Không có nó thì delay là con số vô hình | `game.js` sync | Thấp |
| 3 | Đồng hồ lượt cộng delay thay vì chỉ mất lượt | Biến thời gian thành tài nguyên, thưởng người quyết đoán | `match.tick` | Thấp |
| 4 | Mỗi nhân vật có bộ ba vũ khí riêng (S1, S2, SS) | Bản sắc nhân vật, và làm cho việc chọn nhân vật có ý nghĩa chiến đấu | `assets.js` chuyển thành `content/` | Trung bình |
| 5 | SS dùng một lần mỗi trận hoặc nạp theo sát thương nhận vào | Tạo cao trào, thưởng người đang bị dồn | `Actor.charge` | Thấp |
| 6 | Ba đến bốn item trả bằng delay: Tăng lực, Máu đổi lực, Dịch chuyển, Bắn đôi | Quyết định trước mỗi phát bắn, không chỉ ngắm | `match.useItem` | Trung bình |
| 7 | Gió theo cấp có bước cố định và bảng quy đổi trong hướng dẫn | Người chơi học được thay vì đoán | `physics.wind` | Thấp |
| 8 | Nút tinh chỉnh góc theo bước 0,5 độ và nhớ lực lần bắn trước | Khắc phục đúng điểm bản mobile bị chê | `game.js` controls | Thấp |
| 9 | Bảng tổng kết cuối trận: sát thương gây ra, số phát trúng, delay trung bình | Cho người chơi thấy mình giỏi lên | `Match.stats` | Thấp |
| 10 | Đặt tính cách cho từng map: biên độ gió, độ cứng đất, khoảng cách hai bên | Map thành một phần của meta | `maps.js` | Thấp |
| 11 | Màn trận đấu vừa khít viewport, không cuộn. Đã làm | Mỗi thao tác thừa trong lượt là thua thiệt khi đồng hồ chạy | `fitStage` trong `game.js` | Thấp |

### 4.2 Không nên làm

- Tự ngắm, kể cả dạng "gợi ý góc tốt nhất". Bot của chúng ta đã có sẵn thuật toán đó; đưa cho người chơi là xoá bỏ trò chơi.
- Chỉ số gắn với tài khoản, cấp độ, hay vật phẩm ngoài trận.
- Thêm chế độ mới (giải đấu, xếp hạng) trước khi lõi chiến đấu đủ sâu. Số người chơi cùng lúc trên một Mac mini không đủ để nuôi bảng xếp hạng.

### 4.3 Rủi ro khi đổi sang delay

- Bot hiện đánh giá nước đi bằng sai số điểm rơi. Khi có delay, bot phải cân thêm "phát này khiến tôi mất lượt sau". Tối thiểu: cộng phạt delay vào hàm chi phí của `botShot`.
- Luật thắng theo số lượt (30 lượt) không còn nghĩa khi lượt không xen kẽ. Đổi sang giới hạn thời gian trận hoặc tổng số lần bắn.
- Chơi online: delay làm thứ tự lượt phụ thuộc thời gian suy nghĩ, nên đồng hồ phải do server giữ, không phải client. Kiến trúc hiện tại đã đúng chỗ này.

## Nguồn

- [Gunbound/Gameplay — StrategyWiki](https://strategywiki.org/wiki/Gunbound/Gameplay)
- [GunBound — Encyclopedia Gamia Archive Wiki](https://gamia-archive.fandom.com/wiki/GunBound)
- [GunBound Bots and Items Guide — GameFAQs](https://gamefaqs.gamespot.com/pc/582632-gunbound/faqs/28187)
- [GunBound Beginner's Guide — GameFAQs](https://gamefaqs.gamespot.com/pc/582632-gunbound/faqs/26935)
- [GunboundM Game Review — MMOs.com](https://mmos.com/review/gunboundm)
- [GunboundM: How to Complete Wind Master at Wind Force 10 — UrGameTips](https://www.urgametips.com/2017/07/gunboundm-how-wind-master-force-10.html)
- [Gunbound — Wikipedia](https://en.wikipedia.org/wiki/Gunbound)
