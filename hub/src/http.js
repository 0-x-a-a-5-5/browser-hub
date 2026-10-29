// Stateless HTTP face for curl and non-WebSocket agents. Browser origins are refused so a
// web page can never drive the hub.
import { config } from './config.js';

export function createHttpHandler(registry, dispatch) {
  let seq = 0;
  const ephemeral = () => ({ id: `http-${++seq}`, label: 'http', color: null, browserId: null, currentTabId: null, persistent: false });

  return async (req, res) => {
    if (req.headers.origin) return deny(res, 403, 'requests from browser origins are not allowed');
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/health') {
        return json(res, 200, { ok: true, browsers: registry.browsers.size, sessions: registry.sessions.size });
      }
      if (req.method === 'GET' && url.pathname === '/browsers') {
        return json(res, 200, await dispatch(ephemeral(), 'browsers.list', {}));
      }
      if (req.method === 'POST' && url.pathname === '/call') {
        if (!/^application\/json/i.test(req.headers['content-type'] || '')) return deny(res, 415, 'Content-Type must be application/json');
        if (config.token && req.headers.authorization !== `Bearer ${config.token}`) return deny(res, 401, 'bad token');
        const body = await readJson(req);
        if (!body?.method) return deny(res, 400, 'body needs {method, params?, browser?}');
        try {
          const result = await dispatch(ephemeral(), body.method, { ...(body.params || {}), browser: body.browser });
          return json(res, 200, { ok: true, result });
        } catch (e) {
          return json(res, 200, { ok: false, error: { code: e.code || 'ERROR', message: e.message } });
        }
      }
      return deny(res, 404, 'not found');
    } catch (e) {
      return deny(res, 500, e.message);
    }
  };
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function deny(res, status, message) {
  json(res, status, { ok: false, error: { code: `HTTP_${status}`, message } });
}

function readJson(req, limit = 16 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
