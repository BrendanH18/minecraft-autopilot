import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPlayable, normalizeAction } from '../src/protocol.js';

const player = { health: 20 };

test('takeover accepts only the pause menu opened by switching away from the game', () => {
  assert.doesNotThrow(() => assertPlayable({ connected: true, paused: false, player }));
  assert.doesNotThrow(() => assertPlayable({ connected: true, paused: true, focusPaused: true, player }));
  assert.throws(() => assertPlayable({ connected: true, paused: true, focusPaused: false, player }), /paused/);
  assert.throws(() => assertPlayable({ connected: true, paused: true, player }), /paused/);
  assert.throws(() => assertPlayable({ connected: true, paused: true, focusPaused: true, player: { health: 0 } }), /dead/);
});

test('deposit actions name an item, default to everything held, with bounded counts', async () => {
  assert.deepEqual(normalizeAction({ type: 'deposit', item: 'oak_log' }), { type: 'deposit', item: 'minecraft:oak_log' });
  assert.deepEqual(normalizeAction({ type: 'deposit', item: 'minecraft:sand', count: 2304 }), { type: 'deposit', item: 'minecraft:sand', count: 2304 });
  for (const count of [0, 2305, 1.5]) assert.throws(() => normalizeAction({ type: 'deposit', item: 'oak_log', count }));
  assert.throws(() => normalizeAction({ type: 'deposit', item: 'Oak Log' }));
});


test('storage inspection is bounded to an action with no model-supplied fields', async () => {
  assert.deepEqual(normalizeAction({ type: 'inspect_storage' }), { type: 'inspect_storage' });
  assert.throws(() => normalizeAction({ type: 'inspect_storage', x: 100 }));
});
