import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, unlink, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { verifyModBundle } from '../src/bundle.js';
import { testDirectory } from './helpers.js';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function fixture(t) {
  const directory = await testDirectory(t, 'bundle-');
  await mkdir(join(directory, 'mods'));
  await writeFile(join(directory, 'INSTALL.md'), 'Install instructions');
  await writeFile(join(directory, 'LICENSE'), 'License');
  await writeFile(join(directory, 'mods/app.jar'), 'app');
  await writeFile(join(directory, 'mods/dependency.jar'), 'upstream');
  await writeFile(join(directory, 'SHA256SUMS'), `${digest('app')}  app.jar\n${digest('upstream')}  dependency.jar\n`);
  const expected = [{ name: 'app.jar' }, { name: 'dependency.jar', sha256: digest('upstream') }];
  return { directory, expected };
}

test('a complete bundle verifies its manifest and pinned dependency', async t => {
  const { directory, expected } = await fixture(t);
  assert.deepEqual(await verifyModBundle(directory, expected), { verified: true, files: ['app.jar', 'dependency.jar'] });
  await unlink(join(directory, 'LICENSE'));
  await assert.rejects(verifyModBundle(directory, expected), /ENOENT/);
});

test('corruption is rejected even when the jar filename is correct', async t => {
  const { directory, expected } = await fixture(t);
  await writeFile(join(directory, 'mods/app.jar'), 'corrupted');
  await assert.rejects(verifyModBundle(directory, expected), /Bundle checksum mismatch/);
});

test('altering a dependency and its manifest cannot override the pinned upstream checksum', async t => {
  const { directory, expected } = await fixture(t);
  await writeFile(join(directory, 'mods/dependency.jar'), 'modified');
  await writeFile(join(directory, 'SHA256SUMS'), `${digest('app')}  app.jar\n${digest('modified')}  dependency.jar\n`);
  await assert.rejects(verifyModBundle(directory, expected), /Pinned dependency checksum mismatch/);
});

test('extra jars, duplicate entries, and path traversal invalidate the bundle', async t => {
  const { directory, expected } = await fixture(t);
  await writeFile(join(directory, 'mods/extra.jar'), 'extra');
  await assert.rejects(verifyModBundle(directory, expected), /exactly the expected/);
  await unlink(join(directory, 'mods/extra.jar'));
  for (const manifest of [`${digest('app')}  app.jar\n${digest('app')}  app.jar`, `${digest('app')}  ../app.jar`]) {
    await writeFile(join(directory, 'SHA256SUMS'), manifest);
    await assert.rejects(verifyModBundle(directory, expected), /Invalid or duplicate/);
  }
});

test('a symlink cannot substitute for a bundled jar', async t => {
  const { directory, expected } = await fixture(t);
  await unlink(join(directory, 'mods/dependency.jar'));
  await writeFile(join(directory, 'dependency.jar'), 'upstream');
  await symlink(join(directory, 'dependency.jar'), join(directory, 'mods/dependency.jar'));
  await assert.rejects(verifyModBundle(directory, expected), /regular file/);
});
