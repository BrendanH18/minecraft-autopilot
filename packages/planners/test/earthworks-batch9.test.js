import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Command } from 'commander';
import { earthworksCalculation, registerEarthworksTools, EARTHWORKS_COMMANDS } from '../src/earthworks-tools.js';
import { CLI_PATH } from './cli-path.js';
const cases = [
  ['bench-cut', ['4', '6', '2'], 24],
  ['trapezoid-cut', ['2', '4', '3', '5'], 45],
  ['side-slope-width', ['2', '3', '0.5'], 5],
  ['bank-swell', ['100', '20'], 120],
  ['compact-fill', ['100', '20'], 80],
  ['borrow-required', ['80', '20'], 100],
  [
    'cut-fill-balance',
    ['100', '90', '80'],
    {
      usable: 80,
      borrow: 10,
      surplus: 0,
    },
  ],
  ['haul-trips', ['100', '30'], 4],
  ['haul-time', ['3', '10', '2', '4', '1'], 45],
  ['dig-time', ['100', '2'], 50],
  ['crew-time', ['100', '2', '5', '0.5'], 20],
  ['lift-count', ['5', '2'], 3],
  [
    'lift-schedule',
    ['5', '2', '3'],
    [
      {
        lift: 1,
        height: 2,
        volume: 6,
      },
      {
        lift: 2,
        height: 2,
        volume: 6,
      },
      {
        lift: 3,
        height: 1,
        volume: 3,
      },
    ],
  ],
  ['overdig', ['2', '3', '4', '1'], 56],
  ['topsoil-strip', ['10', '5', '0.2'], 10],
  ['stockpile-cone', ['1', '3'], Math.PI],
  ['stockpile-height', ['0', '1'], 0],
  ['stockpile-footprint', ['12', '3'], 12],
  ['average-end-area', ['2', '6', '10'], 40],
  ['prismoidal', ['2', '3', '4', '6'], 18],
  ['retaining-pressure', ['4', '2'], 16],
  ['batter-run', ['3', '2'], 6],
  ['slope-face', ['3', '4', '2'], 10],
  ['drain-fall', ['100', '2'], 2],
  ['dewatering-time', ['100', '2', '7'], 20],
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
test('earthworks: 25 documented and distinct commands', () => {
  assert.equal(EARTHWORKS_COMMANDS.length, 25);
  assert.equal(new Set(EARTHWORKS_COMMANDS.map(([s]) => s.split(' ')[0])).size, 25);
});
for (const [command, args, expected] of cases) {
  test(`earthworks ${command}: direct expected result and Commander behavior`, async () => {
    const result = earthworksCalculation(command, args);
    close(result.result, expected);
    assert.match(result.note, /Offline|Continuous|Abstract/);
    const program = new Command().exitOverride();
    let printed;
    registerEarthworksTools(program, {
      print: (value) => {
        printed = value;
      },
    });
    await program.parseAsync(['earthworks', command, ...args], { from: 'user' });
    close(printed.result, expected);
  });
  test(`earthworks ${command}: real CLI`, () => {
    const run = spawnSync(process.execPath, [CLI_PATH, 'earthworks', command, ...args], {
      encoding: 'utf8',
      timeout: 15000,
    });
    assert.equal(run.status, 0, run.stderr);
    close(JSON.parse(run.stdout).result, expected);
  });
  test(`earthworks ${command}: malformed input rejected`, () => {
    assert.throws(() => earthworksCalculation(command, []));
    assert.throws(() =>
      earthworksCalculation(
        command,
        args.map((v, i) => (i === 0 ? 'NaN' : v)),
      ),
    );
  });
}
test('earthworks: unknown command rejected', () => assert.throws(() => earthworksCalculation('unknown', [])));
test('earthworks bounds rates and allocations', () => {
  assert.throws(() => earthworksCalculation('dewatering-time', ['10', '2', '2']));
  assert.throws(() => earthworksCalculation('lift-schedule', ['1001', '1', '1']));
  assert.throws(() => earthworksCalculation('borrow-required', ['1', '100']));
});
