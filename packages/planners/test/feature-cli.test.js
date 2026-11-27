import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { startBridge } from '../../../src/bridge-server.js';
import { Harness } from '../../../src/harness.js';
import { DemoDriver } from '../../../src/demo-driver.js';
import { supplyCommands } from '../src/supplies.js';
import { SURVEY_REPORTS } from '../src/survey.js';
import { testDirectory } from '../../../test/helpers.js';
import { CLI_PATH } from './cli-path.js';

const exec = promisify(execFile);
test('all 50 observation CLI additions traverse the authenticated bridge without taking control', {
  timeout: 60000,
}, async (t) => {
  const directory = await testDirectory(t);
  const discoveryPath = join(directory, 'bridge.json');
  const harness = new Harness(new DemoDriver({ scenario: 'stocked' }));
  const bridge = await startBridge(harness, { discoveryPath });
  t.after(() => bridge.close());
  const before = await harness.observe();
  const supplied = {
    ranked: ['3'],
    matching: ['log'],
    stacks: ['oak_log'],
    need: ['oak_log', '20'],
    reserve: ['oak_log', '2'],
    capacity: ['oak_log', '20'],
    packing: ['oak_log', '128'],
    meal: ['20'],
    'deposit-plan': ['oak_log', '2'],
    'storage-matching': ['log'],
    'storage-need': ['oak_log', '20'],
    'storage-richest': ['oak_log'],
    'storage-spread': ['oak_log'],
    compare: ['oak_log', 'dirt'],
  };
  for (const [group, commands] of [
    ['supplies', supplyCommands.map(([signature]) => signature.split(' ')[0])],
    ['survey', Object.keys(SURVEY_REPORTS)],
  ]) {
    for (const command of commands) {
      const { stdout, stderr } = await exec(process.execPath, [
        CLI_PATH,
        '--bridge',
        discoveryPath,
        '--json',
        group,
        command,
        ...(group === 'supplies' ? supplied[command] || [] : []),
      ]);
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

test('new spatial and stock reports cross the bridge during another controller lease', {
  timeout: 60000,
}, async (t) => {
  const { SCENE_COMMANDS } = await import('../src/scene-tools.js');
  const { STOCK_COMMANDS } = await import('../src/stock-tools.js');
  const directory = await testDirectory(t),
    discoveryPath = join(directory, 'bridge.json');
  const harness = new Harness(new DemoDriver({ scenario: 'stocked' }), { leaseMs: 120000 });
  const bridge = await startBridge(harness, { discoveryPath });
  t.after(() => bridge.close());
  // Establish home before the observer exercises home-relative reports.
  const owner = '11111111-1111-4111-8111-111111111111';
  harness.acquire(owner);
  harness.start(owner, { type: 'set_home' });
  await harness.task;
  harness.job = null;
  const before = await harness.observe();
  const stock = {
    'kit-check': ['oak_log=8'],
    'kit-restock': ['oak_log=8'],
    'kit-deposit': ['oak_log=8'],
    'kit-capacity': ['oak_log=8'],
    'kit-trips': ['oak_log=8'],
    'kit-scale': ['2', 'oak_log=8'],
    'least-stocked': ['5'],
    'count-range': ['0', '100'],
    only: ['oak_log'],
    exclude: ['oak_log'],
    'food-portions': ['10'],
    'food-duration': ['10'],
    'storage-within': ['16'],
    'storage-older': ['60'],
    'source-plan': ['oak_log', '8'],
    'stack-fill': ['50'],
  };
  for (const [group, commands] of [
    ['stock', STOCK_COMMANDS],
    ['scene', SCENE_COMMANDS],
  ])
    for (const [sig] of commands) {
      const name = sig.split(' ')[0];
      let args = stock[name] ?? [];
      if (group === 'scene') {
        const kind = name.split('-').at(-1);
        args =
          {
            box: ['-16,0,-16', '16,100,16'],
            layer: ['60', '70'],
            chunk: ['0', '0'],
            around: ['0,64,0', '16'],
            home: ['16'],
            shell: ['0', '16'],
          }[kind] ?? (name === 'block-clearance' ? ['oak_log'] : []);
      }
      const { stdout, stderr } = await exec(process.execPath, [
        CLI_PATH,
        '--bridge',
        discoveryPath,
        '--json',
        group,
        name,
        '--',
        ...args,
      ]);
      assert.ok(JSON.parse(stdout), `${group} ${name}`);
      assert.equal(stderr, '');
    }
  const after = await harness.observe();
  assert.equal(after.mode, before.mode);
  assert.equal(harness.owner, owner);
  assert.equal(after.job, null);
  assert.deepEqual(after.player, before.player);
  assert.deepEqual(after.inventory, before.inventory);
  assert.deepEqual(after.containers, before.containers);
});
