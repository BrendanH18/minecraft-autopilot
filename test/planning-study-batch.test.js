import test from 'node:test';
import assert from 'node:assert/strict';
import { runBatch, runCompare } from '../src/planning-study-batch.js';
import { changesBetween, validateRequest, resolvePlanner } from '../src/planning-study-common.js';

test('batch calculates independent stock scenarios in source order without mutating input', () => {
  const request = {
    cases: [
      ['10', '5', '3'],
      ['2', '0', '4'],
    ],
  };
  const original = structuredClone(request);
  assert.deepEqual(runBatch('replenish', 'inventory-position', request), {
    cases: [
      { case: 1, args: ['10', '5', '3'], result: 12 },
      { case: 2, args: ['2', '0', '4'], result: -2 },
    ],
  });
  assert.deepEqual(request, original);
});

test('comparison reports numeric leaf deltas against one baseline', () => {
  const request = {
    baseline: ['0,1', '3,2'],
    candidates: [
      ['0,1', '2,2'],
      ['0,1', '3,2'],
    ],
  };
  const original = structuredClone(request);
  const output = runCompare('queueplan', 'fcfs', request);
  assert.deepEqual(output.baseline, {
    args: ['0,1', '3,2'],
    result: [
      { start: 0, finish: 3, wait: 0 },
      { start: 3, finish: 5, wait: 2 },
    ],
  });
  assert.deepEqual(output.candidates[0].changes, [
    { path: '/0/finish', before: 3, after: 2, delta: -1 },
    { path: '/1/start', before: 3, after: 2, delta: -1 },
    { path: '/1/finish', before: 5, after: 4, delta: -1 },
    { path: '/1/wait', before: 2, after: 1, delta: -1 },
  ]);
  assert.deepEqual(output.candidates[1].changes, []);
  assert.deepEqual(request, original);
});

test('result differences preserve shape changes, missing nulls and escaped pointers', () => {
  assert.deepEqual(changesBetween({ 'a/b~': null, retained: true }, { retained: false, added: null }), [
    { path: '/a~1b~0', before: null, after: null, afterPresent: false },
    { path: '/retained', before: true, after: false },
    { path: '/added', before: null, after: null, beforePresent: false },
  ]);
  assert.deepEqual(changesBetween([], {}), [{ path: '', before: [], after: {} }]);
  assert.deepEqual(changesBetween([1, 2], [1]), [{ path: '/1', before: 2, after: null, afterPresent: false }]);
  assert.throws(() => changesBetween(-Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER), /delta/);
  assert.throws(() => changesBetween(Array(10_001).fill(1), Array(10_001).fill(2)), /result nodes/);
});

test('batch and compare reject malformed requests and failed cases atomically', () => {
  for (const request of [
    null,
    [],
    {},
    { cases: [] },
    { cases: [1] },
    { cases: [['NaN', '0', '0']] },
    { cases: [['1', '0', '0']], ignored: true },
    { cases: Array(101).fill(['1', '0', '0']) },
  ]) {
    assert.throws(() => runBatch('replenish', 'inventory-position', request));
  }
  assert.throws(
    () => runBatch('missing', 'inventory-position', { cases: [['1', '0', '0']] }),
    /Unknown planning group/,
  );
  assert.throws(() => resolvePlanner('replenish', 'missing'), /Unknown replenish command/);
  assert.throws(() =>
    runCompare('replenish', 'inventory-position', {
      baseline: ['1', '0', '0'],
      candidates: [
        ['2', '0', '0'],
        ['NaN', '0', '0'],
      ],
    }),
  );
  assert.throws(() => runCompare('replenish', 'inventory-position', { candidates: [['1', '0', '0']] }));
});

test('requests enforce JSON, byte, nesting and aggregate CSV entry bounds', () => {
  const cyclic = {};
  cyclic.self = cyclic;
  for (const request of [
    cyclic,
    { invalid: undefined },
    { invalid: NaN },
    { invalid: new Date() },
    { large: 'x'.repeat(1_000_001) },
    { many: Array(11).fill(Array(1000).fill('1').join(',')) },
  ]) {
    assert.throws(() => validateRequest(request));
  }
  // JSON arrays are dense: holes and extra array properties are refused before
  // any JSON.stringify, so a huge sparse array fails fast instead of expanding.
  const extra = [['1', '2', '3']];
  extra.note = 'x';
  for (const request of [
    { cases: [, ['1', '2', '3']] },
    { cases: [['1', , '3']] },
    { cases: Array(2) },
    { cases: Array(1e9) },
    { cases: extra },
  ]) {
    assert.throws(() => validateRequest(request), /JSON values only/);
  }
  assert.throws(
    () => runBatch('replenish', 'inventory-position', { cases: [['10', '5', '3'], , ['2', '0', '4']] }),
    /JSON values only/,
  );
  let deep = 0;
  for (let i = 0; i < 25; i++) deep = [deep];
  assert.throws(() => validateRequest({ deep }), /depth/);
  assert.deepEqual(validateRequest({ cases: [['1', '2', '3']] }), { cases: [['1', '2', '3']] });
});
