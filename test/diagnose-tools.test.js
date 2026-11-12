import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseReport, DIAGNOSE_COMMANDS } from '../src/diagnose-tools.js';
import { fixture } from './transcript-fixture.js';
const report = name => diagnoseReport(fixture, name);

test('all 25 diagnostic commands compute expected recorded evidence', () => {
  assert.equal(DIAGNOSE_COMMANDS.length, 25);
  assert.deepEqual(report('outcomes').statuses, [{ value: 'criteria_met', count: 1 }]);
  assert.equal(report('outcomes').unfinished, 1);
  assert.equal(report('completion-rate').finishRate, 0.5);
  assert.equal(report('criteria-results').verifications[0].met, true);
  assert.deepEqual(report('error-reasons').actionErrors, [{ value: 'blocked', count: 1 }]);
  assert.deepEqual(report('rejection-reasons').reasons, [{ value: 'disallowed', count: 1 }, { value: 'invalid', count: 1 }]);
  assert.deepEqual(report('action-outcomes').outcomes[0].types, [{ value: 'collect', count: 1 }, { value: 'deposit', count: 1 }]);
  assert.deepEqual(report('unresolved-decisions').rows.map(r => r.line), [11]);
  assert.deepEqual(report('response-delays').delays.map(r => r.milliseconds), [2000, 1000, 1000, 1000]);
  assert.equal(report('event-gaps').gaps.length, 13);
  assert.equal(report('clock-regressions').gaps.length, 0);
  assert.deepEqual(report('missing-times').rows.map(r => r.line), [15]);
  assert.deepEqual(report('token-totals'), { responses: 7, promptTokens: 102, outputTokens: 28, unknownPrompt: 0, unknownOutput: 0, note: report('token-totals').note });
  assert.equal(report('token-steps').responses.length, 7);
  assert.equal(report('token-efficiency').runs[0].outputTokensPerRequest, 4);
  assert.equal(report('token-efficiency').runs[1].outputTokensPerRequest, null);
  assert.equal(report('model-usage').usage[0].modelMs, 400);
  assert.equal(report('budget-usage').runs[0].fraction, 0.25);
  assert.equal(report('step-usage').runs[0].fraction, 0.7);
  assert.deepEqual(report('failure-streaks').streaks, [{ run: 1, lines: [3], length: 1 }]);
  assert.deepEqual(report('rejection-streaks').streaks, [{ run: 1, lines: [7, 8], length: 2 }]);
  assert.deepEqual(report('repeated-decisions').repeats.map(r => r.line), [4]);
  assert.deepEqual(report('goto-fence').requests, [{ run: 1, line: 6, distance: 10, radius: 5, outside: true }]);
  assert.equal(report('allowlist').requests.filter(r => r.permitted === false).length, 2);
  assert.deepEqual(report('collect-demand').items, [{ name: 'minecraft:oak_log', requested: 6, knownRequests: 2, unknownRequests: 0, allRequests: 0 }]);
  assert.deepEqual(report('deposit-demand').items, [{ name: 'minecraft:oak_log', requested: 0, knownRequests: 0, unknownRequests: 0, allRequests: 1 }]);
  assert.equal(report('wait-demand').requestedSeconds, 2);
});

test('diagnostics retain unknown outcomes and isolate timestamps and outcomes to runs', () => {
  const text = [
    { event: 'start' }, { event: 'decision', step: 1, decision: { type: 'goto', x: 0, z: 0 } },
    { event: 'finish', error: 'stopped' }, { event: 'start' }, { event: 'result', step: 1 },
    { event: 'decision', time: '2026-01-01T00:00:02Z', decision: { type: 'wait' } },
    { event: 'error', time: '2026-01-01T00:00:01Z' },
  ].map(v => JSON.stringify(v)).join('\n');
  assert.equal(diagnoseReport(text, 'unresolved-decisions').rows.length, 2);
  assert.equal(diagnoseReport(text, 'goto-fence').requests[0].outside, null);
  assert.equal(diagnoseReport(text, 'allowlist').requests[0].permitted, null);
  assert.equal(diagnoseReport(text, 'clock-regressions').gaps[0].milliseconds, -1000);
  assert.equal(diagnoseReport(text, 'wait-demand').unknownRequests, 1);
  assert.equal(diagnoseReport(text, 'token-totals').unknownOutput, 2);
  assert.equal(diagnoseReport(text, 'model-usage').usage[0].requests, null);
  assert.equal(diagnoseReport('', 'completion-rate').finishRate, null);
  assert.throws(() => diagnoseReport(text, 'missing-command'));
});
