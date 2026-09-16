import { WIDTH, HEIGHT } from "../physics.js";

export const cappedDpr = (value) => Math.max(1, Math.min(2, value || 1));

export function bindResponsive({ $, isBattle }) {
  function fitStage() {
    if (!isBattle()) return;
    const box = $("stage").getBoundingClientRect(),
      board = $("scoreboard"),
      above = getComputedStyle(board).position === "static" ? board.offsetHeight : 0,
      scale = Math.max(0, Math.min(box.width / WIDTH, (box.height - above) / HEIGHT));
    $("frame").style.width = `${Math.floor(WIDTH * scale)}px`;
    $("frame").style.height = `${Math.floor(HEIGHT * scale)}px`;
    const canvas = $("canvas"),
      dpr = cappedDpr(window.devicePixelRatio);
    if (canvas.width !== WIDTH * dpr || canvas.height !== HEIGHT * dpr) {
      canvas.width = WIDTH * dpr;
      canvas.height = HEIGHT * dpr;
      canvas.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }
  new ResizeObserver(fitStage).observe($("stage"));
  window.addEventListener("orientationchange", fitStage);
  return fitStage;
}
