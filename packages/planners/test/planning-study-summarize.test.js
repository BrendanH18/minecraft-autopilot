import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { runSummarize } from '../src/planning-study-summarize.js';
import { calculateStudy } from '../src/planning-studies.js';
import { PLANNING_GROUPS } from '../src/planning-tools.js';
import { CLI_PATH } from './cli-path.js';

function deepFreeze(value) {
  if (value !== null && typeof value === 'object') Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

// Temporary planner `vector summarize-pick <index>`: returns results[index] and
// counts evaluations, so any JSON result shape and any score can be supplied.
function withResults(results, run) {
  const group = PLANNING_GROUPS.find((group) => group.name === 'vector');
  const counter = { calls: 0 };
  const fixture = {
    signature: 'summarize-pick <index>',
    types: ['c'],
    run: (index) => {
      counter.calls++;
      return results[index];
    },
  };
  group.commands.push(fixture);
  const pick = (indexes, options = {}) =>
    runSummarize('vector', 'summarize-pick', { cases: indexes.map((index) => [index]), ...options });
  try {
    return run(pick, counter);
  } finally {
    group.commands.splice(group.commands.indexOf(fixture), 1);
  }
}

test('summarize reports distinct values, statistics and source rows for excavation volumes', () => {
  const request = deepFreeze({
    cases: [
      [2, 3, 4],
      [2, 2, 3],
      [3, 2, 2],
      [1, 1, 5],
    ],
  });
  const before = structuredClone(request);
  const report = runSummarize('tunnel', 'excavate', request);
  // width × height × length: 24, 12, 12 and 5 cells.
  assert.deepEqual(report, {
    path: '',
    measure: 'value',
    total: 4,
    scoreType: 'number',
    values: [
      { value: 5, count: 1, cases: [4] },
      { value: 12, count: 2, cases: [2, 3] },
      { value: 24, count: 1, cases: [1] },
    ],
    // Sorted 5, 12, 12, 24: the median is 12 + (12 - 12) / 2 and the mean is 53 / 4.
    statistics: { minimum: 5, maximum: 24, range: 19, sum: 53, mean: 13.25, median: 12 },
    cases: [
      { case: 1, args: [2, 3, 4], result: 24, score: 24 },
      { case: 2, args: [2, 2, 3], result: 12, score: 12 },
      { case: 3, args: [3, 2, 2], result: 12, score: 12 },
      { case: 4, args: [1, 1, 5], result: 5, score: 5 },
    ],
  });
  assert.deepEqual(request, before);
  // deepEqual ignores key order, so the documented order is checked separately.
  assert.deepEqual(Object.keys(report), ['path', 'measure', 'total', 'scoreType', 'values', 'statistics', 'cases']);
  assert.deepEqual(Object.keys(report.values[0]), ['value', 'count', 'cases']);
  assert.deepEqual(Object.keys(report.statistics), ['minimum', 'maximum', 'range', 'sum', 'mean', 'median']);
  assert.deepEqual(Object.keys(report.cases[0]), ['case', 'args', 'result', 'score']);
  // Argument rows are copies, so editing a report cannot reach the request.
  assert.notEqual(report.cases[0].args, request.cases[0]);

  const study = calculateStudy('summarize', 'tunnel', 'excavate', request);
  assert.deepEqual(Object.keys(study), [
    'workflow',
    'group',
    'command',
    'path',
    'measure',
    'total',
    'scoreType',
    'values',
    'statistics',
    'cases',
    'note',
    'plannerNote',
  ]);
  const { workflow, group, command, note, plannerNote, ...data } = study;
  assert.deepEqual([workflow, group, command], ['summarize', 'tunnel', 'excavate']);
  assert.deepEqual(data, report);
  assert.match(note, /Offline/);
  assert.equal(typeof plannerNote, 'string');
  assert.deepEqual(request, before);
});

test('summarize sorts distinct numbers numerically and keeps cases in source order', () => {
  // Volumes 100, 9, 10, 9, 100, 9: text order would put 10 and 100 before 9.
  const rows = [
    [4, 5, 5],
    [1, 3, 3],
    [1, 2, 5],
    [3, 3, 1],
    [10, 10, 1],
    [9, 1, 1],
  ];
  const even = runSummarize('tunnel', 'excavate', { cases: rows });
  assert.deepEqual(even.values, [
    { value: 9, count: 3, cases: [2, 4, 6] },
    { value: 10, count: 1, cases: [3] },
    { value: 100, count: 2, cases: [1, 5] },
  ]);
  assert.deepEqual(
    even.cases.map((row) => [row.case, row.args, row.score]),
    [
      [1, [4, 5, 5], 100],
      [2, [1, 3, 3], 9],
      [3, [1, 2, 5], 10],
      [4, [3, 3, 1], 9],
      [5, [10, 10, 1], 100],
      [6, [9, 1, 1], 9],
    ],
  );
  // Sorted 9, 9, 9, 10, 100, 100: the median is 9 + (10 - 9) / 2.
  assert.deepEqual(even.statistics, { minimum: 9, maximum: 100, range: 91, sum: 237, mean: 39.5, median: 9.5 });
  // Sorted 9, 9, 10, 100, 100: the median is the third score.
  const odd = runSummarize('tunnel', 'excavate', { cases: rows.slice(0, 5) });
  assert.deepEqual(odd.statistics, { minimum: 9, maximum: 100, range: 91, sum: 228, mean: 45.6, median: 10 });
  assert.deepEqual(
    odd.values.map((entry) => [entry.value, entry.cases]),
    [
      [9, [2, 4]],
      [10, [3]],
      [100, [1, 5]],
    ],
  );
  // One case is its own minimum, maximum, sum, mean and median.
  const single = runSummarize('tunnel', 'excavate', { cases: [[2, 3, 4]] });
  assert.deepEqual(single.values, [{ value: 24, count: 1, cases: [1] }]);
  assert.deepEqual(single.statistics, { minimum: 24, maximum: 24, range: 0, sum: 24, mean: 24, median: 24 });
  // Two cases: the median lies halfway between them.
  assert.equal(
    runSummarize('tunnel', 'excavate', {
      cases: [
        [2, 3, 4],
        [1, 1, 5],
      ],
    }).statistics.median,
    14.5,
  );
});

test('summarize orders negative numbers, both zeros, strings by code unit and booleans', () => {
  withResults([-1, -10, 2.5, -0, 0, -10], (pick) => {
    const report = pick([0, 1, 2, 3, 4, 5]);
    assert.deepEqual(report.values, [
      { value: -10, count: 2, cases: [2, 6] },
      { value: -1, count: 1, cases: [1] },
      { value: 0, count: 2, cases: [4, 5] },
      { value: 2.5, count: 1, cases: [3] },
    ]);
    // Sorted -10, -10, -1, 0, 0, 2.5: the median is -1 + (0 - -1) / 2.
    assert.deepEqual(report.statistics, {
      minimum: -10,
      maximum: 2.5,
      range: 12.5,
      sum: -18.5,
      mean: -18.5 / 6,
      median: -0.5,
    });
    // Strict equality distinguishes -0 from 0, so these prove 0 is reported.
    assert.deepEqual(pick([3, 4]).values, [{ value: 0, count: 2, cases: [1, 2] }]);
    assert.deepEqual(pick([3, 3]).values, [{ value: 0, count: 2, cases: [1, 2] }]);
    assert.deepEqual(pick([3, 3]).statistics, { minimum: 0, maximum: 0, range: 0, sum: 0, mean: 0, median: 0 });
    assert.deepEqual(pick([3, 0]).statistics, { minimum: -1, maximum: 0, range: 1, sum: -1, mean: -0.5, median: -0.5 });
  });
  // Ten tenths sum to exactly 1 with compensated summation; plain addition gives 0.9999999999999999.
  withResults([0.1], (pick) => {
    assert.deepEqual(pick(Array(10).fill(0)).statistics, {
      minimum: 0.1,
      maximum: 0.1,
      range: 0,
      sum: 1,
      mean: 0.1,
      median: 0.1,
    });
  });
  // Code units: '' < '10' < '9' < 'B' < 'Z' < 'a' < 'b' < 'é' (U+00E9) < '😀' (starts U+D83D) < '～' (U+FF5E).
  withResults(['b', 'B', 'a', '10', '9', 'é', 'Z', '', 'a', '～', '😀'], (pick) => {
    const report = pick([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.equal(report.scoreType, 'string');
    assert.equal(report.statistics, null);
    assert.deepEqual(report.values, [
      { value: '', count: 1, cases: [8] },
      { value: '10', count: 1, cases: [4] },
      { value: '9', count: 1, cases: [5] },
      { value: 'B', count: 1, cases: [2] },
      { value: 'Z', count: 1, cases: [7] },
      { value: 'a', count: 2, cases: [3, 9] },
      { value: 'b', count: 1, cases: [1] },
      { value: 'é', count: 1, cases: [6] },
      { value: '😀', count: 1, cases: [11] },
      { value: '～', count: 1, cases: [10] },
    ]);
    assert.deepEqual(
      report.cases.map((row) => row.score),
      ['b', 'B', 'a', '10', '9', 'é', 'Z', '', 'a', '～', '😀'],
    );
  });
  // position <= reorder level: true, false, true. false sorts before true.
  const triggers = runSummarize('replenish', 'order-trigger', {
    cases: [
      [5, 5],
      [6, 5],
      [4, 5],
    ],
  });
  assert.deepEqual(triggers.values, [
    { value: false, count: 1, cases: [2] },
    { value: true, count: 2, cases: [1, 3] },
  ]);
  assert.deepEqual(
    triggers.cases.map((row) => row.score),
    [true, false, true],
  );
});

test('summarize sums with Neumaier compensation in source order and halves the median gap', () => {
  const dot = (pairs, options = {}) =>
    runSummarize('vector', 'dot', {
      cases: pairs.map(([a, b]) => [JSON.stringify([a]), JSON.stringify([b])]),
      path: '/0',
      ...options,
    });
  // Dot products 2,000,001,000,000, 0.1, -2,000,001,000,000 and 0.2: the large integers cancel exactly,
  // so the sum is 0.1 + 0.2, which rounds to 0.30000000000000004. Kahan's adder loses the correction
  // in the cancelling term and returns the plain sum 0.30009765625.
  const big = [1e6, 1e6, 1000],
    negative = [-1e6, -1e6, -1000],
    unit = [1, 0, 0];
  const cancelled = dot([
    [big, big],
    [[0.1, 0, 0], unit],
    [negative, big],
    [[0.2, 0, 0], unit],
  ]);
  assert.deepEqual(
    cancelled.cases.map((row) => row.score),
    [2000001000000, 0.1, -2000001000000, 0.2],
  );
  assert.equal(cancelled.statistics.sum, 0.30000000000000004);
  assert.equal(cancelled.statistics.mean, 0.30000000000000004 / 4);
  // 0.6 + 0.6 + 0.3 is just under 1.5 as doubles, so the exact sum is 2^52 + 1.4999… and the nearest
  // double is 2^52 + 1. Summing in sorted or reversed order adds 1.5 to 2^52 at once and gives 2^52 + 2.
  withResults([0.6, 2 ** 52, 0.3], (pick) => {
    assert.equal(pick([0, 0, 1, 2]).statistics.sum, 2 ** 52 + 1);
    assert.equal(pick([0, 0, 1, 2]).statistics.mean, (2 ** 52 + 1) / 4);
  });
  // Even counts use lower + (upper - lower) / 2. For 0.1 and 0.7 that is 0.1 + 0.3 = 0.4, while
  // (0.1 + 0.7) / 2 is 0.7999999999999999 / 2. For -0.1 and 0.3 it is -0.1 + 0.2 = 0.1, while
  // 0.3 - 0.2 is 0.09999999999999998.
  assert.equal(
    dot([
      [[0.7, 0, 0], unit],
      [[0.1, 0, 0], unit],
    ]).statistics.median,
    0.4,
  );
  assert.equal(
    dot([
      [[0.3, 0, 0], unit],
      [[-0.1, 0, 0], unit],
    ]).statistics.median,
    0.1,
  );
});

test('summarize selects nested paths and string, boolean and null scores', () => {
  // Shortfall to the target in whole packs: 7 -> 2 packs of 4, 8 -> 3 of 3, 0 -> none, 4 -> 1 of 4.
  const orders = {
    cases: [
      [3, 10, 4],
      [2, 10, 3],
      [10, 10, 4],
      [6, 10, 4],
    ],
  };
  const units = runSummarize('replenish', 'review-order', { ...orders, path: '/units' });
  assert.deepEqual([units.path, units.measure, units.total, units.scoreType], ['/units', 'value', 4, 'number']);
  assert.deepEqual(units.values, [
    { value: 0, count: 1, cases: [3] },
    { value: 4, count: 1, cases: [4] },
    { value: 8, count: 1, cases: [1] },
    { value: 9, count: 1, cases: [2] },
  ]);
  assert.deepEqual(units.statistics, { minimum: 0, maximum: 9, range: 9, sum: 21, mean: 5.25, median: 6 });
  assert.deepEqual(units.cases[1], { case: 2, args: [2, 10, 3], result: { packs: 3, units: 9 }, score: 9 });
  const packs = runSummarize('replenish', 'review-order', { ...orders, path: '/packs' });
  assert.deepEqual(
    packs.cases.map((row) => row.score),
    [2, 3, 0, 1],
  );
  assert.deepEqual(packs.statistics, { minimum: 0, maximum: 3, range: 3, sum: 6, mean: 1.5, median: 1.5 });

  // repair cost = units × unit cost against a replacement cost of 5; repair wins the tie at 5.
  const repairs = {
    cases: [
      [10, 2, 5],
      [1, 2, 5],
      [3, 2, 5],
      [5, 1, 5],
    ],
    path: '/choice',
  };
  assert.deepEqual(runSummarize('durability', 'repair-or-replace', repairs), {
    path: '/choice',
    measure: 'value',
    total: 4,
    scoreType: 'string',
    values: [
      { value: 'repair', count: 2, cases: [2, 4] },
      { value: 'replace', count: 2, cases: [1, 3] },
    ],
    statistics: null,
    cases: [
      {
        case: 1,
        args: [10, 2, 5],
        result: { repairCost: 20, replacementCost: 5, choice: 'replace' },
        score: 'replace',
      },
      { case: 2, args: [1, 2, 5], result: { repairCost: 2, replacementCost: 5, choice: 'repair' }, score: 'repair' },
      { case: 3, args: [3, 2, 5], result: { repairCost: 6, replacementCost: 5, choice: 'replace' }, score: 'replace' },
      { case: 4, args: [5, 1, 5], result: { repairCost: 5, replacementCost: 5, choice: 'repair' }, score: 'repair' },
    ],
  });

  const triggers = runSummarize('replenish', 'order-trigger', {
    cases: [
      [6, 5],
      [7, 5],
    ],
  });
  assert.deepEqual([triggers.scoreType, triggers.statistics], ['boolean', null]);
  assert.deepEqual(triggers.values, [{ value: false, count: 2, cases: [1, 2] }]);

  // Closing stock 10 + 0 - 1 and 20 + 0 - 1 never goes negative, so both results are null.
  assert.deepEqual(
    runSummarize('replenish', 'stockout-period', {
      cases: [
        [10, '0', '1'],
        [20, '0', '1'],
      ],
    }),
    {
      path: '',
      measure: 'value',
      total: 2,
      scoreType: 'null',
      values: [{ value: null, count: 2, cases: [1, 2] }],
      statistics: null,
      cases: [
        { case: 1, args: [10, '0', '1'], result: null, score: null },
        { case: 2, args: [20, '0', '1'], result: null, score: null },
      ],
    },
  );

  // Two servers: 3,2,4 ends its third job at 6; 2,2,2 at 4; 1,1,4 at 5.
  const finishes = runSummarize('queueplan', 'parallel-dispatch', {
    cases: [
      ['3,2,4', 2],
      ['2,2,2', 2],
      ['1,1,4', 2],
    ],
    path: '/2/finish',
  });
  assert.deepEqual(
    finishes.values.map((entry) => [entry.value, entry.cases]),
    [
      [4, [2]],
      [5, [3]],
      [6, [1]],
    ],
  );
  assert.deepEqual(finishes.statistics, { minimum: 4, maximum: 6, range: 2, sum: 15, mean: 5, median: 5 });
});

test('summarize measures array, string and object lengths and escaped own keys', () => {
  // Full loads of the capacity, then the remainder: [4,4,2], [10], [2,2,2,2,2], [3].
  const loads = {
    cases: [
      [10, 4],
      [10, 10],
      [10, 2],
      [3, 10],
    ],
  };
  const counts = runSummarize('haul', 'outbound-loads', { ...loads, measure: 'length' });
  assert.deepEqual([counts.path, counts.measure, counts.scoreType], ['', 'length', 'number']);
  assert.deepEqual(counts.values, [
    { value: 1, count: 2, cases: [2, 4] },
    { value: 3, count: 1, cases: [1] },
    { value: 5, count: 1, cases: [3] },
  ]);
  assert.deepEqual(counts.statistics, { minimum: 1, maximum: 5, range: 4, sum: 10, mean: 2.5, median: 2 });
  assert.deepEqual(counts.cases[0], { case: 1, args: [10, 4], result: [4, 4, 2], score: 3 });
  assert.deepEqual(
    runSummarize('haul', 'outbound-loads', { ...loads, path: '/0' }).cases.map((row) => row.score),
    [4, 10, 2, 3],
  );

  // 'replace' has seven UTF-16 units and 'repair' six.
  const words = runSummarize('durability', 'repair-or-replace', {
    cases: [
      [10, 2, 5],
      [1, 2, 5],
      [3, 2, 5],
      [5, 1, 5],
    ],
    path: '/choice',
    measure: 'length',
  });
  assert.deepEqual(words.values, [
    { value: 6, count: 2, cases: [2, 4] },
    { value: 7, count: 2, cases: [1, 3] },
  ]);
  assert.deepEqual(words.statistics, { minimum: 6, maximum: 7, range: 1, sum: 26, mean: 6.5, median: 6.5 });

  // Every review-order result has the two own keys packs and units.
  const fields = runSummarize('replenish', 'review-order', {
    cases: [
      [3, 10, 4],
      [2, 10, 3],
    ],
    measure: 'length',
  });
  assert.deepEqual(fields.values, [{ value: 2, count: 2, cases: [1, 2] }]);
  assert.deepEqual(fields.statistics, { minimum: 2, maximum: 2, range: 0, sum: 4, mean: 2, median: 2 });

  withResults(
    [
      { 'a/b': { '~key': [4, '😀'] }, '': 'root' },
      { 'a/b': { '~key': [2, ''] }, '': 'leaf' },
    ],
    (pick) => {
      assert.deepEqual(pick([0, 1], { path: '/a~1b/~0key/0' }).values, [
        { value: 2, count: 1, cases: [2] },
        { value: 4, count: 1, cases: [1] },
      ]);
      // One emoji is two UTF-16 units; the empty string has none.
      assert.deepEqual(
        pick([0, 1], { path: '/a~1b/~0key/1', measure: 'length' }).cases.map((row) => row.score),
        [2, 0],
      );
      assert.deepEqual(
        pick([0, 1], { path: '/a~1b/~0key', measure: 'length' }).cases.map((row) => row.score),
        [2, 2],
      );
      // "/" selects the own key named by the empty string.
      assert.deepEqual(
        pick([0, 1], { path: '/' }).values.map((entry) => entry.value),
        ['leaf', 'root'],
      );
      assert.deepEqual(pick([0, 1], { measure: 'length' }).values, [{ value: 2, count: 2, cases: [1, 2] }]);
    },
  );
});

test('summarize rejects malformed requests, fields, cases and case limits', () => {
  const rows = [[2, 3, 4]];
  const run = (request) => () => runSummarize('tunnel', 'excavate', request);
  assert.throws(run(undefined), /Supply a JSON request object/);
  assert.throws(run(null), /Supply a JSON request object/);
  assert.throws(run([]), /Supply a JSON request object/);
  assert.throws(run('{}'), /Supply a JSON request object/);
  assert.throws(run(rows), /Supply a JSON request object/);
  // The request is the only object level: every other field is a scalar or an array.
  assert.throws(run({ cases: rows, extra: 1 }), /unknown field/);
  assert.throws(run({ cases: rows, direction: 'min' }), /unknown field/);
  assert.throws(run({ cases: rows, limit: 1 }), /unknown field/);
  assert.throws(run({ cases: rows, criteria: [] }), /unknown field/);
  assert.throws(run({ cases: rows, paths: '' }), /unknown field/);
  assert.throws(run({ cases: rows, path: undefined }), /JSON values only/);

  assert.throws(run({}), /Supply 1–100 argument-array cases/);
  assert.throws(run({ path: '', measure: 'value' }), /Supply 1–100 argument-array cases/);
  assert.throws(run({ cases: null }), /Supply 1–100 argument-array cases/);
  assert.throws(run({ cases: {} }), /Supply 1–100 argument-array cases/);
  assert.throws(run({ cases: '2,3,4' }), /Supply 1–100 argument-array cases/);
  assert.throws(run({ cases: 1 }), /Supply 1–100 argument-array cases/);
  assert.throws(run({ cases: [] }), /Supply 1–100 argument-array cases/);
  assert.throws(run({ cases: Array(101).fill([2, 3, 4]) }), /Supply 1–100 argument-array cases/);
  const full = run({ cases: Array(100).fill([2, 3, 4]) })();
  assert.equal(full.total, 100);
  assert.deepEqual(full.values, [
    { value: 24, count: 100, cases: Array.from({ length: 100 }, (_, index) => index + 1) },
  ]);
  assert.deepEqual(full.statistics, { minimum: 24, maximum: 24, range: 0, sum: 2400, mean: 24, median: 24 });
  assert.equal(run({ cases: rows })().total, 1);

  assert.throws(run({ cases: ['bad'] }), /Each case must be an argument array/);
  assert.throws(run({ cases: [2, 3, 4] }), /Each case must be an argument array/);
  assert.throws(run({ cases: [null] }), /Each case must be an argument array/);
  assert.throws(run({ cases: [{ 0: 2, 1: 3, 2: 4 }] }), /Each case must be an argument array/);
  assert.throws(run({ cases: [[2, 3, 4], '2,3,4'] }), /Each case must be an argument array/);
  // Sparse arrays (JS API only) are not JSON; a hole is refused, not skipped.
  for (const sparse of [
    [, [2, 3, 4]],
    [[2, 3, 4], , [2, 3, 4]],
    [[2, 3, 4], ,],
  ]) {
    assert.throws(run({ cases: sparse }), /JSON values only/);
    assert.throws(() => calculateStudy('summarize', 'tunnel', 'excavate', { cases: sparse }), /JSON values only/);
  }

  assert.throws(run({ cases: [[2, 3]] }), /exactly the documented arguments/);
  assert.throws(run({ cases: [[2, 3, 4, 5]] }), /exactly the documented arguments/);
  assert.throws(run({ cases: [[]] }), /exactly the documented arguments/);
  assert.throws(run({ cases: [[0, 3, 4]] }), /positive number/);
  assert.throws(run({ cases: [[2, 3, 1.5]] }), /whole number/);
  assert.throws(run({ cases: [['wide', 3, 4]] }), /finite/);
  assert.throws(run({ cases: [[NaN, 3, 4]] }), /finite/);
  assert.throws(run({ cases: [[Infinity, 3, 4]] }), /finite/);
  assert.throws(run({ cases: [[null, 3, 4]] }), /finite number/);
  assert.throws(run({ cases: [[true, 3, 4]] }), /finite number/);
  assert.throws(run({ cases: [[[2], 3, 4]] }), /finite number/);
  assert.throws(run({ cases: [[{ value: 2 }, 3, 4]] }), /finite number/);
  assert.throws(() => runSummarize('tunnel', 'missing', { cases: rows }), /Unknown tunnel command/);
  assert.throws(() => runSummarize('missing', 'excavate', { cases: rows }), /Unknown planning group/);
});

test('summarize rejects invalid paths, measures, selections and mixed score types', () => {
  const order = (options) => () => runSummarize('replenish', 'review-order', { cases: [[3, 10, 4]], ...options });
  for (const path of [null, 5, true, ['/units'], { path: '/units' }, 'units', 'units/', ' /units']) {
    assert.throws(order({ path }), /Path must be a JSON Pointer/, `path: ${JSON.stringify(path)}`);
  }
  for (const path of ['/bad~2', '/bad~', '/~', '/units~x'])
    assert.throws(order({ path }), /escapes must be ~0 or ~1/, path);
  for (const path of [
    '/missing',
    '/Units',
    '/__proto__',
    '/constructor',
    '/toString',
    '/units/missing',
    '/units/0',
    '/',
  ]) {
    assert.throws(order({ path }), /Result path does not exist in every result/, path);
  }
  const loads = (options) => () => runSummarize('haul', 'outbound-loads', { cases: [[10, 4]], ...options });
  for (const path of ['/length', '/01', '/-1', '/1e0', '/-', '/1.0', '/']) {
    assert.throws(loads({ path }), /canonical zero-based indexes/, path);
  }
  for (const path of ['/3', '/100', '/9999999999999999999999']) assert.throws(loads({ path }), /does not exist/, path);
  assert.equal(loads({ path: '/2' })().cases[0].score, 2);

  for (const measure of [null, 5, true, '', 'eval', 'Value', 'LENGTH', 'count', ['value'], { measure: 'value' }]) {
    assert.throws(
      order({ path: '/units', measure }),
      /Measure must be value or length\./,
      `measure: ${JSON.stringify(measure)}`,
    );
  }
  assert.equal(order({ path: '/units', measure: 'value' })().cases[0].score, 8);

  // An object or array needs a scalar path or the length measure; a scalar has no length.
  assert.throws(order({}), /Value selection requires a scalar or null/);
  assert.throws(loads({}), /Value selection requires a scalar or null/);
  assert.throws(order({ path: '/units', measure: 'length' }), /Length requires a string, array, or object/);
  assert.throws(() => runSummarize('tunnel', 'excavate', { cases: [[2, 3, 4]], measure: 'length' }), /Length requires/);
  assert.throws(
    () => runSummarize('replenish', 'order-trigger', { cases: [[5, 5]], measure: 'length' }),
    /Length requires/,
  );
  assert.throws(
    () => runSummarize('replenish', 'stockout-period', { cases: [[10, '0', '1']], measure: 'length' }),
    /Length requires/,
  );

  const mixed = /Summary scores must all have the same scalar type; null only matches null\./;
  // Closing stock 0 + 0 - 1 is negative in period 1, so the second score is a number.
  assert.throws(
    () =>
      runSummarize('replenish', 'stockout-period', {
        cases: [
          [10, '0', '1'],
          [0, '0', '1'],
        ],
      }),
    mixed,
  );
  assert.throws(
    () =>
      runSummarize('replenish', 'stockout-period', {
        cases: [
          [0, '0', '1'],
          [10, '0', '1'],
        ],
      }),
    mixed,
  );
  withResults([1, '1', true, null, 0, false, ''], (pick) => {
    for (const pair of [
      [0, 1],
      [1, 0],
      [0, 2],
      [0, 3],
      [3, 0],
      [1, 2],
      [1, 3],
      [2, 3],
      [4, 5],
      [4, 6],
      [4, 3],
      [5, 3],
      [6, 3],
      [6, 5],
    ]) {
      assert.throws(() => pick(pair), mixed, `results ${pair}`);
    }
    // The odd one out may be the last of many.
    assert.throws(() => pick([0, 4, 0, 4, 1]), mixed);
    assert.deepEqual(
      pick([0, 4]).values.map((entry) => entry.value),
      [0, 1],
    );
    assert.deepEqual(pick([3, 3]).values, [{ value: null, count: 2, cases: [1, 2] }]);
  });
});

test('summarize validates the whole request before evaluating any case', () => {
  withResults([7, 8], (pick, counter) => {
    for (const [options, message] of [
      [{ path: 'value' }, /JSON Pointer/],
      [{ path: '/bad~2' }, /escapes/],
      [{ path: null }, /JSON Pointer/],
      [{ measure: 'eval' }, /Measure must be value or length/],
      [{ measure: null }, /Measure must be value or length/],
      [{ extra: true }, /unknown field/],
    ]) {
      assert.throws(() => pick([0, 1], options), message);
      assert.equal(counter.calls, 0);
    }
    const run = (cases) => () => runSummarize('vector', 'summarize-pick', { cases });
    assert.throws(run([[0], [1], 'bad']), /Each case must be an argument array/);
    assert.throws(run(Array(101).fill([0])), /Supply 1–100 argument-array cases/);
    assert.equal(counter.calls, 0);
    assert.equal(pick([0, 1]).statistics.sum, 15);
    assert.equal(counter.calls, 2);
  });
});

test('summarize rejects the whole study when any case fails', () => {
  const run = (cases) => () => runSummarize('tunnel', 'excavate', { cases });
  // Width 0 is not a positive whole number; only one of three rows is invalid.
  assert.throws(
    run([
      [0, 3, 4],
      [2, 2, 3],
      [3, 2, 2],
    ]),
    /positive number/,
  );
  assert.throws(
    run([
      [2, 3, 4],
      [0, 2, 3],
      [3, 2, 2],
    ]),
    /positive number/,
  );
  assert.throws(
    run([
      [2, 3, 4],
      [2, 2, 3],
      [3, 2, 1.5],
    ]),
    /whole number/,
  );
  assert.throws(
    run([
      [2, 3, 4],
      [2, 2, 3],
      [3, 2],
    ]),
    /exactly the documented arguments/,
  );
  assert.throws(
    () =>
      calculateStudy('summarize', 'tunnel', 'excavate', {
        cases: [
          [2, 3, 4],
          [2, 2, 3],
          ['long', 2, 2],
        ],
      }),
    /finite/,
  );
  assert.deepEqual(
    run([
      [2, 3, 4],
      [2, 2, 3],
      [3, 2, 2],
    ])().statistics.sum,
    48,
  );
  // One-period deliveries cannot pair with two-period demands.
  assert.throws(
    () =>
      runSummarize('replenish', 'stockout-period', {
        cases: [
          [10, '0', '1'],
          [10, '0', '1,1'],
        ],
      }),
    /equal lengths/,
  );
  // The last result lacks the selected key, has no length, or is not a scalar.
  withResults([{ cost: 1 }, { cost: 2 }, { price: 3 }, 4, [5]], (pick) => {
    assert.throws(() => pick([0, 1, 2], { path: '/cost' }), /Result path does not exist in every result/);
    assert.throws(() => pick([0, 1, 3], { path: '/cost' }), /Result path does not exist in every result/);
    assert.throws(() => pick([0, 1, 3], { measure: 'length' }), /Length requires/);
    assert.throws(() => pick([3, 3, 4]), /Value selection requires a scalar or null/);
    assert.throws(() => pick([0, 1, 5], { path: '/cost' }), /Calculation produced no result/);
    assert.deepEqual(pick([0, 1], { path: '/cost' }).statistics, {
      minimum: 1,
      maximum: 2,
      range: 1,
      sum: 3,
      mean: 1.5,
      median: 1.5,
    });
  });
});

test('summarize statistics outside the safe numeric range are rejected by the study wrapper', () => {
  // 1,000,000 × 1,000,000 × 5,000 = 5e15 is safe; two of them sum to 1e16, above 2^53 - 1.
  const large = [1e6, 1e6, 5000];
  const one = calculateStudy('summarize', 'tunnel', 'excavate', { cases: [large] });
  assert.deepEqual(one.statistics, { minimum: 5e15, maximum: 5e15, range: 0, sum: 5e15, mean: 5e15, median: 5e15 });
  const raw = runSummarize('tunnel', 'excavate', { cases: [large, large] });
  assert.deepEqual(raw.statistics, { minimum: 5e15, maximum: 5e15, range: 0, sum: 1e16, mean: 5e15, median: 5e15 });
  assert.throws(
    () => calculateStudy('summarize', 'tunnel', 'excavate', { cases: [large, large] }),
    /Result exceeds supported numeric range/,
  );
  // Each score is safe and the sum is 0, but the range 1.8e16 is not.
  withResults([9e15, -9e15], (pick) => {
    assert.deepEqual(pick([0, 1]).statistics, {
      minimum: -9e15,
      maximum: 9e15,
      range: 1.8e16,
      sum: 0,
      mean: 0,
      median: 0,
    });
    assert.throws(
      () => calculateStudy('summarize', 'vector', 'summarize-pick', { cases: [[0], [1]] }),
      /Result exceeds supported numeric range/,
    );
    assert.equal(calculateStudy('summarize', 'vector', 'summarize-pick', { cases: [[1]] }).statistics.sum, -9e15);
  });
});

test('summarize CLI accepts inline, file and stdin requests and produces no partial report on errors', async () => {
  const directory = await mkdtemp('.runtime-summarize-');
  const call = (source, input, command = 'action-budget') =>
    spawnSync(
      process.execPath,
      [CLI_PATH, '--bridge', '.runtime/missing-summarize.json', 'study', 'summarize', 'durability', command, source],
      { encoding: 'utf8', input },
    );
  try {
    const body = {
      cases: [
        [25, 3, 4],
        [40, 3, 4],
        [25, 2, 4],
        [34, 3, 4],
      ],
    };
    const request = JSON.stringify(body);
    const expected = calculateStudy('summarize', 'durability', 'action-budget', body);
    // Whole actions from (remaining - reserve 4) / wear: 21/3, 36/3, 21/2, 30/3.
    const { note, plannerNote, ...data } = expected;
    assert.deepEqual(data, {
      workflow: 'summarize',
      group: 'durability',
      command: 'action-budget',
      path: '',
      measure: 'value',
      total: 4,
      scoreType: 'number',
      values: [
        { value: 7, count: 1, cases: [1] },
        { value: 10, count: 2, cases: [3, 4] },
        { value: 12, count: 1, cases: [2] },
      ],
      statistics: { minimum: 7, maximum: 12, range: 5, sum: 39, mean: 9.75, median: 10 },
      cases: [
        { case: 1, args: [25, 3, 4], result: 7, score: 7 },
        { case: 2, args: [40, 3, 4], result: 12, score: 12 },
        { case: 3, args: [25, 2, 4], result: 10, score: 10 },
        { case: 4, args: [34, 3, 4], result: 10, score: 10 },
      ],
    });
    assert.match(note, /Offline/);
    assert.equal(typeof plannerNote, 'string');
    const filename = `${directory}/request.json`;
    await writeFile(filename, request);
    for (const [source, input] of [[request], [`@${filename}`], ['-', request]]) {
      const result = call(source, input);
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), expected);
    }

    // A string summary through a nested path, with its null statistics.
    const choices = {
      cases: [
        [10, 2, 5],
        [1, 2, 5],
        [3, 2, 5],
      ],
      path: '/choice',
    };
    const strings = call(JSON.stringify(choices), undefined, 'repair-or-replace');
    assert.equal(strings.status, 0, strings.stderr);
    const report = JSON.parse(strings.stdout);
    assert.deepEqual(report, calculateStudy('summarize', 'durability', 'repair-or-replace', choices));
    assert.deepEqual([report.scoreType, report.statistics], ['string', null]);
    assert.deepEqual(report.values, [
      { value: 'repair', count: 1, cases: [2] },
      { value: 'replace', count: 2, cases: [1, 3] },
    ]);

    // The last case has a negative remaining durability, which the planner rejects.
    const invalid = call(
      JSON.stringify({
        cases: [
          [25, 3, 4],
          [40, 3, 4],
          [-1, 3, 4],
        ],
      }),
    );
    assert.notEqual(invalid.status, 0);
    assert.equal(invalid.stdout, '');
    assert.match(invalid.stderr, /Error/);
    for (const [bad, message] of [
      [{ ...body, measure: 'mean' }, /Error: Measure must be value or length\./],
      [{ ...body, direction: 'max' }, /Error: Request contains an unknown field\./],
      [{ ...body, path: 'result' }, /Error: Path must be a JSON Pointer/],
      [{ cases: [] }, /Error: Supply 1–100 argument-array cases\./],
    ]) {
      const failed = call(JSON.stringify(bad));
      assert.notEqual(failed.status, 0);
      assert.equal(failed.stdout, '');
      assert.match(failed.stderr, message);
    }
    // No repair-or-replace result has a key named missing.
    const missing = call(JSON.stringify({ ...choices, path: '/missing' }), undefined, 'repair-or-replace');
    assert.notEqual(missing.status, 0);
    assert.equal(missing.stdout, '');
    assert.match(missing.stderr, /Error: Result path does not exist in every result\./);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
