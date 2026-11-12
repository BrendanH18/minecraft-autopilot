import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPARE_ROUTINES_COMMANDS, compareRoutines } from '../src/routine-compare.js';
import { beforeRoutine, afterRoutine, compareFixtures } from './routine-batch8-fixtures.js';

test('all 25 routine comparisons have independent expected results and preserve inputs', () => {
  assert.equal(COMPARE_ROUTINES_COMMANDS.length, 25); assert.equal(Object.keys(compareFixtures).length, 25);
  const original = JSON.stringify([beforeRoutine, afterRoutine]);
  for (const [signature] of COMPARE_ROUTINES_COMMANDS) {
    const name = signature.split(' ')[0], [args, verify] = compareFixtures[name];
    verify(compareRoutines(beforeRoutine, afterRoutine, name, ...args));
  }
  assert.equal(JSON.stringify([beforeRoutine, afterRoutine]), original);
});

test('canonical normalization, multiplicity, suffixes, and insertion alignment', () => {
  const a = [{ type: 'wait', seconds: 1 }, { type: 'wait', seconds: 1 }, { type: 'collect', block: 'oak_log', count: 1 }];
  const b = [{ type: 'eat' }, { type: 'wait', seconds: 1 }, { type: 'collect', block: 'minecraft:oak_log', count: 1 }];
  assert.equal(compareRoutines(a, b, 'suffix').steps, 2);
  assert.deepEqual(compareRoutines(a, b, 'removed-actions').actions, [{ action: { type: 'wait', seconds: 1 }, count: 1 }]);
  assert.deepEqual(compareRoutines(a, b, 'edit-script').retained.map(p => [p.beforeStep, p.afterStep]), [[2, 2], [3, 3]]);
  assert.equal(compareRoutines(a, a, 'first-divergence').change, null);
  assert.equal(compareRoutines(a, a, 'last-divergence').change, null);
  assert.equal(compareRoutines([{ type: 'eat' }], [{ type: 'eat' }], 'altitude-envelope').before, null);
  const unpaired = compareRoutines(beforeRoutine, [{ type: 'eat' }], 'destination-pairs');
  assert.deepEqual(unpaired.pairs.map(p => [p.after, p.distance, p.displacement]), [[null, null, null], [null, null, null]]);
});

test('invalid routines and ceilings are refused; exceeded budgets do not pass', () => {
  for (const args of [['-1', '2', '0'], ['1.5', '2', '0'], ['1', 'NaN', '0'], ['', '2', '0']]) assert.throws(() => compareRoutines(beforeRoutine, afterRoutine, 'budget', ...args));
  assert.equal(compareRoutines(beforeRoutine, afterRoutine, 'budget', '0', '2', '0').passes, false);
  assert.throws(() => compareRoutines([], afterRoutine, 'prefix'));
  assert.throws(() => compareRoutines(beforeRoutine, [{ type: 'goto', x: 0, y: 999, z: 0 }], 'prefix'));
  assert.throws(() => compareRoutines(beforeRoutine, afterRoutine, 'unknown'));
});
