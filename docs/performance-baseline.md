# Performance baseline

Baseline đầu tiên cho R0, đo ngày 2026-09-17 trên Windows, Node 24.19.0. Đây là số development để phát hiện regression, không phải capacity claim cho production.

## Cách chạy

Terminal 1:

```powershell
npm start
```

Terminal 2:

```powershell
$env:CLIENTS = "30"
$env:DURATION_MS = "5000"
npm run benchmark:load
```

CI chạy cùng workload trên Ubuntu/Node 22 và lưu artifact `r0-load-baseline` trong 30 ngày.

## Kết quả local 30 client

| Chỉ số | Giá trị |
|---|---:|
| Kết nối đủ 30 client | 73 ms |
| Thời gian lấy mẫu | 5.000 ms |
| Room/client | 30 / 30 |
| Tick drift p50 | 9,33 ms |
| Tick drift p95 | 12,33 ms |
| Tick drift p99 | 23,33 ms |
| Tick drift max | 25,33 ms |
| Snapshot throughput | 263.606 bytes/s |
| Heap used cuối mẫu | 10.044.288 bytes |
| Rejected message | 0 |

## Cách đọc

- Workload hiện mở 30 room, mỗi room một client; nó đo overhead room/snapshot chứ chưa mô phỏng trận 1v1 đang bắn.
- p95 dưới budget 16 ms ở mẫu local này, nhưng p99 vượt 16 ms. Chưa được suy ra Mac mini hoặc production sẽ đạt SLO.
- Snapshot throughput tương đương khoảng 8,8 KB/s/client trong lobby. Battle state và terrain resync có thể cao hơn đáng kể.
- R1 phải bổ sung slow-consumer/backpressure và chaos workload; R7 mới chốt capacity chính thức.
