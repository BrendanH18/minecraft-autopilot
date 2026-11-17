import test from 'node:test';
import assert from 'node:assert/strict';
import { Command } from 'commander';
import { execFileSync } from 'node:child_process';

const groups = [
  'bearing',
  'grid',
  'shape',
  'earthworks',
  'railplan',
  'lightplan',
  'perimeter',
  'packing',
  'production',
  'fuelplan',
  'tradeplan',
  'farmplan',
  'ration',
  'allocation',
  'inventory-series',
  'storage-series',
  'vitals-series',
  'routine-metrics',
  'event-query',
  'snapshot-query',
];

test('batch 9 registers exactly 500 distinct documented offline commands', async () => {
  let total = 0;
  for (const name of groups) {
    const module = await import(`../src/${name}-tools.js`);
    const registerName = `register${name
      .split('-')
      .map((s) => s[0].toUpperCase() + s.slice(1))
      .join('')}Tools`;
    const commands = module[`${name.toUpperCase().replaceAll('-', '_')}_COMMANDS`];
    assert.equal(commands.length, 25, `${name}: inventory length`);
    const commandNames = commands.map(([signature]) => signature.split(' ')[0]);
    assert.equal(new Set(commandNames).size, 25, `${name}: unique names`);
    const program = new Command();
    module[registerName](program, { print() {} });
    const group = program.commands.find((c) => c.name() === name);
    assert.ok(group, `${name}: registered group`);
    assert.deepEqual(
      group.commands.map((c) => c.name()),
      commandNames,
    );
    // A real process proves registration in the shipped entrypoint, with an
    // intentionally nonexistent bridge so help cannot depend on a live game.
    const help = execFileSync(
      process.execPath,
      ['src/cli.js', '--bridge', '.runtime/missing-batch9-bridge.json', name, '--help'],
      { encoding: 'utf8' },
    );
    for (const command of commandNames) assert.ok(help.includes(command), `${name}: help contains ${command}`);
    const { readFile } = await import('node:fs/promises');
    const guide = await readFile(new URL(`../docs/${name.toUpperCase()}.md`, import.meta.url), 'utf8');
    for (const command of commandNames) assert.ok(guide.includes(command), `${name}: guide contains ${command}`);
    total += group.commands.length;
  }
  assert.equal(total, 500);
});
