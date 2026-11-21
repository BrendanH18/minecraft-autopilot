import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateOffline } from '../src/offline-kit.js';
import { muralGroup } from '../src/planning-mural.js';
import { testStudyWorkflows } from './planning-study-workflow-checks.js';

const raster = (width, height, pixels) => ({ width, height, pixels });
// 1 1 0
// 0 2 1
const base = [3, '1,1,0,0,2,1'];
const cases = [
  ['turn-right', [], raster(2, 3, [0, 1, 2, 1, 1, 0])],
  ['mirror-proof', [], raster(3, 2, [0, 1, 1, 1, 2, 0])],
  ['cut-panel', [1, 0, 2, 2], raster(2, 2, [1, 0, 2, 1])],
  ['magnify', [2], raster(6, 4, [1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 2, 2, 1, 1, 0, 0, 2, 2, 1, 1])],
  ['repeat-field', [1, 2], raster(3, 4, [1, 1, 0, 0, 2, 1, 1, 1, 0, 0, 2, 1])],
  ['mat-border', [1, 8], raster(5, 4, [8, 8, 8, 8, 8, 8, 1, 1, 0, 8, 8, 0, 2, 1, 8, 8, 8, 8, 8, 8])],
  ['trim-ground', [0], raster(3, 2, [1, 1, 0, 0, 2, 1])],
  ['stencil-overlay', [2, '3,0,4,5', -1, 0, 0], raster(3, 2, [1, 1, 0, 5, 2, 1])],
  ['flood-recolor', [0, 0, 8], raster(3, 2, [8, 8, 0, 0, 2, 1])],
  [
    'patch-census',
    [],
    [
      { color: 1, first: 0, area: 2 },
      { color: 0, first: 2, area: 1 },
      { color: 0, first: 3, area: 1 },
      { color: 2, first: 4, area: 1 },
      { color: 1, first: 5, area: 1 },
    ],
  ],
  ['outline-mask', [0], raster(3, 2, [1, 1, 0, 0, 1, 1])],
  [
    'color-seams',
    [],
    [
      { low: 0, high: 1, edges: 3 },
      { low: 1, high: 2, edges: 2 },
      { low: 0, high: 2, edges: 1 },
    ],
  ],
  ['layer-stencil', [2], raster(3, 2, [0, 0, 0, 0, 1, 0])],
  [
    'repair-list',
    ['1,0,0,0,2,8'],
    [
      { x: 1, y: 0, color: 1 },
      { x: 2, y: 1, color: 1 },
    ],
  ],
  [
    'row-runs',
    [0],
    [
      { x: 0, color: 1, length: 2 },
      { x: 2, color: 0, length: 1 },
    ],
  ],
  ['color-bounds', [2], { left: 1, right: 1, top: 1, bottom: 1 }],
  ['snake-loadout', [], [1, 1, 0, 1, 2, 0]],
  ['coarsen', [2], raster(2, 1, [1, 0])],
  ['relief-layers', ['2,3,4'], { columns: [3, 3, 2, 2, 4, 3], blocks: 17 }],
  ['half-turn-errors', [], [[1, 4]]],
  [
    'panel-palette',
    [2, 1],
    [
      { x: 0, y: 0, colors: [1] },
      { x: 2, y: 0, colors: [0] },
      { x: 0, y: 1, colors: [0, 2] },
      { x: 2, y: 1, colors: [1] },
    ],
  ],
  ['shift-art', [1, -1, 7], raster(3, 2, [7, 0, 2, 7, 7, 7])],
  ['dither-mix', [8, 9, 1], raster(3, 2, [8, 9, 0, 0, 2, 9])],
  [
    'registration-marks',
    [0],
    [
      { first: 0, last: 1 },
      { first: 1, last: 2 },
    ],
  ],
  [
    'palette-kits',
    [2],
    [
      { color: 1, stacks: 1, loose: 1 },
      { color: 0, stacks: 1, loose: 0 },
      { color: 2, stacks: 0, loose: 1 },
    ],
  ],
];

test('mural fixtures cover every command in catalog order', () => {
  assert.deepEqual(
    muralGroup.commands.map((spec) => spec.signature.split(' ')[0]),
    cases.map(([name]) => name),
  );
});
for (const [name, args, expected] of cases) {
  testStudyWorkflows('mural', name, [...base, ...args], expected);
}
test('mural rejects incomplete rows, bad bounds and oversized transforms', () => {
  const run = (name, ...args) => calculateOffline(muralGroup, name, args).result;
  assert.throws(() => run('turn-right', 2, '0,0,0'), /Width/);
  assert.throws(() => run('cut-panel', ...base, 2, 0, 2, 1), /exceeds/);
  assert.throws(() => run('magnify', ...base, 1000000), /limited/);
  assert.equal(run('trim-ground', 2, '0,0', 0), null);
  assert.deepEqual(run('trim-ground', 3, '0,0,0,0,1,0', 0), raster(1, 1, [1]));
});
