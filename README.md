# Gunny · Chibi Arena

Webgame bắn tọa độ theo lượt, lấy cảm hứng từ Gunny, với sprite chibi nền trong suốt và đồ họa riêng, hiển thị bằng Canvas. Giao diện tiếng Việt, responsive. Chơi offline không cần backend; chơi online qua một server Node nhỏ tự host, không cần tài khoản.

## Chạy

Cần Node.js 20+ để chạy server và kiểm tra.

```sh
npm install        # cài gói ws cho server
npm start          # chạy game, mở http://localhost:8080
npm test
npm run check
```

Smoke test trình duyệt: cài Playwright rồi chạy `BROWSER_EXECUTABLE=/path/to/chromium node scripts/browser-smoke.cjs` với server dev đang chạy.

Có thể đưa toàn bộ repo lên static hosting (GitHub Pages, Cloudflare Pages hoặc Nginx) nếu chỉ cần chế độ luyện tập; PvP online cần chạy `server/server.js`. Không có bước build, đường dẫn tương đối hỗ trợ subdirectory. Font Google là tùy chọn, có font hệ thống dự phòng.

## Ba màn hình

Game chạy trên một server Node nhỏ, không còn là trang tĩnh. Luồng chơi giống một game online hoàn chỉnh:

1. **Sảnh chờ**: nhập tên, xem danh sách phòng đang mở, vào phòng bằng mã, tạo phòng mới, hoặc luyện tập với bot.
2. **Phòng chờ**: chọn phe (Đội 1, Đội 2 hoặc khán giả), chọn nhân vật và vũ khí, bấm Sẵn sàng. Chủ phòng chỉnh bản đồ, độ khó, số bot mỗi đội rồi bấm Bắt đầu trận. Link mời nằm sẵn trong phòng.
3. **Trận đấu**: sân đấu, bảng điều khiển và kho vũ khí đổi được trong lượt của mình. Hết trận có bảng kết quả: Chơi lại hoặc Về phòng chờ.

Luyện tập với bot dùng chung màn phòng chờ nên chỉ có một giao diện cho cả hai chế độ; khác biệt duy nhất là không có link mời và không cần Sẵn sàng.

## Chơi online và host trên Mac mini

`server/server.js` vừa serve file tĩnh vừa giữ trạng thái phòng: danh sách người chơi, phe, cờ sẵn sàng, cấu hình trận, và khi vào trận thì chạy `Match` theo bước cố định, gửi snapshot 20 lần mỗi giây qua WebSocket tại `/ws`. `GET /api/rooms` trả danh sách phòng cho màn sảnh. Không database, không tài khoản; phòng trống 60 giây thì tự xóa.

- Người vào phòng được xếp vào phe ít người hơn; có thể đổi phe hoặc chuyển sang khán giả trong phòng chờ.
- Chủ phòng là người vào đầu tiên, rời phòng thì quyền chuyển cho người kế tiếp. Chỉ chủ phòng chỉnh cấu hình, bắt đầu, chơi lại và đưa cả phòng về phòng chờ.
- Ghế của người đã thoát sẽ tự bỏ lượt sau 1,5 giây để trận không treo.
- Bot chạy trên server nên mọi người thấy cùng một kết quả.
- Mở link mời trên máy khác sẽ về màn sảnh với mã phòng điền sẵn để nhập tên; lần sau tên được nhớ nên vào thẳng phòng.

Cài trên Mac mini (macOS, Node 20 trở lên, ví dụ `brew install node`):

```sh
git clone https://github.com/quyenanh198/Gunny.git ~/Gunny
cd ~/Gunny && npm install
PORT=8080 npm start
# trong mạng LAN: http://<tên-máy>.local:8080 hoặc http://<IP-LAN>:8080
```

Chạy nền và tự khởi động cùng máy bằng launchd: sửa `WorkingDirectory` và đường dẫn `node` (`which node`) trong `deploy/com.gunny.server.plist`, rồi:

```sh
cp deploy/com.gunny.server.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.gunny.server.plist
launchctl list | grep gunny      # kiểm tra
tail -f /tmp/gunny-server.log
```

Chạy bằng Docker (ảnh chạy Node, tự serve file tĩnh, có `/healthz`):

```sh
docker build -t gunny .
docker run -p 8080:8080 gunny
```

Vận hành production, rollback, metrics và load smoke được ghi tại `docs/operations.md`.

Reverse proxy đứng trước phải chuyển tiếp WebSocket upgrade trên `/ws`, nếu không chỉ chơi được chế độ luyện tập.

### Viết style ở đâu

CSP của game (`server/server.js`) khai báo `style-src 'self'` — **không** có
`'unsafe-inline'` — nên mọi `style="..."` viết thẳng vào thẻ HTML đều bị trình duyệt
bỏ: thẻ vẫn hiện nhưng trơ, mất nền, không giãn, và không có lỗi nào ném ra cho người
chơi thấy. Dùng class trong `style.css`. `tests/inline-style.test.js` canh việc này.

### Tiến trình MMO lưu ở đâu

Thú cưng, cường hoá vũ khí, ngọc, pháo đài và số lần phá hầm ngục nằm trong bảng
`mmo_profiles` (một khối JSON mỗi người chơi, migration 008). Có `DATABASE_URL` thì
`MmoStore` nạp hồ sơ từ đó trước mỗi thao tác và ghi lại sau — khởi động lại hay
deploy không mất đồ. Không có `DATABASE_URL` (chạy tay để thử) thì hồ sơ chỉ nằm
trong RAM và mất khi tắt, như trước.

### Gắn vào Chat (mượn đăng nhập sẵn có)

Game chạy được ở hai chỗ cùng lúc: `gunny.lazybutts.com/` (khách, tự đặt tên) và
`chat.lazybutts.com/gunny/` (lấy luôn người đang đăng nhập ở Chat).

- Reverse proxy **cắt tiền tố** `/gunny` trước khi chuyển vào server (Caddy:
  `handle_path /gunny/*`), nên server không cần biết mình nằm ở đâu. Phía client mọi
  URL dựng từ `document.baseURI` (`src/base-url.js`), chạy đúng ở cả hai chỗ — đừng
  viết lại thành `fetch("/api/...")`.
- Đặt `CHAT_API_URL` (ví dụ `http://chat:8082`) để bật `POST /api/sessions/chat`:
  server chuyển cookie `lb_session` sang `GET /api/me` của Chat, Chat bảo ai thì người
  đó là người chơi. Không có secret dùng chung. Thiếu biến này thì endpoint trả 404 và
  client tự lùi về phiên khách.
- Lần đầu một người Chat vào chơi thì tạo user mới lấy tên hiển thị bên Chat; những
  lần sau nhận lại đúng user đó (`users.provider`/`external_id`), nên ví vàng và cấp độ
  đi theo người. Đổi tên trong Gunny sau đó **không** bị Chat ghi đè.
- `BASE_PATH=/gunny` chỉ để bó cookie `gunny_session` trong nhánh đó, khỏi gửi kèm mọi
  request sang Chat. `ALLOWED_ORIGINS` phải liệt kê cả hai origin.


Chơi từ ngoài mạng nhà: cách an toàn nhất là Tailscale trên Mac mini và máy khách, dùng địa chỉ Tailscale của Mac mini. Nếu mở port trên router thì đặt server sau một reverse proxy có HTTPS (ví dụ Caddy với `reverse_proxy localhost:8080`), vì WebSocket trên trang HTTPS phải là `wss://`, client tự đổi theo `location.protocol`.

## Cách chơi

- A/D hoặc nút trái/phải: di chuyển. Mỗi lượt có 100 năng lượng, đi ngang hoặc xuống dốc tốn 1 mỗi pixel, lên dốc tốn thêm 2 lần độ dốc (tan), dốc quá 45° không leo được. Đứng trong hố sâu thì phải bắn ra chứ không trèo được.
- ↑/↓, thanh trượt hoặc nút ±0,5°/±1°: góc 10–170°. 45° hướng phải, 135° hướng trái. Mỗi vũ khí có dải góc riêng (cối hạt dẻ chỉ 45–85°); kéo vào vùng cấm quanh 90° sẽ nhảy sang hướng ngược lại. Đứng trên dốc thì góc thật cộng thêm độ dốc (tối đa 20°), HUD hiển thị phần cộng thêm; góc thật không bao giờ vượt qua 90° sang hướng ngược lại.
- Giữ SPACE hoặc nút BẮN để tăng lực, thả để bắn. Lực tối đa được giữ ở 100%.
- Gió hiển thị theo cấp 0 đến 10 (mỗi cấp 3 px/s² trong vật lý), mũi tên là chiều gió.
- 5 bản đồ chọn bằng thẻ preview trong phòng chờ, đổi bản đồ là trận mới: Đảo Gió Xanh, Thung Lũng Kẹo, Đêm Nấm Phát Sáng, Death Valley và Thiên Tinh. Mỗi map có background, texture đất, heightmap và vùng xuất phát riêng.
- Đội hình: mỗi đội 0 đến 3 người và 0 đến 3 bot, ít nhất 1 thành viên. Thanh trạng thái ghi tên người đến lượt; kho vũ khí áp cho người đang có lượt. Trong đội, các thành viên còn sống luân phiên; hai đội xen kẽ. Bot bắn kẻ địch gần nhất. Đội thua khi mọi thành viên hết máu.
- Vị trí xuất phát ngẫu nhiên theo seed trong vùng an toàn riêng của từng map, cách nhau ít nhất 70 px và không đứng trên vực.
- Độ khó bot chọn trong bảng chuẩn bị: Dễ, Vừa, Khó, khác nhau ở độ lệch ngắm và mật độ tìm kiếm. Áp dụng từ lượt bot kế tiếp.
- Thêm `?seed=123` vào URL để trận lặp lại y hệt (gió, skin bot, độ lệch của bot), tiện tái hiện lỗi.
- Mỗi lượt 25 giây, hết giờ mất lượt. Tối đa 30 lượt, sau đó ai nhiều máu hơn thắng, bằng nhau thì hòa. Bot tự ngắm theo địa hình và gió, có độ lệch nhẹ.
- Thứ tự lượt dùng delay: thời gian suy nghĩ, S2/SS và item làm lượt kế đến chậm hơn, nên đòn nhanh có thể tạo hai lượt liên tiếp. S1 là đòn chuẩn; S2 mạnh hơn; SS cần thanh SS đầy. Item gồm Power Up, Blood, Teleport và Dual.
- Bắn góc cao đạn bay khỏi khung hình; một mũi tên ở mép trên chỉ vị trí và độ cao của đạn.
- Đạn chịu trọng lực và gió; vụ nổ gây sát thương theo khoảng cách và khoét địa hình. Nổ trong 24 pixel quanh thân là trúng trực tiếp, sát thương tối đa; xa hơn giảm dần tới 0. Mỗi vũ khí có trọng lực, độ bám gió, bán kính hố và sát thương riêng.
- Hố đạn là nửa elip, rộng và sâu tùy vũ khí: cà rốt xuyên sâu, hạt dẻ nổ rộng. Từ độ sâu 540 trở xuống là lớp đá (dải tối), đạn chỉ khoét được 40% so với đất. Đất dưới chân bị khoét sâu hơn 40 pixel thì mất thêm máu theo độ sâu. Hết máu hoặc rơi khỏi nền sân đấu sẽ thua. Nút Trận mới khởi tạo lại toàn bộ trận.
- Hướng dẫn hoặc tab ẩn tạm dừng trận. Mất focus hủy giữ phím để tránh bắn ngoài ý muốn.

## Cấu trúc

- `src/physics.js`: vật lý bước cố định 120 Hz, địa hình dạng heightmap, sát thương và tìm góc cho bot.
- `src/match.js` và `src/core/`: trạng thái trận cùng luật thuần cho combat, delay queue, S1/S2/SS, item, bot và thống kê; không đụng DOM, có unit test. PRNG có seed để replay.
- `src/game.js` và `src/ui/`: điều hướng ba màn hình, input adapters, render Canvas, HUD và responsive sizing; chỉ đọc và ghi vào phiên chơi.
- `src/session.js`: `LocalSession`, phiên luyện tập với bot, cùng giao diện với phiên online.
- `src/net.js`: `OnlineSession` và `RemoteMatch`, bản sao phòng và trận từ server, tự nội suy đạn và hiệu ứng giữa hai snapshot.
- `server/server.js`, `server/room-manager.js`, `server/room.js`: bootstrap Node, quản lý phòng, ghế, WebSocket và file tĩnh. `deploy/com.gunny.server.plist` cho launchd.
- `style.css`: giao diện desktop/mobile và bảng chọn trang bị.
- `src/content/`: danh mục 27 asset, cơ chế tải có fallback và cấu hình 5 bản đồ; `src/assets.js`/`src/maps.js` giữ import tương thích.
- `src/animation.js`: trạng thái, thời lượng khung hình và recoil độc lập với vật lý.
- `src/sprites.js`: vẽ sprite, lật hướng và cắt texture theo địa hình.
- `assets/`: 5 sprite nhân vật, 7 sprite vũ khí, 5 sprite sheet và 10 ảnh môi trường; xem `assets/README.md`.
- `tests/physics.test.js`: đối xứng quỹ đạo, gió, phá địa hình, sát thương, độ chính xác bot.
- `tests/match.test.js`, `tests/session.test.js`, `tests/server.test.js`: luật trận, đội hình, phiên luyện tập, phòng online, quyền chủ phòng.

## Phạm vi v0.5

Đấu tập với bot 3 mức khó hoặc PvP online tự host trên 5 bản đồ: Đảo Gió Xanh, Thung Lũng Kẹo, Đêm Nấm Phát Sáng, Death Valley và Thiên Tinh. Mỗi map có background, vật liệu đất, điểm xuất phát và địa hình phá hủy riêng. Có 5 nhân vật và 7 vũ khí khác quỹ đạo, dải góc, hình hố và sát thương. Địa hình có lớp đá, sát thương rơi, di chuyển tốn năng lượng theo dốc, nhân vật nghiêng theo dốc. Tối đa 30 lượt. Mỗi nhân vật có 16 khung hình: đứng chờ, đi bộ, bắn và trúng đạn. Vũ khí có recoil/chớp nòng; vụ nổ có vòng xung kích. Animation dừng cùng trận và hỗ trợ prefers-reduced-motion. PvP online có protocol version, validation và reconnect giữ ghế 30 giây; chưa có tài khoản, âm thanh, trang bị hay nâng cấp. Địa hình là heightmap nên có hố nhưng chưa có hang hoặc phần đất nhô độc lập. Không sử dụng mã nguồn, hình ảnh hoặc âm thanh của Gunny gốc.

## Kiểm tra giao diện (tùy chọn)

Cần Playwright và Chromium. Chạy server ở terminal riêng, rồi:

```sh
npm install --no-save playwright
npx playwright install chromium
node scripts/browser-smoke.cjs
```

Có thể đặt `GAME_URL`, `BROWSER_EXECUTABLE` và `SCREENSHOT_DIR`. Script kiểm tra chọn đủ nhân vật/vũ khí, giữ lựa chọn khi chơi lại, hố nổ trên texture, lượt người chơi/bot, tạm dừng, layout mobile và ảnh dự phòng khi tải lỗi.
