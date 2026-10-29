// chrome.debugger session management. Attached lazily on first use, detached when
// no agent controls this browser any more (which also removes Chrome's banner).
import { ToolError } from './errors.js';

const attached = new Set();

chrome.debugger.onDetach.addListener(({ tabId }) => attached.delete(tabId));

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
  try {
    return await chrome.debugger.sendCommand({ tabId }, method, params);
  } catch (e) {
    throw new ToolError('DEBUGGER_COMMAND_FAILED', `${method}: ${e.message}`);
  }
}

export async function detach(tabId) {
  attached.delete(tabId);
  try { await chrome.debugger.detach({ tabId }); } catch { /* not attached */ }
}

export async function detachAll() {
  for (const id of [...attached]) await detach(id);
}
