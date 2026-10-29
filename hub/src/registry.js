// In-memory state: connected browsers (extension sockets) and agent sessions.
import { hubError } from './errors.js';

const PALETTE = ['#ff2d55', '#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#64d2ff', '#ffd60a', '#ff6482'];

export class Registry {
  constructor() {
    this.browsers = new Map(); // id -> { id, name, meta, rpc, ws, connectedAt, lastSeen }
    this.sessions = new Map(); // id -> { id, label, color, browserId, currentTabId, persistent }
    this.colorIndex = 0;
  }

  addBrowser(b) { this.browsers.set(b.id, b); }
  removeBrowser(id) { this.browsers.delete(id); }
  addSession(s) { this.sessions.set(s.id, s); }
  removeSession(id) { this.sessions.delete(id); }

  nextColor() { return PALETTE[this.colorIndex++ % PALETTE.length]; }

  names() { return [...this.browsers.values()].map((b) => b.name).join(', ') || '(none)'; }

  findBrowser(q) {
    if (!q) return null;
    const needle = String(q).toLowerCase();
    for (const b of this.browsers.values()) {
      if (b.id === q || b.name.toLowerCase() === needle) return b;
    }
    return null;
  }

  // Explicit name/id, or the only connected browser; anything else is an error the agent can act on.
  resolveBrowser(q) {
    if (q) {
      const b = this.findBrowser(q);
      if (!b) throw hubError('NO_SUCH_BROWSER', `No connected browser named "${q}". Connected: ${this.names()}`);
      return b;
    }
    if (this.browsers.size === 1) return this.browsers.values().next().value;
    if (this.browsers.size === 0) throw hubError('NO_BROWSERS', 'No browsers are connected to the hub. Load the Browser Hub Agent extension in a Chrome profile and check its popup.');
    throw hubError('AMBIGUOUS_BROWSER', `Several browsers are connected (${this.names()}). Pick one with browser_select.`);
  }

  controllersOf(browserId) {
    return [...this.sessions.values()].filter((s) => s.browserId === browserId);
  }
}
