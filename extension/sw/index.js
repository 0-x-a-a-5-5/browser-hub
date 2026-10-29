// Service worker entry: identity -> hub link -> router. Everything else is a module.
import { loadIdentity, watchIdentity } from './identity.js';
import { HubLink } from './hub-link.js';
import { handle } from './router.js';
import * as control from './control.js';
import * as content from './content-rpc.js';
import * as network from './tools/network.js';

network.install();

const link = new HubLink({ onRequest: handle, onControl: control.apply });

async function boot() {
  link.configure(await loadIdentity());
  link.connect();
}

chrome.runtime.onInstalled.addListener(injectIntoOpenTabs);
chrome.runtime.onStartup.addListener(boot);
chrome.alarms.create('hub-reconnect', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'hub-reconnect') link.ensureConnected(); });
watchIdentity((identity) => { link.configure(identity); link.reconnect(); });

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'overlay:state') {
    sendResponse(control.stateForTab(sender.tab?.id));
  } else if (msg?.type === 'popup:status') {
    sendResponse({ connected: link.connected, hubUrl: link.url, lastError: link.lastError, control: control.current() });
  } else if (msg?.type === 'popup:reconnect') {
    link.reconnect();
    sendResponse({ ok: true });
  }
  return false;
});

async function injectIntoOpenTabs() {
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*', 'file://*/*'] });
  await Promise.allSettled(tabs.map((t) => content.inject(t.id)));
}

boot();
