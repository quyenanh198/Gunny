import { WIDTH, makeTerrain } from "./physics.js";

const bell = (x, center, spread) => Math.exp(-(((x - center) / spread) ** 2));

export const MAPS = [
  {
    id: "sky",
    name: "Đảo Gió Xanh",
    number: "01",
    description: "Đồi cỏ thoai thoải giữa những tầng mây.",
    background: "background",
    ground: "ground",
    preview: "environment/sky-islands.webp",
    spawns: [205, 980],
    spawnZones: [[40, 540], [660, 1160]],
    createTerrain: makeTerrain,
  },
  {
    id: "candy",
    name: "Thung Lũng Kẹo",
    number: "02",
    description: "Hai gò bánh ngọt ôm lấy lòng chảo ở giữa.",
    background: "candy-background",
    ground: "candy-ground",
    preview: "environment/candy-valley.webp",
    spawns: [205, 980],
    spawnZones: [[90, 470], [730, 1110]],
    createTerrain: () =>
      Array.from(
        { length: WIDTH },
        (_, x) =>
          484 -
          76 * bell(x, 205, 175) -
          76 * bell(x, 980, 175) +
          5 * Math.sin(x / 65),
      ),
  },
  {
    id: "moon",
    name: "Đêm Nấm Phát Sáng",
    number: "03",
    description: "Gò rêu lệch nhau dưới ánh trăng xanh tím.",
    background: "moon-background",
    ground: "moon-ground",
    preview: "environment/moonlit-grove.webp",
    spawns: [180, 1010],
    spawnZones: [[70, 480], [760, 1130]],
    createTerrain: () =>
      Array.from(
        { length: WIDTH },
        (_, x) =>
          461 -
          58 * bell(x, 350, 170) -
          40 * bell(x, 865, 115) +
          12 * Math.sin(x / 90),
      ),
  },
  {
    id: "death",
    name: "Death Valley",
    number: "04",
    description: "Khe đá khô cằn với sống núi cao ở trung tâm.",
    background: "death-background",
    ground: "death-ground",
    preview: "environment/death-valley.webp",
    spawns: [170, 1030],
    spawnZones: [[60, 430], [770, 1140]],
    createTerrain: () =>
      Array.from(
        { length: WIDTH },
        (_, x) =>
          472 -
          54 * bell(x, 170, 135) -
          72 * bell(x, 610, 120) -
          48 * bell(x, 1030, 145) +
          7 * Math.sin(x / 48),
      ),
  },
  {
    id: "celestial",
    name: "Thiên Tinh",
    number: "05",
    description: "Ba gò pha lê trôi giữa biển mây và ngân hà.",
    background: "celestial-background",
    ground: "celestial-ground",
    preview: "environment/celestial-stars.webp",
    spawns: [205, 990],
    spawnZones: [[70, 470], [730, 1130]],
    createTerrain: () =>
      Array.from(
        { length: WIDTH },
        (_, x) =>
          475 -
          52 * bell(x, 205, 145) -
          86 * bell(x, 600, 120) -
          60 * bell(x, 990, 155) +
          6 * Math.sin(x / 74),
      ),
  },
];
