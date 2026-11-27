import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { CLI_PATH } from './cli-path.js';

// Rejects the planners, the study workflows and the acceptance tooling; the tool groups stay loadable.
const loader = `
  export async function resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('./planning-') || specifier === './acceptance-tools.js')
      throw new Error('Unexpected planner import: ' + specifier);
    return nextResolve(specifier, context);
  }
`;
const preload = `data:text/javascript,${encodeURIComponent(
  `import { register } from 'node:module'; register(${JSON.stringify(`data:text/javascript,${encodeURIComponent(loader)}`)});`,
)}`;

test('an offline tool group command loads through the package without planners or acceptance tooling', () => {
  const result = spawnSync(process.execPath, ['--import', preload, CLI_PATH, 'supplies', '--help'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Usage: mc-agent supplies\b/);
});

test('root help lists core, tool group and planner commands when the package is installed', () => {
  const result = spawnSync(process.execPath, [CLI_PATH, '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\bobserve\|status\b/);
  assert.match(result.stdout, /\bsupplies\b/);
  assert.match(result.stdout, /\bscaffold-plan\b/);
  assert.match(result.stdout, /\bstudy\b/);
  assert.doesNotMatch(result.stdout, /isn't installed/);
});

test('unknown commands still get suggestions from the planner commands', () => {
  const result = spawnSync(process.execPath, [CLI_PATH, 'suplies'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Did you mean supplies\?/);
});
