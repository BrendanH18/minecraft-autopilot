import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateOffline } from '../src/offline-kit.js';
import { scoreGroup } from '../src/planning-score.js';
import { testStudyWorkflows } from './planning-study-workflow-checks.js';

const cases = [
  ['retune-clicks', ['24,4,1', '0,4,24'], [1, 0, 23]],
  ['transpose-window', ['3,9,20'], { lowestShift: -3, highestShift: 4 }],
  ['octave-register', ['24,7,5', 6], [0, 7, 5]],
  ['mirror-melody', ['8,12,6', 10], [12, 8, 14]],
  ['scale-snap', ['4,6,9', '8,2,6'], [2, 6, 8]],
  ['interval-walk', [7, '3,-2,0'], [7, 10, 8, 8]],
  ['motif-starts', ['0,2,4,8,10', '5,7'], [1, 2, 4]],
  [
    'block-manifest',
    ['1,2,1,1', '3,3,7,3'],
    [
      { instrument: 1, pitch: 3, count: 2 },
      { instrument: 2, pitch: 3, count: 1 },
      { instrument: 1, pitch: 7, count: 1 },
    ],
  ],
  [
    'chord-frames',
    ['0,0,4', '3,8,9'],
    [
      { tick: 0, pitches: [3, 8] },
      { tick: 4, pitches: [9] },
    ],
  ],
  [
    'roll-chord',
    ['2,8,14', '3,1,2,1', 2],
    [
      { tick: 0, pitch: 14 },
      { tick: 2, pitch: 2 },
      { tick: 4, pitch: 8 },
      { tick: 6, pitch: 2 },
    ],
  ],
  ['lane-reuse', ['0,0,2,3,6', 3], [1, 2, 3, 1, 1]],
  ['step-onsets', [2, '2,3,5'], { ticks: [2, 4, 7], end: 12 }],
  [
    'bar-address',
    ['0,3,11,12', 3, 4],
    [
      { bar: 1, beat: 1, offset: 0 },
      { bar: 1, beat: 1, offset: 3 },
      { bar: 1, beat: 3, offset: 3 },
      { bar: 2, beat: 1, offset: 0 },
    ],
  ],
  ['quantize', ['0,2,4,5,7', 4], [0, 4, 4, 4, 8]],
  ['swing-pairs', ['0,4,4,8,12', 4, 1], [0, 5, 5, 8, 13]],
  ['ratchet-step', [6, 8, 3], [6, 8, 11]],
  ['pulse-mask', [8, 3, 1], [0, 1, 0, 0, 1, 0, 0, 1]],
  [
    'canon-entries',
    ['0,2', '4,7', '0,2'],
    [
      { tick: 0, voice: 1, pitch: 4 },
      { tick: 2, voice: 1, pitch: 7 },
      { tick: 2, voice: 2, pitch: 4 },
      { tick: 4, voice: 2, pitch: 7 },
    ],
  ],
  [
    'reverse-phrase',
    ['0,0,4', '6,9,12', 6],
    [
      { tick: 1, pitch: 12 },
      { tick: 5, pitch: 6 },
      { tick: 5, pitch: 9 },
    ],
  ],
  [
    'section-cut',
    ['0,3,5,6', '0,4,6,8', 3, 6],
    [
      { tick: 0, pitch: 4 },
      { tick: 2, pitch: 6 },
    ],
  ],
  ['repeat-seam', ['2,5,11', 12, 4], { gap: 3, missing: 1 }],
  [
    'repeater-chain',
    ['0,3,8,10'],
    [
      { fourTick: 0, tailTicks: 0 },
      { fourTick: 0, tailTicks: 3 },
      { fourTick: 2, tailTicks: 0 },
      { fourTick: 2, tailTicks: 2 },
    ],
  ],
  ['branch-alignment', ['3,9,2'], [6, 0, 7]],
  ['tempo-fit', [120, 2], { ticks: 3, effectiveBpm: 100 }],
  ['section-cues', ['2,1,4', '4,3,2', '5,4,3'], [0, 40, 52, 76]],
];

test('every note-score planner has a distinct verified calculation', () => {
  assert.equal(new Set(cases.map(([name]) => name)).size, 25);
  assert.deepEqual(
    scoreGroup.commands.map(({ signature }) => signature.split(' ')[0]),
    cases.map(([name]) => name),
  );
});

for (const [command, args, expected] of cases) {
  testStudyWorkflows(scoreGroup.name, command, args, expected);
  test(`note-score ${command}`, () => assert.deepEqual(calculateOffline(scoreGroup, command, args).result, expected));
}

test('score edits reject invalid tunings, clocks, and oversized arrangements', () => {
  for (const [command, args] of [
    ['retune-clicks', ['25', '0']],
    ['interval-walk', [0, '-1']],
    ['interval-walk', [5, '0.5']],
    ['interval-walk', [5, '1e-20']],
    ['chord-frames', ['1,0', '4,7']],
    ['section-cut', ['0,1', '5', 0, 2]],
    ['roll-chord', ['2', '2', 1]],
    ['swing-pairs', ['0,3', 2, 1]],
    ['swing-pairs', ['0', 2, 2]],
    ['ratchet-step', [0, 3, 4]],
    ['repeat-seam', ['0,8', 8, 1]],
    ['pulse-mask', [4, 5, 1]],
    ['pulse-mask', [1001, 1, 0]],
    ['canon-entries', [Array(40).fill(0).join(','), Array(40).fill(1).join(','), Array(40).fill(0).join(',')]],
    ['section-cues', ['1000000', '1000000', '1000000']],
  ])
    assert.throws(() => calculateOffline(scoreGroup, command, args), Error, command);
});

test('score boundary cases retain unisons and silent sections', () => {
  const run = (command, args) => calculateOffline(scoreGroup, command, args).result;
  assert.deepEqual(run('transpose-window', ['0,24']), { lowestShift: 0, highestShift: 0 });
  assert.deepEqual(run('motif-starts', ['1,1', '4']), [1, 2]);
  assert.deepEqual(run('section-cut', ['0,1', '0,4', 1, 1]), []);
  assert.deepEqual(run('pulse-mask', [3, 0, 100]), [0, 0, 0]);
  assert.deepEqual(run('pulse-mask', [3, 3, 100]), [1, 1, 1]);
  assert.deepEqual(run('tempo-fit', [600, 16]), { ticks: 1, effectiveBpm: 37.5 });
});
