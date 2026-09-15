export const CHARACTERS = [
  { id: "mochi", name: "Mochi", file: "characters/mochi.png" },
  { id: "hat-de", name: "Hạt Dẻ", file: "characters/hat-de.png" },
  { id: "bzz", name: "Bzz", file: "characters/bzz.png" },
  { id: "nemu", name: "Nemu", file: "characters/nemu.png" },
];
export const WEAPONS = [
  // ammo: gravityScale and windScale change the arc, craterRadius the terrain
  // hole, damageMax/damageRadius the blast. Bot uses the same numbers.
  {
    id: "carrot",
    name: "Pháo cà rốt",
    desc: "Cân bằng",
    file: "weapons/carrot.png",
    color: "#ffac59",
    ammo: { gravityScale: 1, windScale: 1, craterRadius: 48, damageMax: 42, damageRadius: 95 },
  },
  {
    id: "acorn",
    name: "Cối hạt dẻ",
    desc: "Nặng · Phá đất · Ít gió",
    file: "weapons/acorn.png",
    color: "#ccaa78",
    ammo: { gravityScale: 1.3, windScale: 0.5, craterRadius: 64, damageMax: 50, damageRadius: 85 },
  },
  {
    id: "honey",
    name: "Súng mật ong",
    desc: "Nổ rộng · Nhẹ đòn",
    file: "weapons/honey.png",
    color: "#ffda62",
    ammo: { gravityScale: 1, windScale: 1, craterRadius: 24, damageMax: 30, damageRadius: 110 },
  },
  {
    id: "bubble",
    name: "Súng bong bóng",
    desc: "Bay xa · Theo gió",
    file: "weapons/bubble.png",
    color: "#edb5ff",
    ammo: { gravityScale: 0.6, windScale: 2, craterRadius: 20, damageMax: 28, damageRadius: 110 },
  },
  {
    id: "fish",
    name: "Pháo cá nước",
    desc: "Xói đất rộng",
    file: "weapons/fish.png",
    color: "#88ddff",
    ammo: { gravityScale: 1, windScale: 1.2, craterRadius: 40, damageMax: 25, damageRadius: 120 },
  },
  {
    id: "star",
    name: "Ná sao",
    desc: "Nhẹ · Chính xác",
    file: "weapons/star.png",
    color: "#fff08e",
    ammo: { gravityScale: 0.9, windScale: 1, craterRadius: 30, damageMax: 36, damageRadius: 90 },
  },
];
export const ENVIRONMENT = [
  { id: "background", file: "environment/sky-islands.webp" },
  { id: "ground", file: "environment/grass-earth.webp" },
];
export const ASSET_LIST = [...CHARACTERS, ...WEAPONS, ...ENVIRONMENT];
export const assetURL = (file) =>
  new URL(`../assets/${file}`, import.meta.url).href;

// A missing or slow asset must not prevent the offline game from starting.
export async function loadAssets(timeoutMs = 8000) {
  const images = new Map();
  const failed = [];
  await Promise.all(
    ASSET_LIST.map(
      (asset) =>
        new Promise((resolve) => {
          const img = new Image();
          const finish = (ok) => {
            clearTimeout(timer);
            img.onload = img.onerror = null;
            if (ok) images.set(asset.id, img);
            else failed.push(asset.id);
            resolve();
          };
          const timer = setTimeout(() => finish(false), timeoutMs);
          img.onload = () => finish(img.naturalWidth > 0);
          img.onerror = () => finish(false);
          img.src = assetURL(asset.file);
        }),
    ),
  );
  return { images, failed };
}
