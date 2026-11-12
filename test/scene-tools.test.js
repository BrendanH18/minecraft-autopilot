import test from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { SCENE_COMMANDS, sceneReport, registerSceneTools } from '../src/scene-tools.js';
const state = () => ({ connected: true, player: { position: { x: 0, y: 64, z: 0 }, dimension: 'minecraft:overworld' },
  home: { x: 1, y: 64, z: 0, dimension: 'minecraft:overworld' },
  blocks: [{ name: 'minecraft:oak_log', x: 1, y: 64, z: 0 }, { name: 'minecraft:oak_log', x: 3, y: 64, z: 0 }, { name: 'minecraft:stone' }],
  threats: [{ type: 'zombie', x: 2, y: 64, z: 0 }, { type: 'skeleton', x: -1, y: 64, z: 0 }, { distance: 4 }],
  containers: [{ name: 'minecraft:chest', x: 1, y: 64, z: 0 }, { name: 'minecraft:chest', x: 1, y: 64, z: 0 }, { name: 'minecraft:barrel', x: 4, y: 64, z: 0 }] });
const fixtures = {
  box: ['0,64,0', '2,64,0'], layer: ['64', '64'], chunk: ['0', '0'], around: ['1,64,0', '0'], home: ['0'], shell: ['1', '2'],
};
for (const field of ['blocks', 'threats', 'containers']) for (const kind of Object.keys(fixtures)) {
  const name = `${field}-${kind}`;
  test(`${name} selects expected coordinates through real CLI registration`, async () => {
    const expected = { blocks: { box: [1], layer: [1, 3], chunk: [1, 3], around: [1], home: [1], shell: [1] },
      threats: { box: [2], layer: [-1, 2], chunk: [2], around: [], home: [], shell: [-1, 2] },
      containers: { box: [1], layer: [1, 4], chunk: [1, 4], around: [1], home: [1], shell: [1] } };
    let output; const program = new Command();
    registerSceneTools(program, { view: fn => { output = fn(state()); } });
    await program.parseAsync(['scene', name, '--', ...fixtures[kind]], { from: 'user' });
    assert.deepEqual(output.entries.map(p => p.x), expected[field][kind]);
    assert.equal(output.supported, true); assert.match(output.note, /Partial observation/);
  });
}
test('block-clearance uses located threats and normalizes item names', () => {
  const result = sceneReport(state(), 'block-clearance', ['oak_log']);
  assert.deepEqual(result.entries.map(p => p.nearestObservedThreat), [1, 1]); assert.equal(result.threats.unlocated, 1);
});
test('container-clearance deduplicates containers', () => assert.deepEqual(sceneReport(state(), 'container-clearance').entries.map(p => p.nearestObservedThreat), [1, 2]));
test('threat-separation computes distinct pair and handles too few', () => {
  assert.equal(sceneReport(state(), 'threat-separation').pair.distance, 3);
  const s = state(); s.threats = []; assert.equal(sceneReport(s, 'threat-separation').pair, null);
});
test('block-centers computes grouped mean', () => assert.deepEqual(sceneReport(state(), 'block-centers').groups, [{ name: 'minecraft:oak_log', count: 2, center: { x: 2, y: 64, z: 0 } }]));
test('container-centers uses unique positions', () => assert.equal(sceneReport(state(), 'container-centers').groups.find(p => p.name === 'minecraft:chest').count, 1));
test('location-gaps distinguishes unsupported fields', () => {
  const s = state(); delete s.containers;
  assert.deepEqual(sceneReport(s, 'location-gaps').collections[2], { field: 'containers', supported: false, unlocated: 0, located: 0 });
});
test('home-neighbors finds closest entries to saved home', () => assert.deepEqual(sceneReport(state(), 'home-neighbors').collections.map(p => p.nearest.distance), [0, 1, 0]));
test('missing threat locations never turn into clearance evidence', () => {
  const s = state(); s.threats = [{ distance: 2 }];
  assert.equal(sceneReport(s, 'container-clearance').entries[0].nearestObservedThreat, null);
});
test('query validation rejects bad ranges, coordinates, homes and unknown commands', () => {
  for (const [name, args] of [['blocks-box', ['bad', '0,64,0']], ['blocks-layer', ['65', '64']], ['blocks-layer', ['-65', '64']],
    ['blocks-chunk', ['0.5', '1']], ['blocks-around', ['0,64,0', '-1']], ['blocks-shell', ['2', '1']], ['blocks-home', ['NaN']], ['invalid', []]]) {
    assert.throws(() => sceneReport(state(), name, args));
  }
  const s = state(); s.home.dimension = 'minecraft:the_nether'; assert.throws(() => sceneReport(s, 'home-neighbors'), /another dimension/);
  delete s.home; assert.throws(() => sceneReport(s, 'blocks-home', ['1']), /saved home/);
  s.connected = false; assert.throws(() => sceneReport(s, 'location-gaps'), /Enter a world/);
});
test('exactly 25 unique scene commands are exposed', () => assert.equal(new Set(SCENE_COMMANDS.map(([s]) => s.split(' ')[0])).size, 25));
