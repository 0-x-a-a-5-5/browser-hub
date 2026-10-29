import { ToolError } from '../errors.js';
import { waitForLoad } from '../load-wait.js';
import { resolveTabId, tabInfo, normalizeUrl } from './tabs.js';

export async function navigate({ tabId, url, action, timeoutMs = 20_000 } = {}) {
  tabId = await resolveTabId(tabId);
  const done = waitForLoad(tabId, timeoutMs);
  try {
    if (url) await chrome.tabs.update(tabId, { url: normalizeUrl(url) });
    else if (action === 'back') await chrome.tabs.goBack(tabId);
    else if (action === 'forward') await chrome.tabs.goForward(tabId);
    else if (action === 'reload') await chrome.tabs.reload(tabId);
    else throw new ToolError('BAD_PARAMS', 'navigate needs a url or action (back|forward|reload)');
  } catch (e) {
    done.cancel();
    if (e instanceof ToolError) throw e;
    throw new ToolError('NAVIGATE_FAILED', e.message);
  }
  const { loaded } = await done;
  return { ...tabInfo(await chrome.tabs.get(tabId)), loaded };
}
