import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { calculateOffline } from '../src/offline-kit.js';
import { WATERWAY_GROUPS } from '../src/planning-waterways.js';

const road = '[[0,0],[5,0],[5,4],[5,6],[3,6],[5,6]]';
const cases = {
  'sponge-plan': [
    ['section-grid', [12, 8, 5, 3], { columns: 3, rows: 3, sections: 9 }],
    ['section-at', [12, 8, 5, 3, 3, 3], { x: 10, z: 6, length: 2, width: 2 }],
    ['divider-cells', [12, 8, 2, 5, 3], { alongWidth: 32, alongLength: 48, shared: 8, total: 72 }],
    ['cofferdam-wall', [8, 4, 3, 1, 2], { submerged: 192, aboveWater: 64 }],
    ['divider-gates', [13, 5, '2,3', 4, 2], { span: 7, removed: 20, remaining: 45 }],
    ['barrier-kit', ['4,6,1', '0,3,5', 4], { peak: 7, extra: 3, stillInstalled: 3 }],
    ['barrier-labor', [24, 6, 8, 2, 2], { install: 4, removal: 3, setupTime: 4, total: 11 }],
    ['layer-profile', ['12,8,0,5'], { total: 25, wettedLayers: 3, deepest: 4 }],
    ['temporary-fill', ['20,16,5', '3,0,5', 0.5], { fill: [17, 16, 0], recovered: [8, 8, 0], consumed: 17 }],
    ['sponge-loads', ['8,9,0,7', 4], { placements: [2, 3, 0, 2], total: 7 }],
    [
      'drying-backlog',
      ['5,0,1', 2],
      [
        { dried: 2, pending: 3 },
        { dried: 2, pending: 1 },
        { dried: 2, pending: 0 },
      ],
    ],
    ['reuse-shifts', [8, 3, 2, 3], { elapsed: 3, placed: 7, remaining: 1, clean: 2, wet: 1 }],
    ['staging-stock', [4, 3, 7, 2], 14],
    ['pump-crew', [24, 2, 4, 1, 5], 3],
    ['pump-outage', [24, 6, 2, 1, 2], 9],
    ['pump-handoff', [20, 1, 4, 2, 8], 4],
    ['pump-schedule', ['8,0,10', '2,12,4', 6, 1], [3.5, 3.5, 11.5]],
    [
      'wet-checkpoints',
      [5, '5,6,2', '1,5,1', '2,0,5'],
      [
        { water: 4, spill: 0 },
        { water: 6, spill: 3 },
        { water: 2, spill: 0 },
      ],
    ],
    ['breach-level', [4, 6, 2, 0], { waterDepth: 4, moved: 8, direction: 'left-to-right' }],
    ['stage-depth', [14, 5, 3], { top: 10, bottom: 14 }],
    ['draining-method', [24, 5, 3, 3, 1, 8], { batches: 2, spongeTime: 6, pumpTime: 4, preferred: 'pump' }],
    ['leak-test', [8, 2, 1.5, 7, 2], { netVolume: 3, netRate: 1.5 }],
    ['seal-survey', ['8,4,2', '0.5,0.75,1', 6], { residual: 5, headroom: 1, drains: true }],
    ['dry-first', ['20,12,8,4', '0,0,4,8', 8, 0, 4], { completed: [2, 3], used: 3.5 }],
    ['refuge-work', [12, 6, 4, 2, 10, 2.5], { travelTime: 7, feasible: true, workTime: 3, completeCells: 7 }],
  ],
  'ice-road': [
    ['turn-mix', [road], { left: 0, right: 2, reverse: 1, straight: 1 }],
    ['turn-spacing', [road, 3], [{ from: 4, to: 5, distance: 2 }]],
    ['curve-clearance', [road, 1, 2], { straightRuns: [4, 4, -1, 0], fits: false }],
    ['corner-stock', [road, 4, 9, 2, 5], { ice: 17, guards: 9 }],
    ['striped-deck', [12, 3, 2, 1, 2], { deckWidth: 12, iceCells: 72, otherCells: 72 }],
    ['switchyard-deck', [10, 3, 2, 2, '2,3'], { laneCells: 50, transferCells: 10, dividerCells: 10 }],
    ['raised-road', ['2,5,0', 2, 3, 4], { postCells: 14, capCells: 9, footingCells: 12 }],
    [
      'gap-crossings',
      [20, '[[2,5],[8,10],[17,19]]', 2, 3],
      {
        spans: [
          [0, 12],
          [15, 20],
        ],
        deckCells: 51,
      },
    ],
    ['roadside-chests', ['8,21,14', 4, 3], { additional: [0, 2, 1], chests: 7, kit: 21 }],
    ['material-budget', [12, 5, 0.25, 2], 12],
    [
      'station-coverage',
      [20, '0,2,10,15', 3],
      {
        covered: [
          [0, 5],
          [7, 18],
        ],
        uncoveredLength: 4,
      },
    ],
    ['station-platform', [20, 3, 2, 2], { perSide: 5, stalls: 10, sparePerSide: 1 }],
    ['passing-bays', [30, 11, 4, 2], { count: 2, spacing: 10, wideningCells: 16 }],
    ['patch-window', ['4,2,8', 2, 4, 1, 5], { patches: 2, cells: 12, used: 5 }],
    ['transfer-window', [12, 3, 1, '8,4,5,5', 18, 3], { departureIndex: 3, ready: 5, departure: 5, arrival: 11 }],
    ['route-clock', [road, 3, 2, 3], { distance: 15, turnTime: 7, total: 12 }],
    [
      'dwell-budget',
      ['10,6', '5,2', '1,2', 7],
      {
        times: [
          { arrival: 2, departure: 3 },
          { arrival: 6, departure: 8 },
        ],
        slack: -1,
        fits: false,
      },
    ],
    ['directional-trip', ['8,6', '4,3', '2,6', 1, 2], { outbound: 4, inbound: 5, cycle: 12 }],
    ['launch-headway', [12, '2,4,3', 2], [0, 3.5, 4]],
    ['terminal-capacity', [10, 2, 4, 4, 3], { fleetRate: 0.4, loadingRate: 0.5, laneRate: 1 / 3, capacity: 1 / 3 }],
    [
      'upgrade-priority',
      ['12,24,30', '3,2,10', 6, '2,5,1'],
      [
        { segment: 2, timeSaved: 8, savingsPerBuildTime: 1.6 },
        { segment: 1, timeSaved: 2, savingsPerBuildTime: 1 },
      ],
    ],
    ['spur-budget', ['12,0,8', 2, 4, 10], { deckCells: 40, transferCells: 12, portalCells: 30 }],
    [
      'neighboring-spurs',
      [20, '16,2,7,12,12', 10],
      { behind: { spur: 3, distance: 3 }, ahead: { spur: 4, distance: 2 } },
    ],
    ['alternate-window', [12, 4, 3, 1, 21], { outbound: 3, inbound: 2 }],
    ['breakdown-detour', [10, 12, 5, 4, 1], { original: 2, detour: 5, delay: 3 }],
  ],
};

const calculate = (name, command, ...args) =>
  calculateOffline(
    WATERWAY_GROUPS.find((group) => group.name === name),
    command,
    args,
  ).result;

test('waterway planners have 50 unique documented commands with expected-output cases', () => {
  assert.deepEqual(
    WATERWAY_GROUPS.map(({ name }) => name),
    Object.keys(cases),
  );
  const docs = readFileSync(new URL('../docs/PLANNING-WATERWAYS.md', import.meta.url), 'utf8');
  for (const { name, commands } of WATERWAY_GROUPS) {
    assert.equal(commands.length, 25);
    const documented = docs.split(`### ${name}\n`)[1].split('\n### ')[0];
    const signatures = [...documented.matchAll(/^\| `(.*?)` \|/gm)].map((match) => match[1]);
    const names = commands.map(({ signature }) => signature.split(' ')[0]);
    assert.equal(new Set(names).size, 25);
    assert.deepEqual(
      names,
      cases[name].map(([command]) => command),
    );
    assert.deepEqual(
      signatures,
      commands.map(({ signature }) => signature),
    );
  }
});

for (const [group, checks] of Object.entries(cases)) {
  for (const [command, args, expected] of checks) {
    test(`${group} ${command} gives the documented arithmetic`, () => {
      assert.deepEqual(calculate(group, command, ...args), expected);
      assert.throws(() => calculate(group, command), /exactly the documented arguments/);
    });
  }
}

test('sponge planning rejects inconsistent sections and protects exact fits', () => {
  const run = (command, ...args) => calculate('sponge-plan', command, ...args);
  assert.throws(() => run('section-at', 4, 4, 2, 2, 1, 3), /outside the grid/);
  assert.throws(() => run('divider-gates', 7, 6, '2,3', 5, 3), /do not fit/);
  assert.throws(() => run('divider-gates', 7, 4, '2,3', 5, 2), /taller than the wall/);
  assert.throws(() => run('barrier-kit', '4,4', '0,5', 20), /reclaim more/);
  assert.throws(() => run('temporary-fill', '5,4', '0,6', 1), /fit inside/);
  assert.throws(() => run('wet-checkpoints', 0, '1', '1,1', '0'), /equal lengths/);
  assert.throws(() => run('stage-depth', 14, 5, 4), /below the excavation floor/);
  assert.throws(() => run('seal-survey', '3', '1.5', 1), /between zero and one/);
  assert.equal(run('staging-stock', 2, 0.1, 0.3, 0), 6);
  assert.equal(run('pump-crew', 0.3, 0, 0.1, 0, 1), 3);
  assert.equal(run('pump-crew', 24, 2, 4, 5, 5), null);
  assert.equal(run('pump-outage', 24, 6, 2, 6, 2), 6);
  assert.equal(run('pump-handoff', 24, 2, 6, 6, 0), 6);
  assert.equal(run('pump-handoff', 24, 2, 4, 1, 2), null);
  assert.deepEqual(run('reuse-shifts', 9, 3, 0, 1000000), { elapsed: 1, placed: 3, remaining: 6, clean: 0, wet: 3 });
  assert.deepEqual(run('breach-level', 4, 2, 7, 2), { waterDepth: 2, moved: 0, direction: null });
  assert.deepEqual(run('dry-first', '1,1,3', '0,0,4', 4, 0, 0.5), { completed: [1, 2], used: 0.5 });
});

test('ice-road planning handles malformed geometry, edge coverage, and blocked schedules', () => {
  const run = (command, ...args) => calculate('ice-road', command, ...args);
  assert.throws(() => run('turn-mix', '[[0,0]]'), /at least two/);
  assert.throws(() => run('turn-mix', '[[0,0],[0,0]]'), /nonzero axis-aligned/);
  assert.throws(() => run('turn-mix', '[[0,0],[1,1]]'), /axis-aligned/);
  assert.throws(() => run('turn-mix', '[[0,0],[0.5,0]]'), /whole block coordinates/);
  assert.throws(() => run('gap-crossings', 8, '[[0,9]]', 1, 2), /inside the road/);
  assert.throws(() => run('station-coverage', 20, '3,21', 2), /inside the road/);
  assert.throws(() => run('switchyard-deck', 8, 2, 3, 1, '3,6'), /must fit/);
  assert.throws(() => run('station-platform', 15, 2, 1, 3), /1 or 2/);
  assert.throws(() => run('directional-trip', '8,6', '4', '2,6', 1, 2), /equal lengths/);
  assert.deepEqual(run('curve-clearance', '[[0,0],[2,0],[3,0],[3,1]]', 1, 3), { straightRuns: [2, 0], fits: true });
  assert.deepEqual(run('turn-mix', '[[0,0],[0,1],[1,1]]'), { left: 1, right: 0, reverse: 0, straight: 0 });
  assert.deepEqual(run('station-coverage', 20, '0,10,20', 5), { covered: [[0, 20]], uncoveredLength: 0 });
  assert.deepEqual(run('neighboring-spurs', 20, '2,7,7', 7), {
    behind: { spur: 2, distance: 0 },
    ahead: { spur: 2, distance: 0 },
  });
  assert.equal(run('passing-bays', 20, 5, 6, 2), null);
  assert.equal(run('material-budget', 1, 0, 1, 0), null);
  assert.equal(run('material-budget', 1, 1, 1, 0), 0);
  assert.equal(run('transfer-window', 12, 3, 1, '3,4.9', 18, 3), null);
  assert.deepEqual(run('alternate-window', 12, 4, 3, 1, 0), { outbound: 0, inbound: 0 });
  assert.deepEqual(run('launch-headway', 10, '2,10,2', 15), [0, 5, 6]);
});
