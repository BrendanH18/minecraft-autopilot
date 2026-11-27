import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { projectRoot } from '../src/config.js';

// Rejects the planner workspace package (by name or by any file inside it) and the acceptance tooling.
const loader = `
  export async function resolve(specifier, context, nextResolve) {
    if (specifier === '@minecraft-autopilot/planners' || specifier.startsWith('./planning-') || specifier === './acceptance-tools.js')
      throw new Error('Unexpected offline import: ' + specifier);
    const result = await nextResolve(specifier, context);
    if (result.url.includes('/packages/planners/')) throw new Error('Unexpected planner import: ' + result.url);
    return result;
  }
`;
const preload = `data:text/javascript,${encodeURIComponent(
  `import { register } from 'node:module'; register(${JSON.stringify(`data:text/javascript,${encodeURIComponent(loader)}`)});`,
)}`;

for (const [command, ...options] of [
  ['stop'],
  ['observe', '--json', '--bridge', 'unused.json'],
  ['status', '--bridge=unused.json', '--json'],
  ['mcp'],
]) {
  test(`${command} starts without importing the planner package or acceptance tooling`, () => {
    const result = spawnSync(process.execPath, ['--import', preload, 'src/cli.js', ...options, command, '--help'], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Usage: mc-agent (stop|observe|mcp)\b/);
  });
}

test('root version skips loading offline commands', () => {
  for (const versionFlag of ['-V', '--cli-version']) {
    const result = spawnSync(process.execPath, ['--import', preload, 'src/cli.js', '--json', versionFlag], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^0\.1\.0\s*$/);
  }
});

test('core commands still reach bridge discovery after the end-of-options marker', () => {
  for (const command of ['observe', 'stop', 'mcp']) {
    const result = spawnSync(
      process.execPath,
      ['--import', preload, 'src/cli.js', '--bridge', 'unused.json', '--json', '--', command],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 1);
    assert.match(JSON.parse(result.stderr).error, /No readable bridge at unused\.json/);
  }
});

test('no core source, script or test imports the planner package or its files', () => {
  for (const directory of ['src', 'scripts', 'test']) {
    for (const name of readdirSync(join(projectRoot, directory), { recursive: true })) {
      if (!name.endsWith('.js')) continue;
      const text = readFileSync(join(projectRoot, directory, name), 'utf8');
      assert.doesNotMatch(
        text,
        /(\bfrom\s+|\bimport\s*\(?\s*)['"`](@minecraft-autopilot\/planners|[./]*\/packages\/planners\b)/,
        `${directory}/${name}`,
      );
    }
  }
});

// A copy of the core with every dependency except the planner package, as after an install without the workspace.
function coreWithoutPlanners(t) {
  const root = mkdtempSync(join(tmpdir(), 'mc-agent-core-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  cpSync(join(projectRoot, 'src'), join(root, 'src'), { recursive: true });
  copyFileSync(join(projectRoot, 'package.json'), join(root, 'package.json'));
  mkdirSync(join(root, 'node_modules'));
  for (const name of readdirSync(join(projectRoot, 'node_modules'))) {
    if (name.startsWith('.') || name === '@minecraft-autopilot') continue;
    symlinkSync(join(projectRoot, 'node_modules', name), join(root, 'node_modules', name), 'junction');
  }
  return (...args) => spawnSync(process.execPath, [join(root, 'src/cli.js'), ...args], { cwd: root, encoding: 'utf8' });
}

test('the core CLI runs without the planner package installed', (t) => {
  const cli = coreWithoutPlanners(t);

  const help = cli('--help');
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /\bobserve\|status\b/);
  assert.match(help.stdout, /\bacceptance\b/);
  assert.doesNotMatch(help.stdout, /^\s+supplies\b/m);
  assert.match(help.stdout, /@minecraft-autopilot\/planners workspace package, which isn't installed/);

  for (const command of ['stop', 'observe', 'mcp', 'agent']) {
    const result = cli(command, '--help');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`Usage: mc-agent ${command}\\b`));
  }
  const missingBridge = cli('--bridge', 'unused.json', '--json', 'observe');
  assert.equal(missingBridge.status, 1);
  assert.match(JSON.parse(missingBridge.stderr).error, /No readable bridge at unused\.json/);

  const planner = cli('supplies', 'summary');
  assert.equal(planner.status, 1);
  assert.match(planner.stderr, /unknown command 'supplies'/);
  assert.match(planner.stderr, /@minecraft-autopilot\/planners workspace package, which isn't installed/);

  const typo = cli('obsrve');
  assert.equal(typo.status, 1);
  assert.match(typo.stderr, /Did you mean observe\?/);
});
