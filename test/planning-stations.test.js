import test from 'node:test';
import { testStudyWorkflows } from './planning-study-workflow-checks.js';
import assert from 'node:assert/strict';
import { calculateOffline } from '../src/offline-kit.js';
import { STATION_GROUPS } from '../src/planning-stations.js';

const furnaceCases = [
  [
    'bay-layout',
    ['5,0,2', 4, 1],
    {
      length: 14,
      zones: [
        { bays: 2, firstBlock: 1 },
        { bays: 0, firstBlock: null },
        { bays: 1, firstBlock: 11 },
      ],
    },
  ],
  [
    'branch-feeders',
    ['0,4,10', 2],
    [
      { feeders: 0, branch: 0 },
      { feeders: 1, branch: 2 },
      { feeders: 2, branch: 2 },
    ],
  ],
  [
    'zone-expansion',
    ['3,5', '2,2', 4],
    [
      { usedExistingSpace: 1, addedBays: 1, openPlaces: 3 },
      { usedExistingSpace: 2, addedBays: 0, openPlaces: 1 },
    ],
  ],
  ['panel-address', ['3,0,2', 4], { row: 3, column: 1 }],
  ['aisle-footprint', ['4,2', 2, 1], { width: 6, depth: 4, furnaces: 6, clearCells: 18 }],
  ['dedicated-overflow', ['4,7,5', '8,4,2'], { dedicated: [4, 4, 2], overflow: [0, 3, 1], unmet: [0, 0, 2] }],
  ['fallback-overhead', [2, 3, 10, 5, 7], { blastExtra: 10, smokerExtra: 9, totalExtra: 19 }],
  ['retrofit-minimum', [5, 9, 22, 2, 1, 10], 2],
  [
    'zone-dispatch',
    ['2,1', '1,2,1,1,1', '2,3,1,3,1', '5,1', '0,0,2,2,11'],
    [
      { zone: 1, furnace: 1, start: 0, finish: 10 },
      { zone: 2, furnace: 1, start: 0, finish: 3 },
      { zone: 1, furnace: 2, start: 2, finish: 7 },
      { zone: 1, furnace: 2, start: 7, finish: 22 },
      { zone: 1, furnace: 1, start: 11, finish: 16 },
    ],
  ],
  ['staggered-output', ['1,2,3', 3, 10, 2], { byZone: [5, 6, 6], total: 17 }],
  ['peak-start-load', ['0,1,1,3,6', '2,8,1,4,9', 3], { from: 1, until: 4, units: 13 }],
  [
    'activation-waves',
    ['2,3,1,4', 4, 10],
    [
      { wave: 1, start: 0 },
      { wave: 2, start: 10 },
      { wave: 2, start: 10 },
      { wave: 3, start: 20 },
    ],
  ],
  [
    'outage-output',
    ['2,1', '5,10', '7,12', '3,2', 12],
    [
      { actual: 4, lost: 4 },
      { actual: 5, lost: 1 },
    ],
  ],
  ['loaders-needed', ['4,3', '3,2', '8,6', 0.5], { byZone: [1.5, 1], busy: 2.5, loaders: 5 }],
  ['sorter-reservation', ['5,4,0', 10], { perZone: [1, 1, 0], shared: 1, extra: 1 }],
  [
    'feed-pulse-overflow',
    ['0,1', '2,3', '3,5', 6, 6],
    [
      { input: 3, rejected: 0 },
      { input: 5, rejected: 0 },
      { input: 3, rejected: 0 },
      { input: 0, rejected: 0 },
      { input: 8, rejected: 2 },
      { input: 0, rejected: 0 },
    ],
  ],
  [
    'pickup-pass',
    ['6,5,4', '3,1', 7],
    {
      stops: [
        { zone: 3, taken: 4, left: 0 },
        { zone: 1, taken: 3, left: 3 },
      ],
      uncollected: 8,
    },
  ],
  [
    'partial-progress',
    ['3,1,0', '3,1,0', '5,2,5', 5],
    [
      { complete: 1, pending: 2, progress: 3 },
      { complete: 1, pending: 0, progress: 0 },
      { complete: 0, pending: 0, progress: 0 },
    ],
  ],
  ['drain-phases', [8, 6, 4, 2], { occupiedPhases: 3, peak: 3, rejectedPerPeriod: 2 }],
  [
    'dedicated-rack-fit',
    ['9,2', '4,4', '2,1', '4,4'],
    [
      { stored: 8, overflow: 1, freeSlots: 0 },
      { stored: 2, overflow: 0, freeSlots: 2 },
    ],
  ],
  [
    'staggered-refills',
    ['3,4', '4,3', 2, 5, 4],
    [
      { refilled: 1, idled: 1, stock: 8 },
      { refilled: 1, idled: 1, stock: 9 },
      { refilled: 1, idled: 1, stock: 10 },
      { refilled: 2, idled: 0, stock: 8 },
    ],
  ],
  ['outfeed-recovery', [3, 4, 1, 6, 5], { peak: 13, afterBurst: 13, recoveryTicks: 5 }],
  [
    'purge-sequence',
    ['1,2,3,2,1', '4,1,0,3,2', 2],
    [
      { clean: 4, quarantined: 0 },
      { clean: 0, quarantined: 1 },
      { clean: 0, quarantined: 0 },
      { clean: 2, quarantined: 1 },
      { clean: 0, quarantined: 2 },
    ],
  ],
  ['upgrade-rate', ['2,3', '1,3', '3,3', 5, 3], { baseline: 3, gains: [1, 1], bestZone: 1 }],
  [
    'circuit-collection',
    ['2,1', '1,2', '4,2', 1, 4, 3],
    [
      { furnace: 1, arrival: 4, items: 2, blocked: 0, departure: 7 },
      { furnace: 2, arrival: 9, items: 4, blocked: 5, departure: 12 },
    ],
  ],
];

const brewingCases = [
  ['forked-runs', ['4,2,0', 3], { baseRuns: 2, finishRuns: [2, 1, 0], baseRunsSaved: 1, finishEmptySlots: [2, 1, 0] }],
  [
    'modifier-budget',
    ['4,1,1,0', 3, '1,2,1,3', '1,2,4,1'],
    [
      { modifier: 1, units: 6 },
      { modifier: 2, units: 2 },
    ],
  ],
  [
    'prefix-reuse',
    [1, 2, '1,2,4,5', '1,2,6,5', 3],
    { sharedStages: 2, sharedRuns: 2, firstRuns: 2, secondRuns: 2, savedRuns: 2 },
  ],
  [
    'resume-stages',
    [10, '2,3,4', 3],
    {
      freshBottles: 1,
      stages: [
        { reused: 2, stands: 1 },
        { reused: 3, stands: 1 },
        { reused: 4, stands: 2 },
      ],
    },
  ],
  [
    'fuel-per-stand',
    ['4,2', '2,1', '1,4', 4],
    [
      { refills: 2, leftoverCharges: 1 },
      { refills: 0, leftoverCharges: 2 },
    ],
  ],
  [
    'prioritized-variants',
    ['5,5,6', 9, 3, '3,4,4', '2,2,1'],
    {
      variants: [
        { made: 3, short: 2, modifierUsed: 2 },
        { made: 5, short: 0, modifierUsed: 4 },
        { made: 1, short: 5, modifierUsed: 1 },
      ],
      remainingBase: 0,
    },
  ],
  [
    'stage-windows',
    ['2,4,1', '1,5,8', '4,9,9', 1],
    {
      stages: [
        { start: 1, finish: 3 },
        { start: 5, finish: 9 },
      ],
      blockedStage: 3,
    },
  ],
  [
    'forked-timeline',
    ['4,2,3', 3, 2, 2, 2, '4,1,2'],
    [
      { variant: 1, stand: 1, bottles: 3, baseReady: 2, start: 2, finish: 6 },
      { variant: 1, stand: 2, bottles: 1, baseReady: 2, start: 2, finish: 6 },
      { variant: 2, stand: 1, bottles: 2, baseReady: 2, start: 6, finish: 7 },
      { variant: 3, stand: 2, bottles: 3, baseReady: 4, start: 6, finish: 8 },
    ],
  ],
  [
    'rack-order',
    ['3,7,0,2,2', '4,5'],
    [
      { rack: 1, firstSlot: 1, lastSlot: 3 },
      null,
      null,
      { rack: 2, firstSlot: 1, lastSlot: 2 },
      { rack: 2, firstSlot: 3, lastSlot: 4 },
    ],
  ],
  ['label-ranges', ['4,0,2', 3, 50], [{ firstLabel: 50, lastLabel: 51 }, null, { firstLabel: 52, lastLabel: 52 }]],
  [
    'bottle-reuse',
    ['3,2', '5,4', '4,2', '3,0', '8,1'],
    [
      { remainingFilled: 1, empties: 6, newEmptiesNeeded: 2 },
      { remainingFilled: 2, empties: 2, newEmptiesNeeded: 0 },
    ],
  ],
  ['water-rounds', [7, 4, 2, 3, 5, 2], { fetches: 2, seconds: 24, waterLeft: 3 }],
  [
    'effect-renewals',
    ['[[0,5],[5,7],[8,15]]', 3],
    [
      { doses: 2, coveredUntil: 6 },
      { doses: 1, coveredUntil: 9 },
      { doses: 2, coveredUntil: 15 },
    ],
  ],
  [
    'simultaneous-doses',
    ['5,8,2', '3,3,1', 4],
    {
      groups: [
        { needed: 2, used: 2, covered: true },
        { needed: 3, used: 0, covered: false },
        { needed: 2, used: 2, covered: true },
      ],
      remaining: 0,
    },
  ],
  ['effect-chain', ['1,2,6,8', '4,1,2,3'], { active: 9, overlap: 1, gaps: 1, until: 11 }],
  [
    'breakage-at-stage',
    [7, 3, '3,1,0'],
    [
      { runs: 3, emptySlots: 2, remaining: 4 },
      { runs: 2, emptySlots: 2, remaining: 3 },
      { runs: 1, emptySlots: 0, remaining: 3 },
    ],
  ],
  [
    'ingredient-replenish',
    ['1,2,1,2', '4,1,3,5', '1,2', '4,3'],
    [
      { ingredient: 1, packs: 1, remaining: 1 },
      { ingredient: 2, packs: 0, remaining: 1 },
      { ingredient: 1, packs: 1, remaining: 2 },
      { ingredient: 2, packs: 2, remaining: 2 },
    ],
  ],
  ['rack-rebalance', ['7,0,3,0', '8,4,6,4', '3,2,2,3'], { movedBottles: 5, stocks: [3, 2, 2, 3] }],
  ['charged-batches', ['4,2,3', 3, 3], { byStand: [1, 0, 1], bottles: 6, pooledExtraBatches: 1 }],
  ['salvage-clock', ['4,5,6', 1, 2, 3], { resume: 12, restart: 15, saved: 3 }],
  [
    'fill-and-brew',
    [8, 3, 2, 1, 4],
    [
      { stand: 1, bottles: 3, loadStart: 0, brewStart: 3, finish: 7 },
      { stand: 2, bottles: 3, loadStart: 3, brewStart: 6, finish: 10 },
      { stand: 1, bottles: 2, loadStart: 7, brewStart: 9, finish: 13 },
    ],
  ],
  ['stand-downtime', ['3,4,1', 2, '[[1,3],[6,8],[9,10]]'], [6, 13, 14]],
  ['staging-slots', ['[[1,4],[2,5],[4,6],[3,3]]', '3,2,4,100', 4], { peak: 6, peakAt: 4, firstOverflow: 2 }],
  ['changeover-budget', ['2,1,2,1', '2,1,1,1', 5, 2], { sourceSeconds: 21, groupedSeconds: 9, order: [2, 4, 3, 1] }],
  [
    'reserve-deadlines',
    ['2,1', '[[4,2,4],[2,1,2],[9,1,7]]', '[[2,1,5],[2,1,1],[4,2,4]]'],
    {
      pickups: [
        { taken: 4, unmet: 1 },
        { taken: 0, unmet: 1 },
        { taken: 4, unmet: 0 },
      ],
      stockAfterLastPickup: [0, 1],
    },
  ],
];

function calculate(group, command, ...args) {
  return calculateOffline(group, command, args).result;
}

for (const [index, cases] of [furnaceCases, brewingCases].entries()) {
  const group = STATION_GROUPS[index];
  test(`${group.name} exposes exactly 25 distinct fixture-covered commands`, () => {
    assert.equal(cases.length, 25);
    assert.equal(new Set(cases.map(([name]) => name)).size, 25);
    assert.deepEqual(
      group.commands.map(({ signature }) => signature.split(' ')[0]),
      cases.map(([name]) => name),
    );
  });
  for (const [name, args, expected] of cases) {
    testStudyWorkflows(group.name, name, args, expected);
    test(`${group.name} ${name}`, () => {
      assert.deepEqual(calculate(group, name, ...args), expected);
      assert.throws(() => calculate(group, name), /exactly the documented arguments/);
    });
  }
}

test('furnace-bank rejects inconsistent zone requests', () => {
  const run = (name, ...args) => calculate(STATION_GROUPS[0], name, ...args);
  assert.throws(() => run('dedicated-overflow', '1,2', '1,2'), /ordinary, blast and smoker/);
  assert.throws(() => run('panel-address', '0,2', 3), /outside the panel/);
  assert.throws(() => run('zone-dispatch', '1,0', '2', '1', '2,3', '0'), /zone with a furnace/);
  assert.throws(() => run('activation-waves', '1,4', 3, 1), /wave start limit/);
  assert.throws(() => run('activation-waves', '1,1', 1, 0), /positive number/);
  assert.throws(() => run('outage-output', '1', '10', '5', '4', 20), /at or after/);
  assert.throws(() => run('pickup-pass', '1,2', '1,1', 4), /distinct zones/);
  assert.throws(() => run('dedicated-rack-fit', '3', '1', '2', '1'), /reserved slots/i);
  assert.throws(() => run('partial-progress', '0', '1', '3', 0), /unfinished item/);
  assert.throws(() => run('staggered-refills', '1', '1', '2', 3, 1), /protected reserve/);
  assert.throws(() => run('feed-pulse-overflow', '0', '1', '1', 1001, 1), /1000 entries/);
});

test('furnace-bank handles infeasible and exact-fit timing', () => {
  const run = (name, ...args) => calculate(STATION_GROUPS[0], name, ...args);
  assert.equal(run('retrofit-minimum', 2, 1, 1, 5, 2, 4), null);
  assert.equal(run('retrofit-minimum', 2, 4, 2, 5, 2, 10), null);
  assert.equal(run('retrofit-minimum', 2, 1, 3, 5, 5, 10), 0);
  assert.deepEqual(run('staggered-output', '0,2', 64, 64.3, 0.1), { byZone: [0, 6], total: 6 });
  assert.deepEqual(run('staggered-output', '1,1', 0.1, 0.1, 0.1), { byZone: [1, 0], total: 1 });
  assert.deepEqual(run('outage-output', '1', '1', '1', '3', 9), [{ actual: 3, lost: 0 }]);
  assert.deepEqual(run('peak-start-load', '0,3', '3,3', 3), { from: 0, until: 3, units: 3 });
  assert.equal(run('outfeed-recovery', 1, 2, 2, 0, 0).recoveryTicks, null);
});

test('brewing-bench rejects invalid production states and out-of-range requests', () => {
  const run = (name, ...args) => calculate(STATION_GROUPS[1], name, ...args);
  assert.throws(() => run('stage-windows', '2', '2', '1', 0), /cannot close before/);
  assert.throws(() => run('effect-renewals', '[[0,3],[2,4]]', 2), /no overlaps/);
  assert.throws(() => run('stand-downtime', '2', 0, '[[0,0]]'), /positive length/);
  assert.throws(() => run('bottle-reuse', '2', '3', '1', '2', '1'), /returns cannot exceed use/);
  assert.throws(() => run('breakage-at-stage', 2, 2, '3'), /exceed bottles/);
  assert.throws(() => run('ingredient-replenish', '2', '3', '4', '4'), /within the stocked list/);
  assert.throws(() => run('reserve-deadlines', '0', '[[1,2,1]]', '[[2,1,1]]'), /valid one-based variant/);
  assert.throws(() => run('forked-timeline', '1001', 1, 2, 2, 1, '1'), /1000/);
  assert.throws(() => run('fill-and-brew', 1001, 1, 1, 1, 1), /1000 batches/);
});

test('brewing-bench handles empty orders, capacity ties and exact windows', () => {
  const run = (name, ...args) => calculate(STATION_GROUPS[1], name, ...args);
  assert.deepEqual(run('stage-windows', '0.1,0.2', '0,0', '0.1,0.3', 0), {
    stages: [
      { start: 0, finish: 0.1 },
      { start: 0.1, finish: 0.1 + 0.2 },
    ],
    blockedStage: null,
  });
  assert.deepEqual(run('staging-slots', '[[0,2],[2,3]]', '5,5', 5), { peak: 5, peakAt: 0, firstOverflow: null });
  assert.deepEqual(run('rack-order', '9,1', '2'), [null, { rack: 1, firstSlot: 1, lastSlot: 1 }]);
  assert.deepEqual(run('effect-renewals', '[[64,64.3]]', 0.1), [{ doses: 3, coveredUntil: 64.3 }]);
  assert.deepEqual(run('forked-timeline', '0,0', 3, 1, 1, 1, '1,1'), []);
  assert.deepEqual(run('fill-and-brew', 0, 3, 1, 1, 1), []);
  assert.equal(run('rack-rebalance', '1,0', '4,4', '0,2'), null);
});

test('sorter-reservation keeps a full list of decimal flows on one exact-fit lane', () => {
  const rates = Array(1000).fill('0.03').join(',');
  const result = calculate(STATION_GROUPS[0], 'sorter-reservation', rates, 30);
  assert.equal(result.shared, 1);
  assert.equal(result.extra, 999);
});

test('furnace releases and brewing renewals honor exact decimal boundaries', () => {
  assert.deepEqual(calculate(STATION_GROUPS[0], 'zone-dispatch', '2', '1,1', '3,1', '0.1', '0,0.3'), [
    { zone: 1, furnace: 1, start: 0, finish: 0.3 },
    { zone: 1, furnace: 1, start: 0.3, finish: 0.4 },
  ]);
  const coveredUntil = 3 * 0.7;
  assert.deepEqual(calculate(STATION_GROUPS[1], 'effect-renewals', '[[0,2],[2,2.1]]', 0.7), [
    { doses: 3, coveredUntil },
    { doses: 0, coveredUntil },
  ]);
});

test('a long run of decimal furnace cycles keeps the first furnace available at each release', () => {
  const jobs = Array(80).fill(1).join(',');
  const releases = Array.from({ length: 80 }, (_, index) => (index * 7) / 10).join(',');
  const schedule = calculate(STATION_GROUPS[0], 'zone-dispatch', '2', jobs, jobs, '0.7', releases);
  assert.ok(schedule.every(({ furnace }) => furnace === 1));
});

test('queued jobs use the lower-numbered furnace when parallel finish clocks tie', () => {
  const dispatch = (items) =>
    calculate(STATION_GROUPS[0], 'zone-dispatch', '2', '1,1,1,1,1', items, '0.7', '0,0,0,0,0').map(
      ({ furnace }) => furnace,
    );
  assert.deepEqual(dispatch('5,3,1,1,1'), [1, 2, 2, 2, 1]);
  assert.deepEqual(dispatch('6,3,1,1,1'), [1, 2, 2, 2, 2]);
});

test('furnace clocks distinguish a long-runtime tie from a one-nanosecond lead', () => {
  const dispatch = (items, releases) =>
    calculate(STATION_GROUPS[0], 'zone-dispatch', '2', '1,1,1,1', items, '123456.78', releases);
  const tied = dispatch('4353,4352,1,1', '0,0,0,0');
  assert.deepEqual(
    tied.map(({ furnace }) => furnace),
    [1, 2, 2, 1],
  );
  assert.equal(tied[3].start, 537407363.34);
  const earlier = dispatch('1,4353,4352,1', '0,0,123456.780000001,123456.780000001');
  assert.deepEqual(
    earlier.map(({ furnace }) => furnace),
    [1, 2, 1, 2],
  );
});
