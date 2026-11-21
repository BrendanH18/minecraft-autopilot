import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { findRecipe, listRecipes } from '../src/planning-recipes.js';
import { calculateStudy } from '../src/planning-studies.js';
import { PLANNING_GROUPS } from '../src/planning-tools.js';

test('1,000 recipes cover the original planners with usable comparisons', () => {
  const recipes = listRecipes();
  assert.equal(recipes.length, 1000);
  assert.deepEqual(
    new Set(recipes.map(({ group, command }) => `${group}/${command}`)),
    new Set(
      PLANNING_GROUPS.flatMap(({ name, commands }) =>
        commands.map(({ signature }) => `${name}/${signature.split(' ')[0]}`),
      ),
    ),
  );
  const failures = [];
  for (const { group, command, purpose } of recipes) {
    try {
      assert.ok(purpose.trim());
      const { request } = findRecipe(group, command);
      const report = calculateStudy('compare', group, command, request);
      assert.ok(
        report.candidates.some(({ changes }) => changes.length > 0),
        'no candidate changes the result',
      );
    } catch (error) {
      failures.push(`${group} ${command}: ${error.message}`);
    }
  }
  assert.deepEqual(failures, []);
});

function cli(...args) {
  return spawnSync(process.execPath, ['src/cli.js', 'study', ...args], { encoding: 'utf8' });
}

function readOutput(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('CLI lists a recipe group, runs a comparison and exports its request', () => {
  const catalog = readOutput(cli('recipes', 'reach'));
  assert.equal(catalog.length, 25);
  const info = catalog.find(({ command }) => command === 'roundtrip-radius');
  assert.equal(info.group, 'reach');
  const report = readOutput(cli('recipe', 'reach', 'roundtrip-radius'));
  assert.equal(report.purpose, info.purpose);
  assert.equal(report.baseline.result, 140);
  assert.equal(report.candidates[0].result, 160);
  const request = readOutput(cli('recipe', 'reach', 'roundtrip-radius', '--request'));
  const rerun = readOutput(cli('compare', 'reach', 'roundtrip-radius', JSON.stringify(request)));
  assert.deepEqual(report, { purpose: info.purpose, ...rerun });
});

test('CLI reports an unknown recipe and produces no success JSON', () => {
  const result = cli('recipe', 'reach', 'constructor');
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Unknown recipe: reach constructor/);
  assert.throws(() => listRecipes('__proto__'), /Unknown recipe group/);
});
