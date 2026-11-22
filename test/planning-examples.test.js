import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { listPlanningExamples, runPlanningExample } from '../src/planning-examples.js';
import { close } from './planning-study-workflow-checks.js';

test('all worked examples have unique planner keys and reproduce their independently computed results', () => {
  const examples = listPlanningExamples();
  assert.equal(examples.length, 949);
  assert.equal(new Set(examples.map(({ group, command }) => `${group}/${command}`)).size, examples.length);
  for (const { group, command } of examples) {
    assert.doesNotThrow(() => {
      const { result, expected } = runPlanningExample(group, command);
      close(result, expected);
    }, `${group} ${command}`);
  }
});

function cli(...args) {
  return spawnSync(process.execPath, ['src/cli.js', '--json', 'study', ...args], { encoding: 'utf8' });
}

function readOutput(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('CLI lists the catalog, filters it by group, and replays a worked example', () => {
  assert.deepEqual(readOutput(cli('examples')), listPlanningExamples());
  const examples = readOutput(cli('examples', 'beacon-plan'));
  assert.equal(examples.length, 25);
  assert.ok(examples.every(({ group }) => group === 'beacon-plan'));
  const report = readOutput(cli('example', 'beacon-plan', 'tier-materials'));
  assert.equal(report.group, 'beacon-plan');
  assert.equal(report.command, 'tier-materials');
  assert.deepEqual(report.args, [3, 4]);
  assert.deepEqual(report.expected, { layers: [9, 25, 49, 81], total: 164 });
  assert.deepEqual(report.result, report.expected);
  assert.match(report.note, /Budget square beacon structures/);
});

test('CLI reports missing example groups and commands without success output', () => {
  for (const args of [
    ['examples', '__proto__'],
    ['example', 'beacon-plan', 'constructor'],
  ]) {
    const result = cli(...args);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(JSON.parse(result.stderr).error, /No worked example/);
  }
});
