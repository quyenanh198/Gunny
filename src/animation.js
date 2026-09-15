// Visual-only state. Never mutates actor position, HP, turn timing or projectiles.
export const CLIPS = {
  idle: { row: 0, durations: [1.15, 0.35, 0.12, 0.48], loop: true },
  walk: { row: 1, durations: [0.12, 0.12, 0.12, 0.12], loop: true },
  shoot: { row: 2, durations: [0.06, 0.1, 0.1, 0.1], loop: false },
  hurt: { row: 3, durations: [0.07, 0.16, 0.12, 0.13], loop: false },
};
const duration = (state) => CLIPS[state].durations.reduce((a, b) => a + b, 0);
export function createAnimation() {
  return { state: "idle", elapsed: 0, shotAge: Infinity, moveDirection: 1 };
}
export function playAnimation(animation, state) {
  if (state === "shoot") animation.shotAge = 0;
  if (state === "hurt" || animation.state !== "hurt") {
    animation.state = state;
    animation.elapsed = 0;
  }
}
export function advanceAnimation(
  animation,
  dt,
  { moving = false, dead = false } = {},
) {
  animation.shotAge += dt;
  if (dead) {
    animation.state = "defeated";
    animation.elapsed = 0;
    return;
  }
  animation.elapsed += dt;
  if (
    (animation.state === "shoot" || animation.state === "hurt") &&
    animation.elapsed < duration(animation.state)
  )
    return;
  const state = moving ? "walk" : "idle";
  if (state !== animation.state) {
    animation.state = state;
    animation.elapsed = 0;
  } else {
    animation.elapsed %= duration(state);
  }
}
export function animationFrame(animation, reducedMotion = false) {
  if (animation.state === "defeated") return { row: 3, column: 1 };
  if (reducedMotion)
    return { row: animation.state === "hurt" ? 3 : 0, column: 0 };
  const clip = CLIPS[animation.state];
  let t = animation.elapsed;
  for (let column = 0; column < clip.durations.length; column++) {
    if (t < clip.durations[column]) return { row: clip.row, column };
    t -= clip.durations[column];
  }
  return { row: clip.row, column: 3 };
}
export function recoilOffset(animation, reducedMotion = false) {
  if (reducedMotion || animation.shotAge >= 0.24) return 0;
  return -8 * Math.sin((Math.PI * animation.shotAge) / 0.24);
}
