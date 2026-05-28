import { Schema, MapSchema, defineTypes } from '@colyseus/schema';
import { Room, type Client } from 'colyseus';

// ── Why this file looks weird (no @type decorators, `declare` fields, defineTypes call) ──
//
// @colyseus/schema relies on a prototype getter/setter (installed by the @type decorator) to
// stamp metadata like `$childType` onto MapSchema/ArraySchema instances. With TypeScript's
// default `useDefineForClassFields: true` (the ES2022 default), `players = new MapSchema()`
// compiles to `Object.defineProperty(this, 'players', { value: ... })` — which DEFINES AN OWN
// PROPERTY that SHADOWS the prototype setter. The setter never runs, `$childType` is never
// set, and the encoder eventually crashes with:
//   "Cannot read properties of undefined (reading 'Symbol(Symbol.metadata)')".
//
// `useDefineForClassFields: false` in tsconfig fixes it locally, but tsx + esbuild on Railway
// (production) ignores the flag in our pnpm-workspaces layout. Rather than fight the toolchain,
// we use Colyseus's documented decorator-free API: `declare` fields (TypeScript-only, no
// runtime emit) + a `defineTypes()` call after the class body to attach metadata via the same
// underlying decorator function. Initial values are assigned in the constructor, where simple
// `this.x = y` always flows through the prototype setter regardless of compiler config.
//
// Behaviour is identical to the decorator version — the wire format is byte-for-byte the same.

/** One racer's synced state. Position (distance/lane/y) is reported by that player's client a
 *  few times/sec; the room is the authority for ready/hearts/finish/place. */
export class PlayerState extends Schema {
  declare id: string;
  declare name: string;
  declare character: string;
  declare ready: boolean;
  declare distance: number;
  declare lane: number;
  declare y: number;
  declare hearts: number;
  declare finished: boolean;
  declare place: number;

  constructor() {
    super();
    this.id = '';
    this.name = 'Dino';
    this.character = 'trik';
    this.ready = false;
    this.distance = 0;
    this.lane = 1;
    this.y = 0;
    this.hearts = 3;
    this.finished = false;
    this.place = 0;
  }
}
defineTypes(PlayerState, {
  id: 'string',
  name: 'string',
  character: 'string',
  ready: 'boolean',
  distance: 'number',
  lane: 'number',
  y: 'number',
  hearts: 'number',
  finished: 'boolean',
  place: 'number',
});

export class RaceState extends Schema {
  declare seed: number; // all clients build the SAME track from this
  declare phase: 'lobby' | 'countdown' | 'racing' | 'finished';
  declare startsAt: number; // epoch ms the race begins (for the 3-2-1)
  /** Camera view chosen by the room host (the first player). Everyone races in this view
   *  so the experience is symmetric — a friend's local "Close" preference can't override
   *  the host's "Follow" pick. */
  declare view: string; // 'follow' | 'close'
  declare players: MapSchema<PlayerState>;

  constructor() {
    super();
    this.seed = 0;
    this.phase = 'lobby';
    this.startsAt = 0;
    this.view = 'follow';
    this.players = new MapSchema<PlayerState>();
  }
}
defineTypes(RaceState, {
  seed: 'number',
  phase: 'string',
  startsAt: 'number',
  view: 'string',
  players: { map: PlayerState },
});

interface JoinOptions {
  name?: string;
  character?: string;
  code?: string;
  /** Sent by every joiner; only honoured for the FIRST one (the host) — see onCreate. */
  view?: string;
}

export class RaceRoom extends Room<RaceState> {
  maxClients = 4; // 3–4 friends

  onCreate(options: JoinOptions) {
    this.setMetadata({ code: options.code ?? '' }); // friends-only: matched by invite code
    const state = new RaceState();
    state.seed = Math.floor(Math.random() * 1e9);
    // First player's view becomes the room's view (locked in; later joiners can't change it).
    state.view = options.view === 'close' ? 'close' : 'follow';
    this.setState(state);

    this.onMessage('ready', (client, ready: boolean) => {
      const p = this.state.players.get(client.sessionId);
      if (p) p.ready = ready;
      this.maybeStart();
    });

    // Position update from a player's local runner.
    this.onMessage('pos', (client, msg: { distance: number; lane: number; y: number }) => {
      if (this.state.phase !== 'racing') return;
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      p.distance = Math.max(p.distance, Number(msg.distance) || 0);
      p.lane = Math.min(2, Math.max(0, Math.floor(Number(msg.lane) || 0)));
      p.y = Number(msg.y) || 0;
    });

    this.onMessage('finish', (client) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || p.finished) return;
      p.finished = true;
      p.place = [...this.state.players.values()].filter((x) => x.finished).length;
      if ([...this.state.players.values()].every((x) => x.finished)) this.state.phase = 'finished';
    });

    // PvP abilities. Sender's client only invokes this once their on-screen charge is
    // full (one Ability Box = one cast). The server picks the target(s) and broadcasts
    // an 'ability' event to all clients — each client filters by id and applies the
    // effect locally. Schema isn't authoritative for these effects (we just relay).
    //
    // Kinds:
    //  'pull'    — Trik. Single target. Yank-back + counts as a hit on them (-1 heart).
    //  'freeze'  — Stego. Single target. 2s no-move.
    //  'thunder' — Brachio. AoE on every rival ahead of caster. 1.5s stun + speed cut.
    //
    // Target selection (single-target): pick from rivals AHEAD of the caster, weighted
    // toward the leader so catching up feels rewarding without being deterministic.
    this.onMessage('ability', (client, msg: { kind?: string }) => {
      if (this.state.phase !== 'racing') return;
      const me = this.state.players.get(client.sessionId);
      if (!me || me.finished) return;
      const kind = msg?.kind;
      if (kind !== 'pull' && kind !== 'freeze' && kind !== 'thunder') return;
      // Collect rivals AHEAD of caster (within 60m so it feels like a "shot," not a missile).
      const ahead: PlayerState[] = [];
      this.state.players.forEach((p) => {
        if (p.id === client.sessionId || p.finished) return;
        const gap = p.distance - me.distance; // positive = ahead
        if (gap > 0 && gap < 60) ahead.push(p);
      });
      if (ahead.length === 0) {
        this.broadcast('ability', { kind, casterId: me.id, targetIds: [] });
        return;
      }
      let targetIds: string[];
      if (kind === 'thunder') {
        // AoE — hit ALL rivals ahead.
        targetIds = ahead.map((p) => p.id);
      } else {
        // Single target. Two-tier selection:
        //  1. If anyone is "visible" (within ~25m ahead — roughly what fits on screen),
        //     they get hit deterministically — closest visible rival.
        //  2. Otherwise the rival is off-screen → weighted-random among all rivals ahead,
        //     weighted toward the leader so catching up is rewarded.
        const VISIBLE_RANGE = 25;
        const visible = ahead.filter((p) => p.distance - me.distance < VISIBLE_RANGE);
        let chosen: PlayerState;
        if (visible.length > 0) {
          visible.sort((a, b) => a.distance - b.distance); // nearest visible first
          chosen = visible[0]!;
        } else {
          // Sort by distance desc → leader at [0]. Weight = N, N-1, ...
          ahead.sort((a, b) => b.distance - a.distance);
          let total = 0;
          const weights = ahead.map((_, i) => {
            const w = ahead.length - i;
            total += w;
            return w;
          });
          let pick = Math.random() * total;
          chosen = ahead[0]!;
          for (let i = 0; i < ahead.length; i++) {
            pick -= weights[i]!;
            if (pick <= 0) {
              chosen = ahead[i]!;
              break;
            }
          }
        }
        targetIds = [chosen.id];
        if (kind === 'pull') {
          // Authoritative heart loss; target's client sees it via state sync.
          chosen.hearts = Math.max(0, chosen.hearts - 1);
        }
      }
      this.broadcast('ability', { kind, casterId: me.id, targetIds });
    });
  }

  onJoin(client: Client, options: JoinOptions) {
    const p = new PlayerState();
    p.id = client.sessionId;
    p.name = (options.name ?? 'Dino').slice(0, 16);
    p.character = options.character ?? 'trik';
    this.state.players.set(client.sessionId, p);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
  }

  // Start once at least 2 friends are in and everyone has readied up.
  private maybeStart() {
    if (this.state.phase !== 'lobby') return;
    const players = [...this.state.players.values()];
    if (players.length >= 2 && players.every((p) => p.ready)) {
      this.state.phase = 'countdown';
      this.state.startsAt = Date.now() + 3000;
      this.clock.setTimeout(() => {
        this.state.phase = 'racing';
      }, 3000);
    }
  }
}
