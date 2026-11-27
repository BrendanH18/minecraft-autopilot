import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { runFactorial } from '../src/planning-study-factorial.js';
import { runSweep } from '../src/planning-study-parameters.js';
import { calculateStudy } from '../src/planning-studies.js';
import { PLANNING_GROUPS } from '../src/planning-tools.js';
import { CLI_PATH } from './cli-path.js';

function deepFreeze(value) {
  if (value !== null && typeof value === 'object') Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

// Temporary planners: `wide` has more arguments than any real planner, so the
// ten-axis limit can be reached, and counts evaluations; `shape` returns a
// string or a mixed nested value.
function withFixtures(run) {
  const group = PLANNING_GROUPS.find((group) => group.name === 'vector');
  const names = Array.from({ length: 11 }, (_, index) => `<n${index + 1}>`).join(' ');
  const counter = { calls: 0 };
  const fixtures = [
    {
      signature: `factorial-wide ${names}`,
      types: Array(11).fill('n'),
      run: (...numbers) => {
        counter.calls++;
        return numbers.reduce((total, number) => total + number, 0);
      },
    },
    {
      signature: 'factorial-shape <sign> <label>',
      types: ['n', 'n'],
      run: (sign, label) => (sign > 0 ? `positive ${label}` : { 'a/b': [sign, null, true, { label }] }),
    },
  ];
  group.commands.push(...fixtures);
  try {
    return run(counter);
  } finally {
    for (const fixture of fixtures) group.commands.splice(group.commands.indexOf(fixture), 1);
  }
}

test('factorial evaluates every combination of two excavation axes and preserves the request', () => {
  const request = deepFreeze({
    args: [2, 3, 4],
    axes: [
      { index: 1, values: [1, 2] },
      { index: 3, values: [4, 5, 6] },
    ],
  });
  const before = structuredClone(request);
  const report = runFactorial('tunnel', 'excavate', request);
  // width × height 3 × length
  assert.deepEqual(report, {
    axes: [
      { index: 1, values: [1, 2] },
      { index: 3, values: [4, 5, 6] },
    ],
    total: 6,
    cases: [
      { case: 1, values: [1, 4], args: [1, 3, 4], result: 12 },
      { case: 2, values: [1, 5], args: [1, 3, 5], result: 15 },
      { case: 3, values: [1, 6], args: [1, 3, 6], result: 18 },
      { case: 4, values: [2, 4], args: [2, 3, 4], result: 24 },
      { case: 5, values: [2, 5], args: [2, 3, 5], result: 30 },
      { case: 6, values: [2, 6], args: [2, 3, 6], result: 36 },
    ],
  });
  assert.deepEqual(request, before);
  // The echo is a copy, so editing a report cannot reach the request.
  assert.notEqual(report.axes, request.axes);
  assert.notEqual(report.axes[0], request.axes[0]);
  assert.notEqual(report.axes[0].values, request.axes[0].values);
  assert.notEqual(report.cases[3].args, request.args);

  // An ordinary request (what the CLI passes) is not frozen, so a write that a
  // frozen request would silently ignore must also leave it untouched.
  const plain = { args: [2, 3, 4], axes: [{ index: 1, values: [1, 2] }] };
  const {
    axes: [plainAxis],
    args: plainArgs,
  } = plain;
  const plainValues = plainAxis.values;
  const echoed = runFactorial('tunnel', 'excavate', plain);
  assert.deepEqual(plain, { args: [2, 3, 4], axes: [{ index: 1, values: [1, 2] }] });
  assert.equal(plain.args, plainArgs);
  assert.equal(plain.axes[0], plainAxis);
  assert.equal(plain.axes[0].values, plainValues);
  assert.notEqual(echoed.axes[0].values, plainValues);
});

test('factorial varies the first axis slowest and the last fastest, in supplied order', () => {
  // Axes are listed against argument order and values are unsorted: neither is rearranged.
  const reversed = runFactorial('tunnel', 'excavate', {
    args: [2, 3, 4],
    axes: [
      { index: 3, values: [5, 4] },
      { index: 1, values: [2, 1] },
    ],
  });
  assert.deepEqual(reversed.axes, [
    { index: 3, values: [5, 4] },
    { index: 1, values: [2, 1] },
  ]);
  assert.deepEqual(
    reversed.cases.map((row) => row.case),
    [1, 2, 3, 4],
  );
  assert.deepEqual(
    reversed.cases.map((row) => row.values),
    [
      [5, 2],
      [5, 1],
      [4, 2],
      [4, 1],
    ],
  );
  assert.deepEqual(
    reversed.cases.map((row) => row.args),
    [
      [2, 3, 5],
      [1, 3, 5],
      [2, 3, 4],
      [1, 3, 4],
    ],
  );
  assert.deepEqual(
    reversed.cases.map((row) => row.result),
    [30, 15, 24, 12],
  );

  // Three axes with eight distinct products expose any other nesting order.
  const cube = runFactorial('tunnel', 'excavate', {
    args: [9, 9, 9],
    axes: [
      { index: 1, values: [1, 2] },
      { index: 2, values: [1, 3] },
      { index: 3, values: [1, 5] },
    ],
  });
  assert.equal(cube.total, 8);
  assert.deepEqual(
    cube.cases.map((row) => row.values),
    [
      [1, 1, 1],
      [1, 1, 5],
      [1, 3, 1],
      [1, 3, 5],
      [2, 1, 1],
      [2, 1, 5],
      [2, 3, 1],
      [2, 3, 5],
    ],
  );
  assert.deepEqual(
    cube.cases.map((row) => row.result),
    [1, 5, 3, 15, 2, 10, 6, 30],
  );
  assert.ok(cube.cases.every((row) => row.args.join() === row.values.join()));

  // Repeated values are separate combinations, and one axis matches a sweep.
  const repeated = runFactorial('tunnel', 'excavate', { args: [2, 3, 4], axes: [{ index: 3, values: [5, 5, 0] }] });
  assert.deepEqual(
    repeated.cases.map((row) => [row.case, row.values, row.result]),
    [
      [1, [5], 30],
      [2, [5], 30],
      [3, [0], 0],
    ],
  );
  assert.deepEqual(
    repeated.cases.map((row) => [row.args, row.result]),
    runSweep('tunnel', 'excavate', { args: [2, 3, 4], index: 3, values: [5, 5, 0] }).cases.map((row) => [
      row.args,
      row.result,
    ]),
  );
});

test('factorial keeps object, array, string, boolean and null results and whole-argument strings', () => {
  // repair cost = units × unit cost; repair wins ties with the replacement cost.
  const choices = runFactorial('durability', 'repair-or-replace', {
    args: [10, 2, 5],
    axes: [
      { index: 1, values: [10, 1] },
      { index: 3, values: [5, 20] },
    ],
  });
  assert.deepEqual(
    choices.cases.map((row) => row.result),
    [
      { repairCost: 20, replacementCost: 5, choice: 'replace' },
      { repairCost: 20, replacementCost: 20, choice: 'repair' },
      { repairCost: 2, replacementCost: 5, choice: 'repair' },
      { repairCost: 2, replacementCost: 20, choice: 'repair' },
    ],
  );
  assert.deepEqual(
    choices.cases.map((row) => row.result.choice.length),
    [7, 6, 6, 6],
  );
  assert.ok(choices.cases.every((row) => Object.keys(row.result).length === 3));

  // position <= reorder level; a numeric string is passed through unconverted.
  const triggers = runFactorial('replenish', 'order-trigger', {
    args: [5, 5],
    axes: [
      { index: 1, values: [4, '5', 6] },
      { index: 2, values: [5, 4] },
    ],
  });
  assert.deepEqual(
    triggers.cases.map((row) => row.values),
    [
      [4, 5],
      [4, 4],
      ['5', 5],
      ['5', 4],
      [6, 5],
      [6, 4],
    ],
  );
  assert.deepEqual(
    triggers.cases.map((row) => row.result),
    [true, true, true, false, false, false],
  );

  // First period whose closing stock (on hand + deliveries - demands) is negative, else null.
  const stockouts = runFactorial('replenish', 'stockout-period', {
    args: [10, '0', '1'],
    axes: [
      { index: 1, values: [10, 0] },
      { index: 3, values: ['1', '0'] },
    ],
  });
  assert.deepEqual(
    stockouts.cases.map((row) => row.result),
    [null, null, 1, null],
  );
  const lists = runFactorial('replenish', 'stockout-period', {
    args: [2, '0,0', '1,1'],
    axes: [
      { index: 2, values: ['0,0', '5,0'] },
      { index: 3, values: ['1,1', '3,9'] },
    ],
  });
  assert.deepEqual(
    lists.cases.map((row) => row.args),
    [
      [2, '0,0', '1,1'],
      [2, '0,0', '3,9'],
      [2, '5,0', '1,1'],
      [2, '5,0', '3,9'],
    ],
  );
  assert.deepEqual(
    lists.cases.map((row) => row.result),
    [null, 1, null, 2],
  );

  // Full loads of the capacity, then the remainder.
  const loads = runFactorial('haul', 'outbound-loads', {
    args: [10, 4],
    axes: [
      { index: 1, values: [10, 3] },
      { index: 2, values: [4, 10] },
    ],
  });
  assert.deepEqual(
    loads.cases.map((row) => row.result),
    [[4, 4, 2], [10], [3], [3]],
  );
  assert.deepEqual(
    loads.cases.map((row) => row.result.length),
    [3, 1, 1, 1],
  );

  // Order 3,2,4 on one server ends at 9; on two servers the third job follows the 2 and ends at 6.
  const makespans = runFactorial('queueplan', 'parallel-makespan', {
    args: ['3,2,4', 2],
    axes: [
      { index: 2, values: [1, 2] },
      { index: 1, values: ['3,2,4', '2,2,2'] },
    ],
  });
  assert.deepEqual(
    makespans.cases.map((row) => row.result),
    [9, 6, 6, 4],
  );

  withFixtures(() => {
    const shapes = runFactorial('vector', 'factorial-shape', {
      args: [1, 1],
      axes: [
        { index: 1, values: [1, -1] },
        { index: 2, values: [7, 8] },
      ],
    });
    assert.deepEqual(
      shapes.cases.map((row) => row.result),
      [
        'positive 7',
        'positive 8',
        { 'a/b': [-1, null, true, { label: 7 }] },
        { 'a/b': [-1, null, true, { label: 8 }] },
      ],
    );
    const report = calculateStudy('factorial', 'vector', 'factorial-shape', {
      args: [1, 1],
      axes: [{ index: 1, values: [1, -1] }],
    });
    assert.deepEqual(
      report.cases.map((row) => row.result),
      ['positive 1', { 'a/b': [-1, null, true, { label: 1 }] }],
    );
  });
});

test('factorial rejects malformed requests and base arguments', () => {
  const axes = [{ index: 1, values: [2] }];
  const run = (request) => () => runFactorial('tunnel', 'excavate', request);
  assert.throws(run(undefined), /Supply a JSON request object/);
  assert.throws(run(null), /Supply a JSON request object/);
  assert.throws(run([]), /Supply a JSON request object/);
  assert.throws(run('{}'), /Supply a JSON request object/);
  assert.throws(run({ args: [2, 3, 4], axes, extra: 1 }), /unknown field/);
  assert.throws(run({ args: [2, 3, 4], axes, index: 1 }), /unknown field/);
  assert.throws(run({ args: [2, 3, 4], axes, cases: [[2, 3, 4]] }), /unknown field/);
  // Fields of the sibling sweep and sensitivity requests are not accepted here.
  assert.throws(run({ args: [2, 3, 4], axes, values: [2] }), /unknown field/);
  assert.throws(run({ args: [2, 3, 4], axes, changes: axes }), /unknown field/);
  assert.throws(run(JSON.parse('{"args":[2,3,4],"axes":[{"index":1,"values":[2]}],"__proto__":{}}')), /unknown field/);
  assert.throws(run({ axes }), /argument array/);
  assert.throws(run({ args: '2,3,4', axes }), /argument array/);
  assert.throws(run({ args: { 0: 2, 1: 3, 2: 4 }, axes }), /argument array/);
  assert.throws(run({ args: [2, 3], axes }), /exactly the documented arguments/);
  assert.throws(run({ args: [2, 3, 4, 5], axes }), /exactly the documented arguments/);
  // The base row is checked even though the only axis would replace the bad width.
  assert.throws(run({ args: [0, 3, 4], axes }), /positive number/);
  assert.throws(run({ args: ['wide', 3, 4], axes }), /finite/);
  assert.throws(run({ args: [2, 3, 4], axes: [{ index: 1, values: [Infinity] }] }), /finite/);
  assert.throws(run({ args: [2, 3, 4], axes: [{ index: 1, values: [NaN] }] }), /finite/);
  assert.throws(() => runFactorial('tunnel', 'missing', { args: [2, 3, 4], axes }), /Unknown tunnel command/);
  assert.throws(() => runFactorial('missing', 'excavate', { args: [2, 3, 4], axes }), /Unknown planning group/);
});

test('factorial rejects malformed axes, indexes and values', () => {
  const run = (axes) => () => runFactorial('tunnel', 'excavate', { args: [2, 3, 4], axes });
  assert.throws(() => runFactorial('tunnel', 'excavate', { args: [2, 3, 4] }), /Supply 1–10 factorial axes/);
  assert.throws(run(null), /Supply 1–10 factorial axes/);
  assert.throws(run({}), /Supply 1–10 factorial axes/);
  assert.throws(run({ index: 1, values: [2] }), /Supply 1–10 factorial axes/);
  assert.throws(run('[]'), /Supply 1–10 factorial axes/);
  assert.throws(run([]), /Supply 1–10 factorial axes/);

  assert.throws(run([null]), /Each axis must be an object/);
  assert.throws(run([[]]), /Each axis must be an object/);
  assert.throws(run([[1, [2]]]), /Each axis must be an object/);
  assert.throws(run([1]), /Each axis must be an object/);
  assert.throws(run(['1']), /Each axis must be an object/);
  // Sparse arrays come only from JavaScript callers; a hole is refused, not skipped.
  assert.throws(run([, { index: 1, values: [2] }]), /JSON values only/);
  assert.throws(run([{ index: 1, values: [2] }, , { index: 3, values: [2] }]), /JSON values only/);
  assert.throws(run([{ index: 1, values: [2], extra: true }]), /unknown field/);
  assert.throws(run([{ index: 1, values: [2], value: 2 }]), /unknown field/);
  assert.throws(
    run([
      { index: 1, values: [2] },
      { index: 2, values: [2], path: '' },
    ]),
    /unknown field/,
  );

  assert.throws(run([{}]), /one-based argument positions/);
  assert.throws(run([{ values: [2] }]), /one-based argument positions/);
  assert.throws(run([{ index: 0, values: [2] }]), /one-based argument positions/);
  assert.throws(run([{ index: 4, values: [2] }]), /one-based argument positions/);
  assert.throws(run([{ index: -1, values: [2] }]), /one-based argument positions/);
  assert.throws(run([{ index: 1.5, values: [2] }]), /one-based argument positions/);
  assert.throws(run([{ index: '1', values: [2] }]), /one-based argument positions/);
  assert.throws(run([{ index: null, values: [2] }]), /one-based argument positions/);
  assert.throws(run([{ index: [1], values: [2] }]), /one-based argument positions/);
  assert.throws(run([{ index: 2 ** 53, values: [2] }]), /one-based argument positions/);
  assert.deepEqual(run([{ index: 1, values: [5] }])().cases[0].args, [5, 3, 4]);
  assert.deepEqual(run([{ index: 3, values: [5] }])().cases[0].args, [2, 3, 5]);

  assert.throws(
    run([
      { index: 1, values: [1] },
      { index: 1, values: [2] },
    ]),
    /Factorial axis indexes must be unique/,
  );
  assert.throws(
    run([
      { index: 2, values: [1] },
      { index: 3, values: [1] },
      { index: 2, values: [1] },
    ]),
    /Factorial axis indexes must be unique/,
  );

  assert.throws(run([{ index: 1 }]), /Supply 1–100 replacement values/);
  assert.throws(run([{ index: 1, values: null }]), /Supply 1–100 replacement values/);
  assert.throws(run([{ index: 1, values: 2 }]), /Supply 1–100 replacement values/);
  assert.throws(run([{ index: 1, values: '2,3' }]), /Supply 1–100 replacement values/);
  assert.throws(run([{ index: 1, values: { 0: 2 } }]), /Supply 1–100 replacement values/);
  assert.throws(run([{ index: 1, values: [] }]), /Supply 1–100 replacement values/);
  assert.throws(run([{ index: 1, values: Array(101).fill(2) }]), /Supply 1–100 replacement values/);
  assert.equal(run([{ index: 1, values: Array(100).fill(2) }])().total, 100);

  assert.throws(run([{ index: 1, values: [null] }]), /numbers or argument strings/);
  assert.throws(run([{ index: 1, values: [true] }]), /numbers or argument strings/);
  assert.throws(run([{ index: 1, values: [[2]] }]), /numbers or argument strings/);
  assert.throws(run([{ index: 1, values: [{ value: 2 }] }]), /numbers or argument strings/);
  assert.throws(run([{ index: 1, values: [2, 3, null] }]), /numbers or argument strings/);
  assert.throws(run([{ index: 1, values: [1, , 2] }]), /JSON values only/);
  assert.throws(run([{ index: 1, values: [, 2] }]), /JSON values only/);
});

test('factorial enforces the axis and combination limits before evaluating combinations', () => {
  withFixtures((counter) => {
    const args = Array(11).fill(0);
    const run = (axes) => runFactorial('vector', 'factorial-wide', { args, axes });
    const single = (count) => Array.from({ length: count }, (_, index) => ({ index: index + 1, values: [1] }));
    const pair = (count) => Array.from({ length: count }, (_, index) => ({ index: index + 1, values: [0, 1] }));
    const tens = (count) => Array.from({ length: count }, (_, index) => index);

    // Ten axes are accepted; the eleventh is refused although its index is unique.
    assert.deepEqual(run(single(10)).cases, [
      { case: 1, values: Array(10).fill(1), args: [...Array(10).fill(1), 0], result: 10 },
    ]);
    counter.calls = 0;
    assert.throws(() => run(single(11)), /Supply 1–10 factorial axes/);
    assert.equal(counter.calls, 1);

    // 10 × 10 = 100 and 2 × 2 × 5 × 5 = 100 combinations are accepted: one base
    // evaluation plus one per combination.
    counter.calls = 0;
    const square = run([
      { index: 1, values: tens(10) },
      { index: 2, values: tens(10) },
    ]);
    assert.equal(square.total, 100);
    assert.equal(counter.calls, 101);
    assert.deepEqual(square.cases[0], { case: 1, values: [0, 0], args, result: 0 });
    assert.deepEqual(square.cases[37].values, [3, 7]);
    assert.deepEqual(square.cases[99], { case: 100, values: [9, 9], args: [9, 9, ...Array(9).fill(0)], result: 18 });
    assert.equal(
      run([
        { index: 1, values: [0, 1] },
        { index: 2, values: [0, 1] },
        { index: 3, values: tens(5) },
        { index: 4, values: tens(5) },
      ]).total,
      100,
    );
    assert.equal(run(pair(6)).total, 64);

    // 101 is prime, so the smallest product above the limit is 2 × 51 = 102.
    for (const axes of [
      [
        { index: 1, values: [0, 1] },
        { index: 2, values: tens(51) },
      ],
      [
        { index: 1, values: tens(51) },
        { index: 2, values: [0, 1] },
      ],
      [
        { index: 1, values: tens(10) },
        { index: 2, values: tens(11) },
      ],
      pair(7),
      Array.from({ length: 10 }, (_, index) => ({ index: index + 1, values: tens(100) })),
    ]) {
      counter.calls = 0;
      assert.throws(() => run(axes), /Factorial studies are limited to 100 combinations/);
      assert.equal(counter.calls, 1);
    }

    // A malformed last axis is found before the first combination is evaluated.
    for (const [last, message] of [
      [{ index: 2, values: [] }, /Supply 1–100 replacement values/],
      [{ index: 12, values: [1] }, /one-based argument positions/],
      [{ index: 1, values: [1] }, /Factorial axis indexes must be unique/],
      [{ index: 2, values: [1], extra: 1 }, /unknown field/],
      [{ index: 2, values: [1, null] }, /numbers or argument strings/],
    ]) {
      counter.calls = 0;
      assert.throws(() => run([{ index: 1, values: [0, 1] }, last]), message);
      assert.equal(counter.calls, 1);
    }
  });
});

test('factorial rejects the whole study when any combination is invalid', () => {
  // Width 0 is not a positive whole number.
  assert.throws(
    () => runFactorial('tunnel', 'excavate', { args: [2, 3, 4], axes: [{ index: 1, values: [1, 0, 3] }] }),
    /positive number/,
  );
  // Only the last of six combinations is invalid.
  assert.throws(
    () =>
      runFactorial('tunnel', 'excavate', {
        args: [2, 3, 4],
        axes: [
          { index: 1, values: [1, 2] },
          { index: 3, values: [4, 5, 1.5] },
        ],
      }),
    /whole number/,
  );
  assert.throws(
    () =>
      runFactorial('tunnel', 'excavate', {
        args: [2, 3, 4],
        axes: [
          { index: 1, values: [1, 2] },
          { index: 3, values: [4, 'long'] },
        ],
      }),
    /finite/,
  );
  // Each replacement is valid alone, but one-period deliveries cannot pair with two-period demands.
  const mixed = {
    args: [10, '0', '1'],
    axes: [
      { index: 2, values: ['0', '0,0'] },
      { index: 3, values: ['1', '1,1'] },
    ],
  };
  assert.throws(() => runFactorial('replenish', 'stockout-period', mixed), /equal lengths/);
  assert.throws(() => calculateStudy('factorial', 'replenish', 'stockout-period', mixed), /equal lengths/);
  assert.deepEqual(
    runFactorial('replenish', 'stockout-period', {
      args: [10, '0', '1'],
      axes: [
        { index: 2, values: ['0'] },
        { index: 3, values: ['1', '11'] },
      ],
    }).cases.map((row) => row.result),
    [null, 1],
  );
});

test('factorial CLI accepts inline, file and stdin requests and produces no partial report on errors', async () => {
  const directory = await mkdtemp('.runtime-factorial-');
  const call = (source, input) =>
    spawnSync(
      process.execPath,
      [
        CLI_PATH,
        '--bridge',
        '.runtime/missing-factorial.json',
        'study',
        'factorial',
        'durability',
        'action-budget',
        source,
      ],
      { encoding: 'utf8', input },
    );
  try {
    const body = {
      args: [25, 3, 4],
      axes: [
        { index: 1, values: [25, 40] },
        { index: 2, values: [3, 2] },
      ],
    };
    const request = JSON.stringify(body);
    const expected = calculateStudy('factorial', 'durability', 'action-budget', body);
    // Whole actions from (remaining - reserve 4) / wear: 21/3, 21/2, 36/3, 36/2.
    assert.deepEqual(
      expected.cases.map((row) => [row.case, row.values, row.args, row.result]),
      [
        [1, [25, 3], [25, 3, 4], 7],
        [2, [25, 2], [25, 2, 4], 10],
        [3, [40, 3], [40, 3, 4], 12],
        [4, [40, 2], [40, 2, 4], 18],
      ],
    );
    assert.deepEqual(
      [expected.workflow, expected.group, expected.command, expected.total],
      ['factorial', 'durability', 'action-budget', 4],
    );
    assert.deepEqual(expected.axes, body.axes);
    const filename = `${directory}/request.json`;
    await writeFile(filename, request);
    for (const [source, input] of [[request], [`@${filename}`], ['-', request]]) {
      const result = call(source, input);
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), expected);
    }
    // The fourth combination has zero wear per action, which the planner rejects.
    const invalid = call(JSON.stringify({ ...body, axes: [body.axes[0], { index: 2, values: [3, 0] }] }));
    assert.notEqual(invalid.status, 0);
    assert.equal(invalid.stdout, '');
    assert.match(invalid.stderr, /Error/);
    const overLimit = call(
      JSON.stringify({
        ...body,
        axes: [
          { index: 1, values: Array(51).fill(25) },
          { index: 2, values: [3, 2] },
        ],
      }),
    );
    assert.notEqual(overLimit.status, 0);
    assert.equal(overLimit.stdout, '');
    assert.match(overLimit.stderr, /Error: Factorial studies are limited to 100 combinations\./);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
