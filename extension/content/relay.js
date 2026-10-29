// Message bridge between the service worker and the content-side modules.
globalThis.BH ??= {};
if (!BH.relayInstalled) {
  BH.relayInstalled = true;
  const actions = {
    snapshot: (p) => BH.dom.snapshot(p),
    find: (p) => BH.dom.find(p),
    text: (p) => BH.dom.text(p),
    center: (p) => BH.dom.center(p),
    click: (p) => BH.dom.click(p),
    fill: (p) => BH.dom.fill(p),
    scroll: (p) => BH.dom.scroll(p),
    viewport: () => BH.dom.viewport(),
    wait: (p) => BH.dom.wait(p),
    console: (p) => BH.console.read(p),
    overlaySuspend: () => { BH.overlay.suspend(); return { ok: true }; },
    overlayResume: () => { BH.overlay.resume(); return { ok: true }; },
  };

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'overlay:set') { BH.overlay.set(msg); return false; }
    if (msg?.type !== 'dom') return false;
    const fn = actions[msg.action];
    Promise.resolve()
      .then(() => { if (!fn) throw new Error(`unknown action ${msg.action}`); return fn(msg.params || {}); })
      .then((result) => sendResponse({ ok: true, result }),
        (e) => sendResponse({ ok: false, error: { code: e.code || 'DOM_ERROR', message: e.message || String(e) } }));
    return true;
  });

  const refreshOverlay = () => chrome.runtime.sendMessage({ type: 'overlay:state' })
    .then((s) => s && BH.overlay.set(s)).catch(() => {});
  refreshOverlay();
  window.addEventListener('pageshow', refreshOverlay);
}
