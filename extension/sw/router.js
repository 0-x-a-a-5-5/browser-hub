// Maps hub method names to tool functions. The hub never calls anything else.
import { ToolError } from './errors.js';
import * as control from './control.js';
import * as tabs from './tools/tabs.js';
import { navigate } from './tools/navigate.js';
import { screenshot } from './tools/screenshot.js';
import * as page from './tools/page.js';
import { evaluate } from './tools/evaluate.js';
import * as network from './tools/network.js';
import * as win from './tools/window.js';

const handlers = {
  'browser.summary': tabs.summary,
  'browser.identify': async () => { await control.flashAll(); return { flashed: true }; },
  'tabs.list': tabs.list,
  'tabs.create': tabs.create,
  'tabs.close': tabs.close,
  'tabs.activate': tabs.activate,
  'page.navigate': navigate,
  'page.screenshot': screenshot,
  'page.snapshot': page.snapshot,
  'page.find': page.find,
  'page.text': page.text,
  'page.click': page.click,
  'page.hover': page.hover,
  'page.fill': page.fill,
  'page.type': page.type,
  'page.key': page.key,
  'page.scroll': page.scroll,
  'page.wait': page.wait,
  'page.evaluate': evaluate,
  'page.console': page.consoleRead,
  'page.network': network.read,
  'window.resize': win.resize,
  'window.list': win.list,
};

export async function handle(method, params) {
  const fn = handlers[method];
  if (!fn) throw new ToolError('UNKNOWN_METHOD', `Unknown method "${method}"`);
  const result = await fn(params);
  if (result && typeof result.tabId === 'number' && method !== 'tabs.close') control.markTarget(result.tabId);
  return result;
}

export const methods = Object.keys(handlers);
