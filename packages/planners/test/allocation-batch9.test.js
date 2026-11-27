import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { allocationCalculation, ALLOCATION_COMMANDS, registerAllocationTools } from '../src/allocation-tools.js';
const cases = [
  [
    'priority',
    ['4,8,3', 10],
    {
      granted: [4, 6, 0],
      unspent: 0,
      unfilled: [0, 2, 3],
    },
  ],
  [
    'proportional',
    ['4,8,8', 10],
    {
      granted: [2, 4, 4],
      unspent: 0,
    },
  ],
  [
    'weighted',
    ['1,2,1', 12],
    {
      granted: [3, 6, 3],
    },
  ],
  [
    'equal-cap',
    ['2,10,10', 12],
    {
      granted: [2, 5, 5],
      unspent: 0,
    },
  ],
  [
    'minimum-first',
    ['2,2', '6,10', 10],
    {
      granted: [4, 6],
      unspent: 0,
    },
  ],
  [
    'whole-jobs',
    ['6,8,3', 10],
    {
      accepted: [1, 3],
      unspent: 1,
    },
  ],
  [
    'cheapest-jobs',
    ['6,8,3', 10],
    {
      accepted: [3, 1],
      unspent: 1,
    },
  ],
  [
    'value-order',
    ['2,4,5', '4,4,15'],
    {
      ranked: [
        {
          job: 3,
          ratio: 3,
        },
        {
          job: 1,
          ratio: 2,
        },
        {
          job: 2,
          ratio: 1,
        },
      ],
    },
  ],
  [
    'coverage',
    ['2,8,0', '4,8,0'],
    {
      coverage: [0.5, 1, null],
      fullyCovered: [2, 3],
    },
  ],
  [
    'shortages',
    ['2,10', '4,8'],
    {
      shortages: [2, 0],
      surpluses: [0, 2],
    },
  ],
  [
    'reserve-items',
    ['10,3', '4,5'],
    {
      available: [6, 0],
      reserveShortfalls: [0, 2],
    },
  ],
  [
    'cap-grants',
    ['10,3', '6,5'],
    {
      granted: [6, 3],
      cut: [4, 0],
    },
  ],
  [
    'kit-limit',
    ['20,9', '3,2', 3],
    {
      kits: 3,
      remaining: [11, 3],
    },
  ],
  [
    'weighted-rounds',
    ['1,2,3', 4],
    {
      granted: [4, 8, 12],
      total: 24,
    },
  ],
  [
    'round-limit',
    [50, '2,3,5'],
    {
      rounds: 5,
      costPerRound: 10,
      remaining: 0,
    },
  ],
  [
    'reconcile',
    ['4,8', '3,10'],
    {
      changes: [-1, 2],
      totalChange: 1,
    },
  ],
  [
    'rebalance',
    ['10,3', '6,5'],
    {
      donors: [
        {
          item: 1,
          amount: 4,
        },
      ],
      receivers: [
        {
          item: 2,
          amount: 2,
        },
      ],
    },
  ],
  [
    'shared-capacity',
    ['4,8', '2,1', 8],
    {
      fraction: 0.5,
      granted: [2, 4],
      usedCapacity: 8,
    },
  ],
  [
    'priority-capacity',
    ['4,8', '2,1', 10],
    {
      granted: [4, 2],
      unusedCapacity: 0,
    },
  ],
  [
    'workers',
    ['1,2,1', 10],
    {
      workers: [3, 5, 2],
    },
  ],
  [
    'capacity-gap',
    ['10,3', '6,5'],
    {
      overloaded: [1],
      spare: [0, 2],
    },
  ],
  [
    'priority-floor',
    ['2,8,3', 10, 3],
    {
      granted: [0, 8, 0],
      unspent: 2,
    },
  ],
  [
    'budget-sensitivity',
    ['4,8,8', 10, 5],
    {
      beforeFraction: 0.5,
      afterFraction: 0.75,
      additionalGrants: [1, 2, 2],
    },
  ],
  [
    'minimum-budget',
    ['4,8,8', 0.75],
    {
      budget: 15,
      minimumGrants: [3, 6, 6],
    },
  ],
  [
    'funding-order',
    ['4,8,3', 10],
    {
      milestones: [
        {
          item: 1,
          cumulative: 4,
        },
        {
          item: 2,
          cumulative: 12,
        },
        {
          item: 3,
          cumulative: 15,
        },
      ],
      firstUnfunded: 2,
    },
  ],
];
const specs = {
  priority: ['L', 'N'],
  proportional: ['L', 'N'],
  weighted: ['W', 'N'],
  'equal-cap': ['L', 'N'],
  'minimum-first': ['L', 'L', 'N'],
  'whole-jobs': ['W', 'N'],
  'cheapest-jobs': ['W', 'N'],
  'value-order': ['W', 'L'],
  coverage: ['L', 'L'],
  shortages: ['L', 'L'],
  'reserve-items': ['L', 'L'],
  'cap-grants': ['L', 'L'],
  'kit-limit': ['C', 'C', 'I'],
  'weighted-rounds': ['C', 'I'],
  'round-limit': ['N', 'W'],
  reconcile: ['L', 'L'],
  rebalance: ['L', 'L'],
  'shared-capacity': ['L', 'W', 'N'],
  'priority-capacity': ['C', 'W', 'N'],
  workers: ['L', 'J'],
  'capacity-gap': ['L', 'L'],
  'priority-floor': ['L', 'N', 'P'],
  'budget-sensitivity': ['L', 'N', 'N'],
  'minimum-budget': ['L', 'R'],
  'funding-order': ['L', 'N'],
};
for (const [name, args, expected] of cases)
  test(`allocation ${name} has a hand-calculated result`, () => {
    const result = allocationCalculation(name, args);
    for (const [key, value] of Object.entries(expected)) {
      if (typeof value === 'number')
        assert.ok(Math.abs(result[key] - value) < 1e-8, `${key}: ${result[key]} != ${value}`);
      else assert.deepEqual(result[key], value);
    }
    assert.match(result.note, /Offline/);
    assert.throws(() => allocationCalculation(name, []));
    for (let position = 0; position < args.length; position++)
      for (const invalid of ['NaN', '', -1, Infinity, 1000001, null, false]) {
        assert.throws(() =>
          allocationCalculation(
            name,
            args.map((v, i) => (i === position ? invalid : v)),
          ),
        );
      }
  });
test('allocation integer, ratio, list, and allocation limits', () => {
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
          allocationCalculation(
            name,
            args.map((v, i) => (i === position ? bad : v)),
          ),
        );
      if (kind === 'P' || kind === 'J')
        assert.throws(() =>
          allocationCalculation(
            name,
            args.map((v, i) => (i === position ? 0 : v)),
          ),
        );
    });
});
test('allocation real CLI executes every documented command', () => {
  const cli = fileURLToPath(new URL('../../../src/cli.js', import.meta.url));
  for (const [name, args, expected] of cases) {
    const result = JSON.parse(
      execFileSync(process.execPath, [cli, 'allocation', name, ...args.map(String)], {
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
test('allocation registration and argument validation', async () => {
  assert.equal(ALLOCATION_COMMANDS.length, 25);
  assert.equal(new Set(ALLOCATION_COMMANDS.map(([s]) => s.split(' ')[0])).size, 25);
  const program = new Command().exitOverride();
  let printed;
  registerAllocationTools(program, {
    print: (value) => {
      printed = value;
    },
  });
  const [name, args, expected] = cases[0];
  await program.parseAsync(['node', 'test', 'allocation', name, ...args.map(String)]);
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(printed[key], value);
  assert.throws(() => allocationCalculation('unknown'));
  assert.throws(() => allocationCalculation('toString'));
  assert.throws(() => allocationCalculation(name, [...args, 1]));
  for (const invalid of ['', ' ', -1, Infinity, 1000001, null, false])
    assert.throws(() =>
      allocationCalculation(
        name,
        args.map((v, i) => (i ? v : invalid)),
      ),
    );
});
test('allocation water filling respects zero budget, caps, and conservation', () => {
  assert.deepEqual(allocationCalculation('equal-cap', ['2,10,10', 0]).granted, [0, 0, 0]);
  assert.deepEqual(allocationCalculation('equal-cap', ['2,10,10', 30]).granted, [2, 10, 10]);
  assert.deepEqual(allocationCalculation('equal-cap', ['0,2,10', 8]).granted, [0, 2, 6]);
  assert.throws(() => allocationCalculation('minimum-first', ['5,5', '10,10', 8]));
  assert.throws(() => allocationCalculation('workers', ['0,0', 10]));
});

test('allocation equal-cap satisfies fractional demands with sufficient budget', () => {
  for (const budget of [0.3, 1]) {
    const r = allocationCalculation('equal-cap', ['0.1,0.2', budget]);
    r.granted.forEach((v, i) => assert.ok(Math.abs(v - [0.1, 0.2][i]) < 1e-12));
  }
});
