import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateOffline } from '../src/offline-kit.js';
import { settlementGroups } from '../src/planning-settlements.js';
import { testStudyWorkflows } from './planning-study-workflow-checks.js';

const cases = {
  maproom: [
    ['scale-span', [3], { blocks: 1024, blocksPerPixel: 8 }],
    ['minimum-scale', [129, 255], 1],
    ['tile-address', [-66, -64, 128], { tile: -1, offset: 126 }],
    ['tile-corners', [-1, 1, -64, -64, 128], { west: -192, north: 64, east: -65, south: 191 }],
    ['region-tiles', [-65, 64, -64, 63, -64, -64, 128], { columns: 3, rows: 1, tiles: 3 }],
    ['pixel-address', [-49, -64, 2], 3],
    ['pixel-footprint', [127, -64, 2], { first: 444, last: 447 }],
    ['wall-number', [3, 2, 4], 10],
    ['wall-cell', [9, 4], { row: 3, column: 1 }],
    ['survey-order', [3, 3], [1, 2, 3, 6, 5, 4, 7, 8, 9]],
    ['wall-border', [4, 3, 2], 44],
    ['spare-frames', [4, '2,2,4'], 2],
    ['map-copies', ['3,1,0', '1,2,0'], [2, 0, 0]],
    ['lock-supplies', ['4,5', '4,1'], 4],
    ['zoom-stages', ['0,2,3', 3], 4],
    ['atlas-pages', [5, 3, 3, 2], { pages: 4, unused: 9 }],
    ['seam-length', [3, 2, 128], 896],
    [
      'marker-clusters',
      ['10,-1,0,7,-5', 10],
      [
        { strip: -1, markers: 2 },
        { strip: 0, markers: 2 },
        { strip: 1, markers: 1 },
      ],
    ],
    ['waypoint-pages', ['-65,20,-66,200', -64, 128], [-1, 0, 2]],
    ['missing-tiles', [5, '3,1,1'], [2, 4, 5]],
    ['refresh-queue', ['7,4,4,1', 10, 3], [4, 2, 3]],
    ['tile-overlap', [-2, 5, 1, 4], 2],
    ['wall-extension', [3, 2, 1, 2, 1, 0], { added: 12, oldFirst: 8 }],
    ['survey-distance', [3, 2, 10, 15], 55],
    ['orientation-turns', ['7,2,0', '1,2,7', 8], [2, 0, 7]],
  ],
  bookbind: [
    ['chapter-starts', ['3,1,5', 2], [3, 6, 7]],
    ['page-entry', ['3,1,5', 5], { entry: 3, offset: 1 }],
    ['facing-starts', ['3,4,1'], { first: [1, 5, 9], blanks: 1 }],
    ['volume-split', ['3,2,1,5', 5], [1, 1, 2, 3]],
    ['continued-chapter', [5, 4, 5], { first: { volume: 1, page: 5 }, last: { volume: 2, page: 3 } }],
    ['paragraph-pages', ['3,3,1,2', 4], [3, 4, 2]],
    ['contents-pages', [11, 5, 2], { contents: 3, bodyStart: 6 }],
    [
      'index-hits',
      ['8,3,5,4,8'],
      [
        { start: 3, end: 5 },
        { start: 8, end: 8 },
      ],
    ],
    ['errata-volumes', ['8,2,9', '3,4,3'], [1, 3]],
    ['signature-folds', [25, 4], { signatures: 2, sheets: 8, blankFaces: 7 }],
    ['copy-materials', ['3,2', 7, 3, 4], { ready: 3, missingBooks: 0, missingInks: 2, missingFeathers: 1 }],
    ['edition-run', [2, 3, '8,5'], 3],
    ['print-priority', ['3,4,5', 5], [3, 2, 0]],
    ['library-sets', ['7,8', '2,3'], { sets: 2, remaining: [3, 2] }],
    [
      'shelf-labels',
      ['4,2,3', 3],
      [
        { first: 1, last: 2 },
        { first: 2, last: 2 },
        { first: 3, last: 3 },
      ],
    ],
    ['chiseled-slot', [14, 6, 2], { row: 2, column: 1, slot: 2 }],
    ['lectern-signals', [8, 4], 7],
    [
      'reading-clocks',
      ['3,0,2', 5, 10],
      [
        { begin: 10, end: 25 },
        { begin: 25, end: 25 },
        { begin: 25, end: 35 },
      ],
    ],
    ['copy-collation', ['1,2,4', 4], { position: 3, expected: 3, actual: 4 }],
    ['revised-pagination', ['3,4,5', '2,6,5'], { shifts: [0, -1, 1], delta: 1 }],
    ['citation-remap', ['3,4,5', '2,6,5', 9], 10],
    [
      'serial-range',
      [11, '3,2'],
      [
        { first: 11, last: 13 },
        { first: 14, last: 15 },
      ],
    ],
    [
      'loan-balances',
      ['4,1', '0,2', '6,1'],
      [
        { left: 0, unfilled: 2 },
        { left: 2, unfilled: 0 },
      ],
    ],
    ['folio-imposition', [4, 2], { front: [14, 3], back: [4, 13] }],
    ['abridgement', ['8,3,5', '6,1,3', 11], [7, 1, 3]],
  ],
  bannerhall: [
    ['stripe-order', ['2,5,3', 5, -1], [3, 2, 5, 3, 2]],
    ['mirror-wing', ['2,3', 8], [2, 3, 8, 3, 2]],
    ['symmetry-repairs', ['2,3,1,4,2'], [{ position: 4, color: 3 }]],
    [
      'palette-totals',
      ['3,2,3', '1,2,5'],
      [
        { color: 3, banners: 6 },
        { color: 2, banners: 2 },
      ],
    ],
    ['material-cuts', ['5,7,11', 6, 5], 2],
    [
      'layer-capacity',
      ['2,5', '3,3', 6],
      [
        { accepted: 3, rejected: 0 },
        { accepted: 1, rejected: 2 },
      ],
    ],
    ['layer-prefix', ['1,3,5,6', '1,3,7'], { shared: 2, firstOnly: [5, 6], secondOnly: [7] }],
    ['wash-down', ['2,4,1', '2'], 2],
    [
      'dye-budget',
      ['1,3,3', 2, '4,0,3'],
      [
        { left: 2, short: 0 },
        { left: 0, short: 0 },
        { left: 0, short: 1 },
      ],
    ],
    ['motif-frequency', ['2,2,2', '2,2'], 2],
    ['palette-remap', ['1,2,3,1', '1,2', '2,4'], [2, 4, 3, 2]],
    ['loom-load', ['4,2', '3,5', 7], 154],
    ['master-copy-savings', ['4,2,6', '3,5,0'], { savedLayers: 16, copies: 6 }],
    ['hanger-spacing', [12, 2, 3], [2, 5, 8]],
    ['center-line', [12, 3, 1], { left: 3, right: 4, occupied: 5 }],
    ['door-clearance', ['1,2,4,5,6,7', 3, 2, 1], [2, 4, 5]],
    [
      'paired-standards',
      ['1,1,3,2', '1,3,3'],
      [
        { color: 1, pairs: 1 },
        { color: 3, pairs: 1 },
        { color: 2, pairs: 0 },
      ],
    ],
    ['height-profile', ['3,4,7', 8, 2], [3, 2, -1]],
    [
      'visibility-runs',
      ['0,1,1,0,1'],
      [
        { first: 2, last: 3 },
        { first: 5, last: 5 },
      ],
    ],
    ['rotation-match', ['3,2,1,2', '2,1,2,3'], 1],
    ['batch-changeovers', ['2,2,1,2', 4], 8],
    ['template-checkout', ['7,3,7,9', '3,1'], [7, 9]],
    ['packing-stacks', ['3,2,3', '4,1,3', 6], 3],
    ['replacement-plan', ['1,2,2,3', '2,1,4,4', '4'], { moves: 4, needed: [4] }],
    [
      'layer-diff',
      ['1,2,3', '1,4'],
      [
        { position: 2, from: 2, to: 4 },
        { position: 3, from: 3, to: null },
      ],
    ],
  ],
};

for (const group of settlementGroups) {
  test(`${group.name} inventory`, () => {
    assert.equal(group.commands.length, 25);
    assert.deepEqual(
      group.commands.map((cmd) => cmd.signature.split(' ')[0]),
      cases[group.name].map(([name]) => name),
    );
  });
  for (const [cmd, args, expected] of cases[group.name]) {
    test(`${group.name} ${cmd}`, () => assert.deepEqual(calculateOffline(group, cmd, args).result, expected));
    testStudyWorkflows(group.name, cmd, args, expected);
  }
}

test('settlement planner boundaries', () => {
  const [maps, books, banners] = settlementGroups;
  const calc = (group, cmd, ...args) => calculateOffline(group, cmd, args).result;
  assert.equal(calc(maps, 'minimum-scale', 2049, 1), null);
  assert.throws(() => calc(maps, 'region-tiles', 1, 0, 0, 0, 0, 0, 128), /ordered/);
  assert.throws(() => calc(maps, 'pixel-address', 128, 0, 0), /inside/);
  assert.throws(() => calc(maps, 'missing-tiles', 1002, '1'), /1000/);
  assert.deepEqual(calc(maps, 'missing-tiles', 2, ''), [1, 2]);
  assert.equal(calc(books, 'lectern-signals', 1, 1), 15);
  assert.deepEqual(calc(books, 'copy-collation', '', 3), { position: 1, expected: 1, actual: null });
  assert.throws(() => calc(books, 'copy-collation', '0', 1), /positive/);
  assert.deepEqual(calc(banners, 'layer-diff', '1', ''), [{ position: 1, from: 1, to: null }]);
  assert.deepEqual(calc(banners, 'layer-diff', '', '2'), [{ position: 1, from: null, to: 2 }]);
  assert.throws(() => calc(banners, 'layer-diff', '', '0'), /positive/);
  assert.equal(calc(books, 'edition-run', 0, 4, '1'), null);
  assert.equal(calc(books, 'citation-remap', '2,4', '0,4', 1), null);
  assert.throws(() => calc(books, 'volume-split', '2,5', 4), /fit/);
  assert.equal(calc(banners, 'wash-down', '2,3', '3'), null);
  assert.equal(calc(banners, 'wash-down', '2,3', ''), 2);
  assert.equal(calc(banners, 'rotation-match', '1,2', '1,3'), null);
  assert.throws(() => calc(banners, 'mirror-wing', Array(500).fill(1).join(','), 2), /1000/);
});
