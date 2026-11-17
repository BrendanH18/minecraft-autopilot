import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, stat, utimes } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { Command } from 'commander';
import { testDirectory } from './helpers.js';
import { projectRoot } from '../src/config.js';
import { ACCEPTANCE_GATES, OPEN_GATES, findGate, requiredBackends } from '../src/acceptance-gates.js';
import {
  registerAcceptanceTools,
  collectProvenance,
  createSession,
  recordStep,
  finishSession,
  resolveSession,
  readSessions,
  eligibilityProblems,
  provenanceProblems,
  acceptanceStatus,
  renderMarkdown,
  listGates,
  acceptanceFile,
  ARCHIVE_NAME,
  UNVERIFIED,
} from '../src/acceptance-tools.js';

const COMMIT = 'a'.repeat(40);
const cleanGit =
  (commit = COMMIT, porcelain = '') =>
  (args) =>
    args[0] === 'rev-parse' ? { status: 0, stdout: `${commit}\n` } : { status: 0, stdout: porcelain };
const clock = (start = Date.parse('2026-11-14T10:00:00Z')) => {
  let tick = 0;
  return () => new Date(start + 1000 * tick++);
};
const VERIFIED = {
  commit: COMMIT,
  dirty: false,
  node: 'v22.12.0',
  build: { sourceCommit: COMMIT, sourceModified: false, version: '0.1.0', commitMatches: true, clean: true },
  archive: {
    name: ARCHIVE_NAME,
    sha256: 'b'.repeat(64),
    recorded: 'b'.repeat(64),
    matches: true,
    predatesBuild: false,
  },
};

function releaseBoxes() {
  return readFile(join(projectRoot, 'docs/RELEASE.md'), 'utf8').then((text) => {
    const section = text.split('## Live checks required before shipping')[1].split(/\n## /)[0];
    return [...section.matchAll(/^- \[( |x)\] (.+)$/gm)].map(([, mark, body]) => ({
      open: mark === ' ',
      text: body.replace(/\s*\*\(.*\)\*\s*$/, '').trim(),
    }));
  });
}

async function distRoot(
  t,
  {
    build = { version: '0.1.0', minecraft: '1.21.1', sourceCommit: COMMIT, sourceModified: false },
    sums = 'match',
    archive = Buffer.from('zip bytes'),
  } = {},
) {
  const root = await testDirectory(t, 'acceptance-root-');
  await mkdir(join(root, 'dist'));
  if (build) await writeFile(join(root, 'dist/BUILD.json'), typeof build === 'string' ? build : JSON.stringify(build));
  if (archive) await writeFile(join(root, 'dist', ARCHIVE_NAME), archive);
  const hash = archive ? createHash('sha256').update(archive).digest('hex') : 'c'.repeat(64);
  if (sums)
    await writeFile(
      join(root, 'dist/ARCHIVE_SHA256SUMS'),
      `${sums === 'match' ? hash : 'd'.repeat(64)}  ${ARCHIVE_NAME}\n`,
    );
  return root;
}

function cli(options) {
  const program = new Command().exitOverride(),
    output = { printed: [], written: [] };
  registerAcceptanceTools(program, {
    print: (value) => output.printed.push(value),
    write: (text) => output.written.push(text),
    ...options,
  });
  const run = (...args) =>
    program.parseAsync(['acceptance', ...args], { from: 'user' }).then(() => output.printed.at(-1));
  return { run, output };
}

test('the catalog has unique kebab-case ids, complete open gates, and frozen entries', () => {
  const ids = ACCEPTANCE_GATES.map((gate) => gate.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const gate of ACCEPTANCE_GATES) {
    assert.match(gate.id, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(['fabric', 'mineflayer', 'both'].includes(gate.backend), gate.id);
    assert.equal(typeof gate.keyboard, 'boolean');
    assert.equal(typeof gate.owner, 'boolean');
    assert.ok(Object.isFrozen(gate) && Object.isFrozen(gate.steps), gate.id);
    if (gate.status === 'open') {
      assert.ok(gate.steps.length >= 1 && gate.evidence.length >= 1 && gate.prerequisites.length >= 1, gate.id);
      assert.equal(gate.closedOn, undefined);
    } else {
      assert.equal(gate.status, 'closed');
      assert.match(gate.closedOn, /^\d{4}-\d{2}-\d{2}$/);
    }
  }
  assert.throws(() => {
    ACCEPTANCE_GATES[0].status = 'closed';
  });
  assert.equal(findGate('authenticated-handoff').owner, true);
  assert.deepEqual(requiredBackends(findGate('authenticated-handoff')), ['both']);
  assert.deepEqual(requiredBackends(findGate('collection-pit-recovery')), ['fabric', 'mineflayer']);
  assert.deepEqual(requiredBackends(findGate('bot-mining-timeout')), ['mineflayer']);
  assert.throws(() => findGate('nope'), /Unknown acceptance gate/);
});

test('every RELEASE.md live box is represented with its open or closed state', async () => {
  const boxes = await releaseBoxes();
  assert.ok(boxes.length >= 10);
  const open = boxes.filter((box) => box.open).map((box) => box.text),
    closed = boxes.filter((box) => !box.open).map((box) => box.text);
  assert.deepEqual(new Set(OPEN_GATES.map((gate) => gate.release)), new Set(open));
  assert.deepEqual(
    new Set(ACCEPTANCE_GATES.filter((gate) => gate.status === 'closed').map((gate) => gate.release)),
    new Set(closed),
  );
  // Only the model + MCP box is split into two gates.
  assert.equal(OPEN_GATES.length, open.length + 1);
});

test('list and show expose open and closed gates through Commander', async (t) => {
  const { run } = cli({ directory: await testDirectory(t, 'acceptance-') });
  const all = await run('list');
  assert.ok(all.gates.some((gate) => gate.status === 'closed' && gate.closedOn === '2026-10-20'));
  const open = await run('list', '--open', '--backend', 'mineflayer');
  assert.ok(open.gates.every((gate) => gate.status === 'open' && ['mineflayer', 'both'].includes(gate.backend)));
  assert.ok(
    open.gates.some((gate) => gate.id === 'bot-mining-timeout') &&
      !open.gates.some((gate) => gate.id === 'fabric-f8-takeover'),
  );
  assert.equal(
    listGates({ backend: 'both' }).gates.every((gate) => gate.backend === 'both'),
    true,
  );
  assert.throws(() => listGates({ backend: 'demo' }), /Backend filter/);
  assert.equal((await run('show', 'fabric-storage-deposits')).gate.steps.length, 10);
  await assert.rejects(run('show', 'missing-gate'), /Unknown acceptance gate/);
});

test('provenance records nulls and warnings for missing dist, and verifies BUILD.json and the archive', async (t) => {
  const empty = await testDirectory(t, 'acceptance-empty-');
  const missing = await collectProvenance({ root: empty, git: cleanGit(), node: 'v22.12.0' });
  assert.equal(missing.provenance.build, null);
  assert.equal(missing.provenance.archive, null);
  assert.ok(
    missing.warnings.some((text) => /BUILD\.json is missing/.test(text)) &&
      missing.warnings.some((text) => /no artifact checksum/.test(text)),
  );
  const verified = await collectProvenance({ root: await distRoot(t), git: cleanGit(), node: 'v22.12.0' });
  assert.deepEqual(verified.warnings, []);
  assert.equal(verified.provenance.archive.sha256, createHash('sha256').update('zip bytes').digest('hex'));
  assert.equal(verified.provenance.archive.matches, true);
  assert.deepEqual(provenanceProblems({ provenance: verified.provenance }), []);
  const mismatched = await collectProvenance({
    root: await distRoot(t, { sums: 'other', build: { sourceCommit: 'f'.repeat(40), sourceModified: true } }),
    git: cleanGit(COMMIT, ' M src/cli.js\n'),
  });
  assert.equal(mismatched.provenance.dirty, true);
  assert.equal(mismatched.provenance.archive.matches, false);
  assert.equal(mismatched.provenance.build.commitMatches, false);
  assert.equal(mismatched.provenance.build.clean, false);
  assert.equal(provenanceProblems({ provenance: mismatched.provenance }).length, 4);
  // Packaging rewrote BUILD.json, then failed before the archive and its checksum: the older pair still matches.
  const interrupted = await distRoot(t);
  await utimes(
    join(interrupted, 'dist/ARCHIVE_SHA256SUMS'),
    new Date('2026-11-01T00:00:00Z'),
    new Date('2026-11-01T00:00:00Z'),
  );
  const stale = await collectProvenance({ root: interrupted, git: cleanGit() });
  assert.equal(stale.provenance.archive.matches, true);
  assert.equal(stale.provenance.archive.predatesBuild, true);
  assert.ok(stale.warnings.some((text) => /packaging did not finish/.test(text)));
  assert.deepEqual(provenanceProblems({ provenance: stale.provenance }), [
    'archive predates BUILD.json; packaging did not finish',
  ]);
  const noGit = await collectProvenance({
    root: await distRoot(t, { sums: null, build: '{not json' }),
    git: () => ({ status: 128, stdout: '' }),
  });
  assert.equal(noGit.provenance.commit, null);
  assert.equal(noGit.provenance.dirty, null);
  assert.equal(noGit.provenance.build, null);
  assert.equal(noGit.provenance.archive.recorded, null);
  assert.ok(
    noGit.warnings.some((text) => /not valid JSON/.test(text)) &&
      noGit.warnings.some((text) => /no checksum/.test(text)),
  );
});

test('start, step, finish, sessions, status, and report work end to end with private files', async (t) => {
  const directory = join(await testDirectory(t, 'acceptance-'), 'data');
  const { run, output } = cli({ directory, root: await distRoot(t), git: cleanGit(), now: clock(), node: 'v22.12.0' });
  const started = await run(
    'start',
    'bot-mining-timeout',
    '--backend',
    'mineflayer',
    '--server',
    'vanilla 1.21.1, offline',
    '--note',
    'pit at spawn',
  );
  assert.deepEqual(started.session.warnings, []);
  assert.equal(started.session.startedAt, '2026-11-14T10:00:00.000Z');
  assert.equal(started.session.provenance.commit, COMMIT);
  assert.equal(started.session.config.server, 'vanilla 1.21.1, offline');
  assert.equal(started.session.config.launcher, null);
  assert.equal((await stat(directory)).mode & 0o777, 0o700);
  assert.equal((await stat(acceptanceFile(directory))).mode & 0o777, 0o600);
  const prefix = started.session.id.slice(0, 6);
  for (let n = 1; n <= 5; n++) await run('step', prefix, String(n), 'pass', '--note', `observed ${n}`);
  await assert.rejects(run('step', prefix, '6', 'pass'), /1 to 5/);
  await assert.rejects(run('step', prefix, '1', 'maybe'), /pass or fail/);
  const finished = await run('finish', prefix, 'pass');
  assert.equal(finished.eligible, true);
  assert.deepEqual(finished.problems, []);
  await assert.rejects(run('step', prefix, '1', 'fail'), /finished as pass/);
  await assert.rejects(run('finish', prefix, 'fail', '--note', 'again'), /finished as pass/);
  const status = await run('status');
  const gate = status.gates.find((entry) => entry.id === 'bot-mining-timeout');
  assert.equal(gate.eligible, true);
  assert.equal(gate.backends[0].latest.id, started.session.id);
  assert.equal(status.eligible, 1);
  assert.match(status.note, /never edits docs\/RELEASE\.md/);
  assert.match(status.note, /must review/);
  assert.equal((await run('sessions', '--gate', 'bot-mining-timeout')).sessions.length, 1);
  assert.equal((await run('sessions', '--gate', 'fabric-f8-takeover')).sessions.length, 0);
  await run('report', '--gate', 'bot-mining-timeout');
  const markdown = output.written.at(-1);
  assert.match(markdown, /Acceptance session 14 November 2026 — Bot mining timeout/);
  assert.match(markdown, /Result: \*\*pass\*\*/);
  assert.match(markdown, /clean worktree/);
  assert.match(markdown, /matches ARCHIVE_SHA256SUMS/);
  assert.match(markdown, /1\. pass — Force a bot mining timeout in a real pit\. — observed 1/);
  assert.match(markdown, /Server: vanilla 1\.21\.1, offline/);
  assert.match(markdown, /Notes: pit at spawn/);
  assert.doesNotMatch(markdown, new RegExp(UNVERIFIED));
  const json = await run('report', '--format', 'json');
  assert.deepEqual(json.sessions[0].eligibilityProblems, []);
  await assert.rejects(run('report', '--format', 'html'), /markdown or json/);
  const saved = await readSessions(acceptanceFile(directory));
  assert.equal(saved[0].steps.length, 5);
  assert.equal(saved[0].finished.result, 'pass');
});

test('a dirty worktree or missing dist makes the report and status refuse verified-candidate wording', async (t) => {
  const directory = await testDirectory(t, 'acceptance-');
  const { run, output } = cli({
    directory,
    root: await testDirectory(t, 'acceptance-nodist-'),
    git: cleanGit(COMMIT, '?? notes.txt\n'),
    now: clock(),
  });
  const { session } = await run(
    'start',
    'fabric-f8-takeover',
    '--backend',
    'fabric',
    '--launcher',
    'Minecraft Launcher',
  );
  assert.equal(session.provenance.build, null);
  assert.equal(session.provenance.archive, null);
  assert.ok(session.warnings.some((text) => /uncommitted/.test(text)));
  for (let n = 1; n <= 5; n++) await run('step', session.id, String(n), 'pass');
  const finished = await run('finish', session.id, 'pass');
  assert.equal(finished.eligible, false);
  assert.ok(
    finished.problems.includes('worktree had uncommitted changes') &&
      finished.problems.includes('archive checksum missing'),
  );
  await run('report');
  assert.match(
    output.written.at(-1),
    new RegExp(
      `${UNVERIFIED}:\\*\\* worktree had uncommitted changes; dist/BUILD\\.json missing or unreadable; archive checksum missing`,
    ),
  );
  assert.match(output.written.at(-1), /Artifact: missing; no checksum recorded/);
  assert.equal((await run('status')).gates.find((entry) => entry.id === 'fabric-f8-takeover').eligible, false);
});

test('backend rules: demo rehearses, mismatches are refused, both-backend gates need each backend', () => {
  const base = { provenance: VERIFIED, now: new Date('2026-11-14T10:00:00Z') };
  assert.throws(
    () => createSession({ ...base, gate: 'fabric-f8-takeover', backend: 'mineflayer' }),
    /needs backend fabric/,
  );
  assert.throws(
    () => createSession({ ...base, gate: 'authenticated-handoff', backend: 'fabric' }),
    /needs backend both/,
  );
  assert.throws(
    () => createSession({ ...base, gate: 'bot-ollama-model', backend: 'mineflayer' }),
    /closed on 2026-10-20/,
  );
  assert.throws(() => createSession({ ...base, gate: 'bot-mining-timeout', backend: 'bedrock' }), /Backend must be/);
  assert.throws(
    () => createSession({ ...base, gate: 'bot-mining-timeout', backend: 'mineflayer', options: { launcher: 'a\nb' } }),
    /one line/,
  );
  assert.throws(
    () =>
      createSession({
        ...base,
        gate: 'bot-mining-timeout',
        backend: 'mineflayer',
        options: { note: 'x'.repeat(2001) },
      }),
    /2000/,
  );
  const pass = (gate, backend, id, at) => {
    let sessions = [createSession({ ...base, gate, backend, id })];
    for (let n = 1; n <= findGate(gate).steps.length; n++)
      sessions = recordStep(sessions, id, n, 'pass', { now: new Date(at) }).sessions;
    return finishSession(sessions, id, 'pass', { now: new Date(at) }).sessions[0];
  };
  const demo = pass('bot-mining-timeout', 'demo', '00000000-0000-4000-8000-000000000001', '2026-11-14T11:00:00Z');
  assert.ok(eligibilityProblems(demo).includes('demo backend is a rehearsal'));
  assert.match(renderMarkdown([demo]), /demo backend is a rehearsal/);
  const fabric = pass(
    'collection-pit-recovery',
    'fabric',
    '00000000-0000-4000-8000-000000000002',
    '2026-11-14T11:00:00Z',
  );
  assert.deepEqual(eligibilityProblems(fabric), []);
  let status = acceptanceStatus([fabric]).gates.find((gate) => gate.id === 'collection-pit-recovery');
  assert.equal(status.eligible, false);
  assert.deepEqual(
    status.backends.map((entry) => entry.eligible),
    [true, false],
  );
  assert.deepEqual(status.backends[1].problems, ['no finished session']);
  const bot = pass(
    'collection-pit-recovery',
    'mineflayer',
    '00000000-0000-4000-8000-000000000003',
    '2026-11-14T12:00:00Z',
  );
  assert.equal(
    acceptanceStatus([fabric, bot]).gates.find((gate) => gate.id === 'collection-pit-recovery').eligible,
    true,
  );
  // Each backend's session must come from the same candidate commit and archive.
  const otherCommit = { ...bot, provenance: { ...bot.provenance, commit: 'b'.repeat(40) } };
  status = acceptanceStatus([fabric, otherCommit]).gates.find((gate) => gate.id === 'collection-pit-recovery');
  assert.deepEqual(
    status.backends.map((entry) => entry.eligible),
    [true, true],
  );
  assert.equal(status.eligible, false);
  assert.deepEqual(status.problems, ['backend sessions come from different commits or archives']);
  const handoff = pass('authenticated-handoff', 'both', '00000000-0000-4000-8000-000000000004', '2026-11-14T12:00:00Z');
  assert.equal(acceptanceStatus([handoff]).gates.find((gate) => gate.id === 'authenticated-handoff').eligible, true);
  // A later failure replaces earlier eligible evidence as the latest finished session.
  let later = [
    createSession({
      ...base,
      gate: 'collection-pit-recovery',
      backend: 'mineflayer',
      id: '00000000-0000-4000-8000-000000000005',
    }),
  ];
  later = finishSession(later, '00000000-0000-4000-8000-000000000005', 'blocked', {
    note: 'server down',
    now: new Date('2026-11-14T13:00:00Z'),
  }).sessions;
  status = acceptanceStatus([fabric, bot, ...later]).gates.find((gate) => gate.id === 'collection-pit-recovery');
  assert.equal(status.eligible, false);
  assert.ok(status.backends[1].problems.includes('finished as blocked'));
  const dirty = {
    ...bot,
    provenance: { ...VERIFIED, dirty: true, build: { ...VERIFIED.build, commitMatches: false } },
  };
  assert.deepEqual(provenanceProblems(dirty), [
    'worktree had uncommitted changes',
    'BUILD.json commit does not match the session commit',
  ]);
});

test('finish rules and step history: notes for fail/blocked, failed steps block pass, missing steps are ineligible', () => {
  const id = '11111111-0000-4000-8000-000000000000';
  let sessions = [
    createSession({ gate: 'cobblestone-hostiles-dimension', backend: 'fabric', provenance: VERIFIED, id }),
  ];
  assert.throws(() => finishSession(sessions, id, 'fail'), /needs --note/);
  assert.throws(() => finishSession(sessions, id, 'blocked', { note: '  ' }), /1–2000/);
  assert.throws(() => finishSession(sessions, id, 'done'), /pass, fail, or blocked/);
  sessions = recordStep(sessions, id, '1', 'fail', { note: 'pickaxe missing' }).sessions;
  assert.throws(() => finishSession(sessions, id, 'pass'), /Step 1 last recorded fail/);
  sessions = recordStep(sessions, id, 1, 'pass').sessions;
  const { session } = finishSession(sessions, id, 'pass');
  assert.ok(eligibilityProblems(session).includes('steps without a passing observation: 2, 3'));
  assert.equal(session.steps.length, 2);
  assert.match(renderMarkdown([session]), /1\. pass \(earlier: fail\) — Collect cobblestone/);
  assert.match(renderMarkdown([session]), /2\. not recorded/);
  assert.equal(renderMarkdown([]), 'No acceptance sessions recorded.\n');
});

test('session ids resolve by exact id or an unambiguous prefix of at least six characters', () => {
  const sessions = [
    'abcdef01-0000-4000-8000-000000000000',
    'abcdef02-0000-4000-8000-000000000000',
    '12345678-0000-4000-8000-000000000000',
  ].map((id) => createSession({ gate: 'bot-mining-timeout', backend: 'mineflayer', provenance: VERIFIED, id }));
  assert.equal(resolveSession(sessions, '123456').id, sessions[2].id);
  assert.equal(resolveSession(sessions, 'ABCDEF01').id, sessions[0].id);
  assert.equal(resolveSession(sessions, sessions[1].id).id, sessions[1].id);
  assert.throws(() => resolveSession(sessions, '12345'), /at least 6/);
  assert.throws(() => resolveSession(sessions, 'abcdef'), /ambiguous/);
  assert.throws(() => resolveSession(sessions, 'ffffff'), /No acceptance session/);
});

test('a corrupt or invalid sessions file is reported and never overwritten', async (t) => {
  const directory = await testDirectory(t, 'acceptance-');
  const { run } = cli({ directory, root: directory, git: cleanGit(), now: clock() });
  for (const content of [
    '{not json',
    JSON.stringify({ version: 2, sessions: [] }),
    JSON.stringify({ version: 1, sessions: [{ id: 'x' }] }),
  ]) {
    await writeFile(acceptanceFile(directory), content, { mode: 0o600 });
    await assert.rejects(run('start', 'bot-mining-timeout', '--backend', 'mineflayer'), /fix or remove it/);
    await assert.rejects(run('status'), /fix or remove it/);
    assert.equal(await readFile(acceptanceFile(directory), 'utf8'), content);
  }
  await mkdir(join(directory, 'dir'));
  await assert.rejects(readSessions(join(directory, 'dir')), /not a regular file/);
  assert.deepEqual(await readSessions(join(directory, 'absent.json')), []);
});
