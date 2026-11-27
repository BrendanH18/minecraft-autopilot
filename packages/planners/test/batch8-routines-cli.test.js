import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { testDirectory } from '../../../test/helpers.js';
import { parseRoutine } from '../../../src/routine.js';
import { beforeRoutine, afterRoutine, compareFixtures, selectFixtures } from './routine-batch8-fixtures.js';
import { CLI_PATH } from './cli-path.js';

const exec = promisify(execFile);
test('all 50 comparison and selection commands run through the CLI offline and preserve files', {
  timeout: 180000,
}, async (t) => {
  const directory = await testDirectory(t),
    before = join(directory, 'before.json'),
    after = join(directory, 'after.json');
  await writeFile(before, JSON.stringify(beforeRoutine));
  await writeFile(after, JSON.stringify(afterRoutine));
  let commands = 0;
  for (const [group, fixtures] of [
    ['compare-routines', compareFixtures],
    ['select-routine', selectFixtures],
  ]) {
    for (const [name, [args, expected]] of Object.entries(fixtures)) {
      const files = group === 'compare-routines' ? [before, after] : [before];
      const { stdout, stderr } = await exec(process.execPath, [
        CLI_PATH,
        '--json',
        '--bridge',
        join(directory, 'nonexistent.json'),
        group,
        name,
        '--',
        ...files,
        ...args,
      ]);
      assert.equal(stderr, '');
      const result = JSON.parse(stdout);
      if (group === 'compare-routines') expected(result);
      else {
        assert.deepEqual(
          result.actions,
          expected.map((i) => beforeRoutine[i - 1]),
          name,
        );
        assert.deepEqual(parseRoutine(stdout), result.actions);
      }
      commands++;
    }
  }
  assert.equal(commands, 50);
  assert.equal(await readFile(before, 'utf8'), JSON.stringify(beforeRoutine));
  assert.equal(await readFile(after, 'utf8'), JSON.stringify(afterRoutine));
  await assert.rejects(
    exec(process.execPath, [CLI_PATH, '--json', 'select-routine', 'item', before, 'coal']),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(JSON.parse(error.stderr).error, /no actions/);
      return true;
    },
  );
});
