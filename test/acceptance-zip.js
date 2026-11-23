import { crc32 } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { modBundleFiles } from '../src/bundle.js';

export const archiveTest = { skip: spawnSync('unzip', ['-v'], { stdio: 'ignore' }).status !== 0 && 'requires unzip' };

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const jarContents = modBundleFiles.map(({ name }) => [name, `bundle entry: ${name}`]);
export const expectedFiles = jarContents.map(([name, bytes]) => ({ name, sha256: digest(bytes) }));

export function candidateZip(build, { omit } = {}) {
  const entries = [
    ['BUILD.json', JSON.stringify(build)],
    ['INSTALL.md', 'Install instructions'],
    ['LICENSE', 'License'],
    ['SHA256SUMS', expectedFiles.map(({ name, sha256 }) => `${sha256}  ${name}`).join('\n')],
    ...jarContents.map(([name, bytes]) => [`mods/${name}`, bytes]),
  ];
  return zip(entries.filter(([name]) => name !== omit));
}

// Write a ZIP with stored entries so the fixture needs only the reader used by acceptance.
export function zip(entries) {
  const files = [];
  const directory = [];
  let offset = 0;
  for (const [path, text, mode] of entries) {
    const name = Buffer.from(path);
    const bytes = Buffer.from(text);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt32LE(crc32(bytes), 14);
    header.writeUInt32LE(bytes.length, 18);
    header.writeUInt32LE(bytes.length, 22);
    header.writeUInt16LE(name.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    if (mode !== undefined) {
      entry.writeUInt16LE(0x0314, 4);
      entry.writeUInt16LE(mode, 40);
    }
    header.copy(entry, 6, 4, 30);
    entry.writeUInt32LE(offset, 42);
    files.push(header, name, bytes);
    directory.push(entry, name);
    offset += header.length + name.length + bytes.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(Buffer.concat(directory).length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...files, ...directory, end]);
}
