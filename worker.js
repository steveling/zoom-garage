// Cloudflare Worker for zoom.pocketgiggles.com.
// Static game files are served as assets. Only /room/<code> reaches this script: it is the
// friend-race relay. Each 4-digit code gets its own little "race room" (a Durable Object)
// that holds two WebSockets, a host and a guest, and passes messages between them.
// Nothing is stored; a room is empty again as soon as both phones leave.

import { DurableObject } from 'cloudflare:workers';

const MAX_MSG = 2048;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/room\/(\d{4})$/);
    if (!m) return env.ASSETS.fetch(request);
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    const role = url.searchParams.get('role');
    if (role !== 'host' && role !== 'guest') return new Response('Bad role', { status: 400 });
    const room = env.RACE_ROOMS.get(env.RACE_ROOMS.idFromName(m[1]));
    return room.fetch(request);
  },
};

export class RaceRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // Keep-alive pings are answered without waking the room.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request) {
    const role = new URL(request.url).searchParams.get('role');
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [role]);

    const host = this.ctx.getWebSockets('host').filter((w) => w !== server);
    const guest = this.ctx.getWebSockets('guest').filter((w) => w !== server);
    const reject = (reason) => {
      server.send(JSON.stringify({ k: reason }));
      server.close(4000, reason);
    };

    if (role === 'host') {
      if (host.length) reject('taken');
      else server.send(JSON.stringify({ k: 'ready' }));
    } else if (!host.length) {
      reject('nohost');
    } else if (guest.length) {
      reject('full');
    } else {
      const hello = JSON.stringify({ k: 'paired' });
      server.send(hello);
      host.forEach((w) => w.send(hello));
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  other(ws) {
    const mine = this.ctx.getTags(ws)[0];
    return this.ctx.getWebSockets(mine === 'host' ? 'guest' : 'host');
  }

  async webSocketMessage(ws, msg) {
    if (typeof msg !== 'string' || msg.length > MAX_MSG) return;
    for (const w of this.other(ws)) {
      try { w.send(msg); } catch (_) {}
    }
  }

  async webSocketClose(ws, code) {
    const left = JSON.stringify({ k: 'left' });
    for (const w of this.other(ws)) {
      try {
        // A host leaving closes the room; a guest leaving frees the spot.
        w.send(left);
        if (this.ctx.getTags(ws)[0] === 'host') w.close(4001, 'host left');
      } catch (_) {}
    }
    try { ws.close(code === 1005 ? 1000 : code, 'bye'); } catch (_) {}
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws, 1011);
  }
}
