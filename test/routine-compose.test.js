import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Command } from 'commander';
import { COMPOSE_COMMANDS, composeRoutine, registerRoutineCompose } from '../src/routine-compose.js';
import { parseRoutine } from '../src/routine.js';
import { testDirectory } from './helpers.js';

const home = { type: 'home' },
  eat = { type: 'eat' },
  inspect = { type: 'inspect_storage' };
const set = { type: 'set_home' },
  wait = { type: 'wait', seconds: 2 };
const go = (x, y = 64, z = 0) => ({ type: 'goto', x, y, z });
const collect = (count) => ({ type: 'collect', block: 'minecraft:oak_log', count });
const deposit = (count) => ({ type: 'deposit', item: 'minecraft:oak_log', count });
const base = [set, go(1, 64, 2), collect(8), wait, deposit(8), home];
const other = [eat, inspect];
const fixtures = {
  'replace-range': { args: [2, 4, other], expected: [set, eat, inspect, deposit(8), home] },
  'reverse-range': { args: [2, 4], expected: [set, wait, collect(8), go(1, 64, 2), deposit(8), home] },
  'repeat-range': {
    args: [3, 4, 2],
    expected: [set, go(1, 64, 2), collect(8), wait, collect(8), wait, deposit(8), home],
  },
  'move-range': { args: [2, 3, 4], expected: [set, wait, deposit(8), go(1, 64, 2), collect(8), home] },
  'swap-ranges': { args: [2, 3, 5, 5], expected: [set, deposit(8), wait, go(1, 64, 2), collect(8), home] },
  'weave-chunks': { args: [other, 2], expected: [set, go(1, 64, 2), eat, inspect, collect(8), wait, deposit(8), home] },
  'cycle-insert': {
    args: [other, 3],
    expected: [set, go(1, 64, 2), collect(8), eat, inspect, wait, deposit(8), home, eat, inspect],
  },
  'before-type': {
    args: ['collect', other],
    expected: [set, go(1, 64, 2), eat, inspect, collect(8), wait, deposit(8), home],
  },
  'after-type': {
    args: ['collect', other],
    expected: [set, go(1, 64, 2), collect(8), eat, inspect, wait, deposit(8), home],
  },
  'replace-type': { args: ['collect', other], expected: [set, go(1, 64, 2), eat, inspect, wait, deposit(8), home] },
  'mirror-route': { args: ['x', 3], expected: [set, go(5, 64, 2), collect(8), wait, deposit(8), home] },
  'rotate-route': { args: ['0,64,0', 1], expected: [set, go(-2, 64, 1), collect(8), wait, deposit(8), home] },
  'scale-route': { args: ['0,64,0', 2], expected: [set, go(2, 64, 4), collect(8), wait, deposit(8), home] },
  'snap-route': { args: [2], expected: [set, go(2, 64, 2), collect(8), wait, deposit(8), home] },
  'anchor-route': { args: ['5,70,8'], expected: [set, go(5, 70, 8), collect(8), wait, deposit(8), home] },
  'offset-range': { args: [2, 3, 2, 3, 4], expected: [set, go(3, 67, 6), collect(8), wait, deposit(8), home] },
  'set-collect': { args: ['oak_log', 16], expected: [set, go(1, 64, 2), collect(16), wait, deposit(8), home] },
  'set-deposit': { args: ['oak_log', 16], expected: [set, go(1, 64, 2), collect(8), wait, deposit(16), home] },
  'set-wait-range': {
    args: [3, 5, 6],
    expected: [set, go(1, 64, 2), collect(8), { type: 'wait', seconds: 6 }, deposit(8), home],
  },
  'waypoint-waits': {
    args: [3, '2,64,0', '4,64,0'],
    expected: [...base, go(2), { type: 'wait', seconds: 3 }, go(4), { type: 'wait', seconds: 3 }],
  },
  'round-trip': { args: ['2,64,0', '4,64,0'], expected: [...base, go(2), go(4), go(2)] },
  patrol: { args: [2, '2,64,0', '4,64,0'], expected: [...base, go(2), go(4), go(2), go(4), go(2)] },
  'resolve-home': { args: ['5,64,9'], expected: [set, go(1, 64, 2), collect(8), wait, deposit(8), go(5, 64, 9)] },
  'storage-round': { args: ['2,64,0', '4,64,0'], expected: [...base, go(2), inspect, go(4), inspect] },
  'gather-store': {
    args: ['oak_log', 10, 6, '2,64,0', '4,64,0'],
    expected: [...base, go(2), collect(6), go(4), inspect, deposit(6), go(2), collect(4), go(4), inspect, deposit(4)],
  },
};

test('all 25 composition commands have distinct names and independently expected output', () => {
  assert.equal(COMPOSE_COMMANDS.length, 25);
  assert.equal(new Set(COMPOSE_COMMANDS.map(([signature]) => signature.split(' ')[0])).size, 25);
  assert.deepEqual(COMPOSE_COMMANDS.map(([s]) => s.split(' ')[0]).sort(), Object.keys(fixtures).sort());
  for (const [command, { args, expected }] of Object.entries(fixtures)) {
    const original = structuredClone(base),
      originalArgs = structuredClone(args);
    const result = composeRoutine(base, command, ...args);
    assert.deepEqual(result, { actions: expected }, command);
    assert.deepEqual(parseRoutine(JSON.stringify(result)), expected, `${command} produces loadable routine JSON`);
    assert.deepEqual(base, original, `${command} preserves input`);
    assert.deepEqual(args, originalArgs, `${command} preserves arguments`);
  }
});

test('block editing handles unequal ranges, reverse order, whole input, and final insertion slots', () => {
  assert.deepEqual(composeRoutine(base, 'swap-ranges', 5, 5, 2, 3).actions, fixtures['swap-ranges'].expected);
  assert.deepEqual(composeRoutine(base, 'move-range', 1, 6, 1).actions, base);
  assert.deepEqual(composeRoutine(base, 'move-range', 2, 3, 5).actions, [
    set,
    wait,
    deposit(8),
    home,
    go(1, 64, 2),
    collect(8),
  ]);
  assert.deepEqual(composeRoutine(base, 'replace-range', 1, 6, other).actions, other);
  assert.deepEqual(composeRoutine(base, 'cycle-insert', other, 4).actions, [
    set,
    go(1, 64, 2),
    collect(8),
    wait,
    eat,
    inspect,
    deposit(8),
    home,
  ]);
  assert.deepEqual(composeRoutine([set], 'weave-chunks', [eat, home, inspect], 2).actions, [set, eat, home, inspect]);
  assert.deepEqual(composeRoutine(base, 'before-type', 'eat', other).actions, base);
});

test('transformations preserve non-goto actions and reject world-bound overflow', () => {
  assert.deepEqual(composeRoutine([go(1, 65, 2)], 'rotate-route', '0,64,0', -1).actions, [go(2, 65, -1)]);
  assert.deepEqual(composeRoutine([go(1, 65, 2)], 'rotate-route', '0,64,0', 4).actions, [go(1, 65, 2)]);
  assert.deepEqual(composeRoutine([go(-3, 65, -1)], 'snap-route', 2).actions, [go(-2, 66, 0)]);
  assert.deepEqual(composeRoutine([go(1), go(3)], 'anchor-route', '10,70,20').actions, [
    go(10, 70, 20),
    go(12, 70, 20),
  ]);
  assert.deepEqual(composeRoutine([go(1), go(3)], 'offset-range', 2, 2, 2, 0, 0).actions, [go(1), go(5)]);
  assert.deepEqual(composeRoutine([go(1, 65, 2)], 'mirror-route', 'y', 64).actions, [go(1, 63, 2)]);
  for (const [command, ...args] of [
    ['scale-route', '0,64,0', 1_000_000],
    ['mirror-route', 'x', -29999984],
    ['offset-range', 1, 1, 1, 0, 0],
    ['snap-route', 1_000_000],
    ['rotate-route', '-29999984,64,0', 2],
  ])
    assert.throws(() => composeRoutine([go(29999984), go(29999983)], command, ...args), undefined, command);
  assert.throws(() => composeRoutine([go(0), go(1)], 'anchor-route', '29999984,64,0'));
  assert.throws(() => composeRoutine([home], 'anchor-route', '0,64,0'), /at least one goto/);
});

test('parameter setters affect exact matching targets and selected wait ranges only', () => {
  const input = [
    collect(1),
    { type: 'collect', block: 'dirt', count: 2 },
    { type: 'deposit', item: 'oak_log' },
    wait,
    wait,
  ];
  assert.deepEqual(composeRoutine(input, 'set-collect', 'oak_log', 64).actions.slice(0, 2), [
    collect(64),
    { type: 'collect', block: 'minecraft:dirt', count: 2 },
  ]);
  assert.deepEqual(composeRoutine(input, 'set-deposit', 'oak_log', 2304).actions[2], deposit(2304));
  assert.deepEqual(composeRoutine(input, 'set-wait-range', 5, 5, 1.5).actions.slice(3), [
    wait,
    { type: 'wait', seconds: 1.5 },
  ]);
});

test('expansions check the 100 step limit before building output', () => {
  const full = Array.from({ length: 100 }, () => home);
  for (const [command, args] of Object.entries({
    'replace-range': [1, 1, other],
    'repeat-range': [1, 2, 2],
    'weave-chunks': [other, 1],
    'cycle-insert': [other, 1],
    'before-type': ['home', other],
    'after-type': ['home', other],
    'replace-type': ['home', other],
    'waypoint-waits': [1, '0,64,0'],
    'round-trip': ['0,64,0', '1,64,0'],
    patrol: [1, '0,64,0', '1,64,0'],
    'storage-round': ['0,64,0'],
    'gather-store': ['dirt', 1, 1, '0,64,0', '1,64,0'],
  }))
    assert.throws(() => composeRoutine(full, command, ...args), /1 to 100 actions/, command);
  assert.equal(composeRoutine(full.slice(0, 95), 'gather-store', 'dirt', 1, 1, '0,64,0', '1,64,0').actions.length, 100);
  assert.throws(() => composeRoutine(base, 'patrol', 100, '0,64,0', '1,64,0'), /1 to 100/);
  assert.throws(() => composeRoutine(base, 'gather-store', 'dirt', 2304, 1, '0,64,0', '1,64,0'), /1 to 100/);
});

test('invalid ranges, quantities, types, points, and inputs are refused', () => {
  const invalid = [
    ['replace-range', 0, 2, other],
    ['reverse-range', 3, 2],
    ['repeat-range', 2, 3, 1.5],
    ['move-range', 2, 3, 6],
    ['swap-ranges', 2, 4, 3, 5],
    ['weave-chunks', other, 0],
    ['cycle-insert', other, ''],
    ['before-type', 'attack', other],
    ['after-type', 'collect', []],
    ['replace-type', 'collect', [{ type: 'wat' }]],
    ['mirror-route', 'w', 1],
    ['mirror-route', 'x', Infinity],
    ['rotate-route', '0,64,0', 1.5],
    ['scale-route', '0,64,0', 0],
    ['snap-route', 0],
    ['anchor-route', '1,2'],
    ['offset-range', 1, 2, 1, 2],
    ['set-collect', 'oak_log', 65],
    ['set-deposit', 'oak_log', 0],
    ['set-wait-range', 1, 6, 0],
    ['waypoint-waits', 1],
    ['round-trip', '0,64,0'],
    ['patrol', 0, '0,64,0', '1,64,0'],
    ['resolve-home', '0,321,0'],
    ['storage-round', 'bad'],
    ['gather-store', 'bedrock', 1, 1, '0,64,0', '1,64,0'],
    ['gather-store', 'dirt', 1, 65, '0,64,0', '1,64,0'],
    ['unknown'],
  ];
  for (const [command, ...args] of invalid)
    assert.throws(() => composeRoutine(base, command, ...args), undefined, command);
  assert.throws(() => composeRoutine([], 'resolve-home', '0,64,0'));
  assert.throws(() => composeRoutine([{ type: 'wait', seconds: NaN }], 'resolve-home', '0,64,0'));
  assert.throws(() => composeRoutine(base, 'storage-round', ...Array(51).fill('0,64,0')), /1 to 50/);
});

test('registrar loads each secondary routine without flattening it and handles variadic points', async (t) => {
  const directory = await testDirectory(t),
    file = join(directory, 'input.json'),
    extra = join(directory, 'other.json');
  await writeFile(file, JSON.stringify(base));
  await writeFile(extra, JSON.stringify(other));
  const fileCommands = {
    'replace-range': ['2', '4', extra],
    'weave-chunks': [extra, '2'],
    'cycle-insert': [extra, '3'],
    'before-type': ['collect', extra],
    'after-type': ['collect', extra],
    'replace-type': ['collect', extra],
  };
  for (const name of [...Object.keys(fileCommands), 'waypoint-waits', 'round-trip', 'patrol', 'storage-round']) {
    let actual;
    const program = new Command();
    registerRoutineCompose(program, {
      print: (value) => {
        actual = value;
      },
    });
    const args = fileCommands[name] ?? fixtures[name].args.map(String);
    await program.parseAsync(['compose', name, file, '--', ...args], { from: 'user' });
    assert.deepEqual(actual.actions, fixtures[name].expected, name);
  }
});
