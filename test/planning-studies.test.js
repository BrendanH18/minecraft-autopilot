import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { testStudyWorkflows } from './planning-study-workflow-checks.js';
import { PLANNING_GROUPS, ALL_PLANNING_GROUPS } from '../src/planning-tools.js';
import { SPATIAL_CASES } from './planning-spatial-cases.js';
import { RESOURCE_CASES } from './planning-resources-cases.js';
import { ANALYSIS_CASES } from './planning-analysis-cases.js';
import { COORDINATION_CASES } from './planning-coordination-cases.js';
import { STRUCTURE_CASES } from './planning-structures-cases.js';
import { OPERATION_CASES } from './planning-operations-cases.js';
import { STUDY_WORKFLOWS, calculateStudy, readStudyRequest, studyCatalog } from '../src/planning-studies.js';

const examples = [
  ...SPATIAL_CASES,
  ...RESOURCE_CASES,
  ...ANALYSIS_CASES,
  ...COORDINATION_CASES,
  ...STRUCTURE_CASES,
  ...OPERATION_CASES,
];

test('study inventory includes all 14,400 planner and workflow combinations', async () => {
  const catalog = studyCatalog();
  assert.equal(catalog.planners, 1600);
  assert.equal(catalog.combinations, 14400);
  assert.deepEqual(catalog.workflows, [
    'batch',
    'compare',
    'sweep',
    'sensitivity',
    'rank',
    'screen',
    'factorial',
    'summarize',
    'pareto',
  ]);
  assert.equal(catalog.groups.length, 64);
  assert.equal(examples.length, 1200);
  const keys = catalog.groups.flatMap((g) =>
    g.commands.flatMap((c) => catalog.workflows.map((w) => `${w}/${g.name}/${c.command}`)),
  );
  assert.equal(new Set(keys).size, 14400);
  const docs = await readFile(new URL('../docs/PLANNING-STUDIES.md', import.meta.url), 'utf8');
  for (const group of ALL_PLANNING_GROUPS) {
    assert.ok(docs.includes(`\`${group.name}\``), group.name);
    assert.equal(studyCatalog(group.name).combinations, 225);
  }
  assert.throws(() => studyCatalog('not-a-planner'));
});

for (const example of examples) testStudyWorkflows(...example);

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
    for (const invalid of ['@', '{', '[]', 'null', 'true', ' '.repeat(1_000_001)])
      await assert.rejects(readStudyRequest(invalid));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('study rejects unknown names, invalid requests, oversized output and unsafe results atomically', () => {
  assert.throws(() => calculateStudy('constructor', 'vector', 'length', {}));
  assert.throws(() => calculateStudy('batch', 'unknown', 'length', { cases: [['1']] }));
  assert.throws(() => calculateStudy('batch', 'vector', 'unknown', { cases: [['1']] }));
  assert.throws(() => calculateStudy('batch', 'haul', 'outbound-loads', { cases: [['2', '1']], extra: true }));
  assert.throws(() =>
    calculateStudy('batch', 'haul', 'outbound-loads', {
      cases: [
        ['2', '1'],
        ['-1', '1'],
      ],
    }),
  );
  // Each individual route is allowed, but the aggregate report must be bounded.
  const spec = PLANNING_GROUPS.find((g) => g.name === 'vector');
  const synthetic = { signature: 'study-large <x>', types: ['n'], run: () => 'x'.repeat(20000) };
  spec.commands.push(synthetic);
  try {
    assert.throws(
      () => calculateStudy('batch', 'vector', 'study-large', { cases: Array.from({ length: 60 }, () => ['1']) }),
      /exceeds/,
    );
  } finally {
    spec.commands.pop();
  }
});

const call = (args, input) =>
  spawnSync(process.execPath, ['src/cli.js', '--bridge', '.runtime/missing-study.json', 'study', ...args], {
    encoding: 'utf8',
    input,
  });

test('study search discovers planners offline by group, command and description', () => {
  const result = call(['search', ' MAPROOM  scale-span PIXEL ']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [
    {
      group: 'maproom',
      signature: 'scale-span <level>',
      description: 'Report the side in blocks and the blocks per pixel of a square map.',
    },
  ]);
  const group = call(['search', 'maproom']);
  assert.deepEqual(
    JSON.parse(group.stdout).map((entry) => entry.signature),
    studyCatalog('maproom').groups[0].commands.map((entry) => entry.signature),
  );
  const missing = call(['search', 'maproom', 'xyzzy']);
  assert.equal(missing.status, 0, missing.stderr);
  assert.deepEqual(JSON.parse(missing.stdout), []);
  assert.match(call(['search', '   ']).stderr, /at least one search term/);
});

test('real CLI runs each workflow without a bridge and errors have no partial report', () => {
  const requests = {
    screen: {
      cases: [
        [5, 2, 1],
        [8, 2, 1],
      ],
      criteria: [{ op: 'gte', value: 3 }],
    },
    batch: {
      cases: [
        [5, 2, 1],
        [8, 2, 1],
      ],
    },
    compare: { baseline: [5, 2, 1], candidates: [[8, 2, 1]] },
    sweep: { args: [5, 2, 1], index: 1, values: [5, 8] },
    sensitivity: { args: [5, 2, 1], changes: [{ index: 1, values: [8] }] },
    rank: {
      cases: [
        [5, 2, 1],
        [8, 2, 1],
      ],
      direction: 'max',
    },
    factorial: {
      args: [5, 2, 1],
      axes: [
        { index: 1, values: [5, 8] },
        { index: 2, values: [1, 2] },
      ],
    },
    summarize: {
      cases: [
        [5, 2, 1],
        [8, 2, 1],
      ],
    },
    pareto: {
      cases: [
        [5, 2, 1],
        [8, 2, 1],
      ],
      objectives: [{ direction: 'max' }],
    },
  };
  assert.deepEqual(Object.keys(requests).sort(), Object.keys(STUDY_WORKFLOWS).sort());
  for (const [workflow, request] of Object.entries(requests)) {
    const result = call([workflow, 'durability', 'action-budget', '-'], JSON.stringify(request));
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), calculateStudy(workflow, 'durability', 'action-budget', request));
  }
  const catalog = call(['catalog']);
  assert.equal(catalog.status, 0, catalog.stderr);
  assert.equal(JSON.parse(catalog.stdout).combinations, 14400);
  const help = call(['--help']);
  for (const workflow of Object.keys(STUDY_WORKFLOWS)) assert.ok(help.stdout.includes(workflow));
  const invalid = call(['batch', 'durability', 'action-budget', '{"cases":[[5,2,1],[-1,2,1]]}']);
  assert.notEqual(invalid.status, 0);
  assert.equal(invalid.stdout, '');
  assert.match(invalid.stderr, /Error/);
});
