import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { fuelplanCalculation, FUELPLAN_COMMANDS, registerFuelplanTools } from '../src/fuelplan-tools.js';
const cases = [
  [
    "fuel-count",
    [
      10,
      10,
      80
    ],
    {
      "fuel": 2,
      "requiredSeconds": 100,
      "wastedSeconds": 60
    }
  ],
  [
    "capacity",
    [
      2,
      80,
      10
    ],
    {
      "items": 16,
      "leftoverSeconds": 0
    }
  ],
  [
    "furnace-split",
    [
      10,
      3,
      10,
      80
    ],
    {
      "loads": [
        4,
        3,
        3
      ],
      "fuel": [
        1,
        1,
        1
      ],
      "totalFuel": 3,
      "seconds": 40
    }
  ],
  [
    "continuous-vs-split",
    [
      10,
      3,
      10,
      80
    ],
    {
      "continuousFuel": 2,
      "separateFuel": 3,
      "extraFuel": 1
    }
  ],
  [
    "burn-credit",
    [
      10,
      10,
      30,
      80
    ],
    {
      "newFuel": 1,
      "creditedSeconds": 30,
      "uncoveredSeconds": 70
    }
  ],
  [
    "fuel-cost",
    [
      10,
      10,
      80,
      3
    ],
    {
      "fuel": 2,
      "cost": 6,
      "costPerOutput": 0.6
    }
  ],
  [
    "compare",
    [
      10,
      10,
      "80,40",
      "3,1"
    ],
    {
      "options": [
        {
          "option": 1,
          "fuel": 2,
          "cost": 6
        },
        {
          "option": 2,
          "fuel": 3,
          "cost": 3
        }
      ]
    }
  ],
  [
    "efficiency",
    [
      100,
      160
    ],
    {
      "utilization": 0.625,
      "wasteSeconds": 60
    }
  ],
  [
    "finish-time",
    [
      10,
      3,
      10,
      5
    ],
    {
      "seconds": 45
    }
  ],
  [
    "deadline-furnaces",
    [
      10,
      10,
      35
    ],
    {
      "itemsPerFurnace": 3,
      "furnaces": 4
    }
  ],
  [
    "feed-rate",
    [
      3,
      10
    ],
    {
      "itemsPerSecond": 0.3,
      "itemsPerMinute": 18
    }
  ],
  [
    "fuel-rate",
    [
      4,
      80
    ],
    {
      "fuelPerMinute": 3
    }
  ],
  [
    "stock-duration",
    [
      9,
      80,
      3
    ],
    {
      "seconds": 240,
      "minutes": 4
    }
  ],
  [
    "reserve",
    [
      10,
      10,
      80,
      3
    ],
    {
      "operating": 2,
      "reserve": 3,
      "total": 5
    }
  ],
  [
    "refill",
    [
      1,
      10,
      10,
      80
    ],
    {
      "required": 2,
      "missing": 1,
      "surplus": 0
    }
  ],
  [
    "mixed-burn",
    [
      "2,3",
      "80,15",
      10
    ],
    {
      "burnSeconds": 205,
      "items": 20
    }
  ],
  [
    "substitute",
    [
      3,
      80,
      50
    ],
    {
      "count": 5,
      "excessSeconds": 10
    }
  ],
  [
    "restart-loss",
    [
      4,
      10,
      80
    ],
    {
      "lostSeconds": 40,
      "replacementFuel": 1
    }
  ],
  [
    "preheat",
    [
      30,
      80,
      3
    ],
    {
      "burnSeconds": 90,
      "fuelPerFurnace": 1,
      "totalFuel": 3
    }
  ],
  [
    "loading-window",
    [
      30,
      3,
      10
    ],
    {
      "seconds": 100
    }
  ],
  [
    "output-buffer",
    [
      2,
      64,
      4,
      10
    ],
    {
      "capacity": 128,
      "seconds": 320
    }
  ],
  [
    "collect-interval",
    [
      128,
      20,
      18
    ],
    {
      "remainingCapacity": 108,
      "minutes": 6
    }
  ],
  [
    "throughput-cap",
    [
      20,
      15,
      4,
      10
    ],
    {
      "itemsPerMinute": 15,
      "furnaceRate": 24
    }
  ],
  [
    "batch-checkpoints",
    [
      10,
      4,
      10
    ],
    {
      "checkpoints": [
        {
          "items": 4,
          "seconds": 40
        },
        {
          "items": 8,
          "seconds": 80
        },
        {
          "items": 10,
          "seconds": 100
        }
      ]
    }
  ],
  [
    "net-fuel",
    [
      10,
      6,
      80
    ],
    {
      "netItems": 4,
      "netBurnSeconds": 320
    }
  ]
];
const specs = {"fuel-count": ["I", "P", "P"], "capacity": ["I", "P", "P"], "furnace-split": ["I", "J", "P", "P"], "continuous-vs-split": ["I", "J", "P", "P"], "burn-credit": ["I", "P", "N", "P"], "fuel-cost": ["I", "P", "P", "N"], "compare": ["I", "P", "W", "L"], "efficiency": ["N", "P"], "finish-time": ["I", "J", "P", "N"], "deadline-furnaces": ["I", "P", "P"], "feed-rate": ["J", "P"], "fuel-rate": ["J", "P"], "stock-duration": ["I", "P", "J"], "reserve": ["I", "P", "P", "I"], "refill": ["I", "I", "P", "P"], "mixed-burn": ["C", "W", "P"], "substitute": ["I", "P", "P"], "restart-loss": ["I", "N", "P"], "preheat": ["N", "P", "J"], "loading-window": ["I", "J", "P"], "output-buffer": ["I", "J", "J", "P"], "collect-interval": ["I", "I", "P"], "throughput-cap": ["N", "N", "J", "P"], "batch-checkpoints": ["I", "J", "P"], "net-fuel": ["I", "I", "P"]};
for (const [name, args, expected] of cases) test(`fuelplan ${name} has a hand-calculated result`, () => {
  const result = fuelplanCalculation(name, args);
  for (const [key, value] of Object.entries(expected)) {
    if (typeof value === 'number') assert.ok(Math.abs(result[key] - value) < 1e-8, `${key}: ${result[key]} != ${value}`);
    else assert.deepEqual(result[key], value);
  }
  assert.match(result.note, /Offline/);
  assert.throws(() => fuelplanCalculation(name, []));
  for (let position = 0; position < args.length; position++) for (const invalid of ['NaN', '', -1, Infinity, 1000001, null, false]) {
    assert.throws(() => fuelplanCalculation(name, args.map((v, i) => i === position ? invalid : v)));
  }
});
test('fuelplan integer, ratio, list, and allocation limits', () => {
  for (const [name, args] of cases) specs[name].forEach((kind, position) => {
    const bad = kind === 'I' || kind === 'J' ? 1.5 : kind === 'R' ? 1.1 : kind === 'L' || kind === 'W' || kind === 'C' ? Array(1001).fill('1').join(',') : null;
    if (bad !== null) assert.throws(() => fuelplanCalculation(name, args.map((v,i) => i === position ? bad : v)));
    if (kind === 'P' || kind === 'J') assert.throws(() => fuelplanCalculation(name, args.map((v,i) => i === position ? 0 : v)));
  });
});
test('fuelplan real CLI executes every documented command', () => {
  const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
  for (const [name, args, expected] of cases) {
    const result = JSON.parse(execFileSync(process.execPath, [cli, 'fuelplan', name, ...args.map(String)], { encoding: 'utf8', timeout: 15000 }));
    for (const [key, value] of Object.entries(expected)) {
      if (typeof value === 'number') assert.ok(Math.abs(result[key] - value) < 1e-8);
      else assert.deepEqual(result[key], value);
    }
  }
});
test('fuelplan registration and argument validation', async () => {
  assert.equal(FUELPLAN_COMMANDS.length, 25);
  assert.equal(new Set(FUELPLAN_COMMANDS.map(([s]) => s.split(' ')[0])).size, 25);
  const program = new Command().exitOverride(); let printed;
  registerFuelplanTools(program, { print: value => { printed = value; } });
  const [name, args, expected] = cases[0];
  await program.parseAsync(['node', 'test', 'fuelplan', name, ...args.map(String)]);
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(printed[key], value);
  assert.throws(() => fuelplanCalculation('unknown'));
  assert.throws(() => fuelplanCalculation('toString'));
  assert.throws(() => fuelplanCalculation(name, [...args, 1]));
  for (const invalid of ['', ' ', -1, Infinity, 1000001, null, false]) assert.throws(() => fuelplanCalculation(name, args.map((v, i) => i ? v : invalid)));
});
test('fuelplan independently rounds empty and split furnace loads', () => {
  assert.deepEqual(fuelplanCalculation('furnace-split', [0, 3, 10, 80]).fuel, [0,0,0]);
  assert.equal(fuelplanCalculation('continuous-vs-split', [10, 3, 10, 80]).extraFuel, 1);
  assert.throws(() => fuelplanCalculation('efficiency', [20, 10]));
  assert.throws(() => fuelplanCalculation('furnace-split', [10, 1001, 10, 80]));
  assert.throws(() => fuelplanCalculation('compare', [10, 10, '80,40', '3']));
});
