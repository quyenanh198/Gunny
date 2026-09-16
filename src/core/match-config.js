import { CHARACTERS, WEAPONS } from "../assets.js";

export const MAX_ROUNDS = 30;
export const TURN_TIME = 25;
export const START_HP = 100;
export const MAX_TEAM = 3;
export const DIFFICULTIES = [
  { id: "easy", name: "Dễ", angleJitter: 10, powerJitter: 14, angleStep: 6, powerStep: 4 },
  { id: "normal", name: "Vừa", angleJitter: 5, powerJitter: 8, angleStep: 3, powerStep: 2 },
  { id: "hard", name: "Khó", angleJitter: 2, powerJitter: 3, angleStep: 3, powerStep: 2 },
];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normaliseRoster(roster) {
  const skinIds = CHARACTERS.map((character) => character.id);
  const weaponIds = WEAPONS.map((weapon) => weapon.id);
  let humans = 0;
  return [0, 1].map((team) => {
    const members = (Array.isArray(roster?.[team]) ? roster[team] : []).slice(0, MAX_TEAM).map((member) => {
      const control = member?.control === "bot" ? "bot" : "human";
      const skin = skinIds.includes(member?.skin) ? member.skin : null;
      const weapon = weaponIds.includes(member?.weapon) ? member.weapon : null;
      const typed = typeof member?.name === "string" ? member.name.trim().slice(0, 16) : "";
      if (control === "human") humans++;
      return { control, skin, weapon, name: typed || (control === "human" ? `Người ${humans}` : "") };
    });
    return members.length ? members : [{ control: "bot", skin: null, weapon: null, name: "" }];
  });
}
