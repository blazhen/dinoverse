# ROADMAP & TO-DO — DinoVerse (working codename)

The durable backlog. Session task lists reset; **this file is the memory.** Check items off as
they're done (`- [x]`), add new ones as they surface, and keep "Open Decisions" current.

Last updated: 2026-05-23

---

## 🚦 OPEN DECISIONS

### ✅ Resolved (2026-05-23)
- [x] **Database:** **Neon** (serverless Postgres, branching). Replaces Supabase/Firebase as the DB.
      Auth/realtime/storage are now handled by dedicated services (below).
- [x] **Auth:** **Better Auth** — self-hosted TS library; keeps all user/children PII in your own
      Neon DB (cleaner COPPA/GDPR-K data-deletion & residency, no per-MAU cost, no lock-in).
      Trade-off: you own the security hardening (mitigated by Cloudflare WAF in front). Note:
      *verifiable parental consent is built by us regardless of auth vendor.*
- [x] **Frontend host + edge:** **Cloudflare** (Pages/Workers via `@opennextjs/cloudflare`) for
      best global CDN, plus WAF / DDoS / bot management / rate limiting at the edge.
- [x] **Video:** **Cloudflare Stream** (signed URLs) — consolidated with frontend, no cross-vendor egress.
- [x] **Asset/file storage:** **Cloudflare R2** (zero egress fees).
- [x] **Stateful backend (API + multiplayer + jobs):** **Railway** (long-lived containers — the one
      thing the edge can't host). *Escape hatch: move the realtime server to **Fly.io** if global
      multiplayer latency becomes critical (Railway has limited regions).*
- [x] **Monorepo tooling:** **Turborepo + pnpm workspaces** — lightweight, first-class Next.js +
      Expo support, minimal config; fits the low-lock-in ethos. *Graduate to Nx only if the repo
      grows to many standalone apps/publishable libs needing generators + enforced boundaries.*

- [x] **Multiplayer server:** **Colyseus** — authoritative server state (safety/anti-cheat),
      schema-based delta sync, built-in rooms/matchmaking/reconnection; Phaser + TS client; runs on
      Railway. *Socket.io/plain WS reserved for any future generic realtime (presence/notifications),
      not the game rooms.*

### Still open
- [ ] **Name the IP.** Currently using working codename **"DinoVerse"**. Pick the real franchise
      name + check domain/trademark/app-store availability, then replace the codename everywhere.
- [ ] **Compliance scope:** confirm target markets → COPPA (US), GDPR-K (EU), age-gating model.

---

## PHASE 0 — Foundations (do first)

- [x] Turn the brief into a system prompt (`SYSTEM_PROMPT.md`)
- [x] Create `CLAUDE.md` project context
- [x] Create this `ROADMAP.md`
- [x] Initialize git repository
- [x] Resolve core infra decisions (Neon, Better Auth, Cloudflare, Railway, Turborepo) — remaining: name
- [x] Scaffold **Turborepo + pnpm** monorepo: `apps/web` (Next.js 15+TS+Tailwind v4),
      `apps/mobile` (Expo SDK 52), `packages/ui`, `packages/types`, `packages/db` (Neon+Drizzle),
      `packages/config`. Verified: `pnpm install`, `pnpm -r typecheck`, and `web build` all pass.
      *Note: React pinned to 18.3.1 repo-wide (Expo 52 constraint) via pnpm override; revisit
      React 19 for web if/when mobile moves to an isolated-linker Metro setup.*
- [x] Add tooling baseline: Prettier, shared tsconfig presets, `.env.example`, README, `.gitignore`
- [ ] Wire Cloudflare deploy for `apps/web` (`@opennextjs/cloudflare`) + preview environments
- [x] Neon connected; first migration applied (parents, child_profiles, quizzes, progress live).
      *TODO later: Neon branching (a DB branch per preview deploy).*
- [x] Set up Better Auth (email/password) wired to Neon via Drizzle adapter. **Parent = the
      Better Auth `user`**; `child_profiles.parentId` → `user.id`; standalone `parents` table dropped.
      Verified end-to-end: sign-up writes `user` + credential `account` rows to Neon.
- [x] Auth UI: `/sign-up`, `/sign-in`, and a server-gated `/dashboard` (redirects to /sign-in
      when unauthenticated) + sign-out. Verified: gating 307s, sign-in sets session, dashboard renders.
- [x] Child-profile CRUD: parent adds/removes kids (name, age band, dino avatar) on the dashboard
      via server actions; data layer in `@dinoverse/db`. Verified vs Neon incl. parent→child cascade
      delete and enum validation. *Next: verifiable parental consent (COPPA).*
- [x] Password reset via email (Resend): `/forgot-password` + `/reset-password`, Better Auth
      `sendResetPassword`, email helper in `lib/email.ts`. Verified end-to-end (request→token→reset→
      new pw works, old pw 401; Resend call confirmed). *To deliver to real users: verify a domain at
      resend.com/domains and set `EMAIL_FROM` to it (sandbox only mails the Resend account owner).*
- [ ] Set up Railway service for the API/multiplayer (deferred to multiplayer phase)
- [ ] Add CI stub (typecheck + build on PR) and ESLint flat config across the workspace
- [ ] Set up environment/secrets strategy (Cloudflare + Railway env; no secrets in repo)

## PHASE 1 — Technical Architecture (document before building)

- [ ] Data model / ERD: users, kid-profiles (under parent account), content, episodes, quizzes,
      progress, badges, multiplayer rooms, parental controls
- [ ] Auth & roles via Better Auth: parent vs child accounts, COPPA-compliant onboarding & consent
- [ ] API routing plan (Cloudflare Workers edge fns vs Railway API) + naming conventions
- [ ] Multi-platform state-sync strategy (web ↔ mobile, offline cache reconciliation)
- [ ] Content moderation & child-safety architecture (preset comms, reporting, audit)
- [ ] Define ERD diagram + write Neon (Postgres) migration scripts; adopt row-level security patterns

## PHASE 2 — Module: Vertical Content Feed

- [x] Vertical snap-scroll feed UI (web) with child-safe overlay (no links/comments), autoplay-on-view
      via IntersectionObserver, muted-by-default + sound toggle. `/feed` route. Verified renders.
- [ ] Mobile feed UI (Expo) — port the vertical feed to React Native
- [ ] Video playback w/ adaptive bitrate via Cloudflare Stream. *Dev uses public sample mp4s;
      `resolveFeed()` in lib/sample-feed.ts is the single swap point to Stream signed URLs.*
- [ ] Micro-game embed format inside the feed
- [ ] Feed ranking / sequencing logic (curated, NOT addictive-by-design — age-appropriate limits)
- [ ] Performance budget + lazy loading + preloading strategy

## ⭐ PHASE G — GAMES (PRODUCT CORE)

> The heart of the product. Built on Phaser.js. Quizzes (Phase 3) are a *minor* learning-game type.
> **Vision:** two layers — top-down open-world HUB (FATE-flavored) → side-scrolling co-op
> puzzle-platformer EXPEDITIONS (Greak-flavored), 3 switchable dino party members, learning-driven
> progression, gentle/non-violent, hand-drawn warmth.

- [x] Phaser integrated into Next.js (client-only dynamic load); `/games` hub.
- [x] **Top-down hub seed** ("Explore Dino City"): movement, camera follow, collidable buildings,
      collectibles. `/games/explore`. Becomes the overworld HUB.
- [~] **Side-scroll platformer expedition** (Greak core): run/jump/dodge/crawl + platforms/hazards.
      `/games/expedition`. Asset-free prototype first; character-switching + abilities next.
- [x] **DECIDED 2026-05-27: no dino-switching.** Pick one dino; in solo all three play identically
      (cosmetic). Per-dino **signature abilities moved to multiplayer** (one dino per player) — see
      Phase 4 + GAME_DESIGN.md Pillars 1–2.
- [ ] Companion pets + light RPG progression (FATE-flavored) in the hub
- [ ] Learning-driven progression: solve puzzle → unlock area/cosmetic (learning = progression engine)
- [~] **Mobile/tablet controls for ages 5–15:** age-scaled, bigger/forgiving touch buttons +
      Android-web haptics — *done*. **Next:** swipe-up-to-jump; **assist mode for 5–7** (auto-run,
      no fall-deaths, forgiving timing); full challenge for 12–14.
- [ ] Tile-based worlds from Tiled JSON + R2-hosted art; expand the world
- [ ] Reusable puzzle/learning mini-game shell (React/DOM for simple puzzles)
- [ ] Save game state per child (position, unlocked areas, abilities, collectibles) to Neon
- [ ] Persist game-based learning outcomes into the shared progress/badges system
- [ ] **3D "Dino Dash" endless runner** (Subway-Surfers-style) as a self-contained hub mini-game —
      react-three-fiber/Three.js, 3-lane on-rails, swipe/arrow + jump + slide, gentle dodge-don't-fight.
      Fast-follow AFTER the 2D core MVP (separate engine; needs rigged 3D dino model — bigger art lift).
- [ ] 3D set-pieces for select scenes (later; evaluate react-three-fiber / Three.js)

## PHASE 3 — Module: Gamified Learning & Progression (quizzes = minor)

- [x] Quiz engine + question schema (`quiz_questions` table) + seed (`db:seed`). `/learn` lists
      quizzes; `/learn/[quizId]` is an interactive player with per-answer feedback. Verified renders.
- [x] Progress data layer: `recordProgress` / `listProgressForChild`; verified vs Neon incl. cascade.
      *Note: scoring is currently client-side (correctIndex sent to client) — move to server-side
      scoring before launch so answers can't be inspected.*
- [~] Achievement / badge system — basic perfect-score badge in the quiz result; needs real badges table
- [ ] Unlockable dino-facts content system
- [x] "Who's playing" kid-profile selection (`/play`, ownership-validated cookie); quiz completion
      persists to the active child via `recordQuizResult`. Verified vs Neon.
- [ ] Progress tracking synced across web + mobile
- [ ] XP / streak mechanics tuned for collaboration over competition

## PHASE 4 — Module: Safe Multiplayer Rooms

> **Vision (2026-05-27):** 3–4 friends, friends-only. **First mode = a Dino Dash *race*** (simplest
> netcode, matches "running together"), each friend = one dino with its **signature ability**, plus
> **friendly Mario-Kart-style items** (bubble/goo/boost — no combat, no elimination). Cross-age via
> auto-run + steering assist for 5–7. See GAME_DESIGN.md "Multiplayer".

- [ ] Real-time room/state server (Colyseus on Railway) — authoritative state, client prediction
- [ ] **Friends-only invite-code rooms** (NO random matchmaking with strangers); room lifecycle + reconnect
- [ ] Dino Dash multiplayer race: position sync, shared track, finish/ranking
- [ ] Per-dino signature ABILITY used on rivals (no switching) — temporary, non-damaging hindrances:
      spider-web (trap/pull/slow), thunder-zap (brief stun/shrink), venom-blindness (short blur),
      plus dash-boost + shield (block/cleanse). Mario-Kart-style; nobody is damaged or eliminated.
- [ ] Ability + cooldown system with clear on-screen feedback ("you got webbed / zapped / blinded")
- [ ] Steering/lane **assist for ages 5–7** so 5→15 can race together (Mario-Kart-8 model)
- [ ] **Preset-only** child-safe communication (emotes/reactions; no free-form chat)
- [ ] Anti-abuse + parental visibility into multiplayer activity
- [ ] (Later) Co-op puzzle-platformer mode (tight physics sync — harder; after the race ships)

## PHASE 5 — Module: Parent Dashboard

- [x] Segregated parent auth area (`/dashboard`, server-gated)
- [~] Learning-metrics: dashboard shows per-child quizzes-completed + best score + latest quiz.
      Needs richer analytics (trends, per-topic breakdown).
- [ ] Screen-time controls + enforcement across platforms
- [ ] Milestone / progression monitoring
- [x] Multi-child account management (add/remove kids, per-child progress)

## PHASE 6 — AI Video & Creative Pipeline

- [ ] Character reference sheets (Trik, Stego, Brachiosaurus) for consistency
- [ ] Consistency framework across Midjourney / Leonardo / Runway / Kling / ElevenLabs / Suno
- [ ] Asset versioning + canon-control process
- [ ] Pilot episode script + educational song integration
- [ ] Plan for transition to human/hybrid production pipeline

## PHASE 7 — Business, Monetization & Launch

- [ ] Business plan + freemium model design
- [ ] IP licensing paths + strategic rollout plan
- [ ] App store / web launch checklist (age ratings, privacy disclosures)
- [ ] Analytics, observability, scaling plan toward millions of concurrent users
- [ ] Legal: privacy policy, ToS, COPPA/GDPR-K compliance review

---

## CROSS-CUTTING (applies to every phase)

- [ ] Accessibility (kid-friendly, screen-reader, color/contrast)
- [ ] Localization / i18n foundation
- [ ] Automated testing strategy (unit/integration/e2e)
- [ ] Security review cadence
- [ ] Documentation kept in sync with code
