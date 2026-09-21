import test from "node:test";
import assert from "node:assert/strict";
import { Pet, PET_SPECIES, hatchEgg, EGG_TYPES } from "../src/core/pet.js";

test("Pet initializes with species template and default level", () => {
  const pet = new Pet({ speciesId: "fire_drake", name: "Rồng Lửa Nhỏ" });
  assert.equal(pet.name, "Rồng Lửa Nhỏ");
  assert.equal(pet.speciesId, "fire_drake");
  assert.equal(pet.level, 1);
  assert.equal(pet.energy, 0);
  assert.equal(pet.isReady(), false);

  const aura = pet.getAura();
  assert.equal(aura.blastRadiusBonus, 0.2);
});

test("Pet gains XP and levels up correctly", () => {
  const pet = new Pet({ speciesId: "leaf_sprout", level: 1 });
  assert.equal(pet.xpToNextLevel(), 120);

  // Gain partial XP
  const r1 = pet.gainXp(50);
  assert.equal(r1.leveledUp, false);
  assert.equal(pet.level, 1);
  assert.equal(pet.xp, 50);

  // Gain enough XP to level up twice
  // Level 1 needs 120 (50 + 250 = 300; 300 - 120 = 180; Level 2 needs 240, 180 left)
  const r2 = pet.gainXp(250);
  assert.equal(r2.leveledUp, true);
  assert.equal(pet.level, 2);
  assert.equal(pet.xp, 180);
});

test("Pet charges energy on combat hits and activates Ultimate", () => {
  const pet = new Pet({ speciesId: "golden_ant" });

  // Normal hit adds +18 energy
  pet.chargeEnergy({ hits: 1, isCritical: false });
  assert.equal(pet.energy, 18);
  assert.equal(pet.isReady(), false);

  // Critical hit adds +30 energy
  pet.chargeEnergy({ hits: 1, isCritical: true });
  assert.equal(pet.energy, 48);

  // Multiple hits charge to cap
  pet.chargeEnergy({ hits: 2, isCritical: true }); // +60 -> 108 -> capped at 100
  assert.equal(pet.energy, 100);
  assert.equal(pet.isReady(), true);

  // Activate ultimate
  const ult = pet.activateUltimate();
  assert.ok(ult);
  assert.equal(ult.id, "earthquake_burrow");
  assert.equal(ult.craterRadius, 55);
  assert.equal(pet.energy, 0); // Consumed
  assert.equal(pet.isReady(), false);

  // Cannot activate again without energy
  assert.equal(pet.activateUltimate(), null);
});

test("Egg hatching creates pet from pool with optional custom name", () => {
  // Deterministic random generator picking first index
  const fakeRandom = () => 0;
  const pet = hatchEgg("common_egg", "Chiến Binh Kiến", fakeRandom);

  assert.equal(pet.name, "Chiến Binh Kiến");
  assert.equal(pet.speciesId, EGG_TYPES.COMMON.pool[0]);
  assert.equal(pet.level, 1);
  assert.equal(pet.energy, 0);
});

test("Pet serializes and deserializes state accurately", () => {
  const original = new Pet({
    id: "pet_custom_99",
    speciesId: "frost_fairy",
    name: "Băng Băng",
    level: 5,
    xp: 60,
    energy: 85,
  });

  const serialized = original.serialize();
  const restored = Pet.deserialize(serialized);

  assert.equal(restored.id, "pet_custom_99");
  assert.equal(restored.speciesId, "frost_fairy");
  assert.equal(restored.name, "Băng Băng");
  assert.equal(restored.level, 5);
  assert.equal(restored.xp, 60);
  assert.equal(restored.energy, 85);
});
