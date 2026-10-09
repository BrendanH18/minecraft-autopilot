import test from 'node:test';
import assert from 'node:assert/strict';
import { createObjective, parseCollectionCriterion } from '../src/objective.js';

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
