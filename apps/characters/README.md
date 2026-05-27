# Dino Characters — Babylon.js module

> **DinoVerse note (2026-05-27):** this is the *original Babylon.js* source, kept here as reference.
> Our app's 3D stack is **Three.js**, so this rig was **ported** to
> `apps/web/src/app/games/runner/dino-character.ts` (same `DinoCharacter` API: `play` / `setSkin` /
> `update` / `dispose`) and wired into Dino Dash. We do **not** ship Babylon. The port adds a gentle
> **Brachiosaurus** (our canon third dino); the T-Rex is kept as a bonus character.

Drop-in cartoony dinosaur characters for a Babylon.js runner game. Built for use with Babylon + Capacitor projects.

## Characters

- **Trik** — Triceratops (frill + 3 horns)
- **Stego** — Stegosaurus (back plates + tail spikes)
- **T-Rex** — tiny arms, teeth, angry eyebrows

## Animations

`idle`, `run`, `jump`, `duck`, `death`, `special` (spin)

## Skins included

`classic`, `lava`, `ice`, `neon` — easy to add more (see below).

---

## Quick preview

Open `index.html` in a browser (no build step needed — but you do need to serve it locally so the ES module import works):

```bash
# from this folder
python3 -m http.server 8000
# then open http://localhost:8000
```

Or use any static server you like (`npx serve`, `live-server`, VS Code Live Server, etc.).

> Opening `index.html` directly with `file://` won't work because browsers block ES modules on the file protocol. A local server is required for the preview, but **not** for your actual Babylon/Capacitor project — there it just works.

---

## Integration into your Babylon + Capacitor project

### 1. Copy the file in

Put `DinoCharacter.js` somewhere in your source folder, e.g. `src/game/characters/DinoCharacter.js`.

### 2. Make sure Babylon is loaded

The module assumes `BABYLON` is available globally. If you're using Babylon via npm:

```js
import * as BABYLON from 'babylonjs';
window.BABYLON = BABYLON; // make it global once, at app startup
```

Or import the specific things you need and adapt the module accordingly.

### 3. Use it

```js
import { DinoCharacter, SKINS } from './game/characters/DinoCharacter.js';

// Create your player
const player = new DinoCharacter(scene, {
  type: 'trex',         // 'trik' | 'stego' | 'trex'
  skin: 'classic',      // any key from SKINS
  position: new BABYLON.Vector3(0, 0, 0)
});

// Drive it from your game loop
scene.registerBeforeRender(() => {
  const dt = scene.getEngine().getDeltaTime() / 1000;
  player.update(dt);
});

// Trigger animations from your input handler
onJumpPressed(() => player.play('jump'));
onDuckPressed(() => player.play('duck'));
onCollision(() => player.play('death'));

// Hot-swap skin (e.g., from a settings menu)
player.setSkin('neon');

// Clean up if you ever need to
player.dispose();
```

---

## Adding a new skin

Open `DinoCharacter.js`, find the `SKINS` object, and add an entry. Each skin defines colors per species:

```js
export const SKINS = {
  // ...existing skins...
  gold: {
    trik:  { primary: [1.0, 0.85, 0.2], secondary: [0.6, 0.4, 0.05], belly: [1.0, 0.95, 0.6] },
    stego: { primary: [1.0, 0.85, 0.2], secondary: [0.6, 0.4, 0.05], belly: [1.0, 0.95, 0.6] },
    trex:  { primary: [1.0, 0.85, 0.2], secondary: [0.6, 0.4, 0.05], belly: [1.0, 0.95, 0.6] }
  }
};
```

Colors are `[r, g, b]` in 0–1 range.

For real production skin DLC, you'd store these in a JSON file and load them at runtime instead — the module already treats skins as data, so swapping in a remote skin catalog is straightforward.

---

## Adding a new animation

Find the `ANIMATIONS` object in `DinoCharacter.js`. Each animation is a function `(parts, t, root) => { ... }` that mutates rig rotations/positions. Use the existing ones as templates.

```js
const ANIMATIONS = {
  // ...existing animations...
  wave(p, t, root) {
    p.armRPivot.rotation.x = -Math.PI / 2;        // arm up
    p.armRPivot.rotation.z = Math.sin(t * 5) * 0.5; // wave
    p.headPivot.rotation.y = 0.3;                  // head turned
  }
};
```

Then call `player.play('wave')`.

---

## Notes for Capacitor

- Pure Babylon.js, no native plugins, no platform-specific code — works on iOS, Android, and web identically.
- The character is cheap to render (~15-20 primitives per dino). Tested fine for a runner with multiple on-screen.
- For best performance on mobile, freeze world matrices on non-animated parts if you build a more complex scene around it.

---

## What this isn't

- Not a `.glb`/`.gltf` mesh — it's procedural geometry built from spheres/boxes/cylinders. Stylized and intentional. If you later want sculpted models from Blender, the `DinoCharacter` API (constructor + `play()` + `setSkin()` + `update()` + `dispose()`) is a clean contract to swap them in behind.
- Not bone-skinned — uses parented `TransformNode` pivots for joints. Plenty for a cartoony runner; trade-off is no smooth animation blending. If you need that later, swap the `update()` internals to use Babylon's `AnimationGroup`.

---

## File list

```
DinoCharacter.js   ← the module (drop this into your project)
index.html         ← standalone preview (uses ./DinoCharacter.js)
README.md          ← this file
```
