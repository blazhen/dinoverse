# DinoVerse (working codename)

A multi-platform educational-entertainment ecosystem: dinosaurs that never went extinct and
evolved into a modern society. Animated media + short-form feed + co-op multiplayer + gamified
learning, for kids 5–10.

> **Codename:** "DinoVerse" is a placeholder, not final branding. See [ROADMAP.md](ROADMAP.md).
> Project vision and rules: [SYSTEM_PROMPT.md](SYSTEM_PROMPT.md) · [CLAUDE.md](CLAUDE.md).

## Monorepo layout (Turborepo + pnpm)

```
apps/
  web/        Next.js 15 (App Router, TS, Tailwind v4) — deploys to Cloudflare
  mobile/     Expo SDK 52 (React Native, TS)
packages/
  ui/         Shared web React components
  types/      Shared domain TypeScript types (web + mobile safe)
  db/         Neon (Postgres) schema + Drizzle ORM client
  config/     Shared tsconfig presets
```

## Stack

| Layer | Choice |
|-------|--------|
| Monorepo | Turborepo + pnpm |
| Web | Next.js 15 · React 19 · Tailwind v4 (host: Cloudflare Pages/Workers) |
| Mobile | React Native / Expo |
| Database | Neon (Postgres) via Drizzle ORM |
| Auth | Better Auth (self-hosted) |
| API + jobs | Railway |
| Multiplayer | Colyseus on Railway |
| Game engine | Phaser.js |
| Video + storage | Cloudflare Stream + R2 |

## Getting started

```bash
pnpm install
cp .env.example .env        # fill in Neon, Better Auth, Cloudflare, Colyseus values

pnpm dev                    # run all apps in dev
pnpm --filter @dinoverse/web dev       # web only
pnpm --filter @dinoverse/mobile start  # mobile only (Expo)

pnpm typecheck              # typecheck the whole workspace
pnpm build                  # build all apps
```

### Database (Neon + Drizzle)

```bash
pnpm --filter @dinoverse/db db:generate   # generate migrations from schema
pnpm --filter @dinoverse/db db:migrate    # apply to the database
```

## Requirements

- Node >= 22
- pnpm 10 (`corepack enable`)
