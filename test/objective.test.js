import test from 'node:test';
import assert from 'node:assert/strict';
import { createObjective, parseCollectionCriterion, parseDepositCriterion } from '../src/objective.js';

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
  assert.deepEqual(objective.check(current).checks.deposit, { item: 'minecraft:oak_log', storedAdditional: 8, requiredAdditional: 8, met: true });
  current.containers[1].items[0].count = 13;
  assert.equal(objective.check(current).met, false);
  current.containers[1].items[0].count = 14;
  current.player.uuid = 'other';
  assert.equal(objective.check(current).met, false);
  assert.throws(() => createObjective({ deposit: { item: 'oak_log', count: 8 } }, state()), /does not report container contents/);
  assert.deepEqual(parseDepositCriterion('minecraft:cobblestone:100'), { item: 'minecraft:cobblestone', count: 100 });
  assert.throws(() => parseDepositCriterion('oak_log'), /item and count/);
});
