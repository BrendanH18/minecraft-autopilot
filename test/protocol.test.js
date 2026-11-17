import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPlayable, normalizeAction } from '../src/protocol.js';

const player = { health: 20 };

test('takeover accepts only the pause menu opened by switching away from the game', () => {
  assert.doesNotThrow(() => assertPlayable({ connected: true, paused: false, player }));
  assert.doesNotThrow(() => assertPlayable({ connected: true, paused: true, focusPaused: true, player }));
  assert.throws(() => assertPlayable({ connected: true, paused: true, focusPaused: false, player }), /paused/);
  assert.throws(() => assertPlayable({ connected: true, paused: true, player }), /paused/);
  assert.throws(
    () => assertPlayable({ connected: true, paused: true, focusPaused: true, player: { health: 0 } }),
    /dead/,
  );
});

test('deposit actions name an item, default to everything held, with bounded counts', async () => {
  assert.deepEqual(normalizeAction({ type: 'deposit', item: 'oak_log' }), {
    type: 'deposit',
    item: 'minecraft:oak_log',
  });
  assert.deepEqual(normalizeAction({ type: 'deposit', item: 'minecraft:sand', count: 2304 }), {
    type: 'deposit',
    item: 'minecraft:sand',
    count: 2304,
  });
  for (const count of [0, 2305, 1.5]) assert.throws(() => normalizeAction({ type: 'deposit', item: 'oak_log', count }));
  assert.throws(() => normalizeAction({ type: 'deposit', item: 'Oak Log' }));
});

test('storage inspection is bounded to an action with no model-supplied fields', async () => {
  assert.deepEqual(normalizeAction({ type: 'inspect_storage' }), { type: 'inspect_storage' });
  assert.throws(() => normalizeAction({ type: 'inspect_storage', x: 100 }));
});

test('scoped storage inspection names 1 to 16 integer block positions and nothing else', () => {
  const containers = [
    { x: 3, y: 64, z: -2 },
    { x: -29_999_984, y: -64, z: 29_999_984 },
  ];
  assert.deepEqual(normalizeAction({ type: 'inspect_storage', containers }), { type: 'inspect_storage', containers });
  const many = Array.from({ length: 16 }, (_, x) => ({ x, y: 64, z: 0 }));
  assert.equal(normalizeAction({ type: 'inspect_storage', containers: many }).containers.length, 16);
  for (const invalid of [
    [],
    [...many, { x: 16, y: 64, z: 0 }],
    [{ x: 1.5, y: 64, z: 0 }],
    [{ x: 0, y: 321, z: 0 }],
    [{ x: 0, y: 64 }],
    [{ x: 0, y: 64, z: 0, name: 'minecraft:chest' }],
    { x: 0, y: 64, z: 0 },
    'all',
  ]) {
    assert.throws(
      () => normalizeAction({ type: 'inspect_storage', containers: invalid }),
      undefined,
      JSON.stringify(invalid),
    );
  }
});
