import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startHub } from '../src/server.js';
import { HubClient } from '../src/client.js';
import { startFakeExtension } from './fake-extension.js';

const PORT = 18777 + Math.floor(Math.random() * 1000);
const IDLE_PORT = 20777 + Math.floor(Math.random() * 1000);
let hub, extA, extB;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(predicate, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(10);
  }
  assert.ok(predicate(), 'timed out waiting for condition');
}

before(async () => {
  hub = await startHub({ port: PORT });
  extA = startFakeExtension({ port: PORT, browserId: 'id-a', name: 'work' });
  extB = startFakeExtension({ port: PORT, browserId: 'id-b', name: 'personal' });
  await Promise.all([extA.ready, extB.ready]);
  await sleep(50);
});

after(async () => {
  extA.close(); extB.close();
  await hub.close();
});

test('lists both browsers with summaries', async () => {
  const c = new HubClient({ url: `ws://127.0.0.1:${PORT}/agent`, label: 'test' });
  const r = await c.call('browsers.list');
  assert.deepEqual(r.browsers.map((b) => b.name).sort(), ['personal', 'work']);
  assert.equal(r.browsers[0].summary.tabs, 2);
  c.close();
});

test('refuses to guess when several browsers are connected', async () => {
  const c = new HubClient({ url: `ws://127.0.0.1:${PORT}/agent`, label: 'test' });
  await assert.rejects(c.call('tabs.list'), (e) => e.code === 'AMBIGUOUS_BROWSER');
  c.close();
});

test('select -> control border on, disconnect -> off', async () => {
  const c = new HubClient({ url: `ws://127.0.0.1:${PORT}/agent`, label: 'proj-x' });
  const sel = await c.call('browser.select', { browser: 'WORK' });
  assert.equal(sel.selected.name, 'work');
  await sleep(30);
  assert.equal(extA.state.control.active, true);
  assert.equal(extA.state.control.agents[0].label, 'proj-x');
  assert.ok(extA.state.control.agents[0].color);
  assert.equal(extB.state.control?.active ?? false, false);
  c.close();
  await sleep(50);
  assert.equal(extA.state.control.active, false);
});

test('hello with browser preselects and fills the default tab across calls', async () => {
  const c = new HubClient({ url: `ws://127.0.0.1:${PORT}/agent`, label: 'test', browser: 'personal' });
  const w = await c.connect();
  assert.equal(w.selected, 'id-b');
  const t = await c.call('tabs.create', { url: 'https://c.test' });
  assert.equal(t.tabId, 13);
  await c.call('page.snapshot');
  const last = extB.state.calls.at(-1);
  assert.equal(last.method, 'page.snapshot');
  assert.equal(last.params.tabId, 13, 'hub should pass the tab created earlier');
  c.close();
});

test('stale default tab is dropped and retried without tabId', async () => {
  const c = new HubClient({ url: `ws://127.0.0.1:${PORT}/agent`, label: 'test', browser: 'work' });
  await c.connect();
  await c.call('page.snapshot', { tabId: 99 }).catch(() => {}); // explicit bad tab: error surfaces
  const r = await c.call('page.snapshot', { tabId: 11 });
  assert.equal(r.tabId, 11);
  // simulate the tab vanishing: fake ext only knows 11,12,13 -> make default point at 999
  extA.state.tabs = extA.state.tabs.filter((t) => t.tabId !== 11);
  const r2 = await c.call('page.snapshot');
  assert.equal(r2.tabId, 11, 'fake ext answers with default tab when none given');
  c.close();
});

test('http face works and rejects browser origins', async () => {
  const base = `http://127.0.0.1:${PORT}`;
  const list = await (await fetch(`${base}/browsers`)).json();
  assert.equal(list.browsers.length, 2);
  const call = await (await fetch(`${base}/call`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ browser: 'work', method: 'browser.identify' }) })).json();
  assert.equal(call.ok, true);
  const denied = await fetch(`${base}/browsers`, { headers: { origin: 'https://evil.test' } });
  assert.equal(denied.status, 403);
});

test('agent socket from a browser origin is refused', async () => {
  const { default: WebSocket } = await import('ws');
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/agent`, { origin: 'https://evil.test' });
  const outcome = await new Promise((resolve) => { ws.on('open', () => resolve('open')); ws.on('error', () => resolve('refused')); });
  assert.equal(outcome, 'refused');
});

test('timeouts surface as TIMEOUT', async () => {
  const c = new HubClient({ url: `ws://127.0.0.1:${PORT}/agent`, label: 'test', browser: 'work', timeoutMs: 300 });
  await c.connect();
  // the hub's own timeout is what matters; force a short one via a direct rpc call
  const b = hub.registry.findBrowser('work');
  await assert.rejects(b.rpc.request('slow.call', {}, 200), (e) => e.code === 'TIMEOUT');
  c.close();
});

test('popup release disconnects only the selected agent session', async () => {
  const one = new HubClient({ url: `ws://127.0.0.1:${PORT}/agent`, label: 'one', browser: 'work' });
  const two = new HubClient({ url: `ws://127.0.0.1:${PORT}/agent`, label: 'two', browser: 'work' });
  try {
    await Promise.all([one.connect(), two.connect()]);
    await sleep(50);
    assert.equal(extA.state.control.agents.length, 2);
    const sessionId = extA.state.control.agents.find((a) => a.label === 'one').sessionId;
    extA.release(sessionId);
    await sleep(50);
    assert.equal(extA.state.control.active, true);
    assert.deepEqual(extA.state.control.agents.map((a) => a.label), ['two']);
    await assert.rejects(one.call('tabs.list'), (e) => {
      assert.equal(e.code, 'DISCONNECTED_BY_USER');
      assert.equal(e.message, 'disconnected by the user from the browser popup. The hub will accept a new connection on the following call; select a browser again only if the user wants you to.');
      return true;
    });
    await assert.rejects(one.call('tabs.list'), (e) => e.code === 'AMBIGUOUS_BROWSER');
    const tabs = await two.call('tabs.list');
    assert.equal(tabs.windows.length, 1);
  } finally {
    one.close();
    two.close();
  }
});

test('popup release ignores another browser and unknown sessions', async () => {
  const c = new HubClient({ url: `ws://127.0.0.1:${PORT}/agent`, label: 'work-owner', browser: 'work' });
  try {
    await c.connect();
    await sleep(50);
    const session = extA.state.control.agents.find((a) => a.label === 'work-owner');
    extB.release(session.sessionId);
    await sleep(50);
    assert.ok(extA.state.control.agents.some((a) => a.sessionId === session.sessionId));
    const tabs = await c.call('tabs.list');
    assert.equal(tabs.windows.length, 1);

    extA.release('unknown-session');
    await sleep(50);
    assert.equal(extA.ws.readyState, 1);
    const browsers = await c.call('browsers.list');
    assert.equal(browsers.browsers.length, 2);
  } finally {
    c.close();
  }
});

test('agent idle release', async (t) => {
  const agentIdleMs = 150;
  const idleHub = await startHub({ port: IDLE_PORT, agentIdleMs });
  const idleExt = startFakeExtension({
    port: IDLE_PORT,
    browserId: 'id-idle',
    name: 'idle-browser',
    delays: { 'browser.identify': agentIdleMs * 3 },
  });

  try {
    await idleExt.ready;
    await waitFor(() => idleHub.registry.browsers.has('id-idle'));

    await t.test('releases control while keeping the socket and selection', async () => {
      const c = new HubClient({ url: `ws://127.0.0.1:${IDLE_PORT}/agent`, label: 'idle-agent' });
      try {
        await c.call('browser.select', { browser: 'idle-browser' });
        await c.call('page.snapshot', { tabId: 12 });
        await waitFor(() => idleExt.state.control?.agents.some((a) => a.label === 'idle-agent'));

        const session = [...idleHub.registry.sessions.values()].find((s) => s.label === 'idle-agent');
        assert.equal(session.browserId, 'id-idle');
        assert.equal(session.currentTabId, 12);

        await waitFor(() => idleExt.state.control?.active === false);
        assert.deepEqual(idleExt.state.control.agents, []);
        assert.equal(c.ws.readyState, 1, 'agent socket should stay open');

        const listed = await (await fetch(`http://127.0.0.1:${IDLE_PORT}/browsers`)).json();
        assert.deepEqual(listed.browsers[0].controlledBy, []);
        assert.equal(session.browserId, 'id-idle');
        assert.equal(session.currentTabId, 12);

        const tabs = await c.call('tabs.list');
        assert.equal(tabs.windows.length, 1);
        assert.equal(idleExt.state.control.active, true);
        assert.deepEqual(idleExt.state.control.agents.map((a) => a.label), ['idle-agent']);
        assert.equal(session.currentTabId, 12);
      } finally {
        c.close();
        await waitFor(() => idleExt.state.control?.active === false);
      }
    });

    await t.test('does not release control while a request is in flight', async () => {
      const c = new HubClient({ url: `ws://127.0.0.1:${IDLE_PORT}/agent`, label: 'slow-agent', browser: 'idle-browser' });
      try {
        await c.connect();
        await waitFor(() => idleExt.state.control?.agents.some((a) => a.label === 'slow-agent'));

        const callsBefore = idleExt.state.calls.length;
        const controlsBefore = idleExt.state.controls.length;
        const pending = c.call('browser.identify');
        await waitFor(() => idleExt.state.calls.length > callsBefore);
        await sleep(agentIdleMs + 75);

        assert.equal(idleExt.state.control.active, true);
        assert.ok(idleExt.state.controls.slice(controlsBefore).every((control) => control.active));
        await pending;
        assert.equal(idleExt.state.control.active, true);
        await waitFor(() => idleExt.state.control?.active === false);
      } finally {
        c.close();
      }
    });
  } finally {
    idleExt.close();
    await idleHub.close();
  }
});
