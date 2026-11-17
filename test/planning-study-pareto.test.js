import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { runPareto } from '../src/planning-study-pareto.js';
import { calculateStudy } from '../src/planning-studies.js';
import { PLANNING_GROUPS } from '../src/planning-tools.js';

function deepFreeze(value) {
  if (value !== null && typeof value === 'object') Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

// Temporary planner `vector pareto-pick <index>`: returns results[index] and
// counts evaluations, so any JSON result shape and any score can be supplied.
function withResults(results, run) {
  const group = PLANNING_GROUPS.find((group) => group.name === 'vector');
  const counter = { calls: 0 };
  const fixture = {
    signature: 'pareto-pick <index>',
    types: ['c'],
    run: (index) => {
      counter.calls++;
      return results[index];
    },
  };
  group.commands.push(fixture);
  const pick = (indexes, objectives) =>
    runPareto('vector', 'pareto-pick', { cases: indexes.map((index) => [index]), objectives });
  try {
    return run(pick, counter);
  } finally {
    group.commands.splice(group.commands.indexOf(fixture), 1);
  }
}

const min = (path = '', measure) => ({ path, direction: 'min', ...(measure ? { measure } : {}) });
const max = (path = '', measure) => ({ path, direction: 'max', ...(measure ? { measure } : {}) });
const verdicts = (report) => report.cases.map((row) => [row.case, row.dominated, row.dominatedBy]);

test('pareto reports the front and every dominator for packs against ordered units', () => {
  // review-order covers a shortfall of 10 - 3 = 7 units with whole packs:
  // pack 5 -> 2 packs, 10 units; pack 8 -> 1, 8; pack 4 -> 2, 8; pack 1 -> 7, 7.
  const request = deepFreeze({
    cases: [
      [3, 10, 5],
      [3, 10, 8],
      [3, 10, 4],
      [3, 10, 1],
    ],
    objectives: [
      { path: '/packs', direction: 'min' },
      { path: '/units', direction: 'min' },
    ],
  });
  const before = structuredClone(request);
  const report = runPareto('replenish', 'review-order', request);
  assert.deepEqual(report, {
    objectives: [
      { path: '/packs', measure: 'value', direction: 'min' },
      { path: '/units', measure: 'value', direction: 'min' },
    ],
    total: 4,
    // Case 2 has the fewest packs and case 4 the fewest units.
    front: [2, 4],
    cases: [
      // Case 2 (1, 8) and case 3 (2, 8) both beat 10 units without more packs.
      {
        case: 1,
        args: [3, 10, 5],
        result: { packs: 2, units: 10 },
        scores: [2, 10],
        dominated: true,
        dominatedBy: [2, 3],
      },
      { case: 2, args: [3, 10, 8], result: { packs: 1, units: 8 }, scores: [1, 8], dominated: false, dominatedBy: [] },
      // Equal units, but case 2 needs one pack fewer.
      { case: 3, args: [3, 10, 4], result: { packs: 2, units: 8 }, scores: [2, 8], dominated: true, dominatedBy: [2] },
      { case: 4, args: [3, 10, 1], result: { packs: 7, units: 7 }, scores: [7, 7], dominated: false, dominatedBy: [] },
    ],
  });
  assert.deepEqual(request, before);
  // deepEqual ignores key order, so the documented order is checked separately.
  assert.deepEqual(Object.keys(report), ['objectives', 'total', 'front', 'cases']);
  assert.deepEqual(Object.keys(report.objectives[0]), ['path', 'measure', 'direction']);
  assert.deepEqual(Object.keys(report.cases[0]), ['case', 'args', 'result', 'scores', 'dominated', 'dominatedBy']);
  // Rows and objectives are copies, so editing a report cannot reach the request.
  assert.notEqual(report.cases[0].args, request.cases[0]);
  assert.notEqual(report.objectives[0], request.objectives[0]);

  const study = calculateStudy('pareto', 'replenish', 'review-order', request);
  assert.deepEqual(Object.keys(study), [
    'workflow',
    'group',
    'command',
    'objectives',
    'total',
    'front',
    'cases',
    'note',
    'plannerNote',
  ]);
  const { workflow, group, command, note, plannerNote, ...data } = study;
  assert.deepEqual([workflow, group, command], ['pareto', 'replenish', 'review-order']);
  assert.deepEqual(data, report);
  assert.match(note, /Offline/);
  assert.equal(typeof plannerNote, 'string');
  assert.deepEqual(request, before);
});

test('pareto never writes defaults into an unfrozen request or returns its objective objects', () => {
  // Excavating 2 × 3 × 4 and 1 × 1 × 1 gives volumes 24 and 1; min and max on
  // the same score make the two cases a trade-off.
  const request = {
    cases: [
      [2, 3, 4],
      [1, 1, 1],
    ],
    objectives: [{ direction: 'min' }, { path: '', direction: 'max' }],
  };
  const before = structuredClone(request);
  const report = runPareto('tunnel', 'excavate', request);
  assert.deepEqual(report.objectives, [
    { path: '', measure: 'value', direction: 'min' },
    { path: '', measure: 'value', direction: 'max' },
  ]);
  assert.deepEqual(
    report.cases.map((row) => row.scores),
    [
      [24, 24],
      [1, 1],
    ],
  );
  assert.deepEqual(report.front, [1, 2]);
  assert.deepEqual(request, before);
  calculateStudy('pareto', 'tunnel', 'excavate', request);
  assert.deepEqual(request, before);
  assert.deepEqual(Object.keys(request.objectives[0]), ['direction']);
  assert.deepEqual(Object.keys(request.objectives[1]), ['path', 'direction']);

  // A fully specified objective is still copied, not returned as is.
  const full = { cases: [[2, 3, 4]], objectives: [{ direction: 'max', measure: 'value', path: '' }] };
  const copied = runPareto('tunnel', 'excavate', full);
  assert.notEqual(copied.objectives[0], full.objectives[0]);
  assert.deepEqual(Object.keys(copied.objectives[0]), ['path', 'measure', 'direction']);
  copied.objectives[0].direction = 'min';
  assert.equal(full.objectives[0].direction, 'max');
});

test('pareto keeps a three-way trade-off and names both dominators of the one dominated case', () => {
  // purification-loss: good = input × (1 - impurity) × retained, impurityRemoved
  // = input × impurity, goodLost = input × (1 - impurity) × (1 - retained).
  //   case 1: 16 × 0.75 × 0.75 = 9, 16 × 0.25 = 4, 16 × 0.75 × 0.25 = 3
  //   case 2:  8 × 0.5 × 0.25 = 1,   8 × 0.5 = 4,   8 × 0.5 × 0.75 = 3
  //   case 3: 16 × 0.5 × 0.5 = 4,   16 × 0.5 = 8,  16 × 0.5 × 0.5 = 4
  //   case 4:  8 × 0.5 × 1 = 4,      8 × 0.5 = 4,   8 × 0.5 × 0 = 0
  const report = runPareto('blending', 'purification-loss', {
    cases: [
      [16, 0.25, 0.75],
      [8, 0.5, 0.25],
      [16, 0.5, 0.5],
      [8, 0.5, 1],
    ],
    objectives: [max('/good'), max('/impurityRemoved'), min('/goodLost')],
  });
  assert.deepEqual(report.objectives, [
    { path: '/good', measure: 'value', direction: 'max' },
    { path: '/impurityRemoved', measure: 'value', direction: 'max' },
    { path: '/goodLost', measure: 'value', direction: 'min' },
  ]);
  assert.deepEqual(
    report.cases.map((row) => row.scores),
    [
      [9, 4, 3],
      [1, 4, 3],
      [4, 8, 4],
      [4, 4, 0],
    ],
  );
  // Case 1 keeps the most good material, case 3 removes the most impurity and
  // case 4 loses nothing, so none of the three dominates another.
  assert.deepEqual(report.front, [1, 3, 4]);
  // Case 2 loses to case 1 on good material and to case 4 on good and loss,
  // but its loss of 3 beats case 3's loss of 4.
  assert.deepEqual(verdicts(report), [
    [1, false, []],
    [2, true, [1, 4]],
    [3, false, []],
    [4, false, []],
  ]);
  assert.equal(report.total, 4);

  // Reversing every direction reverses every dominance: case 2 now dominates
  // the two cases that dominated it, and case 3 still trades off with it.
  const reversed = runPareto('blending', 'purification-loss', {
    cases: [
      [16, 0.25, 0.75],
      [8, 0.5, 0.25],
      [16, 0.5, 0.5],
      [8, 0.5, 1],
    ],
    objectives: [min('/good'), min('/impurityRemoved'), max('/goodLost')],
  });
  assert.deepEqual(reversed.front, [2, 3]);
  assert.deepEqual(verdicts(reversed), [
    [1, true, [2]],
    [2, false, []],
    [3, false, []],
    [4, true, [2]],
  ]);
});

test('pareto never lets exactly tied cases dominate each other', () => {
  // Shortfalls 7, 7 and 8 with packs 4, 5 and 4: (2, 8), (2, 10) and (2, 8).
  const objectives = [min('/packs'), min('/units')];
  const tied = runPareto('replenish', 'review-order', {
    cases: [
      [3, 10, 4],
      [3, 10, 5],
      [2, 10, 4],
    ],
    objectives,
  });
  assert.deepEqual(
    tied.cases.map((row) => row.scores),
    [
      [2, 8],
      [2, 10],
      [2, 8],
    ],
  );
  assert.deepEqual(tied.front, [1, 3]);
  assert.deepEqual(verdicts(tied), [
    [1, false, []],
    [2, true, [1, 3]],
    [3, false, []],
  ]);

  // A pack of 8 gives (1, 8), which dominates both tied cases equally.
  const beaten = runPareto('replenish', 'review-order', {
    cases: [
      [3, 10, 4],
      [3, 10, 5],
      [2, 10, 4],
      [3, 10, 8],
    ],
    objectives,
  });
  assert.deepEqual(beaten.front, [4]);
  assert.deepEqual(verdicts(beaten), [
    [1, true, [4]],
    [2, true, [1, 3, 4]],
    [3, true, [4]],
    [4, false, []],
  ]);

  // Identical candidates are all kept, under either direction.
  for (const direction of ['min', 'max']) {
    const same = runPareto('tunnel', 'excavate', {
      cases: [
        [2, 3, 4],
        [2, 3, 4],
        [4, 3, 2],
      ],
      objectives: [{ direction }],
    });
    assert.deepEqual(
      same.cases.map((row) => row.scores),
      [[24], [24], [24]],
    );
    assert.deepEqual(same.front, [1, 2, 3]);
    assert.ok(same.cases.every((row) => row.dominated === false && row.dominatedBy.length === 0));
  }
  // A single case is its own front.
  assert.deepEqual(runPareto('tunnel', 'excavate', { cases: [[2, 3, 4]], objectives: [min()] }).front, [1]);
});

test('pareto orders numbers numerically and lists rows, the front and dominators in source order', () => {
  // Volumes 100, 9 and 10: text order would put 10 and 100 before 9.
  const rows = [
    [4, 5, 5],
    [1, 3, 3],
    [1, 2, 5],
  ];
  const smallest = runPareto('tunnel', 'excavate', { cases: rows, objectives: [min()] });
  assert.deepEqual(
    smallest.cases.map((row) => row.scores),
    [[100], [9], [10]],
  );
  assert.deepEqual(smallest.front, [2]);
  assert.deepEqual(verdicts(smallest), [
    [1, true, [2, 3]],
    [2, false, []],
    [3, true, [2]],
  ]);
  const largest = runPareto('tunnel', 'excavate', { cases: rows, objectives: [max()] });
  assert.deepEqual(largest.front, [1]);
  assert.deepEqual(verdicts(largest), [
    [1, false, []],
    [2, true, [1, 3]],
    [3, true, [1]],
  ]);

  // Volumes 24, 5, 12 and 5. Best-first order would list case 1's dominators as
  // 2, 4, 3 and the rows as 2, 4, 3, 1; the report keeps source order instead.
  const mixed = runPareto('tunnel', 'excavate', {
    cases: [
      [2, 3, 4],
      [1, 1, 5],
      [3, 2, 2],
      [5, 1, 1],
    ],
    objectives: [min()],
  });
  assert.deepEqual(
    mixed.cases.map((row) => [row.case, row.args, row.scores]),
    [
      [1, [2, 3, 4], [24]],
      [2, [1, 1, 5], [5]],
      [3, [3, 2, 2], [12]],
      [4, [5, 1, 1], [5]],
    ],
  );
  assert.deepEqual(mixed.front, [2, 4]);
  assert.deepEqual(verdicts(mixed), [
    [1, true, [2, 3, 4]],
    [2, false, []],
    [3, true, [2, 4]],
    [4, false, []],
  ]);

  // The front is not sorted by any objective: (7, 7) is supplied before (1, 8).
  const front = runPareto('replenish', 'review-order', {
    cases: [
      [3, 10, 1],
      [3, 10, 5],
      [3, 10, 8],
    ],
    objectives: [min('/packs'), min('/units')],
  });
  assert.deepEqual(
    front.cases.map((row) => row.scores),
    [
      [7, 7],
      [2, 10],
      [1, 8],
    ],
  );
  assert.deepEqual(front.front, [1, 3]);
  assert.deepEqual(verdicts(front), [
    [1, false, []],
    [2, true, [3]],
    [3, false, []],
  ]);

  // Objective order does not change dominance, only the order of the scores.
  const swapped = runPareto('replenish', 'review-order', {
    cases: [
      [3, 10, 1],
      [3, 10, 5],
      [3, 10, 8],
    ],
    objectives: [min('/units'), min('/packs')],
  });
  assert.deepEqual(
    swapped.cases.map((row) => row.scores),
    [
      [7, 7],
      [10, 2],
      [8, 1],
    ],
  );
  assert.deepEqual(verdicts(swapped), verdicts(front));

  // Opposite directions on one score make every distinct value a trade-off.
  const opposed = runPareto('tunnel', 'excavate', { cases: rows, objectives: [min(), max()] });
  assert.deepEqual(
    opposed.cases.map((row) => row.scores),
    [
      [100, 100],
      [9, 9],
      [10, 10],
    ],
  );
  assert.deepEqual(opposed.front, [1, 2, 3]);
});

test('pareto orders strings by code unit, false before true, and treats null as a tie', () => {
  withResults(['apple', 'Zinc', 'Apple', '10', '9', '～', '\u{1f600}'], (pick) => {
    // Code units: "Apple" < "Zinc" < "apple"; a dictionary would put Zinc last.
    const words = pick([0, 1, 2], [min()]);
    assert.deepEqual(
      words.cases.map((row) => row.scores),
      [['apple'], ['Zinc'], ['Apple']],
    );
    assert.deepEqual(words.front, [3]);
    assert.deepEqual(verdicts(words), [
      [1, true, [2, 3]],
      [2, true, [3]],
      [3, false, []],
    ]);
    assert.deepEqual(pick([0, 1, 2], [max()]).front, [1]);
    // Digit strings are text: "10" sorts before "9".
    assert.deepEqual(pick([3, 4], [min()]).front, [1]);
    assert.deepEqual(pick([3, 4], [max()]).front, [2]);
    // U+1F600 is stored as the code units D83D DE00, which sort before U+FF5E.
    assert.deepEqual(pick([5, 6], [min()]).front, [2]);
    assert.deepEqual(pick([5, 6], [max()]).front, [1]);
  });

  // repair-or-replace repairs when units × unit cost is at most the new tool
  // cost: 20 > 5 replaces, 2 <= 5 repairs, 6 > 5 replaces.
  const choices = runPareto('durability', 'repair-or-replace', {
    cases: [
      [10, 2, 5],
      [1, 2, 5],
      [3, 2, 5],
    ],
    objectives: [min('/choice')],
  });
  assert.deepEqual(
    choices.cases.map((row) => row.scores),
    [['replace'], ['repair'], ['replace']],
  );
  assert.deepEqual(choices.front, [2]);
  assert.deepEqual(verdicts(choices), [
    [1, true, [2]],
    [2, false, []],
    [3, true, [2]],
  ]);

  // order-trigger is true when the position is at or below the reorder level.
  const triggers = {
    cases: [
      [5, 5],
      [6, 5],
      [4, 5],
    ],
  };
  const quiet = runPareto('replenish', 'order-trigger', { ...triggers, objectives: [min()] });
  assert.deepEqual(
    quiet.cases.map((row) => row.scores),
    [[true], [false], [true]],
  );
  assert.deepEqual(quiet.front, [2]);
  assert.deepEqual(verdicts(quiet), [
    [1, true, [2]],
    [2, false, []],
    [3, true, [2]],
  ]);
  const urgent = runPareto('replenish', 'order-trigger', { ...triggers, objectives: [max()] });
  assert.deepEqual(urgent.front, [1, 3]);
  assert.deepEqual(verdicts(urgent), [
    [1, false, []],
    [2, true, [1, 3]],
    [3, false, []],
  ]);

  // Ten or twenty units on hand never run out against a demand of one.
  for (const direction of ['min', 'max']) {
    const nulls = runPareto('replenish', 'stockout-period', {
      cases: [
        [10, '0', '1'],
        [20, '0', '1'],
      ],
      objectives: [{ direction }],
    });
    assert.deepEqual(
      nulls.cases.map((row) => [row.result, row.scores]),
      [
        [null, [null]],
        [null, [null]],
      ],
    );
    assert.deepEqual(nulls.front, [1, 2]);
    assert.deepEqual(verdicts(nulls), [
      [1, false, []],
      [2, false, []],
    ]);
  }

  // Each objective has its own type: a null objective ties, so the others decide.
  withResults(
    [
      { gap: null, cost: 3, ok: true, tag: 'b' },
      { gap: null, cost: 3, ok: false, tag: 'a' },
      { gap: null, cost: 4, ok: false, tag: 'b' },
    ],
    (pick) => {
      const report = pick([0, 1, 2], [min('/gap'), min('/cost'), max('/ok'), min('/tag')]);
      assert.deepEqual(
        report.cases.map((row) => row.scores),
        [
          [null, 3, true, 'b'],
          [null, 3, false, 'a'],
          [null, 4, false, 'b'],
        ],
      );
      assert.deepEqual(report.front, [1, 2]);
      assert.deepEqual(verdicts(report), [
        [1, false, []],
        [2, false, []],
        [3, true, [1, 2]],
      ]);
    },
  );
});

test('pareto selects nested paths and measures array, string and object lengths', () => {
  // outbound-loads lists full loads then the remainder: [4,4,2], [10], [6,4],
  // [5,5] and [4,4,4]. Objectives: fewest trips, then smallest first load.
  const loads = runPareto('haul', 'outbound-loads', {
    cases: [
      [10, 4],
      [10, 10],
      [10, 6],
      [10, 5],
      [12, 4],
    ],
    objectives: [min('', 'length'), min('/0')],
  });
  assert.deepEqual(loads.objectives, [
    { path: '', measure: 'length', direction: 'min' },
    { path: '/0', measure: 'value', direction: 'min' },
  ]);
  assert.deepEqual(
    loads.cases.map((row) => row.scores),
    [
      [3, 4],
      [1, 10],
      [2, 6],
      [2, 5],
      [3, 4],
    ],
  );
  // Only (2, 6) loses: (2, 5) has the same trips and a smaller load.
  assert.deepEqual(loads.front, [1, 2, 4, 5]);
  assert.deepEqual(verdicts(loads), [
    [1, false, []],
    [2, false, []],
    [3, true, [4]],
    [4, false, []],
    [5, false, []],
  ]);

  // "replace" has 7 characters and "repair" 6; repair costs are 20 and 2.
  const lengths = runPareto('durability', 'repair-or-replace', {
    cases: [
      [10, 2, 5],
      [1, 2, 5],
    ],
    objectives: [max('/choice', 'length'), min('/repairCost')],
  });
  assert.deepEqual(
    lengths.cases.map((row) => row.scores),
    [
      [7, 20],
      [6, 2],
    ],
  );
  assert.deepEqual(lengths.front, [1, 2]);
  const shorter = runPareto('durability', 'repair-or-replace', {
    cases: [
      [10, 2, 5],
      [1, 2, 5],
    ],
    objectives: [min('/choice', 'length'), min('/repairCost')],
  });
  assert.deepEqual(shorter.front, [2]);
  assert.deepEqual(verdicts(shorter), [
    [1, true, [2]],
    [2, false, []],
  ]);

  // Both results have the two keys packs and units; units are 8 and 9.
  const objects = runPareto('replenish', 'review-order', {
    cases: [
      [3, 10, 4],
      [2, 10, 3],
    ],
    objectives: [max('', 'length'), min('/units')],
  });
  assert.deepEqual(
    objects.cases.map((row) => row.scores),
    [
      [2, 8],
      [2, 9],
    ],
  );
  assert.deepEqual(verdicts(objects), [
    [1, false, []],
    [2, true, [1]],
  ]);

  // parallel-dispatch gives the third job to the first least-busy server: it
  // runs 2-6 after services 3 and 2, and 2-4 after services 2 and 2.
  const dispatch = runPareto('queueplan', 'parallel-dispatch', {
    cases: [
      ['3,2,4', 2],
      ['2,2,2', 2],
    ],
    objectives: [min('/2/finish'), min('/2/start')],
  });
  assert.deepEqual(
    dispatch.cases.map((row) => row.scores),
    [
      [6, 2],
      [4, 2],
    ],
  );
  assert.deepEqual(verdicts(dispatch), [
    [1, true, [2]],
    [2, false, []],
  ]);

  withResults(
    [
      { 'a/b': { '~key': [4, 'ab'] }, '': 1 },
      { 'a/b': { '~key': [2, 'abc'] }, '': 1 },
    ],
    (pick) => {
      const escaped = pick(
        [0, 1],
        [min('/a~1b/~0key/0'), min('/a~1b/~0key/1', 'length'), min('/'), max('/a~1b', 'length')],
      );
      assert.deepEqual(
        escaped.cases.map((row) => row.scores),
        [
          [4, 2, 1, 1],
          [2, 3, 1, 1],
        ],
      );
      assert.deepEqual(escaped.front, [1, 2]);
    },
  );
});

test('pareto accepts the case and objective limits and rejects one beyond', () => {
  const objective = { direction: 'min' };
  const boundary = runPareto('tunnel', 'excavate', {
    cases: Array.from({ length: 100 }, () => [2, 3, 4]),
    objectives: Array.from({ length: 10 }, () => objective),
  });
  assert.equal(boundary.total, 100);
  assert.equal(boundary.objectives.length, 10);
  assert.deepEqual(
    boundary.front,
    Array.from({ length: 100 }, (unused, index) => index + 1),
  );
  assert.ok(boundary.cases.every((row) => row.scores.length === 10 && row.dominated === false));
  assert.equal(runPareto('tunnel', 'excavate', { cases: [[2, 3, 4]], objectives: [objective] }).total, 1);
  assert.throws(
    () => runPareto('tunnel', 'excavate', { cases: Array(101).fill([2, 3, 4]), objectives: [objective] }),
    /^Error: Supply 1–100 argument-array cases\.$/,
  );
  assert.throws(
    () => runPareto('tunnel', 'excavate', { cases: [], objectives: [objective] }),
    /^Error: Supply 1–100 argument-array cases\.$/,
  );
  assert.throws(
    () => runPareto('tunnel', 'excavate', { cases: [[2, 3, 4]], objectives: Array(11).fill(objective) }),
    /^Error: Supply 1–10 objectives\.$/,
  );
  assert.throws(
    () => runPareto('tunnel', 'excavate', { cases: [[2, 3, 4]], objectives: [] }),
    /^Error: Supply 1–10 objectives\.$/,
  );
});

test('pareto rejects malformed requests and objectives with one short message each', () => {
  const base = { cases: [[3, 10, 4]], objectives: [{ path: '/units', direction: 'min' }] };
  const run = (request) => () => runPareto('replenish', 'review-order', request);
  assert.equal(run(base)().total, 1);

  for (const request of [undefined, null, [], 'text', 7])
    assert.throws(run(request), /^Error: Supply a JSON request object\.$/);
  assert.throws(run({ ...base, extra: 1 }), /^Error: Request contains an unknown field\.$/);
  assert.throws(run({ ...base, path: '/units' }), /^Error: Request contains an unknown field\.$/);
  assert.throws(run({ ...base, direction: 'min' }), /^Error: Request contains an unknown field\.$/);
  assert.throws(run({ objectives: base.objectives }), /^Error: Supply 1–100 argument-array cases\.$/);
  assert.throws(run({ ...base, cases: null }), /^Error: Supply 1–100 argument-array cases\.$/);
  assert.throws(run({ ...base, cases: { 0: [3, 10, 4] } }), /^Error: Supply 1–100 argument-array cases\.$/);
  assert.throws(run({ ...base, cases: ['3,10,4'] }), /^Error: Each case must be an argument array\.$/);
  assert.throws(run({ ...base, cases: [[3, 10, 4], { 0: 3 }] }), /^Error: Each case must be an argument array\.$/);
  // JSON has no holes, but a sparse JavaScript array is a missing case, not a skipped one.
  for (const sparse of [[, [3, 10, 4]], [[3, 10, 4], , [3, 10, 8]], Array(2)]) {
    assert.throws(run({ ...base, cases: sparse }), /^Error: Request must contain JSON values only\.$/);
    assert.throws(
      () => calculateStudy('pareto', 'replenish', 'review-order', { ...base, cases: sparse }),
      /^Error: Request must contain JSON values only\.$/,
    );
  }

  assert.throws(run({ cases: base.cases }), /^Error: Supply 1–10 objectives\.$/);
  for (const objectives of [null, {}, 'min', 1, true, { 0: { direction: 'min' } }]) {
    assert.throws(run({ ...base, objectives }), /^Error: Supply 1–10 objectives\.$/);
  }
  for (const objective of [null, [], [{ direction: 'min' }], 'min', 1, true]) {
    assert.throws(run({ ...base, objectives: [objective] }), /^Error: Each objective must be an object\.$/);
  }
  // A hole in a sparse objectives array is a missing objective, not a skipped one.
  for (const sparse of [[, { direction: 'min' }], [{ direction: 'min' }, , { direction: 'max' }], Array(2)]) {
    assert.throws(run({ ...base, objectives: sparse }), /^Error: Request must contain JSON values only\.$/);
    assert.throws(
      () => calculateStudy('pareto', 'replenish', 'review-order', { ...base, objectives: sparse }),
      /^Error: Request must contain JSON values only\.$/,
    );
  }
  for (const extra of [{ op: 'lte' }, { value: 8 }, { limit: 1 }, { index: 1 }]) {
    assert.throws(
      run({ ...base, objectives: [{ path: '/units', direction: 'min', ...extra }] }),
      /^Error: Request contains an unknown field\.$/,
    );
  }

  for (const path of [null, 5, true, ['units'], 'units', 'units/']) {
    assert.throws(
      run({ ...base, objectives: [{ path, direction: 'min' }] }),
      /^Error: Path must be a JSON Pointer/,
      String(path),
    );
  }
  for (const path of ['/bad~2', '/bad~', '/~']) {
    assert.throws(
      run({ ...base, objectives: [{ path, direction: 'min' }] }),
      /^Error: JSON Pointer escapes must be ~0 or ~1\.$/,
      path,
    );
  }
  for (const measure of [null, 5, 'mean', 'Length', 'count', '']) {
    assert.throws(
      run({ ...base, objectives: [{ path: '/units', measure, direction: 'min' }] }),
      /^Error: Measure must be value or length\.$/,
      String(measure),
    );
  }
  assert.throws(run({ ...base, objectives: [{ path: '/units' }] }), /^Error: Direction must be min or max\.$/);
  assert.throws(run({ ...base, objectives: [{}] }), /^Error: Direction must be min or max\.$/);
  for (const direction of [null, 1, true, 'asc', 'MIN', 'minimum', '']) {
    assert.throws(
      run({ ...base, objectives: [{ path: '/units', direction }] }),
      /^Error: Direction must be min or max\.$/,
      String(direction),
    );
  }

  // Values that are not plain JSON are refused wherever they appear.
  for (const objective of [
    { direction: 'min', path: undefined },
    { direction: 'min', measure: undefined },
    new Date(0),
    new (class Objective {
      direction = 'min';
    })(),
    { direction: 'min', path: new String('/units') },
  ]) {
    assert.throws(run({ ...base, objectives: [objective] }), /^Error: Request must contain JSON values only\.$/);
  }
  assert.throws(run({ ...base, cases: [[NaN, 10, 4]] }), /^Error: Request numbers must be finite\.$/);

  // An objective without a prototype is still a plain JSON object.
  const bare = Object.assign(Object.create(null), { path: '/units', direction: 'min' });
  assert.deepEqual(run({ ...base, objectives: [bare] })().objectives, [
    { path: '/units', measure: 'value', direction: 'min' },
  ]);
  // Defaults: the whole result, measured by value.
  assert.deepEqual(
    runPareto('tunnel', 'excavate', { cases: [[2, 3, 4]], objectives: [{ direction: 'max' }] }).objectives,
    [{ path: '', measure: 'value', direction: 'max' }],
  );
});

test('pareto rejects selections it cannot score and mixed score types', () => {
  const order = (path) => () =>
    runPareto('replenish', 'review-order', { cases: [[3, 10, 4]], objectives: [min(path)] });
  for (const path of ['/missing', '/units/missing', '/__proto__', '/constructor', '/toString', '/Units']) {
    assert.throws(order(path), /^Error: Result path does not exist in every result\.$/, path);
  }
  const loads = (path) => () => runPareto('haul', 'outbound-loads', { cases: [[10, 4]], objectives: [min(path)] });
  for (const path of ['/length', '/01', '/-1', '/1e0', '/-']) {
    assert.throws(loads(path), /^Error: Array paths require canonical zero-based indexes\.$/, path);
  }
  // [4, 4, 2] has indexes 0 to 2.
  assert.equal(loads('/2')().cases[0].scores[0], 2);
  assert.throws(loads('/3'), /^Error: Result path does not exist in every result\.$/);
  // An object or array needs a scalar path or the length measure; a number has no length.
  assert.throws(order(''), /^Error: Value selection requires a scalar or null; choose a path or length\.$/);
  assert.throws(loads(''), /^Error: Value selection requires a scalar or null; choose a path or length\.$/);
  assert.throws(
    () => runPareto('replenish', 'review-order', { cases: [[3, 10, 4]], objectives: [min('/units', 'length')] }),
    /^Error: Length requires a string, array, or object\.$/,
  );
  assert.throws(
    () => runPareto('replenish', 'stockout-period', { cases: [[10, '0', '1']], objectives: [min('', 'length')] }),
    /^Error: Length requires a string, array, or object\.$/,
  );

  // Stock 10 never runs out (null); stock 0 runs out in period 1.
  const mixed = /^Error: Objective scores must all have the same scalar type; null only matches null\.$/;
  for (const rows of [
    [
      [10, '0', '1'],
      [0, '0', '1'],
    ],
    [
      [0, '0', '1'],
      [10, '0', '1'],
    ],
    [
      [0, '0', '1'],
      [0, '0', '1'],
      [10, '0', '1'],
    ],
  ]) {
    assert.throws(() => runPareto('replenish', 'stockout-period', { cases: rows, objectives: [min()] }), mixed);
  }
  withResults(
    [
      { a: 1, b: 2 },
      { a: 2, b: '2' },
      { a: 3, b: true },
      { a: 4, b: null },
      { a: '1', b: 2 },
      { a: 5, b: 3 },
    ],
    (pick) => {
      assert.throws(() => pick([0, 1], [min('/a'), min('/b')]), mixed);
      assert.throws(() => pick([0, 2], [min('/a'), min('/b')]), mixed);
      assert.throws(() => pick([0, 3], [min('/a'), min('/b')]), mixed);
      assert.throws(() => pick([1, 2], [min('/a'), min('/b')]), mixed);
      assert.throws(() => pick([0, 4], [min('/a'), min('/b')]), mixed);
      // Only the last objective of the last case differs.
      assert.throws(() => pick([0, 5, 5, 3], [min('/a'), max('/a'), min('/b')]), mixed);
      assert.deepEqual(pick([0, 5], [min('/a'), min('/b')]).front, [1]);
    },
  );
});

test('pareto validates every objective before any case and fails atomically', () => {
  withResults([{ a: 1, b: 1 }, { a: 5 }, { a: 6, b: 'slow' }, { a: 0, b: 0 }], (pick, counter) => {
    // Objectives are checked first, so no planner call is made for these.
    for (const [objectives, message] of [
      [[min('/a'), { path: '/b' }], /^Error: Direction must be min or max\.$/],
      [[min('/a'), { path: 'b', direction: 'min' }], /^Error: Path must be a JSON Pointer/],
      [[min('/a'), min('/b', 'size')], /^Error: Measure must be value or length\.$/],
      [[min('/a'), { ...min('/b'), weight: 2 }], /^Error: Request contains an unknown field\.$/],
      [[min('/a'), null], /^Error: Each objective must be an object\.$/],
      [[min('/a'), , min('/b')], /^Error: Request must contain JSON values only\.$/],
      [Array(11).fill(min('/a')), /^Error: Supply 1–10 objectives\.$/],
    ]) {
      assert.throws(() => pick([0, 3], objectives), message);
    }
    assert.equal(counter.calls, 0);
    // An invalid objective is reported even when a case is also invalid.
    assert.throws(
      () =>
        runPareto('vector', 'pareto-pick', { cases: [[0], ['NaN']], objectives: [{ path: '/a', direction: 'up' }] }),
      /^Error: Direction must be min or max\.$/,
    );
    assert.equal(counter.calls, 0);
    // A missing case is a request shape error, found before the objectives and
    // before case 1 is evaluated.
    assert.throws(
      () => runPareto('vector', 'pareto-pick', { cases: [[0], , [3]], objectives: [{ path: '/a', direction: 'up' }] }),
      /^Error: Request must contain JSON values only\.$/,
    );
    assert.throws(
      () => runPareto('vector', 'pareto-pick', { cases: [[0], , [3]], objectives: [min('/a')] }),
      /^Error: Request must contain JSON values only\.$/,
    );
    assert.equal(counter.calls, 0);

    // Case 1 already beats case 2 on /a, but case 2's missing /b is still an error.
    assert.throws(() => pick([0, 1], [min('/a'), min('/b')]), /^Error: Result path does not exist in every result\.$/);
    // Likewise case 3 is behind on /a, but its text /b cannot be compared with numbers.
    assert.throws(
      () => pick([0, 2], [min('/a'), min('/b')]),
      /^Error: Objective scores must all have the same scalar type; null only matches null\.$/,
    );
    // The same holds when the invalid case comes after a complete front.
    assert.throws(
      () => pick([3, 0, 1], [min('/a'), min('/b')]),
      /^Error: Result path does not exist in every result\.$/,
    );
    // Without the faulty rows the study succeeds.
    assert.deepEqual(pick([0, 3], [min('/a'), min('/b')]).front, [2]);
  });

  // One invalid argument row among valid ones rejects the whole study.
  const objectives = [min('/packs'), min('/units')];
  for (const rows of [
    [
      ['NaN', 10, 4],
      [3, 10, 4],
      [3, 10, 8],
    ],
    [
      [3, 10, 4],
      [3, 10, 0],
      [3, 10, 8],
    ],
    [
      [3, 10, 4],
      [3, 10, 8],
      [3, -1, 4],
    ],
    [
      [3, 10, 4],
      [3, 10, 8],
      [3, 10],
    ],
    [
      [3, 10, 4],
      [3, 10, 8],
      [3, 10, 4, 1],
    ],
  ]) {
    assert.throws(() => runPareto('replenish', 'review-order', { cases: rows, objectives }));
    assert.throws(() => calculateStudy('pareto', 'replenish', 'review-order', { cases: rows, objectives }));
  }
  assert.throws(
    () =>
      runPareto('replenish', 'review-order', {
        cases: [
          [3, 10, 4],
          [3, 10, 8],
          ['NaN', 10, 4],
        ],
        objectives,
      }),
    /^Error: Numbers must be finite and within ±1,000,000\.$/,
  );
  assert.throws(
    () => runPareto('replenish', 'no-such-command', { cases: [[3, 10, 4]], objectives }),
    /^Error: Unknown replenish command: no-such-command\.$/,
  );
  assert.throws(
    () => runPareto('no-such-group', 'review-order', { cases: [[3, 10, 4]], objectives }),
    /^Error: Unknown planning group: no-such-group\.$/,
  );
});

test('pareto CLI accepts inline, file and stdin requests and produces no partial report on errors', async () => {
  const directory = await mkdtemp('.runtime-pareto-');
  const call = (source, input, group = 'replenish', command = 'review-order') =>
    spawnSync(
      process.execPath,
      ['src/cli.js', '--bridge', '.runtime/missing-pareto.json', 'study', 'pareto', group, command, source],
      { encoding: 'utf8', input },
    );
  try {
    const body = {
      cases: [
        [3, 10, 5],
        [3, 10, 8],
        [3, 10, 4],
        [3, 10, 1],
      ],
      objectives: [
        { path: '/packs', direction: 'min' },
        { path: '/units', direction: 'min' },
      ],
    };
    const request = JSON.stringify(body);
    const expected = calculateStudy('pareto', 'replenish', 'review-order', body);
    // A shortfall of 7 in packs of 5, 8, 4 and 1: (2, 10), (1, 8), (2, 8), (7, 7).
    const { note, plannerNote, ...data } = expected;
    assert.deepEqual(data, {
      workflow: 'pareto',
      group: 'replenish',
      command: 'review-order',
      objectives: [
        { path: '/packs', measure: 'value', direction: 'min' },
        { path: '/units', measure: 'value', direction: 'min' },
      ],
      total: 4,
      front: [2, 4],
      cases: [
        {
          case: 1,
          args: [3, 10, 5],
          result: { packs: 2, units: 10 },
          scores: [2, 10],
          dominated: true,
          dominatedBy: [2, 3],
        },
        {
          case: 2,
          args: [3, 10, 8],
          result: { packs: 1, units: 8 },
          scores: [1, 8],
          dominated: false,
          dominatedBy: [],
        },
        {
          case: 3,
          args: [3, 10, 4],
          result: { packs: 2, units: 8 },
          scores: [2, 8],
          dominated: true,
          dominatedBy: [2],
        },
        {
          case: 4,
          args: [3, 10, 1],
          result: { packs: 7, units: 7 },
          scores: [7, 7],
          dominated: false,
          dominatedBy: [],
        },
      ],
    });
    assert.match(note, /Offline/);
    assert.equal(typeof plannerNote, 'string');
    const filename = `${directory}/request.json`;
    await writeFile(filename, request);
    for (const [source, input] of [[request], [`@${filename}`], ['-', request]]) {
      const result = call(source, input);
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), expected);
    }

    // A nested array path: capacities 5, 7 and 9 leave shortages 3, 1 and 1
    // (stock 3 + 4 capped, minus 2, then a withdrawal of 6), so 9 buys nothing.
    const buffers = {
      cases: [
        [3, '4,0', '2,6', '5'],
        [3, '4,0', '2,6', '7'],
        [3, '4,0', '2,6', '9'],
      ],
      objectives: [
        { path: '/0/capacity', direction: 'min' },
        { path: '/0/shortage', direction: 'min' },
      ],
    };
    const nested = call(JSON.stringify(buffers), undefined, 'bufferplan', 'capacity-comparison');
    assert.equal(nested.status, 0, nested.stderr);
    const report = JSON.parse(nested.stdout);
    assert.deepEqual(report, calculateStudy('pareto', 'bufferplan', 'capacity-comparison', buffers));
    assert.deepEqual(
      report.cases.map((row) => row.scores),
      [
        [5, 3],
        [7, 1],
        [9, 1],
      ],
    );
    assert.deepEqual(report.front, [1, 2]);
    assert.deepEqual(
      report.cases.map((row) => row.dominatedBy),
      [[], [], [2]],
    );

    // The last case has a pack size of zero, which the planner rejects.
    const invalid = call(JSON.stringify({ ...body, cases: [...body.cases, [3, 10, 0]] }));
    assert.notEqual(invalid.status, 0);
    assert.equal(invalid.stdout, '');
    assert.match(invalid.stderr, /Error/);
    for (const [bad, message] of [
      [{ cases: body.cases }, /Error: Supply 1–10 objectives\./],
      [{ ...body, objectives: [{ path: '/packs' }] }, /Error: Direction must be min or max\./],
      [
        { ...body, objectives: [{ path: '/packs', direction: 'min', measure: 'mean' }] },
        /Error: Measure must be value or length\./,
      ],
      [
        { ...body, objectives: [{ path: '/packs', direction: 'min', value: 2 }] },
        /Error: Request contains an unknown field\./,
      ],
      [{ ...body, limit: 2 }, /Error: Request contains an unknown field\./],
      [
        { ...body, objectives: [{ path: '/missing', direction: 'min' }] },
        /Error: Result path does not exist in every result\./,
      ],
    ]) {
      const failed = call(JSON.stringify(bad));
      assert.notEqual(failed.status, 0);
      assert.equal(failed.stdout, '');
      assert.match(failed.stderr, message);
    }
    // Stock 10 never runs out (null) but stock 0 does in period 1.
    const mixed = call(
      JSON.stringify({
        cases: [
          [10, '0', '1'],
          [0, '0', '1'],
        ],
        objectives: [{ direction: 'min' }],
      }),
      undefined,
      'replenish',
      'stockout-period',
    );
    assert.notEqual(mixed.status, 0);
    assert.equal(mixed.stdout, '');
    assert.match(mixed.stderr, /Error: Objective scores must all have the same scalar type; null only matches null\./);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
