import test from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { testDirectory } from './helpers.js';
import { routineReport, editRoutine, generateRoutine, registerRoutineTools } from '../src/routine-tools.js';

const actions = [
  { type: 'collect', block: 'minecraft:oak_log', count: 8 },
  { type: 'wait', seconds: 10 },
  { type: 'deposit', item: 'minecraft:oak_log' },
  { type: 'home' },
];
test('routine reports preserve counts, wait timings, destinations and static warnings', () => {
  assert.deepEqual(routineReport(actions, 'validate'), { valid: true, steps: 4 });
  assert.equal(routineReport(actions, 'summary').waitSeconds, 10);
  assert.equal(routineReport(actions, 'types').types.length, 4);
  assert.deepEqual(routineReport(actions, 'collection').items, [{ name: 'minecraft:oak_log', count: 8, all: false }]);
  assert.equal(routineReport(actions, 'deposits').items[0].all, true);
  assert.deepEqual(routineReport(actions, 'waits').steps, [{ step: 2, seconds: 10 }]);
  assert.deepEqual(routineReport([{ type: 'goto', x: 1, y: 64, z: 2 }], 'destinations').destinations, [
    { step: 1, x: 1, y: 64, z: 2 },
  ]);
  assert.equal(routineReport(actions, 'first').action.type, 'collect');
  assert.equal(routineReport(actions, 'last').step, 4);
  assert.equal(routineReport(actions, 'numbered').steps[1].step, 2);
  assert.equal(routineReport(actions, 'warnings').warnings.length, 3);
});
test('routine editing uses inclusive one-based ranges and validates resulting routines', () => {
  assert.deepEqual(editRoutine(actions, 'slice', 2, 3).actions, actions.slice(1, 3));
  assert.deepEqual(editRoutine(actions, 'take', 2).actions, actions.slice(0, 2));
  assert.deepEqual(editRoutine(actions, 'drop', 3).actions, [actions[3]]);
  assert.deepEqual(editRoutine(actions, 'reverse').actions, [...actions].reverse());
  assert.equal(editRoutine(actions, 'repeat', 2).actions.length, 8);
  assert.equal(editRoutine(actions, 'concat', actions).actions.length, 8);
  assert.deepEqual(editRoutine(actions, 'remove', 2).actions, [actions[0], actions[2], actions[3]]);
  assert.equal(editRoutine(actions, 'insert', 5, [{ type: 'eat' }]).actions.at(-1).type, 'eat');
  assert.equal(editRoutine(actions, 'replace', 2, [{ type: 'eat' }]).actions[1].type, 'eat');
  assert.throws(() => editRoutine(actions, 'repeat', 26), /100/);
  assert.throws(() => editRoutine(actions, 'drop', 4));
  assert.throws(() => editRoutine(actions, 'slice', 3, 2));
  assert.throws(() => editRoutine([{ type: 'eat' }], 'remove', 1), /at least one step/);
  assert.throws(() => editRoutine(actions, 'take', ''));
  assert.throws(() => editRoutine(actions, 'take', 1.5));
});
test('routine generators split quotas and waits at protocol limits', () => {
  assert.deepEqual(
    generateRoutine('collect', 'oak_log', 130).actions.map((a) => a.count),
    [64, 64, 2],
  );
  assert.deepEqual(generateRoutine('deposit', 'dirt', 100).actions, [
    { type: 'deposit', item: 'minecraft:dirt', count: 100 },
  ]);
  assert.equal(generateRoutine('trip', 'dirt', 65).actions.at(-1).type, 'home');
  assert.deepEqual(
    generateRoutine('wait', 3601).actions.map((a) => a.seconds),
    [3600, 1],
  );
  assert.deepEqual(generateRoutine('route', ['-1,64,2']).actions, [{ type: 'goto', x: -1, y: 64, z: 2 }]);
  assert.throws(() => generateRoutine('wait', 360001));
  assert.throws(() => generateRoutine('collect', 'dirt', 0));
  assert.throws(() => generateRoutine('route', ['1,500,2']));
});
test('all 25 routine commands execute offline and output valid reports or routines', async (t) => {
  const dir = await testDirectory(t);
  const file = join(dir, 'input.json');
  const other = join(dir, 'other.json');
  await writeFile(file, JSON.stringify(actions));
  await writeFile(other, JSON.stringify([{ type: 'eat' }]));
  const cases = [
    ...[
      'validate',
      'summary',
      'types',
      'collection',
      'deposits',
      'waits',
      'destinations',
      'first',
      'last',
      'numbered',
      'warnings',
      'reverse',
    ].map((name) => [name, file]),
    ['slice', file, '2', '3'],
    ['take', file, '2'],
    ['drop', file, '1'],
    ['repeat', file, '2'],
    ['remove', file, '2'],
    ['concat', file, other],
    ['insert', file, '2', other],
    ['replace', file, '2', other],
    ['make-collect', 'dirt', '65'],
    ['make-deposit', 'dirt', '64'],
    ['make-trip', 'dirt', '3'],
    ['make-wait', '3601'],
    ['make-route', '1,64,1'],
  ];
  assert.equal(cases.length, 25);
  for (const args of cases) {
    let result;
    const program = new Command();
    registerRoutineTools(program, {
      print: (value) => {
        result = value;
      },
    });
    assert.equal(program.commands[0].commands.length, 25);
    await program.parseAsync(['routine', ...args], { from: 'user' });
    assert.ok(result, args[0]);
    if (result.actions) assert.ok(result.actions.length);
  }
  assert.equal(await (await import('node:fs/promises')).readFile(file, 'utf8'), JSON.stringify(actions));
});

test('collection generators reject targets unavailable in both gameplay backends', () => {
  for (const kind of ['collect', 'trip']) {
    assert.throws(() => generateRoutine(kind, 'stripped_oak_log', 80), /Supported collection targets/);
    assert.throws(() => generateRoutine(kind, 'stone', 1), /Supported collection targets/);
    assert.equal(generateRoutine(kind, 'minecraft:mangrove_log', 1).actions[0].block, 'minecraft:mangrove_log');
  }
});

test('single-step edits explain why empty output is refused', () => {
  for (const kind of ['drop', 'remove'])
    assert.throws(() => editRoutine([{ type: 'eat' }], kind, 1), /at least one step/);
});
