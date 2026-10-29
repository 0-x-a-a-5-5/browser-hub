import http from 'node:http';
import { WebSocketServer } from 'ws';
import { config } from './config.js';
import { Registry } from './registry.js';
import { createDispatcher } from './dispatch.js';
import { attachExtension } from './ext-handler.js';
import { attachAgent } from './agent-handler.js';
import { createHttpHandler } from './http.js';
import { log } from './log.js';

const EXT_IDLE_MS = 75_000; // extensions ping every 20s

export function startHub({ host = config.host, port = config.port } = {}) {
  const registry = new Registry();
  const dispatch = createDispatcher(registry);
  const server = http.createServer(createHttpHandler(registry, dispatch));
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 * 1024 });

  server.on('upgrade', (req, socket, head) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    const origin = req.headers.origin || '';
    if (pathname === '/ext') {
      if (!/^(chrome|moz|safari-web)-extension:\/\//.test(origin)) return refuse(socket, 403);
      return wss.handleUpgrade(req, socket, head, (ws) => attachExtension(ws, registry));
    }
    if (pathname === '/agent') {
      if (origin) return refuse(socket, 403); // only non-browser clients
      return wss.handleUpgrade(req, socket, head, (ws) => attachAgent(ws, registry, dispatch));
    }
    refuse(socket, 404);
  });

  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const b of registry.browsers.values()) {
      if (now - (b.ws.lastSeen || b.connectedAt) > EXT_IDLE_MS) {
        log('browser.idle-timeout', { name: b.name });
        b.ws.terminate();
      }
    }
  }, 30_000);

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      log('hub.listening', { url: `http://${host}:${port}`, token: config.token ? 'set' : 'none' });
      resolve({
        registry, dispatch, server,
        close: () => { clearInterval(sweeper); for (const c of wss.clients) c.terminate(); return new Promise((r) => server.close(r)); },
      });
    });
  });
}

function refuse(socket, status) {
  socket.write(`HTTP/1.1 ${status} ${status === 403 ? 'Forbidden' : 'Not Found'}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}
