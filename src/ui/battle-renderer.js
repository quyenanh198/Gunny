import { WIDTH, HEIGHT, step, collides, ROCK_Y } from "../physics.js";
import { WEAPONS } from "../assets.js";
import { drawCharacter, drawWeapon, drawMuzzle, drawBlast } from "../sprites.js";

let ctx, images, groundLayer, reducedMotion, isPaused;

export function renderBattle(match, options) {
  ({ ctx, images, groundLayer, reducedMotion, paused: isPaused = false } = options);
  render(match);
}

function ellipse(x, y, rx, ry, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}
function path(points, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
}
function character(m, a, i) {
  const sprite = images.get(a.skin),
    active = m.turn === i && m.phase !== "over";
  ctx.save();
  if (a.hp <= 0) ctx.globalAlpha = 0.45;
  // Stand perpendicular to the slope; the weapon inherits the tilt, matching launch().
  ctx.translate(a.x, a.y);
  ctx.rotate((-m.tiltOf(a) * Math.PI) / 180);
  ctx.translate(-a.x, -a.y);
  if (sprite) {
    const facing = a.animation.state === "walk" ? a.animation.moveDirection : a.angle > 90 ? -1 : 1;
    drawCharacter(ctx, sprite, a, facing, active, {
      flash: a.hurt / 0.3,
      sheet: images.get(`${a.skin}-animation`),
      reducedMotion,
    });
  } else {
    // Minimal stand-in when the sprite failed to load.
    ellipse(a.x, a.y, 25, 5, "#183a3e35");
    ellipse(a.x, a.y - 40, 22, 40, a.team ? "#ec9b6c" : "#7ebbc9");
    ellipse(a.x, a.y - 88, 24, 24, "#fff0d5");
    if (active)
      path(
        [
          [a.x - 7, a.y - 125],
          [a.x + 7, a.y - 125],
          [a.x, a.y - 116],
        ],
        "#ffe3a0",
      );
  }
  drawWeapon(ctx, images.get(a.weapon), a, a.angle, reducedMotion);
  drawMuzzle(ctx, a, a.angle, reducedMotion);
  ctx.restore();

  // Draw floating companion pet beside actor
  if (a.pet && a.hp > 0) {
    ctx.save();
    const petOffset = a.angle > 90 ? 34 : -34;
    const petBob = !reducedMotion && !isPaused ? Math.sin(Date.now() * 0.005) * 5 : 0;
    ctx.translate(a.x + petOffset, a.y - 75 + petBob);
    ctx.shadowColor = a.pet.color || "#ff5252";
    ctx.shadowBlur = 8;
    ellipse(0, 0, 12, 10, a.pet.color || "#ff5252");
    ellipse(a.angle > 90 ? -3 : 3, -2, 2.5, 2.5, "#ffffff");
    ellipse(a.angle > 90 ? -4 : 4, -2, 1.2, 1.2, "#111111");
    ctx.restore();
  }

  // Name tag so teams of several actors stay readable.
  ctx.font = "800 20px 'Be Vietnam Pro', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#1c3b41";
  ctx.strokeText(a.name, a.x, a.y - 134);
  ctx.fillStyle = a.team === 0 ? "#d2ef9c" : "#ffb494";
  ctx.fillText(a.name, a.x, a.y - 134);
}
const windParticles = Array.from({ length: 28 }, (_, i) => ({
  x: (i * 47) % WIDTH,
  y: 30 + ((i * 53) % (HEIGHT - 120)),
  speed: 12 + (i % 5) * 8,
  size: 2 + (i % 3),
  color: i % 3 === 0 ? "rgba(255, 192, 203, 0.55)" : "rgba(255, 255, 220, 0.4)",
  sway: i * 1.5,
}));

function render(m) {
  const { actors, projectile, trail } = m;
  ctx.save();
  if (m.shake > 0 && !reducedMotion && !isPaused) {
    const trauma = Math.min(1, m.shake / 0.55);
    const intensity = trauma * trauma;
    const ox = (Math.random() * 2 - 1) * 14 * intensity;
    const oy = (Math.random() * 2 - 1) * 14 * intensity;
    const rot = (Math.random() * 2 - 1) * 0.02 * intensity;
    ctx.translate(WIDTH / 2 + ox, HEIGHT / 2 + oy);
    ctx.rotate(rot);
    ctx.translate(-WIDTH / 2, -HEIGHT / 2);
  }
  // Each arena brings its own sky and soil texture.
  if (images.has(m.map.background)) ctx.drawImage(images.get(m.map.background), 0, 0, WIDTH, HEIGHT);
  else {
    const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(0, "#a6d9df");
    sky.addColorStop(1, "#f2f3cc");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  // Atmospheric wind visualization (drifting leaves/petals reflecting wind speed & direction)
  if (!reducedMotion) {
    const windPush = m.wind * 4.5;
    for (const wp of windParticles) {
      if (!isPaused) {
        wp.x += (wp.speed + windPush) * 0.016;
        wp.y += Math.sin(wp.sway + (wp.t = (wp.t || 0) + 0.016)) * 0.25;
        if (wp.x > WIDTH + 15) wp.x = -15;
        else if (wp.x < -15) wp.x = WIDTH + 15;
      }
      ctx.save();
      ellipse(wp.x, wp.y, wp.size, wp.size * 0.7, wp.color);
      ctx.restore();
    }
  }

  if (groundLayer) ctx.drawImage(groundLayer, 0, 0);
  else {
    ctx.beginPath();
    ctx.moveTo(0, HEIGHT);
    m.terrain.forEach((y, x) => ctx.lineTo(x, y));
    ctx.lineTo(WIDTH, HEIGHT);
    ctx.closePath();
    ctx.fillStyle = "#aa8760";
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = "#4a4552";
    ctx.fillRect(0, ROCK_Y, WIDTH, HEIGHT - ROCK_Y);
    ctx.fillStyle = "#7a7284";
    ctx.fillRect(0, ROCK_Y, WIDTH, 3);
    ctx.restore();
    ctx.beginPath();
    m.terrain.forEach((y, x) => (x ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = "#71984f";
    ctx.lineWidth = 15;
    ctx.stroke();
  }
  actors.forEach((a, i) => character(m, a, i));
  if (m.playerCanAct) {
    const p = m.previewShot(m.charging ? m.charge : 50);
    for (let n = 0; n < 38; n++) {
      step(p, m.wind, 0.025);
      if (collides(p, m.terrain)) break;
      if (n % 4 === 0) ellipse(p.x, p.y, 2.5, 2.5, "#ffffefaa");
    }
  }
  const weaponColor = WEAPONS.find((w) => w.id === m.current.weapon).color;
  trail.forEach((p, i) => ellipse(p.x, p.y, (3 * i) / trail.length, (3 * i) / trail.length, weaponColor + "bb"));
  if (projectile) {
    ctx.save();
    ctx.translate(projectile.x, projectile.y);
    ctx.rotate(Math.atan2(projectile.vy, projectile.vx));
    ellipse(0, 0, 10, 7, weaponColor);
    ellipse(-3, -2, 3, 2.5, "#fff0b7");
    ctx.restore();
    if (projectile.y < 0) {
      // Above the frame: marker below the scoreboard plus height, so the shot stays trackable.
      const x = Math.max(30, Math.min(WIDTH - 30, projectile.x));
      path(
        [
          [x - 12, 140],
          [x + 12, 140],
          [x, 120],
        ],
        weaponColor,
      );
      ctx.font = "800 26px 'Be Vietnam Pro', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#3a2a1d";
      ctx.strokeText(`${Math.round(-projectile.y)} px`, x, 168);
      ctx.fillStyle = "#ffffffdd";
      ctx.fillText(`${Math.round(-projectile.y)} px`, x, 168);
    }
  }
  m.blasts.forEach((blast) => drawBlast(ctx, blast, reducedMotion));
  m.particles.forEach((p) => {
    const alpha = Math.max(0, p.life / (p.maxLife || 0.7));
    ctx.save();
    ctx.globalAlpha = alpha;
    if (p.type === "smoke") {
      const growth = (1 - alpha) * 8;
      ellipse(p.x, p.y, (p.size || 6) + growth, (p.size || 6) + growth, p.color);
    } else if (p.type === "debris") {
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    } else {
      ellipse(p.x, p.y, p.size || 3.5, p.size || 3.5, p.color);
    }
    ctx.restore();
  });
  ctx.globalAlpha = 1;
  // Large numbers with distinct styling for critical direct hits
  m.popups.forEach((p) => {
    ctx.save();
    ctx.globalAlpha = Math.min(1, p.life * 2);
    const y = p.y - (1 - p.life) * 40;
    if (p.critical) {
      ctx.font = "900 40px 'Be Vietnam Pro', system-ui, sans-serif";
      ctx.lineWidth = 6;
      ctx.strokeStyle = "#5a1005";
      ctx.strokeText(p.text, p.x, y);
      ctx.fillStyle = "#ffe44d";
      ctx.fillText(p.text, p.x, y);
    } else {
      ctx.font = "900 34px 'Be Vietnam Pro', system-ui, sans-serif";
      ctx.lineWidth = 5;
      ctx.strokeStyle = "#3a2a1d";
      ctx.strokeText(p.text, p.x, y);
      ctx.fillStyle = "#ffd27b";
      ctx.fillText(p.text, p.x, y);
    }
    ctx.restore();
  });
  ctx.globalAlpha = 1;
  ctx.restore();
}
