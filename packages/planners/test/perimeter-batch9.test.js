import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Command } from 'commander';
import { perimeterCalculation, registerPerimeterTools, PERIMETER_COMMANDS } from '../src/perimeter-tools.js';
import { CLI_PATH } from './cli-path.js';
const cases = [
  ['gate-remainder', ['40', '3', '2'], 34],
  ['fence-layers', ['40', '2'], 80],
  ['post-count-open', ['10', '3'], 5],
  ['post-count-closed', ['12', '3'], 4],
  [
    'slope-post-tops',
    ['10', '5', '0', '2', '3'],
    [
      {
        distance: 0,
        top: 3,
      },
      {
        distance: 5,
        top: 4,
      },
      {
        distance: 10,
        top: 5,
      },
    ],
  ],
  ['post-loop', ['12', '3'], [0, 3, 6, 9]],
  ['wire-rolls', ['40', '3', '50'], 3],
  ['mesh-rolls', ['40', '3', '15', '2'], 6],
  ['paint-area', ['40', '2', '2'], 160],
  ['post-material', ['10', '3', '2'], 60],
  ['footing-volume', ['2', '1', '3'], 18.84955592153876],
  ['brace-count', ['4', '2', '1'], 8],
  ['panel-count', ['10', '3'], 4],
  ['panel-width', ['10', '4'], 2.5],
  ['overlap-panels', ['10', '3', '1'], 5],
  ['picket-count', ['10', '1', '1'], 5],
  ['picket-gap', ['10', '5', '1'], 1.25],
  ['corner-diagonal', ['3', '4'], 5],
  ['offset-rectangle', ['4', '6', '1'], 28],
  ['patrol-time', ['100', '5', '4', '3'], 32],
  [
    'patrol-coverage',
    ['100', '5', '8'],
    {
      separation: 20,
      covered: false,
    },
  ],
  ['gate-throughput', ['2', '3'], 40],
  ['maintenance-sections', ['100', '30'], 4],
  ['repair-stock', ['100', '10', '20'], 12],
  ['cost-estimate', ['40', '10', '2', '3'], 110],
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
test('perimeter: 25 documented and distinct commands', () => {
  assert.equal(PERIMETER_COMMANDS.length, 25);
  assert.equal(new Set(PERIMETER_COMMANDS.map(([s]) => s.split(' ')[0])).size, 25);
});
for (const [command, args, expected] of cases) {
  test(`perimeter ${command}: direct expected result and Commander behavior`, async () => {
    const result = perimeterCalculation(command, args);
    close(result.result, expected);
    assert.match(result.note, /Offline|Continuous|Abstract/);
    const program = new Command().exitOverride();
    let printed;
    registerPerimeterTools(program, {
      print: (value) => {
        printed = value;
      },
    });
    await program.parseAsync(['perimeter', command, ...args], { from: 'user' });
    close(printed.result, expected);
  });
  test(`perimeter ${command}: real CLI`, () => {
    const run = spawnSync(process.execPath, [CLI_PATH, 'perimeter', command, ...args], {
      encoding: 'utf8',
      timeout: 15000,
    });
    assert.equal(run.status, 0, run.stderr);
    close(JSON.parse(run.stdout).result, expected);
  });
  test(`perimeter ${command}: malformed input rejected`, () => {
    assert.throws(() => perimeterCalculation(command, []));
    assert.throws(() =>
      perimeterCalculation(
        command,
        args.map((v, i) => (i === 0 ? 'NaN' : v)),
      ),
    );
  });
}
test('perimeter: unknown command rejected', () => assert.throws(() => perimeterCalculation('unknown', [])));
test('perimeter rejects impossible dimensions and excessive allocations', () => {
  assert.throws(() => perimeterCalculation('gate-remainder', ['3', '2', '2']));
  assert.throws(() => perimeterCalculation('overlap-panels', ['10', '2', '2']));
  assert.throws(() => perimeterCalculation('slope-post-tops', ['1000', '1', '0', '0', '1']));
});
