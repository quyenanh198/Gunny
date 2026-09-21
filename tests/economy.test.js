import test from "node:test";
import assert from "node:assert/strict";
import { EconomyWallet, VANITY_CATALOG } from "../src/core/economy.js";

test("EconomyWallet initializes with starting balance and empty inventory", () => {
  const wallet = new EconomyWallet({ initialGold: 250 });
  assert.equal(wallet.gold, 250);
  assert.equal(wallet.getItems().length, 0);
  assert.equal(wallet.winStreak, 0);
});

test("EconomyWallet calculates match rewards with win streaks and performance bonuses", () => {
  const wallet = new EconomyWallet({ initialGold: 100 });

  // 1. First win: 100 base + 20 damage bonus (200 dmg) + 20 hit bonus (2 hits)
  // Win streak becomes 1 (1 + 0.1 = 1.1x) -> (100 + 20 + 20) * 1.1 = 154
  const res1 = wallet.awardMatchRewards({ won: true, damage: 200, hits: 2 });
  assert.equal(res1.won ?? true, true);
  assert.equal(res1.earned, 154);
  assert.equal(wallet.gold, 254);
  assert.equal(wallet.winStreak, 1);

  // 2. Loss resets win streak: 40 base + 5 damage bonus (50 dmg) + 0 hit bonus -> 45
  const res2 = wallet.awardMatchRewards({ won: false, damage: 50, hits: 0 });
  assert.equal(res2.earned, 45);
  assert.equal(wallet.gold, 299);
  assert.equal(wallet.winStreak, 0);
});

test("EconomyWallet handles vanity purchases, validates balance and prevents duplicates", () => {
  const wallet = new EconomyWallet({ initialGold: 500 });
  const item = VANITY_CATALOG.find((i) => i.id === "title_wind_marksman"); // 300 gold
  assert.ok(item);

  // 1. Purchase successfully
  const p1 = wallet.purchase("title_wind_marksman");
  assert.equal(p1.success, true);
  assert.equal(wallet.gold, 200);
  assert.equal(wallet.hasItem("title_wind_marksman"), true);

  // 2. Try purchasing the same item again -> fails
  const p2 = wallet.purchase("title_wind_marksman");
  assert.equal(p2.success, false);
  assert.match(p2.reason, /đã sở hữu/);
  assert.equal(wallet.gold, 200);

  // 3. Try purchasing an expensive item -> fails due to insufficient gold
  const p3 = wallet.purchase("title_artillery_lord"); // 1800 gold
  assert.equal(p3.success, false);
  assert.match(p3.reason, /Không đủ vàng/);
  assert.equal(wallet.gold, 200);

  // 4. Try purchasing non-existent item -> fails
  const p4 = wallet.purchase("item_unknown");
  assert.equal(p4.success, false);
});

test("EconomyWallet serialization and deserialization roundtrip", () => {
  const wallet = new EconomyWallet({
    initialGold: 750,
    inventory: ["title_wind_marksman", "trail_golden_meteor"],
    winStreak: 3,
  });

  const json = wallet.serialize();
  const restored = EconomyWallet.deserialize(json);

  assert.equal(restored.gold, 750);
  assert.equal(restored.winStreak, 3);
  assert.equal(restored.hasItem("title_wind_marksman"), true);
  assert.equal(restored.hasItem("trail_golden_meteor"), true);
  assert.equal(restored.hasItem("title_deadeye"), false);
});
