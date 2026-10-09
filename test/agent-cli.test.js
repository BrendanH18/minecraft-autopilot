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

test('CLI verification returns exit 2 for a false success claim and exit 0 for observed criteria', { timeout: 15_000 }, async t => {
  const directory = await testDirectory(t, 'agent-cli-');
  const discoveryPath = join(directory, 'bridge.json');
  const driver = new DemoDriver();
  driver.home = { ...driver.player.position };
  driver.player.position.x = 5;
  driver.inventory.push({ name: 'minecraft:oak_log', count: 10, slot: 1 });
  const harness = new Harness(driver);
  const bridge = await startBridge(harness, { discoveryPath });
  let decisions = [{ type: 'done', reason: 'Everything is complete.' }];
  const model = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const input = JSON.parse(JSON.parse(Buffer.concat(chunks).toString()).messages[1].content);
    assert.equal(input.criteria.collect.initialCount, 10);
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ message: { content: JSON.stringify(decisions.shift()) } }));
  });
  await new Promise(resolve => model.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await bridge.close();
    model.closeAllConnections();
    await new Promise(resolve => model.close(resolve));
  });
  const run = () => new Promise(resolve => execFile(process.execPath, [join(projectRoot, 'src/cli.js'), '--bridge', discoveryPath,
    'agent', 'Collect eight additional oak logs and return home', '--model', 'mock', '--ollama', `http://127.0.0.1:${model.address().port}`,
    '--verify-collect', 'oak_log:8', '--verify-home'], { timeout: 10_000 }, (error, stdout, stderr) => resolve({ error, stdout, stderr })));
  const falseClaim = await run();
  assert.equal(falseClaim.error?.code, 2, falseClaim.stderr);
  assert.equal(JSON.parse(falseClaim.stdout).status, 'criteria_unmet');
  assert.equal(harness.observe().mode, 'manual');
  decisions = [{ type: 'collect', block: 'oak_log', count: 8 }, { type: 'home' }, { type: 'done', reason: 'Returned with the logs.' }];
  const completed = await run();
  assert.equal(completed.error, null, completed.stderr);
  const result = JSON.parse(completed.stdout);
  assert.equal(result.status, 'criteria_met');
  assert.equal(result.verification.checks.inventory.currentCount, 18);
  assert.equal(result.verification.checks.home.distance, 0);
  assert.equal(harness.observe().mode, 'manual');
});
