import * as THREE from 'three';

import { DinoCharacter, type DinoType } from './dino-character';

// Subway-Surfers-style 3D endless runner. Cartoony procedural dinos (DinoCharacter) run a 3-lane
// track. Pure Three.js; runs on web, wraps to iOS/Android via Capacitor.

const LANES = [-2.2, 0, 2.2];
const DINO_SCALE = 0.32; // overall dino size (now drives all axes correctly — bump up/down to taste)
const DINO_FOOT_LIFT = DINO_SCALE * 0.3; // derived: raises the feet to ground level at any scale
const HIGH_OBSTACLE_Y = 1.35; // "slide under" bar — sits at the standing dino's head so you must duck

export interface RunnerStats {
  distance: number;
  gems: number;
  hearts: number;
  shield: boolean;
  magnet: boolean;
  speed: number; // current run speed in internal units/sec
  breakReady: boolean; // 💥 smash is off cooldown
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
  const AUTO_CAP = 60 / 3.6; // auto-speed tops out at 60 km/h; the rest is earned via speed boosts
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

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(9, 400), new THREE.MeshStandardMaterial({ color: 0x4d7c0f }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = -180;
  scene.add(ground);

  const stripes: THREE.Mesh[] = [];
  for (let i = 0; i < 30; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 2), new THREE.MeshStandardMaterial({ color: 0x65a30d }));
    s.position.set(1.1, 0.02, -i * 6);
    scene.add(s);
    stripes.push(s);
    const s2 = s.clone();
    s2.position.x = -1.1;
    scene.add(s2);
    stripes.push(s2);
  }

  const decos: THREE.Mesh[] = [];
  for (let i = 0; i < 22; i++) {
    const tree = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.4, 6), new THREE.MeshStandardMaterial({ color: 0x166534 }));
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
    bumped?: boolean; // a side-bump penalty was already applied (don't repeat it)
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
  let lastLane = 1; // lane we came from (to bounce back on a side-bump)
  let velY = 0;
  let jumping = false;
  let slideUntil = 0;
  let fastFalling = false; // airborne slide-press → drop fast to the ground
  let slideQueued = false; // a 2nd airborne press → slide once we land
  let pendingSmash = false; // a queued 💥 press waiting to connect with a crate
  let smashWindowUntil = 0; // how long that queued press stays live
  let breakCooldownUntil = 0; // 2s cooldown after a successful break
  let attackUntil = 0; // play the smash animation until this time
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
  const speedMats: Record<number, THREE.SpriteMaterial> = { 2: makeSpeedSpriteMaterial(2), 5: makeSpeedSpriteMaterial(5), 10: makeSpeedSpriteMaterial(10) };
  const shadowGeo = new THREE.CircleGeometry(0.32, 16); // ground shadow under flying boosts (height cue)
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false });
  const boxShadowGeo = new THREE.PlaneGeometry(1.5, 1.0); // wider shadow under flying (high) boxes
  const goldLowGeo = new THREE.BoxGeometry(1.5, 1.1, 1); // gold ground box (jump or smash)
  const goldHighGeo = new THREE.BoxGeometry(1.7, 1, 1); // gold flying box (slide or smash)
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xeab308, emissive: 0x713f12, emissiveIntensity: 0.25 }); // gold = 1-tap breakable
  const crateGeo = new THREE.BoxGeometry(3.6, 1.6, 1); // grey crate spans TWO lanes
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x78716c }); // stone crate = 2-tap "double wall"
  const crateIconMat = makeEmojiSpriteMaterial('📦'); // marks the tough crate

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
      const amount = r < 0.6 ? 2 : r < 0.9 ? 5 : 10; // +2 common, +5 uncommon, +10 rare
      const y = amount === 2 ? 1.6 : amount === 5 ? 2.2 : 2.9;
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
    for (const g of gems) scene.remove(g.mesh);
    gems.length = 0;
    for (const p of powerups) scene.remove(p.mesh);
    powerups.length = 0;
    for (const s of speedups) scene.remove(s.mesh, s.shadow);
    speedups.length = 0;
    laneIndex = 1;
    lastLane = 1;
    velY = 0;
    jumping = false;
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

  function emit() {
    cb.onUpdate({ distance: Math.floor(distance), gems: gemCount, hearts, shield: shieldActive, magnet: clock.elapsedTime < magnetUntil, speed, breakReady: clock.elapsedTime >= breakCooldownUntil });
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
    emit();
    if (hearts <= 0) {
      over = true;
      dino.play('death');
      cb.onGameOver(Math.floor(distance), gemCount);
    }
  }

  // A random reward for smashing a breakable; returns a label for the on-screen popup.
  function grantRune(): string {
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

    if (speed < AUTO_CAP) speed = Math.min(speed + dt * ACCEL, AUTO_CAP); // auto only to 60 km/h
    distance += speed * dt;
    const dz = speed * dt;

    player.position.x += (LANES[laneIndex]! - player.position.x) * Math.min(1, dt * 12);

    if (jumping) {
      velY -= 42 * dt;
      player.position.y += velY * dt;
      if (player.position.y <= 0) {
        player.position.y = 0;
        jumping = false;
        velY = 0;
        if (slideQueued) slideUntil = clock.elapsedTime + 0.6; // double-tapped in the air → slide now
        fastFalling = false;
        slideQueued = false;
      }
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
      if (Math.abs(o.mesh.position.z) < 0.8 + dz) {
        const dx = o.mesh.position.x - player.position.x;
        const settled = Math.abs(player.position.x - LANES[laneIndex]!) < 0.35;
        if (settled && Math.abs(dx) < 0.9) {
          // Head-on: squarely in the lane and ran into it → real hit (heart + big speed loss).
          if (o.type === 'low' && player.position.y < 1.0) hit();
          else if (o.type === 'high' && !sliding) hit();
        } else if (!settled && laneIndex === o.lane && !o.bumped && Math.abs(dx) < 0.9) {
          // Side-bump: switching INTO a box beside you → blocked + small speed loss, no heart.
          o.bumped = true;
          speed = Math.max(MIN_SPEED, speed / 1.1);
          laneIndex = lastLane;
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
      // Smash while it's approaching/at you — one hit per 💥 press (a crate needs two).
      // Flying (high) boxes can only be smashed mid-jump — you must be in the air to reach them.
      const canSmash = b.shape !== 'high' || player.position.y >= 1.0;
      if (!b.resolved && pendingSmash && canSmash && t < smashWindowUntil && aligned && bz < 0.9 && bz > -3) {
        pendingSmash = false;
        b.hp -= 1;
        if (b.hp <= 0) {
          b.resolved = true;
          scene.remove(b.mesh);
          if (b.shadow) scene.remove(b.shadow);
          breakables.splice(i, 1);
          cb.onRune?.(grantRune());
          breakCooldownUntil = t + 3; // 3s cooldown after a successful break
          continue;
        }
        b.mesh.scale.multiplyScalar(0.82); // cracked — one wall down
      }
      // Passes unbroken: gold can be jumped (low) / slid under (high); a crate always blocks.
      const settled = Math.abs(player.position.x - LANES[laneIndex]!) < 0.35;
      if (!b.resolved && bz >= 0.9 && bz < 1.8 && aligned && settled) {
        b.resolved = true;
        const avoided = (b.shape === 'low' && player.position.y >= 1.0) || (b.shape === 'high' && sliding);
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
        scene.remove(g.mesh);
        gems.splice(i, 1);
        gemCount += 1;
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
        emit();
      }
    }

    if (t - lastHud > 0.12) {
      emit();
      lastHud = t;
    }

    renderer.render(scene, camera);
  }

  const moveLeft = () => {
    if (over) return;
    const next = Math.max(0, laneIndex - 1);
    if (next !== laneIndex) {
      lastLane = laneIndex;
      laneIndex = next;
    }
  };
  const moveRight = () => {
    if (over) return;
    const next = Math.min(2, laneIndex + 1);
    if (next !== laneIndex) {
      lastLane = laneIndex;
      laneIndex = next;
    }
  };
  const jump = () => {
    if (!over && !jumping && player.position.y === 0) {
      jumping = true;
      velY = 15;
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
