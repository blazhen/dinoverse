// Seeded, chunk-based procedural level generator.
// Levels are built by stitching hand-authored "chunks" left-to-right on continuous ground,
// so every generated level is guaranteed traversable. A `difficulty` value (1..10) controls
// which chunks appear, how many hazards, and how fast moving platforms go — separate from the
// level number, so adaptive difficulty can make a struggling kid's levels gentler.

export const GROUND_TOP = 540;
export const WORLD_H = 720;

export interface RectSpec {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: number;
  stroke: number;
}
export interface BoxSpec {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface GemSpec {
  x: number;
  y: number;
}
/** Moving platform: oscillates along `axis` by `range` px at `speed` px/s. */
export interface MoverSpec {
  x: number;
  y: number;
  w: number;
  axis: 'x' | 'y';
  range: number;
  speed: number;
}
export interface HazardSpec {
  x: number;
  y: number;
}
export interface BouncerSpec {
  x: number;
  y: number;
}
export interface LevelSpec {
  level: number;
  difficulty: number;
  worldW: number;
  spawn: { x: number; y: number };
  solids: RectSpec[];
  breakables: BoxSpec[];
  gems: GemSpec[];
  movers: MoverSpec[];
  hazards: HazardSpec[];
  bouncers: BouncerSpec[];
  goal: { x: number; y: number };
}

interface Chunk {
  width: number;
  solids: RectSpec[];
  gems: GemSpec[];
  breakables: BoxSpec[];
  movers: MoverSpec[];
  hazards: HazardSpec[];
  bouncers: BouncerSpec[];
}

const GT = GROUND_TOP;
const plat = (x: number, y: number, w: number): RectSpec => ({ x, y, w, h: 22, fill: 0x65a30d, stroke: 0x4d7c0f });
const over = (x: number, y: number, w: number, h: number): RectSpec => ({ x, y, w, h, fill: 0x7c2d12, stroke: 0x5b2110 });
const empty = (width: number, partial: Partial<Chunk> = {}): Chunk => ({
  width,
  solids: [],
  gems: [],
  breakables: [],
  movers: [],
  hazards: [],
  bouncers: [],
  ...partial,
});

const CHUNKS: Record<string, (x: number, d: number) => Chunk> = {
  flat: (x) => empty(280, { gems: [{ x: x + 140, y: GT - 40 }] }),

  stepUpGem: (x) =>
    empty(360, {
      solids: [plat(x + 90, GT - 70, 120), plat(x + 250, GT - 128, 120)],
      gems: [{ x: x + 90, y: GT - 110 }, { x: x + 250, y: GT - 168 }],
    }),

  gemArc: (x) =>
    empty(300, {
      solids: [plat(x + 150, GT - 80, 150)],
      gems: [{ x: x + 110, y: GT - 120 }, { x: x + 150, y: GT - 145 }, { x: x + 190, y: GT - 120 }],
    }),

  crackedBlock: (x) =>
    empty(250, {
      breakables: [{ x: x + 110, y: GT - 35, w: 40, h: 70 }],
      gems: [{ x: x + 175, y: GT - 30 }],
    }),

  gapPlatforms: (x) =>
    empty(420, {
      solids: [plat(x + 80, GT - 110, 120), plat(x + 320, GT - 110, 120)],
      gems: [{ x: x + 320, y: GT - 150 }],
    }),

  crawlTunnel: (x) =>
    empty(330, {
      solids: [over(x + 150, GT - 135, 180, 210)],
      gems: [{ x: x + 280, y: GT - 40 }],
    }),

  staircaseHighGem: (x) =>
    empty(430, {
      solids: [plat(x + 80, GT - 85, 110), plat(x + 210, GT - 160, 110), plat(x + 340, GT - 235, 120)],
      gems: [{ x: x + 340, y: GT - 275 }],
    }),

  // Pillars to hop across (small jumpable gaps), gem on each top.
  pillars: (x) =>
    empty(440, {
      solids: [plat(x + 60, GT - 95, 70), plat(x + 210, GT - 135, 70), plat(x + 360, GT - 95, 70)],
      gems: [{ x: x + 60, y: GT - 135 }, { x: x + 210, y: GT - 175 }, { x: x + 360, y: GT - 135 }],
    }),

  // One cactus on easy; two (spaced far apart) when harder.
  hazardRow: (x, d) =>
    d >= 6
      ? empty(500, { hazards: [{ x: x + 130, y: GT - 22 }, { x: x + 350, y: GT - 22 }], gems: [{ x: x + 240, y: GT - 95 }] })
      : empty(360, { hazards: [{ x: x + 180, y: GT - 22 }], gems: [{ x: x + 180, y: GT - 95 }] }),

  // Ride a horizontal moving platform over a cactus; never overlaps the end ledges.
  movingBridge: (x, d) =>
    empty(560, {
      solids: [plat(x + 60, GT - 120, 100), plat(x + 500, GT - 120, 100)],
      movers: [{ x: x + 185, y: GT - 120, w: 90, axis: 'x', range: 180, speed: 55 + d * 11 }],
      hazards: [{ x: x + 285, y: GT - 22 }],
      gems: [{ x: x + 500, y: GT - 160 }],
    }),

  // Vertical elevator up to a high ledge + gems.
  elevator: (x, d) =>
    empty(380, {
      solids: [plat(x + 250, GT - 235, 120)],
      movers: [{ x: x + 110, y: GT - 55, w: 90, axis: 'y', range: 190, speed: 42 + d * 7 }],
      gems: [{ x: x + 110, y: GT - 225 }, { x: x + 250, y: GT - 275 }],
    }),

  // Bounce pad: land on it to spring high up to a gem.
  bouncePad: (x) =>
    empty(300, {
      bouncers: [{ x: x + 150, y: GT - 12 }],
      gems: [{ x: x + 150, y: GT - 150 }, { x: x + 150, y: GT - 230 }],
    }),
};

function mulberry32(seed: number): () => number {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateLevel(level: number, difficulty?: number): LevelSpec {
  const d = Math.max(1, Math.min(10, Math.round(difficulty ?? level)));
  const rng = mulberry32((((level * 73856093) ^ (d * 19349663)) >>> 0) ^ 0x9e3779b9);

  const pool = ['flat', 'stepUpGem', 'gemArc', 'crackedBlock'];
  if (d >= 3) pool.push('gapPlatforms', 'hazardRow', 'pillars');
  if (d >= 4) pool.push('crawlTunnel', 'elevator', 'bouncePad');
  if (d >= 5) pool.push('staircaseHighGem', 'movingBridge');
  if (d >= 7) pool.push('movingBridge', 'elevator', 'hazardRow'); // weight harder chunks more

  const count = Math.min(4 + level, 12);

  const solids: RectSpec[] = [];
  const gems: GemSpec[] = [];
  const breakables: BoxSpec[] = [];
  const movers: MoverSpec[] = [];
  const hazards: HazardSpec[] = [];
  const bouncers: BouncerSpec[] = [];

  let x = 140;
  for (let i = 0; i < count; i++) {
    const key = i === 0 ? 'flat' : (pool[Math.floor(rng() * pool.length)] ?? 'flat');
    const chunk = CHUNKS[key]!(x, d);
    solids.push(...chunk.solids);
    gems.push(...chunk.gems);
    breakables.push(...chunk.breakables);
    movers.push(...chunk.movers);
    hazards.push(...chunk.hazards);
    bouncers.push(...chunk.bouncers);
    x += chunk.width + 60;
  }

  x += 160;
  const goal = { x, y: GT - 24 };
  const worldW = x + 220;

  return { level, difficulty: d, worldW, spawn: { x: 90, y: GT - 80 }, solids, breakables, gems, movers, hazards, bouncers, goal };
}
