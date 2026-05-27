/**
 * DinoCharacter.js
 * ----------------
 * Cartoony chunky humanoid dinosaur characters for Babylon.js runners.
 *
 * Characters: Trik (Triceratops), Stego (Stegosaurus), T-Rex
 * Animations: idle, run, jump, duck, death, special
 * Skins: classic, lava, ice, neon (extendable — just add to SKINS)
 *
 * Usage:
 *   import { DinoCharacter, SKINS } from './DinoCharacter.js';
 *
 *   const player = new DinoCharacter(scene, {
 *     type: 'trex',        // 'trik' | 'stego' | 'trex'
 *     skin: 'classic',     // key from SKINS
 *     position: new BABYLON.Vector3(0, 0, 0)
 *   });
 *
 *   player.play('run');          // start an animation
 *   player.setSkin('lava');      // hot-swap skin
 *   player.update(deltaSeconds); // call every frame from your game loop
 *   player.dispose();            // when done
 *
 * Integrates cleanly with Capacitor — pure Babylon, no native deps.
 */

/* eslint-disable no-undef */ // BABYLON is global from babylonjs

// ---------------------------------------------------------------------------
// Skin palette — each skin defines colors per species (primary, secondary, belly)
// Add new skins here. This is the data-driven part of the system.
// ---------------------------------------------------------------------------
export const SKINS = {
  classic: {
    trik:  { primary: [0.45, 0.75, 0.45], secondary: [0.85, 0.70, 0.40], belly: [0.95, 0.90, 0.70] },
    stego: { primary: [0.40, 0.55, 0.85], secondary: [0.95, 0.60, 0.30], belly: [0.85, 0.85, 0.95] },
    trex:  { primary: [0.70, 0.35, 0.30], secondary: [0.40, 0.20, 0.15], belly: [0.95, 0.85, 0.65] }
  },
  lava: {
    trik:  { primary: [0.85, 0.25, 0.10], secondary: [1.00, 0.70, 0.10], belly: [0.40, 0.10, 0.05] },
    stego: { primary: [0.70, 0.15, 0.05], secondary: [1.00, 0.85, 0.20], belly: [0.30, 0.08, 0.04] },
    trex:  { primary: [0.90, 0.30, 0.05], secondary: [1.00, 0.60, 0.00], belly: [0.40, 0.12, 0.05] }
  },
  ice: {
    trik:  { primary: [0.55, 0.80, 0.95], secondary: [0.95, 0.98, 1.00], belly: [0.85, 0.95, 1.00] },
    stego: { primary: [0.40, 0.70, 0.90], secondary: [0.70, 0.90, 1.00], belly: [0.90, 0.95, 1.00] },
    trex:  { primary: [0.50, 0.75, 0.95], secondary: [0.80, 0.90, 1.00], belly: [0.90, 0.95, 1.00] }
  },
  neon: {
    trik:  { primary: [0.00, 1.00, 0.50], secondary: [1.00, 0.00, 0.85], belly: [0.95, 1.00, 0.20] },
    stego: { primary: [0.00, 0.85, 1.00], secondary: [1.00, 0.20, 0.85], belly: [0.95, 1.00, 0.30] },
    trex:  { primary: [0.85, 0.00, 1.00], secondary: [0.00, 1.00, 0.85], belly: [1.00, 0.95, 0.00] }
  }
};

// ---------------------------------------------------------------------------
// Animation library — each function takes (parts, t) and mutates the rig.
// t is animation-local time in seconds (resets when you call play()).
// ---------------------------------------------------------------------------
const ANIMATIONS = {
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
    root.scaling.y = 1 + Math.sin(t * 2) * 0.02;
  },

  run(p, t, root) {
    const speed = 8;
    root.position.y = Math.abs(Math.sin(t * speed)) * 0.25;
    root.rotation.x = -0.15;
    p.legLPivot.rotation.x = Math.sin(t * speed) * 0.9;
    p.legRPivot.rotation.x = Math.sin(t * speed + Math.PI) * 0.9;
    p.armLPivot.rotation.x = Math.sin(t * speed + Math.PI) * 0.7;
    p.armRPivot.rotation.x = Math.sin(t * speed) * 0.7;
    p.tailPivot.rotation.y = Math.sin(t * speed) * 0.4;
    p.tailPivot.rotation.x = 0.2;
    p.headPivot.rotation.x = 0.1 + Math.sin(t * speed) * 0.05;
    root.scaling.y = 1;
    root.rotation.z = 0;
  },

  jump(p, t, root) {
    // Single jump arc: crouch → airborne → land. After 2s, returns to neutral.
    const cycle = Math.min(t * 1.2, 2);
    let h, legBend;
    if (cycle < 0.3) {
      h = 0; legBend = -0.6;
    } else if (cycle < 1.2) {
      h = Math.sin(((cycle - 0.3) / 0.9) * Math.PI) * 2.2;
      legBend = -0.3;
    } else {
      h = 0; legBend = -0.4;
    }
    root.position.y = h;
    p.legLPivot.rotation.x = legBend;
    p.legRPivot.rotation.x = legBend;
    p.armLPivot.rotation.x = -1.2;
    p.armRPivot.rotation.x = -1.2;
    p.tailPivot.rotation.x = -0.3;
    p.headPivot.rotation.x = -0.15;
    root.rotation.x = -0.1;
    root.rotation.z = 0;
    root.scaling.y = 1;
  },

  duck(p, t, root) {
    root.position.y = -0.6;
    root.scaling.y = 0.6;
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
    root.rotation.z = fall * Math.PI / 2;
    root.position.y = -fall * 0.8;
    p.legLPivot.rotation.x = 0.5;
    p.legRPivot.rotation.x = 0.5;
    p.armLPivot.rotation.x = -0.8;
    p.armRPivot.rotation.x = -0.8;
    p.headPivot.rotation.x = 0.3;
    p.tailPivot.rotation.x = -0.2;
    root.scaling.y = 1;
    root.rotation.x = 0;
  },

  special(p, t, root) {
    // Spin attack — rotates the whole character with pose
    root.rotation.y = t * 4;
    root.position.y = Math.sin(t * 4) * 0.3 + 0.3;
    p.armLPivot.rotation.x = -1.8;
    p.armRPivot.rotation.x = -1.8;
    p.armLPivot.rotation.z = -0.5;
    p.armRPivot.rotation.z = 0.5;
    p.tailPivot.rotation.x = -0.6;
    p.headPivot.rotation.x = -0.4;
    p.legLPivot.rotation.x = -0.2;
    p.legRPivot.rotation.x = -0.2;
    root.scaling.y = 1 + Math.sin(t * 8) * 0.05;
    root.rotation.z = 0;
    root.rotation.x = 0;
  }
};

// ---------------------------------------------------------------------------
// DinoCharacter — the main class
// ---------------------------------------------------------------------------
export class DinoCharacter {
  /**
   * @param {BABYLON.Scene} scene
   * @param {object} options
   * @param {'trik'|'stego'|'trex'} options.type
   * @param {string} options.skin  — key from SKINS (default 'classic')
   * @param {BABYLON.Vector3} [options.position]
   */
  constructor(scene, options = {}) {
    this.scene = scene;
    this.type = options.type || 'trik';
    this.skinName = options.skin || 'classic';
    this.animTime = 0;
    this.currentAnim = 'idle';
    this._meshes = [];
    this._materials = {};

    this.root = new BABYLON.TransformNode(`dino_${this.type}`, scene);
    if (options.position) this.root.position = options.position;

    this._build();
  }

  // -----------------------------------------------------------
  // Public API
  // -----------------------------------------------------------

  /** Switch the current animation. Resets animation time to 0. */
  play(animName) {
    if (!ANIMATIONS[animName]) {
      console.warn(`[DinoCharacter] Unknown animation: ${animName}`);
      return;
    }
    this.currentAnim = animName;
    this.animTime = 0;
  }

  /** Hot-swap the skin. Rebuilds materials only (no mesh rebuild). */
  setSkin(skinName) {
    if (!SKINS[skinName]) {
      console.warn(`[DinoCharacter] Unknown skin: ${skinName}`);
      return;
    }
    this.skinName = skinName;
    const colors = SKINS[skinName][this.type];
    this._materials.primary.diffuseColor   = new BABYLON.Color3(...colors.primary);
    this._materials.secondary.diffuseColor = new BABYLON.Color3(...colors.secondary);
    this._materials.belly.diffuseColor     = new BABYLON.Color3(...colors.belly);
  }

  /** Call from your game loop. dt is delta in seconds. */
  update(dt) {
    this.animTime += dt;
    const fn = ANIMATIONS[this.currentAnim] || ANIMATIONS.idle;
    fn(this.parts, this.animTime, this.root);
  }

  /** Get list of available animations. */
  static getAnimations() { return Object.keys(ANIMATIONS); }

  /** Get list of available skins. */
  static getSkins() { return Object.keys(SKINS); }

  /** Get list of available character types. */
  static getTypes() { return ['trik', 'stego', 'trex']; }

  /** Clean up meshes + materials. */
  dispose() {
    this._meshes.forEach(m => m.dispose());
    Object.values(this._materials).forEach(m => m.dispose());
    this.root.dispose();
    this._meshes = [];
    this._materials = {};
  }

  // -----------------------------------------------------------
  // Internals — build the rig
  // -----------------------------------------------------------

  _makeMat(name, rgb) {
    const m = new BABYLON.StandardMaterial(name, this.scene);
    m.diffuseColor = new BABYLON.Color3(rgb[0], rgb[1], rgb[2]);
    m.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
    return m;
  }

  _build() {
    const scene = this.scene;
    const type = this.type;
    const colors = SKINS[this.skinName][type];

    // Materials (kept on the instance so setSkin can mutate them)
    this._materials.primary   = this._makeMat(`${type}_primary`, colors.primary);
    this._materials.secondary = this._makeMat(`${type}_secondary`, colors.secondary);
    this._materials.belly     = this._makeMat(`${type}_belly`, colors.belly);
    this._materials.dark      = this._makeMat(`${type}_dark`, [0.1, 0.1, 0.1]);
    this._materials.white     = this._makeMat(`${type}_white`, [1, 1, 1]);

    const M = this._materials;
    const root = this.root;
    const track = (mesh) => { this._meshes.push(mesh); return mesh; };

    // ----- Body -----
    const body = track(BABYLON.MeshBuilder.CreateSphere('body',
      { diameterX: 1.8, diameterY: 2.0, diameterZ: 1.5 }, scene));
    body.material = M.primary; body.position.y = 1.5; body.parent = root;

    const bellyMesh = track(BABYLON.MeshBuilder.CreateSphere('belly',
      { diameterX: 1.3, diameterY: 1.5, diameterZ: 1.0 }, scene));
    bellyMesh.material = M.belly; bellyMesh.position.set(0, 1.35, 0.4); bellyMesh.parent = root;

    // ----- Head + face (parented to headPivot so it can bob/turn) -----
    const headPivot = new BABYLON.TransformNode('headPivot', scene);
    headPivot.parent = root; headPivot.position.set(0, 2.5, 0.3);

    const head = track(BABYLON.MeshBuilder.CreateSphere('head',
      { diameterX: 1.4, diameterY: 1.3, diameterZ: 1.5 }, scene));
    head.material = M.primary; head.parent = headPivot;

    const snout = track(BABYLON.MeshBuilder.CreateSphere('snout',
      { diameterX: 0.8, diameterY: 0.7, diameterZ: 0.9 }, scene));
    snout.material = M.primary; snout.position.set(0, -0.1, 0.7); snout.parent = headPivot;

    // Eyes (whites + pupils)
    const eyeL = track(BABYLON.MeshBuilder.CreateSphere('eyeL', { diameter: 0.3 }, scene));
    eyeL.material = M.white; eyeL.position.set(-0.35, 0.2, 0.55); eyeL.parent = headPivot;
    const eyeR = track(BABYLON.MeshBuilder.CreateSphere('eyeR', { diameter: 0.3 }, scene));
    eyeR.material = M.white; eyeR.position.set(0.35, 0.2, 0.55); eyeR.parent = headPivot;
    const pupilL = track(BABYLON.MeshBuilder.CreateSphere('pupilL', { diameter: 0.15 }, scene));
    pupilL.material = M.dark; pupilL.position.set(-0.35, 0.2, 0.7); pupilL.parent = headPivot;
    const pupilR = track(BABYLON.MeshBuilder.CreateSphere('pupilR', { diameter: 0.15 }, scene));
    pupilR.material = M.dark; pupilR.position.set(0.35, 0.2, 0.7); pupilR.parent = headPivot;

    // ----- Arms (stubby) -----
    const armLPivot = new BABYLON.TransformNode('armLPivot', scene);
    armLPivot.parent = root; armLPivot.position.set(-0.95, 1.8, 0);
    const armL = track(BABYLON.MeshBuilder.CreateSphere('armL',
      { diameterX: 0.45, diameterY: 0.9, diameterZ: 0.45 }, scene));
    armL.material = M.primary; armL.position.y = -0.4; armL.parent = armLPivot;

    const armRPivot = new BABYLON.TransformNode('armRPivot', scene);
    armRPivot.parent = root; armRPivot.position.set(0.95, 1.8, 0);
    const armR = track(BABYLON.MeshBuilder.CreateSphere('armR',
      { diameterX: 0.45, diameterY: 0.9, diameterZ: 0.45 }, scene));
    armR.material = M.primary; armR.position.y = -0.4; armR.parent = armRPivot;

    // ----- Legs (with feet) -----
    const legLPivot = new BABYLON.TransformNode('legLPivot', scene);
    legLPivot.parent = root; legLPivot.position.set(-0.5, 0.8, 0);
    const legL = track(BABYLON.MeshBuilder.CreateSphere('legL',
      { diameterX: 0.6, diameterY: 1.0, diameterZ: 0.7 }, scene));
    legL.material = M.primary; legL.position.y = -0.5; legL.parent = legLPivot;
    const footL = track(BABYLON.MeshBuilder.CreateSphere('footL',
      { diameterX: 0.7, diameterY: 0.3, diameterZ: 0.9 }, scene));
    footL.material = M.secondary; footL.position.set(0, -0.95, 0.15); footL.parent = legLPivot;

    const legRPivot = new BABYLON.TransformNode('legRPivot', scene);
    legRPivot.parent = root; legRPivot.position.set(0.5, 0.8, 0);
    const legR = track(BABYLON.MeshBuilder.CreateSphere('legR',
      { diameterX: 0.6, diameterY: 1.0, diameterZ: 0.7 }, scene));
    legR.material = M.primary; legR.position.y = -0.5; legR.parent = legRPivot;
    const footR = track(BABYLON.MeshBuilder.CreateSphere('footR',
      { diameterX: 0.7, diameterY: 0.3, diameterZ: 0.9 }, scene));
    footR.material = M.secondary; footR.position.set(0, -0.95, 0.15); footR.parent = legRPivot;

    // ----- Tail -----
    const tailPivot = new BABYLON.TransformNode('tailPivot', scene);
    tailPivot.parent = root; tailPivot.position.set(0, 1.5, -0.7);
    const tail = track(BABYLON.MeshBuilder.CreateSphere('tail',
      { diameterX: 0.6, diameterY: 0.6, diameterZ: 1.4 }, scene));
    tail.material = M.primary; tail.position.set(0, 0, -0.5); tail.parent = tailPivot;
    const tailTip = track(BABYLON.MeshBuilder.CreateSphere('tailTip', { diameter: 0.4 }, scene));
    tailTip.material = M.primary; tailTip.position.set(0, 0, -1.1); tailTip.parent = tailPivot;

    // ----- Species-specific features -----
    if (type === 'trik') {
      // Frill + 3 horns
      const frill = track(BABYLON.MeshBuilder.CreateSphere('frill',
        { diameterX: 1.8, diameterY: 1.5, diameterZ: 0.3 }, scene));
      frill.material = M.secondary; frill.position.set(0, 0.3, -0.4); frill.parent = headPivot;

      const hornNose = track(BABYLON.MeshBuilder.CreateCylinder('hornNose',
        { diameterTop: 0.05, diameterBottom: 0.25, height: 0.5 }, scene));
      hornNose.material = M.secondary; hornNose.position.set(0, 0.15, 0.95);
      hornNose.rotation.x = -0.3; hornNose.parent = headPivot;

      const hornL = track(BABYLON.MeshBuilder.CreateCylinder('hornL',
        { diameterTop: 0.05, diameterBottom: 0.2, height: 0.7 }, scene));
      hornL.material = M.secondary; hornL.position.set(-0.4, 0.55, 0.3);
      hornL.rotation.x = -0.2; hornL.parent = headPivot;

      const hornR = track(BABYLON.MeshBuilder.CreateCylinder('hornR',
        { diameterTop: 0.05, diameterBottom: 0.2, height: 0.7 }, scene));
      hornR.material = M.secondary; hornR.position.set(0.4, 0.55, 0.3);
      hornR.rotation.x = -0.2; hornR.parent = headPivot;

    } else if (type === 'stego') {
      // Back plates
      const plates = [
        { y: 2.4, z: 0.5, size: 0.5 },
        { y: 2.55, z: 0.0, size: 0.7 },
        { y: 2.5, z: -0.5, size: 0.6 },
        { y: 2.2, z: -1.0, size: 0.45 }
      ];
      plates.forEach((pl, i) => {
        const plate = track(BABYLON.MeshBuilder.CreateBox(`plate${i}`,
          { width: 0.15, height: pl.size, depth: pl.size * 0.9 }, scene));
        plate.material = M.secondary;
        plate.position.set(0, pl.y, pl.z);
        plate.parent = root;
      });
      // Tail spikes (thagomizer)
      for (let i = 0; i < 2; i++) {
        const spike = track(BABYLON.MeshBuilder.CreateCylinder(`spike${i}`,
          { diameterTop: 0.02, diameterBottom: 0.2, height: 0.6 }, scene));
        spike.material = M.secondary;
        spike.position.set(i === 0 ? -0.2 : 0.2, 0.1, -1.0);
        spike.rotation.z = i === 0 ? 0.5 : -0.5;
        spike.parent = tailPivot;
      }

    } else if (type === 'trex') {
      // Tiny arms — scale down the existing ones
      armL.scaling.set(0.6, 0.6, 0.6);
      armR.scaling.set(0.6, 0.6, 0.6);

      // Lower jaw
      const jaw = track(BABYLON.MeshBuilder.CreateSphere('jaw',
        { diameterX: 0.85, diameterY: 0.3, diameterZ: 0.9 }, scene));
      jaw.material = M.primary; jaw.position.set(0, -0.3, 0.7); jaw.parent = headPivot;

      // Teeth
      for (let i = 0; i < 4; i++) {
        const tooth = track(BABYLON.MeshBuilder.CreateCylinder(`tooth${i}`,
          { diameterTop: 0.02, diameterBottom: 0.08, height: 0.15 }, scene));
        tooth.material = M.white;
        tooth.position.set(-0.25 + (i * 0.17), -0.18, 1.05);
        tooth.parent = headPivot;
      }

      // Angry eyebrow ridges
      const browL = track(BABYLON.MeshBuilder.CreateBox('browL',
        { width: 0.3, height: 0.08, depth: 0.15 }, scene));
      browL.material = M.secondary; browL.position.set(-0.35, 0.42, 0.55);
      browL.rotation.z = -0.3; browL.parent = headPivot;

      const browR = track(BABYLON.MeshBuilder.CreateBox('browR',
        { width: 0.3, height: 0.08, depth: 0.15 }, scene));
      browR.material = M.secondary; browR.position.set(0.35, 0.42, 0.55);
      browR.rotation.z = 0.3; browR.parent = headPivot;
    }

    // Store pivots so animations can grab them
    this.parts = { body, bellyMesh, headPivot, armLPivot, armRPivot, legLPivot, legRPivot, tailPivot };
  }
}
