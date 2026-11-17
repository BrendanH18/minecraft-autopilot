import test from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { BLUEPRINT_COMMANDS, blueprintCalculation as calc, registerBlueprintTools } from '../src/blueprint-tools.js';

export const blueprintFixtures = [
  ['floor', ['4', '5', '2'], (r) => assert.equal(r.blocks, 40)],
  ['floor-border', ['5', '4', '1'], (r) => assert.equal(r.blocks, 14)],
  ['checkerboard', ['5', '3'], (r) => assert.deepEqual([r.firstColor, r.secondColor], [8, 7])],
  ['stripes', ['7', '2', '2'], (r) => assert.deepEqual([r.firstColor, r.secondColor], [8, 6])],
  ['wall', ['6', '3', '2'], (r) => assert.equal(r.blocks, 36)],
  [
    'wall-opening',
    ['10', '4', '2', '3', '3'],
    (r) => assert.deepEqual([r.grossBlocks, r.removed, r.blocks], [40, 18, 22]),
  ],
  ['perimeter-walls', ['5', '4', '3', '1'], (r) => assert.equal(r.blocks, 42)],
  ['closed-shell', ['5', '4', '3', '1'], (r) => assert.deepEqual([r.grossBlocks, r.voidBlocks, r.blocks], [60, 6, 54])],
  ['open-box', ['5', '4', '3', '1'], (r) => assert.deepEqual([r.grossBlocks, r.voidBlocks, r.blocks], [60, 12, 48])],
  [
    'room',
    ['3', '2', '1', '1'],
    (r) => {
      assert.equal(r.blocks, 54);
      assert.deepEqual(r.exterior, { width: 5, depth: 4, height: 3 });
    },
  ],
  ['cuboid-frame', ['5', '4', '3'], (r) => assert.equal(r.blocks, 32)],
  ['pillars', ['3', '4', '2', '2'], (r) => assert.deepEqual([r.blocksPerPillar, r.blocks], [16, 48])],
  ['solid-stairs', ['2', '3', '1', '2'], (r) => assert.deepEqual([r.blocks, r.height, r.length], [24, 3, 6])],
  ['gable-fill', ['5', '3'], (r) => assert.deepEqual([r.layers, r.blocks], [3, 27])],
  ['pyramid', ['5', '4'], (r) => assert.deepEqual([r.layers, r.blocks], [2, 26])],
  ['tunnel-clear', ['2', '3', '4'], (r) => assert.deepEqual([r.cellsToClear, r.endOpening], [24, 6])],
  [
    'tunnel-lining',
    ['2', '3', '4', '1'],
    (r) => assert.deepEqual([r.outsideWidth, r.outsideHeight, r.blocks], [4, 5, 56]),
  ],
  [
    'spaced-posts',
    ['11', '4', '3'],
    (r) => {
      assert.equal(r.blocks, 12);
      assert.deepEqual(r.offsets, [0, 3, 6, 10]);
    },
  ],
  [
    'grid-pillars',
    ['6', '5', '3', '3', '2'],
    (r) => {
      assert.deepEqual(r.xOffsets, [0, 2, 5]);
      assert.deepEqual(r.zOffsets, [0, 2, 4]);
      assert.deepEqual([r.pillars, r.blocks], [9, 18]);
    },
  ],
  [
    'layer-plan',
    ['2', '3', '3'],
    (r) => {
      assert.equal(r.blocks, 18);
      assert.deepEqual(r.layers, [
        { layer: 1, blocks: 6, cumulative: 6 },
        { layer: 2, blocks: 6, cumulative: 12 },
        { layer: 3, blocks: 6, cumulative: 18 },
      ]);
    },
  ],
  ['material-stacks', ['130', '64'], (r) => assert.deepEqual([r.fullStacks, r.remainder, r.occupiedStacks], [2, 2, 3])],
  [
    'batch-output',
    ['10', '4', '3'],
    (r) => assert.deepEqual([r.batches, r.input, r.produced, r.surplus], [3, 9, 12, 2]),
  ],
  ['material-waste', ['101', '10'], (r) => assert.deepEqual([r.allowance, r.total], [11, 112])],
  [
    'material-split',
    ['10', '3'],
    (r) =>
      assert.deepEqual(r.allocations, [
        { builder: 1, blocks: 4 },
        { builder: 2, blocks: 3 },
        { builder: 3, blocks: 3 },
      ]),
  ],
  ['build-time', ['120', '15'], (r) => assert.equal(r.minutes, 8)],
];
for (const [name, args, check] of blueprintFixtures)
  test(`blueprint ${name} calculates materials and parses real command arguments`, async () => {
    const result = calc(name, args);
    check(result);
    assert.match(result.note, /No blocks are placed/);
    const program = new Command().exitOverride();
    let printed;
    registerBlueprintTools(program, {
      print: (value) => {
        printed = value;
      },
    });
    await program.parseAsync(['blueprint', name, '--', ...args], { from: 'user' });
    check(printed);
    assert.deepEqual(printed, result);
  });
test('blueprint exposes exactly 25 distinct tested commands', () => {
  assert.equal(BLUEPRINT_COMMANDS.length, 25);
  assert.deepEqual(
    BLUEPRINT_COMMANDS.map(([s]) => s.split(' ')[0]),
    blueprintFixtures.map(([name]) => name),
  );
  assert.equal(new Set(BLUEPRINT_COMMANDS.map(([s]) => s.split(' ')[0])).size, 25);
});
test('blueprint rejects missing, malformed, fractional, negative, and unbounded count inputs', () => {
  for (const [name, args] of blueprintFixtures) {
    assert.throws(() => calc(name), undefined, name);
    for (const value of ['', '-1', 'Infinity', 'NaN', '1.5', '1000001', '1e3'])
      assert.throws(() => calc(name, [value, ...args.slice(1)]), undefined, `${name} ${value}`);
  }
  assert.throws(() => calc('unknown'), /Unknown/);
  assert.throws(() => calc('wall-opening', ['4', '3', '2', '2', '3']), /fit/);
  assert.throws(() => calc('wall-opening', ['10', '3', '2', '4', '1']), /fit/);
  assert.throws(() => calc('floor', ['1000000', '1000000', '1000000']), /safe integer/);
  assert.throws(() => calc('pyramid', ['1000000', '1000000']), /safe integer/);
  assert.throws(() => calc('room', ['1000000', '1000000', '1000000', '1000000']), /safe integer/);
  assert.throws(() => calc('solid-stairs', ['1000000', '1000000', '1000000', '1000000']), /safe integer/);
  assert.throws(() => calc('spaced-posts', ['1001', '1', '1']), /1000/);
  assert.throws(() => calc('grid-pillars', ['1', '1001', '1', '1', '1']), /1000/);
  assert.throws(() => calc('layer-plan', ['1', '1', '1001']), /1000/);
  assert.throws(() => calc('material-split', ['10', '1001']), /1000/);
  assert.throws(() => calc('material-stacks', ['10', '65']), /64/);
  for (const value of ['-1', 'Infinity', '1001', '']) assert.throws(() => calc('material-waste', ['10', value]));
  for (const value of ['0', '-1', 'Infinity', '1000001', '']) assert.throws(() => calc('build-time', ['10', value]));
});
test('thin structures count shared cells once and clamp nonexistent interiors', () => {
  for (const name of ['floor-border', 'perimeter-walls', 'closed-shell', 'open-box', 'cuboid-frame']) {
    const args =
      name === 'floor-border' ? ['1', '1', '4'] : name === 'cuboid-frame' ? ['1', '1', '1'] : ['1', '1', '1', '4'];
    assert.equal(calc(name, args).blocks, 1, name);
  }
  assert.equal(calc('cuboid-frame', ['1', '4', '4']).blocks, 12);
  assert.equal(calc('cuboid-frame', ['2', '4', '4']).blocks, 24);
  assert.equal(calc('closed-shell', ['5', '4', '3', '2']).blocks, 60);
  assert.equal(calc('open-box', ['5', '4', '3', '3']).blocks, 60);
  assert.deepEqual(calc('spaced-posts', ['1', '4', '2']).offsets, [0]);
  assert.equal(calc('grid-pillars', ['1', '1', '4', '4', '3']).blocks, 3);
  assert.equal(calc('wall-opening', ['4', '3', '2', '3', '2']).blocks, 0);
});
test('patterns and layer counts agree with explicitly enumerated small integer cells', () => {
  for (let width = 1; width <= 8; width++)
    for (let depth = 1; depth <= 8; depth++) {
      const values = [String(width), String(depth)];
      let first = 0;
      for (let x = 0; x < width; x++) for (let z = 0; z < depth; z++) if ((x + z) % 2 === 0) first++;
      assert.equal(calc('checkerboard', values).firstColor, first);
      let expectedPyramid = 0,
        expectedGable = 0;
      for (let w = width, d = depth; w > 0 && d > 0; w -= 2, d -= 2) expectedPyramid += w * d;
      for (let w = width; w > 0; w -= 2) expectedGable += w * depth;
      assert.equal(calc('pyramid', values).blocks, expectedPyramid);
      assert.equal(calc('gable-fill', values).blocks, expectedGable);
      for (let stripe = 1; stripe <= 4; stripe++) {
        let columns = 0;
        for (let x = 0; x < width; x++) if (Math.floor(x / stripe) % 2 === 0) columns++;
        const result = calc('stripes', [...values, String(stripe)]);
        assert.equal(result.firstColor, columns * depth);
        assert.equal(result.firstColor + result.secondColor, width * depth);
      }
    }
});
test('zero materials preserve empty budgets without requesting a batch or stack', () => {
  assert.equal(calc('material-stacks', ['0', '64']).occupiedStacks, 0);
  assert.equal(calc('batch-output', ['0', '4', '3']).batches, 0);
  assert.equal(calc('material-waste', ['0', '20']).total, 0);
  assert.equal(calc('material-waste', ['10', '0']).total, 10);
  assert.equal(
    calc('material-split', ['0', '3']).allocations.reduce((n, a) => n + a.blocks, 0),
    0,
  );
  assert.equal(calc('build-time', ['0', '1']).minutes, 0);
  assert.equal(calc('batch-output', ['8', '4', '3']).surplus, 0);
});
test('decimal waste allowances round the decimal quantity without floating-point drift', () => {
  assert.equal(calc('material-waste', ['1250', '0.56']).allowance, 7);
  assert.equal(calc('material-waste', ['1250', '0.56000001']).allowance, 8);
  assert.equal(calc('material-waste', ['1', '5e-324']).allowance, 1);
  assert.equal(calc('material-waste', ['0', '5e-324']).allowance, 0);
});
