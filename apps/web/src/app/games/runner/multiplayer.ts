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
  view: 'follow' | 'close'; // camera view chosen by the room host — everyone races in this
  players: MpPlayer[];
  boxes: MpDroppedBox[]; // Trex Leave-Box items currently on the track
  myId: string;
}

/** Server-relayed PvP ability event. The server resolves targets (nearest-ahead
 *  weighted-random, or AoE for thunder) and broadcasts to everyone so each client can
 *  filter for self/caster and play the appropriate visual + effect. */
export type AbilityKind = 'pull' | 'freeze' | 'thunder' | 'box';
export type BoxType = 'water' | 'fire' | 'trap';
export interface AbilityEvent {
  kind: AbilityKind;
  casterId: string;
  targetIds: string[]; // empty for 'box' (handled via boxHit) or fizzled casts
  boxType?: BoxType; // only set when kind === 'box'
}
/** Broadcast when ANY player collides with a dropped box. Drives the receiver effect
 *  on the victim's client + the kill-feed entry on every client. */
export interface BoxHitEvent {
  boxId: string;
  victimId: string;
  ownerId: string;
  type: BoxType;
}
export interface MpDroppedBox {
  id: string;
  ownerId: string;
  type: BoxType;
  lane: number;
  distance: number;
}

export interface MpCallbacks {
  onState: (s: MpState) => void;
  onError?: (msg: string) => void;
  onLeave?: () => void;
  /** Broadcast from the server whenever any player fires an ability. Receivers filter
   *  on `casterId === myId` (cast visual) and `targetIds.includes(myId)` (apply effect). */
  onAbility?: (e: AbilityEvent) => void;
  /** Broadcast when any player collides with a dropped Trex box. */
  onBoxHit?: (e: BoxHitEvent) => void;
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
interface RemoteBox {
  id: string;
  ownerId: string;
  type: string;
  lane: number;
  distance: number;
}
interface RemoteState {
  seed: number;
  phase: MpPhase;
  startsAt: number;
  view: string;
  players: { forEach(cb: (p: RemotePlayer) => void): void };
  boxes: { forEach(cb: (b: RemoteBox) => void): void };
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
  const view = state.view === 'close' ? 'close' : 'follow';
  const boxes: MpDroppedBox[] = [];
  state.boxes?.forEach?.((b) => {
    const t: BoxType = b.type === 'water' || b.type === 'fire' || b.type === 'trap' ? b.type : 'trap';
    boxes.push({ id: b.id, ownerId: b.ownerId, type: t, lane: b.lane, distance: b.distance });
  });
  return { seed: state.seed, phase: state.phase, startsAt: state.startsAt, view, players, boxes, myId };
}

export class Multiplayer {
  private client: Client;
  private room: Room<RemoteState> | null = null;
  private posTimer: number | null = null;

  constructor(url: string = defaultServerUrl()) {
    this.client = new Client(url);
  }

  /** Create or join the room matching `code` (friends-only matchmaking via filterBy on server).
   *  The `view` arg is the local player's pick; only honoured if THIS player creates the room
   *  (i.e. is the host). Later joiners inherit the host's view. */
  async connect(code: string, name: string, character: DinoType, view: 'follow' | 'close', cb: MpCallbacks): Promise<void> {
    const room = await this.client.joinOrCreate<RemoteState>('race', { code, name, character, view });
    this.room = room;
    room.onStateChange((s) => cb.onState(snapshot(s, room.sessionId)));
    room.onLeave(() => cb.onLeave?.());
    room.onError((code, msg) => cb.onError?.(msg ?? `room error ${code}`));
    room.onMessage('ability', (e: AbilityEvent) => cb.onAbility?.(e));
    room.onMessage('boxHit', (e: BoxHitEvent) => cb.onBoxHit?.(e));
  }

  /** Fire a PvP ability. The server picks the target(s) and relays via `onAbility`. */
  ability(kind: AbilityKind) {
    this.room?.send('ability', { kind });
  }
  /** Notify the server we ran through a dropped box. Server validates + broadcasts. */
  boxHit(boxId: string) {
    this.room?.send('boxHit', { boxId });
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
