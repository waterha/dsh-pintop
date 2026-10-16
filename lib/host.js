import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const name = 'dsh-pintop';
export const inject = ['webServer'];
export const DEFAULT_EXECUTABLE = 'C:\\Sofware\\dsh\\DeepSeek Harness.exe';
const scriptPath = fileURLToPath(new URL('../native/pintop.ps1', import.meta.url));
const MAX_PENDING = 32;
const REQUEST_TIMEOUT = 8000;

function validate(action, enabled, executablePath) {
  if (!['get', 'set'].includes(action) || (action === 'set' && typeof enabled !== 'boolean')) throw new Error('Invalid native operation');
  if (!path.win32.isAbsolute(executablePath) || path.win32.basename(executablePath).toLowerCase() !== 'deepseek harness.exe') throw new Error('Invalid configured DeepSeek Harness executable path');
  if (process.platform !== 'win32') throw new Error('Window pinning requires Windows');
}

class NativeWorker {
  constructor(executablePath) {
    this.executablePath = executablePath;
    this.child = null;
    this.buffer = '';
    this.pending = [];
    this.starting = null;
    this.closed = false;
  }
  start() {
    if (this.child) return Promise.resolve();
    if (this.starting) return this.starting;
    this.buffer = ''; this.stderr = '';
    this.starting = new Promise((resolve, reject) => {
      const child = spawn('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', scriptPath, '-ExecutablePath', this.executablePath], { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
      let settled = false;
      const fail = err => { if (!settled) { settled = true; if (this.child === child) this.child = null; reject(err); } };
      child.once('error', err => { if (this.child === child) this.terminate(err); fail(err); });
      child.once('spawn', () => { if (!settled) { settled = true; resolve(); } });
      child.stdin.on('error', err => { if (this.child === child) this.terminate(err); });
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', chunk => { if (this.child === child) this.onOutput(chunk); });
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', chunk => { if (this.child === child) this.stderr = ((this.stderr || '') + chunk).slice(-4096); });
      child.once('close', code => {
        if (this.child !== child) return;
        this.child = null;
        const error = new Error((this.stderr || '').trim() || `Native worker exited ${code ?? 'unexpectedly'}`);
        const pending = this.pending.splice(0);
        for (const item of pending) { clearTimeout(item.timer); item.reject(error); }
      });
      this.child = child;
    }).finally(() => { this.starting = null; });
    return this.starting;
  }
  terminate(reason = new Error('Native worker exited')) {
    const child = this.child;
    this.child = null;
    this.buffer = ''; this.stderr = '';
    for (const item of this.pending.splice(0)) { clearTimeout(item.timer); item.reject(reason); }
    if (child) { child.stdin.destroy(); child.kill(); }
  }
  onOutput(chunk) {
    this.buffer += chunk;
    if (this.buffer.length > 65536) return this.dispose(new Error('Native worker output limit exceeded'));
    let index;
    while ((index = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, index).trim(); this.buffer = this.buffer.slice(index + 1);
      if (!line) continue;
      const item = this.pending.shift();
      if (!item) return this.dispose(new Error('Unexpected native worker output'));
      clearTimeout(item.timer);
      try {
        const value = JSON.parse(line);
        if (!value || value.ok !== true || typeof value.enabled !== 'boolean' || !Number.isInteger(value.windowCount) || value.windowCount < 1) throw new Error(value?.error || 'Invalid native state');
        if (item.action === 'set' && value.enabled !== item.enabled) throw new Error('Native worker returned unexpected state');
        item.resolve({ enabled: value.enabled, windowCount: value.windowCount });
      } catch (err) { item.reject(err); }
    }
  }
  request(action, enabled) {
    if (this.closed) return Promise.reject(new Error('Native worker is closed'));
    if (this.pending.length >= MAX_PENDING) return Promise.reject(new Error('Native request queue is full'));
    return this.start().then(() => new Promise((resolve, reject) => {
      if (this.closed || !this.child) return reject(new Error('Native worker is closed'));
      if (this.pending.length >= MAX_PENDING) return reject(new Error('Native request queue is full'));
      const item = { action, enabled, resolve, reject, timer: null };
      item.timer = setTimeout(() => {
        this.terminate(new Error('Native window operation timed out'));
      }, REQUEST_TIMEOUT);
      this.pending.push(item);
      try {
        this.child.stdin.write(JSON.stringify({ action, ...(action === 'set' ? { enabled } : {}) }) + '\n');
      } catch (err) { clearTimeout(item.timer); this.pending.splice(this.pending.indexOf(item), 1); reject(err); }
    }));
  }
  dispose(reason = new Error('Native worker closed')) {
    this.closed = true;
    for (const item of this.pending.splice(0)) { clearTimeout(item.timer); item.reject(reason); }
    if (this.child) { this.child.stdin.destroy(); this.child.kill(); this.child = null; }
    this.buffer = '';
  }
}

let singleton;
export function runNative(action = 'get', enabled, executablePath = DEFAULT_EXECUTABLE) {
  try { validate(action, enabled, executablePath); } catch (err) { return Promise.reject(err); }
  if (!singleton || singleton.executablePath !== executablePath || singleton.closed) {
    singleton?.dispose(new Error('Native worker replaced'));
    singleton = new NativeWorker(executablePath);
  }
  return singleton.request(action, enabled);
}
export function closeNative() { singleton?.dispose(); singleton = undefined; }

function ipv4(value) { const p = value.split('.'); return p.length === 4 && p[0] === '127' && p.every(s => /^\d{1,3}$/.test(s) && Number(s) <= 255); }
export function isTrustedRequest(req) {
  const remote = (req.socket?.remoteAddress || '').toLowerCase();
  if (!(remote === '::1' || ipv4(remote) || (remote.startsWith('::ffff:') && ipv4(remote.slice(7))))) return false;
  try {
    const host = new URL('http://' + req.headers.host);
    if (!(host.hostname === 'localhost' || host.hostname === '[::1]' || ipv4(host.hostname)) || host.username || host.password) return false;
    const origin = req.headers.origin;
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
  let text = ''; for await (const chunk of req) { text += chunk; if (Buffer.byteLength(text) > 1024) throw new Error('Request body too large'); }
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
    let enabled; if (req.method === 'POST') { try { enabled = await readBody(req); } catch (err) { return json(res, 400, { error: err.message }); } }
    const operation = queue.then(() => runNative(req.method === 'GET' ? 'get' : 'set', enabled, executablePath)); queue = operation.catch(() => {});
    try { json(res, 200, await operation); } catch (err) { json(res, 503, { error: err.message }); }
  };
  ctx.effect(() => {
    const disposeRoute = ctx.webServer.register({ kind: 'exact', path: '/api/dsh-pintop', handler });
    // Start compiling interop during plugin load, before the first button click.
    // A missing startup window is harmless: the worker remains compiled and
    // the next request discovers the window again. Never change topmost here.
    const warmup = setTimeout(() => {
      queue = queue.then(() => runNative('get', undefined, executablePath)).catch(() => {});
    }, 0);
    return () => { clearTimeout(warmup); closeNative(); disposeRoute?.(); };
  }, 'dsh-pintop: native window route');
}
