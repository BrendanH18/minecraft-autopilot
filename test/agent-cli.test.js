import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { projectRoot } from '../src/config.js';
import { Harness } from '../src/harness.js';
import { DemoDriver } from '../src/demo-driver.js';
import { startBridge } from '../src/bridge-server.js';
import { testDirectory } from './helpers.js';

test('CLI verification returns exit 2 for a false success claim and exit 0 for observed criteria', {
  timeout: 15_000,
}, async (t) => {
  const directory = await testDirectory(t, 'agent-cli-');
  const discoveryPath = join(directory, 'bridge.json');
  const driver = new DemoDriver();
  driver.home = { ...driver.player.position };
  driver.player.position.x = 5;
  driver.inventory.push({ name: 'minecraft:oak_log', count: 10, slot: 1 });
  const harness = new Harness(driver);
  const bridge = await startBridge(harness, { discoveryPath });
  // A false claim is repeated after the rejected attempts.
  const thinking = [];
  let decisions = Array.from({ length: 3 }, () => ({ type: 'done', reason: 'Everything is complete.' }));
  const model = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    thinking.push(body.think);
    const input = JSON.parse(body.messages[1].content);
    assert.equal(input.criteria.collect.initialCount, 10);
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ message: { content: JSON.stringify(decisions.shift()) } }));
  });
  await new Promise((resolve) => model.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await bridge.close();
    model.closeAllConnections();
    await new Promise((resolve) => model.close(resolve));
  });
  const run = (...extra) =>
    new Promise((resolve) =>
      execFile(
        process.execPath,
        [
          join(projectRoot, 'src/cli.js'),
          '--bridge',
          discoveryPath,
          'agent',
          'Collect eight additional oak logs and return home',
          '--model',
          'mock',
          '--ollama',
          `http://127.0.0.1:${model.address().port}`,
          '--verify-collect',
          'oak_log:8',
          '--verify-home',
          ...extra,
        ],
        { timeout: 10_000 },
        (error, stdout, stderr) => resolve({ error, stdout, stderr }),
      ),
    );
  const falseClaim = await run();
  assert.equal(falseClaim.error?.code, 2, falseClaim.stderr);
  assert.equal(JSON.parse(falseClaim.stdout).status, 'criteria_unmet');
  assert.equal(harness.observe().mode, 'manual');
  decisions = [
    { type: 'collect', block: 'oak_log', count: 8 },
    { type: 'home' },
    { type: 'done', reason: 'Returned with the logs.' },
  ];
  const completed = await run('--no-thinking');
  assert.equal(completed.error, null, completed.stderr);
  const result = JSON.parse(completed.stdout);
  assert.equal(result.status, 'criteria_met');
  assert.equal(result.verification.checks.inventory.currentCount, 18);
  assert.equal(result.verification.checks.home.distance, 0);
  assert.deepEqual(thinking, [undefined, undefined, undefined, false, false, false]);
  assert.equal(harness.observe().mode, 'manual');
});

test('CLI exposes final-state criteria and returns exit 2 at a step limit', { timeout: 15_000 }, async (t) => {
  const directory = await testDirectory(t, 'criteria-cli-');
  const driver = new DemoDriver();
  driver.home = { ...driver.player.position };
  const harness = new Harness(driver);
  const discoveryPath = join(directory, 'bridge.json');
  const bridge = await startBridge(harness, { discoveryPath });
  let decision = { type: 'done', reason: 'Observed final state.' };
  const model = createServer((request, response) => {
    request.resume();
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ message: { content: JSON.stringify(decision) } }));
  });
  await new Promise((resolve) => model.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await bridge.close();
    model.closeAllConnections();
    await new Promise((resolve) => model.close(resolve));
  });
  const run = (...flags) =>
    new Promise((resolve) =>
      execFile(
        process.execPath,
        [
          join(projectRoot, 'src/cli.js'),
          '--bridge',
          discoveryPath,
          'agent',
          'Check the final state',
          '--model',
          'mock',
          '--steps',
          '1',
          '--ollama',
          `http://127.0.0.1:${model.address().port}`,
          ...flags,
        ],
        { timeout: 10_000 },
        (error, stdout, stderr) => resolve({ error, stdout, stderr }),
      ),
    );
  const passed = await run(
    '--verify-health',
    '20',
    '--verify-hunger',
    '14',
    '--verify-at',
    '0,64,0,0',
    '--verify-inventory',
    'bread:8',
    '--verify-max-threats',
    '0',
    '--verify-home',
    '--verify-home-radius',
    '0',
  );
  assert.equal(passed.error, null, passed.stderr);
  const result = JSON.parse(passed.stdout);
  assert.equal(result.status, 'criteria_met');
  for (const check of Object.values(result.verification.checks)) assert.equal(check.met, true);
  decision = { type: 'goto', x: 0, y: 64, z: 0 };
  const limited = await run('--verify-hunger', '20');
  assert.equal(limited.error?.code, 2, limited.stderr);
  assert.equal(JSON.parse(limited.stdout).status, 'step_limit');
  const invalid = await run('--verify-home-radius', '1');
  assert.equal(invalid.error?.code, 1);
  assert.match(invalid.stderr, /requires returnHome/);
  assert.equal(harness.observe().mode, 'manual');
});
