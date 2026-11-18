import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateOffline } from '../src/offline-kit.js';
import { CONSTRUCTION_GROUPS } from '../src/planning-construction.js';

const cases = {
  'scaffold-plan': {
    'column-bill': [
      ['-2,0,2', 2, 3],
      [12, 6, 0],
    ],
    'frame-grid': [[9, 5, 4, 5], { rows: 2, columns: 4, supports: 8 }],
    'brace-span-check': [['0,4,4,0', '3,6,2', 5], [2]],
    'cantilever-coverage': [
      ['9,2,4,2', 1],
      [
        [1, 5],
        [8, 10],
      ],
    ],
    'unsupported-deck': [[0, 9, '2,4,9', 1], 3],
    'stacked-decks': [[5, 4, '1,0,6'], 53],
    'guardrail-gaps': [['6,5', '3,1', 2], 14],
    'ladder-landings': [[13, 6, 2], { flights: 3, landings: 2, totalLandingDepth: 4 }],
    'ladder-extensions': [
      ['3,8,4', '8,2,4'],
      [5, 0, 0],
    ],
    'deck-clearance': [['0,4,10', '3,8,12', 3], [3]],
    'workface-reach': [
      ['9,5,2,13', '1,5,8', 2],
      [8, 5, 1, null],
    ],
    'mast-joins': [['0,3,4,7', 3], 3],
    'anchor-levels': [
      [-3, 5, 3],
      [-3, 0, 3, 5],
    ],
    'tie-materials': [['2,5', '4,1', 2], 27],
    'bay-brace-stock': [
      ['7,3,0', '0.1,0.15,2', 0.3],
      [3, 2, 0],
    ],
    'outrigger-footprint': [[6, 4, 0, 2, 1, 3], { length: 10, width: 6, extraArea: 36 }],
    'relocation-overlap': [[6, 4, 3], { covered: 18, uncovered: 0, reusedLengthPerMove: 2 }],
    'recovered-modules': [
      ['6,7,9', '0.5,0.5,1'],
      [3, 3, 9],
    ],
    'rolling-stock': [[3, 10, 0.75, 2], { installed: 30, topUps: 6, total: 36 }],
    'build-strip-time': [[12, 8, 4, 2, 2], { building: 3, stripping: 4, total: 9 }],
    'deck-crew': [[24, 3, 4, 1], 3],
    'winch-hauls': [['7,0,10', 5, -1, '3,5,9'], { trips: [2, 0, 2], loadedTravel: 28 }],
    'staggered-inspections': [[11, 4, 2], { rounds: 3, revisitDays: 6 }],
    'strike-order': [
      ['6,10,4,8,10', '4,8,10'],
      [10, 8],
    ],
    'missing-ground-pads': [
      ['[[0,0],[1,1],[2,3],[1,1]]', '[[2,3]]'],
      [
        [0, 0],
        [1, 1],
      ],
    ],
  },
  'beacon-plan': {
    'tier-materials': [[3, 4], { layers: [9, 25, 49, 81], total: 164 }],
    'highest-affordable-tier': [[3, 34, 4], { tiers: 2, spent: 34, left: 0 }],
    'donation-shortfall': [[3, 2, '4,1', '17,8', 9], 28],
    'upgrade-reserve': [[3, 2, 4, 0.1], { additional: 130, reserve: 13, total: 143 }],
    'rebuild-budget': [[3, 2, 5, 2, 0.5], { reclaimed: 17, needed: 74, buy: 57 }],
    'border-replacement': [[3, 2, 1], 24],
    'foundation-excavation': [[3, 2, 1, 2], 98],
    'base-fit': [[9, 8, 4, 3, 4], { clearances: [0, -1, -1], fits: false }],
    'layer-levels': [[-3, -5, 4], { levels: [-4, -5, -6, -7], belowFloor: 2 }],
    'beam-obstructions': [
      ['[[1,3,2],[2,0,2]]', '[[1,9,2],[1,0,2],[1,5,2],[2,0,2]]'],
      [5, null],
    ],
    'beam-conflicts': [['[[1,3,2],[2,0,2],[1,7,2],[1,6,2]]'], [[1, 3, 4]]],
    'beam-windows': [
      ['[[1,3,2],[2,0,2]]', '4,5', 2],
      [
        [1, 4, 2],
        [1, 5, 2],
        [2, 5, 2],
        [2, 6, 2],
      ],
    ],
    'glass-palette-stock': [
      ['1,2,3', '4,3,0', 2],
      [0, 1, 6],
    ],
    'beam-sleeve': [[3, 2, 1, 1], 35],
    'service-uptime': [['[[5,8],[-1,2],[1,3],[9,11]]', 0, 10], { duration: 7, fraction: 0.7 }],
    'rotation-coverage': [[2, 5, 3], { cycle: 7, uncovered: 1 }],
    'minimum-radius': [['[[0,0]]', '[[-4,2],[1,3]]'], 4],
    'uncovered-stations': [['[[0,0],[4,0]]', '1,2', '[[1,1],[2,2],[2,3]]'], [3]],
    'shared-stations': [
      ['[[0,0],[4,0],[7,0]]', 2, '[[1,1],[2,2],[6,1]]'],
      [
        { station: 2, sites: [1, 2] },
        { station: 3, sites: [2, 3] },
      ],
    ],
    'backup-radius': [['[[0,0],[5,0],[8,0]]', '[[1,0],[7,-2]]'], 4],
    'station-assignment': [
      ['[[0,0],[4,0]]', 2, '[[1,1],[2,2],[4,0],[2,3]]'],
      [1, 1, 2, null],
    ],
    'candidate-site': [['[[0,0],[1,0],[2,0]]', '[[0,0],[3,1]]'], { site: 2, radius: 2 }],
    'coverage-columns': [['[[0,0],[2,0],[0,0],[5,-3]]', 1], 24],
    'upgrade-impact': [
      ['[[0,0],[5,0]]', 1, 2, '[[1,1],[2,2],[5,-3],[6,-2]]'],
      [2, 4],
    ],
    'served-floors': [
      [10, 3, 2, '6,7,12,13,9'],
      [2, 3, 5],
    ],
  },
};

for (const group of CONSTRUCTION_GROUPS) {
  const commands = group.commands.map(({ signature }) => signature.split(' ')[0]);
  test(`${group.name} has exactly 25 covered calculations`, () => {
    assert.equal(commands.length, 25);
    assert.deepEqual([...commands].sort(), Object.keys(cases[group.name]).sort());
  });
  for (const [name, [inputs, expected]] of Object.entries(cases[group.name])) {
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
