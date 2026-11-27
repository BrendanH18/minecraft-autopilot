import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Command } from 'commander';
import { lightplanCalculation, registerLightplanTools, LIGHTPLAN_COMMANDS } from '../src/lightplan-tools.js';
import { CLI_PATH } from './cli-path.js';
const cases = [
  ['falloff', ['15', '4'], 11],
  ['reach', ['15', '8'], 7],
  ['vertical-reach', ['15', '8', '3'], 4],
  ['line-spacing', ['15', '8'], 15],
  ['square-spacing', ['15', '8'], 7],
  ['diamond-cells', ['2'], 13],
  ['diamond-ring', ['2'], 8],
  [
    'diamond-points',
    ['1'],
    [
      {
        x: 0,
        z: -1,
      },
      {
        x: -1,
        z: 0,
      },
      {
        x: 0,
        z: 0,
      },
      {
        x: 1,
        z: 0,
      },
      {
        x: 0,
        z: 1,
      },
    ],
  ],
  ['line-levels', ['3', '5'], [3, 2, 1, 0, 0]],
  ['between-sources', ['3', '4'], [3, 2, 1, 2, 3]],
  ['line-lit-count', ['3', '2', '5', '2'], 3],
  [
    'line-deficits',
    ['3', '2', '5', '2'],
    [
      {
        index: 0,
        deficit: 1,
      },
      {
        index: 4,
        deficit: 1,
      },
    ],
  ],
  ['grid-source-count', ['5', '5', '4'], 4],
  [
    'grid-sources',
    ['3', '3', '2'],
    [
      {
        x: 0,
        z: 0,
      },
      {
        x: 2,
        z: 0,
      },
      {
        x: 0,
        z: 2,
      },
      {
        x: 2,
        z: 2,
      },
    ],
  ],
  ['single-level', ['15', '0', '0', '3', '4'], 8],
  ['height-level', ['15', '3', '4'], 8],
  ['corner-worst', ['15', '5', '7'], 10],
  ['center-worst', ['15', '5', '7'], 10],
  ['hanging-limit', ['15', '8', '3'], 4],
  ['wall-row-count', ['10', '4', '2'], 8],
  ['fuel-budget', ['4', '100', '30'], 16],
  ['replacement-cycle', ['4', '30', '100'], 12],
  ['coverage-lower-bound', ['26', '2'], 2],
  ['level-margin', ['15', '4', '8'], 3],
  [
    'rectangle-audit',
    ['3', '1', '1', '3', '3', '2'],
    {
      minimum: 1,
      maximum: 3,
      mean: 1.6666666666666667,
      belowMinimum: 4,
    },
  ],
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
test('lightplan: 25 documented and distinct commands', () => {
  assert.equal(LIGHTPLAN_COMMANDS.length, 25);
  assert.equal(new Set(LIGHTPLAN_COMMANDS.map(([s]) => s.split(' ')[0])).size, 25);
});
for (const [command, args, expected] of cases) {
  test(`lightplan ${command}: direct expected result and Commander behavior`, async () => {
    const result = lightplanCalculation(command, args);
    close(result.result, expected);
    assert.match(result.note, /Offline|Continuous|Abstract/);
    const program = new Command().exitOverride();
    let printed;
    registerLightplanTools(program, {
      print: (value) => {
        printed = value;
      },
    });
    await program.parseAsync(['lightplan', command, ...args], { from: 'user' });
    close(printed.result, expected);
  });
  test(`lightplan ${command}: real CLI`, () => {
    const run = spawnSync(process.execPath, [CLI_PATH, 'lightplan', command, ...args], {
      encoding: 'utf8',
      timeout: 15000,
    });
    assert.equal(run.status, 0, run.stderr);
    close(JSON.parse(run.stdout).result, expected);
  });
  test(`lightplan ${command}: malformed input rejected`, () => {
    assert.throws(() => lightplanCalculation(command, []));
    assert.throws(() =>
      lightplanCalculation(
        command,
        args.map((v, i) => (i === 0 ? 'NaN' : v)),
      ),
    );
  });
}
test('lightplan: unknown command rejected', () => assert.throws(() => lightplanCalculation('unknown', [])));
test('lightplan bounds allocations and unreachable source layouts', () => {
  assert.throws(() => lightplanCalculation('diamond-points', ['100']));
  assert.throws(() => lightplanCalculation('square-spacing', ['1', '2']));
  assert.throws(() => lightplanCalculation('grid-sources', ['100', '100', '1']));
});
test('lightplan rejects zero minimum for finite reach estimates', () => {
  for (const [command, args] of [
    ['reach', ['15', '0']],
    ['vertical-reach', ['15', '0', '1']],
    ['hanging-limit', ['15', '0', '1']],
    ['line-spacing', ['15', '0']],
    ['square-spacing', ['15', '0']],
  ])
    assert.throws(() => lightplanCalculation(command, args));
  assert.equal(lightplanCalculation('line-lit-count', ['1', '0', '10', '0']).result, 10);
  assert.equal(lightplanCalculation('line-lit-count', ['1', '0', '10', '2']).result, 0);
});

test('lightplan fractional reach preserves the unreachable marker', () => {
  assert.equal(lightplanCalculation('vertical-reach', ['15', '14.5', '1']).result, -1);
  assert.equal(lightplanCalculation('vertical-reach', ['15', '14.5', '0.25']).result, 0.25);
  assert.equal(lightplanCalculation('reach', ['14.5', '15']).result, -1);
});
