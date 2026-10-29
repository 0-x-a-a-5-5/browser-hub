// Isolated-world reader for the MAIN-world console buffer (see console-capture.js).
globalThis.BH ??= {};
BH.console = BH.console || {
  read({ level, pattern, clear = false, limit = 200 } = {}) {
    let items = [];
    const onDump = (e) => { try { items = JSON.parse(e.detail); } catch { items = []; } };
    document.addEventListener('__bh_console_dump', onDump, { once: true });
    document.dispatchEvent(new CustomEvent('__bh_console_pull', { detail: clear ? 'clear' : '' }));
    document.removeEventListener('__bh_console_dump', onDump);
    if (level) items = items.filter((i) => i.level === level);
    if (pattern) { const re = new RegExp(pattern, 'i'); items = items.filter((i) => re.test(i.text)); }
    const messages = items.slice(-limit);
    return { count: messages.length, messages };
  },
};
