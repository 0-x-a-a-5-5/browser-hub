// US keyboard layout tables for chrome.debugger Input.dispatchKeyEvent.
export const MOD = { alt: 1, ctrl: 2, meta: 4, shift: 8 };

const MOD_ALIASES = {
  alt: MOD.alt, option: MOD.alt,
  ctrl: MOD.ctrl, control: MOD.ctrl,
  meta: MOD.meta, cmd: MOD.meta, command: MOD.meta, super: MOD.meta, win: MOD.meta,
  shift: MOD.shift,
};

const NAMED = {
  Enter: { keyCode: 13, code: 'Enter', text: '\r' },
  Tab: { keyCode: 9, code: 'Tab' },
  Escape: { keyCode: 27, code: 'Escape' },
  Backspace: { keyCode: 8, code: 'Backspace' },
  Delete: { keyCode: 46, code: 'Delete' },
  Insert: { keyCode: 45, code: 'Insert' },
  ArrowLeft: { keyCode: 37, code: 'ArrowLeft' },
  ArrowUp: { keyCode: 38, code: 'ArrowUp' },
  ArrowRight: { keyCode: 39, code: 'ArrowRight' },
  ArrowDown: { keyCode: 40, code: 'ArrowDown' },
  Home: { keyCode: 36, code: 'Home' },
  End: { keyCode: 35, code: 'End' },
  PageUp: { keyCode: 33, code: 'PageUp' },
  PageDown: { keyCode: 34, code: 'PageDown' },
  Space: { keyCode: 32, code: 'Space', key: ' ', text: ' ' },
  CapsLock: { keyCode: 20, code: 'CapsLock' },
  ContextMenu: { keyCode: 93, code: 'ContextMenu' },
  Shift: { keyCode: 16, code: 'ShiftLeft' },
  Control: { keyCode: 17, code: 'ControlLeft' },
  Alt: { keyCode: 18, code: 'AltLeft' },
  Meta: { keyCode: 91, code: 'MetaLeft' },
};
for (let i = 1; i <= 12; i++) NAMED[`F${i}`] = { keyCode: 111 + i, code: `F${i}` };

const NAME_ALIASES = {
  esc: 'Escape', return: 'Enter', del: 'Delete', bs: 'Backspace',
  up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
  pgup: 'PageUp', pgdn: 'PageDown', pageup: 'PageUp', pagedown: 'PageDown',
  spacebar: 'Space', ' ': 'Space',
};

const PUNCT = {
  '-': [189, 'Minus'], '=': [187, 'Equal'], '[': [219, 'BracketLeft'], ']': [221, 'BracketRight'],
  '\\': [220, 'Backslash'], ';': [186, 'Semicolon'], "'": [222, 'Quote'], ',': [188, 'Comma'],
  '.': [190, 'Period'], '/': [191, 'Slash'], '`': [192, 'Backquote'],
};

const SHIFTED = {
  '!': '1', '@': '2', '#': '3', '$': '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0',
  '_': '-', '+': '=', '{': '[', '}': ']', '|': '\\', ':': ';', '"': "'", '<': ',', '>': '.', '?': '/', '~': '`',
};

const lowerNamed = new Map(Object.keys(NAMED).map((k) => [k.toLowerCase(), k]));

// Key definition for a single printable character, or null when it has no US key.
export function keyForChar(ch) {
  if (ch === ' ') return { ...NAMED.Space, key: ' ', shift: false };
  if (/^[a-z]$/.test(ch)) return { key: ch, code: `Key${ch.toUpperCase()}`, keyCode: ch.toUpperCase().charCodeAt(0), text: ch, shift: false };
  if (/^[A-Z]$/.test(ch)) return { key: ch, code: `Key${ch}`, keyCode: ch.charCodeAt(0), text: ch, shift: true };
  if (/^[0-9]$/.test(ch)) return { key: ch, code: `Digit${ch}`, keyCode: ch.charCodeAt(0), text: ch, shift: false };
  if (PUNCT[ch]) return { key: ch, code: PUNCT[ch][1], keyCode: PUNCT[ch][0], text: ch, shift: false };
  if (SHIFTED[ch]) {
    const base = keyForChar(SHIFTED[ch]);
    return { ...base, key: ch, text: ch, shift: true };
  }
  return null;
}

// "ctrl+shift+t" -> { modifiers, def }. The last segment is the key; a trailing "+" means the plus key.
export function parseChord(chord) {
  const raw = String(chord).trim();
  if (!raw) throw new Error('empty key');
  let parts = raw.split('+');
  let keyName = parts.pop();
  if (keyName === '' ) { keyName = '+'; if (parts[parts.length - 1] === '') parts.pop(); }
  let modifiers = 0;
  for (const p of parts) {
    const m = MOD_ALIASES[p.trim().toLowerCase()];
    if (m == null) throw new Error(`unknown modifier "${p}" in "${chord}"`);
    modifiers |= m;
  }
  const def = resolveNamed(keyName) || (keyName.length === 1 ? keyForChar(keyName) : null);
  if (!def) throw new Error(`unknown key "${keyName}" in "${chord}"`);
  if (def.shift) modifiers |= MOD.shift;
  return { modifiers, def };
}

function resolveNamed(name) {
  const lc = name.toLowerCase();
  const canonical = lowerNamed.get(lc) || NAME_ALIASES[lc];
  if (!canonical) return null;
  const d = NAMED[canonical];
  return { key: d.key || canonical, code: d.code, keyCode: d.keyCode, text: d.text, shift: false };
}
