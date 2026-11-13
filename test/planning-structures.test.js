import test from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { STRUCTURE_GROUPS } from '../src/planning-structures.js';
import { STRUCTURE_CASES } from './planning-structures-cases.js';
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
const calculation = (group, command, args) => calculateOffline(STRUCTURE_GROUPS.find(g => g.name === group), command, args).result;

test('structure inventory contains 100 unique documented callable behaviors', () => {
  assert.equal(STRUCTURE_GROUPS.length, 4);
  assert.equal(STRUCTURE_CASES.length, 100);
  assert.equal(new Set(STRUCTURE_CASES.map(([g, c]) => `${g}/${c}`)).size, 100);
  for (const group of STRUCTURE_GROUPS) {
    assert.equal(group.commands.length, 25, group.name);
    assert.equal(new Set(group.commands.map(c => c.signature.split(' ')[0])).size, 25, group.name);
    assert.deepEqual(group.commands.map(c => c.signature.split(' ')[0]), STRUCTURE_CASES.filter(([g]) => g === group.name).map(([, c]) => c));
    assert.match(group.note, /^Offline/);
  }
});

for (const [groupName, command, args, expected] of STRUCTURE_CASES) {
  test(`${groupName} ${command}: expected arithmetic and Commander output`, async () => {
    const group = STRUCTURE_GROUPS.find(g => g.name === groupName);
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

test('stairplan: rejections for impossible or oversize input', () => {
  const run = (command, args) => () => calculation('stairplan', command, args);
  assert.throws(run('riser-count', ['1000000', '0.1']), /limited to 1,000,000/);
  assert.throws(run('riser-options', ['3', '0.3', '0.2']), /Minimum rise/);
  assert.throws(run('riser-options', ['3', '0.000001', '0.2']), /limited to 1,000,000/);
  assert.throws(run('flight-in-run', ['1000000', '0.2', '0.5']), /limited to 1,000,000/);
  assert.throws(run('comfort-check', ['0.2', '0.3', '0.7', '0.6']), /Minimum stride/);
  assert.throws(run('comfort-runs', ['0.2', '0.7', '0.6']), /Minimum stride/);
  assert.throws(run('flight-split', ['2002', '2']), /1000 flights/);
  assert.equal(calculation('stairplan', 'flight-split', ['2000', '2']).flights, 1000);
  assert.throws(run('clear-steps', ['2', '2.5', '0.2']), /Headroom/);
  assert.throws(run('rail-posts', ['10', '0.5', '0.4', '1']), /Maximum spacing/);
  assert.throws(run('lane-count', ['1', '0.5', '0.6', '2']), /Rails are wider/);
  assert.throws(run('ladder-rungs', ['2', '0.3', '2.1']), /first rung/);
  assert.throws(run('two-rise-mix', ['10', '4', '3', '3']), /Low rise/);
  assert.throws(run('two-rise-mix', ['10', '4', '3', '2']), /Low rise/);
  assert.throws(run('nosing-profile', ['1001', '0.5', '0.5']), /1000 steps/);
  assert.equal(calculation('stairplan', 'nosing-profile', ['1000', '0.5', '0.5']).length, 1000);
  assert.throws(run('flight-size', ['0', '0.2', '0.3']));
  assert.throws(run('landing-levels', ['3,0,2', '0.2']));
  assert.throws(run('ladder-sections', ['7.5', '3', '1']));
});

test('stairplan: boundaries, exact multiples, and documented null outcomes', () => {
  const run = (command, args) => calculation('stairplan', command, args);
  assert.deepEqual(run('riser-count', ['3', '0.5']), { risers: 6, rise: 0.5 });
  assert.equal(run('riser-count', ['3.01', '0.5']).risers, 7);
  // 1.1 / 0.1 is 11.000000000000002 in floating point; roundoff must not add a riser.
  assert.equal(run('riser-count', ['1.1', '0.1']).risers, 11);
  assert.equal(run('riser-count', ['0.2', '5']).risers, 1);
  assert.deepEqual(run('riser-options', ['3', '0.2', '0.2']), { fewest: 15, most: 15 });
  assert.equal(run('riser-options', ['1', '0.4', '0.45']), null);
  assert.equal(run('riser-options', ['0.3', '0.4', '0.5']), null);
  assert.deepEqual(run('flight-size', ['1', '0.2', '0.3']).treads, 0);
  assert.equal(run('flight-size', ['1', '0.2', '0.3']).stringerLength, 0.2);
  assert.equal(run('flight-size', ['3', '0.5', '0.5']).pitchDegrees, 45);
  assert.deepEqual(run('flight-in-run', ['0', '0.2', '0.5']), { risers: 1, totalRise: 0.2 });
  assert.equal(run('flight-in-run', ['2', '0.2', '0.5']).risers, 5);
  assert.equal(run('flight-in-run', ['1.99', '0.2', '0.5']).risers, 4);
  // 2 * 0.2 + 0.2 is 0.6000000000000001 in floating point; the inclusive limit still holds.
  assert.equal(run('comfort-check', ['0.2', '0.2', '0.5', '0.6']).fits, true);
  assert.equal(run('comfort-check', ['0.2', '0.2', '0.6', '0.7']).fits, true);
  assert.equal(run('comfort-check', ['0.2', '0.21', '0.5', '0.6']).fits, false);
  assert.equal(run('comfort-check', ['0.2', '0.09', '0.5', '0.6']).fits, false);
  assert.equal(run('comfort-runs', ['0.3', '0.5', '0.6']), null);
  assert.equal(run('comfort-runs', ['0.4', '0.5', '0.6']), null);
  assert.deepEqual(run('comfort-runs', ['0.25', '0.25', '0.75']), { minimumRun: 0, maximumRun: 0.25 });
  assert.deepEqual(run('flight-split', ['9', '9']), { flights: 1, landings: 0, risersPerFlight: [9] });
  assert.deepEqual(run('flight-split', ['10', '9']), { flights: 2, landings: 1, risersPerFlight: [5, 5] });
  assert.deepEqual(run('straight-run', ['1', '5', '0.3', '1']), { flights: 1, landings: 0, treads: 0, totalRun: 0 });
  assert.deepEqual(run('switchback-footprint', ['1', '7', '0.5', '1.5', '1.25', '0.25']), { length: 3, width: 1.5 });
  assert.deepEqual(run('switchback-footprint', ['2', '7', '0.5', '1.5', '1.25', '0.25']), { length: 4.25, width: 3.25 });
  assert.deepEqual(run('switchback-footprint', ['3', '7', '0.5', '1.5', '1.25', '0.25']), { length: 5.5, width: 3.25 });
  assert.deepEqual(run('switchback-footprint', ['9', '7', '0.5', '1.5', '1.25', '0.25']), { length: 5.5, width: 3.25 });
  assert.equal(run('clear-steps', ['2.5', '2.5', '0.2']), 0);
  // (3 - 1.8) / 0.4 is 3.0000000000000004 and (2.9 - 1.7) / 0.4 falls just short of 3.
  assert.equal(run('clear-steps', ['3', '1.8', '0.4']), 3);
  assert.equal(run('clear-steps', ['2.9', '1.7', '0.4']), 3);
  assert.equal(run('clear-steps', ['2.99', '1.8', '0.4']), 2);
  assert.deepEqual(run('under-stair-space', ['4', '0.5', '0.75', '2', '0.25', '9']), { treads: 0, floorArea: 0, volume: 0 });
  assert.deepEqual(run('under-stair-space', ['1', '0.5', '0.75', '2', '0', '0']), { treads: 0, floorArea: 0, volume: 0 });
  assert.deepEqual(run('under-stair-space', ['4', '0.5', '0.75', '2', '0', '0']), { treads: 3, floorArea: 4.5, volume: 4.5 });
  // Step 3's underside sits exactly at the clear height and counts.
  assert.equal(run('under-stair-space', ['9', '0.5', '0.75', '2', '0.25', '1.25']).treads, 6);
  assert.deepEqual(run('rail-posts', ['1', '0.3', '0.3', '2']), { treadInterval: 1, postsPerRail: 1, posts: 2 });
  assert.deepEqual(run('rail-posts', ['13', '0.25', '0.75', '1']), { treadInterval: 3, postsPerRail: 5, posts: 5 });
  assert.deepEqual(run('rail-posts', ['14', '0.25', '0.75', '1']), { treadInterval: 3, postsPerRail: 6, posts: 6 });
  assert.deepEqual(run('lane-count', ['3', '0.75', '1.5', '2']), { clearWidth: 0, lanes: 0, spareWidth: 0 });
  // 0.3 - 3 * 0.1 is roundoff, not a negative clear width.
  assert.deepEqual(run('lane-count', ['0.3', '0.5', '0.1', '3']), { clearWidth: 0, lanes: 0, spareWidth: 0 });
  assert.deepEqual(run('lane-count', ['2.5', '0.75', '0.25', '0']), { clearWidth: 2.5, lanes: 3, spareWidth: 0.25 });
  assert.deepEqual(run('ladder-rungs', ['2', '0.5', '2']), { rungs: 1, topRungHeight: 2 });
  assert.deepEqual(run('ladder-rungs', ['2', '0.5', '0']), { rungs: 5, topRungHeight: 2 });
  assert.deepEqual(run('ladder-sections', ['12', '6', '2']), { sections: 2, platforms: 1, topSection: 6, ladderLength: 14 });
  assert.deepEqual(run('ladder-sections', ['13', '6', '0']), { sections: 3, platforms: 2, topSection: 1, ladderLength: 13 });
  assert.deepEqual(run('ladder-sections', ['4', '6', '2']), { sections: 1, platforms: 0, topSection: 4, ladderLength: 4 });
  assert.equal(run('leaning-ladder', ['3', '1']).angleDegrees, 45);
  assert.deepEqual(run('ramp-legs', ['0.5', '12', '6', '1.5']), { legs: 1, landings: 0, legRun: 6, legRise: 0.5, totalLength: 6 });
  assert.equal(run('ramp-legs', ['0.75', '12', '6', '1.5']).legs, 2);
  assert.deepEqual(run('two-rise-mix', ['18', '7', '2', '4']), { lowSteps: 5, highSteps: 2 });
  assert.equal(run('two-rise-mix', ['13', '7', '2', '3']), null);
  assert.equal(run('two-rise-mix', ['22', '7', '2', '3']), null);
  assert.equal(run('two-rise-mix', ['17', '7', '2', '4']), null);
  assert.deepEqual(run('two-rise-mix', ['14', '7', '2', '3']), { lowSteps: 7, highSteps: 0 });
  assert.deepEqual(run('two-rise-mix', ['21', '7', '2', '3']), { lowSteps: 0, highSteps: 7 });
  assert.deepEqual(run('common-rise', ['7,11', '5']), { rise: 1, risersPerStory: [7, 11], totalRisers: 18 });
  assert.deepEqual(run('common-rise', ['12', '12']), { rise: 12, risersPerStory: [1], totalRisers: 1 });
  assert.deepEqual(run('common-rise', ['12,18', '100']), { rise: 6, risersPerStory: [2, 3], totalRisers: 5 });
  assert.equal(run('common-rise', ['1000000,500000', '499999']).rise, 250000);
  assert.equal(run('climb-time', ['12', '0.5', '9']), 6);
  assert.equal(run('climb-time', ['3,4', '0', '0']), 0);
  assert.deepEqual(run('nosing-profile', ['1', '0.25', '0.5']), [[0, 0.25]]);
});

test('stairplan: cross-command invariants', () => {
  const run = (command, args) => calculation('stairplan', command, args);
  for (const [risers, maximum] of [[23, 9], [40, 7], [16, 16], [17, 16], [1, 3], [999, 4]]) {
    const split = run('flight-split', [String(risers), String(maximum)]);
    assert.equal(split.risersPerFlight.reduce((a, b) => a + b, 0), risers);
    assert.equal(split.risersPerFlight.length, split.flights);
    assert.ok(Math.max(...split.risersPerFlight) <= maximum);
    assert.ok(Math.max(...split.risersPerFlight) - Math.min(...split.risersPerFlight) <= 1);
    assert.deepEqual([...split.risersPerFlight].sort((a, b) => b - a), split.risersPerFlight);
    const straight = run('straight-run', [String(risers), String(maximum), '0.25', '1.5']);
    assert.equal(straight.flights, split.flights);
    assert.equal(straight.treads + straight.flights, risers);
    assert.equal(straight.totalRun, straight.treads * 0.25 + split.landings * 1.5);
    const levels = run('landing-levels', [split.risersPerFlight.join(','), '0.25']);
    assert.equal(levels.at(-1), run('flight-size', [String(risers), '0.25', '0.5']).totalRise);
    assert.equal(run('climb-time', [split.risersPerFlight.join(','), '0.5', '2']), risers * 0.5 + split.landings * 2);
  }
  const size = run('flight-size', ['12', '0.25', '0.5']);
  const profile = run('nosing-profile', ['12', '0.25', '0.5']);
  assert.deepEqual(profile.at(-1), [size.totalRun, size.totalRise]);
  assert.equal(profile.length, size.treads + 1);
  const surface = run('step-surface', ['12', '0.25', '0.5', '2']);
  assert.equal(surface.treadArea, size.totalRun * 2);
  assert.equal(surface.riserArea, size.totalRise * 2);
  const count = run('riser-count', ['2.75', '0.6']);
  const options = run('riser-options', ['2.75', '0.3', '0.6']);
  assert.equal(options.fewest, count.risers);
  assert.equal(count.risers * count.rise, 2.75);
  const comfort = run('comfort-runs', ['0.25', '0.75', '1']);
  assert.equal(run('comfort-check', ['0.25', String(comfort.minimumRun), '0.75', '1']).fits, true);
  assert.equal(run('comfort-check', ['0.25', String(comfort.maximumRun), '0.75', '1']).fits, true);
  assert.equal(run('comfort-check', ['0.25', String(comfort.maximumRun + 0.125), '0.75', '1']).fits, false);
  const ramp = run('ramp-legs', ['1.5', '12', '4', '2']);
  assert.equal(ramp.legs * ramp.legRun, 18);
  assert.equal(ramp.legs * ramp.legRise, 1.5);
  assert.ok(ramp.legRun <= 4);
  assert.equal(ramp.totalLength, 18 + ramp.landings * 2);
  const ladder = run('ladder-sections', ['23', '6', '2']);
  assert.equal(ladder.platforms * 6 + ladder.topSection, 23);
  const mix = run('two-rise-mix', ['31', '11', '2', '5']);
  assert.equal(mix.lowSteps + mix.highSteps, 11);
  assert.equal(mix.lowSteps * 2 + mix.highSteps * 5, 31);
  const lanes = run('lane-count', ['4.5', '1.25', '0.25', '2']);
  assert.equal(lanes.lanes * 1.25 + lanes.spareWidth + 2 * 0.25, 4.5);
  const lean = run('leaning-ladder', ['4.8', '2.4']);
  assert.ok(Math.abs(lean.length ** 2 - (4.8 ** 2 + lean.baseOffset ** 2)) < 1e-9);
  assert.equal(run('opening-length', ['2', '0.5', '0.25', '0.5']), run('opening-length', ['1.5', '1', '0.25', '0.5']));
  const common = run('common-rise', ['36,48,60', '5']);
  assert.deepEqual(common.risersPerStory.map(n => n * common.rise), [36, 48, 60]);
});

test('roundplan: rejections for oversize, mismatched, or impossible input', () => {
  const run = (command, args) => () => calculation('roundplan', command, args);
  for (const command of ['disc-cells', 'disc-outline', 'thick-outline', 'disc-rows', 'row-runs', 'quadrant-split', 'square-fill', 'inscribed-square', 'profile-cells']) {
    assert.throws(run(command, ['1001']), /Planar sizes/, command);
  }
  assert.throws(run('row-span', ['1001', '1']), /Planar sizes/);
  assert.throws(run('inscribed-depth', ['1001', '1']), /Planar sizes/);
  assert.throws(run('ring-bands', ['1001', '1']), /Planar sizes/);
  assert.throws(run('thick-ring', ['1001', '1']), /Planar sizes/);
  assert.throws(run('ellipse-cells', ['1001', '5']), /Planar sizes/);
  assert.throws(run('ellipse-cells', ['5', '1001']), /Planar sizes/);
  assert.throws(run('ellipse-outline', ['1001', '5']), /Planar sizes/);
  assert.throws(run('ellipse-outline', ['5', '1001']), /Planar sizes/);
  assert.throws(run('profile-cells', ['5,1001,5']), /Planar sizes/);
  for (const command of ['sphere-cells', 'sphere-shell-cells', 'sphere-layers', 'shell-layers', 'dome-parts']) {
    assert.throws(run(command, ['121']), /Three-dimensional sizes/, command);
  }
  assert.throws(run('cylinder-parts', ['121', '3']), /Three-dimensional sizes/);
  assert.throws(run('cone-layers', ['121', '3']), /Three-dimensional sizes/);
  assert.throws(run('cone-layers', ['9', '1001']), /1000 layers/);
  assert.throws(run('ellipsoid-cells', ['121', '5', '5']), /Three-dimensional sizes/);
  assert.throws(run('ellipsoid-cells', ['5', '121', '5']), /Three-dimensional sizes/);
  assert.throws(run('ellipsoid-cells', ['5', '5', '121']), /Three-dimensional sizes/);
  assert.throws(run('row-span', ['13', '14']), /Row must not exceed/);
  assert.throws(run('inscribed-depth', ['13', '15']), /Width must not exceed/);
  assert.throws(run('inscribed-depth', ['13', '10']), /same parity/);
  assert.throws(run('diameter-for-cells', ['785457']), /No diameter up to 1000/);
  assert.throws(run('thick-ring', ['9', '4.6']), /Thickness must not exceed/);
  assert.throws(run('ring-bands', ['9', '0']));
  assert.throws(run('ring-bands', ['9', '1.5']));
  // The kit's argument types reject zero, negative, and fractional sizes.
  assert.throws(run('disc-cells', ['0']));
  assert.throws(run('disc-cells', ['7.5']));
  assert.throws(run('row-span', ['7', '0']));
  assert.throws(run('thick-ring', ['9', '0']));
  assert.throws(run('cylinder-parts', ['7', '0']));
  assert.throws(run('profile-cells', ['5,0,3']));
  assert.throws(run('outline-within-budget', ['0']));
});

test('roundplan: smallest sizes, size limits, ties, and exact thresholds', () => {
  const run = (command, args) => calculation('roundplan', command, args);
  assert.deepEqual(['1', '2', '3', '4'].map(d => run('disc-cells', [d])), [1, 4, 9, 12]);
  assert.deepEqual(['1', '2', '3', '4'].map(d => run('disc-outline', [d])), [1, 4, 8, 8]);
  assert.deepEqual(['1', '2', '3', '4'].map(d => run('thick-outline', [d])), [1, 4, 8, 12]);
  // Counts at the size limits were confirmed by a separate cell-by-cell enumeration.
  assert.equal(run('disc-cells', ['1000']), 785456);
  assert.equal(run('disc-outline', ['1000']), 2828);
  assert.equal(run('disc-rows', ['1000']).length, 1000);
  assert.equal(run('sphere-cells', ['120']), 904960);
  assert.equal(run('sphere-shell-cells', ['120']), 37160);
  assert.deepEqual(run('disc-rows', ['1']), [1]);
  assert.deepEqual(run('row-span', ['1', '1']), { firstCell: 1, lastCell: 1, cells: 1 });
  assert.deepEqual(run('row-span', ['13', '1']), { firstCell: 5, lastCell: 9, cells: 5 });
  assert.deepEqual(run('row-span', ['13', '13']), { firstCell: 5, lastCell: 9, cells: 5 });
  assert.deepEqual(run('row-span', ['13', '7']), { firstCell: 1, lastCell: 13, cells: 13 });
  assert.deepEqual(run('row-runs', ['1']), [[1, 1]]);
  assert.deepEqual(run('row-runs', ['3']), [[3, 3]]);
  assert.deepEqual(run('quadrant-split', ['1']), { quadrantCells: 0, armCells: 0, centerCells: 1 });
  assert.deepEqual(run('quadrant-split', ['10']), { quadrantCells: 20, armCells: 0, centerCells: 0 });
  assert.deepEqual(run('square-fill', ['3']), { cornerCells: 0, cellsPerCorner: 0, fillFraction: 1 });
  assert.deepEqual(run('square-fill', ['10']), { cornerCells: 20, cellsPerCorner: 5, fillFraction: 0.8 });
  assert.deepEqual(['1', '2', '3', '4', '5', '7', '13'].map(d => run('inscribed-square', [d])), [1, 2, 3, 2, 3, 5, 9]);
  assert.equal(run('inscribed-depth', ['13', '13']), 5);
  assert.equal(run('inscribed-depth', ['13', '1']), 13);
  assert.equal(run('inscribed-depth', ['12', '12']), 4);
  assert.equal(run('inscribed-depth', ['12', '2']), 12);
  // Diameter 11 holds exactly 97 cells; one more cell needs diameter 12.
  assert.equal(run('diameter-for-cells', ['97']), 11);
  assert.equal(run('diameter-for-cells', ['98']), 12);
  assert.equal(run('diameter-for-cells', ['1']), 1);
  assert.equal(run('diameter-for-cells', ['2']), 2);
  assert.equal(run('diameter-for-cells', ['783825']), 999);
  assert.equal(run('diameter-for-cells', ['783826']), 1000);
  assert.equal(run('diameter-for-cells', ['785456']), 1000);
  // Outlines by diameter 1 to 13: 1, 4, 8, 8, 12, 16, 16, 20, 24, 28, 28, 32, 36.
  assert.deepEqual(['1', '3', '4', '7', '8', '11', '12', '27', '28', '31', '32'].map(n => run('outline-within-budget', [n])), [1, 1, 2, 2, 4, 4, 5, 9, 11, 11, 12]);
  assert.equal(run('outline-within-budget', ['2827']) < 1000, true);
  assert.equal(run('outline-within-budget', ['2828']), 1000);
  assert.equal(run('outline-within-budget', ['1000000']), 1000);
  assert.deepEqual(run('ring-bands', ['1', '1']), [1]);
  assert.deepEqual(run('ring-bands', ['3', '1']), [8, 1]);
  // Diameter 9 holds 69 cells; a 4-wide band leaves only the center cell, and a 5-wide band holds the whole disc.
  assert.deepEqual(run('ring-bands', ['9', '4']), [68, 1]);
  assert.deepEqual(run('ring-bands', ['9', '5']), [69]);
  assert.deepEqual(run('ring-bands', ['9', '1000000']), [69]);
  assert.deepEqual(run('ring-bands', ['4', '1']), [8, 4]);
  assert.deepEqual(run('ring-bands', ['4', '2']), [12]);
  assert.equal(run('ring-bands', ['1000', '1']).length, 500);
  // Four cell centers lie exactly 3 from the center of a diameter-9 disc and stay out of a 1.5 ring.
  assert.equal(run('thick-ring', ['9', '1.5']), 40);
  assert.equal(run('thick-ring', ['9', '1.51']), 44);
  assert.equal(run('thick-ring', ['9', '4.5']), 68);
  assert.equal(run('thick-ring', ['10', '5']), 80);
  assert.equal(run('thick-ring', ['10', '1.5']), 48);
  assert.equal(run('ellipse-cells', ['1', '5']), 5);
  assert.equal(run('ellipse-cells', ['2', '1']), 2);
  assert.equal(run('ellipse-outline', ['1', '5']), 5);
  assert.equal(run('ellipse-outline', ['9', '5']), 20);
  assert.equal(run('ellipse-cells', ['1000', '999']) > 0, true);
  assert.deepEqual(run('cylinder-parts', ['7', '1']), { solidCells: 37, wallCells: 16, capCells: 21, shellCells: 37, hollowCells: 0 });
  assert.deepEqual(run('cylinder-parts', ['7', '2']), { solidCells: 74, wallCells: 32, capCells: 42, shellCells: 74, hollowCells: 0 });
  assert.deepEqual(run('cylinder-parts', ['7', '3']), { solidCells: 111, wallCells: 48, capCells: 42, shellCells: 90, hollowCells: 21 });
  assert.deepEqual(run('cylinder-parts', ['1', '4']), { solidCells: 4, wallCells: 4, capCells: 0, shellCells: 4, hollowCells: 0 });
  assert.equal(run('cylinder-parts', ['120', '1000000']).solidCells, run('disc-cells', ['120']) * 1000000);
  assert.deepEqual(['1', '2', '3'].map(d => run('sphere-cells', [d])), [1, 8, 19]);
  assert.deepEqual(['1', '2', '3'].map(d => run('sphere-shell-cells', [d])), [1, 8, 18]);
  assert.deepEqual(run('sphere-layers', ['5']), [9, 21, 21, 21, 9]);
  assert.deepEqual(run('shell-layers', ['5']), [9, 12, 12, 12, 9]);
  assert.deepEqual(run('shell-layers', ['6']), [12, 12, 16, 16, 12, 12]);
  assert.deepEqual(run('dome-parts', ['1']), { layers: 1, solidCells: 1, roofCells: 1, floorCells: 0, shellCells: 1 });
  assert.deepEqual(run('dome-parts', ['2']), { layers: 1, solidCells: 4, roofCells: 4, floorCells: 0, shellCells: 4 });
  assert.deepEqual(run('dome-parts', ['5']), { layers: 3, solidCells: 51, roofCells: 33, floorCells: 9, shellCells: 42 });
  assert.deepEqual(run('dome-parts', ['6']), { layers: 3, solidCells: 68, roofCells: 40, floorCells: 16, shellCells: 56 });
  assert.equal(run('ellipsoid-cells', ['1', '1', '1']), 1);
  assert.equal(run('ellipsoid-cells', ['3', '1', '3']), 9);
  assert.equal(run('ellipsoid-cells', ['120', '119', '118']) > 0, true);
  assert.deepEqual(run('cone-layers', ['1', '1']), { layerCells: [1], totalCells: 1 });
  assert.deepEqual(run('cone-layers', ['9', '1']), { layerCells: [21], totalCells: 21 });
  // An even diameter has no cell on the axis, so the layers nearest the apex can be empty.
  assert.deepEqual(run('cone-layers', ['4', '3']), { layerCells: [12, 4, 0], totalCells: 16 });
  assert.equal(run('cone-layers', ['120', '1000']).layerCells.length, 1000);
  assert.deepEqual(run('profile-cells', ['1']), { layerCells: [1], totalCells: 1 });
  assert.deepEqual(run('profile-cells', ['1000,1']), { layerCells: [785456, 1], totalCells: 785457 });
});

test('roundplan: cross-command invariants and a direct cell-by-cell model', () => {
  const run = (command, ...args) => calculation('roundplan', command, args.map(String));
  const total = values => values.reduce((a, b) => a + b, 0);
  // The model follows the guide literally: real center offsets and neighbor lookups.
  const offsets = size => Array.from({ length: size }, (_, i) => i + 0.5 - size / 2);
  const planar = (width, depth, inside) => offsets(depth).map(z => offsets(width).map(x => inside(x, z)));
  const solid = (width, height, depth, inside) => offsets(height).map((y, k) => planar(width, depth, (x, z) => inside(x, y, z, k + 1)));
  const count = cells => cells.flat(Infinity).filter(Boolean).length;
  const exposed = (layers, steps) => {
    const at = (k, j, i) => Boolean(layers[k]?.[j]?.[i]);
    return layers.map((layer, k) => layer.map((row, j) => row.map((cell, i) => cell && steps.some(([c, b, a]) => !at(k + c, j + b, i + a)))));
  };
  const four = [[0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]], six = [...four, [1, 0, 0], [-1, 0, 0]];
  const eight = [...four, [0, 1, 1], [0, 1, -1], [0, -1, 1], [0, -1, -1]];
  for (const d of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 16, 21, 24]) {
    const disc = planar(d, d, (x, z) => x * x + z * z <= (d / 2) ** 2), cells = run('disc-cells', d), rows = run('disc-rows', d);
    assert.equal(cells, count(disc), `disc ${d}`);
    assert.deepEqual(rows, disc.map(count));
    assert.equal(run('disc-outline', d), count(exposed([disc], four)), `outline ${d}`);
    assert.equal(run('thick-outline', d), count(exposed([disc], eight)), `thick outline ${d}`);
    assert.equal(run('ellipse-cells', d, d), cells);
    assert.equal(run('ellipse-outline', d, d), run('disc-outline', d));
    assert.deepEqual(run('profile-cells', d), { layerCells: [cells], totalCells: cells });
    const split = run('quadrant-split', d);
    assert.equal(4 * split.quadrantCells + 4 * split.armCells + split.centerCells, cells);
    const fill = run('square-fill', d);
    assert.equal(fill.cornerCells + cells, d * d);
    assert.equal(fill.cellsPerCorner * 4, fill.cornerCells);
    const runs = run('row-runs', d);
    assert.equal(total(runs.map(([, length]) => length)), d);
    assert.equal(total(runs.map(([width, length]) => width * length)), cells);
    for (let row = 1; row <= d; row++) {
      const span = run('row-span', d, row);
      assert.deepEqual(span, { firstCell: disc[row - 1].indexOf(true) + 1, lastCell: disc[row - 1].lastIndexOf(true) + 1, cells: rows[row - 1] });
    }
    for (let width = d; width >= 1; width -= 2) assert.equal(run('inscribed-depth', d, width), rows.filter(n => n >= width).length);
    const side = run('inscribed-square', d);
    assert.ok(run('inscribed-depth', d, side) >= side);
    if (side + 2 <= d) assert.ok(run('inscribed-depth', d, side + 2) < side + 2);
    for (const width of [1, 2, 3, 5]) {
      const bands = run('ring-bands', d, width);
      assert.equal(bands.length, Math.ceil(d / (2 * width)));
      bands.forEach((band, index) => {
        const outer = d / 2 - index * width, inner = outer - width;
        assert.equal(band, count(planar(d, d, (x, z) => x * x + z * z <= outer * outer && (inner < 0 || x * x + z * z > inner * inner))), `bands ${d} ${width} ${index}`);
        if (2 * (index + 1) * width <= d) assert.equal(total(bands.slice(0, index + 1)), run('thick-ring', d, (index + 1) * width));
      });
      assert.equal(total(bands), cells);
    }
    const found = run('diameter-for-cells', cells);
    assert.ok(found <= d && run('disc-cells', found) >= cells);
    if (found > 1) assert.ok(run('disc-cells', found - 1) < cells);
    const budget = run('outline-within-budget', run('disc-outline', d));
    assert.ok(budget >= d && run('disc-outline', budget) <= run('disc-outline', d));
    for (const thickness of [0.25, 1, 1.5, 2.75, d / 2]) {
      if (thickness > d / 2) continue;
      const ring = planar(d, d, (x, z) => x * x + z * z <= (d / 2) ** 2 && x * x + z * z > (d / 2 - thickness) ** 2);
      assert.equal(run('thick-ring', d, thickness), count(ring), `ring ${d} ${thickness}`);
    }
    const sphere = solid(d, d, d, (x, y, z) => x * x + y * y + z * z <= (d / 2) ** 2);
    const layers = run('sphere-layers', d), shell = run('shell-layers', d), shellModel = exposed(sphere, six);
    assert.deepEqual(layers, sphere.map(count));
    assert.deepEqual(shell, shellModel.map(count));
    assert.equal(run('sphere-cells', d), total(layers));
    assert.equal(run('sphere-shell-cells', d), total(shell));
    assert.equal(run('ellipsoid-cells', d, d, d), total(layers));
    assert.equal(layers[Math.floor(d / 2)], cells);
    const dome = run('dome-parts', d), kept = sphere.slice(d - dome.layers);
    assert.equal(dome.layers, offsets(d).filter(y => y >= 0).length);
    assert.equal(dome.solidCells, count(kept));
    assert.equal(dome.roofCells, count(shellModel.slice(d - dome.layers)));
    assert.equal(dome.shellCells, count(exposed(kept, six)));
    assert.equal(dome.roofCells + dome.floorCells, dome.shellCells);
    if (d % 2 === 0) assert.equal(dome.solidCells * 2, total(layers));
    for (const height of [1, 2, 5]) {
      const parts = run('cylinder-parts', d, height), cylinder = solid(d, height, d, (x, y, z) => x * x + z * z <= (d / 2) ** 2);
      assert.equal(parts.solidCells, count(cylinder));
      assert.equal(parts.shellCells, count(exposed(cylinder, six)), `cylinder ${d} ${height}`);
      assert.equal(parts.wallCells, run('disc-outline', d) * height);
      assert.equal(parts.wallCells + parts.capCells + parts.hollowCells, parts.solidCells);
      const cone = run('cone-layers', d, height);
      const coneModel = solid(d, height, d, (x, y, z, k) => x * x + z * z <= (d / 2 * (height - k + 0.5) / height) ** 2);
      assert.deepEqual(cone.layerCells, coneModel.map(count), `cone ${d} ${height}`);
      assert.equal(cone.totalCells, total(cone.layerCells));
    }
  }
  for (const [width, height, depth] of [[9, 5, 7], [12, 7, 4], [3, 10, 6], [8, 8, 3], [1, 6, 11], [15, 2, 5]]) {
    const ellipse = planar(width, depth, (x, z) => (x / (width / 2)) ** 2 + (z / (depth / 2)) ** 2 <= 1);
    assert.equal(run('ellipse-cells', width, depth), count(ellipse), `ellipse ${width} ${depth}`);
    assert.equal(run('ellipse-outline', width, depth), count(exposed([ellipse], four)));
    assert.equal(run('ellipse-cells', depth, width), run('ellipse-cells', width, depth));
    const ellipsoid = solid(width, height, depth, (x, y, z) => (x / (width / 2)) ** 2 + (y / (height / 2)) ** 2 + (z / (depth / 2)) ** 2 <= 1);
    assert.equal(run('ellipsoid-cells', width, height, depth), count(ellipsoid), `ellipsoid ${width} ${height} ${depth}`);
    assert.equal(run('ellipsoid-cells', depth, width, height), run('ellipsoid-cells', width, height, depth));
  }
  const profile = run('profile-cells', '5,8,8,3,13');
  assert.deepEqual(profile.layerCells, [5, 8, 8, 3, 13].map(d => run('disc-cells', d)));
  assert.equal(profile.totalCells, total(profile.layerCells));
});

test('rampart: rejections for impossible or oversize input', () => {
  const run = (command, ...args) => () => calculation('rampart', command, args.map(String));
  assert.throws(run('merlon-fit', 4, 5, 2), /shorter than one merlon/);
  assert.throws(run('merlon-offsets', 3000, 1, 1), /1000 merlons/);
  assert.throws(run('crenellated-parapet', 19, 2, 3, 3, 2, 4), /Crenel depth/);
  assert.throws(run('wall-walk', 1, 0.7, 0.3, 10), /no clear walk/);
  assert.throws(run('battered-courses', 4, 3, 7, 5), /Top thickness/);
  assert.throws(run('battered-courses', 1, 4, 3, 5), /one-course wall/);
  assert.throws(run('battered-courses', 1001, 4, 3, 5), /1000 courses/);
  assert.throws(run('batter-slope', 6, 1.7, 2.5), /Top thickness/);
  assert.throws(run('embrasure-cells', 1001, 1, 1, 1), /1000 layers/);
  assert.throws(run('curtain-spans', 27, 6, 4.5), /no curtain/);
  assert.throws(run('enclosure-cells', 20, 14, 6, 6, 5, 9), /as thick/);
  assert.throws(run('enclosure-cells', 20, 14, 10, 2, 5, 9), /as tall/);
  assert.throws(run('enclosure-cells', 20, 9, 6, 2, 5, 9), /fit along/);
  assert.throws(run('concentric-rings', 4, 8, 2, 5, 3), /enclose a ward/);
  assert.throws(run('concentric-rings', 11, 8, 2, 5, 1001), /1000 rings/);
  assert.throws(run('tower-floors', 23, 4, 2, 4, 2), /no interior/);
  assert.throws(run('gate-passage', 2, 3, 4, 1, 3), /portcullis slot/);
  assert.throws(run('machicolation', 2.9, 1.5, 2, 0.8), /corbel at each end/);
  assert.throws(run('loophole-offsets', 6, 2, 3), /End margins/);
  assert.throws(run('loophole-offsets', 3000, 2, 0), /1000 loopholes/);
  assert.throws(run('blind-ground', 8, 8, 3, 1), /above the parapet crest/);
  assert.throws(run('moat', 30, 20, 4, 4, 10, 3), /bottom width/);
  assert.throws(run('spoil-rampart', 4, 2, 1.25, 0, 0), /positive top width or side slope/);
  assert.throws(run('motte', 12, 30, 12), /Top diameter/);
  assert.throws(run('polygon-trace', 2, 12), /at least 3 sides/);
});

test('rampart: boundaries at exact fits, zero quantities, and smallest sizes', () => {
  const run = (command, ...args) => calculation('rampart', command, args.map(String));
  // 5 merlons of 3 and 4 crenels of 2 fill 23 cells exactly; one more cell is leftover.
  assert.deepEqual(run('merlon-fit', 23, 3, 2), { merlons: 5, crenels: 4, leftover: 0 });
  assert.deepEqual(run('merlon-fit', 24, 3, 2), { merlons: 5, crenels: 4, leftover: 1 });
  assert.deepEqual(run('merlon-fit', 3, 3, 2), { merlons: 1, crenels: 0, leftover: 0 });
  assert.deepEqual(run('merlon-offsets', 26, 3, 2), [1, 6, 11, 16, 21]);
  assert.equal(run('merlon-offsets', 2000, 1, 1).length, 1000);
  assert.deepEqual(run('crenellated-parapet', 3, 2, 4, 3, 2, 4), { crenels: 0, removedCells: 0, cells: 24 });
  assert.deepEqual(run('battered-courses', 1, 4, 4, 5), { courseThickness: [4], cells: 20 });
  assert.deepEqual(run('battered-courses', 3, 5, 5, 2), { courseThickness: [5, 5, 5], cells: 30 });
  assert.equal(run('batter-slope', 6, 2, 2).angleDegrees, 90);
  assert.deepEqual(run('tower-floors', 5, 4, 2, 9, 2), { stories: 0, slabCells: 0, leftover: 5 });
  assert.deepEqual(run('tower-floors', 6, 4, 2, 9, 2), { stories: 1, slabCells: 50, leftover: 0 });
  assert.deepEqual(run('gate-passage', 5, 3, 4, 0, 2), { passageCells: 60, slotCells: 0, removedCells: 60 });
  assert.deepEqual(run('loophole-offsets', 19, 4, 3), [3, 7, 11, 15]);
  assert.deepEqual(run('loophole-offsets', 18, 4, 3), [3, 7, 11]);
  assert.deepEqual(run('loophole-offsets', 1, 4, 0), [0]);
  assert.equal(run('blind-ground', 8, 9.5, 3, 8), 0);
  assert.equal(run('blind-ground', 8, 9.5, 3, 12), 0);
  assert.equal(run('ladder-standoff', 9, 9), 0);
  assert.equal(run('ladder-standoff', 9, 7.2), 0);
  assert.equal(run('machicolation', 10, 4, 0.1, 1), null);
  assert.deepEqual(run('machicolation', 3, 1.5, 2, 1), { corbels: 2, gap: 0, holeArea: 0 });
  assert.equal(run('loophole-field', 0.5, 2, 0).swathWidth, 0.5);
  assert.equal(run('moat', 30, 20, 0, 10, 4, 3).bermArea, 0);
  assert.equal(run('enclosure-cells', 10, 10, 3, 2, 5, 3).curtainCells, 0);
});

test('rampart: cross-command invariants', () => {
  const run = (command, ...args) => calculation('rampart', command, args.map(String));
  const fit = run('merlon-fit', 41, 4, 3);
  assert.equal(fit.merlons * 4 + fit.crenels * 3 + fit.leftover, 41);
  const offsets = run('merlon-offsets', 41, 4, 3);
  assert.equal(offsets.length, fit.merlons);
  assert.equal(offsets[0] + (41 - offsets.at(-1) - 4), fit.leftover);
  assert.equal(run('crenellated-parapet', 41, 2, 5, 4, 3, 2).crenels, fit.crenels);
  const embrasure = run('embrasure-cells', 9, 1, 2, 3);
  assert.equal(embrasure.removedCells, 3 * embrasure.layerWidths.reduce((a, b) => a + b, 0));
  const enclosure = run('enclosure-cells', 20, 14, 6, 2, 5, 9);
  assert.equal(enclosure.curtainCells + enclosure.towerCells, enclosure.totalCells);
  // With equal heights and tower-size equal to wall-thickness the union is a plain ring wall.
  assert.equal(run('enclosure-cells', 20, 14, 6, 2, 2, 6).totalCells, 6 * (20 * 14 - 16 * 10));
  assert.equal(run('concentric-rings', 20, 14, 2, 3, 1).ringCells[0], 120);
  const rect = run('moat', 30, 20, 4, 10, 10, 3);
  assert.ok(Math.abs(rect.volume - rect.surfaceArea * 3) < 1e-9);
  const bank = run('spoil-rampart', 4, 2, 1.25, 3, 1.5);
  assert.ok(Math.abs(bank.bankHeight * (3 + 1.5 * bank.bankHeight) - 10) < 1e-9);
  assert.equal(run('spoil-rampart', 4, 2, 1.25, 2.5, 0).bankHeight, 4);
  const towers = run('circuit-towers', 48, 36, 12);
  assert.deepEqual(towers, { towers: 14, widthSpacing: 12, depthSpacing: 12 });
  const arch = run('gate-arch', 8, 4);
  assert.ok(Math.abs(arch.radius - 4) < 1e-12 && Math.abs(arch.angleDegrees - 180) < 1e-9 && Math.abs(arch.arcLength - 4 * Math.PI) < 1e-9);
  const square = run('polygon-trace', 4, 6);
  assert.ok(Math.abs(square.area - 36) < 1e-9 && Math.abs(square.apothem - 3) < 1e-12);
  const bridge = run('drawbridge', 4, 0, 4);
  assert.equal(bridge.raisedChain, 0);
  assert.ok(Math.abs(bridge.chainTravel - bridge.loweredChain) < 1e-12);
});

test('warehouse: every documented rejection', () => {
  const rejects = (command, ...args) => assert.throws(() => calculation('warehouse', command, args.map(String)), undefined, `${command} ${args.join(' ')}`);
  rejects('aisle-modules', 1000000, 0.000001, 0.000001, 1);
  rejects('levels-under-ceiling', 1000000, 0, 0.000001, 0);
  rejects('container-wall', 20, 1.5, 3, '4,5', '2,3');
  rejects('container-wall', 20, 1.5, 3, '9,4', '2,3');
  rejects('container-wall', 20, 1.5, 3, '4,18', '2,3');
  rejects('container-wall', 20, 1.5, 3, '4,11', '2');
  rejects('container-wall', 1000000, 0.0001, 1, '1', '1');
  rejects('location-index', 1, 3, 1, 1, 4, 2);
  rejects('location-index', 1, 1, 5, 1, 4, 2);
  rejects('location-index', 1, 1, 4, 3, 4, 2);
  rejects('location-address', 49, 3, 4, 2);
  rejects('traversal-route', '1,2', '3,8', 7, 0, 4, 2);
  rejects('return-route', '1,2', '3', 0, 4, 2);
  rejects('door-aisle', '0,0,0', 4);
  rejects('aisle-balance', '3,4', '1,6', 5);
  rejects('aisle-balance', '3,4', '1,2', 1001);
  rejects('aisle-balance', '0,0', '1,2', 5);
  rejects('abc-classes', '5,6', 0.8, 0.5);
  rejects('abc-classes', '0,0', 0.5, 0.8);
  rejects('coi-order', '1,2', '3');
  rejects('nearest-slotting', '1,2,3,4,5', 1, 2, 1, 0, 3, 2);
  rejects('demand-zones', '4,5', 1001);
  rejects('demand-zones', '0,0', 3);
  rejects('depth-zones', '50,90,40', 3, 4, 8);
  rejects('dedicated-vs-shared', '5,6', '64', 9);
  rejects('section-fit', '3,9,2', 8);
  rejects('overflow-by-type', '5,6', '64,64', '1', 9);
  rejects('fill-state', 2161, 40, 54, 0.1);
});

test('warehouse: boundaries, exact multiples, and roundoff', () => {
  const run = (command, ...args) => calculation('warehouse', command, args.map(String));
  assert.equal(run('levels-under-ceiling', 3, 0, 1.5, 0), 2);
  assert.equal(run('levels-under-ceiling', 2.9, 0, 1.5, 0), 1);
  assert.equal(run('levels-under-ceiling', 1.4, 0, 1.5, 0), 0);
  assert.equal(run('levels-under-ceiling', 0.3, 0.1, 0.2, 0.5), 1);
  assert.deepEqual(run('aisle-modules', 13, 1, 4.5, 1), { aisles: 2, rowsAcross: 4, leftover: 0 });
  assert.deepEqual(run('aisle-modules', 0.3, 0.05, 0.2, 1), { aisles: 1, rowsAcross: 2, leftover: 0 });
  assert.deepEqual(run('aisle-modules', 6, 1, 4.5, 1), { aisles: 0, rowsAcross: 0, leftover: 6 });
  assert.deepEqual(run('container-wall', 9, 1.5, 2, '0,7', '3,2'), { segmentColumns: [0, 2, 0], columns: 2, containers: 4 });
  assert.deepEqual(run('container-wall', 0.9, 0.3, 1, '0.1', '0.2'), { segmentColumns: [0, 2], columns: 2, containers: 2 });
  assert.equal(run('location-index', 1, 1, 1, 1, 1, 1), 1);
  assert.deepEqual(run('location-address', 1, 1, 1, 1), { aisle: 1, side: 1, bay: 1, level: 1 });
  assert.equal(run('bay-walk', 1, 1, 0, 1, 1), 0.5);
  assert.deepEqual(run('abc-classes', '60,40', 0.6, 0.6), ['A', 'C']);
  assert.deepEqual(run('abc-classes', '7,3', 0.7, 1), ['A', 'B']);
  assert.deepEqual(run('abc-classes', '5,0,5', 0, 1), ['B', 'C', 'B']);
  assert.deepEqual(run('coi-order', '4,1,6', '0,0,2'), [3, 1, 2]);
  // A midpoint exactly on a zone boundary moves up, which can leave a zone empty.
  assert.deepEqual(run('demand-zones', '6,0,0', 2), { zoneOfType: [2, 2, 2], zonePicks: [0, 6] });
  assert.deepEqual(run('demand-zones', '5,0,0', 3), { zoneOfType: [2, 3, 3], zonePicks: [0, 5, 0] });
  assert.deepEqual(run('dedicated-vs-shared', '0,0', '16,64', 9), { perType: [0, 0], dedicated: 0, shared: 0, saving: 0 });
  assert.deepEqual(run('dedicated-vs-shared', '576,577', '64,64', 9), { perType: [1, 2], dedicated: 3, shared: 3, saving: 0 });
  assert.deepEqual(run('overflow-by-type', '0,640,641', '64,64,64', '0,2,2', 5), { overflowItems: [0, 0, 1], idleSlots: [0, 0, 0], totalOverflow: 1, totalIdle: 0 });
  assert.deepEqual(run('fill-state', 0, 7, 27, 0), { capacity: 189, reserveContainers: 0, usableCapacity: 189, freeUsable: 189, intoReserve: 0, fillFraction: 0 });
  assert.deepEqual(run('fill-state', 189, 7, 27, 1), { capacity: 189, reserveContainers: 7, usableCapacity: 0, freeUsable: 0, intoReserve: 189, fillFraction: 1 });
  assert.equal(run('fill-state', 10, 10, 5, 0.3).reserveContainers, 3);
  assert.deepEqual(run('expansion-bays', 648, 0, 0, 2, 3, 3, 18), { futureItems: 648, containersNeeded: 36, addBays: 0 });
  assert.deepEqual(run('expansion-bays', 649, 0, 0, 2, 3, 3, 18), { futureItems: 649, containersNeeded: 37, addBays: 1 });
  assert.deepEqual(run('expansion-bays', 0, 0, 5, 2, 3, 3, 18), { futureItems: 0, containersNeeded: 0, addBays: 0 });
  assert.deepEqual(run('compact-hall', 1, 1, 1, 0, 1, 1), { aisles: 1, baysPerSide: 1, locations: 2, meanWalk: 0.5 });
  assert.deepEqual(run('depth-zones', '24,25', 3, 4, 3), [{ firstBay: 1, lastBay: 1, locations: 24 }, { firstBay: 2, lastBay: 3, locations: 48 }]);
  assert.deepEqual(run('section-fit', '8,8', 8), { sections: 2, sectionOfType: [1, 2], freeContainers: [0, 0] });
  assert.deepEqual(run('door-aisle', '0,0,4', 3), { aisle: 3, crossWalk: 0 });
  assert.deepEqual(run('door-aisle', '5,5', 3), { aisle: 1, crossWalk: 15 });
});

test('warehouse: cross-command invariants', () => {
  const run = (command, ...args) => calculation('warehouse', command, args.map(String));
  // Location index and address are inverse bijections over the whole hall.
  const seen = new Set();
  for (let aisle = 1; aisle <= 2; aisle++) for (let side = 1; side <= 2; side++) for (let bay = 1; bay <= 3; bay++) for (let level = 1; level <= 2; level++) {
    const index = run('location-index', aisle, side, bay, level, 3, 2);
    seen.add(index);
    assert.deepEqual(run('location-address', index, 2, 3, 2), { aisle, side, bay, level });
  }
  assert.deepEqual([...seen].sort((a, b) => a - b), Array.from({ length: 24 }, (_, i) => i + 1));
  assert.equal(run('hall-capacity', 2, 3, 2, 9, 16).locations, 24);
  // mean-walk agrees with averaging bay-walk over every bay.
  let total = 0;
  for (let aisle = 1; aisle <= 4; aisle++) for (let bay = 1; bay <= 5; bay++) total += run('bay-walk', aisle, bay, 3, 7, 2);
  assert.ok(Math.abs(run('mean-walk', 4, 5, 3, 7, 2).mean - total / 20) < 1e-12);
  assert.equal(run('mean-walk', 4, 5, 3, 7, 2).farthest, run('bay-walk', 4, 5, 3, 7, 2));
  // A single aisle picked to its last bay is the same tour under both policies.
  assert.deepEqual(run('return-route', '3,3', '2,6', 1, 4, 2), run('traversal-route', '3,3', '2,6', 6, 1, 4, 2));
  assert.equal(run('traversal-route', '1,2', '1,1', 6, 0, 4, 2).length, 2 * 4 + 2 * 6 * 2);
  // pick-sequence is a permutation that alternates direction per visited aisle.
  assert.deepEqual(run('pick-sequence', '5,2,5,2,9', '1,4,6,2,3'), [4, 2, 3, 1, 5]);
  // nearest-slotting matches a brute-force sort of every location, including the (1,4)/(3,1) tie.
  const picks = [5, 9, 1, 7, 3, 8, 2, 6, 4, 10, 0, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
  const locations = [];
  for (let a = 1; a <= 3; a++) for (let s = 1; s <= 2; s++) for (let b = 1; b <= 4; b++) for (let l = 1; l <= 2; l++) locations.push({ index: (((a - 1) * 2 + s - 1) * 4 + b - 1) * 2 + l, walk: 1 + (a - 1) * 3 + (b - 0.5) * 2 });
  locations.sort((x, y) => x.walk - y.walk || x.index - y.index);
  const expected = picks.map(() => 0);
  picks.map((_, i) => i).sort((i, j) => picks[j] - picks[i] || i - j).forEach((type, rank) => { expected[type] = locations[rank].index; });
  assert.deepEqual(run('nearest-slotting', picks.join(','), 3, 4, 2, 1, 3, 2), expected);
  // Zones and sections conserve their totals.
  const zones = run('demand-zones', '8,3,10,4,6,9,0,7', 4);
  assert.equal(zones.zonePicks.reduce((a, b) => a + b, 0), 47);
  assert.ok(zones.zoneOfType.every((z, i) => i === 0 || z >= zones.zoneOfType[i - 1]));
  const fit = run('section-fit', '5,6,2,4,1,3,7', 8);
  assert.equal(fit.freeContainers.reduce((a, b) => a + b, 0), fit.sections * 8 - 28);
  // Assigning each type its dedicated container count leaves no overflow.
  const plan = run('dedicated-vs-shared', '200,15,1000,0,70', '64,16,64,16,64', 9);
  assert.equal(run('overflow-by-type', '200,15,1000,0,70', '64,16,64,16,64', plan.perType.join(','), 9).totalOverflow, 0);
  const one = run('overflow-by-type', '200,15,1000,0,70', '64,16,64,16,64', plan.perType.map(n => Math.max(0, n - 1)).join(','), 9);
  assert.ok(one.overflowItems.every((v, i) => (v > 0) === (plan.perType[i] > 0)));
  // compact-hall holds the target and is no worse than any other aisle count.
  const hall = run('compact-hall', 3000, 3, 54, 2, 5, 2);
  assert.ok(hall.locations * 54 >= 3000);
  assert.equal(run('mean-walk', hall.aisles, hall.baysPerSide, 2, 5, 2).mean, hall.meanWalk);
  const capacity = run('hall-capacity', 2, 5, 3, 27, 2);
  const state = run('fill-state', 3000, capacity.locations, 54, 0.1);
  assert.equal(state.freeUsable - state.intoReserve, state.usableCapacity - 3000);
  // door-aisle minimizes the one-way cross-aisle walk over every door aisle.
  const aislePicks = [5, 0, 12, 3, 9];
  const cost = k => aislePicks.reduce((t, w, i) => t + w * Math.abs(i + 1 - k) * 4, 0);
  assert.equal(run('door-aisle', aislePicks.join(','), 4).crossWalk, Math.min(...[1, 2, 3, 4, 5].map(cost)));
  const balance = run('aisle-balance', '12,7,0,9,15,4', '2,1,3,2,4,1', 5);
  assert.equal(balance.aislePicks.reduce((a, b) => a + b, 0), 47);
});

test('stairplan: counts cap after the plus one and survive roundoff in a difference of inputs', () => {
  const run = (command, args) => calculation('stairplan', command, args);
  const fails = (command, args) => () => run(command, args);
  // flight-in-run caps risers itself, after adding one to the floored quotient.
  assert.throws(fails('flight-in-run', ['1000000', '1', '1']), /limited to 1,000,000/);
  assert.deepEqual(run('flight-in-run', ['999999', '1', '1']), { risers: 1000000, totalRise: 1000000 });
  // riser-options checks both counts before the null test: fewest 1,000,001 > most 1,000,000.
  assert.throws(fails('riser-options', ['999999.5', '0.999999', '0.999999']), /limited to 1,000,000/);
  // 64.3 - 64 is 0.29999999999999716, yet step 3 sits exactly at the limit 3 x 0.1 + 64 = 64.3.
  assert.equal(run('clear-steps', ['64.3', '64', '0.1']), 3);
  assert.equal(run('clear-steps', ['1000.3', '1000', '0.1']), 3);
  assert.equal(run('clear-steps', ['100.9', '100', '0.3']), 3);
  // A genuine shortfall still rounds down: 3 x 0.1 + 64 = 64.3 exceeds 64.29.
  assert.equal(run('clear-steps', ['64.29', '64', '0.1']), 2);
  // A rise below the inputs' roundoff does not invent steps: (1,000,000 - 1,000,000) / rise is 0.
  assert.equal(run('clear-steps', ['1000000', '1000000', '0.000000000001']), 0);
  // Rungs at 64, 64.1, 64.2 and 64.3; the last is at height and counts.
  assert.deepEqual(run('ladder-rungs', ['64.3', '0.1', '64']), { rungs: 4, topRungHeight: 64.3 });
  assert.deepEqual(run('ladder-rungs', ['20.6', '0.2', '20']), { rungs: 4, topRungHeight: 20.6 });
  assert.equal(run('ladder-rungs', ['64.29', '0.1', '64']).rungs, 3);
  // Clear width 64.3 - 2 x 32 = 0.3 holds exactly 3 lanes of 0.1 with nothing spare.
  close(run('lane-count', ['64.3', '0.1', '32', '2']), { clearWidth: 0.3, lanes: 3, spareWidth: 0 });
  assert.equal(run('lane-count', ['64.3', '0.1', '32', '2']).spareWidth, 0);
  assert.equal(run('lane-count', ['64.4', '0.1', '32', '2']).spareWidth, 0);
  assert.equal(run('lane-count', ['1000.3', '0.1', '500', '2']).lanes, 3);
  // 0.25 of clear width: 2 lanes of 0.1 and 0.05 spare.
  close(run('lane-count', ['64.25', '0.1', '32', '2']), { clearWidth: 0.25, lanes: 2, spareWidth: 0.05 });
});

test('roundplan: ring-bands replaces annulus-cells and worked examples sit on their thresholds', () => {
  const run = (command, ...args) => calculation('roundplan', command, args.map(String));
  // Diameter 10 by hand: positive odd offset pairs within doubled radii 10, 8, 6, 4, 2 number 20, 13, 8, 3, 1, times 4.
  assert.deepEqual(run('ring-bands', 10, 1), [28, 20, 20, 8, 4]);
  // Diameter 9 holds 69 cells, 21 within doubled radius 5 and 1 within doubled radius 1.
  assert.deepEqual(run('ring-bands', 9, 2), [48, 20, 1]);
  assert.equal(run('ring-bands', 9, 2)[0], run('thick-ring', 9, 2));
  assert.equal(calculation('roundplan', 'ring-bands', ['1000', '1']).reduce((a, b) => a + b, 0), 785456);
  assert.equal(STRUCTURE_GROUPS.find(group => group.name === 'roundplan').commands.some(spec => spec.signature.startsWith('annulus-cells ')), false);
  // Inclusive thresholds: disc 11 holds exactly 97 cells, outline 11 has exactly 28 cells, and 4 centers sit exactly 3 out in disc 9.
  assert.equal(run('diameter-for-cells', 97), 11);
  assert.equal(run('outline-within-budget', 28), 11);
  assert.equal(run('thick-ring', 9, 1.5), 40);
});

test('warehouse: roundoff in products and documented tie-breaks', () => {
  const run = (command, ...args) => calculation('warehouse', command, args.map(String));
  // 10 * 0.7 is 7.000000000000001 in floating point; the reserve is still 7 containers, not 8.
  assert.equal(run('fill-state', 0, 10, 5, 0.7).reserveContainers, 7);
  // Total 100 and 0.07 * 100 is 7.000000000000001: the second 7 has exactly 7 picks ahead, so it is not A.
  assert.deepEqual(run('abc-classes', '7,7,7,7,7,7,7,7,7,7,7,7,7,7,2', 0.07, 1), ['A', ...Array(14).fill('B')]);
  // 7 positions: 2x4, 3x3 and 4x2 all have mean 5; 2x4 and 4x2 have 16 locations, and 2 aisles is fewer.
  assert.deepEqual(run('compact-hall', 14, 1, 1, 0, 2, 2), { aisles: 2, baysPerSide: 4, locations: 16, meanWalk: 5 });
  // Aisles 1 and 2 both total 5, so the lowest-numbered aisle is the busiest.
  assert.deepEqual(run('aisle-balance', '5,5', '2,1', 3), { aislePicks: [5, 5, 0], busiestAisle: 1, peakToMean: 1.5 });
  // Capacity 2 * 5 * 64 = 640 holds 640 of 641 items in 10 full slots, so no slot is idle and the count is never negative.
  assert.deepEqual(run('overflow-by-type', 641, 64, 2, 5), { overflowItems: [1], idleSlots: [0], totalOverflow: 1, totalIdle: 0 });
  // Level 4 tops out at 2 + 3 * 1.5 + 1 = 7.5 and level 5 at 9, so neither the gap above the top nor the first-level height is ignored.
  assert.equal(run('levels-under-ceiling', 7.8, 2, 1, 0.5), 4);
});

test('rampart: roundoff tolerance, rounding direction, and discriminating sizes', () => {
  const run = (command, ...args) => calculation('rampart', command, args.map(String));
  const fails = (command, ...args) => () => calculation('rampart', command, args.map(String));
  // 2.1 / 0.7 is 3.0000000000000004 in floating point but exactly 3 gaps per side by hand: 4 * 3 = 12 towers.
  assert.equal(run('circuit-towers', 2.1, 2.1, 0.7).towers, 12);
  // (1.5 + 0.1) / (0.7 + 0.1) is exactly 2 by hand; 2 corbels leave 1.5 - 1.4 = 0.1 open.
  const gallery = run('machicolation', 1.5, 0.7, 0.1, 1);
  assert.equal(gallery.corbels, 2);
  assert.ok(Math.abs(gallery.gap - 0.1) < 1e-12 && Math.abs(gallery.holeArea - 0.1) < 1e-12);
  // 3 towers of 0.3 fill a 0.9 circuit exactly, and 0.6 + 0.3 fill a 0.9 wall exactly.
  assert.throws(fails('curtain-spans', 0.9, 3, 0.3), /no curtain/);
  assert.throws(fails('wall-walk', 0.9, 0.6, 0.3, 1), /no clear walk/);
  assert.throws(fails('blind-ground', 0.3, 0.30000000000000004, 1, 0), /above the parapet crest/);
  // Only the taper is rounded down: tapers 0, floor(1/2) = 0, 1 give [5, 5, 4] and (5 + 5 + 4) * 6 = 84 cells.
  assert.deepEqual(run('battered-courses', 3, 5, 4, 6), { courseThickness: [5, 5, 4], cells: 84 });
  // Distinct slab (1) and wall (2) thicknesses: floor(23 / 5) = 4 stories over a 5 by 5 interior, 4 * 1 * 25 = 100 slab cells.
  assert.deepEqual(run('tower-floors', 23, 4, 1, 9, 2), { stories: 4, slabCells: 100, leftover: 3 });
  // Thickness 3 and crenel width 2 differ: 3 crenels * 2 wide * 3 deep * 3 thick = 54 removed of 19 * 3 * 4 = 228.
  assert.deepEqual(run('crenellated-parapet', 19, 3, 4, 3, 2, 3), { crenels: 3, removedCells: 54, cells: 174 });
  // Layers 0..6 widen after every 3: 2, 2, 2, 4, 4, 4, 6 sum to 24, times height 4 = 96.
  assert.deepEqual(run('embrasure-cells', 7, 2, 3, 4), { layerWidths: [2, 2, 2, 4, 4, 4, 6], removedCells: 96 });
  // A widen-every of at least the wall thickness leaves a straight slit: 5 layers of 1 cell, 2 tall.
  assert.deepEqual(run('embrasure-cells', 5, 1, 5, 2), { layerWidths: [1, 1, 1, 1, 1], removedCells: 10 });
  // Widening every layer: 1, 3, 5, 7 sum to 16.
  assert.deepEqual(run('embrasure-cells', 4, 1, 1, 1), { layerWidths: [1, 3, 5, 7], removedCells: 16 });
  assert.equal(run('embrasure-cells', 1000, 1, 1, 1).layerWidths.length, 1000);
  // Rise 5 over span 2 is a horseshoe arc: radius (1 + 25) / 10 = 2.6, angle 4 * atan(5) above 180 degrees.
  const horseshoe = run('gate-arch', 2, 5);
  assert.ok(Math.abs(horseshoe.radius - 2.6) < 1e-12 && horseshoe.angleDegrees > 180);
  assert.ok(Math.abs(horseshoe.angleDegrees - 4 * Math.atan(5) * 180 / Math.PI) < 1e-9);
});
