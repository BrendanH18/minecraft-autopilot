import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdir, truncate } from 'node:fs/promises';
import { join } from 'node:path';
import { LEDGER_COMMANDS, ledgerReport, readLedgerSnapshot, SNAPSHOT_BYTES } from '../src/ledger-tools.js';
import { testDirectory } from './helpers.js';

const snapshot = (time, inventory) => ({ savedAt: `2026-01-01T00:0${time}:00Z`, player: { position: { x: 0, y: 64, z: 0 }, dimension: 'minecraft:overworld' }, inventory });
const before = snapshot(0, [{ name: 'oak_log', count: 65 }, { name: 'minecraft:bread', count: 4 }, { name: 'coal', count: 5 }]);
const after = snapshot(1, [{ name: 'minecraft:oak_log', count: 32 }, { name: 'bread', count: 8 }, { name: 'dirt', count: 64 }]);
const report = (name, ...args) => ledgerReport(before, after, name, args);

test('all 25 ledger behaviors have independently calculated results', () => {
  assert.equal(LEDGER_COMMANDS.length, 25);
  assert.equal(new Set(LEDGER_COMMANDS.map(c => c[0].split(' ')[0])).size, 25);
  const checks = {
    'item-percent': () => assert.equal(report('item-percent', 'bread').percent, 100),
    'composition-shift': () => { const i = report('composition-shift').items.find(i => i.name === 'minecraft:bread'); assert.equal(i.beforeShare, 4 / 74); assert.equal(i.afterShare, 8 / 104); },
    'new-types': () => assert.deepEqual(report('new-types').items.map(i => i.name), ['minecraft:dirt']),
    'vanished-types': () => assert.deepEqual(report('vanished-types').items.map(i => i.name), ['minecraft:coal']),
    'retained-stock': () => assert.equal(report('retained-stock').retained, 36),
    'replacement-load': () => { const r = report('replacement-load'); assert.equal(r.outgoing, 38); assert.equal(r.incoming, 68); },
    'quota-progress': () => { const r = report('quota-progress', 'oak_log', '70'); assert.equal(r.beforeMissing, 5); assert.equal(r.afterMissing, 38); },
    'quota-crossings': () => assert.deepEqual(report('quota-crossings', 'bread=6', 'oak_log=64').quotas.map(q => [q.name, q.direction]), [['minecraft:bread', 'up'], ['minecraft:oak_log', 'down']]),
    'kit-regressions': () => assert.deepEqual(report('kit-regressions', 'bread=6', 'oak_log=64').quotas.map(q => q.name), ['minecraft:oak_log']),
    'kit-progress': () => { const r = report('kit-progress', 'bread=6', 'oak_log=64'); assert.equal(r.required, 70); assert.equal(r.before, 68); assert.equal(r.after, 38); assert.equal(r.delta, -30); },
    'kit-bundles': () => { const r = report('kit-bundles', 'bread=2', 'oak_log=32'); assert.equal(r.before, 2); assert.equal(r.after, 1); },
    'food-change': () => { const r = report('food-change'); assert.equal(r.before, 20); assert.equal(r.after, 40); assert.equal(r.delta, 20); },
    'food-mix': () => { const r = report('food-mix').items; assert.equal(r.length, 1); assert.equal(r[0].beforeShare, 1); assert.equal(r[0].afterShare, 1); assert.equal(r[0].delta, 20); },
    'ration-change': () => { const r = report('ration-change', '10'); assert.equal(r.before, 2); assert.equal(r.after, 4); },
    'minimum-stacks': () => { const r = report('minimum-stacks'); assert.equal(r.before, 4); assert.equal(r.after, 3); },
    'item-stacks': () => { const r = report('item-stacks', 'oak_log'); assert.deepEqual(r.before, { full: 1, remainder: 1, stacks: 2 }); assert.deepEqual(r.after, { full: 0, remainder: 32, stacks: 1 }); },
    'stack-pressure': () => { const r = report('stack-pressure', '3'); assert.equal(r.beforeExcess, 1); assert.equal(r.afterExcess, 0); },
    'packing-room': () => { const r = report('packing-room', 'oak_log', '30'); assert.equal(r.before, 191); assert.equal(r.after, 224); },
    'loss-budget': () => { const r = report('loss-budget', 'oak_log=32', 'coal=5'); assert.equal(r.passes, false); assert.deepEqual(r.budgets.map(q => q.observed), [33, 5]); },
    'gain-budget': () => { const r = report('gain-budget', 'bread=4', 'dirt=64'); assert.equal(r.passes, true); },
    'allowed-losses': () => assert.deepEqual(report('allowed-losses', 'oak_log').unexpected.map(i => i.name), ['minecraft:coal']),
    'unchanged-except': () => assert.deepEqual(report('unchanged-except', 'bread', 'coal', 'dirt').unexpected.map(i => i.name), ['minecraft:oak_log']),
    'share-shift': () => { const r = report('share-shift', 'bread').percentagePoints; assert.equal(r.before, 4 / 74 * 100); assert.equal(r.after, 8 / 104 * 100); },
    'type-similarity': () => { const r = report('type-similarity'); assert.equal(r.intersection, 2); assert.equal(r.union, 4); assert.equal(r.similarity, 0.5); },
    'quantity-similarity': () => { const r = report('quantity-similarity'); assert.equal(r.intersection, 36); assert.equal(r.union, 142); assert.equal(r.similarity, 36 / 142); },
  };
  for (const [signature] of LEDGER_COMMANDS) { const name = signature.split(' ')[0]; assert.ok(checks[name], name); checks[name](); }
  const copy = structuredClone(before); report('packing-room', 'oak_log', '30'); assert.deepEqual(before, copy);
});

test('ledger distinguishes empty from missing evidence and validates quotas and quantities', () => {
  const missing = { ...before }; delete missing.inventory;
  assert.equal(ledgerReport(missing, after, 'quantity-similarity').similarity, null);
  assert.equal(ledgerReport(missing, after, 'loss-budget', ['dirt=1']).passes, null);
  assert.equal(ledgerReport(missing, after, 'item-percent', ['dirt']).after, null);
  const empty = { ...before, inventory: [] }, emptyAfter = { ...after, inventory: [] };
  assert.equal(ledgerReport(empty, emptyAfter, 'quantity-similarity').similarity, 1);
  assert.equal(ledgerReport(empty, emptyAfter, 'type-similarity').similarity, 1);
  assert.equal(ledgerReport(empty, after, 'item-percent', ['dirt']).percent, null);
  assert.equal(ledgerReport(empty, after, 'share-shift', ['dirt']).percentagePoints.delta, null);
  assert.equal(ledgerReport({ ...before, inventory: [{ name: 'constructor', count: 2 }] }, after, 'food-change').before, 0);
  assert.throws(() => ledgerReport(after, before, 'minimum-stacks'), /later/);
  assert.throws(() => ledgerReport(before, before, 'minimum-stacks'), /later/);
  assert.throws(() => ledgerReport({ ...before, inventory: [{ name: 'dirt', count: -1 }] }, after, 'minimum-stacks'), /nonnegative/);
  assert.throws(() => ledgerReport({ ...before, inventory: [{ name: 'dirt', count: 0.5 }] }, after, 'minimum-stacks'), /nonnegative/);
  assert.throws(() => ledgerReport({ ...before, inventory: [{ name: 'dirt', count: Number.MAX_SAFE_INTEGER }, { name: 'dirt', count: 1 }] }, after, 'minimum-stacks'), /bound|precision/);
  assert.equal(report('packing-room', 'oak_log', '36').before, null);
  assert.throws(() => report('quota-progress', 'dirt', '-1'), /integer/);
  assert.throws(() => report('kit-bundles', 'dirt=0'), /positive/);
  assert.throws(() => report('kit-progress', 'dirt=1', 'minecraft:dirt=2'), /Duplicate/);
  assert.throws(() => report('packing-room', 'dirt', '37'), /integer/);
  assert.throws(() => report('ration-change', '0'), /number/);
  assert.throws(() => report('not-a-command'), /Unknown/);
});

test('ledger reader accepts bounded regular snapshots and rejects directories, malformed and oversized files', async t => {
  const root = await testDirectory(t), path = join(root, 'snapshot.json');
  await writeFile(path, JSON.stringify(before)); assert.deepEqual(await readLedgerSnapshot(path), before);
  const directory = join(root, 'directory'); await mkdir(directory); await assert.rejects(readLedgerSnapshot(directory), /regular file/);
  await writeFile(path, '{}'); await assert.rejects(readLedgerSnapshot(path), /valid mc-agent/);
  await writeFile(path, '{'); await assert.rejects(readLedgerSnapshot(path));
  await truncate(path, SNAPSHOT_BYTES + 1); await assert.rejects(readLedgerSnapshot(path), /10 MiB/);
});
