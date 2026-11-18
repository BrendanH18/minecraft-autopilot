import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateOffline } from '../src/offline-kit.js';
import { gardenGroups } from '../src/planning-gardens.js';
import { testStudyWorkflows } from './planning-study-workflow-checks.js';

const orchardCases = [
  ['planting-grid', [17, 11, 1, 2, 4, 3], { rows: 3, perRow: 4, trees: 12 }],
  ['staggered-sites', [10, 5, 4, 2], { odd: 3, even: 2, trees: 13 }],
  ['canopy-gaps', ['4,10,13', '2,2,2'], [1, -2]],
  ['headland-extension', [4, 3, 2, 11], 3],
  ['underplant-strips', ['3,9,13', 2, 3], [0, 1, 3]],
  ['trunk-guards', ['1,2', 1, '0,2'], [16, 18]],
  ['boundary-posts', [10, 6, 4], 10],
  ['tree-address', ['3,0,2,4', 7], { row: 4, column: 3 }],
  [
    'replant-stock',
    ['4,3', '1,4', '8,11'],
    [
      { planted: 4, vacant: 0, remaining: 4 },
      { planted: 2, vacant: 1, remaining: 3 },
    ],
  ],
  ['nursery-release', ['8,3,14', '1,4,4', 5], [1, 0, 2]],
  ['thin-row', [10, 3, 2], [2, 5, 8]],
  [
    'stocktake',
    ['11,6', '7,6', '1,0'],
    [
      { missing: 3, replant: 4 },
      { missing: 0, replant: 0 },
    ],
  ],
  ['rotation-rows', [11, 4, 6], [2, 6, 10]],
  ['rest-window', ['0,8', '4,5', 10], [0, 3]],
  ['log-forecast', ['7,3', '4,5', '2,4'], [20, 0]],
  ['quota-cut', ['2,5,3', '3,4,5', 13], { cuts: [2, 2, 0], logs: 14, shortfall: 0 }],
  ['axe-budget', ['8,5', '4,9,1', 2], { usable: 9, shortfall: 4 }],
  ['unload-rows', ['3,7,6,5', 10], { before: [3, 4], finalLoad: 5 }],
  ['collection-distance', ['5,3,1', '2,3,4'], 15],
  [
    'ladder-allocation',
    ['2,9,4', 3, 5],
    [
      { assigned: 0, accessible: true },
      { assigned: 0, accessible: false },
      { assigned: 1, accessible: true },
    ],
  ],
  ['harvest-priority', ['6,9,0,4', '3,3,2,2'], [2, 1, 4, 3]],
  [
    'deadwood-run',
    ['1,1,0,1,0,1,1,1', 2],
    [
      { first: 1, last: 2 },
      { first: 6, last: 8 },
    ],
  ],
  ['reserve-splits', [8, 4, 4, 18], { split: 4, raw: 4, planks: 16, shortfall: 2 }],
  ['harvest-waves', ['4,6,1,10', 10], [1, 1, 2, 3]],
  [
    'sapling-ledger',
    [2, '3,0,4', '2,5,1'],
    [
      { stock: 3, unfilled: 0 },
      { stock: 0, unfilled: 2 },
      { stock: 3, unfilled: 0 },
    ],
  ],
];

const greenhouseCases = [
  ['wall-glazing', [7, 5, 4, 6], 74],
  ['gable-infill', [8, 2, 2], 24],
  ['ridge-roof', [3, 8, 1], { sides: 60, ridge: 10, total: 70 }],
  ['frame-stations', [12, 4], [0, 4, 8, 11]],
  ['frame-infill', ['2,6,11', -1, 4], [12, 16]],
  ['door-clearance', ['2,3,2', '4,2,3', 2, 3], [1, 3]],
  ['bed-cross-section', [17, 1, 4, 2], { beds: 2, spare: 5 }],
  ['bench-levels', [14, 1, 3, 1], 3],
  ['planter-fill', ['5,3', '2,4', '3,1'], { planters: [30, 12], total: 42 }],
  ['bed-edging', [7, 5, 1, 2], 40],
  ['channel-stripes', [12, 2], [3, 8, 12]],
  ['channel-crossings', ['2,1', '2,3'], 15],
  ['water-service', ['10,7,4', '1,5,0', 2], [7, 2, 4]],
  ['lamp-drop', [12, '5,6', '3,1'], [2, 3]],
  [
    'shade-panels',
    ['10,8,7', '8,7,0', 3],
    [
      { panels: 3, extra: 1 },
      { panels: 3, extra: 1 },
      { panels: 0, extra: 0 },
    ],
  ],
  ['vent-spacing', [20, 2, 3, 2], { vents: 3, solid: 11 }],
  ['glass-orders', [20, 16, 6, 7], { crafts: 2, sparePanes: 12, buyGlass: 5 }],
  [
    'seed-trays',
    ['25,7', 5, '2,1'],
    [
      { fullTrays: 2, partialCells: 2, looseSeeds: 1 },
      { fullTrays: 1, partialCells: 2, looseSeeds: 0 },
    ],
  ],
  [
    'transplant-order',
    ['3,0,5', '0,4,2'],
    {
      placements: [
        { variety: 1, bed: 2, moved: 3 },
        { variety: 3, bed: 2, moved: 1 },
        { variety: 3, bed: 3, moved: 2 },
      ],
      unusedCells: 0,
      unplaced: 2,
    },
  ],
  [
    'cycle-calendar',
    ['3,7', '5,2', '1,0'],
    [
      { harvest: 8, resow: 9 },
      { harvest: 9, resow: 9 },
    ],
  ],
  ['crop-turns', ['1,9,11', '3,4,2', 10], [4, 1, 0]],
  ['crop-changeover', ['2,1,2', '1,1,3', '3,4,5'], { beds: [1, 3], cells: 8 }],
  ['compost-runs', ['15,4,13', '2,5,4', 7, 2], { runs: 3, remaining: 1, output: 6 }],
  ['picking-window', ['2,5,8', '4,7,8', 5], ['overdue', 'pickable', 'waiting']],
  ['aisle-cart', ['2,7,4', 3, 1], [3, 0, 1]],
];

for (const [i, cases] of [orchardCases, greenhouseCases].entries()) {
  const group = gardenGroups[i];
  test(`every ${group.name} command has an expected result`, () => {
    assert.deepEqual(
      group.commands.map((spec) => spec.signature.split(' ')[0]),
      cases.map(([name]) => name),
    );
  });
  for (const [name, args, expected] of cases) {
    test(`${group.name} ${name}`, () => assert.deepEqual(calculateOffline(group, name, args).result, expected));
    testStudyWorkflows(group.name, name, args, expected);
  }
}

test('a canopy contained inside its neighbor overlaps only its own width', () => {
  assert.deepEqual(calculateOffline(gardenGroups[0], 'canopy-gaps', ['10,12', '8,1']).result, [-3]);
});

test('garden plans reject inconsistent fixtures and bound generated lists', () => {
  const [orchard, greenhouse] = gardenGroups;
  assert.throws(() => calculateOffline(orchard, 'canopy-gaps', ['3,2', '1,0']), /increase/);
  assert.throws(() => calculateOffline(orchard, 'rotation-rows', [1001, 1, 1]), /1000/);
  assert.throws(() => calculateOffline(greenhouse, 'wall-glazing', [3, 4, 2, 21]), /exceed/);
  assert.throws(() => calculateOffline(greenhouse, 'planter-fill', ['2', '2,2', '1']), /equal lengths/);
});
