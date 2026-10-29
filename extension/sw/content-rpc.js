// Request/response to the content script in a tab, injecting it first if the page
// was open before the extension loaded.
import { ToolError } from './errors.js';

const ISOLATED_FILES = ['content/overlay.js', 'content/dom.js', 'content/console-buffer.js', 'content/relay.js'];
const MAIN_FILES = ['content/console-capture.js'];

export async function call(tabId, action, params = {}, { timeoutMs = 15_000 } = {}) {
  try {
    return await send(tabId, action, params, timeoutMs);
  } catch (e) {
    if (!isNoReceiver(e)) throw e;
  }
  await inject(tabId);
  return send(tabId, action, params, timeoutMs);
}

export async function inject(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ISOLATED_FILES });
    await chrome.scripting.executeScript({ target: { tabId }, files: MAIN_FILES, world: 'MAIN' });
  } catch (e) {
    throw new ToolError(
      'NO_PAGE_ACCESS',
      `Cannot run in this tab (${e.message}). chrome:// pages, the Web Store, PDFs and about:blank are off limits; navigate to a normal URL first.`,
    );
  }
}

async function send(tabId, action, params, timeoutMs) {
  const reply = await withTimeout(
    chrome.tabs.sendMessage(tabId, { type: 'dom', action, params }),
    timeoutMs,
    `content script did not answer "${action}" within ${timeoutMs}ms`,
  );
  if (!reply) throw new ToolError('NO_REPLY', `content script returned nothing for "${action}"`);
  if (!reply.ok) throw new ToolError(reply.error?.code || 'DOM_ERROR', reply.error?.message || 'content script error');
  return reply.result;
}

function isNoReceiver(e) {
  return /Receiving end does not exist|Could not establish connection/i.test(e?.message || '');
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new ToolError('TIMEOUT', message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
