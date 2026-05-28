import { Server } from 'colyseus';

import { RaceRoom } from './rooms/RaceRoom';

// Dino Dash realtime race server. In-memory rooms only (no DB). Railway provides PORT.
const port = Number(process.env.PORT) || 2567;

const gameServer = new Server();
// Friends-only: joinOrCreate('race', { code }) lands everyone with the same code in one room.
gameServer.define('race', RaceRoom).filterBy(['code']);

void gameServer.listen(port);
// eslint-disable-next-line no-console
console.log(`⚡ Dino Dash race server listening on :${port}`);
