import test from 'node:test';
import assert from 'node:assert/strict';
import { SELECT_ROUTINE_COMMANDS, selectRoutine } from '../src/routine-select.js';
import { parseRoutine } from '../../../src/routine.js';
import { beforeRoutine, selectFixtures } from './routine-batch8-fixtures.js';

test('25 selections produce independently expected actions in source order', () => {
  assert.equal(SELECT_ROUTINE_COMMANDS.length, 25);
  assert.equal(Object.keys(selectFixtures).length, 25);
  const original = JSON.stringify(beforeRoutine);
  for (const [signature] of SELECT_ROUTINE_COMMANDS) {
    const name = signature.split(' ')[0],
      [args, steps] = selectFixtures[name];
    const result = selectRoutine(beforeRoutine, name, ...args);
    assert.deepEqual(
      result.actions,
      steps.map((i) => beforeRoutine[i - 1]),
      name,
    );
    assert.deepEqual(parseRoutine(JSON.stringify(result)), result.actions);
  }
  assert.equal(JSON.stringify(beforeRoutine), original);
});

test('contexts merge, wait intervals are half-open, and home windows respect definitions', () => {
  assert.deepEqual(selectRoutine(beforeRoutine, 'match-context', 'collect', '5', '5').actions, beforeRoutine);
  assert.deepEqual(selectRoutine(beforeRoutine, 'wait-window', '2', '5').actions, [beforeRoutine[9]]);
  const source = [
    { type: 'set_home' },
    { type: 'eat' },
    { type: 'set_home' },
    { type: 'wait', seconds: 1 },
    { type: 'home' },
  ];
  assert.deepEqual(selectRoutine(source, 'home-section', '2').actions, source.slice(2));
  assert.deepEqual(selectRoutine(source, 'dependency-window', '4', '5').actions, source.slice(2));
  assert.deepEqual(selectRoutine(source, 'dependency-window', '3', '5').actions, source.slice(2));
  // A missing definition is a runtime prerequisite, not an invented action.
  assert.deepEqual(selectRoutine([{ type: 'eat' }, { type: 'home' }], 'dependency-window', '2', '2').actions, [
    { type: 'home' },
  ]);
});

test('selectors reject empty matches, malformed parameters, and invalid input routines', () => {
  const cases = [
    ['item', 'coal'],
    ['types', 'unknown'],
    ['before-match', 'set_home', '1'],
    ['after-match', 'home', '1'],
    ['nth-type', 'goto', '3'],
    ['indices', '0'],
    ['indices', '2', '2'],
    ['exclude-indices', ...beforeRoutine.map((_, i) => String(i + 1))],
    ['every-nth', '1', '0'],
    ['goto-chunk', '0.5', '0'],
    ['goto-sphere', '0,64,0', '-1'],
    ['collect-range', '8', '7'],
    ['wait-window', '2', '2'],
    ['wait-window', '', '3'],
    ['home-section', '2'],
    ['collection-cycle', 'dirt', '1'],
    ['dependency-window', '5', '4'],
    ['between-types', 'home', 'set_home'],
  ];
  for (const [name, ...args] of cases) assert.throws(() => selectRoutine(beforeRoutine, name, ...args), name);
  assert.throws(() => selectRoutine([], 'types', 'eat'));
  assert.throws(() => selectRoutine(beforeRoutine, 'unknown'));
  assert.throws(() => selectRoutine(beforeRoutine, 'goto-box', '0,999,0', '1,1,1'));
});
