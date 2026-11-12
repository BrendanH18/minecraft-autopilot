import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { tradeplanCalculation, TRADEPLAN_COMMANDS, registerTradeplanTools } from '../src/tradeplan-tools.js';
const cases = [
  [
    "buy",
    [
      17,
      4,
      3
    ],
    {
      "trades": 5,
      "cost": 15,
      "received": 20,
      "surplus": 3
    }
  ],
  [
    "sell",
    [
      17,
      3,
      2
    ],
    {
      "trades": 5,
      "received": 10,
      "remaining": 2
    }
  ],
  [
    "budget",
    [
      17,
      3,
      4
    ],
    {
      "trades": 5,
      "received": 20,
      "unspent": 2
    }
  ],
  [
    "limited",
    [
      10,
      6,
      3,
      4
    ],
    {
      "trades": 6,
      "cost": 18,
      "received": 24,
      "unfilledTrades": 4
    }
  ],
  [
    "restocks",
    [
      30,
      10,
      8
    ],
    {
      "restocks": 3,
      "initialTrades": 10
    }
  ],
  [
    "restock-time",
    [
      30,
      10,
      8,
      5
    ],
    {
      "restocks": 3,
      "minutes": 15
    }
  ],
  [
    "price-change",
    [
      10,
      5,
      3
    ],
    {
      "oldCost": 50,
      "newCost": 30,
      "savings": 20
    }
  ],
  [
    "unit-price",
    [
      3,
      4
    ],
    {
      "costPerItem": 0.75,
      "itemsPerCurrency": 1.3333333333333333
    }
  ],
  [
    "compare-offers",
    [
      10,
      "3,5",
      "4,8"
    ],
    {
      "offers": [
        {
          "offer": 1,
          "trades": 3,
          "cost": 9,
          "surplus": 2
        },
        {
          "offer": 2,
          "trades": 2,
          "cost": 10,
          "surplus": 6
        }
      ]
    }
  ],
  [
    "round-trip",
    [
      3,
      10,
      4,
      2
    ],
    {
      "secondTrades": 2,
      "returned": 4,
      "netCurrency": 1,
      "intermediateRemainder": 2
    }
  ],
  [
    "fund-target",
    [
      17,
      3,
      4
    ],
    {
      "sales": 5,
      "inputRequired": 15,
      "currency": 20,
      "change": 3
    }
  ],
  [
    "net-currency",
    [
      5,
      4,
      3,
      3
    ],
    {
      "earned": 20,
      "spent": 9,
      "net": 11
    }
  ],
  [
    "commission",
    [
      100,
      0.1,
      2
    ],
    {
      "fee": 12,
      "net": 88
    }
  ],
  [
    "price-ceiling",
    [
      20,
      6
    ],
    {
      "maximumPrice": 3,
      "unusedAtMaximum": 2
    }
  ],
  [
    "stock-limit",
    [
      20,
      3,
      4,
      2
    ],
    {
      "trades": 4,
      "received": 8,
      "unspent": 8,
      "limitedBy": "stock"
    }
  ],
  [
    "parallel-sellers",
    [
      30,
      8,
      3
    ],
    {
      "roundCapacity": 24,
      "rounds": 2,
      "sellersNeededNow": 3
    }
  ],
  [
    "progressive-cost",
    [
      4,
      3,
      2
    ],
    {
      "cost": 24,
      "lastPrice": 9
    }
  ],
  [
    "progressive-buy",
    [
      25,
      3,
      2
    ],
    {
      "trades": 4,
      "cost": 24,
      "unspent": 1
    }
  ],
  [
    "quota-basket",
    [
      "10,7",
      "4,3",
      "3,2"
    ],
    {
      "trades": [
        3,
        3
      ],
      "cost": 15
    }
  ],
  [
    "priority-basket",
    [
      "10,7",
      "4,3",
      "3,2",
      12
    ],
    {
      "trades": [
        3,
        1
      ],
      "received": [
        12,
        3
      ],
      "unspent": 1
    }
  ],
  [
    "reserve-budget",
    [
      20,
      8,
      3,
      4
    ],
    {
      "trades": 4,
      "received": 16,
      "remaining": 8,
      "reserveShortfall": 0
    }
  ],
  [
    "trade-time",
    [
      10,
      2,
      30
    ],
    {
      "seconds": 50
    }
  ],
  [
    "throughput",
    [
      8,
      5,
      3
    ],
    {
      "itemsPerMinute": 4.8
    }
  ],
  [
    "change-loss",
    [
      20,
      3
    ],
    {
      "wholeTrades": 6,
      "remainder": 2,
      "fractionUnspent": 0.1
    }
  ],
  [
    "sell-keep",
    [
      20,
      8,
      3,
      2
    ],
    {
      "trades": 4,
      "received": 8,
      "retained": 8
    }
  ]
];
const specs = {"buy": ["I", "J", "J"], "sell": ["I", "J", "J"], "budget": ["I", "J", "J"], "limited": ["I", "I", "J", "J"], "restocks": ["I", "I", "J"], "restock-time": ["I", "I", "J", "P"], "price-change": ["I", "J", "J"], "unit-price": ["P", "P"], "compare-offers": ["I", "C", "C"], "round-trip": ["J", "J", "J", "J"], "fund-target": ["I", "J", "J"], "net-currency": ["I", "J", "I", "J"], "commission": ["N", "R", "N"], "price-ceiling": ["I", "J"], "stock-limit": ["I", "J", "I", "J"], "parallel-sellers": ["I", "J", "J"], "progressive-cost": ["I", "J", "I"], "progressive-buy": ["I", "J", "I"], "quota-basket": ["C", "C", "C"], "priority-basket": ["C", "C", "C", "I"], "reserve-budget": ["I", "I", "J", "J"], "trade-time": ["I", "P", "N"], "throughput": ["J", "P", "J"], "change-loss": ["I", "J"], "sell-keep": ["I", "I", "J", "J"]};
for (const [name, args, expected] of cases) test(`tradeplan ${name} has a hand-calculated result`, () => {
  const result = tradeplanCalculation(name, args);
  for (const [key, value] of Object.entries(expected)) {
    if (typeof value === 'number') assert.ok(Math.abs(result[key] - value) < 1e-8, `${key}: ${result[key]} != ${value}`);
    else assert.deepEqual(result[key], value);
  }
  assert.match(result.note, /Offline/);
  assert.throws(() => tradeplanCalculation(name, []));
  for (let position = 0; position < args.length; position++) for (const invalid of ['NaN', '', -1, Infinity, 1000001, null, false]) {
    assert.throws(() => tradeplanCalculation(name, args.map((v, i) => i === position ? invalid : v)));
  }
});
test('tradeplan integer, ratio, list, and allocation limits', () => {
  for (const [name, args] of cases) specs[name].forEach((kind, position) => {
    const bad = kind === 'I' || kind === 'J' ? 1.5 : kind === 'R' ? 1.1 : kind === 'L' || kind === 'W' || kind === 'C' ? Array(1001).fill('1').join(',') : null;
    if (bad !== null) assert.throws(() => tradeplanCalculation(name, args.map((v,i) => i === position ? bad : v)));
    if (kind === 'P' || kind === 'J') assert.throws(() => tradeplanCalculation(name, args.map((v,i) => i === position ? 0 : v)));
  });
});
test('tradeplan real CLI executes every documented command', () => {
  const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
  for (const [name, args, expected] of cases) {
    const result = JSON.parse(execFileSync(process.execPath, [cli, 'tradeplan', name, ...args.map(String)], { encoding: 'utf8', timeout: 15000 }));
    for (const [key, value] of Object.entries(expected)) {
      if (typeof value === 'number') assert.ok(Math.abs(result[key] - value) < 1e-8);
      else assert.deepEqual(result[key], value);
    }
  }
});
test('tradeplan registration and argument validation', async () => {
  assert.equal(TRADEPLAN_COMMANDS.length, 25);
  assert.equal(new Set(TRADEPLAN_COMMANDS.map(([s]) => s.split(' ')[0])).size, 25);
  const program = new Command().exitOverride(); let printed;
  registerTradeplanTools(program, { print: value => { printed = value; } });
  const [name, args, expected] = cases[0];
  await program.parseAsync(['node', 'test', 'tradeplan', name, ...args.map(String)]);
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(printed[key], value);
  assert.throws(() => tradeplanCalculation('unknown'));
  assert.throws(() => tradeplanCalculation('toString'));
  assert.throws(() => tradeplanCalculation(name, [...args, 1]));
  for (const invalid of ['', ' ', -1, Infinity, 1000001, null, false]) assert.throws(() => tradeplanCalculation(name, args.map((v, i) => i ? v : invalid)));
});
test('tradeplan respects an empty budget and whole progressive prices', () => {
  assert.equal(tradeplanCalculation('progressive-buy', [0, 3, 2]).trades, 0);
  assert.equal(tradeplanCalculation('progressive-buy', [100, 3, 0]).trades, 33);
  assert.equal(tradeplanCalculation('limited', [10, 0, 3, 4]).cost, 0);
  assert.equal(tradeplanCalculation('reserve-budget', [5, 8, 3, 4]).reserveShortfall, 3);
  assert.throws(() => tradeplanCalculation('compare-offers', [10, '3,5', '4,0']));
});
