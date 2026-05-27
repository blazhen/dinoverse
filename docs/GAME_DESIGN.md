# DinoVerse — Game Design Doc (v1)

> One page, on purpose. This is the **converged core** — what we ARE building. It resolves our
> inspirations (Greak, Mario, Hollow Knight, FATE) into a single focused game and, importantly,
> says what we're **not** doing. Last updated: 2026-05-27.

## One-sentence pitch
A gentle, hand-drawn **2D co-op puzzle-platformer** starring three dino friends, set in an
open-world hub — kids run, jump, and use each dino's special skill to solve puzzles together and
learn along the way.

## Core loop
Hub (Dino City) → enter a level → traverse with platforming + the 3 dinos' abilities → solve
**ability-gated puzzles** (which double as **learning gates**) → reach the goal → earn progression
(unlock an ability / area / cosmetic) → back to hub → next level.

## Pillars (the things that make it *ours*)
1. **Three switchable dinos, each with one signature ability** — puzzles require all three.
2. **Solo = ONE character; co-op = one dino per player.** (Revised 2026-05-27 — simpler for kids.)
   In single-player you **pick one dino** and play the whole level as it (Mario-style); no party
   management/switching/follow. The three dinos are **selectable characters** and become the
   players in co-op multiplayer. Solo levels are beatable by any dino; each dino's ability opens
   **optional bonus** areas. (Co-op levels that *require* multiple abilities are a later, separate
   design.)
3. **Learning is the progression engine** — you unlock abilities/areas by completing the learning
   challenges baked into puzzles (feeds the existing per-child progress system).
4. **Gentle & warm** — Pixar tone, non-violent, hand-drawn art target.

## Characters & abilities (locked)
| Dino | Personality (brief) | Signature ability |
|------|--------------------|-------------------|
| **Trik** | fast, curious, mischievous | **Dash** — cross gaps, hit fast switches |
| **Stego** | calm, protective, logical | **Smash / shield** — break cracked blocks, press heavy plates |
| **Brachiosaurus** | gentle giant, science-loving | **High reach** — high jump / reach high ledges & switches |

## Controls
- **Move** ←/→ (A/D) · **Jump** ↑/Space · **Ability** Shift · **Crawl** ↓ · **Switch** 1/2/3 (or Q).
- Mobile (later): on-screen d-pad + ability/jump buttons.
- Feel target: **Mario-tight** (responsive, forgiving coyote-time), not floaty.

## Audience & age tiers (5–14)
- **5–7:** effectively one character (others auto-follow), assist mode — no fall-deaths, forgiving
  timing, slower hazards.
- **8–11:** full switch-and-split puzzles.
- **12–14:** harder puzzles, more ability combos, co-op challenge levels.

## Art direction (target)
Warm, hand-drawn 2D (Greak-like), bright palette. **Today = placeholder shapes + emoji**; real art is
the Phase 6 pipeline (the biggest visual lift). 2D via **Phaser**; **Three.js only** for optional 3D
set-pieces, much later.

## Non-goals (explicit scope cuts — say no to protect the core)
- ❌ Combat-focused metroidvania (Hollow Knight was a *look* reference, not the genre).
- ❌ Top-down loot/ARPG systems (FATE was a *hub-feel* reference only).
- ❌ Free-form chat, PvP, or aggressive/gacha monetization.
- ❌ One giant interconnected map for v1 — use **discrete levels + a hub**.
- ❌ 3D for v1. Quizzes stay a **minor** side-game, not the focus.

## MVP definition (what "done enough to show" means)
Hub + **2–3 hand-built levels** with ability-gated co-op puzzles · solo play with the **control-layer
abstraction** (local + switch + auto-follow) · **save state per child** · gentle tone · placeholder
art. **Fast-follows:** multiplayer rooms (Colyseus/Railway), then the art pipeline.

## Open questions (decide later, don't block)
- Art style: hand-drawn vs. pixel vs. AI-generated-then-cleaned.
- Specific learning subjects per level (counting, patterns, reading, science facts…).
- Monetization model (freemium shape) — post-MVP.
