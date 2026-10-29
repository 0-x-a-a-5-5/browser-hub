// One extension socket = one browser profile. Lives from `hello` until the socket closes.
import { WsRpc } from './ws-rpc.js';
import { config } from './config.js';
import { pushControl } from './control.js';
import { log } from './log.js';

export function attachExtension(ws, registry) {
  const rpc = new WsRpc(ws, { timeoutMs: config.requestTimeoutMs });
  let browser = null;
  ws.lastSeen = Date.now();

  ws.on('message', (raw) => {
    ws.lastSeen = Date.now();
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    switch (msg.type) {
      case 'ping': ws.send('{"type":"pong"}'); return;
      case 'res': rpc.handleResponse(msg); return;
      case 'hello': hello(msg); return;
      case 'meta':
        if (!browser) return;
        if (msg.name) browser.name = String(msg.name);
        Object.assign(browser.meta, msg.meta || {});
        return;
      default: return;
    }
  });

  ws.on('close', () => {
    rpc.failAll('browser disconnected');
    if (browser && registry.browsers.get(browser.id) === browser) {
      registry.removeBrowser(browser.id);
      log('browser.disconnected', { name: browser.name, id: browser.id });
    }
  });
  ws.on('error', () => {});

  function hello(msg) {
    if (config.token && msg.token !== config.token) { ws.close(4001, 'bad token'); return; }
    if (!msg.browserId) { ws.close(4000, 'missing browserId'); return; }
    const existing = registry.browsers.get(msg.browserId);
    if (existing && existing.ws !== ws) {
      registry.removeBrowser(existing.id);
      existing.ws.close(4002, 'replaced by a newer connection');
    }
    const name = String(msg.name || msg.browserId.slice(0, 8));
    const clash = registry.findBrowser(name);
    if (clash && clash.id !== msg.browserId) log('browser.name-clash', { name, ids: [clash.id, msg.browserId] });
    browser = { id: msg.browserId, name, meta: msg.meta || {}, rpc, ws, connectedAt: Date.now() };
    registry.addBrowser(browser);
    log('browser.connected', { name, id: browser.id, brands: browser.meta.brands });
    pushControl(registry, browser);
  }
}
