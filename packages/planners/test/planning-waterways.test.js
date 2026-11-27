import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { testStudyWorkflows } from './planning-study-workflow-checks.js';
import { calculateOffline } from '../src/offline-kit.js';
import { WATERWAY_GROUPS } from '../src/planning-waterways.js';
import { waterwayCases as cases } from '../src/planning-examples-waterways.js';

const calculate = (name, command, ...args) =>
  calculateOffline(
    WATERWAY_GROUPS.find((group) => group.name === name),
    command,
    args,
  ).result;

test('waterway planners have 50 unique documented commands with expected-output cases', () => {
  assert.deepEqual(
    WATERWAY_GROUPS.map(({ name }) => name),
    Object.keys(cases),
  );
  const docs = readFileSync(new URL('../docs/PLANNING-WATERWAYS.md', import.meta.url), 'utf8');
  for (const { name, commands } of WATERWAY_GROUPS) {
    assert.equal(commands.length, 25);
    const documented = docs.split(`### ${name}\n`)[1].split('\n### ')[0];
    const signatures = [...documented.matchAll(/^\| `(.*?)` \|/gm)].map((match) => match[1]);
    const names = commands.map(({ signature }) => signature.split(' ')[0]);
    assert.equal(new Set(names).size, 25);
    assert.deepEqual(
      names,
      cases[name].map(([command]) => command),
    );
    assert.deepEqual(
      signatures,
      commands.map(({ signature }) => signature),
    );
  }
});

for (const [group, checks] of Object.entries(cases)) {
  for (const [command, args, expected] of checks) {
    testStudyWorkflows(group, command, args, expected);
    test(`${group} ${command} gives the documented arithmetic`, () => {
      assert.deepEqual(calculate(group, command, ...args), expected);
      assert.throws(() => calculate(group, command), /exactly the documented arguments/);
    });
  }
}

test('sponge planning rejects inconsistent sections and protects exact fits', () => {
  const run = (command, ...args) => calculate('sponge-plan', command, ...args);
  assert.throws(() => run('section-at', 4, 4, 2, 2, 1, 3), /outside the grid/);
  assert.throws(() => run('divider-gates', 7, 6, '2,3', 5, 3), /do not fit/);
  assert.throws(() => run('divider-gates', 7, 4, '2,3', 5, 2), /taller than the wall/);
  assert.throws(() => run('barrier-kit', '4,4', '0,5', 20), /reclaim more/);
  assert.throws(() => run('temporary-fill', '5,4', '0,6', 1), /fit inside/);
  assert.throws(() => run('wet-checkpoints', 0, '1', '1,1', '0'), /equal lengths/);
  assert.throws(() => run('stage-depth', 14, 5, 4), /below the excavation floor/);
  assert.throws(() => run('seal-survey', '3', '1.5', 1), /between zero and one/);
  assert.equal(run('staging-stock', 2, 0.1, 0.3, 0), 6);
  assert.equal(run('pump-crew', 0.3, 0, 0.1, 0, 1), 3);
  assert.equal(run('pump-crew', 24, 2, 4, 5, 5), null);
  assert.equal(run('pump-outage', 24, 6, 2, 6, 2), 6);
  assert.equal(run('pump-handoff', 24, 2, 6, 6, 0), 6);
  assert.equal(run('pump-handoff', 24, 2, 4, 1, 2), null);
  assert.deepEqual(run('reuse-shifts', 9, 3, 0, 1000000), { elapsed: 1, placed: 3, remaining: 6, clean: 0, wet: 3 });
  assert.deepEqual(run('breach-level', 4, 2, 7, 2), { waterDepth: 2, moved: 0, direction: null });
  assert.deepEqual(run('dry-first', '1,1,3', '0,0,4', 4, 0, 0.5), { completed: [1, 2], used: 0.5 });
});

test('ice-road planning handles malformed geometry, edge coverage, and blocked schedules', () => {
  const run = (command, ...args) => calculate('ice-road', command, ...args);
  assert.throws(() => run('turn-mix', '[[0,0]]'), /at least two/);
  assert.throws(() => run('turn-mix', '[[0,0],[0,0]]'), /nonzero axis-aligned/);
  assert.throws(() => run('turn-mix', '[[0,0],[1,1]]'), /axis-aligned/);
  assert.throws(() => run('turn-mix', '[[0,0],[0.5,0]]'), /whole block coordinates/);
  assert.throws(() => run('gap-crossings', 8, '[[0,9]]', 1, 2), /inside the road/);
  assert.throws(() => run('station-coverage', 20, '3,21', 2), /inside the road/);
  assert.throws(() => run('switchyard-deck', 8, 2, 3, 1, '3,6'), /must fit/);
  assert.throws(() => run('station-platform', 15, 2, 1, 3), /1 or 2/);
  assert.throws(() => run('directional-trip', '8,6', '4', '2,6', 1, 2), /equal lengths/);
  assert.deepEqual(run('curve-clearance', '[[0,0],[2,0],[3,0],[3,1]]', 1, 3), { straightRuns: [2, 0], fits: true });
  assert.deepEqual(run('turn-mix', '[[0,0],[0,1],[1,1]]'), { left: 1, right: 0, reverse: 0, straight: 0 });
  assert.deepEqual(run('station-coverage', 20, '0,10,20', 5), { covered: [[0, 20]], uncoveredLength: 0 });
  assert.deepEqual(run('neighboring-spurs', 20, '2,7,7', 7), {
    behind: { spur: 2, distance: 0 },
    ahead: { spur: 2, distance: 0 },
  });
  assert.equal(run('passing-bays', 20, 5, 6, 2), null);
  assert.equal(run('material-budget', 1, 0, 1, 0), null);
  assert.equal(run('material-budget', 1, 1, 1, 0), 0);
  assert.equal(run('transfer-window', 12, 3, 1, '3,4.9', 18, 3), null);
  assert.deepEqual(run('alternate-window', 12, 4, 3, 1, 0), { outbound: 0, inbound: 0 });
  assert.deepEqual(run('launch-headway', 10, '2,10,2', 15), [0, 5, 6]);
});
