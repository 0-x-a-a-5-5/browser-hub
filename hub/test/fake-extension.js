// A stand-in for the Chrome extension: speaks the /ext protocol with canned answers.
import WebSocket from 'ws';

export function startFakeExtension({ port, browserId, name, token = '' }) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ext`, { origin: 'chrome-extension://fakefakefakefakefakefakefakefake' });
  const state = { control: null, calls: [], tabs: [{ tabId: 11, windowId: 1, active: true, title: 'Tab A', url: 'https://a.test/' }, { tabId: 12, windowId: 1, active: false, title: 'Tab B', url: 'https://b.test/' }] };
  const ready = new Promise((resolve, reject) => {
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'hello', browserId, name, token, meta: { brands: ['Fake 1'] } }));
      resolve();
    });
    ws.on('error', reject);
  });
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    if (msg.type === 'control') { state.control = msg; return; }
    if (msg.type !== 'req') return;
    state.calls.push({ method: msg.method, params: msg.params });
    const reply = (ok, body) => ws.send(JSON.stringify({ type: 'res', id: msg.id, ok, ...(ok ? { result: body } : { error: body }) }));
    switch (msg.method) {
      case 'browser.summary': return reply(true, { windows: 1, tabs: state.tabs.length });
      case 'tabs.list': return reply(true, { windows: [{ windowId: 1, tabs: state.tabs }] });
      case 'tabs.create': { const t = { tabId: 13, windowId: 1, active: true, title: 'New', url: msg.params.url }; state.tabs.push(t); return reply(true, t); }
      case 'page.snapshot': {
        if (msg.params.tabId != null && !state.tabs.some((t) => t.tabId === msg.params.tabId)) return reply(false, { code: 'NO_TAB', message: 'no such tab' });
        return reply(true, { tabId: msg.params.tabId ?? 11, text: '- button [e1] "OK"', count: 1 });
      }
      case 'page.screenshot': return reply(true, { tabId: msg.params.tabId ?? 11, width: 2, height: 2, image: { mimeType: 'image/png', base64: 'iVBORw0KGgo=' } });
      case 'browser.identify': return reply(true, { flashed: true });
      case 'slow.call': return; // never answers -> timeout path
      default: return reply(false, { code: 'UNKNOWN_METHOD', message: msg.method });
    }
  });
  return { ws, state, ready, close: () => ws.close() };
}
