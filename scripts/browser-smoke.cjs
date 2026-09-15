// Optional: install Playwright, then BROWSER_EXECUTABLE=/path/to/chromium node scripts/browser-smoke.cjs
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.BROWSER_EXECUTABLE || undefined,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1200 },
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(process.env.GAME_URL || "http://127.0.0.1:5173");
    await page.waitForFunction(
      () => document.querySelector("#characterChoices").children.length === 4,
    );
    assert.match(await page.locator("#assetStatus").innerText(), /4 nhân vật/);
    assert.equal(await page.locator(".loadout button").count(), 10);
    for (const id of ["mochi", "hat-de", "bzz", "nemu"]) {
      await page.locator(`[data-id="${id}"]`).click();
      assert.equal(
        await page.locator(`[data-id="${id}"]`).getAttribute("aria-pressed"),
        "true",
      );
    }
    for (const id of ["carrot", "acorn", "honey", "bubble", "fish", "star"]) {
      await page.locator(`[data-id="${id}"]`).click();
      assert.equal(
        await page.locator(`[data-id="${id}"]`).getAttribute("aria-pressed"),
        "true",
      );
    }
    assert.equal(await page.locator("#name0").innerText(), "Nemu");
    await page.locator("#restart").click();
    assert.equal(await page.locator("#name0").innerText(), "Nemu");
    await page.locator('[data-id="mochi"]').click();
    await page.locator('[data-id="carrot"]').click();
    if (process.env.SCREENSHOT_DIR)
      await page.screenshot({
        path: `${process.env.SCREENSHOT_DIR}/gunny-desktop.png`,
        fullPage: true,
      });
    // Terrain cache removes pixels above the live heightmap after a blast.
    assert.equal(
      await page.evaluate(async () => {
        const { terrainLayer } = await import("./src/sprites.js");
        const { makeTerrain, crater } = await import("./src/physics.js");
        const texture = new Image();
        texture.src = "./assets/environment/grass-earth.webp";
        await texture.decode();
        const original = makeTerrain(),
          changed = [...original];
        crater(changed, 600, original[600]);
        const layer = terrainLayer(texture, original, changed).getContext("2d");
        return (
          layer.getImageData(600, Math.ceil(original[600] + 15), 1, 1)
            .data[3] === 0 &&
          layer.getImageData(600, Math.ceil(changed[600] + 15), 1, 1).data[3] >
            0
        );
      }),
      true,
    );
    await page.locator("#fire").focus();
    await page.keyboard.down("Space");
    await page.waitForTimeout(1600);
    assert.ok(parseInt(await page.locator("#powerValue").innerText()) > 30);
    await page.keyboard.up("Space");
    await page.waitForFunction(
      () => !document.querySelector("#round").textContent.startsWith("LƯỢT 01"),
      { timeout: 15000 },
    );
    await page.waitForFunction(
      () => document.querySelector("#round").textContent.startsWith("LƯỢT 03"),
      { timeout: 15000 },
    );
    await page.locator("#restart").click();
    await page.locator("#help").click();
    const timer = await page.locator("#timer").innerText();
    await page.waitForTimeout(1100);
    assert.equal(await page.locator("#timer").innerText(), timer);
    await page.locator("#closeHelp").click();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    if (process.env.SCREENSHOT_DIR)
      await page.screenshot({
        path: `${process.env.SCREENSHOT_DIR}/gunny-mobile.png`,
        fullPage: true,
      });
    assert.deepEqual(errors, []);
    // Failed image requests fall back to playable procedural artwork.
    // A second page can start hidden, which pauses the game and throttles
    // requestAnimationFrame, so the HUD only enables once it is in front.
    const fallback = await browser.newPage();
    await fallback.route("**/assets/**", (route) => route.abort());
    await fallback.goto(process.env.GAME_URL || "http://127.0.0.1:5173");
    await fallback.bringToFront();
    await fallback.waitForFunction(() =>
      document.querySelector("#assetStatus").textContent.includes("dự phòng"),
    );
    await fallback.waitForFunction(
      () => !document.querySelector("#fire").disabled,
      { timeout: 5000 },
    );
    await fallback.close();
    console.log(
      "PASS: 12 assets, 10 selections, restart, crater pixels, player/bot turns, pause, mobile layout, asset fallback.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
