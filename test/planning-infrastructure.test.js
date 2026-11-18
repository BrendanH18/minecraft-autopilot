import assert from 'node:assert/strict';
import test from 'node:test';
import { testStudyWorkflows } from './planning-study-workflow-checks.js';
import { calculateOffline } from '../src/offline-kit.js';
import { INFRASTRUCTURE_GROUPS } from '../src/planning-infrastructure.js';

const tunnelCases = [
  [
    'clear-profile',
    [7, 5, 2, 1, 5, 5],
    { clearWidth: 5, clearHeight: 4, widthMargin: 0, heightMargin: -1, fits: false },
  ],
  ['parallel-duct-fit', [14, 4, 2, 1, 1], { ducts: 3, spareWidth: 1 }],
  ['retrofit-cut', [10, 3, 4, 5, 6], { sideCells: 80, ceilingCells: 100, cutCells: 180 }],
  ['service-trench', [5, 4, 3, 2, 1], { cutCells: 60, coverBlocks: 20, backfillBlocks: 30 }],
  ['offset-riser', [-6, 15, -3, 9, 5], { rise: 21, horizontalRun: 12, totalRun: 33 }],
  ['opening-separation', [12, 6, 10, 4, 3], { signedGap: -2, gapMargin: -5, fits: false }],
  ['duct-module-run', [19, 7, 2], { modules: 4, joints: 3, trim: 3 }],
  ['hanger-layout', [13, 5, 2], { offsets: [0, 5, 9, 13], bracketPieces: 8 }],
  ['access-gap-audit', [20, '13,4,9', 6], { farthest: 7, margin: -1, fits: false }],
  [
    'hatch-coverage',
    [15, '11,3,4', 2, 3],
    {
      coverage: [
        [1, 7],
        [9, 14],
      ],
      served: 11,
      unserved: 4,
    },
  ],
  [
    'sleeve-lengths',
    ['2,6', 2, 1, 8],
    [
      { sleeveLength: 5, margin: 3, fits: true },
      { sleeveLength: 9, margin: -1, fits: false },
    ],
  ],
  ['grate-free-area', [8, 6, 2, 1, 2], { openArea: 16, blockedArea: 32, openFraction: 1 / 3 }],
  [
    'conduit-fill',
    [4, 4, '1,2,10', '4,1,0', 0.5],
    { cableArea: 2 * Math.PI, fill: Math.PI / 8, largestFits: true, withinFillLimit: true },
  ],
  ['cable-reel-allocation', ['3,4,3,2', 1, 11], { reelBySection: [1, 1, 2, 2], reels: 2, unusedLength: 2 }],
  [
    'pull-section-check',
    ['3.5,4,2', '1,1,3', 3.5, 2],
    [
      { section: 1, lengthMargin: 0, bendMargin: 1, fits: true },
      { section: 2, lengthMargin: -0.5, bendMargin: 1, fits: false },
      { section: 3, lengthMargin: 1.5, bendMargin: -1, fits: false },
    ],
  ],
  ['branch-isolation', [23, '15,5,2,18', 10], { before: 5, after: 15, isolatedLength: 10 }],
  ['bottleneck-profile', ['4,2,3', '4,3,2', '10,0,1'], { minimumArea: 5, stations: [3] }],
  [
    'ceiling-conflicts',
    ['[[2,10],[8,15]]', '[[2,3],[11,16],[12,14]]'],
    {
      conflicts: [
        [2, 3],
        [11, 15],
      ],
      conflictingLength: 5,
    },
  ],
  ['slope-headroom', ['0,3,6', '5,6,7', 2], { minimumMargin: -1, failingStations: [3] }],
  ['shaft-landing-check', [6, 7, 4, 3, 1], { widthSpare: 0, depthSpare: 2, fits: true }],
  ['maintenance-lap', ['10,8', '2,4', '1.5,2.5'], { walkingTime: 14, serviceTime: 4, totalTime: 18 }],
  [
    'simultaneous-closures',
    ['[[1,5],[5,9]]', '[[0,4],[7,11]]', 3],
    {
      fullClosures: [
        [1, 4],
        [7, 9],
      ],
      longestClosure: 3,
      fits: true,
    },
  ],
  [
    'missing-panels',
    ['2,3,2', '3,2,3', '2,1,4', '1,2,2'],
    { shortages: [{ width: 2, height: 3, missing: 3 }], missingArea: 18 },
  ],
  ['bypass-detour', [20, 3, 2, 11], { bypassRun: 21, addedRun: 6, totalRun: 26 }],
  [
    'retrofit-phases',
    ['3,5', '2,4', 5],
    [
      { phase: 1, openWidth: 6, margin: 1, fits: true },
      { phase: 2, openWidth: 4, margin: -1, fits: false },
    ],
  ],
];

const canalCases = [
  [
    'flight-lifts',
    [-5, 8, 5],
    [
      { entryLevel: -5, exitLevel: 0, lift: 5 },
      { entryLevel: 0, exitLevel: 4, lift: 4 },
      { entryLevel: 4, exitLevel: 8, lift: 4 },
    ],
  ],
  ['chamber-clearance', [19, 6, 13, 4, 2, 1], { lengthMargin: 2, widthMargin: 0, fits: true }],
  ['sill-margin', [12, 8, 9, 2.5, 0.75], { depth: 3, margin: -0.25, fits: false }],
  ['wall-crest', [-8, 3, 4, 2, -1], { highWaterLevel: -1, requiredCrest: 1, raiseBy: 2 }],
  ['chamber-fill', [10, 6, 2, 23], { grossVolume: 120, waterVolume: 97 }],
  [
    'fill-schedule',
    ['6,0,10', '4,2,3', '1,4,1', 0.5],
    [
      { chamber: 1, start: 0, end: 2 },
      { chamber: 2, start: 2.5, end: 2.5 },
      { chamber: 3, start: 3, end: 8 },
    ],
  ],
  ['cascade-reserve', ['10,18,8', '5,12,4'], { startingReserve: 23, consumed: 15, remaining: 8 }],
  ['wall-blocks', [15, 3, 2, 1, 2, 1], { submerged: 300, crest: 60, foundationBlocks: 60, blocks: 420 }],
  ['gate-span', [7, 4, 4, 2], { actualOverlap: 1, margin: -1, fits: false }],
  [
    'gate-positions',
    ['6,9', 2, 3],
    {
      chambers: [
        [5, 11],
        [13, 22],
      ],
      gates: [
        [3, 5],
        [11, 13],
        [22, 24],
      ],
      farEdge: 24,
    },
  ],
  ['transit-window', [26, 4, 5, 2], { passages: 3, unusedTime: 3 }],
  ['approach-holding', [10, 7, 4, 2, 1, 1], { rows: 2, lanes: 2, boats: 4 }],
  ['convoy-load', [17, '5,2,8,1', 2, 2], { loaded: 2, waiting: 2, spareLength: 4 }],
  ['reservoir-buffer', [14, 2, 5, 6], { drawable: 28, usable: 22, fills: 4, remainingUsable: 2 }],
  [
    'equalization-check',
    [10.25, 10, 12, 0.25],
    { lowerDifference: 0.25, upperDifference: -1.75, lowerWithinTolerance: true, upperWithinTolerance: false },
  ],
  ['refill-plan', ['0,0,1,1,0', 1, 7], { fills: 3, drains: 4, waterDrawn: 21, waterReleased: 28, finalLevel: 0 }],
  ['towpath-ramp', [3, 0.2, 2, 18], { rampRun: 15, totalRun: 19, margin: -1, fits: false }],
  ['towpath-embankment', [2, 3, 4, 5], { rampBlocks: 48, landingBlocks: 30, fillBlocks: 78 }],
  [
    'towpath-crossings',
    [20, '10,3', 2, 7, 2],
    {
      crossings: [
        [3, 5],
        [10, 12],
      ],
      deckBlocks: 44,
    },
  ],
  ['draft-window', [2, 6, 10, 2.5, 0.5], [2.5, 10]],
  ['lining-repair', [10, 5, 4, 0.25, 0.2, 0.1], { floorBlocks: 13, sideBlocks: 16, spareBlocks: 3, totalBlocks: 32 }],
  ['approach-profile', ['0,4,12', '1,0,4', 0.25], { grades: [-0.25, 0.5], steepSegments: [2] }],
  ['cycle-baseline', [2, 1, 5, 2, 3, 2], { passageTime: 10, cycleTime: 13, timePerBoat: 6.5 }],
  ['chamber-bumpers', [19, 8, 2, 3, 2], { bumpers: 6, clearWidth: 4 }],
  ['bank-berms', [10, 4, 3, 2, 2], { bottomWidth: 9, footprint: 180, fillBlocks: 480 }],
];

const [tunnel, canal] = INFRASTRUCTURE_GROUPS;
const run = (group, name, ...args) => calculateOffline(group, name, args).result;

test('both infrastructure groups expose exactly 25 commands with independent expected results', () => {
  assert.deepEqual(
    INFRASTRUCTURE_GROUPS.map(({ name }) => name),
    ['tunnel-vent', 'canal-lock'],
  );
  for (const [group, cases] of [
    [tunnel, tunnelCases],
    [canal, canalCases],
  ]) {
    assert.equal(group.commands.length, 25);
    assert.equal(new Set(cases.map(([name]) => name)).size, 25);
    assert.deepEqual(
      group.commands.map(({ signature }) => signature.split(' ')[0]),
      cases.map(([name]) => name),
    );
  }
});

for (const [group, cases] of [
  [tunnel, tunnelCases],
  [canal, canalCases],
]) {
  for (const [name, args, expected] of cases) {
    testStudyWorkflows(group.name, name, args, expected);
    test(`${group.name} ${name} returns its expected calculation`, () => {
      assert.deepEqual(run(group, name, ...args), expected);
      assert.throws(() => run(group, name), /documented arguments/);
      assert.throws(() => run(group, name, 'invalid', ...args.slice(1)));
    });
  }
}

test('tunnel clearance and support layouts enforce physical and output bounds', () => {
  assert.throws(() => run(tunnel, 'clear-profile', 2, 2, 3, 0, 1, 1), /exceed the tunnel profile/);
  assert.throws(() => run(tunnel, 'retrofit-cut', 4, 6, 7, 5, 8), /contain the old profile/);
  assert.throws(() => run(tunnel, 'service-trench', 5, 2, 2, 2, 2), /its cover/);
  assert.throws(() => run(tunnel, 'duct-module-run', 5, 3, 3), /overlap/);
  assert.throws(() => run(tunnel, 'hanger-layout', 1000, 1, 1), /1000 entries/);
  assert.throws(() => run(tunnel, 'cable-reel-allocation', '3,4', 1, 5), /complete cut/);
  assert.throws(() => run(tunnel, 'conduit-fill', 4, 5, '1,2', '3', 0.4), /equal lengths/);
  assert.throws(() => run(tunnel, 'branch-isolation', 10, '2,8', 8), /away from a damper/);
  assert.deepEqual(run(tunnel, 'branch-isolation', 10, '2,4', 5), { before: 4, after: null, isolatedLength: null });
  assert.deepEqual(run(tunnel, 'hanger-layout', 1, 3, 1), { offsets: [0, 1], bracketPieces: 2 });
});

test('tunnel ranges stay distinct at touch points and clip hatch overreach', () => {
  assert.deepEqual(run(tunnel, 'ceiling-conflicts', '[[0,2],[4,7]]', '[[2,4],[6,8]]'), {
    conflicts: [[6, 7]],
    conflictingLength: 1,
  });
  assert.deepEqual(run(tunnel, 'hatch-coverage', 12, '0,12,12', 4, 4), {
    coverage: [
      [0, 4],
      [8, 12],
    ],
    served: 8,
    unserved: 4,
  });
  assert.deepEqual(run(tunnel, 'hatch-coverage', 12, '0,12', 0, 0), { coverage: [], served: 0, unserved: 12 });
});

test('lock plans reject inconsistent levels, impossible structures, and numeric overflow', () => {
  assert.throws(() => run(canal, 'flight-lifts', 2, 1, 5), /upper level/);
  assert.throws(() => run(canal, 'flight-lifts', 0, 1001, 1), /1000 entries/);
  assert.throws(() => run(canal, 'chamber-fill', 1, 1, 1, 2), /displacement/);
  assert.throws(() => run(canal, 'chamber-fill', 1000000, 1000000, 1000000, 0), /numeric range/);
  assert.throws(() => run(canal, 'fill-schedule', '1', '2', '2', 0), /positive net inflow/);
  assert.throws(() => run(canal, 'cascade-reserve', '2', '3'), /cannot return more/);
  assert.throws(() => run(canal, 'refill-plan', '1,2', 0, 10), /0 or 1/);
  assert.throws(() => run(canal, 'towpath-crossings', 10, '0,2', 3, 3, 0), /decks overlap/);
  assert.throws(() => run(canal, 'approach-profile', '0,0', '0,1', 0), /strictly increasing/);
  assert.throws(() => run(canal, 'chamber-bumpers', 8, 4, 1, 1, 2), /no central boat lane/);
  assert.throws(() => run(canal, 'bank-berms', 3, 3, 3, 1, 3), /one or two banks/);
});

test('lock time and water budget endpoints retain exact whole counts', () => {
  assert.deepEqual(run(canal, 'transit-window', 0.9, 0.2, 0.3, 0.1), { passages: 2, unusedTime: 0 });
  assert.deepEqual(run(canal, 'transit-window', 0.2, 0.2, 1e-18, 0), { passages: 0, unusedTime: 0.2 });
  assert.deepEqual(run(canal, 'draft-window', 6, 2, 10, 2.5, 0.5), [0, 7.5]);
  assert.deepEqual(run(canal, 'draft-window', 3, 3, 10, 2.5, 0.5), [0, 10]);
  assert.equal(run(canal, 'draft-window', 3, 3, 10, 3.5, 0.5), null);
  assert.deepEqual(run(canal, 'reservoir-buffer', 1, 0.3, 0.1, 0.2), {
    drawable: 0.3,
    usable: 0.3 - 0.2,
    fills: 1,
    remainingUsable: 0,
  });
  assert.deepEqual(run(canal, 'reservoir-buffer', 1, 8.2, 0.1, 8), {
    drawable: 8.2,
    usable: 8.2 - 8,
    fills: 2,
    remainingUsable: 0,
  });
  assert.equal(run(canal, 'reservoir-buffer', 1, 8, 1e-20, 8).fills, 0);
  assert.deepEqual(run(canal, 'chamber-bumpers', 6, 4, 3, 1, 4), { bumpers: 0, clearWidth: 4 });
});
