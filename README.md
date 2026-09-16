# Gunny · Chibi Arena

Webgame bắn tọa độ theo lượt, lấy cảm hứng từ Gunny, với sprite chibi nền trong suốt và đồ họa riêng, hiển thị bằng Canvas. Giao diện tiếng Việt, responsive, không cần tài khoản hay backend.

## Chạy

Cần Python 3 để chạy server, Node.js 20+ để kiểm tra.

```sh
npm run dev
# mở http://localhost:5173
npm test
npm run check
```

Smoke test trình duyệt: cài Playwright rồi chạy `BROWSER_EXECUTABLE=/path/to/chromium node scripts/browser-smoke.cjs` với server dev đang chạy.

Có thể đưa toàn bộ repo lên static hosting (GitHub Pages, Cloudflare Pages hoặc Nginx). Không có bước build, đường dẫn tương đối hỗ trợ subdirectory. Font Google là tùy chọn, có font hệ thống dự phòng.

## Cách chơi

- A/D hoặc nút trái/phải: di chuyển. Mỗi lượt có 100 năng lượng, đi ngang hoặc xuống dốc tốn 1 mỗi pixel, lên dốc tốn thêm 2 lần độ dốc (tan), dốc quá 45° không leo được. Đứng trong hố sâu thì phải bắn ra chứ không trèo được.
- ↑/↓ hoặc thanh trượt: góc 10–170°. 45° hướng phải, 135° hướng trái. Mỗi vũ khí có dải góc riêng (cối hạt dẻ chỉ 45–85°); kéo vào vùng cấm quanh 90° sẽ nhảy sang hướng ngược lại. Đứng trên dốc thì góc thật cộng thêm độ dốc (tối đa 20°), HUD hiển thị phần cộng thêm; góc thật không bao giờ vượt qua 90° sang hướng ngược lại.
- Giữ SPACE hoặc nút BẮN để tăng lực, thả để bắn. Lực tối đa được giữ ở 100%.
- Gió hiển thị theo cấp 0 đến 10 (mỗi cấp 3 px/s² trong vật lý), mũi tên là chiều gió.
- 5 bản đồ chọn bằng thẻ preview hoặc danh sách trong bảng chuẩn bị; đổi bản đồ là trận mới: Đảo Gió Xanh, Thung Lũng Kẹo, Đêm Nấm Phát Sáng, Death Valley và Thiên Tinh. Mỗi map có background, texture đất, heightmap và vùng xuất phát riêng.
- Đội hình: mỗi đội 0 đến 3 người và 0 đến 3 bot, ít nhất 1 thành viên. Nhiều người chơi thay phiên trên cùng máy (hot-seat), thanh trạng thái ghi tên người đến lượt; bảng chọn nhân vật và vũ khí áp cho người đang có lượt. Trong đội, các thành viên còn sống luân phiên; hai đội xen kẽ. Bot bắn kẻ địch gần nhất. Đội thua khi mọi thành viên hết máu. Chưa có chơi online, cần server, ngoài phạm vi repo.
- Vị trí xuất phát ngẫu nhiên theo seed trong vùng an toàn riêng của từng map, cách nhau ít nhất 70 px và không đứng trên vực.
- Độ khó bot chọn trong bảng chuẩn bị: Dễ, Vừa, Khó, khác nhau ở độ lệch ngắm và mật độ tìm kiếm. Áp dụng từ lượt bot kế tiếp.
- Thêm `?seed=123` vào URL để trận lặp lại y hệt (gió, skin bot, độ lệch của bot), tiện tái hiện lỗi.
- Mỗi lượt 25 giây, hết giờ mất lượt. Tối đa 30 lượt, sau đó ai nhiều máu hơn thắng, bằng nhau thì hòa. Bot tự ngắm theo địa hình và gió, có độ lệch nhẹ.
- Bắn góc cao đạn bay khỏi khung hình; một mũi tên ở mép trên chỉ vị trí và độ cao của đạn.
- Đạn chịu trọng lực và gió; vụ nổ gây sát thương theo khoảng cách và khoét địa hình. Nổ trong 24 pixel quanh thân là trúng trực tiếp, sát thương tối đa; xa hơn giảm dần tới 0. Mỗi vũ khí có trọng lực, độ bám gió, bán kính hố và sát thương riêng.
- Hố đạn là nửa elip, rộng và sâu tùy vũ khí: cà rốt xuyên sâu, hạt dẻ nổ rộng. Từ độ sâu 540 trở xuống là lớp đá (dải tối), đạn chỉ khoét được 40% so với đất. Đất dưới chân bị khoét sâu hơn 40 pixel thì mất thêm máu theo độ sâu. Hết máu hoặc rơi khỏi nền sân đấu sẽ thua. Nút Trận mới khởi tạo lại toàn bộ trận.
- Hướng dẫn hoặc tab ẩn tạm dừng trận. Mất focus hủy giữ phím để tránh bắn ngoài ý muốn.

## Cấu trúc

- `src/physics.js`: vật lý bước cố định 120 Hz, địa hình dạng heightmap, sát thương và tìm góc cho bot.
- `src/match.js`: trạng thái và luật trận (lượt, timer, bắn, nổ, di chuyển, thắng thua, độ khó bot), không đụng DOM, có unit test. PRNG có seed để replay.
- `src/game.js`: input, render Canvas và HUD; chỉ đọc và ghi vào `Match`.
- `style.css`: giao diện desktop/mobile và bảng chọn trang bị.
- `src/assets.js`: danh mục 27 asset và cơ chế tải có fallback.
- `src/maps.js`: cấu hình 5 bản đồ, điểm xuất phát và heightmap riêng.
- `src/animation.js`: trạng thái, thời lượng khung hình và recoil độc lập với vật lý.
- `src/sprites.js`: vẽ sprite, lật hướng và cắt texture theo địa hình.
- `assets/`: 5 sprite nhân vật, 7 sprite vũ khí, 5 sprite sheet và 10 ảnh môi trường; xem `assets/README.md`.
- `tests/physics.test.js`: đối xứng quỹ đạo, gió, phá địa hình, sát thương, độ chính xác bot.

## Phạm vi v0.5

Đấu tập 1v1 với bot 3 mức khó trên 5 bản đồ: Đảo Gió Xanh, Thung Lũng Kẹo, Đêm Nấm Phát Sáng, Death Valley và Thiên Tinh. Mỗi map có background, vật liệu đất, điểm xuất phát và địa hình phá hủy riêng. Có 5 nhân vật và 7 vũ khí khác quỹ đạo, dải góc, hình hố và sát thương. Địa hình có lớp đá, sát thương rơi, di chuyển tốn năng lượng theo dốc, nhân vật nghiêng theo dốc. Tối đa 30 lượt. Mỗi nhân vật có 16 khung hình: đứng chờ, đi bộ, bắn và trúng đạn. Vũ khí có recoil/chớp nòng; vụ nổ có vòng xung kích. Animation dừng cùng trận và hỗ trợ prefers-reduced-motion. Chưa có PvP online, tài khoản, âm thanh, trang bị hay nâng cấp. Địa hình là heightmap nên có hố nhưng chưa có hang hoặc phần đất nhô độc lập. Không sử dụng mã nguồn, hình ảnh hoặc âm thanh của Gunny gốc.

## Kiểm tra giao diện (tùy chọn)

Cần Playwright và Chromium. Chạy server ở terminal riêng, rồi:

```sh
npm install --no-save playwright
npx playwright install chromium
node scripts/browser-smoke.cjs
```

Có thể đặt `GAME_URL`, `BROWSER_EXECUTABLE` và `SCREENSHOT_DIR`. Script kiểm tra chọn đủ nhân vật/vũ khí, giữ lựa chọn khi chơi lại, hố nổ trên texture, lượt người chơi/bot, tạm dừng, layout mobile và ảnh dự phòng khi tải lỗi.
