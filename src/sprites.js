import { animationFrame, recoilOffset } from "./animation.js";
import { WIDTH, HEIGHT } from "./physics.js";

// Rebuild only after terrain changes, not for every animation frame.
// Texture stays fixed to the original soil; craters reveal soil, not new grass.
export function terrainLayer(image, original, current) {
  const layer = document.createElement("canvas");
  layer.width = WIDTH;
  layer.height = HEIGHT;
  const c = layer.getContext("2d");
  for (let x = 0; x < WIDTH; x++) {
    const y = original[x];
    c.drawImage(
      image,
      (x * image.width) / WIDTH,
      0,
      image.width / WIDTH,
      image.height,
      x,
      y,
      1,
      HEIGHT - y,
    );
    c.clearRect(x, 0, 1, current[x]);
  }
  return layer;
}

export function drawCharacter(
  ctx,
  image,
  actor,
  facing,
  active,
  sheet = null,
  reducedMotion = false,
) {
  const height = 112;
  const width = (height * image.width) / image.height;
  ctx.save();
  ctx.translate(actor.x, actor.y);
  ctx.fillStyle = "#183a3e35";
  ctx.beginPath();
  ctx.ellipse(0, 0, 25, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.scale(facing, 1);
  if (sheet) {
    const { row, column } = animationFrame(actor.animation, reducedMotion);
    const cellW = sheet.width / 4,
      cellH = sheet.height / 4;
    // 184/192 is the common foot baseline in every normalized cell.
    const size = 128;
    ctx.drawImage(
      sheet,
      column * cellW,
      row * cellH,
      cellW,
      cellH,
      -size / 2,
      (-size * 184) / 192,
      size,
      size,
    );
  } else {
    ctx.drawImage(image, -width / 2, -height + 1, width, height);
  }
  ctx.restore();
  if (active) {
    ctx.fillStyle = "#ffe3a0";
    ctx.strokeStyle = "#35544b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(actor.x - 7, actor.y - 125);
    ctx.lineTo(actor.x + 7, actor.y - 125);
    ctx.lineTo(actor.x, actor.y - 116);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

export function drawWeapon(ctx, image, actor, angle, reducedMotion = false) {
  const radians = (angle * Math.PI) / 180;
  ctx.save();
  ctx.translate(actor.x, actor.y - 30);
  ctx.rotate(-radians);
  ctx.translate(recoilOffset(actor.animation, reducedMotion), 0);
  // Flipping the local vertical axis keeps left-facing weapons upright.
  if (angle > 90) ctx.scale(1, -1);
  if (image) {
    ctx.drawImage(image, -14, -17, 48, 36);
  } else {
    ctx.fillStyle = "#43585e";
    ctx.fillRect(0, -7, 34, 14);
    ctx.fillStyle = "#e8d4a0";
    ctx.fillRect(27, -9, 7, 18);
  }
  ctx.restore();
}

export function drawMuzzle(ctx, actor, angle, reducedMotion) {
  if (reducedMotion || actor.animation.shotAge >= 0.12) return;
  const r = (angle * Math.PI) / 180;
  const radius = 14 * (1 - actor.animation.shotAge / 0.12);
  ctx.save();
  ctx.translate(actor.x + Math.cos(r) * 34, actor.y - 30 - Math.sin(r) * 34);
  ctx.rotate(-r);
  ctx.fillStyle = "#fff3b4";
  ctx.beginPath();
  ctx.moveTo(-5, 0);
  ctx.lineTo(4, -radius / 2);
  ctx.lineTo(radius, 0);
  ctx.lineTo(4, radius / 2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
export function drawBlast(ctx, blast, reducedMotion) {
  const progress = blast.age / 0.55;
  ctx.save();
  ctx.globalAlpha = (1 - progress) * 0.8;
  ctx.strokeStyle = "#ffe6a4";
  ctx.lineWidth = 5 * (1 - progress);
  ctx.beginPath();
  ctx.arc(
    blast.x,
    blast.y,
    reducedMotion ? 30 : 12 + progress * 52,
    0,
    Math.PI * 2,
  );
  ctx.stroke();
  ctx.fillStyle = "#fff6d4";
  ctx.beginPath();
  ctx.arc(blast.x, blast.y, Math.max(0, 22 * (1 - progress)), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
