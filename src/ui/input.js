export function bindBattleInput({ $, getActive, getPaused, setPaused }) {
const active = getActive;
const beginCharge = () => {
  if (!getPaused()) active()?.beginCharge();
};
const release = () => {
  const m = active();
  if (!m) return;
  if (getPaused()) m.cancelCharge();
  else m.release();
};
$("fire").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  $("fire").setPointerCapture(e.pointerId);
  beginCharge();
});
$("fire").addEventListener("pointerup", release);
$("fire").addEventListener("pointercancel", () => active()?.cancelCharge());
for (const id of ["left", "right"]) {
  $(id).addEventListener("pointerdown", (e) => {
    e.preventDefault();
    $(id).setPointerCapture(e.pointerId);
    active()?.keys.add(id);
  });
  $(id).addEventListener("pointerup", () => active()?.keys.delete(id));
  $(id).addEventListener("pointercancel", () => active()?.keys.delete(id));
}
$("angle").addEventListener("input", () => active()?.setAim(+$("angle").value));
document.querySelectorAll("[data-angle-step]").forEach((button) =>
  button.addEventListener("click", () => {
    const match = active();
    if (match && !getPaused()) match.setAim(match.current.angle + Number(button.dataset.angleStep));
  }),
);
document.querySelectorAll("[data-shot]").forEach((button) =>
  button.addEventListener("click", () => active()?.setAction({ shot: button.dataset.shot })),
);
$("battleItem").addEventListener("change", () => active()?.setAction({ item: $("battleItem").value || null }));
const keyMap = { a: "left", d: "right", ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
window.addEventListener("keydown", (e) => {
  if (getPaused() || !active() || e.target.closest("input,button,select")) return;
  if (keyMap[e.key]) {
    e.preventDefault();
    active().keys.add(keyMap[e.key]);
  }
  if (e.code === "Space") {
    e.preventDefault();
    if (!e.repeat) beginCharge();
  }
});
window.addEventListener("keyup", (e) => {
  if (keyMap[e.key]) active()?.keys.delete(keyMap[e.key]);
  if (e.code === "Space" && active()) {
    e.preventDefault();
    release();
  }
});
$("fire").addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "Enter") {
    e.preventDefault();
    if (!e.repeat) beginCharge();
  }
});
$("fire").addEventListener("keyup", (e) => {
  if (e.code === "Space" || e.code === "Enter") {
    e.preventDefault();
    release();
  }
});
window.addEventListener("blur", () => active()?.cancelCharge());
window.addEventListener("orientationchange", () => active()?.cancelCharge());
document.addEventListener("visibilitychange", () => {
  setPaused(document.hidden || $("guide").open);
  active()?.cancelCharge();
});
$("help").onclick = () => {
  active()?.cancelCharge();
  setPaused(true);
  $("guide").showModal();
};
$("closeHelp").onclick = () => $("guide").close();
$("guide").addEventListener("close", () => setPaused(document.hidden));

}
