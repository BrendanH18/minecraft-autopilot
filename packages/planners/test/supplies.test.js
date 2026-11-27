import test from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { suppliesReport as report, supplyCommands, registerSupplies } from '../src/supplies.js';

const state = () => ({
  connected: true,
  player: { position: { x: 0, y: 64, z: 0 }, hunger: 15 },
  inventory: [
    { slot: 0, name: 'minecraft:oak_log', count: 32 },
    { slot: 1, name: 'minecraft:oak_log', count: 16 },
    { slot: 2, name: 'minecraft:bread', count: 4 },
    { slot: 3, name: 'minecraft:apple', count: 2 },
    { slot: 4, name: 'minecraft:iron_pickaxe', count: 1 },
    { slot: 5, name: 'minecraft:iron_boots', count: 1 },
    { slot: 6, name: 'minecraft:dirt', count: 64 },
    { slot: 7, name: 'minecraft:sand', count: 0 },
  ],
  containers: [
    { name: 'minecraft:chest', x: 1, y: 64, z: 0, observedAt: 1, items: [{ name: 'minecraft:oak_log', count: 8 }] },
    { name: 'minecraft:chest', x: 1, y: 64, z: 0, observedAt: 2, items: [{ name: 'minecraft:oak_log', count: 10 }] },
    {
      name: 'minecraft:barrel',
      x: 3,
      y: 64,
      z: 0,
      items: [
        { name: 'minecraft:oak_log', count: 30 },
        { name: 'minecraft:apple', count: 2 },
      ],
    },
    { name: 'minecraft:chest', x: 2, y: 64, z: 0, items: [] },
    { name: 'minecraft:barrel', x: 4, y: 64, z: 0 },
  ],
});

const cases = [
  [
    'overview',
    [],
    (result) => {
      assert.equal(result.distinctItems, 6);
      assert.equal(result.used, 7);
      assert.equal(result.free, 29);
    },
  ],
  [
    'ranked',
    ['2'],
    (result) =>
      assert.deepEqual(
        result.items.map((item) => item.count),
        [64, 48],
      ),
  ],
  ['matching', ['iron_'], (result) => assert.equal(result.items.length, 2)],
  [
    'stacks',
    ['oak_log'],
    (result) => {
      assert.equal(result.total, 48);
      assert.deepEqual(result.stacks, [
        { slot: 0, count: 32 },
        { slot: 1, count: 16 },
      ]);
    },
  ],
  [
    'need',
    ['oak_log', '64'],
    (result) => {
      assert.equal(result.missing, 16);
      assert.equal(result.satisfied, false);
    },
  ],
  ['reserve', ['oak_log', '32'], (result) => assert.equal(result.surplus, 16)],
  [
    'capacity',
    ['oak_log', '2000'],
    (result) => {
      assert.equal(result.room, 1936);
      assert.equal(result.overflow, 64);
      assert.equal(result.fitsEstimate, false);
    },
  ],
  [
    'packing',
    ['oak_log', '129'],
    (result) => {
      assert.equal(result.stacks, 3);
      assert.equal(result.finalStack, 1);
    },
  ],
  [
    'tools',
    [],
    (result) =>
      assert.deepEqual(
        result.items.map((item) => item.name),
        ['minecraft:iron_pickaxe'],
      ),
  ],
  [
    'armor',
    [],
    (result) =>
      assert.deepEqual(
        result.items.map((item) => item.name),
        ['minecraft:iron_boots'],
      ),
  ],
  [
    'food-ranked',
    [],
    (result) =>
      assert.deepEqual(
        result.items.map((item) => item.name),
        ['minecraft:bread', 'minecraft:apple'],
      ),
  ],
  [
    'meal',
    ['20'],
    (result) => {
      assert.equal(result.meals[0].name, 'minecraft:bread');
      assert.equal(result.meals[0].reachesTarget, true);
      assert.equal(result.meals[1].reachesTarget, false);
    },
  ],
  [
    'collectables',
    [],
    (result) =>
      assert.deepEqual(
        result.items.map((item) => item.name),
        ['minecraft:dirt', 'minecraft:oak_log'],
      ),
  ],
  ['deposit-plan', ['oak_log', '8'], (result) => assert.equal(result.deposit, 40)],
  [
    'storage-health',
    [],
    (result) => {
      assert.equal(result.known, 4);
      assert.equal(result.opened, 3);
      assert.equal(result.unopened, 1);
      assert.equal(result.observedEmpty, 1);
    },
  ],
  ['storage-matching', ['apple'], (result) => assert.deepEqual(result.items, [{ name: 'minecraft:apple', count: 2 }])],
  [
    'storage-need',
    ['oak_log', '100'],
    (result) => {
      assert.equal(result.stored, 40);
      assert.equal(result.available, 88);
      assert.equal(result.missing, 12);
    },
  ],
  [
    'storage-richest',
    ['oak_log'],
    (result) =>
      assert.deepEqual(
        result.containers.map((container) => container.count),
        [30, 10],
      ),
  ],
  ['storage-empty', [], (result) => assert.equal(result.containers[0].x, 2)],
  ['storage-unopened', [], (result) => assert.equal(result.containers[0].x, 4)],
  [
    'storage-spread',
    ['oak_log'],
    (result) => {
      assert.equal(result.containersHolding, 2);
      assert.equal(result.total, 40);
      assert.equal(result.largestShare, 0.75);
    },
  ],
  [
    'compare',
    ['oak_log', 'bread'],
    (result) => {
      assert.equal(result.difference, 44);
      assert.equal(result.ratio, 12);
    },
  ],
  [
    'nonstackable',
    [],
    (result) =>
      assert.deepEqual(
        result.items.map((item) => item.name),
        ['minecraft:iron_boots', 'minecraft:iron_pickaxe'],
      ),
  ],
  [
    'partial-stacks',
    [],
    (result) => {
      assert.equal(result.stacks.length, 4);
      assert.equal(result.stacks[0].remaining, 32);
    },
  ],
  [
    'consolidation',
    [],
    (result) => {
      assert.equal(result.potentiallyFreed, 1);
      assert.match(result.note, /components/);
    },
  ],
];
for (const [name, args, check] of cases)
  test(`supplies ${name} computes a useful report`, () => check(report(state(), name, args)));

test('all 25 command registrations forward arguments and return the matching report', async () => {
  assert.equal(supplyCommands.length, 25);
  assert.equal(new Set(cases.map(([name]) => name)).size, 25);
  for (const [name, args, check] of cases) {
    const program = new Command().exitOverride();
    let result;
    registerSupplies(program, {
      view: (select) => {
        result = select(state());
      },
    });
    await program.parseAsync(['supplies', name, ...args], { from: 'user' });
    check(result);
  }
});

test('reports reject disconnected observations and invalid names, quantities, targets, and searches', () => {
  assert.throws(() => report({ connected: false }, 'overview'), /Enter a world/);
  for (const input of ['-1', '1.5', '1e3', '', '1000001', '9007199254740993'])
    assert.throws(() => report(state(), 'need', ['oak_log', input]), /Count/);
  assert.throws(() => report(state(), 'need', ['bad/name', '1']), /Minecraft item/);
  assert.throws(() => report(state(), 'matching', ['']), /Search text/);
  assert.throws(() => report(state(), 'matching', ['BREAD']), /Search text/);
  assert.throws(() => report(state(), 'meal', ['21']), /Hunger target/);
  assert.throws(() => report(state(), 'nope'), /Unknown supplies/);
  assert.equal(report(state(), 'reserve', ['oak_log', '0']).surplus, 48);
  assert.equal(report(state(), 'deposit-plan', ['oak_log', '0']).deposit, 48);
  assert.equal(report(state(), 'need', ['oak_log', '1']).satisfied, true);
});

test('missing storage, unknown hunger, empty inventory, and zero denominators stay explicit', () => {
  const empty = { ...state(), inventory: [], containers: undefined };
  assert.equal(report(empty, 'storage-health').supported, false);
  assert.equal(report(empty, 'storage-spread', ['oak_log']).largestShare, null);
  assert.equal(report(empty, 'compare', ['oak_log', 'bread']).ratio, null);
  assert.equal(report(empty, 'overview').free, 36);
  assert.deepEqual(report({ ...empty, player: { ...empty.player, hunger: undefined } }, 'meal', ['20']).meals, []);
  assert.equal(report(empty, 'consolidation').potentiallyFreed, 0);
});

test('collectables excludes unsupported stripped logs and other namespaces', () => {
  const input = state();
  input.inventory.push({ name: 'minecraft:stripped_oak_log', count: 1 }, { name: 'othermod:oak_log', count: 1 });
  assert.deepEqual(
    report(input, 'collectables').items.map((item) => item.name),
    ['minecraft:dirt', 'minecraft:oak_log'],
  );
});
