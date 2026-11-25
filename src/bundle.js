import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

export const ARCHIVE_NAME = 'minecraft-agent-0.1.0.zip';
export const modBundleFiles = [
  { name: 'minecraft-agent-0.1.0.jar' },
  {
    name: 'baritone-api-fabric-1.11.3.jar',
    sha256: 'f9a9b17a41d7d7ad22c759058b14fd01e3319663282e66f99e18153237fa6767',
  },
  {
    name: 'fabric-api-0.116.18+1.21.1.jar',
    sha256: '1cb46442dda6d3be9979a2619610eb1c1f6641cd7ed7cb3eec058589ce9eed46',
  },
];

const execFileAsync = promisify(execFile);

async function regularFile(path) {
  if (!(await lstat(path)).isFile()) throw new Error(`Bundle entry must be a regular file: ${path}`);
  return readFile(path);
}

async function verifyBundleContents(readEntry, expectedFiles) {
  for (const name of ['INSTALL.md', 'LICENSE']) {
    if (!(await readEntry(name)).toString('utf8').trim()) throw new Error(`Bundle ${name} is empty.`);
  }
  const lines = (await readEntry('SHA256SUMS')).toString('utf8').trim().split('\n');
  const hashes = new Map();
  for (const line of lines) {
    const match = /^([a-f0-9]{64}) {2}([a-zA-Z0-9_.+-]+\.jar)$/.exec(line);
    if (!match || hashes.has(match[2])) throw new Error('Invalid or duplicate bundle checksum entry.');
    hashes.set(match[2], match[1]);
  }
  const names = expectedFiles.map((file) => file.name).sort();
  if (JSON.stringify([...hashes.keys()].sort()) !== JSON.stringify(names)) {
    throw new Error('Bundle must contain exactly the expected mod jars and checksum entries.');
  }
  for (const file of expectedFiles) {
    const bytes = await readEntry(`mods/${file.name}`);
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== hashes.get(file.name)) throw new Error(`Bundle checksum mismatch: ${file.name}`);
    if (file.sha256 && digest !== file.sha256) throw new Error(`Pinned dependency checksum mismatch: ${file.name}`);
  }
  return { verified: true, files: names };
}

async function checkLooseEntries(directory, expectedFiles) {
  const actual = (await readdir(join(directory, 'mods'))).sort();
  const expected = expectedFiles.map(({ name }) => name).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error('Bundle must contain exactly the expected mod jars and checksum entries.');
}

/** Validate a complete bundle and pinned third-party bytes before distributing it. */
export async function verifyModBundle(directory, expectedFiles = modBundleFiles) {
  await checkLooseEntries(directory, expectedFiles);
  return verifyBundleContents((name) => regularFile(join(directory, name)), expectedFiles);
}

/** Verify the installable ZIP. The build check also compares each file with the loose bundle. */
export async function verifyModArchive(directory, { expectedFiles = modBundleFiles, compareLoose = true } = {}) {
  if (compareLoose) await checkLooseEntries(directory, expectedFiles);
  const archivePath = resolve(directory, ARCHIVE_NAME);
  const checksum = async () =>
    createHash('sha256')
      .update(await regularFile(archivePath))
      .digest('hex');
  const archiveSha256 = await checksum();
  const recorded = (await regularFile(join(directory, 'ARCHIVE_SHA256SUMS'))).toString('utf8').trim();
  if (recorded !== `${archiveSha256}  ${ARCHIVE_NAME}`) throw new Error('Archive checksum mismatch.');

  const { stdout: listing } = await execFileAsync('unzip', ['-Z1', archivePath], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024,
    timeout: 10_000,
  });
  const jars = expectedFiles.map(({ name }) => `mods/${name}`);
  const names = ['BUILD.json', 'INSTALL.md', 'LICENSE', 'SHA256SUMS', ...jars];
  const entries = listing.replace(/\r?\n$/, '').split(/\r?\n/);
  const expected = new Set(entries.includes('mods/') ? [...names, 'mods/'] : names);
  if (entries.length !== expected.size || !entries.every((name) => expected.delete(name))) {
    throw new Error('Archive must contain exactly the expected bundle entries.');
  }
  const { stdout: details } = await execFileAsync('unzip', ['-Z', '-l', archivePath], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024,
    timeout: 10_000,
  });
  const modes = details
    .replace(/\r?\n$/, '')
    .split(/\r?\n/)
    .slice(2, -1);
  if (
    modes.length !== entries.length ||
    modes.some((line, i) => !line.startsWith('-') && !(entries[i] === 'mods/' && line.startsWith('d')))
  ) {
    throw new Error('Archive bundle files must be regular files.');
  }
  const readEntry = async (name) => {
    const { stdout: packed } = await execFileAsync('unzip', ['-p', archivePath, name], {
      encoding: 'buffer',
      maxBuffer: name.startsWith('mods/') ? 32 * 1024 * 1024 : 64 * 1024,
      timeout: 10_000,
    });
    if (compareLoose && !packed.equals(await regularFile(join(directory, name))))
      throw new Error(`Archive entry differs from loose bundle: ${name}`);
    return packed;
  };
  await readEntry('BUILD.json');
  const bundle = await verifyBundleContents(readEntry, expectedFiles);
  if ((await checksum()) !== archiveSha256) throw new Error('Archive changed during verification.');
  return { ...bundle, archive: ARCHIVE_NAME, archiveSha256 };
}
