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
    // Every character sheet contains four distinct frames in all four rows.
    assert.equal(
      await page.evaluate(async () => {
        const { ANIMATION_ASSETS, assetURL } = await import("./src/assets.js");
        for (const asset of ANIMATION_ASSETS) {
          const image = new Image();
          image.src = assetURL(asset.file);
          await image.decode();
          if (image.width !== 768 || image.height !== 768) return false;
          const c = document.createElement("canvas");
          c.width = c.height = 192;
          const ctx = c.getContext("2d");
          for (let row = 0; row < 4; row++) {
            const frames = new Set();
            for (let column = 0; column < 4; column++) {
              ctx.clearRect(0, 0, 192, 192);
              ctx.drawImage(
                image,
                column * 192,
                row * 192,
                192,
                192,
                0,
                0,
                192,
                192,
              );
              if (ctx.getImageData(0, 0, 1, 1).data[3] !== 0) return false;
              frames.add(c.toDataURL());
            }
            if (frames.size !== 4) return false;
          }
        }
        return true;
      }),
      true,
    );

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
    console.log("Assets and selections passed");
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
    console.log("Turns passed");
    await page.locator("#help").click();
    const timer = await page.locator("#timer").innerText();
    const pausedImage = await page
      .locator("#game")
      .evaluate((canvas) => canvas.toDataURL());
    await page.waitForTimeout(1100);
    assert.equal(await page.locator("#timer").innerText(), timer);
    assert.ok(
      (await page.locator("#game").evaluate((canvas) => canvas.toDataURL())) ===
        pausedImage,
      "paused canvas must remain still",
    );
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
    console.log("Pause and mobile passed");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForTimeout(50);
    const still = await page
      .locator("#game")
      .evaluate((canvas) => canvas.toDataURL());
    await page.waitForTimeout(300);
    assert.ok(
      (await page.locator("#game").evaluate((canvas) => canvas.toDataURL())) ===
        still,
      "reduced-motion canvas must remain still",
    );
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
      "PASS: 16 assets, 64 animation frames, 10 selections, restart, crater pixels, player/bot turns, pause freezes animation, reduced motion, mobile layout, asset fallback.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
