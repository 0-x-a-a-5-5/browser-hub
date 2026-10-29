// Request/response correlation over one WebSocket: {type:'req',id,method,params} <-> {type:'res',id,ok,...}
import { hubError } from './errors.js';

export class WsRpc {
  constructor(ws, { timeoutMs }) {
    this.ws = ws;
    this.timeoutMs = timeoutMs;
    this.pending = new Map();
    this.seq = 0;
  }

  request(method, params = {}, timeoutMs = this.timeoutMs) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(hubError('TIMEOUT', `${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.ws.send(JSON.stringify({ type: 'req', id, method, params }));
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(hubError('SEND_FAILED', e.message));
      }
    });
  }

  // Returns true when msg was a response we were waiting for.
  handleResponse(msg) {
    const p = this.pending.get(msg.id);
    if (!p) return false;
    clearTimeout(p.timer);
    this.pending.delete(msg.id);
    if (msg.ok) p.resolve(msg.result);
    else p.reject(hubError(msg.error?.code || 'ERROR', msg.error?.message || 'unknown error'));
    return true;
  }

  failAll(reason) {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(hubError('DISCONNECTED', reason));
    }
    this.pending.clear();
  }
}
