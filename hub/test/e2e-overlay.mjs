// Manual end-to-end check against a real browser running the extension:
// hold a session, confirm the border overlay appears with the session colour, release, confirm it is gone.
import { HubClient } from '../src/client.js';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const probe = `(() => { const h = document.querySelector('browser-hub-overlay'); return h ? { present: true, color: getComputedStyle(h).getPropertyValue('--c').trim(), z: getComputedStyle(h).zIndex } : { present: false }; })()`;

const a = new HubClient({ label: 'proj-alpha' });
const w = await a.connect();
console.log('welcome', w);
const name = process.argv[2] || (await a.call('browsers.list')).browsers[0]?.name;
console.log('select', await a.call('browser.select', { browser: name }));
const snap = await a.call('page.snapshot');            // marks the tab as target -> strong border + label
await sleep(300);
const during = await a.call('page.evaluate', { expression: probe });
console.log('overlay while controlled:', during.value, 'expected colour', w.color);

const b = new HubClient({ label: 'proj-beta' });
await b.connect();
await b.call('browser.select', { browser: a.browser });
await sleep(200);
console.log('two sessions ->', (await a.call('browsers.list')).browsers.find((x) => x.selected).controlledBy);
b.close();
await sleep(200);
console.log('after beta left ->', (await a.call('browsers.list')).browsers.find((x) => x.selected).controlledBy);

// bottom-button click on the second page via a fresh ref
const f = await a.call('page.find', { text: 'bottom', tabId: snap.tabId });
const ref = /\[(e\d+)\]/.exec(f.text)?.[1];
if (ref) { await a.call('page.click', { ref, tabId: snap.tabId }); console.log('bottom button now reads:', (await a.call('page.text', { selector: '#bottom', tabId: snap.tabId })).text); }

a.close();
await sleep(400);
const c = new HubClient({ label: 'probe' });
const after = await c.call('page.evaluate', { expression: probe });
console.log('overlay after release (probe session holds control itself, so expect present=true but no stale colour):', after.value);
c.close();
