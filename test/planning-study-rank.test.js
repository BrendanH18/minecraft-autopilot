import test from 'node:test';
import assert from 'node:assert/strict';
import { runRank } from '../src/planning-study-rank.js';
import { PLANNING_GROUPS } from '../src/planning-tools.js';

test('rank orders actual excavation candidates by cost and preserves source identities', () => {
  const request = { cases: [[2, 3, 4], [2, 2, 3], [3, 2, 2]], direction: 'min' };
  const before = structuredClone(request);
  assert.deepEqual(runRank('tunnel', 'excavate', request), {
    direction: 'min', path: '', measure: 'value', total: 3,
    ranked: [
      { rank: 1, case: 2, args: [2, 2, 3], result: 12, score: 12 },
      { rank: 2, case: 3, args: [3, 2, 2], result: 12, score: 12 },
      { rank: 3, case: 1, args: [2, 3, 4], result: 24, score: 24 },
    ],
  });
  assert.deepEqual(request, before);
  assert.deepEqual(runRank('tunnel', 'excavate', { ...request, direction: 'max', limit: 2 }).ranked.map(row => row.case), [1, 2]);
});

test('rank selects nested numeric quantities, lexical decisions, booleans, and null ties', () => {
  const numeric = runRank('replenish', 'review-order', {
    cases: [[3, 10, 4], [2, 10, 3]], path: '/units', direction: 'min',
  });
  assert.deepEqual(numeric.ranked.map(row => [row.case, row.score]), [[1, 8], [2, 9]]);
  const decisions = runRank('durability', 'repair-or-replace', {
    cases: [[10, 2, 5], [1, 2, 5]], path: '/choice', direction: 'min',
  });
  assert.deepEqual(decisions.ranked.map(row => [row.case, row.score]), [[2, 'repair'], [1, 'replace']]);
  const booleans = runRank('replenish', 'order-trigger', {
    cases: [[5, 5], [6, 5], [4, 5]], direction: 'max',
  });
  assert.deepEqual(booleans.ranked.map(row => [row.case, row.score]), [[1, true], [3, true], [2, false]]);
  const nulls = runRank('replenish', 'stockout-period', {
    cases: [[10, '0', '1'], [20, '0', '1']], direction: 'min',
  });
  assert.deepEqual(nulls.ranked.map(row => [row.case, row.score]), [[1, null], [2, null]]);
});

test('rank measures arrays, strings, and object field counts without coercing numeric objectives', () => {
  const arrays = runRank('haul', 'outbound-loads', {
    cases: [[10, 4], [10, 10], [10, 2]], measure: 'length', direction: 'min',
  });
  assert.deepEqual(arrays.ranked.map(row => [row.case, row.score]), [[2, 1], [1, 3], [3, 5]]);
  const strings = runRank('durability', 'repair-or-replace', {
    cases: [[10, 2, 5], [1, 2, 5]], path: '/choice', measure: 'length', direction: 'max',
  });
  assert.deepEqual(strings.ranked.map(row => [row.case, row.score]), [[1, 7], [2, 6]]);
  const objects = runRank('replenish', 'review-order', {
    cases: [[3, 10, 4], [2, 10, 3]], measure: 'length', direction: 'max',
  });
  assert.deepEqual(objects.ranked.map(row => [row.case, row.score]), [[1, 2], [2, 2]]);
});

test('rank accepts JSON Pointer escaped own keys and canonical nested array indexes', () => {
  const group = PLANNING_GROUPS.find(group => group.name === 'vector');
  const fixture = {
    signature: 'value <number>', types: ['n'], run: number => ({ 'a/b': { '~key': [number] } }),
  };
  group.commands.push(fixture);
  try {
    const ranked = runRank(group.name, 'value', { cases: [[4], [2]], path: '/a~1b/~0key/0', direction: 'min' });
    assert.deepEqual(ranked.ranked.map(row => row.score), [2, 4]);
  } finally {
    group.commands.splice(group.commands.indexOf(fixture), 1);
  }
});

test('rank rejects invalid selectors, mixed score types, malformed requests and invalid candidates', () => {
  const base = { cases: [[3, 10, 4]], direction: 'min', path: '/units' };
  for (const path of [null, 'units', '/bad~2', '/bad~', '/__proto__', '/constructor', '/toString', '/units/missing']) {
    assert.throws(() => runRank('replenish', 'review-order', { ...base, path }), `path: ${path}`);
  }
  for (const path of ['/length', '/01', '/-1', '/1e0', '/-', '/9999999999999999999999']) {
    assert.throws(() => runRank('haul', 'outbound-loads', { cases: [[10, 4]], direction: 'min', path }), path);
  }
  assert.throws(() => runRank('replenish', 'stockout-period', { cases: [[10, '0', '1'], [0, '0', '1']], direction: 'min' }), /same scalar type/);
  assert.throws(() => runRank('tunnel', 'excavate', { cases: [[2, 3, 4]], direction: 'min', measure: 'length' }), /Length/);
  assert.throws(() => runRank('replenish', 'review-order', { ...base, path: '' }), /scalar/);
  for (const request of [null, [], {}, { ...base, cases: [] }, { ...base, cases: Array(101).fill([3, 10, 4]) }, { ...base, cases: ['bad'] }, { ...base, cases: [[3, 10, 4], ['NaN', 10, 4]], limit: 1 }, { ...base, direction: 'asc' }, { ...base, measure: 'eval' }, { ...base, extra: 1 }]) {
    assert.throws(() => runRank('replenish', 'review-order', request));
  }
  for (const limit of [0, 101, 1.5, '1', null]) assert.throws(() => runRank('replenish', 'review-order', { ...base, limit }));
});
