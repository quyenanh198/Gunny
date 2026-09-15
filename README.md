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

Có thể đưa toàn bộ repo lên static hosting (GitHub Pages, Cloudflare Pages hoặc Nginx). Không có bước build, đường dẫn tương đối hỗ trợ subdirectory. Font Google là tùy chọn, có font hệ thống dự phòng.

## Cách chơi

- A/D hoặc nút trái/phải: di chuyển, tối đa 60 pixel mỗi lượt.
- ↑/↓ hoặc thanh trượt: góc 10–170°. 45° hướng phải, 135° hướng trái.
- Giữ SPACE hoặc nút BẮN để tăng lực, thả để bắn. Lực tối đa được giữ ở 100%.
- Mỗi lượt 25 giây. Bot tự ngắm theo địa hình và gió, có độ lệch nhẹ.
- Đạn chịu trọng lực và gió; vụ nổ gây sát thương theo khoảng cách và khoét địa hình.
- Hết máu hoặc rơi khỏi nền sân đấu sẽ thua. Nút Trận mới khởi tạo lại toàn bộ trận.
- Hướng dẫn hoặc tab ẩn tạm dừng trận. Mất focus hủy giữ phím để tránh bắn ngoài ý muốn.

## Cấu trúc

- `src/physics.js`: vật lý bước cố định 120 Hz, địa hình dạng heightmap, sát thương và tìm góc cho bot.
- `src/game.js`: trạng thái trận, input, render Canvas; HUD là HTML dễ tương tác bằng bàn phím.
- `style.css`: giao diện desktop/mobile và bảng chọn trang bị.
- `src/assets.js`: danh mục 16 asset và cơ chế tải có fallback.
- `src/animation.js`: trạng thái, thời lượng khung hình và recoil độc lập với vật lý.
- `src/sprites.js`: vẽ sprite, lật hướng và cắt texture theo địa hình.
- `assets/`: 4 sprite nhân vật, 6 sprite vũ khí, 2 ảnh môi trường; xem `assets/README.md`.
- `tests/physics.test.js`: đối xứng quỹ đạo, gió, phá địa hình, sát thương, độ chính xác bot.

## Phạm vi v0.3

Đấu tập 1v1 với bot, một bản đồ, 4 nhân vật và 6 diện mạo vũ khí có thể chọn. Sprite PNG riêng, background và texture sân đấu WebP. Các vũ khí cùng chỉ số. Mỗi nhân vật có 16 khung hình: đứng chờ, đi bộ, bắn và trúng đạn. Vũ khí có recoil/chớp nòng; vụ nổ có vòng xung kích. Animation dừng cùng trận và hỗ trợ prefers-reduced-motion. Chưa có PvP online, tài khoản, âm thanh, trang bị hay nâng cấp. Địa hình là heightmap nên có hố nhưng chưa có hang hoặc phần đất nhô độc lập. Không sử dụng mã nguồn, hình ảnh hoặc âm thanh của Gunny gốc.

## Kiểm tra giao diện (tùy chọn)

Cần Playwright và Chromium. Chạy server ở terminal riêng, rồi:

```sh
npm install --no-save playwright
npx playwright install chromium
node scripts/browser-smoke.cjs
```

Có thể đặt `GAME_URL`, `BROWSER_EXECUTABLE` và `SCREENSHOT_DIR`. Script kiểm tra chọn đủ nhân vật/vũ khí, giữ lựa chọn khi chơi lại, hố nổ trên texture, lượt người chơi/bot, tạm dừng, layout mobile và ảnh dự phòng khi tải lỗi.
