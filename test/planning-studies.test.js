import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { Command } from 'commander';
import { PLANNING_GROUPS } from '../src/planning-tools.js';
import { SPATIAL_CASES } from './planning-spatial-cases.js';
import { RESOURCE_CASES } from './planning-resources-cases.js';
import { ANALYSIS_CASES } from './planning-analysis-cases.js';
import { COORDINATION_CASES } from './planning-coordination-cases.js';
import { STUDY_WORKFLOWS, calculateStudy, readStudyRequest, registerPlanningStudies, studyCatalog } from '../src/planning-studies.js';

const examples = [...SPATIAL_CASES, ...RESOURCE_CASES, ...ANALYSIS_CASES, ...COORDINATION_CASES];
function close(actual, expected) {
  if (typeof expected === 'number') {
    assert.equal(typeof actual, 'number');
    assert.ok(Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
  } else if (expected !== null && typeof expected === 'object') {
    assert.deepEqual(Object.keys(actual), Object.keys(expected));
    for (const key of Object.keys(expected)) close(actual[key], expected[key]);
  } else assert.equal(actual, expected);
}

test('batch 11 inventories exactly 5,000 new planner/workflow combinations', async () => {
  const catalog = studyCatalog();
  assert.equal(catalog.planners, 1000);
  assert.equal(catalog.combinations, 5000);
  assert.deepEqual(catalog.workflows, ['batch', 'compare', 'sweep', 'sensitivity', 'rank']);
  assert.equal(catalog.groups.length, 40);
  assert.equal(examples.length, 1000);
  const keys = catalog.groups.flatMap(g => g.commands.flatMap(c => catalog.workflows.map(w => `${w}/${g.name}/${c.command}`)));
  assert.equal(new Set(keys).size, 5000);
  const docs = await readFile(new URL('../docs/PLANNING-STUDIES.md', import.meta.url), 'utf8');
  for (const group of PLANNING_GROUPS) {
    assert.ok(docs.includes(`\`${group.name}\``), group.name);
    assert.equal(studyCatalog(group.name).combinations, 125);
  }
  assert.throws(() => studyCatalog('not-a-planner'));
});

// Each of the 5,000 combinations is checked against the independent worked
// examples from batch 10, through both the API and Commander argument parsing.
// Reusing a baseline here tests identity invariants; focused workflow tests
// separately exercise changing inputs, rankings, and nested deltas.
for (const [group, command, args, expected] of examples) {
  test(`all five study workflows: ${group} ${command}`, async () => {
    const before = JSON.stringify(args);
    const requests = {
      batch: { cases: [args] },
      compare: { baseline: args, candidates: [args] },
      sweep: { args, index: 1, values: [args[0]] },
      sensitivity: { args, changes: [{ index: 1, values: [args[0]] }] },
      rank: { cases: [args, args], direction: 'min', measure: expected !== null && typeof expected === 'object' ? 'length' : 'value' },
    };
    let printed;
    const program = new Command().exitOverride();
    registerPlanningStudies(program, { print: result => { printed = result; } });
    for (const workflow of Object.keys(STUDY_WORKFLOWS)) {
      const report = calculateStudy(workflow, group, command, requests[workflow]);
      const rows = report.cases ?? report.candidates ?? report.ranked;
      close(rows[0].result, expected);
      if (report.baseline) close(report.baseline.result, expected);
      if (workflow === 'compare' || workflow === 'sensitivity') assert.deepEqual(rows[0].changes, []);
      if (workflow === 'rank') assert.deepEqual(report.ranked.map(row => row.case), [1, 2]);
      await program.parseAsync(['study', workflow, group, command, JSON.stringify(requests[workflow])], { from: 'user' });
      assert.deepEqual(printed, report);
      assert.match(report.note, /Offline/);
    }
    assert.equal(JSON.stringify(args), before);
  });
}

test('request reader accepts inline, bounded file and stdin with uniform validation', async () => {
  const directory = await mkdtemp('.runtime-study-');
  try {
    const path = `${directory}/request.json`;
    const request = { cases: [['2', '3', '4']] };
    const json = JSON.stringify(request);
    await writeFile(path, json);
    assert.deepEqual(await readStudyRequest(json), request);
    assert.deepEqual(await readStudyRequest(`@${path}`), request);
    assert.deepEqual(await readStudyRequest('-', { stdin: Readable.from([json.slice(0, 5), json.slice(5)]) }), request);
    await writeFile(path, ' '.repeat(1_000_001));
    await assert.rejects(readStudyRequest(`@${path}`), /exceeds/);
    await assert.rejects(readStudyRequest('-', { stdin: Readable.from([' '.repeat(1_000_001)]) }), /exceeds/);
    for (const invalid of ['@', '{', '[]', 'null', 'true', ' '.repeat(1_000_001)]) await assert.rejects(readStudyRequest(invalid));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('study rejects unknown names, invalid requests, oversized output and unsafe results atomically', () => {
  assert.throws(() => calculateStudy('constructor', 'vector', 'length', {}));
  assert.throws(() => calculateStudy('batch', 'unknown', 'length', { cases: [['1']] }));
  assert.throws(() => calculateStudy('batch', 'vector', 'unknown', { cases: [['1']] }));
  assert.throws(() => calculateStudy('batch', 'haul', 'outbound-loads', { cases: [['2', '1']], extra: true }));
  assert.throws(() => calculateStudy('batch', 'haul', 'outbound-loads', { cases: [['2', '1'], ['-1', '1']] }));
  // Each individual route is allowed, but the aggregate report must be bounded.
  const spec = PLANNING_GROUPS.find(g => g.name === 'vector');
  const synthetic = { signature: 'study-large <x>', types: ['n'], run: () => 'x'.repeat(20000) };
  spec.commands.push(synthetic);
  try {
    assert.throws(() => calculateStudy('batch', 'vector', 'study-large', { cases: Array.from({ length: 60 }, () => ['1']) }), /exceeds/);
  } finally { spec.commands.pop(); }
});

test('real CLI runs each workflow without a bridge and errors have no partial report', () => {
  const call = (args, input) => spawnSync(process.execPath, ['src/cli.js', '--bridge', '.runtime/missing-study.json', 'study', ...args], { encoding: 'utf8', input });
  const requests = {
    batch: { cases: [[5, 2, 1], [8, 2, 1]] },
    compare: { baseline: [5, 2, 1], candidates: [[8, 2, 1]] },
    sweep: { args: [5, 2, 1], index: 1, values: [5, 8] },
    sensitivity: { args: [5, 2, 1], changes: [{ index: 1, values: [8] }] },
    rank: { cases: [[5, 2, 1], [8, 2, 1]], direction: 'max' },
  };
  for (const [workflow, request] of Object.entries(requests)) {
    const result = call([workflow, 'durability', 'action-budget', '-'], JSON.stringify(request));
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), calculateStudy(workflow, 'durability', 'action-budget', request));
  }
  const catalog = call(['catalog']);
  assert.equal(catalog.status, 0, catalog.stderr);
  assert.equal(JSON.parse(catalog.stdout).combinations, 5000);
  const help = call(['--help']);
  for (const workflow of Object.keys(STUDY_WORKFLOWS)) assert.ok(help.stdout.includes(workflow));
  const invalid = call(['batch', 'durability', 'action-budget', '{"cases":[[5,2,1],[-1,2,1]]}']);
  assert.notEqual(invalid.status, 0);
  assert.equal(invalid.stdout, '');
  assert.match(invalid.stderr, /Error/);
});
