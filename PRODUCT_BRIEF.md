# Product brief — Gunny Webgame Online

Trạng thái: working contract cho R0. Các mặc định dưới đây được dùng để triển khai cho tới khi chủ dự án thay đổi bằng một decision record.

## Người chơi và thị trường

- Thị trường đầu tiên: Việt Nam; ngôn ngữ đầu tiên: tiếng Việt.
- Nhóm chính: người chơi từ 13 tuổi, thích trận chiến thuật ngắn trên browser và chơi cùng bạn bè.
- Thiết bị: desktop browser là baseline; iOS Safari và Android Chrome là first-class clients.
- IP: art, nhân vật, tên vật phẩm và lore phải nguyên bản. Tên phát hành chính thức được chốt là "Gunny".

## Core promise

“Vào trận trong dưới một phút, dùng góc/lực/gió/địa hình để thắng một trận công bằng kéo dài khoảng 5–8 phút.”

## Beta slice

- Mode chính: 1v1; phòng riêng hỗ trợ 1v1 trước, 2v2/3v3 giữ ở trạng thái thử nghiệm.
- Ba nhân vật, ba map và bộ S1/S2/SS tối thiểu đã qua balance gate.
- Guest chơi ngay; link account để đồng bộ đa thiết bị. Không buộc đăng ký trước trận đầu.
- Flow: home → guest/account → quick match hoặc private room → battle → result settlement → profile.
- Progression beta: account level và cosmetic unlock. Competitive PvP không bán combat power.
- Social beta: party/invite tối thiểu, mute/block/report; chưa có guild.

## Không thuộc beta slice

- Guild, auction, ranked season, battle pass trả phí, shop gacha và PvE campaign.
- Native mobile app, voice chat và user-generated content.
- Microservice/Kubernetes nếu modular monolith vẫn đạt capacity.

## Success metrics

- Người mới vào trận hợp lệ trong dưới 60 giây ở p75.
- ≥95% trận bắt đầu có outcome hợp lệ.
- Reconnect thành công ≥95% trong cửa sổ hỗ trợ.
- Match duration median 5–8 phút; queue p95 dưới 90 giây trong giờ có đủ người.
- Crash/error-free sessions ≥99%; không có severity-1 security issue mở.

## Capacity contract ban đầu

- Closed alpha: 20–50 người được mời.
- Beta target đầu: 100 concurrent players / 50 trận 1v1.
- Chỉ nâng target sau benchmark CPU, heap, event-loop lag, snapshot bandwidth và database latency.

## Fairness và monetization

- Server authoritative; client không quyết định hit, damage, reward hoặc currency.
- Cosmetic-first. Nếu thêm monetization, mọi PvP player có cùng trần sức mạnh.
- Odds, refund, age/privacy và payment compliance phải được duyệt trước khi mở giao dịch.

## Decision log

| Ngày | Quyết định | Trạng thái |
|---|---|---|
| 2026-09-17 | 1v1 là mode beta chính; 2v2/3v3 là experimental | Working default |
| 2026-09-17 | Guest-first, account linking cho cross-device | Working default |
| 2026-09-17 | Cosmetic-only power policy cho competitive PvP | Working default |
| 2026-09-17 | 100 CCU là capacity target đầu, không phải cam kết launch | Working default |
| 2026-09-18 | Tên phát hành chính thức là "Gunny" (quyết định của chủ dự án) | Đã duyệt |
