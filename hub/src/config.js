// Unset or empty means the default; anything that is not a non-negative number fails at startup.
function msFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const ms = Number(raw);
  if (!Number.isFinite(ms) || ms < 0) throw new Error(`${name} must be a non-negative number of milliseconds, got "${raw}"`);
  return ms;
}

export const config = {
  host: '127.0.0.1',
  port: Number(process.env.BROWSER_HUB_PORT || 8777),
  token: process.env.BROWSER_HUB_TOKEN || '',
  requestTimeoutMs: Number(process.env.BROWSER_HUB_TIMEOUT_MS || 45_000),
  agentIdleMs: msFromEnv('BROWSER_HUB_AGENT_IDLE_MS', 60_000),
};

export const hubUrl = (path, port = config.port) => `ws://127.0.0.1:${port}${path}`;
export const httpUrl = (path, port = config.port) => `http://127.0.0.1:${port}${path}`;
