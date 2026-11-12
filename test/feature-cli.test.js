import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { startBridge } from '../src/bridge-server.js';
import { Harness } from '../src/harness.js';
import { DemoDriver } from '../src/demo-driver.js';
import { supplyCommands } from '../src/supplies.js';
import { SURVEY_REPORTS } from '../src/survey.js';
import { testDirectory } from './helpers.js';

const exec = promisify(execFile);
test('all 50 observation CLI additions traverse the authenticated bridge without taking control', { timeout: 60000 }, async t => {
  const directory = await testDirectory(t);
  const discoveryPath = join(directory, 'bridge.json');
  const harness = new Harness(new DemoDriver({ scenario: 'stocked' }));
  const bridge = await startBridge(harness, { discoveryPath });
  t.after(() => bridge.close());
  const before = await harness.observe();
  const supplied = { ranked: ['3'], matching: ['log'], stacks: ['oak_log'], need: ['oak_log', '20'], reserve: ['oak_log', '2'], capacity: ['oak_log', '20'], packing: ['oak_log', '128'], meal: ['20'], 'deposit-plan': ['oak_log', '2'], 'storage-matching': ['log'], 'storage-need': ['oak_log', '20'], 'storage-richest': ['oak_log'], 'storage-spread': ['oak_log'], compare: ['oak_log', 'dirt'] };
  for (const [group, commands] of [['supplies', supplyCommands.map(([signature]) => signature.split(' ')[0])], ['survey', Object.keys(SURVEY_REPORTS)]]) {
    for (const command of commands) {
      const { stdout, stderr } = await exec(process.execPath, ['src/cli.js', '--bridge', discoveryPath, '--json', group, command, ...(group === 'supplies' ? supplied[command] || [] : [])]);
      assert.ok(JSON.parse(stdout), `${group} ${command}`);
      assert.equal(stderr, '');
    }
  }
  const after = await harness.observe();
  assert.equal(after.mode, before.mode);
  assert.equal(after.job, null);
  assert.deepEqual(after.player, before.player);
  assert.deepEqual(after.inventory, before.inventory);
  assert.deepEqual(after.containers, before.containers);
});
