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

function collectionFixture(t, { cannotReturn = false, cancelOnDig = false, material = 'sand', withPickaxe = false, breakPickaxe = false } = {}) {
  const bot = new EventEmitter();
  const registry = minecraftData('1.21.1');
  const position = new Vec3(3, 63, 0);
  const controller = new AbortController();
  let collected = 0;
  let movements;
  let toolBroken = false;
  const pickaxe = { name: 'stone_pickaxe', type: registry.itemsByName.stone_pickaxe.id, count: 1, slot: 37 };
  const trips = [];
  Object.assign(bot, {
    registry, entity: { position: new Vec3(0, 64, 0) }, entities: {},
    username: 'Test', player: { uuid: randomUUID() }, game: { dimension: 'overworld' },
    health: 20, food: 20,
    inventory: { items: () => [...(collected ? [{ name: material, count: collected, slot: 36 }] : []), ...(withPickaxe && !toolBroken ? [pickaxe] : [])] },
    pathfinder: {
      setMovements(value) { movements = value; }, setGoal() {}, bestHarvestTool: () => withPickaxe && !toolBroken ? pickaxe : null,
      goto: async goal => {
        trips.push({ y: goal.y, canDig: movements.canDig });
        if (goal.y === 64 && (cannotReturn || !movements.canDig)) throw new Error('No path home');
        bot.entity.position = new Vec3(goal.x, goal.y, goal.z);
      },
    },
    findBlocks: () => collected ? [] : [position],
    blockAt: () => ({ type: registry.blocksByName[material].id, name: material }),
    canDigBlock: () => true,
    dig: async () => {
      collected++;
      if (breakPickaxe) toolBroken = true;
      if (cancelOnDig) controller.abort(new Error('Player took control.'));
    },
    equip: async () => {}, clearControlStates() {}, deactivateItem() {}, stopDigging() {},
    quit: () => bot.emit('end', 'Closed'),
  });
  const driver = new MineflayerDriver(bot, { host: 'fixture', port: 25565 }, {}, 'unused');
  t.after(() => driver.close());
  return { driver, bot, controller, trips, movements: () => movements };
}

test('partial collection returns from the pit but still reports the unmet quota', async t => {
  const { driver, bot, controller, trips, movements } = collectionFixture(t);
  await assert.rejects(driver.execute({ type: 'collect', block: 'minecraft:sand', count: 2 }, {
    signal: controller.signal, onProgress() {},
  }), /No reachable.*Inventory: 1\/2.*Returned to the starting point/);
  assert.deepEqual(bot.entity.position, new Vec3(0, 64, 0));
  assert.deepEqual(trips.slice(-2), [{ y: 64, canDig: false }, { y: 64, canDig: true }]);
  assert.equal(movements(), driver.movements);
});

test('a met collection quota with an unreachable return trip is a failed job', async t => {
  const { driver, trips, movements } = collectionFixture(t, { cannotReturn: true });
  const harness = new Harness(driver);
  t.after(() => harness.close());
  const owner = randomUUID();
  harness.acquire(owner);
  harness.start(owner, { type: 'collect', block: 'sand', count: 1 });
  await harness.task;
  assert.equal(harness.job.status, 'failed');
  assert.match(harness.job.message, /Collected requested items.*1\/1.*could not return/);
  assert.deepEqual(trips.slice(-2), [{ y: 64, canDig: false }, { y: 64, canDig: true }]);
  assert.equal(movements(), driver.movements);
});

test('handoff during collection never starts a recovery trip', async t => {
  const { driver, controller, trips } = collectionFixture(t, { cancelOnDig: true });
  await assert.rejects(driver.execute({ type: 'collect', block: 'sand', count: 2 }, {
    signal: controller.signal, onProgress() {},
  }), /Player took control/);
  assert.ok(trips.every(trip => trip.y !== 64));
  assert.equal(driver.activeAction, false);
});

test('cancellation during a return trip prevents the digging fallback', async t => {
  const { driver, controller, bot } = collectionFixture(t);
  bot.entity.position = new Vec3(3, 63, 0);
  let trips = 0;
  bot.pathfinder.goto = async () => {
    trips++;
    controller.abort(new Error('Player took control.'));
    throw controller.signal.reason;
  };
  await assert.rejects(driver.returnFromCollection(new Vec3(0, 64, 0), controller.signal), /Player took control/);
  assert.equal(trips, 1);
});

test('navigation that stops short of an unreachable goal is a failed job', async t => {
  const { driver, bot } = collectionFixture(t);
  // Like mineflayer-pathfinder, goto resolves without moving when no path segment is found.
  bot.pathfinder.goto = async () => {};
  const harness = new Harness(driver);
  t.after(() => harness.close());
  const owner = randomUUID();
  harness.acquire(owner);
  harness.start(owner, { type: 'goto', x: 7.5, y: 77, z: 0 });
  await harness.task;
  assert.equal(harness.job.status, 'failed');
  assert.match(harness.job.message, /Could not reach 7 77 0; stopped 15\.0 blocks away/);
  bot.pathfinder.goto = async () => { bot.entity.position = new Vec3(7.5, 77, 0.5); };
  harness.start(owner, { type: 'goto', x: 7.5, y: 77, z: 0 });
  await harness.task;
  assert.equal(harness.job.status, 'completed');
  // A fractional home counts as reached wherever the pathfinder's goal does, more than two blocks from the floored goal.
  bot.pathfinder.goto = async () => { bot.entity.position = new Vec3(1.69, 64.875, 0.69); };
  harness.start(owner, { type: 'goto', x: 0.69, y: 64.875, z: 0.69 });
  await harness.task;
  assert.equal(harness.job.status, 'completed');
});

test('stopping clears a jump queued for the next physics tick', async t => {
  const { driver, bot } = collectionFixture(t);
  bot.jumpQueued = true;
  driver.stop();
  assert.equal(bot.jumpQueued, false);
});

test('a pathfinder stuck on a block edge hops free, and repeated stalls fail promptly', async t => {
  const { driver, bot, controller } = collectionFixture(t);
  const controls = [];
  bot.setControlState = (control, state) => controls.push(`${control}:${state}`);
  bot.clearControlStates = () => controls.push('clear');
  let freeAfter = 1;
  let trips = 0;
  // Like mineflayer-pathfinder, a stall emits path_reset('stuck') and the goto stays pending until the goal is cleared.
  bot.pathfinder.goto = () => new Promise((resolve, reject) => {
    if (trips++ >= freeAfter) { bot.entity.position = new Vec3(10, 64, 0); resolve(); return; }
    bot.pathfinder.setGoal = goal => { if (goal === null) reject(new Error('The goal was changed before it could be completed!')); };
    setImmediate().then(() => bot.emit('path_reset', 'stuck'));
  });
  await driver.execute({ type: 'goto', x: 10, y: 64, z: 0 }, { signal: controller.signal, onProgress() {} });
  assert.equal(trips, 2);
  assert.ok(controls.includes('jump:true'), 'hops after the first stall');

  freeAfter = Infinity; trips = 0;
  bot.entity.position = new Vec3(0, 64, 0);
  await assert.rejects(driver.execute({ type: 'goto', x: 10, y: 64, z: 0 }, { signal: controller.signal, onProgress() {} }),
    /Navigation got stuck near 0 64 0/);
  assert.equal(trips, 3);
});

test('stalls at separate places along a route each get their own hops', async t => {
  const { driver, bot, controller } = collectionFixture(t);
  bot.setControlState = () => {};
  bot.clearControlStates = () => {};
  let trips = 0;
  // Each attempt advances 5 blocks before stalling, so no single spot stalls twice.
  bot.pathfinder.goto = () => new Promise((resolve, reject) => {
    if (trips++ >= 4) { bot.entity.position = new Vec3(30, 64, 0); resolve(); return; }
    bot.entity.position = new Vec3(trips * 5, 64, 0);
    bot.pathfinder.setGoal = goal => { if (goal === null) reject(new Error('The goal was changed before it could be completed!')); };
    setImmediate().then(() => bot.emit('path_reset', 'stuck'));
  });
  await driver.execute({ type: 'goto', x: 30, y: 64, z: 0 }, { signal: controller.signal, onProgress() {} });
  assert.equal(trips, 5);
});

test('a mined block above reach still counts and waits for the drop', async t => {
  const { driver, bot, controller } = collectionFixture(t);
  const walk = bot.pathfinder.goto;
  // The bot digs the block from three blocks below, and the walk to the block's own position cannot arrive.
  bot.pathfinder.goto = async goal => {
    if (goal.rangeSq === undefined) { bot.entity.position = new Vec3(goal.x, goal.y - 3, goal.z); return; }
    if (goal.y === 63) return;
    return walk(goal);
  };
  const progress = [];
  const result = await driver.execute({ type: 'collect', block: 'sand', count: 1 }, { signal: controller.signal, onProgress: message => progress.push(message) });
  assert.match(result.message, /Collected requested items/);
  assert.ok(progress.includes('Inventory: 1/1'));
});

test('cobblestone without a pickaxe fails before navigating or breaking any blocks', async t => {
  const { driver, bot, controller, trips } = collectionFixture(t, { material: 'cobblestone' });
  let dug = false;
  bot.dig = async () => { dug = true; };
  bot.inventory.items = () => [{ name: 'stone_axe', type: bot.registry.itemsByName.stone_axe.id, count: 1 }];
  await assert.rejects(driver.execute({ type: 'collect', block: 'cobblestone', count: 1 }, {
    signal: controller.signal, onProgress() {},
  }), /pickaxe/);
  assert.equal(dug, false);
  assert.equal(trips.length, 0);
});

test('a broken pickaxe stops partial cobblestone collection and returns from the pit', async t => {
  const { driver, bot, controller } = collectionFixture(t, { material: 'cobblestone', withPickaxe: true, breakPickaxe: true });
  await assert.rejects(driver.execute({ type: 'collect', block: 'cobblestone', count: 2 }, {
    signal: controller.signal, onProgress() {},
  }), /pickaxe.*Inventory: 1\/2.*Returned to the starting point/);
  assert.deepEqual(bot.entity.position, new Vec3(0, 64, 0));
  assert.equal(bot.inventory.items().find(item => item.name === 'cobblestone').count, 1);
});
