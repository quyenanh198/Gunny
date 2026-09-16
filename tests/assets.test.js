import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { CHARACTERS, WEAPONS, ASSET_LIST, ANIMATION_ASSETS } from "../src/assets.js";

test("asset manifest has unique ids and every local file exists", async () => {
  assert.equal(new Set(ASSET_LIST.map((asset) => asset.id)).size, ASSET_LIST.length);
  await Promise.all(
    ASSET_LIST.map((asset) =>
      access(new URL(`../assets/${asset.file}`, import.meta.url)),
    ),
  );
});

test("Aether has a matching animation and Void Prism ammo", () => {
  assert.ok(CHARACTERS.some((character) => character.id === "aether"));
  assert.ok(ANIMATION_ASSETS.some((asset) => asset.id === "aether-animation"));
  const weapon = WEAPONS.find((entry) => entry.id === "void-prism");
  assert.ok(weapon);
  assert.ok(weapon.ammo.windScale < 1);
  assert.deepEqual(weapon.ammo.angles, [15, 85]);
});
