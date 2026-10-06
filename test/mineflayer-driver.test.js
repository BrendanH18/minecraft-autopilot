import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';
import minecraftData from 'minecraft-data';
import { Vec3 } from 'vec3';
import { MineflayerDriver } from '../src/mineflayer-driver.js';
import { Harness } from '../src/harness.js';

test('handoff during food equip prevents consumption and waits for the late inventory reply', async t => {
  const bot = new EventEmitter();
  let equipped;
  const started = new Promise(resolve => { equipped = resolve; });
  let finishEquip;
  const inventoryReply = new Promise(resolve => { finishEquip = resolve; });
  let consumed = 0;
  Object.assign(bot, {
    registry: minecraftData('1.21.1'),
    entity: { position: new Vec3(0, 64, 0) }, entities: {},
    username: 'Test', player: { uuid: randomUUID() }, game: { dimension: 'overworld' },
    health: 20, food: 10,
    inventory: { items: () => [{ name: 'bread', count: 4, slot: 36 }] },
    pathfinder: { setMovements() {}, setGoal() {} },
    findBlocks: () => [], clearControlStates() {}, deactivateItem() {}, stopDigging() {},
    equip: () => { equipped(); return inventoryReply; },
    consume: async () => { consumed++; },
    quit: () => bot.emit('end', 'Closed'),
  });
  const driver = new MineflayerDriver(bot, { host: 'fixture', port: 25565 }, {}, 'unused');
  const harness = new Harness(driver);
  t.after(async () => { finishEquip(); await harness.close(); });
  const owner = randomUUID(); harness.acquire(owner);
  harness.start(owner, { type: 'eat' });
  await started;
  harness.release('Player took control.');
  await harness.task;
  assert.equal(driver.operations.busy, true);
  assert.equal(harness.observe().stopping, true);
  assert.throws(() => harness.acquire(randomUUID()), /still stopping/);
  finishEquip();
  await setImmediate();
  assert.equal(consumed, 0);
  assert.equal(driver.isBusy(), false);
  assert.equal(harness.observe().stopping, false);
  harness.acquire(randomUUID());
});

test('a hungry bot with low health eats instead of repeatedly retreating', async t => {
  const bot = new EventEmitter();
  let consumed = 0;
  let goals = 0;
  let stopPath;
  Object.assign(bot, {
    registry: minecraftData('1.21.1'),
    entity: { position: new Vec3(0, 64, 0) }, entities: {},
    username: 'Test', player: { uuid: randomUUID() }, game: { dimension: 'overworld' },
    health: 7, food: 5,
    inventory: { items: () => [{ name: 'bread', count: 4, slot: 36 }] },
    // Like mineflayer-pathfinder, clearing the goal rejects the pending goto.
    pathfinder: { setMovements() {}, setGoal(goal) { if (goal === null) stopPath?.(new Error('Goal changed')); },
      goto: () => { goals++; return new Promise((_, reject) => { stopPath = reject; }); } },
    findBlocks: () => [], clearControlStates() {}, deactivateItem() {}, stopDigging() {},
    equip: async () => {},
    consume: async () => { consumed++; bot.food = 10; },
    quit: () => bot.emit('end', 'Closed'),
  });
  const driver = new MineflayerDriver(bot, { host: 'fixture', port: 25565 }, {}, 'unused');
  driver.homes[driver.identity()] = { x: 5, y: 64, z: 5 };
  const harness = new Harness(driver);
  t.after(() => harness.close());
  const owner = randomUUID(); harness.acquire(owner);
  harness.start(owner, { type: 'goto', x: 20, y: 64, z: 20 });
  await harness.task;
  assert.equal(harness.job.status, 'failed');
  assert.match(harness.job.message, /Interrupted to eat/);
  assert.equal(consumed, 1);
  assert.equal(goals, 1, 'no retreat should start before eating');
});

test('collection walks back to its start, digging out of a pit only as a fallback, then restores non-destructive movement', async t => {
  const bot = new EventEmitter();
  const sand = minecraftData('1.21.1').blocksByName.sand;
  const position = new Vec3(3, 63, 0);
  let sandCount = 0;
  let mined = false;
  const trips = [];
  let movements;
  Object.assign(bot, {
    registry: minecraftData('1.21.1'),
    entity: { position: new Vec3(0, 64, 0) }, entities: {},
    username: 'Test', player: { uuid: randomUUID() }, game: { dimension: 'overworld' },
    health: 20, food: 20,
    inventory: { items: () => sandCount ? [{ name: 'sand', count: sandCount, slot: 36 }] : [] },
    pathfinder: {
      setMovements(value) { movements = value; }, setGoal() {}, bestHarvestTool: () => null,
      goto: async goal => {
        trips.push({ x: goal.x, y: goal.y, z: goal.z, canDig: movements.canDig });
        // The miner ends in a pit: walking back to the start fails without digging.
        if (goal.y === 64 && !movements.canDig) throw new Error('No path to the goal!');
        bot.entity.position = new Vec3(goal.x, goal.y, goal.z);
      },
    },
    findBlocks: () => (mined ? [] : [position]),
    blockAt: () => ({ type: sand.id, name: 'sand' }),
    canDigBlock: () => true,
    dig: async () => { mined = true; sandCount += 1; },
    clearControlStates() {}, deactivateItem() {}, stopDigging() {},
    quit: () => bot.emit('end', 'Closed'),
  });
  const driver = new MineflayerDriver(bot, { host: 'fixture', port: 25565 }, {}, 'unused');
  t.after(() => driver.close());
  const result = await driver.execute({ type: 'collect', block: 'minecraft:sand', count: 1 }, { signal: new AbortController().signal, onProgress() {} });
  assert.equal(result.message, 'Collected requested items and returned to the starting point.');
  assert.deepEqual(trips.slice(-2), [{ x: 0, y: 64, z: 0, canDig: false }, { x: 0, y: 64, z: 0, canDig: true }]);
  assert.ok(trips.slice(0, -1).every(trip => trip.canDig === false), 'only the fallback return may dig');
  assert.equal(movements, driver.movements);
});
