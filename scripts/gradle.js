import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// Keep downloaded tools, game assets, and development runtime files in this project.
const root = fileURLToPath(new URL('../', import.meta.url));
const windows = process.platform === 'win32';
const wrapper = join(root, 'mod', windows ? 'gradlew.bat' : 'gradlew');
const child = spawn(wrapper, ['-p', join(root, 'mod'), '--no-daemon', ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
  shell: windows,
  env: { ...process.env, GRADLE_USER_HOME: join(root, '.gradle-user'), MC_AGENT_HOME: join(root, '.runtime') },
});
process.once('SIGINT', () => child.kill('SIGINT'));
process.once('SIGTERM', () => child.kill('SIGTERM'));
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('exit', (code, signal) => { process.exitCode = code ?? (signal ? 130 : 1); });
