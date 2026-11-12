import test from 'node:test';
import assert from 'node:assert/strict';
import { CHECKPOINT_COMMANDS, checkpointReport } from '../src/snapshot-checks.js';

const snapshot = {
  savedAt: '2026-01-01T12:00:00Z',
  player: { position: { x: -1, y: 64, z: -17 }, dimension: 'minecraft:overworld', health: 16, hunger: 18 },
  home: { x: -4, y: 64, z: -21, dimension: 'minecraft:overworld' },
  inventory: [{ name: 'minecraft:oak_log', count: 8 }, { name: 'minecraft:oak_log', count: 4 }, { name: 'minecraft:bread', count: 3 }, { name: 'minecraft:dirt', count: 0 }],
};
const fixtures = {
  'health-range': ['10', '20'], 'hunger-range': ['12', '20'], alive: [], dimension: ['minecraft:overworld'],
  'within-box': ['minecraft:overworld', '-5,60,-22', '0,70,-10'], 'within-radius': ['minecraft:overworld', '-4,64,-21', '5'],
  altitude: ['64', '64'], 'home-saved': [], 'home-dimension': [], 'at-home': ['5'], 'item-range': ['oak_log', '12', '12'],
  kit: ['oak_log=12', 'bread=3'], 'allowed-items': ['oak_log', 'bread'], 'item-ratio': ['oak_log', 'bread', '4', '4'],
  'total-items': ['15', '15'], diversity: ['2', '2'], 'inventory-records': ['3'], 'food-reserve': ['15'],
  fresh: ['60', '2026-01-01T12:01:00Z'], 'saved-between': ['2026-01-01T12:00:00Z', '2026-01-01T12:00:00Z'],
  'border-clearance': ['29000000'], chunk: ['minecraft:overworld', '-1', '-2'], section: ['4'], 'inventory-quality': [], 'vitals-quality': [],
};

test('all 25 checkpoint predicates accept independently calculated boundary fixtures without mutating inputs', () => {
  assert.equal(CHECKPOINT_COMMANDS.length, 25);
  assert.equal(new Set(CHECKPOINT_COMMANDS.map(([signature]) => signature.split(' ')[0])).size, 25);
  const original = structuredClone(snapshot);
  for (const [signature] of CHECKPOINT_COMMANDS) {
    const command = signature.split(' ')[0], args = fixtures[command];
    assert.ok(args, `fixture for ${command}`);
    const beforeArgs = [...args], output = checkpointReport(snapshot, command, args);
    assert.equal(output.passes, true, command);
    assert.equal(output.savedAt, snapshot.savedAt);
    assert.equal(output.check, command);
    assert.match(output.note, /Saved observation only/);
    assert.deepEqual(args, beforeArgs);
  }
  assert.deepEqual(snapshot, original);
});

test('vitals distinguish alive, dead, unknown, out of range, and invalid hunger', () => {
  assert.equal(checkpointReport({ ...snapshot, player: { ...snapshot.player, health: 0 } }, 'alive').passes, false);
  assert.equal(checkpointReport(snapshot, 'health-range', ['17', '20']).passes, false);
  assert.equal(checkpointReport(snapshot, 'hunger-range', ['0', '17']).passes, false);
  for (const health of [undefined, null, -1]) assert.equal(checkpointReport({ ...snapshot, player: { ...snapshot.player, health } }, 'alive').passes, null);
  for (const hunger of [undefined, null, -1, 20.5, 21]) assert.equal(checkpointReport({ ...snapshot, player: { ...snapshot.player, hunger } }, 'hunger-range', ['0', '20']).passes, null);
  assert.equal(checkpointReport({ ...snapshot, player: { ...snapshot.player, hunger: null } }, 'vitals-quality').passes, null);
  assert.equal(checkpointReport({ ...snapshot, player: { ...snapshot.player, hunger: 21 } }, 'vitals-quality').passes, false);
  assert.equal(checkpointReport({ ...snapshot, player: { ...snapshot.player, health: -1 } }, 'vitals-quality').passes, false);
});

test('dimension-qualified location checks never compare across unknown or mismatching dimensions', () => {
  for (const command of ['dimension', 'within-box', 'within-radius', 'chunk']) {
    assert.equal(checkpointReport({ ...snapshot, player: { ...snapshot.player, dimension: undefined } }, command, fixtures[command]).passes, null, command);
    assert.equal(checkpointReport({ ...snapshot, player: { ...snapshot.player, dimension: 'minecraft:the_nether' } }, command, fixtures[command]).passes, false, command);
  }
  assert.equal(checkpointReport(snapshot, 'within-box', ['minecraft:overworld', '0,60,-22', '5,70,-10']).passes, false);
  assert.equal(checkpointReport(snapshot, 'within-box', ['minecraft:overworld', '0,70,-10', '-5,60,-22']).passes, true);
  assert.equal(checkpointReport(snapshot, 'within-radius', ['minecraft:overworld', '-4,64,-21', '4.99']).passes, false);
  assert.equal(checkpointReport(snapshot, 'altitude', ['65', '80']).passes, false);
  assert.equal(checkpointReport(snapshot, 'chunk', ['minecraft:overworld', '0', '-2']).passes, false);
  assert.equal(checkpointReport(snapshot, 'section', ['3']).passes, false);
});

test('home checks handle absent, explicit null, unknown dimensions, cross-dimensional and distant homes', () => {
  const missing = structuredClone(snapshot); delete missing.home;
  assert.equal(checkpointReport(missing, 'home-saved').passes, null);
  assert.equal(checkpointReport({ ...snapshot, home: null }, 'home-saved').passes, false);
  for (const home of [undefined, null, { x: 0, y: 64, z: 0 }]) {
    assert.equal(checkpointReport({ ...snapshot, home }, 'home-dimension').passes, null);
    assert.equal(checkpointReport({ ...snapshot, home }, 'at-home', ['5']).passes, null);
  }
  const other = { ...snapshot, home: { ...snapshot.home, dimension: 'minecraft:the_nether' } };
  assert.equal(checkpointReport(other, 'home-dimension').passes, false);
  assert.equal(checkpointReport(other, 'at-home', ['5']).passes, false);
  assert.equal(checkpointReport(other, 'at-home', ['5']).distance, null);
  assert.equal(checkpointReport(snapshot, 'at-home', ['4.99']).passes, false);
});

test('inventory quotas aggregate names and positive counts while preserving unknown observations', () => {
  assert.equal(checkpointReport(snapshot, 'item-range', ['oak_log', '13', '20']).passes, false);
  assert.equal(checkpointReport(snapshot, 'kit', ['oak_log=13', 'bread=3']).passes, false);
  assert.equal(checkpointReport(snapshot, 'allowed-items', ['oak_log']).passes, false);
  assert.deepEqual(checkpointReport(snapshot, 'allowed-items', ['oak_log']).unexpected, ['minecraft:bread']);
  assert.equal(checkpointReport(snapshot, 'item-ratio', ['oak_log', 'dirt', '0', '4']).passes, null);
  assert.equal(checkpointReport(snapshot, 'item-ratio', ['oak_log', 'bread', '0', '3.9']).passes, false);
  assert.equal(checkpointReport(snapshot, 'total-items', ['0', '14']).passes, false);
  assert.equal(checkpointReport(snapshot, 'diversity', ['0', '1']).passes, false);
  assert.equal(checkpointReport(snapshot, 'inventory-records', ['2']).passes, false);
  assert.equal(checkpointReport(snapshot, 'food-reserve', ['16']).passes, false);
  const bareNames = { ...snapshot, inventory: [{ name: 'oak_log', count: 12 }] };
  assert.equal(checkpointReport(bareNames, 'item-range', ['oak_log', '12', '12']).passes, true);
  const missing = { ...snapshot }; delete missing.inventory;
  const inventoryChecks = ['item-range', 'kit', 'allowed-items', 'item-ratio', 'total-items', 'diversity', 'inventory-records', 'food-reserve', 'inventory-quality'];
  for (const command of inventoryChecks) assert.equal(checkpointReport(missing, command, fixtures[command]).passes, null, command);
  assert.equal(checkpointReport({ ...snapshot, inventory: [] }, 'total-items', ['0', '0']).passes, true);
});

test('inventory quality reports invalid names, negative/fractional counts and unsafe aggregation', () => {
  for (const inventory of [
    [{ name: 'bad name', count: 1 }], [{ name: 'oak_log', count: -1 }], [{ name: 'oak_log', count: 1.5 }],
    [{ name: 'oak_log', count: Number.MAX_SAFE_INTEGER }, { name: 'oak_log', count: 1 }],
    [{ name: 'oak_log', count: Number.MAX_SAFE_INTEGER }, { name: 'bread', count: 1 }],
  ]) {
    const value = { ...snapshot, inventory };
    assert.equal(checkpointReport(value, 'inventory-quality').passes, false);
    assert.ok(checkpointReport(value, 'inventory-quality').errors.length > 0);
    assert.equal(checkpointReport(value, 'item-range', ['oak_log', '0', '100']).passes, null);
  }
});

test('time checks accept inclusive boundaries, reject future evidence, and remain deterministic', () => {
  assert.equal(checkpointReport(snapshot, 'fresh', ['59', '2026-01-01T12:01:00Z']).passes, false);
  const future = checkpointReport(snapshot, 'fresh', ['60', '2026-01-01T11:59:59Z']);
  assert.equal(future.passes, false); assert.equal(future.ageSeconds, -1);
  assert.equal(checkpointReport(snapshot, 'fresh', ['0', snapshot.savedAt]).passes, true);
  assert.equal(checkpointReport(snapshot, 'saved-between', ['2026-01-01T12:00:01Z', '2026-01-02T00:00:00Z']).passes, false);
  assert.equal(checkpointReport({ ...snapshot, player: { ...snapshot.player, position: { x: 29_999_984, y: 64, z: 0 } } }, 'border-clearance', ['0']).passes, true);
  assert.equal(checkpointReport({ ...snapshot, player: { ...snapshot.player, position: { x: 29_999_984, y: 64, z: 0 } } }, 'border-clearance', ['1']).passes, false);
});

test('invalid predicate arguments and malformed snapshots fail clearly', () => {
  for (const [command, args] of [
    ['health-range', ['', '20']], ['hunger-range', ['0', '21']], ['altitude', ['64', '63']], ['at-home', ['-1']],
    ['item-range', ['oak_log', '0.5', '1']], ['kit', ['oak_log=1', 'oak_log=2']], ['allowed-items', []],
    ['dimension', ['overworld']], ['within-radius', ['minecraft:overworld', '0,64,0', 'Infinity']],
    ['item-ratio', ['oak_log', 'bread', '2', '1']], ['inventory-records', ['1.5']], ['section', ['21']],
    ['fresh', ['1', '2026-01-01']], ['saved-between', ['2026-01-02T00:00:00Z', '2026-01-01T00:00:00Z']],
    ['chunk', ['minecraft:overworld', '0.5', '0']], ['border-clearance', ['30000000']],
  ]) assert.throws(() => checkpointReport(snapshot, command, args), command);
  assert.throws(() => checkpointReport({}, 'alive'), /valid mc-agent snapshot/);
  assert.throws(() => checkpointReport(snapshot, 'unknown'), /Unknown checkpoint/);
});
