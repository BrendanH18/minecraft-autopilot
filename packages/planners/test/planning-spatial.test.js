import test from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { SPATIAL_GROUPS } from '../src/planning-spatial.js';
import { SPATIAL_CASES } from './planning-spatial-cases.js';
import { calculateOffline, registerOfflineGroups } from '../src/offline-kit.js';

function close(actual, expected) {
  if (typeof expected === 'number') {
    assert.equal(typeof actual, 'number');
    assert.ok(Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
  } else if (expected && typeof expected === 'object') {
    assert.deepEqual(Object.keys(actual), Object.keys(expected));
    for (const k of Object.keys(expected)) close(actual[k], expected[k]);
  } else assert.equal(actual, expected);
}
const calculation = (group, command, args) =>
  calculateOffline(
    SPATIAL_GROUPS.find((g) => g.name === group),
    command,
    args,
  ).result;

test('spatial inventory contains 250 unique documented callable behaviors', () => {
  assert.equal(SPATIAL_GROUPS.length, 10);
  assert.equal(SPATIAL_CASES.length, 250);
  assert.equal(new Set(SPATIAL_CASES.map(([g, c]) => `${g}/${c}`)).size, 250);
  for (const group of SPATIAL_GROUPS) {
    assert.equal(group.commands.length, 25);
    assert.equal(new Set(group.commands.map((c) => c.signature.split(' ')[0])).size, 25);
    assert.deepEqual(
      group.commands.map((c) => c.signature.split(' ')[0]),
      SPATIAL_CASES.filter(([g]) => g === group.name).map(([, c]) => c),
    );
  }
});

for (const [groupName, command, args, expected] of SPATIAL_CASES) {
  test(`${groupName} ${command}: expected arithmetic and Commander output`, async () => {
    const group = SPATIAL_GROUPS.find((g) => g.name === groupName);
    const result = calculateOffline(group, command, args);
    close(result.result, expected);
    assert.match(result.note, /Offline/);
    const program = new Command().exitOverride();
    let printed;
    registerOfflineGroups(program, [group], {
      print: (v) => {
        printed = v;
      },
    });
    await program.parseAsync([groupName, command, ...args], { from: 'user' });
    close(printed.result, expected);
    assert.throws(() => calculateOffline(group, command, []));
    assert.throws(() =>
      calculateOffline(
        group,
        command,
        args.map((v, i) => (i ? v : 'NaN')),
      ),
    );
  });
}

test('zero directions, invalid shapes and integer-cell errors fail explicitly', () => {
  assert.throws(() => calculation('vector', 'normalize', ['[[0,0,0]]']));
  assert.throws(() => calculation('vector', 'triangle-normal', ['[[0,0,0],[1,0,0],[2,0,0]]']));
  assert.throws(() => calculation('vector', 'dot', ['[[1,0,0]]', '[[1,0,0],[0,1,0]]']));
  assert.throws(() => calculation('voxel', 'unique', ['[[0.5,0,0]]']));
  assert.throws(() => calculation('voxel', 'fill-box', ['[[1,0,0],[0,0,0]]']));
  assert.deepEqual(calculation('voxel', 'fill-box', ['[[0,0,0],[0,0,0]]']), [[0, 0, 0]]);
  assert.throws(() => calculation('voxel', 'fill-box', ['[[0,0,0],[1000,0,0]]']));
  assert.throws(() => calculation('spiral', 'helix-samples', ['2', '3', '2', '1000']));
  assert.throws(() => calculation('spiral', 'arch-samples', ['1', '-2', '2', '3']));
  assert.throws(() => calculation('landmark', 'trilaterate-flat', ['20', '2', '2']));
  assert.throws(() => calculation('landmark', 'bearing-cross', ['[[0,0],[2,2]]', '0', '180']));
});

test('voxel growth, connectivity, duplicates and erosion retain cell semantics', () => {
  const cross = [
    [0, 0, 0],
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
  assert.deepEqual(calculation('voxel', 'erode', [JSON.stringify(cross)]), [[0, 0, 0]]);
  assert.equal(calculation('voxel', 'face-count', ['[[0,0,0],[0,0,0]]']), 6);
  assert.equal(calculation('voxel', 'components', ['[[0,0,0],[1,1,0]]']).length, 2);
  const line = JSON.stringify(Array.from({ length: 1000 }, (_, i) => [i, 0, 0]));
  assert.throws(() => calculation('voxel', 'dilate', [line]));
  assert.throws(() => calculation('voxel', 'union', [line, '[[1001,0,0]]']));
});

test('fractional count rounding and construction dimensions are bounded', () => {
  assert.equal(calculation('roofplan', 'tile-order', ['100', '2', '0.1']), 55);
  assert.equal(calculation('roofplan', 'tile-order', ['0', '2', '0.1']), 0);
  assert.throws(() => calculation('tunnel', 'clear-width', ['4', '2']));
  assert.throws(() => calculation('bridgeplan', 'post-count', ['0', '1', '1']));
  assert.throws(() => calculation('roofplan', 'hip-ridge', ['10', '5']));
  assert.throws(() => calculation('district', 'setback-area', ['4', '5', '3']));
  assert.throws(() => calculation('facade', 'net-wall', ['4', '5', '21']));
});

test('rotation, helix and survey calculations use meaningful nonzero angles', () => {
  close(calculation('symmetry', 'rotate-y', ['[[1,2,0]]', '90']), [[0, 2, -1]]);
  close(calculation('symmetry', 'radial-orbit', ['[[1,0,0]]', '4']), [
    [1, 0, 0],
    [0, 0, -1],
    [-1, 0, 0],
    [0, 0, 1],
  ]);
  close(calculation('spiral', 'helix-point', ['2', '3', '0.25']), [0, 0.75, 2]);
  close(calculation('spiral', 'arch-point', ['2', '2', '0.25']), [0, 2.5]);
  close(calculation('landmark', 'bearing-cross', ['[[0,0],[2,0]]', '45', '135']), [1, 1]);
  close(calculation('landmark', 'height-from-angle', ['10', '45', '4']), 14);
  assert.equal(calculation('symmetry', 'x-symmetric', ['[[1,0,0]]', '0', '0']), false);
});

test('hip roofs account for all faces and tunnel passages exclude both endpoints', () => {
  assert.equal(calculation('roofplan', 'hip-surface', ['6', '10', '4']), 100);
  assert.equal(calculation('roofplan', 'hip-surface', ['6', '10', '0']), 60);
  assert.equal(calculation('roofplan', 'hip-surface', ['6', '6', '4']), 60);
  assert.equal(calculation('tunnel', 'cross-passages', ['11', '5', '3', '2', '3']), 12);
  assert.equal(calculation('tunnel', 'cross-passages', ['12', '5', '3', '2', '3']), 24);
  assert.equal(calculation('tunnel', 'cross-passages', ['1', '5', '3', '2', '3']), 0);
  assert.equal(calculation('tunnel', 'cross-passages', ['2', '1', '3', '2', '3']), 0);
});

test('nonzero subnormal vectors normalize without reciprocal overflow', () => {
  assert.deepEqual(calculation('vector', 'normalize', ['[[1e-320,0,0]]']), [[1, 0, 0]]);
  assert.throws(() => calculation('vector', 'normalize', ['[[0,0,0]]']));
});

test('voxel overlap scalar accepts individually bounded sets with larger unions', () => {
  const first = JSON.stringify(Array.from({ length: 1000 }, (_, i) => [i, 0, 0]));
  const second = JSON.stringify(Array.from({ length: 1000 }, (_, i) => [i + 1000, 0, 0]));
  assert.equal(calculation('voxel', 'overlap-fraction', [first, second]), 0);
  assert.equal(calculation('voxel', 'overlap-fraction', [first, first]), 1);
  assert.throws(() => calculation('voxel', 'union', [first, second]));
});
