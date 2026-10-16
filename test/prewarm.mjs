import assert from 'node:assert/strict';
import { apply, runNative, closeNative } from '../lib/index.js';
const original = await runNative();
closeNative();
let dispose;
try {
  apply({ effect: fn => { dispose = fn(); }, webServer: { register: () => () => {} } });
  // Simulate the time spent rendering/opening the app before the first click.
  await new Promise(resolve => setTimeout(resolve, 6000));
  const start = performance.now();
  const actual = await runNative();
  const readMs = Math.round(performance.now() - start);
  assert.equal(actual.enabled, original.enabled, 'Warmup must never change topmost state');
  const click = performance.now();
  assert.equal((await runNative('set', !original.enabled)).enabled, !original.enabled);
  console.log(JSON.stringify({ warmupPreservedState: true, firstReadAfterPrewarmMs: readMs, firstToggleAfterPrewarmMs: Math.round(performance.now() - click) }));
} finally {
  try { await runNative('set', original.enabled); } finally { dispose?.(); closeNative(); }
}
