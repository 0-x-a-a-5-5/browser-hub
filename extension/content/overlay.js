// Viewport border + agent label, drawn inside a closed shadow root so page CSS cannot touch it.
globalThis.BH ??= {};
BH.overlay = BH.overlay || (() => {
  const DEFAULT_COLOR = '#ff2d55';
  const CSS = `
    :host { all: initial; }
    .frame { position: fixed; inset: 0; box-sizing: border-box; border: 3px dashed var(--c); opacity: .7; }
    .frame.target { border: 5px solid var(--c); opacity: 1; box-shadow: inset 0 0 28px 0 color-mix(in srgb, var(--c) 40%, transparent); }
    .frame.pulse { animation: bh-pulse .7s ease-out; }
    .frame.flash { border: 10px solid var(--c); opacity: 1; animation: bh-flash .45s ease-in-out 4; }
    .tag { position: fixed; top: 10px; right: 10px; max-width: 45vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
           background: var(--c); color: #fff; font: 600 12px/1 system-ui, -apple-system, sans-serif; padding: 7px 11px;
           border-radius: 999px; letter-spacing: .2px; box-shadow: 0 2px 10px rgba(0,0,0,.35); }
    .tag.dim { opacity: .55; }
    @keyframes bh-pulse { 0% { box-shadow: inset 0 0 70px 10px var(--c); } 100% { box-shadow: inset 0 0 28px 0 color-mix(in srgb, var(--c) 40%, transparent); } }
    @keyframes bh-flash { 0%, 100% { opacity: 1; } 50% { opacity: .15; } }
  `;
  let host = null, frame = null, tag = null;
  let state = { active: false, agents: [], isTarget: false };
  let flashTimer = null, pulseTimer = null;
  let suspended = false; // true while a screenshot is being taken

  function ensure() {
    if (host && host.isConnected) return;
    host = document.createElement('browser-hub-overlay');
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
    const shadow = host.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `<style>${CSS}</style><div class="frame"></div><div class="tag"></div>`;
    frame = shadow.querySelector('.frame');
    tag = shadow.querySelector('.tag');
    (document.documentElement || document).appendChild(host);
  }

  function render() {
    const show = state.active || flashTimer || pulseTimer;
    if (!show) { host?.remove(); return; }
    ensure();
    host.style.visibility = suspended ? 'hidden' : '';
    const color = state.agents[0]?.color || DEFAULT_COLOR;
    host.style.setProperty('--c', color);
    frame.classList.toggle('target', !!state.isTarget || !state.active);
    const label = state.agents.map((a) => a.label).filter(Boolean).join(' · ');
    tag.textContent = label;
    tag.style.display = label ? 'block' : 'none';
    tag.classList.toggle('dim', !state.isTarget);
  }

  function set(next) {
    if ('active' in next) state = { active: !!next.active, agents: next.agents || [], isTarget: !!next.isTarget };
    render();
    if (next.pulse) pulse();
    if (next.flash) flash();
  }

  function pulse() {
    clearTimeout(pulseTimer);
    pulseTimer = setTimeout(() => { pulseTimer = null; frame?.classList.remove('pulse'); render(); }, 750);
    render();
    frame.classList.remove('pulse');
    void frame.offsetWidth; // restart the animation
    frame.classList.add('pulse');
  }

  function flash() {
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { flashTimer = null; frame?.classList.remove('flash'); render(); }, 1900);
    render();
    frame.classList.add('flash');
  }

  function suspend() { suspended = true; if (host) host.style.visibility = 'hidden'; }
  function resume() { suspended = false; if (host) host.style.visibility = ''; }

  return { set, suspend, resume };
})();
