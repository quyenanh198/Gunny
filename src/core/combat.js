import { crater, damage, fallDamage, groundUnderFootprint } from "../physics.js";

export const SHOTS = {
  s1: { damageScale: 1, craterScale: 1, delay: 100, ssCost: 0 },
  s2: { damageScale: 1.15, craterScale: 1.1, delay: 120, ssCost: 0 },
  ss: { damageScale: 1.4, craterScale: 1.2, delay: 140, ssCost: 100 },
};
export const ITEMS = {
  power: { damageScale: 1.2, delay: 20 },
  blood: { damageScale: 1.35, delay: 25, hpCost: 10 },
  teleport: { damageScale: 0, delay: 35, teleport: true },
  dual: { damageScale: 1.6, delay: 45 },
};

export const gainSs = (value, damage) => Math.min(100, value + Math.max(0, damage));

export function combatLoadout(requestedShot, requestedItem, ss) {
  const shot = requestedShot === "ss" && ss < 100 ? "s1" : SHOTS[requestedShot] ? requestedShot : "s1";
  const item = ITEMS[requestedItem] ? requestedItem : null;
  const shotRule = SHOTS[shot], itemRule = ITEMS[item] || {};
  return {
    shot,
    item,
    damageScale: shotRule.damageScale * (itemRule.damageScale ?? 1),
    craterScale: shotRule.craterScale,
    delay: shotRule.delay + (itemRule.delay || 0),
    ssCost: shotRule.ssCost,
    hpCost: itemRule.hpCost || 0,
    teleport: !!itemRule.teleport,
  };
}

export function resolveExplosion(terrain, actors, projectile, rules = combatLoadout("s1", null, 0)) {
  crater(terrain, projectile.x, projectile.y, projectile.ammo.craterWidth * rules.craterScale, projectile.ammo.craterDepth * rules.craterScale);
  return actors.map((actor) => {
    if (actor.hp <= 0) return 0;
    const floor = groundUnderFootprint(terrain, actor.x);
    const hit = Math.round(damage(actor, projectile.x, projectile.y, projectile.ammo) * rules.damageScale) + fallDamage(floor - actor.y);
    actor.hp = Math.max(0, actor.hp - hit);
    actor.y = floor;
    return hit;
  });
}
