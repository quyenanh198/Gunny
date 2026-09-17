const WebSocket = require("ws");

const clients = Number(process.env.CLIENTS || 30);
const url = process.env.GAME_WS || "ws://127.0.0.1:8080/ws";
const durationMs = Number(process.env.DURATION_MS || 5000);
const metricsUrl = process.env.METRICS_URL || url.replace(/^ws/, "http").replace(/\/ws(?:\?.*)?$/, "/metrics");
const sockets = [];
const startedAt = Date.now();
let initialMetrics;

async function metrics() {
  const response = await fetch(metricsUrl);
  if (!response.ok) throw new Error(`metrics returned ${response.status}`);
  return Object.fromEntries((await response.text()).trim().split("\n").filter(Boolean).map((line) => {
    const [name, value] = line.split(/\s+/);
    return [name, Number(value)];
  }));
}

metrics().then((value) => {
  initialMetrics = value;
  return Promise.all(Array.from({ length: clients }, (_, index) => new Promise((resolve, reject) => {
  const ws = new WebSocket(`${url}?mode=create&visibility=private&name=Load${index}`);
  sockets.push(ws);
  ws.once("open", resolve);
  ws.once("error", reject);
})));
}).then(async () => {
  const connectedMs = Date.now() - startedAt;
  await new Promise((resolve) => setTimeout(resolve, durationMs));
  const finalMetrics = await metrics();
  const report = {
    clients,
    connectedMs,
    durationMs,
    capturedAt: new Date().toISOString(),
    snapshotBytesPerSecond: Math.round(
      ((finalMetrics.gunny_snapshot_bytes || 0) - (initialMetrics.gunny_snapshot_bytes || 0)) / (durationMs / 1000),
    ),
    metrics: finalMetrics,
  };
  console.log(JSON.stringify(report, null, 2));
  sockets.forEach((ws) => ws.close());
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
