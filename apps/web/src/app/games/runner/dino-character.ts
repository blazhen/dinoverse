import * as THREE from 'three';

/**
 * DinoCharacter — cartoony, chunky dino built from primitives, for our Three.js runner.
 *
 * Ported from a Babylon.js module (kept the same clean API: play / setSkin / update / dispose)
 * into our locked 3D engine. Procedural geometry (spheres/boxes/cylinders) — no model files —
 * so it's tiny to ship and works identically on web / iOS / Android via Capacitor. Swap in
 * sculpted .glb models later behind this same contract.
 *
 * Roster: trik (triceratops), stego (stegosaurus), brachio (gentle long-neck — our canon third),
 * trex (bonus). Animations: idle, run, jump, duck, death, special (spin → the multiplayer ability).
 */

export type DinoType = 'trik' | 'stego' | 'brachio' | 'trex';
export type SkinName = 'classic' | 'lava' | 'ice' | 'neon';
export type DinoAnim = 'idle' | 'run' | 'jump' | 'duck' | 'death' | 'special';

type RGB = [number, number, number];
interface SkinColors {
  primary: RGB;
  secondary: RGB;
  belly: RGB;
}

// Each skin defines colors per species. Pure data → a remote skin catalog can replace this later.
export const SKINS: Record<SkinName, Record<DinoType, SkinColors>> = {
  classic: {
    trik: { primary: [0.45, 0.75, 0.45], secondary: [0.85, 0.7, 0.4], belly: [0.95, 0.9, 0.7] },
    stego: { primary: [0.4, 0.55, 0.85], secondary: [0.95, 0.6, 0.3], belly: [0.85, 0.85, 0.95] },
    brachio: { primary: [0.5, 0.72, 0.62], secondary: [0.82, 0.78, 0.5], belly: [0.93, 0.93, 0.8] },
    trex: { primary: [0.7, 0.35, 0.3], secondary: [0.4, 0.2, 0.15], belly: [0.95, 0.85, 0.65] },
  },
  lava: {
    trik: { primary: [0.85, 0.25, 0.1], secondary: [1.0, 0.7, 0.1], belly: [0.4, 0.1, 0.05] },
    stego: { primary: [0.7, 0.15, 0.05], secondary: [1.0, 0.85, 0.2], belly: [0.3, 0.08, 0.04] },
    brachio: { primary: [0.8, 0.2, 0.08], secondary: [1.0, 0.75, 0.15], belly: [0.35, 0.1, 0.05] },
    trex: { primary: [0.9, 0.3, 0.05], secondary: [1.0, 0.6, 0.0], belly: [0.4, 0.12, 0.05] },
  },
  ice: {
    trik: { primary: [0.55, 0.8, 0.95], secondary: [0.95, 0.98, 1.0], belly: [0.85, 0.95, 1.0] },
    stego: { primary: [0.4, 0.7, 0.9], secondary: [0.7, 0.9, 1.0], belly: [0.9, 0.95, 1.0] },
    brachio: { primary: [0.5, 0.78, 0.92], secondary: [0.8, 0.93, 1.0], belly: [0.9, 0.96, 1.0] },
    trex: { primary: [0.5, 0.75, 0.95], secondary: [0.8, 0.9, 1.0], belly: [0.9, 0.95, 1.0] },
  },
  neon: {
    trik: { primary: [0.0, 1.0, 0.5], secondary: [1.0, 0.0, 0.85], belly: [0.95, 1.0, 0.2] },
    stego: { primary: [0.0, 0.85, 1.0], secondary: [1.0, 0.2, 0.85], belly: [0.95, 1.0, 0.3] },
    brachio: { primary: [0.2, 1.0, 0.7], secondary: [1.0, 0.1, 0.9], belly: [0.9, 1.0, 0.25] },
    trex: { primary: [0.85, 0.0, 1.0], secondary: [0.0, 1.0, 0.85], belly: [1.0, 0.95, 0.0] },
  },
};

interface Parts {
  headPivot: THREE.Group;
  armLPivot: THREE.Group;
  armRPivot: THREE.Group;
  legLPivot: THREE.Group;
  legRPivot: THREE.Group;
  tailPivot: THREE.Group;
}

// Each animation mutates rig rotations/positions. `t` is animation-local seconds (resets on play()).
const ANIMATIONS: Record<DinoAnim, (p: Parts, t: number, root: THREE.Group) => void> = {
  idle(p, t, root) {
    root.position.y = Math.sin(t * 2) * 0.04;
    p.headPivot.rotation.x = Math.sin(t * 1.5) * 0.05;
    p.headPivot.rotation.y = Math.sin(t * 0.7) * 0.1;
    p.tailPivot.rotation.y = Math.sin(t * 2) * 0.2;
    p.armLPivot.rotation.x = Math.sin(t * 1.5) * 0.1;
    p.armRPivot.rotation.x = Math.sin(t * 1.5 + Math.PI) * 0.1;
    p.legLPivot.rotation.x = 0;
    p.legRPivot.rotation.x = 0;
    root.rotation.z = 0;
    root.rotation.x = 0;
    root.scale.y = 1 + Math.sin(t * 2) * 0.02;
  },

  run(p, t, root) {
    const speed = 11;
    root.position.y = Math.abs(Math.sin(t * speed)) * 0.25;
    root.rotation.x = 0.12; // lean into the run (RH: +x tilts the top forward, toward -z)
    p.legLPivot.rotation.x = Math.sin(t * speed) * 0.9;
    p.legRPivot.rotation.x = Math.sin(t * speed + Math.PI) * 0.9;
    p.armLPivot.rotation.x = Math.sin(t * speed + Math.PI) * 0.7;
    p.armRPivot.rotation.x = Math.sin(t * speed) * 0.7;
    p.tailPivot.rotation.y = Math.sin(t * speed) * 0.4;
    p.tailPivot.rotation.x = 0.2;
    p.headPivot.rotation.x = 0.1 + Math.sin(t * speed) * 0.05;
    root.scale.y = 1;
    root.rotation.z = 0;
  },

  jump(p, _t, root) {
    // Pose only — the runner owns the actual jump height (hostControlsHeight).
    p.legLPivot.rotation.x = -0.5;
    p.legRPivot.rotation.x = -0.5;
    p.armLPivot.rotation.x = -1.2;
    p.armRPivot.rotation.x = -1.2;
    p.tailPivot.rotation.x = -0.3;
    p.headPivot.rotation.x = -0.15;
    root.rotation.x = -0.1;
    root.rotation.z = 0;
    root.scale.y = 1;
  },

  duck(p, t, root) {
    root.scale.y = 0.6;
    p.legLPivot.rotation.x = -0.3;
    p.legRPivot.rotation.x = -0.3;
    p.armLPivot.rotation.x = 0.5;
    p.armRPivot.rotation.x = 0.5;
    p.headPivot.rotation.x = -0.2;
    p.tailPivot.rotation.y = Math.sin(t * 3) * 0.15;
    p.tailPivot.rotation.x = 0.4;
    root.rotation.x = 0.2;
    root.rotation.z = 0;
  },

  death(p, t, root) {
    const fall = Math.min(1, t * 0.8);
    root.rotation.z = (fall * Math.PI) / 2;
    p.legLPivot.rotation.x = 0.5;
    p.legRPivot.rotation.x = 0.5;
    p.armLPivot.rotation.x = -0.8;
    p.armRPivot.rotation.x = -0.8;
    p.headPivot.rotation.x = 0.3;
    p.tailPivot.rotation.x = -0.2;
    root.scale.y = 1;
    root.rotation.x = 0;
  },

  special(p, t, root) {
    // Spin — the per-dino multiplayer ability flourish.
    root.rotation.y = t * 6;
    root.position.y = Math.sin(t * 6) * 0.3 + 0.3;
    p.armLPivot.rotation.x = -1.8;
    p.armRPivot.rotation.x = -1.8;
    p.armLPivot.rotation.z = -0.5;
    p.armRPivot.rotation.z = 0.5;
    p.tailPivot.rotation.x = -0.6;
    p.headPivot.rotation.x = -0.4;
    p.legLPivot.rotation.x = -0.2;
    p.legRPivot.rotation.x = -0.2;
    root.scale.y = 1 + Math.sin(t * 8) * 0.05;
    root.rotation.z = 0;
    root.rotation.x = 0;
  },
};

export interface DinoOptions {
  type?: DinoType;
  skin?: SkinName;
  /** When true, animations don't drive vertical position (the host game owns jump height). */
  hostControlsHeight?: boolean;
}

export class DinoCharacter {
  readonly root: THREE.Group;
  readonly type: DinoType;
  private skinName: SkinName;
  private animTime = 0;
  private currentAnim: DinoAnim = 'idle';
  private hostControlsHeight: boolean;
  private parts!: Parts;
  private mats!: {
    primary: THREE.MeshStandardMaterial;
    secondary: THREE.MeshStandardMaterial;
    belly: THREE.MeshStandardMaterial;
    dark: THREE.MeshStandardMaterial;
    white: THREE.MeshStandardMaterial;
  };
  private geos = new Set<THREE.BufferGeometry>();

  constructor(opts: DinoOptions = {}) {
    this.type = opts.type ?? 'trik';
    this.skinName = opts.skin ?? 'classic';
    this.hostControlsHeight = opts.hostControlsHeight ?? false;
    this.root = new THREE.Group();
    this.root.name = `dino_${this.type}`;
    this.build();
  }

  /** Switch the current animation; resets animation time. */
  play(anim: DinoAnim) {
    if (this.currentAnim === anim) return;
    this.currentAnim = anim;
    this.animTime = 0;
  }

  /** Hot-swap the skin (recolors materials; no rebuild). */
  setSkin(skin: SkinName) {
    this.skinName = skin;
    const c = SKINS[skin][this.type];
    this.mats.primary.color.setRGB(...c.primary);
    this.mats.secondary.color.setRGB(...c.secondary);
    this.mats.belly.color.setRGB(...c.belly);
  }

  /** Call every frame from the game loop. */
  update(dt: number) {
    this.animTime += dt;
    const baseY = this.root.position.y;
    ANIMATIONS[this.currentAnim](this.parts, this.animTime, this.root);
    if (this.hostControlsHeight) this.root.position.y = baseY; // keep limb motion, drop the anim's Y
  }

  dispose() {
    this.root.parent?.remove(this.root);
    this.geos.forEach((g) => g.dispose());
    Object.values(this.mats).forEach((m) => m.dispose());
    this.geos.clear();
  }

  static getTypes(): DinoType[] {
    return ['trik', 'stego', 'brachio', 'trex'];
  }

  // ─── build helpers ───────────────────────────────────────────
  private mat(rgb: RGB) {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(rgb[0], rgb[1], rgb[2]),
      roughness: 0.85,
      metalness: 0,
    });
  }

  /** A sphere with independent x/y/z diameters (unit sphere scaled). */
  private sphere(dx: number, dy: number, dz: number, m: THREE.Material) {
    const g = new THREE.SphereGeometry(0.5, 16, 12);
    this.geos.add(g);
    const mesh = new THREE.Mesh(g, m);
    mesh.scale.set(dx, dy, dz);
    return mesh;
  }

  private cylinder(dTop: number, dBottom: number, h: number, m: THREE.Material) {
    const g = new THREE.CylinderGeometry(dTop / 2, dBottom / 2, h, 12);
    this.geos.add(g);
    return new THREE.Mesh(g, m);
  }

  private box(w: number, h: number, d: number, m: THREE.Material) {
    const g = new THREE.BoxGeometry(w, h, d);
    this.geos.add(g);
    return new THREE.Mesh(g, m);
  }

  private pivot(parent: THREE.Object3D, x: number, y: number, z: number) {
    const p = new THREE.Group();
    p.position.set(x, y, z);
    parent.add(p);
    return p;
  }

  private build() {
    const c = SKINS[this.skinName][this.type];
    this.mats = {
      primary: this.mat(c.primary),
      secondary: this.mat(c.secondary),
      belly: this.mat(c.belly),
      dark: this.mat([0.1, 0.1, 0.1]),
      white: this.mat([1, 1, 1]),
    };
    const M = this.mats;
    const root = this.root;

    // Body + belly.
    const body = this.sphere(1.8, 2.0, 1.5, M.primary);
    body.position.y = 1.5;
    root.add(body);
    const belly = this.sphere(1.3, 1.5, 1.0, M.belly);
    belly.position.set(0, 1.35, 0.4);
    root.add(belly);

    // Head + face (on a pivot so it can bob/turn). +z is "forward" (toward the snout).
    const headPivot = this.pivot(root, 0, 2.5, 0.3);
    const head = this.sphere(1.4, 1.3, 1.5, M.primary);
    headPivot.add(head);
    const snout = this.sphere(0.8, 0.7, 0.9, M.primary);
    snout.position.set(0, -0.1, 0.7);
    headPivot.add(snout);
    for (const sx of [-0.35, 0.35]) {
      const eye = this.sphere(0.3, 0.3, 0.3, M.white);
      eye.position.set(sx, 0.2, 0.55);
      headPivot.add(eye);
      const pupil = this.sphere(0.15, 0.15, 0.15, M.dark);
      pupil.position.set(sx, 0.2, 0.7);
      headPivot.add(pupil);
    }

    // Arms.
    const armLPivot = this.pivot(root, -0.95, 1.8, 0);
    const armL = this.sphere(0.45, 0.9, 0.45, M.primary);
    armL.position.y = -0.4;
    armLPivot.add(armL);
    const armRPivot = this.pivot(root, 0.95, 1.8, 0);
    const armR = this.sphere(0.45, 0.9, 0.45, M.primary);
    armR.position.y = -0.4;
    armRPivot.add(armR);

    // Legs + feet.
    const legLPivot = this.pivot(root, -0.5, 0.8, 0);
    const legL = this.sphere(0.6, 1.0, 0.7, M.primary);
    legL.position.y = -0.5;
    legLPivot.add(legL);
    const footL = this.sphere(0.7, 0.3, 0.9, M.secondary);
    footL.position.set(0, -0.95, 0.15);
    legLPivot.add(footL);
    const legRPivot = this.pivot(root, 0.5, 0.8, 0);
    const legR = this.sphere(0.6, 1.0, 0.7, M.primary);
    legR.position.y = -0.5;
    legRPivot.add(legR);
    const footR = this.sphere(0.7, 0.3, 0.9, M.secondary);
    footR.position.set(0, -0.95, 0.15);
    legRPivot.add(footR);

    // Tail.
    const tailPivot = this.pivot(root, 0, 1.5, -0.7);
    const tail = this.sphere(0.6, 0.6, 1.4, M.primary);
    tail.position.set(0, 0, -0.5);
    tailPivot.add(tail);
    const tailTip = this.sphere(0.4, 0.4, 0.4, M.primary);
    tailTip.position.set(0, 0, -1.1);
    tailPivot.add(tailTip);

    this.parts = { headPivot, armLPivot, armRPivot, legLPivot, legRPivot, tailPivot };
    this.addSpeciesFeatures(headPivot, tailPivot, armL, armR, head);
  }

  private addSpeciesFeatures(
    headPivot: THREE.Group,
    tailPivot: THREE.Group,
    armL: THREE.Mesh,
    armR: THREE.Mesh,
    head: THREE.Mesh,
  ) {
    const M = this.mats;
    if (this.type === 'trik') {
      const frill = this.sphere(1.8, 1.5, 0.3, M.secondary);
      frill.position.set(0, 0.3, -0.4);
      headPivot.add(frill);
      const hornNose = this.cylinder(0.05, 0.25, 0.5, M.secondary);
      hornNose.position.set(0, 0.15, 0.95);
      hornNose.rotation.x = -0.3;
      headPivot.add(hornNose);
      for (const sx of [-0.4, 0.4]) {
        const horn = this.cylinder(0.05, 0.2, 0.7, M.secondary);
        horn.position.set(sx, 0.55, 0.3);
        horn.rotation.x = -0.2;
        headPivot.add(horn);
      }
    } else if (this.type === 'stego') {
      const plates = [
        { y: 2.4, z: 0.5, size: 0.5 },
        { y: 2.55, z: 0.0, size: 0.7 },
        { y: 2.5, z: -0.5, size: 0.6 },
        { y: 2.2, z: -1.0, size: 0.45 },
      ];
      for (const pl of plates) {
        const plate = this.box(0.15, pl.size, pl.size * 0.9, M.secondary);
        plate.position.set(0, pl.y, pl.z);
        this.root.add(plate);
      }
      for (const sx of [-0.2, 0.2]) {
        const spike = this.cylinder(0.02, 0.2, 0.6, M.secondary);
        spike.position.set(sx, 0.1, -1.0);
        spike.rotation.z = sx < 0 ? 0.5 : -0.5;
        tailPivot.add(spike);
      }
    } else if (this.type === 'brachio') {
      // Gentle long-neck: raise + shrink the head, build a neck of stacked segments. No weapons.
      headPivot.position.y += 1.15;
      headPivot.position.z = 0.55;
      headPivot.scale.setScalar(0.72);
      head.scale.multiplyScalar(0.95);
      const segs = 5;
      for (let i = 0; i < segs; i++) {
        const f = i / (segs - 1);
        const neck = this.sphere(0.6 - f * 0.18, 0.6 - f * 0.18, 0.6 - f * 0.18, M.primary);
        neck.position.set(0, 2.15 + f * 1.15, 0.2 + f * 0.35);
        this.root.add(neck);
      }
    } else if (this.type === 'trex') {
      armL.scale.multiplyScalar(0.6); // tiny arms
      armR.scale.multiplyScalar(0.6);
      const jaw = this.sphere(0.85, 0.3, 0.9, M.primary);
      jaw.position.set(0, -0.3, 0.7);
      headPivot.add(jaw);
      for (let i = 0; i < 4; i++) {
        const tooth = this.cylinder(0.02, 0.08, 0.15, M.white);
        tooth.position.set(-0.25 + i * 0.17, -0.18, 1.05);
        headPivot.add(tooth);
      }
      for (const sx of [-0.35, 0.35]) {
        const brow = this.box(0.3, 0.08, 0.15, M.secondary);
        brow.position.set(sx, 0.42, 0.55);
        brow.rotation.z = sx < 0 ? -0.3 : 0.3;
        headPivot.add(brow);
      }
    }
  }
}
