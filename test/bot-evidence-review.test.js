import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Command } from 'commander';
import { registerAcceptanceTools } from '../src/acceptance-tools.js';
import { testDirectory } from './helpers.js';

const commit = 'a'.repeat(40);
const jarSha256 = 'b'.repeat(64);
const run = (minute, scenarios, { model = null, environment = { commit, dirty: false }, minecraft } = {}) => ({
  schema: 'minecraft-agent/live-bot-acceptance/1',
  finishedAt: `2026-11-22T10:0${minute}:00.000Z`,
  environment,
  minecraft: { serverLog: '/runner/server.out', serverVersion: '1.21.1', jarSha256, ...minecraft },
  options: { model },
  scenarios: scenarios.map((scenario) => ({ checks: [{ pass: true }], ...scenario })),
});

async function review(t, runs) {
  const directory = await testDirectory(t, 'bot-evidence-');
  const files = await Promise.all(
    runs.map(async (result, i) => {
      const file = join(directory, `results-${i}.json`);
      await writeFile(file, JSON.stringify(result));
      return file;
    }),
  );
  const program = new Command();
  const reports = [];
  registerAcceptanceTools(program, { print: (report) => reports.push(report), directory });
  return {
    directory,
    files,
    reports,
    parse: () => program.parseAsync(['acceptance', 'review-bot', ...files, '--commit', commit], { from: 'user' }),
  };
}

test('review-bot groups coverage and prefers the latest attempt over older attempts and later skips', async (t) => {
  const { files, reports, parse } = await review(t, [
    run(2, [{ id: 'withdraw', status: 'fail', reason: 'No transfer' }]),
    run(
      1,
      [
        { id: 'recovery-timeout', status: 'pass' },
        { id: 'cobblestone-hostiles-dimension', status: 'pass' },
        { id: 'withdraw', status: 'pass' },
        { id: 'withdraw-craft-model', status: 'pass', observations: { model: 'local-model' } },
      ],
      { model: 'local-model' },
    ),
    run(3, [
      { id: 'withdraw-craft-model', status: 'skipped' },
      { id: 'stale-removal-model', status: 'skipped' },
    ]),
  ]);
  await parse();
  const [report] = reports;
  assert.deepEqual(report.rejected, []);
  assert.equal(report.runs[0].serverLog, '/runner/server.out');
  assert.equal(report.runs[0].sourceAtFinish, null);
  const gate = (id) => report.gates.find(({ gate }) => gate === id);
  const withdraw = gate('bot-withdraw-craft');
  assert.equal(withdraw.offline.find(({ id }) => id === 'withdraw').status, 'fail');
  assert.equal(withdraw.offline.find(({ id }) => id === 'withdraw').file, files[0]);
  assert.equal(withdraw.offline.find(({ id }) => id === 'craft-bootstrap').status, 'missing');
  assert.equal(withdraw.realModel[0].status, 'pass');
  assert.equal(withdraw.realModel[0].model, 'local-model');
  assert.deepEqual(withdraw.summary.offline, { pass: 0, fail: 1, skipped: 0, missing: withdraw.offline.length - 1 });
  assert.deepEqual(withdraw.summary.realModel, { pass: 1, fail: 0, skipped: 0, missing: 0 });
  assert.equal(gate('collect-and-store-verification').realModel[0].status, 'skipped');
  assert.deepEqual(gate('cobblestone-hostiles-dimension').summary.offline, {
    pass: 1,
    fail: 0,
    skipped: 0,
    missing: 0,
  });
  for (const id of ['collection-pit-recovery', 'bot-mining-timeout'])
    assert.equal(gate(id).offline.find(({ id }) => id === 'recovery-timeout').status, 'pass');
});

test('review-bot rejects passes without supported server provenance and runs with changed or unverified source', async (t) => {
  const passing = [{ id: 'withdraw', status: 'pass' }];
  const { reports, parse } = await review(t, [
    run(1, passing, { minecraft: { serverVersion: null } }),
    run(2, passing, { minecraft: { serverVersion: '1.21.4' } }),
    run(3, passing, { minecraft: { jarSha256: undefined } }),
    run(4, passing, { minecraft: { jarSha256: 'incorrect' } }),
    run(5, passing, { environment: { commit, dirty: false, sourceAtFinish: { commit, dirty: true } } }),
    run(6, passing, {
      environment: { commit, dirty: false, sourceAtFinish: { commit: 'c'.repeat(40), dirty: false } },
    }),
    run(7, passing, { environment: { commit, dirty: false, sourceAtFinish: { commit: null, dirty: null } } }),
  ]);
  await assert.rejects(parse, /7 bot result file\(s\) rejected/);
  const [report] = reports;
  assert.deepEqual(report.runs, []);
  assert.deepEqual(report.serverJarSha256s, []);
  assert.match(report.rejected[0].reason, /Minecraft 1\.21\.1 server; recorded unknown/);
  assert.match(report.rejected[1].reason, /Minecraft 1\.21\.1 server; recorded 1\.21\.4/);
  for (const { reason } of report.rejected.slice(2, 4)) assert.match(reason, /server jar SHA-256/);
  for (const { reason } of report.rejected.slice(4)) assert.match(reason, /same clean candidate commit/);
});

test('review-bot finds copied logs and reports distinct server jars across passing runs', async (t) => {
  const otherJar = 'a'.repeat(64);
  const { directory, files, reports, parse } = await review(t, [
    run(1, [{ id: 'withdraw', status: 'pass' }], {
      environment: { commit, dirty: false, sourceAtFinish: { commit, dirty: false } },
    }),
    run(2, [{ id: 'craft-bootstrap', status: 'pass' }], { minecraft: { jarSha256: otherJar } }),
    run(3, [{ id: 'stale-removal-model', status: 'skipped' }], {
      minecraft: { serverVersion: null, jarSha256: null },
    }),
  ]);
  const logDirectory = join(directory, 'server');
  await mkdir(logDirectory);
  const logFile = join(logDirectory, 'server.out');
  await writeFile(logFile, 'server output');
  const artifactFile = join(directory, 'results.json');
  await rename(files[0], artifactFile);
  files[0] = artifactFile;

  await parse();
  const [report] = reports;
  assert.deepEqual(report.serverJarSha256s, [otherJar, jarSha256]);
  assert.equal(report.runs[0].serverLogPath, logFile);
  assert.equal(report.runs[0].serverLog, '/runner/server.out');
  assert.equal(report.runs[0].serverVersion, '1.21.1');
  assert.equal(report.runs[0].serverJarSha256, jarSha256);
  assert.deepEqual(report.runs[0].sourceAtFinish, { commit, dirty: false });
  assert.equal(report.runs[1].serverLogPath, null);
  assert.equal(report.runs[2].serverJarSha256, null);
});

test('review-bot rejects dirty, different-commit and malformed files without counting their passes', async (t) => {
  const passing = [{ id: 'withdraw', status: 'pass' }];
  const modelPass = { id: 'withdraw-craft-model', status: 'pass', observations: { model: 'local-model' } };
  const { reports, files, parse } = await review(t, [
    run(1, passing, { environment: { commit, dirty: true } }),
    run(2, passing, { environment: { commit: 'b'.repeat(40), dirty: false } }),
    run(3, [...passing, ...passing]),
    {},
    run(4, [{ ...passing[0], checks: [] }]),
    run(5, [{ ...passing[0], checks: [{ pass: false }] }]),
    run(6, [modelPass], { model: 'local-model' }),
    run(7, [modelPass], { model: 'different-model' }),
    { ...run(8, passing), minecraft: {} },
    run(9, [...passing, { id: 'withdraww', status: 'skipped' }]),
  ]);
  await assert.rejects(parse, /9 bot result file\(s\) rejected/);
  const [report] = reports;
  assert.match(report.rejected[0].reason, /clean worktree/);
  assert.match(report.rejected[1].reason, /does not match/);
  assert.match(report.rejected[2].reason, /duplicate scenario IDs/);
  assert.match(report.rejected[4].reason, /at least one check/);
  assert.match(report.rejected[5].reason, /all checks must pass/);
  assert.match(report.rejected[6].reason, /did not record the configured real model/);
  assert.match(report.rejected[7].reason, /serverLog/);
  assert.match(report.rejected[8].reason, /Unknown bot scenario: withdraww/);
  assert.deepEqual(
    report.runs.map(({ file }) => file),
    [files[6]],
  );
  const gate = report.gates.find(({ gate }) => gate === 'bot-withdraw-craft');
  assert.equal(gate.offline.find(({ id }) => id === 'withdraw').status, 'missing');
  assert.equal(gate.realModel[0].status, 'pass');
  assert.equal(gate.realModel[0].file, files[6]);
});
