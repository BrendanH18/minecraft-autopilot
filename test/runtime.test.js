import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { dataDirectory, projectRoot } from '../src/config.js';
import { cleanupRuntime } from '../src/runtime.js';
import { Harness } from '../src/harness.js';
import { DemoDriver } from '../src/demo-driver.js';
import { startBridge } from '../src/bridge-server.js';
import { testDirectory } from './helpers.js';

test('the default CLI runtime is project-local regardless of shell working directory', () => {
  if (!process.env.MC_AGENT_HOME) assert.equal(dataDirectory, join(projectRoot, '.runtime'));
});

test('starting another bridge cannot replace a live bridge’s discovery file', async t => {
  const directory = await testDirectory(t, 'ownership-');
  const discoveryPath = join(directory, 'bridge.json');
  const first = await startBridge(new Harness(new DemoDriver()), { discoveryPath });
  t.after(() => first.close());
  const before = await readFile(discoveryPath, 'utf8');
  const unused = new Harness(new DemoDriver());
  t.after(() => unused.close());
  await assert.rejects(startBridge(unused, { discoveryPath }), /Close the game|already running/);
  assert.equal(await readFile(discoveryPath, 'utf8'), before);
  await assert.rejects(cleanupRuntime({ directory }), /Close the game/);
});

test('cleanup preserves sign-in tokens, homes, and unrelated files unless explicitly selected', async t => {
  const directory = await testDirectory(t, 'cleanup-');
  await mkdir(join(directory, 'auth'));
  await writeFile(join(directory, 'auth/token'), 'test-token');
  await writeFile(join(directory, 'server-homes.json'), '{}');
  await writeFile(join(directory, 'notes.txt'), 'keep this');
  await writeFile(join(directory, 'profile.json'), '{}');
  const preview = await cleanupRuntime({ directory, dryRun: true });
  assert.deepEqual(preview.paths, [join(directory, 'profile.json')]);
  await access(join(directory, 'profile.json'));
  await cleanupRuntime({ directory });
  await assert.rejects(access(join(directory, 'profile.json')));
  await access(join(directory, 'auth/token')); await access(join(directory, 'server-homes.json')); await access(join(directory, 'notes.txt'));
  await cleanupRuntime({ directory, includeAuth: true, includeHomes: true });
  await assert.rejects(access(join(directory, 'auth')));
  await assert.rejects(access(join(directory, 'server-homes.json')));
  await access(join(directory, 'notes.txt'));
});

test('server --version selects the Minecraft version instead of printing the CLI version', async t => {
  const directory = await testDirectory(t, 'cli-version-');
  const { execFile } = await import('node:child_process');
  const cli = join(projectRoot, 'src/cli.js');
  const result = await new Promise(resolve => execFile(process.execPath,
    [cli, '--bridge', join(directory, 'bridge.json'), 'server', '--host', '127.0.0.1', '--port', '1', '--account', 'Tester', '--auth', 'offline', '--version', '1.21.1'],
    { timeout: 20_000 }, (error, stdout, stderr) => resolve({ error, stdout, stderr })));
  assert.equal(result.stdout.trim(), '');
  assert.match(result.stderr, /Connecting to 127\.0\.0\.1:1/);
  assert.match(result.stderr, /ECONNREFUSED/);
  assert.equal(result.error?.killed, false, 'a refused connection should exit promptly');
});
