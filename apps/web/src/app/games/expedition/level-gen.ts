// Seeded, chunk-based procedural level generator.
// Levels are built by stitching hand-authored "chunks" left-to-right on continuous ground,
// so every generated level is guaranteed traversable. Difficulty scales with the level number.

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
export interface LevelSpec {
  level: number;
  worldW: number;
  spawn: { x: number; y: number };
  solids: RectSpec[];
  breakables: BoxSpec[];
  gems: GemSpec[];
  goal: { x: number; y: number };
}

interface Chunk {
  width: number;
  solids: RectSpec[];
  gems: GemSpec[];
  breakables: BoxSpec[];
}

const GT = GROUND_TOP;
const plat = (x: number, y: number, w: number): RectSpec => ({
  x,
  y,
  w,
  h: 22,
  fill: 0x65a30d,
  stroke: 0x4d7c0f,
});
const over = (x: number, y: number, w: number, h: number): RectSpec => ({
  x,
  y,
  w,
  h,
  fill: 0x7c2d12,
  stroke: 0x5b2110,
});

// Each chunk places content above a continuous ground at GROUND_TOP. All gaps/steps are
// within a single jump, and crawl tunnels are passable by any dino — so any sequence is fair.
const CHUNKS: Record<string, (x: number) => Chunk> = {
  flat: (x) => ({ width: 280, solids: [], breakables: [], gems: [{ x: x + 140, y: GT - 40 }] }),

  stepUpGem: (x) => ({
    width: 360,
    solids: [plat(x + 90, GT - 70, 120), plat(x + 250, GT - 128, 120)],
    breakables: [],
    gems: [
      { x: x + 90, y: GT - 110 },
      { x: x + 250, y: GT - 168 },
    ],
  }),

  gemArc: (x) => ({
    width: 300,
    solids: [plat(x + 150, GT - 80, 150)],
    breakables: [],
    gems: [
      { x: x + 110, y: GT - 120 },
      { x: x + 150, y: GT - 145 },
      { x: x + 190, y: GT - 120 },
    ],
  }),

  crackedBlock: (x) => ({
    width: 250,
    solids: [],
    breakables: [{ x: x + 110, y: GT - 35, w: 40, h: 70 }],
    gems: [{ x: x + 175, y: GT - 30 }],
  }),

  gapPlatforms: (x) => ({
    width: 420,
    solids: [plat(x + 80, GT - 110, 120), plat(x + 320, GT - 110, 120)],
    breakables: [],
    gems: [{ x: x + 320, y: GT - 150 }],
  }),

  crawlTunnel: (x) => ({
    width: 330,
    // Tall overhang (top at GT-240) so you can't jump over — everyone crawls the 30px gap under it.
    solids: [over(x + 150, GT - 135, 180, 210)],
    breakables: [],
    gems: [{ x: x + 280, y: GT - 40 }],
  }),

  staircaseHighGem: (x) => ({
    width: 430,
    solids: [plat(x + 80, GT - 85, 110), plat(x + 210, GT - 160, 110), plat(x + 340, GT - 235, 120)],
    breakables: [],
    gems: [{ x: x + 340, y: GT - 275 }],
  }),
};

/** Tiny seeded PRNG (mulberry32) so a level number always yields the same level. */
function mulberry32(seed: number): () => number {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateLevel(level: number): LevelSpec {
  const rng = mulberry32(((level * 2654435761) >>> 0) ^ 0x9e3779b9);

  const easy = ['flat', 'stepUpGem', 'gemArc', 'crackedBlock'];
  const medium = [...easy, 'gapPlatforms', 'crawlTunnel'];
  const hard = [...medium, 'staircaseHighGem'];
  const pool = level <= 2 ? easy : level <= 4 ? medium : hard;

  const count = Math.min(4 + level, 11);

  const solids: RectSpec[] = [];
  const gems: GemSpec[] = [];
  const breakables: BoxSpec[] = [];

  let x = 140; // clear start area (spawn is at x=90)
  for (let i = 0; i < count; i++) {
    // First chunk is always flat so you ease in.
    const key = i === 0 ? 'flat' : (pool[Math.floor(rng() * pool.length)] ?? 'flat');
    const chunk = CHUNKS[key]!(x);
    solids.push(...chunk.solids);
    gems.push(...chunk.gems);
    breakables.push(...chunk.breakables);
    x += chunk.width + 60; // spacing between chunks
  }

  x += 160; // run-up to the goal
  const goal = { x, y: GT - 24 };
  const worldW = x + 220;

  return { level, worldW, spawn: { x: 90, y: GT - 80 }, solids, breakables, gems, goal };
}
