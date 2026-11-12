import test from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { surveyView, SURVEY_REPORTS, registerSurvey } from '../src/survey.js';

const state = () => ({ connected: true, backend: 'demo', player: { position: { x: -0.1, y: 64.8, z: -16.1 }, dimension: 'minecraft:overworld', health: 13, hunger: 7 },
  threats: [{ type: 'minecraft:zombie', x: -0.1, y: 64.8, z: -13.1 }, { type: 'minecraft:zombie', distance: 16 }, { type: 'minecraft:skeleton', distance: 32 },
    { type: 'minecraft:creeper', distance: 33 }, { type: 'minecraft:spider' }, { type: 'minecraft:zombie', x: -0.1, y: 60, z: -16.1 }],
  blocks: [{ name: 'minecraft:oak_log', x: 1, y: 64, z: -16 }, { name: 'minecraft:oak_log', x: 2, y: 65, z: -16 },
    { name: 'minecraft:deepslate_iron_ore', x: -2, y: 60, z: -16 }, { name: 'minecraft:lava', x: 0, y: 63, z: -16 },
    { name: 'minecraft:water', x: 10, y: 63, z: -16 }, { name: 'minecraft:stone' }],
  containers: [{ name: 'minecraft:chest', x: 0, y: 64, z: 0, items: [], observedAt: 1000 },
    { name: 'minecraft:chest', x: 0, y: 64, z: 0 }, { name: 'minecraft:barrel', x: 1, y: 64, z: 0 }] });
const report = name => surveyView(state(), name, { now: 3000 });

test('block-position floors negative and fractional coordinates', () => assert.deepEqual(report('block-position').block, { x: -1, y: 64, z: -17 }));
test('chunk uses positive local coordinates for negative chunks', () => assert.deepEqual(report('chunk'), { x: -1, z: -2, localX: 15, localZ: 15 }));
test('section reports all three axes including negative Y', () => {
  const input = state(); input.player.position.y = -0.1;
  assert.deepEqual(surveyView(input, 'section'), { section: { x: -1, y: -1, z: -2 }, local: { x: 15, y: 15, z: 15 } });
});
test('region handles negative file names and local chunks', () => assert.deepEqual(report('region'), { x: -1, z: -1, file: 'r.-1.-1.mca', chunkX: 31, chunkZ: 30 }));
test('chunk-bounds reports inclusive coordinate range', () => assert.deepEqual(report('chunk-bounds'), { min: { x: -16, z: -32 }, max: { x: -1, z: -17 } }));
test('height-limits uses dimension-specific vanilla ranges and marks unknown dimensions', () => {
  assert.equal(report('height-limits').blocksAboveMin, 128);
  const input = state(); input.player.dimension = 'minecraft:the_nether';
  assert.deepEqual(surveyView(input, 'height-limits').standardVanillaLimits, { min: 0, max: 255 });
  input.player.dimension = 'custom:world';
  assert.equal(surveyView(input, 'height-limits').standardVanillaLimits, null);
});
test('border-margin measures signed distance to goto bounds', () => {
  assert.equal(report('border-margin').east, 29_999_984.1);
  assert.equal(report('border-margin').north, 29_999_967.9);
  assert.match(report('border-margin').caveat, /world border may be smaller/);
});
test('vitals derives hearts and deficits without assuming unknown values', () => {
  const result = report('vitals');
  assert.equal(result.hearts, 6.5); assert.equal(result.missingHealthTo20, 7); assert.equal(result.missingHungerTo20, 13);
  const input = state(); input.player.health = undefined; input.player.hunger = NaN;
  assert.equal(surveyView(input, 'vitals').hearts, null); assert.equal(surveyView(input, 'vitals').missingHungerTo20, null);
});
test('threat-types combines matching entity types', () => assert.deepEqual(report('threat-types').types[0], { name: 'minecraft:zombie', count: 3 }));
test('nearest-threat derives distance and preserves missing-distance count', () => {
  assert.ok(Math.abs(report('nearest-threat').threat.distance - 3) < 1e-10); assert.equal(report('nearest-threat').unknownDistance, 1);
});
test('threat-bands are nonoverlapping at 5/16/32 boundaries', () => {
  assert.deepEqual(report('threat-bands'), { supported: true, scope: 'partial_observation', within5: 2, over5To16: 1, over16To32: 1, over32: 1, unknownDistance: 1 });
  const input = state(); input.threats = [5, 5.1, 16, 16.1, 32, 32.1].map(distance => ({ distance }));
  const result = surveyView(input, 'threat-bands');
  assert.deepEqual([result.within5, result.over5To16, result.over16To32, result.over32], [1, 2, 2, 1]);
});
test('threat-directions marks unlocated entries rather than inventing direction', () => {
  assert.deepEqual(report('threat-directions').groups, [{ name: 'same_column', count: 1 }, { name: 'south', count: 1 }]);
  assert.equal(report('threat-directions').unlocated, 4);
});
test('threat-elevation compares occupied block levels', () => {
  const result = report('threat-elevation');
  assert.deepEqual([result.above, result.below, result.level, result.unlocated], [0, 1, 1, 4]);
});
test('block-types counts observed entries by name', () => assert.deepEqual(report('block-types').types[0], { name: 'minecraft:oak_log', count: 2 }));
test('block-bounds omits unlocated entries and handles empty collections', () => {
  assert.deepEqual(report('block-bounds').bounds, { min: { x: -2, y: 60, z: -16 }, max: { x: 10, y: 65, z: -16 } });
  assert.equal(report('block-bounds').unlocated, 1);
  assert.equal(surveyView({ ...state(), blocks: [] }, 'block-bounds').bounds, null);
});
test('block-levels groups and numerically sorts levels', () => assert.deepEqual(report('block-levels').levels,
  [{ y: 60, count: 1 }, { y: 63, count: 2 }, { y: 64, count: 1 }, { y: 65, count: 1 }]));
test('block-directions groups compass headings', () => {
  assert.deepEqual(report('block-directions').groups, [{ name: 'east', count: 3 }, { name: 'southeast', count: 1 }, { name: 'west', count: 1 }]);
  assert.equal(report('block-directions').unlocated, 1);
});
test('logs returns only listed vanilla harvestable logs and stems', () => {
  assert.equal(report('logs').blocks.length, 2);
  const input = state(); input.blocks.push({ name: 'minecraft:crimson_stem', distance: 1 }, { name: 'minecraft:oak_planks', distance: 0 });
  assert.equal(surveyView(input, 'logs').blocks[0].name, 'minecraft:crimson_stem');
});
test('ores includes deepslate and ancient debris while excluding non-ore blocks', () => {
  assert.equal(report('ores').blocks[0].name, 'minecraft:deepslate_iron_ore');
  const input = state(); input.blocks.push({ name: 'minecraft:ancient_debris', distance: 1 });
  assert.equal(surveyView(input, 'ores').blocks.length, 2);
});
test('hazards identifies potentially harmful blocks with an explicit caveat', () => {
  assert.equal(report('hazards').blocks[0].name, 'minecraft:lava'); assert.match(report('hazards').caveat, /lit state/);
});
test('liquids lists only lava and water ordered by distance', () => assert.deepEqual(report('liquids').blocks.map(entry => entry.name), ['minecraft:lava', 'minecraft:water']));
test('container-types deduplicates positions', () => assert.deepEqual(report('container-types').types, [{ name: 'minecraft:barrel', count: 1 }, { name: 'minecraft:chest', count: 1 }]));
test('container-coverage distinguishes unknown and known empty contents', () => {
  const result = report('container-coverage'); assert.deepEqual([result.total, result.opened, result.unopened, result.knownEmpty], [2, 1, 1, 1]);
  assert.equal(result.contents, 'last_observed');
});
test('container-age reports unknown ages and flags clocks ahead of local time', () => {
  const result = report('container-age'); assert.equal(result.containers[0].ageSeconds, 2); assert.equal(result.containers[1].ageSeconds, null);
  const input = state(); input.containers[0].observedAt = 4000;
  const skewed = surveyView(input, 'container-age', { now: 3000 }).containers[0];
  assert.equal(skewed.ageSeconds, -1); assert.equal(skewed.clockSkew, true);
  assert.throws(() => surveyView(input, 'container-age', { now: NaN }), /time must be finite/);
});
test('observation-coverage distinguishes absent arrays from empty observations', () => {
  const input = state(); input.threats = undefined; input.blocks = [];
  assert.deepEqual(surveyView(input, 'observation-coverage').collections, [{ field: 'blocks', supported: true, observedCount: 0 },
    { field: 'threats', supported: false, observedCount: null }, { field: 'containers', supported: true, observedCount: 3 }]);
});
test('all 25 reports reject disconnected observations and unknown reports', () => {
  assert.equal(Object.keys(SURVEY_REPORTS).length, 25);
  for (const name of Object.keys(SURVEY_REPORTS)) assert.throws(() => surveyView({ connected: false }, name), /Enter a world/);
  assert.throws(() => surveyView(state(), 'wat'), /Unknown survey/);
  assert.equal(surveyView({ ...state(), threats: undefined }, 'nearest-threat').supported, false);
  assert.equal(surveyView({ ...state(), threats: [] }, 'nearest-threat').threat, null);
});
test('all 25 Commander entry points dispatch their matching read-only view', async () => {
  for (const name of Object.keys(SURVEY_REPORTS)) {
    const program = new Command();
    let calls = 0;
    const input = state(); input.containers.forEach(container => { delete container.observedAt; });
    registerSurvey(program, { view: selector => { calls++; assert.deepEqual(selector(input), surveyView(input, name)); } });
    await program.parseAsync(['survey', name], { from: 'user' });
    assert.equal(calls, 1);
    assert.equal(program.commands[0].commands.length, 25);
  }
});

test('live backend category filters distinguish unavailable scans from no matches', () => {
  for (const backend of ['fabric', 'mineflayer']) {
    for (const name of ['ores', 'hazards', 'liquids']) {
      const input = state(); input.backend = backend;
      input.blocks = [{ name: 'minecraft:oak_log', x: 0, y: 64, z: 0 }];
      const result = surveyView(input, name);
      assert.equal(result.supported, false);
      assert.deepEqual(result.blocks, []);
      assert.match(result.reason, /only report collection targets/);
    }
  }
});
