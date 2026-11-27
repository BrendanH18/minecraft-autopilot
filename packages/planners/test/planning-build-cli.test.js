import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { calculateOffline } from '../src/offline-kit.js';
import { ALL_PLANNING_GROUPS, BUILD_PLANNING_GROUPS } from '../src/planning-tools.js';

const cli = fileURLToPath(new URL('../../../src/cli.js', import.meta.url));
const groups = [
  'scaffold-plan',
  'beacon-plan',
  'tunnel-vent',
  'canal-lock',
  'sponge-plan',
  'ice-road',
  'furnace-bank',
  'brewing-bench',
  'orchardplan',
  'greenhouse',
  'maproom',
  'bookbind',
  'bannerhall',
  'harborplan',
  'aqueduct',
  'viaduct',
  'textile',
  'note-score',
  'library-plan',
  'mural',
];

test('the build planning inventory contains exactly 500 distinct commands', () => {
  assert.deepEqual(
    BUILD_PLANNING_GROUPS.map(({ name }) => name),
    groups,
  );
  const studyGroups = new Set(ALL_PLANNING_GROUPS.map(({ name }) => name));
  const commands = new Set();
  for (const { name, commands: specs } of BUILD_PLANNING_GROUPS) {
    assert.ok(studyGroups.has(name), `${name} is missing from the study inventory`);
    assert.equal(specs.length, 25, name);
    for (const { signature } of specs) commands.add(`${name} ${signature.split(' ')[0]}`);
  }
  assert.equal(commands.size, 500);
});

const samples = {
  textile: ['checker-layout', '3', '2', '2', '1', '4,8'],
  'note-score': ['retune-clicks', '24,4,1', '0,4,24'],
  'library-plan': ['pull-slips', '8,0,8', '8,8,5'],
  mural: ['turn-right', '2', '1,2,3,4'],
  orchardplan: ['planting-grid', '17', '11', '1', '2', '4', '3'],
  greenhouse: ['wall-glazing', '7', '5', '4', '6'],
  maproom: ['scale-span', '3'],
  bookbind: ['chapter-starts', '3,1,5', '2'],
  bannerhall: ['stripe-order', '2,5,3', '5', '1'],
  harborplan: ['quay-frontage', '3,5,4', '2', '1'],
  aqueduct: ['trough-section', '4', '3', '1', '2'],
  viaduct: ['span-balance', '17', '5'],
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
    const direct = JSON.parse(output);
    assert.deepEqual(direct, calculateOffline(group, command, args));
    const request = JSON.stringify({ cases: [args] });
    const batch = execFileSync(process.execPath, [cli, 'study', 'batch', groupName, command, request], {
      encoding: 'utf8',
    });
    assert.deepEqual(JSON.parse(batch).cases[0].result, direct.result);
  });
}
