import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import vm from 'node:vm';
import { isTrustedRequest, apply, runNative } from '../lib/index.js';
const root = new URL('../', import.meta.url);
test('package contains standalone host/client/native/bundle', async () => {
  const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  assert.equal(pkg.name, 'dsh-pintop');
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml');
  assert.equal(pkg.dsh.client.platform, 'web');
  assert.equal(pkg.dependencies, undefined);
  for (const f of [pkg.exports['.'], pkg.exports['./client'], 'native/pintop.ps1', pkg.dsh.bundle.patch]) await access(new URL(f, root));
  assert.match(await readFile(new URL('cordis.patch.yml', root), 'utf8'), /name: dsh-pintop/);
});
test('loopback and browser origin fence', () => {
  const req = (headers = {}, remoteAddress = '127.0.0.1') => ({ socket: { remoteAddress }, headers: { host: '127.0.0.1:19387', ...headers } });
  assert.equal(isTrustedRequest(req()), true);
  assert.equal(isTrustedRequest(req({ origin: 'http://127.0.0.1:19387' })), true);
  assert.equal(isTrustedRequest(req({ origin: 'dsh-app://app', 'sec-fetch-site': 'cross-site' })), true);
  assert.equal(isTrustedRequest(req({ origin: 'https://evil.test' })), false);
  assert.equal(isTrustedRequest(req({ host: 'evil.test' })), false);
  assert.equal(isTrustedRequest(req({}, '192.168.1.4')), false);
  assert.equal(isTrustedRequest(req({ origin: 'null' })), false);
  assert.equal(isTrustedRequest(req({ 'sec-fetch-site': 'cross-site' })), false);
});
test('host route registration and disposal', () => {
  let route, disposed = false;
  apply({ effect: fn => { const dispose = fn(); dispose(); }, webServer: { register: value => { route = value; return () => { disposed = true; }; } } });
  assert.equal(route.kind, 'exact'); assert.equal(route.path, '/api/dsh-pintop'); assert.equal(disposed, true);
});
test('invalid operations never invoke native helper', async () => {
  await assert.rejects(runNative('set', 'true'), /Invalid native operation/);
  await assert.rejects(runNative('get', undefined, 'C:\\Windows\\notepad.exe'), /Invalid configured/);
});
test('client loader exports and footer slot contract', async () => {
  let loaded;
  vm.runInNewContext(await readFile(new URL('lib/client.js', root), 'utf8'), { window: { __ModuleLoader__: { load: x => { loaded = x; } } } });
  assert.equal(loaded.id, 'dsh-pintop');
  const plugin = loaded.factory(id => { assert.equal(id, 'react'); return {}; });
  assert.deepEqual(Array.from(plugin.inject), ['slots', 'locale']);
  let registered;
  plugin.apply({ effect: fn => fn(), locale: { register: (ns, dict) => { assert.equal(ns, 'dsh-pintop'); assert.equal(dict.en.pin, 'Pin window'); assert.equal(dict.zh.pin, '窗口置顶'); return () => {}; } }, slots: { inject: (slot, fn) => { assert.equal(slot, 'sidebar.footer.action'); fn(); }, register: (meta, component) => { registered = { meta, component }; } } });
  assert.equal(registered.meta.id, 'dsh-pintop'); assert.equal(typeof registered.component, 'function');
});
