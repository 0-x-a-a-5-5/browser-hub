// The one place that decides which browser a request goes to and fills in the default tab.
import { hubError } from './errors.js';
import { pushControl } from './control.js';
import { log } from './log.js';

const needsTab = (method) => method.startsWith('page.') || method === 'tabs.close' || method === 'tabs.activate' || method === 'window.resize';

export function createDispatcher(registry) {
  async function dispatch(session, method, params = {}) {
    switch (method) {
      case 'browsers.list': return listBrowsers(session);
      case 'browser.select': return select(session, params.browser);
      case 'browser.deselect': return deselect(session);
      case 'session.label': session.label = String(params.label || session.label); refreshControl(session.browserId); return { label: session.label };
      default: return forward(session, method, params);
    }
  }

  async function listBrowsers(session) {
    const browsers = await Promise.all([...registry.browsers.values()].map(async (b) => {
      let summary = null;
      try { summary = await b.rpc.request('browser.summary', {}, 2500); } catch { /* unresponsive; still list it */ }
      return {
        id: b.id, name: b.name, selected: session.browserId === b.id,
        controlledBy: registry.controllersOf(b.id).map((s) => s.label),
        meta: b.meta, summary,
      };
    }));
    return { browsers, selected: session.browserId, hint: browsers.length ? undefined : 'No browsers connected. Load the extension in a Chrome profile.' };
  }

  function select(session, q) {
    if (!q) throw hubError('BAD_PARAMS', 'browser_select needs a browser name or id');
    const b = registry.resolveBrowser(q);
    const prev = session.browserId;
    session.browserId = b.id;
    session.currentTabId = null;
    if (prev && prev !== b.id) refreshControl(prev);
    if (session.persistent) pushControl(registry, b);
    log('session.select', { session: session.label, browser: b.name });
    return { selected: { id: b.id, name: b.name }, controlledBy: registry.controllersOf(b.id).map((s) => s.label) };
  }

  function deselect(session) {
    const prev = session.browserId;
    session.browserId = null;
    session.currentTabId = null;
    refreshControl(prev);
    return { selected: null };
  }

  function refreshControl(browserId) {
    if (browserId) pushControl(registry, registry.browsers.get(browserId));
  }

  function currentBrowser(session, override) {
    if (override) return registry.resolveBrowser(override);
    if (session.browserId) {
      const b = registry.browsers.get(session.browserId);
      if (b) return b;
      session.browserId = null;
      throw hubError('BROWSER_GONE', 'The selected browser disconnected. Call browsers_list and select again.');
    }
    const b = registry.resolveBrowser();
    if (session.persistent) { session.browserId = b.id; pushControl(registry, b); }
    return b;
  }

  async function forward(session, method, params) {
    const { browser: override, ...rest } = params;
    const browser = currentBrowser(session, override);
    const usedDefaultTab = needsTab(method) && rest.tabId == null && session.currentTabId != null;
    if (usedDefaultTab) rest.tabId = session.currentTabId;
    const started = Date.now();
    let result;
    try {
      result = await browser.rpc.request(method, rest);
    } catch (e) {
      if (!(e.code === 'NO_TAB' && usedDefaultTab)) { log('call.error', { session: session.label, browser: browser.name, method, code: e.code, ms: Date.now() - started }); throw e; }
      session.currentTabId = null;
      delete rest.tabId;
      result = await browser.rpc.request(method, rest);
    }
    if (result && typeof result.tabId === 'number') session.currentTabId = method === 'tabs.close' ? null : result.tabId;
    if (method === 'tabs.close' && rest.tabId === session.currentTabId) session.currentTabId = null;
    log('call', { session: session.label, browser: browser.name, method, tab: result?.tabId, ms: Date.now() - started });
    return result;
  }

  return dispatch;
}
