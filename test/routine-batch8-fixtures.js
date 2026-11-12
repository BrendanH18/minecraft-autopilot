import assert from 'node:assert/strict';
import { parseRoutine } from '../src/routine.js';

export const beforeRoutine = parseRoutine(JSON.stringify([
  { type: 'set_home' }, { type: 'goto', x: 0, y: 64, z: 0 },
  { type: 'collect', block: 'oak_log', count: 8 }, { type: 'wait', seconds: 2 },
  { type: 'deposit', item: 'oak_log', count: 4 }, { type: 'inspect_storage' },
  { type: 'goto', x: 16, y: 70, z: 0 }, { type: 'collect', block: 'dirt', count: 6 },
  { type: 'deposit', item: 'oak_log' }, { type: 'wait', seconds: 3 }, { type: 'home' },
]));
export const afterRoutine = parseRoutine(JSON.stringify([
  { type: 'set_home' }, { type: 'goto', x: 3, y: 64, z: 4 },
  { type: 'collect', block: 'oak_log', count: 12 }, { type: 'wait', seconds: 4 },
  { type: 'deposit', item: 'oak_log', count: 8 }, { type: 'inspect_storage' },
  { type: 'goto', x: 16, y: 72, z: 0 }, { type: 'collect', block: 'sand', count: 2 },
  { type: 'deposit', item: 'oak_log' }, { type: 'wait', seconds: 3 }, { type: 'home' }, { type: 'eat' },
]));
export const compareFixtures = {
  aligned: [[], r => assert.deepEqual(r.changes.map(p => p.step), [2, 3, 4, 5, 7, 8, 12])],
  prefix: [[], r => assert.deepEqual([r.steps, r.actions], [1, [beforeRoutine[0]]])],
  suffix: [[], r => assert.deepEqual([r.steps, r.beforeStart, r.afterStart, r.actions], [0, null, null, []])],
  lcs: [[], r => { assert.equal(r.length, 5); assert.deepEqual(r.matches.map(p => [p.beforeStep, p.afterStep]), [[1, 1], [6, 6], [9, 9], [10, 10], [11, 11]]); }],
  'edit-script': [[], r => { assert.deepEqual(r.removed.map(p => p.step), [2, 3, 4, 5, 7, 8]); assert.deepEqual(r.inserted.map(p => p.step), [2, 3, 4, 5, 7, 8, 12]); assert.equal(r.retained.length, 5); }],
  'type-counts': [[], r => { assert.deepEqual(r.types.find(p => p.name === 'eat'), { name: 'eat', before: 0, after: 1, delta: 1 }); assert.equal(r.types.find(p => p.name === 'collect').delta, 0); }],
  'collection-delta': [[], r => assert.deepEqual(r.items, [{ name: 'minecraft:dirt', before: 6, after: 0, delta: -6 }, { name: 'minecraft:oak_log', before: 8, after: 12, delta: 4 }, { name: 'minecraft:sand', before: 0, after: 2, delta: 2 }])],
  'deposit-delta': [[], r => { assert.deepEqual(r.items, [{ name: 'minecraft:oak_log', before: 4, after: 8, delta: 4 }]); assert.deepEqual(r.depositAll, [{ name: 'minecraft:oak_log', before: 1, after: 1, delta: 0 }]); }],
  'wait-delta': [[], r => { assert.deepEqual(r.seconds, { before: 5, after: 7, delta: 2 }); assert.deepEqual(r.longest, { before: 3, after: 4, delta: 1 }); }],
  'destination-pairs': [[], r => { assert.deepEqual(r.pairs.map(p => p.distance), [5, 2]); assert.deepEqual(r.pairs[0].displacement, { x: 3, y: 0, z: 4 }); assert.equal(r.pairs[1].before.step, 7); }],
  'type-sequence': [[], r => { assert.equal(r.same, false); assert.equal(r.after.at(-1), 'eat'); assert.equal(r.before.at(-1), 'home'); }],
  'added-actions': [[], r => { assert.equal(r.actions.reduce((n, a) => n + a.count, 0), 7); assert.ok(r.actions.some(a => a.action.type === 'eat')); assert.equal(r.orderConsidered, false); }],
  'removed-actions': [[], r => { assert.equal(r.actions.reduce((n, a) => n + a.count, 0), 6); assert.ok(r.actions.some(a => a.action.block === 'minecraft:dirt')); }],
  'shared-actions': [[], r => { assert.equal(r.actions.reduce((n, a) => n + a.count, 0), 5); assert.ok(r.actions.some(a => a.action.type === 'home')); }],
  'changed-fields': [[], r => { assert.deepEqual(r.changes.map(p => p.step), [2, 3, 4, 5, 7, 8]); assert.deepEqual(r.changes[0].fields, [{ field: 'x', before: 0, after: 3 }, { field: 'z', before: 0, after: 4 }]); }],
  'first-divergence': [[], r => assert.equal(r.change.step, 2)],
  'last-divergence': [[], r => { assert.equal(r.change.step, 12); assert.equal(r.change.before, null); assert.deepEqual(r.change.after, { type: 'eat' }); }],
  'step-ratio': [[], r => { assert.equal(r.before, 11); assert.equal(r.after, 12); assert.equal(r.delta, 1); assert.equal(r.ratio, 12 / 11); }],
  'item-set': [[], r => { assert.deepEqual(r.added, ['minecraft:sand']); assert.deepEqual(r.removed, ['minecraft:dirt']); assert.deepEqual(r.shared, ['minecraft:oak_log']); }],
  'transition-delta': [[], r => { assert.deepEqual(r.transitions.filter(p => p.delta), [{ name: 'home->eat', before: 0, after: 1, delta: 1 }]); }],
  'chunk-set': [[], r => { assert.deepEqual(r.added, []); assert.deepEqual(r.removed, []); assert.deepEqual(r.shared, ['0,0', '1,0']); }],
  'altitude-envelope': [[], r => { assert.deepEqual(r.before, { minimum: 64, maximum: 70 }); assert.deepEqual(r.after, { minimum: 64, maximum: 72 }); }],
  'home-policy': [[], r => { assert.deepEqual(r.before, { definitions: 1, returnsBeforeFirstDefinition: 0 }); assert.deepEqual(r.after, r.before); }],
  'inspection-policy': [[], r => { assert.deepEqual(r.before, { inspections: 1, depositsBeforeFirstInspection: 1 }); assert.deepEqual(r.after, r.before); }],
  budget: [['1', '2', '0'], r => { assert.equal(r.passes, true); assert.deepEqual([r.extraSteps, r.extraWaitSeconds, r.extraCollection], [1, 2, 0]); }],
};

export const selectFixtures = {
  item: [['oak_log'], [3, 5, 9]], 'except-item': [['oak_log'], [1, 2, 4, 6, 7, 8, 10, 11]],
  types: [['goto', 'home'], [2, 7, 11]], 'between-types': [['collect', 'inspect_storage'], [3, 4, 5, 6]],
  'before-match': [['goto', '2'], [1, 2, 3, 4, 5, 6]], 'after-match': [['goto', '2'], [8, 9, 10, 11]],
  'match-context': [['collect', '1', '1'], [2, 3, 4, 7, 8, 9]], 'nth-type': [['goto', '2'], [7]],
  occurrences: [['collect', '1', '2'], [3, 8]], 'collect-range': [['7', '9'], [3]],
  'deposit-range': [['4', '8'], [5]], 'wait-range': [['2.5', '3'], [10]],
  'goto-box': [['1,65,1', '-1,63,-1'], [2]], 'goto-sphere': [['0,64,0', '1'], [2]],
  'goto-chunk': [['1', '0'], [7]], 'goto-altitude': [['69', '72'], [7]],
  'first-per-item': [[], [3, 5, 8]], 'last-per-item': [[], [3, 8, 9]],
  'every-nth': [['2', '3'], [2, 5, 8, 11]], indices: [['8', '2', '5'], [2, 5, 8]],
  'exclude-indices': [['1', '11'], [2, 3, 4, 5, 6, 7, 8, 9, 10]],
  'home-section': [['1'], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]],
  'collection-cycle': [['oak_log', '1'], [3, 4, 5]], 'wait-window': [['1', '3'], [4, 10]],
  'dependency-window': [['8', '11'], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]],
};
