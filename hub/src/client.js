// Agent-side client used by the MCP server and the CLI. Reconnects lazily and re-selects
// the last browser so a hub restart does not strand the session.
import WebSocket from 'ws';
import { WsRpc } from './ws-rpc.js';
import { config, hubUrl } from './config.js';
import { hubError } from './errors.js';

export class HubClient {
  constructor({ url = hubUrl('/agent'), label = 'agent', token = config.token, browser = null, timeoutMs = config.requestTimeoutMs } = {}) {
    this.url = url;
    this.label = label;
    this.token = token;
    this.browser = browser;
    this.timeoutMs = timeoutMs;
    this.ws = null;
    this.rpc = null;
    this.welcome = null;
    this.connecting = null;
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return Promise.resolve(this.welcome);
    if (this.connecting) return this.connecting;
    this.connecting = new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url, { origin: undefined });
      const rpc = new WsRpc(ws, { timeoutMs: this.timeoutMs });
      ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', label: this.label, token: this.token, browser: this.browser })));
      ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }
        if (msg.type === 'welcome') { this.welcome = msg; this.ws = ws; this.rpc = rpc; this.connecting = null; resolve(msg); }
        else if (msg.type === 'res') rpc.handleResponse(msg);
      });
      ws.on('error', (e) => {
        this.connecting = null;
        reject(hubError('HUB_UNREACHABLE', `Cannot reach the browser hub at ${this.url} (${e.message}). Start it with: systemctl --user start browser-hub`));
      });
      ws.on('close', (code, reason) => {
        rpc.failAll(`hub connection closed (${code} ${reason})`);
        if (this.ws === ws) { this.ws = null; this.rpc = null; }
        this.connecting = null;
        reject(hubError('HUB_CLOSED', `hub closed the connection (${code} ${reason || ''})`.trim()));
      });
    });
    return this.connecting;
  }

  async call(method, params = {}) {
    await this.connect();
    const result = await this.rpc.request(method, params);
    if (method === 'browser.select' && result?.selected?.name) this.browser = result.selected.name;
    return result;
  }

  close() {
    this.ws?.close();
    this.ws = null;
  }
}
