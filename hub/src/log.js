// One line per event on stderr: "<iso time> <op> key=value ..."
export function log(op, fields = {}) {
  const kv = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v)}`)
    .join(' ');
  process.stderr.write(`${new Date().toISOString()} ${op}${kv ? ' ' + kv : ''}\n`);
}
