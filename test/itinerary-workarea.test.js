import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ITINERARY_COMMANDS, itineraryCalculation as itinerary } from '../src/itinerary-tools.js';
import { WORKAREA_COMMANDS, workareaCalculation as area } from '../src/workarea-tools.js';

const route = ['0,64,0', '3,64,0', '3,68,0'];
const p = (x, y, z) => ({ x, y, z });
const routeArgs = {
  pace: ['1,2'], dwell: ['1', '2'], stages: ['5'], resample: ['2'], stopovers: ['5'], 'nearest-order': [],
  'cheapest-insert': ['1,64,0'], 'remove-cost': [], shortcut: ['1', '3'], 'two-opt': [], checkpoints: ['2'],
  retrace: ['3'], 'rotate-start': ['2'], window: ['2', '3'], 'elevation-cost': ['1', '2', '1'],
  effort: ['2', '3', '4'], 'deadline-stops': ['1', '2', '10'], 'return-reserve': ['1', '10'],
  'leg-limit': ['3'], 'climb-limit': ['3'], 'turn-limit': ['45'], bottleneck: ['1', '2'],
  'distance-matrix': [], hub: [], rendezvous: ['1'],
};
const routeExpected = {
  pace: r => { assert.equal(r.seconds, 5); assert.deepEqual(r.stops.map(s => s.arrivalSeconds), [3, 5]); },
  dwell: r => { assert.equal(r.seconds, 11); assert.deepEqual(r.stops.map(s => [s.arrivalSeconds, s.departureSeconds]), [[3, 5], [9, 11]]); },
  stages: r => assert.deepEqual(r.stages.map(s => [s.firstLeg, s.lastLeg, s.distance, s.overLimit]), [[1, 1, 3, false], [2, 2, 4, false]]),
  resample: r => { assert.deepEqual(r.samples.map(s => s.distance), [0, 2, 4, 6, 7]); assert.deepEqual(r.samples.map(s => s.point), [p(0, 64, 0), p(2, 64, 0), p(3, 65, 0), p(3, 67, 0), p(3, 68, 0)]); },
  stopovers: r => assert.deepEqual(r.stops.map(s => s.stop), [1, 3]),
  'nearest-order': r => { assert.deepEqual(r.stops.map(s => s.originalStop), [1, 2, 3]); assert.equal(r.distance, 7); },
  'cheapest-insert': r => { assert.equal(r.afterStop, 1); assert.equal(r.addedDistance, 0); assert.equal(r.totalDistance, 7); },
  'remove-cost': r => assert.deepEqual(r.stops, [{ stop: 2, savedDistance: 2 }]),
  shortcut: r => { assert.equal(r.savedDistance, 2); assert.equal(r.directDistance, 5); },
  'two-opt': r => { assert.equal(r.reversed, null); assert.equal(r.distance, 7); },
  checkpoints: r => assert.deepEqual(r.stops.map(s => s.stop), [1, 3]),
  retrace: r => { assert.deepEqual(r.points, route.map(v => { const [x, y, z] = v.split(',').map(Number); return p(x, y, z); }).reverse()); assert.equal(r.distance, 7); },
  'rotate-start': r => { assert.deepEqual(r.points, [p(3, 64, 0), p(3, 68, 0), p(0, 64, 0), p(3, 64, 0)]); assert.equal(r.distance, 12); },
  window: r => { assert.equal(r.startDistance, 3); assert.equal(r.distance, 4); assert.equal(r.points.length, 2); },
  'elevation-cost': r => assert.equal(r.totalCost, 15), effort: r => assert.equal(r.totalCost, 18),
  'deadline-stops': r => { assert.equal(r.firstOverBudget, 2); assert.equal(r.seconds, 11); },
  'return-reserve': r => assert.deepEqual(r.stops.map(s => [s.seconds, s.remainingSeconds, s.withinBudget]), [[6, 4, true], [12, -2, false]]),
  'leg-limit': r => assert.deepEqual(r.violations.map(l => l.leg), [2]),
  'climb-limit': r => assert.deepEqual(r.violations.map(l => l.leg), [2]),
  'turn-limit': r => { assert.deepEqual(r.unknownStops, [2]); assert.deepEqual(r.violations, []); },
  bottleneck: r => { assert.equal(r.slowestLeg, 2); assert.equal(r.travelSeconds, 7); assert.equal(r.dwellSeconds, 4); assert.equal(r.dominant, 'travel'); },
  'distance-matrix': r => assert.deepEqual(r.distances, [[0, 3, 5], [3, 0, 4], [5, 4, 0]]),
  hub: r => { assert.equal(r.chosen.stop, 2); assert.equal(r.chosen.farthestDistance, 4); },
  rendezvous: r => { assert.equal(r.chosen.stop, 2); assert.equal(r.chosen.totalSeconds, 7); },
};
const corners = ['0,64,0', '2,66,2'];
const second = ['2,64,0', '4,66,2'];
const areaArgs = {
  size: [], layers: [], 'face-counts': [], boundary: ['1'], corners: [], 'center-blocks': [], 'chunk-cover': [], 'section-cover': [], 'region-cover': [], 'chunk-partitions': [],
  'split-axis': ['x', '2'], tiles: ['2', '2'], expand: ['1'], inset: ['1'], translate: ['1', '1', '1'],
  'union-count': second, subtract: second, 'overlap-ratio': second, 'contains-box': second,
  touches: ['3,64,0', '5,66,2'], gap: ['5,64,0', '7,66,2'], 'nearest-face': ['1,65,1'],
  'boundary-distance': ['1,65,1'], 'layer-at': ['65'], 'checker-count': [],
};
const areaExpected = {
  size: r => { assert.deepEqual(r.size, { x: 3, y: 3, z: 3 }); assert.equal(r.cells, 27); },
  layers: r => assert.deepEqual(r.layers, [{ y: 64, cells: 9, cumulative: 9 }, { y: 65, cells: 9, cumulative: 18 }, { y: 66, cells: 9, cumulative: 27 }]),
  'face-counts': r => { assert.equal(r.total, 54); assert.ok(Object.values(r.perDirection).every(n => n === 9)); },
  boundary: r => { assert.equal(r.boundary, 26); assert.equal(r.interior, 1); },
  corners: r => { assert.equal(r.points.length, 8); assert.ok(r.points.every(p => [0, 2].includes(p.x) && [64, 66].includes(p.y) && [0, 2].includes(p.z))); },
  'center-blocks': r => assert.deepEqual(r.points, [p(1, 65, 1)]),
  'chunk-cover': r => { assert.equal(r.count, 1); assert.deepEqual(r.min, { x: 0, z: 0 }); },
  'section-cover': r => { assert.equal(r.count, 1); assert.deepEqual(r.min, { x: 0, y: 4, z: 0 }); },
  'region-cover': r => assert.equal(r.count, 1), 'chunk-partitions': r => { assert.equal(r.parts.length, 1); assert.equal(r.cells, 27); },
  'split-axis': r => assert.deepEqual(r.parts.map(b => b.cells), [18, 9]),
  tiles: r => assert.deepEqual(r.parts.map(b => b.cells), [12, 6, 6, 3]),
  expand: r => { assert.equal(r.cells, 125); assert.deepEqual(r.area.min, p(-1, 63, -1)); },
  inset: r => { assert.equal(r.cells, 1); assert.deepEqual(r.area.min, p(1, 65, 1)); },
  translate: r => { assert.equal(r.cells, 27); assert.deepEqual(r.area.min, p(1, 65, 1)); },
  'union-count': r => { assert.equal(r.overlap, 9); assert.equal(r.union, 45); },
  subtract: r => { assert.equal(r.cells, 18); assert.equal(r.parts.length, 1); assert.deepEqual(r.parts[0].max, p(1, 66, 2)); },
  'overlap-ratio': r => { assert.equal(r.intersectionOverUnion, 1 / 5); assert.equal(r.firstCovered, 1 / 3); },
  'contains-box': r => assert.equal(r.contains, false), touches: r => assert.equal(r.relation, 'face'),
  gap: r => assert.deepEqual(r.gaps, { x: 2, y: 0, z: 0 }),
  'nearest-face': r => assert.deepEqual(r.face, { axis: 'x', side: 'min', plane: 0, distance: 1 }),
  'boundary-distance': r => { assert.equal(r.inside, true); assert.equal(r.depth, 1); },
  'layer-at': r => { assert.equal(r.cells, 9); assert.equal(r.area.min.y, 65); assert.equal(r.area.max.y, 65); },
  'checker-count': r => { assert.equal(r.even, 14); assert.equal(r.odd, 13); },
};

test('all 50 route and area behaviors have independently calculated results', () => {
  assert.equal(ITINERARY_COMMANDS.length, 25); assert.equal(WORKAREA_COMMANDS.length, 25);
  for (const [signature] of ITINERARY_COMMANDS) { const name = signature.split(' ')[0]; routeExpected[name](itinerary(name, [...routeArgs[name], ...route])); }
  for (const [signature] of WORKAREA_COMMANDS) { const name = signature.split(' ')[0]; areaExpected[name](area(name, [...corners, ...areaArgs[name]])); }
});

test('route alternatives improve a crossing route without changing endpoints', () => {
  const r = itinerary('two-opt', ['0,64,0', '4,64,4', '0,64,4', '4,64,0']);
  assert.deepEqual(r.reversed, [2, 3]); assert.equal(r.distance, 12); assert.ok(r.savedDistance > 3);
  assert.deepEqual(r.points[0], p(0, 64, 0)); assert.deepEqual(r.points.at(-1), p(4, 64, 0));
  const turn = itinerary('turn-limit', ['45', '0,64,0', '1,64,0', '1,64,1']); assert.equal(turn.violations[0].degrees, 90);
  assert.equal(itinerary('stages', ['2', ...route]).stages[0].overLimit, true);
  assert.equal(itinerary('resample', ['1', '0,64,0', '0,64,0']).samples.length, 1);
});

test('workarea partitions conserve cells, including thin, negative, and overlapping areas', () => {
  const r = area('chunk-partitions', ['-1,64,-1', '16,65,16']);
  assert.equal(r.parts.length, 9); assert.equal(r.parts.reduce((n, p) => n + p.cells, 0), 648);
  assert.equal(area('checker-count', ['-1,64,0', '-1,64,0']).odd, 1);
  assert.equal(area('face-counts', ['0,64,0', '0,64,0']).total, 6);
  assert.equal(area('inset', [...corners, '2']).area, null);
  assert.equal(area('boundary-distance', [...corners, '4,65,1']).depth, null);
  assert.equal(area('layer-at', [...corners, '70']).cells, 0);
  const difference = area('subtract', ['0,64,0', '4,68,4', '1,65,1', '3,67,3']);
  assert.equal(difference.parts.length, 6); assert.equal(difference.cells, 98);
  // Enumerate this small subtraction independently to prove disjoint coverage.
  const covered = new Set();
  for (const b of difference.parts) for (let x = b.min.x; x <= b.max.x; x++) for (let y = b.min.y; y <= b.max.y; y++) for (let z = b.min.z; z <= b.max.z; z++) { const k = `${x},${y},${z}`; assert.equal(covered.has(k), false); covered.add(k); assert.ok(x < 1 || x > 3 || y < 65 || y > 67 || z < 1 || z > 3); }
  assert.equal(covered.size, 98);
});

test('bounded outputs and malformed inputs fail before allocating large plans', () => {
  for (const args of [['pace', ['1', ...route]], ['dwell', ['0', '1', ...route]], ['resample', ['0.000001', ...route]], ['window', ['3', '1', ...route]], ['nearest-order', ['NaN,64,0', ...route]], ['hub', Array(51).fill(route[0])]]) assert.throws(() => itinerary(...args));
  for (const args of [['tiles', [...corners, '0', '1']], ['split-axis', [...corners, 'q', '1']], ['expand', [...corners, '1000']], ['translate', [...corners, '0.5', '0', '0']], ['size', ['-29999984,-64,-29999984', '29999984,320,29999984']], ['chunk-partitions', ['0,64,0', '10000,64,10000']], ['layers', ['0,NaN,0', corners[1]]]]) assert.throws(() => area(...args));
  const args = [...corners, ...second], before = structuredClone(args); area('subtract', args); assert.deepEqual(args, before);
});

const exec = promisify(execFile);
test('all 50 itinerary and workarea commands dispatch through real CLI processes offline', { timeout: 180000 }, async () => {
  for (const [group, commands, fixtures, fixed, expected] of [['itinerary', ITINERARY_COMMANDS, routeArgs, route, routeExpected], ['workarea', WORKAREA_COMMANDS, areaArgs, corners, areaExpected]]) {
    for (const [signature] of commands) {
      const name = signature.split(' ')[0], args = group === 'itinerary' ? [...fixtures[name], ...fixed] : [...fixed, ...fixtures[name]];
      const { stdout, stderr } = await exec(process.execPath, ['src/cli.js', '--bridge', '/missing-bridge.json', '--json', group, name, '--', ...args]);
      assert.equal(stderr, '', `${group} ${name}`); expected[name](JSON.parse(stdout));
    }
  }
});
