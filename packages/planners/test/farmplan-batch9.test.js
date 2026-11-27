import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { farmplanCalculation, FARMPLAN_COMMANDS, registerFarmplanTools } from '../src/farmplan-tools.js';
const cases = [
  [
    'rows',
    [10, 8, 2],
    {
      rows: 4,
      plants: 32,
      unusedCells: 48,
    },
  ],
  [
    'beds',
    [10, 8, 3, 1],
    {
      plantingColumns: 8,
      plants: 64,
      pathCells: 16,
    },
  ],
  [
    'grid-spacing',
    [10, 8, 3, 2],
    {
      columns: 4,
      rows: 4,
      plants: 16,
    },
  ],
  [
    'edge-margin',
    [10, 8, 1],
    {
      plantingWidth: 8,
      plantingLength: 6,
      plants: 48,
      borderCells: 32,
    },
  ],
  [
    'seed-budget',
    [30, 2, 10],
    {
      plantingSeeds: 60,
      totalSeeds: 70,
    },
  ],
  [
    'harvest',
    [30, 4, 0.75],
    {
      gross: 120,
      expectedUsable: 90,
    },
  ],
  [
    'replant',
    [80, 30, 2],
    {
      required: 60,
      missing: 0,
      surplus: 20,
    },
  ],
  [
    'cycles',
    [100, 20, 3],
    {
      perCycle: 60,
      cycles: 2,
      expectedSurplus: 20,
    },
  ],
  [
    'growth-schedule',
    [3, 10, 2],
    {
      minutes: 36,
      completions: [12, 24, 36],
    },
  ],
  [
    'stagger',
    [4, 20],
    {
      intervalMinutes: 5,
      offsets: [0, 5, 10, 15],
    },
  ],
  [
    'steady-yield',
    [30, 4, 20],
    {
      perMinute: 6,
      perHour: 360,
    },
  ],
  [
    'target-area',
    [360, 4, 20],
    {
      cells: 30,
    },
  ],
  [
    'water-lattice',
    [20, 12, 9, 9],
    {
      columns: 3,
      rows: 2,
      sources: 6,
    },
  ],
  [
    'path-share',
    [10, 12, 4],
    {
      pathRows: 3,
      pathCells: 30,
      plantingCells: 90,
    },
  ],
  [
    'fertilizer',
    [30, 2, 1.5],
    {
      applications: 60,
      units: 90,
    },
  ],
  [
    'compost',
    [100, 0.5, 7],
    {
      expectedLevels: 50,
      expectedOutputs: 7.142857142857143,
    },
  ],
  [
    'seed-multiply',
    [10, 1.5, 3],
    {
      expectedSeeds: 33.75,
    },
  ],
  [
    'loss-buffer',
    [90, 0.25, 4],
    {
      plants: 30,
    },
  ],
  [
    'rotation',
    ['10,20', '3,4'],
    {
      harvest: [30, 80],
      total: 110,
    },
  ],
  [
    'harvest-work',
    [30, 2, 4],
    {
      waves: 8,
      seconds: 16,
    },
  ],
  [
    'storage',
    [30, 4, 3, 64],
    {
      expectedItems: 360,
      slots: 6,
    },
  ],
  [
    'consumption-balance',
    [120, 20, 5],
    {
      consumed: 100,
      net: 20,
      sustainable: true,
    },
  ],
  [
    'expansion',
    [30, 50, 2],
    {
      additionalPlants: 20,
      seeds: 40,
    },
  ],
  [
    'season',
    [65, 20, 30, 4],
    {
      cycles: 3,
      expectedItems: 360,
      unusedMinutes: 5,
    },
  ],
  [
    'bed-allocation',
    [10, '1,2,1'],
    {
      plants: [3, 5, 2],
    },
  ],
];
const specs = {
  rows: ['J', 'J', 'I'],
  beds: ['J', 'J', 'J', 'I'],
  'grid-spacing': ['J', 'J', 'J', 'J'],
  'edge-margin': ['J', 'J', 'I'],
  'seed-budget': ['I', 'J', 'I'],
  harvest: ['I', 'N', 'R'],
  replant: ['I', 'I', 'J'],
  cycles: ['N', 'J', 'P'],
  'growth-schedule': ['I', 'P', 'N'],
  stagger: ['J', 'P'],
  'steady-yield': ['I', 'N', 'P'],
  'target-area': ['N', 'P', 'P'],
  'water-lattice': ['J', 'J', 'J', 'J'],
  'path-share': ['J', 'J', 'J'],
  fertilizer: ['I', 'I', 'N'],
  compost: ['I', 'R', 'J'],
  'seed-multiply': ['I', 'P', 'I'],
  'loss-buffer': ['N', 'R', 'P'],
  rotation: ['C', 'L'],
  'harvest-work': ['I', 'P', 'J'],
  storage: ['I', 'N', 'I', 'J'],
  'consumption-balance': ['N', 'P', 'N'],
  expansion: ['I', 'I', 'J'],
  season: ['N', 'P', 'I', 'N'],
  'bed-allocation': ['I', 'W'],
};
for (const [name, args, expected] of cases)
  test(`farmplan ${name} has a hand-calculated result`, () => {
    const result = farmplanCalculation(name, args);
    for (const [key, value] of Object.entries(expected)) {
      if (typeof value === 'number')
        assert.ok(Math.abs(result[key] - value) < 1e-8, `${key}: ${result[key]} != ${value}`);
      else assert.deepEqual(result[key], value);
    }
    assert.match(result.note, /Offline/);
    assert.throws(() => farmplanCalculation(name, []));
    for (let position = 0; position < args.length; position++)
      for (const invalid of ['NaN', '', -1, Infinity, 1000001, null, false]) {
        assert.throws(() =>
          farmplanCalculation(
            name,
            args.map((v, i) => (i === position ? invalid : v)),
          ),
        );
      }
  });
test('farmplan integer, ratio, list, and allocation limits', () => {
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
          farmplanCalculation(
            name,
            args.map((v, i) => (i === position ? bad : v)),
          ),
        );
      if (kind === 'P' || kind === 'J')
        assert.throws(() =>
          farmplanCalculation(
            name,
            args.map((v, i) => (i === position ? 0 : v)),
          ),
        );
    });
});
test('farmplan real CLI executes every documented command', () => {
  const cli = fileURLToPath(new URL('../../../src/cli.js', import.meta.url));
  for (const [name, args, expected] of cases) {
    const result = JSON.parse(
      execFileSync(process.execPath, [cli, 'farmplan', name, ...args.map(String)], {
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
test('farmplan registration and argument validation', async () => {
  assert.equal(FARMPLAN_COMMANDS.length, 25);
  assert.equal(new Set(FARMPLAN_COMMANDS.map(([s]) => s.split(' ')[0])).size, 25);
  const program = new Command().exitOverride();
  let printed;
  registerFarmplanTools(program, {
    print: (value) => {
      printed = value;
    },
  });
  const [name, args, expected] = cases[0];
  await program.parseAsync(['node', 'test', 'farmplan', name, ...args.map(String)]);
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(printed[key], value);
  assert.throws(() => farmplanCalculation('unknown'));
  assert.throws(() => farmplanCalculation('toString'));
  assert.throws(() => farmplanCalculation(name, [...args, 1]));
  for (const invalid of ['', ' ', -1, Infinity, 1000001, null, false])
    assert.throws(() =>
      farmplanCalculation(
        name,
        args.map((v, i) => (i ? v : invalid)),
      ),
    );
});
test('farmplan validates fractional loss and deterministic crop apportionment', () => {
  assert.equal(farmplanCalculation('edge-margin', [2, 2, 2]).plants, 0);
  assert.deepEqual(farmplanCalculation('bed-allocation', [1, '1,1,1']).plants, [1, 0, 0]);
  assert.equal(farmplanCalculation('seed-multiply', [10, 1.5, 0]).expectedSeeds, 10);
  assert.throws(() => farmplanCalculation('loss-buffer', [10, 1, 4]));
  assert.throws(() => farmplanCalculation('seed-multiply', [1000000, 1000000, 1000]));
});
