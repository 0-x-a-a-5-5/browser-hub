// Outbound WebSocket to the hub. Reconnects with backoff, pings every 20s so the
// MV3 service worker stays alive (Chrome keeps a worker alive while its socket
// has traffic within 30s), and turns hub requests into router calls.
const PING_MS = 20_000;
const MAX_BACKOFF_MS = 30_000;

export class HubLink {
  constructor({ onRequest, onControl }) {
    this.onRequest = onRequest;
    this.onControl = onControl;
    this.identity = null;
    this.ws = null;
    this.backoff = 1000;
    this.pingTimer = null;
    this.retryTimer = null;
    this.lastError = '';
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get url() {
    return this.identity?.hubUrl || '';
  }

  configure(identity) {
    this.identity = identity;
  }

  connect() {
    if (!this.identity || this.ws) return;
    let ws;
    try {
      ws = new WebSocket(this.identity.hubUrl);
    } catch (e) {
      this.lastError = e.message;
      this.scheduleRetry();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.backoff = 1000;
      this.lastError = '';
      this.send(this.helloMessage());
      this.startPing();
    };
    ws.onmessage = (ev) => this.receive(ev.data);
    ws.onerror = () => {
      this.lastError = 'connection failed';
    };
    ws.onclose = (ev) => {
      if (ev.reason) this.lastError = ev.reason;
      this.dropped();
    };
  }

  ensureConnected() {
    if (!this.ws) this.connect();
  }

  reconnect() {
    this.close();
    this.connect();
  }

  close() {
    this.stopPing();
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = null;
      try { ws.close(); } catch { /* already closed */ }
    }
  }

  helloMessage() {
    const { browserId, name, token } = this.identity;
    const brands = navigator.userAgentData?.brands?.filter((b) => !/Not.A.Brand/i.test(b.brand)) || [];
    return {
      type: 'hello',
      browserId,
      name,
      token,
      meta: {
        brands: brands.map((b) => `${b.brand} ${b.version}`),
        platform: navigator.userAgentData?.platform || navigator.platform,
        extensionVersion: chrome.runtime.getManifest().version,
      },
    };
  }

  send(obj) {
    if (!this.connected) return false;
    this.ws.send(JSON.stringify(obj));
    return true;
  }

  receive(raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    switch (msg.type) {
      case 'pong':
        return;
      case 'control':
        this.onControl(msg);
        return;
      case 'req':
        this.onRequest(msg.method, msg.params || {}).then(
          (result) => this.send({ type: 'res', id: msg.id, ok: true, result }),
          (err) => this.send({
            type: 'res', id: msg.id, ok: false,
            error: { code: err.code || 'ERROR', message: err.message || String(err) },
          }),
        );
        return;
      default:
        return;
    }
  }

  startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => this.send({ type: 'ping' }), PING_MS);
  }

  stopPing() {
    clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  dropped() {
    this.stopPing();
    this.ws = null;
    this.onControl({ active: false, agents: [] });
    this.scheduleRetry();
  }

  scheduleRetry() {
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, this.backoff);
    this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
  }
}
