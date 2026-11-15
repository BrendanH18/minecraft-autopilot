import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { projectRoot } from '../src/config.js';
import { DemoDriver, demoScenarios } from '../src/demo-driver.js';
import { Harness } from '../src/harness.js';
import { startBridge } from '../src/bridge-server.js';
import { FabricAdapter } from '../src/fabric-adapter.js';
import { parseRoutine, runRoutine } from '../src/routine.js';
import { inspectPrerequisites } from '../src/doctor.js';
import { freeSlotsView } from '../src/cli-views.js';
import { testDirectory } from './helpers.js';

const cliPath = join(projectRoot, 'src/cli.js');
function cli(args, { env } = {}) {
  return new Promise(resolve => execFile(process.execPath, [cliPath, ...args], { timeout: 30_000, env: { ...process.env, ...env } },
    (error, stdout, stderr) => resolve({ code: error ? error.code ?? 1 : 0, stdout, stderr, json: stdout.trim() ? JSON.parse(stdout) : null })));
}

async function demoBridge(t, options) {
  const directory = await testDirectory(t, 'batch3-');
  const driver = new DemoDriver(options);
  const harness = new Harness(driver, { leaseMs: 60_000 });
  const discoveryPath = join(directory, 'bridge.json');
  const bridge = await startBridge(harness, { discoveryPath });
  t.after(() => bridge.close());
  let acquisitions = 0;
  const acquire = harness.acquire.bind(harness);
  harness.acquire = leaseId => { acquisitions++; return acquire(leaseId); };
  const adapter = async () => { const value = await FabricAdapter.connect(discoveryPath); t.after(() => value.close()); return value; };
  return { directory, driver, harness, discoveryPath, adapter, acquisitions: () => acquisitions, run: (...args) => cli(['--bridge', discoveryPath, ...args]) };
}

const routine = text => parseRoutine(JSON.stringify(text));

test('runRoutine validates start, repeat, and health options before taking control', { timeout: 30_000 }, async t => {
  const { adapter, acquisitions } = await demoBridge(t);
  const client = await adapter();
  const actions = routine([{ type: 'set_home' }, { type: 'eat' }]);
  for (const options of [{ fromStep: 0 }, { fromStep: 3 }, { fromStep: 1.5 }, { repeat: 0 }, { repeat: 21 }, { repeat: 2.5 }, { stopBelowHealth: 0 }, { stopBelowHealth: 20 }]) {
    await assert.rejects(runRoutine(client, actions, options), /start step|Repeat|health stop/);
  }
  assert.equal(acquisitions(), 0);
});

test('runRoutine starts from a step, repeats under one lease, and keeps default output unchanged', { timeout: 60_000 }, async t => {
  const { driver, harness, adapter, acquisitions } = await demoBridge(t);
  const client = await adapter();
  const actions = routine([{ type: 'goto', x: 4, y: 64, z: 4 }, { type: 'collect', block: 'oak_log', count: 1 }, { type: 'set_home' }]);
  const plain = await runRoutine(client, actions.slice(2));
  assert.deepEqual(Object.keys(plain), ['status', 'completed', 'total', 'results']);

  const started = await runRoutine(client, actions, { fromStep: 2 });
  assert.deepEqual([started.status, started.completed, started.total, started.startStep], ['completed', 2, 3, 2]);
  assert.deepEqual(started.results.map(job => job.type), ['collect', 'set_home']);
  assert.deepEqual(driver.player.position, { x: 0, y: 64, z: 0 });

  const repeated = await runRoutine(client, actions, { fromStep: 2, repeat: 3 });
  assert.deepEqual([repeated.status, repeated.completed, repeated.total, repeated.iterations, repeated.stepsRun], ['completed', 6, 3, 3, 6]);
  assert.deepEqual(repeated.results.map(job => [job.type, job.iteration]), [['collect', 1], ['set_home', 1], ['collect', 2], ['set_home', 2], ['collect', 3], ['set_home', 3]]);
  assert.equal(driver.inventory.find(item => item.name === 'minecraft:oak_log').count, 4);
  assert.equal(acquisitions(), 3);
  assert.equal(harness.observe().mode, 'manual');

  const failing = routine([{ type: 'set_home' }, { type: 'deposit', item: 'dirt', count: 1 }]);
  const failed = await runRoutine(client, failing, { repeat: 2 });
  assert.deepEqual([failed.status, failed.failedStep, failed.failedIteration, failed.completed, failed.stepsRun], ['failed', 2, 1, 1, 2]);
});

test('runRoutine continues past action failures but not loss of control or cancellation', { timeout: 60_000 }, async t => {
  const { harness, adapter } = await demoBridge(t);
  const client = await adapter();
  const actions = routine([{ type: 'set_home' }, { type: 'deposit', item: 'dirt', count: 1 }, { type: 'eat' }, { type: 'deposit', item: 'sand', count: 1 }]);
  const result = await runRoutine(client, actions, { continueOnError: true, repeat: 2 });
  assert.equal(result.status, 'completed_with_errors');
  assert.equal(result.completed, 4);
  assert.equal(result.stepsRun, 8);
  assert.deepEqual(result.errors.map(({ step, iteration }) => [step, iteration]), [[2, 1], [4, 1], [2, 2], [4, 2]]);
  assert.match(result.errors[0].error, /Only 0 minecraft:dirt/);
  assert.equal(harness.observe().mode, 'manual');

  const clean = await runRoutine(client, routine([{ type: 'set_home' }]), { continueOnError: true });
  assert.deepEqual([clean.status, clean.errors], ['completed', []]);

  const execute = client.execute.bind(client);
  client.execute = async (action, options) => {
    if (action.type === 'eat') { harness.release('Player pressed F8.'); throw new Error('Action interrupted.'); }
    return execute(action, options);
  };
  const lost = await runRoutine(client, routine([{ type: 'set_home' }, { type: 'eat' }, { type: 'set_home' }]), { continueOnError: true });
  assert.deepEqual([lost.status, lost.failedStep, lost.completed, lost.errors], ['failed', 2, 1, []]);

  const controller = new AbortController();
  client.execute = async (action, options) => {
    if (action.type === 'eat') { controller.abort(new Error('Stopped by user.')); throw new Error('Action aborted.'); }
    return execute(action, options);
  };
  const cancelled = await runRoutine(client, routine([{ type: 'eat' }, { type: 'set_home' }]), { continueOnError: true, signal: controller.signal });
  assert.deepEqual([cancelled.status, cancelled.failedStep, cancelled.error, cancelled.completed], ['cancelled', 1, 'Stopped by user.', 0]);
  assert.equal(harness.observe().mode, 'manual');
});

test('runRoutine stops before a step when observed health falls below the threshold', { timeout: 30_000 }, async t => {
  const { driver, harness, adapter } = await demoBridge(t, { scenario: 'hungry' });
  const client = await adapter();
  const before = await runRoutine(client, routine([{ type: 'set_home' }]), { stopBelowHealth: 11 });
  assert.deepEqual([before.status, before.stoppedBeforeStep, before.health, before.completed], ['health_stop', 1, 10, 0]);
  assert.equal(harness.observe().mode, 'manual');

  const execute = driver.execute.bind(driver);
  driver.execute = async (action, options) => { const job = await execute(action, options); if (action.type === 'set_home') driver.player.health = 5; return job; };
  const midway = await runRoutine(client, routine([{ type: 'eat' }, { type: 'set_home' }, { type: 'eat' }]), { stopBelowHealth: 8, repeat: 2 });
  assert.deepEqual([midway.status, midway.stoppedBeforeStep, midway.health, midway.completed, midway.iteration], ['health_stop', 3, 5, 2, 1]);
  assert.equal(harness.observe().mode, 'manual');
});

test('run CLI applies --from-step, --continue-on-error, --repeat, and --stop-below-health', { timeout: 120_000 }, async t => {
  const { directory, driver, harness, run, acquisitions } = await demoBridge(t, { scenario: 'hungry' });
  const file = join(directory, 'routine.json');
  await writeFile(file, JSON.stringify([{ type: 'set_home' }, { type: 'deposit', item: 'dirt', count: 1 }, { type: 'collect', block: 'oak_log', count: 1 }]));
  for (const args of [['--from-step', '4'], ['--from-step', '0'], ['--repeat', '21'], ['--repeat', '0'], ['--stop-below-health', '20'], ['--stop-below-health', '0.5']]) {
    const refused = await run('run', file, ...args);
    assert.equal(refused.code, 1, args.join(' '));
    assert.match(refused.stderr, /from-step|repeat|stop-below-health|positive integer/);
  }
  assert.equal(acquisitions(), 0);
  const dry = await run('run', '--dry-run', '--from-step', '2', '--repeat', '3', file);
  assert.deepEqual([dry.code, dry.json.startStep, dry.json.iterations, dry.json.total], [0, 2, 3, 3]);

  const started = await run('run', '--from-step', '3', file);
  assert.equal(started.code, 0, started.stderr);
  assert.deepEqual([started.json.status, started.json.startStep, started.json.completed, started.json.total], ['completed', 3, 1, 3]);
  assert.match(started.stderr, /Step 3\/3: collect/);

  const continued = await run('run', '--continue-on-error', '--repeat', '2', file);
  assert.equal(continued.code, 1);
  assert.deepEqual([continued.json.status, continued.json.completed, continued.json.iterations, continued.json.stepsRun], ['completed_with_errors', 4, 2, 6]);
  assert.deepEqual(continued.json.errors.map(({ step, iteration }) => [step, iteration]), [[2, 1], [2, 2]]);
  assert.ok(continued.json.results.every(job => job.iteration >= 1));
  assert.match(continued.stderr, /Step 3\/3 \(iteration 2\/2\): collect/);
  assert.equal(driver.inventory.find(item => item.name === 'minecraft:oak_log').count, 3);

  const stopped = await run('run', '--stop-below-health', '12', file);
  assert.equal(stopped.code, 1);
  assert.deepEqual([stopped.json.status, stopped.json.stoppedBeforeStep, stopped.json.health], ['health_stop', 1, 10]);
  assert.equal(harness.observe().mode, 'manual');
  assert.equal(acquisitions(), 3);
});

test('the full demo scenario fills every slot and refuses new items until a stack is stored', { timeout: 60_000 }, async t => {
  assert.ok(demoScenarios.includes('full'));
  const driver = new DemoDriver({ scenario: 'full' });
  const state = driver.observe();
  assert.equal(state.inventory.length, 36);
  assert.deepEqual(state.inventory.map(stack => stack.slot), Array.from({ length: 36 }, (_, index) => index));
  assert.deepEqual(freeSlotsView(state), { slots: 36, used: 36, free: 0 });
  const options = { signal: new AbortController().signal, onProgress: () => {} };
  await assert.rejects(driver.execute({ type: 'collect', block: 'minecraft:oak_log', count: 1 }, options), /^Error: Inventory full; collected 0 of 1 oak_log\.$/);
  // Full stacks have no room either; only a partial stack of the target or an empty slot counts as space.
  await assert.rejects(driver.execute({ type: 'collect', block: 'minecraft:cobblestone', count: 1 }, options), /^Error: Inventory full; collected 0 of 1 cobblestone\.$/);
  await driver.execute({ type: 'deposit', item: 'minecraft:sand' }, options);
  assert.equal(freeSlotsView(driver.observe()).free, 5);
  await driver.execute({ type: 'collect', block: 'minecraft:oak_log', count: 2 }, options);
  assert.deepEqual(driver.observe().inventory.at(-1), { slot: 31, name: 'minecraft:oak_log', count: 2 });
  // Collection tops up the partial stack, then fills the free slots, and keeps that progress when it runs out of room.
  await assert.rejects(driver.execute({ type: 'collect', block: 'minecraft:oak_log', count: 400 }, options), /^Error: Inventory full; collected 318 of 400 oak_log\.$/);
  assert.deepEqual(driver.observe().inventory.slice(31).map(stack => [stack.slot, stack.count]), [[31, 64], [32, 64], [33, 64], [34, 64], [35, 64]]);

  const standard = new DemoDriver();
  await standard.execute({ type: 'collect', block: 'minecraft:oak_log', count: 1 }, options);
  assert.deepEqual(standard.inventory.at(-1), { slot: 1, name: 'minecraft:oak_log', count: 1 });

  const directory = await testDirectory(t, 'batch3-demo-');
  const smoke = await cli(['demo', '--smoke', '--scenario', 'full'], { env: { MC_AGENT_HOME: directory } });
  assert.equal(smoke.code, 0, smoke.stderr);
  assert.equal(smoke.json.scenario, 'full');
  assert.match(smoke.stderr, /DEMO SIMULATION \(full scenario\)/);
  const help = await new Promise(resolve => execFile(process.execPath, [cliPath, 'demo', '--help'], (error, stdout) => resolve(stdout)));
  assert.match(help.replace(/\s+/g, ' '), /full \(all 36 inventory slots occupied\)/);
});

test('MCP summary, find-item, and direction tools read without control and validate targets', { timeout: 30_000 }, async t => {
  const { driver, harness, discoveryPath, acquisitions } = await demoBridge(t, { scenario: 'stocked' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [cliPath, '--bridge', discoveryPath, 'mcp'], stderr: 'pipe' });
  const client = new Client({ name: 'minecraft-test', version: '1.0.0' });
  t.after(() => client.close());
  await client.connect(transport);
  const call = async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args });
    const text = result.content[0].text;
    return { error: result.isError === true, value: text.startsWith('{') ? JSON.parse(text) : text };
  };
  const tools = (await client.listTools()).tools;
  for (const name of ['minecraft_summary', 'minecraft_find_item', 'minecraft_direction']) {
    assert.equal(tools.find(tool => tool.name === name)?.annotations?.readOnlyHint, true, name);
  }

  const summary = (await call('minecraft_summary')).value;
  assert.deepEqual([summary.position, summary.health, summary.mode, summary.homeDistance, summary.totalItems], [{ x: 0, y: 64, z: 0 }, 20, 'manual', null, 8]);
  const found = (await call('minecraft_find_item', { item: 'oak_log' })).value;
  assert.deepEqual([found.item, found.inventory, found.stored, found.total, found.containers.length], ['minecraft:oak_log', 0, 12, 12, 1]);
  assert.equal((await call('minecraft_find_item', { item: 'bread' })).value.inventory, 8);
  assert.match((await call('minecraft_find_item', { item: '../x' })).value.error, /Minecraft item/);
  assert.equal((await call('minecraft_find_item')).error, true);

  const north = (await call('minecraft_direction', { x: 0, y: 64, z: -10 })).value;
  assert.deepEqual([north.compass, north.distance], ['north', 10]);
  assert.match((await call('minecraft_direction', { home: true })).value.error, /No home is saved/);
  for (const args of [{}, { x: 1, y: 64 }, { x: 1, y: 64, z: 1, home: true }, { home: true, x: 1 }]) {
    assert.match((await call('minecraft_direction', args)).value.error, /either x, y, and z, or home/);
  }
  assert.match((await call('minecraft_direction', { x: 0, y: 400, z: 0 })).value.error, /inside the world/);
  assert.equal((await call('minecraft_direction', { home: false })).error, true);

  driver.home = { x: 6, y: 64, z: 0 };
  const home = (await call('minecraft_direction', { home: true })).value;
  assert.deepEqual([home.compass, home.distance, home.target], ['east', 6, { x: 6, y: 64, z: 0 }]);
  driver.home = { x: 6, y: 64, z: 0, dimension: 'minecraft:the_nether' };
  assert.match((await call('minecraft_direction', { home: true })).value.error, /Home is in minecraft:the_nether but the player is in minecraft:overworld/);
  driver.home = { x: 6, y: 64, z: 0, dimension: 'minecraft:overworld' };
  assert.equal((await call('minecraft_direction', { home: true })).value.distance, 6);
  assert.equal(acquisitions(), 0);
  assert.equal(harness.observe().mode, 'manual');
});

test('doctor reports ready and --strict exits 1 only when not ready', { timeout: 30_000 }, async t => {
  const directory = await testDirectory(t, 'batch3-doctor-');
  const jdk = name => ({ status: 0, stderr: name === 'java' ? 'openjdk version "21.0.8"' : '', stdout: name === 'java' ? '' : `${name} 21.0.8` });
  const discoveryPath = join(directory, 'bridge.json');
  await writeFile(discoveryPath, JSON.stringify({ protocol: 1, url: 'http://127.0.0.1:1', token: 'x'.repeat(64) }));
  const result = await inspectPrerequisites({ root: directory, discoveryPath, run: jdk, nodeVersion: '22.12.0' });
  assert.deepEqual([result.nodeSupported, result.jdkReady, result.bridgeValid, result.bundleReady, result.ready], [true, true, true, false, false]);
  const unreachable = await inspectPrerequisites({ root: directory, discoveryPath, run: jdk, ollamaUrl: 'http://127.0.0.1:9', fetchImpl: async () => new Response('', { status: 500 }) });
  assert.equal(unreachable.ready, false);

  const missing = join(directory, 'missing.json');
  const plain = await cli(['--bridge', missing, 'doctor'], { env: { MC_AGENT_HOME: directory } });
  assert.equal(plain.code, 0);
  assert.equal(plain.json.ready, false);
  const strict = await cli(['--bridge', missing, 'doctor', '--strict'], { env: { MC_AGENT_HOME: directory } });
  assert.equal(strict.code, 1);
  assert.equal(strict.json.ready, false);
  assert.equal(strict.json.bridgeValid, false);
});

test('paths reports local files without contacting the bridge or printing tokens', { timeout: 30_000 }, async t => {
  const directory = await testDirectory(t, 'batch3-paths-');
  const env = { MC_AGENT_HOME: directory };
  const token = 'secret-paths-token'.repeat(4);
  const empty = await cli(['paths'], { env });
  assert.equal(empty.code, 0, empty.stderr);
  assert.deepEqual(empty.json, { dataDirectory: directory, defaultBridgeFile: join(directory, 'bridge.json'), profileFile: join(directory, 'profile.json'),
    profileExists: false, bridgeFile: join(directory, 'bridge.json'), bridgeExists: false, waypointsFile: join(directory, 'waypoints.json'), waypointsExists: false });

  const external = join(directory, 'profile-dir', 'bridge.json');
  await mkdir(join(directory, 'profile-dir'));
  await writeFile(external, JSON.stringify({ protocol: 1, url: 'http://127.0.0.1:1', token }));
  await writeFile(join(directory, 'profile.json'), JSON.stringify({ discoveryPath: external }));
  await writeFile(join(directory, 'waypoints.json'), '{}');
  const attached = await cli(['paths'], { env });
  assert.deepEqual([attached.json.profileExists, attached.json.bridgeFile, attached.json.bridgeExists, attached.json.waypointsExists], [true, external, true, true]);
  assert.ok(!attached.stdout.includes(token));

  const chosen = await cli(['--bridge', join(directory, 'other.json'), 'paths'], { env });
  assert.deepEqual([chosen.json.bridgeFile, chosen.json.bridgeExists, chosen.json.defaultBridgeFile], [join(directory, 'other.json'), false, join(directory, 'bridge.json')]);
});
