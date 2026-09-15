import test from "node:test";
import assert from "node:assert/strict";
import {
  createAnimation,
  advanceAnimation,
  playAnimation,
  animationFrame,
  recoilOffset,
} from "../src/animation.js";

test("walk cycles frames and returns to idle immediately on stop", () => {
  const a = createAnimation();
  advanceAnimation(a, 0.01, { moving: true });
  assert.deepEqual(animationFrame(a), { row: 1, column: 0 });
  advanceAnimation(a, 0.13, { moving: true });
  assert.deepEqual(animationFrame(a), { row: 1, column: 1 });
  advanceAnimation(a, 0.01, { moving: false });
  assert.equal(a.state, "idle");
});
test("one-shot recoil finishes even when movement is requested", () => {
  const a = createAnimation();
  playAnimation(a, "shoot");
  advanceAnimation(a, 0.12, { moving: true });
  assert.equal(a.state, "shoot");
  assert.ok(recoilOffset(a) < -7);
  advanceAnimation(a, 0.25, { moving: true });
  assert.equal(a.state, "walk");
  assert.equal(recoilOffset(a), 0);
});
test("hit interrupts shooting, then recovers; defeat holds a pose", () => {
  const a = createAnimation();
  playAnimation(a, "shoot");
  playAnimation(a, "hurt");
  advanceAnimation(a, 0.2);
  assert.deepEqual(animationFrame(a), { row: 3, column: 1 });
  advanceAnimation(a, 0.3);
  assert.equal(a.state, "idle");
  advanceAnimation(a, 0.1, { dead: true });
  advanceAnimation(a, 10, { dead: true });
  assert.deepEqual(animationFrame(a), { row: 3, column: 1 });
});
test("reduced motion uses stable frames and no recoil", () => {
  const a = createAnimation();
  playAnimation(a, "shoot");
  advanceAnimation(a, 0.12);
  assert.deepEqual(animationFrame(a, true), { row: 0, column: 0 });
  assert.equal(recoilOffset(a, true), 0);
});
test("animation updates do not alter gameplay values and reset clears recoil", () => {
  const actor = { x: 205, y: 450, hp: 73, animation: createAnimation() };
  playAnimation(actor.animation, "hurt");
  for (let i = 0; i < 120; i++) advanceAnimation(actor.animation, 1 / 120);
  assert.deepEqual(
    { x: actor.x, y: actor.y, hp: actor.hp },
    { x: 205, y: 450, hp: 73 },
  );
  actor.animation = createAnimation();
  assert.equal(recoilOffset(actor.animation), 0);
});
