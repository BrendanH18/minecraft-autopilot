import test from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { COORDINATION_GROUPS } from '../src/planning-coordination.js';
import { calculateOffline, registerOfflineGroups } from '../src/offline-kit.js';
import { COORDINATION_CASES } from './planning-coordination-cases.js';

function close(actual, expected) {
  if (typeof expected === 'number') {
    assert.equal(typeof actual, 'number');
    assert.ok(Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
  } else if (expected && typeof expected === 'object') {
    assert.deepEqual(Object.keys(actual), Object.keys(expected));
    for (const key of Object.keys(expected)) close(actual[key], expected[key]);
  } else assert.equal(actual, expected);
}

for (const [name, command, args, expected] of COORDINATION_CASES) {
  test(`${name} ${command}: expected result and parsed command`, async () => {
    const group = COORDINATION_GROUPS.find((g) => g.name === name);
    close(calculateOffline(group, command, args).result, expected);
    const program = new Command().exitOverride();
    let printed;
    registerOfflineGroups(program, [group], {
      print: (value) => {
        printed = value;
      },
    });
    await program.parseAsync([name, command, '--', ...args], { from: 'user' });
    close(printed.result, expected);
    assert.match(printed.note, /Offline/);
    assert.throws(() => calculateOffline(group, command, []));
    assert.throws(() =>
      calculateOffline(
        group,
        command,
        args.map((v, i) => (i === 0 ? 'NaN' : v)),
      ),
    );
  });
}

test('coordination rejects invalid geometry, dependency graphs, schedules, and unbounded output', () => {
  const calc = (name, cmd, args) =>
    calculateOffline(
      COORDINATION_GROUPS.find((g) => g.name === name),
      cmd,
      args,
    );
  assert.throws(() => calc('interval-set', 'clip', ['[[0,1]]', '3', '2']));
  assert.throws(() => calc('dependency', 'order', ['2', '[[0,1],[1,0]]']));
  assert.throws(() => calc('dependency', 'order', ['2', '[[0,2]]']));
  assert.throws(() => calc('pathplan', 'sample', ['[[1,1],[1,1]]', '0']));
  assert.throws(() => calc('shiftplan', 'lateness', ['1,2', '3']));
  assert.throws(() => calc('tiling', 'cells', ['1000', '1000', '1', '1']));
  assert.throws(() => calc('reach', 'required-speed', ['1', '1', '2']));
  assert.throws(() => calc('patrol', 'next-pass', ['5', '5', '10']));
  assert.throws(() => calc('patrol', 'pass-times', ['5', '0', '1001']));
  assert.throws(() => calc('pointcloud', 'snap', ['[[1,2]]', '0']));
  assert.deepEqual(calc('interval-set', 'exclude', ['[[0,3]]', '1', '1']).result, [[0, 3]]);
  assert.equal(calc('tiling', 'tiles', ['0.3', '1', '0.1', '1']).result, 3);
  assert.equal(calc('tiling', 'edge-width', ['0.3', '1', '0.1', '1']).result, 0);
});

const calc = (name, command, args) =>
  calculateOffline(
    COORDINATION_GROUPS.find((g) => g.name === name),
    command,
    args,
  ).result;

test('simplifying repeated route vertices preserves turning waypoints', () => {
  assert.deepEqual(calc('pathplan', 'simplify-collinear', ['[[0,0],[1,0],[1,0],[1,1]]']), [
    [0, 0],
    [1, 0],
    [1, 1],
  ]);
  assert.deepEqual(calc('pathplan', 'simplify-collinear', ['[[0,0],[0,0],[1,0],[2,0],[2,0]]']), [
    [0, 0],
    [2, 0],
  ]);
  assert.deepEqual(calc('pathplan', 'simplify-collinear', ['[[1,1],[1,1]]']), [[1, 1]]);
});

test('dependency tools accept edgeless graphs and no completed tasks', async () => {
  for (const command of ['order', 'roots', 'leaves', 'isolated'])
    assert.deepEqual(calc('dependency', command, ['3', '[]']), [0, 1, 2]);
  assert.equal(calc('dependency', 'edges', ['3', '[]']), 0);
  assert.deepEqual(calc('dependency', 'ready-after', ['3', '[]', '']), [0, 1, 2]);
  assert.deepEqual(calc('dependency', 'ready-after', ['2', '[[0,1]]', '']), [0]);
  assert.throws(() => calc('dependency', 'ready-after', ['2', '[]', '1,,2']));
  assert.throws(() => calc('dependency', 'order', ['2', '[[0,.5]]']));
  const program = new Command().exitOverride();
  let printed;
  registerOfflineGroups(
    program,
    COORDINATION_GROUPS.filter((g) => g.name === 'dependency'),
    {
      print: (value) => {
        printed = value;
      },
    },
  );
  await program.parseAsync(['dependency', 'ready-after', '3', '[]', ''], { from: 'user' });
  assert.deepEqual(printed.result, [0, 1, 2]);
});

test('decimal completion and arrival comparisons agree at inclusive boundaries', () => {
  assert.equal(calc('reach', 'can-arrive', ['.1', '1', '.2', '.3']), true);
  assert.equal(calc('reach', 'can-arrive', ['.1', '1', '.2', '.299']), false);
  assert.equal(calc('shiftplan', 'completed-at', ['.1,.2', '.3']), 2);
  assert.equal(calc('shiftplan', 'active-at', ['.1,.2', '.3']), null);
  assert.equal(calc('shiftplan', 'active-at', ['.1,.2,.1', '.3']), 2);
  assert.equal(calc('shiftplan', 'active-at', ['.1,.2', '.299']), 1);
  const durations = Array(1000).fill('.3').join(',');
  assert.equal(calc('shiftplan', 'completed-at', [durations, '300']), 1000);
  assert.equal(calc('shiftplan', 'active-at', [durations, '300']), null);
  assert.equal(calc('shiftplan', 'completed-at', [durations, '299.999']), 999);
  assert.equal(calc('shiftplan', 'active-at', [durations, '299.999']), 999);
});

test('excluding an open interval retains coincident closed endpoints', () => {
  assert.deepEqual(calc('interval-set', 'exclude', ['[[0,3]]', '0', '3']), [
    [0, 0],
    [3, 3],
  ]);
  assert.deepEqual(calc('interval-set', 'exclude', ['[[0,3]]', '0', '4']), [[0, 0]]);
  assert.deepEqual(calc('interval-set', 'exclude', ['[[0,3]]', '-1', '3']), [[3, 3]]);
  assert.deepEqual(calc('interval-set', 'exclude', ['[[0,3]]', '-1', '4']), []);
});

test('decimal patrol cycle boundaries agree on phase, position, and state', () => {
  assert.equal(calc('patrol', 'phase', ['.2', '.6']), 0);
  assert.equal(calc('patrol', 'phase', ['.2', '-.6']), 0);
  assert.equal(calc('patrol', 'position', ['1', '10', '.1', '.6']), 0);
  assert.equal(calc('patrol', 'state', ['1', '10', '.1', '.6']), 'moving');
  assert.equal(calc('patrol', 'state', ['1', '10', '.1', '.3']), 'resting');
  assert.equal(calc('patrol', 'state', ['1', '10', '.1', '.5999']), 'resting');
  assert.ok(calc('patrol', 'phase', ['.2', '.5999']) > 0.19);
});
