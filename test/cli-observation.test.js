import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { projectRoot } from '../src/config.js';
import {
  summaryView,
  jobView,
  findItemView,
  storageTotalsView,
  nearestView,
  directionView,
  foodView,
  freeSlotsView,
  maxStackSize,
  snapshotView,
  parseSnapshot,
  compareView,
  uniqueContainers,
} from '../src/cli-views.js';
import { DemoDriver } from '../src/demo-driver.js';
import { Harness } from '../src/harness.js';
import { startBridge } from '../src/bridge-server.js';
import { testDirectory } from './helpers.js';

const demoState = () => ({ protocol: 1, ...new DemoDriver().observe(), mode: 'manual', stopping: false, job: null });

test('summary and job views report a compact control overview', () => {
  const state = demoState();
  state.home = { x: 3, y: 68, z: 0 };
  state.threats = [{ type: 'minecraft:zombie', distance: 9 }];
  state.job = { id: 'job-1', type: 'goto', status: 'running', message: 'Moving: 20%', extra: true };
  assert.deepEqual(summaryView(state), {
    position: { x: 0, y: 64, z: 0 },
    dimension: 'minecraft:overworld',
    health: 20,
    hunger: 14,
    mode: 'manual',
    job: { type: 'goto', status: 'running' },
    homeDistance: 5,
    threats: 1,
    totalItems: 8,
    occupiedSlots: 1,
  });
  assert.equal(summaryView({ ...state, home: null, threats: undefined, job: null }).homeDistance, null);
  assert.equal(summaryView({ ...state, threats: undefined }).threats, null);
  assert.deepEqual(jobView(state), {
    mode: 'manual',
    stopping: false,
    job: { id: 'job-1', type: 'goto', status: 'running', message: 'Moving: 20%' },
  });
  assert.deepEqual(jobView({ mode: 'agent', stopping: true, job: null }), { mode: 'agent', stopping: true, job: null });
  assert.throws(() => summaryView({ connected: false }), /Enter a world/);
});

test('find-item and storage-totals use deduplicated last observations and never count unopened storage', () => {
  const state = demoState();
  state.inventory.push({ slot: 1, name: 'minecraft:oak_log', count: 3 });
  state.containers = [
    { name: 'minecraft:chest', x: 3, y: 64, z: 4, items: [{ name: 'minecraft:oak_log', count: 10 }], observedAt: 1 },
    {
      name: 'minecraft:chest',
      x: 3,
      y: 64,
      z: 4,
      items: [
        { name: 'minecraft:oak_log', count: 12 },
        { name: 'minecraft:dirt', count: 12 },
      ],
      observedAt: 2,
    },
    {
      name: 'minecraft:barrel',
      x: 0,
      y: 64,
      z: 1,
      items: [
        { name: 'minecraft:oak_log', count: 1 },
        { name: 'minecraft:sand', count: 0 },
      ],
    },
    { name: 'minecraft:barrel', x: 9, y: 64, z: 9, items: null },
    { name: 'minecraft:barrel', x: 0, y: 64, z: 1, items: null },
  ];
  assert.equal(uniqueContainers(state.containers).length, 3);
  const found = findItemView(state, 'oak_log');
  assert.deepEqual(found, {
    item: 'minecraft:oak_log',
    inventory: 3,
    stored: 13,
    total: 16,
    supported: true,
    unopened: 1,
    contents: 'last_observed',
    containers: [
      { name: 'minecraft:barrel', x: 0, y: 64, z: 1, count: 1, distance: 1 },
      { name: 'minecraft:chest', x: 3, y: 64, z: 4, count: 12, distance: 5 },
    ],
  });
  assert.equal(findItemView(state, 'minecraft:diamond').total, 0);
  assert.equal(findItemView({ ...state, containers: undefined }, 'bread').supported, false);
  assert.throws(() => findItemView(state, '../log'), /item or block name/);
  assert.deepEqual(storageTotalsView(state), {
    supported: true,
    totalItems: 25,
    containersObserved: 2,
    unopened: 1,
    contents: 'last_observed',
    items: [
      { name: 'minecraft:oak_log', count: 13 },
      { name: 'minecraft:dirt', count: 12 },
    ],
  });
  assert.deepEqual(storageTotalsView(state, { item: 'dirt' }).items, [{ name: 'minecraft:dirt', count: 12 }]);
  assert.equal(storageTotalsView({}).supported, false);
  assert.equal(storageTotalsView(demoState()).unopened, 1);
});

test('direction uses Minecraft compass, yaw, and pitch conventions', () => {
  const state = demoState();
  const at = (x, y, z) => directionView(state, { x, y, z });
  assert.deepEqual([at(0, 64, 5).compass, at(0, 64, 5).yaw], ['south', 0]);
  assert.deepEqual([at(-5, 64, 0).compass, at(-5, 64, 0).yaw], ['west', 90]);
  assert.deepEqual([at(0, 64, -5).compass, at(0, 64, -5).yaw], ['north', 180]);
  assert.deepEqual([at(5, 64, 0).compass, at(5, 64, 0).yaw], ['east', -90]);
  assert.deepEqual([at(5, 64, -5).compass, at(-5, 64, 5).compass], ['northeast', 'southwest']);
  assert.equal(at(3, 68, 0).distance, 5);
  assert.equal(at(1, 65, 0).pitch, -45);
  assert.equal(at(1, 63, 0).pitch, 45);
  assert.deepEqual([at(0, 70, 0).compass, at(0, 70, 0).yaw, at(0, 70, 0).pitch], [null, null, -90]);
  assert.equal(at(0, 64, 0).pitch, null);
  assert.deepEqual(nearestView(state, 'oak_log'), { name: 'minecraft:oak_log', found: true, ...at(5, 64, 5) });
  assert.equal(nearestView(state, 'oak_log').compass, 'southeast');
  assert.equal(nearestView(state, 'diamond_ore').found, false);
  assert.throws(() => nearestView({ connected: false }, 'oak_log'), /Enter a world/);
});

test('food and free-slot views estimate restorable hunger and storage room', () => {
  const state = demoState();
  state.inventory.push(
    { slot: 1, name: 'minecraft:cooked_beef', count: 2 },
    { slot: 2, name: 'minecraft:rotten_flesh', count: 5 },
    { slot: 3, name: 'minecraft:ender_pearl', count: 10 },
    { slot: 4, name: 'minecraft:oak_log', count: 60 },
    { slot: 5, name: 'minecraft:oak_log', count: 0 },
  );
  assert.deepEqual(foodView(state), {
    hunger: 14,
    missingHunger: 6,
    totalHunger: 56,
    items: [
      { name: 'minecraft:bread', count: 8, hungerEach: 5, hungerTotal: 40 },
      { name: 'minecraft:cooked_beef', count: 2, hungerEach: 8, hungerTotal: 16 },
    ],
  });
  assert.equal(foodView({ ...state, player: { ...state.player, hunger: undefined } }).missingHunger, null);
  assert.deepEqual(freeSlotsView(state), { slots: 36, used: 5, free: 31 });
  assert.deepEqual(freeSlotsView(state, { item: 'oak_log' }), {
    slots: 36,
    used: 5,
    free: 31,
    item: 'minecraft:oak_log',
    maxStack: 64,
    stackSizeAssumed: false,
    room: 31 * 64 + 4,
  });
  assert.equal(freeSlotsView(state, { item: 'ender_pearl' }).room, 31 * 16 + 6);
  assert.equal(freeSlotsView(state, { item: 'diamond_sword' }).room, 31);
  assert.deepEqual(maxStackSize('water_bucket'), { maxStack: 1, stackSizeAssumed: false });
  assert.deepEqual(maxStackSize('bucket'), { maxStack: 16, stackSizeAssumed: false });
  assert.deepEqual(maxStackSize('oak_sign'), { maxStack: 16, stackSizeAssumed: false });
  assert.deepEqual(maxStackSize('mystery_block'), { maxStack: 64, stackSizeAssumed: true });
  state.inventory = Array.from({ length: 40 }, (_, slot) => ({ slot, name: 'minecraft:dirt', count: 64 }));
  assert.deepEqual(freeSlotsView(state, { item: 'dirt' }), {
    slots: 36,
    used: 36,
    free: 0,
    item: 'minecraft:dirt',
    maxStack: 64,
    stackSizeAssumed: false,
    room: 0,
  });
});

test('snapshots strip control and secrets; compare reports deltas and rejects invalid files', () => {
  const state = demoState();
  state.job = { id: 'job-1', type: 'wait', status: 'running' };
  state.player.authToken = 'secret';
  state.leaseId = 'abc';
  const snapshot = snapshotView(state, new Date('2026-01-01T00:00:00Z'));
  assert.equal(snapshot.savedAt, '2026-01-01T00:00:00.000Z');
  assert.equal(snapshot.job, undefined);
  assert.doesNotMatch(JSON.stringify(snapshot), /secret|abc|leaseId|stopping/);
  const saved = parseSnapshot(JSON.stringify(snapshot));
  const now = demoState();
  now.player.position = { x: 3, y: 68, z: 0 };
  now.player.health = 15;
  now.player.hunger = 20;
  now.player.dimension = 'minecraft:the_nether';
  now.home = { x: 0, y: 64, z: 0 };
  now.inventory = [
    { slot: 0, name: 'minecraft:bread', count: 7 },
    { slot: 1, name: 'minecraft:bread', count: 1 },
    { slot: 2, name: 'minecraft:dirt', count: 4 },
  ];
  assert.deepEqual(compareView(saved, now, new Date('2026-01-01T00:01:30Z')), {
    savedAt: '2026-01-01T00:00:00.000Z',
    elapsedSeconds: 90,
    position: { from: { x: 0, y: 64, z: 0 }, to: { x: 3, y: 68, z: 0 }, delta: { x: 3, y: 4, z: 0 }, distanceMoved: 5 },
    dimensionChanged: true,
    health: { from: 20, to: 15, delta: -5 },
    hunger: { from: 14, to: 20, delta: 6 },
    homeChanged: true,
    inventory: [{ name: 'minecraft:dirt', from: 0, to: 4, delta: 4 }],
  });
  assert.equal(compareView(saved, demoState()).homeChanged, false);
  assert.deepEqual(compareView(saved, demoState()).inventory, []);
  assert.throws(() => parseSnapshot('{'), /not valid JSON/);
  assert.throws(() => parseSnapshot('{"savedAt":"yesterday"}'), /not a valid mc-agent snapshot \(savedAt/);
  assert.throws(() => compareView({ savedAt: snapshot.savedAt, player: {} }, now), /player\.position/);
  assert.throws(() => snapshotView({ connected: false }), /Enter a world/);
});

test('all ten observation commands run against the real demo bridge and preserve another lease', {
  timeout: 60_000,
}, async (t) => {
  const directory = await testDirectory(t, 'cli-observation-');
  const driver = new DemoDriver();
  const harness = new Harness(driver, { leaseMs: 60_000 });
  const discoveryPath = join(directory, 'bridge.json');
  const bridge = await startBridge(harness, { discoveryPath });
  t.after(() => bridge.close());
  const exec = (...args) =>
    promisify(execFile)(process.execPath, [join(projectRoot, 'src/cli.js'), '--bridge', discoveryPath, ...args], {
      timeout: 10_000,
    });
  const run = async (...args) => JSON.parse((await exec(...args)).stdout);
  const owner = '01234567-0123-4123-8123-0123456789ab';
  harness.acquire(owner);
  driver.chest.items = [{ name: 'minecraft:oak_log', count: 5 }];
  const file = join(directory, 'before.json');
  assert.equal((await run('snapshot', file)).file, file);
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  assert.equal(JSON.parse(await readFile(file, 'utf8')).job, undefined);
  driver.player.position.x = 3;
  driver.inventory[0].count = 6;
  const summary = await run('summary');
  assert.deepEqual([summary.mode, summary.totalItems, summary.homeDistance, summary.threats], ['agent', 6, null, 0]);
  assert.deepEqual(await run('job'), { mode: 'agent', stopping: false, job: null });
  const found = await run('find-item', 'oak_log');
  assert.deepEqual([found.total, found.containers[0].count, found.unopened], [5, 5, 0]);
  assert.deepEqual((await run('storage-totals', '--item', 'oak_log')).items, [{ name: 'minecraft:oak_log', count: 5 }]);
  assert.equal((await run('nearest', 'oak_log')).compass, 'south');
  assert.equal((await run('nearest', 'diamond_ore')).found, false);
  assert.deepEqual(
    [(await run('direction', '3', '64', '-5')).compass, (await run('direction', '3', '64', '-5')).yaw],
    ['north', 180],
  );
  assert.equal((await run('food')).totalHunger, 30);
  assert.equal((await run('free-slots', '--item', 'bread')).room, 35 * 64 + 58);
  const comparison = await run('compare', file);
  assert.deepEqual(
    [comparison.position.distanceMoved, comparison.inventory],
    [3, [{ name: 'minecraft:bread', from: 8, to: 6, delta: -2 }]],
  );
  assert.equal(harness.owner, owner);
  assert.equal(harness.job, null);
  await assert.rejects(exec('snapshot', file), /already exists; pass --force/);
  assert.ok((await run('snapshot', file, '--force')).savedAt);
  const invalid = join(directory, 'invalid.json');
  await writeFile(invalid, '{"savedAt":1}');
  await assert.rejects(exec('compare', invalid), /not a valid mc-agent snapshot/);
  await assert.rejects(exec('compare', join(directory, 'missing.json')), /Cannot read snapshot .*ENOENT/);
  for (const args of [
    ['find-item', '../log'],
    ['nearest', 'Oak Log'],
    ['direction', '0', '321', '0'],
    ['direction', '0', '64'],
    ['storage-totals', '--item', '../x'],
    ['free-slots', '--item', 'a:b:c'],
    ['snapshot'],
    ['compare'],
  ]) {
    await assert.rejects(exec(...args));
  }
  assert.equal(harness.owner, owner);
  assert.equal(harness.observe().mode, 'agent');
});
