// Content schema and validator for character/weapon/map data (R4). Content is
// still bundled JS, not hot-loaded, so "reject before deploy" today means
// "this validator is a required test" (see tests/content-schema.test.js) —
// there is no runtime content loader yet to gate at request time.
//
// Bump CONTENT_VERSION whenever a field is added, removed or reinterpreted in
// a way that would change replay/balance-simulator output for existing data,
// so old replay logs and balance reports can record which shape they assume.
// There is no migration runner yet: today's move is additive-only fields with
// safe defaults, which needs no migration step. A real migration (renaming or
// reinterpreting a field) is future work, not solved by this version number
// alone — see docs/moderation.md-style follow-up note in ONLINE_GAME_ROADMAP.md R4.
export const CONTENT_VERSION = 1;

const isNonEmptyString = (v) => typeof v === "string" && v.length > 0;
const isFiniteNumber = (v) => typeof v === "number" && Number.isFinite(v);
const isAngleRange = (v) => Array.isArray(v) && v.length === 2 &&
  isFiniteNumber(v[0]) && isFiniteNumber(v[1]) && v[0] >= 0 && v[1] <= 90 && v[0] < v[1];

function uniqueIds(items, errors, kind) {
  const seen = new Set();
  for (const item of items) {
    if (!isNonEmptyString(item?.id)) { errors.push(`${kind}: missing or invalid id`); continue; }
    if (seen.has(item.id)) errors.push(`${kind} "${item.id}": duplicate id`);
    seen.add(item.id);
  }
}

function validateCharacter(character, errors) {
  const label = `character "${character?.id ?? "?"}"`;
  if (!isNonEmptyString(character?.name)) errors.push(`${label}: name must be a non-empty string`);
  if (!isNonEmptyString(character?.file)) errors.push(`${label}: file must be a non-empty string`);
}

function validateWeapon(weapon, errors) {
  const label = `weapon "${weapon?.id ?? "?"}"`;
  if (!isNonEmptyString(weapon?.name)) errors.push(`${label}: name must be a non-empty string`);
  if (!isNonEmptyString(weapon?.desc)) errors.push(`${label}: desc must be a non-empty string`);
  if (!isNonEmptyString(weapon?.file)) errors.push(`${label}: file must be a non-empty string`);
  if (!isNonEmptyString(weapon?.color)) errors.push(`${label}: color must be a non-empty string`);
  const ammo = weapon?.ammo;
  if (!ammo || typeof ammo !== "object") { errors.push(`${label}: ammo must be an object`); return; }
  for (const field of ["gravityScale", "windScale", "craterWidth", "craterDepth", "damageMax", "damageRadius"])
    if (!isFiniteNumber(ammo[field]) || ammo[field] < 0) errors.push(`${label}: ammo.${field} must be a non-negative number`);
  if (!isAngleRange(ammo.angles)) errors.push(`${label}: ammo.angles must be [min, max] within 0..90 with min < max`);
}

function validateMap(map, errors) {
  const label = `map "${map?.id ?? "?"}"`;
  for (const field of ["name", "number", "description", "background", "ground", "preview"])
    if (!isNonEmptyString(map?.[field])) errors.push(`${label}: ${field} must be a non-empty string`);
  if (!Array.isArray(map?.spawns) || map.spawns.length !== 2 || !map.spawns.every(isFiniteNumber))
    errors.push(`${label}: spawns must be [x0, x1]`);
  if (!Array.isArray(map?.spawnZones) || map.spawnZones.length !== 2 ||
      !map.spawnZones.every((zone) => Array.isArray(zone) && zone.length === 2 &&
        isFiniteNumber(zone[0]) && isFiniteNumber(zone[1]) && zone[0] < zone[1]))
    errors.push(`${label}: spawnZones must be two [lo, hi] pairs with lo < hi`);
  if (!isFiniteNumber(map?.windRange) || map.windRange < 0) errors.push(`${label}: windRange must be a non-negative number`);
  if (!isFiniteNumber(map?.groundHardness) || map.groundHardness <= 0) errors.push(`${label}: groundHardness must be a positive number`);
  if (typeof map?.createTerrain !== "function") errors.push(`${label}: createTerrain must be a function`);
}

// Pure validator: takes plain data (not live imports) so it can also check
// fixtures/migrations in tests without touching the bundled content module.
export function validateContent({ characters = [], weapons = [], maps = [] }) {
  const errors = [];
  uniqueIds(characters, errors, "character");
  uniqueIds(weapons, errors, "weapon");
  uniqueIds(maps, errors, "map");
  characters.forEach((c) => validateCharacter(c, errors));
  weapons.forEach((w) => validateWeapon(w, errors));
  maps.forEach((m) => validateMap(m, errors));
  return { ok: errors.length === 0, errors };
}

export function validateContentOrThrow(content) {
  const result = validateContent(content);
  if (!result.ok) throw new Error(`invalid content (schema v${CONTENT_VERSION}):\n- ${result.errors.join("\n- ")}`);
  return result;
}
