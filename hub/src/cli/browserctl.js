// browserctl: drive a browser from the shell. Holds a hub session (and the border) while it runs.
import fs from 'node:fs';
import os from 'node:os';
import { HubClient } from '../client.js';
import { hubUrl } from '../config.js';

const ALIASES = {
  browsers: ['browsers.list'], identify: ['browser.identify'], tabs: ['tabs.list'],
  new: ['tabs.create', 'url'], close: ['tabs.close', 'tabId'], activate: ['tabs.activate', 'tabId'],
  go: ['page.navigate', 'url'], back: ['page.navigate', null, { action: 'back' }], forward: ['page.navigate', null, { action: 'forward' }], reload: ['page.navigate', null, { action: 'reload' }],
  shot: ['page.screenshot'], page: ['page.snapshot', 'filter'], find: ['page.find', 'text'], text: ['page.text'],
  click: ['page.click', 'ref'], fill: ['page.fill', 'ref', 'value'], type: ['page.type', 'text'], key: ['page.key', 'key'],
  scroll: ['page.scroll', 'deltaY'], hover: ['page.hover', 'ref'], eval: ['page.evaluate', 'expression'], wait: ['page.wait', 'selector'],
  console: ['page.console'], network: ['page.network'], resize: ['window.resize', 'width', 'height'],
};

const USAGE = `usage: browserctl [-b <browser>] [--hub <ws url>] [--label <text>] [--out <file>] <command> [positional...] [key=value...]

commands: ${Object.keys(ALIASES).join(' ')}
          or any raw hub method, e.g. "page.snapshot filter=all"
examples: browserctl browsers
          browserctl -b work go https://example.com
          browserctl -b work page            # interactive outline with refs
          browserctl -b work click e3
          browserctl -b work click 640,300   # coordinates
          browserctl -b work fill e5 "hello"
          browserctl -b work shot --out shot.png
          browserctl -b work eval 'document.title'`;

function parseArgs(argv) {
  const opts = { browser: process.env.BROWSER_HUB_BROWSER || null, hub: process.env.BROWSER_HUB_URL || hubUrl('/agent'), label: process.env.BROWSER_HUB_LABEL || `browserctl@${os.hostname()}`, out: null };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-b' || a === '--browser') opts.browser = argv[++i];
    else if (a === '--hub') opts.hub = argv[++i];
    else if (a === '--label') opts.label = argv[++i];
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '-h' || a === '--help') { console.log(USAGE); process.exit(0); }
    else rest.push(a);
  }
  return { opts, rest };
}

function coerce(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (/^[[{]/.test(v)) { try { return JSON.parse(v); } catch { /* keep string */ } }
  return v;
}

function buildCall(rest) {
  const [cmd, ...args] = rest;
  if (!cmd) { console.error(USAGE); process.exit(2); }
  const alias = ALIASES[cmd];
  const method = alias ? alias[0] : cmd;
  const positional = alias ? alias.slice(1).filter((p) => typeof p === 'string') : [];
  const params = alias && typeof alias[alias.length - 1] === 'object' ? { ...alias[alias.length - 1] } : {};
  let pi = 0;
  for (const a of args) {
    const m = /^([a-zA-Z][\w]*)=([\s\S]*)$/.exec(a);
    if (m) { params[m[1]] = coerce(m[2]); continue; }
    const name = positional[pi++];
    if (!name) { console.error(`unexpected argument: ${a}\n${USAGE}`); process.exit(2); }
    if (name === 'ref' && /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(a)) { const [x, y] = a.split(',').map(Number); Object.assign(params, { x, y }); }
    else if (name === 'ref' && /^\d+$/.test(a)) params.ref = 'e' + a;
    else params[name] = name === 'expression' || name === 'text' || name === 'value' || name === 'url' || name === 'key' ? a : coerce(a);
  }
  return { method, params };
}

async function main() {
  const { opts, rest } = parseArgs(process.argv.slice(2));
  const { method, params } = buildCall(rest);
  const client = new HubClient({ url: opts.hub, label: opts.label, browser: opts.browser });
  try {
    const result = await client.call(method, params);
    print(method, result, opts);
  } catch (e) {
    console.error(`error ${e.code || 'ERROR'}: ${e.message}`);
    process.exitCode = 1;
  } finally {
    client.close();
  }
}

function print(method, result, opts) {
  if (result?.image) {
    const { image, ...rest } = result;
    const file = opts.out || `screenshot-${Date.now()}.${image.mimeType === 'image/jpeg' ? 'jpg' : 'png'}`;
    fs.writeFileSync(file, Buffer.from(image.base64, 'base64'));
    console.log(JSON.stringify({ ...rest, file }));
    return;
  }
  if (typeof result?.text === 'string' && (method === 'page.snapshot' || method === 'page.find' || method === 'page.text')) {
    const { text, ...rest } = result;
    console.log(JSON.stringify(rest));
    console.log(text);
    return;
  }
  console.log(JSON.stringify(result, null, 2));
}

main();
