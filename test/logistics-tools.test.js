import test from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { LOGISTICS_COMMANDS, logisticsReport, registerLogisticsTools } from '../src/logistics-tools.js';

const state = () => ({ connected: true, player: { position: { x: 0, y: 64, z: 0 } }, inventory: [
  { name: 'minecraft:oak_log', count: 40, slot: 0 }, { name: 'minecraft:oak_log', count: 24, slot: 1 },
  { name: 'minecraft:torch', count: 64, slot: 2 }, { name: 'minecraft:iron_pickaxe', count: 1, slot: 3 },
  { name: 'minecraft:bread', count: 3 },
], containers: [
  { x: 2, y: 64, z: 0, observedAt: 1000, items: [{ name: 'minecraft:oak_log', count: 10 }] },
  { x: 2, y: 64, z: 0, observedAt: 2000, items: [{ name: 'minecraft:oak_log', count: 20 }, { name: 'minecraft:bread', count: 4 }] },
  { x: 5, y: 64, z: 0, observedAt: 6000, items: [{ name: 'minecraft:oak_log', count: 30 }, { name: 'minecraft:oak_log', count: 10 }, { name: 'minecraft:torch', count: 12 }] },
  { x: 8, y: 64, z: 0, items: [] }, { x: 9, y: 64, z: 0 },
] });
export const logisticsCases = [
  ['carried-bundles', ['oak_log=16', 'torch=32'], r => { assert.equal(r.bundles, 2); assert.deepEqual(r.limitingItems, ['minecraft:torch']); }],
  ['pooled-bundles', ['oak_log=16', 'torch=32'], r => assert.equal(r.bundles, 2)],
  ['bundle-shortage', ['3', 'oak_log=64', 'bread=4'], r => assert.deepEqual(r.items.map(i => i.missing), [68, 5])],
  ['split-manifest', ['3', 'oak_log=8', 'bread=2'], r => assert.deepEqual(r.loads.map(l => l.items.map(i => i.count)), [[3, 1], [3, 1], [2]])],
  ['restock-stops', ['oak_log=100', 'bread=8'], r => { assert.equal(r.stops.length, 2); assert.deepEqual(r.stops[0].items.map(i => i.count), [20, 4]); assert.deepEqual(r.stops[1].items.map(i => i.count), [16]); assert.deepEqual(r.missing, [{ name: 'minecraft:bread', count: 1 }]); }],
  ['balance-item', ['oak_log'], r => { assert.deepEqual(r.containers.map(c => c.target), [20, 20, 20]); assert.deepEqual(r.containers.map(c => c.change), [0, -20, 20]); }],
  ['fewest-sources', ['oak_log', '45'], r => { assert.deepEqual(r.sources.map(c => c.take), [40, 5]); assert.equal(r.missing, 0); }],
  ['retain-percent', ['25'], r => { const b = r.items.find(i => i.name === 'minecraft:bread'); assert.equal(b.keep, 1); assert.equal(b.deposit, 2); }],
  ['withdraw-percent', ['25'], r => assert.deepEqual(r.containers.map(c => c.items.map(i => i.withdraw)), [[1, 5], [10, 3]])],
  ['stack-topups', [], r => { assert.deepEqual(r.stacks.map(s => s.withdraw), [24, 36, 4]); assert.equal(r.stacks[1].remainingRoom, 4); }],
  ['slot-map', [], r => { assert.equal(r.slots.length, 36); assert.deepEqual(r.slots[0].stacks, [{ name: 'minecraft:oak_log', count: 40 }]); assert.equal(r.unlocated.length, 1); }],
  ['full-stacks', [], r => assert.deepEqual(r.stacks.map(s => s.name), ['minecraft:torch', 'minecraft:iron_pickaxe'])],
  ['stack-remainders', [], r => { assert.equal(r.items.find(i => i.name === 'minecraft:oak_log').remainder, 0); assert.equal(r.items.find(i => i.name === 'minecraft:bread').remainder, 3); }],
  ['stack-size-groups', [], r => { assert.deepEqual(r.groups.map(g => g.quantity), [1, 0, 131]); assert.deepEqual(r.groups.map(g => g.occupiedStacks), [1, 0, 4]); }],
  ['container-loads', [], r => { assert.deepEqual(r.containers.map(c => c.occupiedStacks), [null, null, null]); assert.deepEqual(r.containers.map(c => c.minimumStacksEstimate), [2, 2, 0]); assert.deepEqual(r.containers.map(c => c.x), [2, 5, 8]); }],
  ['storage-redundancy', ['2'], r => assert.deepEqual(r.items.map(i => i.name), ['minecraft:bread', 'minecraft:torch'])],
  ['exclusive-stock', [], r => assert.deepEqual(r.items.map(i => i.sources[0].x), [2, 5])],
  ['container-overlap', [], r => { assert.equal(r.pairs.length, 3); assert.deepEqual(r.pairs[0].shared, ['minecraft:oak_log']); assert.equal(r.pairs[1].sharedTypes, 0); }],
  ['storage-fragmentation', [], r => { assert.equal(r.potentiallyFreed, null); assert.equal(r.minimumPotentiallyFreedEstimate, 1); assert.equal(r.items.find(i => i.name === 'minecraft:oak_log').pooledStacksEstimate, 1); }],
  ['freshness-summary', ['5'], r => { assert.equal(r.fresh, 1); assert.equal(r.stale, 1); assert.equal(r.untimed, 1); assert.equal(r.unopened, 1); }],
  ['untimed-storage', [], r => assert.deepEqual(r.containers.map(c => c.x), [8])],
  ['observation-window', [], r => { assert.equal(r.oldest, 2000); assert.equal(r.newest, 6000); assert.equal(r.spanSeconds, 4); }],
  ['kit-containers', ['oak_log=20', 'bread=1'], r => { assert.equal(r.containers.length, 1); assert.equal(r.containers[0].x, 2); assert.equal(r.containers[0].bundles, 1); }],
  ['storage-stack-sizes', [], r => assert.deepEqual(r.groups.map(g => g.quantity), [0, 0, 76])],
  ['source-distances', ['oak_log'], r => { assert.equal(r.quantity, 60); assert.equal(r.sources, 2); assert.equal(r.nearest, 2); assert.equal(r.farthest, 5); assert.equal(r.quantityWeightedDistance, 4); }],
];
for (const [name, args, check] of logisticsCases) test(`logistics ${name}`, () => check(logisticsReport(state(), name, args, { now: 10000 })));

test('all 25 commands dispatch positional and variadic arguments', async () => {
  assert.equal(LOGISTICS_COMMANDS.length, 25);
  assert.equal(new Set(logisticsCases.map(c => c[0])).size, 25);
  assert.deepEqual(LOGISTICS_COMMANDS.map(c => c[0].split(' ')[0]), logisticsCases.map(c => c[0]));
  for (const [name, args, check] of logisticsCases) {
    let result;
    const program = new Command().exitOverride();
    registerLogisticsTools(program, { view: select => { result = select(state()); } });
    await program.parseAsync(['logistics', name, ...args], { from: 'user' });
    if (name === 'freshness-summary') { assert.equal(result.stale, 2); assert.equal(result.untimed, 1); }
    else check(result);
  }
});

test('invalid and unbounded requests are rejected before planning', () => {
  for (const [name, args] of [
    ['carried-bundles', ['oak_log=0']], ['pooled-bundles', []], ['bundle-shortage', ['0', 'bread=1']],
    ['split-manifest', ['101', 'bread=1']], ['split-manifest', ['1.5', 'bread=1']], ['restock-stops', ['bread=1', 'minecraft:bread=2']],
    ['balance-item', ['bad/name']], ['fewest-sources', ['bread', '1000001']], ['retain-percent', ['101']], ['withdraw-percent', ['-1']],
    ['storage-redundancy', ['0']], ['freshness-summary', ['NaN']], ['source-distances', ['bad/name']], ['unknown', []],
  ]) assert.throws(() => logisticsReport(state(), name, args));
  assert.throws(() => logisticsReport(state(), 'freshness-summary', ['1'], { now: Infinity }), /time/);
  assert.throws(() => logisticsReport({ connected: false }, 'slot-map'), /Enter a world/);
  const huge = state(); huge.containers = Array.from({ length: 201 }, (_, x) => ({ x, y: 64, z: 0, items: [] }));
  assert.throws(() => logisticsReport(huge, 'container-overlap'), /200/);
});

test('missing storage and empty inventory cannot imply available stock', () => {
  const empty = { ...state(), inventory: [], containers: undefined };
  assert.equal(logisticsReport(empty, 'pooled-bundles', ['bread=1']).bundles, 0);
  assert.equal(logisticsReport(empty, 'pooled-bundles', ['bread=1']).supported, false);
  assert.equal(logisticsReport(empty, 'fewest-sources', ['bread', '5']).missing, 5);
  assert.equal(logisticsReport(empty, 'source-distances', ['bread']).quantityWeightedDistance, null);
  assert.equal(logisticsReport(empty, 'observation-window').spanSeconds, null);
  assert.deepEqual(logisticsReport(empty, 'balance-item', ['bread']).containers, []);
  assert.deepEqual(logisticsReport(empty, 'stack-topups').stacks, []);
});

test('freshness partitions future, exact-threshold, untimed and unopened records', () => {
  const input = state(); input.containers.push({ x: 12, y: 64, z: 0, observedAt: 11000, items: [] });
  const report = logisticsReport(input, 'freshness-summary', ['4'], { now: 10000 });
  assert.equal(report.fresh, 0); assert.equal(report.stale, 2); assert.equal(report.future, 1); assert.equal(report.untimed, 1); assert.equal(report.unopened, 1);
});

test('reports preserve snapshots and allocate stored stock once', () => {
  const input = state(), before = structuredClone(input);
  for (const [name, args] of logisticsCases) logisticsReport(input, name, args, { now: 10000 });
  assert.deepEqual(input, before);
  const topups = logisticsReport(input, 'stack-topups').stacks;
  assert.equal(topups.filter(s => s.name === 'minecraft:oak_log').reduce((n, s) => n + s.withdraw, 0), 60);
  assert.deepEqual(logisticsReport(input, 'restock-stops', ['oak_log=10']).stops, []);
});

test('slot-map translates Mineflayer window hotbar slots and excludes offhand', () => {
  const r = logisticsReport({ ...state(), backend: 'mineflayer', inventory: [
    { name: 'minecraft:bread', count: 3, slot: 36 }, { name: 'minecraft:dirt', count: 2, slot: 44 },
    { name: 'minecraft:stone', count: 4, slot: 9 }, { name: 'minecraft:torch', count: 1, slot: 45 },
  ] }, 'slot-map');
  assert.equal(r.slots[0].stacks[0].name, 'minecraft:bread');
  assert.equal(r.slots[8].stacks[0].name, 'minecraft:dirt');
  assert.equal(r.slots[9].stacks[0].name, 'minecraft:stone');
  assert.deepEqual(r.unlocated, [{ name: 'minecraft:torch', count: 1, slot: 45 }]);
});

test('aggregated backend contents cannot establish physical stack occupancy or actual savings', () => {
  const value = { ...state(), containers: [
    { x: 1, y: 64, z: 0, items: [{ name: 'minecraft:oak_log', count: 20 }] },
    { x: 2, y: 64, z: 0, items: [{ name: 'minecraft:oak_log', count: 130 }] },
  ] };
  // Twenty logs may be two stacks of ten; 130 must occupy at least three estimated stacks.
  const loads = logisticsReport(value, 'container-loads');
  assert.deepEqual(loads.containers.map(c => c.occupiedStacks), [null, null]);
  assert.deepEqual(loads.containers.map(c => c.minimumStacksEstimate), [3, 1]);
  const report = logisticsReport(value, 'storage-fragmentation');
  assert.equal(report.potentiallyFreed, null);
  assert.equal(report.items[0].occupiedStacks, null);
  assert.equal(report.items[0].minimumStacksEstimate, 4);
  assert.equal(report.items[0].pooledStacksEstimate, 3);
  assert.equal(report.minimumPotentiallyFreedEstimate, 1);
  assert.match(report.estimateNote, /unknown/);
});
