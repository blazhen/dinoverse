# Dino Dash — Multiplayer Race (design + plan)

> The headline feature for the **first launch** (Dino Dash). 3–4 friends race the same track,
> see each other, and use items/abilities. Friends-only and safe. Started 2026-05-28.

## Architecture (the pragmatic, low-bandwidth model)

We do **NOT** simulate the whole game on the server. Instead:

1. **Seeded, deterministic track.** The room picks one `seed`; every client generates the *same*
   obstacles / boxes / pickups from that seed (we'll swap the runner's `Math.random()` for a seeded
   PRNG — `mulberry32`, same as the platformer level-gen). So nobody has to sync the world — it's
   identical everywhere for free.
2. **Per-player position sync.** Each client runs its own runner locally and sends its
   `{distance, lane, y}` a few times/sec. The room broadcasts everyone's positions; each client
   draws the *other* dinos as "ghosts" at their reported spot.
3. **Server-validated events.** Item/ability use, hits, and finishes are **messages** the server
   checks (e.g. the magnet's 20–25 m range) and applies to room state — so they can't be faked and
   everyone agrees on the outcome.

**Stack:** **Colyseus** (authoritative room + state schema) on **Railway** · **colyseus.js** client
in the Next app. Chosen over Socket.io because room/state/matchmaking are built in.

## Room state (server schema)

```
RaceState { seed, phase: 'lobby'|'countdown'|'racing'|'finished', startsAt, players: Map<PlayerState> }
PlayerState { id, name, character, ready, distance, lane, y, hearts, finished, place }
```

Rooms are **friends-only via invite code** — `joinOrCreate('race', { code })` with `filterBy(['code'])`,
so the same code lands everyone in the same room. **No random matchmaking with strangers.**

## Milestones

- **M1 — Lobby + see each other** *(✅ shipped 2026-05-28)*
  - [x] Colyseus server scaffold (`apps/server`): `RaceRoom`, state schema, join/leave, ready-up,
        lobby→countdown→racing phases, position + finish messages.
  - [x] Client: colyseus.js connect, host/join-by-code lobby UI, ready toggle.
  - [x] Runner refactor: **seeded** deterministic track (mulberry32 — `opts.seed`).
  - [x] Render remote players as ghost dinos at their synced distance/lane (translucent + name label);
        10Hz pos broadcast; live leaderboard panel during the race.
  - [x] Local dev works out of the box on LAN (client derives ws URL from window.location.hostname).
  - [ ] Railway deploy + `NEXT_PUBLIC_COLYSEUS_URL` for play-with-anyone over the internet.
- **M2 — Race rules:** 3-2-1 countdown overlay (currently just shown in lobby — move into the game),
  finish line / distance goal, live ranking, hearts, rejoin.
- **M3 — Items & abilities:** shared pickups that regenerate (boosts ~1s, coins ~3s); **magnet =
  rubber-band pull** (trailers forward / leaders back, ≤25 m, 1–2 s); per-dino abilities
  (spider-web / thunder-zap / venom-blindness) — temporary, non-damaging, server-validated.
- **M4 — Safety & polish:** preset emotes (no free chat), parental visibility, reconnection,
  anti-abuse, lobby/result screens.

## How to run it locally (LAN play with a friend on the same WiFi)

**Two terminals on your dev PC:**

```powershell
# Terminal 1 — the realtime race server (port 2567)
pnpm --filter @dinoverse/server install   # one time
pnpm --filter @dinoverse/server dev

# Terminal 2 — the Next.js web app (port 3000) — already what you do today
pnpm --filter @dinoverse/web dev
```

**Then on each device on the same WiFi:**

1. Open `http://<your-PC-LAN-IP>:3000/games/runner` (e.g. `http://192.168.1.186:3000/games/runner`).
2. Tap **🏁 Race with friends** on the menu.
3. One player taps **🎲 Host (new code)** → shares the 4-letter code (e.g. `ABCD`).
4. The other player(s) type the code → **🔑 Join code**.
5. Everyone hits **✓ I'm ready!** — once ≥2 are ready, the server starts a 3-second countdown
   then the race kicks off. You should see each other as translucent dinos on the same track,
   plus a live leaderboard top-right.

The client picks the server URL automatically from the page's hostname + port 2567 — no env vars
needed for LAN. To override (e.g. once you deploy the server somewhere public), set
`NEXT_PUBLIC_COLYSEUS_URL=wss://your-server.example.com` in `apps/web/.env.local`.

## Known gaps (next iterations)

- **Finish line / win condition** — currently the room marks a player "finished" only when they
  game-over locally. No distance goal yet, so the "race" is really "last alive". Add a target
  distance (e.g. 2000m) and award places.
- **Countdown overlay during the race** — `phase === 'countdown'` shows in the lobby; we should
  also dim the canvas with a big `3 / 2 / 1 / GO` while the canvas mounts.
- **Rejoin / mid-race join** — currently a late joiner can't enter once a room is racing.
- **Items / abilities** — M3 work.

## Railway setup (one-time, you do this)
1. New Railway service from the repo, **root = `apps/server`** (or set start command `pnpm --filter @dinoverse/server start`).
2. Railway auto-provides `PORT`; the server reads it. No DB needed for the room server (state is in-memory).
3. Copy the public URL (e.g. `wss://dino-dash-xxxx.up.railway.app`) → set `NEXT_PUBLIC_GAME_SERVER_URL`
   in the web app's env (local `.env` + Vercel/Cloudflare).
4. Local dev: `pnpm --filter @dinoverse/server dev` (defaults to `ws://localhost:2567`).
