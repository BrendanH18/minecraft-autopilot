import test from 'node:test';
import assert from 'node:assert/strict';
import { journalReport, JOURNAL_COMMANDS } from '../src/journal-tools.js';
import { transcriptData } from '../src/transcript-data.js';
import { fixture, journalArgs } from './transcript-fixture.js';

test('all 25 journal commands have independently expected selections', () => {
  assert.equal(JOURNAL_COMMANDS.length, 25);
  const expected = {
    runs: ['runs', 2], events: ['rows', 15], run: ['rows', 13], 'event-type': ['rows', 2], 'action-type': ['rows', 4], step: ['rows', 2], lines: ['rows', 3], head: ['rows', 2], tail: ['rows', 2], decisions: ['rows', 6], results: ['rows', 2], errors: ['rows', 1], rejections: ['rows', 2], finishes: ['rows', 1], starts: ['rows', 2], goals: ['goals', 2], models: ['models', 2], settings: ['settings', 2], criteria: ['criteria', 2], 'invalid-lines': ['invalid', 1], 'unknown-events': ['rows', 1], timestamps: ['timestamps', 15], search: ['rows', 1], unfinished: ['runs', 1], 'dry-runs': ['rows', 1],
  };
  for (const [signature] of JOURNAL_COMMANDS) { const command = signature.split(' ')[0], [key, count] = expected[command]; assert.equal(journalReport(fixture, command, journalArgs[command])[key].length, count, command); }
  assert.deepEqual(journalReport(fixture, 'models').models, [{ model: 'local', runs: [1] }, { model: 'other', runs: [2] }]);
  assert.equal(journalReport(fixture, 'invalid-lines').invalid[0].line, 16);
  assert.equal(journalReport(fixture, 'timestamps').timestamps[14].epochMs, null);
  assert.equal(journalReport(fixture, 'criteria').criteria[1].recorded, false);
  assert.equal(journalReport(fixture, 'run', ['1']).status, 'criteria_met');
});

test('journal validates arguments and preserves malformed line provenance', () => {
  for (const [command, args] of [['run', ['0']], ['run', ['3']], ['head', ['']], ['tail', ['NaN']], ['step', ['1.5']], ['lines', ['4', '2']], ['search', [' ']], ['action-type', []], ['event-type', []]]) assert.throws(() => journalReport(fixture, command, args), command);
  assert.throws(() => journalReport(fixture, 'absent'));
  assert.throws(() => journalReport(null, 'runs'));
  assert.equal(journalReport('', 'runs').runs.length, 0);
  const data = transcriptData('\n[]\nnull\n{"event":"finish","error":"early"}\n{"event":"finish"}\n');
  assert.equal(data.runs.length, 2); assert.equal(data.invalid.length, 2); assert.equal(data.rows[0].line, 4);
  assert.equal(journalReport('{"event":"start"}\n{"event":"start"}', 'unfinished').runs.length, 2);
});
