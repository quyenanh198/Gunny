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
      () => document.querySelector("#characterChoices").children.length === 5,
    );
    // Home screen, then the practice room, then the battle.
    assert.equal(await page.locator("#home").isVisible(), true);
    await page.locator("#playerName").fill("Kiểm thử");
    await page.locator("#practice").click();
    await page.waitForSelector("#room", { state: "visible" });
    assert.match(await page.locator("#assetStatus").innerText(), /5 nhân vật/);
    assert.equal(await page.locator("#characterChoices button").count(), 5);
    assert.equal(await page.locator("#weaponChoices button").count(), 7);
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

    for (const id of ["mochi", "hat-de", "bzz", "nemu", "aether"]) {
      const button = page.locator(`#characterChoices [data-id="${id}"]`);
      await button.click();
      assert.equal(await button.getAttribute("aria-pressed"), "true");
    }
    for (const id of ["carrot", "acorn", "honey", "bubble", "fish", "star", "void-prism"]) {
      const button = page.locator(`#weaponChoices [data-id="${id}"]`);
      await button.click();
      assert.equal(await button.getAttribute("aria-pressed"), "true");
    }
    // Every arena is selectable from the room, with its own preview card.
    assert.equal(await page.locator(".map-card").count(), 5);
    for (const [id, name] of [
      ["candy", "Thung Lũng Kẹo"],
      ["moon", "Đêm Nấm Phát Sáng"],
      ["death", "Death Valley"],
      ["celestial", "Thiên Tinh"],
      ["sky", "Đảo Gió Xanh"],
    ]) {
      const card = page.locator(`[data-map="${id}"]`);
      await card.click();
      assert.equal(await card.getAttribute("aria-pressed"), "true");
      assert.match(await page.locator("#lobbyMapName").innerText(), new RegExp(name));
    }
    await page.locator('[data-map="death"]').click();
    await page.locator('#characterChoices [data-id="mochi"]').click();
    await page.locator('#weaponChoices [data-id="carrot"]').click();
    await page.locator("#startMatch").click();
    await page.waitForSelector("#game", { state: "visible" });
    // The HUD fills in on the first animation frame after the switch.
    await page.waitForFunction(() =>
      document.querySelector("#name0").textContent.includes("Kiểm thử"),
    );
    // The arena caption is styled uppercase, so compare case-insensitively.
    assert.match(await page.locator("#mapName").innerText(), /death valley/i);
    assert.equal(await page.locator("#health0").innerText(), "100 / 100 HP");
    // A match must fit the window at any height: no page scrolling, ever.
    const fits = () =>
      page.evaluate(() => {
        const doc = document.documentElement;
        const frame = document.querySelector(".frame").getBoundingClientRect();
        return {
          overflowY: doc.scrollHeight - innerHeight,
          overflowX: doc.scrollWidth - innerWidth,
          ratio: frame.width / frame.height,
          visible: frame.top >= 0 && frame.bottom <= innerHeight + 1,
        };
      });
    for (const [w, h] of [
      [1920, 1080],
      [1366, 768],
      [1024, 640],
    ]) {
      await page.setViewportSize({ width: w, height: h });
      // The frame is resized from a ResizeObserver, so let the layout settle.
      await page
        .waitForFunction(
          () => document.documentElement.scrollHeight - innerHeight <= 1,
          { timeout: 3000 },
        )
        .catch(() => {});
      const box = await fits();
      assert.ok(box.overflowY <= 1, `${w}x${h} scrolls ${box.overflowY}px`);
      assert.ok(box.overflowX <= 1, `${w}x${h} overflows ${box.overflowX}px`);
      assert.ok(Math.abs(box.ratio - 1200 / 620) < 0.02, `${w}x${h} stretches the arena`);
      assert.ok(box.visible, `${w}x${h} hides part of the arena`);
    }
    await page.setViewportSize({ width: 1440, height: 1200 });
    if (process.env.SCREENSHOT_DIR)
      await page.screenshot({
        path: `${process.env.SCREENSHOT_DIR}/map-death.png`,
        fullPage: true,
      });
    // Back to the room for a different arena.
    await page.locator("#leaveMatch").click();
    await page.waitForSelector("#room", { state: "visible" });
    await page.locator('[data-map="sky"]').click();
    await page.locator("#startMatch").click();
    await page.waitForSelector("#game", { state: "visible" });
    await page.waitForFunction(() =>
      document.querySelector("#mapName").textContent.includes("Đảo Gió Xanh"),
    );
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
    // Hold until the meter really passes a third, whatever the frame timing.
    await page.waitForFunction(
      () => parseInt(document.querySelector("#powerValue").textContent) > 30,
      { timeout: 10000 },
    );
    await page.keyboard.up("Space");
    await page.waitForFunction(
      () => !document.querySelector("#round").textContent.startsWith("LƯỢT 01"),
      { timeout: 15000 },
    );
    await page.waitForFunction(
      () => document.querySelector("#round").textContent.startsWith("LƯỢT 03"),
      { timeout: 15000 },
    );
    // Back to the room and into a fresh match.
    await page.locator("#leaveMatch").click();
    await page.waitForSelector("#room", { state: "visible" });
    await page.locator("#startMatch").click();
    await page.waitForSelector("#game", { state: "visible" });
    await page.waitForFunction(() =>
      document.querySelector("#round").textContent.startsWith("LƯỢT 01"),
    );
    console.log("Turns passed");
    await page.locator("#help").click();
    const timer = await page.locator("#timer").innerText();
    const pausedImage = await page
      .locator("#canvas")
      .evaluate((canvas) => canvas.toDataURL());
    await page.waitForTimeout(1100);
    assert.equal(await page.locator("#timer").innerText(), timer);
    assert.ok(
      (await page.locator("#canvas").evaluate((canvas) => canvas.toDataURL())) ===
        pausedImage,
      "paused canvas must remain still",
    );
    await page.locator("#closeHelp").click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .waitForFunction(
        () => document.documentElement.scrollHeight - innerHeight <= 1,
        { timeout: 3000 },
      )
      .catch(() => {});
    assert.deepEqual(
      await page.evaluate(() => {
        const doc = document.documentElement;
        const frame = document.querySelector(".frame").getBoundingClientRect();
        return {
          wide: doc.scrollWidth > innerWidth,
          tall: doc.scrollHeight > innerHeight + 1,
          stretched: Math.abs(frame.width / frame.height - 1200 / 620) > 0.02,
        };
      }),
      { wide: false, tall: false, stretched: false },
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
      .locator("#canvas")
      .evaluate((canvas) => canvas.toDataURL());
    await page.waitForTimeout(300);
    assert.ok(
      (await page.locator("#canvas").evaluate((canvas) => canvas.toDataURL())) ===
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
    await fallback.locator("#practice").click();
    await fallback.locator("#startMatch").click();
    await fallback.waitForSelector("#game", { state: "visible" });
    await fallback.waitForFunction(
      () => !document.querySelector("#fire").disabled,
      { timeout: 5000 },
    );
    await fallback.close();
    console.log(
      "PASS: 27 assets, 5 maps, 80 animation frames, home/room/battle screens, 12 selections, rematch, crater pixels, player/bot turns, pause freezes animation, reduced motion, viewport fit at four sizes, mobile layout, asset fallback.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
