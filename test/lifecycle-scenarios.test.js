import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay, setImmediate as nextTurn } from 'node:timers/promises';

const microtasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
import minecraftData from 'minecraft-data';
import recipeLoader from 'prismarine-recipe';
import { Vec3 } from 'vec3';
import { Harness } from '../src/harness.js';
import { DemoDriver } from '../src/demo-driver.js';
import { MineflayerDriver } from '../src/mineflayer-driver.js';
import {
  ACTIVITIES,
  BACKENDS,
  HALTS,
  LIFECYCLE_SCENARIOS,
  TRANSITIONS,
  describeExpectation,
  renderFabricChecklist,
} from '../src/lifecycle-scenarios.js';

const registry = minecraftData('1.21.1');
const { Recipe } = recipeLoader(registry);
const ids = {
  sand: registry.blocksByName.sand.id,
  chest: registry.blocksByName.chest.id,
  log: registry.itemsByName.oak_log.id,
};
const pattern = (source) => new RegExp(source, 'i');

async function until(condition, what, timeoutMs = 5000) {
  for (const end = Date.now() + timeoutMs; !condition(); ) {
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}.`);
    await delay(5);
  }
}

// Each rig drives one real Harness; `observables` are what HALTS compare before and after the transition settles.
const RIGS = {
  demo: {
    activities: new Set(['idle', 'goto', 'collect', 'eat', 'deposit', 'withdraw', 'craft', 'wait']),
    transitions: new Set(['stop', 'cancel', 'expiry', 'death', 'takeover-while-stopping', 'inventory-full']),
    create(t) {
      let clock = 0;
      const driver = new DemoDriver();
      driver.inventory.push({ slot: 1, name: 'minecraft:oak_log', count: 20 });
      const harness = new Harness(driver, { now: () => clock });
      t.after(() => harness.close());
      const count = (name) =>
        driver.inventory.filter((item) => item.name === name).reduce((sum, item) => sum + item.count, 0);
      return {
        harness,
        advance: (ms) => {
          clock += ms;
        },
        async begin(activity, owner) {
          const start = (action) => harness.start(owner, action);
          if (activity === 'goto') {
            start({ type: 'goto', x: 50, y: 64, z: 0 });
            await until(() => driver.player.position.x > 0, 'demo movement');
          }
          // The simulation exposes no progress for these. Two microtask turns start execute() and reach its first
          // timer await; no timer can fire in between, so the job is always inside its 100-200 ms step under load.
          if (activity === 'collect') {
            start({ type: 'collect', block: 'oak_log', count: 4 });
            await microtasks();
          }
          if (activity === 'eat') {
            start({ type: 'eat' });
            await microtasks();
          }
          if (activity === 'deposit') {
            start({ type: 'deposit', item: 'oak_log' });
            await microtasks();
          }
          if (activity === 'withdraw') {
            driver.chest.items = [{ name: 'minecraft:oak_log', count: 192 }];
            start({ type: 'withdraw', item: 'oak_log' });
            await microtasks();
          }
          if (activity === 'craft') {
            start({ type: 'craft', item: 'oak_planks', count: 64 });
            await microtasks();
          }
          if (activity === 'wait') {
            start({ type: 'wait', seconds: 10 });
            await microtasks();
          }
        },
        trigger: {
          death() {
            driver.player.health = 0;
          },
          // Top up the log stack and fill every other main slot while the collection is under way.
          inventoryFull() {
            driver.inventory.find((item) => item.name === 'minecraft:oak_log').count = 64;
            for (let slot = 2; slot < 36; slot++)
              driver.inventory.push({ slot, name: 'minecraft:cobblestone', count: 64 });
          },
        },
        observables: () => ({
          movement: JSON.stringify(driver.player.position),
          mining: count('minecraft:oak_log'),
          consumption: `${count('minecraft:bread')}/${driver.player.hunger}`,
          deposit: JSON.stringify(driver.chest.items),
          withdraw: JSON.stringify(driver.chest.items),
          crafting: `${count('minecraft:oak_planks')}/${count('minecraft:oak_log')}`,
        }),
        pendingNative: () => false,
        async settle() {
          await harness.task;
        },
      };
    },
  },
  mineflayer: {
    activities: new Set(['idle', 'goto', 'collect', 'collect-recovery', 'eat', 'deposit', 'withdraw', 'craft', 'wait']),
    transitions: new Set([
      'stop',
      'cancel',
      'expiry',
      'death',
      'disconnect',
      'dimension',
      'takeover-while-stopping',
      'inventory-full',
    ]),
    create(t, scenario) {
      let clock = 0;
      const activity = scenario.interrupts;
      const bot = new EventEmitter();
      const held = { bread: 4, oak_log: 130, sand: 0 };
      const stored = { oak_log: activity === 'withdraw' ? 200 : 0 };
      const sand = new Vec3(3, 64, 0);
      const chest = new Vec3(2, 64, 2);
      const log = { steps: 0, trips: [], digs: 0, consumed: 0, batches: 0, equips: 0, crafts: 0 };
      let result = null;
      const replies = []; // Native replies (equip, a container opening) the server has not sent yet.
      const later = (value) => new Promise((resolve) => replies.push(() => resolve(value)));
      let movements,
        walking = null,
        digging = null,
        dug = null,
        full = false;
      // Milestones let the test interrupt at an exact point instead of guessing with timers.
      const reached = new EventEmitter();
      const milestone = (name) => once(reached, name, { signal: AbortSignal.timeout(5000) });
      // Like mineflayer-pathfinder: one block per tick toward the goal; clearing the goal rejects the pending goto.
      const walk = (goal) => {
        const target = new Vec3(goal.x, goal.y, goal.z).offset(
          goal.constructor.name === 'GoalGetToBlock' ? -1 : 0,
          0,
          0,
        );
        log.trips.push({ target: target.toString(), canDig: movements.canDig });
        return new Promise((resolve, reject) => {
          let timer;
          walking = (error) => {
            clearInterval(timer);
            walking = null;
            reject(error);
          };
          if (activity === 'collect-recovery') {
            // Mining drops into a pit until the mining deadline; the walk back out then stalls until it is cancelled.
            if (goal.constructor.name === 'GoalGetToBlock') bot.entity.position = new Vec3(3, 61, 0);
            else reached.emit('return');
            return;
          }
          timer = setInterval(() => {
            const at = bot.entity.position;
            if (at.equals(target)) {
              clearInterval(timer);
              walking = null;
              resolve();
              return;
            }
            bot.entity.position = new Vec3(
              at.x + Math.sign(target.x - at.x),
              at.y + Math.sign(target.y - at.y),
              at.z + Math.sign(target.z - at.z),
            );
            log.steps++;
            reached.emit('step');
          }, 10);
        });
      };
      const window = () => ({
        containerItems: () => (stored.oak_log ? [{ name: 'oak_log', count: stored.oak_log, type: ids.log }] : []),
        // The 36 main slots of a chest window follow its 27 container slots.
        inventoryStart: 27,
        inventoryEnd: 63,
        get slots() {
          const slots = Array(63).fill(null);
          bot.inventory.items().forEach((item, index) => {
            slots[27 + index] = item;
          });
          return slots;
        },
        // Clicks move the stack at once; the server confirms a little later.
        deposit: async (_type, _metadata, count) => {
          held.oak_log -= count;
          stored.oak_log += count;
          log.batches++;
          reached.emit('batch');
          await delay(20);
        },
        close() {},
      });
      Object.assign(bot, {
        registry,
        entity: { position: new Vec3(0, 64, 0) },
        entities: {},
        username: 'Scenario',
        player: { uuid: randomUUID() },
        game: { dimension: 'overworld' },
        health: 20,
        food: activity === 'eat' ? 18 : 20,
        inventory: {
          // The player's own window: result slot 0, 2x2 grid 1-4, main slots from 9.
          inventoryStart: 9,
          inventoryEnd: 45,
          selectedItem: null,
          grid: new Map(),
          get slots() {
            const slots = Array(45).fill(null);
            for (const [slot, name] of this.grid) slots[slot] = { name };
            if (this.grid.size) slots[0] = { type: result.id, count: result.count };
            return slots;
          },
          updateSlot(slot) {
            this.grid.delete(slot);
          },
          findInventoryItem(id) {
            return held[registry.items[id].name] > 0 ? { type: id, slot: 9 } : null;
          },
          items() {
            const stacks = Object.entries(held)
              .filter(([, count]) => count > 0)
              .map(([name, count], index) => ({ name, count, slot: 36 + index, type: registry.itemsByName[name].id }));
            // Full: cobblestone stacks take every other main slot, so nothing of the target fits.
            while (full && stacks.length < 36)
              stacks.push({
                name: 'cobblestone',
                count: 64,
                slot: stacks.length - 3,
                type: registry.itemsByName.cobblestone.id,
              });
            return stacks;
          },
          emptySlotCount() {
            return 36 - this.items().length;
          },
        },
        pathfinder: {
          thinkTimeout: 5000,
          bestHarvestTool: () => null,
          goto: walk,
          setMovements(value) {
            movements = value;
          },
          setGoal(goal) {
            if (goal === null) walking?.(new Error('The goal was changed before it could be completed!'));
          },
        },
        findBlocks: ({ matching }) => [
          ...([matching].flat().includes(ids.sand) ? [sand] : []),
          ...([matching].flat().includes(ids.chest) ? [chest] : []),
        ],
        blockAt: (position) =>
          position.equals(sand)
            ? { type: ids.sand, name: 'sand', position, boundingBox: 'block' }
            : position.equals(chest)
              ? {
                  type: ids.chest,
                  name: 'chest',
                  position,
                  boundingBox: 'block',
                  getProperties: () => ({ facing: 'west', type: 'single' }),
                }
              : { type: 0, name: 'air', position, boundingBox: 'empty' },
        canDigBlock: () => true,
        dig: () => {
          log.digs++;
          reached.emit('dig');
          return new Promise((resolve, reject) => {
            digging = reject;
            dug = resolve;
          });
        },
        stopDigging() {
          digging?.(new Error('Digging aborted'));
          digging = null;
        },
        equip: () => {
          log.equips++;
          reached.emit('equip');
          return later();
        },
        consume: async () => {
          log.consumed++;
          held.bread--;
          bot.food = 20;
        },
        // A withdrawal click sequence: the stack moves at once and the server confirms a little later.
        transfer: async ({ count }) => {
          stored.oak_log -= count;
          held.oak_log += count;
          log.batches++;
          reached.emit('batch');
          await delay(20);
        },
        recipesAll: (id, metadata, table) => {
          // The allowlisted recipe yields the most (minecraft-data also lists single-item variants).
          result = Recipe.find(id, metadata)
            .map((recipe) => recipe.result)
            .reduce((best, next) => (next.count > best.count ? next : best));
          return Recipe.find(id, metadata).filter((recipe) => !recipe.requiresTable || table);
        },
        // Clicks fill the 2x2 grid one ingredient at a time; a shift-click moves a grid item back.
        clickWindow: async (slot, _button, mode) => {
          const grid = bot.inventory.grid;
          if (mode === 1) {
            held[grid.get(slot)]++;
            grid.delete(slot);
          } else if (slot >= bot.inventory.inventoryStart) {
            bot.inventory.selectedItem = { type: ids.log };
          } else {
            const name = registry.items[bot.inventory.selectedItem.type].name;
            held[name]--;
            grid.set(slot, name);
          }
        },
        putSelectedItemRange: async () => {
          bot.inventory.selectedItem = null;
        },
        // Taking the result finishes one craft; a stopped craft keeps waiting until the server answers.
        putAway: () => {
          bot.inventory.grid.clear();
          const output = registry.items[result.id].name;
          held[output] = (held[output] || 0) + result.count;
          log.crafts++;
          reached.emit('craft');
          return scenario.transition === 'takeover-while-stopping' ? later() : delay(20);
        },
        openContainer: () => {
          reached.emit('open');
          return scenario.transition === 'takeover-while-stopping' ? later(window()) : Promise.resolve(window());
        },
        setControlState() {},
        clearControlStates() {},
        deactivateItem() {},
        quit: () => bot.emit('end', 'Closed'),
      });
      const driver = new MineflayerDriver(bot, { host: 'fixture', port: 25565 }, {}, 'unused');
      const harness = new Harness(driver, {
        now: () => clock,
        jobTimeoutMs: activity === 'collect-recovery' ? 100 : 180_000,
      });
      t.after(async () => {
        replies.splice(0).forEach((reply) => reply());
        await harness.close();
      });
      return {
        harness,
        advance: (ms) => {
          clock += ms;
        },
        async begin(name, owner) {
          const at = {
            goto: 'step',
            collect: 'dig',
            'collect-recovery': 'return',
            eat: 'equip',
            deposit: scenario.transition === 'takeover-while-stopping' ? 'open' : 'batch',
            withdraw: scenario.transition === 'takeover-while-stopping' ? 'open' : 'batch',
            craft: 'craft',
          }[name];
          const point = at && milestone(at);
          if (name === 'goto') harness.start(owner, { type: 'goto', x: 50, y: 64, z: 0 });
          if (name === 'collect' || name === 'collect-recovery')
            harness.start(owner, { type: 'collect', block: 'sand', count: 2 });
          if (name === 'eat') harness.start(owner, { type: 'eat' });
          if (name === 'deposit') harness.start(owner, { type: 'deposit', item: 'oak_log' });
          if (name === 'withdraw') harness.start(owner, { type: 'withdraw', item: 'oak_log' });
          if (name === 'craft') harness.start(owner, { type: 'craft', item: 'oak_planks', count: 64 });
          if (name === 'wait') {
            harness.start(owner, { type: 'wait', seconds: 10 });
            await nextTurn();
          }
          await point;
          if (name === 'collect-recovery') assert.match(harness.job.message, /returning to where collection started/);
        },
        trigger: {
          death() {
            bot.health = 0;
            bot.emit('death');
          },
          disconnect() {
            bot.emit('end', 'socketClosed');
          },
          dimension() {
            bot.game.dimension = 'the_nether';
            bot.emit('game');
          },
          // The block breaks, but its drop finds no room: the rest of the inventory filled during the dig.
          inventoryFull() {
            full = true;
            dug?.();
            digging = dug = null;
          },
        },
        observables: () => ({
          movement: `${bot.entity.position}/${log.steps}/${log.trips.length}`,
          mining: `${log.digs}/${held.sand}/${log.trips.filter((trip) => trip.canDig).length}`,
          consumption: `${log.consumed}/${held.bread}`,
          deposit: `${log.batches}/${stored.oak_log}`,
          withdraw: `${log.batches}/${stored.oak_log}`,
          crafting: `${log.crafts}/${held.oak_planks || 0}/${held.oak_log}`,
        }),
        pendingNative: () => replies.length > 0,
        async settle() {
          replies.splice(0).forEach((reply) => reply());
          await harness.task;
          await until(() => !driver.isBusy(), 'native work to settle');
        },
      };
    },
  },
};

// Transitions the test triggers synchronously return nothing, so the stopping window is checked before any await.
const harnessNotices = (rig) => until(() => rig.harness.owner === null, 'the Harness tick to release control');
const TRIGGERS = {
  stop: (rig) => {
    rig.harness.request('/v1/stop');
  },
  'takeover-while-stopping': (rig) => {
    rig.harness.request('/v1/stop');
  },
  cancel: (rig, owner) => {
    rig.harness.request('/v1/cancel', { leaseId: owner });
  },
  expiry: (rig) => {
    rig.advance(rig.harness.leaseMs);
    return harnessNotices(rig);
  },
  death: (rig) => {
    rig.trigger.death();
    return harnessNotices(rig);
  },
  disconnect: (rig) => {
    rig.trigger.disconnect();
    return harnessNotices(rig);
  },
  dimension: (rig) => {
    rig.trigger.dimension();
    return harnessNotices(rig);
  },
  // No collection deadline is shortened here, so the job must end promptly on its own.
  'inventory-full': (rig) => {
    rig.trigger.inventoryFull();
    return until(() => rig.harness.job?.status !== 'running', 'collection to stop on the full inventory');
  },
};

function refusedAsStopping(rig) {
  assert.equal(rig.harness.observe().stopping, true, 'observe() reports stopping');
  assert.throws(() => rig.harness.acquire(randomUUID()), /still stopping/);
}

async function runScenario(t, scenario, backend) {
  const rig = RIGS[backend].create(t, scenario);
  const owner = randomUUID();
  rig.harness.acquire(owner);
  await rig.begin(scenario.interrupts, owner);
  if (scenario.interrupts !== 'idle')
    assert.equal(rig.harness.job?.status, 'running', 'the activity is in progress when interrupted');
  const noticed = TRIGGERS[scenario.transition](rig, owner);
  if (scenario.expect.stoppingWindow) refusedAsStopping(rig);
  await noticed;
  const atTransition = rig.observables();
  if (scenario.expect.stoppingWindow) {
    await rig.harness.task;
    // Native work (an inventory reply, a container opening) can outlast the job itself.
    if (rig.pendingNative()) refusedAsStopping(rig);
  }
  await rig.settle();
  await delay(60); // Several walk/dig/deposit ticks: anything still running would show.
  rig.harness.tick();
  const state = rig.harness.observe();
  return { rig, owner, state, atTransition, after: rig.observables() };
}

// Backend divergences the scenarios exposed and that have since been fixed stay strict like every other case.
const KNOWN = {};

function assertJob(state, expected) {
  if (!expected) return assert.equal(state.job, null);
  assert.equal(state.job?.status, expected.status);
  assert.match(state.job.message, pattern(expected.message));
}

// Scenarios are independent rigs; running them concurrently keeps the Harness tick waits from adding up.
describe('shared lifecycle scenarios', { concurrency: true }, () => {
  for (const scenario of LIFECYCLE_SCENARIOS) {
    for (const backend of scenario.automated) {
      const key = `${scenario.id}/${backend}`;
      test(`${key}: ${describeExpectation(scenario.expect).join('; ')}`, async (t) => {
        const { rig, owner, state, atTransition, after } = await runScenario(t, scenario, backend);
        const { expect } = scenario;
        assert.equal(state.mode, expect.mode);
        assert.equal(state.stopping, false, 'settled');
        if (!KNOWN[key]) assertJob(state, expect.job);
        else
          assert.ok(
            state.job && !['running', 'completed'].includes(state.job.status),
            'the job still ends unsuccessfully',
          );
        for (const halt of expect.halts) assert.equal(after[halt], atTransition[halt], `${HALTS[halt].text} (${halt})`);
        if (expect.mode === 'manual') {
          assert.throws(() => rig.harness.heartbeat(owner), /released or expired/);
          assert.throws(() => rig.harness.start(owner, { type: 'wait', seconds: 1 }), /released or expired/);
        } else rig.harness.heartbeat(owner);
        if (expect.next.refused) assert.throws(() => rig.harness.acquire(randomUUID()), pattern(expect.next.refused));
        else if (expect.next.lease === 'same') {
          rig.harness.start(owner, { type: 'wait', seconds: 1 });
          rig.harness.cancel();
          await rig.harness.task;
        } else {
          rig.harness.acquire(randomUUID());
          assert.equal(rig.harness.observe().mode, 'agent');
        }
        if (KNOWN[key])
          await t.test('job matches the shared expectation', { todo: KNOWN[key] }, () => assertJob(state, expect.job));
      });
    }
  }
});

test('the scenario table assigns every backend, names gaps, and only claims what a rig can drive', () => {
  assert.equal(
    new Set(LIFECYCLE_SCENARIOS.map((scenario) => scenario.id)).size,
    LIFECYCLE_SCENARIOS.length,
    'unique ids',
  );
  for (const scenario of LIFECYCLE_SCENARIOS) {
    const { id, automated, manual, gaps = {}, expect } = scenario;
    assert.ok(TRANSITIONS[scenario.transition] && ACTIVITIES[scenario.interrupts], id);
    const assigned = [...automated, ...manual, ...Object.keys(gaps)];
    assert.deepEqual(
      [...assigned].sort(),
      [...BACKENDS].sort(),
      `${id}: each backend is automated, manual, or a named gap exactly once`,
    );
    for (const reason of Object.values(gaps))
      assert.ok(typeof reason === 'string' && reason.length > 20, `${id}: gap reasons explain why`);
    assert.ok(!manual.some((backend) => backend !== 'fabric'), `${id}: only Fabric is manual`);
    if (['f8', 'menu'].includes(scenario.transition))
      assert.deepEqual(automated, [], `${id}: player input exists only on Fabric`);
    for (const backend of automated) {
      assert.ok(
        RIGS[backend].activities.has(scenario.interrupts) && RIGS[backend].transitions.has(scenario.transition),
        `${id}: the ${backend} rig can drive it`,
      );
    }
    if (manual.includes('fabric'))
      for (const field of ['setup', 'action', 'observe']) assert.ok(scenario.fabric?.[field], `${id}: Fabric ${field}`);
    assert.ok(
      ['manual', 'agent'].includes(expect.mode) && expect.halts.length && expect.halts.every((halt) => HALTS[halt]),
      id,
    );
    if (expect.job) new RegExp(expect.job.message, 'i');
  }
  for (const name of [...Object.keys(TRANSITIONS), ...Object.keys(ACTIVITIES)]) {
    assert.ok(
      LIFECYCLE_SCENARIOS.some((scenario) => scenario.transition === name || scenario.interrupts === name),
      `${name} is covered`,
    );
  }
  const has = (transition, interrupts) =>
    LIFECYCLE_SCENARIOS.some((scenario) => scenario.transition === transition && scenario.interrupts === interrupts);
  assert.ok(has('stop', 'collect-recovery') && has('cancel', 'eat') && has('takeover-while-stopping', 'eat'));
  assert.ok(Object.isFrozen(LIFECYCLE_SCENARIOS) && Object.isFrozen(LIFECYCLE_SCENARIOS[0].expect.halts));
});

test('the Fabric checklist numbers every manual Fabric scenario in table order', () => {
  const checklist = renderFabricChecklist();
  assert.equal(checklist, renderFabricChecklist(LIFECYCLE_SCENARIOS), 'stable');
  const manual = LIFECYCLE_SCENARIOS.filter((scenario) => scenario.manual.includes('fabric'));
  const items = [...checklist.matchAll(/^(\d+)\. \*\*.*?\*\* \(`([^`]+)`/gm)];
  assert.deepEqual(
    items.map(([, number]) => Number(number)),
    manual.map((_, index) => index + 1),
  );
  assert.deepEqual(
    items.map(([, , id]) => id),
    manual.map((scenario) => scenario.id),
  );
  for (const scenario of manual) {
    const block = checklist.split(/^\d+\. /m).find((entry) => entry.includes(`(\`${scenario.id}\``));
    for (const label of ['Setup', 'Action', 'Expected', 'Observe'])
      assert.match(block, new RegExp(`^    - ${label}: \\S`, 'm'), `${scenario.id} ${label}`);
    if (scenario.expect.job)
      assert.ok(block.includes(`/${scenario.expect.job.message}/i`), `${scenario.id} message pattern`);
  }
  for (const scenario of LIFECYCLE_SCENARIOS.filter((entry) => entry.gaps?.fabric))
    assert.ok(checklist.includes(`- \`${scenario.id}\`: ${scenario.gaps.fabric}`));
  assert.equal(renderFabricChecklist([]), '');
});

test('docs/LIFECYCLE-SCENARIOS.md contains the generated Fabric checklist unchanged', async () => {
  const doc = await readFile(new URL('../docs/LIFECYCLE-SCENARIOS.md', import.meta.url), 'utf8');
  const section = doc.match(/<!-- fabric-checklist:start -->\n\n([\s\S]*)\n<!-- fabric-checklist:end -->/);
  assert.ok(section, 'checklist markers present');
  assert.equal(
    section[1],
    renderFabricChecklist(),
    'regenerate the section with renderFabricChecklist() after changing src/lifecycle-scenarios.js',
  );
});
