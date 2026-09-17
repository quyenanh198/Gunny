import { spawn } from "node:child_process";

const port = Number(process.env.VERIFY_PORT || 5173);
const baseUrl = `http://127.0.0.1:${port}`;

function run(command, args, environment = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: { ...process.env, ...environment },
    });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

async function waitForServer() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`server did not become healthy at ${baseUrl}`);
}

await run(process.execPath, ["scripts/check-syntax.mjs"]);
await run(process.execPath, ["--test"]);

const server = spawn(process.execPath, ["server/server.js"], {
  stdio: ["ignore", "inherit", "inherit"],
  env: { ...process.env, PORT: String(port) },
});
try {
  await waitForServer();
  await run(process.execPath, ["scripts/browser-smoke.cjs"], { GAME_URL: baseUrl });
} finally {
  server.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
}
console.log("verify ok: syntax, unit/integration, browser smoke");
