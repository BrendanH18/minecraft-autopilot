import test from 'node:test';
import assert from 'node:assert/strict';
import { createObjective, parseCollectionCriterion, parseDepositCriterion, parseInventoryCriterion, parseDestinationCriterion, parseMaxInventoryCriterion } from '../src/objective.js';

function state() {
  return { connected: true, player: { uuid: 'player-1', dimension: 'minecraft:overworld', health: 20, position: { x: 0, y: 64, z: 0 } },
    home: { x: 0, y: 64, z: 0 }, inventory: [{ name: 'minecraft:oak_log', count: 10 }] };
}

test('collection verification counts additional inventory across slots', () => {
  const initial = state();
  const objective = createObjective({ collect: { block: 'oak_log', count: 8 } }, initial);
  assert.equal(objective.check(initial).met, false);
  const current = state();
  current.inventory = [{ name: 'minecraft:oak_log', count: 11 }, { name: 'minecraft:oak_log', count: 7 }];
  assert.equal(objective.check(current).met, true);
  current.inventory[1].count = 6;
  assert.equal(objective.check(current).met, false);
});

test('home verification uses the original saved home even if it is replaced', () => {
  const objective = createObjective({ returnHome: true }, state());
  const current = state();
  current.home = { x: 100, y: 64, z: 0 };
  current.player.position = { ...current.home };
  assert.equal(objective.check(current).met, false);
  current.player.position = { x: 2, y: 64, z: 0 };
  assert.equal(objective.check(current).met, true);
  current.player.position.y = 65;
  assert.equal(objective.check(current).met, false);
});

test('another player, dimension, death, or disconnect cannot satisfy a task', () => {
  const objective = createObjective({ returnHome: true }, state());
  for (const change of [s => { s.player.uuid = 'other'; }, s => { s.player.dimension = 'minecraft:the_nether'; },
    s => { s.player.health = 0; }, s => { s.connected = false; s.player = null; }]) {
    const current = state(); change(current);
    assert.equal(objective.check(current).met, false);
  }
});

test('malformed observations and invalid criteria never report success', () => {
  const initial = state();
  const objective = createObjective({ collect: { block: 'oak_log', count: 8 } }, initial);
  const current = state();
  current.inventory[0].count = -1;
  assert.throws(() => objective.check(current));
  assert.throws(() => createObjective({ returnHome: true }, { ...initial, home: null }), /Save a home/);
  assert.throws(() => parseCollectionCriterion('diamond_block:8'), /supported/);
  assert.throws(() => parseCollectionCriterion('oak_log:65'));
  assert.throws(() => parseCollectionCriterion('oak_log:0'));
  assert.throws(() => parseCollectionCriterion('oak_log:1.5'));
  assert.deepEqual(parseCollectionCriterion('minecraft:oak_log:8'), { block: 'minecraft:oak_log', count: 8 });
});

test('deposit verification counts items added to containers since the task began or since first opened', () => {
  const chest = (x, items, firstSeen) => ({ name: 'minecraft:chest', x, y: 64, z: 0, items, ...(firstSeen && { firstSeen }) });
  const initial = { ...state(), containers: [chest(1, [{ name: 'minecraft:oak_log', count: 30 }], [{ name: 'minecraft:oak_log', count: 2 }]), chest(2, null)] };
  const objective = createObjective({ deposit: { item: 'oak_log', count: 8 } }, initial);
  assert.equal(objective.check(initial).met, false, 'contents stored before the task do not count');
  const current = { ...state(), containers: [chest(1, [{ name: 'minecraft:oak_log', count: 33 }], [{ name: 'minecraft:oak_log', count: 2 }]),
    chest(2, [{ name: 'minecraft:oak_log', count: 14 }], [{ name: 'minecraft:oak_log', count: 9 }])] };
  assert.deepEqual(objective.check(current).checks.deposit, { item: 'minecraft:oak_log', storedAdditional: 8, requiredAdditional: 8, evidence: 'last_observed', met: true });
  current.containers[1].items[0].count = 13;
  assert.equal(objective.check(current).met, false);
  current.containers[1].items[0].count = 14;
  current.player.uuid = 'other';
  assert.equal(objective.check(current).met, false);
  assert.throws(() => createObjective({ deposit: { item: 'oak_log', count: 8 } }, state()), /does not report container contents/);
  assert.deepEqual(parseDepositCriterion('minecraft:cobblestone:100'), { item: 'minecraft:cobblestone', count: 100 });
  assert.throws(() => parseDepositCriterion('oak_log'), /item and count/);
});

test('gather-and-store counts net new items across inventory and storage without counting transfers twice', () => {
  const chest = items => ({ x: 1, y: 64, z: 0, items });
  const logs = count => [{ name: 'minecraft:oak_log', count }];
  const initial = { ...state(), containers: [chest(logs(30))] };
  const objective = createObjective({ collect: { block: 'oak_log', count: 8 }, deposit: { item: 'oak_log', count: 8 } }, initial);
  const current = { ...state(), inventory: logs(2), containers: [chest(logs(38))] };
  assert.equal(objective.check(current).met, false, 'depositing eight previously held logs is not collection');
  current.inventory = logs(10);
  assert.equal(objective.check(current).met, true, 'eight newly gathered logs may all be stored');
  current.containers[0].items = logs(37);
  assert.equal(objective.check(current).met, false, 'missing stored items invalidate the collection total too');
});

test('a missing initial container cannot turn transfers of old stock into a deposit gain', () => {
  const logs = count => [{ name: 'minecraft:oak_log', count }];
  const initial = { ...state(), containers: [{ x: 1, y: 64, z: 0, items: logs(30) }, { x: 2, y: 64, z: 0, items: logs(0) }] };
  const objective = createObjective({ deposit: { item: 'oak_log', count: 8 } }, initial);
  const current = { ...state(), containers: [{ x: 2, y: 64, z: 0, items: logs(30) }] };
  assert.equal(objective.check(current).met, false);
});


test('minimum health requires a living player at the requested threshold', () => {
  const objective = createObjective({ minHealth: 16 }, state());
  const current = state(); current.player.health = 15;
  assert.equal(objective.check(current).met, false);
  current.player.health = 16;
  assert.equal(objective.check(current).met, true);
  assert.throws(() => createObjective({ minHealth: 21 }, state()));
});

test('minimum hunger treats missing or malformed food levels as unmet', () => {
  const objective = createObjective({ minHunger: 18 }, state());
  const current = state();
  for (const hunger of [undefined, NaN, Infinity, 21, -1, 17, 18.5]) {
    current.player.hunger = hunger;
    assert.equal(objective.check(current).met, false);
  }
  current.player.hunger = 18;
  assert.equal(objective.check(current).met, true);
  assert.throws(() => createObjective({ minHunger: 21 }, current));
});

test('destination checks use bounded world coordinates and an explicit spherical radius', () => {
  assert.deepEqual(parseDestinationCriterion('3,64,4'), { x: 3, y: 64, z: 4, radius: 2 });
  const destination = parseDestinationCriterion('3,64,4,5');
  const objective = createObjective({ destination }, state());
  assert.equal(objective.check(state()).met, true);
  const current = state(); current.player.position.y--;
  assert.equal(objective.check(current).met, false);
  for (const input of ['1,2', '1,2,', '1,2,3,4,5', 'Infinity,2,3', '0,321,0', '0,64,0,-1']) assert.throws(() => parseDestinationCriterion(input));
});

test('absolute inventory requirements sum matching slots without requiring new collection', () => {
  assert.deepEqual(parseInventoryCriterion('oak_log:12'), { item: 'minecraft:oak_log', count: 12 });
  const objective = createObjective({ inventory: { item: 'oak_log', count: 12 } }, state());
  assert.equal(objective.check(state()).met, false);
  const current = state(); current.inventory.push({ name: 'minecraft:oak_log', count: 2 });
  assert.equal(objective.check(current).met, true);
  assert.equal(objective.check(current).checks.heldInventory.current, 12);
  assert.throws(() => parseInventoryCriterion('oak_log:0'));
});

test('maximum observed threats checks available observations and never assumes missing means safe', () => {
  const objective = createObjective({ maxThreats: 0 }, state());
  const current = state();
  assert.equal(objective.check(current).met, false);
  current.threats = [{ type: 'minecraft:zombie', distance: 5 }];
  assert.equal(objective.check(current).met, false);
  current.threats = [];
  assert.equal(objective.check(current).met, true);
  assert.throws(() => createObjective({ maxThreats: -1 }, state()));
});

test('home verification radius is configurable and must accompany returnHome', () => {
  const objective = createObjective({ returnHome: true, homeRadius: 0 }, state());
  const current = state();
  assert.equal(objective.check(current).met, true);
  current.player.position.x = 0.01;
  assert.equal(objective.check(current).met, false);
  assert.equal(createObjective({ returnHome: true, homeRadius: 4 }, state()).check({ ...current, player: { ...current.player, position: { x: 4, y: 64, z: 0 } } }).met, true);
  assert.throws(() => createObjective({ homeRadius: 4 }, state()), /requires returnHome/);
});

test('duplicate initial container coordinates do not inflate the deposit baseline', () => {
  const chest = count => ({ x: 1, y: 64, z: 0, items: [{ name: 'minecraft:oak_log', count }] });
  const initial = { ...state(), containers: [chest(10), chest(10)] };
  const objective = createObjective({ deposit: { item: 'oak_log', count: 8 } }, initial);
  assert.equal(objective.check({ ...state(), containers: [chest(18)] }).met, true);
});

test('a source baseline freezes when first discovered rather than following later contents', () => {
  const logs = count => [{ name: 'minecraft:oak_log', count }];
  const objective = createObjective({ deposit: { item: 'oak_log', count: 8 } }, { ...state(), containers: [] });
  const chest = (contents, baseline) => ({ x: 1, y: 64, z: 0, items: logs(contents), sources: [{ id: 'chest', items: logs(baseline) }] });
  assert.equal(objective.check({ ...state(), containers: [chest(10, 10)] }).met, false);
  assert.equal(objective.check({ ...state(), containers: [chest(18, 18)] }).met, true);
});

test('empty explicit source provenance cannot misrepresent preexisting container stock as a gain', () => {
  const objective = createObjective({ deposit: { item: 'oak_log', count: 8 } }, { ...state(), containers: [] });
  const current = { ...state(), containers: [{ x: 1, y: 64, z: 0, items: [{ name: 'minecraft:oak_log', count: 10 }], sources: [] }] };
  assert.throws(() => objective.check(current));
});

test('nonfinite health cannot satisfy any verification criterion', () => {
  const objective = createObjective({ returnHome: true }, state());
  for (const health of [NaN, Infinity, -Infinity, '20', undefined]) {
    const current = state(); current.player.health = health;
    assert.equal(objective.check(current).met, false);
  }
});

test('maximum held inventory sums stacks and treats a missing inventory as unavailable', () => {
  assert.deepEqual(parseMaxInventoryCriterion('minecraft:oak_log:0'), { item: 'minecraft:oak_log', count: 0 });
  for (const input of ['oak_log:2305', 'oak_log', 'oak_log:-1', 'oak_log:1.5', '../oak_log:1']) assert.throws(() => parseMaxInventoryCriterion(input));
  const objective = createObjective({ maxInventory: { item: 'oak_log', count: 4 } }, state());
  assert.deepEqual(objective.description.maxInventory, { item: 'minecraft:oak_log', count: 4 });
  const current = state();
  assert.equal(objective.check(current).met, false);
  current.inventory = [{ name: 'minecraft:oak_log', count: 3 }, { name: 'minecraft:oak_log', count: 1 }];
  assert.equal(objective.check(current).met, true);
  delete current.inventory;
  assert.deepEqual(objective.check(current).checks.maxInventory, { item: 'minecraft:oak_log', current: null, maximum: 4, met: false });
  assert.throws(() => createObjective({ maxInventory: { item: 'oak_log', count: 2305 } }, state()));
});

test('maximum distance is measured from the starting position and needs a final position', () => {
  const objective = createObjective({ maxDistance: 5 }, state());
  assert.deepEqual(objective.description.maxDistance, { start: { x: 0, y: 64, z: 0 }, radius: 5 });
  const current = state();
  current.player.position = { x: 3, y: 64, z: 4 };
  assert.equal(objective.check(current).met, true);
  current.player.position.y = 65;
  assert.equal(objective.check(current).met, false);
  delete current.player.position;
  assert.equal(objective.check(current).checks.maxDistance.distance, null);
  assert.equal(objective.check(current).met, false);
  const unknown = state(); delete unknown.player.position;
  assert.throws(() => createObjective({ maxDistance: 5 }, unknown), /starting position is unavailable/);
  for (const maxDistance of [-1, 10_001, NaN]) assert.throws(() => createObjective({ maxDistance }, state()));
  assert.equal(createObjective({}, state()), null);
});

test('task-scoped deposit verification counts only tracked containers against their pre-deposit contents', () => {
  const logs = count => [{ name: 'minecraft:oak_log', count }];
  const record = (x, items, id, name = 'minecraft:chest') => ({ name, x, y: 64, z: 0, items, sources: [{ id, items: logs(0) }], members: [{ x, y: 64, z: 0 }] });
  // Cached contents opened before the task are never a baseline: the far barrel and the chest's stale 30 are ignored.
  const initial = { ...state(), containers: [record(1, logs(30), 'chest'), record(100, logs(50), 'far', 'minecraft:barrel')] };
  const objective = createObjective({ collect: { block: 'oak_log', count: 8 }, deposit: { item: 'oak_log', count: 8 } }, initial, { scopedStorage: true });
  assert.deepEqual(objective.check(initial).checks.deposit, { item: 'minecraft:oak_log', storedAdditional: 0, requiredAdditional: 8, evidence: 'last_observed', containers: [], met: false });
  const current = { ...state(), inventory: logs(10), containers: [record(1, logs(30), 'chest'), record(100, logs(500), 'far', 'minecraft:barrel')] };
  objective.trackDeposit({ name: 'minecraft:chest', x: 1, y: 64, z: 0, before: logs(22) }, current);
  // A second deposit into the same chest keeps the first baseline.
  objective.trackDeposit({ name: 'minecraft:chest', x: 1, y: 64, z: 0, before: logs(26) }, current);
  assert.deepEqual(objective.storageTargets(current), [{ x: 1, y: 64, z: 0 }]);
  let check = objective.check(current, { storageRefreshed: true });
  assert.deepEqual(check.checks.deposit, { item: 'minecraft:oak_log', storedAdditional: 8, requiredAdditional: 8, evidence: 'refreshed', containers: [{ x: 1, y: 64, z: 0 }], met: true });
  assert.equal(check.checks.inventory.met, true);
  current.containers[0].items = logs(29);
  assert.equal(objective.check(current).met, false, 'a refreshed shortfall in the tracked chest is not met');
  // The tracked inventory, rekeyed by a merge with a newly placed chest, is still found by its source.
  current.containers = [{ ...record(0, logs(30), 'chest'), members: [{ x: 0, y: 64, z: 0 }, { x: 1, y: 64, z: 0 }] }];
  assert.deepEqual(objective.storageTargets(current), [{ x: 1, y: 64, z: 0 }, { x: 0, y: 64, z: 0 }]);
  assert.equal(objective.check(current).checks.deposit.storedAdditional, 8);
  // Merged with other known storage, its old stock has no task baseline, so it fails closed.
  current.containers[0].sources.push({ id: 'other', items: logs(40) });
  current.containers[0].items = logs(70);
  check = objective.check(current);
  assert.equal(check.met, false);
  assert.match(check.checks.deposit.error, /merged with other known storage/);
});

test('a deposit after a merge with unread storage does not adopt that storage as task baseline', () => {
  const logs = count => [{ name: 'minecraft:oak_log', count }];
  const objective = createObjective({ deposit: { item: 'oak_log', count: 8 } }, { ...state(), containers: [] }, { scopedStorage: true });
  const chest = (items, ids) => ({ name: 'minecraft:chest', x: 1, y: 64, z: 0, items, sources: ids.map(id => ({ id, items: logs(0) })), members: [{ x: 1, y: 64, z: 0 }, { x: 2, y: 64, z: 0 }] });
  objective.trackDeposit({ name: 'minecraft:chest', x: 1, y: 64, z: 0, before: logs(0) }, { ...state(), containers: [chest(logs(1), ['a'])] });
  // A neighbouring chest holding 64 old logs merges with it; one more log is deposited into the double chest.
  const current = { ...state(), containers: [chest(logs(66), ['a', 'b'])] };
  objective.trackDeposit({ name: 'minecraft:chest', x: 1, y: 64, z: 0, before: logs(65) }, current);
  const check = objective.check(current, { storageRefreshed: true });
  assert.equal(check.met, false);
  assert.match(check.checks.deposit.error, /merged with other known storage/);
});

test('a deposit into storage that split before the task does not count the other half as a gain', () => {
  const logs = count => [{ name: 'minecraft:oak_log', count }];
  const objective = createObjective({ deposit: { item: 'oak_log', count: 8 } }, { ...state(), containers: [] }, { scopedStorage: true });
  // Both halves of a double chest opened earlier keep its source ID after splitting; only one receives the deposit.
  const half = (x, items) => ({ name: 'minecraft:chest', x, y: 64, z: 0, items, sources: [{ id: 'double', items: logs(0) }] });
  const current = { ...state(), containers: [half(1, logs(7)), half(2, logs(64))] };
  objective.trackDeposit({ name: 'minecraft:chest', x: 1, y: 64, z: 0, before: logs(6) }, current);
  const check = objective.check(current, { storageRefreshed: true });
  assert.equal(check.met, false);
  assert.match(check.checks.deposit.error, /already split/);
});

test('a replacement chest at a tracked coordinate gets its own baseline from its first deposit', () => {
  const logs = count => [{ name: 'minecraft:oak_log', count }];
  const record = (items, id) => ({ name: 'minecraft:chest', x: 1, y: 64, z: 0, items, sources: [{ id, items: logs(0) }] });
  const objective = createObjective({ deposit: { item: 'oak_log', count: 8 } }, { ...state(), containers: [] }, { scopedStorage: true });
  objective.trackDeposit({ name: 'minecraft:chest', x: 1, y: 64, z: 0, before: logs(0) }, { ...state(), containers: [record(logs(8), 'old')] });
  // The first chest is broken and a full one placed in its place; the bot deposits one more log into it.
  const current = { ...state(), containers: [record(logs(65), 'new')] };
  objective.trackDeposit({ name: 'minecraft:chest', x: 1, y: 64, z: 0, before: logs(64) }, current);
  assert.equal(objective.check(current).checks.deposit.storedAdditional, 1);
  assert.equal(objective.check(current).met, false);
  assert.throws(() => objective.trackDeposit({ x: 1, y: 64, z: 0 }, current), 'a report without its prior contents is rejected');
});
