import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Command } from 'commander';
import { timelineReport as report, TIMELINE_COMMANDS, registerTimelineTools } from '../src/timeline-tools.js';
import { testDirectory } from './helpers.js';
const samples = [
  {
    savedAt: '2026-01-01T00:00:00Z',
    player: { position: { x: 0, y: 64, z: 0 }, dimension: 'minecraft:overworld', health: 20, hunger: 15 },
    inventory: [
      { name: 'minecraft:dirt', count: 2 },
      { name: 'minecraft:stone', count: 4 },
    ],
  },
  {
    savedAt: '2026-01-01T00:01:00Z',
    player: { position: { x: 3, y: 64, z: 4 }, dimension: 'minecraft:overworld', health: 17, hunger: 10 },
    inventory: [
      { name: 'minecraft:dirt', count: 7 },
      { name: 'minecraft:stone', count: 4 },
    ],
    home: { x: 3, y: 64, z: 4 },
  },
  {
    savedAt: '2026-01-01T00:03:00Z',
    player: { position: { x: 8, y: 65, z: 0 }, dimension: 'minecraft:the_nether', health: 19, hunger: 20 },
    inventory: [
      { name: 'minecraft:dirt', count: 1 },
      { name: 'minecraft:stone', count: 4 },
    ],
  },
];
const cases = [
  ['gains', [], (r) => assert.deepEqual(r.items, [{ name: 'minecraft:dirt', gained: 5 }])],
  ['losses', [], (r) => assert.deepEqual(r.items, [{ name: 'minecraft:dirt', lost: 6 }])],
  ['net-items', [], (r) => assert.deepEqual(r.items, [{ name: 'minecraft:dirt', net: -1 }])],
  ['turnover', [], (r) => assert.deepEqual(r.items[0], { name: 'minecraft:dirt', gained: 5, lost: 6, net: -1 })],
  [
    'item-history',
    ['dirt'],
    (r) =>
      assert.deepEqual(
        r.readings.map((x) => x.count),
        [2, 7, 1],
      ),
  ],
  ['item-rate', ['dirt'], (r) => assert.ok(Math.abs(r.perMinute + 1 / 3) < 1e-12)],
  ['item-peak', ['dirt'], (r) => assert.equal(r.peak.sample, 2)],
  ['item-target', ['dirt', '6'], (r) => assert.equal(r.first.sample, 2)],
  [
    'total-history',
    [],
    (r) =>
      assert.deepEqual(
        r.readings.map((x) => x.count),
        [6, 11, 5],
      ),
  ],
  [
    'diversity-history',
    [],
    (r) =>
      assert.deepEqual(
        r.readings.map((x) => x.count),
        [2, 2, 2],
      ),
  ],
  [
    'health-history',
    [],
    (r) =>
      assert.deepEqual(
        r.readings.map((x) => x.delta),
        [null, -3, 2],
      ),
  ],
  [
    'hunger-history',
    [],
    (r) =>
      assert.deepEqual(
        r.readings.map((x) => x.delta),
        [null, -5, 10],
      ),
  ],
  ['damage-events', [], (r) => assert.equal(r.events[0].delta, -3)],
  ['healing-events', [], (r) => assert.equal(r.events[0].delta, 2)],
  ['hunger-drops', [], (r) => assert.equal(r.events[0].delta, -5)],
  ['food-gains', [], (r) => assert.equal(r.events[0].delta, 10)],
  [
    'dimension-visits',
    [],
    (r) =>
      assert.deepEqual(
        r.visits.map((v) => v.samples),
        [2, 1],
      ),
  ],
  ['dimension-crossings', [], (r) => assert.equal(r.events[0].sample, 3)],
  [
    'movement-legs',
    [],
    (r) =>
      assert.deepEqual(
        r.legs.map((l) => l.distance),
        [5, null],
      ),
  ],
  [
    'path-summary',
    [],
    (r) => {
      assert.equal(r.sampledDistance, 5);
      assert.equal(r.unknownLegs, 1);
    },
  ],
  [
    'home-events',
    [],
    (r) =>
      assert.deepEqual(
        r.events.map((e) => e.sample),
        [2, 3],
      ),
  ],
  ['time-gaps', [], (r) => assert.equal(r.largest.seconds, 120)],
  ['largest-gains', ['1'], (r) => assert.equal(r.items[0].gained, 5)],
  ['largest-losses', ['1'], (r) => assert.equal(r.items[0].lost, 6)],
  ['stable-items', [], (r) => assert.deepEqual(r.items, [{ name: 'minecraft:stone', count: 4 }])],
];
for (const [name, args, check] of cases)
  test(`timeline ${name} result and file dispatch`, async (t) => {
    const expected = report(samples, name, args);
    check(expected);
    const directory = await testDirectory(t),
      files = samples.map((s, i) => join(directory, `${i}.json`));
    await Promise.all(files.map((f, i) => writeFile(f, JSON.stringify(samples[i]))));
    let printed;
    const program = new Command().exitOverride();
    registerTimelineTools(program, {
      print: (value) => {
        printed = value;
      },
    });
    await program.parseAsync(['timeline', name, ...args, ...files], { from: 'user' });
    assert.deepEqual(printed, expected);
    assert.match(printed.note, /net changes/);
  });
test('25 commands have distinct result coverage', () => {
  assert.equal(TIMELINE_COMMANDS.length, 25);
  assert.deepEqual(
    TIMELINE_COMMANDS.map(([s]) => s.split(' ')[0]),
    cases.map(([s]) => s),
  );
});
test('timeline validates snapshots, chronology, and arguments', () => {
  for (const [name, args] of cases) {
    for (const bad of [
      [],
      [samples[0]],
      Array(101).fill(samples[0]),
      [samples[1], samples[0]],
      [samples[0], samples[0]],
      [{}, samples[1]],
    ])
      assert.throws(() => report(bad, name, args));
  }
  for (const name of ['item-history', 'item-rate', 'item-peak', 'item-target'])
    assert.throws(() => report(samples, name, ['bad:item', '1']));
  for (const value of ['-1', '1.5', 'Infinity', '1000001'])
    assert.throws(() => report(samples, 'item-target', ['dirt', value]));
  for (const value of ['0', '101', 'NaN']) assert.throws(() => report(samples, 'largest-gains', [value]));
  assert.throws(() => report(samples, 'unknown'), /Unknown/);
});
test('unknown readings and dimensions never become evidence', () => {
  const values = structuredClone(samples);
  values[1].player.health = null;
  delete values[0].player.dimension;
  assert.deepEqual(
    report(values, 'health-history').readings.map((r) => r.delta),
    [null, null, null],
  );
  assert.equal(report(values, 'path-summary').comparableLegs, 0);
  assert.equal(report(values, 'item-target', ['air', '1']).first, null);
  assert.equal(report(values, 'item-peak', ['air']).peak.sample, 1);
  assert.equal(report(values, 'dimension-crossings').events.length, 1);
});
test('inventory aggregates split stacks and ignores zero quantities; input remains unchanged', () => {
  const values = structuredClone(samples);
  values[0].inventory.push({ name: 'minecraft:dirt', count: 3 }, { name: 'minecraft:air', count: 0 });
  const before = structuredClone(values);
  assert.equal(report(values, 'item-history', ['dirt']).readings[0].count, 5);
  assert.deepEqual(values, before);
});
