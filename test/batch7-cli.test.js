import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Command } from 'commander';
import { startBridge } from '../src/bridge-server.js';
import { Harness } from '../src/harness.js';
import { DemoDriver } from '../src/demo-driver.js';
import { EXPEDITION_COMMANDS, expeditionReport } from '../src/expedition-tools.js';
import { BLUEPRINT_COMMANDS, blueprintCalculation, registerBlueprintTools } from '../src/blueprint-tools.js';
import { CHECKPOINT_COMMANDS, checkpointReport, registerCheckpointTools } from '../src/snapshot-checks.js';
import { COMPOSE_COMMANDS, composeRoutine, registerRoutineCompose } from '../src/routine-compose.js';
import { parseRoutine } from '../src/routine.js';
import { testDirectory } from './helpers.js';

const exec = promisify(execFile);
const expeditionArgs = {
  'time-to': ['3,64,4', '5'],
  'time-home': ['5'],
  'round-trip': ['3,64,4', '5', '7'],
  rendezvous: ['3,64,4', '5', '7'],
  'route-budget': ['5', '1', '3,64,4', '6,64,8'],
  'home-deadline': ['5', '7'],
  'operating-radius': ['5', '10', '2'],
  'food-load': ['bread', '25', '2.2'],
  'food-plan': ['25', '2.2'],
  'food-margin': ['25', '2.2'],
  'collect-time': ['dirt', '100', '10'],
  'collect-deadline': ['beetroot', '58', '100', '0.58'],
  'kit-time': ['10', 'dirt=100', 'coal=11'],
  'kit-priority': ['10', '3', 'dirt=100', 'coal=11'],
  'source-trips': ['dirt', '30', '5'],
  'resource-trips': ['dirt', '5', '7'],
  'refresh-budget': ['5', '2'],
  payload: ['dirt', '35'],
  'delivery-budget': ['dirt', '129', '35', '3,64,4', '5'],
  'reserved-capacity': ['dirt', '32'],
  recipe: ['torch', '9', '4', 'coal=1', 'stick=1'],
  fuel: ['coal', '0.58', '58'],
  smelt: ['sand', 'glass', '58', 'coal', '0.58'],
  'ration-days': ['25', '2.2'],
  'cache-reach': ['5', '2', 'dirt=80', 'coal=2'],
};

test('25 expedition commands cross the authenticated bridge without disturbing another owner', {
  timeout: 120000,
}, async (t) => {
  const directory = await testDirectory(t),
    discoveryPath = join(directory, 'bridge.json');
  const harness = new Harness(new DemoDriver({ scenario: 'stocked' }), { leaseMs: 180000 });
  const bridge = await startBridge(harness, { discoveryPath });
  t.after(() => bridge.close());
  const owner = '11111111-1111-4111-8111-111111111111';
  harness.acquire(owner);
  const before = await harness.observe();
  let exercised = 0;
  for (const [signature] of EXPEDITION_COMMANDS) {
    const name = signature.split(' ')[0],
      args = expeditionArgs[name];
    assert.ok(args, name);
    const { stdout, stderr } = await exec(process.execPath, [
      'src/cli.js',
      '--bridge',
      discoveryPath,
      '--json',
      'expedition',
      name,
      '--',
      ...args,
    ]);
    const output = JSON.parse(stdout);
    assert.deepEqual(output, expeditionReport(before, name, args), name);
    if (name === 'food-load') assert.equal(output.required, 11);
    if (name === 'collect-deadline') {
      assert.equal(output.feasibleEstimate, true);
      assert.equal(output.attainableCount, 58);
    }
    if (name === 'fuel') assert.equal(output.required, 100);
    if (name === 'smelt') assert.equal(output.fuelRequired, 100);
    assert.equal(stderr, '');
    assert.equal(harness.owner, owner);
    exercised++;
  }
  assert.equal(exercised, 25);
  const after = await harness.observe();
  assert.deepEqual(after.player, before.player);
  assert.deepEqual(after.inventory, before.inventory);
  assert.deepEqual(after.containers, before.containers);
  assert.equal(after.job, null);
  assert.equal(after.mode, before.mode);
});

// Blueprint, checkpoint, and compose answers below are worked out by hand from the fixture
// dimensions, snapshot, and routine (and Minecraft's documented rules: bread restores 5 hunger,
// chunks and sections are 16 blocks, the supported border is 29,999,984). None of them is
// produced by calling the code under test, so a calculation bug fails these tables.
const BLUEPRINT_NOTE =
  'Offline block-count estimates only. Dimensions count occupied blocks, not coordinate spans. No blocks are placed; terrain, support, access, recipes, orientation, and build feasibility are not checked.';
const CHECKPOINT_NOTE =
  'Saved observation only; a passing predicate does not prove current world state, task success, reachability, or safety. Unknown evidence returns passes: null. Inventory records are not physical slots; food uses the supported hunger table only.';

const blueprintCases = [
  // 4 x 5 footprint, 2 layers: 20 x 2.
  ['floor', ['4', '5', '2'], { width: 4, depth: 5, layers: 2, blocks: 40 }],
  // 5 x 4 = 20 minus the 3 x 2 interior.
  ['floor-border', ['5', '4', '1'], { width: 5, depth: 4, thickness: 1, blocks: 14 }],
  // 15 cells; the origin color takes the odd one.
  ['checkerboard', ['5', '3'], { width: 5, depth: 3, firstColor: 8, secondColor: 7, originColor: 'firstColor' }],
  // Columns 0,1,4,5 are first (4 x 2); columns 2,3,6 are second (3 x 2).
  [
    'stripes',
    ['7', '2', '2'],
    { width: 7, depth: 2, stripeWidth: 2, firstColor: 8, secondColor: 6, originColor: 'firstColor' },
  ],
  ['wall', ['6', '3', '2'], { length: 6, height: 3, thickness: 2, blocks: 36 }],
  // 10 x 4 = 40 minus three 2 x 3 openings.
  [
    'wall-opening',
    ['10', '4', '2', '3', '3'],
    {
      length: 10,
      height: 4,
      openingWidth: 2,
      openingHeight: 3,
      openings: 3,
      grossBlocks: 40,
      removed: 18,
      blocks: 22,
      assumption: 'Openings are disjoint and arranged side by side; positions and supporting lintels are not planned.',
    },
  ],
  // A 14-block ring, 3 high.
  ['perimeter-walls', ['5', '4', '3', '1'], { width: 5, depth: 4, height: 3, thickness: 1, blocks: 42 }],
  // 60 gross; the void is 3 x 2 x 1 between floor and lid.
  [
    'closed-shell',
    ['5', '4', '3', '1'],
    { width: 5, depth: 4, height: 3, thickness: 1, grossBlocks: 60, voidBlocks: 6, blocks: 54 },
  ],
  // No lid, so the void is 3 x 2 x 2.
  [
    'open-box',
    ['5', '4', '3', '1'],
    { width: 5, depth: 4, height: 3, thickness: 1, grossBlocks: 60, voidBlocks: 12, blocks: 48 },
  ],
  // A 3 x 2 x 1 interior grows to 5 x 4 x 3 outside: 60 - 6.
  [
    'room',
    ['3', '2', '1', '1'],
    {
      interior: { width: 3, depth: 2, height: 1 },
      exterior: { width: 5, depth: 4, height: 3 },
      thickness: 1,
      blocks: 54,
    },
  ],
  // 8 corners + 4 x 3 + 4 x 2 + 4 x 1 edge cells.
  ['cuboid-frame', ['5', '4', '3'], { width: 5, depth: 4, height: 3, blocks: 32 }],
  [
    'pillars',
    ['3', '4', '2', '2'],
    {
      count: 3,
      height: 4,
      width: 2,
      depth: 2,
      blocksPerPillar: 16,
      blocks: 48,
      assumption: 'Pillars do not overlap.',
    },
  ],
  // Steps 1, 2, 3 high, each 2 long and 2 wide: (1 + 2 + 3) x 2 x 2.
  [
    'solid-stairs',
    ['2', '3', '1', '2'],
    {
      width: 2,
      steps: 3,
      rise: 1,
      run: 2,
      height: 3,
      length: 6,
      blocks: 24,
      assumption: 'Filled beneath every tread; full blocks, not Minecraft stair items.',
    },
  ],
  // Layers 5, 3, 1 wide, each 3 deep.
  [
    'gable-fill',
    ['5', '3'],
    {
      width: 5,
      depth: 3,
      layers: 3,
      blocks: 27,
      assumption: 'Each filled layer spans the full depth; width shrinks by two per layer.',
    },
  ],
  // 5 x 4 + 3 x 2; the next layer would be 1 x 0.
  [
    'pyramid',
    ['5', '4'],
    {
      width: 5,
      depth: 4,
      layers: 2,
      blocks: 26,
      assumption: 'Filled rectangular layers centered above the base; both dimensions shrink by two.',
    },
  ],
  [
    'tunnel-clear',
    ['2', '3', '4'],
    {
      width: 2,
      height: 3,
      length: 4,
      cellsToClear: 24,
      endOpening: 6,
      assumption: 'Cells only; existing air, fluids, and dropped item yields are unknown.',
    },
  ],
  // (4 x 5 - 2 x 3) x 4.
  [
    'tunnel-lining',
    ['2', '3', '4', '1'],
    {
      insideWidth: 2,
      insideHeight: 3,
      outsideWidth: 4,
      outsideHeight: 5,
      length: 4,
      thickness: 1,
      blocks: 56,
      assumption: 'Four walls around the cross-section, no end caps.',
    },
  ],
  // Offsets 0..10 with gaps of at most 4 need 3 intervals; interior posts round down
  // (floor(10 / 3) = 3, floor(20 / 3) = 6), giving 0, 3, 6, 10.
  [
    'spaced-posts',
    ['11', '4', '3'],
    {
      length: 11,
      maximumGap: 4,
      height: 3,
      offsets: [0, 3, 6, 10],
      posts: 4,
      blocks: 12,
      convention: 'Offsets run from 0 through length-1; gaps are center-to-center block offsets.',
    },
  ],
  // X 0..5 and Z 0..4 each need 2 intervals of at most 3; midpoints round down to 2.
  [
    'grid-pillars',
    ['6', '5', '3', '3', '2'],
    {
      width: 6,
      depth: 5,
      height: 2,
      xOffsets: [0, 2, 5],
      zOffsets: [0, 2, 4],
      pillars: 9,
      blocks: 18,
      convention: 'One-block-wide pillars at every X/Z offset combination; offsets include boundaries.',
    },
  ],
  [
    'layer-plan',
    ['2', '3', '3'],
    {
      width: 2,
      depth: 3,
      height: 3,
      blocks: 18,
      layers: [
        { layer: 1, blocks: 6, cumulative: 6 },
        { layer: 2, blocks: 6, cumulative: 12 },
        { layer: 3, blocks: 6, cumulative: 18 },
      ],
    },
  ],
  // 130 = 2 x 64 + 2.
  [
    'material-stacks',
    ['130', '64'],
    {
      blocks: 130,
      stackSize: 64,
      fullStacks: 2,
      remainder: 2,
      occupiedStacks: 3,
      assumption: 'Supplied stack limit; components and merge restrictions are ignored.',
    },
  ],
  // 3 batches of 4 cover 10, leaving 2 over and using 3 x 3 input.
  [
    'batch-output',
    ['10', '4', '3'],
    {
      required: 10,
      yieldPerBatch: 4,
      inputPerBatch: 3,
      batches: 3,
      input: 9,
      produced: 12,
      surplus: 2,
      assumption: 'Supplied yields only; no recipe lookup or crafting execution.',
    },
  ],
  // 10% of 101 is 10.1, rounded up to 11.
  ['material-waste', ['101', '10'], { blocks: 101, percent: 10, allowance: 11, total: 112 }],
  [
    'material-split',
    ['10', '3'],
    {
      blocks: 10,
      builders: 3,
      allocations: [
        { builder: 1, blocks: 4 },
        { builder: 2, blocks: 3 },
        { builder: 3, blocks: 3 },
      ],
    },
  ],
  [
    'build-time',
    ['120', '15'],
    {
      blocks: 120,
      blocksPerMinute: 15,
      minutes: 8,
      assumption: 'Constant supplied rate; travel, gathering, failures, and pauses are excluded.',
    },
  ],
].map(([name, args, expected]) => [name, args, { ...expected, note: BLUEPRINT_NOTE }]);

// Player at -1,64,-17 in the overworld with 16 health and 18 hunger; home at -4,64,-21, a
// 3-4-5 triangle away; 8 + 4 oak logs and 3 bread in three records.
const snapshot = {
  savedAt: '2026-01-01T12:00:00Z',
  player: { position: { x: -1, y: 64, z: -17 }, dimension: 'minecraft:overworld', health: 16, hunger: 18 },
  home: { x: -4, y: 64, z: -21, dimension: 'minecraft:overworld' },
  inventory: [
    { name: 'minecraft:oak_log', count: 8 },
    { name: 'minecraft:oak_log', count: 4 },
    { name: 'minecraft:bread', count: 3 },
  ],
};
const overworld = 'minecraft:overworld';
const checkpointCases = [
  ['health-range', ['10', '20'], { current: 16, minimum: 10, maximum: 20 }],
  ['hunger-range', ['12', '20'], { current: 18, minimum: 12, maximum: 20 }],
  ['alive', [], { health: 16 }],
  ['dimension', [overworld], { current: overworld, expected: overworld }],
  [
    'within-box',
    [overworld, '-5,60,-22', '0,70,-10'],
    {
      position: { x: -1, y: 64, z: -17 },
      expectedDimension: overworld,
      minimum: { x: -5, y: 60, z: -22 },
      maximum: { x: 0, y: 70, z: -10 },
    },
  ],
  [
    'within-radius',
    [overworld, '-4,64,-21', '5'],
    { expectedDimension: overworld, target: { x: -4, y: 64, z: -21 }, radius: 5, distance: 5 },
  ],
  ['altitude', ['64', '64'], { current: 64, minimum: 64, maximum: 64 }],
  ['home-saved', [], { home: { x: -4, y: 64, z: -21, dimension: overworld } }],
  ['home-dimension', [], { playerDimension: overworld, homeDimension: overworld }],
  ['at-home', ['5'], { radius: 5, distance: 5, playerDimension: overworld, homeDimension: overworld }],
  ['item-range', ['oak_log', '12', '12'], { name: 'minecraft:oak_log', current: 12, minimum: 12, maximum: 12 }],
  [
    'kit',
    ['oak_log=12', 'bread=3'],
    {
      quotas: [
        { name: 'minecraft:oak_log', count: 12, current: 12 },
        { name: 'minecraft:bread', count: 3, current: 3 },
      ],
    },
  ],
  ['allowed-items', ['oak_log', 'bread'], { allowed: ['minecraft:oak_log', 'minecraft:bread'], unexpected: [] }],
  [
    'item-ratio',
    ['oak_log', 'bread', '4', '4'],
    { numerator: 'minecraft:oak_log', denominator: 'minecraft:bread', ratio: 4, minimum: 4, maximum: 4 },
  ],
  ['total-items', ['15', '15'], { current: 15, minimum: 15, maximum: 15 }],
  ['diversity', ['2', '2'], { current: 2, minimum: 2, maximum: 2 }],
  ['inventory-records', ['3'], { current: 3, maximum: 3, physicalSlots: null }],
  // 3 bread x 5 hunger.
  ['food-reserve', ['15'], { supportedHunger: 15, required: 15 }],
  ['fresh', ['60', '2026-01-01T12:01:00Z'], { now: '2026-01-01T12:01:00Z', ageSeconds: 60, maximumSeconds: 60 }],
  [
    'saved-between',
    ['2026-01-01T12:00:00Z', '2026-01-01T12:00:00Z'],
    { earliest: '2026-01-01T12:00:00Z', latest: '2026-01-01T12:00:00Z' },
  ],
  // 29,999,984 - max(|-1|, |-17|).
  ['border-clearance', ['29000000'], { clearance: 29_999_967, required: 29_000_000, border: 29_999_984 }],
  // floor(-1 / 16) = -1 and floor(-17 / 16) = -2.
  [
    'chunk',
    [overworld, '-1', '-2'],
    { expectedDimension: overworld, current: { x: -1, z: -2 }, expected: { x: -1, z: -2 } },
  ],
  // floor(64 / 16).
  ['section', ['4'], { current: 4, expected: 4 }],
  ['inventory-quality', [], { errors: [], records: 3 }],
  ['vitals-quality', [], { health: 16, hunger: 18 }],
].map(([name, args, measurements]) => [
  name,
  args,
  {
    check: name,
    savedAt: snapshot.savedAt,
    passes: true,
    ...measurements,
    reason: 'Recorded evidence evaluated.',
    note: CHECKPOINT_NOTE,
  },
]);

const set = { type: 'set_home' },
  wait = { type: 'wait', seconds: 2 },
  home = { type: 'home' },
  eat = { type: 'eat' },
  inspect = { type: 'inspect_storage' };
const go = (x, y = 64, z = 0) => ({ type: 'goto', x, y, z });
const collect = (count) => ({ type: 'collect', block: 'minecraft:oak_log', count });
const deposit = (count) => ({ type: 'deposit', item: 'minecraft:oak_log', count });
const base = [set, go(1, 64, 2), collect(8), wait, deposit(8), home];
const other = [eat, inspect];
// Stands for the second routine: its file path on the command line, the parsed routine in a direct call.
const OTHER = Symbol('other routine');
const composeCases = [
  ['replace-range', ['2', '4', OTHER], [set, eat, inspect, deposit(8), home]],
  ['reverse-range', ['2', '4'], [set, wait, collect(8), go(1, 64, 2), deposit(8), home]],
  ['repeat-range', ['3', '4', '2'], [set, go(1, 64, 2), collect(8), wait, collect(8), wait, deposit(8), home]],
  // Steps 2-3 leave [set, wait, deposit, home]; slot 4 is before home.
  ['move-range', ['2', '3', '4'], [set, wait, deposit(8), go(1, 64, 2), collect(8), home]],
  ['swap-ranges', ['2', '3', '5', '5'], [set, deposit(8), wait, go(1, 64, 2), collect(8), home]],
  ['weave-chunks', [OTHER, '2'], [set, go(1, 64, 2), eat, inspect, collect(8), wait, deposit(8), home]],
  ['cycle-insert', [OTHER, '3'], [set, go(1, 64, 2), collect(8), eat, inspect, wait, deposit(8), home, eat, inspect]],
  ['before-type', ['collect', OTHER], [set, go(1, 64, 2), eat, inspect, collect(8), wait, deposit(8), home]],
  ['after-type', ['collect', OTHER], [set, go(1, 64, 2), collect(8), eat, inspect, wait, deposit(8), home]],
  ['replace-type', ['collect', OTHER], [set, go(1, 64, 2), eat, inspect, wait, deposit(8), home]],
  // x' = 2 * 3 - 1.
  ['mirror-route', ['x', '3'], [set, go(5, 64, 2), collect(8), wait, deposit(8), home]],
  // One quarter turn takes (x, z) = (1, 2) to (-z, x).
  ['rotate-route', ['0,64,0', '1'], [set, go(-2, 64, 1), collect(8), wait, deposit(8), home]],
  ['scale-route', ['0,64,0', '2'], [set, go(2, 64, 4), collect(8), wait, deposit(8), home]],
  // 1 rounds half up to 2.
  ['snap-route', ['2'], [set, go(2, 64, 2), collect(8), wait, deposit(8), home]],
  ['anchor-route', ['5,70,8'], [set, go(5, 70, 8), collect(8), wait, deposit(8), home]],
  ['offset-range', ['2', '3', '2', '3', '4'], [set, go(3, 67, 6), collect(8), wait, deposit(8), home]],
  ['set-collect', ['oak_log', '16'], [set, go(1, 64, 2), collect(16), wait, deposit(8), home]],
  ['set-deposit', ['oak_log', '16'], [set, go(1, 64, 2), collect(8), wait, deposit(16), home]],
  ['set-wait-range', ['3', '5', '6'], [set, go(1, 64, 2), collect(8), { type: 'wait', seconds: 6 }, deposit(8), home]],
  [
    'waypoint-waits',
    ['3', '2,64,0', '4,64,0'],
    [...base, go(2), { type: 'wait', seconds: 3 }, go(4), { type: 'wait', seconds: 3 }],
  ],
  ['round-trip', ['2,64,0', '4,64,0'], [...base, go(2), go(4), go(2)]],
  ['patrol', ['2', '2,64,0', '4,64,0'], [...base, go(2), go(4), go(2), go(4), go(2)]],
  ['resolve-home', ['5,64,9'], [set, go(1, 64, 2), collect(8), wait, deposit(8), go(5, 64, 9)]],
  ['storage-round', ['2,64,0', '4,64,0'], [...base, go(2), inspect, go(4), inspect]],
  // 10 logs in batches of 6: trips of 6 and 4.
  [
    'gather-store',
    ['oak_log', '10', '6', '2,64,0', '4,64,0'],
    [...base, go(2), collect(6), go(4), inspect, deposit(6), go(2), collect(4), go(4), inspect, deposit(4)],
  ],
].map(([name, args, actions]) => [name, args, { actions }]);

const commandNames = (commands) => commands.map(([signature]) => signature.split(' ')[0]).sort();
const caseNames = (cases) => cases.map(([name]) => name).sort();

async function fixtureFiles(t) {
  const directory = await testDirectory(t);
  const files = {
    routine: join(directory, 'routine.json'),
    other: join(directory, 'other.json'),
    snapshot: join(directory, 'snapshot.json'),
    missingBridge: join(directory, 'absent.json'),
  };
  const contents = [
    [files.routine, JSON.stringify(base)],
    [files.other, JSON.stringify(other)],
    [files.snapshot, JSON.stringify(snapshot)],
  ];
  await Promise.all(contents.map(([file, text]) => writeFile(file, text)));
  return { files, contents };
}
/** Runs one subcommand through its registrar in this process and returns what it printed. */
async function viaRegistrar(register, argv) {
  let printed;
  const program = new Command().exitOverride();
  register(program, {
    print: (value) => {
      printed = value;
    },
  });
  await program.parseAsync(argv, { from: 'user' });
  return printed;
}

test('all 75 blueprint, checkpoint, and compose commands match hand-worked answers, called directly and through their argument parsers', async (t) => {
  for (const [commands, cases] of [
    [BLUEPRINT_COMMANDS, blueprintCases],
    [CHECKPOINT_COMMANDS, checkpointCases],
    [COMPOSE_COMMANDS, composeCases],
  ]) {
    assert.equal(cases.length, 25);
    assert.deepEqual(caseNames(cases), commandNames(commands));
  }
  const { files, contents } = await fixtureFiles(t);
  const snapshotBefore = structuredClone(snapshot);
  for (const [name, args, expected] of blueprintCases) {
    assert.deepEqual(blueprintCalculation(name, args), expected, `blueprint ${name}`);
    const printed = await viaRegistrar(registerBlueprintTools, ['blueprint', name, '--', ...args]);
    assert.deepEqual(printed, expected, `blueprint ${name} arguments`);
  }
  for (const [name, args, expected] of checkpointCases) {
    assert.deepEqual(checkpointReport(snapshot, name, args), expected, `checkpoint ${name}`);
    const printed = await viaRegistrar(registerCheckpointTools, ['checkpoint', name, '--', files.snapshot, ...args]);
    assert.deepEqual(printed, expected, `checkpoint ${name} arguments`);
  }
  for (const [name, args, expected] of composeCases) {
    // Fresh copies, so a composition that edited its inputs in place could not also edit the expected actions.
    const input = structuredClone(base),
      second = structuredClone(other);
    const direct = composeRoutine(input, name, ...args.map((a) => (a === OTHER ? second : a)));
    assert.deepEqual(direct, expected, `compose ${name}`);
    assert.deepEqual([input, second], [base, other], `compose ${name} leaves its inputs unchanged`);
    assert.deepEqual(parseRoutine(JSON.stringify(direct)), expected.actions, `compose ${name} loads as a routine`);
    const printed = await viaRegistrar(registerRoutineCompose, [
      'compose',
      name,
      '--',
      files.routine,
      ...args.map((a) => (a === OTHER ? files.other : a)),
    ]);
    assert.deepEqual(printed, expected, `compose ${name} arguments`);
  }
  assert.deepEqual(snapshot, snapshotBefore);
  for (const [file, text] of contents) assert.equal(await readFile(file, 'utf8'), text);
});

/** Runs the real CLI and reports its exit code instead of throwing on a failure. */
async function cli(...args) {
  try {
    const { stdout, stderr } = await exec(process.execPath, ['src/cli.js', ...args]);
    return { code: 0, stdout, stderr };
  } catch (error) {
    if (typeof error.code !== 'number') throw error;
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
}
const expectedFor = (cases, name) => cases.find(([n]) => n === name)[2];

test('representative blueprint, checkpoint, and compose commands run offline as real CLI processes', {
  timeout: 120000,
}, async (t) => {
  const { files, contents } = await fixtureFiles(t);
  const offline = (group, name, ...params) =>
    cli('--bridge', files.missingBridge, '--json', group, name, '--', ...params);
  // One process per argument shape: fixed counts, a file plus variadic entries, negative
  // coordinates, a second routine file, and variadic points.
  const runs = [
    ['blueprint', 'spaced-posts', ['11', '4', '3'], blueprintCases],
    ['checkpoint', 'kit', [files.snapshot, 'oak_log=12', 'bread=3'], checkpointCases],
    ['checkpoint', 'within-box', [files.snapshot, overworld, '-5,60,-22', '0,70,-10'], checkpointCases],
    ['compose', 'replace-range', [files.routine, '2', '4', files.other], composeCases],
    ['compose', 'waypoint-waits', [files.routine, '3', '2,64,0', '4,64,0'], composeCases],
  ];
  const results = await Promise.all(runs.map(([group, name, params]) => offline(group, name, ...params)));
  runs.forEach(([group, name, , cases], i) => {
    const { code, stdout, stderr } = results[i],
      label = `${group} ${name}`;
    assert.equal(code, 0, label);
    assert.equal(stderr, '', label);
    const output = JSON.parse(stdout);
    // Output format: one two-space-indented JSON document and a trailing newline.
    assert.equal(stdout, `${JSON.stringify(output, null, 2)}\n`, label);
    assert.deepEqual(output, expectedFor(cases, name), label);
    if (group === 'compose') assert.deepEqual(parseRoutine(stdout), output.actions, label);
  });

  // Errors: a refused value, a missing required argument, and an unreadable file all exit 1
  // and print nothing on stdout; --json errors are machine-readable.
  const [refused, missing, unreadable] = await Promise.all([
    offline('blueprint', 'floor', '0', '5', '2'),
    cli('--json', 'blueprint', 'floor', '4', '5'),
    cli('checkpoint', 'alive', join(files.snapshot, '..', 'nowhere.json')),
  ]);
  assert.deepEqual(refused, {
    code: 1,
    stdout: '',
    stderr: `${JSON.stringify({ error: 'Use an integer from 1 to 1000000.' })}\n`,
  });
  assert.equal(missing.code, 1);
  assert.equal(missing.stdout, '');
  assert.match(missing.stderr, /missing required argument 'layers'/);
  assert.equal(unreadable.code, 1);
  assert.equal(unreadable.stdout, '');
  assert.match(unreadable.stderr, /^Error: ENOENT/);

  // Nothing above changes its inputs or creates the bridge file it was pointed at.
  for (const [file, text] of contents) assert.equal(await readFile(file, 'utf8'), text);
  await assert.rejects(access(files.missingBridge), { code: 'ENOENT' });

  // Failed predicates stay machine-readable reports that exit 0, and unknown evidence never passes.
  await writeFile(files.snapshot, JSON.stringify({ ...snapshot, player: { ...snapshot.player, health: 0 } }));
  const dead = await cli('--json', 'checkpoint', 'alive', files.snapshot);
  assert.equal(dead.code, 0);
  assert.equal(JSON.parse(dead.stdout).passes, false);
  await writeFile(files.snapshot, JSON.stringify({ ...snapshot, inventory: undefined }));
  const unknown = await cli('--json', 'checkpoint', 'item-range', files.snapshot, 'oak_log', '0', '100');
  assert.equal(unknown.code, 0);
  assert.equal(JSON.parse(unknown.stdout).passes, null);
});
