// chrome.debugger session management. Attached lazily on first use, detached
// IDLE_DETACH_MS after the last command on a tab (removing Chrome's "started
// debugging this browser" bar, shown in every window of every profile), and
// immediately when no agent controls the browser any more.
import { ToolError } from './errors.js';

const IDLE_DETACH_MS = 3000;

const attached = new Set();
const inFlight = new Map();
const idleTimers = new Map();

function clearIdle(tabId) {
  const timer = idleTimers.get(tabId);
  if (timer === undefined) return;
  clearTimeout(timer);
  idleTimers.delete(tabId);
}

function begin(tabId) {
  clearIdle(tabId);
  inFlight.set(tabId, (inFlight.get(tabId) || 0) + 1);
}

function scheduleDetach(tabId) {
  clearIdle(tabId);
  const timer = setTimeout(() => {
    idleTimers.delete(tabId);
    void detach(tabId);
  }, IDLE_DETACH_MS);
  idleTimers.set(tabId, timer);
}

function end(tabId) {
  const count = inFlight.get(tabId);
  if (count === undefined) return;
  if (count > 1) {
    inFlight.set(tabId, count - 1);
    return;
  }
  inFlight.delete(tabId);
  scheduleDetach(tabId);
}

chrome.debugger.onDetach.addListener(({ tabId }) => {
  attached.delete(tabId);
  clearIdle(tabId);
});

export async function attach(tabId) {
  if (attached.has(tabId)) return;
  try {
    await chrome.debugger.attach({ tabId }, '1.3');
  } catch (e) {
    if (!/already attached/i.test(e.message)) throw attachError(e);
    // Either our own stale session (worker restarted) or DevTools. Try to recover once.
    try {
      await chrome.debugger.detach({ tabId });
      await chrome.debugger.attach({ tabId }, '1.3');
    } catch (e2) {
      throw attachError(e2);
    }
  }
  attached.add(tabId);
}

function attachError(e) {
  return new ToolError(
    'DEBUGGER_ATTACH_FAILED',
    `${e.message}. If DevTools is open on that tab, close it and retry.`,
  );
}

export async function send(tabId, method, params = {}) {
  await attach(tabId);
  begin(tabId);
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await chrome.debugger.sendCommand({ tabId }, method, params);
      } catch (e) {
        if (attempt === 0 && /not attached/i.test(e.message)) {
          attached.delete(tabId);
          await attach(tabId);
          continue;
        }
        throw new ToolError('DEBUGGER_COMMAND_FAILED', `${method}: ${e.message}`);
      }
    }
  } finally {
    end(tabId);
  }
}

export async function detach(tabId) {
  clearIdle(tabId);
  inFlight.delete(tabId);
  attached.delete(tabId);
  try { await chrome.debugger.detach({ tabId }); } catch { /* not attached */ }
}

export async function detachAll() {
  for (const id of [...idleTimers.keys()]) clearIdle(id);
  for (const id of [...attached]) await detach(id);
}
