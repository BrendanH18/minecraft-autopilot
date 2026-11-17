import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { startBridge } from '../src/bridge-server.js';
import { Harness } from '../src/harness.js';
import { DemoDriver } from '../src/demo-driver.js';
import { EXPEDITION_COMMANDS, expeditionReport } from '../src/expedition-tools.js';
import { BLUEPRINT_COMMANDS, blueprintCalculation } from '../src/blueprint-tools.js';
import { CHECKPOINT_COMMANDS, checkpointReport } from '../src/snapshot-checks.js';
import { COMPOSE_COMMANDS, composeRoutine } from '../src/routine-compose.js';
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
const blueprintArgs = {
  floor: ['4', '5', '2'],
  'floor-border': ['5', '4', '1'],
  checkerboard: ['5', '3'],
  stripes: ['7', '2', '2'],
  wall: ['6', '3', '2'],
  'wall-opening': ['10', '4', '2', '3', '3'],
  'perimeter-walls': ['5', '4', '3', '1'],
  'closed-shell': ['5', '4', '3', '1'],
  'open-box': ['5', '4', '3', '1'],
  room: ['3', '2', '1', '1'],
  'cuboid-frame': ['5', '4', '3'],
  pillars: ['3', '4', '2', '2'],
  'solid-stairs': ['2', '3', '1', '2'],
  'gable-fill': ['5', '3'],
  pyramid: ['5', '4'],
  'tunnel-clear': ['2', '3', '4'],
  'tunnel-lining': ['2', '3', '4', '1'],
  'spaced-posts': ['11', '4', '3'],
  'grid-pillars': ['6', '5', '3', '3', '2'],
  'layer-plan': ['2', '3', '3'],
  'material-stacks': ['130', '64'],
  'batch-output': ['10', '4', '3'],
  'material-waste': ['101', '10'],
  'material-split': ['10', '3'],
  'build-time': ['120', '15'],
};
const checkpointArgs = {
  'health-range': ['10', '20'],
  'hunger-range': ['12', '20'],
  alive: [],
  dimension: ['minecraft:overworld'],
  'within-box': ['minecraft:overworld', '-5,60,-22', '0,70,-10'],
  'within-radius': ['minecraft:overworld', '-4,64,-21', '5'],
  altitude: ['64', '64'],
  'home-saved': [],
  'home-dimension': [],
  'at-home': ['5'],
  'item-range': ['oak_log', '12', '12'],
  kit: ['oak_log=12', 'bread=3'],
  'allowed-items': ['oak_log', 'bread'],
  'item-ratio': ['oak_log', 'bread', '4', '4'],
  'total-items': ['15', '15'],
  diversity: ['2', '2'],
  'inventory-records': ['3'],
  'food-reserve': ['15'],
  fresh: ['60', '2026-01-01T12:01:00Z'],
  'saved-between': ['2026-01-01T12:00:00Z', '2026-01-01T12:00:00Z'],
  'border-clearance': ['29000000'],
  chunk: ['minecraft:overworld', '-1', '-2'],
  section: ['4'],
  'inventory-quality': [],
  'vitals-quality': [],
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

test('75 blueprint, checkpoint, and compose commands run offline as real CLI processes', {
  timeout: 180000,
}, async (t) => {
  const directory = await testDirectory(t),
    missingBridge = join(directory, 'absent.json');
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
  const base = [
    { type: 'set_home' },
    { type: 'goto', x: 1, y: 64, z: 2 },
    { type: 'collect', block: 'minecraft:oak_log', count: 8 },
    { type: 'wait', seconds: 2 },
    { type: 'deposit', item: 'minecraft:oak_log', count: 8 },
    { type: 'home' },
  ];
  const other = [{ type: 'eat' }, { type: 'inspect_storage' }];
  const routineFile = join(directory, 'routine.json'),
    otherFile = join(directory, 'other.json'),
    snapshotFile = join(directory, 'snapshot.json');
  const files = [
    [routineFile, base],
    [otherFile, other],
    [snapshotFile, snapshot],
  ];
  await Promise.all(files.map(([file, data]) => writeFile(file, JSON.stringify(data))));
  const composeArgs = {
    'replace-range': ['2', '4', otherFile],
    'reverse-range': ['2', '4'],
    'repeat-range': ['3', '4', '2'],
    'move-range': ['2', '3', '4'],
    'swap-ranges': ['2', '3', '5', '5'],
    'weave-chunks': [otherFile, '2'],
    'cycle-insert': [otherFile, '3'],
    'before-type': ['collect', otherFile],
    'after-type': ['collect', otherFile],
    'replace-type': ['collect', otherFile],
    'mirror-route': ['x', '3'],
    'rotate-route': ['0,64,0', '1'],
    'scale-route': ['0,64,0', '2'],
    'snap-route': ['2'],
    'anchor-route': ['5,70,8'],
    'offset-range': ['2', '3', '2', '3', '4'],
    'set-collect': ['oak_log', '16'],
    'set-deposit': ['oak_log', '16'],
    'set-wait-range': ['3', '5', '6'],
    'waypoint-waits': ['3', '2,64,0', '4,64,0'],
    'round-trip': ['2,64,0', '4,64,0'],
    patrol: ['2', '2,64,0', '4,64,0'],
    'resolve-home': ['5,64,9'],
    'storage-round': ['2,64,0', '4,64,0'],
    'gather-store': ['oak_log', '10', '6', '2,64,0', '4,64,0'],
  };
  let exercised = 0;
  for (const [group, commands, fixtures] of [
    ['blueprint', BLUEPRINT_COMMANDS, blueprintArgs],
    ['checkpoint', CHECKPOINT_COMMANDS, checkpointArgs],
    ['compose', COMPOSE_COMMANDS, composeArgs],
  ]) {
    assert.equal(commands.length, 25);
    for (const [signature] of commands) {
      const name = signature.split(' ')[0],
        args = fixtures[name];
      assert.ok(args, name);
      const params = group === 'blueprint' ? args : [group === 'checkpoint' ? snapshotFile : routineFile, ...args];
      const { stdout, stderr } = await exec(process.execPath, [
        'src/cli.js',
        '--bridge',
        missingBridge,
        '--json',
        group,
        name,
        '--',
        ...params,
      ]);
      const output = JSON.parse(stdout);
      const expected =
        group === 'blueprint'
          ? blueprintCalculation(name, args)
          : group === 'checkpoint'
            ? checkpointReport(snapshot, name, args)
            : composeRoutine(base, name, ...args.map((a) => (a === otherFile ? other : a)));
      assert.deepEqual(output, expected, `${group} ${name}`);
      assert.equal(stderr, '');
      if (group === 'checkpoint') assert.equal(output.passes, true, name);
      if (group === 'compose') assert.deepEqual(parseRoutine(stdout), output.actions);
      exercised++;
    }
  }
  assert.equal(exercised, 75);
  for (const [file, data] of files) assert.equal(await readFile(file, 'utf8'), JSON.stringify(data));
  // Failed predicates stay machine-readable reports, and unknown evidence never passes.
  await writeFile(snapshotFile, JSON.stringify({ ...snapshot, player: { ...snapshot.player, health: 0 } }));
  const { stdout } = await exec(process.execPath, ['src/cli.js', '--json', 'checkpoint', 'alive', snapshotFile]);
  assert.equal(JSON.parse(stdout).passes, false);
  await writeFile(snapshotFile, JSON.stringify({ ...snapshot, inventory: undefined }));
  const unknown = await exec(process.execPath, [
    'src/cli.js',
    '--json',
    'checkpoint',
    'item-range',
    snapshotFile,
    'oak_log',
    '0',
    '100',
  ]);
  assert.equal(JSON.parse(unknown.stdout).passes, null);
});
