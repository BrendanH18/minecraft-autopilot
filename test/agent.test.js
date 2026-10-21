import test from 'node:test';
import assert from 'node:assert/strict';
import { runAgent, decisionJsonSchema } from '../src/agent.js';
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

test('a flat output schema is enforced, and only the chosen action\'s fields are kept', async () => {
  // Ollama's llama.cpp runner ignores top-level oneOf/anyOf.
  assert.equal(decisionJsonSchema.type, 'object');
  assert.deepEqual(decisionJsonSchema.required, ['type']);
  const adapter = fakeAdapter();
  const decisions = [{ type: 'eat', x: 1, y: 2, z: 3, reason: 'Hungry.' }, { type: 'done', reason: 'Ate.', count: 4 }];
  const result = await runAgent(adapter, 'Eat food', { model: 'test', log() {}, fetchImpl: async () => reply(decisions.shift()) });
  assert.equal(result.status, 'model_finished');
  assert.equal(result.reason, 'Ate.');
  assert.deepEqual(adapter.actions, [{ type: 'eat' }]);

  const incomplete = fakeAdapter();
  await assert.rejects(runAgent(incomplete, 'Walk', { model: 'test', log() {}, fetchImpl: async () => reply({ type: 'goto', x: 1, y: 64, reason: 'No z.' }) }), /invalid action/);
  assert.deepEqual(incomplete.actions, []);
  assert.equal(incomplete.releases, 1);
});

test('an exact repeat of an action that changed nothing is refused, but waits and effective repeats run', async () => {
  const adapter = verifiableAdapter();
  adapter.execute = async function (action) {
    this.actions.push(action);
    if (action.type === 'collect') this.state.inventory[0].count += action.count;
    if (action.type === 'goto') Object.assign(this.state.player.position, { x: action.x, y: action.y, z: action.z });
    return { status: 'completed' };
  };
  const inputs = [];
  const here = { type: 'goto', x: 0, y: 64, z: 0 };
  const collect = { type: 'collect', block: 'oak_log', count: 1 };
  const wait = { type: 'wait', seconds: 1 };
  const decisions = [here, here, here, collect, collect, wait, wait, { type: 'done', reason: 'Finished.' }];
  const result = await runAgent(adapter, 'Collect and guard', { model: 'test', log() {}, fetchImpl: async (url, request) => {
    inputs.push(JSON.parse(JSON.parse(request.body).messages[1].content));
    return reply(decisions.shift());
  } });
  assert.equal(result.status, 'model_finished');
  assert.deepEqual(adapter.actions, [here, collect, collect, wait, wait]);
  assert.match(inputs[2].history[1].rejected, /without changing/);
  assert.match(inputs[3].history[2].rejected, /without changing/, 'stays refused until the model changes action');
  assert.equal(adapter.releases, 1);
});

test('a repeat runs again once hunger or the latest observation has changed', async () => {
  const adapter = verifiableAdapter();
  adapter.state.player.hunger = 20;
  const eat = { type: 'eat' };
  const home = { type: 'home' };
  // Eating at full hunger changes nothing; hunger then drops before the model repeats it.
  const decisions = [eat, eat, home, home, { type: 'done', reason: 'Finished.' }];
  let replies = 0;
  const result = await runAgent(adapter, 'Stay fed at home', { model: 'test', log() {}, fetchImpl: async () => {
    replies++;
    if (replies === 2) adapter.state.player.hunger = 19;
    // Knockback during inference moves the player after a no-op home.
    if (replies === 4) adapter.state.player.position.x = 5;
    return reply(decisions.shift());
  } });
  assert.equal(result.status, 'model_finished');
  assert.deepEqual(adapter.actions, [eat, eat, home, home]);
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
  assert.equal(result.steps, 3);
  assert.equal(result.verification.checks.inventory.currentCount, 10);
  assert.equal(result.verification.met, false);
  assert.equal(adapter.releases, 1);
});

test('the model sees independent progress and continues after a premature done', async () => {
  const adapter = verifiableAdapter();
  adapter.execute = async function (action) {
    this.actions.push(action);
    if (action.type === 'collect') this.state.inventory[0].count += action.count;
    return { status: 'completed' };
  };
  const decisions = [{ type: 'done', reason: 'First go to the logs.' }, { type: 'collect', block: 'oak_log', count: 8 }, { type: 'done', reason: 'Collected.' }];
  const inputs = [];
  const result = await runAgent(adapter, 'Collect eight logs', { model: 'test', log() {},
    criteria: { collect: { block: 'oak_log', count: 8 } }, fetchImpl: async (_url, options) => {
      inputs.push(JSON.parse(JSON.parse(options.body).messages[1].content));
      return reply(decisions.shift());
    } });
  assert.equal(result.status, 'criteria_met');
  assert.equal(result.steps, 3);
  assert.equal(inputs[0].progress.checks.inventory.currentCount, 10);
  assert.equal(inputs[1].progress.met, false);
  assert.ok(inputs[1].history[0].rejected);
  assert.equal(inputs[2].progress.met, true);
  assert.deepEqual(adapter.actions, [{ type: 'collect', block: 'oak_log', count: 8 }]);
  assert.equal(adapter.releases, 1);
});

test('the planner cannot replace a home saved before the task', async () => {
  const adapter = verifiableAdapter();
  const inputs = [];
  const decisions = [{ type: 'set_home' }, { type: 'done', reason: 'Kept the existing home.' }];
  const result = await runAgent(adapter, 'Guard my base', { model: 'test', log() {}, fetchImpl: async (url, request) => {
    inputs.push(JSON.parse(JSON.parse(request.body).messages[1].content));
    return reply(decisions.shift());
  } });
  assert.equal(result.status, 'model_finished');
  assert.deepEqual(adapter.actions, []);
  assert.match(inputs[1].history[0].error, /set_home is refused/);
  assert.equal(adapter.releases, 1);

  // Without an existing home, the model may still save one.
  const homeless = fakeAdapter();
  const saves = [{ type: 'set_home' }, { type: 'done', reason: 'Saved.' }];
  await runAgent(homeless, 'Save this spot as home', { model: 'test', log() {}, fetchImpl: async () => reply(saves.shift()) });
  assert.deepEqual(homeless.actions, [{ type: 'set_home' }]);
});

test('requests set an explicit context size and only override thinking when asked', async () => {
  const bodies = [];
  const fetchImpl = async (url, request) => { bodies.push(JSON.parse(request.body)); return reply({ type: 'done', reason: 'Nothing to do.' }); };
  await runAgent(fakeAdapter(), 'Idle', { model: 'test', log() {}, fetchImpl });
  await runAgent(fakeAdapter(), 'Idle', { model: 'test', think: false, log() {}, fetchImpl });
  assert.equal(bodies[0].options.num_ctx, 8192);
  assert.equal('think' in bodies[0], false);
  assert.equal(bodies[1].think, false);
});

test('a slow model decision fails clearly without executing anything', async () => {
  const adapter = fakeAdapter();
  // The interval stands in for the open socket that keeps a real request alive.
  await assert.rejects(runAgent(adapter, 'Anything', { model: 'test', modelTimeout: 0.05, log() {}, fetchImpl: (url, request) => new Promise((resolve, reject) => {
    const socket = setInterval(() => {}, 1000);
    request.signal.addEventListener('abort', () => { clearInterval(socket); reject(request.signal.reason); });
  }) }), /did not answer within 0.05 seconds, so this decision was not executed; earlier actions/);
  assert.deepEqual(adapter.actions, []);
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

test('an already cancelled planner never acquires control', async () => {
  const adapter = fakeAdapter();
  const controller = new AbortController();
  controller.abort(new Error('Stopped by user.'));
  await assert.rejects(runAgent(adapter, 'Anything', { model: 'test', signal: controller.signal }), /Stopped by user/);
  assert.equal(adapter.state.mode, 'manual');
  assert.equal(adapter.releases, 0);
});

test('cancellation during inference cannot return a late model success', async () => {
  const adapter = fakeAdapter();
  const controller = new AbortController();
  await assert.rejects(runAgent(adapter, 'Anything', { model: 'test', signal: controller.signal, log() {}, fetchImpl: async () => {
    controller.abort(new Error('Stopped by user.'));
    return reply({ type: 'done', reason: 'All done.' });
  } }), /Stopped by user/);
  assert.equal(adapter.releases, 1);
  assert.deepEqual(adapter.actions, []);
});
