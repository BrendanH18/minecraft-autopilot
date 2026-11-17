import test from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import {
  navigationCalculation as calc,
  registerNavigation,
  NAV_COMMANDS,
  navNumber,
  navPoint,
} from '../src/navigation.js';

const cases = [
  ['block', ['-0.2,64.9,-16.1'], (value) => assert.deepEqual(value.block, { x: -1, y: 64, z: -17 })],
  ['chunk', ['-0.2,64,-16'], (value) => assert.deepEqual(value, { chunkX: -1, chunkZ: -1 })],
  ['region', ['-0.2,64,512'], (value) => assert.deepEqual(value, { regionX: -1, regionZ: 1, file: 'r.-1.1.mca' })],
  ['chunk-origin', ['-1', '2'], (value) => assert.deepEqual(value, { x: -16, z: 32 })],
  ['region-origin', ['-1', '2'], (value) => assert.deepEqual(value, { x: -512, z: 1024 })],
  ['chunk-local', ['-0.2,64.9,-16.1'], (value) => assert.deepEqual(value, { x: 15, y: 64, z: 15 })],
  ['region-local', ['-0.2,64,512'], (value) => assert.deepEqual(value, { chunkX: 31, chunkZ: 0 })],
  ['section', ['0,-0.2,0'], (value) => assert.equal(value.sectionY, -1)],
  ['section-origin', ['-4'], (value) => assert.equal(value.y, -64)],
  ['distance', ['0,0,0', '3,12,4'], (value) => assert.equal(value.distance, 13)],
  ['horizontal', ['0,0,0', '3,12,4'], (value) => assert.equal(value.horizontalDistance, 5)],
  ['displacement', ['1,2,3', '-1,4,7'], (value) => assert.deepEqual(value.delta, { x: -2, y: 2, z: 4 })],
  [
    'heading',
    ['0,64,0', '1,64,0'],
    (value) => {
      assert.equal(value.compass, 'east');
      assert.equal(value.yaw, -90);
    },
  ],
  ['midpoint', ['0,64,0', '2,66,4'], (value) => assert.deepEqual(value.point, { x: 1, y: 65, z: 2 })],
  ['offset', ['1,64,2', '-2', '3', '4'], (value) => assert.deepEqual(value.point, { x: -1, y: 67, z: 6 })],
  ['interpolate', ['0,0,0', '4,8,12', '0.25'], (value) => assert.deepEqual(value.point, { x: 1, y: 2, z: 3 })],
  ['nether', ['80,64,-40'], (value) => assert.deepEqual(value.point, { x: 10, y: 64, z: -5 })],
  ['overworld', ['10,64,-5'], (value) => assert.deepEqual(value.point, { x: 80, y: 64, z: -40 })],
  [
    'route',
    ['0,0,0', '3,0,4', '3,12,4'],
    (value) => {
      assert.equal(value.distance, 17);
      assert.equal(value.legs, 2);
    },
  ],
  [
    'reverse-route',
    ['0,0,0', '1,2,3'],
    (value) =>
      assert.deepEqual(value.points, [
        { x: 1, y: 2, z: 3 },
        { x: 0, y: 0, z: 0 },
      ]),
  ],
  ['close-route', ['0,0,0', '1,2,3'], (value) => assert.deepEqual(value.points.at(-1), value.points[0])],
  [
    'route-bounds',
    ['1,2,3', '-1,4,0', '7,0,2'],
    (value) => assert.deepEqual(value, { min: { x: -1, y: 0, z: 0 }, max: { x: 7, y: 4, z: 3 } }),
  ],
  [
    'route-sample',
    ['0,0,0', '10,0,0', '3'],
    (value) => {
      assert.equal(value.points.length, 5);
      assert.equal(value.points[1].x, 2.5);
      assert.equal(value.points.at(-1).x, 10);
    },
  ],
  ['contains', ['10,10,10', '0,0,0', '0,5,10'], (value) => assert.equal(value.contains, true)],
  [
    'nearest',
    ['0,0,0', '2,0,0', '0,0,1', '0,0,-1'],
    (value) => {
      assert.equal(value.index, 2);
      assert.equal(value.distance, 1);
      assert.deepEqual(value.point, { x: 0, y: 0, z: 1 });
    },
  ],
];
for (const [name, args, check] of cases) {
  test(`nav ${name} calculates its documented result and registers as a working command`, async () => {
    check(calc(name, ...args));
    const program = new Command().exitOverride();
    let printed;
    registerNavigation(program, {
      print: (value) => {
        printed = value;
      },
    });
    await program.parseAsync(['nav', name, '--', ...args], { from: 'user' });
    check(printed);
    assert.deepEqual(printed, calc(name, ...args));
  });
}
test('navigation exposes exactly 25 unique documented commands', () => {
  assert.equal(NAV_COMMANDS.length, 25);
  assert.equal(new Set(NAV_COMMANDS.map(([name]) => name)).size, 25);
  assert.deepEqual(
    cases.map(([name]) => name),
    NAV_COMMANDS.map(([name]) => name),
  );
});
test('navigation rejects malformed points, unsafe numbers, and world-bound targets', () => {
  for (const value of ['', ' ', 'Infinity', 'NaN', undefined, {}, '1e999'])
    assert.throws(() => navNumber(value), /finite/);
  for (const value of ['0,0', '0,0,0,0', '0,,0', '30000000,64,0', '0,-65,0', '0,321,0', 'a,0,0'])
    assert.throws(() => navPoint(value));
  assert.deepEqual(navPoint('-29999984,-64,29999984'), { x: -29999984, y: -64, z: 29999984 });
  assert.throws(() => calc('offset', '0,320,0', 0, 1, 0), /bounds/);
  assert.throws(() => calc('overworld', '29999984,64,0'), /bounds/);
  assert.throws(() => calc('chunk-origin', '0.5', '0'), /integer/);
  assert.throws(() => calc('region-origin', '1000000', '0'), /integer/);
  assert.throws(() => calc('section-origin', '-5'), /integer/);
  assert.throws(() => calc('interpolate', '0,0,0', '1,1,1', '1.1'), /Fraction/);
  assert.throws(() => calc('interpolate', '0,0,0', '1,1,1', '-0.1'), /Fraction/);
});
test('route helpers enforce bounded output and handle closed, empty-length and outside cases', () => {
  assert.throws(() => calc('route', '0,0,0'), /2 to 50/);
  assert.throws(() => calc('route', ...Array(51).fill('0,0,0')), /2 to 50/);
  assert.equal(calc('close-route', '0,0,0', '1,0,0', '0,0,0').points.length, 3);
  assert.throws(() => calc('route-sample', '0,0,0', '10,0,0', '0'), /positive/);
  assert.throws(() => calc('route-sample', '0,0,0', '10,0,0', '-1'), /positive/);
  assert.throws(() => calc('route-sample', '0,0,0', '1000,0,0', '1'), /1000/);
  assert.equal(calc('route-sample', '0,0,0', '0,0,0', '1').points.length, 2);
  assert.equal(calc('contains', '0,0,0', '1,1,1', '2,0,0').contains, false);
  assert.equal(calc('heading', '0,64,0', '0,64,0').compass, null);
  assert.throws(() => calc('unknown'), /Unknown/);
});

test('section origin excludes the nonexistent section at the top protocol boundary', () => {
  assert.deepEqual(calc('section-origin', '19'), { y: 304 });
  assert.throws(() => calc('section-origin', '20'), /integer/);
});
