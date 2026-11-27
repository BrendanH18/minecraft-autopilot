import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Command } from 'commander';
import {
  INVENTORY_SERIES_COMMANDS,
  inventorySeriesReport,
  registerInventorySeriesTools,
} from '../src/inventory-series-tools.js';
import {
  STORAGE_SERIES_COMMANDS,
  storageSeriesReport,
  registerStorageSeriesTools,
} from '../src/storage-series-tools.js';
import { VITALS_SERIES_COMMANDS, vitalsSeriesReport, registerVitalsSeriesTools } from '../src/vitals-series-tools.js';
import { CLI_PATH } from './cli-path.js';
export const seriesFixtures = [1, 3, 5].map((v, i) => ({
  savedAt: `2026-01-01T00:00:0${i}Z`,
  player: { position: { x: v, y: 64, z: 0 }, dimension: 'minecraft:overworld', health: v, hunger: v },
  inventory: [{ name: 'dirt', count: v }],
  containers: [{ x: 0, y: 64, z: 0, items: [{ name: 'dirt', count: v }] }],
}));
const expected = {
  mean: 3,
  median: 3,
  variance: 8 / 3,
  'standard-deviation': Math.sqrt(8 / 3),
  spread: 4,
  quartiles: { lower: 2, median: 3, upper: 4, interquartileRange: 2 },
  percentile: 2,
  skewness: 0,
  'regression-slope': 2,
  'regression-intercept': 1,
  'regression-residuals': [0, 0, 0],
  'r-squared': 1,
  'trapezoid-integral': 6,
  'left-integral': 4,
  'right-integral': 8,
  'coefficient-variation': Math.sqrt(8 / 3) / 3,
  'lag-correlation': 1,
  'moving-mean': [
    { sample: 2, value: 2 },
    { sample: 3, value: 4 },
  ],
  'moving-median': [
    { sample: 2, value: 2 },
    { sample: 3, value: 4 },
  ],
  acceleration: [{ sample: 3, value: 0 }],
  'fraction-above': 1 / 3,
  'fraction-below': 1 / 3,
  'threshold-crossings': [{ sample: 2, direction: 'up' }],
  'maximum-drawdown': 0,
  'maximum-drawup': 4,
};
const params = (name) =>
  name === 'percentile'
    ? ['25']
    : name.startsWith('moving-')
      ? ['2']
      : ['fraction-above', 'fraction-below', 'threshold-crossings'].includes(name)
        ? ['3']
        : [];
for (const [domain, commands, report, register, selector] of [
  ['inventory-series', INVENTORY_SERIES_COMMANDS, inventorySeriesReport, registerInventorySeriesTools, 'dirt'],
  ['storage-series', STORAGE_SERIES_COMMANDS, storageSeriesReport, registerStorageSeriesTools, 'dirt'],
  ['vitals-series', VITALS_SERIES_COMMANDS, vitalsSeriesReport, registerVitalsSeriesTools, 'health'],
]) {
  test(`${domain}: every statistic and real file CLI`, async () => {
    const dir = await mkdtemp(join(process.cwd(), '.series-test-'));
    try {
      const files = await Promise.all(
        seriesFixtures.map(async (v, i) => {
          const file = join(dir, `${i}.json`);
          await writeFile(file, JSON.stringify(v));
          return file;
        }),
      );
      assert.equal(commands.length, 25);
      for (const [signature] of commands) {
        const name = signature.split(' ')[0],
          args = params(name);
        assert.deepEqual(report(seriesFixtures, selector, name, args).result, expected[name], name);
        let output;
        const program = new Command();
        register(program, {
          print: (value) => {
            output = value;
          },
        });
        await program.parseAsync(['node', 'test', domain, name, selector, ...args, ...files]);
        assert.deepEqual(output.result, expected[name], `${name} CLI`);
        const processResult = spawnSync(process.execPath, [CLI_PATH, domain, name, selector, ...args, ...files], {
          encoding: 'utf8',
          timeout: 15000,
        });
        assert.equal(processResult.status, 0, processResult.stderr);
        assert.deepEqual(JSON.parse(processResult.stdout).result, expected[name], `${name} shipped CLI`);
        for (let i = 0; i < files.length; i++)
          assert.equal(await readFile(files[i], 'utf8'), JSON.stringify(seriesFixtures[i]), 'input unchanged');
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  test(`${domain}: invalid inputs and unknown evidence`, () => {
    assert.throws(() => report([], selector, 'mean'));
    assert.throws(() => report([...seriesFixtures].reverse(), selector, 'mean'));
    assert.throws(() => report(seriesFixtures, selector, 'what'));
    assert.throws(() => report(seriesFixtures, selector, 'percentile', ['101']));
    assert.throws(() => report(seriesFixtures, selector, 'moving-mean', ['4']));
    const missing = structuredClone(seriesFixtures);
    if (domain === 'inventory-series') delete missing[1].inventory;
    else if (domain === 'storage-series') delete missing[1].containers[0].items;
    else delete missing[1].player.health;
    assert.equal(report(missing, selector, 'mean').result, null);
  });
}
test('series constant data and dimension changes', () => {
  const values = structuredClone(seriesFixtures);
  values.forEach((s) => {
    s.player.health = 3;
  });
  assert.equal(vitalsSeriesReport(values, 'health', 'r-squared').result, null);
  assert.equal(vitalsSeriesReport(values, 'health', 'skewness').result, null);
  assert.equal(vitalsSeriesReport(values, 'health', 'maximum-drawdown').result, 0);
  values[1].player.dimension = 'minecraft:the_nether';
  assert.equal(vitalsSeriesReport(values, 'x', 'mean').result, null);
  assert.equal(storageSeriesReport(values, 'dirt', 'mean').result, null);
});
