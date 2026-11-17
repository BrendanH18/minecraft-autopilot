import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { productionCalculation, PRODUCTION_COMMANDS, registerProductionTools } from '../src/production-tools.js';
const cases = [
  [
    'recipe',
    [17, 4, 3],
    {
      batches: 5,
      input: 15,
      output: 20,
      surplus: 3,
    },
  ],
  [
    'stock-batches',
    [17, 3, 4],
    {
      batches: 5,
      output: 20,
      leftover: 2,
    },
  ],
  [
    'bottleneck',
    ['20,9', '3,2'],
    {
      batches: 4,
      remaining: [8, 1],
      limitingItems: [2],
    },
  ],
  [
    'shortfall',
    [10, 4, '5,2', '3,1'],
    {
      batches: 3,
      missing: [4, 1],
    },
  ],
  [
    'chain',
    [10, 4, 3, 2],
    {
      firstBatches: 4,
      secondBatches: 5,
      intermediateSurplus: 1,
      finalSurplus: 0,
    },
  ],
  [
    'byproduct',
    [5, 4, 2],
    {
      main: 20,
      byproduct: 10,
    },
  ],
  [
    'recycle',
    [100, 0.5, 3],
    {
      recovered: 87.5,
      remaining: 12.5,
    },
  ],
  [
    'cycle-time',
    [10, 8, 3],
    {
      waves: 4,
      seconds: 32,
      unusedBatchSlots: 2,
    },
  ],
  [
    'rate',
    [4, 8, 3],
    {
      perSecond: 1.5,
      perMinute: 90,
    },
  ],
  [
    'deadline',
    [10, 8, 25],
    {
      batchesPerMachine: 3,
      machines: 4,
    },
  ],
  [
    'batch-cap',
    [30, 4, 5],
    {
      batches: 5,
      output: 20,
      missing: 10,
    },
  ],
  [
    'startup',
    [5, 10, 3],
    {
      seconds: 25,
    },
  ],
  [
    'setup-runs',
    [10, 4, 5, 2],
    {
      runs: 3,
      seconds: 35,
    },
  ],
  [
    'input-rate',
    [20, 3, 4],
    {
      inputPerMinute: 15,
    },
  ],
  [
    'utilization',
    [30, 4, 8, 2],
    {
      capacityPerMinute: 60,
      utilization: 0.5,
      overloaded: false,
    },
  ],
  [
    'parallel-lines',
    [10, 3],
    {
      batches: [4, 3, 3],
    },
  ],
  [
    'output-stock',
    [3, 4, 5, 20],
    {
      available: 17,
      missing: 3,
      surplus: 0,
    },
  ],
  [
    'loss-allowance',
    [9, 4, 0.75],
    {
      batches: 3,
      grossOutput: 12,
      expectedUsable: 9,
    },
  ],
  [
    'change-yield',
    [20, 3, 5],
    {
      oldBatches: 7,
      newBatches: 4,
      savedBatches: 3,
    },
  ],
  [
    'shared-input',
    [30, 4, 3, 4],
    {
      secondBatches: 4,
      leftover: 2,
    },
  ],
  [
    'quota-order',
    ['10,7', '4,3', '2,5'],
    {
      batches: [3, 3],
      sharedInput: 21,
    },
  ],
  [
    'work-in-progress',
    [10, 6, 3, 4],
    {
      unfinished: 4,
      tiedInput: 12,
      finishedOutput: 24,
    },
  ],
  [
    'reorder-point',
    [2.5, 4, 3],
    {
      reorderAt: 13,
    },
  ],
  [
    'campaign',
    ['10,7', '4,3', '2,5'],
    {
      batches: [3, 3],
      seconds: 21,
    },
  ],
  [
    'completion-window',
    [10, 2, 5, 3],
    {
      earliestSeconds: 8,
      latestSeconds: 20,
    },
  ],
];
const specs = {
  recipe: ['I', 'J', 'J'],
  'stock-batches': ['I', 'J', 'J'],
  bottleneck: ['C', 'C'],
  shortfall: ['I', 'J', 'C', 'C'],
  chain: ['I', 'J', 'J', 'J'],
  byproduct: ['I', 'J', 'I'],
  recycle: ['N', 'R', 'I'],
  'cycle-time': ['I', 'P', 'J'],
  rate: ['J', 'P', 'J'],
  deadline: ['I', 'P', 'P'],
  'batch-cap': ['I', 'J', 'I'],
  startup: ['I', 'N', 'P'],
  'setup-runs': ['I', 'J', 'N', 'P'],
  'input-rate': ['N', 'P', 'P'],
  utilization: ['N', 'J', 'P', 'J'],
  'parallel-lines': ['I', 'J'],
  'output-stock': ['I', 'J', 'I', 'I'],
  'loss-allowance': ['I', 'J', 'R'],
  'change-yield': ['I', 'J', 'J'],
  'shared-input': ['I', 'I', 'J', 'J'],
  'quota-order': ['C', 'C', 'C'],
  'work-in-progress': ['I', 'I', 'J', 'J'],
  'reorder-point': ['N', 'N', 'I'],
  campaign: ['C', 'C', 'L'],
  'completion-window': ['I', 'P', 'P', 'J'],
};
for (const [name, args, expected] of cases)
  test(`production ${name} has a hand-calculated result`, () => {
    const result = productionCalculation(name, args);
    for (const [key, value] of Object.entries(expected)) {
      if (typeof value === 'number')
        assert.ok(Math.abs(result[key] - value) < 1e-8, `${key}: ${result[key]} != ${value}`);
      else assert.deepEqual(result[key], value);
    }
    assert.match(result.note, /Offline/);
    assert.throws(() => productionCalculation(name, []));
    for (let position = 0; position < args.length; position++)
      for (const invalid of ['NaN', '', -1, Infinity, 1000001, null, false]) {
        assert.throws(() =>
          productionCalculation(
            name,
            args.map((v, i) => (i === position ? invalid : v)),
          ),
        );
      }
  });
test('production integer, ratio, list, and allocation limits', () => {
  for (const [name, args] of cases)
    specs[name].forEach((kind, position) => {
      const bad =
        kind === 'I' || kind === 'J'
          ? 1.5
          : kind === 'R'
            ? 1.1
            : kind === 'L' || kind === 'W' || kind === 'C'
              ? Array(1001).fill('1').join(',')
              : null;
      if (bad !== null)
        assert.throws(() =>
          productionCalculation(
            name,
            args.map((v, i) => (i === position ? bad : v)),
          ),
        );
      if (kind === 'P' || kind === 'J')
        assert.throws(() =>
          productionCalculation(
            name,
            args.map((v, i) => (i === position ? 0 : v)),
          ),
        );
    });
});
test('production real CLI executes every documented command', () => {
  const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
  for (const [name, args, expected] of cases) {
    const result = JSON.parse(
      execFileSync(process.execPath, [cli, 'production', name, ...args.map(String)], {
        encoding: 'utf8',
        timeout: 15000,
      }),
    );
    for (const [key, value] of Object.entries(expected)) {
      if (typeof value === 'number') assert.ok(Math.abs(result[key] - value) < 1e-8);
      else assert.deepEqual(result[key], value);
    }
  }
});
test('production registration and argument validation', async () => {
  assert.equal(PRODUCTION_COMMANDS.length, 25);
  assert.equal(new Set(PRODUCTION_COMMANDS.map(([s]) => s.split(' ')[0])).size, 25);
  const program = new Command().exitOverride();
  let printed;
  registerProductionTools(program, {
    print: (value) => {
      printed = value;
    },
  });
  const [name, args, expected] = cases[0];
  await program.parseAsync(['node', 'test', 'production', name, ...args.map(String)]);
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(printed[key], value);
  assert.throws(() => productionCalculation('unknown'));
  assert.throws(() => productionCalculation('toString'));
  assert.throws(() => productionCalculation(name, [...args, 1]));
  for (const invalid of ['', ' ', -1, Infinity, 1000001, null, false])
    assert.throws(() =>
      productionCalculation(
        name,
        args.map((v, i) => (i ? v : invalid)),
      ),
    );
});
test('production recycling conserves original stock across repeated passes', () => {
  assert.equal(productionCalculation('recycle', [100, 0.75, 2]).recovered, 93.75);
  assert.equal(productionCalculation('recycle', [100, 0.75, 2]).remaining, 6.25);
  assert.equal(productionCalculation('recycle', [100, 1, 3]).recovered, 100);
  assert.equal(productionCalculation('recycle', [100, 0, 3]).remaining, 100);
  assert.throws(() => productionCalculation('loss-allowance', [10, 4, 0]));
  assert.throws(() => productionCalculation('deadline', [1, 10, 5]));
});
