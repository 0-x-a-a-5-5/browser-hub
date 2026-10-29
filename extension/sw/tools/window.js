import { ToolError } from '../errors.js';
import { resolveTabId } from './tabs.js';

export async function resize({ windowId, tabId, width, height } = {}) {
  if (!width || !height) throw new ToolError('BAD_PARAMS', 'window_resize needs width and height');
  if (windowId == null) {
    tabId = await resolveTabId(tabId);
    windowId = (await chrome.tabs.get(tabId)).windowId;
  }
  const w = await chrome.windows.update(windowId, { width, height, state: 'normal' });
  return { windowId: w.id, width: w.width, height: w.height, tabId };
}

export async function list() {
  const wins = await chrome.windows.getAll();
  return { windows: wins.map((w) => ({ windowId: w.id, focused: w.focused, state: w.state, width: w.width, height: w.height, left: w.left, top: w.top })) };
}
