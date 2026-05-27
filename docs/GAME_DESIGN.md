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
1. **Pick one dino, never switch.** (Revised 2026-05-27.) You choose a dino and play as it. In
   **solo all three play identically** — the choice is cosmetic/identity, so a 5-year-old never has
   to manage a party or decide "which dino do I need here." No switching, no follow, no party.
2. **Signature abilities live in MULTIPLAYER, one per player.** (Revised 2026-05-27.) In co-op
   (3–4 friends) each player **is** one dino and uses *its* signature ability — Trik dash-boost,
   Stego shield, Brachio reach. One ability per player, still no switching. This is where the
   per-dino identity actually pays off, and it's the source of the friendly co-op/race dynamics.
3. **Learning is the progression engine** — you unlock areas/cosmetics/abilities by completing the
   learning challenges baked into puzzles (feeds the existing per-child progress system).
4. **Gentle & warm** — Pixar tone, non-violent, hand-drawn art target. Multiplayer mischief is
   playful (Mario-Kart-style items), never combat.

## Characters & abilities (locked)
| Dino | Personality (brief) | Signature ability |
|------|--------------------|-------------------|
| **Trik** | fast, curious, mischievous | **Dash** — cross gaps, hit fast switches |
| **Stego** | calm, protective, logical | **Smash / shield** — break cracked blocks, press heavy plates |
| **Brachiosaurus** | gentle giant, science-loving | **High reach** — high jump / reach high ledges & switches |

## Controls
- **Move** ←/→ (A/D) · **Jump** ↑/Space · **Ability** Shift · **Crawl** ↓. (No "switch" — see Pillar 1.)
- **The special control is the Ability button** (Shift on keyboard, ⚡ on touch) — the one input that
  makes us *us*. In solo it does the same thing for everyone; in co-op it's your dino's signature.
- Mobile/tablet (ages 5–15): on-screen buttons, **auto-sized by the child's age band** (younger =
  bigger, more forgiving targets) + Android-web haptic taps. *Done.* **Next:** swipe-up-to-jump and
  an auto-run "assist mode" for ages 5–7. Research-backed (kids <10 have limited fine-motor aim;
  Mario Kart's auto-assist is the model for spanning 5→15 in one game).
- Feel target: **Mario-tight** (responsive, forgiving coyote-time), not floaty.

## Audience & age tiers (5–14)
- **5–7:** effectively one character (others auto-follow), assist mode — no fall-deaths, forgiving
  timing, slower hazards.
- **8–11:** full switch-and-split puzzles.
- **12–14:** harder puzzles, more ability combos, co-op challenge levels.

## Multiplayer — the co-op vision (added 2026-05-27)
**3–4 friends play together, friends-only, safe.** This is where per-dino abilities and friendly
items come alive.
- **Group size:** up to 3–4 friends per room.
- **First multiplayer mode = a Dino Dash *race*** (not the puzzle-platformer). Everyone auto-runs
  forward; you see each other; you grab pickups and use them. We pick the runner first because the
  netcode is far simpler (all moving one direction; items are simple events) and it directly matches
  "running together." Co-op *puzzle-platformer* (tight physics sync) is a harder, later mode.
- **Each friend is one dino** → that dino's **signature ability** is their match power (no switching):
  Trik = dash-boost, Stego = shield (block an incoming item / protect a teammate), Brachio = reach
  (grab high pickups). One ability per player.
- **Friendly items, not combat** (Mario-Kart-for-kids): bubble-trap (brief), slow-goo, magnet,
  speed-boost. Nobody takes damage; nobody is eliminated — worst case you slow down. Keeps Pillar 4.
- **Cross-age in one race:** auto-run + **steering/lane assist for ages 5–7** so a 5-year-old and a
  14-year-old can play the same race (Mario Kart 8's auto-steer model). Item chaos keeps it fun for
  the older kids.
- **Safety (non-negotiable):** **friends-only invite-code rooms** (no random matchmaking with
  strangers), **no free-form chat** (preset emotes/reactions only), parent-visible activity. COPPA/
  GDPR-K first.
- **Stack:** Colyseus on Railway (authoritative room/state server) — the previously-planned path.

## Tech stack (locked 2026-05-27)
**Web-first, one codebase, shipped to iOS/Android via Capacitor; playable on web/PWA too.**
- **2D** games (platformer, puzzles, hub) → **Phaser**.
- **Stylized 3D** games (e.g. the Dino Dash endless runner, low-poly worlds) → **Three.js**.
- **App Store / Play Store + native features** (landscape lock, haptics, IAP, push) → **Capacitor**.
- Native engines (Unity/Godot) intentionally NOT used: unnecessary for stylized 2D/3D kids' games,
  and they'd break the build-and-verify workflow. Web 3D covers Subway-Surfers-grade games well;
  only AAA/heavy 3D would need native.

## Art direction (target)
Warm, hand-drawn 2D (Greak-like), bright palette. **Today = placeholder shapes + emoji**; real art is
the Phase 6 pipeline (the biggest visual lift). 2D via **Phaser**; **Three.js only** for optional 3D
set-pieces, much later.

## Non-goals (explicit scope cuts — say no to protect the core)
- ❌ Combat-focused metroidvania (Hollow Knight was a *look* reference, not the genre).
- ❌ Top-down loot/ARPG systems (FATE was a *hub-feel* reference only).
- ❌ Free-form chat, **combat** PvP, or aggressive/gacha monetization. (Amended 2026-05-27:
  **friendly, non-violent item interference** in friends-only co-op races — Mario-Kart-style:
  bubble-trap, slow-goo, speed-boost; nobody takes damage or is eliminated — IS in scope.)
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
