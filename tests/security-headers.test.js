import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../server/server.js";

const listen = (options) => new Promise((resolve) => {
  const server = createServer(options);
  server.listen(0, () => resolve({ server, port: server.address().port }));
});

test("every response carries baseline security headers, static and API alike", async () => {
  const { server, port } = await listen();
  const url = `http://127.0.0.1:${port}`;
  try {
    for (const path of ["/", "/healthz", "/readyz", "/api/rooms"]) {
      const response = await fetch(`${url}${path}`);
      assert.equal(response.headers.get("x-content-type-options"), "nosniff", path);
      assert.equal(response.headers.get("x-frame-options"), "DENY", path);
      assert.equal(response.headers.get("referrer-policy"), "no-referrer", path);
      const csp = response.headers.get("content-security-policy");
      assert.ok(csp?.includes("default-src 'self'"), path);
      assert.ok(csp?.includes("frame-ancestors 'none'"));
    }
  } finally { server.closeAllConnections(); server.close(); }
});

test("HSTS is only sent when the trusted proxy says the original request was https", async () => {
  const { server, port } = await listen({ trustProxy: true, trustedProxies: ["127.0.0.1"] });
  const url = `http://127.0.0.1:${port}`;
  try {
    const plain = await fetch(`${url}/healthz`);
    assert.equal(plain.headers.get("strict-transport-security"), null);
    const forwarded = await fetch(`${url}/healthz`, { headers: { "x-forwarded-proto": "https" } });
    assert.equal(forwarded.headers.get("strict-transport-security"), "max-age=63072000; includeSubDomains");
  } finally { server.closeAllConnections(); server.close(); }
});

test("HSTS is never sent when the server does not trust a proxy", async () => {
  const { server, port } = await listen();
  const url = `http://127.0.0.1:${port}`;
  try {
    const response = await fetch(`${url}/healthz`, { headers: { "x-forwarded-proto": "https" } });
    assert.equal(response.headers.get("strict-transport-security"), null,
      "an untrusted client claiming https must not be believed");
  } finally { server.closeAllConnections(); server.close(); }
});
