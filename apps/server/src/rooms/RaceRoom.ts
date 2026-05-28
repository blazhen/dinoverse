import { Schema, MapSchema, type } from '@colyseus/schema';
import { Room, type Client } from 'colyseus';

// One racer's synced state. Position (distance/lane/y) is reported by that player's client a few
// times/sec; the room is the authority for ready/hearts/finish/place.
export class PlayerState extends Schema {
  @type('string') id = '';
  @type('string') name = 'Dino';
  @type('string') character = 'trik';
  @type('boolean') ready = false;
  @type('number') distance = 0;
  @type('number') lane = 1;
  @type('number') y = 0;
  @type('number') hearts = 3;
  @type('boolean') finished = false;
  @type('number') place = 0;
}

export class RaceState extends Schema {
  @type('number') seed = 0; // all clients build the SAME track from this
  @type('string') phase: 'lobby' | 'countdown' | 'racing' | 'finished' = 'lobby';
  @type('number') startsAt = 0; // epoch ms the race begins (for the 3-2-1)
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}

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
