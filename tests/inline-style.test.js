import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

async function clientFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await clientFiles(full));
    else if (entry.name.endsWith(".js") || entry.name.endsWith(".html")) found.push(full);
  }
  return found;
}

// CSP của game khai báo style-src không có 'unsafe-inline', nên trình duyệt bỏ mọi
// thuộc tính style viết thẳng trong HTML: thẻ vẫn hiện nhưng trơ, mất nền, không
// giãn. Lỗi này không làm test nào khác đỏ và cũng không ném lỗi ra console của
// người chơi, nên phải canh ở đây.
test("không viết style thẳng vào thẻ HTML — CSP sẽ bỏ qua", async () => {
  const files = [path.join(ROOT, "index.html"), ...await clientFiles(path.join(ROOT, "src"))];
  const offenders = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    source.split("\n").forEach((line, index) => {
      if (/style\s*=\s*["'`]/.test(line)) offenders.push(`${path.relative(ROOT, file)}:${index + 1}`);
    });
  }
  assert.deepEqual(offenders, [], `dùng class trong style.css thay cho style="" tại: ${offenders.join(", ")}`);
});
