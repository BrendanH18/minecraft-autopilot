import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { Command } from 'commander';
import { PLANNING_GROUPS, registerPlanningTools } from '../src/planning-tools.js';
import { calculateOffline, readInput } from '../src/offline-kit.js';
import { SPATIAL_CASES } from './planning-spatial-cases.js';
import { RESOURCE_CASES } from './planning-resources-cases.js';
import { ANALYSIS_CASES } from './planning-analysis-cases.js';
import { COORDINATION_CASES } from './planning-coordination-cases.js';
import { CLI_PATH } from './cli-path.js';

const cases = [...SPATIAL_CASES, ...RESOURCE_CASES, ...ANALYSIS_CASES, ...COORDINATION_CASES];

test('batch 10 has exactly 1,000 documented commands with independent examples', async () => {
  assert.equal(PLANNING_GROUPS.length, 40);
  assert.equal(new Set(PLANNING_GROUPS.map((g) => g.name)).size, 40);
  assert.equal(cases.length, 1000);
  const caseNames = cases.map(([group, command]) => `${group} ${command}`);
  assert.equal(new Set(caseNames).size, 1000);
  const program = new Command();
  registerPlanningTools(program, { print() {} });
  assert.equal(program.commands.length, 40);
  const docs = (
    await Promise.all(
      ['SPATIAL', 'RESOURCES', 'ANALYSIS', 'COORDINATION'].map((name) =>
        readFile(new URL(`../docs/PLANNING-${name}.md`, import.meta.url), 'utf8'),
      ),
    )
  ).join('\n');
  for (const group of PLANNING_GROUPS) {
    assert.equal(group.commands.length, 25, group.name);
    const names = group.commands.map((c) => c.signature.split(' ')[0]);
    assert.equal(new Set(names).size, 25, group.name);
    assert.deepEqual(
      program.commands.find((c) => c.name() === group.name).commands.map((c) => c.name()),
      names,
    );
    for (const command of group.commands) {
      assert.ok(caseNames.includes(`${group.name} ${command.signature.split(' ')[0]}`), command.signature);
      assert.ok(docs.includes(command.signature), `${group.name}: guide missing ${command.signature}`);
    }
    // Help and one result per group go through the actual shipped entrypoint.
    // A missing bridge proves these tools need no Minecraft connection.
    const help = execFileSync(
      process.execPath,
      [CLI_PATH, '--bridge', '.runtime/nonexistent-batch10.json', group.name, '--help'],
      { encoding: 'utf8' },
    );
    for (const name of names) assert.ok(help.includes(name), `${group.name} help: ${name}`);
    const [, command, args] = cases.find(([name]) => name === group.name);
    const output = execFileSync(
      process.execPath,
      [CLI_PATH, '--bridge', '.runtime/nonexistent-batch10.json', group.name, command, '--', ...args],
      { encoding: 'utf8' },
    );
    assert.deepEqual(JSON.parse(output), JSON.parse(JSON.stringify(calculateOffline(group, command, args))));
  }
  assert.equal(
    PLANNING_GROUPS.reduce((n, g) => n + g.commands.length, 0),
    1000,
  );
});

test('offline inputs reject malformed, oversized, and nonfinite values', () => {
  for (const type of ['n', 'q', 'p', 'i', 'c', 's', 'r']) {
    for (const value of ['', ' ', 'NaN', 'Infinity', null, true, {}, '1000001']) {
      assert.throws(() => readInput(value, type), `${type}: ${value}`);
    }
  }
  for (const type of ['l', 'L', 'P', 'C', 'S']) {
    assert.throws(() => readInput('1,,2', type));
    assert.throws(() => readInput(Array(1002).join('1,'), type));
  }
  assert.throws(() => readInput('[[0,1],[3,2]]', 'intervals'));
  assert.throws(() => readInput('[[null,1]]', 'points2'));
  assert.throws(() => readInput('[[1,2,3]]', 'points2'));
  assert.throws(() => readInput('[]', 'points3'));
  const group = {
    name: 'test',
    note: 'Offline',
    commands: [{ signature: 'large <n>', types: ['c'], run: () => Array(1001).fill(0) }],
  };
  assert.throws(() => calculateOffline(group, 'large', ['1']));
  assert.throws(() => calculateOffline(group, 'missing', ['1']));
});

test('invalid batch 10 CLI input fails without emitting a successful report', () => {
  const result = spawnSync(process.execPath, [CLI_PATH, 'interval-set', 'covered', '[[2,1]]'], {
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Interval starts/);
});
