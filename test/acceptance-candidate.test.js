import test from 'node:test';
import assert from 'node:assert/strict';
import { findGate } from '../src/acceptance-gates.js';
import { acceptanceStatus, ARCHIVE_NAME, createSession, finishSession, recordStep } from '../src/acceptance-tools.js';

const COMMIT = 'a'.repeat(40);
const ARCHIVE = 'b'.repeat(64);
const GATES = ['bot-mining-timeout', 'bot-withdraw-craft'];
const FIRST = new Date('2026-11-21T10:00:00Z');
const LATER = new Date('2026-11-21T10:01:00Z');

function passed(gate, { commit = COMMIT, archiveSha256 = ARCHIVE } = {}) {
  const session = createSession({
    gate,
    backend: 'mineflayer',
    now: FIRST,
    provenance: {
      commit,
      dirty: false,
      node: 'v22.12.0',
      build: { sourceCommit: commit, sourceModified: false, version: '0.1.0', commitMatches: true, clean: true },
      archive: {
        name: ARCHIVE_NAME,
        sha256: archiveSha256,
        recorded: archiveSha256,
        matches: true,
        predatesBuild: false,
      },
    },
  });
  let sessions = [session];
  for (let step = 1; step <= findGate(gate).steps.length; step++) {
    sessions = recordStep(sessions, session.id, step, 'pass', { now: FIRST }).sessions;
  }
  return finishSession(sessions, session.id, 'pass', { now: FIRST }).session;
}

test('status counts the eligible gates from a single candidate', () => {
  const status = acceptanceStatus(GATES.map((gate) => passed(gate)));
  assert.equal(status.eligible, 2);
  assert.deepEqual(status.candidates, [{ commit: COMMIT, archiveSha256: ARCHIVE, gates: GATES }]);
  assert.deepEqual(status.problems, []);
});

test('status reports mixed candidates when either the commit or archive differs across gates', () => {
  for (const [commit, archiveSha256] of [
    ['c'.repeat(40), ARCHIVE],
    [COMMIT, 'd'.repeat(64)],
  ]) {
    const status = acceptanceStatus([passed(GATES[0]), passed(GATES[1], { commit, archiveSha256 })]);
    assert.equal(status.eligible, 0);
    assert.deepEqual(
      status.gates.filter((gate) => gate.eligible).map((gate) => gate.id),
      GATES,
    );
    assert.deepEqual(status.candidates, [
      { commit: COMMIT, archiveSha256: ARCHIVE, gates: [GATES[0]] },
      { commit, archiveSha256, gates: [GATES[1]] },
    ]);
    assert.deepEqual(status.problems, ['eligible gates come from different commits or archives']);
  }
});

test('status excludes missing or superseded evidence from candidate groups', () => {
  const empty = acceptanceStatus([]);
  assert.equal(empty.eligible, 0);
  assert.deepEqual(empty.candidates, []);
  assert.deepEqual(empty.problems, []);

  const earlier = passed(GATES[1], { archiveSha256: 'd'.repeat(64) });
  const later = createSession({ gate: GATES[1], backend: 'mineflayer', now: LATER, provenance: earlier.provenance });
  const blocked = finishSession([later], later.id, 'blocked', { note: 'Server unavailable.', now: LATER }).session;
  const status = acceptanceStatus([passed(GATES[0]), earlier, blocked]);
  assert.equal(status.eligible, 1);
  assert.deepEqual(status.candidates, [{ commit: COMMIT, archiveSha256: ARCHIVE, gates: [GATES[0]] }]);
  assert.deepEqual(status.problems, []);
});

test('a selected candidate uses the latest attempt on that exact commit and archive', () => {
  const earlier = passed(GATES[0]);
  const unselected = createSession({
    gate: GATES[0],
    backend: 'mineflayer',
    now: LATER,
    provenance: {
      ...earlier.provenance,
      archive: { ...earlier.provenance.archive, sha256: 'd'.repeat(64) },
    },
  });
  const blocked = finishSession([unselected], unselected.id, 'blocked', {
    note: 'Server unavailable.',
    now: LATER,
  }).session;
  assert.equal(acceptanceStatus([earlier, blocked]).eligible, 0);
  const options = { commit: COMMIT, archiveSha256: ARCHIVE };
  assert.equal(acceptanceStatus([earlier, blocked], options).eligible, 1);
  const selected = createSession({
    gate: GATES[0],
    backend: 'mineflayer',
    now: LATER,
    provenance: earlier.provenance,
  });
  const failed = finishSession([selected], selected.id, 'fail', { note: 'Return failed.', now: LATER }).session;
  assert.equal(acceptanceStatus([earlier, blocked, failed], options).eligible, 0);
});
