import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateOffline } from '../src/offline-kit.js';
import { crossingGroups } from '../src/planning-crossings.js';
import { testStudyWorkflows } from './planning-study-workflow-checks.js';

const harborplanCases = [
  ['quay-frontage', ['3,5,4', 2, 1], 18],
  ['berth-count', [19, 5, 2], 3],
  ['berth-assignment', ['9,4,6', '4,7,8,5'], [2, 1, 0, 3]],
  ['finger-decks', ['2,3', 3, 2], 30],
  ['pile-cuts', ['-3,0,2', 4, 1], [8, 5, 3]],
  ['breakwater-shell', [6, 5, 4, 1], 96],
  ['dredge-cuts', ['2,5,1', 4, 3], 15],
  [
    'depth-windows',
    ['4,5,2,5', 3, 1],
    [
      [1, 2],
      [4, 4],
    ],
  ],
  ['turning-basin', [8, 2, 11, 20], { widthShort: 1, lengthShort: 0 }],
  ['fender-offsets', [9, 3], [0, 2, 5, 8]],
  ['terminal-gates', ['4,1,0,5', 2], [2, 1, 0, 3]],
  ['gangway-run', [7, 3, 4], 12],
  [
    'cargo-manifest',
    ['8,3', 4],
    [
      { full: 2, partial: 0, loose: 0 },
      { full: 0, partial: 1, loose: 3 },
    ],
  ],
  ['shuttle-clock', [11, 5, 7, 4, 2], 33],
  [
    'unload-order',
    ['10,2,6', '3,1,3'],
    [
      { vessel: 2, ticks: 2 },
      { vessel: 3, ticks: 2 },
      { vessel: 1, ticks: 4 },
    ],
  ],
  ['dock-appointments', ['1,2,9', '4,3,2'], [5, 8, 11]],
  ['bollard-pairs', ['0,2,2,5,8', 3, 5], 3],
  ['tide-steps', [5, '1,3,6', 2], [2, 1, 0]],
  ['fairway-width', ['2,4', 1, 3], 11],
  ['drydock-pump', [4, 3, 2, 2, 4, 2], 4],
  ['yard-stack', [27, 3, 4, 2], { stored: 24, layers: 2, overflow: 3 }],
  ['channel-buoys', ['7,2', 3], 10],
  ['slipway-profile', [3, 2, 5], [3, 3, 2, 2, 1]],
  ['quay-resurface', ['5,2', '1,3', 8], { repair: 11, missing: 3 }],
  ['crane-reach', [1, -1, 5, '[[4,3],[1,-7],[1,-1]]'], [1, 3]],
];

const aqueductCases = [
  ['trough-section', [4, 3, 1, 2], 18],
  ['reach-volume', ['3,4', '2,1', '1,3'], 18],
  ['invert-profile', [12, '1,0,3'], [11, 11, 8]],
  [
    'terrain-crossings',
    ['3,4', '1,5'],
    [
      { exposed: 2, buried: 0 },
      { exposed: 0, buried: 1 },
    ],
  ],
  ['crest-freeboard', ['5,4', '2,6'], [3, -2]],
  ['source-strips', ['8,5', 2, 4], 8],
  ['drop-stations', [5, 2], [0, 0, 1, 1, 2]],
  ['gate-openings', ['3,2', '2,3', '1,5'], 9],
  ['supply-split', [8, '3,9,4', '5,2,6'], { deliveries: [3, 2, 3], remaining: 0 }],
  ['leak-trace', [5, '2,6', '1,2'], [4, 2]],
  [
    'reservoir-cycle',
    [4, 5, '3,0', '2,4'],
    [
      { stored: 3, spill: 2, unmet: 0 },
      { stored: 0, spill: 0, unmet: 1 },
    ],
  ],
  ['isolation-loss', ['3,8', 12, 3], { from: 3, until: 8, length: 5 }],
  ['lining-tiles', [5, 3, 1, 4], 8],
  ['settling-bays', [7, 5, 12], 3],
  [
    'overflow-weirs',
    ['2,9', 4, 3],
    [
      { main: 2, bypass: 0, excess: 0 },
      { main: 4, bypass: 3, excess: 2 },
    ],
  ],
  ['channel-neck', ['4,2,3', '2,2,2', 5], { station: 2, area: 4, missing: 1 }],
  ['siphon-head', [8, -2, 5], { descent: 10, ascent: 7, head: 3 }],
  ['access-crossings', ['7,2', 10], { from: 2, until: 7 }],
  ['divider-walls', [3, 7, 2, 1], 28],
  ['drop-pools', ['0,2,4', 2, 3], [0, 12, 24]],
  ['cover-slabs', [5, 3, '1,1,4'], 9],
  ['inlet-screen', [12, 1, 3], { bars: 3, freeWidth: 9 }],
  ['feeder-headroom', ['2,4,1', '6,8,1'], [-1, 3, 0]],
  ['winter-drain', ['8,7', '4,2'], { ticks: 4, reach: 2 }],
  ['inspection-route', ['4,5,6', '0,1,0', '0,8,0'], 18],
];

const viaductCases = [
  ['span-balance', [17, 5], [5, 4, 4, 4]],
  ['pier-chainage', ['4,6,3', 2], [4, 12]],
  ['deck-surface', ['4,6', '1,2,1', 3], 42],
  ['soffit-clearance', ['10,9', '2,3', '4,7'], [4, -1]],
  ['pier-shafts', ['0,4', '3,2', '2,3'], [0, 24]],
  ['hollow-piers', [7, 5, 4, 1], 60],
  ['corbel-layers', [3, 13, 2], [7, 11, 13]],
  ['footing-spread', [2, 3, 3, 1], 68],
  ['bearing-pads', [3, 2, 4], 48],
  ['arch-ordinates', [4, 4], [0, 3, 4, 3, 0]],
  ['spandrel-fill', ['2,4,2', 5, 3], 21],
  ['arch-centering', ['2,3,4,3', 2], 9],
  ['parapet-openings', [9, '2,1', '0', 2], 30],
  ['lane-envelope', [15, 2, '3,4', 1], 3],
  ['joint-offsets', ['5,4', 3], [3, 5, 8]],
  ['expansion-gaps', ['2,3', '3,1', '5,5'], [1, 0]],
  ['approach-stairs', ['0,6,7', 3, 2], [0, 8, 11]],
  ['deck-camber', [2, 3], [0, 1, 3, 1, 0]],
  ['pier-avoidance', ['1,4,10', '[[2,4],[9,15]]'], [2, 3]],
  ['lift-batches', ['4,2,6,1', 6], [6, 6, 1]],
  ['erection-fronts', ['2,5,3', 2, 3], { leftSpans: 1, ticks: 3 }],
  ['staging-decks', ['3,0,4,1', '1,1,1,1,0'], [1, 3]],
  ['repair-possession', ['3,8', 6, 2], 3],
  ['deck-stockpiles', [15, '3,7,2', 4], { completed: 2, stock: 5 }],
  ['survey-deviation', [4, 8, '4,7,7'], [0, 1, -1]],
];

for (const [i, cases] of [harborplanCases, aqueductCases, viaductCases].entries()) {
  const group = crossingGroups[i];
  test(`${group.name} has 25 fixture-covered planners`, () => {
    assert.equal(new Set(cases.map(([name]) => name)).size, 25);
    assert.deepEqual(
      group.commands.map(({ signature }) => signature.split(' ')[0]),
      cases.map(([name]) => name),
    );
  });
  for (const [name, args, expected] of cases) {
    testStudyWorkflows(group.name, name, args, expected);
    test(`${group.name} ${name}`, () => assert.deepEqual(calculateOffline(group, name, args).result, expected));
  }
}

test('crossing planners enforce layout and output bounds', () => {
  const run = (group, name, ...args) => calculateOffline(crossingGroups[group], name, args).result;
  assert.throws(() => run(0, 'dock-appointments', '2,1', '1,1'), /ordered/);
  assert.throws(() => run(0, 'fender-offsets', 1001, 1), /1000/);
  assert.equal(run(0, 'drydock-pump', 4, 3, 2, 1, 4, 4), null);
  assert.deepEqual(run(0, 'fender-offsets', 1, 1), [0]);
  assert.deepEqual(run(1, 'isolation-loss', '0,7', 10, 9), { from: 7, until: 10, length: 3 });
  assert.throws(() => run(1, 'reservoir-cycle', 6, 5, '1', '1'), /capacity/);
  assert.throws(() => run(1, 'gate-openings', '1,1', '1', '1'), /equal lengths/);
  assert.deepEqual(run(1, 'isolation-loss', '', 10, 9), { from: 0, until: 10, length: 10 });
  assert.deepEqual(run(1, 'access-crossings', '', 10), { from: 0, until: 10 });
  assert.equal(run(1, 'cover-slabs', 5, 3, ''), 15);
  assert.equal(run(1, 'inlet-screen', 4, 5, 3), null);
  assert.throws(() => run(2, 'joint-offsets', '1002', 1), /1000/);
  assert.throws(() => run(2, 'corbel-layers', 2, 5, 1), /even/);
  assert.equal(run(2, 'repair-possession', '1', 2, 2), null);
  assert.equal(run(2, 'repair-possession', '0', 2, 2), 0);
  assert.deepEqual(run(2, 'span-balance', 1, 5), [1]);
});
