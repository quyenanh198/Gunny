import { botShot } from "../physics.js";

export function chooseBotShot(match, actor, ammo) {
  const enemies = match.alive(1 - actor.team);
  const target = enemies.reduce((best, enemy) =>
    Math.abs(enemy.x - actor.x) < Math.abs(best.x - actor.x) ? enemy : best,
  );
  return botShot(
    actor,
    target,
    match.wind,
    match.terrain,
    match.random,
    ammo,
    match.tiltOf(actor),
    match.difficulty,
  );
}

export function chooseBotAction(actor, difficulty) {
  if (actor.ss >= 100) return { shot: "ss", item: null };
  return { shot: difficulty.id === "hard" ? "s2" : "s1", item: null };
}
