import assert from 'node:assert/strict';
import test from 'node:test';
import { testStudyWorkflows } from './planning-study-workflow-checks.js';

import { calculateOffline } from '../src/offline-kit.js';
import { CONSTRUCTION_GROUPS } from '../src/planning-construction.js';
import { constructionCases as cases } from '../src/planning-examples-construction.js';

for (const group of CONSTRUCTION_GROUPS) {
  const commands = group.commands.map(({ signature }) => signature.split(' ')[0]);
  test(`${group.name} has exactly 25 covered calculations`, () => {
    assert.equal(commands.length, 25);
    assert.deepEqual([...commands].sort(), Object.keys(cases[group.name]).sort());
  });
  for (const [name, [inputs, expected]] of Object.entries(cases[group.name])) {
    testStudyWorkflows(group.name, name, inputs, expected);
    test(`${group.name} ${name}`, () => {
      assert.deepEqual(calculateOffline(group, name, inputs).result, expected);
    });
  }
}

test('construction tools handle exact limits and impossible plans', () => {
  const [scaffold, beacon] = CONSTRUCTION_GROUPS;
  assert.deepEqual(calculateOffline(scaffold, 'anchor-levels', [10, 10, 1]).result, [10]);
  assert.deepEqual(calculateOffline(scaffold, 'relocation-overlap', [2, 4, 3]).result, {
    covered: 8,
    uncovered: 6,
    reusedLengthPerMove: 0,
  });
  assert.deepEqual(calculateOffline(scaffold, 'bay-brace-stock', ['1', '1e-310', 1]).result, [1]);
  assert.equal(calculateOffline(scaffold, 'deck-crew', [10, 2, 3, 3]).result, null);
  assert.throws(() => calculateOffline(scaffold, 'guardrail-gaps', ['4,5', '5,0', 2]), /openings/i);
  assert.throws(() => calculateOffline(scaffold, 'anchor-levels', [-500, 500, 1]), /1000/);
  assert.throws(() => calculateOffline(scaffold, 'bay-brace-stock', ['1', '1', 0.9]), /longer/);
  assert.throws(() => calculateOffline(beacon, 'upgrade-impact', ['[[0,0]]', 3, 2, '[[0,0]]']), /radius/);
  assert.throws(() => calculateOffline(beacon, 'coverage-columns', ['[[0.5,0]]', 1]), /whole/);
  assert.throws(() => calculateOffline(beacon, 'donation-shortfall', [3, 2, '4,1', '17', 9]), /equal/);
  assert.deepEqual(calculateOffline(beacon, 'service-uptime', ['[[0,2],[5,6]]', 2, 5]).result, {
    duration: 0,
    fraction: 0,
  });
});

test('construction surveys accept a known absence of pads and obstructions', () => {
  const [scaffold, beacon] = CONSTRUCTION_GROUPS;
  assert.deepEqual(calculateOffline(scaffold, 'missing-ground-pads', ['[[0,0]]', '[]']).result, [[0, 0]]);
  assert.deepEqual(calculateOffline(beacon, 'beam-obstructions', ['[[0,64,0]]', '[]']).result, [null]);
  assert.throws(() => calculateOffline(beacon, 'beam-obstructions', ['[]', '[]']), /1–1000/);
  assert.throws(() => calculateOffline(beacon, 'beam-obstructions', ['[[0,64,0]]', '[[0,1]]']), /3 numbers/);
});

test('construction clearance and beacon range include exact decimal endpoints', () => {
  const [scaffold, beacon] = CONSTRUCTION_GROUPS;
  assert.deepEqual(calculateOffline(scaffold, 'workface-reach', ['0.4,0.401', '0.1,0,0.5', 0.3]).result, [0.1, null]);
  assert.deepEqual(calculateOffline(scaffold, 'deck-clearance', ['0.1,0.1', '0.3,0.29', 0.2]).result, [2]);
  const station = '[[0.4,0]]';
  const sites = '[[0.1,0],[0.7,0]]';
  assert.deepEqual(calculateOffline(beacon, 'uncovered-stations', ['[[0.1,0]]', '0.3', station]).result, []);
  assert.deepEqual(calculateOffline(beacon, 'shared-stations', [sites, 0.3, station]).result, [
    { station: 1, sites: [1, 2] },
  ]);
  assert.deepEqual(calculateOffline(beacon, 'station-assignment', [sites, 0.3, station]).result, [1]);
  assert.deepEqual(calculateOffline(beacon, 'upgrade-impact', ['[[0.1,0]]', 0.2, 0.3, station]).result, [1]);
  assert.deepEqual(calculateOffline(beacon, 'upgrade-impact', ['[[0.1,0]]', 0.3, 0.4, station]).result, []);
});

test('construction clearance and beacon coverage retain small spans at translated coordinates', () => {
  const [scaffold, beacon] = CONSTRUCTION_GROUPS;
  assert.deepEqual(
    calculateOffline(scaffold, 'deck-clearance', ['64.2,-64.3,64.21', '64.3,-64.2,64.3', 0.1]).result,
    [3],
  );
  const sites = '[[1000.1,0],[1000.3,0]]';
  const station = '[[1000.2,0]]';
  assert.deepEqual(calculateOffline(beacon, 'uncovered-stations', ['[[1000.1,0]]', '0.1', station]).result, []);
  assert.deepEqual(calculateOffline(beacon, 'shared-stations', [sites, 0.1, station]).result, [
    { station: 1, sites: [1, 2] },
  ]);
  assert.deepEqual(calculateOffline(beacon, 'station-assignment', [sites, 0.1, station]).result, [1]);
  assert.deepEqual(calculateOffline(beacon, 'upgrade-impact', [sites, 0.09, 0.1, station]).result, [1]);
});
