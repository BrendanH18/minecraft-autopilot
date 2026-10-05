import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPlayable } from '../src/protocol.js';

const player = { health: 20 };

test('takeover accepts only the pause menu opened by switching away from the game', () => {
  assert.doesNotThrow(() => assertPlayable({ connected: true, paused: false, player }));
  assert.doesNotThrow(() => assertPlayable({ connected: true, paused: true, focusPaused: true, player }));
  assert.throws(() => assertPlayable({ connected: true, paused: true, focusPaused: false, player }), /paused/);
  assert.throws(() => assertPlayable({ connected: true, paused: true, player }), /paused/);
  assert.throws(() => assertPlayable({ connected: true, paused: true, focusPaused: true, player: { health: 0 } }), /dead/);
});
