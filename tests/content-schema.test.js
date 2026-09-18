import test from "node:test";
import assert from "node:assert/strict";
import { CHARACTERS, WEAPONS } from "../src/assets.js";
import { MAPS } from "../src/maps.js";
import { validateContent, validateContentOrThrow, CONTENT_VERSION } from "../src/content/schema.js";

test("the shipped content bundle passes its own schema", () => {
  const result = validateContent({ characters: CHARACTERS, weapons: WEAPONS, maps: MAPS });
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
  assert.equal(typeof CONTENT_VERSION, "number");
  assert.doesNotThrow(() => validateContentOrThrow({ characters: CHARACTERS, weapons: WEAPONS, maps: MAPS }));
});

test("duplicate ids across any content kind are rejected", () => {
  const characters = [{ id: "mochi", name: "Mochi", file: "a.png" }, { id: "mochi", name: "Again", file: "b.png" }];
  const result = validateContent({ characters });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("duplicate id")));
});

test("a weapon with an inverted or out-of-range angle window is rejected", () => {
  const badWeapon = { id: "bad", name: "Bad", desc: "x", file: "x.png", color: "#fff",
    ammo: { gravityScale: 1, windScale: 1, craterWidth: 1, craterDepth: 1, damageMax: 1, damageRadius: 1, angles: [70, 10] } };
  assert.equal(validateContent({ weapons: [badWeapon] }).ok, false);
  const outOfRange = { ...badWeapon, ammo: { ...badWeapon.ammo, angles: [10, 95] } };
  assert.equal(validateContent({ weapons: [outOfRange] }).ok, false);
});

test("a map missing createTerrain or with an inverted spawn zone is rejected", () => {
  const base = { id: "x", name: "X", number: "00", description: "x", background: "b", ground: "g",
    preview: "p.webp", spawns: [0, 1], spawnZones: [[0, 10], [20, 30]], windRange: 1, groundHardness: 1 };
  assert.equal(validateContent({ maps: [base] }).ok, false, "createTerrain is missing");
  assert.equal(validateContent({ maps: [{ ...base, createTerrain: () => [] }] }).ok, true);
  const invertedZone = { ...base, spawnZones: [[10, 0], [20, 30]], createTerrain: () => [] };
  assert.equal(validateContent({ maps: [invertedZone] }).ok, false);
});

test("validateContentOrThrow surfaces every collected error in its message", () => {
  assert.throws(() => validateContentOrThrow({ characters: [{ id: "" }] }), /missing or invalid id/);
});
