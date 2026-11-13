import test from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { OPERATION_GROUPS } from '../src/planning-operations.js';
import { OPERATION_CASES } from './planning-operations-cases.js';
import { calculateOffline, registerOfflineGroups } from '../src/offline-kit.js';

function close(actual, expected) {
  if (typeof expected === 'number') {
    assert.equal(typeof actual, 'number');
    assert.ok(Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
  } else if (expected && typeof expected === 'object') {
    assert.deepEqual(Object.keys(actual), Object.keys(expected));
    for (const k of Object.keys(expected)) close(actual[k], expected[k]);
  } else assert.equal(actual, expected);
}
const calculation = (group, command, args) => calculateOffline(OPERATION_GROUPS.find(g => g.name === group), command, args).result;

test('operation inventory contains 100 unique documented callable behaviors', () => {
  assert.equal(OPERATION_GROUPS.length, 4);
  assert.equal(OPERATION_CASES.length, 100);
  assert.equal(new Set(OPERATION_CASES.map(([g, c]) => `${g}/${c}`)).size, 100);
  for (const group of OPERATION_GROUPS) {
    assert.equal(group.commands.length, 25, group.name);
    assert.equal(new Set(group.commands.map(c => c.signature.split(' ')[0])).size, 25, group.name);
    assert.deepEqual(group.commands.map(c => c.signature.split(' ')[0]), OPERATION_CASES.filter(([g]) => g === group.name).map(([, c]) => c));
    assert.match(group.note, /^Offline/);
  }
});

for (const [groupName, command, args, expected] of OPERATION_CASES) {
  test(`${groupName} ${command}: expected arithmetic and Commander output`, async () => {
    const group = OPERATION_GROUPS.find(g => g.name === groupName);
    const before = JSON.stringify(args);
    const result = calculateOffline(group, command, args);
    close(result.result, expected);
    assert.match(result.note, /Offline/);
    const program = new Command().exitOverride();
    let printed;
    registerOfflineGroups(program, [group], { print: v => { printed = v; } });
    await program.parseAsync([groupName, command, ...args], { from: 'user' });
    close(printed.result, expected);
    assert.throws(() => calculateOffline(group, command, []));
    assert.throws(() => calculateOffline(group, command, args.map((v, i) => i ? v : 'NaN')));
    assert.equal(JSON.stringify(args), before);
  });
}

// Focused boundary and rejection tests for each group follow.

test('stripmine: rejections for impossible layouts and unbounded requests', () => {
  const run = (command, ...args) => calculation('stripmine', command, args);
  // Sides must be 1 or 2 wherever a side count is taken.
  assert.throws(() => run('branch-count', '41', '3', '2', '5', '3'), /Sides must be 1 or 2/);
  assert.throws(() => run('comb-footprint', '6', '3', '2', '5', '20', '3', '3'), /Sides must be 1 or 2/);
  assert.throws(() => run('poke-holes', '30', '4', '3', '3', '2'), /Sides must be 1 or 2/);
  assert.throws(() => run('parallel-combs', '200', '3', '20', '3', '4'), /Sides must be 1 or 2/);
  assert.throws(() => run('corridor-overhead', '3', '2', '5', '20', '3'), /Sides must be 1 or 2/);
  assert.throws(() => run('branch-length-for-overhead', '3', '2', '5', '3', '0.15'), /Sides must be 1 or 2/);
  assert.throws(() => run('branch-count', '41', '3', '2', '5', '0'));
  // A lead may equal the corridor length but not exceed it.
  assert.equal(run('branch-count', '41', '41', '2', '5', '2'), 0);
  assert.throws(() => run('branch-count', '41', '42', '2', '5', '2'), /Lead cannot exceed/);
  // The larger side (half the branches, rounded up) fills at most one wall: 10 x 4 = 40, but 11 x 4 = 44.
  assert.equal(run('comb-cells', '40', '2', '3', '20', '4', '5').branchCells, 1200);
  assert.throws(() => run('comb-cells', '40', '2', '3', '21', '4', '5'), /Branch mouths/);
  // comb-faces also keeps one solid cell between neighbors: 8 x 4 + 7 = 39 fits a 39-cell wall, not 38.
  // wallFaces = 2 x 3 x 39 + 2 x 3 + 2 x 16 x 3 x 5 = 234 + 6 + 480 = 720.
  assert.equal(run('comb-faces', '39', '2', '3', '16', '4', '5').wallFaces, 720);
  assert.throws(() => run('comb-faces', '38', '2', '3', '16', '4', '5'), /Branch mouths/);
  assert.throws(() => run('comb-faces', '40', '2', '3', '20', '4', '5'), /Branch mouths/);
  // Zero targets have no finite answer.
  assert.throws(() => run('widest-gap', '2', '2', '2', '0'), /Target chance must be positive/);
  assert.throws(() => run('branch-length-for-overhead', '3', '2', '5', '2', '0'), /Target fraction must be positive/);
  assert.throws(() => run('widest-gap', '2', '2', '2', '1.5'));
  // Stagger stays inside one pitch, and the enumerated block is capped at 1,000,000 cells.
  assert.equal(run('stacked-coverage', '2', '5', '3', '1', '1', '2', '6'), run('stacked-coverage', '2', '5', '3', '1', '1', '2', '1'));
  assert.throws(() => run('stacked-coverage', '2', '5', '3', '1', '1', '2', '7'), /Stagger must be smaller/);
  assert.equal(run('stacked-coverage', '1', '999', '1', '499', '0', '0', '0'), 0.000002);
  assert.throws(() => run('stacked-coverage', '1', '999', '1', '500', '0', '0', '0'), /limited to 1,000,000 cells/);
  // Oversize lists and counts are refused rather than truncated.
  assert.equal(run('branch-starts', '1000', '0', '1', '0').length, 1000);
  assert.throws(() => run('branch-starts', '1001', '0', '1', '0'), /1000 entries/);
  assert.throws(() => run('layer-plan', '1001', '2', '3', '1', '4'), /1000 entries/);
  assert.throws(() => run('branches-in-time', '1000000', '0.000000000001', '0', '0'), /too many branches/);
});

test('stripmine: boundaries at exact fits, zero quantities, and smallest sizes', () => {
  const run = (command, ...args) => calculation('stripmine', command, args);
  // Six branches of width 2 with gaps of 5 after a lead of 3 end exactly at cell 40.
  assert.equal(run('branch-count', '40', '3', '2', '5', '1'), 6);
  assert.equal(run('branch-count', '39', '3', '2', '5', '1'), 5);
  assert.equal(run('branch-count', '4', '3', '2', '5', '2'), 0);
  assert.equal(run('branch-count', '1', '0', '1', '0', '1'), 1);
  assert.deepEqual(run('comb-cells', '1', '1', '1', '0', '1', '1'), { corridorCells: 1, branchCells: 0, totalCells: 1 });
  // A lone corridor cell open at the entrance: floor, ceiling, two sides, far end.
  assert.deepEqual(run('comb-faces', '1', '1', '1', '0', '1', '1'), { floorFaces: 1, ceilingFaces: 1, wallFaces: 3, totalFaces: 5 });
  // Touching branches (gap 0) merge: only the two outer walls reveal anything sideways.
  assert.deepEqual(run('comb-reveal', '5', '2', '3', '30', '0', '4', '0'), { sideCells: 720, verticalCells: 0, totalCells: 720 });
  assert.equal(run('pitch-efficiency', '2', '3', '0', '4', '0'), 0);
  assert.deepEqual(run('layer-coverage', '3', '0', '2'), { dugFraction: 1, revealedFraction: 0, unseenFraction: 0 });
  // Gap equal to two reveals is fully seen; one more cell leaves a strip.
  assert.equal(run('layer-coverage', '2', '4', '2').unseenFraction, 0);
  close(run('layer-coverage', '2', '5', '2').unseenFraction, 1 / 7);
  assert.equal(run('vein-hit-chance', '2', '4', '2', '1'), 1);
  assert.equal(run('vein-hit-chance', '2', '7', '2', '4'), 1);
  assert.equal(run('widest-gap', '2', '2', '1', '1'), 4);
  // No vertical gap and gaps within two side reveals observe everything.
  assert.equal(run('stacked-coverage', '1', '2', '2', '0', '1', '0', '0'), 1);
  assert.deepEqual(run('layer-plan', '1', '2', '0', '1', '0'), [{ layer: 1, floorOffset: 0, alongShift: 0 }]);
  assert.equal(run('expected-finds', '0', '0', '0.5'), 0);
  assert.equal(run('cells-for-finds', '0', '0.004', '3.5'), 0);
  // 0.9 / 0.3 is 3.0000000000000004 in floating point; roundoff must not add a cell.
  assert.equal(run('cells-for-finds', '0.9', '0.3', '0'), 3);
  assert.equal(run('find-rate', '1.6', '3.5', '0', '3600'), 0);
  // Branch one is 23 steps from the entrance.
  assert.equal(run('branches-within-walk', '23', '3', '2', '5', '20'), 1);
  assert.equal(run('branches-within-walk', '22.9', '3', '2', '5', '20'), 0);
  assert.equal(run('branches-within-walk', '0', '0', '1', '0', '1'), 0);
  assert.equal(run('branch-time', '2', '3', '30', '0', '0'), 0);
  // Eight branches cost exactly 988; three steps of 0.1 fit 0.3 despite roundoff.
  assert.equal(run('branches-in-time', '988', '97.5', '12', '4'), 8);
  assert.equal(run('branches-in-time', '987.9', '97.5', '12', '4'), 7);
  assert.equal(run('branches-in-time', '0', '97.5', '12', '4'), 0);
  assert.equal(run('branches-in-time', '0.3', '0.1', '0', '0'), 3);
  assert.deepEqual(run('poke-holes', '3', '4', '3', '2', '2'), { holes: 0, dugCells: 0, revealedCells: 0 });
  assert.deepEqual(run('poke-holes', '4', '4', '3', '1', '0'), { holes: 1, dugCells: 3, revealedCells: 0 });
  assert.deepEqual(run('stair-shaft', '24', '3', '2', '4'), { steps: 8, cells: 112 });
  assert.deepEqual(run('stair-shaft', '1', '5', '1', '1'), { steps: 1, cells: 2 });
  // One comb is 43 wide; two need 43 + 4 + 43 = 90.
  assert.deepEqual(run('parallel-combs', '42', '3', '20', '2', '4'), { spacing: 47, combs: 0, usedWidth: 0 });
  assert.deepEqual(run('parallel-combs', '43', '3', '20', '2', '4'), { spacing: 47, combs: 1, usedWidth: 43 });
  assert.equal(run('parallel-combs', '89', '3', '20', '2', '4').combs, 1);
  assert.equal(run('parallel-combs', '90', '3', '20', '2', '4').combs, 2);
  assert.equal(run('branch-length-for-overhead', '3', '2', '5', '2', '1'), 1);
  // 10 / (10 + 2 x 20) is exactly one fifth, so length 20 already meets 0.2.
  assert.equal(run('branch-length-for-overhead', '2', '1', '4', '2', '0.2'), 20);
});

test('stripmine: cross-command invariants', () => {
  const run = (command, ...args) => calculation('stripmine', command, args);
  // Fractions of a pitch sum to one, and the seen share is the one-cell vein hit chance.
  for (const [width, gap, reveal] of [['2', '7', '2'], ['1', '3', '1'], ['3', '11', '4'], ['2', '3', '5']]) {
    const { dugFraction, revealedFraction, unseenFraction } = run('layer-coverage', width, gap, reveal);
    close(dugFraction + revealedFraction + unseenFraction, 1);
    close(run('vein-hit-chance', width, gap, reveal, '1'), dugFraction + revealedFraction);
  }
  // The widest gap meets its target and one more cell of gap misses it.
  for (const [width, reveal, extent, target] of [['2', '2', '2', '0.75'], ['1', '1', '3', '0.6'], ['3', '0', '1', '0.4'], ['2', '4', '5', '0.95']]) {
    const gap = run('widest-gap', width, reveal, extent, target);
    assert.ok(run('vein-hit-chance', width, String(gap), reveal, extent) >= Number(target));
    assert.ok(run('vein-hit-chance', width, String(gap + 1), reveal, extent) < Number(target));
  }
  // Excavation parts sum to the whole, and floor plus ceiling plus wall faces sum to the total.
  const cells = run('comb-cells', '41', '2', '3', '11', '4', '20'), faces = run('comb-faces', '41', '2', '3', '11', '4', '20');
  assert.equal(cells.corridorCells + cells.branchCells, cells.totalCells);
  assert.equal(faces.floorFaces + faces.ceilingFaces + faces.wallFaces, faces.totalFaces);
  // Each added interior branch reveals pitch-efficiency cells per cell it digs (2 x 3 x 30 = 180).
  const more = run('comb-reveal', '6', '2', '3', '30', '5', '4', '1').totalCells - run('comb-reveal', '5', '2', '3', '30', '5', '4', '1').totalCells;
  close(more / 180, run('pitch-efficiency', '2', '3', '5', '4', '1'));
  // Branch starts agree with the footprint and with the count that fits that footprint.
  const starts = run('branch-starts', '6', '3', '2', '5'), footprint = run('comb-footprint', '6', '3', '2', '5', '20', '3', '1');
  assert.equal(starts.at(-1) + 2 - 1, footprint.alongCells);
  assert.equal(run('branch-count', String(footprint.alongCells), '3', '2', '5', '1'), 6);
  assert.equal(run('parallel-combs', '500', '3', '20', '1', '4').spacing, footprint.acrossCells + 4);
  // Haul walking is the sum of round trips over the return distances.
  let sumOfReturns = 0;
  for (let index = 1; index <= 7; index++) sumOfReturns += run('return-distance', String(index), '3', '2', '5', '20');
  const walk = run('haul-walk', '7', '3', '2', '5', '20', '3');
  assert.equal(walk.totalWalk, 2 * 3 * sumOfReturns);
  close(walk.meanReturn, sumOfReturns / 7);
  assert.equal(run('branches-within-walk', String(run('return-distance', '7', '3', '2', '5', '20')), '3', '2', '5', '20'), 7);
  // Without vertical reveal, stacked coverage is the seen share of a layer times the dug share of the height.
  const layer = run('layer-coverage', '2', '7', '2');
  close(run('stacked-coverage', '2', '7', '3', '1', '2', '0', '4'), (layer.dugFraction + layer.revealedFraction) * 3 / 4);
  assert.equal(run('layer-plan', '4', '3', '1', '2', '7')[3].alongShift, 4);
  // The shortest branch for a target overhead meets it and one cell less does not.
  const shortest = run('branch-length-for-overhead', '3', '2', '5', '2', '0.15');
  assert.ok(run('corridor-overhead', '3', '2', '5', String(shortest), '2') <= 0.15);
  assert.ok(run('corridor-overhead', '3', '2', '5', String(shortest - 1), '2') > 0.15);
  // A branch count from a time budget is consistent with the per-branch time.
  const each = run('branch-time', '2', '3', '30', '1.5', '0.25');
  assert.equal(run('branches-in-time', String(each * 5), String(each), '0', '0'), 5);
  // Finds found by digging the required cells reach the target; one cell fewer falls short.
  const needed = run('cells-for-finds', '10', '0.004', '3.5');
  assert.ok(needed * 4.5 * 0.004 >= 10 && (needed - 1) * 4.5 * 0.004 < 10);
  close(run('find-rate', '1.6', '3.5', '0.004', '3600'), run('expected-finds', '2250', '7875', '0.004'));
});

test('herd: rejections for impossible plans and unbounded projections', () => {
  const run = (command, ...args) => calculation('herd', command, args);
  // One adult breeds nothing forever, so a feed budget would never run out.
  assert.throws(() => run('feed-budget-cycles', '1', '2', '1', '10', '0.75'), /At least two adults/);
  // One pair per cycle with offspring that never mature in time: 1,000,000 cycles is the last accepted count.
  assert.deepEqual(run('feed-budget-cycles', '2', '1', '1000000', '500000', '0.5'), { cycles: 1000000, pairings: 1000000, feedUsed: 500000, herd: 1000002 });
  assert.throws(() => run('feed-budget-cycles', '2', '1', '1000000', '1000000', '0.5'), /limited to 1,000,000 cycles/);
  assert.throws(() => run('feed-budget-cycles', '1000000', '1000000', '0', '1000000', '0.000001'), /1,000,000,000,000 animals/);
  // Founder searches stop at 1,000 cycles; two adults with one offspring per pair pass five quickly.
  assert.equal(run('founders-for-target', '5', '1', '0', '1000'), 2);
  assert.throws(() => run('founders-for-target', '5', '1', '0', '1001'), /limited to 1,000 cycles/);
  // A pen may start full but not overfull.
  assert.deepEqual(run('fill-pen', '52', '3', '2', '52'), { cycles: 0, herd: 52, spare: 0 });
  assert.throws(() => run('fill-pen', '53', '3', '2', '52'), /cannot exceed the capacity/);
  // Two breeders are one pair: 3 births per cycle reach 50 after 17 cycles with one to spare.
  assert.deepEqual(run('harvest-interval', '50', '2', '3', '8'), { cycles: 17, interval: 136, surplus: 1 });
  assert.throws(() => run('harvest-interval', '50', '1', '3', '8'), /At least two breeders/);
  assert.throws(() => run('mixed-feed', '7,12', '2.5'), /equal lengths/);
  // 1,000,000 adults with 1,000,000 offspring per pair: 500,001,000,000 after one cycle, far too many after two.
  assert.deepEqual(run('growth-curve', '1000000', '1000000', '0', '1'), [500001000000]);
  assert.throws(() => run('growth-curve', '1000000', '1000000', '0', '2'), /1,000,000,000,000 animals/);
  assert.throws(() => run('age-split', '1000000', '1000000', '0', '2'), /1,000,000,000,000 animals/);
  assert.deepEqual(run('cull-schedule', '1000000', '1000000', '5', '1000000', '1'), [0]);
  assert.throws(() => run('cull-schedule', '1000000', '1000000', '5', '1000000', '2'), /1,000,000,000,000 animals/);
  // Oversize lists are refused rather than truncated.
  assert.throws(() => run('growth-curve', '5', '3', '2', '1001'), /1000 entries/);
  assert.throws(() => run('cull-schedule', '5', '3', '2', '8', '1001'), /1000 entries/);
  assert.equal(run('pen-split', '1000', '1').length, 1000);
  assert.throws(() => run('pen-split', '1001', '1'), /1000 entries/);
  // Argument types reject meaningless values before any arithmetic.
  assert.throws(() => run('fed-round', '37', '31', '0', '3'), /positive/);
  assert.throws(() => run('pen-capacity', '9', '14', '1.5', '2.5'), /between zero and one/);
  assert.throws(() => run('breeding-round', '2.5', '3', '1'), /whole number/);
  assert.throws(() => run('min-perimeter-pen', '0', '2.5'), /positive/);
  assert.throws(() => run('feed-to-target', '5', '3', '2', '0', '1'), /positive/);
  assert.throws(() => run('growth-factor', '0', '1'), /positive/);
});

test('herd: boundaries at zero quantities, exact multiples, and smallest sizes', () => {
  const run = (command, ...args) => calculation('herd', command, args);
  assert.deepEqual(run('breeding-round', '0', '3', '2.5'), { pairs: 0, unpaired: 0, offspring: 0, feed: 0 });
  assert.deepEqual(run('breeding-round', '1', '3', '2.5'), { pairs: 0, unpaired: 1, offspring: 0, feed: 0 });
  assert.deepEqual(run('breeding-round', '2', '3', '2.5'), { pairs: 1, unpaired: 0, offspring: 3, feed: 2.5 });
  // Feed for exactly twelve pairs, a little less, none, and more than the adults can use.
  assert.equal(run('fed-round', '37', '30', '2.5', '3').pairs, 12);
  assert.equal(run('fed-round', '37', '29.9', '2.5', '3').pairs, 11);
  assert.deepEqual(run('fed-round', '6', '0', '0.1', '2'), { pairs: 0, offspring: 0, feedUsed: 0, idleAdults: 6 });
  assert.deepEqual(run('fed-round', '4', '1000', '2.5', '3'), { pairs: 2, offspring: 6, feedUsed: 5, idleAdults: 0 });
  // 0.3 / 0.1 is 2.9999999999999996 in floating point; roundoff must not drop a pair.
  assert.equal(run('fed-round', '6', '0.3', '0.1', '2').pairs, 3);
  // The herd is 62 at the end of cycle five and 95 at the end of cycle six; cycles one to six
  // breed 2, 2, 2, 5, 8, and 11 pairs from 5, 5, 5, 11, 17, and 23 adults.
  assert.deepEqual(run('feed-to-target', '5', '3', '2', '62', '1'), { cycles: 5, pairings: 19, feed: 19, herd: 62 });
  assert.deepEqual(run('feed-to-target', '5', '3', '2', '63', '1'), { cycles: 6, pairings: 30, feed: 30, herd: 95 });
  assert.equal(run('feed-to-target', '5', '3', '2', '5', '1').cycles, 0);
  assert.deepEqual(run('feed-to-target', '2', '1', '0', '3', '1'), { cycles: 1, pairings: 1, feed: 1, herd: 3 });
  assert.equal(run('feed-to-target', '1', '3', '2', '1', '1').cycles, 0);
  assert.equal(run('feed-to-target', '0', '3', '2', '1', '1'), null);
  assert.equal(run('feed-to-target', '1', '3', '2', '2', '1.5'), null);
  assert.deepEqual(run('feed-to-target', '5', '3', '2', '4', '1.5'), { cycles: 0, pairings: 0, feed: 0, herd: 5 });
  // Six adults breed 3, 3, 6, 9 pairs: a budget for exactly twelve pairings covers three cycles.
  assert.deepEqual(run('feed-budget-cycles', '6', '2', '1', '9', '0.75'), { cycles: 3, pairings: 12, feedUsed: 9, herd: 30 });
  assert.deepEqual(run('feed-budget-cycles', '6', '2', '1', '8.99', '0.75'), { cycles: 2, pairings: 6, feedUsed: 4.5, herd: 18 });
  assert.deepEqual(run('feed-budget-cycles', '6', '2', '1', '0', '0.75'), { cycles: 0, pairings: 0, feedUsed: 0, herd: 6 });
  close(run('feed-budget-cycles', '6', '2', '1', '0.3', '0.1'), { cycles: 1, pairings: 3, feedUsed: 0.3, herd: 12 });
  // Offspring born at a breeding instant can breed at the next one when they mature within one cooldown.
  assert.equal(run('delay-cycles', '0', '5'), 0);
  assert.equal(run('delay-cycles', '5', '5'), 0);
  assert.equal(run('delay-cycles', '5.1', '5'), 1);
  assert.equal(run('delay-cycles', '20', '5'), 3);
  assert.equal(run('delay-cycles', '20.1', '5'), 4);
  assert.equal(run('delay-cycles', '0.3', '0.1'), 2);
  // Without a delay the factor is one plus half the offspring; x = 2 solves x^2 - x = 2 and x^3 - x^2 = 4.
  assert.equal(run('growth-factor', '3', '0'), 2.5);
  assert.equal(run('growth-factor', '1', '0'), 1.5);
  close(run('growth-factor', '4', '1'), 2);
  close(run('growth-factor', '8', '2'), 2);
  assert.deepEqual(run('age-split', '7', '2', '1', '0'), { adults: 7, juveniles: 0, herd: 7 });
  assert.deepEqual(run('age-split', '5', '3', '2', '5'), { adults: 23, juveniles: 39, herd: 62 });
  assert.deepEqual(run('age-split', '1', '2', '1', '1000000'), { adults: 1, juveniles: 0, herd: 1 });
  assert.equal(run('founders-for-target', '61', '3', '2', '5'), 4);
  assert.equal(run('founders-for-target', '7', '3', '2', '0'), 7);
  assert.equal(run('founders-for-target', '1', '3', '2', '4'), 1);
  // A litter of three needs three free places: 50 and 53 fill exactly, 7 leaves no room for a first litter.
  assert.deepEqual(run('fill-pen', '5', '3', '2', '50'), { cycles: 5, herd: 50, spare: 0 });
  assert.deepEqual(run('fill-pen', '5', '3', '2', '53'), { cycles: 5, herd: 53, spare: 0 });
  assert.deepEqual(run('fill-pen', '5', '3', '2', '7'), { cycles: 0, herd: 5, spare: 2 });
  assert.deepEqual(run('fill-pen', '1', '3', '2', '52'), { cycles: 0, herd: 1, spare: 51 });
  assert.deepEqual(run('fill-pen', '2', '1', '0', '3'), { cycles: 1, herd: 3, spare: 0 });
  // Keeping no adults ends the herd after the first cull of four parents and six offspring.
  assert.deepEqual(run('cull-schedule', '4', '3', '0', '0', '3'), [10, 0, 0]);
  assert.deepEqual(run('steady-herd', '1', '3', '2'), { birthsPerCycle: 0, juveniles: 0, peakHerd: 1 });
  assert.deepEqual(run('steady-herd', '8', '3', '0'), { birthsPerCycle: 12, juveniles: 0, peakHerd: 20 });
  assert.equal(run('sustainable-yield', '1', '3', '2.5', '8', '60').animalsPerPeriod, 0);
  // Four pairs yield exactly 90 per period.
  assert.equal(run('breeders-for-demand', '90', '3', '8', '60'), 8);
  assert.equal(run('breeders-for-demand', '90.1', '3', '8', '60'), 10);
  assert.equal(run('breeders-for-demand', '0', '3', '8', '60'), 0);
  assert.deepEqual(run('harvest-interval', '48', '9', '3', '8'), { cycles: 4, interval: 32, surplus: 0 });
  assert.deepEqual(run('harvest-interval', '49', '9', '3', '8'), { cycles: 5, interval: 40, surplus: 11 });
  assert.deepEqual(run('drop-plan', '0', '1.5', '4', '2.5'), { animals: 0, pairings: 0, feed: 0, drops: 0 });
  // 0.9 / 0.3 is 3.0000000000000004 in floating point; roundoff must not add an animal.
  close(run('drop-plan', '0.9', '0.3', '1', '0'), { animals: 3, pairings: 3, feed: 0, drops: 0.9 });
  // A regrow time of two visits, just over two visits, and under one visit.
  assert.equal(run('product-rate', '12', '2.5', '6', '3', '60'), 300);
  assert.equal(run('product-rate', '12', '2.5', '6.1', '3', '60'), 200);
  assert.equal(run('product-rate', '12', '2.5', '2', '3', '60'), 600);
  assert.equal(run('product-rate', '0', '2.5', '7', '3', '60'), 0);
  assert.deepEqual(run('mixed-feed', '1', '4'), { pairs: [0], feed: [0], totalFeed: 0 });
  assert.deepEqual(run('square-pen', '0', '2.5'), { side: 0, penArea: 0, capacity: 0 });
  assert.deepEqual(run('square-pen', '16', '4'), { side: 8, penArea: 64, capacity: 16 });
  assert.deepEqual(run('square-pen', '17', '4'), { side: 9, penArea: 81, capacity: 20 });
  assert.deepEqual(run('min-perimeter-pen', '1', '1'), { width: 1, length: 1, penArea: 1, perimeter: 4 });
  assert.deepEqual(run('min-perimeter-pen', '16', '4'), { width: 8, length: 8, penArea: 64, perimeter: 32 });
  // 5 x 6 and 4 x 7 share perimeter 22; the 4 x 7 pen wins only when its smaller area suffices.
  assert.deepEqual(run('min-perimeter-pen', '30', '1'), { width: 5, length: 6, penArea: 30, perimeter: 22 });
  assert.deepEqual(run('min-perimeter-pen', '28', '1'), { width: 4, length: 7, penArea: 28, perimeter: 22 });
  assert.equal(run('pen-length', '23', '2.5', '5.75'), 10);
  assert.equal(run('pen-length', '0', '2.5', '7'), 0);
  // 3 x 0.1 / 0.1 is 3.0000000000000004 and 3 x 0.3 / 0.1 is 8.999999999999998 in floating point.
  assert.equal(run('pen-length', '3', '0.1', '0.1'), 3);
  assert.equal(run('pen-capacity', '3', '0.3', '0', '0.1'), 9);
  assert.equal(run('pen-capacity', '4', '5', '0', '2.5'), 8);
  assert.equal(run('pen-capacity', '9', '14', '1', '2.5'), 0);
  assert.deepEqual(run('pen-split', '48', '12'), [12, 12, 12, 12]);
  assert.deepEqual(run('pen-split', '49', '12'), [10, 10, 10, 10, 9]);
  assert.deepEqual(run('pen-split', '5', '100'), [5]);
  assert.deepEqual(run('pen-split', '0', '12'), []);
  // No excess; surplus adults and some juveniles; no surplus adults; breeders as the last resort.
  assert.deepEqual(run('cull-to-fit', '20', '15', '35', '8'), { adultsCulled: 0, juvenilesCulled: 0, breedersCulled: 0, herdAfter: 35 });
  assert.deepEqual(run('cull-to-fit', '20', '15', '18', '8'), { adultsCulled: 12, juvenilesCulled: 5, breedersCulled: 0, herdAfter: 18 });
  assert.deepEqual(run('cull-to-fit', '5', '15', '12', '8'), { adultsCulled: 0, juvenilesCulled: 8, breedersCulled: 0, herdAfter: 12 });
  assert.deepEqual(run('cull-to-fit', '5', '3', '2', '8'), { adultsCulled: 0, juvenilesCulled: 3, breedersCulled: 3, herdAfter: 2 });
});

test('herd: cross-command invariants', () => {
  const run = (command, ...args) => calculation('herd', command, args);
  const total = values => values.reduce((a, b) => a + b, 0);
  for (const [adults, offspring, delay] of [['5', '3', '2'], ['7', '2', '1'], ['2', '1', '0'], ['9', '4', '3'], ['3', '5', '6']]) {
    const curve = run('growth-curve', adults, offspring, delay, '12');
    // The curve starts with one breeding round, never shrinks, and ends at the age split.
    assert.equal(curve[0], Number(adults) + run('breeding-round', adults, offspring, '0').offspring);
    assert.ok(curve.every((herd, i) => i === 0 || herd >= curve[i - 1]));
    const split = run('age-split', adults, offspring, delay, '12');
    assert.equal(split.adults + split.juveniles, split.herd);
    assert.equal(split.herd, curve[11]);
    // The cycle count for a target is the first cycle whose herd reaches it.
    const target = curve[7] - 1, cycles = run('feed-to-target', adults, offspring, delay, String(target), '0').cycles;
    assert.ok(curve[cycles - 1] >= target && (cycles === 1 || curve[cycles - 2] < target));
    // The feed that reaches a target funds exactly those cycles; slightly less funds one cycle fewer.
    const plan = run('feed-to-target', adults, offspring, delay, String(target), '0.75');
    assert.equal(plan.cycles, cycles);
    assert.equal(plan.herd, curve[cycles - 1]);
    close(plan.feed, plan.pairings * 0.75);
    const funded = run('feed-budget-cycles', adults, offspring, delay, String(plan.feed), '0.75');
    assert.deepEqual([funded.cycles, funded.pairings, funded.herd], [plan.cycles, plan.pairings, plan.herd]);
    assert.equal(run('feed-budget-cycles', adults, offspring, delay, String(plan.feed - 0.01), '0.75').cycles, cycles - 1);
    // The fewest founders reach the target in time and one fewer does not.
    const founders = run('founders-for-target', String(curve[7]), offspring, delay, '8');
    assert.ok(founders <= Number(adults));
    assert.ok(run('growth-curve', String(founders), offspring, delay, '8')[7] >= curve[7]);
    assert.ok(run('growth-curve', String(founders - 1), offspring, delay, '8')[7] < curve[7]);
    // A filled pen leaves less room than one litter.
    const filled = run('fill-pen', adults, offspring, delay, '500');
    assert.equal(filled.herd + filled.spare, 500);
    assert.ok(filled.spare < Number(offspring));
  }
  // Once the first offspring mature, a herd held at eight breeders culls its steady births every cycle.
  const steady = run('steady-herd', '8', '3', '2');
  assert.deepEqual(run('cull-schedule', '8', '3', '2', '8', '7'), [0, 0, 12, 12, 12, 12, 12]);
  assert.equal(steady.birthsPerCycle, 12);
  assert.equal(steady.peakHerd, 8 + steady.juveniles + steady.birthsPerCycle);
  // Culls plus the animals left equal the starting adults plus all births (6 + 6 + 6 + 12 + 12 + 12).
  assert.equal(total(run('cull-schedule', '5', '3', '2', '8', '6')) + 8 + steady.juveniles, 5 + 54);
  // The long-run factor matches the ratio of late cycles of a large herd.
  const late = run('growth-curve', '1000', '3', '1', '30');
  assert.ok(Math.abs(late[29] / late[28] - run('growth-factor', '3', '1')) < 1e-6);
  // The delay for a maturation time of 22 at cooldown 5 is the four cycles used above.
  assert.equal(run('delay-cycles', '22', '5'), 4);
  // The breeders for a demand meet it and two fewer do not.
  for (const [demandRate, offspring, cooldown, period] of [['100', '3', '8', '60'], ['7.5', '2', '5', '60'], ['250', '4', '6.5', '24']]) {
    const breeders = run('breeders-for-demand', demandRate, offspring, cooldown, period);
    assert.ok(run('sustainable-yield', String(breeders), offspring, '1', cooldown, period).animalsPerPeriod >= Number(demandRate));
    assert.ok(run('sustainable-yield', String(breeders - 2), offspring, '1', cooldown, period).animalsPerPeriod < Number(demandRate));
  }
  // Over one harvest interval the sustainable yield is the batch plus its surplus, and feed follows the animals.
  const interval = run('harvest-interval', '50', '9', '3', '8');
  const rates = run('sustainable-yield', '9', '3', '2.5', '8', String(interval.interval));
  close(rates.animalsPerPeriod, 50 + interval.surplus);
  close(rates.feedPerPeriod, rates.animalsPerPeriod * rates.feedPerAnimal);
  // A drop plan covers its target and breeds at least the animals it culls.
  const drops = run('drop-plan', '100', '1.5', '4', '2.5');
  assert.ok(drops.drops >= 100 && (drops.animals - 1) * 1.5 < 100);
  assert.ok(drops.pairings * 4 >= drops.animals && (drops.pairings - 1) * 4 < drops.animals);
  // Mixed feed is the sum of single-species rounds.
  const mixed = run('mixed-feed', '7,12,5', '2.5,1,3');
  close(mixed.totalFeed, run('breeding-round', '7', '1', '2.5').feed + run('breeding-round', '12', '1', '1').feed + run('breeding-round', '5', '1', '3').feed);
  for (const [animals, area] of [['23', '2.5'], ['100', '1.7'], ['7', '0.6'], ['999', '3.3']]) {
    const required = Number(animals) * Number(area);
    const square = run('square-pen', animals, area), pen = run('min-perimeter-pen', animals, area);
    // The square pen holds the herd and a side one shorter would not.
    assert.ok(square.capacity >= Number(animals) && (square.side - 1) ** 2 < required);
    // The least-perimeter pen is large enough, no longer around than the square, and no larger in area.
    assert.ok(pen.width <= pen.length && pen.penArea >= required);
    assert.ok(pen.perimeter <= 4 * square.side && pen.penArea <= square.penArea);
    assert.equal(pen.perimeter, 2 * (pen.width + pen.length));
    // A pen of the same width needs exactly that length, and holds the herd.
    assert.equal(run('pen-length', animals, area, String(pen.width)), pen.length);
    assert.ok(run('pen-capacity', String(pen.width), String(pen.length), '0', area) >= Number(animals));
  }
  // Pen splits keep every animal, respect the capacity, and use the fewest pens.
  for (const [animals, capacity] of [[53, 12], [48, 12], [7, 3], [1000, 7], [5, 100]]) {
    const pens = run('pen-split', String(animals), String(capacity));
    assert.equal(total(pens), animals);
    assert.equal(pens.length, Math.ceil(animals / capacity));
    assert.ok(pens[0] <= capacity && pens[0] - pens.at(-1) <= 1);
    assert.ok(pens.every((size, i) => i === 0 || size <= pens[i - 1]));
  }
  // Culls and the remaining herd account for every animal, and breeders go last.
  for (const [adults, juveniles, capacity, keep] of [[20, 15, 6, 8], [20, 15, 18, 8], [5, 15, 12, 8], [9, 0, 4, 4]]) {
    const cull = run('cull-to-fit', String(adults), String(juveniles), String(capacity), String(keep));
    assert.equal(cull.adultsCulled + cull.juvenilesCulled + cull.breedersCulled + cull.herdAfter, adults + juveniles);
    assert.equal(cull.herdAfter, Math.min(capacity, adults + juveniles));
    assert.ok(cull.breedersCulled === 0 || (cull.juvenilesCulled === juveniles && cull.adultsCulled === Math.max(0, adults - keep)));
  }
});

test('signalplan: rejections for impossible signal inputs', () => {
  const run = (command, ...args) => calculation('signalplan', command, args);
  assert.throws(() => run('longest-line', '1000000', '15', '2', '0.0000001'), /limited to 1,000,000,000,000/);
  assert.throws(() => run('reach-cells', '15', '1.5', '15.5'), /Minimum strength cannot exceed/);
  assert.throws(() => run('high-tick-count', '7', '8', '2', '4', '25'), /High ticks cannot exceed/);
  assert.throws(() => run('high-tick-count', '7', '3', '2', '26', '25'), /window start cannot be after/);
  assert.throws(() => run('common-period', '999983,999979,999961'), /common period exceeds/);
  assert.throws(() => run('divider-outputs', '100', '3,4,2', '1,0,3'), /start count must be below/);
  assert.throws(() => run('divider-outputs', '100', '3,4', '1,0,3'), /equal lengths/);
  assert.throws(() => run('counter-delay', '1000000', '0.0000001', '2'), /limited to 1,000,000,000,000 pulses/);
  for (const [command, args] of [['counter-delay', ['1000', '7', '1']], ['counter-wrap', ['3', '1', '150']], ['digits-for-states', ['100', '1']], ['digit-encode', ['47', '1', '5']]]) {
    assert.throws(() => run(command, ...args), /Base must be at least 2/);
  }
  assert.throws(() => run('counter-wrap', '54', '2', '0'), /Counter capacity/);
  assert.throws(() => run('digit-encode', '243', '3', '5'), /more digits than the width/);
  assert.throws(() => run('digit-encode', '1', '2', '1001'), /Width is limited/);
  assert.throws(() => run('parity-bit', '1,0,2'), /only 0 and 1/);
  assert.throws(() => run('edges', '0,1,3'), /only 0 and 1/);
  assert.throws(() => run('hamming-distance', '1,0', '1,0,1'), /equal lengths/);
  assert.throws(() => run('debounce', '2,7,5', '1'), /nondecreasing/);
  assert.throws(() => run('level-for-fill', '65', '64', '15'), /cannot exceed the capacity/);
  assert.throws(() => run('fill-for-level', '16', '64', '15'), /cannot exceed the top level/);
});

test('signalplan: boundaries of lines, clocks, and encodings', () => {
  const run = (command, ...args) => calculation('signalplan', command, args);
  // An exact multiple of the range needs one booster fewer than one more cell.
  assert.equal(run('booster-count', '45', '15'), 2);
  assert.equal(run('booster-count', '46', '15'), 3);
  assert.equal(run('booster-count', '0', '15'), 0);
  assert.equal(run('booster-count', '15', '15'), 0);
  assert.deepEqual(run('line-timing', '0', '15', '2', '0.5'), { totalCells: 0, delay: 0 });
  assert.equal(run('longest-line', '0', '15', '2', '0.5'), 0);
  // With 7.5 ticks a 15-cell run fits but the 16th cell would need a booster too.
  assert.equal(run('longest-line', '7.5', '15', '2', '0.5'), 15);
  assert.equal(run('longest-line', '9.5', '15', '2', '0.5'), 15);
  assert.equal(run('longest-line', '10', '15', '2', '0.5'), 16);
  assert.equal(run('strength-after', '15', '1.5', '20'), 0);
  assert.equal(run('reach-cells', '15', '1.5', '15'), 0);
  assert.equal(run('reach-cells', '15', '1.5', '0'), 10);
  assert.deepEqual(run('path-padding', '4', '0'), [0]);
  assert.equal(run('high-tick-count', '7', '0', '2', '4', '25'), 0);
  assert.equal(run('high-tick-count', '7', '7', '2', '4', '25'), 22);
  // A phase larger than the start shifts the pattern without losing ticks.
  assert.equal(run('high-tick-count', '7', '3', '30', '0', '6'), 3);
  assert.equal(run('first-coincidence', '6', '0', '10', '1'), null);
  assert.deepEqual(run('first-coincidence', '7', '40', '7', '5'), { tick: 40, repeatEvery: 7 });
  assert.equal(run('period-for-rate', '50', '2', '20'), null);
  assert.equal(run('period-for-rate', '40', '2', '20'), 1);
  assert.deepEqual(run('counter-delay', '0', '7', '2'), { pulses: 0, digits: 0, actualDelay: 0 });
  assert.deepEqual(run('counter-delay', '14', '7', '2'), { pulses: 2, digits: 1, actualDelay: 14 });
  assert.deepEqual(run('counter-wrap', '3', '4', '64'), { value: 0, wraps: 1 });
  assert.deepEqual(run('counter-wrap', '3', '4', '63'), { value: 63, wraps: 0 });
  assert.equal(run('digits-for-states', '1', '2'), 0);
  assert.equal(run('digits-for-states', '81', '3'), 4);
  assert.equal(run('digits-for-states', '82', '3'), 5);
  assert.deepEqual(run('digit-encode', '242', '3', '5'), [2, 2, 2, 2, 2]);
  assert.deepEqual(run('digit-encode', '0', '2', '3'), [0, 0, 0]);
  assert.deepEqual(run('edges', '0,0'), { rising: [], falling: [] });
  assert.deepEqual(run('debounce', '4,4,4', '0'), [4, 4, 4]);
  assert.deepEqual(run('sequencer-step', '3,5,2', '0'), { step: 1, tickInStep: 0, ticksToNext: 3 });
  assert.deepEqual(run('sequencer-step', '3,5,2', '9'), { step: 3, tickInStep: 1, ticksToNext: 1 });
  assert.equal(run('level-for-fill', '0', '64', '15'), 0);
  assert.equal(run('level-for-fill', '1', '64', '15'), 1);
  assert.equal(run('level-for-fill', '64', '64', '15'), 15);
  assert.equal(run('fill-for-level', '0', '64', '15'), 0);
  assert.equal(run('fill-for-level', '1', '64', '15'), 1);
});

test('signalplan: cross-command invariants', () => {
  const run = (command, ...args) => calculation('signalplan', command, args);
  // The longest line fits its budget and one more cell does not.
  for (const [budget, range, booster, cell] of [['29', '15', '2', '0.5'], ['100', '8', '3.5', '0.75'], ['7.35', '4', '0', '0.1']]) {
    const cells = run('longest-line', budget, range, booster, cell);
    assert.ok(run('line-timing', String(cells), range, booster, cell).delay <= Number(budget));
    assert.ok(run('line-timing', String(cells + 1), range, booster, cell).delay > Number(budget));
  }
  // Reach is the last cell count whose strength stays at the minimum.
  const reach = run('reach-cells', '15', '1.5', '2');
  assert.ok(run('strength-after', '15', '1.5', String(reach)) >= 2 && run('strength-after', '15', '1.5', String(reach + 1)) < 2);
  // High ticks over whole periods are periods times high-ticks, and the clock-shape duty cycle matches.
  assert.equal(run('high-tick-count', '8', '3', '5', '11', '90'), 30);
  close(run('clock-shape', '3', '5', '20').dutyCycle, 30 / 80);
  // Padded paths all arrive together; aligned paths land on clock multiples.
  const delays = [7, 12.5, 3, 9];
  const padded = run('path-padding', delays.join(','), '1.5').map((pad, i) => pad + delays[i]);
  assert.ok(padded.every(total => total === 14));
  run('clock-align', '7,13,3,10', '5').forEach((pad, i) => assert.equal(([7, 13, 3, 10][i] + pad) % 5, 0));
  // Two clocks starting together first coincide at their common period.
  assert.equal(run('first-coincidence', '6', '0', '10', '0').repeatEvery, run('common-period', '6,10'));
  // A counter of digits-for-states digits holds that many states without wrapping.
  const digits = run('digits-for-states', '100', '3');
  assert.equal(run('counter-wrap', String(digits), '3', '99').wraps, 0);
  assert.equal(run('counter-wrap', String(digits - 1), '3', '99').wraps, 1);
  // Encodings round-trip and Gray codes of neighbors differ in one digit.
  for (let value = 0; value < 64; value++) {
    const digitsOf = v => run('digit-encode', String(v), '2', '7');
    assert.equal(parseInt(digitsOf(value).join(''), 2), value);
    assert.equal(run('hamming-distance', digitsOf(run('gray-code', String(value))).join(','), digitsOf(run('gray-code', String(value + 1))).join(',')), 1);
  }
  // Parity matches the ones count; edges alternate starting with a rise.
  const samples = '1,1,0,0,1,0,1,1,0';
  assert.equal(run('parity-bit', samples).ones, 5);
  const { rising, falling } = run('edges', samples);
  assert.ok(rising.every((r, i) => r < falling[i] && (i === 0 || falling[i - 1] < r)));
  // Divider outputs with zero start counts equal one division by the product.
  assert.equal(run('divider-outputs', '1000', '3,4,5', '0,0,0').at(-1), Math.floor(1000 / 60));
  // The fill for a level reaches it, and one unit less does not.
  for (let level = 2; level <= 15; level++) {
    const fill = run('fill-for-level', String(level), '27', '15');
    assert.ok(run('level-for-fill', String(fill), '27', '15') >= level);
    assert.ok(run('level-for-fill', String(fill - 1), '27', '15') < level);
  }
});

test('linkplan: rejections for wrong row counts and impossible inputs', () => {
  const run = (command, ...args) => calculation('linkplan', command, args);
  assert.throws(() => run('cell-footprint', '[[1,2],[3,4]]', '4', '0'), /exactly 1 row/);
  assert.throws(() => run('tunnel-cells', '[[1,2]]', '4'), /exactly 2 rows/);
  assert.throws(() => run('relay-legs', '[[1,2],[3,4],[5,6]]', '4', '3'), /exactly 2 rows/);
  assert.throws(() => run('best-link-pair', '[[0,0]]', '[[1,1],[2,2]]', '4', '0'), /exactly 2 rows/);
  assert.throws(() => run('best-link-pair', '[[0,0],[9,9]]', '[[1,1]]', '4', '0'), /at least two link sites/);
  assert.throws(() => run('linked-trip', '[[0,0],[1,1],[2,2]]', '8', '5', '10', '3'), /exactly 4 rows/);
  assert.throws(() => run('break-even', '1', '13'), /greater than 1/);
  assert.throws(() => run('break-even', '0.5', '13'), /greater than 1/);
  assert.throws(() => run('mixed-route', '[[0,0]]', '8', '12'), /at least two stops/);
  assert.throws(() => run('pair-alignment', '[[0,0],[1,1]]', '[[0,0]]', '4'), /equal lengths/);
  assert.throws(() => run('spokes', '[[0,0]]', '[[1,1],[2,2]]', '4'), /exactly 1 row/);
  assert.throws(() => run('trunk-network', '[[0,0]]', '[[1,1],[2,2]]', '4'), /exactly 1 row/);
  assert.throws(() => run('errand-plan', '[[0,0]]', '[[1,1],[2,2]]', '4', '1', '9'), /exactly 1 row/);
  assert.throws(() => run('to-compact', '[[1,2]]', '0'));
  assert.throws(() => run('safe-separation', '2.5', '1.5'));
  // 45 points in one cell give 990 pairs; 46 give 1035, beyond the limit.
  const cluster = count => JSON.stringify(Array.from({ length: count }, (_, i) => [i / 100, 0.5]));
  assert.equal(run('collisions', cluster(45), '4', '0').length, 990);
  assert.throws(() => run('collisions', cluster(46), '4', '0'), /limited to 1000 pairs/);
});

test('linkplan: boundaries at zero, exact multiples, and smallest sizes', () => {
  const run = (command, ...args) => calculation('linkplan', command, args);
  assert.equal(run('break-even', '7.5', '0'), 0);
  assert.deepEqual(run('relay-legs', '[[3,4],[3,4]]', '8', '30'), { compactDistance: 0, legs: 0, relays: 0, legLength: 0 });
  // Compact distance 120 is an exact multiple of 30; 125 needs one more leg.
  assert.equal(run('relay-legs', '[[0,0],[576,-768]]', '8', '30').legs, 4);
  assert.equal(run('relay-legs', '[[0,0],[600,-800]]', '8', '30').legs, 5);
  assert.equal(run('safe-separation', '2.5', '3'), 10);
  assert.equal(run('safe-separation', '2.6', '3'), 11);
  assert.deepEqual(run('coverage-sites', '840', '84', '7', '12'), { alongX: 10, alongZ: 1, sites: 10 });
  assert.deepEqual(run('coverage-sites', '841', '84', '7', '12'), { alongX: 11, alongZ: 1, sites: 11 });
  // A budget equal to 5 + 13 + 23 takes the third errand too.
  assert.deepEqual(run('errand-plan', '[[10,7.5],[-12.5,17.5],[15,-32.5],[4,-0.5]]', '[[1,-1]]', '2.5', '3', '41'), { visits: [4, 1, 2], used: 41 });
  assert.deepEqual(run('errand-plan', '[[2.5,-2.5]]', '[[1,-1]]', '2.5', '0', '0'), { visits: [1], used: 0 });
  // With scale below one a single cell can hold no whole wide column.
  assert.equal(run('cell-footprint', '[[0.5,0.5]]', '0.4', '0').columns, 0);
  assert.equal(run('cell-footprint', '[[9,-1]]', '4', '0').columns, 16);
  assert.deepEqual(run('spanning-network', '[[7,7]]', '3'), { edges: [], total: 0 });
  assert.deepEqual(run('collisions', '[[0,0],[3.9,3.9],[4,0]]', '4', '0'), [[1, 2]]);
  assert.deepEqual(run('shared-cells', '[[0,0],[4,0]]', '4'), []);
  // Negative zero inputs never come back as negative zero.
  assert.ok(Object.is(run('to-compact', '[[-0,5]]', '3')[0][0], 0));
  assert.ok(Object.is(run('cell-offsets', '[[-0,-0]]', '3')[0][1], 0));
  assert.ok(Object.is(run('compact-cells', '[[-0,1]]', '3')[0][0], 0));
  // Roundoff next to an integer: 0.3/0.1 sits in cell 3, not 2.
  assert.deepEqual(run('compact-cells', '[[0.3,0.7]]', '0.1'), [[3, 7]]);
  // Exactly at break-even the leg walks; just beyond it the leg links.
  assert.deepEqual(run('mixed-route', '[[0,0],[9,12]]', '7.5', '13'), { linkedLegs: [], total: 15 });
  assert.deepEqual(run('mixed-route', '[[0,0],[9.6,12.8]]', '7.5', '13').linkedLegs, [1]);
});

test('linkplan: cross-command invariants', () => {
  const run = (command, ...args) => calculation('linkplan', command, args);
  const points = '[[37,-22],[5,13],[-3,8],[40,-27],[9,17],[-31.5,64.2]]';
  const trip = run('linked-trip', '[[3,-7],[40,12],[-600,900],[-640,950]]', '6.5', '4.3', '7.1', '2.25');
  close(trip.linkedTime, trip.walkInTime + trip.compactTime + trip.walkOutTime + 2.25);
  close(trip.savedTime, trip.directTime - trip.linkedTime);
  const assigned = run('hub-assign', points, '[[2,-1],[-5,12],[1,3]]', '4');
  assert.equal(assigned.loads.reduce((a, b) => a + b, 0), 6);
  const spokes = run('spokes', points, '[[2,-1]]', '4');
  close(spokes.total, spokes.lengths.reduce((a, b) => a + b, 0));
  assert.equal(spokes.lengths[spokes.farthest - 1], spokes.longest);
  const trunk = run('trunk-network', points, '[[2,-1]]', '4');
  close(trunk.total, trunk.trunk + trunk.branches);
  const coverage = run('coverage-check', points, '[[2,-1],[-5,12]]', '4', '3.5');
  assert.deepEqual([...coverage.covered, ...coverage.uncovered].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
  const cells = run('compact-cells', points, '4');
  const span = run('cell-span', points, '4');
  assert.equal(span.cells, (span.maxCell[0] - span.minCell[0] + 1) * (span.maxCell[1] - span.minCell[1] + 1));
  assert.ok(cells.every(([x, z]) => x >= span.minCell[0] && x <= span.maxCell[0] && z >= span.minCell[1] && z <= span.maxCell[1]));
  // Every point in a shared cell collides with radius zero, and tunnel cells match the cell differences.
  const shared = run('shared-cells', '[[5,13],[37,-22],[6.5,15.9],[38,-21],[-3,8],[7.9,12]]', '4');
  const zeroPairs = run('collisions', '[[5,13],[37,-22],[6.5,15.9],[38,-21],[-3,8],[7.9,12]]', '4', '0');
  assert.equal(zeroPairs.length, shared.reduce((n, g) => n + g.length * (g.length - 1) / 2, 0));
  assert.equal(run('tunnel-cells', '[[37,-22],[-3,8]]', '4').tunnelCells, Math.abs(cells[0][0] - cells[2][0]) + Math.abs(cells[0][1] - cells[2][1]) + 1);
  // A spanning network of n points has n - 1 edges and is never longer than the star from point one.
  const network = run('spanning-network', points, '4');
  assert.equal(network.edges.length, 5);
  const image = run('to-compact', points, '4')[0];
  assert.ok(network.total <= run('spokes', points, JSON.stringify([image]), '4').total + 1e-9);
  // The best pair is at least as good as any fixed pair of the same sites.
  const best = run('best-link-pair', '[[0,0],[600,800]]', '[[3,4],[-6,8],[600,780],[588,784]]', '7.5', '6');
  const fixed = run('linked-trip', '[[0,0],[-6,8],[600,780],[600,800]]', '7.5', '1', '1', '6');
  assert.ok(best.linkedDistance <= fixed.linkedTime);
});

test('stripmine: comb layouts split branches per side and walk limits round consistently', () => {
  const run = (command, ...args) => calculation('stripmine', command, args);
  // Three branches of width 2 put two on one side, 4 cells against a 3-cell wall.
  assert.throws(() => run('comb-cells', '3', '1', '1', '3', '2', '1'), /Branch mouths/);
  assert.throws(() => run('comb-faces', '3', '1', '1', '3', '2', '1'), /Branch mouths/);
  // A 4-cell wall holds two width-2 mouths: 4 corridor cells plus 3 x 2 x 1 branch cells.
  assert.deepEqual(run('comb-cells', '4', '1', '1', '3', '2', '1'), { corridorCells: 4, branchCells: 6, totalCells: 10 });
  // Two separated width-2 branches need 2 + 1 + 2 = 5 cells, so 4 is refused (touching branches share a wall).
  assert.throws(() => run('comb-faces', '4', '1', '1', '4', '2', '1'), /Branch mouths/);
  // Length 5: side walls 1 + 1 left after the mouths, far end 1, branch sides 4 x 2, branch ends 4 x 2.
  // Floor 5 x 1 + 4 x 2 x 1 = 13.
  assert.deepEqual(run('comb-faces', '5', '1', '1', '4', '2', '1'), { floorFaces: 13, ceilingFaces: 13, wallFaces: 19, totalFaces: 45 });
  // Branch one returns 23 steps and branch two 30; limits within roundoff of either admit that branch.
  assert.equal(run('branches-within-walk', '22.999999999999996', '3', '2', '5', '20'), 1);
  assert.equal(run('branches-within-walk', '29.99999999999999', '3', '2', '5', '20'), 2);
  assert.equal(run('branches-within-walk', '29.9', '3', '2', '5', '20'), 1);
  // Fitting n combs needs n x 47 - 4 cells: 184 holds four, which floor(184 / 47) = 3 would miss.
  assert.deepEqual(run('parallel-combs', '184', '3', '20', '2', '4'), { spacing: 47, combs: 4, usedWidth: 184 });
  assert.equal(run('parallel-combs', '183', '3', '20', '2', '4').combs, 3);
});

test('herd: cycles-to-harvest totals culls, stops when breeding ends, and caps cycles', () => {
  const run = (command, ...args) => calculation('herd', command, args);
  // Culls of 0, 0, 3, 6, 6, 12, 12 above eight kept adults; 24 juveniles stay after cycles six and seven.
  assert.deepEqual(run('cycles-to-harvest', '5', '3', '2', '8', '27'), { cycles: 6, culled: 27, herd: 32 });
  assert.deepEqual(run('cycles-to-harvest', '5', '3', '2', '8', '28'), { cycles: 7, culled: 39, herd: 32 });
  assert.deepEqual(run('cycles-to-harvest', '5', '3', '2', '8', '0'), { cycles: 0, culled: 0, herd: 5 });
  const schedule = run('cull-schedule', '5', '3', '2', '8', '7');
  assert.equal(schedule.reduce((a, b) => a + b, 0), run('cycles-to-harvest', '5', '3', '2', '8', '39').culled);
  // Keeping no adults: four parents and six offspring that mature at once are all culled in cycle one.
  assert.deepEqual(run('cycles-to-harvest', '4', '3', '0', '0', '10'), { cycles: 1, culled: 10, herd: 0 });
  assert.equal(run('cycles-to-harvest', '4', '3', '0', '0', '11'), null);
  // A lone adult never breeds but can still be culled once.
  assert.deepEqual(run('cycles-to-harvest', '1', '3', '2', '0', '1'), { cycles: 1, culled: 1, herd: 0 });
  assert.equal(run('cycles-to-harvest', '1', '3', '2', '0', '2'), null);
  assert.equal(run('cycles-to-harvest', '1', '3', '2', '5', '1'), null);
  // One kept adult: three culled in cycle one, none in cycle two while two juveniles are pending,
  // and two more when they mature in cycle three; after that nothing can breed.
  assert.deepEqual(run('cycles-to-harvest', '4', '1', '2', '1', '5'), { cycles: 3, culled: 5, herd: 1 });
  assert.equal(run('cycles-to-harvest', '4', '1', '2', '1', '6'), null);
  // One pair's first offspring mature at the end of cycle 1,000,000, the last accepted cycle.
  assert.deepEqual(run('cycles-to-harvest', '2', '1', '999999', '2', '1'), { cycles: 1000000, culled: 1, herd: 1000001 });
  assert.throws(() => run('cycles-to-harvest', '2', '1', '1000000', '2', '1'), /limited to 1,000,000 cycles/);
  assert.throws(() => run('cycles-to-harvest', '1000000', '1000000', '5', '1000000', '1'), /1,000,000,000,000 animals/);
});

test('herd: growth-factor at long delays and min-perimeter-pen against a full width scan', () => {
  const run = (command, ...args) => calculation('herd', command, args);
  // x^2 - x = 500,000 has the root (1 + sqrt(2,000,001)) / 2.
  close(run('growth-factor', '1000000', '1'), (1 + Math.sqrt(2000001)) / 2);
  // With a delay of 1,000,000 the root solves 1,000,000 ln x + ln(x - 1) = ln(1/2) without overflow.
  const slow = run('growth-factor', '1', '1000000');
  assert.ok(slow > 1 && Math.abs(1e6 * Math.log(slow) + Math.log(slow - 1) - Math.log(0.5)) < 1e-6);
  close(slow, 1.000010747726857);
  for (const areaPerAnimal of [1, 0.3, 2.5]) {
    for (let animals = 1; animals <= 500; animals++) {
      const required = animals * areaPerAnimal;
      let best = null;
      for (let width = 1; width * width <= required + 2 * width + 1; width++) {
        const length = Math.max(width, Math.ceil(required / width - 1e-9));
        if (!best || width + length < best.width + best.length || (width + length === best.width + best.length && width * length < best.penArea)) best = { width, length, penArea: width * length };
      }
      const pen = run('min-perimeter-pen', String(animals), String(areaPerAnimal));
      assert.deepEqual([pen.width, pen.length, pen.penArea], [best.width, best.length, best.penArea], `${animals} x ${areaPerAnimal}`);
    }
  }
  // Half-perimeter 1,999,998 holds at most 999,999^2 < 999,998,700,000.3, so 1,999,999 is least; with
  // width 999,999.5 - d the area is 999,999,000,000.25 - d^2, so d = 547.5 is the largest half-odd d allowed.
  assert.deepEqual(run('min-perimeter-pen', '999999', '999999.7'), { width: 999452, length: 1000547, penArea: 999998700244, perimeter: 3999998 });
});

test('signalplan: roundoff at whole-unit boundaries and large line quotients', () => {
  const run = (command, ...args) => calculation('signalplan', command, args);
  // 18442.049526 / 0.000003 = 6,147,349,842 exactly; the floating quotient sits just below it.
  assert.equal(run('longest-line', '18442.049526', '1000000', '0', '0.000003'), 6147349842);
  // Three 0.1-tick cells cost 0.30000000000000004 in floating point but exactly 0.3 by hand.
  assert.equal(run('longest-line', '0.3', '1000000', '0', '0.1'), 3);
  assert.equal(run('longest-line', '0.7', '1000', '0', '0.1'), 7);
  // 64.3 - 64 is 0.29999999999999716 in floating point; by hand 0.3 / 0.1 = 3 cells.
  assert.equal(run('reach-cells', '64.3', '0.1', '64'), 3);
  assert.equal(run('reach-cells', '1.3', '0.1', '1'), 3);
  assert.equal(run('reach-cells', '0.3', '0.1', '0.1'), 2);
  assert.equal(run('reach-cells', '0.7', '0.1', '0'), 7);
  assert.equal(run('period-for-rate', '0.1', '0.7', '1'), 7);
  close(run('counter-delay', '0.3', '0.1', '2'), { pulses: 3, digits: 2, actualDelay: 0.3 });
  // 995 / 7 = 142.14 rounds up to 143, not to the nearest 142.
  assert.deepEqual(run('counter-delay', '995', '7', '2'), { pulses: 143, digits: 8, actualDelay: 1001 });
});

test('linkplan: tie rules, unequal list lengths, and roundoff in whole counts', () => {
  const run = (command, ...args) => calculation('linkplan', command, args);
  // At scale 5 both compact distances are 0.275 exactly, a tie that goes to point 2; at scale 1 point 3 is one ulp nearer.
  assert.deepEqual(run('spanning-network', '[[0,0],[1.3750000000000002,0],[-1.375,0]]', '5'), { edges: [[1, 2], [1, 3]], total: 0.55 });
  assert.deepEqual(run('spanning-network', '[[0,0],[1.3750000000000002,0],[-1.375,0]]', '1').edges, [[1, 3], [1, 2]]);
  // Point 3 is sqrt(4.25) from both connected points 4 and 2, so it joins the lower index 2.
  close(run('spanning-network', '[[0,0],[2,0],[1.5,2],[1,0]]', '1'), { edges: [[1, 4], [4, 2], [2, 3]], total: 2 + Math.sqrt(4.25) });
  // A linked leg counts its compact distance plus overhead: 18.25 + 137 + 10 walked.
  assert.deepEqual(run('mixed-route', '[[0,0],[30,40],[630,840],[636,848]]', '8', '12'), { linkedLegs: [1, 2], total: 165.25 });
  // Point lists of different lengths; equidistant hubs go to the lower index and unused hubs load zero.
  assert.deepEqual(run('hub-assign', '[[0,0],[4,0]]', '[[1,0],[-1,0],[9,9]]', '1'), { hubs: [1, 1], loads: [2, 0, 0] });
  assert.deepEqual(run('link-matching', '[[0,0],[10,0]]', '[[0.5,0],[-0.5,0]]', '1', '0', '0'), { forward: [1, null], backward: [1, null], mutualPairs: 1 });
  // Counts a user computes exactly by hand: 0.7 / 0.1 = 7 legs, 0.3 / 0.1 and 0.7 / 0.1 sites, 10 x 0.7 = 7.
  assert.deepEqual(run('relay-legs', '[[0,0],[0.7,0]]', '1', '0.1').legs, 7);
  assert.deepEqual(run('coverage-sites', '0.3', '0.7', '1', '0.1'), { alongX: 3, alongZ: 7, sites: 21 });
  assert.equal(run('safe-separation', '0.7', '9'), 7);
  assert.deepEqual(run('cell-margins', '[[0.3,0.7]]', '0.1'), [0]);
  // 0.4 - 0.1 is 0.30000000000000004, still within a radius of 0.3.
  assert.deepEqual(run('coverage-check', '[[0.4,0]]', '[[0.1,0]]', '1', '0.3'), { covered: [1], uncovered: [] });
});
