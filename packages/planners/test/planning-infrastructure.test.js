import assert from 'node:assert/strict';
import test from 'node:test';
import { testStudyWorkflows } from './planning-study-workflow-checks.js';
import { calculateOffline } from '../src/offline-kit.js';
import { INFRASTRUCTURE_GROUPS } from '../src/planning-infrastructure.js';
import { tunnelCases, canalCases } from '../src/planning-examples-infrastructure.js';

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
