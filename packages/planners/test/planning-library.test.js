import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateOffline } from '../src/offline-kit.js';
import { libraryGroup } from '../src/planning-library.js';
import { testStudyWorkflows } from './planning-study-workflow-checks.js';

const examples = [
  [
    'vacancy-runs',
    ['0,0,2,0'],
    [
      { start: 1, end: 2 },
      { start: 4, end: 4 },
    ],
  ],
  ['series-fit', ['0,0,0,1,0,0', 2], { start: 5, end: 6, spare: 0 }],
  [
    'compact-moves',
    ['7,0,4,4'],
    [
      { id: 4, from: 3, to: 2 },
      { id: 4, from: 4, to: 3 },
    ],
  ],
  ['shelf-mask', ['4,0,0,9,0,8'], 41],
  ['pull-slips', ['8,0,8', '8,8,5'], [1, 3, null]],
  ['desk-trip', [4, '8,3,1'], { first: 1, last: 8, distance: 10 }],
  ['swap-count', ['7,2,9,4', '9,7,2,4'], 2],
  [
    'inventory-delta',
    ['7,7,3', '7,2,3'],
    [
      { id: 2, expected: 0, observed: 1 },
      { id: 7, expected: 2, observed: 1 },
    ],
  ],
  [
    'missing-serials',
    [4, 12, '8,8,5,9'],
    [
      [4, 4],
      [6, 7],
      [10, 12],
    ],
  ],
  ['next-accession', ['1,4,6,6,12', 3, 3], { first: 7, last: 9 }],
  ['edition-audit', ['2,1,2', '3,3,2', '3,3'], [{ copy: 3, title: 2, edition: 2, current: 3 }]],
  [
    'catalog-tabs',
    ['2,4,9,11,19', 2],
    [
      { tab: 1, first: 2, last: 4 },
      { tab: 2, first: 9, last: 11 },
      { tab: 3, first: 19, last: 19 },
    ],
  ],
  ['cross-references', ['3,3,2', 1], { path: [1, 3, 2], cycleAt: 3 }],
  [
    'subject-index',
    ['2,1,2,2', '4,3,1,4'],
    [
      { subject: 1, titles: [3] },
      { subject: 2, titles: [1, 4] },
    ],
  ],
  ['reading-order', ['3,0,2,0'], [2, 3, 1, 4]],
  ['hold-slips', ['1,0', '2,1,2,1'], [1, 0, 2, 1]],
  [
    'recall-list',
    ['11,5,4,9', '3,6,3,12', 10],
    [
      { id: 4, late: 7 },
      { id: 11, late: 7 },
      { id: 5, late: 4 },
    ],
  ],
  ['renewal-dates', ['5,5,7,1', '0,2,0,0', '1,1,0,1', 4, 5], [9, null, null, null]],
  ['loan-peak', ['1,2,3', '3,4,6'], { peak: 2, day: 2 }],
  [
    'reserve-copy',
    ['5,1', '2,2,7', 3],
    [
      { copy: 2, start: 2, due: 5 },
      { copy: 1, start: 5, due: 8 },
      { copy: 2, start: 7, due: 10 },
    ],
  ],
  [
    'branch-transfer',
    ['4,0,3,1', '1,4,2,2'],
    {
      moves: [
        { from: 1, to: 2, copies: 3 },
        { from: 3, to: 2, copies: 1 },
      ],
      shortages: [0, 0, 0, 1],
    },
  ],
  [
    'return-sort',
    ['2,1,1,2,1,1', 2],
    [
      { after: 3, branch: 1 },
      { after: 4, branch: 2 },
      { after: 6, branch: 1 },
    ],
  ],
  ['preservation-copies', ['0,4,1', '1,1,5', 2], { branchA: [2, 0, 1], branchB: [1, 1, 0] }],
  [
    'shelf-reading',
    ['0,8,0,3,3,2'],
    [
      [2, 4],
      [5, 6],
    ],
  ],
  ['rotation-picks', ['3,1,4,1,0', '1,2,0,8,0', 3], [2, 4, 1]],
];

function run(name, ...args) {
  return calculateOffline(libraryGroup, name, args).result;
}
test('library-plan has exactly 25 distinct fixture-covered commands', () => {
  assert.equal(new Set(examples.map(([name]) => name)).size, 25);
  assert.deepEqual(
    libraryGroup.commands.map(({ signature }) => signature.split(' ')[0]),
    examples.map(([name]) => name),
  );
});
for (const [name, args, expected] of examples) {
  test(`library-plan ${name}`, () => assert.deepEqual(run(name, ...args), expected));
  testStudyWorkflows(libraryGroup.name, name, args, expected);
}
test('library plans handle full shelves, empty catalogs, immediate returns and cyclic prerequisites', () => {
  assert.deepEqual(run('vacancy-runs', '2'), []);
  assert.equal(run('series-fit', '0,2,0', 2), null);
  assert.deepEqual(run('inventory-delta', '', ''), []);
  assert.deepEqual(run('missing-serials', 1, 1000000, ''), [[1, 1000000]]);
  assert.deepEqual(run('loan-peak', '2,2', '2,2'), { peak: 0, day: null });
  assert.deepEqual(run('cross-references', '2,0', 1), { path: [1, 2], cycleAt: null });
  assert.throws(() => run('reading-order', '2,1'), /cycle/);
  assert.throws(() => run('swap-count', '1,1', '1,2'), /unique/);
  assert.throws(() => run('swap-count', '1,2', '2,3'), /same volumes/);
  assert.throws(() => run('shelf-mask', '1,0'), /six/);
  assert.throws(() => run('hold-slips', '1,2', '3'), /Title/);
  assert.equal(run('next-accession', '', 1000000, 2), null);
  assert.equal(run('next-accession', '1000000', 1000000, 1), null);
  assert.deepEqual(run('next-accession', '', 1000000, 1), { first: 1000000, last: 1000000 });
  assert.throws(() => run('reserve-copy', '0', '3,2', 1), /chronological/);
});
