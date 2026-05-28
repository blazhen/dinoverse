// Thin wrapper around colyseus.js for the Dino Dash race room. The web app talks to this;
// the runner stays oblivious to networking (it just consumes a seed and a list of opponents).
//
// Server URL resolution:
//   1. `NEXT_PUBLIC_COLYSEUS_URL` env var (e.g. wss://race.up.railway.app) — set this in
//      Vercel / Cloudflare project env for production.
//   2. derived from window.location.hostname + port 2567 — works on LAN automatically when
//      both phone and PC sit on the same WiFi (no env config needed).

import { Client, type Room } from 'colyseus.js';

import type { DinoType } from './dino-character';

export type MpPhase = 'lobby' | 'countdown' | 'racing' | 'finished';

export interface MpPlayer {
  id: string;
  name: string;
  character: DinoType;
  ready: boolean;
  distance: number;
  lane: number;
  y: number;
  hearts: number;
  finished: boolean;
  place: number;
}

export interface MpState {
  seed: number;
  phase: MpPhase;
  startsAt: number; // epoch ms the race officially begins (after a 3s countdown)
  players: MpPlayer[];
  myId: string;
}

export interface MpCallbacks {
  onState: (s: MpState) => void;
  onError?: (msg: string) => void;
  onLeave?: () => void;
}

// Server-schema shape — we don't import @colyseus/schema types directly to keep the runtime
// dependency light. The fields here mirror apps/server/src/rooms/RaceRoom.ts.
interface RemotePlayer {
  id: string;
  name: string;
  character: string;
  ready: boolean;
  distance: number;
  lane: number;
  y: number;
  hearts: number;
  finished: boolean;
  place: number;
}
interface RemoteState {
  seed: number;
  phase: MpPhase;
  startsAt: number;
  players: { forEach(cb: (p: RemotePlayer) => void): void };
}

export function defaultServerUrl(): string {
  // Auto-derived from the page's own hostname — works on LAN and as a sensible fallback
  // if NEXT_PUBLIC_COLYSEUS_URL is missing or malformed in production.
  const derived =
    typeof window === 'undefined'
      ? 'ws://localhost:2567'
      : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.hostname}:2567`;

  const raw = (process.env.NEXT_PUBLIC_COLYSEUS_URL ?? '').trim();
  if (!raw) return derived;

  // Validate the env var BEFORE handing it to `new Client(url)` (which calls `new URL()` and
  // throws "Invalid URL" on garbage). A bad value here is almost always missing/wrong protocol.
  try {
    const u = new URL(raw);
    if (u.protocol !== 'ws:' && u.protocol !== 'wss:') {
      // eslint-disable-next-line no-console
      console.warn(
        `[multiplayer] NEXT_PUBLIC_COLYSEUS_URL must start with ws:// or wss://, got "${u.protocol}". Falling back to ${derived}. Fix the Vercel env var.`,
      );
      return derived;
    }
    return raw;
  } catch {
    // eslint-disable-next-line no-console
    console.warn(
      `[multiplayer] NEXT_PUBLIC_COLYSEUS_URL is not a valid URL: "${raw}". Falling back to ${derived}. Did you forget the wss:// prefix?`,
    );
    return derived;
  }
}

function asDino(s: string): DinoType {
  return s === 'stego' || s === 'brachio' || s === 'trex' ? (s as DinoType) : 'trik';
}

function snapshot(state: RemoteState, myId: string): MpState {
  const players: MpPlayer[] = [];
  state.players.forEach((p) => {
    players.push({
      id: p.id,
      name: p.name,
      character: asDino(p.character),
      ready: p.ready,
      distance: p.distance,
      lane: p.lane,
      y: p.y,
      hearts: p.hearts,
      finished: p.finished,
      place: p.place,
    });
  });
  return { seed: state.seed, phase: state.phase, startsAt: state.startsAt, players, myId };
}

export class Multiplayer {
  private client: Client;
  private room: Room<RemoteState> | null = null;
  private posTimer: number | null = null;

  constructor(url: string = defaultServerUrl()) {
    this.client = new Client(url);
  }

  /** Create or join the room matching `code` (friends-only matchmaking via filterBy on server). */
  async connect(code: string, name: string, character: DinoType, cb: MpCallbacks): Promise<void> {
    const room = await this.client.joinOrCreate<RemoteState>('race', { code, name, character });
    this.room = room;
    room.onStateChange((s) => cb.onState(snapshot(s, room.sessionId)));
    room.onLeave(() => cb.onLeave?.());
    room.onError((code, msg) => cb.onError?.(msg ?? `room error ${code}`));
  }

  ready(r: boolean) {
    this.room?.send('ready', r);
  }

  /** Start broadcasting position at `hz` updates/sec. Cheaper than a per-frame send. */
  startPosLoop(get: () => { distance: number; lane: number; y: number }, hz = 10) {
    this.stopPosLoop();
    const interval = Math.max(50, Math.floor(1000 / hz));
    this.posTimer = window.setInterval(() => {
      const s = get();
      this.room?.send('pos', s);
    }, interval);
  }

  stopPosLoop() {
    if (this.posTimer != null) {
      window.clearInterval(this.posTimer);
      this.posTimer = null;
    }
  }

  finish() {
    this.room?.send('finish');
  }

  async leave() {
    this.stopPosLoop();
    try {
      await this.room?.leave();
    } catch {
      // ignore — we're tearing down anyway
    }
    this.room = null;
  }
}

/** Generates a friendly 4-letter room code (uppercase, no confusables — no 0/O, 1/I). */
export function makeRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}
