# ROADMAP & TO-DO — [PROJECT NAME]

The durable backlog. Session task lists reset; **this file is the memory.** Check items off as
they're done (`- [x]`), add new ones as they surface, and keep "Open Decisions" current.

Last updated: 2026-05-23

---

## 🚦 OPEN DECISIONS

### ✅ Resolved (2026-05-23)
- [x] **Database:** **Neon** (serverless Postgres, branching). Replaces Supabase/Firebase as the DB.
      Auth/realtime/storage are now handled by dedicated services (below).
- [x] **Auth:** **Clerk** — cleanest COPPA-friendly parent-consent / child-account flows.
- [x] **Frontend host + edge:** **Cloudflare** (Pages/Workers via `@opennextjs/cloudflare`) for
      best global CDN, plus WAF / DDoS / bot management / rate limiting at the edge.
- [x] **Video:** **Cloudflare Stream** (signed URLs) — consolidated with frontend, no cross-vendor egress.
- [x] **Asset/file storage:** **Cloudflare R2** (zero egress fees).
- [x] **Stateful backend (API + multiplayer + jobs):** **Railway** (long-lived containers — the one
      thing the edge can't host). *Escape hatch: move the realtime server to **Fly.io** if global
      multiplayer latency becomes critical (Railway has limited regions).*

### Still open
- [ ] **Name the IP.** `[PROJECT NAME]` is a placeholder everywhere. Pick the franchise name +
      check domain/trademark/app-store availability.
- [ ] **Multiplayer server:** Colyseus vs Socket.io. (Colyseus = opinionated room/state framework;
      Socket.io = lower-level, more manual.) — leaning Colyseus; hosted on Railway.
- [ ] **Monorepo tooling:** Turborepo vs Nx (for shared web + mobile + packages).
- [ ] **Compliance scope:** confirm target markets → COPPA (US), GDPR-K (EU), age-gating model.

---

## PHASE 0 — Foundations (do first)

- [x] Turn the brief into a system prompt (`SYSTEM_PROMPT.md`)
- [x] Create `CLAUDE.md` project context
- [x] Create this `ROADMAP.md`
- [x] Initialize git repository
- [x] Resolve core infra decisions (Neon, Clerk, Cloudflare, Railway) — remaining: name, monorepo tool
- [ ] Scaffold monorepo: `apps/web` (Next.js+TS+Tailwind), `apps/mobile` (Expo),
      `packages/ui`, `packages/types`, `packages/db` (Neon schema/migrations), `packages/config`
- [ ] Wire Cloudflare deploy for `apps/web` (`@opennextjs/cloudflare`) + preview environments
- [ ] Set up Neon project + branching (a DB branch per preview deploy)
- [ ] Set up Clerk (parent/child account model) + Railway service for API/multiplayer
- [ ] Add tooling baseline: ESLint, Prettier, TypeScript config, `.env.example`, CI stub
- [ ] Set up environment/secrets strategy (Cloudflare + Railway env; no secrets in repo)

## PHASE 1 — Technical Architecture (document before building)

- [ ] Data model / ERD: users, kid-profiles (under parent account), content, episodes, quizzes,
      progress, badges, multiplayer rooms, parental controls
- [ ] Auth & roles via Clerk: parent vs child accounts, COPPA-compliant onboarding & consent
- [ ] API routing plan (Cloudflare Workers edge fns vs Railway API) + naming conventions
- [ ] Multi-platform state-sync strategy (web ↔ mobile, offline cache reconciliation)
- [ ] Content moderation & child-safety architecture (preset comms, reporting, audit)
- [ ] Define ERD diagram + write Neon (Postgres) migration scripts; adopt row-level security patterns

## PHASE 2 — Module: Vertical Content Feed

- [ ] Infinite-scroll vertical feed UI (web + mobile) with child-safe UX
- [ ] Video playback w/ adaptive bitrate via chosen provider
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
- [ ] Real-time room/state server (chosen framework)
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
