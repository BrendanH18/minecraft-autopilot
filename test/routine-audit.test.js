import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Command } from 'commander';
import { testDirectory } from './helpers.js';
import { routineAudit, registerRoutineAudit, AUDIT_COMMANDS } from '../src/routine-audit.js';

const actions = [
  { type: 'deposit', item: 'minecraft:dirt', count: 9 },
  { type: 'collect', block: 'minecraft:oak_log', count: 8 },
  { type: 'collect', block: 'minecraft:oak_log', count: 4 },
  { type: 'wait', seconds: 4 },
  { type: 'wait', seconds: 2 },
  { type: 'inspect_storage' },
  { type: 'deposit', item: 'minecraft:oak_log' },
  { type: 'goto', x: -1, y: 64, z: 0 },
  { type: 'goto', x: 2, y: 64, z: 4 },
  { type: 'set_home' },
  { type: 'home' },
  { type: 'set_home' },
];
const run = (name, ...args) => routineAudit(actions, name, ...args);
const inputs = [
  ['allowlist', 'collect', 'wait'],
  ['collect-ceiling', '6'],
  ['wait-ceiling', '3'],
  ['deposit-ceiling', '6'],
  ['travel-ceiling', '4'],
  ['chunk-visits'],
  ['altitude-bands', '32'],
  ['collect-streaks', '1'],
  ['deposit-order'],
  ['home-overwrites'],
  ['storage-check-gaps'],
  ['wait-budget', '5'],
  ['item-spans'],
  ['return-tail'],
  ['execution-sections', '5'],
  ['split-collect', '3'],
  ['split-waits', '3'],
  ['split-deposits', '4'],
  ['merge-waits'],
  ['merge-collect'],
  ['pause-before', 'collect', '1'],
  ['checkpoint-after', 'collect'],
  ['repeat-step', '2', '3'],
  ['remove-range', '2', '4'],
  ['set-goto-height', '80'],
];

test('15 static policy and planning reports return expected results', () => {
  assert.equal(run('allowlist', 'collect', 'wait').violations.length, 8);
  assert.deepEqual(
    run('collect-ceiling', 6).violations.map((r) => r.step),
    [2],
  );
  assert.deepEqual(
    run('wait-ceiling', 3).violations.map((r) => r.step),
    [4],
  );
  assert.deepEqual(
    run('deposit-ceiling', 6).violations.map((r) => [r.step, r.unboundedCount]),
    [
      [1, false],
      [7, true],
    ],
  );
  assert.deepEqual(run('travel-ceiling', 4).violations, [{ fromStep: 8, toStep: 9, distance: 5 }]);
  assert.equal(run('travel-ceiling', 5).passes, true);
  assert.deepEqual(run('chunk-visits').chunks, [
    { x: -1, z: 0, steps: [8] },
    { x: 0, z: 0, steps: [9] },
  ]);
  assert.deepEqual(run('altitude-bands', 32).bands, [{ lower: 64, upperExclusive: 96, steps: [8, 9] }]);
  assert.deepEqual(run('collect-streaks', 1).violations, [{ firstStep: 2, lastStep: 3, steps: 2, requested: 12 }]);
  assert.deepEqual(run('deposit-order').deposits, [
    { step: 1, item: 'minecraft:dirt', lastMatchingCollect: null, requiresInitialStockOrOtherSource: true },
    { step: 7, item: 'minecraft:oak_log', lastMatchingCollect: 3, requiresInitialStockOrOtherSource: false },
  ]);
  assert.deepEqual(run('home-overwrites').overwrites, [{ step: 12, replacesSetHomeStep: 10 }]);
  assert.deepEqual(run('storage-check-gaps').deposits, [
    { step: 1, lastInspection: null, interveningSteps: null },
    { step: 7, lastInspection: 6, interveningSteps: 0 },
  ]);
  assert.deepEqual(run('wait-budget', 5).overBudget, [{ step: 5, cumulativeSeconds: 6, overBy: 1 }]);
  assert.equal(run('wait-budget', 6).passes, true);
  assert.deepEqual(run('item-spans').items[1], {
    name: 'minecraft:oak_log',
    firstStep: 2,
    lastStep: 7,
    uses: 3,
    spanSteps: 6,
  });
  assert.equal(run('return-tail').lastHomeStep, 11);
  assert.deepEqual(run('return-tail').trailingSteps, [{ step: 12, action: actions[11] }]);
  assert.equal(routineAudit([{ type: 'wait', seconds: 1 }], 'return-tail').lastHomeStep, null);
  assert.deepEqual(run('execution-sections', 5).sections, [
    { firstStep: 1, lastStep: 5, actions: 5, waitSeconds: 6, requestedCollection: 12 },
    { firstStep: 6, lastStep: 10, actions: 5, waitSeconds: 0, requestedCollection: 0 },
    { firstStep: 11, lastStep: 12, actions: 2, waitSeconds: 0, requestedCollection: 0 },
  ]);
});

test('ten edits preserve quantities, revalidate output and never mutate source', () => {
  const before = JSON.stringify(actions);
  assert.deepEqual(
    run('split-collect', 3)
      .actions.filter((a) => a.type === 'collect')
      .map((a) => a.count),
    [3, 3, 2, 3, 1],
  );
  assert.deepEqual(
    run('split-waits', 3)
      .actions.filter((a) => a.type === 'wait')
      .map((a) => a.seconds),
    [2, 2, 2],
  );
  assert.deepEqual(
    run('split-deposits', 4)
      .actions.filter((a) => a.type === 'deposit')
      .map((a) => a.count),
    [4, 4, 1, undefined],
  );
  assert.deepEqual(
    run('merge-waits').actions.filter((a) => a.type === 'wait'),
    [{ type: 'wait', seconds: 6 }],
  );
  assert.deepEqual(
    run('merge-collect').actions.filter((a) => a.type === 'collect'),
    [{ type: 'collect', block: 'minecraft:oak_log', count: 12 }],
  );
  assert.deepEqual(
    run('pause-before', 'collect', 1)
      .actions.slice(1, 5)
      .map((a) => a.type),
    ['wait', 'collect', 'wait', 'collect'],
  );
  assert.equal(run('checkpoint-after', 'collect').actions[2].type, 'home');
  assert.equal(run('repeat-step', 2, 3).actions.length, 14);
  assert.deepEqual(run('remove-range', 2, 4).actions, [actions[0], ...actions.slice(4)]);
  assert.deepEqual(
    run('set-goto-height', 80)
      .actions.filter((a) => a.type === 'goto')
      .map((a) => a.y),
    [80, 80],
  );
  assert.equal(JSON.stringify(actions), before);
  const large = routineAudit(
    [
      { type: 'wait', seconds: 3600 },
      { type: 'wait', seconds: 1 },
    ],
    'merge-waits',
  ).actions;
  assert.equal(large.length, 2);
  assert.equal(
    large.reduce((n, a) => n + a.seconds, 0),
    3601,
  );
  const collected = routineAudit(
    [
      { type: 'collect', block: 'oak_log', count: 64 },
      { type: 'collect', block: 'oak_log', count: 1 },
    ],
    'merge-collect',
  ).actions;
  assert.deepEqual(
    collected.map((a) => a.count),
    [64, 1],
  );
});

test('invalid policies and transforms fail before output', () => {
  for (const [name, ...args] of [
    ['allowlist'],
    ['allowlist', 'teleport'],
    ['collect-ceiling', 0],
    ['wait-ceiling', Infinity],
    ['deposit-ceiling', 2305],
    ['travel-ceiling', -1],
    ['altitude-bands', 0],
    ['collect-streaks', 1.5],
    ['wait-budget', ''],
    ['execution-sections', 101],
    ['split-collect', true],
    ['split-waits', 0.5],
    ['split-deposits', -1],
    ['pause-before', 'bad', 1],
    ['checkpoint-after', 'bad'],
    ['repeat-step', 13, 1],
    ['repeat-step', 1, 100],
    ['remove-range', 1, 12],
    ['remove-range', 4, 3],
    ['set-goto-height', 10000],
    ['unknown'],
  ])
    assert.throws(() => run(name, ...args), undefined, name);
  assert.throws(() => routineAudit([{ type: 'wait', seconds: 1.1 }], 'split-waits', 1), /invalid/);
  assert.throws(
    () =>
      routineAudit(
        Array.from({ length: 100 }, () => ({ type: 'collect', block: 'oak_log', count: 64 })),
        'split-collect',
        1,
      ),
    /1 to 100/,
  );
  assert.throws(() => routineAudit([{ type: 'wait', seconds: 0 }], 'return-tail'), /invalid/);
});

test('all 25 commands dispatch offline and leave the input file unchanged', async (t) => {
  const directory = await testDirectory(t),
    file = join(directory, 'audit.json');
  const text = JSON.stringify(actions);
  await writeFile(file, text);
  assert.equal(AUDIT_COMMANDS.length, 25);
  assert.equal(inputs.length, 25);
  for (const [command, ...args] of inputs) {
    let result;
    const program = new Command();
    registerRoutineAudit(program, {
      print: (value) => {
        result = value;
      },
    });
    assert.equal(program.commands[0].commands.length, 25);
    await program.parseAsync(['audit', command, file, ...args], { from: 'user' });
    assert.deepEqual(result, run(command, ...args), command);
  }
  assert.equal(await readFile(file, 'utf8'), text);
});
