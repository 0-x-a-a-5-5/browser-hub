import * as dbg from '../debugger.js';
import { ToolError } from '../errors.js';
import { resolveTabId } from './tabs.js';

export async function evaluate({ tabId, expression, awaitPromise = true } = {}) {
  tabId = await resolveTabId(tabId);
  if (typeof expression !== 'string') throw new ToolError('BAD_PARAMS', 'evaluate needs an expression string');
  const r = await dbg.send(tabId, 'Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise, userGesture: true, timeout: 15_000,
  });
  if (r.exceptionDetails) {
    const d = r.exceptionDetails;
    throw new ToolError('JS_EXCEPTION', d.exception?.description || d.text || 'exception');
  }
  const out = { tabId, type: r.result.type };
  if (r.result.subtype) out.subtype = r.result.subtype;
  if ('value' in r.result) out.value = r.result.value;
  else if (r.result.description) out.description = r.result.description;
  return out;
}
