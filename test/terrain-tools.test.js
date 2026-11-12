import test from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { TERRAIN_COMMANDS, terrainReport, registerTerrainTools } from '../src/terrain-tools.js';

const state = () => ({ connected: true, player: { position: { x: 0, y: 64, z: 0 } },
  blocks: [{ name: 'minecraft:oak_log', x: 0, y: 64, z: 0 }, { name: 'minecraft:oak_log', x: 1, y: 64, z: 0 }, { name: 'minecraft:oak_log', x: 1, y: 65, z: 0 }, { name: 'minecraft:oak_log', x: 5, y: 64, z: 0 }, { name: 'minecraft:stone' }],
  threats: [{ type: 'zombie', x: 1, y: 64, z: 0 }, { type: 'skeleton', x: -1, y: 64, z: 0 }, { distance: 1 }],
  containers: [{ name: 'minecraft:chest', x: 1, y: 64, z: 0 }, { name: 'minecraft:chest', x: 1, y: 64, z: 0 }, { name: 'minecraft:barrel', x: 4, y: 64, z: 0 }] });
const fixtures = { cylinder: ['1', '0', '0'], corridor: ['0,64,0', '1,64,0', '0'], 'nearest-k': ['0,64,0', '1'], grid: ['2'], spread: [], projection: ['0,64,0', '2,64,0'] };
for (const field of ['blocks', 'threats', 'containers']) for (const kind of Object.keys(fixtures)) {
  const name = `${field}-${kind}`;
  test(`${name} computes expected geometry through Commander`, async () => {
    let output; const program = new Command(); const before = state(); const saved = structuredClone(before);
    registerTerrainTools(program, { view: fn => { output = fn(before); } });
    await program.parseAsync(['terrain', name, '--', ...fixtures[kind]], { from: 'user' });
    assert.deepEqual(before, saved); assert.equal(output.supported, true); assert.match(output.note, /Partial observation/);
    assert.equal(output.unlocated, field === 'containers' ? 0 : 1);
    const count = { blocks: 4, threats: 2, containers: 2 }[field];
    if (kind === 'cylinder') assert.equal(output.entries.length, { blocks: 2, threats: 2, containers: 1 }[field]);
    if (kind === 'corridor') assert.equal(output.entries.length, { blocks: 2, threats: 1, containers: 1 }[field]);
    if (kind === 'nearest-k') { assert.equal(output.entries.length, 1); assert.equal(output.entries[0].distance, field === 'blocks' ? 0 : 1); }
    if (kind === 'grid') { assert.equal(output.cells.reduce((sum, cell) => sum + cell.count, 0), count); assert.equal(output.cells.length, field === 'blocks' ? 2 : 2); }
    if (kind === 'spread') { assert.equal(output.count, count); assert.equal(output.center.x, { blocks: 1.75, threats: 0, containers: 2.5 }[field]); assert.ok(output.maximumRadius >= output.meanRadius); }
    if (kind === 'projection') { assert.equal(output.entries.length, count); for (const p of output.entries) { assert.ok(p.projection.fraction >= 0 && p.projection.fraction <= 1); assert.equal(p.projection.point.y, 64); } }
  });
}
const structural = [
  ['block-columns', [], result => assert.deepEqual(result.columns, [{ x: 0, z: 0, heights: [64] }, { x: 1, z: 0, heights: [64, 65] }, { x: 5, z: 0, heights: [64] }])],
  ['block-components', ['oak_log'], result => assert.deepEqual(result.components.map(c => c.count), [3, 1])],
  ['block-surface', ['oak_log'], result => assert.equal(result.unobservedNeighborFaces, 20)],
  ['block-neighbors', ['0,64,0'], result => assert.deepEqual(result.blocks.map(p => p.x), [1])],
  ['block-duplicates', [], result => assert.deepEqual(result.duplicates, [])],
  ['block-height-profile', ['x'], result => assert.deepEqual(result.profile, [{ coordinate: 0, minY: 64, maxY: 64, count: 1 }, { coordinate: 1, minY: 64, maxY: 65, count: 2 }, { coordinate: 5, minY: 64, maxY: 64, count: 1 }])],
  ['block-cross-section', ['y', '65'], result => assert.deepEqual(result.blocks.map(p => p.y), [65])],
];
for (const [name, args, check] of structural) test(`${name} via Commander`, async () => {
  let output; const program = new Command(); registerTerrainTools(program, { view: fn => { output = fn(state()); } });
  await program.parseAsync(['terrain', name, '--', ...args], { from: 'user' }); check(output);
});
test('negative grids floor toward negative infinity; degenerate segments project to start', () => {
  const s = state(); s.blocks = [{ x: -0.1, y: 64, z: -2 }];
  assert.deepEqual(terrainReport(s, 'blocks-grid', ['2']).cells[0].cell, { x: -1, y: 32, z: -1 });
  const projected = terrainReport(s, 'blocks-projection', ['0,64,0', '0,64,0']).entries[0].projection;
  assert.equal(projected.fraction, 0); assert.equal(projected.distance, Math.hypot(0.1, 2));
});
test('block analyses deduplicate floored cells and report duplicates including conflicting names', () => {
  const s = state(); s.blocks.push({ name: 'minecraft:stone', x: 0.5, y: 64.5, z: 0.5 });
  assert.deepEqual(terrainReport(s, 'block-duplicates').duplicates, [{ point: { x: 0, y: 64, z: 0 }, count: 2, names: ['minecraft:oak_log', 'minecraft:stone'] }]);
  assert.deepEqual(terrainReport(s, 'block-components', ['oak_log']).components.map(c => c.count), [3, 1]);
});
test('empty unsupported fields remain explicit, not evidence of safety', () => {
  const s = state(); delete s.threats;
  const result = terrainReport(s, 'threats-spread'); assert.equal(result.supported, false); assert.equal(result.center, null); assert.equal(result.maximumRadius, null);
  s.blocks = []; assert.deepEqual(terrainReport(s, 'block-components', ['oak_log']).components, []);
});
test('validates every parameter family and refuses disconnected players', () => {
  for (const [name, args] of [
    ['blocks-cylinder', ['-1', '0', '1']], ['blocks-cylinder', ['1', '2', '1']], ['blocks-cylinder', ['1', '-385', '1']],
    ['blocks-corridor', ['bad', '0,64,0', '1']], ['blocks-corridor', ['0,64,0', '1,64,0', '-1']],
    ['blocks-nearest-k', ['0,64,0', '1.5']], ['blocks-nearest-k', ['0,64,0', '1001']], ['blocks-grid', ['0']], ['blocks-grid', ['Infinity']],
    ['block-cross-section', ['q', '0']], ['block-cross-section', ['y', '321']], ['block-cross-section', ['x', '0.5']],
    ['block-height-profile', ['y']], ['block-components', ['BAD']], ['block-surface', ['x:y']], ['block-neighbors', ['0,-65,0']], ['unknown', []],
  ]) assert.throws(() => terrainReport(state(), name, args), `${name} ${args}`);
  const s = state(); s.connected = false; assert.throws(() => terrainReport(s, 'blocks-spread'), /Enter a world/);
});
test('exactly 25 distinct terrain commands', () => assert.equal(new Set(TERRAIN_COMMANDS.map(([signature]) => signature.split(' ')[0])).size, 25));
