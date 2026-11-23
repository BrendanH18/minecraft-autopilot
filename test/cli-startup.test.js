import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const rejectPlannerImport = `
  export async function resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('./planning-') || specifier === './acceptance-tools.js')
      throw new Error('Unexpected offline tool import: ' + specifier);
    return nextResolve(specifier, context);
  }
`;
const loader = `data:text/javascript,${encodeURIComponent(rejectPlannerImport)}`;
const preload = `data:text/javascript,${encodeURIComponent(
  `import { register } from 'node:module'; register(${JSON.stringify(loader)});`,
)}`;

for (const [command, ...options] of [
  ['stop'],
  ['observe', '--json', '--bridge', 'unused.json'],
  ['status', '--bridge=unused.json', '--json'],
  ['mcp'],
]) {
  test(`${command} starts without importing offline planners or acceptance tooling`, () => {
    const result = spawnSync(process.execPath, ['--import', preload, 'src/cli.js', ...options, command, '--help'], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Usage: mc-agent (stop|observe|mcp)\b/);
  });
}

test('root help still lists core and offline planner commands', () => {
  const result = spawnSync(process.execPath, ['src/cli.js', '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\bobserve\|status\b/);
  assert.match(result.stdout, /\bscaffold-plan\b/);
  assert.match(result.stdout, /\bstudy\b/);
});

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
