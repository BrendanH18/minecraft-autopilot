import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';

const directory = fileURLToPath(new URL('../.deps/', import.meta.url));
const name = 'baritone-api-fabric-1.11.3.jar';
const expected = 'f9a9b17a41d7d7ad22c759058b14fd01e3319663282e66f99e18153237fa6767';
const checksum = bytes => createHash('sha256').update(bytes).digest('hex');
await mkdir(directory, { recursive: true });
let existing;
try { existing = await readFile(`${directory}/${name}`); } catch {}
if (!existing || checksum(existing) !== expected) {
  if (!process.argv.includes('--allow-downloads')) throw new Error(`${name} is missing or failed verification. No download was made. Re-run setup:mod with --allow-downloads only after approving this dependency.`);
  console.log(`Downloading ${name} from the official Baritone release…`);
  const response = await fetch(`https://github.com/cabaletta/baritone/releases/download/v1.11.3/${name}`, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Baritone download failed: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (checksum(bytes) !== expected) throw new Error('Baritone checksum mismatch; refusing to use this download.');
  await writeFile(`${directory}/${name}.tmp`, bytes);
  await rename(`${directory}/${name}.tmp`, `${directory}/${name}`);
}
await mkdir(`${directory}/tmp`, { recursive: true });
const temporary = await mkdtemp(join(directory, 'tmp', 'baritone-'));
try {
  execFileSync('jar', ['xf', `${directory}/${name}`, 'META-INF/jars/nether-pathfinder-1.6.jar'], { cwd: temporary });
  const nested = await readFile(join(temporary, 'META-INF/jars/nether-pathfinder-1.6.jar'));
  await writeFile(`${directory}/nether-pathfinder-1.6.jar`, nested);
} finally { await rm(temporary, { recursive: true, force: true }); }
console.log('Baritone dependency verified.');
