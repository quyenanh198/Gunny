# Kiến trúc Gunny · Chibi Arena

Tài liệu này mô tả kiến trúc hiện tại và kiến trúc mục tiêu. Mục tiêu được viết lại sau khi đối chiếu với Gunbound, xem `docs/gunbound-review.md`.

## 1. Ràng buộc

Kiến trúc phục vụ đúng bốn ràng buộc, mọi quyết định bên dưới đều quy về chúng:

1. **Một tiến trình Node trên Mac mini.** Không cụm máy chủ, không database, không hàng đợi. Vài chục người chơi, không phải vài nghìn.
2. **Không build step.** Trình duyệt nạp thẳng ES module. Ai cũng sửa được một file rồi tải lại trang.
3. **Luật trận là mã thuần.** Không DOM, không canvas, không ngẫu nhiên ngoài tầm kiểm soát. Nhờ vậy cùng một lớp luật chạy được trên server, trong test và trong chế độ luyện tập.
4. **Server là nguồn sự thật khi chơi online.** Client gửi ý định, nhận trạng thái. Không tin client.

## 2. Tầng

```
                    ┌─────────────────────────────────────────┐
   Nội dung         │ assets.js · maps.js                     │  dữ liệu thuần
                    └───────────────┬─────────────────────────┘
                                    │
                    ┌───────────────▼─────────────────────────┐
   Luật             │ physics.js · match.js · animation.js    │  không DOM, có test
                    └───────────────┬─────────────────────────┘
                                    │
            ┌───────────────────────┴───────────────────────┐
            │                                               │
  ┌─────────▼──────────┐                        ┌───────────▼───────────┐
  │ session.js         │  luyện tập, cùng máy   │ server/server.js      │  phòng, ghế,
  │ LocalSession       │                        │ Room + Match          │  vòng lặp 120 Hz
  └─────────┬──────────┘                        └───────────┬───────────┘
            │                                               │ snapshot 20 Hz (WebSocket)
            │                                   ┌───────────▼───────────┐
            │                                   │ net.js                │  OnlineSession
            │                                   │ RemoteMatch           │  + nội suy
            │                                   └───────────┬───────────┘
            └───────────────────────┬───────────────────────┘
                                    │  cùng một bề mặt phiên chơi
                    ┌───────────────▼─────────────────────────┐
   Trình bày        │ game.js · sprites.js · style.css        │  ba màn hình
                    └─────────────────────────────────────────┘
```

Quy tắc phụ thuộc: mũi tên chỉ đi xuống. `match.js` không biết `game.js` tồn tại. `game.js` không biết mình đang chơi online hay ngoại tuyến.

## 3. Module hiện tại

| Module | Dòng | Trách nhiệm | Được test bởi |
|---|---|---|---|
| `src/physics.js` | 35 | Quỹ đạo, gió, va chạm, hố nổ, sát thương, độ dốc, chi phí di chuyển, tìm góc cho bot | `physics.test.js` |
| `src/maps.js` | 100 | 5 sân đấu: heightmap, art, vùng xuất phát, mô tả | `maps.test.js` |
| `src/assets.js` | 118 | Danh mục nhân vật, vũ khí, môi trường; loader có fallback | `assets.test.js` |
| `src/animation.js` | 59 | Trạng thái khung hình, recoil; thuần hình ảnh | `animation.test.js` |
| `src/match.js` | 469 | Toàn bộ luật một trận: actor, lượt, bắn, nổ, di chuyển, thắng thua, bot | `match.test.js` |
| `src/session.js` | 73 | `LocalSession`: phòng chờ và trận cục bộ | `session.test.js` |
| `src/net.js` | 240 | `OnlineSession` + `RemoteMatch`: bản sao trạng thái, nội suy giữa snapshot | gián tiếp |
| `server/server.js` | 385 | HTTP tĩnh, `/api/rooms`, `/healthz`, WebSocket, `Room` | `server.test.js` |
| `src/sprites.js` | 154 | Vẽ nhân vật, vũ khí, lớp địa hình | smoke test |
| `src/game.js` | 671 | Ba màn hình, input, render, HUD | smoke test |

## 4. Vòng đời

```
  Sảnh ──tạo/vào phòng──▶ Phòng chờ ──host bấm Bắt đầu──▶ Trận đấu
   ▲                          ▲                               │
   └──────rời phòng───────────┴───────về phòng chờ────────────┘
```

Trong trận, `Match` là một máy trạng thái bốn pha:

```
  aim ──bắn──▶ flight ──nổ hoặc ra ngoài──▶ settle ──▶ aim (lượt kế)
   │                                            │
   └──hết giờ──▶ (lượt kế)                      └──hết đội──▶ over
```

## 5. Mô hình dữ liệu

**Actor** là đơn vị chiến đấu, không phân biệt người hay bot:

```js
{ team, control: "human" | "bot", player, name, skin, weapon,
  x, y, hp, angle, hurt, walking, animation }
```

**Match** giữ: `terrain` (mảng 1200 cao độ), `actors`, `turn`, `round`, `wind`, `time`, `energy`, `phase`, `projectile`, và các mảng hiệu ứng. `roster` là đầu vào từ phòng chờ, quyết định ai vào đội nào với nhân vật và vũ khí gì.

**Room** trên server giữ: danh sách client (tên, phe, cờ sẵn sàng, loadout), cấu hình (map, độ khó, số bot), và một `Match` khi đang chơi.

## 6. Giao thức

Client gửi ý định, không gửi kết quả:

| Bản tin | Khi nào | Server kiểm tra |
|---|---|---|
| `team`, `ready`, `loadout` | Phòng chờ | Trạng thái phòng, id hợp lệ |
| `setup`, `start`, `restart`, `lobby` | Phòng chờ hoặc kết trận | Phải là chủ phòng |
| `keys`, `aim`, `charge`, `release`, `cancel` | Trong trận | Phải đúng lượt của chính người gửi |

Server gửi một loại bản tin duy nhất, `room`, 20 lần mỗi giây: trạng thái phòng, và khi đang chơi thì kèm trạng thái trận. Địa hình chỉ gửi khi đổi, đánh dấu bằng `terrainVersion`, mã hoá số nguyên nhân 10.

Client nội suy giữa hai snapshot bằng chính `physics.step`, nên đạn bay mượt 60 khung hình dù mạng chỉ cập nhật 20 lần.

## 7. Thời gian và tính xác định

- Vật lý chạy bước cố định 120 Hz qua accumulator. Khung hình không ảnh hưởng kết quả.
- `Match` nhận `seed`; `mulberry32` sinh gió, vị trí xuất phát, độ lệch của bot. Cùng seed cho cùng trận.
- Hiệu ứng (particle, rung, trail) dùng `Math.random` tự do vì không ảnh hưởng luật.
- Animation tiến theo cùng bước cố định, nên tạm dừng là đóng băng cả trận lẫn hình.

## 7b. Hợp đồng bố cục

Màn trận đấu là ứng dụng, không phải trang nội dung, nên nó khóa theo viewport:

- `body[data-screen="game"]` cao đúng `100dvh`, `overflow: hidden`. Sảnh và phòng chờ vẫn cuộn bình thường vì chúng là trang nội dung.
- Chiều dọc chia làm ba: header, `.stage` co giãn, `.controls` cao tự nhiên. Chỉ `.stage` nhận phần còn lại.
- Khung tranh `.frame` giữ đúng tỉ lệ 1200x620 và lớn nhất có thể trong `.stage`.

Kích thước khung do JavaScript tính, không do CSS. Lý do: yêu cầu "lớn nhất có thể mà vẫn đúng tỉ lệ" tạo phụ thuộc vòng trong CSS, vì bề rộng khung phụ thuộc chiều cao còn lại, mà chiều cao còn lại lại phụ thuộc bề rộng của chính nó qua `fit-content`. Đã thử `aspect-ratio` trên khung và để canvas tự co như ảnh; cả hai cho khung 1200x856, tức là ảnh bị kéo giãn 1,4 thay vì 1,94.

```js
// game.js
function fitStage()   // scale = min(rộngKhả dụng / 1200, caoKhả dụng / 620)
new ResizeObserver(fitStage).observe(stage);
```

Quan sát `.stage` chứ không nghe `resize` của cửa sổ, vì thanh điều khiển có thể xuống dòng và đổi phần chỗ còn lại sau khi `resize` đã bắn. Mọi lớp phủ HUD đặt trong `.frame` nên luôn dính đúng mép tranh; bảng điểm nằm ngoài khung, đè lên tranh trên màn rộng và xếp phía trên tranh trên điện thoại.

Số đo sau khi làm, không màn hình nào phải cuộn:

| Màn hình | Canvas trước | Canvas sau | Cuộn trước |
|---|---|---|---|
| 1920x1080 | 633 px | 665 px | 205 px |
| 1440x900 | 633 px | 665 px | 385 px |
| 1366x768 | 633 px | 544 px | 517 px |
| Điện thoại dọc 390x844 | 187 px | 191 px | 301 px |
| Điện thoại ngang 844x390 | 388 px | 244 px | 751 px |

Smoke test kiểm tra lại ở bốn kích thước: không cuộn dọc, không tràn ngang, tỉ lệ khung lệch dưới 2%, và toàn bộ khung nằm trong viewport.

## 8. Nợ kiến trúc

Ba món, xếp theo mức cản trở:

1. **`match.js` gánh quá nhiều.** Luật lượt, vật lý đạn, hiệu ứng, bot và thắng thua nằm chung một class 469 dòng. Thêm delay hay item sẽ đẩy nó lên 700 dòng.
2. **Nội dung trộn với cơ chế.** `assets.js` vừa là danh mục ảnh vừa là bảng cân bằng vũ khí. Thêm bộ ba vũ khí cho từng nhân vật sẽ làm file này khó đọc.
3. **`game.js` 671 dòng.** Ba màn hình, input, render và HUD trong một file. Chưa gây lỗi, nhưng mỗi màn hình mới sẽ cộng thêm.

## 9. Kiến trúc mục tiêu

Thay đổi nhỏ về hình dạng, đủ chỗ cho những gì `docs/gunbound-review.md` đề xuất.

```
src/
  content/            dữ liệu thuần, không logic
    characters.js     nhân vật + bộ ba vũ khí (S1, S2, SS)
    weapons.js        đạn: quỹ đạo, hố nổ, sát thương, delay
    items.js          item tiêu hao: ô, delay, hiệu ứng
    maps.js           sân đấu
  core/               luật thuần, có test
    physics.js        không đổi
    turn-queue.js     MỚI: thứ tự lượt theo delay
    combat.js         TÁCH RA: bắn, nổ, sát thương, hố
    match.js          điều phối: pha, actor, thắng thua
    bot.js            TÁCH RA: tìm nước đi, có tính delay
  play/
    session.js        LocalSession
    net.js            OnlineSession + RemoteMatch
  ui/
    screens/          home, room, battle
    render.js         canvas
    hud.js            HUD, hàng đợi lượt
```

### 9.1 Seam cho thứ tự lượt theo delay

`TurnQueue` là module thuần, không biết gì về actor:

```js
// turn-queue.js
export function nextActor(entries) // entries: [{id, delay}] → id có delay nhỏ nhất
export function addDelay(entries, id, amount)
export function tickThinking(entries, id, dt, perSecond = 10)
```

`Match` giữ một `TurnQueue` thay cho `turn` và `cursor`. Mỗi lần bắn cộng delay của vũ khí, mỗi item cộng delay của item, mỗi giây suy nghĩ cộng `perSecond`. Luật thắng theo số lượt đổi sang giới hạn thời gian trận.

Điểm quan trọng cho online: delay phụ thuộc thời gian suy nghĩ, nên chỉ server được cộng. Client chỉ hiển thị. Kiến trúc hiện tại đã đặt đồng hồ ở server nên không phải đổi giao thức, chỉ thêm `queue` vào snapshot.

### 9.2 Seam cho bộ ba vũ khí

`content/characters.js` khai báo:

```js
{ id: "mochi", name: "Mochi", shots: { s1: "carrot", s2: "carrot-burst", ss: "carrot-rain" }, ssCharge: "damage-taken" }
```

`content/weapons.js` giữ tham số đạn như hiện nay, cộng thêm `delay` và `shots` (số viên). `Actor` thêm `shot: "s1" | "s2" | "ss"` và `ssReady`. HUD đổi từ kho sáu vũ khí sang ba nút vũ khí của chính nhân vật mình.

### 9.3 Seam cho item

```js
// match.js
useItem(id)   // trừ ô, cộng delay, đặt cờ hiệu lực cho phát bắn kế tiếp
```

Hiệu lực áp trong `combat.fire`, không rải khắp nơi: nhân sát thương, nhân bán kính hố, số phát bắn, hoặc dịch chuyển sau khi đạn rơi.

### 9.4 Bot phải biết delay

`bot.js` đổi hàm chi phí từ "sai số điểm rơi" sang:

```
cost = khoảngCáchTớiMụcTiêu + w * delayCủaHànhĐộng
```

`w` theo mức khó: bot Dễ bỏ qua delay, bot Khó cân nhắc.

## 10. Chuyển đổi theo giai đoạn

Lộ trình đầy đủ cho bản online nằm ở `ONLINE_GAME_ROADMAP.md`, bàn giao từng bước ở `docs/handoff/`. Bảng dưới là phần kiến trúc của lộ trình đó, tương ứng mốc M1 và M5.

Mỗi giai đoạn giữ game chơi được, test xanh, và có thể dừng lại ở đó.

| Giai đoạn | Nội dung | Rủi ro |
|---|---|---|
| A | Tách `content/` và `bot.js` ra khỏi `match.js` và `assets.js`. Không đổi hành vi | Thấp, test hiện có bảo vệ |
| B | `TurnQueue` và hàng đợi lượt trên HUD. Đồng hồ cộng delay. Đổi luật thắng | Trung bình, phải sửa test luật lượt |
| C | Bộ ba vũ khí cho từng nhân vật, SS có nạp | Trung bình, cần asset đạn mới |
| D | Ba đến bốn item | Thấp |
| E | Tách `ui/` thành màn hình riêng | Thấp, thuần cơ học |

Thứ tự này đặt việc rủi ro nhất (B) sau khi đã có chỗ đứng sạch (A), và trước khi thêm nội dung (C, D) để nội dung mới sinh ra đã hợp với hệ delay.
