// Passive per-tab log of requests seen by webRequest (no debugger needed).
import { resolveTabId } from './tabs.js';

const MAX_PER_TAB = 300;
const MAX_PENDING = 2000;
const buffers = new Map(); // tabId -> entries
const pending = new Map(); // requestId -> entry

// Must run at service-worker top level so the listeners are registered on every start.
export function install() {
  const filter = { urls: ['<all_urls>'] };
  chrome.webRequest.onBeforeRequest.addListener((d) => {
    if (d.tabId < 0) return;
    if (pending.size >= MAX_PENDING) pending.delete(pending.keys().next().value);
    pending.set(d.requestId, { tabId: d.tabId, url: d.url, method: d.method, type: d.type, startedAt: d.timeStamp });
  }, filter);
  chrome.webRequest.onCompleted.addListener((d) => finish(d, { status: d.statusCode, fromCache: d.fromCache }), filter);
  chrome.webRequest.onErrorOccurred.addListener((d) => finish(d, { error: d.error }), filter);
  chrome.tabs.onRemoved.addListener((tabId) => buffers.delete(tabId));
}

function finish(d, extra) {
  const e = pending.get(d.requestId) || { tabId: d.tabId, url: d.url, method: d.method, type: d.type, startedAt: d.timeStamp };
  pending.delete(d.requestId);
  if (e.tabId < 0) return;
  const entry = { ts: Math.round(e.startedAt), method: e.method, url: e.url, type: e.type, durationMs: Math.round(d.timeStamp - e.startedAt), ...extra };
  const list = buffers.get(e.tabId) || [];
  list.push(entry);
  if (list.length > MAX_PER_TAB) list.splice(0, list.length - MAX_PER_TAB);
  buffers.set(e.tabId, list);
}

export async function read({ tabId, pattern, clear = false, limit = 100 } = {}) {
  tabId = await resolveTabId(tabId);
  let items = buffers.get(tabId) || [];
  if (pattern) {
    const re = new RegExp(pattern, 'i');
    items = items.filter((i) => re.test(i.url));
  }
  const requests = items.slice(-limit);
  if (clear) buffers.delete(tabId);
  return { tabId, count: requests.length, requests };
}
