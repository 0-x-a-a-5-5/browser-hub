// Trusted input via chrome.debugger: real mouse/keyboard events at the OS-event level.
import * as dbg from '../debugger.js';
import { MOD, parseChord, keyForChar } from '../keymap.js';
import { ToolError } from '../errors.js';

const BUTTON_MASK = { left: 1, right: 2, middle: 4 };

export async function moveTo(tabId, x, y) {
  await dbg.send(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
}

export async function clickAt(tabId, x, y, { button = 'left', clickCount = 1 } = {}) {
  if (!(button in BUTTON_MASK)) throw new ToolError('BAD_PARAMS', `button must be left|right|middle, got ${button}`);
  await moveTo(tabId, x, y);
  for (let i = 1; i <= clickCount; i++) {
    await dbg.send(tabId, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, buttons: BUTTON_MASK[button], clickCount: i });
    await dbg.send(tabId, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, buttons: 0, clickCount: i });
  }
}

export async function wheel(tabId, x, y, deltaX = 0, deltaY = 0) {
  await dbg.send(tabId, 'Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX, deltaY });
}

export async function pressKey(tabId, chord) {
  let parsed;
  try { parsed = parseChord(chord); } catch (e) { throw new ToolError('BAD_KEY', e.message); }
  const { modifiers, def } = parsed;
  const text = (modifiers & (MOD.ctrl | MOD.alt | MOD.meta)) ? undefined : def.text;
  await keyDownUp(tabId, def, modifiers, text);
}

export async function typeText(tabId, text) {
  for (const ch of text) {
    const def = keyForChar(ch);
    if (def) {
      await keyDownUp(tabId, def, def.shift ? MOD.shift : 0, ch);
    } else if (ch === '\n') {
      await keyDownUp(tabId, { key: 'Enter', code: 'Enter', keyCode: 13 }, 0, '\r');
    } else {
      await dbg.send(tabId, 'Input.insertText', { text: ch });
    }
  }
}

async function keyDownUp(tabId, def, modifiers, text) {
  const base = { modifiers, key: def.key, code: def.code, windowsVirtualKeyCode: def.keyCode, nativeVirtualKeyCode: def.keyCode };
  await dbg.send(tabId, 'Input.dispatchKeyEvent', { ...base, type: text ? 'keyDown' : 'rawKeyDown', text, unmodifiedText: text });
  await dbg.send(tabId, 'Input.dispatchKeyEvent', { ...base, type: 'keyUp' });
}
