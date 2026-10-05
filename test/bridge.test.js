import test from 'node:test';
import assert from 'node:assert/strict';
import { rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Harness } from '../src/harness.js';
import { DemoDriver } from '../src/demo-driver.js';
import { startBridge } from '../src/bridge-server.js';
import { FabricAdapter } from '../src/fabric-adapter.js';
import { testDirectory } from './helpers.js';

async function fixture(t) {
  const directory = await testDirectory(t, 'bridge-');
  const discoveryPath = join(directory, 'bridge.json');
  const driver = new DemoDriver();
  const harness = new Harness(driver);
  const bridge = await startBridge(harness, { discoveryPath });
  const adapter = await FabricAdapter.connect(discoveryPath);
  t.after(async () => { await adapter.close(); await bridge.close(); await rm(directory, { recursive: true, force: true }); });
  return { bridge, adapter, driver, harness, discoveryPath };
}

test('bridge rejects missing credentials, browser origins, wrong methods, and oversized requests', async t => {
  const { bridge, discoveryPath } = await fixture(t);
  const url = bridge.config.url;
  assert.equal((await stat(discoveryPath)).mode & 0o777, 0o600);
  assert.equal((await fetch(`${url}/v1/state`)).status, 401);
  const headers = { Authorization: `Bearer ${bridge.config.token}` };
  assert.equal((await fetch(`${url}/v1/state`, { headers: { ...headers, Origin: 'https://example.com' } })).status, 403);
  assert.equal((await fetch(`${url}/v1/actions`, { headers })).status, 405);
  assert.equal((await fetch(`${url}/v1/actions`, { method: 'POST', headers, body: 'x'.repeat(9000) })).status, 413);
});

test('adapter performs a round trip, additional collection, eating, and manual handoff', async t => {
  const { adapter } = await fixture(t);
  await adapter.execute({ type: 'set_home' });
  await adapter.execute({ type: 'goto', x: 5, y: 64, z: 5 });
  await adapter.execute({ type: 'collect', block: 'oak_log', count: 8 });
  await adapter.execute({ type: 'collect', block: 'oak_log', count: 2 });
  await adapter.execute({ type: 'eat' });
  await adapter.execute({ type: 'home' });
  await adapter.release();
  const state = await adapter.observe();
  assert.equal(state.mode, 'manual');
  assert.deepEqual(state.player.position, state.home);
  assert.equal(state.player.hunger, 20);
  assert.equal(state.inventory.find(item => item.name === 'minecraft:oak_log').count, 10);
});

test('a second process can stop the owner and the owner cannot resume', async t => {
  const { adapter, bridge, harness } = await fixture(t);
  const second = new FabricAdapter(bridge.config);
  const executing = adapter.execute({ type: 'wait', seconds: 30 });
  await new Promise(resolve => {
    const timer = setInterval(() => { if (harness.job) { clearInterval(timer); resolve(); } }, 10);
  });
  await second.emergencyStop();
  await assert.rejects(executing, /stop|cancelled|released/i);
  await assert.rejects(adapter.execute({ type: 'eat' }), /released or expired|control/i);
  assert.equal((await adapter.observe()).mode, 'manual');
});

test('closing during a slow takeover releases the late lease without starting a heartbeat', async t => {
  const { adapter, harness } = await fixture(t);
  const request = adapter.request.bind(adapter);
  let acquired;
  const ready = new Promise(resolve => { acquired = resolve; });
  let reply;
  const response = new Promise(resolve => { reply = resolve; });
  adapter.request = async (path, body, signal) => {
    const result = await request(path, body, signal);
    if (body?.action === 'acquire') { acquired(); await response; }
    return result;
  };
  const rejected = assert.rejects(adapter.acquire(), /cancelled/);
  await ready;
  assert.equal(harness.observe().mode, 'agent');
  const closing = adapter.close();
  reply();
  await Promise.all([rejected, closing]);
  assert.equal(adapter.leaseId, null);
  assert.equal(adapter.timer, null);
  assert.equal(harness.observe().mode, 'manual');
  await assert.rejects(adapter.acquire(), /closed/);
});

test('closing an adapter interrupts its action and rejects overlapping submissions', async t => {
  const { adapter, harness } = await fixture(t);
  let running;
  const started = new Promise(resolve => { running = resolve; });
  const rejected = assert.rejects(adapter.execute({ type: 'wait', seconds: 30 }, {
    onProgress: () => running(),
  }), /released/);
  await started;
  await assert.rejects(adapter.execute({ type: 'eat' }), /already running/);
  await adapter.close();
  await rejected;
  assert.equal(harness.observe().mode, 'manual');
  assert.equal(harness.observe().job.status, 'cancelled');
});
