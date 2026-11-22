import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { Command } from 'commander';
import { testDirectory } from './helpers.js';
import { archiveTest, zip } from './acceptance-zip.js';
import { modBundleFiles } from '../src/bundle.js';
import { ARCHIVE_NAME, acceptanceFile, registerAcceptanceTools } from '../src/acceptance-tools.js';

const commit = 'a'.repeat(40);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function fixture(t, { archiveCommit = commit } = {}) {
  const root = await testDirectory(t, 'acceptance-mods-');
  const modsDir = join(root, 'launcher profile/mods');
  const directory = join(root, 'agent-home');
  const dist = join(root, 'dist');
  await mkdir(modsDir, { recursive: true });
  await mkdir(join(dist, 'mods'), { recursive: true });
  const build = (sourceCommit) => JSON.stringify({ version: '0.1.0', sourceCommit, sourceModified: false });
  const jarContents = modBundleFiles.map(({ name }) => [name, `bundle entry: ${name}`]);
  const archive = zip([
    ['BUILD.json', build(archiveCommit)],
    ...jarContents.map(([name, bytes]) => [`mods/${name}`, bytes]),
  ]);
  await writeFile(join(dist, 'BUILD.json'), build(commit));
  await writeFile(join(dist, ARCHIVE_NAME), archive);
  await writeFile(join(dist, 'ARCHIVE_SHA256SUMS'), `${digest(archive)}  ${ARCHIVE_NAME}\n`);
  for (const [name, bytes] of jarContents) await writeFile(join(modsDir, name), bytes);
  await writeFile(join(modsDir, 'some-other-mod.jar'), 'unrelated');

  const program = new Command().exitOverride();
  let output;
  registerAcceptanceTools(program, {
    print: (value) => {
      output = value;
    },
    write: (value) => {
      output = value;
    },
    root,
    directory,
    git: ([command]) => ({ status: 0, stdout: command === 'rev-parse' ? commit : '' }),
  });
  const run = async (...args) => {
    await program.parseAsync(['acceptance', ...args], { from: 'user' });
    return output;
  };
  const start = (...args) => run('start', 'fabric-packaged-install', '--backend', 'fabric', ...args);
  const finish = async ({ session, steps }) => {
    for (const [index] of steps.entries()) await run('step', session.id, String(index + 1), 'pass');
    return run('finish', session.id, 'pass');
  };
  return { directory, dist, modsDir, run, start, finish, jarContents, archiveSha256: digest(archive) };
}

test('matching launcher jars make a completed Fabric gate eligible', archiveTest, async (t) => {
  const { modsDir, run, start, finish, jarContents, archiveSha256 } = await fixture(t);
  const started = await start('--mods-dir', modsDir);
  assert.deepEqual(started.session.provenance.mods, {
    archiveSha256,
    jars: jarContents.map(([name, bytes]) => ({ name, expectedSha256: digest(bytes), sha256: digest(bytes) })),
  });
  assert.equal((await finish(started)).eligible, true);
  const markdown = await run('report');
  assert.match(markdown, /Launcher mods at session start/);
  assert.ok(markdown.includes(digest(jarContents[0][1])));
  assert.ok(!markdown.includes(modsDir));
});

test('missing and replaced launcher jars stay ineligible despite matching loose jars', archiveTest, async (t) => {
  const { dist, modsDir, run, start, finish, jarContents } = await fixture(t);
  const [[missing], [replaced, expected]] = jarContents;
  const replacement = 'different bytes';
  await rm(join(modsDir, missing));
  await writeFile(join(dist, 'mods', replaced), replacement);
  await writeFile(join(modsDir, replaced), replacement);
  const started = await start('--mods-dir', modsDir);
  const result = await finish(started);
  assert.deepEqual(
    started.session.provenance.mods.jars.slice(0, 2).map(({ sha256 }) => sha256),
    [null, digest(replacement)],
  );
  assert.equal(result.eligible, false);
  assert.deepEqual(result.problems, [
    `launcher mod jar missing or unreadable: ${missing}`,
    `launcher mod jar differs from the archive: ${replaced}`,
  ]);
  const { sessions } = await run('report', '--format', 'json');
  assert.equal(sessions[0].provenance.mods.jars[1].expectedSha256, digest(expected));
});

test('an archive from a different commit cannot verify the launcher jars', archiveTest, async (t) => {
  const { modsDir, start, finish } = await fixture(t, { archiveCommit: 'b'.repeat(40) });
  const started = await start('--mods-dir', modsDir);
  assert.equal(started.session.provenance.archive.matches, true);
  assert.match(started.session.warnings.join('\n'), /archive BUILD\.json differs from dist\/BUILD\.json/);
  const result = await finish(started);
  assert.equal(result.eligible, false);
  assert.deepEqual(result.problems, [
    'archive BUILD.json not verified against dist/BUILD.json',
    'launcher mod jars were not verified against the recorded archive',
  ]);
});

test('legacy records without mod hashes still load and the Fabric gate explains why evidence is ineligible', async (t) => {
  const { directory, run, start, finish } = await fixture(t);
  const started = await start();
  const result = await finish(started);
  assert.equal(result.eligible, false);
  const onDisk = JSON.parse(await readFile(acceptanceFile(directory), 'utf8'));
  assert.equal(onDisk.version, 1);
  assert.equal(onDisk.sessions[0].provenance.mods, undefined);
  delete onDisk.sessions[0].provenance.archive.manifestMatches;
  onDisk.sessions[0].warnings = [];
  await writeFile(acceptanceFile(directory), JSON.stringify(onDisk));
  const status = await run('status');
  assert.deepEqual(status.gates.find(({ id }) => id === 'fabric-packaged-install').backends[0].problems, [
    'launcher mod jars were not checked; start with --mods-dir',
  ]);
});
