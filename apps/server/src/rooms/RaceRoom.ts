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
  declare players: MapSchema<PlayerState>;

  constructor() {
    super();
    this.seed = 0;
    this.phase = 'lobby';
    this.startsAt = 0;
    this.players = new MapSchema<PlayerState>();
  }
}
defineTypes(RaceState, {
  seed: 'number',
  phase: 'string',
  startsAt: 'number',
  players: { map: PlayerState },
});

interface JoinOptions {
  name?: string;
  character?: string;
  code?: string;
}

export class RaceRoom extends Room<RaceState> {
  maxClients = 4; // 3–4 friends

  onCreate(options: JoinOptions) {
    this.setMetadata({ code: options.code ?? '' }); // friends-only: matched by invite code
    const state = new RaceState();
    state.seed = Math.floor(Math.random() * 1e9);
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
