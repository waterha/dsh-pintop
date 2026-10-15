import assert from 'node:assert/strict';
import { runNative } from '../lib/index.js';
const original = await runNative();
console.log('Original:', original);
try {
  assert.equal((await runNative('set', true)).enabled, true);
  assert.equal((await runNative()).enabled, true);
  console.log('Verified native WS_EX_TOPMOST enabled');
  assert.equal((await runNative('set', false)).enabled, false);
  assert.equal((await runNative()).enabled, false);
  console.log('Verified native WS_EX_TOPMOST disabled');
} finally {
  const restored = await runNative('set', original.enabled);
  assert.equal(restored.enabled, original.enabled);
  console.log('Restored original state:', restored);
}
