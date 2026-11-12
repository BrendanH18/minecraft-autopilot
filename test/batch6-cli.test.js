import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { startBridge } from '../src/bridge-server.js';
import { Harness } from '../src/harness.js';
import { DemoDriver } from '../src/demo-driver.js';
import { LOGISTICS_COMMANDS } from '../src/logistics-tools.js';
import { TERRAIN_COMMANDS } from '../src/terrain-tools.js';
import { TIMELINE_COMMANDS, timelineReport } from '../src/timeline-tools.js';
import { AUDIT_COMMANDS, routineAudit } from '../src/routine-audit.js';
import { testDirectory } from './helpers.js';

const exec = promisify(execFile);
const logisticsArgs = {
  'carried-bundles': ['oak_log=16', 'torch=32'], 'pooled-bundles': ['oak_log=16', 'torch=32'],
  'bundle-shortage': ['3', 'oak_log=64', 'bread=4'], 'split-manifest': ['3', 'oak_log=8', 'bread=2'],
  'restock-stops': ['oak_log=100', 'bread=8'], 'balance-item': ['oak_log'], 'fewest-sources': ['oak_log', '45'],
  'retain-percent': ['25'], 'withdraw-percent': ['25'], 'storage-redundancy': ['2'], 'freshness-summary': ['5'],
  'kit-containers': ['oak_log=20', 'bread=1'], 'source-distances': ['oak_log'],
};
const terrainArgs = {
  cylinder: ['12', '-2', '4'], corridor: ['0,64,0', '20,64,0', '3'], 'nearest-k': ['0,64,0', '5'],
  grid: ['4'], spread: [], projection: ['0,64,0', '20,64,0'],
  'block-components': ['oak_log'], 'block-surface': ['oak_log'], 'block-neighbors': ['0,64,0'],
  'block-height-profile': ['x'], 'block-cross-section': ['y', '64'],
};
test('all 50 logistics and terrain commands cross authenticated bridge during another owner lease', { timeout: 120000 }, async t => {
  const directory = await testDirectory(t), discoveryPath = join(directory, 'bridge.json');
  const harness = new Harness(new DemoDriver({ scenario: 'stocked' }), { leaseMs: 180000 });
  const bridge = await startBridge(harness, { discoveryPath });
  t.after(() => bridge.close());
  const owner = '11111111-1111-4111-8111-111111111111';
  harness.acquire(owner);
  const before = await harness.observe();
  let exercised = 0;
  for (const [group, commands] of [['logistics', LOGISTICS_COMMANDS], ['terrain', TERRAIN_COMMANDS]]) for (const [signature] of commands) {
    const name = signature.split(' ')[0];
    const kind = name.replace(/^(blocks|threats|containers)-/, '');
    const args = group === 'logistics' ? logisticsArgs[name] ?? [] : terrainArgs[name] ?? terrainArgs[kind] ?? [];
    const { stdout, stderr } = await exec(process.execPath, ['src/cli.js', '--bridge', discoveryPath, '--json', group, name, '--', ...args]);
    const output = JSON.parse(stdout);
    assert.equal(typeof output.note, 'string', `${group} ${name}`);
    assert.equal(stderr, '');
    assert.equal(harness.owner, owner, `${group} ${name} retained owner`);
    exercised++;
  }
  assert.equal(exercised, 50);
  const after = await harness.observe();
  assert.equal(after.mode, before.mode); assert.equal(after.job, null);
  assert.deepEqual(after.player, before.player); assert.deepEqual(after.inventory, before.inventory); assert.deepEqual(after.containers, before.containers);
});

test('all 50 timeline and audit commands run offline as real CLI processes', { timeout: 120000 }, async t => {
  const directory = await testDirectory(t);
  const samples = [
    { savedAt: '2026-01-01T00:00:00Z', player: { position: { x: 0, y: 64, z: 0 }, dimension: 'minecraft:overworld', health: 20, hunger: 15 }, inventory: [{ name: 'minecraft:dirt', count: 2 }] },
    { savedAt: '2026-01-01T00:01:00Z', player: { position: { x: 3, y: 64, z: 4 }, dimension: 'minecraft:overworld', health: 17, hunger: 20 }, inventory: [{ name: 'minecraft:dirt', count: 7 }] },
  ];
  const actions = [{ type: 'set_home' }, { type: 'collect', block: 'minecraft:oak_log', count: 8 }, { type: 'wait', seconds: 6 }, { type: 'goto', x: 4, y: 64, z: 0 }, { type: 'deposit', item: 'minecraft:oak_log', count: 8 }, { type: 'home' }];
  const files = samples.map((_, i) => join(directory, `snapshot-${i}.json`)), routine = join(directory, 'routine.json');
  await Promise.all([...files.map((file, i) => writeFile(file, JSON.stringify(samples[i]))), writeFile(routine, JSON.stringify(actions))]);
  const timelineArgs = { 'item-history': ['dirt'], 'item-rate': ['dirt'], 'item-peak': ['dirt'], 'item-target': ['dirt', '5'], 'largest-gains': ['2'], 'largest-losses': ['2'] };
  const auditArgs = { allowlist: ['collect', 'wait'], 'collect-ceiling': ['4'], 'wait-ceiling': ['4'], 'deposit-ceiling': ['4'], 'travel-ceiling': ['10'], 'altitude-bands': ['16'], 'collect-streaks': ['2'], 'wait-budget': ['4'], 'execution-sections': ['2'], 'split-collect': ['4'], 'split-waits': ['4'], 'split-deposits': ['4'], 'pause-before': ['collect', '2'], 'checkpoint-after': ['collect'], 'repeat-step': ['2', '2'], 'remove-range': ['1', '1'], 'set-goto-height': ['70'] };
  let exercised = 0;
  for (const [group, commands] of [['timeline', TIMELINE_COMMANDS], ['audit', AUDIT_COMMANDS]]) for (const [signature] of commands) {
    const name = signature.split(' ')[0], args = (group === 'timeline' ? timelineArgs : auditArgs)[name] ?? [];
    const params = group === 'timeline' ? [...args, ...files] : [routine, ...args];
    // A nonexistent bridge proves these commands do not need a running backend.
    const { stdout, stderr } = await exec(process.execPath, ['src/cli.js', '--bridge', join(directory, 'does-not-exist.json'), '--json', group, name, ...params]);
    const expected = group === 'timeline' ? timelineReport(samples, name, args) : routineAudit(actions, name, ...args);
    assert.deepEqual(JSON.parse(stdout), expected, `${group} ${name}`); assert.equal(stderr, ''); exercised++;
  }
  assert.equal(exercised, 50);
});
