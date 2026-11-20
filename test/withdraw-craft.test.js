import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import minecraftData from 'minecraft-data';
import recipeLoader from 'prismarine-recipe';
import { Vec3 } from 'vec3';
import { DemoDriver } from '../src/demo-driver.js';
import { MineflayerDriver } from '../src/mineflayer-driver.js';
import { normalizeAction } from '../src/protocol.js';

const registry = minecraftData('1.21.1');
const { Recipe } = recipeLoader(registry);
const run = (driver, action, signal = new AbortController().signal, progress = []) =>
  driver.execute(normalizeAction(action), { signal, onProgress: (message) => progress.push(message) });
const held = (inventory, name) =>
  inventory.filter((stack) => stack.name === name).reduce((sum, stack) => sum + stack.count, 0);

test('demo withdraw takes from the chest, reports it with its prior contents, and updates the observation', async () => {
  const driver = new DemoDriver({ scenario: 'stocked' });
  const result = await run(driver, { type: 'withdraw', item: 'oak_log', count: 8 });
  assert.match(result.message, /withdrawing 8 oak_log from the demo chest at 3 64 3/);
  assert.deepEqual(result.container, {
    name: 'minecraft:chest',
    x: 3,
    y: 64,
    z: 3,
    before: [
      { name: 'minecraft:oak_log', count: 12 },
      { name: 'minecraft:cobblestone', count: 5 },
    ],
  });
  const state = driver.observe();
  assert.equal(held(state.inventory, 'minecraft:oak_log'), 8);
  assert.deepEqual(state.containers[0].items, [
    { name: 'minecraft:oak_log', count: 4 },
    { name: 'minecraft:cobblestone', count: 5 },
  ]);
  assert.deepEqual(state.containers[0].firstSeen, result.container.before);
  assert.ok(Number.isFinite(state.containers[0].observedAt));
  // Without a count it takes every remaining log; the chest no longer lists them.
  await run(driver, { type: 'withdraw', item: 'oak_log' });
  assert.equal(held(driver.observe().inventory, 'minecraft:oak_log'), 12);
  await assert.rejects(run(driver, { type: 'withdraw', item: 'oak_log' }), /No chest or barrel within 16 blocks/);
});

test('demo withdraw fails with partial progress when the chest holds too little or the inventory fills', async () => {
  const short = new DemoDriver({ scenario: 'stocked' });
  await assert.rejects(run(short, { type: 'withdraw', item: 'cobblestone', count: 8 }), (error) => {
    assert.match(error.message, /held only 5 cobblestone; withdrew 5 of 8 cobblestone\./);
    assert.equal(error.container.x, 3);
    return true;
  });
  assert.equal(held(short.inventory, 'minecraft:cobblestone'), 5);
  const unopened = new DemoDriver();
  await assert.rejects(run(unopened, { type: 'withdraw', item: 'oak_log', count: 1 }), /holds no oak_log/);
  assert.deepEqual(unopened.observe().containers[0].items, []);
  const full = new DemoDriver({ scenario: 'full' });
  full.chest.items = [{ name: 'minecraft:cobblestone', count: 100 }];
  full.inventory.find((stack) => stack.name === 'minecraft:cobblestone').count = 60;
  await assert.rejects(
    run(full, { type: 'withdraw', item: 'cobblestone', count: 10 }),
    /^Error: Inventory full; withdrew 4 of 10 cobblestone\.$/,
  );
  assert.deepEqual(full.chest.items, [{ name: 'minecraft:cobblestone', count: 96 }]);
});

test('demo crafting bootstraps from chest logs to a stone pickaxe, placing the crafted table once', async () => {
  const driver = new DemoDriver({ scenario: 'stocked' });
  await run(driver, { type: 'withdraw', item: 'oak_log', count: 3 });
  await run(driver, { type: 'withdraw', item: 'cobblestone', count: 3 });
  await assert.rejects(
    run(driver, { type: 'craft', item: 'stone_pickaxe', count: 1 }),
    /^Error: Missing ingredients for 1 stone_pickaxe: 2 more stick\.$/,
  );
  assert.match((await run(driver, { type: 'craft', item: 'oak_planks', count: 12 })).message, /crafting 12 oak_planks/);
  await run(driver, { type: 'craft', item: 'crafting_table', count: 1 });
  await run(driver, { type: 'craft', item: 'stick', count: 4 });
  const progress = [];
  const placed = await run(
    driver,
    { type: 'craft', item: 'stone_pickaxe', count: 1 },
    new AbortController().signal,
    progress,
  );
  assert.match(placed.message, /^Placed a crafting table at 1 64 0\. Simulated crafting 1 stone_pickaxe\.$/);
  assert.deepEqual(progress, ['Placed a crafting table at 1 64 0.']);
  const reused = await run(driver, { type: 'craft', item: 'wooden_pickaxe', count: 1 });
  assert.doesNotMatch(reused.message, /Placed/);
  const state = driver.observe();
  assert.ok(state.blocks.some((block) => block.name === 'minecraft:crafting_table' && block.x === 1 && block.z === 0));
  for (const [name, count] of [
    ['minecraft:stone_pickaxe', 1],
    ['minecraft:wooden_pickaxe', 1],
    ['minecraft:oak_planks', 3],
    ['minecraft:stick', 0],
    ['minecraft:crafting_table', 0],
    ['minecraft:oak_log', 0],
    ['minecraft:cobblestone', 0],
  ])
    assert.equal(held(state.inventory, name), count, name);
});

test('demo table recipes fail before anything changes without a table, and crafting stops on abort or a full inventory', async () => {
  const driver = new DemoDriver();
  driver.inventory.push({ slot: 1, name: 'minecraft:oak_planks', count: 16 });
  await assert.rejects(
    run(driver, { type: 'craft', item: 'chest', count: 1 }),
    /needs a crafting table; none is within 16 blocks and none is held/,
  );
  assert.equal(held(driver.inventory, 'minecraft:oak_planks'), 16);
  const controller = new AbortController();
  const crafting = run(driver, { type: 'craft', item: 'stick', count: 32 }, controller.signal);
  setTimeout(() => controller.abort(new Error('Player took control.')), 120);
  await assert.rejects(crafting, /Player took control|aborted/i);
  const sticks = held(driver.inventory, 'minecraft:stick');
  assert.ok(sticks > 0 && sticks < 32, `completed crafts stay (${sticks})`);
  assert.equal(held(driver.inventory, 'minecraft:oak_planks'), 16 - sticks / 2);
  // Every main slot is used: 4 planks fit on a partial stack, and a log taken from a stack of 3 frees nothing.
  const full = new DemoDriver({ scenario: 'full' });
  full.inventory[0] = { slot: 0, name: 'minecraft:oak_log', count: 3 };
  full.inventory[1] = { slot: 1, name: 'minecraft:oak_planks', count: 60 };
  await assert.rejects(
    run(full, { type: 'craft', item: 'oak_planks', count: 12 }),
    /^Error: Inventory full; crafted 4 of 12 oak_planks\.$/,
  );
  assert.equal(held(full.inventory, 'minecraft:oak_log'), 2);
});

// A bot in a flat world: stone at y 63, air above, chests and crafting tables where `blocks` says.
function botFixture(
  t,
  { start = new Vec3(0.5, 64, 0.5), blocks = {}, contents = {}, items = [], onTransfer, onCraft } = {},
) {
  const bot = new EventEmitter();
  const world = new Map(Object.entries(blocks));
  const slots = Array(36).fill(null);
  const stackSize = (name) => registry.itemsByName[name].stackSize;
  const give = (name, count) => {
    for (const stack of slots.filter((stack) => stack?.name === name)) {
      const added = Math.min(count, stackSize(name) - stack.count);
      stack.count += added;
      count -= added;
    }
    for (let slot = 0; count > 0 && slot < 36; slot++)
      if (!slots[slot]) {
        slots[slot] = { name, count: Math.min(count, stackSize(name)) };
        count -= slots[slot].count;
      }
    return count;
  };
  const take = (name, count) => {
    for (const stack of slots.filter((stack) => stack?.name === name)) {
      const taken = Math.min(count, stack.count);
      stack.count -= taken;
      count -= taken;
    }
    slots.forEach((stack, slot) => {
      if (stack?.count === 0) slots[slot] = null;
    });
    assert.equal(count, 0, `took more ${name} than held`);
  };
  for (const [name, count] of items) give(name, count);
  const stacks = () =>
    slots
      .map((stack, index) => stack && { ...stack, slot: 9 + index, type: registry.itemsByName[stack.name].id })
      .filter(Boolean);
  const log = { trips: [], windows: [], batches: [], crafts: [], placed: [], equipped: [] };
  const blockAt = (position) => {
    const key = `${position.x},${position.y},${position.z}`;
    const name = world.get(key) ?? (position.y < 64 ? 'stone' : 'air');
    return {
      name,
      type: registry.blocksByName[name].id,
      position,
      boundingBox: name === 'air' ? 'empty' : 'block',
      getProperties: () => ({ facing: 'west', type: 'single', waterlogged: false }),
    };
  };
  Object.assign(bot, {
    registry,
    entity: { position: start },
    entities: {},
    username: 'Test',
    player: { uuid: randomUUID() },
    game: { dimension: 'overworld' },
    health: 20,
    food: 20,
    inventory: { items: stacks },
    pathfinder: {
      setMovements() {},
      setGoal() {},
      goto: async (goal) => {
        log.trips.push({ x: goal.x, y: goal.y, z: goal.z });
        bot.entity.position = new Vec3(goal.x + 1.5, goal.y, goal.z + 0.5);
      },
    },
    findBlocks: ({ matching, maxDistance }) =>
      [...world]
        .map(([key, name]) => ({ position: new Vec3(...key.split(',').map(Number)), name }))
        .filter(
          ({ position, name }) =>
            [matching].flat().includes(registry.blocksByName[name].id) &&
            position.distanceTo(bot.entity.position) <= maxDistance,
        )
        .map(({ position }) => position),
    blockAt,
    openContainer: async (block) => {
      const key = `${block.position.x},${block.position.y},${block.position.z}`;
      const stored = (contents[key] ??= {});
      const window = {
        closed: false,
        inventoryStart: 27,
        inventoryEnd: 63,
        get slots() {
          const all = Array(63).fill(null);
          for (const stack of stacks()) all[27 + stack.slot - 9] = stack;
          return all;
        },
        containerItems: () =>
          Object.entries(stored)
            .filter(([, count]) => count > 0)
            .map(([name, count]) => ({ name, count, type: registry.itemsByName[name].id })),
        stored,
        close() {
          window.closed = true;
        },
      };
      log.windows.push(window);
      return window;
    },
    // Like mineflayer's transfer: fills matching stacks, then empty slots, and fails when neither has room.
    transfer: async ({ window, itemType, count, sourceStart, sourceEnd, destStart, destEnd }) => {
      assert.deepEqual([sourceStart, sourceEnd, destStart, destEnd], [0, 27, 27, 63]);
      const name = registry.items[itemType].name;
      log.batches.push(count);
      const moving = Math.min(count, window.stored[name] || 0);
      const left = give(name, moving);
      window.stored[name] -= moving - left;
      onTransfer?.();
      if (left) throw new Error('destination full');
    },
    recipesAll: (id, metadata, table) => Recipe.find(id, metadata).filter((recipe) => !recipe.requiresTable || table),
    craft: async (recipe, count, table) => {
      assert.equal(count, 1);
      if (recipe.requiresTable) assert.equal(table?.name, 'crafting_table');
      else assert.equal(table, null);
      const cells = [...(recipe.inShape?.flat() ?? []), ...(recipe.ingredients ?? [])].filter((cell) => cell.id !== -1);
      log.crafts.push({ table: table?.position.toString(), cells: cells.map((cell) => registry.items[cell.id].name) });
      for (const cell of cells) take(registry.items[cell.id].name, 1);
      assert.equal(give(registry.items[recipe.result.id].name, recipe.result.count), 0, 'result had room');
      onCraft?.();
    },
    equip: async (item) => {
      log.equipped.push(item.name);
    },
    placeBlock: async (reference, face) => {
      const at = reference.position.plus(face);
      log.placed.push(at.toString());
      world.set(`${at.x},${at.y},${at.z}`, 'crafting_table');
      take('crafting_table', 1);
    },
    clearControlStates() {},
    deactivateItem() {},
    stopDigging() {},
    quit: () => bot.emit('end', 'Closed'),
  });
  const driver = new MineflayerDriver(bot, { host: 'fixture', port: 25565 }, {}, 'unused');
  t.after(() => driver.close());
  const count = (name) => held(driver.observe().inventory, `minecraft:${name}`);
  return { driver, bot, log, contents, world, slots, count };
}

test('bot withdraw takes from the chest in reach, counted from the window, and reports it with its prior contents', async (t) => {
  const { driver, log, contents, count } = botFixture(t, {
    blocks: { '2,64,0': 'chest' },
    contents: { '2,64,0': { oak_log: 20, cobblestone: 5 } },
  });
  const result = await run(driver, { type: 'withdraw', item: 'oak_log', count: 8 });
  assert.equal(result.message, 'Withdrew 8 oak_log from the chest at 2 64 0.');
  assert.deepEqual(result.container, {
    name: 'minecraft:chest',
    x: 2,
    y: 64,
    z: 0,
    before: [
      { name: 'minecraft:oak_log', count: 20 },
      { name: 'minecraft:cobblestone', count: 5 },
    ],
  });
  assert.deepEqual(log.trips, [], 'opened from where it stood');
  assert.equal(log.windows[0].closed, true);
  assert.deepEqual(contents['2,64,0'], { oak_log: 12, cobblestone: 5 });
  assert.equal(count('oak_log'), 8);
  const [record] = driver.observe().containers;
  assert.deepEqual(record.items, [
    { name: 'minecraft:oak_log', count: 12 },
    { name: 'minecraft:cobblestone', count: 5 },
  ]);
  assert.deepEqual(record.firstSeen, result.container.before);
  assert.deepEqual(record.members, [{ x: 2, y: 64, z: 0 }]);
  assert.equal(record.sources.length, 1);
  // Without a count it takes every matching item, one stack per click sequence.
  contents['2,64,0'].oak_log = 140;
  const all = await run(driver, { type: 'withdraw', item: 'oak_log' });
  assert.equal(all.message, 'Withdrew 140 oak_log from the chest at 2 64 0.');
  assert.deepEqual(log.batches, [8, 64, 64, 12]);
});

test('bot withdraw prefers storage last seen holding the item, then unopened storage, and fails without moving otherwise', async (t) => {
  const { driver, log, contents } = botFixture(t, {
    blocks: { '2,64,0': 'chest', '0,64,6': 'barrel', '-8,64,0': 'chest' },
    contents: { '2,64,0': { dirt: 3 }, '0,64,6': { oak_log: 4 }, '-8,64,0': { oak_log: 30 } },
  });
  // Nothing is known yet: the nearest unopened container is tried and found without logs.
  await assert.rejects(run(driver, { type: 'withdraw', item: 'oak_log', count: 2 }), (error) => {
    assert.match(error.message, /The chest at 2 64 0 holds no oak_log; withdrew 0 of 2 oak_log\./);
    assert.equal(error.container.x, 2);
    return true;
  });
  // The next nearest unopened one is the barrel; withdraw what it has.
  await assert.rejects(
    run(driver, { type: 'withdraw', item: 'oak_log', count: 10 }),
    /The barrel at 0 64 6 held only 4 oak_log; withdrew 4 of 10 oak_log\./,
  );
  // The far chest is the only unopened candidate left; afterwards it is the known source.
  const position = driver.bot.entity.position;
  await run(driver, { type: 'withdraw', item: 'oak_log', count: 5 });
  assert.deepEqual(log.trips.at(-1), { x: -8, y: 64, z: 0 });
  driver.bot.entity.position = position;
  contents['0,64,6'].oak_log = 50; // Restocked out of sight: the barrel's last-seen contents hold no logs.
  await run(driver, { type: 'withdraw', item: 'oak_log', count: 5 });
  assert.equal(log.windows.at(-1).stored, contents['-8,64,0']);
  assert.equal(contents['-8,64,0'].oak_log, 20);
  const trips = log.trips.length;
  const windows = log.windows.length;
  await assert.rejects(
    run(driver, { type: 'withdraw', item: 'sand', count: 1 }),
    /No chest or barrel within 16 blocks is known to hold sand, and none nearby is unopened/,
  );
  assert.equal(log.trips.length, trips);
  assert.equal(log.windows.length, windows);
});

test('bot withdraw stops at the room left, never leaving items on the cursor, and keeps what it moved', async (t) => {
  const items = [['oak_log', 60], ...Array.from({ length: 35 }, () => ['cobblestone', 64])];
  const { driver, log, contents, count } = botFixture(t, {
    blocks: { '2,64,0': 'chest' },
    contents: { '2,64,0': { oak_log: 20 } },
    items,
  });
  await assert.rejects(run(driver, { type: 'withdraw', item: 'oak_log', count: 20 }), (error) => {
    assert.equal(error.message, 'Inventory full; withdrew 4 of 20 oak_log.');
    assert.deepEqual(error.container.before, [{ name: 'minecraft:oak_log', count: 20 }]);
    return true;
  });
  assert.deepEqual(log.batches, [4]);
  assert.equal(contents['2,64,0'].oak_log, 16);
  assert.equal(count('oak_log'), 64);
});

test('handoff between withdraw stacks stops the transfer and closes the chest', async (t) => {
  const controller = new AbortController();
  const { driver, log, contents } = botFixture(t, {
    blocks: { '2,64,0': 'chest' },
    contents: { '2,64,0': { oak_log: 200 } },
    onTransfer: () => controller.abort(new Error('Player took control.')),
  });
  await assert.rejects(
    run(driver, { type: 'withdraw', item: 'oak_log' }, controller.signal),
    (error) => /Player took control/.test(error.message) && error.container?.x === 2,
  );
  await driver.operations.waitForIdle(new AbortController().signal);
  assert.deepEqual(log.batches, [64]);
  assert.equal(contents['2,64,0'].oak_log, 136);
  assert.equal(log.windows[0].closed, true);
});

test('bot crafting uses the 2x2 grid, counts results from the inventory, and checks ingredients first', async (t) => {
  const { driver, log, count } = botFixture(t, { items: [['oak_log', 3]] });
  const result = await run(driver, { type: 'craft', item: 'oak_planks', count: 10 });
  assert.equal(result.message, 'Crafted 12 oak_planks.');
  assert.deepEqual(
    log.crafts.map((craft) => craft.table),
    [null, null, null],
  );
  assert.equal(count('oak_planks'), 12);
  await assert.rejects(
    run(driver, { type: 'craft', item: 'stone_pickaxe', count: 1 }),
    /^Error: Missing ingredients for 1 stone_pickaxe: 3 more of cobblestone\/blackstone\/cobbled_deepslate and 2 more stick\.$/,
  );
  await assert.rejects(
    run(driver, { type: 'craft', item: 'chest', count: 1 }),
    /^Error: Crafting chest needs a crafting table; none is within 16 blocks and none is held\.$/,
  );
  assert.deepEqual(log.trips, []);
  assert.equal(log.crafts.length, 3);
});

test('a mix of plank types fills one crafting table recipe, as the allowlist accepts', async (t) => {
  const { driver, log, count } = botFixture(t, {
    items: [
      ['oak_planks', 2],
      ['birch_planks', 2],
    ],
  });
  assert.equal(
    (await run(driver, { type: 'craft', item: 'crafting_table', count: 1 })).message,
    'Crafted 1 crafting_table.',
  );
  assert.deepEqual(log.crafts[0].cells.sort(), ['birch_planks', 'birch_planks', 'oak_planks', 'oak_planks']);
  assert.equal(count('crafting_table'), 1);
});

test('a table recipe with no table nearby places the held one beside the bot and reuses it', async (t) => {
  const { driver, log, count, world } = botFixture(t, {
    items: [
      ['crafting_table', 1],
      ['cobblestone', 3],
      ['stick', 4],
      ['oak_planks', 3],
    ],
  });
  const progress = [];
  const result = await run(
    driver,
    { type: 'craft', item: 'stone_pickaxe', count: 1 },
    new AbortController().signal,
    progress,
  );
  assert.equal(result.message, 'Placed a crafting table at 1 64 0. Crafted 1 stone_pickaxe.');
  assert.equal(progress[0], 'Placed a crafting table at 1 64 0.');
  assert.deepEqual(log.placed, ['(1, 64, 0)']);
  assert.deepEqual(log.equipped, ['crafting_table']);
  assert.equal(world.get('1,64,0'), 'crafting_table');
  assert.equal(count('crafting_table'), 0);
  assert.equal(log.crafts[0].table, '(1, 64, 0)');
  assert.deepEqual(log.crafts[0].cells.sort(), ['cobblestone', 'cobblestone', 'cobblestone', 'stick', 'stick']);
  assert.ok(driver.observe().blocks.some((block) => block.name === 'minecraft:crafting_table' && block.x === 1));
  assert.equal(
    (await run(driver, { type: 'craft', item: 'wooden_pickaxe', count: 1 })).message,
    'Crafted 1 wooden_pickaxe.',
  );
  assert.deepEqual(log.placed, ['(1, 64, 0)'], 'placed once');
  assert.deepEqual(log.trips, []);
});

test('a crafting table within 16 blocks is walked to without digging, and a blocked spot is skipped when placing', async (t) => {
  const { driver, log } = botFixture(t, {
    blocks: { '8,64,0': 'crafting_table' },
    items: [['oak_planks', 8]],
  });
  assert.equal((await run(driver, { type: 'craft', item: 'chest', count: 1 })).message, 'Crafted 1 chest.');
  assert.deepEqual(log.trips, [{ x: 8, y: 64, z: 0 }]);
  assert.equal(driver.movements.canDig, false);
  assert.equal(log.crafts[0].table, '(8, 64, 0)');
  // The bot stands off-centre against x = 1 and a block occupies z = 1: the table goes west instead.
  const placing = botFixture(t, {
    start: new Vec3(0.8, 64, 0.5),
    blocks: { '0,64,1': 'dirt' },
    items: [
      ['crafting_table', 1],
      ['oak_planks', 8],
    ],
  });
  assert.match(
    (await run(placing.driver, { type: 'craft', item: 'chest', count: 1 })).message,
    /^Placed a crafting table at -1 64 0\./,
  );
});

test('crafting stops between crafts on handoff and when the result would have no room', async (t) => {
  const controller = new AbortController();
  const { driver, log, count } = botFixture(t, {
    items: [['oak_planks', 64]],
    onCraft: () => controller.abort(new Error('Player took control.')),
  });
  await assert.rejects(
    run(driver, { type: 'craft', item: 'stick', count: 64 }, controller.signal),
    /Player took control/,
  );
  await driver.operations.waitForIdle(new AbortController().signal);
  assert.equal(log.crafts.length, 1);
  assert.equal(count('stick'), 4);
  // 36 full slots: a log from a full stack frees nothing, so planks have nowhere to go.
  const full = botFixture(t, {
    items: [['oak_log', 64], ...Array.from({ length: 35 }, () => ['cobblestone', 64])],
  });
  await assert.rejects(
    run(full.driver, { type: 'craft', item: 'oak_planks', count: 4 }),
    /^Error: Inventory full; crafted 0 of 4 oak_planks\.$/,
  );
  assert.equal(full.log.crafts.length, 0);
  // Using up the last log frees its slot for the planks.
  const last = botFixture(t, {
    items: [['oak_log', 1], ...Array.from({ length: 35 }, () => ['cobblestone', 64])],
  });
  assert.equal(
    (await run(last.driver, { type: 'craft', item: 'oak_planks', count: 4 })).message,
    'Crafted 4 oak_planks.',
  );
});
