import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { Command } from 'commander';
import { PLANNING_GROUPS, EXTENSION_GROUPS, registerPlanningExtensions } from '../src/planning-tools.js';
import { STRUCTURE_GROUPS } from '../src/planning-structures.js';
import { OPERATION_GROUPS } from '../src/planning-operations.js';
import { calculateOffline } from '../src/offline-kit.js';
import { STUDY_WORKFLOWS, studyCatalog } from '../src/planning-studies.js';
import { STRUCTURE_CASES } from './planning-structures-cases.js';
import { OPERATION_CASES } from './planning-operations-cases.js';

const cases = [...STRUCTURE_CASES, ...OPERATION_CASES];
const bridge = ['--bridge', '.runtime/nonexistent-batch13.json'];
const cli = (args) => execFileSync(process.execPath, ['src/cli.js', ...bridge, ...args], { encoding: 'utf8' });
const guides = [
  ['../docs/PLANNING-STRUCTURES.md', STRUCTURE_GROUPS],
  ['../docs/PLANNING-OPERATIONS.md', OPERATION_GROUPS],
];

test('batch 13 has exactly 200 documented planners with independent examples', async () => {
  assert.deepEqual(
    EXTENSION_GROUPS.map((group) => group.name),
    ['stairplan', 'roundplan', 'rampart', 'warehouse', 'stripmine', 'herd', 'signalplan', 'linkplan'],
  );
  assert.equal(new Set([...PLANNING_GROUPS, ...EXTENSION_GROUPS].map((group) => group.name)).size, 48);
  assert.equal(cases.length, 200);
  const caseNames = cases.map(([group, command]) => `${group} ${command}`);
  assert.equal(new Set(caseNames).size, 200);
  const program = new Command();
  registerPlanningExtensions(program, { print() {} });
  assert.equal(program.commands.length, 8);
  for (const [file, groups] of guides) {
    const guide = await readFile(new URL(file, import.meta.url), 'utf8');
    let number = 0;
    for (const group of groups) {
      assert.equal(group.commands.length, 25, group.name);
      const names = group.commands.map((spec) => spec.signature.split(' ')[0]);
      assert.equal(new Set(names).size, 25, group.name);
      assert.deepEqual(
        program.commands.find((c) => c.name() === group.name).commands.map((c) => c.name()),
        names,
      );
      assert.ok(
        guide.includes(`## \`${group.name}\`\n\n${group.note}\n`),
        `${group.name}: guide section must open with the group note`,
      );
      for (const spec of group.commands) {
        number += 1;
        assert.ok(caseNames.includes(`${group.name} ${spec.signature.split(' ')[0]}`), spec.signature);
        // The guide row is the contract: number, signature, ordered input types, behavior.
        const row = `| ${number} | \`${spec.signature}\` | \`${spec.types.join(',')}\` | ${spec.description} |`;
        assert.ok(guide.includes(row), `${group.name}: guide must contain the row ${row}`);
        assert.match(spec.description, /^[A-Z].*\.$/, `${group.name} ${spec.signature}: description is a sentence`);
        assert.ok(!spec.description.includes('|'), spec.signature);
      }
      // Help and one result per group go through the actual shipped entrypoint.
      // A missing bridge proves these tools need no Minecraft connection.
      const help = cli([group.name, '--help']);
      for (const name of names) assert.ok(help.includes(name), `${group.name} help: ${name}`);
      const [, command, args] = cases.find(([name]) => name === group.name);
      assert.ok(
        guide.includes(`mc-agent ${group.name} ${command} `),
        `${group.name}: guide example uses the first worked case`,
      );
      assert.deepEqual(
        JSON.parse(cli([group.name, command, '--', ...args])),
        JSON.parse(JSON.stringify(calculateOffline(group, command, args))),
      );
    }
    assert.equal(number, 100);
  }
  assert.equal(
    EXTENSION_GROUPS.reduce((total, group) => total + group.commands.length, 0),
    200,
  );
});

test('batch 13 adds exactly 5,000 callable entries: 200 planners and 4,800 study combinations', () => {
  const before = { planners: 1000, workflows: 6 };
  assert.equal(
    PLANNING_GROUPS.reduce((total, group) => total + group.commands.length, 0),
    before.planners,
  );
  const catalogs = [...PLANNING_GROUPS, ...EXTENSION_GROUPS].map(({ name }) => studyCatalog(name));
  const planners = catalogs.reduce((sum, group) => sum + group.planners, 0);
  const combinations = catalogs.reduce((sum, group) => sum + group.combinations, 0);
  const addedWorkflows = Object.keys(STUDY_WORKFLOWS).slice(before.workflows);
  assert.deepEqual(addedWorkflows, ['factorial', 'summarize', 'pareto']);
  const addedPlanners = planners - before.planners;
  const addedCombinations = combinations - before.planners * before.workflows;
  assert.equal(addedPlanners, 200);
  assert.equal(combinations, 10800);
  assert.equal(addedCombinations, 4800);
  // New workflows on the original planners, new workflows on the new planners,
  // and the original workflows on the new planners.
  assert.equal(addedWorkflows.length * before.planners, 3000);
  assert.equal(addedWorkflows.length * addedPlanners, 600);
  assert.equal(before.workflows * addedPlanners, 1200);
  assert.equal(addedPlanners + addedCombinations, 5000);
  for (const group of EXTENSION_GROUPS) assert.equal(studyCatalog(group.name).combinations, 225);
});

test('new groups appear once in top-level help and reject invalid input without a report', () => {
  const help = cli(['--help']);
  for (const group of EXTENSION_GROUPS) {
    assert.equal(
      help.split('\n').filter((line) => line.startsWith(`  ${group.name} `) || line === `  ${group.name}`).length,
      1,
      group.name,
    );
    const [, command, args] = cases.find(([name]) => name === group.name);
    const result = spawnSync(
      process.execPath,
      ['src/cli.js', ...bridge, group.name, command, '--', ...args.map((value, index) => (index ? value : 'NaN'))],
      { encoding: 'utf8' },
    );
    assert.notEqual(result.status, 0, group.name);
    assert.equal(result.stdout, '', group.name);
    assert.match(result.stderr, /Error/, group.name);
  }
});
