// DOM side of the agent: an accessibility-flavoured snapshot with stable refs (e1, e2, ...)
// and the actions that take a ref. Runs in the extension's isolated world.
globalThis.BH ??= {};
BH.dom = BH.dom || (() => {
  const refs = new Map();      // ref -> WeakRef<Element>
  const refOf = new WeakMap(); // Element -> ref
  let counter = 0;

  const INTERACTIVE_ROLES = new Set(['button', 'link', 'checkbox', 'radio', 'textbox', 'searchbox', 'combobox', 'listbox', 'option',
    'menuitem', 'menuitemcheckbox', 'menuitemradio', 'switch', 'tab', 'slider', 'spinbutton', 'treeitem', 'file']);
  const STRUCTURE_ROLES = new Set(['heading', 'navigation', 'main', 'banner', 'contentinfo', 'complementary', 'dialog', 'alertdialog',
    'form', 'region', 'tablist', 'menu', 'menubar', 'toolbar', 'search', 'table', 'list', 'img']);
  const ALWAYS_SHOW = new Set(['heading', 'navigation', 'main', 'banner', 'contentinfo', 'dialog', 'alertdialog', 'complementary']);
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'META', 'LINK', 'TITLE', 'SVG', 'PATH', 'BROWSER-HUB-OVERLAY']);
  const LEAF_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'IMG', 'VIDEO', 'AUDIO', 'CANVAS', 'IFRAME', 'BUTTON', 'A', 'SUMMARY', 'OPTION']);
  const TAG_ROLES = { A: 'link', BUTTON: 'button', TEXTAREA: 'textbox', OPTION: 'option', SUMMARY: 'button', DETAILS: 'group',
    H1: 'heading', H2: 'heading', H3: 'heading', H4: 'heading', H5: 'heading', H6: 'heading', IMG: 'img', NAV: 'navigation',
    MAIN: 'main', HEADER: 'banner', FOOTER: 'contentinfo', ASIDE: 'complementary', FORM: 'form', DIALOG: 'dialog', SECTION: 'region',
    TABLE: 'table', UL: 'list', OL: 'list', LI: 'listitem', LABEL: 'label', IFRAME: 'iframe', VIDEO: 'video', AUDIO: 'audio', P: 'paragraph' };
  const INPUT_ROLES = { checkbox: 'checkbox', radio: 'radio', range: 'slider', number: 'spinbutton', search: 'searchbox',
    submit: 'button', button: 'button', reset: 'button', image: 'button', hidden: 'hidden', file: 'file' };

  // ---------- refs ----------
  function assignRef(el) {
    let ref = refOf.get(el);
    if (!ref) { ref = 'e' + (++counter); refOf.set(el, ref); }
    refs.set(ref, new WeakRef(el));
    return ref;
  }

  function get(ref) {
    const el = refs.get(String(ref))?.deref();
    if (!el || !el.isConnected) throw err('STALE_REF', `ref ${ref} is unknown or no longer in the page; call read_page or find again`);
    return el;
  }

  function err(code, message) { const e = new Error(message); e.code = code; return e; }

  // ---------- roles & names ----------
  function roleOf(el) {
    const explicit = el.getAttribute('role');
    if (explicit) return explicit.trim().split(/\s+/)[0].toLowerCase();
    const tag = el.tagName;
    if (tag === 'A') return el.hasAttribute('href') ? 'link' : 'generic';
    if (tag === 'INPUT') return INPUT_ROLES[(el.type || 'text').toLowerCase()] || 'textbox';
    if (tag === 'SELECT') return (el.multiple || el.size > 1) ? 'listbox' : 'combobox';
    return TAG_ROLES[tag] || 'generic';
  }

  function clip(s, n = 100) {
    s = String(s).replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  function ariaName(el) {
    const lb = el.getAttribute('aria-labelledby');
    if (lb) {
      const t = lb.split(/\s+/).map((id) => el.ownerDocument.getElementById(id)?.textContent || '').join(' ');
      if (t.trim()) return clip(t);
    }
    const al = el.getAttribute('aria-label');
    return al && al.trim() ? clip(al) : '';
  }

  function nameOf(el, role) {
    const aria = ariaName(el);
    if (aria) return aria;
    if (el.labels && el.labels.length) {
      const t = [...el.labels].map((l) => l.textContent).join(' ');
      if (t.trim()) return clip(t);
    }
    if (typeof el.alt === 'string' && el.alt.trim()) return clip(el.alt);
    if (el.tagName === 'INPUT') {
      if (['submit', 'button', 'reset'].includes(el.type) && el.value) return clip(el.value);
      if (el.placeholder) return clip(el.placeholder);
    }
    if (el.tagName === 'TEXTAREA' && el.placeholder) return clip(el.placeholder);
    if (STRUCTURE_ROLES.has(role) && role !== 'heading' && role !== 'img') return clip(el.getAttribute('title') || '');
    const text = clip(el.innerText ?? el.textContent ?? '');
    if (text) return text;
    const title = el.getAttribute('title');
    if (title) return clip(title);
    if (el.name) return clip(el.name);
    return el.id ? '#' + el.id : '';
  }

  function attrsOf(el, role, name, coords) {
    const a = [];
    const q = (v) => JSON.stringify(clip(v, 80));
    if (role === 'link') {
      const href = el.getAttribute('href');
      if (href && !/^javascript:/i.test(href)) a.push(`href=${q(href)}`);
    }
    if (el.tagName === 'SELECT') {
      const o = el.selectedOptions && el.selectedOptions[0];
      a.push(`value=${q(o ? o.textContent : '')}`, `options=${el.options.length}`);
    } else if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && !['checkbox', 'radio', 'submit', 'button', 'reset', 'file'].includes(el.type)) {
      if (el.value) a.push(`value=${q(el.type === 'password' ? '••••' : el.value)}`);
      if (el.placeholder && el.placeholder !== name) a.push(`placeholder=${q(el.placeholder)}`);
      if (el.type && el.type !== 'text') a.push(`type=${el.type}`);
    } else if (el.isContentEditable && role !== 'generic') {
      a.push('editable');
    }
    if (['checkbox', 'radio', 'switch', 'menuitemcheckbox', 'menuitemradio'].includes(role)) {
      const checked = typeof el.checked === 'boolean' ? el.checked : el.getAttribute('aria-checked') === 'true';
      a.push(checked ? 'checked' : 'unchecked');
    }
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') a.push('disabled');
    const expanded = el.getAttribute('aria-expanded');
    if (expanded) a.push(`expanded=${expanded}`);
    if (el.getAttribute('aria-selected') === 'true' || (el.tagName === 'OPTION' && el.selected)) a.push('selected');
    if (el.required) a.push('required');
    if (coords) {
      const r = el.getBoundingClientRect();
      a.push(`@${Math.round(r.x + r.width / 2)},${Math.round(r.y + r.height / 2)}`);
    }
    return a;
  }

  function hasBox(el) {
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  function isInteractive(el, role, inheritedPointer, cs) {
    if (INTERACTIVE_ROLES.has(role)) return true;
    if (el.isContentEditable && !el.parentElement?.isContentEditable) return true;
    if (el.hasAttribute('onclick')) return true;
    if (el.hasAttribute('tabindex') && el.tabIndex >= 0 && role !== 'generic') return true;
    if (role === 'generic' && el.hasAttribute('tabindex') && el.tabIndex >= 0) return true;
    return cs.cursor === 'pointer' && !inheritedPointer && role === 'generic';
  }

  function formatLine(indent, role, ref, name, attrs, level) {
    const parts = ['  '.repeat(indent) + '- ' + role + (level ? `[${level}]` : '')];
    if (ref) parts.push(`[${ref}]`);
    if (name) parts.push(JSON.stringify(name));
    parts.push(...attrs);
    return parts.join(' ');
  }

  function headingLevel(el) {
    const m = /^H([1-6])$/.exec(el.tagName);
    return m ? m[1] : el.getAttribute('aria-level') || '';
  }

  function ownText(el) {
    let t = '';
    for (const n of el.childNodes) if (n.nodeType === Node.TEXT_NODE) t += n.data;
    return clip(t, 200);
  }

  function* children(node) {
    if (node.shadowRoot) yield* node.shadowRoot.children;
    yield* node.children;
  }

  // ---------- snapshot ----------
  function snapshot({ filter = 'interactive', maxItems = 400, coords = false } = {}) {
    const lines = [];
    let truncated = false;
    const all = filter === 'all';

    function visit(node, indent, inheritedPointer) {
      for (const el of children(node)) {
        if (lines.length >= maxItems) { truncated = true; return; }
        if (SKIP_TAGS.has(el.tagName)) continue;
        if (el.hidden || el.getAttribute('aria-hidden') === 'true') continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none') continue;
        const role = roleOf(el);
        if (role === 'hidden') continue;
        const visible = cs.visibility !== 'hidden' && (hasBox(el) || (el.firstElementChild && hasBox(el.firstElementChild)));
        const interactive = visible && isInteractive(el, role, inheritedPointer, cs);
        let emit = false, shownRole = role;
        if (visible) {
          if (interactive) { emit = true; if (role === 'generic') shownRole = 'clickable'; }
          else if (STRUCTURE_ROLES.has(role)) emit = ALWAYS_SHOW.has(role) || !!ariaName(el) || (all && role === 'img');
          else if (all) { const t = ownText(el); if (t) { emit = true; shownRole = 'text'; } }
        }
        let childIndent = indent;
        if (emit) {
          const ref = interactive ? assignRef(el) : null;
          const name = shownRole === 'text' ? ownText(el) : nameOf(el, role);
          const attrs = interactive || role === 'img' ? attrsOf(el, role, name, coords) : [];
          lines.push(formatLine(indent, shownRole, ref, name, attrs, role === 'heading' ? headingLevel(el) : ''));
          childIndent = indent + 1;
        }
        if (!LEAF_TAGS.has(el.tagName) && !(interactive && role !== 'generic' && !el.shadowRoot && el.children.length === 0)) {
          visit(el, childIndent, inheritedPointer || (emit && cs.cursor === 'pointer'));
        }
      }
    }
    visit(document.body || document.documentElement, 0, false);
    return { url: location.href, title: document.title, count: lines.length, truncated, text: lines.join('\n') };
  }

  // ---------- find ----------
  function* walkAll(node) {
    for (const el of children(node)) {
      if (SKIP_TAGS.has(el.tagName)) continue;
      yield el;
      yield* walkAll(el);
    }
  }

  function find({ text, selector, role, limit = 20 } = {}) {
    const needle = text ? String(text).toLowerCase() : null;
    const matches = [];
    const candidates = selector ? document.querySelectorAll(selector) : walkAll(document.body || document.documentElement);
    for (const el of candidates) {
      if (matches.length >= 500) break;
      if (el.hidden || getComputedStyle(el).display === 'none' || !hasBox(el)) continue;
      const r = roleOf(el);
      if (role && r !== role.toLowerCase() && !(role === 'clickable' && r === 'generic')) continue;
      if (needle) {
        const hay = (nameOf(el, r) + ' ' + (el.value || '') + ' ' + (el.getAttribute('title') || '')).toLowerCase();
        if (!hay.includes(needle)) continue;
      }
      matches.push(el);
    }
    // Drop ancestors whose only claim is a matching descendant.
    const leaves = matches.filter((el) => !matches.some((o) => o !== el && el.contains(o)));
    const picked = leaves.slice(0, limit);
    const lines = picked.map((el) => {
      const r = roleOf(el);
      const name = nameOf(el, r);
      return formatLine(0, r === 'generic' ? 'element' : r, assignRef(el), name, attrsOf(el, r, name, true), r === 'heading' ? headingLevel(el) : '');
    });
    return { count: picked.length, total: leaves.length, text: lines.join('\n') };
  }

  // ---------- text ----------
  function text({ selector, maxChars = 50_000 } = {}) {
    const root = selector ? document.querySelector(selector) : document.body;
    if (!root) throw err('NOT_FOUND', `no element matches ${selector}`);
    const t = (root.innerText || root.textContent || '').trim();
    return { url: location.href, title: document.title, length: t.length, truncated: t.length > maxChars, text: t.slice(0, maxChars) };
  }

  // ---------- actions ----------
  function center({ ref }) {
    const el = get(ref);
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    const x = Math.round(r.x + r.width / 2), y = Math.round(r.y + r.height / 2);
    const hit = document.elementFromPoint(x, y);
    const obscured = !!hit && hit !== el && !el.contains(hit) && !hit.contains(el);
    return { x, y, obscured };
  }

  const BUTTONS = { left: 0, middle: 1, right: 2 };

  function click({ ref, button = 'left', clickCount = 1 } = {}) {
    const el = get(ref);
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    const init = { bubbles: true, cancelable: true, composed: true, view: window,
      clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, button: BUTTONS[button] ?? 0, buttons: 1 << (BUTTONS[button] ?? 0) };
    if (typeof el.focus === 'function') el.focus({ preventScroll: true });
    if (el.tagName === 'OPTION') return selectOption(el);
    for (let i = 1; i <= clickCount; i++) {
      el.dispatchEvent(new PointerEvent('pointerdown', { ...init, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
      el.dispatchEvent(new MouseEvent('mousedown', { ...init, detail: i }));
      el.dispatchEvent(new PointerEvent('pointerup', { ...init, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 0 }));
      el.dispatchEvent(new MouseEvent('mouseup', { ...init, detail: i, buttons: 0 }));
      if (button === 'right') el.dispatchEvent(new MouseEvent('contextmenu', { ...init, detail: i, buttons: 0 }));
      else if (button === 'left' && typeof el.click === 'function' && i === 1) el.click();
      else el.dispatchEvent(new MouseEvent(button === 'middle' ? 'auxclick' : 'click', { ...init, detail: i, buttons: 0 }));
    }
    if (clickCount >= 2) el.dispatchEvent(new MouseEvent('dblclick', { ...init, detail: 2, buttons: 0 }));
    const role = roleOf(el);
    return { ref, role, name: nameOf(el, role), tag: el.tagName.toLowerCase() };
  }

  function selectOption(opt) {
    const sel = opt.closest('select');
    if (!sel) throw err('BAD_TARGET', 'option is not inside a select');
    if (sel.multiple) opt.selected = !opt.selected; else sel.value = opt.value;
    fire(sel, 'input'); fire(sel, 'change');
    return { ref: refOf.get(opt), role: 'option', name: clip(opt.textContent), selected: opt.selected };
  }

  function fire(el, type) { el.dispatchEvent(new Event(type, { bubbles: true, composed: true })); }

  function setNativeValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, value); else el.value = value;
  }

  function fill({ ref, value } = {}) {
    const el = get(ref);
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const tag = el.tagName;
    if (tag === 'SELECT') {
      const wanted = String(value).toLowerCase();
      const opt = [...el.options].find((o) => o.value === value) ||
        [...el.options].find((o) => o.textContent.trim().toLowerCase() === wanted || o.value.toLowerCase() === wanted) ||
        [...el.options].find((o) => o.textContent.trim().toLowerCase().includes(wanted));
      if (!opt) throw err('NO_OPTION', `no option matches ${JSON.stringify(value)}; options: ${[...el.options].map((o) => o.textContent.trim()).slice(0, 30).join(' | ')}`);
      el.value = opt.value;
      fire(el, 'input'); fire(el, 'change');
      return { ref, tag: 'select', value: opt.value, label: clip(opt.textContent) };
    }
    if (tag === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) {
      const want = value === true || /^(true|1|yes|on|checked)$/i.test(String(value));
      if (el.checked !== want) el.click();
      return { ref, tag: 'input', type: el.type, checked: el.checked };
    }
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      if (el.type === 'file') throw err('UNSUPPORTED', 'file inputs cannot be filled from a script');
      el.focus({ preventScroll: true });
      setNativeValue(el, String(value));
      fire(el, 'input'); fire(el, 'change');
      return { ref, tag: tag.toLowerCase(), type: el.type, value: el.value };
    }
    if (el.isContentEditable) {
      el.focus({ preventScroll: true });
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(range);
      if (!document.execCommand('insertText', false, String(value))) { el.textContent = String(value); fire(el, 'input'); }
      return { ref, tag: tag.toLowerCase(), editable: true, value: clip(el.textContent, 200) };
    }
    throw err('BAD_TARGET', `ref ${ref} is a <${tag.toLowerCase()}>, not a form control`);
  }

  function scroll({ ref, deltaX = 0, deltaY = 0 } = {}) {
    if (ref != null) get(ref).scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    else window.scrollBy({ left: deltaX, top: deltaY, behavior: 'instant' });
    return viewport();
  }

  function viewport() {
    return { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio,
      scrollX: Math.round(window.scrollX), scrollY: Math.round(window.scrollY),
      pageHeight: Math.round(document.documentElement.scrollHeight) };
  }

  async function wait({ selector, text: needle, ms, timeoutMs = 10_000 } = {}) {
    const start = Date.now();
    if (ms != null && !selector && !needle) { await sleep(ms); return { waitedMs: ms }; }
    const check = () => {
      if (selector) { const el = document.querySelector(selector); return !!el && hasBox(el); }
      return (document.body?.innerText || '').includes(needle);
    };
    while (!check()) {
      if (Date.now() - start > timeoutMs) return { found: false, elapsedMs: Date.now() - start };
      await sleep(100);
    }
    return { found: true, elapsedMs: Date.now() - start };
  }

  const sleep = (t) => new Promise((r) => setTimeout(r, t));

  return { snapshot, find, text, center, click, fill, scroll, viewport, wait };
})();
