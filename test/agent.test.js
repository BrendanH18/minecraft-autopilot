import test from 'node:test';
import assert from 'node:assert/strict';
import { runAgent } from '../src/agent.js';
import { join } from 'node:path';
import { Harness } from '../src/harness.js';
import { DemoDriver } from '../src/demo-driver.js';
import { startBridge } from '../src/bridge-server.js';
import { FabricAdapter } from '../src/fabric-adapter.js';
import { testDirectory } from './helpers.js';

function fakeAdapter() {
  return {
    state: { connected: true, mode: 'manual', player: { health: 20 }, inventory: [] },
    actions: [], releases: 0,
    async observe() { return structuredClone(this.state); },
    async acquire() { this.state.mode = 'agent'; },
    async execute(action) { this.actions.push(action); return { status: 'completed' }; },
    async release() { this.releases++; this.state.mode = 'manual'; },
  };
}
const reply = decision => new Response(JSON.stringify({ message: { content: JSON.stringify(decision) } }), { status: 200 });

test('local planner executes structured actions and releases control', async () => {
  const adapter = fakeAdapter();
  const decisions = [{ type: 'eat' }, { type: 'done', reason: 'Observed hunger satisfied.' }];
  const result = await runAgent(adapter, 'Eat food', { model: 'test', log: () => {}, fetchImpl: async () => reply(decisions.shift()) });
  assert.equal(result.status, 'model_finished');
  assert.deepEqual(adapter.actions, [{ type: 'eat' }]);
  assert.equal(adapter.releases, 1);
});

test('manual takeover during slow inference prevents a delayed action', async () => {
  const adapter = fakeAdapter();
  await assert.rejects(runAgent(adapter, 'Walk', { model: 'test', log: () => {}, fetchImpl: async () => {
    adapter.state.mode = 'manual'; return reply({ type: 'goto', x: 10, y: 64, z: 0 });
  } }), /returned to the player/);
  assert.deepEqual(adapter.actions, []);
  assert.equal(adapter.releases, 1);
});

test('invalid model output never executes game actions', async () => {
  const adapter = fakeAdapter();
  await assert.rejects(runAgent(adapter, 'Anything', { model: 'test', log: () => {}, fetchImpl: async () => reply({ type: 'shell', command: 'bad' }) }), /invalid action/);
  assert.deepEqual(adapter.actions, []);
  assert.equal(adapter.releases, 1);
});

test('step limits bound the autonomous loop', async () => {
  const adapter = fakeAdapter();
  const result = await runAgent(adapter, 'Guard', { model: 'test', maxSteps: 2, log: () => {}, fetchImpl: async () => reply({ type: 'wait', seconds: 1 }) });
  assert.equal(result.status, 'step_limit');
  assert.equal(adapter.actions.length, 2);
  assert.equal(adapter.releases, 1);
});

function verifiableAdapter() {
  const adapter = fakeAdapter();
  Object.assign(adapter.state.player, { uuid: 'test', dimension: 'minecraft:overworld', position: { x: 0, y: 64, z: 0 } });
  adapter.state.home = { x: 0, y: 64, z: 0 };
  adapter.state.inventory = [{ name: 'minecraft:oak_log', count: 10 }];
  return adapter;
}

test('a model claiming success cannot satisfy an unmet inventory quota', async () => {
  const adapter = verifiableAdapter();
  const result = await runAgent(adapter, 'Collect eight logs', { model: 'test', log() {},
    criteria: { collect: { block: 'oak_log', count: 8 } }, fetchImpl: async () => reply({ type: 'done', reason: 'Collected everything.' }) });
  assert.equal(result.status, 'criteria_unmet');
  assert.equal(result.verification.checks.inventory.currentCount, 10);
  assert.equal(result.verification.met, false);
  assert.equal(adapter.releases, 1);
});

test('missing saved home rejects verification before acquiring control', async () => {
  const adapter = verifiableAdapter();
  adapter.state.home = null;
  await assert.rejects(runAgent(adapter, 'Return home', { model: 'test', criteria: { returnHome: true } }), /Save a home/);
  assert.equal(adapter.state.mode, 'manual');
  assert.equal(adapter.releases, 0);
});

test('step-limit results include independent verification and release control', async () => {
  const adapter = verifiableAdapter();
  const result = await runAgent(adapter, 'Collect eight logs', { model: 'test', maxSteps: 1, log() {},
    criteria: { collect: { block: 'oak_log', count: 8 } }, fetchImpl: async () => reply({ type: 'eat' }) });
  assert.equal(result.status, 'step_limit');
  assert.equal(result.verification.met, false);
  assert.equal(adapter.releases, 1);
});

test('agent verifies additional items and return home through the real simulated bridge', async t => {
  const directory = await testDirectory(t, 'verified-agent-');
  const discoveryPath = join(directory, 'bridge.json');
  const driver = new DemoDriver();
  driver.home = { ...driver.player.position };
  driver.player.position.x = 5;
  driver.inventory.push({ name: 'minecraft:oak_log', count: 10, slot: 1 });
  const bridge = await startBridge(new Harness(driver), { discoveryPath });
  const adapter = await FabricAdapter.connect(discoveryPath);
  t.after(async () => { await adapter.close(); await bridge.close(); });
  const decisions = [{ type: 'collect', block: 'oak_log', count: 8 }, { type: 'home' }, { type: 'done', reason: 'Returned with the logs.' }];
  const result = await runAgent(adapter, 'Collect eight additional logs and return home', { model: 'test', log() {},
    criteria: { collect: { block: 'oak_log', count: 8 }, returnHome: true }, fetchImpl: async (_url, options) => {
      const input = JSON.parse(JSON.parse(options.body).messages[1].content);
      assert.equal(input.criteria.collect.initialCount, 10);
      return reply(decisions.shift());
    } });
  assert.equal(result.status, 'criteria_met');
  assert.equal(result.verification.checks.inventory.currentCount, 18);
  assert.equal(result.verification.checks.home.distance, 0);
  assert.equal((await adapter.observe()).mode, 'manual');
});
