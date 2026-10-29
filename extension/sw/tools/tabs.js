import { ToolError } from '../errors.js';
import { waitForLoad } from '../load-wait.js';

export function tabInfo(t) {
  return { tabId: t.id, windowId: t.windowId, active: t.active, title: t.title, url: t.url, status: t.status };
}

// Explicit tabId must exist; otherwise fall back to the active tab of the last focused window.
export async function resolveTabId(tabId) {
  if (tabId != null) {
    try { await chrome.tabs.get(tabId); return tabId; }
    catch { throw new ToolError('NO_TAB', `No tab with id ${tabId} (it may have been closed; call tabs_list)`); }
  }
  let [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!t) [t] = await chrome.tabs.query({ active: true });
  if (!t) throw new ToolError('NO_TAB', 'This browser has no open tabs');
  return t.id;
}

export async function list() {
  const wins = await chrome.windows.getAll({ populate: true });
  return {
    windows: wins.map((w) => ({
      windowId: w.id, focused: w.focused, state: w.state, width: w.width, height: w.height,
      tabs: w.tabs.map(tabInfo),
    })),
  };
}

export async function summary() {
  const wins = await chrome.windows.getAll({ populate: true });
  return {
    windows: wins.length,
    tabs: wins.reduce((n, w) => n + w.tabs.length, 0),
    activeTabs: wins.map((w) => {
      const t = w.tabs.find((x) => x.active);
      return t ? { windowId: w.id, tabId: t.id, title: t.title, url: t.url, focused: w.focused } : null;
    }).filter(Boolean),
  };
}

export async function create({ url = 'about:blank', windowId, timeoutMs = 20_000 } = {}) {
  const props = { url: normalizeUrl(url), active: true };
  if (windowId != null) props.windowId = windowId;
  const tab = await chrome.tabs.create(props);
  const { loaded } = url === 'about:blank' ? { loaded: true } : await waitForLoad(tab.id, timeoutMs);
  return { ...tabInfo(await chrome.tabs.get(tab.id)), loaded };
}

export async function close({ tabId }) {
  if (tabId == null) throw new ToolError('BAD_PARAMS', 'tabs.close needs tabId');
  await chrome.tabs.remove(tabId);
  return { closed: tabId };
}

export async function activate({ tabId }) {
  tabId = await resolveTabId(tabId);
  const t = await chrome.tabs.update(tabId, { active: true });
  await chrome.windows.update(t.windowId, { focused: true });
  return tabInfo(t);
}

export function normalizeUrl(url) {
  const s = String(url).trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return s;
  if (s.startsWith('localhost') || /^[\w.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(s)) return 'https://' + s;
  return s;
}
