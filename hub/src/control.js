// Tell an extension who controls it right now (drives the border overlay + badge).
export function pushControl(registry, browser) {
  if (!browser || browser.ws.readyState !== 1) return;
  const agents = registry.controllersOf(browser.id).map((s) => ({ sessionId: s.id, label: s.label, color: s.color }));
  browser.ws.send(JSON.stringify({ type: 'control', active: agents.length > 0, agents }));
}
