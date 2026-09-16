import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { cappedDpr } from "../src/ui/responsive.js";

test("canvas DPR is capped without dropping below one", () => {
  assert.equal(cappedDpr(0.75), 1);
  assert.equal(cappedDpr(1.5), 1.5);
  assert.equal(cappedDpr(3), 2);
});

test("mobile contract includes safe areas, touch targets and precise aim controls", async () => {
  const [html, css] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../style.css", import.meta.url), "utf8"),
  ]);
  assert.match(html, /viewport-fit=cover/);
  assert.equal((html.match(/data-angle-step=/g) || []).length, 4);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /orientation: portrait/);
});
