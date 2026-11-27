import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { LEDGER_COMMANDS, ledgerReport } from '../src/ledger-tools.js';
import { DEPOT_COMMANDS, depotReport } from '../src/depot-tools.js';
import { testDirectory } from '../../../test/helpers.js';
import { CLI_PATH } from './cli-path.js';

const exec = promisify(execFile);
const ledgerArgs = {
  'item-percent': ['bread'],
  'composition-shift': [],
  'new-types': [],
  'vanished-types': [],
  'retained-stock': [],
  'replacement-load': [],
  'quota-progress': ['dirt', '20'],
  'quota-crossings': ['bread=6', 'dirt=20'],
  'kit-regressions': ['bread=6', 'dirt=20'],
  'kit-progress': ['bread=6', 'dirt=20'],
  'kit-bundles': ['bread=2', 'dirt=4'],
  'food-change': [],
  'food-mix': [],
  'ration-change': ['10'],
  'minimum-stacks': [],
  'item-stacks': ['dirt'],
  'stack-pressure': ['2'],
  'packing-room': ['dirt', '30'],
  'loss-budget': ['bread=2', 'dirt=4'],
  'gain-budget': ['bread=2', 'dirt=4'],
  'allowed-losses': ['dirt'],
  'unchanged-except': ['dirt'],
  'share-shift': ['bread'],
  'type-similarity': [],
  'quantity-similarity': [],
};
const depotArgs = {
  coverage: [],
  discovered: [],
  missing: [],
  opened: [],
  obscured: [],
  refreshed: [],
  aging: [],
  'changed-containers': [],
  'item-changes': [],
  'item-total': ['dirt'],
  'matched-item': ['dirt'],
  'source-gains': ['dirt'],
  'source-losses': ['dirt'],
  'redistribution-bound': ['dirt'],
  'newly-stocked': [],
  depleted: [],
  'stable-stock': [],
  'food-change': [],
  'stack-change': [],
  concentration: ['dirt'],
  redundancy: ['dirt'],
  'carried-stored': ['dirt'],
  'pooled-quota': ['dirt', '50'],
  'kit-pool': ['dirt=50', 'bread=10'],
  'refresh-order': ['20'],
};

test('all 50 ledger and depot commands run as offline CLI processes and leave input bytes unchanged', {
  timeout: 120000,
}, async (t) => {
  const root = await testDirectory(t),
    first = join(root, 'first.json'),
    last = join(root, 'last.json');
  const before = {
    savedAt: '2026-01-01T00:00:00Z',
    player: { position: { x: 0, y: 64, z: 0 }, dimension: 'minecraft:overworld' },
    inventory: [
      { name: 'dirt', count: 8 },
      { name: 'bread', count: 4 },
    ],
    containers: [
      { x: 0, y: 64, z: 0, items: [{ name: 'dirt', count: 10 }], observedAt: Date.parse('2026-01-01T00:00:00Z') },
    ],
  };
  const after = {
    ...before,
    savedAt: '2026-01-01T00:01:00Z',
    inventory: [
      { name: 'dirt', count: 4 },
      { name: 'bread', count: 8 },
    ],
    containers: [
      { x: 0, y: 64, z: 0, items: [{ name: 'dirt', count: 14 }], observedAt: Date.parse('2026-01-01T00:00:30Z') },
    ],
  };
  await writeFile(first, JSON.stringify(before));
  await writeFile(last, JSON.stringify(after));
  let exercised = 0;
  for (const [group, commands, fixtures, calculate] of [
    ['ledger', LEDGER_COMMANDS, ledgerArgs, ledgerReport],
    ['depot', DEPOT_COMMANDS, depotArgs, depotReport],
  ]) {
    assert.equal(commands.length, 25);
    for (const [signature] of commands) {
      const command = signature.split(' ')[0],
        args = fixtures[command];
      assert.ok(args, command);
      const { stdout, stderr } = await exec(process.execPath, [
        CLI_PATH,
        '--bridge',
        join(root, 'does-not-exist.json'),
        '--json',
        group,
        command,
        first,
        last,
        ...args,
      ]);
      const output = JSON.parse(stdout);
      assert.deepEqual(output, calculate(before, after, command, args), `${group} ${command}`);
      assert.equal(stderr, '');
      exercised++;
      if (group === 'ledger' && command === 'food-change') assert.equal(output.delta, 20);
      if (group === 'depot' && command === 'carried-stored') assert.equal(output.pooled.delta, 0);
    }
  }
  assert.equal(exercised, 50);
  assert.equal(await readFile(first, 'utf8'), JSON.stringify(before));
  assert.equal(await readFile(last, 'utf8'), JSON.stringify(after));
  await assert.rejects(
    exec(process.execPath, [CLI_PATH, '--json', 'depot', 'coverage', join(root, 'missing.json'), last]),
    (e) => e.code === 1 && JSON.parse(e.stderr).error.includes('ENOENT'),
  );
  await assert.rejects(
    exec(process.execPath, [CLI_PATH, '--json', 'ledger', 'food-change', last, first]),
    (e) => e.code === 1 && JSON.parse(e.stderr).error.includes('later'),
  );
});
