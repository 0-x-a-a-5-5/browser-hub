// MAIN-world console recorder. Keeps a ring buffer in the page and hands it over when the
// isolated-world script asks via a DOM event (strings are the only thing that crosses worlds).
(() => {
  if (window.__bhConsoleCapture) return;
  window.__bhConsoleCapture = true;
  const MAX = 500;
  const buf = [];
  const fmt = (args) => args.map((a) => {
    try {
      if (typeof a === 'string') return a;
      if (a instanceof Error) return a.stack || a.message;
      const s = JSON.stringify(a);
      return s === undefined ? String(a) : s.slice(0, 2000);
    } catch { return String(a); }
  }).join(' ');
  const push = (level, args, extra) => {
    buf.push({ ts: Date.now(), level, text: fmt(args), ...extra });
    if (buf.length > MAX) buf.splice(0, buf.length - MAX);
  };
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    try {
      const orig = console[level];
      console[level] = function (...args) { push(level, args); return orig.apply(this, args); };
    } catch { /* console is frozen on this page */ }
  }
  window.addEventListener('error', (e) => push('error', [e.message], { source: `${e.filename}:${e.lineno}:${e.colno}` }));
  window.addEventListener('unhandledrejection', (e) => push('error', ['Unhandled rejection:', e.reason]));
  document.addEventListener('__bh_console_pull', (e) => {
    document.dispatchEvent(new CustomEvent('__bh_console_dump', { detail: JSON.stringify(buf) }));
    if (e.detail === 'clear') buf.length = 0;
  });
})();
