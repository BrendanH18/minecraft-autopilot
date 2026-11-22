import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const rejectPlannerImport = `
  export async function resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('./planning-')) throw new Error('Unexpected planner import: ' + specifier);
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
  test(`${command} starts without importing offline planners`, () => {
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
