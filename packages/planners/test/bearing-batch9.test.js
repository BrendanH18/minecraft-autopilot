import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Command } from 'commander';
import { bearingCalculation, registerBearingTools, BEARING_COMMANDS } from '../src/bearing-tools.js';
import { CLI_PATH } from './cli-path.js';
const cases = [
  [
    'yaw-vector',
    ['0'],
    {
      x: 0,
      z: 1,
    },
  ],
  [
    'pitch-vector',
    ['0', '0'],
    {
      x: 0,
      y: 0,
      z: 1,
    },
  ],
  ['vector-yaw', ['0', '1'], 0],
  ['vector-pitch', ['1', '0'], 0],
  ['signed-turn', ['350', '10'], 20],
  ['turn-time', ['350', '10', '10'], 2],
  ['step-yaw', ['350', '10', '5'], 355],
  ['compass-sector', ['90', '4'], 1],
  ['sector-center', ['1', '4'], 90],
  [
    'forward-offset',
    ['0', '3'],
    {
      x: 0,
      z: 3,
    },
  ],
  [
    'right-offset',
    ['0', '3'],
    {
      x: -3,
      z: 0,
    },
  ],
  [
    'local-offset',
    ['0', '2', '3'],
    {
      x: -3,
      z: 2,
    },
  ],
  [
    'world-offset',
    ['0', '2', '3'],
    {
      forward: 3,
      right: -2,
    },
  ],
  ['cone-test', ['0', '20', '15'], false],
  ['cone-width', ['4', '0'], 0],
  ['angular-size', ['2', '1'], 90],
  ['heading-average', ['350', '10'], 0],
  ['heading-blend', ['350', '10', '0.5'], 0],
  ['turn-samples', ['350', '10', '2'], [350, 0, 10]],
  ['slope-angle', ['1', '1'], 45],
  ['rise-from-angle', ['0', '10'], 0],
  ['run-from-angle', ['45', '2'], 2],
  ['pitch-limit', ['50', '-20', '20'], 20],
  [
    'crosswind',
    ['0', '0', '5'],
    {
      forward: 5,
      right: 0,
    },
  ],
  ['sweep-count', ['90', '0'], 4],
];
function close(actual, expected) {
  if (typeof expected === 'number') {
    assert.equal(typeof actual, 'number');
    assert.ok(Math.abs(actual - expected) <= 1e-8 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
  } else if (expected && typeof expected === 'object') {
    assert.deepEqual(Object.keys(actual), Object.keys(expected));
    for (const k of Object.keys(expected)) close(actual[k], expected[k]);
  } else assert.equal(actual, expected);
}
test('bearing: 25 documented and distinct commands', () => {
  assert.equal(BEARING_COMMANDS.length, 25);
  assert.equal(new Set(BEARING_COMMANDS.map(([s]) => s.split(' ')[0])).size, 25);
});
for (const [command, args, expected] of cases) {
  test(`bearing ${command}: direct expected result and Commander behavior`, async () => {
    const result = bearingCalculation(command, args);
    close(result.result, expected);
    assert.match(result.note, /Offline|Continuous|Abstract/);
    const program = new Command().exitOverride();
    let printed;
    registerBearingTools(program, {
      print: (value) => {
        printed = value;
      },
    });
    await program.parseAsync(['bearing', command, ...args], { from: 'user' });
    close(printed.result, expected);
  });
  test(`bearing ${command}: real CLI`, () => {
    const run = spawnSync(process.execPath, [CLI_PATH, 'bearing', command, ...args], {
      encoding: 'utf8',
      timeout: 15000,
    });
    assert.equal(run.status, 0, run.stderr);
    close(JSON.parse(run.stdout).result, expected);
  });
  test(`bearing ${command}: malformed input rejected`, () => {
    assert.throws(() => bearingCalculation(command, []));
    assert.throws(() =>
      bearingCalculation(
        command,
        args.map((v, i) => (i === 0 ? 'NaN' : v)),
      ),
    );
  });
}
test('bearing: unknown command rejected', () => assert.throws(() => bearingCalculation('unknown', [])));
test('bearing rejects undefined directions and means', () => {
  assert.throws(() => bearingCalculation('vector-yaw', ['0', '0']));
  assert.throws(() => bearingCalculation('heading-average', ['0', '180']));
  assert.throws(() => bearingCalculation('turn-samples', ['0', '90', '1000']));
});
