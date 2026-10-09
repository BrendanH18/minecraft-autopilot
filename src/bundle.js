import { createHash } from 'node:crypto';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { join } from 'node:path';

export const modBundleFiles = [
  { name: 'minecraft-agent-0.1.0.jar' },
  { name: 'baritone-api-fabric-1.11.3.jar', sha256: 'f9a9b17a41d7d7ad22c759058b14fd01e3319663282e66f99e18153237fa6767' },
  { name: 'fabric-api-0.116.17+1.21.1.jar', sha256: '79ac44b40780acbd884b34c50be1e39af682847e5f5cb3b1fddeeaa768dce800' },
];

/** Validate a complete bundle and pinned third-party bytes before distributing it. */
export async function verifyModBundle(directory, expectedFiles = modBundleFiles) {
  const regularFile = async path => {
    if (!(await lstat(path)).isFile()) throw new Error(`Bundle entry must be a regular file: ${path}`);
    return readFile(path);
  };
  for (const name of ['INSTALL.md', 'LICENSE']) {
    if (!(await regularFile(join(directory, name))).toString('utf8').trim()) throw new Error(`Bundle ${name} is empty.`);
  }
  const lines = (await regularFile(join(directory, 'SHA256SUMS'))).toString('utf8').trim().split('\n');
  const hashes = new Map();
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  ([a-zA-Z0-9_.+-]+\.jar)$/.exec(line);
    if (!match || hashes.has(match[2])) throw new Error('Invalid or duplicate bundle checksum entry.');
    hashes.set(match[2], match[1]);
  }
  const names = expectedFiles.map(file => file.name).sort();
  const actual = (await readdir(join(directory, 'mods'))).sort();
  if (JSON.stringify(actual) !== JSON.stringify(names) || JSON.stringify([...hashes.keys()].sort()) !== JSON.stringify(names)) {
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
