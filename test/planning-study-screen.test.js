import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { runScreen } from '../src/planning-study-screen.js';
import { PLANNING_GROUPS } from '../src/planning-tools.js';

test('screen retains candidates and every check while applying inclusive and exclusive budgets', () => {
  const request = { cases: [[2, 3, 4], [2, 2, 3], [3, 2, 2]], criteria: [
    { op: 'gte', value: 12 }, { op: 'lt', value: 24 },
  ] };
  const before = structuredClone(request);
  assert.deepEqual(runScreen('tunnel', 'excavate', request), {
    criteria: [{ path: '', measure: 'value', op: 'gte', value: 12 }, { path: '', measure: 'value', op: 'lt', value: 24 }],
    total: 3, passed: 2, failed: 1,
    cases: [
      { case: 1, args: [2, 3, 4], result: 24, passed: false, checks: [
        { criterion: 1, actual: 24, passed: true }, { criterion: 2, actual: 24, passed: false },
      ] },
      ...[2, 3].map((number, index) => ({ case: number, args: request.cases[index + 1], result: 12, passed: true, checks: [
        { criterion: 1, actual: 12, passed: true }, { criterion: 2, actual: 12, passed: true },
      ] })),
    ],
  });
  assert.deepEqual(request, before);
  for (const [op, expected] of [['eq', true], ['ne', false], ['lt', false], ['lte', true], ['gt', false], ['gte', true]]) {
    assert.equal(runScreen('tunnel', 'excavate', { cases: [[2, 3, 4]], criteria: [{ op, value: 24 }] }).cases[0].passed, expected, op);
  }
  const boundary = runScreen('tunnel', 'excavate', {
    cases: Array.from({ length: 100 }, () => [2, 3, 4]),
    criteria: Array.from({ length: 20 }, () => ({ op: 'gt', value: 24 })),
  });
  assert.equal(boundary.passed, 0);
  assert.equal(boundary.failed, 100);
  assert.ok(boundary.cases.every(row => row.checks.length === 20));
});

test('screen selects nested fields, strict strings, booleans and null', () => {
  const choice = runScreen('durability', 'repair-or-replace', {
    cases: [[10, 2, 5], [1, 2, 5]], criteria: [{ path: '/choice', op: 'eq', value: 'repair' }],
  });
  assert.deepEqual(choice.cases.map(row => row.passed), [false, true]);
  assert.deepEqual(runScreen('replenish', 'order-trigger', {
    cases: [[5, 5], [6, 5]], criteria: [{ op: 'ne', value: false }],
  }).cases.map(row => row.passed), [true, false]);
  assert.equal(runScreen('replenish', 'stockout-period', {
    cases: [[10, '0', '1']], criteria: [{ op: 'eq', value: null }],
  }).passed, 1);
  assert.equal(runScreen('replenish', 'review-order', {
    cases: [[3, 10, 4]], criteria: [{ path: '/units', op: 'lte', value: 8 }],
  }).passed, 1);
});

test('screen measures array, string, and object lengths and escaped own keys', () => {
  assert.deepEqual(runScreen('haul', 'outbound-loads', {
    cases: [[10, 4], [10, 10]], criteria: [{ measure: 'length', op: 'eq', value: 1 }],
  }).cases.map(row => row.passed), [false, true]);
  assert.equal(runScreen('replenish', 'review-order', {
    cases: [[3, 10, 4]], criteria: [{ measure: 'length', op: 'eq', value: 2 }],
  }).passed, 1);
  const group = PLANNING_GROUPS.find(group => group.name === 'vector');
  const fixture = { signature: 'screen-fixture <n>', types: ['n'], run: n => ({ 'a/b': { '~key': [n, '😀'] } }) };
  group.commands.push(fixture);
  try {
    const result = runScreen('vector', 'screen-fixture', {
      cases: [[4], [2]], criteria: [{ path: '/a~1b/~0key/0', op: 'gt', value: 2 },
        { path: '/a~1b/~0key/1', measure: 'length', op: 'eq', value: 2 }],
    });
    assert.deepEqual(result.cases.map(row => row.passed), [true, false]);
    assert.deepEqual(result.cases[1].checks.map(check => check.passed), [false, true]);
  } finally { group.commands.splice(group.commands.indexOf(fixture), 1); }
});

test('screen rejects malformed criteria, requests, selectors, and incompatible types atomically', () => {
  const base = { cases: [[2, 3, 4]], criteria: [{ op: 'eq', value: 24 }] };
  for (const criteria of [undefined, null, {}, [], Array(21).fill({ op: 'eq', value: 24 }),
    [null], [[]], [{}], [{ op: 'eq' }], [{ op: 'bad', value: 24 }], [{ op: 'eq', value: [] }],
    [{ op: 'eq', value: {} }], [{ op: 'eq', value: NaN }], [{ op: 'eq', value: 24, extra: true }],
    [{ op: 'eq', value: 24, measure: 'bad' }], [{ op: 'eq', value: 24, path: null }],
    [{ op: 'eq', value: '24' }], [{ op: 'ne', value: null }], [{ op: 'eq', value: 24, measure: 'length' }]]) {
    assert.throws(() => runScreen('tunnel', 'excavate', { ...base, criteria }));
  }
  for (const request of [null, [], {}, { ...base, extra: 1 }, { ...base, cases: [] },
    { ...base, cases: Array(101).fill([2, 3, 4]) }, { ...base, cases: ['bad'] },
    { ...base, cases: [[2, 3, 4], ['NaN', 3, 4]] }]) {
    assert.throws(() => runScreen('tunnel', 'excavate', request));
  }
  for (const path of ['units', '/bad~2', '/bad~', '/__proto__', '/constructor', '/toString', '/units/missing']) {
    assert.throws(() => runScreen('replenish', 'review-order', { cases: [[3, 10, 4]], criteria: [{ path, op: 'eq', value: 8 }] }), path);
  }
  for (const path of ['/length', '/01', '/-1', '/1e0', '/-', '/100']) {
    assert.throws(() => runScreen('haul', 'outbound-loads', { cases: [[10, 4]], criteria: [{ path, op: 'eq', value: 4 }] }), path);
  }
  for (const op of ['lt', 'lte', 'gt', 'gte']) {
    assert.throws(() => runScreen('durability', 'repair-or-replace', {
      cases: [[10, 2, 5]], criteria: [{ path: '/choice', op, value: 'repair' }],
    }));
  }
  // A failed first criterion must not hide an invalid later selection.
  assert.throws(() => runScreen('replenish', 'review-order', {
    cases: [[3, 10, 4]], criteria: [{ path: '/units', op: 'eq', value: 999 }, { path: '/missing', op: 'eq', value: 1 }],
  }));
  // A valid null result in the first case must not hide a later scalar type mismatch.
  assert.throws(() => runScreen('replenish', 'stockout-period', {
    cases: [[10, '0', '1'], [0, '0', '1']], criteria: [{ op: 'eq', value: null }],
  }));
});

test('screen CLI accepts inline, file and stdin requests and produces no partial report on errors', async () => {
  const directory = await mkdtemp('.runtime-screen-');
  const call = (source, input) => spawnSync(process.execPath, ['src/cli.js', '--bridge', '.runtime/missing-screen.json',
    'study', 'screen', 'durability', 'action-budget', source], { encoding: 'utf8', input });
  try {
    const request = JSON.stringify({ cases: [[25, 3, 4], [40, 3, 4]], criteria: [{ op: 'gte', value: 10 }] });
    const filename = `${directory}/request.json`;
    await writeFile(filename, request);
    for (const [source, input] of [[request], [`@${filename}`], ['-', request]]) {
      const result = call(source, input);
      assert.equal(result.status, 0, result.stderr);
      const report = JSON.parse(result.stdout);
      assert.equal(report.passed, 1);
      assert.equal(report.failed, 1);
      assert.deepEqual(report.cases.map(row => [row.result, row.passed]), [[7, false], [12, true]]);
    }
    const invalid = call(JSON.stringify({ cases: [[25, 3, 4], [-1, 3, 4]], criteria: [{ op: 'gte', value: 10 }] }));
    assert.notEqual(invalid.status, 0);
    assert.equal(invalid.stdout, '');
    assert.match(invalid.stderr, /Error/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
