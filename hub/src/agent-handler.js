// One agent socket = one session with its own selected browser and current tab.
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { pushControl } from './control.js';
import { log } from './log.js';

export function attachAgent(ws, registry, dispatch) {
  const session = { id: randomUUID(), label: 'agent', color: registry.nextColor(), browserId: null, currentTabId: null, persistent: true };
  let greeted = false;

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === 'ping') { ws.send('{"type":"pong"}'); return; }
    if (msg.type === 'hello') { await hello(msg); return; }
    if (!greeted) { ws.close(4003, 'send hello first'); return; }
    if (msg.type !== 'req') return;
    try {
      const result = await dispatch(session, msg.method, msg.params || {});
      send({ type: 'res', id: msg.id, ok: true, result });
    } catch (e) {
      send({ type: 'res', id: msg.id, ok: false, error: { code: e.code || 'ERROR', message: e.message } });
    }
  });

  ws.on('close', () => {
    registry.removeSession(session.id);
    if (session.browserId) pushControl(registry, registry.browsers.get(session.browserId));
    log('agent.disconnected', { label: session.label });
  });
  ws.on('error', () => {});

  async function hello(msg) {
    if (config.token && msg.token !== config.token) { ws.close(4001, 'bad token'); return; }
    greeted = true;
    session.label = String(msg.label || session.label).slice(0, 60);
    registry.addSession(session);
    let warning;
    if (msg.browser) {
      try { await dispatch(session, 'browser.select', { browser: msg.browser }); }
      catch (e) { warning = e.message; }
    }
    log('agent.connected', { label: session.label, browser: msg.browser, warning });
    send({ type: 'welcome', sessionId: session.id, color: session.color, selected: session.browserId, warning });
  }

  function send(obj) {
    if (ws.readyState === 1) ws.send(JSON.stringify(obj));
  }
}
