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
  breakReady: boolean; // 💥 smash is off cooldown
  combo: number; // coin combo multiplier (1 = none)
}
export interface RunnerCallbacks {
  onUpdate: (s: RunnerStats) => void;
  onGameOver: (distance: number, gems: number) => void;
  onRune?: (rune: string) => void; // fired when a breakable is smashed (for the reward popup)
}
export type RunnerView = 'follow' | 'close';
export interface RunnerOptions {
  startSpeed?: number;
  accel?: number;
  character?: DinoType;
  view?: RunnerView; // chosen BEFORE the run (fixed for the session — fair in multiplayer)
  sfx?: RunnerSfx; // sound hooks (jump/coin/smash/hit/rune/boost)
}
export interface RunnerHandle {
  destroy: () => void;
  restart: () => void;
  moveLeft: () => void;
  moveRight: () => void;
  jump: () => void;
  slide: () => void;
  breakBox: () => void;
  setPaused: (b: boolean) => void;
}

type PowerType = 'shield' | 'magnet';

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
  const START_SPEED = opts.startSpeed ?? 12;
  const ACCEL = opts.accel ?? 0.6; // auto-accel climbs only to AUTO_CAP; ⚡ boosts go beyond
  const AUTO_CAP = 100 / 3.6; // auto-speed climbs to 100 km/h; beyond that is earned via ⚡ boosts
  const MIN_SPEED = 6; // floor after collision penalties (~22 km/h)
  const VIEW: RunnerView = opts.view ?? 'follow';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbae6fd);
  scene.fog = new THREE.Fog(0xbae6fd, 28, 70);

  const camera = new THREE.PerspectiveCamera(62, parent.clientWidth / parent.clientHeight || 1.6, 0.1, 200);
  camera.position.set(0, 4.4, 8.5);
  camera.lookAt(0, 1.2, -8);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(parent.clientWidth, parent.clientHeight);
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
  }
  interface Breakable {
    mesh: THREE.Mesh;
    shadow?: THREE.Mesh; // for flying (high) gold boxes
    shape: 'low' | 'high' | 'crate'; // gold low/high are avoidable; crate always blocks
    halfW: number; // collision half-width (gold ~0.9 = 1 lane; crate ~1.9 = 2 lanes)
    hp: number; // gold 1, crate 2
    resolved?: boolean;
  }
  const obstacles: Ob[] = [];
  const gems: { mesh: THREE.Mesh; lane: number }[] = [];
  const powerups: { mesh: THREE.Sprite; lane: number; type: PowerType }[] = [];
  const speedups: { mesh: THREE.Sprite; shadow: THREE.Mesh; lane: number; amount: number }[] = []; // +km/h boosts (jump to grab)
  const breakables: Breakable[] = []; // 💥 to smash for a rune — gold (1 tap, 1 lane) or crate (2 taps, 2 lanes)

  let laneIndex = 1;
  let velY = 0;
  let jumping = false;
  let grounded = true; // on the ground OR standing on a box
  let slideUntil = 0;
  let fastFalling = false; // airborne slide-press → drop fast to the ground
  let slideQueued = false; // a 2nd airborne press → slide once we land
  let pendingSmash = false; // a queued 💥 press waiting to connect with a crate
  let smashWindowUntil = 0; // how long that queued press stays live
  let breakCooldownUntil = 0; // 2s cooldown after a successful break
  let attackUntil = 0; // play the smash animation until this time
  let comboCount = 0; // consecutive coins (for the multiplier)
  let comboUntil = 0; // the coin streak ends if none collected by this time
  let shakeUntil = 0; // camera shakes until this time (on hit)
  let speed = START_SPEED;
  let distance = 0;
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
  const clock = new THREE.Clock();

  const lowMat = new THREE.MeshStandardMaterial({ color: 0x9a3412 }); // brown = JUMP over (on the ground)
  const highMat = new THREE.MeshStandardMaterial({ color: 0x2563eb }); // blue = SLIDE under (flying bar)
  const gemMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0ea5e9, emissiveIntensity: 0.4 });
  const magnetIconMat = makeEmojiSpriteMaterial('🧲'); // the only floating power-up now (rare); shield is a crate rune
  const speedMats: Record<number, THREE.SpriteMaterial> = { 5: makeSpeedSpriteMaterial(5), 10: makeSpeedSpriteMaterial(10), 15: makeSpeedSpriteMaterial(15) };
  const shadowGeo = new THREE.CircleGeometry(0.32, 16); // ground shadow under flying boosts (height cue)
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false });
  const boxShadowGeo = new THREE.PlaneGeometry(1.5, 1.0); // wider shadow under flying (high) boxes
  const goldLowGeo = new THREE.BoxGeometry(1.5, 1.1, 1); // gold ground box (jump or smash)
  const goldHighGeo = new THREE.BoxGeometry(1.7, 1, 1); // gold flying box (slide or smash)
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xeab308, emissive: 0x713f12, emissiveIntensity: 0.25 }); // gold = 1-tap breakable
  const crateGeo = new THREE.BoxGeometry(3.6, 1.6, 1); // grey crate spans TWO lanes
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x78716c }); // stone crate = 2-tap "double wall"
  const crateIconMat = makeEmojiSpriteMaterial('📦'); // marks the tough crate
  // Juice: little particles for coins / smashes / landings.
  const particleGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
  const coinPMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
  const dustPMat = new THREE.MeshBasicMaterial({ color: 0xe7e5e4, transparent: true, opacity: 0.85 });
  const debrisPMat = new THREE.MeshBasicMaterial({ color: 0xca8a04 });
  const particles: { mesh: THREE.Mesh; vx: number; vy: number; vz: number; life: number; max: number }[] = [];

  function spawnRow(z: number) {
    // Rare 2-lane stone-crate row: blocks two lanes (smash with two 💥 taps, or dodge to the free lane).
    if (Math.random() < 0.06) {
      const pair = Math.random() < 0.5 ? 0 : 1; // covers lanes {pair, pair+1}
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
    const freeLane = Math.floor(Math.random() * 3);
    for (let l = 0; l < 3; l++) {
      if (l === freeLane) {
        const roll = Math.random();
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
      if (Math.random() < 0.55) {
        const shape: 'low' | 'high' = Math.random() < 0.6 ? 'low' : 'high';
        const y = shape === 'low' ? 0.55 : HIGH_OBSTACLE_Y;
        if (Math.random() < 0.25) {
          // GOLD breakable — same shape as a normal box, smashable for a rune (1 tap); still jump/slide-able.
          const mesh = new THREE.Mesh(shape === 'low' ? goldLowGeo : goldHighGeo, goldMat);
          mesh.position.set(LANES[l]!, y, z);
          const bk: Breakable = { mesh, shape, halfW: 0.9, hp: 1 };
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
              ? new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, 1), lowMat)
              : new THREE.Mesh(new THREE.BoxGeometry(1.7, 1, 1), highMat);
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
    if (Math.random() < 0.08) {
      const r = Math.random();
      const amount = r < 0.6 ? 5 : r < 0.9 ? 10 : 15; // +5 common, +10 uncommon, +15 rare
      const y = amount === 5 ? 1.6 : amount === 10 ? 2.2 : 2.9;
      const lane = Math.floor(Math.random() * 3);
      const mesh = new THREE.Sprite(speedMats[amount]!);
      mesh.scale.set(0.85, 0.85, 0.85);
      mesh.position.set(LANES[lane]!, y, z);
      const shadow = new THREE.Mesh(shadowGeo, shadowMat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.set(LANES[lane]!, 0.02, z);
      scene.add(mesh, shadow);
      speedups.push({ mesh, shadow, lane, amount });
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
    laneIndex = 1;
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
    distance = 0;
    gemCount = 0;
    hearts = 3;
    shieldActive = false;
    magnetUntil = 0;
    invulnUntil = 0;
    lastSpawn = 0;
    over = false;
    player.position.set(0, 0, 0);
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
      combo: comboMult(),
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
    speed = Math.max(MIN_SPEED, speed / 1.3); // a real hit costs ~23% of your speed
    invulnUntil = clock.elapsedTime + 1.3;
    shakeUntil = clock.elapsedTime + 0.3; // screen shake
    opts.sfx?.hit?.();
    emit();
    if (hearts <= 0) {
      over = true;
      dino.play('death');
      cb.onGameOver(Math.floor(distance), gemCount);
    }
  }

  // A random reward for smashing a breakable; returns a label for the on-screen popup.
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

  // The top surface the player can stand on right now (a box under them), else 0 (the ground).
  // `prevY` (last frame's feet height) gates it so you only land coming DOWN onto a box — you
  // never pop up onto one you ran into from the side.
  function groundUnder(prevY: number): number {
    const px = player.position.x;
    let g = 0;
    // Only LOW (ground) boxes are standable — flying bars and tall crates are not platforms.
    for (const o of obstacles) {
      if (o.type !== 'low') continue;
      if (Math.abs(o.mesh.position.z) < 0.9 && Math.abs(o.mesh.position.x - px) < 0.7 && prevY >= 1.0) g = Math.max(g, 1.1);
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

    if (speed < AUTO_CAP) speed = Math.min(speed + dt * ACCEL, AUTO_CAP); // auto only to 100 km/h
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
      // Your body physically overlaps the box at the player plane → hit (unless you cleared it
      // vertically). No "settled" gate, so you can't slip through by switching lanes fast.
      if (Math.abs(o.mesh.position.z) < 0.8 + dz && Math.abs(o.mesh.position.x - player.position.x) < 0.9) {
        if (o.type === 'low' && player.position.y < 1.0) hit(); // jump over or land on top
        else if (o.type === 'high' && !sliding) hit(); // flying bar: must SLIDE under — no jumping over
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
      // Smash while it's approaching/at you — one hit per 💥 press (a crate needs two).
      // Flying (high) boxes can only be smashed mid-jump — you must be in the air to reach them.
      const canSmash = b.shape !== 'high' || player.position.y >= 1.0;
      if (!b.resolved && pendingSmash && canSmash && t < smashWindowUntil && aligned && bz < 0.9 && bz > -3) {
        pendingSmash = false;
        b.hp -= 1;
        if (b.hp <= 0) {
          b.resolved = true;
          burst(b.mesh.position.x, 1.0, b.mesh.position.z, debrisPMat, 8, 4, 2);
          scene.remove(b.mesh);
          if (b.shadow) scene.remove(b.shadow);
          breakables.splice(i, 1);
          opts.sfx?.smash?.();
          cb.onRune?.(grantRune());
          breakCooldownUntil = t + 3; // 3s cooldown after a successful break
          continue;
        }
        b.mesh.scale.multiplyScalar(0.82); // cracked — one wall down
      }
      // Passes unbroken: gold can be jumped (low) / slid under (high); a crate always blocks.
      // Upper bound widens with speed so a fast box can't skip the window in one frame.
      if (!b.resolved && bz >= 0.9 && bz < 1.8 + dz && aligned) {
        b.resolved = true;
        const avoided =
          (b.shape === 'low' && player.position.y >= 1.0) || // jump over / stand on a ground box
          (b.shape === 'high' && sliding); // flying box: SLIDE under (or smash mid-jump). Crate: smash/dodge only.
        if (!avoided) hit();
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

    if (t - lastHud > 0.12) {
      emit();
      lastHud = t;
    }

    renderer.render(scene, camera);
  }

  const moveLeft = () => {
    if (!over) laneIndex = Math.max(0, laneIndex - 1);
  };
  const moveRight = () => {
    if (!over) laneIndex = Math.min(2, laneIndex + 1);
  };
  const jump = () => {
    if (!over && grounded && !jumping) {
      jumping = true;
      velY = 15;
      grounded = false;
      opts.sfx?.jump?.();
    }
  };
  const slide = () => {
    if (over) return;
    if (jumping || player.position.y > 0.001) {
      // Airborne: first press = drop fast to the ground (no slide); a 2nd press = slide on landing.
      if (fastFalling) slideQueued = true;
      fastFalling = true;
      if (velY > -38) velY = -38;
    } else {
      slideUntil = clock.elapsedTime + 0.6;
    }
  };
  const breakBox = () => {
    if (over || paused) return;
    const now = clock.elapsedTime;
    if (now < breakCooldownUntil) return; // still cooling down
    pendingSmash = true;
    smashWindowUntil = now + 0.4; // a press stays live briefly so you can pre-tap
    attackUntil = now + 0.3; // play the smash animation
  };

  const onKey = (e: KeyboardEvent) => {
    if (paused) return; // 'P' (pause/resume) is handled by the page, not here
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') moveLeft();
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') moveRight();
    else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ') jump();
    else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') slide();
    else if (e.key === 'e' || e.key === 'E') breakBox();
  };
  window.addEventListener('keydown', onKey);

  let tsx = 0;
  let tsy = 0;
  const onTouchStart = (e: TouchEvent) => {
    tsx = e.changedTouches[0]!.clientX;
    tsy = e.changedTouches[0]!.clientY;
  };
  const onTouchEnd = (e: TouchEvent) => {
    const dx = e.changedTouches[0]!.clientX - tsx;
    const dy = e.changedTouches[0]!.clientY - tsy;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) {
      jump();
      return;
    }
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) moveRight();
      else moveLeft();
    } else if (dy > 0) {
      slide();
    } else {
      jump();
    }
  };
  parent.addEventListener('touchstart', onTouchStart, { passive: true });
  parent.addEventListener('touchend', onTouchEnd, { passive: true });

  const ro = new ResizeObserver(() => {
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
  ro.observe(parent);

  loop();

  return {
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      parent.removeEventListener('touchstart', onTouchStart);
      parent.removeEventListener('touchend', onTouchEnd);
      ro.disconnect();
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
    setPaused(b: boolean) {
      paused = b;
    },
  };
}
