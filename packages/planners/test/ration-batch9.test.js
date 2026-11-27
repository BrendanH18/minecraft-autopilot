import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { rationCalculation, RATION_COMMANDS, registerRationTools } from '../src/ration-tools.js';
const cases = [
  [
    'trip',
    [30, 2, 10],
    {
      consumed: 60,
      total: 70,
    },
  ],
  [
    'phases',
    ['10,20', '2,3', 5],
    {
      phases: [20, 60],
      consumed: 80,
      total: 85,
    },
  ],
  [
    'portions',
    [70, 8],
    {
      items: 9,
      supplied: 72,
      surplus: 2,
    },
  ],
  [
    'endurance',
    [70, 2, 10],
    {
      usable: 60,
      minutes: 30,
      reserveShortfall: 0,
    },
  ],
  [
    'return-budget',
    [20, 30, 2, 10],
    {
      outbound: 40,
      returning: 60,
      total: 110,
    },
  ],
  [
    'turnaround',
    [110, 2, 3, 10],
    {
      outboundMinutes: 20,
    },
  ],
  [
    'party',
    [20, '1,2,3', 5],
    {
      individual: [25, 45, 65],
      total: 135,
    },
  ],
  [
    'share-stock',
    [120, 3, 2],
    {
      unitsEach: 40,
      minutes: 20,
    },
  ],
  [
    'refill',
    [15, 70, 8],
    {
      items: 7,
      after: 71,
      surplus: 1,
    },
  ],
  [
    'checkpoint',
    [70, 20, 2, 10],
    {
      remaining: 30,
      reserveMargin: 20,
      exhausted: false,
    },
  ],
  [
    'checkpoints',
    [70, '10,20,30', 2, 10],
    {
      checkpoints: [
        {
          minutes: 10,
          remaining: 50,
          reserveMargin: 40,
        },
        {
          minutes: 20,
          remaining: 30,
          reserveMargin: 20,
        },
        {
          minutes: 30,
          remaining: 10,
          reserveMargin: 0,
        },
      ],
    },
  ],
  [
    'activity',
    [20, 2, 1.5, 10],
    {
      rate: 3,
      consumed: 60,
      total: 70,
    },
  ],
  [
    'uncertainty',
    [20, 1, 3, 10],
    {
      minimum: 30,
      maximum: 70,
    },
  ],
  [
    'delay',
    [70, 15, 1],
    {
      delayUnits: 15,
      total: 85,
    },
  ],
  [
    'loss',
    [60, 0.25, 8],
    {
      items: 10,
      grossUnits: 80,
      expectedUsable: 60,
    },
  ],
  [
    'cache-leg',
    ['10,20', '2,3', 5],
    {
      loads: [25, 65],
      maximumLoad: 65,
      totalIssued: 90,
    },
  ],
  [
    'refill-interval',
    [70, 2, 10],
    {
      minutes: 30,
    },
  ],
  [
    'refill-count',
    [100, 70, 2, 10],
    {
      intervalMinutes: 30,
      refills: 3,
    },
  ],
  [
    'loadout',
    ['10,5', '4,8', '64,16'],
    {
      units: 80,
      slots: 2,
    },
  ],
  [
    'density',
    ['4,8', '64,16'],
    {
      ranked: [
        {
          item: 1,
          unitsPerSlot: 256,
        },
        {
          item: 2,
          unitsPerSlot: 128,
        },
      ],
    },
  ],
  [
    'portion-plan',
    [70, 3, 10],
    {
      unitsPerServing: 20,
      reserveShortfall: 0,
    },
  ],
  [
    'meal-clock',
    [65, 20, 8],
    {
      meals: 3,
      totalUnits: 24,
      times: [20, 40, 60],
    },
  ],
  [
    'resupply-gap',
    [20, 35, 2],
    {
      waitMinutes: 15,
      waitingUnits: 30,
    },
  ],
  [
    'escape-reserve',
    [120, 30, 2, 5],
    {
      minutes: 4,
      reserve: 13,
    },
  ],
  [
    'actual-rate',
    [70, 30, 20],
    {
      netConsumed: 40,
      netRate: 2,
    },
  ],
];
const specs = {
  trip: ['N', 'N', 'N'],
  phases: ['L', 'L', 'N'],
  portions: ['N', 'P'],
  endurance: ['N', 'P', 'N'],
  'return-budget': ['N', 'N', 'N', 'N'],
  turnaround: ['N', 'P', 'P', 'N'],
  party: ['N', 'L', 'N'],
  'share-stock': ['N', 'J', 'P'],
  refill: ['N', 'N', 'P'],
  checkpoint: ['N', 'N', 'N', 'N'],
  checkpoints: ['N', 'L', 'N', 'N'],
  activity: ['N', 'N', 'P', 'N'],
  uncertainty: ['N', 'N', 'N', 'N'],
  delay: ['N', 'N', 'N'],
  loss: ['N', 'R', 'P'],
  'cache-leg': ['L', 'L', 'N'],
  'refill-interval': ['N', 'P', 'N'],
  'refill-count': ['N', 'P', 'P', 'N'],
  loadout: ['C', 'W', 'C'],
  density: ['W', 'C'],
  'portion-plan': ['N', 'J', 'N'],
  'meal-clock': ['N', 'P', 'N'],
  'resupply-gap': ['N', 'N', 'N'],
  'escape-reserve': ['N', 'P', 'N', 'N'],
  'actual-rate': ['N', 'N', 'P'],
};
for (const [name, args, expected] of cases)
  test(`ration ${name} has a hand-calculated result`, () => {
    const result = rationCalculation(name, args);
    for (const [key, value] of Object.entries(expected)) {
      if (typeof value === 'number')
        assert.ok(Math.abs(result[key] - value) < 1e-8, `${key}: ${result[key]} != ${value}`);
      else assert.deepEqual(result[key], value);
    }
    assert.match(result.note, /Offline/);
    assert.throws(() => rationCalculation(name, []));
    for (let position = 0; position < args.length; position++)
      for (const invalid of ['NaN', '', -1, Infinity, 1000001, null, false]) {
        assert.throws(() =>
          rationCalculation(
            name,
            args.map((v, i) => (i === position ? invalid : v)),
          ),
        );
      }
  });
test('ration integer, ratio, list, and allocation limits', () => {
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
          rationCalculation(
            name,
            args.map((v, i) => (i === position ? bad : v)),
          ),
        );
      if (kind === 'P' || kind === 'J')
        assert.throws(() =>
          rationCalculation(
            name,
            args.map((v, i) => (i === position ? 0 : v)),
          ),
        );
    });
});
test('ration real CLI executes every documented command', () => {
  const cli = fileURLToPath(new URL('../../../src/cli.js', import.meta.url));
  for (const [name, args, expected] of cases) {
    const result = JSON.parse(
      execFileSync(process.execPath, [cli, 'ration', name, ...args.map(String)], { encoding: 'utf8', timeout: 15000 }),
    );
    for (const [key, value] of Object.entries(expected)) {
      if (typeof value === 'number') assert.ok(Math.abs(result[key] - value) < 1e-8);
      else assert.deepEqual(result[key], value);
    }
  }
});
test('ration registration and argument validation', async () => {
  assert.equal(RATION_COMMANDS.length, 25);
  assert.equal(new Set(RATION_COMMANDS.map(([s]) => s.split(' ')[0])).size, 25);
  const program = new Command().exitOverride();
  let printed;
  registerRationTools(program, {
    print: (value) => {
      printed = value;
    },
  });
  const [name, args, expected] = cases[0];
  await program.parseAsync(['node', 'test', 'ration', name, ...args.map(String)]);
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(printed[key], value);
  assert.throws(() => rationCalculation('unknown'));
  assert.throws(() => rationCalculation('toString'));
  assert.throws(() => rationCalculation(name, [...args, 1]));
  for (const invalid of ['', ' ', -1, Infinity, 1000001, null, false])
    assert.throws(() =>
      rationCalculation(
        name,
        args.map((v, i) => (i ? v : invalid)),
      ),
    );
});
test('ration keeps exhausted supply visible and rejects unusable refill capacity', () => {
  assert.equal(rationCalculation('checkpoint', [10, 20, 2, 0]).remaining, -30);
  assert.equal(rationCalculation('turnaround', [10, 2, 3, 20]).outboundMinutes, 0);
  assert.equal(rationCalculation('refill-count', [60, 70, 2, 10]).refills, 1);
  assert.throws(() => rationCalculation('refill-count', [100, 10, 2, 10]));
  assert.throws(() => rationCalculation('phases', ['10,20', '2', 0]));
});
