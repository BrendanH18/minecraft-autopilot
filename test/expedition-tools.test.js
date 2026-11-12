import test from 'node:test';
import assert from 'node:assert/strict';
import { expeditionReport, EXPEDITION_COMMANDS } from '../src/expedition-tools.js';

const state = {
  connected: true, player: { position: { x: 0, y: 64, z: 0 }, dimension: 'minecraft:overworld' },
  home: { x: 6, y: 64, z: 8, dimension: 'minecraft:overworld' },
  inventory: [{ name: 'minecraft:bread', count: 3, slot: 0 }, { name: 'minecraft:dirt', count: 60, slot: 1 }, { name: 'minecraft:coal', count: 1, slot: 2 }],
  blocks: [{ name: 'minecraft:dirt', x: 3, y: 64, z: 4 }, { name: 'minecraft:dirt', x: 3, y: 64, z: 4 }],
  containers: [{ x: 3, y: 64, z: 4, items: [{ name: 'minecraft:dirt', count: 20 }] }, { x: 6, y: 64, z: 8 }],
};
const report = (name, ...args) => expeditionReport(state, name, args);
test('25 distinct expedition estimates have independently calculated results', () => {
  assert.equal(EXPEDITION_COMMANDS.length, 25);
  assert.equal(new Set(EXPEDITION_COMMANDS.map(([s]) => s.split(' ')[0])).size, 25);
  assert.equal(report('time-to', '3,64,4', 5).seconds, 1);
  assert.equal(report('time-home', 5).seconds, 2);
  assert.equal(report('round-trip', '3,64,4', 5, 7).totalSeconds, 9);
  assert.equal(report('rendezvous', '3,64,4', 5, 7).departureDelaySeconds, 6);
  const r = report('route-budget', 5, 1, '3,64,4', '6,64,8');
  assert.equal(r.firstOverBudget, 2); assert.deepEqual(r.stops.map(s => s.arrivalSeconds), [1, 2]);
  assert.equal(report('home-deadline', 5, 7).workSeconds, 5);
  assert.equal(report('operating-radius', 5, 10, 2).radius, 20);
  const load = report('food-load', 'bread', 10, 2);
  assert.equal(load.required, 4); assert.equal(load.missing, 1);
  assert.deepEqual(report('food-plan', 6, 2).allocation, [{ name: 'minecraft:bread', count: 3, hunger: 15 }]);
  assert.equal(report('food-margin', 10, 2).margin, -5);
  assert.equal(report('collect-time', 'dirt', 100, 10).minutes, 4);
  const deadline = report('collect-deadline', 'dirt', 100, 10, 3);
  assert.equal(deadline.feasibleEstimate, false); assert.equal(deadline.attainableCount, 90);
  assert.equal(report('kit-time', 10, 'dirt=100', 'coal=11').minutes, 5);
  const priority = report('kit-priority', 10, 3, 'dirt=100', 'coal=11');
  assert.deepEqual(priority.selected.map(i => i.name), ['minecraft:coal']); assert.equal(priority.remainingMinutes, 2);
  const source = report('source-trips', 'dirt', 30, 5).trips[0];
  assert.equal(source.take, 20); assert.equal(source.missing, 10); assert.equal(source.seconds, 2);
  assert.deepEqual(report('resource-trips', 'dirt', 5, 7).trips, [{ position: { x: 3, y: 64, z: 4 }, seconds: 9 }]);
  const refresh = report('refresh-budget', 5, 2);
  assert.equal(refresh.distance, 20); assert.equal(refresh.totalSeconds, 8); assert.equal(refresh.stops.length, 2);
  assert.equal(report('payload', 'dirt', 35).capacity, 64);
  const delivery = report('delivery-budget', 'dirt', 129, 35, '3,64,4', 5);
  assert.equal(delivery.trips, 3); assert.equal(delivery.totalSeconds, 6);
  // 33 empty slots; reserve 32. One free stack plus 4 in existing dirt stack.
  assert.equal(report('reserved-capacity', 'dirt', 32).additionalCapacityEstimate, 68);
  const recipe = report('recipe', 'torch', 9, 4, 'coal=1', 'stick=1');
  assert.equal(recipe.batches, 3); assert.equal(recipe.produced, 12);
  assert.deepEqual(recipe.ingredients, [{ name: 'minecraft:coal', required: 3, carried: 1, missing: 2 }, { name: 'minecraft:stick', required: 3, carried: 0, missing: 3 }]);
  const fuel = report('fuel', 'coal', 8, 17);
  assert.equal(fuel.required, 3); assert.equal(fuel.missing, 2); assert.equal(fuel.unusedProcessingCapacity, 7);
  const smelt = report('smelt', 'sand', 'glass', 17, 'coal', 8);
  assert.equal(smelt.jobs, 17); assert.equal(smelt.inputMissing, 17); assert.equal(smelt.fuelMissing, 2);
  const ration = report('ration-days', 3, 6);
  assert.equal(ration.dailyAllowance, 5); assert.equal(ration.shortfall, 3);
  const reach = report('cache-reach', 5, 2, 'dirt=80', 'coal=2').requirements;
  assert.deepEqual(reach.map(i => i.coveredEstimate), [true, false]); assert.equal(reach[0].source.available, 20);
});

test('budget boundaries, missing evidence, zero work, and input immutability', () => {
  const before = structuredClone(state);
  assert.equal(report('food-plan', 0, 10).allocation.length, 0);
  assert.equal(report('food-plan', 100, 1).uncoveredHunger, 85);
  assert.equal(report('collect-time', 'dirt', 10, 2).minutes, 0);
  assert.equal(report('collect-deadline', 'dirt', 61, 0.5, 1).attainableCount, 60);
  assert.equal(report('rendezvous', '3,64,4', 1, 0).lateBySeconds, 5);
  assert.equal(report('home-deadline', 1, 1).lateBySeconds, 9);
  assert.equal(report('operating-radius', 5, 1, 2).radius, null);
  assert.equal(report('delivery-budget', 'dirt', 0, 35, '3,64,4', 5).trips, 0);
  assert.equal(report('reserved-capacity', 'dirt', 36).reservationMet, false);
  assert.equal(report('reserved-capacity', 'dirt', 36).additionalCapacityEstimate, 4);
  assert.equal(report('recipe', 'bread', 2, 3, 'wheat=3').batches, 0);
  assert.equal(report('fuel', 'coal', 0.5, 1).required, 2);
  assert.equal(report('source-trips', 'sand', 1, 1).trips.length, 0);
  assert.deepEqual(state, before);
  for (const home of [null, { ...state.home, dimension: 'minecraft:the_nether' }, { x: 0, y: 64, z: 0 }]) {
    const r = expeditionReport({ ...state, home }, 'time-home', [5]);
    assert.equal(r.seconds, null); assert.equal(r.known, false);
  }
  const unsupported = expeditionReport({ ...state, containers: undefined }, 'cache-reach', [1, 10, 'sand=1']);
  assert.equal(unsupported.supported, false); assert.equal(unsupported.requirements[0].coveredEstimate, false);
  assert.equal(expeditionReport({ ...state, containers: [] }, 'refresh-budget', [1, 2]).totalSeconds, 0);
});

test('bad numbers, invalid recipes, oversized tours and routes are rejected', () => {
  for (const v of ['', 'NaN', 'Infinity', -1, 0, null, true]) assert.throws(() => report('time-to', '0,64,0', v));
  for (const v of [1.5, -1, 36]) assert.throws(() => report('payload', 'dirt', v));
  assert.throws(() => report('food-load', 'dirt', 1, 1));
  assert.throws(() => report('collect-time', 'dirt', 1.5, 1));
  assert.throws(() => report('recipe', 'torch', 1, 0, 'coal=1'));
  assert.throws(() => report('recipe', 'torch', 1, 4, 'coal=0'));
  assert.throws(() => report('recipe', 'torch', 1, 4, 'torch=1'));
  assert.throws(() => report('smelt', 'sand', 'glass', 1, 'sand', 8));
  assert.throws(() => report('ration-days', 0, 1));
  assert.throws(() => report('route-budget', 1, 10));
  assert.throws(() => report('route-budget', 1, 10, ...Array(51).fill('0,64,0')));
  assert.throws(() => expeditionReport({ ...state, containers: Array.from({ length: 201 }, (_, x) => ({ x, y: 64, z: 0 })) }, 'refresh-budget', [1, 1]));
  assert.throws(() => expeditionReport({ ...state, connected: false }, 'time-home', [1]), /Enter a world/);
  assert.throws(() => report('does-not-exist'));
});

test('decimal food demand preserves exact whole-item and sufficiency boundaries', () => {
  const packed = { ...state, inventory: [{ name: 'minecraft:bread', count: 11 }] };
  const read = (command, args) => expeditionReport(packed, command, args);
  assert.equal(read('food-load', ['bread', 25, 2.2]).required, 11);
  const plan = read('food-plan', [25, 2.2]);
  assert.equal(plan.demand, 55); assert.equal(plan.uncoveredHunger, 0);
  assert.deepEqual(plan.allocation, [{ name: 'minecraft:bread', count: 11, hunger: 55 }]);
  const margin = read('food-margin', [25, 2.2]);
  assert.equal(margin.sufficientEstimate, true); assert.equal(margin.margin, 0);
  assert.equal(read('ration-days', [25, 2.2]).sufficientEstimate, true);
  assert.equal(read('food-load', ['bread', 25, 2.20000001]).required, 12);
  assert.equal(read('food-margin', [25, 2.20000001]).sufficientEstimate, false);
  assert.ok(read('food-plan', [25, 2.20000001]).uncoveredHunger > 0);
  assert.equal(read('food-load', ['bread', 5e-324, 5e-324]).required, 1);
  assert.equal(read('food-plan', [0, 2.2]).allocation.length, 0);
  assert.equal(read('food-load', ['beetroot', 100, 0.14]).required, 14);
});

test('decimal collection and production budgets keep discrete counts consistent', () => {
  const empty = { ...state, inventory: [] };
  const read = (command, args) => expeditionReport(empty, command, args);
  const deadline = read('collect-deadline', ['dirt', 58, 100, 0.58]);
  assert.equal(deadline.feasibleEstimate, true); assert.equal(deadline.attainableCount, 58);
  assert.equal(read('collect-deadline', ['dirt', 59, 100, 0.58]).feasibleEstimate, false);
  const priority = read('kit-priority', [10, 0.3, 'dirt=1', 'sand=2']);
  assert.equal(priority.selected.length, 2); assert.equal(priority.remainingMinutes, 0);
  assert.equal(read('fuel', ['coal', 0.58, 58]).required, 100);
  assert.equal(read('smelt', ['sand', 'glass', 58, 'coal', 0.58]).fuelRequired, 100);
});
