import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';
import { fixturePlan, parseOptions } from '../scripts/live-fabric-fixtures.js';

test('Fabric fixture dry run lists all setups and uses the named player without Java or a jar', () => {
  const plan = execFileSync(
    process.execPath,
    [
      'scripts/live-fabric-fixtures.js',
      '--dry-run',
      '--player',
      'FabricTester',
      '--java',
      'unused',
      '--server-jar',
      'unused',
    ],
    { encoding: 'utf8' },
  );
  assert.deepEqual(
    [...plan.matchAll(/^\[([a-z-]+)\]$/gm)].map((match) => match[1]),
    [
      'pit',
      'deposit-return',
      'withdraw',
      'withdraw-omitted',
      'withdraw-no-candidate',
      'withdraw-short-stock',
      'withdraw-full-inventory',
      'craft-bootstrap',
      'craft-missing-ingredients',
      'craft-full-inventory',
      'deposit-chest',
      'deposit-barrel',
      'deposit-full-chest',
      'deposit-double-chest',
    ],
  );
  assert.match(plan, /data get entity FabricTester Inventory/);
  assert.match(plan, /data get entity FabricTester Pos/);
  assert.match(plan, /\[pit\][\s\S]*effect give FabricTester minecraft:mining_fatigue/);
  assert.match(plan, /\[deposit-barrel\][\s\S]*minecraft:barrel\[facing=up\]/);
});

test('Fabric double chest starts empty and records both halves for three-stack takeover', () => {
  const plan = fixturePlan('deposit-double-chest', 'FabricTester');
  assert.ok(plan.prepare.includes('give FabricTester minecraft:oak_log 192'));
  assert.deepEqual(
    plan.fixture.filter((command) => command.startsWith('setblock')),
    [
      'setblock 98 -60 0 minecraft:chest[facing=west,type=left]{Items:[]}',
      'setblock 98 -60 -1 minecraft:chest[facing=west,type=right]',
    ],
  );
  assert.deepEqual(
    plan.verify.filter((command) => command.startsWith('data get block')),
    ['data get block 98 -60 0 Items', 'data get block 98 -60 -1 Items'],
  );
  assert.equal(plan.verify.filter((command) => command.startsWith('execute if block')).length, 2);
});

test('live fixture setup requires a known scenario and a named Minecraft player', () => {
  assert.throws(() => parseOptions(['--scenario', 'pit']), /--player/);
  assert.throws(() => parseOptions(['--scenario', 'missing', '--player', 'FabricTester']), /Unknown fixture/);
  assert.throws(() => parseOptions(['--scenario', 'pit', '--player', '@a']), /Minecraft username/);
  assert.throws(() => parseOptions(['--dry-run', '--port', '65536']), /--port/);
});

test('relative Java paths survive the switch to the server directory', () => {
  assert.equal(parseOptions(['--dry-run', '--java', './jdk/bin/java']).java, resolve('jdk/bin/java'));
  assert.equal(parseOptions(['--dry-run', '--java', 'java21']).java, 'java21');
});
