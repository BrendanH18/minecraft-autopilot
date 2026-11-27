import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Command } from 'commander';
import { railplanCalculation, registerRailplanTools, RAILPLAN_COMMANDS } from '../src/railplan-tools.js';
import { CLI_PATH } from './cli-path.js';
const cases = [
  ['powered-layout', ['10', '4'], [0, 4, 8, 9]],
  ['powered-count', ['10', '4'], 4],
  ['regular-count', ['10', '4'], 6],
  [
    'track-batches',
    ['20', '16'],
    {
      batches: 2,
      produced: 32,
      surplus: 12,
    },
  ],
  [
    'material-shortage',
    ['20', '5', '12', '8'],
    {
      regularDeficit: 8,
      poweredDeficit: 0,
    },
  ],
  [
    'dual-track',
    ['10', '3'],
    {
      rails: 20,
      width: 4,
    },
  ],
  [
    'bed-shoulders',
    ['10', '2', '1', '2'],
    {
      bedWidth: 7,
      shoulderCells: 40,
    },
  ],
  [
    'station-platforms',
    ['10', '2', '3', '1'],
    {
      platformLength: 12,
      platformCells: 72,
    },
  ],
  ['slope-length', ['3', '4'], 5],
  [
    'grade-check',
    ['10', '2', '15'],
    {
      gradePercent: 20,
      withinLimit: false,
    },
  ],
  ['ramp-run', ['4', '25'], 16],
  [
    'ramp-blocks',
    ['4', '3'],
    {
      rising: 4,
      level: 8,
      total: 12,
    },
  ],
  ['travel-time', ['100', '5', '3'], 23],
  ['roundtrip', ['100', '5', '3'], 46],
  ['headway', ['60', '3'], 20],
  ['fleet-size', ['61', '20'], 4],
  ['throughput', ['64', '20'], 192],
  ['cargo-trips', ['1000', '9', '64'], 2],
  ['station-capacity', ['2', '30'], 4],
  ['queue-clearance', ['4', '10'], 30],
  ['signal-blocks', ['100', '30'], 4],
  ['signal-boundaries', ['100', '30'], [0, 25, 50, 75, 100]],
  ['braking-distance', ['10', '2'], 25],
  ['stopping-reserve', ['10', '2', '1'], 35],
  ['curve-arc', ['2', '180'], 6.283185307179586],
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
test('railplan: 25 documented and distinct commands', () => {
  assert.equal(RAILPLAN_COMMANDS.length, 25);
  assert.equal(new Set(RAILPLAN_COMMANDS.map(([s]) => s.split(' ')[0])).size, 25);
});
for (const [command, args, expected] of cases) {
  test(`railplan ${command}: direct expected result and Commander behavior`, async () => {
    const result = railplanCalculation(command, args);
    close(result.result, expected);
    assert.match(result.note, /Offline|Continuous|Abstract/);
    const program = new Command().exitOverride();
    let printed;
    registerRailplanTools(program, {
      print: (value) => {
        printed = value;
      },
    });
    await program.parseAsync(['railplan', command, ...args], { from: 'user' });
    close(printed.result, expected);
  });
  test(`railplan ${command}: real CLI`, () => {
    const run = spawnSync(process.execPath, [CLI_PATH, 'railplan', command, ...args], {
      encoding: 'utf8',
      timeout: 15000,
    });
    assert.equal(run.status, 0, run.stderr);
    close(JSON.parse(run.stdout).result, expected);
  });
  test(`railplan ${command}: malformed input rejected`, () => {
    assert.throws(() => railplanCalculation(command, []));
    assert.throws(() =>
      railplanCalculation(
        command,
        args.map((v, i) => (i === 0 ? 'NaN' : v)),
      ),
    );
  });
}
test('railplan: unknown command rejected', () => assert.throws(() => railplanCalculation('unknown', [])));
test('railplan bounds allocations and zero divisors', () => {
  assert.throws(() => railplanCalculation('signal-boundaries', ['1000', '1']));
  assert.throws(() => railplanCalculation('fleet-size', ['10', '0']));
});
