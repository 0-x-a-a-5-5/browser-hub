// Screenshot of a tab, normalized to CSS pixels so click coordinates match 1:1.
import { ToolError, sleep } from '../errors.js';
import * as content from '../content-rpc.js';
import { resolveTabId } from './tabs.js';

export async function screenshot({ tabId, format = 'png', quality = 85, includeOverlay = false } = {}) {
  tabId = await resolveTabId(tabId);
  let tab = await chrome.tabs.get(tabId);
  if (!tab.active) {
    await chrome.tabs.update(tabId, { active: true });
    await sleep(200);
    tab = await chrome.tabs.get(tabId);
  }
  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  let viewport = null;
  try { viewport = await content.call(tabId, 'viewport', {}, { timeoutMs: 3000 }); } catch { /* restricted page */ }
  const hideOverlay = viewport && !includeOverlay;
  if (hideOverlay) await content.call(tabId, 'overlaySuspend').catch(() => {});
  let dataUrl;
  try {
    dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format, quality });
  } catch (e) {
    throw new ToolError('CAPTURE_FAILED', `${e.message} (is the window minimized?)`);
  } finally {
    if (hideOverlay) content.call(tabId, 'overlayResume').catch(() => {});
  }

  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  let width = bitmap.width;
  let height = bitmap.height;
  let base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);

  if (viewport && (bitmap.width !== viewport.width || bitmap.height !== viewport.height)) {
    width = viewport.width;
    height = viewport.height;
    const canvas = new OffscreenCanvas(width, height);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    const out = await canvas.convertToBlob({ type: mimeType, quality: quality / 100 });
    base64 = toBase64(await out.arrayBuffer());
  }
  bitmap.close();
  return { tabId, url: tab.url, title: tab.title, width, height, image: { mimeType, base64 } };
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
