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

## PHASE 3 — Module: Gamified Learning & Progression

- [ ] Quiz engine + question schema
- [ ] Achievement / badge system
- [ ] Unlockable dino-facts content system
- [ ] Progress tracking synced across web + mobile
- [ ] XP / streak mechanics tuned for collaboration over competition

## PHASE 4 — Module: Safe Multiplayer Rooms

- [ ] Co-op puzzle lobby (Phaser.js client)
- [ ] Real-time room/state server (Colyseus on Railway)
- [ ] **Preset-only** child-safe communication strings (no free-form chat)
- [ ] Matchmaking / room lifecycle / reconnection handling
- [ ] Anti-abuse + parental visibility into multiplayer activity

## PHASE 5 — Module: Parent Dashboard

- [ ] Segregated parent auth area
- [ ] Learning-metrics analytics views
- [ ] Screen-time controls + enforcement across platforms
- [ ] Milestone / progression monitoring
- [ ] Multi-child account management

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
