// Unit tests for MMO-Lite Hub Controller
import test from "node:test";
import assert from "node:assert/strict";
import { MmoHubController } from "../src/ui/mmo-hub.js";

test("MmoHubController initializes with default profile and renders tabs", async () => {
  // Mock DOM elements
  const elements = {};
  const dialog = {
    innerHTML: "",
    showModal() { dialog.open = true; },
    close() { dialog.open = false; },
    open: false,
  };
  elements["mmoHubDialog"] = dialog;

  const controller = new MmoHubController({
    $: (id) => elements[id],
  });

  await controller.open();
  assert.equal(dialog.open, true);
  assert.match(dialog.innerHTML, /KHU VỰC MMO-LITE/);
  assert.match(dialog.innerHTML, /Thú Cưng/);
  assert.match(dialog.innerHTML, /Tiệm Rèn/);
  assert.match(dialog.innerHTML, /Pháo Đài/);
  assert.match(dialog.innerHTML, /Phó Bản PvE/);

  // Switch to Forge tab
  controller.switchTab("forge");
  assert.equal(controller.currentTab, "forge");
  assert.match(dialog.innerHTML, /VŨ KHÍ/);
  assert.match(dialog.innerHTML, /Mốc an toàn khóa vĩnh viễn/);

  // Switch to Fortress tab
  controller.switchTab("fortress");
  assert.equal(controller.currentTab, "fortress");
  assert.match(dialog.innerHTML, /THÀNH TRÌ/);
  assert.match(dialog.innerHTML, /ĐỘI QUÂN BOT ĐÁNH THUÊ/);

  // Switch to Dungeon tab
  controller.switchTab("dungeon");
  assert.equal(controller.currentTab, "dungeon");
  assert.match(dialog.innerHTML, /ĐẠI CHIẾN HOÀNG GIA/);
  assert.match(dialog.innerHTML, /Minion Wave/);

  controller.close();
  assert.equal(dialog.open, false);
});

test("MmoHubController handles callbacks for solo and coop dungeon launch", async () => {
  const elements = {
    mmoHubDialog: { innerHTML: "", showModal() {}, close() {} },
  };
  let dungeonLaunched = null;

  const controller = new MmoHubController({
    $: (id) => elements[id],
    onStartDungeon: (cfg) => {
      dungeonLaunched = cfg;
    },
  });

  await controller.open();
  controller.switchTab("dungeon");
  assert.equal(controller.currentTab, "dungeon");

  // Trigger onStartDungeon
  controller.onStartDungeon({ mode: "solo" });
  assert.deepEqual(dungeonLaunched, { mode: "solo" });

  controller.onStartDungeon({ mode: "coop" });
  assert.deepEqual(dungeonLaunched, { mode: "coop" });
});

