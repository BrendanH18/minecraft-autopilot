import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateOffline } from '../src/offline-kit.js';
import { textileGroup } from '../src/planning-textiles.js';
import { testStudyWorkflows } from './planning-study-workflow-checks.js';

const cases = [
  ['stripe-layout', [5, 2, '2,6', '2,1'], [2, 2, 6, 2, 2, 2, 2, 6, 2, 2]],
  ['checker-layout', [3, 2, 2, 1, '4,8'], [4, 4, 8, 8, 8, 4]],
  ['ring-layout', [3, 3, 1, '5,7'], [5, 5, 5, 5, 7, 5, 5, 5, 5]],
  ['chevron-layout', [5, 2, 2, '2,4,8'], [2, 8, 4, 8, 2, 4, 2, 8, 2, 4]],
  ['twill-layout', [4, 2, 2, 1, -1, '1,3'], [1, 1, 3, 1, 1, 3, 1, 1]],
  ['diamond-layout', [4, 2, 2, 2, '1,2,3'], [3, 2, 3, 1, 2, 1, 2, 3]],
  ['gingham-layout', [3, 2, 1, 1, '1,7,9'], [9, 7, 9, 7, 1, 7]],
  ['tile-motif', [3, 3, 2, '1,2,3,4', 1], [1, 2, 1, 3, 4, 3, 2, 1, 2]],
  ['loom-draft', ['1,2,1', '1,2', '4,6,8', '3,5'], [4, 3, 8, 5, 6, 5]],
  ['braid-layout', ['1,2,3', 3], [1, 2, 3, 2, 1, 3, 2, 3, 1]],
  ['bookmatch', [3, '1,2,3,4,5,6', 1], [1, 2, 3, 2, 1, 4, 5, 6, 5, 4]],
  [
    'fringe-ends',
    [3, '1,1,1,2,2,2', 2, 4],
    [
      { column: 1, row: 0, color: 4 },
      { column: 3, row: 0, color: 4 },
      { column: 1, row: 3, color: 4 },
      { column: 3, row: 3, color: 4 },
    ],
  ],
  ['palette-remap', ['1,2,5,2', '1,2', '2,1'], [2, 1, 5, 1]],
  [
    'color-takeoff',
    ['2,1,2,11'],
    [
      { color: 1, count: 1 },
      { color: 2, count: 2 },
      { color: 11, count: 1 },
    ],
  ],
  ['warp-floats', [2, '1,2,1,3,2,3', '1,3'], [2, 2]],
  ['runner-alignment', ['7,8,4', 3, 1], [{ left: 2, right: 2 }, { left: 2, right: 3 }, null]],
  ['shearing-rounds', ['5,1,0', '2,0,0', 2], [2, null, 0]],
  [
    'reuse-balance',
    ['3,3,1,4', '3,1,0,2'],
    [
      { color: 1, reuse: 1, bring: 0, return: 0 },
      { color: 2, reuse: 0, bring: 0, return: 1 },
      { color: 3, reuse: 0, bring: 1, return: 0 },
      { color: 4, reuse: 0, bring: 1, return: 0 },
    ],
  ],
  [
    'wool-orders',
    ['3,1,1,1,1,1', '1,0,3'],
    [
      { color: 1, batches: 2, wool: 4, craftedSurplus: 2 },
      { color: 3, batches: 0, wool: 0, craftedSurplus: 0 },
    ],
  ],
  ['haul-slots', ['1,1,1,2,3', 2, 3], { stacks: 4, trips: 2 }],
  ['stock-frontier', [2, '1,1,2,2', '3,1'], { placed: 3, blocked: { column: 2, row: 2, color: 2 } }],
  ['patch-junctions', ['2,1,4', '3,2,2'], [3]],
  ['align-edges', ['3,1,2', '2,3,1'], { shift: 1, matches: 3 }],
  ['repeat-unit', ['1,2,1,1,2,1'], [1, 2, 1]],
  [
    'dye-lots',
    ['3,4,1', '1,0,2', '3,4,0', 3],
    {
      lots: [
        { dye: 2, missing: 0 },
        { dye: 1, missing: 3 },
        { dye: 0, missing: 0 },
      ],
      blankLeft: 0,
    },
  ],
];

const run = (name, ...args) => calculateOffline(textileGroup, name, args).result;

test('textile has exactly 25 distinct fixture-covered planners', () => {
  assert.equal(new Set(cases.map(([name]) => name)).size, 25);
  assert.deepEqual(
    textileGroup.commands.map(({ signature }) => signature.split(' ')[0]),
    cases.map(([name]) => name),
  );
});

for (const [name, args, expected] of cases) {
  testStudyWorkflows(textileGroup.name, name, args, expected);
  test(`textile ${name}`, () => assert.deepEqual(run(name, ...args), expected));
}

test('textile validates swatches, stock and expanded output', () => {
  assert.throws(() => run('ring-layout', 1000, 2, 1, '1'), /1000/);
  assert.throws(() => run('warp-floats', 2, '1,2,3', '1,2'), /complete rows/);
  assert.throws(() => run('checker-layout', 2, 2, 1, 1, '1,2,3'), /two check/);
  assert.throws(() => run('color-takeoff', '17'), /16/);
  assert.throws(() => run('palette-remap', '1', '1,1', '2,3'), /once/);
  assert.throws(() => run('patch-junctions', '2,2', '3'), /same width/);
  assert.throws(() => run('shearing-rounds', '2,1', '1', 3), /equal lengths/);
  assert.throws(() => run('wool-orders', '1', Array(17).fill(0).join(',')), /16/);
  assert.deepEqual(run('align-edges', '2,2', '1,1'), { shift: 0, matches: 0 });
  assert.deepEqual(run('repeat-unit', '1,1,2'), [1, 1, 2]);
  assert.deepEqual(run('stock-frontier', 1, '1', '1'), { placed: 1, blocked: null });
  assert.deepEqual(run('bookmatch', 2, '1,2', 0), [1, 2, 2, 1]);
});

test('dye lots treat omitted trailing stock as empty', () => {
  assert.deepEqual(run('dye-lots', '3,4', '1', '3,4', 3), {
    lots: [
      { dye: 2, missing: 0 },
      { dye: 1, missing: 3 },
    ],
    blankLeft: 0,
  });
});
