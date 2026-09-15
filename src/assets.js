export const CHARACTERS = [
  { id: "mochi", name: "Mochi", file: "characters/mochi.png" },
  { id: "hat-de", name: "Hạt Dẻ", file: "characters/hat-de.png" },
  { id: "bzz", name: "Bzz", file: "characters/bzz.png" },
  { id: "nemu", name: "Nemu", file: "characters/nemu.png" },
];
export const WEAPONS = [
  // ammo: gravityScale and windScale change the arc; craterWidth (half width)
  // and craterDepth shape the hole; damageMax/damageRadius the blast; angles is
  // the elevation range the weapon can aim at. Bot uses the same numbers.
  {
    id: "carrot",
    name: "Pháo cà rốt",
    desc: "Xuyên sâu · Góc 10-75",
    file: "weapons/carrot.png",
    color: "#ffac59",
    ammo: { gravityScale: 1, windScale: 1, craterWidth: 34, craterDepth: 62, damageMax: 42, damageRadius: 95, angles: [10, 75] },
  },
  {
    id: "acorn",
    name: "Cối hạt dẻ",
    desc: "Cối · Nổ rộng · Góc 45-85",
    file: "weapons/acorn.png",
    color: "#ccaa78",
    ammo: { gravityScale: 1.3, windScale: 0.5, craterWidth: 72, craterDepth: 44, damageMax: 50, damageRadius: 85, angles: [45, 85] },
  },
  {
    id: "honey",
    name: "Súng mật ong",
    desc: "Nổ rộng · Nhẹ đòn · Góc 15-70",
    file: "weapons/honey.png",
    color: "#ffda62",
    ammo: { gravityScale: 1, windScale: 1, craterWidth: 26, craterDepth: 18, damageMax: 30, damageRadius: 110, angles: [15, 70] },
  },
  {
    id: "bubble",
    name: "Súng bong bóng",
    desc: "Bay xa · Theo gió · Góc 20-80",
    file: "weapons/bubble.png",
    color: "#edb5ff",
    ammo: { gravityScale: 0.6, windScale: 2, craterWidth: 22, craterDepth: 14, damageMax: 28, damageRadius: 110, angles: [20, 80] },
  },
  {
    id: "fish",
    name: "Pháo cá nước",
    desc: "Xói đất rộng · Góc 10-60",
    file: "weapons/fish.png",
    color: "#88ddff",
    ammo: { gravityScale: 1, windScale: 1.2, craterWidth: 58, craterDepth: 22, damageMax: 25, damageRadius: 120, angles: [10, 60] },
  },
  {
    id: "star",
    name: "Ná sao",
    desc: "Nhẹ · Chính xác · Góc 10-85",
    file: "weapons/star.png",
    color: "#fff08e",
    ammo: { gravityScale: 0.9, windScale: 1, craterWidth: 26, craterDepth: 32, damageMax: 36, damageRadius: 90, angles: [10, 85] },
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
