import test from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { geometryCalculation as calc, GEOMETRY_COMMANDS, registerGeometryTools } from '../src/geometry-tools.js';

const p = '0,0,0', q = '3,0,4', r = '3,12,4';
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const cases = [
  ['route-legs', [p, q, r], v => assert.deepEqual(v.legs.map(l => [l.distance, l.horizontalDistance, l.rise]), [[5, 5, 0], [12, 0, 12]])],
  ['route-elevation', [p, r, q], v => { assert.equal(v.ascent, 12); assert.equal(v.descent, 12); assert.equal(v.net, 0); }],
  ['route-grades', [p, '4,2,0', '4,3,0'], v => { assert.equal(v.legs[0].gradePercent, 50); assert.equal(v.legs[1].gradePercent, null); assert.equal(v.legs[1].vertical, true); }],
  ['route-turns', [p, '1,0,0', '1,0,1'], v => assert.equal(v.turns[0].degrees, 90)],
  ['route-detour', [p, q, r], v => { assert.equal(v.traveled, 17); assert.equal(v.direct, 13); assert.equal(v.excess, 4); assert.equal(v.ratio, 17 / 13); }],
  ['route-progress', [p, q, r], v => assert.deepEqual(v.waypoints.map(w => w.cumulative), [0, 5, 17])],
  ['route-at', ['11', p, q, r], v => { assert.deepEqual(v.point, { x: 3, y: 6, z: 4 }); assert.equal(v.leg, 2); }],
  ['route-prefix', ['11', p, q, r], v => assert.deepEqual(v.points, [{ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 4 }, { x: 3, y: 6, z: 4 }])],
  ['route-dedupe', [p, p, q, q, p], v => { assert.equal(v.removed, 2); assert.equal(v.points.length, 3); }],
  ['route-simplify', [p, '1,0,0', '2,0,0', '2,1,0'], v => { assert.equal(v.removed, 1); assert.equal(v.points.length, 3); }],
  ['route-project', ['2,2,0', p, '4,0,0', '4,4,0'], v => { assert.deepEqual(v.point, { x: 2, y: 0, z: 0 }); assert.equal(v.leg, 1); assert.equal(v.alongRoute, 2); assert.equal(v.distance, 2); }],
  ['segment-project', [p, '4,0,0', '2,3,0'], v => { assert.deepEqual(v.point, { x: 2, y: 0, z: 0 }); assert.equal(v.distance, 3); assert.equal(v.fraction, 0.5); }],
  ['sphere-contains', [p, '5', q], v => assert.equal(v.contains, true)],
  ['box-volume', [p, '2,3,4'], v => assert.equal(v.volume, 24)],
  ['box-surface', [p, '2,3,4'], v => assert.equal(v.surfaceArea, 52)],
  ['box-intersection', [p, '4,4,4', '2,2,2', '6,6,6'], v => { assert.equal(v.intersects, true); assert.deepEqual(v.bounds, { min: { x: 2, y: 2, z: 2 }, max: { x: 4, y: 4, z: 4 } }); }],
  ['box-union', [p, '4,4,4', '2,2,2', '6,6,6'], v => { assert.deepEqual(v.min, { x: 0, y: 0, z: 0 }); assert.deepEqual(v.max, { x: 6, y: 6, z: 6 }); }],
  ['box-clamp', [p, '4,4,4', '6,2,2'], v => { assert.deepEqual(v.point, { x: 4, y: 2, z: 2 }); assert.equal(v.distance, 2); }],
  ['sphere-box', ['6,2,2', '2', p, '4,4,4'], v => { assert.equal(v.intersects, true); assert.equal(v.distance, 2); }],
  ['chunk-distance', ['-1,64,-17', '16,64,0'], v => { assert.equal(v.dx, 2); assert.equal(v.dz, 2); assert.equal(v.manhattan, 4); assert.equal(v.chebyshev, 2); }],
  ['chunk-center', ['-1,64,-17'], v => assert.deepEqual(v.point, { x: -8, y: 64, z: -24 })],
  ['block-center', ['-0.1,64.9,-1.1'], v => assert.deepEqual(v.point, { x: -0.5, y: 64.5, z: -1.5 })],
  ['bearing-target', [p, '-90', '10'], v => { close(v.point.x, 10); close(v.point.z, 0); }],
  ['rotate', ['1,5,0', p, '90'], v => { close(v.point.x, 0); assert.equal(v.point.y, 5); close(v.point.z, 1); }],
  ['route-time', ['2', p, q, r], v => assert.equal(v.seconds, 8.5)],
];
for (const [name, args, check] of cases) test(`geometry ${name} calculates and registers its CLI command`, async () => {
  check(calc(name, ...args));
  const program = new Command().exitOverride();
  let printed;
  registerGeometryTools(program, { print: value => { printed = value; } });
  await program.parseAsync(['geometry', name, '--', ...args], { from: 'user' });
  check(printed);
  assert.deepEqual(printed, calc(name, ...args));
  assert.match(printed.note, /terrain/);
});
test('geometry has exactly 25 unique commands, all covered', () => {
  assert.equal(GEOMETRY_COMMANDS.length, 25);
  assert.deepEqual(GEOMETRY_COMMANDS.map(([name]) => name), cases.map(([name]) => name));
  assert.equal(new Set(GEOMETRY_COMMANDS.map(([name]) => name)).size, 25);
});
test('geometry rejects invalid input for every command', () => {
  for (const [name, args] of cases) {
    const invalid = [...args]; invalid[0] = 'NaN';
    assert.throws(() => calc(name, ...invalid), undefined, name);
    assert.throws(() => calc(name), undefined, `missing ${name}`);
  }
  assert.throws(() => calc('unknown'), /Unknown/);
  assert.throws(() => calc('route-legs', p), /2 to 50/);
  assert.throws(() => calc('route-legs', ...Array(51).fill(p)), /2 to 50/);
  assert.throws(() => calc('route-at', '-1', p, q), /nonnegative/);
  assert.throws(() => calc('route-at', '6', p, q), /exceeds/);
  assert.throws(() => calc('route-prefix', '6', p, q), /exceeds/);
  for (const radius of ['-1', 'Infinity', '10000000001']) assert.throws(() => calc('sphere-contains', p, radius, q));
  for (const speed of ['0', '-1', '1001', 'Infinity']) assert.throws(() => calc('route-time', speed, p, q));
  assert.throws(() => calc('route-time', '5e-324', p, q), /finite duration/);
  assert.throws(() => calc('rotate', q, p, '361'), /Angle/);
  assert.throws(() => calc('bearing-target', p, '0', '100000000'), /bounds/);
  assert.throws(() => calc('block-center', '0,320,0'), /bounds/);
  assert.throws(() => calc('chunk-center', '29999984,64,0'), /bounds/);
});
test('degenerate segments and routes preserve deterministic endpoints', () => {
  assert.equal(calc('segment-project', p, p, q).fraction, 0);
  assert.equal(calc('segment-project', p, '1,0,0', '2,0,0').fraction, 1);
  assert.equal(calc('segment-project', p, '1,0,0', '-2,0,0').fraction, 0);
  assert.equal(calc('route-detour', p, q, p).ratio, null);
  assert.equal(calc('route-at', '0', p, p).total, 0);
  assert.deepEqual(calc('route-prefix', '0', p, q).points, [{ x: 0, y: 0, z: 0 }]);
  assert.deepEqual(calc('route-prefix', '5', p, q).points, [{ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 4 }]);
  assert.equal(calc('route-dedupe', p, p).points.length, 1);
  assert.equal(calc('route-simplify', p, q, p).removed, 0);
  assert.equal(calc('route-turns', p, p, q).turns[0].degrees, null);
  assert.equal(calc('route-grades', p, p).legs[0].vertical, false);
  assert.equal(calc('sphere-contains', p, '0', p).contains, true);
  assert.equal(calc('sphere-contains', p, '4.9', q).contains, false);
  assert.equal(calc('sphere-box', '6,2,2', '1', p, '4,4,4').intersects, false);
});
test('cuboid operations handle reversed corners, disjoint boxes, and touching faces', () => {
  assert.equal(calc('box-volume', '2,3,4', p).volume, 24);
  assert.equal(calc('box-volume', p, p).volume, 0);
  assert.equal(calc('box-intersection', p, '1,1,1', '2,2,2', '3,3,3').bounds, null);
  assert.equal(calc('box-intersection', p, '1,1,1', '1,1,1', '2,2,2').intersects, true);
});
