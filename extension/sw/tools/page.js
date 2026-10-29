// Page tools. DOM-level work is delegated to the content script; anything that must
// produce trusted events (coordinates, key chords, typing) goes through input.js.
import { ToolError } from '../errors.js';
import * as content from '../content-rpc.js';
import * as input from './input.js';
import { settle } from '../load-wait.js';
import { resolveTabId } from './tabs.js';

export async function snapshot({ tabId, filter = 'interactive', maxItems = 400, coords = false } = {}) {
  tabId = await resolveTabId(tabId);
  return { tabId, ...(await content.call(tabId, 'snapshot', { filter, maxItems, coords })) };
}

export async function find({ tabId, text, selector, role, limit = 20 } = {}) {
  tabId = await resolveTabId(tabId);
  if (!text && !selector && !role) throw new ToolError('BAD_PARAMS', 'find needs text, selector or role');
  return { tabId, ...(await content.call(tabId, 'find', { text, selector, role, limit })) };
}

export async function text({ tabId, selector, maxChars = 50_000 } = {}) {
  tabId = await resolveTabId(tabId);
  return { tabId, ...(await content.call(tabId, 'text', { selector, maxChars })) };
}

export async function click({ tabId, ref, x, y, button = 'left', clickCount = 1, trusted = false } = {}) {
  tabId = await resolveTabId(tabId);
  let result;
  if (ref != null && !trusted) {
    result = await content.call(tabId, 'click', { ref, button, clickCount });
  } else {
    let obscured;
    if (ref != null) ({ x, y, obscured } = await content.call(tabId, 'center', { ref }));
    if (x == null || y == null) throw new ToolError('BAD_PARAMS', 'click needs ref or x,y');
    await input.clickAt(tabId, x, y, { button, clickCount });
    result = { x, y, button, clickCount, trusted: true, ...(obscured ? { obscured } : {}) };
  }
  return { tabId, ...result, ...(await settle(tabId)) };
}

export async function hover({ tabId, ref, x, y } = {}) {
  tabId = await resolveTabId(tabId);
  if (ref != null) ({ x, y } = await content.call(tabId, 'center', { ref }));
  if (x == null || y == null) throw new ToolError('BAD_PARAMS', 'hover needs ref or x,y');
  await input.moveTo(tabId, x, y);
  return { tabId, x, y };
}

export async function fill({ tabId, ref, value } = {}) {
  tabId = await resolveTabId(tabId);
  if (ref == null) throw new ToolError('BAD_PARAMS', 'fill needs ref');
  return { tabId, ...(await content.call(tabId, 'fill', { ref, value: value ?? '' })) };
}

export async function type({ tabId, text, pressEnter = false } = {}) {
  tabId = await resolveTabId(tabId);
  if (typeof text !== 'string') throw new ToolError('BAD_PARAMS', 'type needs text');
  await input.typeText(tabId, text);
  if (pressEnter) await input.pressKey(tabId, 'Enter');
  return { tabId, typed: text.length, ...(pressEnter ? await settle(tabId) : {}) };
}

export async function key({ tabId, key } = {}) {
  tabId = await resolveTabId(tabId);
  if (!key) throw new ToolError('BAD_PARAMS', 'press_key needs key, e.g. "Enter" or "ctrl+a"');
  await input.pressKey(tabId, key);
  return { tabId, key, ...(await settle(tabId)) };
}

export async function scroll({ tabId, ref, x, y, deltaX = 0, deltaY = 0 } = {}) {
  tabId = await resolveTabId(tabId);
  if (ref != null) return { tabId, ...(await content.call(tabId, 'scroll', { ref })) };
  if (x != null && y != null) {
    await input.wheel(tabId, x, y, deltaX, deltaY);
    return { tabId, ...(await content.call(tabId, 'viewport')) };
  }
  return { tabId, ...(await content.call(tabId, 'scroll', { deltaX, deltaY })) };
}

export async function wait({ tabId, selector, text, ms, timeoutMs = 10_000 } = {}) {
  tabId = await resolveTabId(tabId);
  if (!selector && !text && ms == null) throw new ToolError('BAD_PARAMS', 'wait_for needs selector, text or ms');
  return { tabId, ...(await content.call(tabId, 'wait', { selector, text, ms, timeoutMs }, { timeoutMs: timeoutMs + 2000 })) };
}

export async function consoleRead({ tabId, level, pattern, clear = false, limit = 200 } = {}) {
  tabId = await resolveTabId(tabId);
  return { tabId, ...(await content.call(tabId, 'console', { level, pattern, clear, limit })) };
}
