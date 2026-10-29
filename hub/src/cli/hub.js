import { startHub } from '../server.js';
import { log } from '../log.js';

const args = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const opts = portIdx >= 0 ? { port: Number(args[portIdx + 1]) } : {};

startHub(opts).then((hub) => {
  const stop = async (sig) => { log('hub.stopping', { signal: sig }); await hub.close(); process.exit(0); };
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));
}).catch((e) => {
  log('hub.failed', { error: e.message });
  process.exit(1);
});
