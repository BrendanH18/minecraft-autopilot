import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { projectRoot, readBridge } from '../src/config.js';
import { DemoDriver } from '../src/demo-driver.js';
import { Harness } from '../src/harness.js';
import { startBridge } from '../src/bridge-server.js';
import { parseRoutine, loadRoutine, runRoutine, MAX_ROUTINE_BYTES } from '../src/routine.js';
import { inspectPrerequisites, checkOllama } from '../src/doctor.js';
import { testDirectory } from './helpers.js';

const cliPath = join(projectRoot, 'src/cli.js');
function cli(args, { env } = {}) {
  return new Promise(resolve => execFile(process.execPath, [cliPath, ...args], { timeout: 20_000, env: { ...process.env, ...env } },
    (error, stdout, stderr) => resolve({ code: error ? error.code ?? 1 : 0, stdout, stderr, json: stdout.trim() ? JSON.parse(stdout) : null })));
}

async function demoBridge(t, options) {
  const directory = await testDirectory(t, 'routine-mcp-');
  const driver = new DemoDriver(options);
  const harness = new Harness(driver, { leaseMs: 60_000 });
  const discoveryPath = join(directory, 'bridge.json');
  const bridge = await startBridge(harness, { discoveryPath });
  t.after(() => bridge.close());
  let acquisitions = 0;
  const acquire = harness.acquire.bind(harness);
  harness.acquire = leaseId => { acquisitions++; return acquire(leaseId); };
  return { directory, driver, harness, discoveryPath, acquisitions: () => acquisitions, run: (...args) => cli(['--bridge', discoveryPath, ...args]) };
}

function patchEating(driver, { restores = 5 } = {}) {
  const execute = driver.execute.bind(driver);
  driver.execute = async (action, options) => {
    if (action.type !== 'eat') return execute(action, options);
    const food = driver.inventory.find(item => item.name === 'minecraft:bread' && item.count > 0);
    if (!food) throw new Error('No food.');
    food.count--;
    driver.player.hunger = Math.min(20, driver.player.hunger + restores);
  };
}

test('routines accept an actions object or bare array and report the first invalid step by index', () => {
  assert.deepEqual(parseRoutine('[{"type":"collect","block":"oak_log","count":2}]'), [{ type: 'collect', block: 'minecraft:oak_log', count: 2 }]);
  assert.equal(parseRoutine(JSON.stringify({ actions: [{ type: 'set_home' }, { type: 'home' }] })).length, 2);
  assert.throws(() => parseRoutine('[{"type":"eat"},{"type":"goto","x":0,"y":400,"z":0}]'), /step 2 \(index 1\).*y:/);
  assert.throws(() => parseRoutine('[{"type":"eat","extra":1}]'), /step 1 \(index 0\)/);
  assert.throws(() => parseRoutine('[{"type":"fly"}]'), /step 1/);
  assert.throws(() => parseRoutine('[]'), /1 to 100 actions; found 0/);
  assert.throws(() => parseRoutine(JSON.stringify(Array(101).fill({ type: 'eat' }))), /found 101/);
  assert.throws(() => parseRoutine('{"actions":[{"type":"eat"}],"loop":true}'), /Unknown routine field: loop/);
  assert.throws(() => parseRoutine('{"type":"eat"}'), /Unknown routine field/);
  assert.throws(() => parseRoutine('"eat"'), /must be/);
  assert.throws(() => parseRoutine('{nope'), /not valid JSON/);
});

test('routine files over 1 MiB, directories, and missing files are refused', async t => {
  const directory = await testDirectory(t, 'routine-');
  const large = join(directory, 'large.json');
  await writeFile(large, `[${' '.repeat(MAX_ROUTINE_BYTES)}{"type":"eat"}]`);
  await assert.rejects(loadRoutine(large), /at most 1 MiB/);
  await assert.rejects(loadRoutine(directory), /regular file/);
  await assert.rejects(loadRoutine(join(directory, 'missing.json')), /Cannot read routine file/);
  const ok = join(directory, 'ok.json');
  await writeFile(ok, `[${' '.repeat(MAX_ROUTINE_BYTES - 20)}{"type":"eat"}]`);
  assert.equal((await loadRoutine(ok)).length, 1);
});

test('run validates every step first, executes in order under one lease, and stops at the first failure', { timeout: 60_000 }, async t => {
  const { directory, driver, harness, run, acquisitions } = await demoBridge(t);
  const routine = join(directory, 'routine.json');
  await writeFile(routine, JSON.stringify({ actions: [{ type: 'set_home' }, { type: 'goto', x: 2, y: 64, z: -2 },
    { type: 'collect', block: 'oak_log', count: 3 }, { type: 'deposit', item: 'oak_log', count: 3 }, { type: 'home' }] }));
  const dry = await cli(['--bridge', join(directory, 'missing-bridge.json'), 'run', '--dry-run', routine]);
  assert.equal(dry.code, 0);
  assert.deepEqual(dry.json, { status: 'validated', total: 5, actions: parseRoutine(JSON.stringify([{ type: 'set_home' }, { type: 'goto', x: 2, y: 64, z: -2 },
    { type: 'collect', block: 'oak_log', count: 3 }, { type: 'deposit', item: 'oak_log', count: 3 }, { type: 'home' }])) });
  assert.equal(acquisitions(), 0);

  const result = await run('run', routine);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.json.status, 'completed');
  assert.equal(result.json.completed, 5);
  assert.equal(result.json.total, 5);
  assert.deepEqual(result.json.results.map(job => job.type), ['set_home', 'goto', 'collect', 'deposit', 'home']);
  assert.match(result.stderr, /Step 1\/5: set_home[\s\S]*Step 5\/5: home/);
  assert.equal(acquisitions(), 1);
  assert.equal(harness.observe().mode, 'manual');
  assert.deepEqual(driver.player.position, { x: 0, y: 64, z: 0 });
  assert.equal(driver.chest.items.find(item => item.name === 'minecraft:oak_log').count, 3);

  await writeFile(routine, JSON.stringify([{ type: 'goto', x: 1, y: 64, z: 1 }, { type: 'deposit', item: 'dirt', count: 5 }, { type: 'goto', x: 9, y: 64, z: 9 }]));
  const failed = await run('run', routine);
  assert.equal(failed.code, 1);
  assert.equal(failed.json.status, 'failed');
  assert.equal(failed.json.completed, 1);
  assert.equal(failed.json.failedStep, 2);
  assert.match(failed.json.error, /Only 0 minecraft:dirt/);
  assert.deepEqual(driver.player.position, { x: 1, y: 64, z: 1 });
  assert.equal(harness.observe().mode, 'manual');

  await writeFile(routine, JSON.stringify([{ type: 'goto', x: 3, y: 64, z: 3 }, { type: 'collect', block: 'oak_log', count: 65 }]));
  const invalid = await run('run', routine);
  assert.equal(invalid.code, 1);
  assert.match(invalid.stderr, /step 2 \(index 1\) is invalid: count/);
  assert.equal(acquisitions(), 2);
  assert.deepEqual(driver.player.position, { x: 1, y: 64, z: 1 });
});

test('runRoutine stops without dispatching further steps once control returns to the player', { timeout: 30_000 }, async t => {
  const { harness, discoveryPath } = await demoBridge(t);
  const { FabricAdapter } = await import('../src/fabric-adapter.js');
  const adapter = await FabricAdapter.connect(discoveryPath);
  t.after(() => adapter.close());
  const executed = [];
  const execute = adapter.execute.bind(adapter);
  adapter.execute = async (action, options) => {
    executed.push(action.type);
    const job = await execute(action, options);
    harness.release('Player pressed F8.');
    return job;
  };
  const result = await runRoutine(adapter, parseRoutine('[{"type":"set_home"},{"type":"eat"}]'));
  assert.deepEqual(executed, ['set_home']);
  assert.equal(result.status, 'failed');
  assert.equal(result.completed, 1);
  assert.match(result.error, /Control returned to the player/);
});

test('goto --relative offsets from the observed position and validates the target before taking control', { timeout: 30_000 }, async t => {
  const { driver, harness, run, acquisitions } = await demoBridge(t);
  driver.player.position = { x: 10, y: 64, z: -5 };
  const moved = await run('goto', '--relative', '2', '-1', '-3');
  assert.equal(moved.code, 0, moved.stderr);
  assert.deepEqual(driver.player.position, { x: 12, y: 63, z: -8 });
  const outside = await run('goto', '--relative', '0', '300', '0');
  assert.equal(outside.code, 1);
  assert.match(outside.stderr, /Relative target 12 363 -8 is outside the world/);
  assert.equal(acquisitions(), 1);
  assert.equal(harness.observe().mode, 'manual');
});

test('eat --until repeats meals to a hunger target and stops clearly on no food, no change, or the meal limit', { timeout: 60_000 }, async t => {
  const { driver, harness, run, acquisitions } = await demoBridge(t, { scenario: 'hungry' });
  assert.deepEqual((await run('eat', '--until', '3')).json, { status: 'already_satisfied', meals: 0, hunger: 4, target: 3 });
  assert.equal(acquisitions(), 0);
  for (const value of ['0', '21', '2.5']) assert.equal((await run('eat', '--until', value)).code, 1);

  patchEating(driver);
  const fed = await run('eat', '--until', '18');
  assert.equal(fed.code, 0, fed.stderr);
  assert.deepEqual(fed.json, { status: 'completed', meals: 3, hunger: 19, target: 18 });
  assert.match(fed.stderr, /Meal 1: hunger 4\/18/);
  assert.equal(driver.inventory[0].count, 5);
  assert.equal(acquisitions(), 1);
  assert.equal(harness.observe().mode, 'manual');

  driver.player.hunger = 4;
  driver.inventory[0].count = 1;
  const runOut = await run('eat', '--until', '20');
  assert.equal(runOut.code, 1);
  assert.match(runOut.stderr, /Stopped after 1 meal\(s\) at hunger 9\/20: No food\. Food may have run out/);
  assert.equal(harness.observe().mode, 'manual');

  driver.inventory[0].count = 20;
  driver.player.hunger = 4;
  patchEating(driver, { restores: 0 });
  const unchanged = await run('eat', '--until', '20');
  assert.match(unchanged.stderr, /Hunger stayed at 4 after eating; stopping after 1 meal\(s\)/);

  driver.player.hunger = 0;
  patchEating(driver, { restores: 1 });
  const limited = await run('eat', '--until', '20');
  assert.match(limited.stderr, /Hunger is 10 after 10 meals, below the target of 20/);
  assert.equal(driver.inventory[0].count, 9);
  assert.equal(harness.observe().mode, 'manual');
});

test('demo scenarios set hungry, hostile, and stocked starting states without changing the default', () => {
  const standard = new DemoDriver().observe();
  assert.deepEqual([standard.player.health, standard.player.hunger, standard.threats, standard.containers[0].items], [20, 14, [], null]);
  assert.deepEqual(new DemoDriver({ scenario: 'default' }).observe(), standard);
  const hungry = new DemoDriver({ scenario: 'hungry' }).observe();
  assert.deepEqual([hungry.player.health, hungry.player.hunger], [10, 4]);
  const hostile = new DemoDriver({ scenario: 'hostile' });
  assert.deepEqual(hostile.observe().threats, [{ type: 'minecraft:zombie', x: 4, y: 64, z: -3, distance: 5 }]);
  hostile.player.position = { x: 4, y: 64, z: 0 };
  assert.equal(hostile.observe().threats[0].distance, 3);
  const stocked = new DemoDriver({ scenario: 'stocked' }).observe().containers[0];
  assert.deepEqual(stocked.items, [{ name: 'minecraft:oak_log', count: 12 }, { name: 'minecraft:cobblestone', count: 5 }]);
  assert.ok(Number.isFinite(stocked.observedAt));
  assert.throws(() => new DemoDriver({ scenario: 'nether' }), /Unknown demo scenario/);
});

test('demo --scenario works for the smoke run and the long-running bridge', { timeout: 60_000 }, async t => {
  const directory = await testDirectory(t, 'demo-scenario-');
  const smoke = await cli(['demo', '--smoke', '--scenario', 'stocked'], { env: { MC_AGENT_HOME: directory } });
  assert.equal(smoke.code, 0, smoke.stderr);
  assert.equal(smoke.json.scenario, 'stocked');
  assert.deepEqual(smoke.json.containers[0].items, [{ name: 'minecraft:oak_log', count: 20 }, { name: 'minecraft:cobblestone', count: 5 }]);
  assert.match(smoke.stderr, /DEMO SIMULATION \(stocked scenario\)/);
  assert.equal((await cli(['demo', '--scenario', 'nether'], { env: { MC_AGENT_HOME: directory } })).code, 1);

  const discoveryPath = join(directory, 'bridge.json');
  const child = spawn(process.execPath, [cliPath, '--bridge', discoveryPath, 'demo', '--scenario', 'hostile'], { env: { ...process.env, MC_AGENT_HOME: directory }, stdio: 'ignore' });
  const exited = once(child, 'exit');
  t.after(() => child.kill('SIGKILL'));
  for (let attempt = 0; ; attempt++) {
    try { await readBridge(discoveryPath); break; } catch (error) { if (attempt > 100) throw error; await delay(100); }
  }
  const threats = await cli(['--bridge', discoveryPath, 'threats']);
  assert.deepEqual(threats.json.threats, [{ type: 'minecraft:zombie', x: 4, y: 64, z: -3, distance: 5 }]);
  child.kill('SIGINT');
  await exited;
});

test('MCP inventory, nearby, and release tools read without control and release only this session', { timeout: 30_000 }, async t => {
  const { harness, discoveryPath, acquisitions } = await demoBridge(t, { scenario: 'hostile' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [cliPath, '--bridge', discoveryPath, 'mcp'], stderr: 'pipe' });
  const client = new Client({ name: 'minecraft-test', version: '1.0.0' });
  t.after(() => client.close());
  await client.connect(transport);
  const call = async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args });
    const text = result.content[0].text;
    return { error: result.isError === true, value: text.startsWith('{') ? JSON.parse(text) : text };
  };
  const names = (await client.listTools()).tools.map(tool => tool.name);
  for (const name of ['minecraft_inventory', 'minecraft_nearby', 'minecraft_release']) assert.ok(names.includes(name));
  assert.equal(names.length, 8);

  const owner = '01234567-0123-4123-8123-0123456789ab';
  harness.acquire(owner);
  assert.deepEqual((await call('minecraft_inventory', { item: 'bread' })).value, { items: [{ name: 'minecraft:bread', count: 8 }], totalItems: 8, occupiedSlots: 1 });
  assert.equal((await call('minecraft_inventory', { item: 'oak_log' })).value.totalItems, 0);
  assert.equal((await call('minecraft_inventory')).value.occupiedSlots, 1);
  assert.match((await call('minecraft_inventory', { item: '../bread' })).value.error, /Minecraft item/);
  assert.equal((await call('minecraft_nearby', { kind: 'threats' })).value.threats[0].distance, 5);
  assert.equal((await call('minecraft_nearby', { kind: 'threats', radius: 4 })).value.observedCount, 0);
  const blocks = (await call('minecraft_nearby', { kind: 'blocks', name: 'oak_log', limit: 1 })).value;
  assert.equal(blocks.blocks[0].name, 'minecraft:oak_log');
  const containers = (await call('minecraft_nearby', { kind: 'containers', name: 'chest' })).value;
  assert.equal(containers.contents, 'last_observed');
  assert.equal(containers.containers.length, 1);
  for (const args of [{ kind: 'entities' }, { kind: 'blocks', radius: 0 }, { kind: 'blocks', limit: 1.5 }, { kind: 'threats', name: 'zombie' }]) {
    assert.equal((await call('minecraft_nearby', args)).error, true);
  }
  assert.deepEqual((await call('minecraft_release')).value, { controlled: false, released: false });
  assert.equal(harness.owner, owner);
  harness.release();

  assert.equal((await call('minecraft_take_control')).error, false);
  const pending = call('minecraft_action', { action: { type: 'wait', seconds: 30 } });
  for (let attempt = 0; harness.job?.status !== 'running'; attempt++) { assert.ok(attempt < 100); await delay(50); }
  assert.deepEqual((await call('minecraft_release')).value, { controlled: false, released: true });
  assert.equal((await pending).error, true);
  assert.equal(harness.observe().mode, 'manual');
  assert.equal(harness.job.status, 'cancelled');
  assert.deepEqual((await call('minecraft_release')).value, { controlled: false, released: false });
  assert.equal((await call('minecraft_take_control')).error, false);
  assert.equal(harness.observe().mode, 'agent');
  await call('minecraft_release');
  assert.equal(acquisitions(), 3);
});

test('doctor requires the package Node range and checks Ollama only when asked', async t => {
  const directory = await testDirectory(t, 'doctor-ollama-');
  const jdk = name => ({ status: 0, stderr: name === 'java' ? 'openjdk version "21.0.8"' : '', stdout: name === 'java' ? '' : `${name} 21.0.8` });
  const base = { root: directory, discoveryPath: join(directory, 'bridge.json'), run: jdk, fetchImpl: () => { throw new Error('offline doctor must not fetch'); } };
  const old = await inspectPrerequisites({ ...base, nodeVersion: '22.11.0' });
  assert.deepEqual([old.nodeRequired, old.nodeSupported, old.node], ['>=22.12', false, 'v22.11.0']);
  assert.match(old.next, /Node\.js 22\.12 or newer/);
  assert.equal((await inspectPrerequisites({ ...base, nodeVersion: '22.12.0' })).nodeSupported, true);
  assert.equal((await inspectPrerequisites({ ...base, nodeVersion: 'v23.0.1' })).nodeSupported, true);
  assert.equal((await inspectPrerequisites({ ...base, nodeVersion: '21.99.0' })).nodeSupported, false);
  assert.equal('ollama' in (await inspectPrerequisites(base)), false);

  const requests = [];
  const server = createServer((request, response) => {
    requests.push({ method: request.method, url: request.url, authorization: request.headers.authorization });
    if (request.url === '/api/version') { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end('{"version":"0.12.3"}'); }
    else { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const { stdout } = await cli(['--bridge', join(directory, 'bridge.json'), 'doctor', '--ollama', url]);
  assert.deepEqual(JSON.parse(stdout).ollama, { url, reachable: true, version: '0.12.3' });
  assert.deepEqual(requests, [{ method: 'GET', url: '/api/version', authorization: undefined }]);

  const closed = createServer();
  await new Promise(resolve => closed.listen(0, '127.0.0.1', resolve));
  const closedUrl = `http://localhost:${closed.address().port}`;
  await new Promise(resolve => closed.close(resolve));
  const unreachable = await inspectPrerequisites({ ...base, fetchImpl: undefined, ollamaUrl: closedUrl, nodeVersion: '22.12.0' });
  assert.equal(unreachable.ollama.reachable, false);
  assert.match(unreachable.ollama.error, /ECONNREFUSED/);

  const silent = createServer(() => {});
  await new Promise(resolve => silent.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { silent.closeAllConnections(); silent.close(resolve); }));
  const timedOut = await checkOllama(`http://127.0.0.1:${silent.address().port}`, { timeoutMs: 200 });
  assert.deepEqual([timedOut.reachable, timedOut.error], [false, 'No reply within 0.2 seconds.']);
  assert.equal((await checkOllama(url, { fetchImpl: async () => new Response('{}') })).reachable, false);

  for (const bad of ['http://192.168.1.2:11434', 'http://user:secret@127.0.0.1:11434', 'ftp://127.0.0.1', 'not a url']) {
    await assert.rejects(inspectPrerequisites({ ...base, ollamaUrl: bad }), /localhost|credentials|local Ollama URL/);
  }
  const rejected = await cli(['--bridge', join(directory, 'bridge.json'), 'doctor', '--ollama', 'http://example.com']);
  assert.equal(rejected.code, 1);
  assert.match(rejected.stderr, /Ollama must run on localhost/);
});

test('runRoutine releases its control session after completing', { timeout: 30_000 }, async t => {
  const { harness, discoveryPath } = await demoBridge(t);
  const { FabricAdapter } = await import('../src/fabric-adapter.js');
  const adapter = await FabricAdapter.connect(discoveryPath);
  t.after(() => adapter.close());
  const result = await runRoutine(adapter, parseRoutine('[{"type":"set_home"}]'));
  assert.equal(result.status, 'completed');
  assert.equal(harness.observe().mode, 'manual');
  assert.equal(adapter.leaseId, null);
});

test('eat --until waits for automatic eating between meals instead of failing', { timeout: 30_000 }, async t => {
  const { driver, run } = await demoBridge(t, { scenario: 'hungry' });
  patchEating(driver);
  // The first meal is followed by an automatic meal that keeps the bot busy for a moment.
  let busyUntil = 0;
  let autoMeal = false;
  const observe = driver.observe.bind(driver);
  driver.isBusy = () => Date.now() < busyUntil;
  driver.observe = () => {
    if (driver.player.hunger === 9 && !autoMeal) { autoMeal = true; busyUntil = Date.now() + 1500; }
    if (autoMeal && !driver.isBusy() && driver.player.hunger === 9) driver.player.hunger = 14;
    return { ...observe(), recovering: driver.isBusy() };
  };
  const result = await run('eat', '--until', '18');
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.json, { status: 'completed', meals: 2, hunger: 19, target: 18 });
});

test('a forced snapshot replaces a symlink instead of writing through it', { timeout: 30_000 }, async t => {
  const { directory, run } = await demoBridge(t);
  const { symlink, writeFile, readFile, lstat } = await import('node:fs/promises');
  const target = join(directory, 'target.txt');
  const link = join(directory, 'snap.json');
  await writeFile(target, 'keep');
  await symlink(target, link);
  assert.equal((await run('snapshot', link, '--force')).code, 0);
  assert.equal(await readFile(target, 'utf8'), 'keep');
  assert.equal((await lstat(link)).isFile(), true);
  assert.equal((await lstat(link)).mode & 0o777, 0o600);
});
