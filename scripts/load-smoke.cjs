const WebSocket = require("ws");

const clients = Number(process.env.CLIENTS || 30);
const url = process.env.GAME_WS || "ws://127.0.0.1:8080/ws";
const sockets = [];

Promise.all(Array.from({ length: clients }, (_, index) => new Promise((resolve, reject) => {
  const ws = new WebSocket(`${url}?name=Load${index}`);
  sockets.push(ws);
  ws.once("open", resolve);
  ws.once("error", reject);
}))).then(async () => {
  console.log(`connected ${clients} clients`);
  await new Promise((resolve) => setTimeout(resolve, 5000));
  sockets.forEach((ws) => ws.close());
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
