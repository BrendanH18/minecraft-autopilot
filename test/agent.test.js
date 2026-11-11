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

test('collect and deposit accept each other\'s item field name', async () => {
  const adapter = fakeAdapter();
  const decisions = [{ type: 'collect', item: 'oak_log', count: 8 }, { type: 'deposit', block: 'oak_log' }, { type: 'done', reason: 'Stored.' }];
  await runAgent(adapter, 'Store logs', { model: 'test', log() {}, fetchImpl: async () => reply(decisions.shift()) });
  assert.deepEqual(adapter.actions, [{ type: 'collect', block: 'oak_log', count: 8 }, { type: 'deposit', item: 'oak_log' }]);
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

test('agent verifies a deposit through the real simulated bridge', async t => {
  const directory = await testDirectory(t, 'deposit-agent-');
  const discoveryPath = join(directory, 'bridge.json');
  const driver = new DemoDriver();
  driver.chest.items = [{ name: 'minecraft:oak_log', count: 4 }];
  driver.inventory.push({ name: 'minecraft:oak_log', count: 3, slot: 1 });
  const bridge = await startBridge(new Harness(driver), { discoveryPath });
  const adapter = await FabricAdapter.connect(discoveryPath);
  t.after(async () => { await adapter.close(); await bridge.close(); });
  const decisions = [{ type: 'collect', block: 'oak_log', count: 5 }, { type: 'deposit', item: 'oak_log' }, { type: 'done', reason: 'Stored the logs.' }];
  const result = await runAgent(adapter, 'Store eight logs in the chest', { model: 'test', log() {},
    criteria: { deposit: { item: 'oak_log', count: 8 } }, fetchImpl: async () => reply(decisions.shift()) });
  assert.equal(result.status, 'criteria_met');
  assert.deepEqual(result.verification.checks.deposit, { item: 'minecraft:oak_log', storedAdditional: 8, requiredAdditional: 8, evidence: 'refreshed', met: true });
  assert.deepEqual(driver.chest.items, [{ name: 'minecraft:oak_log', count: 12 }]);
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

test('gather-and-store succeeds without retaining a duplicate quota in inventory', async t => {
  const directory = await testDirectory(t, 'gather-store-');
  const driver = new DemoDriver();
  const bridge = await startBridge(new Harness(driver), { discoveryPath: join(directory, 'bridge.json') });
  const adapter = await FabricAdapter.connect(join(directory, 'bridge.json'));
  t.after(async () => { await adapter.close(); await bridge.close(); });
  const decisions = [{ type: 'collect', block: 'oak_log', count: 8 }, { type: 'deposit', item: 'oak_log', count: 8 }, { type: 'done', reason: 'Stored eight new logs.' }];
  const result = await runAgent(adapter, 'Collect and store eight additional logs', { model: 'test', log() {},
    criteria: { collect: { block: 'oak_log', count: 8 }, deposit: { item: 'oak_log', count: 8 } }, fetchImpl: async () => reply(decisions.shift()) });
  assert.equal(result.status, 'criteria_met');
  assert.equal(result.verification.checks.inventory.currentCount, 0);
  assert.equal(result.verification.checks.inventory.storedAdditional, 8);
  assert.equal(result.verification.checks.deposit.evidence, 'refreshed');
});

test('final storage inspection rejects stale success after another player removes items', async () => {
  const adapter = verifiableAdapter();
  adapter.state.containers = [{ x: 1, y: 64, z: 0, items: [{ name: 'minecraft:oak_log', count: 30 }] }];
  let inspections = 0;
  adapter.execute = async function (action) {
    this.actions.push(action);
    if (action.type === 'inspect_storage') {
      inspections++;
      this.state.containers[0].items[0].count = 30;
    } else if (action.type === 'deposit') this.state.containers[0].items[0].count = 38;
    return { status: 'completed' };
  };
  const decisions = [{ type: 'deposit', item: 'oak_log', count: 8 }, ...Array.from({ length: 3 }, () => ({ type: 'done', reason: 'Stored.' }))];
  const result = await runAgent(adapter, 'Store eight logs', { model: 'test', log() {}, criteria: { deposit: { item: 'oak_log', count: 8 } },
    fetchImpl: async () => reply(decisions.shift()) });
  assert.equal(result.status, 'criteria_unmet');
  assert.equal(result.verification.checks.deposit.storedAdditional, 0);
  assert.equal(inspections, 4, 'refresh baseline once and each final claim');
});

test('unreachable final storage cannot report success from its cached contents', async () => {
  const adapter = verifiableAdapter();
  adapter.state.containers = [{ x: 1, y: 64, z: 0, items: [{ name: 'minecraft:oak_log', count: 30 }] }];
  let inspections = 0;
  adapter.execute = async function (action) {
    if (action.type === 'inspect_storage' && ++inspections > 1) throw new Error('Could not open storage.');
    if (action.type === 'deposit') this.state.containers[0].items[0].count = 38;
    return { status: 'completed' };
  };
  const decisions = [{ type: 'deposit', item: 'oak_log', count: 8 }, ...Array.from({ length: 3 }, () => ({ type: 'done', reason: 'Stored.' }))];
  const result = await runAgent(adapter, 'Store eight logs', { model: 'test', log() {}, criteria: { deposit: { item: 'oak_log', count: 8 } },
    fetchImpl: async () => reply(decisions.shift()) });
  assert.equal(result.status, 'criteria_unmet');
  assert.equal(result.verification.checks.deposit.evidence, 'last_observed');
  assert.match(result.verification.checks.deposit.error, /Could not open/);
});

test('deposit baseline is refreshed before the task rather than using pre-task cached contents', async () => {
  const adapter = verifiableAdapter();
  adapter.state.containers = [{ x: 1, y: 64, z: 0, items: [{ name: 'minecraft:oak_log', count: 30 }] }];
  let actualStored = 22;
  adapter.execute = async function (action) {
    if (action.type === 'inspect_storage') this.state.containers[0].items[0].count = actualStored;
    if (action.type === 'deposit') { actualStored += 8; this.state.containers[0].items[0].count = actualStored; }
    return { status: 'completed' };
  };
  const decisions = [{ type: 'deposit', item: 'oak_log', count: 8 }, { type: 'done', reason: 'Stored.' }];
  const result = await runAgent(adapter, 'Store eight logs', { model: 'test', log() {}, criteria: { deposit: { item: 'oak_log', count: 8 } },
    fetchImpl: async () => reply(decisions.shift()) });
  assert.equal(result.status, 'criteria_met');
  assert.equal(result.verification.checks.deposit.storedAdditional, 8);
});

test('eating during the starting inspection retries before establishing the storage baseline', async () => {
  const adapter = verifiableAdapter();
  adapter.state.containers = [{ x: 1, y: 64, z: 0, items: [{ name: 'minecraft:oak_log', count: 30 }] }];
  let inspections = 0;
  let decisions = 0;
  adapter.execute = async function (action) {
    assert.equal(action.type, 'inspect_storage');
    if (++inspections === 1) {
      assert.equal(decisions, 0);
      this.state.player.hunger = 20;
      throw new Error('Interrupted to eat. Food consumed; replan from fresh state.');
    }
    return { status: 'completed' };
  };
  const result = await runAgent(adapter, 'Store eight logs', { model: 'test', log() {}, criteria: { deposit: { item: 'oak_log', count: 8 } },
    fetchImpl: async () => { decisions++; return reply({ type: 'done', reason: 'Unable to store.' }); } });
  assert.equal(result.status, 'criteria_unmet');
  assert.equal(decisions, 3);
  assert.equal(inspections, 5, 'interrupted baseline, retry, and three final inspections');
  assert.equal(adapter.releases, 1);
});

test('takeover during a recoverable starting inspection prevents a retry', async () => {
  const adapter = verifiableAdapter();
  adapter.state.containers = [];
  let inspections = 0;
  adapter.execute = async () => {
    inspections++;
    adapter.state.mode = 'manual';
    throw new Error('Interrupted to eat. Food consumed; replan from fresh state.');
  };
  await assert.rejects(runAgent(adapter, 'Store logs', { model: 'test', log() {}, criteria: { deposit: { item: 'oak_log', count: 8 } } }), /returned to the player/);
  assert.equal(inspections, 1);
  assert.equal(adapter.releases, 1);
});

test('repeated food interruptions remain bounded by the overall task deadline', async () => {
  const adapter = verifiableAdapter();
  adapter.state.containers = [];
  let inspections = 0;
  adapter.execute = async () => {
    inspections++;
    throw new Error('Interrupted to eat. Food consumed; replan from fresh state.');
  };
  await assert.rejects(runAgent(adapter, 'Store logs', { model: 'test', minutes: 0.001, log() {},
    criteria: { deposit: { item: 'oak_log', count: 8 } } }), /timeout|aborted/i);
  assert.equal(inspections, 1);
  assert.equal(adapter.releases, 1);
});

test('planner rejects missing or oversized task and model text before takeover', async () => {
  for (const [goal, model] of [[' ', 'test'], [null, 'test'], ['a'.repeat(16001), 'test'], ['Task', ' '], ['Task', 4], ['Task', 'a'.repeat(201)]]) {
    const adapter = fakeAdapter();
    await assert.rejects(runAgent(adapter, goal, { model }), /goal|model/);
    assert.equal(adapter.state.mode, 'manual');
  }
});

test('API callers receive the same bounded planner limits as CLI callers', async () => {
  for (const options of [{ maxSteps: 0 }, { maxSteps: 1.5 }, { maxSteps: 1001 }, { minutes: NaN }, { minutes: 0 }, { minutes: 1441 }, { modelTimeout: Infinity }, { modelTimeout: -1 }, { modelTimeout: 3601 }, { think: 'false' }]) {
    const adapter = fakeAdapter();
    await assert.rejects(runAgent(adapter, 'Task', { model: 'test', ...options }), /steps|boolean/);
    assert.equal(adapter.state.mode, 'manual');
  }
});

test('planner refuses credentials embedded in local Ollama URLs before takeover', async () => {
  const adapter = fakeAdapter();
  await assert.rejects(runAgent(adapter, 'Task', { model: 'test', ollamaUrl: 'http://user:secret@localhost:11434' }), /must not contain credentials/);
  assert.equal(adapter.state.mode, 'manual');
});

test('local connection failures explain how to restore Ollama and release control', async () => {
  const adapter = fakeAdapter();
  const cause = new TypeError('fetch failed');
  await assert.rejects(runAgent(adapter, 'Task', { model: 'test', fetchImpl: async () => { throw cause; } }), error => {
    assert.match(error.message, /Start Ollama/);
    assert.equal(error.cause, cause);
    return true;
  });
  assert.equal(adapter.releases, 1);
});

test('empty model action gives a thinking-model recovery hint', async () => {
  for (const content of ['', '   ', undefined]) {
    const adapter = fakeAdapter();
    await assert.rejects(runAgent(adapter, 'Task', { model: 'test', fetchImpl: async () => new Response(JSON.stringify({ message: { content } })) }), /no action.*--no-thinking/);
    assert.deepEqual(adapter.actions, []);
    assert.equal(adapter.releases, 1);
  }
});

test('oversized model actions are rejected before parsing or execution', async () => {
  const adapter = fakeAdapter();
  await assert.rejects(runAgent(adapter, 'Task', { model: 'test', fetchImpl: async () => new Response(JSON.stringify({ message: { content: ' '.repeat(65536) + '{}' } })) }), /oversized action/);
  assert.deepEqual(adapter.actions, []);
  assert.equal(adapter.releases, 1);
});

test('planner validates world bounds and item names before dispatching to adapters', async () => {
  for (const action of [{ type: 'goto', x: 30000000, y: 64, z: 0 }, { type: 'goto', x: 0, y: -65, z: 0 }, { type: 'collect', block: 'not an identifier', count: 1 }, { type: 'deposit', item: '../oak_log' }]) {
    const adapter = fakeAdapter();
    await assert.rejects(runAgent(adapter, 'Task', { model: 'test', fetchImpl: async () => reply(action) }), /invalid action/);
    assert.deepEqual(adapter.actions, []);
    assert.equal(adapter.releases, 1);
  }
});

test('model can refresh storage only on backends that expose containers', async () => {
  assert.ok(decisionJsonSchema.properties.type.enum.includes('inspect_storage'));
  for (const supported of [true, false]) {
    const adapter = fakeAdapter();
    if (supported) adapter.state.containers = [];
    const inputs = [];
    const decisions = [{ type: 'inspect_storage' }, { type: 'done', reason: 'Checked.' }];
    await runAgent(adapter, 'Inspect storage', { model: 'test', log() {}, fetchImpl: async (url, request) => {
      inputs.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return reply(decisions.shift());
    } });
    assert.deepEqual(adapter.actions, supported ? [{ type: 'inspect_storage' }] : []);
    if (!supported) assert.match(inputs[1].history[0].error, /does not support/);
  }
});

test('terminal failed and cancelled action results count toward the failure stop', async () => {
  for (const status of ['failed', 'cancelled']) {
    const adapter = fakeAdapter();
    adapter.execute = async function (action) { this.actions.push(action); return { status, message: 'Path blocked.' }; };
    await assert.rejects(runAgent(adapter, 'Task', { model: 'test', log() {}, fetchImpl: async () => reply({ type: 'home' }) }), /Three consecutive actions failed/);
    assert.equal(adapter.actions.length, 3);
    assert.equal(adapter.releases, 1);
  }
});

test('namespace aliases cannot bypass repeated ineffective action detection', async () => {
  const adapter = fakeAdapter();
  const decisions = [{ type: 'collect', block: 'oak_log', count: 1 }, { type: 'collect', block: 'minecraft:oak_log', count: 1 }, { type: 'done', reason: 'No progress.' }];
  const inputs = [];
  await runAgent(adapter, 'Task', { model: 'test', log() {}, fetchImpl: async (url, request) => {
    inputs.push(JSON.parse(JSON.parse(request.body).messages[1].content));
    return reply(decisions.shift());
  } });
  assert.equal(adapter.actions.length, 1);
  assert.match(inputs[2].history[1].rejected, /without changing/);
});
