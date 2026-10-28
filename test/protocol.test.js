import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPlayable, normalizeAction } from '../src/protocol.js';
import { FabricAdapter } from '../src/fabric-adapter.js';

const player = { health: 20 };

test('takeover accepts only the pause menu opened by switching away from the game', () => {
  assert.doesNotThrow(() => assertPlayable({ connected: true, paused: false, player }));
  assert.doesNotThrow(() => assertPlayable({ connected: true, paused: true, focusPaused: true, player }));
  assert.throws(() => assertPlayable({ connected: true, paused: true, focusPaused: false, player }), /paused/);
  assert.throws(() => assertPlayable({ connected: true, paused: true, player }), /paused/);
  assert.throws(() => assertPlayable({ connected: true, paused: true, focusPaused: true, player: { health: 0 } }), /dead/);
});

test('deposit actions name an item, default to everything held, and are refused before reaching the Fabric mod', async () => {
  assert.deepEqual(normalizeAction({ type: 'deposit', item: 'oak_log' }), { type: 'deposit', item: 'minecraft:oak_log' });
  assert.deepEqual(normalizeAction({ type: 'deposit', item: 'minecraft:sand', count: 2304 }), { type: 'deposit', item: 'minecraft:sand', count: 2304 });
  for (const count of [0, 2305, 1.5]) assert.throws(() => normalizeAction({ type: 'deposit', item: 'oak_log', count }));
  assert.throws(() => normalizeAction({ type: 'deposit', item: 'Oak Log' }));
  // An unroutable URL proves the guard runs before any bridge request.
  const adapter = new FabricAdapter({ backend: 'fabric', url: 'http://127.0.0.1:9/', token: 'x'.repeat(32), protocol: 1 });
  await assert.rejects(adapter.execute({ type: 'deposit', item: 'oak_log' }), /Fabric mod does not support them yet/);
});
