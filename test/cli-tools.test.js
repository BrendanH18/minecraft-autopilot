import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { projectRoot } from '../src/config.js';
import { inventoryView, nearbyView, homeView, storageView, distanceTo, playerPosition, healthView, itemName } from '../src/cli-views.js';
import { DemoDriver } from '../src/demo-driver.js';
import { Harness } from '../src/harness.js';
import { startBridge } from '../src/bridge-server.js';
import { testDirectory } from './helpers.js';

test('inventory view combines stacks, filters names, and excludes empty slots', () => {
  const state = { inventory: [{ name: 'minecraft:bread', count: 4 }, { name: 'minecraft:bread', count: 2 },
    { name: 'minecraft:dirt', count: 3 }, { name: 'minecraft:sand', count: 0 }] };
  assert.deepEqual(inventoryView(state), { items: [{ name: 'minecraft:bread', count: 6 }, { name: 'minecraft:dirt', count: 3 }], totalItems: 9, occupiedSlots: 3 });
  assert.deepEqual(inventoryView(state, { item: 'bread' }), { items: [{ name: 'minecraft:bread', count: 6 }], totalItems: 6, occupiedSlots: 2 });
  assert.equal(inventoryView(state, { item: 'sand' }).totalItems, 0);
  assert.throws(() => itemName('../bread'));
});

test('spatial views sort and filter observations without modifying state', () => {
  const state = new DemoDriver().observe();
  state.blocks.push({ name: 'minecraft:dirt', x: 1, y: 64, z: 0 });
  state.threats = [{ type: 'minecraft:zombie', distance: 9 }, { type: 'minecraft:creeper', distance: 2 }];
  assert.equal(nearbyView(state, 'blocks', { limit: 1 }).blocks[0].name, 'minecraft:dirt');
  assert.equal(nearbyView(state, 'blocks', { name: 'oak_log' }).blocks.length, 1);
  assert.equal(nearbyView(state, 'blocks', { radius: 1 }).blocks.length, 1);
  assert.deepEqual(nearbyView(state, 'threats', { radius: 3 }).threats, [{ type: 'minecraft:creeper', distance: 2 }]);
  assert.equal(state.blocks[0].distance, undefined);
  assert.equal(storageView(state).containers[0].items, null);
  assert.equal(storageView({}).supported, false);
  assert.deepEqual(homeView(state), { home: null });
  state.home = { x: 3, y: 68, z: 0 };
  assert.equal(homeView(state).distance, 5);
  assert.deepEqual(distanceTo(state, state.home), { target: state.home, distance: 5, horizontalDistance: 3, verticalOffset: 4 });
  assert.equal(healthView(state).hunger, 14);
  assert.throws(() => playerPosition({ connected: false }));
  assert.throws(() => healthView({ connected: false }));
  state.player.position.y = 350;
  assert.equal(playerPosition(state).y, 350);
});

test('all ten CLI tools run against the real demo bridge; observation preserves another lease', { timeout: 30_000 }, async t => {
  const directory = await testDirectory(t, 'cli-tools-');
  const driver = new DemoDriver();
  const harness = new Harness(driver, { leaseMs: 60_000 });
  const discoveryPath = join(directory, 'bridge.json');
  const bridge = await startBridge(harness, { discoveryPath });
  t.after(() => bridge.close());
  const run = async (...args) => {
    const result = await promisify(execFile)(process.execPath, [join(projectRoot, 'src/cli.js'), '--bridge', discoveryPath, ...args], { timeout: 10_000 });
    return JSON.parse(result.stdout);
  };
  const owner = '01234567-0123-4123-8123-0123456789ab';
  harness.acquire(owner);
  assert.equal((await run('inventory', '--item', 'bread')).totalItems, 8);
  assert.equal((await run('blocks', '--name', 'oak_log', '--limit', '1')).blocks.length, 1);
  assert.deepEqual((await run('threats')).threats, []);
  assert.equal((await run('home-info')).home, null);
  assert.equal((await run('storage')).containers[0].items, null);
  assert.equal((await run('distance', '3', '64', '4')).distance, 5);
  assert.equal((await run('position')).dimension, 'minecraft:overworld');
  assert.equal((await run('health')).health, 20);
  assert.equal(harness.owner, owner);
  assert.equal(harness.job, null);
  harness.release();
  assert.equal((await run('inspect-storage')).status, 'completed');
  assert.ok(driver.chest.observedAt);
  assert.equal((await run('wait', '1')).status, 'completed');
  assert.equal(harness.observe().mode, 'manual');
  // The demo chest has not been opened, so a scoped inspection of it fails; malformed positions fail before connecting.
  for (const args of [['wait', '0'], ['wait', '3601'], ['blocks', '--radius', '0'], ['threats', '--limit', '1.2'], ['distance', '0', '321', '0'], ['inventory', '--item', '../bread'],
    ['inspect-storage', '--container', '3,64,3'], ['inspect-storage', '--container', '3,64'], ['inspect-storage', '--container', '3.5,64,3']]) {
    await assert.rejects(run(...args));
    assert.equal(harness.observe().mode, 'manual');
  }
  driver.chest.items = [];
  assert.equal((await run('inspect-storage', '--container', '3,64,3')).message, 'Inspected the requested demo storage.');
});


test('home distances accept observed coordinates outside action bounds', () => {
  const state = new DemoDriver().observe();
  state.player.position = { x: 0, y: 350, z: 0 };
  state.home = { x: 0, y: 350, z: 0 };
  assert.equal(homeView(state).distance, 0);
  state.home.y = 345;
  assert.equal(homeView(state).distance, 5);
  state.home.y = Infinity;
  assert.throws(() => homeView(state), /coordinates/);
});
