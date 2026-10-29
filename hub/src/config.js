export const config = {
  host: '127.0.0.1',
  port: Number(process.env.BROWSER_HUB_PORT || 8777),
  token: process.env.BROWSER_HUB_TOKEN || '',
  requestTimeoutMs: Number(process.env.BROWSER_HUB_TIMEOUT_MS || 45_000),
};

export const hubUrl = (path, port = config.port) => `ws://127.0.0.1:${port}${path}`;
export const httpUrl = (path, port = config.port) => `http://127.0.0.1:${port}${path}`;
