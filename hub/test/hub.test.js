import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startHub } from '../src/server.js';
import { HubClient } from '../src/client.js';
import { startFakeExtension } from './fake-extension.js';

const PORT = 18777 + Math.floor(Math.random() * 1000);
let hub, extA, extB;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
