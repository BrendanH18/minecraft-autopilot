import test from 'node:test';
import assert from 'node:assert/strict';
import { DEPOT_COMMANDS, depotReport } from '../src/depot-tools.js';

const baseTime = Date.parse('2026-01-01T00:00:00Z');
const container = (x, items, age = 0) => ({
  x,
  y: 64,
  z: 0,
  ...(items === undefined ? {} : { items }),
  observedAt: baseTime + age * 1000,
});
const stack = (name, count) => ({ name, count });
const snapshot = (seconds, containers, inventory) => ({
  savedAt: new Date(baseTime + seconds * 1000).toISOString(),
  player: { position: { x: 0, y: 64, z: 0 }, dimension: 'minecraft:overworld' },
  inventory,
  containers,
});
const before = snapshot(
  0,
  [container(0, [stack('dirt', 10), stack('bread', 2)]), container(1, []), container(2, [stack('dirt', 8)])],
  [stack('dirt', 2)],
);
const after = snapshot(
  60,
  [
    container(0, [stack('dirt', 4), stack('bread', 2)], 50),
    container(1, [stack('dirt', 6)], 50),
    container(2, [], 50),
    container(3, [stack('dirt', 10)], 50),
  ],
  [stack('dirt', 4)],
);
const report = (name, ...args) => depotReport(before, after, name, args);

test('all 25 depot commands have independent expected results', () => {
  assert.equal(DEPOT_COMMANDS.length, 25);
  assert.equal(new Set(DEPOT_COMMANDS.map((c) => c[0].split(' ')[0])).size, 25);
  const checks = {
    coverage: () => {
      const r = report('coverage');
      assert.deepEqual(r.before, { containers: 3, opened: 3, unopened: 0, timed: 3 });
      assert.equal(r.after.containers, 4);
    },
    discovered: () => assert.deepEqual(report('discovered').containers, [{ x: 3, y: 64, z: 0 }]),
    missing: () => {
      const r = depotReport(
        after,
        { ...after, savedAt: '2026-01-01T00:02:00Z', containers: after.containers.slice(1) },
        'missing',
      );
      assert.deepEqual(r.containers, [{ x: 0, y: 64, z: 0 }]);
    },
    opened: () => {
      const r = depotReport({ ...before, containers: [container(0)] }, after, 'opened');
      assert.deepEqual(r.containers, [{ x: 0, y: 64, z: 0 }]);
    },
    obscured: () => {
      const r = depotReport(before, { ...after, containers: [container(0)] }, 'obscured');
      assert.deepEqual(r.containers, [{ x: 0, y: 64, z: 0 }]);
    },
    refreshed: () => {
      const r = report('refreshed');
      assert.equal(r.containers.length, 3);
      assert.equal(r.containers[0].delta, 50000);
    },
    aging: () => {
      const r = report('aging');
      assert.equal(r.containers[0].before, 0);
      assert.equal(r.containers[0].after, 10);
    },
    'changed-containers': () =>
      assert.deepEqual(
        report('changed-containers').containers.map((c) => c.net),
        [-6, 6, -8],
      ),
    'item-changes': () =>
      assert.deepEqual(report('item-changes').containers[0].items, [
        { name: 'minecraft:dirt', before: 10, after: 4, delta: -6 },
      ]),
    'item-total': () => {
      const r = report('item-total', 'dirt');
      assert.equal(r.before, 18);
      assert.equal(r.after, 20);
      assert.equal(r.delta, 2);
    },
    'matched-item': () => {
      const r = report('matched-item', 'dirt');
      assert.equal(r.before, 18);
      assert.equal(r.after, 10);
      assert.equal(r.delta, -8);
    },
    'source-gains': () =>
      assert.deepEqual(
        report('source-gains', 'dirt').containers.map((c) => c.delta),
        [6],
      ),
    'source-losses': () =>
      assert.deepEqual(
        report('source-losses', 'dirt').containers.map((c) => c.delta),
        [-6, -8],
      ),
    'redistribution-bound': () => {
      const r = report('redistribution-bound', 'dirt');
      assert.equal(r.gained, 6);
      assert.equal(r.lost, 14);
      assert.equal(r.potentialRedistribution, 6);
      assert.equal(r.transfersProven, false);
    },
    'newly-stocked': () => assert.deepEqual(report('newly-stocked').containers, [{ x: 1, y: 64, z: 0 }]),
    depleted: () => assert.deepEqual(report('depleted').containers, [{ x: 2, y: 64, z: 0 }]),
    'stable-stock': () =>
      assert.deepEqual(report('stable-stock').containers[0].items, [{ name: 'minecraft:bread', count: 2 }]),
    'food-change': () => {
      const r = report('food-change');
      assert.equal(r.before, 10);
      assert.equal(r.after, 10);
    },
    'stack-change': () => {
      const r = report('stack-change');
      assert.equal(r.before, 3);
      assert.equal(r.after, 4);
    },
    concentration: () => {
      const r = report('concentration', 'dirt');
      assert.equal(r.before.largestShare, 10 / 18);
      assert.equal(r.after.largestShare, 0.5);
      assert.equal(r.after.index, 0.38);
    },
    redundancy: () => {
      const r = report('redundancy', 'dirt');
      assert.equal(r.before, 2);
      assert.equal(r.after, 3);
    },
    'carried-stored': () => {
      const r = report('carried-stored', 'dirt');
      assert.equal(r.carried.delta, 2);
      assert.equal(r.stored.delta, 2);
      assert.equal(r.pooled.delta, 4);
    },
    'pooled-quota': () => {
      const r = report('pooled-quota', 'dirt', '25');
      assert.equal(r.beforeMissing, 5);
      assert.equal(r.afterMissing, 1);
    },
    'kit-pool': () => {
      const r = report('kit-pool', 'dirt=25', 'bread=3');
      assert.deepEqual(
        r.quotas.map((q) => q.afterMissing),
        [1, 1],
      );
    },
    'refresh-order': () => {
      const r = report('refresh-order', '5');
      assert.equal(r.containers.length, 3);
      assert.ok(r.containers.every((c) => c.newlyStale));
    },
  };
  for (const [signature] of DEPOT_COMMANDS) {
    const name = signature.split(' ')[0];
    assert.ok(checks[name], name);
    checks[name]();
  }
  const copy = structuredClone(before);
  report('item-changes');
  assert.deepEqual(before, copy);
});

test('depot preserves unknown contents, dimension identity, and evidence boundaries', () => {
  const unopened = { ...before, containers: [container(0)] };
  assert.equal(depotReport(unopened, after, 'item-total', ['dirt']).before, null);
  assert.equal(depotReport(unopened, after, 'food-change').delta, null);
  assert.equal(depotReport(unopened, after, 'matched-item', ['dirt']).matchedOpened, 0);
  const missing = { ...before };
  delete missing.containers;
  assert.equal(depotReport(missing, after, 'discovered').containers, null);
  assert.equal(depotReport(missing, after, 'item-total', ['dirt']).after, null);
  const otherDimension = { ...after, player: { ...after.player, dimension: 'minecraft:the_nether' } };
  assert.equal(depotReport(before, otherDimension, 'discovered').containers, null);
  assert.equal(depotReport(before, otherDimension, 'item-total', ['dirt']).delta, null);
  assert.equal(
    depotReport(before, { ...after, player: { position: after.player.position } }, 'item-changes').containers,
    null,
  );
  const empty = { ...before, containers: [] },
    emptyAfter = { ...after, containers: [] };
  assert.equal(depotReport(empty, emptyAfter, 'item-total', ['dirt']).before, 0);
  assert.equal(depotReport(empty, emptyAfter, 'concentration', ['dirt']).before.index, null);
  const missingInventory = { ...before };
  delete missingInventory.inventory;
  const balance = depotReport(missingInventory, after, 'carried-stored', ['dirt']);
  assert.equal(balance.carried.before, null);
  assert.equal(balance.stored.delta, 2);
  assert.equal(balance.pooled.before, null);
  assert.throws(
    () => depotReport({ ...before, containers: [container(0, []), container(0, [])] }, after, 'coverage'),
    /Duplicate/,
  );
  assert.throws(
    () => depotReport({ ...before, containers: [{ x: 0.5, y: 64, z: 0 }] }, after, 'coverage'),
    /coordinates/,
  );
  assert.throws(
    () => depotReport({ ...before, containers: [container(0, [stack('dirt', -1)])] }, after, 'coverage'),
    /nonnegative/,
  );
  assert.throws(
    () => depotReport({ ...before, containers: [{ ...container(0), observedAt: -1 }] }, after, 'coverage'),
    /observedAt/,
  );
  assert.throws(() => report('pooled-quota', 'dirt', 'NaN'), /finite/);
  assert.throws(() => report('refresh-order', '-1'), /number/);
  assert.throws(() => report('unknown'), /Unknown/);
});
