import * as THREE from 'three';

// Subway-Surfers-style 3D endless runner. Placeholder art (boxes/cones) — drops in real
// 3D models later. Pure Three.js; runs on web, wraps to iOS/Android via Capacitor.

const LANES = [-2.2, 0, 2.2];

export interface RunnerStats {
  distance: number;
  gems: number;
  hearts: number;
  shield: boolean;
  magnet: boolean;
}
export interface RunnerCallbacks {
  onUpdate: (s: RunnerStats) => void;
  onGameOver: (distance: number, gems: number) => void;
}
export interface RunnerOptions {
  startSpeed?: number;
  accel?: number;
  maxSpeed?: number;
}
export interface RunnerHandle {
  destroy: () => void;
  restart: () => void;
  moveLeft: () => void;
  moveRight: () => void;
  jump: () => void;
  slide: () => void;
}

type PowerType = 'shield' | 'magnet';

export function createRunner(parent: HTMLDivElement, cb: RunnerCallbacks, opts: RunnerOptions = {}): RunnerHandle {
  const START_SPEED = opts.startSpeed ?? 12;
  const ACCEL = opts.accel ?? 0.6;
  const MAX_SPEED = opts.maxSpeed ?? 32;

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
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, 1), new THREE.MeshStandardMaterial({ color: 0x22c55e }));
  body.position.y = 0.6;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), new THREE.MeshStandardMaterial({ color: 0x16a34a }));
  head.position.set(0, 1.5, -0.1);
  player.add(body, head);
  scene.add(player);

  // A shield bubble around the player when shielded.
  const shieldBubble = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.3, emissive: 0x0ea5e9, emissiveIntensity: 0.3 }),
  );
  shieldBubble.position.y = 0.8;
  shieldBubble.visible = false;
  player.add(shieldBubble);

  interface Ob {
    mesh: THREE.Mesh;
    lane: number;
    type: 'low' | 'high';
  }
  const obstacles: Ob[] = [];
  const gems: { mesh: THREE.Mesh; lane: number }[] = [];
  const powerups: { mesh: THREE.Mesh; lane: number; type: PowerType }[] = [];

  let laneIndex = 1;
  let velY = 0;
  let jumping = false;
  let slideUntil = 0;
  let speed = START_SPEED;
  let distance = 0;
  let gemCount = 0;
  let hearts = 3;
  let shieldActive = false;
  let magnetUntil = 0;
  let invulnUntil = 0;
  let lastSpawn = 0;
  let over = false;
  let raf = 0;
  let lastHud = 0;
  const clock = new THREE.Clock();

  const lowMat = new THREE.MeshStandardMaterial({ color: 0x9a3412 });
  const highMat = new THREE.MeshStandardMaterial({ color: 0x7c2d12 });
  const gemMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0ea5e9, emissiveIntensity: 0.4 });
  const shieldMat = new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x06b6d4, emissiveIntensity: 0.5 });
  const magnetMat = new THREE.MeshStandardMaterial({ color: 0xc026d3, emissive: 0xa21caf, emissiveIntensity: 0.5 });

  function spawnRow(z: number) {
    const freeLane = Math.floor(Math.random() * 3);
    for (let l = 0; l < 3; l++) {
      if (l === freeLane) {
        const roll = Math.random();
        if (roll < 0.12) {
          const type: PowerType = Math.random() < 0.5 ? 'shield' : 'magnet';
          const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.16, 10, 20), type === 'shield' ? shieldMat : magnetMat);
          mesh.position.set(LANES[l]!, 1.1, z);
          scene.add(mesh);
          powerups.push({ mesh, lane: l, type });
        } else if (roll < 0.8) {
          const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.34), gemMat);
          gem.position.set(LANES[l]!, 1.0, z);
          scene.add(gem);
          gems.push({ mesh: gem, lane: l });
        }
        continue;
      }
      if (Math.random() < 0.55) {
        const type: 'low' | 'high' = Math.random() < 0.6 ? 'low' : 'high';
        const mesh =
          type === 'low'
            ? new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, 1), lowMat)
            : new THREE.Mesh(new THREE.BoxGeometry(1.7, 1, 1), highMat);
        mesh.position.set(LANES[l]!, type === 'low' ? 0.55 : 2.0, z);
        scene.add(mesh);
        obstacles.push({ mesh, lane: l, type });
      }
    }
  }

  function reset() {
    for (const o of obstacles) scene.remove(o.mesh);
    obstacles.length = 0;
    for (const g of gems) scene.remove(g.mesh);
    gems.length = 0;
    for (const p of powerups) scene.remove(p.mesh);
    powerups.length = 0;
    laneIndex = 1;
    velY = 0;
    jumping = false;
    slideUntil = 0;
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
    emit();
  }

  function emit() {
    cb.onUpdate({ distance: Math.floor(distance), gems: gemCount, hearts, shield: shieldActive, magnet: clock.elapsedTime < magnetUntil });
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
    invulnUntil = clock.elapsedTime + 1.3;
    emit();
    if (hearts <= 0) {
      over = true;
      cb.onGameOver(Math.floor(distance), gemCount);
    }
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (over) {
      renderer.render(scene, camera);
      return;
    }
    const t = clock.elapsedTime;

    speed = Math.min(speed + dt * ACCEL, MAX_SPEED);
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
      }
    }

    const sliding = t < slideUntil;
    body.scale.y = sliding ? 0.45 : 1;
    body.position.y = sliding ? 0.27 : 0.6;
    head.visible = !sliding;

    // Invincibility blink.
    player.visible = t < invulnUntil ? Math.floor(t * 12) % 2 === 0 : true;
    const magnetOn = t < magnetUntil;
    shieldBubble.visible = shieldActive;

    for (const o of obstacles) o.mesh.position.z += dz;
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

    const gap = Math.max(7, 12 - speed * 0.12);
    if (distance - lastSpawn > gap) {
      spawnRow(-75);
      lastSpawn = distance;
    }

    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i]!;
      if (o.mesh.position.z > 12) {
        scene.remove(o.mesh);
        obstacles.splice(i, 1);
        continue;
      }
      if (Math.abs(o.mesh.position.z) < 0.8 && o.lane === laneIndex) {
        if (o.type === 'low' && player.position.y < 1.0) hit();
        else if (o.type === 'high' && !sliding) hit();
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
      const near = Math.abs(g.mesh.position.z) < (magnetOn ? 2.6 : 0.8);
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
      if (Math.abs(p.mesh.position.z) < 0.9 && p.lane === laneIndex) {
        scene.remove(p.mesh);
        powerups.splice(i, 1);
        if (p.type === 'shield') shieldActive = true;
        else magnetUntil = t + 7;
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
    if (!over) laneIndex = Math.max(0, laneIndex - 1);
  };
  const moveRight = () => {
    if (!over) laneIndex = Math.min(2, laneIndex + 1);
  };
  const jump = () => {
    if (!over && !jumping && player.position.y === 0) {
      jumping = true;
      velY = 15;
    }
  };
  const slide = () => {
    if (!over) slideUntil = clock.elapsedTime + 0.6;
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') moveLeft();
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') moveRight();
    else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ') jump();
    else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') slide();
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
      renderer.dispose();
      if (renderer.domElement.parentNode === parent) parent.removeChild(renderer.domElement);
    },
    restart: reset,
    moveLeft,
    moveRight,
    jump,
    slide,
  };
}
