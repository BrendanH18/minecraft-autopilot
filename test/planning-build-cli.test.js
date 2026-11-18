import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { calculateOffline } from '../src/offline-kit.js';
import { ALL_PLANNING_GROUPS, BUILD_PLANNING_GROUPS } from '../src/planning-tools.js';

const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
const groups = [
  'scaffold-plan',
  'beacon-plan',
  'tunnel-vent',
  'canal-lock',
  'sponge-plan',
  'ice-road',
  'furnace-bank',
  'brewing-bench',
];

test('the build planning inventory contains exactly 200 distinct commands', () => {
  assert.deepEqual(
    BUILD_PLANNING_GROUPS.map(({ name }) => name),
    groups,
  );
  const studyGroups = new Set(ALL_PLANNING_GROUPS.map(({ name }) => name));
  const commands = new Set();
  for (const { name, commands: specs } of BUILD_PLANNING_GROUPS) {
    assert.ok(!studyGroups.has(name), `${name} is a direct CLI group`);
    assert.equal(specs.length, 25, name);
    for (const { signature } of specs) commands.add(`${name} ${signature.split(' ')[0]}`);
  }
  assert.equal(commands.size, 200);
});

const samples = {
  'scaffold-plan': ['frame-grid', '9', '5', '4', '5'],
  'beacon-plan': ['tier-materials', '3', '4'],
  'tunnel-vent': ['clear-profile', '7', '5', '2', '1', '5', '4'],
  'canal-lock': ['flight-lifts', '0', '11', '4'],
  'sponge-plan': ['section-grid', '8', '7', '3', '2'],
  'ice-road': ['turn-mix', '[[0,0],[3,0],[3,5],[0,5]]'],
  'furnace-bank': ['bay-layout', '8,0,12', '4', '1'],
  'brewing-bench': ['forked-runs', '4,5,2', '3'],
};

for (const groupName of groups) {
  test(`mc-agent discovers and runs ${groupName} offline`, () => {
    const group = BUILD_PLANNING_GROUPS.find(({ name }) => name === groupName);
    const [command, ...args] = samples[groupName];
    const help = execFileSync(process.execPath, [cli, groupName, '--help'], { encoding: 'utf8' });
    for (const { signature } of group.commands) {
      assert.ok(help.includes(signature), `Help is missing ${signature}`);
    }
    const output = execFileSync(process.execPath, [cli, groupName, command, ...args], { encoding: 'utf8' });
    assert.deepEqual(JSON.parse(output), calculateOffline(group, command, args));
  });
}
