import { CHARACTERS, assetURL } from "../assets.js";
import { MAX_ROUNDS } from "../match.js";

let $, session, paused;

export function syncHud(match, options) {
  ({ $, session, paused } = options);
  sync(match);
}

function teamFace(m, team) {
  if (m.current.team === team) return m.current;
  const alive = m.alive(team);
  return alive[m.cursor[team] % alive.length] || m.actors.find((a) => a.team === team);
}

function sync(m) {
  for (const team of [0, 1]) {
    const face = teamFace(m, team),
      size = m.actors.filter((a) => a.team === team).length;
    $("name" + team).textContent = face.name;
    $("tag" + team).textContent =
      face.control === "bot" ? "BOT" : face.player === session.you.player ? "BẠN" : `NGƯỜI ${face.player}`;
    $("hp" + team).max = size * 100;
    $("hp" + team).value = m.teamHp(team);
    $("health" + team).textContent = `${m.teamHp(team)} / ${size * 100} HP`;
    const img = $("avatar" + team),
      src = assetURL(CHARACTERS.find((c) => c.id === face.skin).file);
    if (img.getAttribute("src") !== src) img.src = src;
    img.alt = face.name;
  }
  $("round").textContent = `LƯỢT ${String(m.round).padStart(2, "0")}/${MAX_ROUNDS}`;
  $("timer").textContent = Math.ceil(m.time);
  // Wind is px/s² in physics (max 30); players see a 0..10 scale.
  $("wind").textContent = m.wind
    ? `GIÓ ${m.wind < 0 ? "←" : "→"} cấp ${Math.ceil(Math.abs(m.wind) / 3)}`
    : "GIÓ LẶNG";
  $("energy").textContent = `${Math.ceil(m.energy)} / 100`;
  const tilt = Math.round(m.tiltOf(m.current));
  $("angle").value = m.current.angle;
  $("angleValue").firstChild.textContent = Math.round(m.current.angle) + "° ";
  $("tiltValue").textContent = tilt ? `${tilt > 0 ? "+" : ""}${tilt}° dốc` : "";
  $("powerValue").textContent = Math.round(m.charge) + "%";
  $("powerFill").style.width = m.charge + "%";
  $("status").textContent = m.status;
  const disabled = !m.playerCanAct || paused;
  ["fire", "angle", "left", "right"].forEach((id) => ($(id).disabled = disabled));
  document.querySelectorAll("#battleWeapons button").forEach((b) => {
    b.disabled = disabled || m.charging;
    b.setAttribute("aria-pressed", String(b.dataset.id === m.current.weapon));
  });
  $("battleHint").textContent = m.playerCanAct ? "" : `chờ ${m.current.name}…`;
  $("ssValue").textContent = `SS ${Math.round(m.current.ss || 0)}%`;
  $("battleItem").value = m.item || "";
  $("battleItem").disabled = disabled || m.charging;
  document.querySelectorAll("[data-shot]").forEach((button) => {
    button.disabled = disabled || m.charging || (button.dataset.shot === "ss" && (m.current.ss || 0) < 100);
    button.setAttribute("aria-pressed", String(button.dataset.shot === (m.shotType || "s1")));
  });
  $("turnQueue").textContent = (m.upcoming || []).slice(0, 5).map((index) => m.actors[index]?.name).filter(Boolean).join(" › ");
  $("turnHint").textContent =
    m.phase === "over" ? "Trận đấu kết thúc" : m.current.control === "human" ? `Lượt của ${m.current.name}` : "Bot đang ngắm";
  $("matchTag").textContent = session.online ? `PHÒNG ${session.id}` : "LUYỆN TẬP";
  $("mapName").textContent = m.map.name;
  $("mapNumber").textContent = m.map.number;
  $("mapDescription").textContent = m.map.description;
  $("versus").textContent = m.teams.map((t) => t.humans + t.bots).join(" VS ");
  const over = m.phase === "over";
  $("result").hidden = !over;
  if (over) {
    const total = (m.stats || []).reduce((sum, stat) => ({
      shots: sum.shots + stat.shots,
      hits: sum.hits + stat.hits,
      damage: sum.damage + stat.damage,
      terrainDamage: sum.terrainDamage + stat.terrainDamage,
      totalDelay: sum.totalDelay + stat.totalDelay,
    }), { shots: 0, hits: 0, damage: 0, terrainDamage: 0, totalDelay: 0 });
    const hitRate = total.shots ? Math.round((total.hits / total.shots) * 100) : 0;
    const averageDelay = total.shots ? Math.round(total.totalDelay / total.shots) : 0;
    $("resultText").textContent = `${m.status} · Trúng ${hitRate}% · ${total.damage} damage · ${Math.round(total.terrainDamage)} đất · delay TB ${averageDelay}`;
    $("restart").hidden = session.online && !session.host;
    $("toLobby").textContent = session.online && !session.host ? "Rời phòng" : "Về phòng chờ";
  }
}
