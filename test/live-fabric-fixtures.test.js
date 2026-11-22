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
      'takeover',
      'cobblestone-hostiles-dimension',
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
      'eat-interruption',
      'low-health-retreat',
      'collection-return',
      'collect-full-inventory',
      'withdraw-multi-stack',
      'craft-interruption',
      'death-navigation',
      'disconnect-mining',
    ],
  );
  assert.match(plan, /data get entity FabricTester Inventory/);
  assert.match(plan, /data get entity FabricTester Pos/);
  assert.match(plan, /\[pit\][\s\S]*effect give FabricTester minecraft:mining_fatigue/);
  assert.match(plan, /\[deposit-barrel\][\s\S]*minecraft:barrel\[facing=up\]/);
});

test('the takeover fixture gives time to interrupt mining and prints independent follow-up reads', () => {
  const plan = fixturePlan('takeover', 'FixtureUser');
  assert.match(plan.fixture.join('\n'), /fill .* minecraft:oak_log/);
  assert.match(plan.prepare.join('\n'), /effect give FixtureUser minecraft:mining_fatigue/);
  assert.deepEqual(plan.verify, ['data get entity FixtureUser Inventory', 'data get entity FixtureUser Pos']);
  assert.ok(plan.actions.includes('mc-agent collect oak_log 8'));
  assert.match(plan.actions.join('\n'), /kill -9 <pid>.*\n.*cancelled goto job with a lease expired message/);
});

test('the dimension change targets the prepared floor and the named player', () => {
  const plan = fixturePlan('cobblestone-hostiles-dimension', 'FixtureUser');
  assert.match(plan.fixture.join('\n'), /fill .* minecraft:cobblestone/);
  assert.ok(plan.fixture.includes('execute in minecraft:the_nether run fill 0 200 0 4 200 4 minecraft:stone'));
  assert.match(plan.actions.join('\n'), /execute in minecraft:the_nether run tp FixtureUser 2\.5 201 2\.5/);
  assert.match(plan.actions.join('\n'), /cancelled goto job with a dimension changed message/);
  assert.ok(plan.verify.includes('data get entity FixtureUser Dimension'));
  assert.match(
    plan.verify.join('\n'),
    /data get entity @e\[type=minecraft:husk,tag=fabric_fixture_hostile,limit=1\] Pos/,
  );
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

test('the eating and retreat fixtures expose independent vitals and use repeatable starting conditions', () => {
  const player = 'FixtureUser';
  const eating = fixturePlan('eat-interruption', player);
  assert.deepEqual(eating.vitalTarget, { path: 'foodLevel', effect: 'hunger', amplifier: 100, target: 10 });
  assert.ok(eating.fixture.includes('difficulty normal'));
  assert.ok(eating.prepare.includes(`give ${player} minecraft:bread 8`));
  assert.ok(eating.verify.includes(`data get entity ${player} foodLevel`));
  const retreat = fixturePlan('low-health-retreat', player);
  assert.ok(retreat.fixture.includes('gamerule naturalRegeneration false'));
  assert.deepEqual(retreat.vitalTarget, { path: 'Health', effect: 'poison', amplifier: 1, target: 8 });
  assert.ok(retreat.verify.includes(`data get entity ${player} Health`));
  assert.ok(retreat.actions.includes('mc-agent set-home'));
});

test('collection fixtures arrange a partial return and leave exactly one main inventory slot before interruption', () => {
  const player = 'FixtureUser';
  const partial = fixturePlan('collection-return', player);
  assert.ok(partial.fixture.includes('fill 80 -60 0 81 -60 0 minecraft:sand'));
  assert.ok(partial.actions.includes('mc-agent collect sand 5'));
  const full = fixturePlan('collect-full-inventory', player);
  assert.ok(full.prepare.includes(`give ${player} minecraft:iron_axe 1`));
  assert.ok(full.prepare.includes(`give ${player} minecraft:cobblestone 2176`));
  assert.ok(full.actions.some((action) => action.includes(`give ${player} minecraft:dirt 64`)));
});

test('transfer and crafting interruption fixtures seed several units and print checks for their containers', () => {
  const player = 'FixtureUser';
  const withdrawal = fixturePlan('withdraw-multi-stack', player);
  assert.equal(withdrawal.fixture.at(-1).match(/count:64/g).length, 3);
  assert.equal(withdrawal.verify.filter((command) => command.startsWith('data get block')).length, 2);
  const crafting = fixturePlan('craft-interruption', player);
  assert.ok(crafting.prepare.includes(`give ${player} minecraft:oak_planks 32`));
  assert.ok(crafting.verify.includes('execute if block 98 -60 0 minecraft:crafting_table'));
});

test('death and disconnect fixture instructions leave the server running for independent follow-up reads', () => {
  const player = 'FixtureUser';
  const death = fixturePlan('death-navigation', player);
  assert.ok(death.fixture.includes('gamerule keepInventory true'));
  assert.ok(death.actions.some((action) => action.includes(`kill ${player}`)));
  const disconnect = fixturePlan('disconnect-mining', player);
  assert.ok(disconnect.actions.some((action) => action.includes(`kick ${player}`)));
  assert.ok(disconnect.verify.includes(`data get entity ${player} Pos`));
});
