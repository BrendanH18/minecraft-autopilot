import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { packingCalculation, PACKING_COMMANDS, registerPackingTools } from '../src/packing-tools.js';
const cases = [
  [
    'merge',
    [40, 20, 64],
    {
      count: 60,
      occupied: 1,
      freed: 1,
    },
  ],
  [
    'fragmentation',
    ['20,30,0,10', 64],
    {
      occupied: 3,
      consolidated: 1,
      freed: 2,
    },
  ],
  [
    'split',
    [10, 4],
    {
      pieces: [4, 4, 2],
    },
  ],
  [
    'headroom',
    ['40,60', 64],
    {
      headroom: 28,
    },
  ],
  [
    'fill-partials',
    ['40,60', 30, 64],
    {
      stacks: [64, 64],
      remaining: 2,
      newSlots: 1,
    },
  ],
  [
    'transfer-limit',
    [200, 10, 2, 64],
    {
      accepted: 138,
      remaining: 62,
    },
  ],
  [
    'reserved-capacity',
    [27, 3, 64],
    {
      usableSlots: 24,
      capacity: 1536,
    },
  ],
  [
    'container-loads',
    [150, 2, 64],
    {
      capacity: 128,
      loads: [128, 22],
    },
  ],
  [
    'container-balance',
    [10, 3, 4],
    {
      counts: [4, 3, 3],
      slots: [1, 1, 1],
    },
  ],
  [
    'item-slots',
    ['65,17', '64,16'],
    {
      slots: [2, 2],
      totalSlots: 4,
    },
  ],
  [
    'kit-copies',
    ['20,13', '3,2'],
    {
      copies: 6,
      remaining: [2, 1],
    },
  ],
  [
    'kit-slots',
    ['3,2', 6, '64,16'],
    {
      slots: [1, 1],
      totalSlots: 2,
    },
  ],
  [
    'isolated-kits',
    ['3,2', 6, '64,16'],
    {
      slotsPerKit: 2,
      totalSlots: 12,
    },
  ],
  [
    'repack',
    [65, 64, 16],
    {
      oldSlots: 2,
      newSlots: 5,
      slotChange: 3,
    },
  ],
  [
    'bundle-overhead',
    [10, 4, 2],
    {
      bundles: 3,
      wrappers: 6,
      unusedCapacity: 2,
    },
  ],
  [
    'slot-waste',
    ['65,17', '64,16'],
    {
      unused: [63, 15],
      totalUnused: 78,
    },
  ],
  [
    'compact-order',
    ['10,65', '64,64'],
    {
      order: [
        {
          item: 2,
          slots: 2,
          count: 65,
        },
        {
          item: 1,
          slots: 1,
          count: 10,
        },
      ],
    },
  ],
  [
    'drain',
    ['4,8,3', 10],
    {
      stacks: [0, 2, 3],
      removed: 10,
      unfilled: 0,
    },
  ],
  [
    'swap-space',
    [20, 130, 64],
    {
      freed: 1,
      required: 3,
      extraSlots: 2,
    },
  ],
  [
    'trip-remainder',
    [100, 30, 2],
    {
      moved: 60,
      remaining: 40,
      remainingTrips: 2,
    },
  ],
  [
    'priority-load',
    ['70,50', '64,64', 2],
    {
      loaded: [70, 0],
      remaining: [0, 50],
      freeSlots: 0,
    },
  ],
  [
    'minimum-slot-load',
    ['130,20', '64,64'],
    {
      chosen: {
        item: 2,
        count: 20,
        slots: 1,
      },
    },
  ],
  [
    'reserve-stock',
    [100, 20, 64],
    {
      held: 20,
      movable: 80,
      reserveShortfall: 0,
      separateSlots: 3,
    },
  ],
  [
    'stack-threshold',
    [70, 64],
    {
      removeToFree: 6,
      addToNext: 59,
    },
  ],
  [
    'parallel-carry',
    [2, 3, 64, 800],
    {
      roundCapacity: 384,
      rounds: 3,
      unusedLastRound: 352,
    },
  ],
];
const specs = {
  merge: ['I', 'I', 'J'],
  fragmentation: ['C', 'J'],
  split: ['I', 'J'],
  headroom: ['C', 'J'],
  'fill-partials': ['C', 'I', 'J'],
  'transfer-limit': ['I', 'I', 'I', 'J'],
  'reserved-capacity': ['I', 'I', 'J'],
  'container-loads': ['I', 'J', 'J'],
  'container-balance': ['I', 'J', 'J'],
  'item-slots': ['C', 'C'],
  'kit-copies': ['C', 'C'],
  'kit-slots': ['C', 'I', 'C'],
  'isolated-kits': ['C', 'I', 'C'],
  repack: ['I', 'J', 'J'],
  'bundle-overhead': ['I', 'J', 'I'],
  'slot-waste': ['C', 'C'],
  'compact-order': ['C', 'C'],
  drain: ['C', 'I'],
  'swap-space': ['I', 'I', 'J'],
  'trip-remainder': ['I', 'J', 'I'],
  'priority-load': ['C', 'C', 'I'],
  'minimum-slot-load': ['C', 'C'],
  'reserve-stock': ['I', 'I', 'J'],
  'stack-threshold': ['I', 'J'],
  'parallel-carry': ['J', 'J', 'J', 'I'],
};
for (const [name, args, expected] of cases)
  test(`packing ${name} has a hand-calculated result`, () => {
    const result = packingCalculation(name, args);
    for (const [key, value] of Object.entries(expected)) {
      if (typeof value === 'number')
        assert.ok(Math.abs(result[key] - value) < 1e-8, `${key}: ${result[key]} != ${value}`);
      else assert.deepEqual(result[key], value);
    }
    assert.match(result.note, /Offline/);
    assert.throws(() => packingCalculation(name, []));
    for (let position = 0; position < args.length; position++)
      for (const invalid of ['NaN', '', -1, Infinity, 1000001, null, false]) {
        assert.throws(() =>
          packingCalculation(
            name,
            args.map((v, i) => (i === position ? invalid : v)),
          ),
        );
      }
  });
test('packing integer, ratio, list, and allocation limits', () => {
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
          packingCalculation(
            name,
            args.map((v, i) => (i === position ? bad : v)),
          ),
        );
      if (kind === 'P' || kind === 'J')
        assert.throws(() =>
          packingCalculation(
            name,
            args.map((v, i) => (i === position ? 0 : v)),
          ),
        );
    });
});
test('packing real CLI executes every documented command', () => {
  const cli = fileURLToPath(new URL('../../../src/cli.js', import.meta.url));
  for (const [name, args, expected] of cases) {
    const result = JSON.parse(
      execFileSync(process.execPath, [cli, 'packing', name, ...args.map(String)], { encoding: 'utf8', timeout: 15000 }),
    );
    for (const [key, value] of Object.entries(expected)) {
      if (typeof value === 'number') assert.ok(Math.abs(result[key] - value) < 1e-8);
      else assert.deepEqual(result[key], value);
    }
  }
});
test('packing registration and argument validation', async () => {
  assert.equal(PACKING_COMMANDS.length, 25);
  assert.equal(new Set(PACKING_COMMANDS.map(([s]) => s.split(' ')[0])).size, 25);
  const program = new Command().exitOverride();
  let printed;
  registerPackingTools(program, {
    print: (value) => {
      printed = value;
    },
  });
  const [name, args, expected] = cases[0];
  await program.parseAsync(['node', 'test', 'packing', name, ...args.map(String)]);
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(printed[key], value);
  assert.throws(() => packingCalculation('unknown'));
  assert.throws(() => packingCalculation('toString'));
  assert.throws(() => packingCalculation(name, [...args, 1]));
  for (const invalid of ['', ' ', -1, Infinity, 1000001, null, false])
    assert.throws(() =>
      packingCalculation(
        name,
        args.map((v, i) => (i ? v : invalid)),
      ),
    );
});
test('packing boundaries preserve empty loads and reject impossible fragments', () => {
  assert.deepEqual(packingCalculation('split', [0, 64]).pieces, []);
  assert.equal(packingCalculation('stack-threshold', [64, 64]).removeToFree, 64);
  assert.throws(() => packingCalculation('fragmentation', ['65', 64]));
  assert.throws(() => packingCalculation('item-slots', ['1,2', '64']));
  assert.throws(() => packingCalculation('parallel-carry', [1000000, 1000000, 1000000, 1]));
});
