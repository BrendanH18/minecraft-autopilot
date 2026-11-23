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
      'withdraw-craft-model',
      'mcp-collection',
      'deposit-chest',
      'deposit-barrel',
      'deposit-full-chest',
      'deposit-blocked-chest',
      'deposit-double-chest',
      'deposit-expiry',
      'inspect-scoped-storage',
      'eat-interruption',
      'eat-timeout',
      'low-health-retreat',
      'eat-retreat-timeout',
      'collection-return',
      'collection-unreachable-return',
      'collect-full-inventory',
      'withdraw-multi-stack',
      'withdraw-expiry',
      'craft-interruption',
      'craft-expiry',
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
  assert.equal(retreat.vitalTarget, undefined);
  assert.ok(retreat.verify.includes(`data get entity ${player} Health`));
  assert.equal(retreat.actions[0], 'mc-agent set-home');
  assert.match(retreat.actions[1], /enter tp/);
  assert.equal(retreat.actions[2], 'mc-agent wait 120');
  assert.match(retreat.actions[3], /wait job is running/);
  assert.match(retreat.actions[4], /poison.*Health.*at most 8.*clear.*poison/);
});

test('collection fixtures arrange a partial return and leave exactly one main inventory slot before interruption', () => {
  const player = 'FixtureUser';
  const partial = fixturePlan('collection-return', player);
  assert.ok(partial.fixture.includes('fill 80 -60 0 81 -60 0 minecraft:sand'));
  assert.ok(partial.actions.includes('mc-agent collect sand 5'));
  const full = fixturePlan('collect-full-inventory', player);
  assert.ok(full.prepare.includes(`give ${player} minecraft:iron_axe 1`));
  assert.ok(full.prepare.includes(`give ${player} minecraft:cobblestone 2176`));
  assert.ok(full.prepare.includes(`effect give ${player} minecraft:mining_fatigue 900 1 true`));
  const payload = full.actions[0].slice(full.actions[0].indexOf('{'), -1);
  assert.deepEqual(JSON.parse(payload), { action: { type: 'collect', block: 'oak_log', count: 8 } });
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

test('storage failure fixtures independently verify the blocked lid and refreshed target', () => {
  const player = 'FixtureUser';
  const blocked = fixturePlan('deposit-blocked-chest', player);
  assert.ok(blocked.fixture.includes('setblock 98 -59 0 stone'));
  assert.ok(blocked.verify.includes('execute if block 98 -59 0 minecraft:stone'));
  assert.ok(blocked.verify.includes('data get block 98 -60 0 Items'));
  assert.ok(blocked.verify.includes(`data get entity ${player} Inventory`));

  const scoped = fixturePlan('inspect-scoped-storage', player);
  assert.ok(scoped.fixture.includes('setblock 94 -60 0 minecraft:barrel[facing=up]'));
  assert.match(scoped.actions[2], /data modify block 94 -60 0 Items\[0\]\.count set value 2/);
  assert.match(scoped.actions[2], /setblock 98 -59 0 minecraft:stone/);
  assert.deepEqual(
    scoped.actions.filter((action) => action.startsWith('mc-agent inspect-storage')),
    ['mc-agent inspect-storage --container 94,-60,0', 'mc-agent inspect-storage --container 98,-60,0'],
  );
  assert.deepEqual(
    scoped.verify.filter((command) => command.startsWith('data get block')),
    ['data get block 98 -60 0 Items', 'data get block 94 -60 0 Items'],
  );
});

test('failed eating and retreat plans keep consumption longer than the timeout and read independent vitals', () => {
  const player = 'FixtureUser';
  const eating = fixturePlan('eat-timeout', player);
  const retreat = fixturePlan('eat-retreat-timeout', player);
  const bread = `give ${player} minecraft:bread[food={nutrition:5,saturation:6,eat_seconds:30}] 8`;
  for (const plan of [eating, retreat]) {
    assert.ok(plan.prepare.includes(bread));
    assert.ok(plan.verify.includes(`data get entity ${player} foodLevel`));
    assert.ok(plan.verify.includes(`data get entity ${player} Inventory`));
    assert.ok(plan.verify.includes(`data get entity ${player} Health`));
    assert.equal(plan.vitalTarget.target, 10);
  }
  assert.match(eating.actions.join('\n'), /at least 10 seconds after the failure/);
  assert.match(retreat.actions.join('\n'), /tp FixtureUser 120\.5 -60 0\.5, then fill .* minecraft:bedrock hollow/);
  assert.match(retreat.actions.join('\n'), /Survival retreat timed out \(about 60 seconds/);
});

test('unreachable collection return preserves independent evidence of partial collection', () => {
  const player = 'FixtureUser';
  const plan = fixturePlan('collection-unreachable-return', player);
  assert.ok(plan.fixture.includes('setblock 64 -60 0 minecraft:sand'));
  assert.match(plan.actions[1], /x below 93.*fill 94 -61 -2 98 -57 2 minecraft:bedrock hollow/);
  assert.ok(plan.verify.includes('execute if block 64 -60 0 minecraft:sand'));
  assert.ok(plan.verify.includes('execute if block 94 -60 0 minecraft:bedrock'));
  assert.ok(plan.verify.includes(`data get entity ${player} Inventory`));
  assert.ok(plan.verify.includes(`data get entity ${player} Pos`));
});

test('expiry fixtures extend each action across the lease window and include post-resume reads', () => {
  const player = 'FixtureUser';
  const deposit = fixturePlan('deposit-expiry', player);
  const withdraw = fixturePlan('withdraw-expiry', player);
  const craft = fixturePlan('craft-expiry', player);
  assert.ok(deposit.prepare.includes(`give ${player} minecraft:oak_log 2304`));
  assert.deepEqual(
    withdraw.fixture
      .filter((command) => command.startsWith('data merge block'))
      .map((command) => command.match(/count:64/g).length),
    [27, 9],
  );
  assert.ok(craft.prepare.includes(`give ${player} minecraft:oak_planks 512`));
  assert.equal(craft.actions[1], 'mc-agent craft chest 64');
  for (const plan of [deposit, withdraw])
    assert.equal(plan.verify.filter((command) => command.startsWith('data get block')).length, 2);
  for (const plan of [deposit, withdraw, craft]) {
    assert.match(plan.actions.join('\n'), /tick rate 5/);
    assert.match(plan.actions.join('\n'), /Ctrl\+Z.*Wait 10 seconds/);
    assert.match(plan.actions.join('\n'), /fg and repeat the reads five seconds later/);
  }
});

test('the model fixture stocks enough cobblestone for crafting and a retained withdrawal gain', () => {
  const plan = fixturePlan('withdraw-craft-model', 'FixtureUser');
  assert.match(plan.fixture.join('\n'), /id:"minecraft:cobblestone",count:5/);
  assert.match(plan.fixture.join('\n'), /setblock .* minecraft:crafting_table/);
  assert.ok(plan.prepare.includes('give FixtureUser minecraft:stick 2'));
  assert.match(plan.actions[1], /Withdraw exactly four cobblestone.*--verify-withdraw cobblestone:1/);
  assert.match(plan.actions[1], /--verify-craft stone_pickaxe:1/);
  assert.ok(plan.verify.includes('data get entity FixtureUser Inventory'));
  assert.ok(plan.verify.some((command) => /^data get block .* Items$/.test(command)));
});

test('the MCP collection fixture equips the player and independently reads the log and inventory', () => {
  const plan = fixturePlan('mcp-collection', 'FixtureUser');
  assert.ok(plan.fixture.includes('setblock 98 -60 0 minecraft:oak_log'));
  assert.ok(plan.prepare.includes('give FixtureUser minecraft:iron_axe 1'));
  assert.ok(plan.verify.includes('execute if block 98 -60 0 minecraft:oak_log'));
  assert.ok(plan.verify.includes('data get entity FixtureUser Inventory'));
  assert.ok(plan.verify.includes('data get entity FixtureUser Pos'));
  const action = plan.actions[1].match(/\{.*\}/)[0];
  assert.deepEqual(JSON.parse(action), { action: { type: 'collect', block: 'oak_log', count: 1 } });
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
