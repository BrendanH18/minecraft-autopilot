import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { readdir, access, readFile, stat, mkdir } from 'node:fs/promises';

// Keep downloaded tools, game assets, and development runtime files in this project.
const root = fileURLToPath(new URL('../', import.meta.url));
const windows = process.platform === 'win32';
const wrapper = join(root, 'mod', windows ? 'gradlew.bat' : 'gradlew');
const requested = process.argv.slice(2);
const downloadsAllowed = requested.includes('--allow-downloads');
const argumentsToPass = requested.filter(value => value !== '--allow-downloads');
if (!downloadsAllowed) {
  const distributions = join(root, '.gradle-user/wrapper/dists/gradle-8.12.1-bin');
  let cached = false;
  try {
    for (const directory of await readdir(distributions)) {
      try { await access(join(distributions, directory, 'gradle-8.12.1/bin', windows ? 'gradle.bat' : 'gradle')); cached = true; } catch {}
    }
  } catch {}
  if (!cached) throw new Error('Gradle 8.12.1 is not cached in this project. No download was made. Use --allow-downloads only after approving the download.');
  argumentsToPass.unshift('--offline');
  if (argumentsToPass.includes('runClient')) {
    const assetsRoot = join(root, '.gradle-user/caches/fabric-loom/assets');
    let index;
    try { index = JSON.parse(await readFile(join(assetsRoot, 'indexes/1.21.1-17.json'), 'utf8')); }
    catch { throw new Error('Minecraft asset index is not cached. No download was made.'); }
    for (const object of Object.values(index.objects)) {
      let metadata;
      try { metadata = await stat(join(assetsRoot, 'objects', object.hash.slice(0, 2), object.hash)); } catch {}
      if (!metadata || metadata.size !== object.size) throw new Error(`Minecraft asset ${object.hash} is missing or incomplete. No download was made.`);
    }
    // Loom's asset download task has its own networking, so skip it after verifying the cache.
    argumentsToPass.push('-x', 'downloadAssets');
  }
}
await mkdir(join(root, '.runtime/tmp'), { recursive: true });
const child = spawn(wrapper, ['-p', join(root, 'mod'), '--no-daemon', ...argumentsToPass], {
  cwd: root,
  stdio: 'inherit',
  shell: windows,
  env: { ...process.env, GRADLE_USER_HOME: join(root, '.gradle-user'), MC_AGENT_HOME: join(root, '.runtime') },
});
process.once('SIGINT', () => child.kill('SIGINT'));
process.once('SIGTERM', () => child.kill('SIGTERM'));
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('exit', (code, signal) => { process.exitCode = code ?? (signal ? 130 : 1); });
