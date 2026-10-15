import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const name = 'dsh-pintop';
export const inject = ['webServer'];
export const DEFAULT_EXECUTABLE = 'C:\\Sofware\\dsh\\DeepSeek Harness.exe';
const scriptPath = fileURLToPath(new URL('../native/pintop.ps1', import.meta.url));

export function runNative(action = 'get', enabled, executablePath = DEFAULT_EXECUTABLE) {
  if (!['get', 'set'].includes(action) || (action === 'set' && typeof enabled !== 'boolean')) return Promise.reject(new Error('Invalid native operation'));
  if (!path.win32.isAbsolute(executablePath) || path.win32.basename(executablePath).toLowerCase() !== 'deepseek harness.exe') return Promise.reject(new Error('Invalid configured DeepSeek Harness executable path'));
  if (process.platform !== 'win32') return Promise.reject(new Error('Window pinning requires Windows'));
  return new Promise((resolve, reject) => {
    const args = ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', scriptPath, '-ExecutablePath', executablePath, '-Action', action];
    if (action === 'set') args.push('-Enabled', String(enabled));
    const child = spawn('pwsh.exe', args, { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', error = '', settled = false;
    const finish = (err, result) => { if (settled) return; settled = true; clearTimeout(timer); err ? reject(err) : resolve(result); };
    const timer = setTimeout(() => { child.kill(); finish(new Error('Native window operation timed out (30 seconds)')); }, 30000);
    child.on('error', err => finish(err));
    child.stdout.on('data', chunk => { output += chunk; if (output.length > 16384) { child.kill(); finish(new Error('Native output limit exceeded')); } });
    child.stderr.on('data', chunk => { error = (error + chunk).slice(-4096); });
    child.on('close', code => {
      if (code !== 0) return finish(new Error(error.trim() || `Native process exited ${code}`));
      try {
        const state = JSON.parse(output.trim());
        if (typeof state.enabled !== 'boolean' || !Number.isInteger(state.windowCount) || state.windowCount < 1 || (action === 'set' && state.enabled !== enabled)) throw new Error('Invalid native state');
        finish(null, state);
      } catch (err) { finish(err); }
    });
  });
}
function ipv4(value) { const p = value.split('.'); return p.length === 4 && p[0] === '127' && p.every(s => /^\d{1,3}$/.test(s) && Number(s) <= 255); }
export function isTrustedRequest(req) {
  const remote = (req.socket?.remoteAddress || '').toLowerCase();
  if (!(remote === '::1' || ipv4(remote) || (remote.startsWith('::ffff:') && ipv4(remote.slice(7))))) return false;
  try {
    const host = new URL('http://' + req.headers.host);
    if (!(host.hostname === 'localhost' || host.hostname === '[::1]' || ipv4(host.hostname)) || host.username || host.password) return false;
    const origin = req.headers.origin;
    // Electron's local application protocol is forwarded through its loopback bridge.
    if (origin === 'dsh-app://app') return true;
    if (req.headers['sec-fetch-site'] === 'cross-site') return false;
    if (origin === undefined) return true;
    const parsed = new URL(origin);
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.host === host.host;
  } catch { return false; }
}
function json(res, status, value) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(value)); }
async function readBody(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw new Error('Content-Type must be application/json');
  let text = '';
  for await (const chunk of req) { text += chunk; if (Buffer.byteLength(text) > 1024) throw new Error('Request body too large'); }
  const body = JSON.parse(text);
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || typeof body.enabled !== 'boolean') throw new Error('Expected {"enabled": boolean}');
  return body.enabled;
}
export function apply(ctx, config = {}) {
  const executablePath = config.executablePath || process.env.DSH_PINTOP_EXECUTABLE || DEFAULT_EXECUTABLE;
  let queue = Promise.resolve();
  const handler = async (req, res) => {
    if (!isTrustedRequest(req)) return json(res, 403, { error: 'Only local same-origin requests are allowed' });
    if (!['GET', 'POST'].includes(req.method)) { res.setHeader('allow', 'GET, POST'); return json(res, 405, { error: 'Use GET or POST' }); }
    let enabled;
    if (req.method === 'POST') { try { enabled = await readBody(req); } catch (err) { return json(res, 400, { error: err.message }); } }
    const operation = queue.then(() => runNative(req.method === 'GET' ? 'get' : 'set', enabled, executablePath));
    queue = operation.catch(() => {});
    try { json(res, 200, await operation); } catch (err) { json(res, 503, { error: err.message }); }
  };
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/api/dsh-pintop', handler }), 'dsh-pintop: native window route');
}
