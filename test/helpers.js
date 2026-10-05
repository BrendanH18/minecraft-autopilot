import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { projectRoot } from '../src/config.js';

export async function testDirectory(t, prefix = 'test-') {
  const root = join(projectRoot, '.runtime/tests');
  await mkdir(root, { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(join(root, prefix));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
