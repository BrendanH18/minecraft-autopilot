import test from 'node:test';
import { testStudyWorkflows } from './planning-study-workflow-checks.js';
import assert from 'node:assert/strict';
import { calculateOffline } from '../src/offline-kit.js';
import { STATION_GROUPS } from '../src/planning-stations.js';
import { furnaceCases, brewingCases } from '../src/planning-examples-stations.js';

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
