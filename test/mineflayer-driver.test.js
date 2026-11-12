import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { setImmediate } from 'node:timers/promises';
import minecraftData from 'minecraft-data';
import { Vec3 } from 'vec3';
import { MineflayerDriver } from '../src/mineflayer-driver.js';
import { Harness } from '../src/harness.js';
import { createObjective } from '../src/objective.js';

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

function depositFixture(t, { held = 20, capacity = Infinity, stored = 5, onDeposit = () => {}, start = new Vec3(10, 64, 0), item = 'oak_log' } = {}) {
  const bot = new EventEmitter();
  const registry = minecraftData('1.21.1');
  const chest = registry.blocksByName.chest;
  // A double chest: both halves face west, so the left half's partner is to the north.
  const halves = { '2,64,0': 'left', '2,64,-1': 'right' };
  const inventory = { [item]: held };
  const contents = { [item]: stored };
  const contentsByPosition = {};
  const trips = [];
  const windows = [];
  const batches = [];
  Object.assign(bot, {
    registry, entity: { position: start }, entities: {},
    username: 'Test', player: { uuid: randomUUID() }, game: { dimension: 'overworld' },
    health: 20, food: 20,
    inventory: { items: () => Object.entries(inventory).filter(([, count]) => count > 0).map(([name, count], slot) => ({ name, count, slot: 36 + slot })) },
    pathfinder: {
      setMovements() {}, setGoal() {},
      goto: async goal => { trips.push({ x: goal.x, y: goal.y, z: goal.z }); bot.entity.position = new Vec3(goal.x + 1, goal.y, goal.z); },
    },
    findBlocks: ({ matching }) => (Array.isArray(matching) && matching.includes(chest.id) ? Object.keys(halves).map(key => new Vec3(...key.split(',').map(Number))) : []),
    blockAt: position => {
      const type = halves[`${position.x},${position.y},${position.z}`];
      return type ? { name: type === 'barrel' ? 'barrel' : 'chest', type: type === 'barrel' ? registry.blocksByName.barrel.id : chest.id, position, getProperties: () => ({ facing: 'west', type, waterlogged: false }) } : null;
    },
    openContainer: async block => {
      const windowContents = contentsByPosition[`${block.position.x},${block.position.y},${block.position.z}`] || contents;
      const window = {
        closed: false,
        containerItems: () => Object.entries(windowContents).map(([name, count]) => ({ name, count, type: registry.itemsByName[name].id })),
        deposit: async (type, _metadata, count) => {
          assert.equal(type, registry.itemsByName[item].id);
          batches.push(count);
          const moved = Math.min(count, capacity - windowContents[item]);
          // Like a real window, a failed transfer leaves the rest of the stack on the cursor, outside the inventory.
          inventory[item] -= count; windowContents[item] += moved;
          if (moved < count) window.closeReturns = count - moved;
          onDeposit();
          if (moved < count) throw new Error('destination full');
        },
        // The server returns cursor items in a later inventory update.
        close() { window.closed = true; setImmediate().then(() => { inventory[item] += window.closeReturns || 0; }); },
      };
      windows.push(window);
      return window;
    },
    clearControlStates() {}, deactivateItem() {}, stopDigging() {},
    quit: () => bot.emit('end', 'Closed'),
  });
  const driver = new MineflayerDriver(bot, { host: 'fixture', port: 25565 }, {}, 'unused');
  t.after(() => driver.close());
  return { driver, trips, windows, inventory, contents, batches, halves, contentsByPosition };
}

test('deposit stores every held item in a double chest recorded once, with its prior contents as the baseline', async t => {
  const { driver, trips, windows, inventory } = depositFixture(t);
  assert.deepEqual(driver.observe().containers.map(({ observedAt, sources, members, ...record }) => record), [{ name: 'minecraft:chest', x: 2, y: 64, z: -1, items: null }]);
  const result = await driver.execute({ type: 'deposit', item: 'minecraft:oak_log' }, { signal: new AbortController().signal, onProgress() {} });
  assert.equal(result.message, 'Deposited 20 oak_log into the chest at 2 64 -1.');
  assert.deepEqual(trips, [{ x: 2, y: 64, z: -1 }]);
  assert.equal(inventory.oak_log, 0);
  assert.equal(windows.length, 1); assert.equal(windows[0].closed, true);
  assert.deepEqual(driver.observe().containers.map(({ observedAt, sources, members, ...record }) => record), [{ name: 'minecraft:chest', x: 2, y: 64, z: -1,
    items: [{ name: 'minecraft:oak_log', count: 25 }], firstSeen: [{ name: 'minecraft:oak_log', count: 5 }] }]);
  Object.assign(driver.bot, { blockAt: position => ({ name: 'air', position }), findBlocks: () => [] });
  assert.deepEqual(driver.observe().containers.map(({ observedAt, sources, members, ...record }) => record), [], 'a broken chest is forgotten');
});

test('a full chest fails the deposit with partial progress and the contents it observed', async t => {
  // Live bug: a chest already in reach failed when the bot tried to walk beside it first.
  const { driver, windows, trips } = depositFixture(t, { capacity: 15, start: new Vec3(0.5, 64, -1.5) });
  await assert.rejects(driver.execute({ type: 'deposit', item: 'oak_log', count: 20 }, { signal: new AbortController().signal, onProgress() {} }),
    /chest at 2 64 -1 is full; deposited 10 of 20 oak_log/);
  assert.equal(windows[0].closed, true);
  assert.deepEqual(driver.observe().containers[0].items, [{ name: 'minecraft:oak_log', count: 15 }]);
  assert.deepEqual(trips, []);
});

test('handoff between stacks stops the deposit and closes the chest', async t => {
  const controller = new AbortController();
  const { driver, windows, contents } = depositFixture(t, { held: 130, onDeposit: () => controller.abort(new Error('Player took control.')) });
  await assert.rejects(driver.execute({ type: 'deposit', item: 'oak_log' }, { signal: controller.signal, onProgress() {} }), /Player took control/);
  await driver.operations.waitForIdle(new AbortController().signal);
  assert.equal(contents.oak_log, 5 + 64);
  assert.equal(windows[0].closed, true);
});

test('a chest the pathfinder cannot reach fails after a retry without opening it', async t => {
  const { driver, trips, windows } = depositFixture(t);
  driver.bot.pathfinder.goto = async goal => { trips.push({ x: goal.x, y: goal.y, z: goal.z }); throw new Error('Took to long to decide path to goal!'); };
  await assert.rejects(driver.execute({ type: 'deposit', item: 'oak_log' }, { signal: new AbortController().signal, onProgress() {} }), /Could not reach the chest at 2 64 -1/);
  assert.equal(trips.length, 2);
  assert.equal(windows.length, 0);
});

test('a container that never opens fails without holding the bot busy', async t => {
  const { driver } = depositFixture(t, { start: new Vec3(0.5, 64, -1.5) });
  driver.bot.openContainer = () => new Promise(() => {});
  driver.containerTimeoutMs = 20;
  await assert.rejects(driver.execute({ type: 'deposit', item: 'oak_log' }, { signal: new AbortController().signal, onProgress() {} }), /did not open/);
  assert.equal(driver.isBusy(), false);
});

test('deposits move one real stack at a time, so items that stack to 16 stop on handoff after 16', async t => {
  const controller = new AbortController();
  const { driver, batches, contents } = depositFixture(t, { item: 'ender_pearl', held: 40, stored: 0, onDeposit: () => controller.abort(new Error('Player took control.')) });
  await assert.rejects(driver.execute({ type: 'deposit', item: 'ender_pearl' }, { signal: controller.signal, onProgress() {} }), /Player took control/);
  await driver.operations.waitForIdle(new AbortController().signal);
  assert.deepEqual(batches, [16]);
  assert.equal(contents.ender_pearl, 16);
});

test('deposit without enough items fails before walking anywhere', async t => {
  const { driver, trips } = depositFixture(t, { held: 3 });
  await assert.rejects(driver.execute({ type: 'deposit', item: 'oak_log', count: 8 }, { signal: new AbortController().signal, onProgress() {} }), /Only 3 oak_log/);
  await assert.rejects(driver.execute({ type: 'deposit', item: 'cobblestone' }, { signal: new AbortController().signal, onProgress() {} }), /No cobblestone/);
  assert.deepEqual(trips, []);
});

test('a log slow to plan is deferred behind quicker ones, then retried with the full planning budget', async t => {
  const bot = new EventEmitter();
  const registry = minecraftData('1.21.1');
  const log = registry.blocksByName.oak_log;
  const slow = new Vec3(5, 64, 0);
  const quick = new Vec3(8, 64, 0);
  const remaining = new Set([slow.toString(), quick.toString()]);
  let collected = 0;
  const attempts = [];
  Object.assign(bot, {
    registry, entity: { position: new Vec3(0, 64, 0) }, entities: {},
    username: 'Test', player: { uuid: randomUUID() }, game: { dimension: 'overworld' },
    health: 20, food: 20,
    inventory: { items: () => (collected ? [{ name: 'oak_log', count: collected, slot: 36 }] : []) },
    pathfinder: {
      thinkTimeout: 5000, setMovements() {}, setGoal() {}, bestHarvestTool: () => null,
      goto: async goal => {
        const target = new Vec3(goal.x, goal.y, goal.z);
        if (goal.constructor.name === 'GoalGetToBlock') {
          attempts.push({ target: target.toString(), thinkTimeout: bot.pathfinder.thinkTimeout });
          if (target.equals(slow) && bot.pathfinder.thinkTimeout < 5000) throw new Error('Took to long to decide path to goal!');
        }
        bot.entity.position = target.offset(goal.constructor.name === 'GoalGetToBlock' ? -1 : 0, 0, 0);
      },
    },
    findBlocks: () => [slow, quick].filter(position => remaining.has(position.toString())),
    blockAt: position => (remaining.has(position.toString()) ? { type: log.id, name: 'oak_log', position } : { type: 0, name: 'stone', boundingBox: 'block' }),
    canDigBlock: () => true,
    dig: async block => { remaining.delete(block.position.toString()); collected++; },
    equip: async () => {}, clearControlStates() {}, deactivateItem() {}, stopDigging() {},
    quit: () => bot.emit('end', 'Closed'),
  });
  const driver = new MineflayerDriver(bot, { host: 'fixture', port: 25565 }, {}, 'unused');
  t.after(() => driver.close());
  await driver.execute({ type: 'collect', block: 'oak_log', count: 2 }, { signal: new AbortController().signal, onProgress() {} });
  assert.deepEqual(attempts, [
    { target: slow.toString(), thinkTimeout: 2000 },
    { target: quick.toString(), thinkTimeout: 2000 },
    { target: slow.toString(), thinkTimeout: 5000 },
  ]);
  assert.equal(collected, 2);
  assert.equal(bot.pathfinder.thinkTimeout, 5000);
});

test('after mining a high log the bot walks to where its drop lands, not to the empty block', async t => {
  const { driver, bot, trips } = collectionFixture(t);
  const mined = new Vec3(3, 67, 0);
  // Air below the mined log down to the ground at y = 63.
  bot.findBlocks = () => (bot.inventory.items().length ? [] : [mined]);
  const sand = bot.registry.blocksByName.sand;
  bot.blockAt = position => (position.y > 63 && !position.equals(mined) ? { type: 0, name: 'air', boundingBox: 'empty' } : { type: sand.id, name: 'sand', boundingBox: 'block', position });
  await driver.execute({ type: 'collect', block: 'sand', count: 1 }, { signal: new AbortController().signal, onProgress() {} });
  assert.ok(trips.some(trip => trip.y === 64), `expected a walk to the landing spot at y = 64, got ${JSON.stringify(trips)}`);
  assert.equal(trips.filter(trip => trip.y === 67).length, 1, 'only the approach targets the log; no walk to the empty block in the air');
});

test('mining deadline reserves recovery time and reports failure after returning from a pit', async t => {
  const { driver, bot, trips } = collectionFixture(t);
  driver.approach = async (_position, signal) => {
    bot.entity.position = new Vec3(3, 61, 0);
    await delay(10_000, undefined, { signal });
  };
  const harness = new Harness(driver, { jobTimeoutMs: 20 });
  t.after(() => harness.close());
  const owner = randomUUID();
  harness.acquire(owner);
  harness.start(owner, { type: 'collect', block: 'sand', count: 2 });
  await harness.task;
  assert.equal(harness.job.status, 'failed');
  assert.match(harness.job.message, /Collection timed out.*Inventory: 0\/2.*Returned/);
  assert.deepEqual(bot.entity.position, new Vec3(0, 64, 0));
  assert.deepEqual(trips.slice(-2), [{ y: 64, canDig: false }, { y: 64, canDig: true }]);
});

test('takeover after the mining deadline cancels recovery without a digging fallback', async t => {
  const { driver, bot, controller, trips } = collectionFixture(t);
  driver.approach = async (_position, signal) => {
    bot.entity.position = new Vec3(3, 61, 0);
    await delay(10_000, undefined, { signal });
  };
  bot.pathfinder.goto = async () => {
    trips.push('walking');
    controller.abort(new Error('Player took control.'));
    throw controller.signal.reason;
  };
  await assert.rejects(driver.execute({ type: 'collect', block: 'sand', count: 2 }, {
    signal: controller.signal, collectionTimeoutMs: 20, onProgress() {},
  }), /Player took control/);
  assert.deepEqual(trips, ['walking']);
});

test('storage inspection reopens a chest and sees items removed since the deposit', async t => {
  const { driver, contents, windows } = depositFixture(t);
  const signal = new AbortController().signal;
  await driver.execute({ type: 'deposit', item: 'oak_log', count: 8 }, { signal, onProgress() {} });
  const cached = driver.observe().containers[0];
  assert.equal(cached.items[0].count, 13);
  contents.oak_log = 5; // Another player takes the newly deposited logs.
  await driver.execute({ type: 'inspect_storage' }, { signal, onProgress() {} });
  assert.equal(driver.observe().containers[0].items[0].count, 5);
  assert.equal(windows.length, 2);
  assert.ok(driver.observe().containers[0].observedAt >= cached.observedAt);
});

test('storage inspection returns near its original position after walking to the chest', async t => {
  const { driver } = depositFixture(t);
  const signal = new AbortController().signal;
  await driver.execute({ type: 'deposit', item: 'oak_log', count: 8 }, { signal, onProgress() {} });
  const start = driver.bot.entity.position = new Vec3(10, 64, 0);
  await driver.execute({ type: 'inspect_storage' }, { signal, onProgress() {} });
  assert.ok(driver.bot.entity.position.distanceTo(start) <= 2);
});

test('handoff during storage opening prevents late reads and closes the window', async t => {
  const { driver } = depositFixture(t);
  const signal = new AbortController().signal;
  await driver.execute({ type: 'deposit', item: 'oak_log', count: 8 }, { signal, onProgress() {} });
  const cached = driver.observe().containers[0];
  let opened;
  const started = new Promise(resolve => { opened = resolve; });
  let finishOpen;
  driver.bot.openContainer = () => { opened(); return new Promise(resolve => { finishOpen = resolve; }); };
  const controller = new AbortController();
  const inspection = driver.execute({ type: 'inspect_storage' }, { signal: controller.signal, onProgress() {} });
  await started;
  controller.abort(new Error('Player took control.'));
  await assert.rejects(inspection, /Player took control/);
  let closed = false;
  finishOpen({ containerItems() { assert.fail('No late container read after handoff'); }, close() { closed = true; } });
  await setImmediate();
  assert.equal(closed, true);
  assert.deepEqual(driver.observe().containers[0], cached);
});

test('adding a lower chest half rekeys one known inventory without doubling verification gains', async t => {
  const { driver, halves, inventory } = depositFixture(t);
  halves['2,64,0'] = 'single';
  delete halves['2,64,-1'];
  const upper = new Vec3(2, 64, 0);
  driver.recordContainer(upper, 'chest', { containerItems: () => [{ name: 'oak_log', count: 5 }] });
  const initial = driver.observe();
  const criteria = count => createObjective({ collect: { block: 'oak_log', count }, deposit: { item: 'oak_log', count } }, initial);
  halves['2,64,0'] = 'left';
  halves['2,64,-1'] = 'right';
  inventory.oak_log += 8;
  const signal = new AbortController().signal;
  await driver.execute({ type: 'deposit', item: 'oak_log', count: 8 }, { signal, onProgress() {} });
  await driver.execute({ type: 'inspect_storage' }, { signal, onProgress() {} });
  const current = driver.observe();
  assert.equal(current.containers.length, 1);
  assert.equal(current.containers[0].items[0].count, 13);
  assert.equal(criteria(8).check(current).met, true);
  assert.equal(criteria(16).check(current).met, false);
});

test('merging two previously opened single chests preserves both starting baselines', async t => {
  const { driver, halves, inventory, contents, windows } = depositFixture(t);
  halves['2,64,0'] = 'single';
  halves['2,64,-1'] = 'single';
  driver.recordContainer(new Vec3(2, 64, 0), 'chest', { containerItems: () => [{ name: 'oak_log', count: 5 }] });
  driver.recordContainer(new Vec3(2, 64, -1), 'chest', { containerItems: () => [{ name: 'oak_log', count: 7 }] });
  const initial = driver.observe();
  const objective = count => createObjective({ collect: { block: 'oak_log', count }, deposit: { item: 'oak_log', count } }, initial);
  halves['2,64,0'] = 'left';
  halves['2,64,-1'] = 'right';
  contents.oak_log = 12;
  inventory.oak_log += 8;
  const signal = new AbortController().signal;
  await driver.execute({ type: 'deposit', item: 'oak_log', count: 8 }, { signal, onProgress() {} });
  await driver.execute({ type: 'inspect_storage' }, { signal, onProgress() {} });
  const current = driver.observe();
  assert.equal(current.containers.length, 1);
  assert.equal(windows.length, 2, 'one deposit and one inspection of the shared inventory');
  assert.deepEqual(current.containers[0].firstSeen, [{ name: 'minecraft:oak_log', count: 12 }]);
  assert.equal(objective(8).check(current).met, true);
  assert.equal(objective(16).check(current).met, false);
});

test('a chest first opened during the task keeps its old-stock baseline when merged with starting storage', async t => {
  const { driver, halves, inventory, contents } = depositFixture(t);
  halves['2,64,0'] = 'single';
  halves['2,64,-1'] = 'single';
  driver.recordContainer(new Vec3(2, 64, 0), 'chest', { containerItems: () => [{ name: 'oak_log', count: 5 }] });
  const initial = driver.observe();
  const objective = count => createObjective({ collect: { block: 'oak_log', count }, deposit: { item: 'oak_log', count } }, initial);
  // The second chest's eight old logs are discovered only after the task baseline was established.
  driver.recordContainer(new Vec3(2, 64, -1), 'chest', { containerItems: () => [{ name: 'oak_log', count: 8 }] });
  contents.oak_log = 8;
  inventory.oak_log += 8;
  driver.bot.entity.position = new Vec3(2, 64, -2);
  const signal = new AbortController().signal;
  await driver.execute({ type: 'deposit', item: 'oak_log', count: 8 }, { signal, onProgress() {} });
  halves['2,64,0'] = 'left';
  halves['2,64,-1'] = 'right';
  contents.oak_log = 21; // Five old logs + eight old logs + eight new logs.
  await driver.execute({ type: 'inspect_storage' }, { signal, onProgress() {} });
  const current = driver.observe();
  assert.equal(current.containers.length, 1);
  assert.equal(objective(8).check(current).met, true);
  const tooMany = objective(16).check(current);
  assert.equal(tooMany.checks.deposit.storedAdditional, 8);
  assert.equal(tooMany.met, false);
});

test('a barrel at a former chest-half coordinate is inspected and counted as separate storage', async t => {
  const { driver, halves, inventory, contentsByPosition } = depositFixture(t);
  halves['2,64,0'] = 'single';
  delete halves['2,64,-1'];
  driver.recordContainer(new Vec3(2, 64, 0), 'chest', { containerItems: () => [{ name: 'oak_log', count: 5 }] });
  halves['2,64,0'] = 'left';
  halves['2,64,-1'] = 'right';
  const signal = new AbortController().signal;
  await driver.execute({ type: 'inspect_storage' }, { signal, onProgress() {} });
  const objective = createObjective({ collect: { block: 'oak_log', count: 8 }, deposit: { item: 'oak_log', count: 8 } }, driver.observe());
  halves['2,64,0'] = 'barrel';
  halves['2,64,-1'] = 'single';
  contentsByPosition['2,64,0'] = { oak_log: 0 };
  contentsByPosition['2,64,-1'] = { oak_log: 5 };
  inventory.oak_log += 8;
  driver.bot.entity.position = new Vec3(3, 64, 0);
  await driver.execute({ type: 'deposit', item: 'oak_log', count: 8 }, { signal, onProgress() {} });
  await driver.execute({ type: 'inspect_storage' }, { signal, onProgress() {} });
  const current = driver.observe();
  assert.equal(current.containers.length, 2);
  assert.deepEqual(current.containers.map(container => container.members.length), [1, 1]);
  assert.equal(objective.check(current).checks.deposit.storedAdditional, 8);
  assert.equal(objective.check(current).met, true);
});

test('real bot observation includes threat coordinates usable by spatial scene queries', async t => {
  const { sceneReport } = await import('../src/scene-tools.js');
  const bot = new EventEmitter();
  Object.assign(bot, {
    registry: minecraftData('1.21.1'), entity: { position: new Vec3(0, 64, 0) },
    entities: { zombie: { name: 'zombie', position: new Vec3(3, 64, 4) },
      skeleton: { name: 'skeleton', position: new Vec3(6, 64, 8) },
      distant: { name: 'creeper', position: new Vec3(100, 64, 0) },
      passive: { name: 'cow', position: new Vec3(1, 64, 0) } },
    username: 'Test', player: { uuid: randomUUID() }, game: { dimension: 'overworld' },
    health: 20, food: 20, inventory: { items: () => [] },
    pathfinder: { setMovements() {}, setGoal() {} }, findBlocks: () => [],
    clearControlStates() {}, deactivateItem() {}, stopDigging() {}, quit: () => bot.emit('end', 'Closed'),
  });
  const driver = new MineflayerDriver(bot, { host: 'fixture', port: 25565 }, {}, 'unused');
  t.after(() => driver.close());
  const state = driver.observe();
  assert.deepEqual(state.threats, [
    { type: 'minecraft:zombie', distance: 5, x: 3, y: 64, z: 4 },
    { type: 'minecraft:skeleton', distance: 10, x: 6, y: 64, z: 8 },
  ]);
  assert.equal(sceneReport(state, 'threats-around', ['0,64,0', '5']).entries.length, 1);
  assert.equal(sceneReport(state, 'threat-separation').pair.distance, 5);
  state.blocks = [{ name: 'minecraft:oak_log', x: 3, y: 64, z: 3 }];
  assert.equal(sceneReport(state, 'block-clearance', ['oak_log']).entries[0].nearestObservedThreat, 1);
});
