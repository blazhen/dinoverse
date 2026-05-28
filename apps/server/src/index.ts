import { createServer } from 'http';

import { WebSocketTransport } from '@colyseus/ws-transport';
import { Server } from 'colyseus';

import { RaceRoom } from './rooms/RaceRoom';

// Dino Dash realtime race server. In-memory rooms only (no DB). Railway provides PORT.
const port = Number(process.env.PORT) || 2567;

// Plain HTTP server so we can serve a tiny health-check endpoint Railway can hit AND attach
// Colyseus's WebSocket transport to the same port (Railway only exposes one).
const http = createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/healthz')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'dino-dash-race', uptime: process.uptime() }));
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
});

const gameServer = new Server({ transport: new WebSocketTransport({ server: http }) });
// Friends-only: joinOrCreate('race', { code }) lands everyone with the same code in one room.
gameServer.define('race', RaceRoom).filterBy(['code']);

void gameServer.listen(port);
// eslint-disable-next-line no-console
console.log(`⚡ Dino Dash race server listening on :${port}`);
