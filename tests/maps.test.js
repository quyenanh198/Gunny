import test from "node:test";
import assert from "node:assert/strict";
import { MAPS } from "../src/maps.js";
import {
  WIDTH,
  makeTerrain,
  botShot,
  simulate,
  damage,
  crater,
} from "../src/physics.js";

test("original map stays unchanged and new maps have distinct safe terrain", () => {
  assert.deepEqual(MAPS[0].createTerrain(), makeTerrain());
  const signatures = new Set();
  for (const map of MAPS) {
    const terrain = map.createTerrain();
    assert.equal(terrain.length, WIDTH);
    assert.ok(terrain.every((y) => Number.isFinite(y) && y > 350 && y < 510));
    for (let x = 1; x < WIDTH; x++)
      assert.ok(Math.abs(terrain[x] - terrain[x - 1]) < 2);
    signatures.add(JSON.stringify(terrain));
    const pristine = map.createTerrain();
    crater(terrain, 600, terrain[600]);
    assert.ok(terrain[600] > pristine[600]);
    assert.deepEqual(map.createTerrain(), pristine);
  }
  assert.equal(signatures.size, MAPS.length);
});
test("both players can land damaging shots on every map with headwind or tailwind", () => {
  for (const map of MAPS)
    for (const wind of [-30, 0, 30]) {
      const terrain = map.createTerrain();
      const actors = map.spawns.map((x) => ({ x, y: terrain[x] }));
      for (const side of [0, 1]) {
        const actor = actors[side],
          target = actors[1 - side];
        const shot = botShot(actor, target, wind, terrain, () => 0.5);
        const hit = simulate(actor, shot.angle, shot.power, wind, terrain);
        assert.ok(
          damage(target, hit.x, hit.y) > 20,
          `${map.id} wind ${wind} side ${side}`,
        );
      }
    }
});
