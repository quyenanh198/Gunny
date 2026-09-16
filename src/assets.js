export const CHARACTERS = [
  { id: "mochi", name: "Mochi", file: "characters/mochi.png" },
  { id: "hat-de", name: "Hạt Dẻ", file: "characters/hat-de.png" },
  { id: "bzz", name: "Bzz", file: "characters/bzz.png" },
  { id: "nemu", name: "Nemu", file: "characters/nemu.png" },
];
export const WEAPONS = [
  {
    id: "carrot",
    name: "Pháo cà rốt",
    file: "weapons/carrot.png",
    color: "#ffac59",
  },
  {
    id: "acorn",
    name: "Cối hạt dẻ",
    file: "weapons/acorn.png",
    color: "#ccaa78",
  },
  {
    id: "honey",
    name: "Súng mật ong",
    file: "weapons/honey.png",
    color: "#ffda62",
  },
  {
    id: "bubble",
    name: "Súng bong bóng",
    file: "weapons/bubble.png",
    color: "#edb5ff",
  },
  {
    id: "fish",
    name: "Pháo cá nước",
    file: "weapons/fish.png",
    color: "#88ddff",
  },
  { id: "star", name: "Ná sao", file: "weapons/star.png", color: "#fff08e" },
];
export const ENVIRONMENT = [
  { id: "candy-background", file: "environment/candy-valley.webp" },
  { id: "candy-ground", file: "environment/cake-ground.webp" },
  { id: "moon-background", file: "environment/moonlit-grove.webp" },
  { id: "moon-ground", file: "environment/moss-ground.webp" },
  { id: "death-background", file: "environment/death-valley.webp" },
  { id: "death-ground", file: "environment/death-ground.webp" },
  { id: "celestial-background", file: "environment/celestial-stars.webp" },
  { id: "celestial-ground", file: "environment/celestial-ground.webp" },
  { id: "background", file: "environment/sky-islands.webp" },
  { id: "ground", file: "environment/grass-earth.webp" },
];
export const ANIMATION_ASSETS = CHARACTERS.map((character) => ({
  id: `${character.id}-animation`,
  file: `animations/${character.id}.webp`,
}));
export const ASSET_LIST = [
  ...CHARACTERS,
  ...WEAPONS,
  ...ENVIRONMENT,
  ...ANIMATION_ASSETS,
];
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
