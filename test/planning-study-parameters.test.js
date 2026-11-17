import test from 'node:test';
import assert from 'node:assert/strict';
import { runSweep, runSensitivity } from '../src/planning-study-parameters.js';

test('sweep replaces a one-based scalar argument in source order', () => {
  assert.deepEqual(
    runSweep('tunnel', 'excavate', {
      args: [2, 3, 4],
      index: 3,
      values: [0, 2, 5],
    }),
    {
      cases: [
        { case: 1, value: 0, args: [2, 3, 0], result: 0 },
        { case: 2, value: 2, args: [2, 3, 2], result: 12 },
        { case: 3, value: 5, args: [2, 3, 5], result: 30 },
      ],
    },
  );
});

test('sweep accepts complete list argument replacements and different result shapes', () => {
  assert.deepEqual(
    runSweep('vector', 'length', {
      args: ['[[3,4,0]]'],
      index: 1,
      values: ['[[0,0,2]]', '[[3,4,0],[0,0,6]]'],
    }).cases.map((row) => row.result),
    [[2], [5, 6]],
  );
  assert.deepEqual(
    runSweep('series', 'cumulative', {
      args: ['1,2'],
      index: 1,
      values: ['3,4', '2,3,4'],
    }).cases.map((row) => row.result),
    [
      [3, 7],
      [2, 5, 9],
    ],
  );
});

test('sensitivity varies arguments independently against one baseline', () => {
  assert.deepEqual(
    runSensitivity('tunnel', 'excavate', {
      args: [2, 3, 4],
      changes: [
        { index: 1, values: [1, 4] },
        { index: 3, values: [5] },
      ],
    }),
    {
      baseline: { args: [2, 3, 4], result: 24 },
      cases: [
        {
          case: 1,
          index: 1,
          value: 1,
          args: [1, 3, 4],
          result: 12,
          changes: [{ path: '', before: 24, after: 12, delta: -12 }],
        },
        {
          case: 2,
          index: 1,
          value: 4,
          args: [4, 3, 4],
          result: 48,
          changes: [{ path: '', before: 24, after: 48, delta: 24 }],
        },
        {
          case: 3,
          index: 3,
          value: 5,
          args: [2, 3, 5],
          result: 30,
          changes: [{ path: '', before: 24, after: 30, delta: 6 }],
        },
      ],
    },
  );
});

test('sensitivity supports unchanged inputs, JSON arrays and CSV list arguments', () => {
  const vector = runSensitivity('vector', 'length', {
    args: ['[[3,4,0]]'],
    changes: [{ index: 1, values: ['[[3,4,0]]', '[[0,0,2]]'] }],
  });
  assert.deepEqual(vector.cases[0].changes, []);
  assert.deepEqual(vector.cases[1].changes, [{ path: '/0', before: 5, after: 2, delta: -3 }]);
  const cumulative = runSensitivity('series', 'cumulative', {
    args: ['1,2'],
    changes: [{ index: 1, values: ['3,4,5'] }],
  });
  assert.deepEqual(cumulative.baseline.result, [1, 3]);
  assert.deepEqual(cumulative.cases[0].result, [3, 7, 12]);
});

test('parameter studies preserve the caller request', () => {
  for (const [run, request] of [
    [runSweep, { args: [2, 3, 4], index: 3, values: [0, 2, 5] }],
    [runSensitivity, { args: [2, 3, 4], changes: [{ index: 3, values: [0, 2] }] }],
  ]) {
    const before = structuredClone(request);
    Object.freeze(request.args);
    Object.freeze(request);
    run('tunnel', 'excavate', request);
    assert.deepEqual(request, before);
  }
});

test('sweep rejects invalid base arguments even if replacements would fix them', () => {
  assert.throws(() =>
    runSweep('tunnel', 'excavate', {
      args: [0, 3, 4],
      index: 1,
      values: [2],
    }),
  );
  assert.throws(() =>
    runSensitivity('tunnel', 'excavate', {
      args: [0, 3, 4],
      changes: [{ index: 1, values: [2] }],
    }),
  );
});

test('parameter studies reject malformed indexes, unknown keys and invalid replacements', () => {
  for (const index of [0, -1, 4, 1.5, '1', null, NaN]) {
    assert.throws(() => runSweep('tunnel', 'excavate', { args: [2, 3, 4], index, values: [2] }));
    assert.throws(() =>
      runSensitivity('tunnel', 'excavate', {
        args: [2, 3, 4],
        changes: [{ index, values: [2] }],
      }),
    );
  }
  for (const values of [[], Array(101).fill(1), null, '2,3', [null], [[1, 2]], [true], [Infinity], ['bad']]) {
    assert.throws(() => runSweep('tunnel', 'excavate', { args: [2, 3, 4], index: 1, values }));
    assert.throws(() =>
      runSensitivity('tunnel', 'excavate', {
        args: [2, 3, 4],
        changes: [{ index: 1, values }],
      }),
    );
  }
  assert.throws(() => runSweep('tunnel', 'excavate', { args: [2, 3, 4], index: 1, values: [1], extra: true }));
  assert.throws(() =>
    runSensitivity('tunnel', 'excavate', {
      args: [2, 3, 4],
      changes: [{ index: 1, values: [1], extra: true }],
    }),
  );
  assert.throws(() =>
    runSensitivity('tunnel', 'excavate', {
      args: [2, 3, 4],
      changes: [{ index: 1, values: [1] }],
      extra: true,
    }),
  );
});

test('sensitivity rejects duplicate indexes, no changes and excessive total work', () => {
  for (const changes of [
    undefined,
    null,
    [],
    Array(101).fill({ index: 1, values: [1] }),
    [
      { index: 1, values: [1] },
      { index: 1, values: [2] },
    ],
    [
      { index: 1, values: Array(60).fill(1) },
      { index: 2, values: Array(60).fill(1) },
    ],
  ]) {
    assert.throws(() => runSensitivity('tunnel', 'excavate', { args: [2, 3, 4], changes }));
  }
  assert.equal(
    runSensitivity('tunnel', 'excavate', {
      args: [2, 3, 4],
      changes: [{ index: 1, values: Array(100).fill(1) }],
    }).cases.length,
    100,
  );
});

test('any failed case rejects the whole parameter study', () => {
  assert.throws(() =>
    runSweep('tunnel', 'excavate', {
      args: [2, 3, 4],
      index: 1,
      values: [1, 0, 3],
    }),
  );
  assert.throws(() =>
    runSensitivity('tunnel', 'excavate', {
      args: [2, 3, 4],
      changes: [
        { index: 1, values: [1] },
        { index: 2, values: [0] },
      ],
    }),
  );
});
