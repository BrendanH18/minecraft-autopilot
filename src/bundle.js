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
    name: 'fabric-api-0.116.17+1.21.1.jar',
    sha256: '79ac44b40780acbd884b34c50be1e39af682847e5f5cb3b1fddeeaa768dce800',
  },
];

const execFileAsync = promisify(execFile);

async function regularFile(path) {
  if (!(await lstat(path)).isFile()) throw new Error(`Bundle entry must be a regular file: ${path}`);
  return readFile(path);
}

/** Validate a complete bundle and pinned third-party bytes before distributing it. */
export async function verifyModBundle(directory, expectedFiles = modBundleFiles) {
  for (const name of ['INSTALL.md', 'LICENSE']) {
    if (!(await regularFile(join(directory, name))).toString('utf8').trim())
      throw new Error(`Bundle ${name} is empty.`);
  }
  const lines = (await regularFile(join(directory, 'SHA256SUMS'))).toString('utf8').trim().split('\n');
  const hashes = new Map();
  for (const line of lines) {
    const match = /^([a-f0-9]{64}) {2}([a-zA-Z0-9_.+-]+\.jar)$/.exec(line);
    if (!match || hashes.has(match[2])) throw new Error('Invalid or duplicate bundle checksum entry.');
    hashes.set(match[2], match[1]);
  }
  const names = expectedFiles.map((file) => file.name).sort();
  const actual = (await readdir(join(directory, 'mods'))).sort();
  if (
    JSON.stringify(actual) !== JSON.stringify(names) ||
    JSON.stringify([...hashes.keys()].sort()) !== JSON.stringify(names)
  ) {
    throw new Error('Bundle must contain exactly the expected mod jars and checksum entries.');
  }
  for (const file of expectedFiles) {
    const bytes = await regularFile(join(directory, 'mods', file.name));
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== hashes.get(file.name)) throw new Error(`Bundle checksum mismatch: ${file.name}`);
    if (file.sha256 && digest !== file.sha256) throw new Error(`Pinned dependency checksum mismatch: ${file.name}`);
  }
  return { verified: true, files: names };
}

/** Check that the published ZIP contains exactly the files verified in the loose bundle. */
export async function verifyModArchive(directory, expectedFiles = modBundleFiles) {
  const bundle = await verifyModBundle(directory, expectedFiles);
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
  const names = ['BUILD.json', 'INSTALL.md', 'LICENSE', 'SHA256SUMS', ...bundle.files.map((name) => `mods/${name}`)];
  const entries = listing.trimEnd().split('\n');
  const expected = new Set(entries.includes('mods/') ? [...names, 'mods/'] : names);
  if (entries.length !== expected.size || !entries.every((name) => expected.delete(name))) {
    throw new Error('Archive must contain exactly the expected bundle entries.');
  }
  for (const name of names) {
    const loose = await regularFile(join(directory, name));
    const { stdout: packed } = await execFileAsync('unzip', ['-p', archivePath, name], {
      encoding: 'buffer',
      maxBuffer: Math.max(loose.length, 64 * 1024),
      timeout: 10_000,
    });
    if (!packed.equals(loose)) throw new Error(`Archive entry differs from loose bundle: ${name}`);
  }
  if ((await checksum()) !== archiveSha256) throw new Error('Archive changed during verification.');
  return { ...bundle, archive: ARCHIVE_NAME, archiveSha256 };
}
