import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { testDirectory } from './helpers.js';
import { JOURNAL_COMMANDS, journalReport } from '../src/journal-tools.js';
import { DIAGNOSE_COMMANDS, diagnoseReport } from '../src/diagnose-tools.js';
import { readTranscript } from '../src/transcript.js';
import { fixture, journalArgs } from './transcript-fixture.js';
const exec = promisify(execFile);

test('all 50 transcript commands dispatch through real offline CLI processes', { timeout: 120000 }, async t => {
  const directory = await testDirectory(t), file = join(directory, 'transcript.jsonl'), missingBridge = join(directory, 'absent.json');
  await writeFile(file, fixture);
  let count = 0;
  for (const [group, commands, report] of [['journal', JOURNAL_COMMANDS, journalReport], ['diagnose', DIAGNOSE_COMMANDS, diagnoseReport]]) {
    assert.equal(commands.length, 25);
    for (const [signature] of commands) {
      const name = signature.split(' ')[0], args = group === 'journal' ? journalArgs[name] : [];
      const { stdout, stderr } = await exec(process.execPath, ['src/cli.js', '--bridge', missingBridge, '--json', group, name, file, ...args]);
      assert.deepEqual(JSON.parse(stdout), report(fixture, name, args), `${group} ${name}`); assert.equal(stderr, ''); count++;
    }
  }
  assert.equal(count, 50); assert.equal(await readFile(file, 'utf8'), fixture);
  await assert.rejects(exec(process.execPath, ['src/cli.js', '--json', 'journal', 'head', file, '0']), error => JSON.parse(error.stderr).error.includes('integer'));
  await mkdir(join(directory, 'folder'));
  await assert.rejects(readTranscript(join(directory, 'folder')), /regular file/);
  await assert.rejects(readTranscript(join(directory, 'missing')), /Cannot read/);
});
