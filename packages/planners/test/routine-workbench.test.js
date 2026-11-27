import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Command } from 'commander';
import { testDirectory } from '../../../test/helpers.js';
import { workbench, registerRoutineWorkbench, WORKBENCH_COMMANDS } from '../src/routine-workbench.js';

const actions = [
  { type: 'collect', block: 'minecraft:oak_log', count: 8 },
  { type: 'wait', seconds: 4 },
  { type: 'wait', seconds: 2 },
  { type: 'deposit', item: 'minecraft:oak_log' },
  { type: 'deposit', item: 'minecraft:oak_log', count: 3 },
  { type: 'goto', x: 0, y: 64, z: 0 },
  { type: 'goto', x: 3, y: 64, z: 4 },
  { type: 'home' },
  { type: 'set_home' },
  { type: 'home' },
];
const run = (name, ...args) => workbench(actions, name, ...args);

test('ten routine analyses preserve static meaning and one-based references', () => {
  assert.deepEqual(run('positions', 'wait').steps, [2, 3]);
  assert.deepEqual(
    run('transitions').transitions.find((a) => a.from === 'wait' && a.to === 'wait'),
    { from: 'wait', to: 'wait', count: 1 },
  );
  assert.deepEqual(run('runs').runs[1], { type: 'wait', firstStep: 2, lastStep: 3, count: 2 });
  assert.deepEqual(run('duplicates').duplicates, [{ step: 10, firstStep: 8, action: { type: 'home' } }]);
  assert.deepEqual(run('home-dependencies').homes, [
    { step: 8, setHomeStep: null, requiresExistingHome: true },
    { step: 10, setHomeStep: 9, requiresExistingHome: false },
  ]);
  assert.deepEqual(run('collect-balance').items, [
    {
      item: 'minecraft:oak_log',
      requestedCollection: 8,
      explicitDeposits: 3,
      depositAllSteps: 1,
      explicitDifference: 5,
    },
  ]);
  assert.deepEqual(run('travel-segments').segments, [{ fromStep: 6, toStep: 7, distance: 5 }]);
  assert.equal(run('travel-segments').distance, 5);
  assert.deepEqual(run('wait-timeline').steps[2], { step: 3, before: 4, after: 6 });
  assert.deepEqual(run('item-uses').items, [{ item: 'minecraft:oak_log', steps: [1, 4, 5] }]);
  assert.deepEqual(run('bounds').bounds, { min: { x: 0, y: 64, z: 0 }, max: { x: 3, y: 64, z: 4 } });
  assert.equal(workbench([{ type: 'home' }], 'bounds').bounds, null);
});

test('step reordering and filters retain validated actions without mutating input', () => {
  const before = JSON.stringify(actions);
  assert.deepEqual(run('only', 'wait').actions, actions.slice(1, 3));
  assert.equal(run('without', 'wait').actions.length, 8);
  assert.equal(run('swap', 1, 2).actions[0].type, 'wait');
  assert.deepEqual(run('move', 1, 10).actions.at(-1), actions[0]);
  assert.deepEqual(run('move', 10, 1).actions[0], actions[9]);
  assert.deepEqual(run('rotate', 2).actions, [...actions.slice(2), ...actions.slice(0, 2)]);
  assert.deepEqual(run('rotate', 10).actions, actions);
  assert.deepEqual(
    workbench([{ type: 'home' }], 'interleave', [{ type: 'eat' }, { type: 'wait', seconds: 2 }]).actions.map(
      (a) => a.type,
    ),
    ['home', 'eat', 'wait'],
  );
  assert.equal(JSON.stringify(actions), before);
});

test('count, wait, position and item edits affect only intended fields', () => {
  assert.equal(run('scale-collect', 2).actions[0].count, 16);
  assert.equal(run('scale-waits', 0.5).actions[1].seconds, 2);
  assert.equal(run('cap-collect', 3).actions[0].count, 3);
  assert.deepEqual(
    run('cap-waits', 3)
      .actions.slice(1, 3)
      .map((a) => a.seconds),
    [3, 2],
  );
  assert.equal(run('explicit-deposits', 5).actions[3].count, 5);
  assert.equal(run('explicit-deposits', 5).actions[4].count, 3);
  assert.deepEqual(run('translate', -1, 2, 3).actions[6], { type: 'goto', x: 2, y: 66, z: 7 });
  assert.equal(run('replace-item', 'oak_log', 'dirt').actions[0].block, 'minecraft:dirt');
  assert.equal(run('replace-item', 'oak_log', 'dirt').actions[3].item, 'minecraft:dirt');
  assert.deepEqual(run('pause-after', 'collect', 5).actions[1], { type: 'wait', seconds: 5 });
  assert.equal(run('pause-after', 'collect', 5).actions.length, 11);
  assert.deepEqual(run('bookend-home').actions, [{ type: 'home' }, ...actions, { type: 'home' }]);
});

test('all transformations reject invalid inputs and invalid output before printing', () => {
  for (const [name, ...args] of [
    ['positions', 'teleport'],
    ['only', 'eat'],
    ['without', 'bad'],
    ['swap', 0, 1],
    ['move', 1, 11],
    ['rotate', 0],
    ['interleave', []],
    ['scale-collect', 9],
    ['scale-collect', 1.5],
    ['scale-waits', 0.1],
    ['scale-waits', Infinity],
    ['cap-collect', 65],
    ['cap-waits', 0],
    ['explicit-deposits', 2305],
    ['translate', 0, 400, 0],
    ['translate', 0, 1],
    ['replace-item', 'oak_log', 'bad:name'],
    ['pause-after', 'bad', 1],
    ['pause-after', 'wait', 0],
    ['unknown'],
  ])
    assert.throws(() => run(name, ...args), undefined, name);
  assert.throws(() => workbench([{ type: 'home' }], 'without', 'home'), /1 to 100/);
  assert.throws(
    () =>
      workbench(
        Array.from({ length: 100 }, () => ({ type: 'home' })),
        'bookend-home',
      ),
    /1 to 100/,
  );
  assert.throws(
    () =>
      workbench(
        Array.from({ length: 100 }, () => ({ type: 'home' })),
        'pause-after',
        'home',
        1,
      ),
    /1 to 100/,
  );
  assert.throws(() => workbench([{ type: 'wait', seconds: 0 }], 'bounds'), /invalid/);
  assert.throws(() => run('rotate', true), /finite/);
});

test('all 25 workbench commands execute offline through their CLI registration', async (t) => {
  const directory = await testDirectory(t);
  const file = join(directory, 'routine.json'),
    other = join(directory, 'other.json');
  const original = JSON.stringify(actions);
  await writeFile(file, original);
  await writeFile(other, JSON.stringify([{ type: 'eat' }]));
  const inputs = [
    ['positions', 'wait'],
    ...[
      'transitions',
      'runs',
      'duplicates',
      'home-dependencies',
      'collect-balance',
      'travel-segments',
      'wait-timeline',
      'item-uses',
      'bounds',
    ].map((a) => [a]),
    ['only', 'wait'],
    ['without', 'wait'],
    ['swap', '1', '2'],
    ['move', '1', '10'],
    ['rotate', '1'],
    ['interleave', other],
    ['scale-collect', '2'],
    ['scale-waits', '2'],
    ['cap-collect', '3'],
    ['cap-waits', '3'],
    ['explicit-deposits', '5'],
    ['translate', '1', '2', '3'],
    ['replace-item', 'oak_log', 'dirt'],
    ['pause-after', 'home', '5'],
    ['bookend-home'],
  ];
  assert.equal(inputs.length, 25);
  assert.equal(WORKBENCH_COMMANDS.length, 25);
  for (const [name, ...args] of inputs) {
    let result;
    const program = new Command();
    registerRoutineWorkbench(program, {
      print: (value) => {
        result = value;
      },
    });
    assert.equal(program.commands[0].commands.length, 25);
    await program.parseAsync(['workbench', name, file, ...args], { from: 'user' });
    assert.ok(result, name);
  }
  assert.equal(await readFile(file, 'utf8'), original);
});
