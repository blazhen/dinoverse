# DEPLOY.md — publish Dino Dash live (Vercel + Railway)

> First-launch deploy: just the Dino Dash game + multiplayer race server. No login, no DB,
> no email. Total cost on free tiers: $0. Time start-to-finish: ~30 minutes.

## What goes where

```
┌────────────────────────────┐     WebSocket     ┌──────────────────────────────┐
│  Vercel                    │ ←──────────────→  │  Railway                      │
│  ───────                   │                   │  ────────                     │
│  Next.js app (apps/web)    │                   │  Colyseus race server         │
│  https://*.vercel.app      │                   │  (apps/server) — wss://       │
└────────────────────────────┘                   └──────────────────────────────┘
            ▲                                                  ▲
            │ HTTPS                                            │ wss://
            │                                                  │
        Players (browser, phone, tablet)
```

The web app serves the game. The Railway service stays alive holding WebSocket connections so
friends can race. Vercel can't do that itself (its serverless functions are short-lived) —
that's why we split.

## 0 — Push to GitHub (if you haven't)

Both hosts deploy from GitHub. Make sure `.env`, `.env.local`, and `apps/web/.env` are NOT
committed (they're in `.gitignore` — verify before pushing).

## 1 — Deploy the race server on Railway (do this FIRST so you have the URL)

1. Sign up at https://railway.com (GitHub login is fine).
2. **New Project → Deploy from GitHub repo** → pick this repo.
3. Railway will detect the [`railway.json`](railway.json) at the repo root and use:
   - Builder: Nixpacks (auto-installs Node + pnpm from the lockfile)
   - Start command: `pnpm --filter @dinoverse/server start`
   - Health check: `GET /healthz`
4. **Settings → Networking → Generate Domain.** Railway gives you something like
   `dino-dash-race-production.up.railway.app`. Copy it — you'll need it in step 3.
5. Wait for the deploy to finish (~2 min). Hit `https://<your-url>/healthz` in a browser; you
   should see `{"ok":true,"service":"dino-dash-race",...}`.

**Cost:** Railway gives $5/mo free credit. The race server idles cheap — well under the cap.

## 2 — Deploy the web app on Vercel

1. Sign up at https://vercel.com (GitHub login).
2. **Add New… → Project → Import** this repo from GitHub.
3. **Configure Project:**
   - **Root Directory:** `apps/web` ← important (this is the monorepo bit)
   - **Framework Preset:** Next.js (auto-detected)
   - Build/install commands are baked into [`apps/web/vercel.json`](apps/web/vercel.json) — leave defaults.
4. **Environment Variables** — add one entry, scope = All (Production / Preview / Development):
   - **Name:** `NEXT_PUBLIC_COLYSEUS_URL`
   - **Value:** `wss://<your-railway-url-from-step-1>` (note the `wss://`, not `https://`)
   - Example: `wss://dino-dash-race-production.up.railway.app`
5. Click **Deploy**. ~2 min. Vercel gives you `https://your-project.vercel.app`.
6. Open `https://your-project.vercel.app/games/runner` on your phone + your friend's phone →
   Race with friends → host a code → other person joins. You should be live.

**Cost:** Vercel Hobby (free) covers this completely — solo developer, non-commercial use.

## 3 — (Optional) point a custom domain

You launched on `*.vercel.app` per your earlier pick. When ready for a real name:

1. Buy at any registrar — **Cloudflare Registrar is the cheapest** (~$9–10/yr for `.com`, at-cost).
2. Vercel → Project → Settings → Domains → Add → enter your domain → Vercel shows two DNS records
   (an A record + a CNAME for `www`). Copy them.
3. In your registrar's DNS, add those two records. SSL provisions automatically.
4. (You do NOT need to point a custom subdomain at Railway — the web app talks to it via the
   `wss://*.up.railway.app` URL stored in the env var; users never see it.)

## Verification checklist (after deploy)

- [ ] `https://your-project.vercel.app/games/runner` loads — single-player works
- [ ] Best score persists across page reloads (localStorage)
- [ ] `https://<railway-url>/healthz` returns 200 OK
- [ ] Lobby UI shows "🏁 Race with friends" button
- [ ] Hosting a room produces a 4-letter code; joining it from another browser/phone connects
- [ ] Both players see translucent ghost dinos during a race + live leaderboard
- [ ] Browser dev-tools Network tab shows the WebSocket connection upgrading to `wss://`

## When something breaks

| Symptom | Likely cause | Fix |
|---|---|---|
| Lobby shows "Failed to connect to server" | `NEXT_PUBLIC_COLYSEUS_URL` not set on Vercel, or Railway service is asleep | Re-check Vercel env var (must start with `wss://`), redeploy. Re-check Railway "Active". |
| Lobby connects but race never starts | Only 1 player ready — needs ≥2 | Have both hit ✓ Ready |
| `/healthz` returns 502 | Server crashed at boot | Railway → Deploy logs. Most common cause: missing env var or port collision. |
| Vercel build fails on type error | A new lint/type issue slipped in | Run `pnpm --filter @dinoverse/web typecheck` locally first |
| Build succeeds locally but fails on Vercel | Stale `pnpm-lock.yaml` | `pnpm install` locally, commit the updated lockfile, redeploy |

## Future env vars (when you light up the rest)

When you add login/profiles/DB later, you'll add these to **Vercel** (Production scope):

- `DATABASE_URL` — Neon connection string (pooled)
- `BETTER_AUTH_SECRET` — `openssl rand -base64 32`
- `BETTER_AUTH_URL` — `https://your-domain.com`
- `RESEND_API_KEY` — for email verification
- `CLOUDFLARE_*` — only when you turn on video/asset features

Neon migrations stay local: `DIRECT_URL` lives in your **root** `.env` and is used by
`drizzle-kit migrate`. Production never touches `DIRECT_URL` directly — the runtime uses
the pooled `DATABASE_URL`.

## Why this split (vs putting everything on one host)

Vercel's pricing model assumes short-lived serverless functions. Colyseus rooms hold long-lived
WebSocket connections (one socket per player, kept open for the whole race) and rely on
in-process memory for room state. That's the wrong shape for Vercel and the right shape for
Railway. Trying to make Vercel serverless do real-time would force a managed Redis + an
external WebSocket gateway — far more services to wire up and pay for.

When traffic outgrows Railway's regions (it's mostly US-East / EU), the documented escape
hatch is **Fly.io** (cheaper edge regions for WebSockets) — same Colyseus code, change the
host. See `SYSTEM_PROMPT.md` → tech stack notes.
