import test from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { STOCK_COMMANDS, stockReport, parseStockKit, registerStockTools } from '../src/stock-tools.js';
const state = () => ({ connected: true, player: { position: { x: 0, y: 64, z: 0 } }, inventory: [
  { name: 'minecraft:oak_log', count: 32, slot: 0 }, { name: 'minecraft:oak_log', count: 16, slot: 1 },
  { name: 'minecraft:bread', count: 4, slot: 2 }, { name: 'minecraft:iron_pickaxe', count: 1, slot: 3 },
], containers: [
  { x: 2, y: 64, z: 0, observedAt: 1000, items: [{ name: 'minecraft:oak_log', count: 10 }] },
  { x: 2, y: 64, z: 0, observedAt: 2000, items: [{ name: 'minecraft:oak_log', count: 12 }] },
  { x: 5, y: 64, z: 0, items: [{ name: 'minecraft:oak_log', count: 20 }, { name: 'minecraft:torch', count: 8 }] },
  { x: 9, y: 64, z: 0 },
] });
const cases = [
  ['kit-check', ['oak_log=64', 'bread=2'], r => { assert.equal(r.satisfied, false); assert.equal(r.quotas[0].missing, 16); }],
  ['kit-restock', ['oak_log=64', 'bread=8'], r => { assert.equal(r.items[0].missing, 0); assert.deepEqual(r.items[0].sources.map(s => s.take), [12, 4]); assert.equal(r.items[1].missing, 4); }],
  ['kit-deposit', ['oak_log=32'], r => { assert.equal(r.items.find(i => i.name.endsWith('oak_log')).deposit, 16); assert.equal(r.items.find(i => i.name.endsWith('bread')).deposit, 4); }],
  ['kit-capacity', ['oak_log=81', 'torch=65'], r => { assert.equal(r.neededSlots, 3); assert.equal(r.freeSlots, 32); assert.equal(r.fitsEstimate, true); }],
  ['kit-trips', ['oak_log=2304', 'iron_pickaxe=1'], r => { assert.equal(r.slots, 37); assert.equal(r.emptyInventoryTrips, 2); }],
  ['kit-scale', ['1.5', 'bread=3'], r => assert.equal(r.items[0].count, 5)],
  ['composition', [], r => { assert.equal(r.total, 53); assert.equal(r.items.find(i => i.name.endsWith('oak_log')).share, 48 / 53); }],
  ['slot-pressure', [], r => { assert.equal(r.items[0].stacks, 2); assert.equal(r.items[0].stackShare, 0.5); }],
  ['stack-histogram', [], r => assert.deepEqual(r.quantities, [1, 4, 16, 32].map(count => ({ count, stacks: 1 })))],
  ['least-stocked', ['2'], r => assert.deepEqual(r.items.map(i => i.count), [1, 4])],
  ['count-range', ['4', '48'], r => assert.deepEqual(r.items.map(i => i.count), [4, 48])],
  ['only', ['oak_log', 'bread'], r => assert.equal(r.items.length, 2)],
  ['exclude', ['oak_log', 'bread'], r => assert.equal(r.items[0].name, 'minecraft:iron_pickaxe')],
  ['families', [], r => assert.deepEqual(r.families, [{ family: 'bread', count: 4 }, { family: 'log', count: 48 }, { family: 'pickaxe', count: 1 }])],
  ['food-portions', ['8'], r => { assert.equal(r.totalHunger, 20); assert.equal(r.completePortions, 2); }],
  ['food-duration', ['4'], r => assert.equal(r.hoursEstimate, 5)],
  ['storage-only', [], r => assert.deepEqual(r.items, [{ name: 'minecraft:torch', count: 8 }])],
  ['carried-only', [], r => assert.deepEqual(r.items.map(i => i.name), ['minecraft:bread', 'minecraft:iron_pickaxe'])],
  ['shared-stock', [], r => assert.deepEqual(r.items, [{ name: 'minecraft:oak_log', carried: 48, stored: 32 }])],
  ['storage-balance', [], r => assert.equal(r.items.find(i => i.name.endsWith('oak_log')).carriedShare, 0.6)],
  ['container-diversity', [], r => { assert.equal(r.containers[0].x, 5); assert.equal(r.containers[0].distinctItems, 2); }],
  ['storage-within', ['2'], r => { assert.equal(r.containersInRadius, 1); assert.deepEqual(r.items, [{ name: 'minecraft:oak_log', count: 12 }]); }],
  ['storage-older', ['5'], r => { assert.equal(r.containers.length, 2); assert.equal(r.containers[0].ageSeconds, 8); assert.equal(r.containers[1].ageSeconds, null); }],
  ['source-plan', ['oak_log', '40'], r => { assert.equal(r.missing, 8); assert.deepEqual(r.sources.map(s => s.take), [12, 20]); }],
  ['stack-fill', ['25'], r => { assert.equal(r.stacks.length, 2); assert.deepEqual(r.stacks.map(i => i.count), [16, 4]); }],
];
for (const [command, args, check] of cases) test(`stock ${command}`, () => check(stockReport(state(), command, args, { now: 10000 })));

test('all 25 registrations forward positional and variadic arguments', async () => {
  assert.equal(STOCK_COMMANDS.length, 25);
  assert.equal(new Set(cases.map(c => c[0])).size, 25);
  for (const [command, args, check] of cases) {
    const program = new Command().exitOverride();
    let result;
    registerStockTools(program, { view: select => { result = select(state()); } });
    await program.parseAsync(['stock', command, ...args], { from: 'user' });
    // The command uses wall time; only its age values differ from the fixed-time test.
    if (command === 'storage-older') assert.equal(result.containers.length, 2);
    else check(result);
  }
});

test('strict kit and scalar validation rejects ambiguous or unbounded inputs', () => {
  for (const input of [[], Array(101).fill('oak_log=1'), ['oak_log'], ['oak_log=1=2'], ['oak_log=1', 'minecraft:oak_log=2'], ['bad/name=1'], ['oak_log=-1'], ['oak_log=1.5'], ['oak_log=1000001'], ['oak_log=1e3']]) assert.throws(() => parseStockKit(input));
  assert.deepEqual(parseStockKit(['oak_log=0']), [{ name: 'minecraft:oak_log', count: 0 }]);
  for (const [command, args] of [['only', []], ['exclude', ['bad/name']], ['count-range', ['5', '4']], ['food-duration', ['0']], ['food-portions', ['-2']], ['stack-fill', ['101']], ['least-stocked', ['1.5']], ['kit-scale', ['1000000', 'bread=2']], ['source-plan', ['oak_log', '0']], ['storage-within', ['Infinity']], ['storage-older', ['NaN']], ['no-such-command', []]]) assert.throws(() => stockReport(state(), command, args));
  assert.throws(() => stockReport({ connected: false }, 'composition'), /Enter a world/);
  assert.throws(() => stockReport(state(), 'storage-older', ['2'], { now: NaN }), /time/);
});

test('capacity shares free slots across items and empty/missing observations remain explicit', () => {
  const full = state();
  full.inventory = Array.from({ length: 35 }, (_, slot) => ({ name: 'minecraft:dirt', count: 64, slot }));
  assert.equal(stockReport(full, 'kit-capacity', ['torch=64', 'bread=64']).slotShortfall, 1);
  const empty = { ...state(), inventory: [], containers: undefined };
  assert.deepEqual(stockReport(empty, 'composition').items, []);
  assert.deepEqual(stockReport(empty, 'slot-pressure').items, []);
  assert.equal(stockReport(empty, 'food-duration', ['4']).hoursEstimate, 0);
  assert.equal(stockReport(empty, 'source-plan', ['oak_log', '8']).supported, false);
  assert.equal(stockReport(empty, 'source-plan', ['oak_log', '8']).missing, 8);
  assert.equal(stockReport(empty, 'kit-trips', ['oak_log=0']).emptyInventoryTrips, 0);
  const future = state(); future.containers[1].observedAt = 20000;
  assert.equal(stockReport(future, 'storage-older', ['0'], { now: 10000 }).containers.length, 1);
});

test('reports do not mutate observations or allocate the same duplicate container twice', () => {
  const input = state(), before = structuredClone(input);
  for (const [command, args] of cases) stockReport(input, command, args, { now: 10000 });
  assert.deepEqual(input, before);
  assert.equal(stockReport(input, 'source-plan', ['oak_log', '100']).missing, 68);
});
