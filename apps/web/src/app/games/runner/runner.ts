import * as THREE from 'three';

import { DinoCharacter, type DinoType } from './dino-character';
import type { RunnerSfx } from './runner-audio';

// Subway-Surfers-style 3D endless runner. Cartoony procedural dinos (DinoCharacter) run a 3-lane
// track. Pure Three.js; runs on web, wraps to iOS/Android via Capacitor.

const LANES = [-2.2, 0, 2.2];
const DINO_SCALE = 0.32; // overall dino size (now drives all axes correctly — bump up/down to taste)
const DINO_FOOT_LIFT = DINO_SCALE * 0.3; // derived: raises the feet to ground level at any scale
const HIGH_OBSTACLE_Y = 1.35; // "slide under" bar — sits at the standing dino's head so you must duck

// Scenery palettes the run cycles through (sky / fog / ground / lane-stripe / trees).
const BIOME_LENGTH = 500; // meters per biome
const BIOMES = [
  { sky: 0xbae6fd, fog: 0xbae6fd, ground: 0x4d7c0f, stripe: 0x65a30d, tree: 0x166534 }, // grassland
  { sky: 0xfde68a, fog: 0xfde68a, ground: 0xb45309, stripe: 0xd97706, tree: 0x4d7c0f }, // desert
  { sky: 0xe0f2fe, fog: 0xe7f5ff, ground: 0x93c5fd, stripe: 0xdbeafe, tree: 0x60a5fa }, // ice
  { sky: 0xb91c1c, fog: 0xb91c1c, ground: 0x451a03, stripe: 0xea580c, tree: 0x7f1d1d }, // lava
  { sky: 0x1e1b4b, fog: 0x1e1b4b, ground: 0x312e81, stripe: 0x818cf8, tree: 0x4338ca }, // night
].map((b) => ({
  sky: new THREE.Color(b.sky),
  fog: new THREE.Color(b.fog),
  ground: new THREE.Color(b.ground),
  stripe: new THREE.Color(b.stripe),
  tree: new THREE.Color(b.tree),
}));

export interface RunnerStats {
  distance: number;
  gems: number;
  hearts: number;
  shield: boolean;
  magnet: boolean;
  speed: number; // current run speed in internal units/sec
  breakReady: boolean; // true when the smash cooldown has expired and a tap will register
  /** Cooldown progress 0..1. 1 = fully ready (next tap will smash). 0 = just hit cooldown
   *  (~1.2s wait). The HUD indicator uses this to draw a filling progress ring + countdown
   *  so the player can see exactly when the next smash will land. */
  breakCooldownProgress: number;
  combo: number; // coin combo multiplier (1 = none)
  lane: number; // 0/1/2 — exposed for multiplayer position broadcast
  y: number; // vertical offset (0 = ground) — exposed for multiplayer
  /** Ability charge 0..1. 0 = no held ability, 1 = one held + ready to fire. Filled
   *  by breaking an Ability Box. With the random-ability redesign this is binary, but
   *  the UI still uses it for the conic-gradient fill so anything in between is
   *  treated as "in transit" (currently unused). */
  abilityCharge: number;
  /** The random ability currently held (set when an Ability Box is broken). All dinos
   *  can hold any kind — character no longer determines what you fire. Null = no ability
   *  held; the on-screen button is empty. */
  heldAbility: 'pull' | 'freeze' | 'thunder' | 'box' | null;
}
export interface RunnerCallbacks {
  onUpdate: (s: RunnerStats) => void;
  /** distance (m), gems, run duration in seconds (for "longest run" history) */
  onGameOver: (distance: number, gems: number, durationSec: number) => void;
  onRune?: (rune: string) => void; // fired when a breakable is smashed (for the reward popup)
  /** MP only — fired when our player collides with a dropped Trex box. The canvas tells
   *  the server (boxHit) so the server can broadcast removal + authoritative effects. */
  onDroppedBoxCollision?: (boxId: string, type: 'water' | 'fire' | 'trap') => void;
}
export type RunnerView = 'follow' | 'close';
export interface RunnerOptions {
  startSpeed?: number;
  accel?: number;
  character?: DinoType;
  view?: RunnerView; // chosen BEFORE the run (fixed for the session — fair in multiplayer)
  sfx?: RunnerSfx; // sound hooks (jump/coin/smash/hit/rune/boost)
  /** Seeded PRNG seed. If set, the track layout is deterministic — required for multiplayer
   *  so every client builds the identical obstacle stream. Omit for solo (uses Math.random). */
  seed?: number;
  /** Optional starting distance offset (meters). Used in MP to stagger spawns so players
   *  don't pile up at z=0. Default 0. */
  startDistance?: number;
  /** Optional starting lane (0/1/2). Spreads spawns laterally in MP. Default 1 (center). */
  startLane?: number;
}

// Public shape used by the multiplayer leaderboard. The race wrapper hands these in via
// `setOpponents`; the runner doesn't itself talk to the network.
export interface RunnerOpponent {
  id: string;
  name: string;
  character: DinoType;
  distance: number;
  lane: number;
  y: number;
  finished?: boolean;
  /** Visual hint: this opponent is currently affected by a Freeze (or Trap box). The
   *  runner tints their ghost icy-blue so the caster can SEE the cast landed. */
  frozen?: boolean;
  /** Visual hint: this opponent is currently affected by a Thunder stun (or Water box).
   *  Tints their ghost amber/yellow. */
  stunned?: boolean;
}

/** A Trex-dropped box in shared MP state. The canvas hands the latest list in via
 *  `setDroppedBoxes` each frame so the runner renders them at the right local-z. */
export interface RunnerDroppedBox {
  id: string;
  ownerId: string;
  type: 'water' | 'fire' | 'trap';
  lane: number;
  distance: number;
}
export interface RunnerHandle {
  destroy: () => void;
  restart: () => void;
  moveLeft: () => void;
  moveRight: () => void;
  jump: () => void;
  slide: () => void;
  /** One smash press. Gold dies in one hit; a 📦 crate cracks on the first press and breaks
   *  (→ JACKPOT) on the second — both must land before the crate scrolls past you. */
  breakBox: () => void;
  /** Fire the per-dino ability if charge is full (otherwise a no-op). Solo: applies the
   *  local effect. Multiplayer: the canvas sends the ability to the server and calls
   *  `consumeAbilityCharge` instead, so this isn't invoked. */
  useAbility: () => void;
  /** MP: burn the on-screen ⚡ charge without firing the local effect. */
  consumeAbilityCharge: () => void;
  /** MP receiver effects (called by the canvas when an opponent fires on us). */
  applyFreeze: (durationMs: number) => void;
  applyStun: (durationMs: number) => void;
  applyHit: () => void;
  /** MP visual: render a transient beam between two players (ids = 'self' for the local
   *  player; otherwise opponent ids from the latest setOpponents call). */
  showAbilityBeam: (from: string | 'self', to: string | 'self', color: number) => void;
  /** MP: tell the runner our own session id so it knows which Leave-Boxes are ours
   *  (we're immune to our own boxes). */
  setSelfId: (id: string) => void;
  /** MP: latest snapshot of Trex-dropped boxes in the room. */
  setDroppedBoxes: (boxes: RunnerDroppedBox[]) => void;
  /** MP: a dropped box was consumed by SOMEONE (we got the broadcast). Remove the
   *  local mesh + prevent any in-flight local collision from re-firing. */
  forgetDroppedBox: (id: string) => void;
  setPaused: (b: boolean) => void;
  /** Multiplayer: hand in the latest opponent snapshots. The runner renders each as a
   *  ghost dino positioned by (my_distance − their_distance) on the z axis. */
  setOpponents: (ops: RunnerOpponent[]) => void;
}

type PowerType = 'shield' | 'magnet';

// Mulberry32 — small fast PRNG. Same seed → identical sequence on every machine, which is how
// we make sure all players in a multiplayer race see the exact same obstacle layout.
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A camera-facing sprite of an emoji, drawn to a canvas — so kids recognize the power-up at a glance.
function makeEmojiSpriteMaterial(emoji: string): THREE.SpriteMaterial {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.font = `${Math.floor(size * 0.78)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, size / 2, size / 2 + size * 0.06);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
}

// A speed-boost icon: ⚡ over a bold "+N" (km/h), outlined so it reads against any background.
function makeSpeedSpriteMaterial(km: number): THREE.SpriteMaterial {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.floor(size * 0.46)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    ctx.fillText('⚡', size / 2, size * 0.32);
    ctx.font = `bold ${Math.floor(size * 0.34)}px system-ui, sans-serif`;
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#1f2937';
    ctx.fillStyle = '#f59e0b';
    ctx.strokeText(`+${km}`, size / 2, size * 0.74);
    ctx.fillText(`+${km}`, size / 2, size * 0.74);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
}

export function createRunner(parent: HTMLDivElement, cb: RunnerCallbacks, opts: RunnerOptions = {}): RunnerHandle {
  const START_SPEED = opts.startSpeed ?? 11;
  const ACCEL = opts.accel ?? 0.25; // gentle ramp — takes ~30s from default start to AUTO_CAP
  const AUTO_CAP = 70 / 3.6; // auto-speed climbs to 70 km/h; ⚡ boosts can still push past
  const MIN_SPEED = 6; // floor after collision penalties (~22 km/h)
  const VIEW: RunnerView = opts.view ?? 'follow';
  // Initial lane — MP can stagger these so players don't pile on top of each other at
  // spawn. Clamped to 0/1/2. Used both for the first frame setup AND reset().
  const initLane = Math.max(0, Math.min(2, opts.startLane ?? 1));
  // Seeded RNG drives obstacle / pickup spawn so multiplayer clients share the same track.
  // Local visuals (particles, camera shake, rune choice) keep Math.random — they don't need
  // to match across clients.
  const rng = opts.seed != null ? makeRng(opts.seed) : Math.random;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbae6fd);
  scene.fog = new THREE.Fog(0xbae6fd, 28, 70);

  // Vertical FOV adapts to aspect ratio. Three.js perspective camera always specifies the
  // VERTICAL FOV — in portrait that gives a narrow horizontal slice, which makes the dino
  // look huge, the track look squished, and the screen show less motion per frame (= feels
  // slower at the same km/h). Widening the FOV in portrait shrinks the dino, exposes more
  // of the track ahead, and brings back the peripheral motion cues that read as "speed".
  const LANDSCAPE_FOV = 62;
  // Portrait gets noticeably wider — perceived speed is dominated by peripheral motion,
  // and a tall-narrow viewport robs the eye of those cues. 84° pushes obstacles past the
  // camera with the same angular velocity the landscape view has at 62°.
  const PORTRAIT_FOV = 84;
  const camera = new THREE.PerspectiveCamera(LANDSCAPE_FOV, parent.clientWidth / parent.clientHeight || 1.6, 0.1, 200);
  const syncCameraFov = () => {
    camera.fov = camera.aspect < 1 ? PORTRAIT_FOV : LANDSCAPE_FOV;
    camera.updateProjectionMatrix();
  };
  syncCameraFov();
  camera.position.set(0, 4.4, 8.5);
  camera.lookAt(0, 1.2, -8);

  // WebGLRenderer construction can fail on machines with broken/disabled WebGL — wrap so
  // the caller sees a real error instead of a silent blank canvas. Also clear the parent
  // first: if a previous canvas was left behind (race conditions on remount), it would
  // visually overlap the new one and cause the flicker some players report.
  while (parent.firstChild && parent.firstChild instanceof HTMLCanvasElement) {
    parent.removeChild(parent.firstChild);
  }
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    throw new Error('WebGL init failed — your browser may have hardware acceleration disabled. ' + (e instanceof Error ? e.message : ''));
  }
  // Safety net: if the GPU goes away (driver crash, tab backgrounded too long, etc.) Three
  // can render to a stale context and produce a white canvas. Log it so devtools shows why.
  renderer.domElement.addEventListener('webglcontextlost', (ev) => {
    ev.preventDefault();
    // eslint-disable-next-line no-console
    console.error('[runner] WebGL context lost — reload the tab to recover.');
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(parent.clientWidth || window.innerWidth, parent.clientHeight || window.innerHeight);
  parent.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(6, 12, 8);
  scene.add(sun);

  const groundMat = new THREE.MeshStandardMaterial({ color: 0x4d7c0f });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(9, 400), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = -180;
  scene.add(ground);

  const stripeMat = new THREE.MeshStandardMaterial({ color: 0x65a30d });
  const stripeGeo = new THREE.BoxGeometry(0.1, 0.02, 2);
  const stripes: THREE.Mesh[] = [];
  for (let i = 0; i < 30; i++) {
    const s = new THREE.Mesh(stripeGeo, stripeMat);
    s.position.set(1.1, 0.02, -i * 6);
    scene.add(s);
    stripes.push(s);
    const s2 = s.clone();
    s2.position.x = -1.1;
    scene.add(s2);
    stripes.push(s2);
  }

  const treeMat = new THREE.MeshStandardMaterial({ color: 0x166534 });
  const treeGeo = new THREE.ConeGeometry(0.8, 2.4, 6);
  const decos: THREE.Mesh[] = [];
  for (let i = 0; i < 22; i++) {
    const tree = new THREE.Mesh(treeGeo, treeMat);
    tree.position.set((i % 2 ? 1 : -1) * 5.8, 1.2, -i * 11);
    scene.add(tree);
    decos.push(tree);
  }

  const player = new THREE.Group();
  const dino = new DinoCharacter({ type: opts.character ?? 'trik', hostControlsHeight: true });
  dino.root.scale.setScalar(DINO_SCALE);
  dino.root.position.y = DINO_FOOT_LIFT;
  dino.root.rotation.y = Math.PI; // face away from the camera (running forward, into -z)
  dino.play('run');
  player.add(dino.root);
  player.position.x = LANES[initLane]!; // honour optional startLane on first frame
  scene.add(player);

  // A shield bubble around the player when shielded — sized to the dino, not the old box.
  const shieldBubble = new THREE.Mesh(
    new THREE.SphereGeometry(DINO_SCALE * 2.7, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.3, emissive: 0x0ea5e9, emissiveIntensity: 0.3 }),
  );
  shieldBubble.position.y = DINO_SCALE * 1.8;
  shieldBubble.visible = false;
  player.add(shieldBubble);

  interface Ob {
    mesh: THREE.Mesh;
    lane: number;
    type: 'low' | 'high';
    shadow?: THREE.Mesh; // ground shadow under flying (high) boxes
    bumped?: boolean; // a side-bump bounce already fired for this box (don't repeat)
  }
  interface Breakable {
    mesh: THREE.Mesh;
    shadow?: THREE.Mesh; // for flying (high) gold boxes
    shape: 'low' | 'high' | 'crate'; // gold low/high are avoidable; crate always blocks
    halfW: number; // collision half-width (gold ~1.1 = 1 lane; crate ~1.9 = 2 lanes)
    hp: number; // gold 1, crate 2
    resolved?: boolean;
    bumped?: boolean; // a side-bump bounce already fired (don't repeat)
  }
  const obstacles: Ob[] = [];
  const gems: { mesh: THREE.Mesh; lane: number }[] = [];
  const powerups: { mesh: THREE.Sprite; lane: number; type: PowerType }[] = [];
  const speedups: { mesh: THREE.Sprite; shadow: THREE.Mesh; lane: number; amount: number }[] = []; // +km/h boosts (jump to grab)
  const breakables: Breakable[] = []; // 💥 to smash for a rune — gold (1 tap, 1 lane) or crate (2 taps, 2 lanes)
  // Ability box — purple-glowing one-tap box. Breaking it fully charges the ⚡ ability.
  // Spawns more rarely than gold so a cast feels earned. Doesn't grant a rune; the ability
  // IS the reward.
  const abilityBoxes: { mesh: THREE.Mesh; lane: number }[] = [];
  // Ability beams: short-lived line segments rendered between caster and target during
  // a cast. Each entry stores its world endpoints + lifetime; the loop fades opacity.
  interface AbilityBeam { line: THREE.Line; mat: THREE.LineBasicMaterial; life: number; max: number }
  const abilityBeams: AbilityBeam[] = [];
  // Trex Leave-Box. The canvas pushes the latest snapshot in `setDroppedBoxes` each frame.
  // We keep a local Map<id, mesh> so we can ADD new ones / REMOVE consumed ones lazily
  // without re-creating everything per frame. Local "tripped" set avoids re-firing
  // a boxHit on the same id while server-sync is still propagating the removal.
  // `selfId` is our own MP id (set via `setSelfId`) — boxes we dropped don't collide on us.
  let droppedBoxesLatest: RunnerDroppedBox[] = [];
  let selfId = '';
  const droppedBoxMeshes = new Map<string, { mesh: THREE.Mesh; type: 'water' | 'fire' | 'trap' }>();
  const trippedBoxIds = new Set<string>();
  const dropBoxGeo = new THREE.BoxGeometry(1.4, 1.0, 1.0);
  const dropBoxMats = {
    water: new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.4, transparent: true, opacity: 0.75 }),
    fire: new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xb91c1c, emissiveIntensity: 0.5 }),
    trap: new THREE.MeshStandardMaterial({ color: 0xa855f7, emissive: 0x7e22ce, emissiveIntensity: 0.5 }),
  };
  // Called by the canvas when a server boxHit broadcast lands → forget the local mesh
  // immediately so the next frame doesn't re-fire collision before state sync.
  const forgetBox = (id: string) => {
    trippedBoxIds.add(id);
    const m = droppedBoxMeshes.get(id);
    if (m) {
      scene.remove(m.mesh);
      droppedBoxMeshes.delete(id);
    }
  };
  // Multiplayer ghost dinos — one entry per remote racer, keyed by their server-side id.
  // `freshlySpawned` flips false after the first frame so we snap to position on creation
  // but interpolate every frame after. `lastAnim` lets us avoid calling `dino.play(name)`
  // every frame for the same anim (some rigs reset the playhead on each play() call,
  // freezing the "run" cycle to frame 0 — that's why ghosts looked static).
  const ghosts = new Map<string, { dino: DinoCharacter; group: THREE.Group; nameSprite: THREE.Sprite; nameMat: THREE.SpriteMaterial; freshlySpawned: boolean; lastAnim: string }>();
  let opponentsLatest: RunnerOpponent[] = [];

  let laneIndex = initLane;
  let lastLane = initLane; // lane we came from (a side-bump bounces us back here)
  let velY = 0;
  let jumping = false;
  let grounded = true; // on the ground OR standing on a box
  let slideUntil = 0;
  let fastFalling = false; // airborne slide-press → drop fast to the ground
  let slideQueued = false; // a 2nd airborne press → slide once we land
  let pendingSmash = false; // a queued 💥 press waiting to connect with a target
  let smashWindowUntil = 0; // how long that queued press stays live
  let breakCooldownUntil = 0; // 3s cooldown after a successful break
  let attackUntil = 0; // play the smash animation until this time
  // Ability charge 0..ABILITY_FULL. Only filled by breaking an Ability Box (1-tap).
  // After firing, it resets to 0 — and a new box must be broken to roll again.
  let abilityCharge = 0;
  const ABILITY_FULL = 100;
  // The randomly-rolled ability currently held. ALL dinos can hold any kind; the box
  // picks one of the four uniformly at random when broken. Null while no ability is held.
  type HeldAbilityKind = 'pull' | 'freeze' | 'thunder' | 'box';
  let heldAbility: HeldAbilityKind | null = null;
  const ABILITY_POOL: HeldAbilityKind[] = ['pull', 'freeze', 'thunder', 'box'];
  function rollAbility(): HeldAbilityKind {
    return ABILITY_POOL[Math.floor(Math.random() * ABILITY_POOL.length)]!;
  }
  // PvP receiver state — set by applyFreeze / applyStun (called from the canvas in MP).
  // While `frozenUntilLocal` is in the future, lane / jump / slide / smash inputs are
  // ignored. `stunSpeedCapUntilLocal` caps the runner to MIN_SPEED for a brief window.
  let frozenUntilLocal = 0;
  let stunSpeedCapUntilLocal = 0;
  // Post-hit speed recovery — when the player gets hit (box collision OR pull-from-rival)
  // they shouldn't restart from MIN_SPEED via the slow auto-accel; that's brutal at high
  // speeds. Instead: SLOW PHASE for `HIT_SLOW_S` seconds, THEN rapid recovery toward
  // `preHitSpeed` at `HIT_RECOVERY_ACCEL`. Once they hit pre-hit speed, normal slow
  // auto-accel takes over.
  const HIT_SLOW_S = 2;
  const HIT_RECOVERY_ACCEL = 22; // ~70 km/h restored in just over 1s after slow phase
  let hitSlowUntil = 0;
  let preHitSpeed = 0;
  let comboCount = 0; // consecutive coins (for the multiplier)
  let comboUntil = 0; // the coin streak ends if none collected by this time
  let shakeUntil = 0; // camera shakes until this time (on hit)
  let speed = START_SPEED;
  let distance = opts.startDistance ?? 0;
  let gemCount = 0;
  let hearts = 3;
  let shieldActive = false;
  let magnetUntil = 0;
  let invulnUntil = 0;
  let lastSpawn = 0;
  let over = false;
  let paused = false;
  let raf = 0;
  let lastHud = 0;
  let runStartedAt = 0; // clock.elapsedTime at the start of THIS run (reset to "now" on restart)
  const clock = new THREE.Clock();

  const lowMat = new THREE.MeshStandardMaterial({ color: 0x9a3412 }); // brown = JUMP over (on the ground)
  const highMat = new THREE.MeshStandardMaterial({ color: 0x2563eb }); // blue = SLIDE under (flying bar)
  const gemMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0ea5e9, emissiveIntensity: 0.4 });
  const magnetIconMat = makeEmojiSpriteMaterial('🧲'); // the only floating power-up now (rare); shield is a crate rune
  const speedMats: Record<number, THREE.SpriteMaterial> = { 5: makeSpeedSpriteMaterial(5), 10: makeSpeedSpriteMaterial(10), 15: makeSpeedSpriteMaterial(15) };
  const shadowGeo = new THREE.CircleGeometry(0.32, 16); // ground shadow under flying boosts (height cue)
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false });
  const boxShadowGeo = new THREE.PlaneGeometry(2.0, 1.0); // wider shadow under flying (high) boxes
  const goldLowGeo = new THREE.BoxGeometry(2.0, 1.1, 1); // gold ground box (jump or smash) — wide enough to fill the lane
  const goldHighGeo = new THREE.BoxGeometry(2.0, 1, 1); // gold flying box (slide or smash)
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xeab308, emissive: 0x713f12, emissiveIntensity: 0.25 }); // gold = 1-tap breakable
  const crateGeo = new THREE.BoxGeometry(3.6, 1.6, 1); // grey crate spans TWO lanes
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x78716c }); // stone crate = 2-tap "double wall"
  const crateIconMat = makeEmojiSpriteMaterial('📦'); // marks the tough crate
  // Ability box — purple-glowing cube with a ⚡ icon. Visually distinct from gold/crate
  // so kids instantly read "this is the special one".
  const abilityBoxGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
  const abilityBoxMat = new THREE.MeshStandardMaterial({
    color: 0xa855f7,
    emissive: 0x7c3aed,
    emissiveIntensity: 0.5,
  });
  const abilityBoxIconMat = makeEmojiSpriteMaterial('⚡');
  // Juice: little particles for coins / smashes / landings.
  const particleGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
  const coinPMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
  const dustPMat = new THREE.MeshBasicMaterial({ color: 0xe7e5e4, transparent: true, opacity: 0.85 });
  const debrisPMat = new THREE.MeshBasicMaterial({ color: 0xca8a04 });
  const particles: { mesh: THREE.Mesh; vx: number; vy: number; vz: number; life: number; max: number }[] = [];

  function spawnRow(z: number) {
    // Rare 2-lane stone-crate row: blocks two lanes (smash with two 💥 taps, or dodge to the free lane).
    if (rng() < 0.06) {
      const pair = rng() < 0.5 ? 0 : 1; // covers lanes {pair, pair+1}
      const cx = (LANES[pair]! + LANES[pair + 1]!) / 2;
      const mesh = new THREE.Mesh(crateGeo, crateMat);
      mesh.position.set(cx, 0.8, z);
      const icon = new THREE.Sprite(crateIconMat);
      icon.scale.set(0.8, 0.8, 0.8);
      icon.position.set(0, 1.5, 0);
      mesh.add(icon);
      scene.add(mesh);
      breakables.push({ mesh, shape: 'crate', halfW: 1.9, hp: 2 });
      const openLane = pair === 0 ? 2 : 0; // a gem in the one free lane
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.34), gemMat);
      gem.position.set(LANES[openLane]!, 1.0, z);
      scene.add(gem);
      gems.push({ mesh: gem, lane: openLane });
      return;
    }
    const freeLane = Math.floor(rng() * 3);
    for (let l = 0; l < 3; l++) {
      if (l === freeLane) {
        const roll = rng();
        if (roll < 0.04) {
          // Magnet only, and rare — the shield is now a rune you earn by smashing 📦 crates.
          const mesh = new THREE.Sprite(magnetIconMat);
          mesh.scale.set(0.95, 0.95, 0.95); // just the icon, always faces the camera
          mesh.position.set(LANES[l]!, 1.0, z);
          scene.add(mesh);
          powerups.push({ mesh, lane: l, type: 'magnet' });
        } else if (roll < 0.8) {
          const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.34), gemMat);
          gem.position.set(LANES[l]!, 1.0, z);
          scene.add(gem);
          gems.push({ mesh: gem, lane: l });
        }
        continue;
      }
      if (rng() < 0.55) {
        const shape: 'low' | 'high' = rng() < 0.6 ? 'low' : 'high';
        const y = shape === 'low' ? 0.55 : HIGH_OBSTACLE_Y;
        if (rng() < 0.25) {
          // GOLD breakable — same shape as a normal box, smashable for a rune (1 tap); still jump/slide-able.
          const mesh = new THREE.Mesh(shape === 'low' ? goldLowGeo : goldHighGeo, goldMat);
          mesh.position.set(LANES[l]!, y, z);
          const bk: Breakable = { mesh, shape, halfW: 1.1, hp: 1 };
          if (shape === 'high') {
            const shadow = new THREE.Mesh(boxShadowGeo, shadowMat);
            shadow.rotation.x = -Math.PI / 2;
            shadow.position.set(LANES[l]!, 0.02, z);
            scene.add(shadow);
            bk.shadow = shadow;
          }
          scene.add(mesh);
          breakables.push(bk);
        } else {
          const mesh =
            shape === 'low'
              ? new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.1, 1), lowMat)
              : new THREE.Mesh(new THREE.BoxGeometry(2.0, 1, 1), highMat);
          mesh.position.set(LANES[l]!, y, z);
          const ob: Ob = { mesh, lane: l, type: shape };
          if (shape === 'high') {
            const shadow = new THREE.Mesh(boxShadowGeo, shadowMat);
            shadow.rotation.x = -Math.PI / 2;
            shadow.position.set(LANES[l]!, 0.02, z);
            scene.add(shadow);
            ob.shadow = shadow;
          }
          scene.add(mesh);
          obstacles.push(ob);
        }
      }
    }
    // Rare speed boost — a jump-height ⚡ icon; bigger boosts spawn higher (harder to reach).
    if (rng() < 0.08) {
      const r = rng();
      const amount = r < 0.6 ? 5 : r < 0.9 ? 10 : 15; // +5 common, +10 uncommon, +15 rare
      const y = amount === 5 ? 1.6 : amount === 10 ? 2.2 : 2.9;
      const lane = Math.floor(rng() * 3);
      const mesh = new THREE.Sprite(speedMats[amount]!);
      mesh.scale.set(0.85, 0.85, 0.85);
      mesh.position.set(LANES[lane]!, y, z);
      const shadow = new THREE.Mesh(shadowGeo, shadowMat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(LANES[lane]!, 0.02, z);
      scene.add(mesh, shadow);
      speedups.push({ mesh, shadow, lane, amount });
    }
    // Rare Ability Box — 1-tap smash → full ⚡ charge. ~6% per row so they're a treat.
    // Picks a lane that has NO obstacle/breakable/crate at the same z (within 1m) so it
    // never spawns visually inside another box. If every lane is taken in this row, skip.
    if (rng() < 0.06) {
      const occupied = new Set<number>();
      for (const o of obstacles) {
        if (Math.abs(o.mesh.position.z - z) < 1.0) occupied.add(o.lane);
      }
      for (const b of breakables) {
        if (Math.abs(b.mesh.position.z - z) < 1.0) {
          if (b.shape === 'crate') {
            // crate is 2-lane wide; mark both
            const cxLane = b.mesh.position.x < -1 ? 0 : b.mesh.position.x > 1 ? 2 : 1;
            occupied.add(cxLane);
            occupied.add(cxLane + (b.mesh.position.x < 0 ? 1 : -1));
          } else {
            const bxLane = Math.round((b.mesh.position.x + 2.2) / 2.2);
            occupied.add(bxLane);
          }
        }
      }
      const free = [0, 1, 2].filter((l) => !occupied.has(l));
      if (free.length > 0) {
        const lane = free[Math.floor(rng() * free.length)]!;
        const mesh = new THREE.Mesh(abilityBoxGeo, abilityBoxMat);
        mesh.position.set(LANES[lane]!, 0.7, z);
        const icon = new THREE.Sprite(abilityBoxIconMat);
        icon.scale.set(0.7, 0.7, 0.7);
        icon.position.set(0, 1.0, 0);
        mesh.add(icon);
        scene.add(mesh);
        abilityBoxes.push({ mesh, lane });
      }
    }
  }

  function reset() {
    for (const o of obstacles) {
      scene.remove(o.mesh);
      if (o.shadow) scene.remove(o.shadow);
    }
    obstacles.length = 0;
    for (const b of breakables) {
      scene.remove(b.mesh);
      if (b.shadow) scene.remove(b.shadow);
    }
    breakables.length = 0;
    for (const p of particles) scene.remove(p.mesh);
    particles.length = 0;
    comboCount = 0;
    comboUntil = 0;
    shakeUntil = 0;
    abilityCharge = 0;
    heldAbility = null;
    frozenUntilLocal = 0;
    stunSpeedCapUntilLocal = 0;
    hitSlowUntil = 0;
    preHitSpeed = 0;
    // Snap scenery back to the first biome (grassland).
    (scene.background as THREE.Color).copy(BIOMES[0]!.sky);
    scene.fog!.color.copy(BIOMES[0]!.fog);
    groundMat.color.copy(BIOMES[0]!.ground);
    stripeMat.color.copy(BIOMES[0]!.stripe);
    treeMat.color.copy(BIOMES[0]!.tree);
    for (const g of gems) scene.remove(g.mesh);
    gems.length = 0;
    for (const p of powerups) scene.remove(p.mesh);
    powerups.length = 0;
    for (const s of speedups) scene.remove(s.mesh, s.shadow);
    speedups.length = 0;
    for (const a of abilityBoxes) scene.remove(a.mesh);
    abilityBoxes.length = 0;
    laneIndex = 1;
    lastLane = 1;
    velY = 0;
    jumping = false;
    grounded = true;
    slideUntil = 0;
    fastFalling = false;
    slideQueued = false;
    pendingSmash = false;
    breakCooldownUntil = 0;
    attackUntil = 0;
    speed = START_SPEED;
    distance = opts.startDistance ?? 0;
    laneIndex = initLane;
    lastLane = initLane;
    gemCount = 0;
    hearts = 3;
    shieldActive = false;
    magnetUntil = 0;
    invulnUntil = 0;
    lastSpawn = 0;
    over = false;
    runStartedAt = clock.elapsedTime; // reset the run timer so duration starts at 0
    // Spawn at our assigned lane (x = LANES[initLane]) so MP-staggered players don't
    // share the centre lane.
    player.position.set(LANES[initLane]!, 0, 0);
    player.visible = true;
    shieldBubble.visible = false;
    dino.play('run'); // the run anim clears the death tumble (now on the dino's inner rig)
    emit();
  }

  function comboMult() {
    return Math.min(5, 1 + Math.floor(comboCount / 5)); // x2 at 5 coins, x3 at 10, … capped x5
  }

  function emit() {
    cb.onUpdate({
      distance: Math.floor(distance),
      gems: gemCount,
      hearts,
      shield: shieldActive,
      magnet: clock.elapsedTime < magnetUntil,
      speed,
      breakReady: clock.elapsedTime >= breakCooldownUntil,
      breakCooldownProgress: (() => {
        const remaining = breakCooldownUntil - clock.elapsedTime;
        if (remaining <= 0) return 1;
        return Math.max(0, 1 - remaining / BREAK_COOLDOWN_S);
      })(),
      combo: comboMult(),
      lane: laneIndex,
      y: player.position.y,
      abilityCharge: Math.min(1, abilityCharge / ABILITY_FULL),
      heldAbility,
    });
  }

  // Spawn a few short-lived particles (coins/smashes/landing dust).
  function burst(x: number, y: number, z: number, mat: THREE.Material, count: number, spread: number, up: number) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(particleGeo, mat);
      m.position.set(x, y, z);
      scene.add(m);
      particles.push({
        mesh: m,
        vx: (Math.random() - 0.5) * spread,
        vy: up + Math.random() * spread * 0.5,
        vz: (Math.random() - 0.5) * spread,
        life: 0.5,
        max: 0.5,
      });
    }
  }

  function hit() {
    if (clock.elapsedTime < invulnUntil) return;
    if (shieldActive) {
      shieldActive = false;
      shieldBubble.visible = false;
      invulnUntil = clock.elapsedTime + 1.0;
      emit();
      return;
    }
    hearts -= 1;
    // Remember the speed we had before the hit so the recovery phase can ramp us back
    // up to it quickly (instead of slowly auto-accelerating from MIN_SPEED). Only update
    // preHitSpeed if it's a fresh hit — back-to-back hits stack on the lower value.
    if (clock.elapsedTime >= hitSlowUntil) preHitSpeed = speed;
    speed = Math.max(MIN_SPEED, speed * 0.4); // bigger drop (≈60%) so the slow phase actually feels slow
    hitSlowUntil = clock.elapsedTime + HIT_SLOW_S;
    invulnUntil = clock.elapsedTime + 1.3;
    shakeUntil = clock.elapsedTime + 0.3; // screen shake
    opts.sfx?.hit?.();
    emit();
    if (hearts <= 0) {
      over = true;
      dino.play('death');
      cb.onGameOver(Math.floor(distance), gemCount, clock.elapsedTime - runStartedAt);
    }
  }

  // A random reward for smashing a gold breakable; returns a label for the on-screen popup.
  function grantRune(): string {
    opts.sfx?.rune?.();
    const r = Math.floor(Math.random() * 5);
    let label: string;
    if (r === 0) {
      shieldActive = true;
      label = '🛡️ Shield';
    } else if (r === 1) {
      magnetUntil = clock.elapsedTime + 5;
      label = '🧲 Magnet';
    } else if (r === 2) {
      hearts = Math.min(5, hearts + 1);
      label = '❤️ +1 Heart';
    } else if (r === 3) {
      gemCount += 15;
      label = '💎 +15 Gems';
    } else {
      speed += 5 / 3.6;
      label = '⚡ +5 km/h';
    }
    emit();
    return label;
  }

  // JACKPOT — the reward for a charged smash on a 📦 crate. Stacks every gold rune at once
  // so a successful charge feels like a slot-machine win.
  function grantJackpot(): string {
    opts.sfx?.rune?.();
    opts.sfx?.boost?.();
    shieldActive = true;
    magnetUntil = clock.elapsedTime + 8;
    hearts = Math.min(5, hearts + 1);
    gemCount += 25;
    speed += 8 / 3.6;
    emit();
    return '🎰 JACKPOT';
  }

  // The top surface the player can stand on right now (a box under them), else 0 (the ground).
  // `prevY` (last frame's feet height) gates it so you only land coming DOWN onto a box — you
  // never pop up onto one you ran into from the side.
  function groundUnder(prevY: number): number {
    const px = player.position.x;
    let g = 0;
    // Only LOW (ground) boxes are standable — flying bars and tall crates are not platforms.
    for (const o of obstacles) {
      if (o.type !== 'low') continue;
      if (Math.abs(o.mesh.position.z) < 0.9 && Math.abs(o.mesh.position.x - px) < 0.9 && prevY >= 1.0) g = Math.max(g, 1.1);
    }
    for (const b of breakables) {
      if (b.resolved || b.shape !== 'low') continue;
      if (Math.abs(b.mesh.position.z) < 0.9 && Math.abs(b.mesh.position.x - px) < b.halfW && prevY >= 1.0) g = Math.max(g, 1.1);
    }
    return g;
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05); // consume delta every frame (no jump on resume)
    if (paused) {
      renderer.render(scene, camera);
      return;
    }
    if (over) {
      dino.update(dt); // let the tumble animation play out
      renderer.render(scene, camera);
      return;
    }
    const t = clock.elapsedTime;

    // Speed update has three phases:
    //  1. Post-hit slow window (HIT_SLOW_S after hit()): hard-cap at low speed.
    //  2. Recovery: if we're below preHitSpeed (capped at AUTO_CAP), ramp up FAST so
    //     the player doesn't have to redo their whole acceleration from scratch.
    //  3. Normal auto-accel (slow ramp to AUTO_CAP).
    // PvP freeze / stun ALWAYS win — they clamp regardless of phase.
    if (t < hitSlowUntil) {
      speed = Math.min(speed, MIN_SPEED + 1.5);
    } else if (preHitSpeed > 0 && speed < Math.min(preHitSpeed, AUTO_CAP)) {
      speed = Math.min(Math.min(preHitSpeed, AUTO_CAP), speed + HIT_RECOVERY_ACCEL * dt);
    } else if (speed < AUTO_CAP) {
      speed = Math.min(speed + dt * ACCEL, AUTO_CAP);
    }
    if (t < stunSpeedCapUntilLocal) speed = Math.min(speed, MIN_SPEED + 1);
    if (isFrozen()) speed = Math.min(speed, MIN_SPEED);

    // Multiplayer same-lane catch-up drag. If a ghost dino is just ahead of me in MY lane,
    // bleed speed so I don't visually phase through them. They naturally pull ahead (or I
    // change lanes to overtake). Symmetrical with the laneBlocked() check on lane changes.
    for (const op of opponentsLatest) {
      if (op.finished) continue;
      if (op.lane !== laneIndex) continue;
      const gap = op.distance - distance; // positive = opponent ahead of me
      if (gap > 0 && gap < 1.5) {
        speed = Math.max(MIN_SPEED, speed - 12 * dt);
        break; // one bump per frame is plenty
      }
    }

    distance += speed * dt;
    const dz = speed * dt;

    // Biome: drift scene colors toward the current zone's palette (changes every BIOME_LENGTH m).
    const biome = BIOMES[Math.floor(distance / BIOME_LENGTH) % BIOMES.length]!;
    const lerpK = Math.min(1, dt * 1.5);
    (scene.background as THREE.Color).lerp(biome.sky, lerpK);
    scene.fog!.color.lerp(biome.fog, lerpK);
    groundMat.color.lerp(biome.ground, lerpK);
    stripeMat.color.lerp(biome.stripe, lerpK);
    treeMat.color.lerp(biome.tree, lerpK);

    player.position.x += (LANES[laneIndex]! - player.position.x) * Math.min(1, dt * 12);

    const groundY = groundUnder(player.position.y); // 0, or the top of a box we're descending onto
    if (jumping || velY > 0.001 || player.position.y > groundY + 0.02) {
      // Airborne: rising from a jump, or falling (incl. walking off the edge of a box).
      velY -= 42 * dt;
      player.position.y += velY * dt;
      if (velY <= 0 && player.position.y <= groundY) {
        const impact = velY;
        player.position.y = groundY; // land on the ground or a box top
        velY = 0;
        if (jumping && slideQueued) slideUntil = clock.elapsedTime + 0.6; // double-tapped mid-air → slide now
        jumping = false;
        fastFalling = false;
        slideQueued = false;
        grounded = true;
        if (impact < -10) burst(player.position.x, groundY + 0.05, player.position.z, dustPMat, 4, 1.6, 0.3);
      } else {
        grounded = false;
      }
    } else {
      player.position.y = groundY; // resting on the ground or atop a box
      grounded = true;
    }

    const sliding = t < slideUntil;
    if (t < attackUntil) dino.play('attack');
    else if (jumping) dino.play('jump');
    else if (sliding) dino.play('duck');
    else dino.play('run');
    dino.update(dt);

    // Invincibility blink.
    player.visible = t < invulnUntil ? Math.floor(t * 12) % 2 === 0 : true;
    const magnetOn = t < magnetUntil;
    shieldBubble.visible = shieldActive;

    // Camera mode (fixed for the session, chosen before the run). The dino stays visible in both
    // so you can see it cast abilities; "close" rides just behind + above the head.
    if (VIEW === 'close') {
      camera.position.set(player.position.x, player.position.y + 1.4, player.position.z + 2.6);
      camera.lookAt(player.position.x, player.position.y + 0.55, -11);
    } else {
      camera.position.set(0, 4.4, 8.5);
      camera.lookAt(0, 1.2, -8);
    }
    if (t < shakeUntil) {
      const amt = ((shakeUntil - t) / 0.3) * 0.22; // decays over 0.3s
      camera.position.x += (Math.random() - 0.5) * amt;
      camera.position.y += (Math.random() - 0.5) * amt;
    }
    if (comboCount > 0 && t > comboUntil) comboCount = 0; // streak timed out

    // ── Multiplayer ghosts ────────────────────────────────────────────────
    // Position each remote racer at (their_distance − my_distance) on the z axis: positive z
    // = behind me (visible going away in -z direction the world flows), negative z = ahead.
    // Cull anyone too far away (the dino mesh would be specks at >50m gaps anyway).
    if (ghosts.size > 0 || opponentsLatest.length > 0) {
      const seen = new Set<string>();
      for (const op of opponentsLatest) {
        seen.add(op.id);
        let g = ghosts.get(op.id);
        if (!g) {
          const dino = new DinoCharacter({ type: op.character, hostControlsHeight: true });
          dino.root.scale.setScalar(DINO_SCALE);
          dino.root.position.y = DINO_FOOT_LIFT;
          dino.root.rotation.y = Math.PI;
          // Tint the ghost slightly translucent so it reads as "remote".
          dino.root.traverse((node) => {
            const mesh = node as THREE.Mesh;
            if (mesh.isMesh && mesh.material) {
              const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
              for (const m of mats) {
                (m as THREE.Material).transparent = true;
                (m as THREE.Material & { opacity: number }).opacity = 0.75;
              }
            }
          });
          const group = new THREE.Group();
          group.add(dino.root);
          // Floating name label above the ghost.
          const size = 256;
          const canvas = document.createElement('canvas');
          canvas.width = size; canvas.height = 64;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.font = 'bold 36px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineWidth = 6;
            ctx.strokeStyle = '#0f172a';
            ctx.fillStyle = '#fef3c7';
            ctx.strokeText(op.name, size / 2, 32);
            ctx.fillText(op.name, size / 2, 32);
          }
          const tex = new THREE.CanvasTexture(canvas);
          tex.colorSpace = THREE.SRGBColorSpace;
          const nameMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
          const nameSprite = new THREE.Sprite(nameMat);
          nameSprite.scale.set(1.6, 0.4, 1);
          nameSprite.position.set(0, 1.7, 0);
          group.add(nameSprite);
          scene.add(group);
          g = { dino, group, nameSprite, nameMat, freshlySpawned: true, lastAnim: '' };
          ghosts.set(op.id, g);
        }
        const dz2 = op.distance - distance; // their distance minus mine
        const lane = Math.min(2, Math.max(0, op.lane | 0));
        // TARGET position from the latest server snapshot. The server broadcasts at ~10Hz,
        // so without interpolation the ghost teleports in visible jumps. We lerp the group's
        // current position toward the target every frame (tighter alpha = snappier feel,
        // less perceived lag — eats most of the 100ms tick in two frames).
        const tx = LANES[lane]!;
        const ty = op.y;
        const tz = -dz2; // ahead of me = negative z (further into the screen)
        if (g.freshlySpawned) {
          g.group.position.set(tx, ty, tz); // first frame after creation — snap, don't slide in
          g.freshlySpawned = false;
        } else {
          const alpha = Math.min(1, dt * 25);
          g.group.position.x += (tx - g.group.position.x) * alpha;
          g.group.position.y += (ty - g.group.position.y) * alpha;
          g.group.position.z += (tz - g.group.position.z) * alpha;
        }
        g.group.visible = !op.finished && Math.abs(dz2) < 80;
        // Only call play() when the desired animation actually changes — otherwise the
        // rig resets the run cycle to frame 0 every frame and looks frozen.
        const wantAnim = op.y > 0.4 ? 'jump' : (op.frozen ? 'duck' : 'run');
        if (g.lastAnim !== wantAnim) {
          g.dino.play(wantAnim);
          g.lastAnim = wantAnim;
        }
        // Tint the ghost based on PvP status so the caster SEES the cast land.
        // Iterate the materials we set transparent at creation and tweak their colours.
        const tintHex = op.frozen ? 0x60a5fa : op.stunned ? 0xfde047 : 0xffffff;
        g.dino.root.traverse((node) => {
          const mesh = node as THREE.Mesh;
          if (mesh.isMesh && mesh.material) {
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const m of mats) {
              const sm = m as THREE.MeshStandardMaterial;
              if (sm.emissive) {
                if (op.frozen) sm.emissive.setHex(0x1d4ed8);
                else if (op.stunned) sm.emissive.setHex(0xb45309);
                else sm.emissive.setHex(0x000000);
                sm.emissiveIntensity = op.frozen || op.stunned ? 0.55 : 0;
              }
            }
          }
        });
        void tintHex; // kept for potential per-material colour override
        g.dino.update(dt);
      }
      // Remove ghosts whose owner has left the room.
      for (const [id, g] of ghosts) {
        if (!seen.has(id)) {
          scene.remove(g.group);
          g.dino.dispose();
          g.nameMat.map?.dispose();
          g.nameMat.dispose();
          ghosts.delete(id);
        }
      }
    }

    for (const o of obstacles) {
      o.mesh.position.z += dz;
      if (o.shadow) o.shadow.position.z = o.mesh.position.z;
    }
    for (const b of breakables) {
      b.mesh.position.z += dz;
      if (b.shadow) b.shadow.position.z = b.mesh.position.z;
    }
    for (const g of gems) g.mesh.position.z += dz;
    for (const p of powerups) {
      p.mesh.position.z += dz;
      p.mesh.rotation.y += dt * 3;
    }
    for (const a of abilityBoxes) {
      a.mesh.position.z += dz;
      a.mesh.rotation.y += dt * 2; // gentle spin so the eye catches it
    }
    for (const t2 of decos) {
      t2.position.z += dz;
      if (t2.position.z > 12) t2.position.z -= 22 * 11;
    }
    for (const s of stripes) {
      s.position.z += dz;
      if (s.position.z > 6) s.position.z -= 30 * 6;
    }

    // Spacing widens with speed so the time between obstacles stays survivable at high speed.
    const gap = Math.max(speed * 0.32, 12 - speed * 0.12);
    if (distance - lastSpawn > gap) {
      spawnRow(-75);
      lastSpawn = distance;
    }

    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i]!;
      if (o.mesh.position.z > 12) {
        scene.remove(o.mesh);
        if (o.shadow) scene.remove(o.shadow);
        obstacles.splice(i, 1);
        continue;
      }
      // Three outcomes on box contact:
      //   1. Vertically cleared (jumped low / sliding under high / standing on a low box) → nothing.
      //   2. Settled head-on (squarely in its lane) → full hit (heart + big speed loss).
      //   3. Side bump (mid-transition, brushed its side) → bounce back to lastLane + small speed loss, NO heart.
      // The bounce itself stops phasing — each bump shoves you back, so you can't oscillate through.
      if (Math.abs(o.mesh.position.z) < 0.8 + dz && Math.abs(o.mesh.position.x - player.position.x) < 1.1) {
        const cleared = (o.type === 'low' && player.position.y >= 1.0) || (o.type === 'high' && sliding);
        if (!cleared) {
          const settled = Math.abs(player.position.x - LANES[laneIndex]!) < 0.35;
          if (settled) hit();
          else if (!o.bumped) {
            o.bumped = true;
            speed = Math.max(MIN_SPEED, speed / 1.1);
            laneIndex = lastLane;
          }
        }
      }
    }
    for (let i = breakables.length - 1; i >= 0; i--) {
      const b = breakables[i]!;
      if (b.mesh.position.z > 12) {
        scene.remove(b.mesh);
        breakables.splice(i, 1);
        continue;
      }
      const bz = b.mesh.position.z;
      const aligned = Math.abs(b.mesh.position.x - player.position.x) < b.halfW;
      // Smash while it's approaching/at you — one HP per press. Gold = 1 HP (dies in one),
      // 📦 crate = 2 HP (cracks on the first tap, breaks on the second → JACKPOT).
      // Flying (high) boxes can only be smashed mid-jump — you must be in the air to reach them.
      const canSmash = b.shape !== 'high' || player.position.y >= 1.0;
      let crackedNow = false;
      if (!b.resolved && pendingSmash && canSmash && t < smashWindowUntil && aligned && bz < 0.9 && bz > -3) {
        pendingSmash = false;
        b.hp -= 1;
        if (b.hp <= 0) {
          b.resolved = true;
          const isCrate = b.shape === 'crate';
          burst(b.mesh.position.x, 1.0, b.mesh.position.z, debrisPMat, isCrate ? 18 : 8, isCrate ? 6 : 4, isCrate ? 3 : 2);
          scene.remove(b.mesh);
          if (b.shadow) scene.remove(b.shadow);
          breakables.splice(i, 1);
          opts.sfx?.smash?.();
          cb.onRune?.(isCrate ? grantJackpot() : grantRune());
          // Cooldown engages AFTER the break — first crate tap (crack only) doesn't
          // cool down, so the second tap goes through; only the kill closes the window.
          breakCooldownUntil = t + BREAK_COOLDOWN_S;
          continue;
        }
        crackedNow = true;
        b.mesh.scale.multiplyScalar(0.86); // cracked — visual feedback that the 2nd tap is queued
        opts.sfx?.smash?.();
      }
      // Hit/bump fires AFTER it passes you (bz >= 0.5) — clean of the smash window. crackedNow
      // defers a same-frame hit so a quick 2nd tap can finish a freshly-cracked crate before
      // collision logic counts it as a head-on hit.
      if (!b.resolved && !crackedNow && bz >= 0.5 && bz < 1.8 + dz && aligned) {
        const cleared =
          (b.shape === 'low' && player.position.y >= 1.0) ||
          (b.shape === 'high' && sliding); // crate has no vertical clear
        if (!cleared) {
          const settled = Math.abs(player.position.x - LANES[laneIndex]!) < 0.35;
          if (settled) {
            b.resolved = true;
            hit();
          } else if (!b.bumped) {
            b.bumped = true;
            speed = Math.max(MIN_SPEED, speed / 1.1);
            laneIndex = lastLane;
          }
        }
      }
    }
    // ── Trex Leave-Box (MP only) ─────────────────────────────────────────
    // Sync mesh set to the latest server snapshot. Position them at (their_distance −
    // mine) → -z in local space. Local owner is immune; everyone else who runs into
    // a box (within ~1.5m z + correct lane) fires onDroppedBoxCollision so the canvas
    // can tell the server (boxHit) → server validates + broadcasts removal.
    if (droppedBoxesLatest.length || droppedBoxMeshes.size) {
      const seen = new Set<string>();
      for (const b of droppedBoxesLatest) {
        seen.add(b.id);
        if (trippedBoxIds.has(b.id)) continue; // already collided this session
        let entry = droppedBoxMeshes.get(b.id);
        if (!entry) {
          const mat = dropBoxMats[b.type] ?? dropBoxMats.trap;
          const mesh = new THREE.Mesh(dropBoxGeo, mat);
          scene.add(mesh);
          entry = { mesh, type: b.type };
          droppedBoxMeshes.set(b.id, entry);
        }
        const lane = Math.min(2, Math.max(0, b.lane | 0));
        const zRel = -(b.distance - distance);
        entry.mesh.position.set(LANES[lane]!, 0.6, zRel);
        entry.mesh.rotation.y += dt * 0.8;
        // Cull off-screen behind us.
        if (zRel > 12 || zRel < -200) {
          scene.remove(entry.mesh);
          droppedBoxMeshes.delete(b.id);
          continue;
        }
        // Collision: own player crosses the box's lane within a small z window.
        const isMine = selfId !== '' && selfId === b.ownerId;
        const sameLane = laneIndex === lane;
        if (!isMine && sameLane && Math.abs(zRel) < 1.0 + dz) {
          trippedBoxIds.add(b.id);
          cb.onDroppedBoxCollision?.(b.id, b.type);
          // Local immediate effect mirror so the player feels it before server-roundtrip:
          // server still has the final say + broadcasts to others.
          if (b.type === 'trap') {
            frozenUntilLocal = t + 1.5;
          } else if (b.type === 'water') {
            stunSpeedCapUntilLocal = t + 2;
            speed = Math.min(speed, MIN_SPEED + 1);
          } else if (b.type === 'fire') {
            hit(); // -1 heart; server also decrements authoritatively
          }
          scene.remove(entry.mesh);
          droppedBoxMeshes.delete(b.id);
        }
      }
      // Remove meshes whose box vanished server-side (consumed by someone else).
      for (const [id, entry] of droppedBoxMeshes) {
        if (!seen.has(id)) {
          scene.remove(entry.mesh);
          droppedBoxMeshes.delete(id);
        }
      }
    }

    // ── Ability boxes ────────────────────────────────────────────────────
    // 1-tap break: any queued smash (pendingSmash) that hits an aligned ability box
    // in front of the player grants a full ⚡ charge. Boxes that scroll past
    // unharmed are silently removed (no penalty).
    for (let i = abilityBoxes.length - 1; i >= 0; i--) {
      const a = abilityBoxes[i]!;
      if (a.mesh.position.z > 12) {
        scene.remove(a.mesh);
        abilityBoxes.splice(i, 1);
        continue;
      }
      const az = a.mesh.position.z;
      const aligned = Math.abs(a.mesh.position.x - player.position.x) < 1.0;
      if (pendingSmash && t < smashWindowUntil && aligned && az < 0.9 && az > -3) {
        pendingSmash = false;
        scene.remove(a.mesh);
        abilityBoxes.splice(i, 1);
        // Random ability roll: every dino can hold any of the 4 abilities. The button
        // updates to the rolled ability's icon; firing consumes it.
        heldAbility = rollAbility();
        abilityCharge = ABILITY_FULL; // visual: button is "ready"
        burst(a.mesh.position.x, 1.0, a.mesh.position.z, debrisPMat, 14, 5, 2.5);
        opts.sfx?.smash?.();
        opts.sfx?.rune?.();
        breakCooldownUntil = t + BREAK_COOLDOWN_S; // same cooldown applies after picking up a box
        const label =
          heldAbility === 'freeze' ? '❄️ FREEZE ready' :
          heldAbility === 'pull' ? '🕸️ PULL ready' :
          heldAbility === 'thunder' ? '⚡ THUNDER ready' :
          '📦 BOX ready';
        cb.onRune?.(label);
        emit();
        continue;
      }
    }
    for (let i = gems.length - 1; i >= 0; i--) {
      const g = gems[i]!;
      g.mesh.rotation.y += dt * 3;
      if (g.mesh.position.z > 12) {
        scene.remove(g.mesh);
        gems.splice(i, 1);
        continue;
      }
      const near = Math.abs(g.mesh.position.z) < (magnetOn ? 2.6 : 0.8) + dz;
      const laneOk = magnetOn ? Math.abs(g.mesh.position.x - player.position.x) < 3 : g.lane === laneIndex;
      if (near && laneOk) {
        const gx = g.mesh.position.x;
        const gz = g.mesh.position.z;
        scene.remove(g.mesh);
        gems.splice(i, 1);
        if (t > comboUntil) comboCount = 0; // streak broke
        comboCount += 1;
        comboUntil = t + 1.2;
        gemCount += comboMult(); // worth more during a combo
        // (Gems no longer charge the ⚡ — that's now exclusively the Ability Box's job.)
        opts.sfx?.coin?.();
        burst(gx, 1.0, gz, coinPMat, 5, 3, 1.5);
      }
    }
    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i]!;
      if (p.mesh.position.z > 12) {
        scene.remove(p.mesh);
        powerups.splice(i, 1);
        continue;
      }
      if (Math.abs(p.mesh.position.z) < 0.9 + dz && p.lane === laneIndex) {
        scene.remove(p.mesh);
        powerups.splice(i, 1);
        magnetUntil = t + 7; // only magnets spawn now
        emit();
      }
    }
    for (let i = speedups.length - 1; i >= 0; i--) {
      const s = speedups[i]!;
      s.mesh.position.z += dz;
      s.shadow.position.z = s.mesh.position.z;
      if (s.mesh.position.z > 12) {
        scene.remove(s.mesh, s.shadow);
        speedups.splice(i, 1);
        continue;
      }
      // Must JUMP up to it — the higher tiers sit higher, so they're harder to grab.
      if (Math.abs(s.mesh.position.z) < 0.8 + dz && s.lane === laneIndex && player.position.y >= s.mesh.position.y - 1.1) {
        scene.remove(s.mesh, s.shadow);
        speedups.splice(i, 1);
        speed += s.amount / 3.6; // +km/h → internal units/sec
        opts.sfx?.boost?.();
        emit();
      }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        scene.remove(p.mesh);
        particles.splice(i, 1);
        continue;
      }
      p.vy -= 14 * dt; // gravity
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt + dz; // drift back with the world
      p.mesh.scale.setScalar(0.4 + (p.life / p.max) * 0.8);
    }
    // Ability beams: fade opacity over their lifetime, then dispose.
    for (let i = abilityBeams.length - 1; i >= 0; i--) {
      const b = abilityBeams[i]!;
      b.life -= dt;
      if (b.life <= 0) {
        scene.remove(b.line);
        b.line.geometry.dispose();
        b.mat.dispose();
        abilityBeams.splice(i, 1);
        continue;
      }
      b.mat.opacity = 0.9 * (b.life / b.max);
    }

    if (t - lastHud > 0.12) {
      emit();
      lastHud = t;
    }

    renderer.render(scene, camera);
  }

  // Multiplayer: refuse a lane change if any opponent is in the target lane within ±2.5m.
  // Returns true if blocked (no move). Keeps us from teleporting through ghost dinos.
  function laneBlocked(targetLane: number): boolean {
    for (const op of opponentsLatest) {
      if (op.finished) continue;
      if (op.lane !== targetLane) continue;
      if (Math.abs(op.distance - distance) < 2.5) return true;
    }
    return false;
  }
  // True while a Freeze ability is active on us. Blocks every input.
  function isFrozen(): boolean {
    return clock.elapsedTime < frozenUntilLocal;
  }
  const moveLeft = () => {
    if (over || isFrozen()) return;
    const next = Math.max(0, laneIndex - 1);
    if (next === laneIndex || laneBlocked(next)) return;
    lastLane = laneIndex;
    laneIndex = next;
  };
  const moveRight = () => {
    if (over || isFrozen()) return;
    const next = Math.min(2, laneIndex + 1);
    if (next === laneIndex || laneBlocked(next)) return;
    lastLane = laneIndex;
    laneIndex = next;
  };
  const jump = () => {
    if (over || isFrozen()) return;
    if (grounded && !jumping) {
      jumping = true;
      velY = 15;
      grounded = false;
      opts.sfx?.jump?.();
    }
  };
  const slide = () => {
    if (over || isFrozen()) return;
    if (jumping || player.position.y > 0.001) {
      // Airborne: drop fast AND slide on landing — a single press triggers both.
      fastFalling = true;
      slideQueued = true;
      if (velY > -38) velY = -38;
    } else {
      slideUntil = clock.elapsedTime + 0.6;
    }
  };
  // Smash cooldown — small gate AFTER a successful break so taps feel meaningful instead
  // of spammable. Per-TAP cooldown would break crates (they need 2 quick taps); per-BREAK
  // cooldown still lets the first crate-tap crack it and the second-tap break it before
  // the cooldown engages. Tuned to 1.2s = noticeable but not punishing.
  const BREAK_COOLDOWN_S = 1.2;
  const breakBox = () => {
    if (over || paused || isFrozen()) return;
    const now = clock.elapsedTime;
    if (now < breakCooldownUntil) return; // still cooling down from the last break
    pendingSmash = true;
    smashWindowUntil = now + 0.4; // a press stays live briefly so you can pre-tap
    attackUntil = now + 0.3; // play the smash animation
  };

  // ── Ability ────────────────────────────────────────────────────────────────────
  // Each dino has a signature ability fired by the charged-up ⚡ button. Charge fills
  // from gem pickups + successful smashes; reaches 1.0 → button is ready. Using it
  // burns the full charge, so it's a power-spike reward for playing well rather than
  // a constant-on advantage.
  //
  // Named `castAbility` (not `useAbility`) so ESLint's react-hooks/rules-of-hooks
  // doesn't flag the call inside `onKey` — that rule treats any `use*` identifier as
  // a hook. The handle still exposes it under `useAbility` for a clean public API.
  const castAbility = () => {
    if (over || paused || isFrozen()) return;
    if (!heldAbility) return; // nothing to cast
    const kind = heldAbility;
    heldAbility = null;
    abilityCharge = 0;
    const t = clock.elapsedTime;
    // SOLO local fallback: with no opponents to actually hit, the held ability becomes
    // a personal boost so the player still gets a reward for the box pickup. In MP /
    // bot mode the canvas overrides this (sending the ability to server / bots and
    // calling consumeAbilityCharge instead) — this branch never runs there.
    if (kind === 'freeze') {
      shieldActive = true;
      invulnUntil = t + 4;
      cb.onRune?.('🛡️ SHIELD');
    } else if (kind === 'thunder') {
      magnetUntil = t + 8;
      gemCount += 10;
      cb.onRune?.('🧲 MAGNET');
    } else if (kind === 'box') {
      hearts = Math.min(5, hearts + 1);
      cb.onRune?.('❤️ +1 HEART');
    } else {
      // pull → solo "turbo"
      speed += 22 / 3.6;
      invulnUntil = t + 3;
      cb.onRune?.('⚡ TURBO');
    }
    opts.sfx?.boost?.();
    opts.sfx?.rune?.();
    emit();
  };

  // ── PvP receivers (called by the canvas when this player is hit by an opponent) ───
  /** Freeze: block all inputs for `durationMs`. Used by Stego's Freeze Shot. */
  const applyFreeze = (durationMs: number) => {
    if (over) return;
    frozenUntilLocal = clock.elapsedTime + durationMs / 1000;
    shakeUntil = clock.elapsedTime + 0.3;
    opts.sfx?.hit?.();
    emit();
  };
  /** Stun: brief speed cap + screen shake. Used by Brachio's Thunder (AoE). */
  const applyStun = (durationMs: number) => {
    if (over) return;
    stunSpeedCapUntilLocal = clock.elapsedTime + durationMs / 1000;
    speed = Math.min(speed, MIN_SPEED + 1); // hard slow down for the duration
    shakeUntil = clock.elapsedTime + 0.3;
    opts.sfx?.hit?.();
    emit();
  };
  /** Heart hit: drives the same code path as a box collision. Used by Trik's Web Pull. */
  const applyHit = () => {
    hit();
  };
  /** Burn the charge without playing a solo effect — for MP where the rival gets the
   *  effect instead. Server-relayed event handles the cast feedback. Also clears the
   *  held ability so the button visually empties immediately. */
  const consumeAbilityCharge = () => {
    abilityCharge = 0;
    heldAbility = null;
    emit();
  };

  /** Render a short-lived line between two players for an ability cast. `fromOpId` /
   *  `toOpId` use 'self' for the local player or an opponent id. The runner converts
   *  to local 3D coordinates (lane.x, dino head ≈ y=1, distance-relative z). */
  const showAbilityBeam = (fromOpId: string | 'self', toOpId: string | 'self', color: number) => {
    function pos(id: string | 'self'): THREE.Vector3 | null {
      if (id === 'self') return new THREE.Vector3(player.position.x, 1, player.position.z);
      const op = opponentsLatest.find((o) => o.id === id);
      if (!op) return null;
      const lane = Math.min(2, Math.max(0, op.lane | 0));
      const dz2 = op.distance - distance;
      return new THREE.Vector3(LANES[lane]!, op.y + 1, -dz2);
    }
    const a = pos(fromOpId);
    const b = pos(toOpId);
    if (!a || !b) return;
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, linewidth: 2 });
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const line = new THREE.Line(geo, mat);
    scene.add(line);
    abilityBeams.push({ line, mat, life: 0.4, max: 0.4 });
  };

  const onKey = (e: KeyboardEvent) => {
    if (paused) return; // 'P' (pause/resume) is handled by the page, not here
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') moveLeft();
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') moveRight();
    else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ') jump();
    else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') slide();
    else if ((e.key === 'e' || e.key === 'E') && !e.repeat) breakBox();
    else if ((e.key === 'q' || e.key === 'Q') && !e.repeat) castAbility();
  };
  window.addEventListener('keydown', onKey);

  // Touch input is handled by RunnerCanvas (virtual joystick on mobile, buttons on desktop) so
  // tap-anywhere-to-jump doesn't fire by accident.

  const ro = new ResizeObserver(() => {
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    syncCameraFov(); // pick portrait vs landscape FOV for the new aspect (also calls updateProjectionMatrix)
    renderer.setSize(w, h);
  });
  ro.observe(parent);

  loop();

  return {
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      ro.disconnect();
      for (const g of ghosts.values()) {
        scene.remove(g.group);
        g.dino.dispose();
        g.nameMat.map?.dispose();
        g.nameMat.dispose();
      }
      ghosts.clear();
      for (const b of abilityBeams) {
        scene.remove(b.line);
        b.line.geometry.dispose();
        b.mat.dispose();
      }
      abilityBeams.length = 0;
      dino.dispose();
      magnetIconMat.map?.dispose();
      magnetIconMat.dispose();
      for (const m of Object.values(speedMats)) {
        m.map?.dispose();
        m.dispose();
      }
      shadowGeo.dispose();
      shadowMat.dispose();
      boxShadowGeo.dispose();
      goldLowGeo.dispose();
      goldHighGeo.dispose();
      goldMat.dispose();
      crateGeo.dispose();
      crateMat.dispose();
      crateIconMat.map?.dispose();
      crateIconMat.dispose();
      abilityBoxGeo.dispose();
      abilityBoxMat.dispose();
      abilityBoxIconMat.map?.dispose();
      abilityBoxIconMat.dispose();
      for (const entry of droppedBoxMeshes.values()) scene.remove(entry.mesh);
      droppedBoxMeshes.clear();
      dropBoxGeo.dispose();
      dropBoxMats.water.dispose();
      dropBoxMats.fire.dispose();
      dropBoxMats.trap.dispose();
      particleGeo.dispose();
      coinPMat.dispose();
      dustPMat.dispose();
      debrisPMat.dispose();
      groundMat.dispose();
      stripeMat.dispose();
      stripeGeo.dispose();
      treeMat.dispose();
      treeGeo.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === parent) parent.removeChild(renderer.domElement);
    },
    restart: reset,
    moveLeft,
    moveRight,
    jump,
    slide,
    breakBox,
    useAbility: castAbility,
    consumeAbilityCharge,
    applyFreeze,
    applyStun,
    applyHit,
    showAbilityBeam,
    setSelfId(id: string) {
      selfId = id;
    },
    setDroppedBoxes(boxes: RunnerDroppedBox[]) {
      droppedBoxesLatest = boxes;
    },
    forgetDroppedBox: forgetBox,
    setPaused(b: boolean) {
      paused = b;
    },
    setOpponents(ops: RunnerOpponent[]) {
      opponentsLatest = ops;
    },
  };
}
