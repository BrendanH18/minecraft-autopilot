import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import {
  parseSnbt,
  parseDataReply,
  stripLogPrefix,
  itemCount,
  itemTotals,
  toPosition,
} from '../scripts/live-acceptance/nbt-parse.js';
import { ServerConsole, REPLIES, CommandError } from '../scripts/live-acceptance/console.js';
import {
  scenarios,
  scenarioIds,
  laneOrigin,
  scriptedPlanner,
  interceptInference,
  depositCompleted,
  eatingAttempts,
  eatingGaps,
  SLOW_BREAD,
} from '../scripts/live-acceptance/scenarios.js';
import {
  createRunDirectory,
  preflight,
  javaVersion,
  prepareServerDirectory,
  RUNTIME,
  serverProperties,
  ShutdownError,
  settle,
  startBot,
  startFabricClient,
  fabricClientArguments,
  prepareFabricGameDirectory,
  FABRIC_CLIENT_OPTIONS,
  startServer,
} from '../scripts/live-acceptance/processes.js';
import {
  parseOptions,
  buildPlan,
  formatPlan,
  runAcceptance,
  runScenario,
  main,
  formatSummary,
  WORLD_SETUP,
} from '../scripts/live-bot-acceptance.js';

const LOG_PREFIX = '[12:34:56] [Server thread/INFO]: ';
const BOT = 'LiveBot';

test('SNBT parser reads realistic 1.21.1 data get values', () => {
  assert.deepEqual(
    parseSnbt('[{count: 8, Slot: 0b, id: "minecraft:oak_log"}, {Slot: 1b, id: "minecraft:cobblestone", count: 5}]'),
    [
      { count: 8, Slot: 0, id: 'minecraft:oak_log' },
      { Slot: 1, id: 'minecraft:cobblestone', count: 5 },
    ],
  );
  const named = parseSnbt(
    `[{components: {"minecraft:custom_name": '"Named Log"', "minecraft:enchantments": {levels: {"minecraft:efficiency": 5}}}, count: 1, Slot: 3b, id: "minecraft:iron_pickaxe"}]`,
  );
  assert.equal(named[0].components['minecraft:custom_name'], '"Named Log"');
  assert.equal(named[0].components['minecraft:enchantments'].levels['minecraft:efficiency'], 5);
  assert.deepEqual(parseSnbt('[163.5d, -50.0d, 0.5d]'), [163.5, -50, 0.5]);
  assert.deepEqual(parseSnbt('[I; 1, -2, 3, 4]'), [1, -2, 3, 4]);
  assert.deepEqual(parseSnbt('[I;]'), []);
  assert.deepEqual(parseSnbt('[]'), []);
  assert.deepEqual(parseSnbt('{}'), {});
  assert.deepEqual(parseSnbt('{a: 1.0E-5d, b: 20.0f, c: 3L, d: 7s, e: true, "odd key": "x \\"y\\" \\\\ z"}'), {
    a: 1e-5,
    b: 20,
    c: 3,
    d: 7,
    e: true,
    'odd key': 'x "y" \\ z',
  });
  assert.throws(() => parseSnbt('[1, 2'), SyntaxError);
  assert.throws(() => parseSnbt('{a: 1} trailing'), SyntaxError);
});

test('data get replies parse with block/entity prefixes; errors and other lines are not data', () => {
  const block = parseDataReply(
    `${LOG_PREFIX}418, -60, 0 has the following block data: [{count: 5, Slot: 0b, id: "minecraft:cobblestone"}]`,
  );
  assert.deepEqual(block, {
    kind: 'block',
    target: '418, -60, 0',
    value: [{ count: 5, Slot: 0, id: 'minecraft:cobblestone' }],
  });
  const empty = parseDataReply(`${LOG_PREFIX}418, -60, 0 has the following block data: []`);
  assert.deepEqual(empty.value, []);
  const pos = parseDataReply(`${LOG_PREFIX}LiveBot has the following entity data: [163.5d, -50.0d, 0.5d]`);
  assert.equal(pos.kind, 'entity');
  assert.deepEqual(toPosition(pos.value), { x: 163.5, y: -50, z: 0.5 });
  assert.equal(parseDataReply(`${LOG_PREFIX}The target block is not a block entity`), null);
  assert.equal(parseDataReply('No entity was found'), null);
  assert.equal(
    stripLogPrefix('\x1b[32m[12:00:00] [Server thread/INFO]: Done (1.0s)! For help, type "help"\r'),
    'Done (1.0s)! For help, type "help"',
  );
  assert.equal(stripLogPrefix('[12:00:00 INFO]: hello'), 'hello');
  const items = [
    { id: 'minecraft:oak_log', count: 8 },
    { id: 'oak_log', count: 4 },
    { id: 'minecraft:dirt', count: 1 },
  ];
  assert.equal(itemCount(items, 'oak_log'), 12);
  assert.equal(itemCount(null, 'oak_log'), 0);
  assert.deepEqual(itemTotals(items), { 'minecraft:oak_log': 12, 'minecraft:dirt': 1 });
  assert.throws(() => toPosition([1, 2]), /Expected a position/);
});

function fakeConsole() {
  const written = [];
  const serverConsole = new ServerConsole({ write: (text) => written.push(text) });
  return { serverConsole, written };
}

test('dimension-scoped setup commands match the nested command reply', async () => {
  const { serverConsole, written } = fakeConsole();
  const command = 'execute in minecraft:the_nether run fill 0 200 0 4 200 4 minecraft:stone';
  const reply = serverConsole.command(command, { timeoutMs: 1000 });
  await new Promise(setImmediate);
  assert.deepEqual(written, [`${command}\n`]);
  serverConsole.push(`${LOG_PREFIX}Successfully filled 25 blocks\n`);
  assert.equal(await reply, 'Successfully filled 25 blocks');
});

test('readiness waits for the "Done (" line split across chunks and records the version', async () => {
  const { serverConsole } = fakeConsole();
  const ready = serverConsole.ready({ timeoutMs: 1000 });
  serverConsole.push(
    `${LOG_PREFIX}Starting minecraft server version 1.21.1\n${LOG_PREFIX}Preparing level "world"\n${LOG_PREFIX}Do`,
  );
  serverConsole.push('ne (4.321s)! For help, type "help"\n');
  assert.match(await ready, /^Done \(4\.321s\)/);
  assert.equal(serverConsole.version, '1.21.1');
  // A readiness line printed before ready() is called still counts.
  assert.match(await serverConsole.ready({ timeoutMs: 10 }), /^Done/);
});

test('readiness fails on EULA refusal, process end, or timeout', async () => {
  const eula = fakeConsole().serverConsole;
  const waiting = eula.ready({ timeoutMs: 1000 });
  eula.push(
    '[12:00:00] [ServerMain/INFO]: You need to agree to the EULA in order to run the server. Go to eula.txt for more info.\n',
  );
  await assert.rejects(waiting, /agree to the EULA/);
  const ended = fakeConsole().serverConsole;
  const pending = ended.ready({ timeoutMs: 1000 });
  ended.end('server exited (1)');
  await assert.rejects(pending, /ended while waiting for server readiness.*exited \(1\)/);
  await assert.rejects(fakeConsole().serverConsole.ready({ timeoutMs: 20 }), /Timed out after 20 ms/);
});

test('commands are serialized, matched to their reply, and tolerate log noise', async () => {
  const { serverConsole, written } = fakeConsole();
  const first = serverConsole.command('tp LiveBot 1 2 3');
  const second = serverConsole.command('/give LiveBot minecraft:oak_log 4');
  await new Promise(setImmediate);
  assert.deepEqual(written, ['tp LiveBot 1 2 3\n']);
  serverConsole.push(
    `[12:00:00] [Server thread/WARN]: Can't keep up! Is the server overloaded? Running 2034ms or 40 ticks behind\n`,
  );
  serverConsole.push(`${LOG_PREFIX}LiveBot moved too quickly! 1.0,2.0,3.0\n`);
  serverConsole.push(`${LOG_PREFIX}Teleported LiveBot to 1.000000, 2.000000, 3.000000\n`);
  assert.match(await first, /^Teleported LiveBot/);
  await new Promise(setImmediate);
  assert.deepEqual(written, ['tp LiveBot 1 2 3\n', 'give LiveBot minecraft:oak_log 4\n']);
  serverConsole.push(`${LOG_PREFIX}Gave 4 [Oak Log] to LiveBot\n`);
  assert.match(await second, /^Gave 4/);
  const kill = serverConsole.command('kill @e[type=item,distance=..5]');
  await new Promise(setImmediate);
  serverConsole.push(`${LOG_PREFIX}No entity was found\n`);
  assert.equal(await kill, 'No entity was found');
  const clear = serverConsole.command('clear LiveBot');
  await new Promise(setImmediate);
  serverConsole.push(`${LOG_PREFIX}Removed 4 item(s) from player LiveBot\n`);
  assert.match(await clear, /^Removed 4 item/);
});

test('command errors leave the console usable, but a missing reply invalidates the queue', async () => {
  const { serverConsole, written } = fakeConsole();
  const bad = serverConsole.command('data get entity LiveBot Pos');
  await new Promise(setImmediate);
  serverConsole.push(`${LOG_PREFIX}No entity was found\n`);
  await assert.rejects(
    bad,
    (error) => error instanceof CommandError && /failed: No entity was found/.test(error.message),
  );
  const next = serverConsole.command('weather clear');
  await new Promise(setImmediate);
  serverConsole.push(`${LOG_PREFIX}Set the weather to clear\n`);
  assert.equal(await next, 'Set the weather to clear');
  const timeout = serverConsole.command('time set 1000', { timeoutMs: 20 });
  const afterTimeout = serverConsole.command('time set 2000');
  await Promise.all([
    assert.rejects(timeout, /Timed out after 20 ms waiting for a reply to "time set 1000"/),
    assert.rejects(afterTimeout, /ended before sending.*Timed out/),
  ]);
  await assert.rejects(serverConsole.command('say hello'), /No reply pattern is known for "say"/);
  await assert.rejects(serverConsole.command('say a\nstop'), /Invalid console command/);
  assert.ok(!written.some((text) => text.startsWith('say') || text.includes('stop')));
});

test('aborting an issued command rejects promptly and drains its reply before writing cleanup', async () => {
  const { serverConsole, written } = fakeConsole();
  const controller = new AbortController();
  const first = serverConsole.command('clear LiveBot', { signal: controller.signal });
  await new Promise(setImmediate);
  controller.abort(new Error('fixture interrupted'));
  await assert.rejects(first, /fixture interrupted/);
  const cleanup = serverConsole.command('clear LiveBot minecraft:dirt');
  await new Promise(setImmediate);
  assert.deepEqual(written, ['clear LiveBot\n']);
  serverConsole.push(`${LOG_PREFIX}Removed 4 item(s) from player LiveBot\n`);
  await new Promise(setImmediate);
  assert.deepEqual(written, ['clear LiveBot\n', 'clear LiveBot minecraft:dirt\n']);
  serverConsole.push(`${LOG_PREFIX}No items were found on player LiveBot\n`);
  assert.match(await cleanup, /^No items/);
});

test('aborted and closed-console commands are never written', async () => {
  const { serverConsole, written } = fakeConsole();
  const first = serverConsole.command('time set 1000');
  const controller = new AbortController();
  const queued = serverConsole.command('weather clear', { signal: controller.signal });
  controller.abort(new Error('fixture interrupted'));
  await assert.rejects(queued, /fixture interrupted/);
  await new Promise(setImmediate);
  serverConsole.push(`${LOG_PREFIX}Set the time to 1000\n`);
  await first;
  serverConsole.end('server stopped');
  await assert.rejects(serverConsole.command('weather clear'), /ended before sending.*server stopped/);
  assert.deepEqual(written, ['time set 1000\n']);
});

test('a console write failure detaches the listener and leaves subsequent commands usable', async () => {
  const { serverConsole, written } = fakeConsole();
  const write = serverConsole.write;
  serverConsole.write = () => {
    throw new Error('stdin failed');
  };
  await assert.rejects(serverConsole.command('weather clear'), /stdin failed/);
  assert.equal(serverConsole.listenerCount('line'), 0);
  assert.equal(serverConsole.listenerCount('end'), 0);
  serverConsole.write = write;
  const next = serverConsole.command('time set 1000');
  await new Promise(setImmediate);
  assert.deepEqual(written, ['time set 1000\n']);
  serverConsole.push(`${LOG_PREFIX}Set the time to 1000\n`);
  assert.equal(await next, 'Set the time to 1000');
});

test('block and entity data helpers parse replies; a missing Items path is empty, a non-container is an error', async () => {
  const { serverConsole } = fakeConsole();
  const items = serverConsole.blockData(418, -60, 0);
  await new Promise(setImmediate);
  serverConsole.push(
    `${LOG_PREFIX}418, -60, 0 has the following block data: [{count: 3, Slot: 1b, id: "minecraft:oak_log"}]\n`,
  );
  assert.equal(itemCount(await items, 'oak_log'), 3);
  const missing = serverConsole.blockData(418, -60, 0);
  await new Promise(setImmediate);
  serverConsole.push(`${LOG_PREFIX}Found no elements matching Items\n`);
  assert.deepEqual(await missing, []);
  const stone = serverConsole.blockData(1, 2, 3);
  await new Promise(setImmediate);
  serverConsole.push(`${LOG_PREFIX}The target block is not a block entity\n`);
  await assert.rejects(stone, /not a block entity/);
  const inventory = serverConsole.entityData('LiveBot', 'Inventory');
  await new Promise(setImmediate);
  serverConsole.push(`${LOG_PREFIX}LiveBot has the following entity data: []\n`);
  assert.deepEqual(await inventory, []);
});

test('dry-run plan covers every scenario with known reply patterns, separated lanes, and cleanup', () => {
  const plan = buildPlan(parseOptions(['--dry-run', '--all']));
  assert.deepEqual(
    plan.scenarios.map((scenario) => scenario.id),
    scenarioIds,
  );
  assert.ok(
    plan.serverProperties.includes('online-mode=false') &&
      plan.serverProperties.includes('server-ip=127.0.0.1') &&
      plan.serverProperties.includes('spawn-protection=0') &&
      plan.serverProperties.includes('max-tick-time=-1'),
  );
  assert.match(
    plan.botCommand,
    /src\/cli\.js --bridge \S+\.runtime\/live-acceptance\/run-XXXXXX\/bridge\.json server --host 127\.0\.0\.1 --port 25566 --account LiveBot --auth offline --version 1\.21\.1/,
  );
  assert.equal(plan.serverLog, join(plan.serverDirectory, 'server.out'));
  assert.equal(plan.resultsFile, join(dirname(plan.serverDirectory), 'results.json'));
  const known = (command) => Object.hasOwn(REPLIES, command.split(/\s+/)[0]);
  for (const command of WORLD_SETUP) assert.ok(known(command), command);
  const lanes = new Set();
  for (const scenario of plan.scenarios) {
    lanes.add(scenarios.find((entry) => entry.id === scenario.id).lane);
    for (const list of ['fixture', 'prepare', 'cleanup', 'verify', 'actions', 'expect', 'release'])
      assert.ok(scenario[list].length, `${scenario.id} ${list}`);
    for (const command of [
      ...scenario.fixture,
      ...scenario.prepare,
      ...scenario.cleanup,
      ...scenario.verify,
      ...scenario.during,
    ])
      assert.ok(known(command), `${scenario.id}: ${command}`);
    assert.match(scenario.fixture[0], /^forceload add /);
    assert.match(scenario.cleanup.at(-1), /^forceload remove /);
    assert.ok(
      scenario.cleanup.some((command) => /^fill .* (?:minecraft:)?air$/.test(command)),
      `${scenario.id} removes its fixture`,
    );
    assert.ok(
      scenario.prepare.includes(`clear ${BOT}`) && scenario.prepare.some((command) => command.startsWith(`tp ${BOT} `)),
    );
    assert.ok(
      scenario.verify.includes(`data get entity ${BOT} Pos`) &&
        scenario.verify.includes(`data get entity ${BOT} Inventory`),
    );
    if (scenario.points.chest) assert.ok(scenario.verify[0].startsWith('data get block '));
  }
  assert.equal(lanes.size, scenarios.length);
  assert.ok(Math.abs(laneOrigin(1).x - laneOrigin(0).x) >= 64, 'lanes are beyond the 48-block collection search');
  assert.equal(plan.scenarios.find((scenario) => scenario.id === 'stale-removal-model').willSkip, true);
  const text = formatPlan(plan);
  for (const id of scenarioIds) assert.ok(text.includes(`[${id}]`));
  assert.match(text, /awaits the done decision: > data remove block \d+ -60 0 Items/);
  assert.match(text, /awaits the done decision: > setblock \d+ -59 0 stone/);
  assert.match(text, /mining_fatigue/);
  const craft = plan.scenarios.find((scenario) => scenario.id === 'craft-bootstrap');
  assert.equal(
    craft.verify.filter((command) => /^execute if block -?\d+ -60 -?\d+ minecraft:crafting_table$/.test(command))
      .length,
    8,
  );
  assert.match(text, /bridge: craft stone_pickaxe 1 \(no table within 16 blocks/);
  const missing = plan.scenarios.find((scenario) => scenario.id === 'craft-missing-ingredients');
  assert.ok(missing.prepare.includes(`give ${BOT} minecraft:oak_log 2`));
  assert.deepEqual(missing.actions, ['bridge: craft oak_planks 12']);
  const full = plan.scenarios.find((scenario) => scenario.id === 'craft-full-inventory');
  assert.ok(full.prepare.includes(`give ${BOT} minecraft:oak_log 2`));
  assert.ok(full.prepare.includes(`give ${BOT} minecraft:cobblestone ${35 * 64}`));
  assert.deepEqual(full.actions, ['bridge: craft oak_planks 4']);
  assert.match(
    text,
    /\[withdraw\][\s\S]*setblock \d+ -60 0 minecraft:chest\[facing=west\]\{Items:\[\{Slot:0b,id:"minecraft:oak_log",count:20\}/,
  );
  const omitted = plan.scenarios.find((scenario) => scenario.id === 'withdraw-omitted');
  assert.match(omitted.actions[0], /^bridge: withdraw oak_log \(no count,/);
  assert.ok(omitted.fixture.some((command) => command.includes('{Slot:2b,id:"minecraft:oak_log",count:64}')));
  const fullWithdraw = plan.scenarios.find((scenario) => scenario.id === 'withdraw-full-inventory');
  assert.ok(fullWithdraw.prepare.includes(`give ${BOT} minecraft:oak_log 60`));
  assert.ok(fullWithdraw.prepare.includes(`give ${BOT} minecraft:cobblestone ${35 * 64}`));
});

test('options require an explicit selection and validate ids, ports, and names', () => {
  assert.throws(() => parseOptions([]), /--scenario <id> \(repeatable\), --all, --fast, or --takeover/);
  assert.throws(() => parseOptions(['--scenario', 'nope']), /Unknown scenario "nope"/);
  assert.throws(() => parseOptions(['--all', '--scenario', 'blocked-lid']), /Choose only one/);
  assert.throws(() => parseOptions(['--all', '--port', '80']), /--port/);
  assert.throws(() => parseOptions(['--all', '--account', 'a b']), /--account/);
  assert.throws(() => parseOptions(['--all', '--model', '  ']), /--model must name an installed/);
  assert.equal(parseOptions(['--all', '--model', ' local-model ']).model, 'local-model');
  assert.equal(parseOptions(['--all', '--java', './jdk/bin/java']).java, resolve('jdk/bin/java'));
  const options = parseOptions(['--scenario', 'blocked-lid', '--scenario', 'recovery-stop', '--port', '25599']);
  assert.deepEqual(
    options.scenarios.map((scenario) => scenario.id),
    ['recovery-stop', 'blocked-lid'],
  );
  assert.equal(options.port, 25599);
  assert.equal(options.acceptEula, false);
});

test('preflight refuses without --accept-eula, the cached jar, or Java 21, pointing to DEVELOPMENT.md', () => {
  const java = (version) => () => ({
    status: 0,
    stderr: `openjdk version "${version}" 2024-07-16\nOpenJDK Runtime Environment\n`,
    stdout: '',
  });
  const exists = () => true;
  assert.throws(
    () => preflight({ acceptEula: false, jar: '/x.jar' }, { exists, spawnSyncImpl: java('21.0.4') }),
    /--accept-eula/,
  );
  assert.throws(
    () => preflight({ acceptEula: true, jar: '/missing.jar' }, { exists: () => false, spawnSyncImpl: java('21.0.4') }),
    /server jar is missing: \/missing\.jar.*DEVELOPMENT\.md.*never downloads/s,
  );
  const absent = () => ({ error: Object.assign(new Error('spawnSync java ENOENT'), { code: 'ENOENT' }) });
  assert.throws(
    () => preflight({ acceptEula: true, jar: '/x.jar' }, { exists, spawnSyncImpl: absent }),
    /Java was not found \(ENOENT\).*DEVELOPMENT\.md/s,
  );
  assert.throws(
    () => preflight({ acceptEula: true, jar: '/x.jar' }, { exists, spawnSyncImpl: java('17.0.2') }),
    /Java 17 found/,
  );
  assert.equal(javaVersion('java', { spawnSyncImpl: java('1.8.0_292') }).major, 8);
  assert.equal(preflight({ acceptEula: true, jar: '/x.jar' }, { exists, spawnSyncImpl: java('21.0.4') }).major, 21);
  assert.match(serverProperties({ port: 25570, seed: 's' }), /^server-port=25570$/m);
});

test('the test server saves chunks without synchronous writes, so slow fsync cannot stall console commands', () => {
  const properties = serverProperties({ port: 25570, seed: 's' });
  assert.match(properties, /^sync-chunk-writes=false$/m);
  assert.doesNotMatch(properties, /^sync-chunk-writes=true$/m);
});

/** A tiny server world answering console commands, plus a bridge view of the same bot. */
function fakeWorld({ start = { x: 0.5, y: -60, z: 0.5 } } = {}) {
  const world = {
    pos: { ...start },
    inventory: [],
    chest: [],
    blocks: {},
    containers: undefined,
    written: [],
    job: null,
    mode: 'manual',
    stopping: false,
    moving: false,
    food: 20,
    health: 20,
  };
  const reply = (command) => {
    const [verb, ...rest] = command.split(' ');
    if (verb === 'data' && rest[0] === 'get' && rest[1] === 'block')
      return `${rest[2]}, ${rest[3]}, ${rest[4]} has the following block data: [${world.chest.map((item, slot) => `{count: ${item.count}, Slot: ${slot}b, id: "${item.id}"}`).join(', ')}]`;
    if (verb === 'data' && rest[0] === 'get' && rest.at(-1) === 'Inventory')
      return `${BOT} has the following entity data: [${world.inventory.map((item, slot) => `{count: ${item.count}, Slot: ${slot}b, id: "${item.id}"}`).join(', ')}]`;
    if (verb === 'data' && rest[0] === 'get' && rest.at(-1) === 'foodLevel')
      return `${BOT} has the following entity data: ${world.food}`;
    if (verb === 'data' && rest[0] === 'get' && rest.at(-1) === 'Health')
      return `${BOT} has the following entity data: ${world.health}.0f`;
    if (verb === 'damage') {
      world.health = Math.max(1, world.health - Number(rest[1]));
      return `Applied ${rest[1]}.0 damage to ${BOT}`;
    }
    if (verb === 'effect' && rest[2] === 'minecraft:hunger') world.food = Math.min(world.food, 11);
    if (verb === 'data' && rest[0] === 'get' && rest.at(-1) === 'Pos') {
      if (world.moving) world.pos.x += 1;
      return `${BOT} has the following entity data: [${world.pos.x}d, ${world.pos.y}d, ${world.pos.z}d]`;
    }
    if (verb === 'data' && rest[0] === 'remove') {
      world.chest = [];
      return `Modified block data of ${rest[2]}, ${rest[3]}, ${rest[4]}`;
    }
    if (verb === 'tp') {
      world.pos = { x: Number(rest[1]), y: Number(rest[2]), z: Number(rest[3]) };
      return `Teleported ${BOT} to ${rest[1]}, ${rest[2]}, ${rest[3]}`;
    }
    if (verb === 'give') {
      // Like the server, a large give fills stacks of 64.
      for (let left = Number(rest[2]); left > 0; left -= 64)
        world.inventory.push({ id: rest[1].replace(/\[.*$/, ''), count: Math.min(64, left) });
      return `Gave ${rest[2]} [Item] to ${BOT}`;
    }
    if (verb === 'clear') {
      world.inventory = [];
      return `No items were found on player ${BOT}`;
    }
    if (verb === 'setblock' && /chest/.test(rest[3] || '')) {
      const seeded = [...(rest[3].match(/Items:\[.*\]/)?.[0] ?? '').matchAll(/id:"([^"]+)",count:(\d+)/g)];
      world.chest = seeded.length
        ? seeded.map(([, id, count]) => ({ id, count: Number(count) }))
        : [
            { id: 'minecraft:cobblestone', count: 5 },
            { id: 'minecraft:oak_log', count: 3 },
          ];
    }
    if (verb === 'execute' && rest[0] === 'if' && rest[1] === 'block')
      return world.blocks[`${rest[2]} ${rest[3]} ${rest[4]}`] === rest[5] ? 'Test passed' : 'Test failed';
    return {
      fill: 'Successfully filled 9 block(s)',
      setblock: 'Changed the block at 1, 2, 3',
      effect: `Applied effect Mining Fatigue to ${BOT}`,
      forceload: 'Marked 9 chunks in minecraft:overworld to be force loaded',
      kill: 'No entity was found',
      gamerule: 'Gamerule x is now set to: false',
      difficulty: 'The difficulty has been set to Peaceful',
      time: 'Set the time to 1000',
      weather: 'Set the weather to clear',
    }[verb];
  };
  const serverConsole = new ServerConsole({
    write: (text) => {
      const command = text.trim();
      world.written.push(command);
      setImmediate(() => {
        const message = reply(command);
        if (message) serverConsole.push(`${LOG_PREFIX}${message}\n`);
      });
    },
  });
  world.console = serverConsole;
  world.state = () => ({
    ...world.onObserve?.(),
    connected: true,
    mode: world.mode,
    stopping: world.stopping,
    job: world.job && { ...world.job },
    ...(world.survival && { survival: world.survival }),
    player: { position: { ...world.pos } },
    inventory: world.inventory
      .filter((item) => item.count > 0)
      .map((item, slot) => ({ slot: 9 + slot, name: item.id, count: item.count })),
    ...(world.containers && { containers: world.containers }),
  });
  world.adapter = (behaviors = {}) => ({
    observe: async () => world.state(),
    close: async () => {},
    emergencyStop: async () => {
      world.stops = (world.stops || 0) + 1;
      return { ok: true };
    },
    cancel: async () => behaviors.cancel?.(),
    execute: async (action, options) =>
      (behaviors[action.type] || (async () => ({ status: 'completed', message: 'Completed.' })))(action, options),
  });
  return world;
}

function fakeDeps(world, { behaviors, runAgent, clock = { now: 0 } } = {}) {
  const calls = { botStops: 0, serverStops: 0, results: null, cli: [] };
  return Object.assign(
    {
      now: () => clock.now,
      sleep: async (ms) => {
        clock.now += ms;
      },
      connect: async () => world.adapter(behaviors),
      runAgent,
      startBot: async () => ({
        stop: async () => {
          calls.botStops++;
          world.console.push(`${LOG_PREFIX}${BOT} left the game\n`);
        },
      }),
      runCli: async (args) => {
        calls.cli.push(args);
        return behaviors?.cli?.(args) ?? { code: 0, stdout: '{"ok":true}', stderr: '' };
      },
      preflight: () => ({ banner: 'openjdk version "21.0.4"', major: 21 }),
      portIsFree: async () => true,
      sha256File: async () => 'f'.repeat(64),
      createRunDirectory: async () => '/fake/run',
      prepareServerDirectory: async () => {},
      environment: () => ({ commit: 'abc123', dirty: false, node: process.version, java: 'openjdk version "21.0.4"' }),
      startServer: () => {
        world.console.push(
          `${LOG_PREFIX}Starting minecraft server version 1.21.1\n${LOG_PREFIX}Done (2.000s)! For help, type "help"\n`,
        );
        return {
          console: world.console,
          exited: new Promise(() => {}),
          stop: async () => {
            calls.serverStops++;
          },
        };
      },
      writeResults: async (path, value) => {
        calls.results = { path, value };
      },
      keepAlive: async () => {},
      print: () => {},
      warn: () => {},
    },
    { calls },
  );
}

const env = (world, deps, options = {}) => ({
  options: { account: BOT, port: 25566, ollama: 'http://127.0.0.1:11434', keepServer: false, model: null, ...options },
  deps,
  serverConsole: world.console,
  signal: new AbortController().signal,
  where: { bridge: '/fake/bridge.json', home: '/fake/home' },
});
const byId = (id) => scenarios.find((scenario) => scenario.id === id);

test('stale-removal passes only when refreshed storage matches the server after external removal', async () => {
  // The deposit (decision 1) lands in the server chest before decision 3, when the removal hook runs.
  const agent =
    (world, result, { deposits = true } = {}) =>
    async (_adapter, _goal, { fetchImpl, criteria }) => {
      assert.deepEqual(criteria, {
        collect: { block: 'oak_log', count: 8 },
        deposit: { item: 'oak_log', count: 8 },
        returnHome: true,
      });
      for (let i = 0; i < 4; i++) {
        if (i === 2 && deposits) world.chest.push({ id: 'minecraft:oak_log', count: 8 });
        await fetchImpl('http://127.0.0.1:11434/api/chat', { body: '{}' });
      }
      return result;
    };
  const lane = () => fakeWorld({ start: { x: laneOrigin(4).x + 0.5, y: -60, z: 0.5 } });
  const world = lane();
  const honest = {
    status: 'criteria_unmet',
    steps: 6,
    verification: { checks: { deposit: { storedAdditional: -3, evidence: 'refreshed', met: false } } },
  };
  const record = await runScenario(
    byId('stale-removal'),
    env(world, fakeDeps(world, { runAgent: agent(world, honest) })),
  );
  assert.equal(record.status, 'pass', JSON.stringify(record.checks.filter((check) => !check.pass)));
  assert.ok(
    world.written.some((command) => /^data remove block \d+ -60 0 Items$/.test(command)),
    'removal ran during the scripted inference',
  );
  const staleWorld = lane();
  const stale = {
    status: 'criteria_met',
    steps: 4,
    verification: { checks: { deposit: { storedAdditional: 8, evidence: 'last_observed', met: true } } },
  };
  const failed = await runScenario(
    byId('stale-removal'),
    env(staleWorld, fakeDeps(staleWorld, { runAgent: agent(staleWorld, stale) })),
  );
  assert.equal(failed.status, 'fail');
  assert.match(failed.reason, /no success after external removal/);
  // Without a real deposit there was never a stale +8 to detect, so an honest-looking run must not pass.
  const emptyWorld = lane();
  const vacuous = await runScenario(
    byId('stale-removal'),
    env(emptyWorld, fakeDeps(emptyWorld, { runAgent: agent(emptyWorld, honest, { deposits: false }) })),
  );
  assert.equal(vacuous.status, 'fail');
  assert.match(vacuous.reason, /stale \+8 existed/);
  assert.match(failed.reason, /no cached count/);
});

function recoveryBehaviors(world, clock, { finishEarly = false } = {}) {
  let release;
  return {
    collect: async (_action, { onProgress }) => {
      world.mode = 'agent';
      world.job = { id: 'j', status: 'running', message: 'Inventory: 9/64' };
      clock.now += 180_000;
      world.inventory = [{ id: 'minecraft:oak_log', count: 9 }];
      world.job.message = 'Collection failed; returning to where collection started.';
      onProgress({ ...world.job });
      if (finishEarly) {
        world.job.status = 'failed';
        world.job.message =
          'Collection timed out before reaching the requested quota. Inventory: 9/64. Returned to the starting point.';
        throw new Error(world.job.message);
      }
      await new Promise((resolve) => {
        release = resolve;
      });
      throw new Error(world.job.message);
    },
    cancel: async () => {
      world.job = { ...world.job, status: 'cancelled', message: 'Cancelled by agent.' };
      release();
    },
    cli: (args) => {
      assert.deepEqual(args, ['stop']);
      world.job = { ...world.job, status: 'cancelled', message: 'Emergency stop requested.' };
      world.mode = 'manual';
      release();
      return { code: 0, stdout: '{"ok":true}', stderr: '' };
    },
  };
}

test('recovery-stop and recovery-cancel interrupt during the return trip and verify a stationary bot', async () => {
  for (const id of ['recovery-stop', 'recovery-cancel']) {
    const clock = { now: 0 };
    const lane = laneOrigin(byId(id).lane);
    const world = fakeWorld({ start: { x: lane.x + 3.5, y: -50, z: 0.5 } });
    const deps = fakeDeps(world, { behaviors: recoveryBehaviors(world, clock), clock });
    const record = await runScenario(byId(id), env(world, deps));
    assert.equal(record.status, 'pass', `${id}: ${JSON.stringify(record.checks.filter((check) => !check.pass))}`);
    assert.equal(deps.calls.cli.length, id === 'recovery-stop' ? 1 : 0);
    assert.ok(world.written.includes(`effect give ${BOT} minecraft:mining_fatigue 900 0 true`));
  }
  // A bot that keeps moving after the stop fails the stationary check.
  const clock = { now: 0 };
  const lane = laneOrigin(byId('recovery-stop').lane);
  const world = fakeWorld({ start: { x: lane.x + 3.5, y: -50, z: 0.5 } });
  const behaviors = recoveryBehaviors(world, clock);
  const stop = behaviors.cli;
  behaviors.cli = (args) => {
    const out = stop(args);
    world.moving = true;
    return out;
  };
  const record = await runScenario(byId('recovery-stop'), env(world, fakeDeps(world, { behaviors, clock })));
  assert.equal(record.status, 'fail');
  assert.match(record.reason, /position stopped changing/);
});

test('recovery-cancel fails honestly when recovery finishes before the cancel lands', async () => {
  const clock = { now: 0 };
  const lane = laneOrigin(byId('recovery-cancel').lane);
  const world = fakeWorld({ start: { x: lane.x + 3.5, y: -50, z: 0.5 } });
  const record = await runScenario(
    byId('recovery-cancel'),
    env(world, fakeDeps(world, { behaviors: recoveryBehaviors(world, clock, { finishEarly: true }), clock })),
  );
  assert.equal(record.status, 'fail');
  assert.match(record.reason, /interrupt issued while recovery was running/);
});

test('recovery-timeout checks failure status, bounded return, preserved inventory, and the reported return', async () => {
  const clock = { now: 0 };
  const lane = laneOrigin(byId('recovery-timeout').lane);
  const world = fakeWorld({ start: { x: lane.x + 3.5, y: -50, z: 0.5 } });
  const record = await runScenario(
    byId('recovery-timeout'),
    env(world, fakeDeps(world, { behaviors: recoveryBehaviors(world, clock, { finishEarly: true }), clock })),
  );
  assert.equal(record.status, 'pass', JSON.stringify(record.checks.filter((check) => !check.pass)));
  assert.equal(record.observations.final.server.held, 9);
  // A claimed return that the server position contradicts fails.
  const moved = fakeWorld({ start: { x: lane.x + 3.5, y: -50, z: 0.5 } });
  const behaviors = recoveryBehaviors(moved, clock, { finishEarly: true });
  const collect = behaviors.collect;
  behaviors.collect = async (...args) => {
    moved.pos = { x: lane.x, y: -56, z: 0.5 };
    return collect(...args);
  };
  const failed = await runScenario(byId('recovery-timeout'), env(moved, fakeDeps(moved, { behaviors, clock })));
  assert.equal(failed.status, 'fail');
  assert.match(failed.reason, /reported return agrees with server Pos/);
});

/** Applies scripted decisions to the fake world so server reads change as a real run would. */
function storeAgent(world, result) {
  return async (_adapter, _goal, { fetchImpl }) => {
    for (let i = 0; i < 6; i++) {
      const decision = JSON.parse(
        (await (await fetchImpl('http://127.0.0.1:11434/api/chat', { body: '{}' })).json()).message.content,
      );
      if (decision.type === 'collect') world.inventory.push({ id: 'minecraft:oak_log', count: decision.count });
      if (decision.type === 'deposit') {
        world.inventory = [{ id: 'minecraft:oak_log', count: 4 }];
        world.chest.push({ id: 'minecraft:oak_log', count: decision.count });
      }
      if (decision.type === 'done') break;
    }
    return typeof result === 'function' ? result() : result;
  };
}

test('collect-and-store passes on criteria_met backed by server reads and fails on unbacked success', async () => {
  const start = { x: laneOrigin(byId('collect-and-store').lane).x + 0.5, y: -60, z: 0.5 };
  const met = {
    status: 'criteria_met',
    steps: 4,
    verification: {
      checks: {
        deposit: { storedAdditional: 8, evidence: 'refreshed', met: true },
        inventory: { currentCount: 4, met: true },
        home: { distance: 0, met: true },
      },
    },
  };
  const world = fakeWorld({ start });
  const record = await runScenario(
    byId('collect-and-store'),
    env(world, fakeDeps(world, { runAgent: storeAgent(world, met) })),
  );
  assert.equal(record.status, 'pass', JSON.stringify(record.checks.filter((check) => !check.pass)));
  assert.equal(record.observations.baseline.held, 4);
  assert.equal(record.observations.baseline.chest['minecraft:oak_log'], 3);
  const lying = fakeWorld({ start });
  const failed = await runScenario(
    byId('collect-and-store'),
    env(lying, fakeDeps(lying, { runAgent: async () => met })),
  );
  assert.equal(failed.status, 'fail');
  assert.match(failed.reason, /server chest holds 8 more oak logs/);
});

test('blocked-lid requires a reported inspection failure and a failing direct inspection', async () => {
  const start = { x: laneOrigin(byId('blocked-lid').lane).x + 0.5, y: -60, z: 0.5 };
  const unmet = {
    status: 'criteria_unmet',
    steps: 6,
    verification: {
      checks: {
        deposit: {
          storedAdditional: 8,
          met: false,
          error: 'The container did not open; something may be blocking its lid.',
        },
      },
    },
  };
  const world = fakeWorld({ start });
  const behaviors = {
    inspect_storage: async () => {
      throw new Error('The container did not open; something may be blocking its lid.');
    },
  };
  const record = await runScenario(
    byId('blocked-lid'),
    env(world, fakeDeps(world, { behaviors, runAgent: storeAgent(world, unmet) })),
  );
  assert.equal(record.status, 'pass', JSON.stringify(record.checks.filter((check) => !check.pass)));
  assert.ok(world.written.includes(`setblock ${start.x - 0.5 + 2} -59 0 stone`));
});

test('inspect-return-blocked passes on reported failure and inspect-preserves-home rejects a distance the server contradicts', async () => {
  const lane = laneOrigin(byId('inspect-return-blocked').lane);
  const home = { x: lane.x + 0.5, y: -58, z: 0.5 };
  const world = fakeWorld({ start: home });
  const unmet = () => {
    world.pos = { x: lane.x + 8.5, y: -60, z: 0.5 };
    return {
      status: 'criteria_unmet',
      steps: 5,
      verification: {
        checks: {
          deposit: { storedAdditional: 8, evidence: 'refreshed', met: true },
          home: { distance: Math.hypot(8, 2), met: false },
        },
      },
    };
  };
  const record = await runScenario(
    byId('inspect-return-blocked'),
    env(world, fakeDeps(world, { runAgent: storeAgent(world, unmet) })),
  );
  assert.equal(record.status, 'pass', JSON.stringify(record.checks.filter((check) => !check.pass)));
  assert.ok(world.written.includes(`setblock ${lane.x + 2} -60 0 air`));
  const preserveLane = laneOrigin(byId('inspect-preserves-home').lane);
  const other = fakeWorld({ start: { x: preserveLane.x + 0.5, y: -58, z: 0.5 } });
  const claimed = () => {
    other.pos = { x: preserveLane.x + 8.5, y: -60, z: 0.5 };
    return {
      status: 'criteria_met',
      steps: 3,
      verification: {
        checks: {
          deposit: { storedAdditional: 8, evidence: 'refreshed', met: true },
          home: { distance: 0.4, met: true },
        },
      },
    };
  };
  const failed = await runScenario(
    byId('inspect-preserves-home'),
    env(other, fakeDeps(other, { runAgent: storeAgent(other, claimed) })),
  );
  assert.equal(failed.status, 'fail');
  assert.match(failed.reason, /agent home distance agrees with server Pos/);
});

test('withdraw passes when server reads confirm the move and the reported baseline, and fails on an unbacked report', async () => {
  const lane = laneOrigin(byId('withdraw').lane);
  const chest = { x: lane.x + 2, y: -60, z: 0 };
  const start = { x: lane.x + 0.5, y: -60, z: 0.5 };
  const totals = (items) => items.map((item) => ({ name: item.id, count: item.count }));
  const withdraw = (world, { move = true } = {}) => ({
    withdraw: async (action) => {
      assert.deepEqual(action, { type: 'withdraw', item: 'oak_log', count: 8 });
      const before = totals(world.chest);
      if (move) {
        world.chest.find((item) => item.id === 'minecraft:oak_log').count -= 8;
        world.inventory.push({ id: 'minecraft:oak_log', count: 8 });
      }
      world.containers = [{ name: 'minecraft:chest', ...chest, items: totals(world.chest) }];
      world.job = { status: 'completed', message: `Withdrew 8 oak_log from the chest at ${chest.x} -60 0.` };
      return { ...world.job, container: { name: 'minecraft:chest', ...chest, before } };
    },
  });
  const world = fakeWorld({ start });
  const record = await runScenario(byId('withdraw'), env(world, fakeDeps(world, { behaviors: withdraw(world) })));
  assert.equal(record.status, 'pass', JSON.stringify(record.checks.filter((check) => !check.pass)));
  assert.deepEqual(record.observations.baseline.chest, { 'minecraft:oak_log': 20, 'minecraft:cobblestone': 5 });
  assert.ok(world.written.includes(`data get block ${chest.x} -60 0 Items`));
  const lying = fakeWorld({ start });
  const failed = await runScenario(
    byId('withdraw'),
    env(lying, fakeDeps(lying, { behaviors: withdraw(lying, { move: false }) })),
  );
  assert.equal(failed.status, 'fail');
  assert.match(failed.reason, /server chest holds exactly 8 fewer oak logs/);
  assert.match(failed.reason, /server inventory holds 8 more oak logs/);
});

test('craft-bootstrap passes only when the server shows the crafted items and the one table the craft placed', async () => {
  const lane = laneOrigin(byId('craft-bootstrap').lane);
  const start = { x: lane.x + 0.5, y: -60, z: 0.5 };
  const effects = {
    oak_planks: [{ oak_log: 3 }, { oak_planks: 12 }],
    crafting_table: [{ oak_planks: 4 }, { crafting_table: 1 }],
    stick: [{ oak_planks: 2 }, { stick: 4 }],
    stone_pickaxe: [{ cobblestone: 3, stick: 2, crafting_table: 1 }, { stone_pickaxe: 1 }],
    wooden_pickaxe: [{ oak_planks: 3, stick: 2 }, { wooden_pickaxe: 1 }],
  };
  const crafting = (world, { place = true } = {}) => ({
    craft: async ({ item, count }) => {
      const [used, made] = effects[item];
      for (const [name, amount] of Object.entries(used)) {
        const stack = world.inventory.find((entry) => entry.id === `minecraft:${name}` && entry.count >= amount);
        if (!stack) throw new Error(`Missing ingredients for ${count} ${item}.`);
        stack.count -= amount;
      }
      world.inventory = world.inventory.filter((entry) => entry.count > 0);
      for (const [name, amount] of Object.entries(made))
        world.inventory.push({ id: `minecraft:${name}`, count: amount });
      let placed = '';
      if (item === 'stone_pickaxe') {
        if (place) world.blocks[`${lane.x + 1} -60 0`] = 'minecraft:crafting_table';
        placed = `Placed a crafting table at ${lane.x + 1} -60 0. `;
      }
      world.job = { status: 'completed', message: `${placed}Crafted ${count} ${item}.` };
      return world.job;
    },
  });
  const world = fakeWorld({ start });
  const record = await runScenario(
    byId('craft-bootstrap'),
    env(world, fakeDeps(world, { behaviors: crafting(world) })),
  );
  assert.equal(record.status, 'pass', JSON.stringify(record.checks.filter((check) => !check.pass)));
  assert.deepEqual(record.observations.baseline.inventory, { 'minecraft:oak_log': 3, 'minecraft:cobblestone': 3 });
  assert.equal(
    world.written.filter((command) => /^execute if block .* minecraft:crafting_table$/.test(command)).length,
    16,
    'eight cells read before and after',
  );
  const lying = fakeWorld({ start });
  const failed = await runScenario(
    byId('craft-bootstrap'),
    env(lying, fakeDeps(lying, { behaviors: crafting(lying, { place: false }) })),
  );
  assert.equal(failed.status, 'fail');
  assert.match(failed.reason, /exactly one crafting table now stands beside the start/);
  assert.doesNotMatch(failed.reason, /server inventory holds the crafted results/);
});

test('craft refusal fails acceptance if ingredients disappear despite the expected error', async () => {
  const scenario = byId('craft-missing-ingredients');
  const lane = laneOrigin(scenario.lane);
  const start = { x: lane.x + 0.5, y: -60, z: 0.5 };
  for (const consume of [false, true]) {
    const world = fakeWorld({ start });
    const behaviors = {
      craft: async () => {
        if (consume) world.inventory[0].count--;
        const message = 'Missing ingredients for 12 oak_planks: 1 oak_log.';
        world.job = { status: 'failed', message };
        throw new Error(message);
      },
    };
    const record = await runScenario(scenario, env(world, fakeDeps(world, { behaviors })));
    assert.equal(record.status, consume ? 'fail' : 'pass', record.reason);
    if (consume) assert.match(record.reason, /server inventory still holds the ingredients/);
  }
});

test('withdraw-craft-model requires both criteria, matching server reads, and manual control', async () => {
  const scenario = byId('withdraw-craft-model');
  const start = { x: laneOrigin(scenario.lane).x + 0.5, y: -60, z: 0.5 };
  const model = 'test-model';
  for (const [changes, failure] of [
    [{}, null],
    [{ status: 'criteria_unmet' }, /agent reports criteria_met/],
    [{ withdrawMet: false }, /agent verified withdraw independently/],
    [{ craftMet: false }, /agent verified craft independently/],
    [{ oakLogs: 19 }, /server chest lost exactly four cobblestone/],
    [{ leftoverStone: 0 }, /server inventory holds the crafted pickaxe and one cobblestone/],
    [{ mode: 'agent' }, /agent handed back manual control/],
    [{ stopping: true }, /agent handed back manual control/],
  ]) {
    const {
      status = 'criteria_met',
      withdrawMet = true,
      craftMet = true,
      oakLogs = 20,
      leftoverStone = 1,
      mode = 'manual',
      stopping = false,
    } = changes;
    const world = fakeWorld({ start });
    const deps = fakeDeps(world, {
      runAgent: async (_adapter, goal, options) => {
        assert.match(goal, /Withdraw exactly four cobblestone.*Craft one stone pickaxe/);
        assert.equal(options.model, model);
        assert.equal(options.fetchImpl, undefined);
        assert.deepEqual(options.criteria, {
          withdraw: { item: 'cobblestone', count: 1 },
          craft: { item: 'stone_pickaxe', count: 1 },
        });
        world.chest.find((item) => item.id === 'minecraft:cobblestone').count = 1;
        world.chest.find((item) => item.id === 'minecraft:oak_log').count = oakLogs;
        world.inventory = [{ id: 'minecraft:stone_pickaxe', count: 1 }];
        if (leftoverStone) world.inventory.push({ id: 'minecraft:cobblestone', count: leftoverStone });
        world.mode = mode;
        world.stopping = stopping;
        world.job = { status: 'completed' };
        return { status, verification: { checks: { withdraw: { met: withdrawMet }, craft: { met: craftMet } } } };
      },
    });
    const record = await runScenario(scenario, env(world, deps, { model }));
    assert.equal(record.status, failure ? 'fail' : 'pass', record.reason);
    if (failure) assert.match(record.reason, failure);
  }
});

const SURVIVAL = ['eat-timeout', 'low-health-retreat', 'eat-retreat-timeout', 'collect-full-inventory'];

test('survival scenarios: the dry run lists them, --fast keeps the short two, --all runs all four on both backends', () => {
  for (const argv of [['--dry-run'], ['--dry-run', '--all'], ['--dry-run', '--backend', 'fabric']]) {
    const ids = buildPlan(parseOptions(argv)).scenarios.map(({ id }) => id);
    for (const id of SURVIVAL) assert.ok(ids.includes(id), `${argv.join(' ')} lists ${id}`);
  }
  for (const backend of ['bot', 'fabric']) {
    const fast = parseOptions(['--fast', '--backend', backend]).scenarios.map(({ id }) => id);
    assert.ok(fast.includes('low-health-retreat') && fast.includes('collect-full-inventory'), backend);
    assert.ok(!fast.includes('eat-timeout') && !fast.includes('eat-retreat-timeout'), backend);
    const all = parseOptions(['--all', '--backend', backend]).scenarios.map(({ id }) => id);
    for (const id of SURVIVAL) assert.ok(all.includes(id), `${backend} --all runs ${id}`);
  }
  assert.deepEqual(
    parseOptions(['--scenario', 'eat-retreat-timeout', '--backend', 'fabric']).scenarios.map(({ id }) => id),
    ['eat-retreat-timeout'],
  );

  const plan = buildPlan(parseOptions(['--dry-run', '--all']));
  const scenario = (id) => plan.scenarios.find((entry) => entry.id === id);
  for (const id of ['eat-timeout', 'low-health-retreat', 'eat-retreat-timeout']) {
    const { fixture, cleanup, prepare, verify } = scenario(id);
    assert.ok(fixture.includes('difficulty easy') && fixture.includes('gamerule naturalRegeneration false'), id);
    assert.ok(cleanup.includes('difficulty peaceful') && cleanup.includes('gamerule naturalRegeneration true'), id);
    assert.ok(prepare.includes(`effect give ${BOT} minecraft:instant_health 1 10 true`), id);
    assert.ok(verify.includes(`data get entity ${BOT} foodLevel`) && verify.includes(`data get entity ${BOT} Health`));
  }
  assert.ok(scenario('eat-timeout').prepare.includes(`give ${BOT} ${SLOW_BREAD} 8`));
  assert.equal(SLOW_BREAD, 'minecraft:bread[food={nutrition:5,saturation:6,eat_seconds:30}]');
  const { x } = laneOrigin(byId('eat-retreat-timeout').lane);
  const retreat = scenario('eat-retreat-timeout');
  assert.deepEqual(retreat.during, [
    `fill ${x - 2} -61 -2 ${x + 2} -57 2 minecraft:bedrock hollow`,
    `damage ${BOT} 13 minecraft:generic`,
    `effect give ${BOT} minecraft:hunger 120 255 true`,
    `effect clear ${BOT} minecraft:hunger`,
  ]);
  assert.ok(retreat.verify.includes(`execute if block ${x + 2} -60 0 minecraft:bedrock`));
  assert.ok(retreat.cleanup.includes(`fill ${x - 2} -61 -2 ${x + 2} -61 2 minecraft:grass_block`));
  assert.deepEqual(scenario('collect-full-inventory').prepare.slice(-3), [
    `give ${BOT} minecraft:iron_axe 1`,
    `give ${BOT} minecraft:cobblestone ${34 * 64}`,
    `give ${BOT} minecraft:oak_log 58`,
  ]);
  const text = formatPlan(plan);
  assert.match(text, /\[eat-timeout\][\s\S]*bridge: eat with eight slow bread held/);
  assert.match(text, /\[low-health-retreat\][\s\S]*while it runs: > damage LiveBot 13 minecraft:generic/);
});

test('eating attempts and backoff gaps come from the recorded survival timeline', () => {
  const attempts = eatingAttempts([
    { atMs: 0, survival: 'Could not eat.' },
    { atMs: 10_100, survival: 'Eating' },
    // A job message change records the same status again; it is not a new attempt.
    { atMs: 10_300, survival: 'Eating' },
    { atMs: 15_150, survival: 'Could not eat.' },
    { atMs: 25_200, survival: 'Eating' },
  ]);
  assert.deepEqual(attempts, [
    { startMs: 10_100, endMs: 15_150, outcome: 'Could not eat.' },
    { startMs: 25_200, endMs: null, outcome: null },
  ]);
  assert.deepEqual(eatingGaps(attempts, 0), [10_100, 10_050]);
  // Food eaten (the status moved on) starts no backoff, and without an earlier failure the first attempt has no gap.
  const eaten = eatingAttempts([
    { atMs: 0, survival: 'Eating' },
    { atMs: 1600, survival: 'Ready' },
    { atMs: 1700, survival: 'Eating' },
  ]);
  assert.deepEqual(eatingGaps(eaten), []);
  assert.deepEqual(eatingAttempts([{ atMs: 0, survival: null }]), []);
});

test('collect-full-inventory passes on an inventory-full failure the server confirms, under the same lease', async () => {
  const scenario = byId('collect-full-inventory');
  const start = { x: laneOrigin(scenario.lane).x + 0.5, y: -60, z: 0.5 };
  const run = async ({ logs = 64, message, mode = 'agent' } = {}) => {
    const world = fakeWorld({ start });
    const behaviors = {
      collect: async (action) => {
        assert.deepEqual(action, { type: 'collect', block: 'oak_log', count: 8 });
        world.inventory.find((item) => item.id === 'minecraft:oak_log').count = logs;
        world.mode = mode;
        const text =
          message ?? 'Inventory full; collected 6 of 8 oak_log. Inventory: 64/66. Returned to the starting point.';
        world.job = { status: 'failed', message: text };
        throw new Error(text);
      },
      wait: async () => ({ status: 'completed', message: 'Wait finished.' }),
    };
    const deps = fakeDeps(world, { behaviors });
    deps.connect = async () => Object.assign(world.adapter(behaviors), { leaseId: 'lease-1' });
    return runScenario(scenario, env(world, deps));
  };
  const passed = await run();
  assert.equal(passed.status, 'pass', JSON.stringify(passed.checks.filter((check) => !check.pass)));
  const timedOut = await run({
    message:
      'Collection timed out before reaching the requested quota. Inventory: 60/66. Returned to the starting point.',
    logs: 60,
  });
  assert.equal(timedOut.status, 'fail');
  assert.match(timedOut.reason, /inventory-full outcome/);
  assert.match(timedOut.reason, /exactly 64 logs/);
  const released = await run({ mode: 'manual' });
  assert.match(released.reason, /the session kept control/);
});

test('low-health-retreat passes when the server confirms the retreat home and fails when the player stays away', async () => {
  const scenario = byId('low-health-retreat');
  const { x } = laneOrigin(scenario.lane);
  const start = { x: x + 0.5, y: -60, z: 0.5 };
  const run = async ({ arrive = true } = {}) => {
    const world = fakeWorld({ start });
    const clock = { now: 0 };
    let settle;
    let woundedAt = null;
    // The retreat starts when the server reports the damage and ends three seconds later.
    world.onObserve = () => {
      if (world.health > 8 || !world.job || world.job.status !== 'running') return;
      woundedAt ??= clock.now;
      world.job.message = 'Low health: retreating home';
      if (clock.now - woundedAt < 3000) return;
      if (arrive) world.pos = { ...start };
      const message = 'Action interrupted for survival. Check your health and shelter.';
      world.job = { type: 'wait', status: 'failed', message };
      settle(new Error(message));
    };
    const behaviors = {
      set_home: async () => ({ status: 'completed', message: 'Saved home.' }),
      goto: async (action) => {
        assert.deepEqual(action, { type: 'goto', x: x + 16, y: -60, z: 0 });
        world.pos = { x: x + 16.5, y: -60, z: 0.5 };
        return { status: 'completed', message: 'Reached destination.' };
      },
      wait: (action) => {
        assert.deepEqual(action, { type: 'wait', seconds: 60 });
        world.mode = 'agent';
        world.job = { type: 'wait', status: 'running', message: 'Started wait' };
        return new Promise((_, reject) => {
          settle = reject;
        });
      },
    };
    const record = await runScenario(scenario, env(world, fakeDeps(world, { behaviors, clock })));
    return { record, world };
  };
  const { record, world } = await run();
  assert.equal(record.status, 'pass', JSON.stringify(record.checks.filter((check) => !check.pass)));
  assert.ok(world.written.includes(`damage ${BOT} 13 minecraft:generic`));
  assert.equal(world.health, 7);
  const away = await run({ arrive: false });
  assert.equal(away.record.status, 'fail');
  assert.match(away.record.reason, /server Pos is within 2 blocks of home/);
});

test('model-only scenarios are skipped without --model and never faked', async () => {
  for (const scenario of scenarios.filter((entry) => entry.requiresModel)) {
    const world = fakeWorld();
    const deps = fakeDeps(world, {
      runAgent: async () => {
        throw new Error('must not run');
      },
    });
    const record = await runScenario(scenario, env(world, deps));
    assert.equal(record.status, 'skipped');
    assert.match(record.reason, /--model/);
    assert.equal(world.written.length, 0);
  }
});

test('scripted planner serves decisions in order and runs hooks during the matching inference', async () => {
  const seen = [];
  const planner = scriptedPlanner([{ type: 'home' }, { type: 'done', reason: 'x' }], {
    before: { 1: async () => seen.push('hook') },
  });
  const decode = async (response) => JSON.parse((await response.json()).message.content);
  assert.deepEqual(await decode(await planner()), { type: 'home' });
  assert.deepEqual(seen, []);
  assert.deepEqual(await decode(await planner()), { type: 'done', reason: 'x' });
  assert.deepEqual(seen, ['hook']);
  assert.deepEqual(await decode(await planner()), { type: 'done', reason: 'x' });
  assert.equal(planner.requests(), 3);
  const body = (history) => ({
    body: JSON.stringify({ messages: [{ role: 'system' }, { role: 'user', content: JSON.stringify({ history }) }] }),
  });
  const forwarded = [];
  const wrapped = interceptInference(
    (request) => depositCompleted(request),
    async () => seen.push('removed'),
    async (_url, init) => {
      forwarded.push(init.body.length);
      return 'response';
    },
  );
  assert.equal(await wrapped('u', body([{ action: { type: 'collect' }, result: {} }])), 'response');
  assert.equal(wrapped.fired(), false);
  assert.equal(
    await wrapped('u', body([{ action: { type: 'deposit' }, result: { status: 'completed' } }])),
    'response',
  );
  assert.equal(
    await wrapped('u', body([{ action: { type: 'deposit' }, result: { status: 'completed' } }])),
    'response',
  );
  assert.equal(wrapped.fired(), true);
  assert.equal(seen.filter((entry) => entry === 'removed').length, 1);
  assert.equal(forwarded.length, 3);
});

test('a failing scenario still stops the bot, cleans fixtures, stops the server, and writes a complete results file', async () => {
  const world = fakeWorld({ start: { x: 96.5, y: -60, z: 0.5 } });
  const failing = {
    id: 'stub-fail',
    lane: 0,
    title: 'stub',
    release: ['RELEASE.md: stub'],
    actions: ['a'],
    expect: ['e'],
    plan: () => ({
      points: { start: { x: 96.5, y: -60, z: 0.5 } },
      fixture: ['fill 90 -60 -5 100 -55 5 stone'],
      prepare: [`clear ${BOT}`, `tp ${BOT} 96.5 -60 0.5`],
      cleanup: [`clear ${BOT}`, 'fill 90 -60 -5 100 -55 5 air'],
    }),
    run: async () => {
      throw new Error('boom');
    },
  };
  const skipped = { ...byId('stale-removal-model') };
  const deps = fakeDeps(world);
  const options = {
    ...parseOptions(['--all', '--accept-eula']),
    scenarios: [failing, skipped],
    out: '/fake/results.json',
  };
  const results = await runAcceptance(options, deps);
  assert.equal(deps.calls.botStops, 1);
  assert.equal(deps.calls.serverStops, 1);
  assert.equal(world.stops, 1, 'emergency stop sent through the bridge before cleanup');
  assert.ok(world.written.includes('fill 90 -60 -5 100 -55 5 air'));
  assert.ok(
    world.written.indexOf('fill 90 -60 -5 100 -55 5 air') > world.written.indexOf('fill 90 -60 -5 100 -55 5 stone'),
  );
  for (const command of WORLD_SETUP) assert.ok(world.written.includes(command));
  const { path, value } = deps.calls.results;
  assert.equal(path, '/fake/results.json');
  assert.equal(value, results);
  assert.deepEqual(
    Object.keys(value).sort(),
    [
      'environment',
      'error',
      'finishedAt',
      'minecraft',
      'options',
      'review',
      'schema',
      'scenarios',
      'scope',
      'startedAt',
      'summary',
      'timings',
    ].sort(),
  );
  assert.equal(value.schema, 'minecraft-agent/live-bot-acceptance/1');
  assert.equal(value.review.reviewed, false);
  for (const phase of ['serverStartMs', 'worldSetupMs', 'scenariosMs', 'serverStopMs', 'totalMs'])
    assert.equal(typeof value.timings[phase], 'number', phase);
  assert.ok(value.timings.totalMs >= value.timings.scenariosMs);
  assert.deepEqual(
    { commit: value.environment.commit, dirty: value.environment.dirty },
    { commit: 'abc123', dirty: false },
  );
  assert.deepEqual(value.environment.sourceAtFinish, { commit: 'abc123', dirty: false });
  assert.equal(value.minecraft.jarSha256, 'f'.repeat(64));
  assert.equal(value.minecraft.serverVersion, '1.21.1');
  assert.equal(value.minecraft.serverLog, '/fake/run/server/server.out');
  assert.deepEqual(value.summary, { pass: 0, fail: 1, skipped: 1, error: null });
  const [failed, skip] = value.scenarios;
  assert.deepEqual(
    { id: failed.id, status: failed.status, reason: failed.reason },
    { id: 'stub-fail', status: 'fail', reason: 'boom' },
  );
  for (const key of ['release', 'steps', 'observations', 'checks', 'cleanup', 'startedAt', 'durationMs'])
    assert.ok(key in failed, key);
  assert.ok(
    failed.steps.some((step) => step.name === 'start a fresh bot session via the repo CLI' && step.status === 'ok'),
  );
  assert.ok(
    failed.cleanup.every((entry) => entry.ok && typeof entry.durationMs === 'number'),
    JSON.stringify(failed.cleanup),
  );
  assert.equal(skip.status, 'skipped');
});

test('a phase that fails still records how long it ran', async () => {
  const world = fakeWorld();
  const clock = { now: 0 };
  const deps = fakeDeps(world, { clock });
  world.console.command = async () => {
    clock.now += 15_000;
    throw new Error('No reply within 15000 ms.');
  };
  const options = {
    ...parseOptions(['--all', '--accept-eula']),
    scenarios: [byId('stale-removal')],
    out: '/fake/results.json',
  };
  const results = await runAcceptance(options, deps);
  assert.match(results.error, /No reply/);
  assert.equal(results.timings.worldSetupMs, 15_000);
  assert.equal(results.timings.scenariosMs, null, 'never reached');
  assert.equal(typeof results.timings.serverStopMs, 'number');
  assert.equal(results.timings.totalMs, 15_000);
});

test('an interrupt during a scenario cleans up, skips the rest, and still stops everything', async () => {
  const world = fakeWorld({ start: { x: 96.5, y: -60, z: 0.5 } });
  const controller = new AbortController();
  const hanging = {
    id: 'stub-hang',
    lane: 0,
    title: 'stub',
    release: ['x'],
    actions: ['a'],
    expect: ['e'],
    plan: () => ({
      points: { start: { x: 96.5, y: -60, z: 0.5 } },
      fixture: ['fill 90 -60 -5 100 -55 5 stone'],
      prepare: [`tp ${BOT} 96.5 -60 0.5`],
      cleanup: ['fill 90 -60 -5 100 -55 5 air'],
    }),
    run: async (ctx) => {
      controller.abort(new Error('Interrupted by user.'));
      await ctx.server.command('time set 1000');
    },
  };
  const deps = fakeDeps(world);
  const options = {
    ...parseOptions(['--all', '--accept-eula', '--keep-server']),
    scenarios: [hanging, { ...hanging, id: 'stub-next' }],
    out: '/fake/r.json',
  };
  const results = await runAcceptance(options, deps, controller.signal);
  assert.equal(results.scenarios[0].status, 'fail');
  assert.match(results.scenarios[0].reason, /^Interrupted: Interrupted by user/);
  assert.equal(results.scenarios[1].status, 'skipped');
  assert.ok(world.written.includes('fill 90 -60 -5 100 -55 5 air'));
  assert.equal(world.written.filter((command) => command === 'time set 1000').length, 1);
  assert.equal(deps.calls.botStops, 1);
  assert.equal(deps.calls.serverStops, 1);
});

test('an interrupt during retained-fixture cleanup still removes the fixture and fails the run', async () => {
  const world = fakeWorld({ start: { x: 96.5, y: -60, z: 0.5 } });
  const controller = new AbortController();
  const write = world.console.write;
  world.console.write = (text) => {
    if (text === `clear ${BOT}\n`) controller.abort(new Error('Interrupted during cleanup.'));
    write(text);
  };
  const scenario = {
    id: 'stub-cleanup',
    lane: 0,
    title: 'stub',
    release: ['x'],
    actions: ['a'],
    expect: ['e'],
    plan: () => ({
      points: { start: { x: 96.5, y: -60, z: 0.5 } },
      fixture: ['fill 90 -60 -5 100 -55 5 stone'],
      prepare: [`tp ${BOT} 96.5 -60 0.5`],
      cleanup: [`clear ${BOT}`, 'fill 90 -60 -5 100 -55 5 air'],
    }),
    run: async (ctx) => ctx.check('passed before cleanup', true),
  };
  const deps = fakeDeps(world);
  const results = await runAcceptance(
    { ...parseOptions(['--all', '--accept-eula', '--keep-server']), scenarios: [scenario], out: '/fake/r.json' },
    deps,
    controller.signal,
  );
  assert.equal(results.scenarios[0].status, 'fail');
  assert.match(results.error, /Interrupted during cleanup/);
  assert.ok(world.written.includes('fill 90 -60 -5 100 -55 5 air'));
  assert.equal(deps.calls.serverStops, 1);
});

test('scenario diagnostics cannot overwrite check outcomes and keep bounded strings as details', async () => {
  const original = byId('craft-no-table');
  const world = fakeWorld({ start: { x: laneOrigin(original.lane).x + 0.5, y: -60, z: 0.5 } });
  const scenario = {
    ...original,
    run: async (ctx) => {
      ctx.check('did fail', false, { name: 'misleading', pass: true });
      ctx.check('big data', true, { note: 'x'.repeat(10_000) });
    },
  };
  const result = await runScenario(scenario, env(world, fakeDeps(world)));
  assert.equal(result.status, 'fail');
  assert.equal(result.reason, 'Failed checks: did fail');
  assert.deepEqual(result.checks[0], { name: 'did fail', pass: false });
  assert.deepEqual(Object.keys(result.checks[1]).sort(), ['detail', 'name', 'pass']);
  assert.ok(result.checks[1].detail.length <= 4001);
});

test('cleanup failure changes a pass to fail and preserves the latest bot output', async () => {
  const original = byId('craft-no-table');
  const world = fakeWorld({ start: { x: laneOrigin(original.lane).x + 0.5, y: -60, z: 0.5 } });
  const deps = fakeDeps(world);
  const startBot = deps.startBot;
  const connect = deps.connect;
  deps.startBot = async () => ({ ...(await startBot()), output: ['bot started\n', 'bot exited\n'] });
  deps.connect = async (...args) => ({
    ...(await connect(...args)),
    emergencyStop: async () => {
      throw new Error('bridge stop failed');
    },
  });
  const scenario = { ...original, run: async (ctx) => ctx.check('success', true) };
  const result = await runScenario(scenario, env(world, deps));
  assert.equal(result.status, 'fail');
  assert.equal(result.reason, 'Cleanup failed: bridge: /v1/stop');
  assert.equal(result.observations.botOutput, 'bot started\nbot exited');
  assert.equal(deps.calls.botStops, 1);
  assert.ok(result.cleanup.some((entry) => entry.command === 'close bridge connections' && entry.ok));
});

test('failed bot shutdown retains the failed scenario and skips the remaining selections', async () => {
  const original = byId('craft-no-table');
  const world = fakeWorld({ start: { x: laneOrigin(original.lane).x + 0.5, y: -60, z: 0.5 } });
  const deps = fakeDeps(world);
  let starts = 0;
  deps.startBot = async () => {
    starts++;
    return {
      stop: async () => {
        throw new Error('bot remained running');
      },
    };
  };
  const scenario = { ...original, run: async (ctx) => ctx.check('success', true) };
  const options = {
    ...parseOptions(['--all', '--accept-eula', '--no-thinking']),
    scenarios: [scenario, byId('craft-rounds-up')],
  };
  const results = await runAcceptance(options, deps);
  const [failed, skipped] = results.scenarios;
  assert.equal(failed.status, 'fail');
  assert.deepEqual(failed.cleanup.at(-1), {
    command: 'stop bot process',
    ok: false,
    error: 'bot remained running',
    durationMs: 0,
  });
  assert.equal(skipped.id, 'craft-rounds-up');
  assert.equal(skipped.status, 'skipped');
  assert.match(skipped.reason, /Could not stop the bot/);
  assert.equal(results.options.noThinking, true);
  assert.equal(starts, 1);
  assert.equal(deps.calls.serverStops, 1);
});

test('a bot that never became ready or exited also prevents the next fixture from starting', async () => {
  const world = fakeWorld();
  const deps = fakeDeps(world);
  deps.startBot = async () => {
    throw new ShutdownError('Bot remained running after bridge startup timed out.');
  };
  const options = parseOptions(['--scenario', 'craft-rounds-up', '--scenario', 'craft-no-table', '--accept-eula']);
  const results = await runAcceptance(options, deps);
  assert.equal(results.scenarios[0].status, 'fail');
  assert.equal(results.scenarios[1].status, 'skipped');
  assert.match(results.error, /Could not stop the bot/);
});

test('a startup timeout records the last available bot output', async (t) => {
  const world = fakeWorld();
  const deps = fakeDeps(world);
  const home = await createRunDirectory(RUNTIME);
  t.after(() => rm(home, { recursive: true, force: true }));
  deps.startBot = (options) =>
    startBot({
      ...options,
      home,
      timeoutMs: 100,
      connect: async () => {
        throw new Error('bridge unavailable');
      },
      spawnImpl: () => {
        const child = new EventEmitter();
        child.exitCode = null;
        child.signalCode = null;
        child.stdout = new EventEmitter();
        child.kill = (signal) => {
          child.signalCode = signal;
          child.emit('exit', null, signal);
        };
        setImmediate(() => child.stdout.emit('data', 'bot startup diagnostic\n'));
        return child;
      },
    });
  const options = parseOptions(['--scenario', 'craft-rounds-up', '--accept-eula']);
  const results = await runAcceptance(options, deps);
  assert.match(results.scenarios[0].reason, /bridge was not ready/);
  assert.equal(results.scenarios[0].observations.botOutput, 'bot startup diagnostic');
});

test('overlapping runs keep their server, bot state, and review evidence in separate directories', async (t) => {
  await mkdir(RUNTIME, { recursive: true });
  const root = await mkdtemp(join(RUNTIME, 'test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const jar = join(root, 'cached.jar');
  await writeFile(jar, 'cached jar fixture');
  const { promise: bothStarted, resolve: releaseServers } = Promise.withResolvers();
  let servers = 0;
  const scenario = {
    ...byId('collect-and-store'),
    run: async (ctx) => ctx.check('fixture reached', true),
  };
  const run = async (port) => {
    const world = fakeWorld({ start: { x: laneOrigin(scenario.lane).x + 0.5, y: -60, z: 0.5 } });
    const deps = fakeDeps(world);
    const { startBot, startServer } = deps;
    let botPaths;
    deps.createRunDirectory = () => createRunDirectory(join(root, 'runs'));
    deps.prepareServerDirectory = async (options) => {
      await prepareServerDirectory(options);
      await mkdir(join(options.directory, 'world'));
      await writeFile(join(options.directory, 'world', 'port'), String(port));
    };
    deps.startServer = ({ directory }) => {
      const server = startServer();
      const ready = server.console.ready.bind(server.console);
      server.console.ready = async (options) => {
        if (++servers === 2) releaseServers();
        await bothStarted;
        assert.equal(servers, 2);
        await writeFile(join(directory, 'server.out'), String(port));
        return ready(options);
      };
      return server;
    };
    deps.startBot = async ({ bridge, home }) => {
      botPaths = { bridge, home };
      return startBot();
    };
    const options = { ...parseOptions(['--all', '--accept-eula']), jar, port, scenarios: [scenario] };
    const results = await runAcceptance(options, deps).finally(releaseServers);
    const { serverLog } = results.minecraft;
    const directory = dirname(dirname(serverLog));
    assert.equal(results.summary.pass, 1, JSON.stringify(results.summary));
    assert.equal(deps.calls.serverStops, 1);
    assert.equal(deps.calls.botStops, 1);
    assert.deepEqual(botPaths, { bridge: join(directory, 'bridge.json'), home: join(directory, 'agent-home') });
    assert.equal(deps.calls.results.path, join(directory, 'results.json'));
    const properties = await readFile(join(dirname(serverLog), 'server.properties'), 'utf8');
    assert.ok(properties.split('\n').includes(`server-port=${port}`));
    return { serverLog, directory };
  };
  const [first, second] = await Promise.all([run(25566), run(25567)]);
  assert.notEqual(first.directory, second.directory);
  for (const [entry, port] of [
    [first, '25566'],
    [second, '25567'],
  ]) {
    assert.equal(await readFile(entry.serverLog, 'utf8'), port);
    assert.equal(await readFile(join(dirname(entry.serverLog), 'world', 'port'), 'utf8'), port);
  }
});

test('--fast dry-run includes short offline scenarios and excludes pits and models', () => {
  const plan = buildPlan(parseOptions(['--fast', '--dry-run', '--model', 'local-test-model']));
  assert.deepEqual(
    plan.scenarios.map(({ id }) => id),
    [
      'collect-and-store',
      'stale-removal',
      'blocked-lid',
      'inspect-preserves-home',
      'inspect-return-blocked',
      'withdraw',
      'withdraw-omitted',
      'withdraw-no-candidate',
      'withdraw-short-stock',
      'withdraw-full-inventory',
      'craft-bootstrap',
      'craft-missing-ingredients',
      'craft-full-inventory',
      'deposit-barrel-exact',
      'deposit-full-chest',
      'deposit-double-chest-omitted',
      'deposit-over-held',
      'withdraw-barrel-exact',
      'withdraw-no-matching-stock',
      'craft-rounds-up',
      'craft-mixed-planks',
      'craft-mixed-stone',
      'craft-reuses-consumed-slot',
      'craft-no-table',
      'cobblestone-hostiles-dimension',
      'low-health-retreat',
      'collect-full-inventory',
    ],
  );
  assert.throws(() => parseOptions(['--fast', '--all']), /Choose only one/);
  assert.throws(() => parseOptions(['--fast', '--scenario', 'withdraw']), /Choose only one/);
});

test('main prints the dry-run plan without starting anything and refuses without --accept-eula', async () => {
  const printed = [],
    warned = [];
  let started = false;
  const deps = {
    print: (text) => printed.push(text),
    warn: (text) => warned.push(text),
    startServer: () => {
      started = true;
    },
  };
  assert.equal(await main(['--dry-run'], deps), 0);
  assert.match(printed.join('\n'), /dry run; nothing is started/);
  assert.equal(await main([], deps), 2);
  assert.match(warned.join('\n'), /Choose --scenario/);
  const refused = { ...deps, preflight };
  assert.equal(await main(['--all', '--server-jar', '/nonexistent/server.jar'], refused), 1);
  assert.match(warned.join('\n'), /--accept-eula.*DEVELOPMENT\.md/s);
  assert.equal(started, false);
});

test('dry-run JSON contains the full selected plan and is refused for live runs', async () => {
  const requests = ['--dry-run', '--json', '--scenario', 'deposit-double-chest-omitted'];
  const printed = [];
  assert.equal(await main(requests, { print: (text) => printed.push(JSON.parse(text)) }), 0);
  assert.deepEqual(printed[0], buildPlan(parseOptions(requests)));
  assert.throws(() => parseOptions(['--all', '--json']), /--json requires --dry-run/);
});

test('a live selection with no completed checks returns an unsuccessful exit status', async () => {
  const world = fakeWorld();
  const deps = fakeDeps(world);
  assert.equal(await main(['--scenario', 'stale-removal-model', '--accept-eula'], deps), 1);
  assert.deepEqual(deps.calls.results.value.summary, { pass: 0, fail: 0, skipped: 1, error: null });
});

test('candidate evidence hashes the prepared server jar and checks the source again after cleanup', async () => {
  const deps = fakeDeps(fakeWorld());
  const { startServer } = deps;
  let prepared = false;
  let hashed = false;
  deps.prepareServerDirectory = async () => {
    prepared = true;
  };
  deps.sha256File = async (path) => {
    assert.ok(prepared);
    if (path === '/fake/run/server/server.out') {
      assert.equal(deps.calls.serverStops, 1);
      return 'b'.repeat(64);
    }
    assert.equal(path, '/fake/run/server/server.jar');
    hashed = true;
    return 'a'.repeat(64);
  };
  deps.startServer = () => {
    assert.ok(hashed);
    return startServer();
  };
  deps.environment = () => ({ commit: 'abc123', dirty: deps.calls.serverStops > 0 });

  const options = parseOptions(['--scenario', 'stale-removal-model', '--accept-eula']);
  const result = await runAcceptance(options, deps);
  assert.equal(result.error, null);
  assert.equal(result.minecraft.jarSha256, 'a'.repeat(64));
  assert.equal(result.minecraft.serverLogSha256, 'b'.repeat(64));
  assert.equal(result.environment.dirty, false);
  assert.deepEqual(result.environment.sourceAtFinish, { commit: 'abc123', dirty: true });
});

test('a failed server shutdown never hashes a partial log', async () => {
  const deps = fakeDeps(fakeWorld());
  const { startServer } = deps;
  deps.startServer = () => ({
    ...startServer(),
    stop: async () => {
      throw new Error('still running');
    },
  });
  const hashed = [];
  deps.sha256File = async (path) => {
    hashed.push(path);
    return 'a'.repeat(64);
  };
  const options = parseOptions(['--scenario', 'stale-removal-model', '--accept-eula']);
  const result = await runAcceptance(options, deps);
  assert.deepEqual(hashed, ['/fake/run/server/server.jar']);
  assert.equal(result.minecraft.serverLogSha256, null);
  assert.equal(result.error, 'Server stop failed: still running');
});

test('an unavailable server log fails the acceptance run after shutdown', async () => {
  const deps = fakeDeps(fakeWorld());
  deps.sha256File = async (path) => {
    if (path.endsWith('server.out')) throw new Error('unreadable log');
    return 'a'.repeat(64);
  };
  const options = parseOptions(['--scenario', 'stale-removal-model', '--accept-eula']);
  const result = await runAcceptance(options, deps);
  assert.equal(deps.calls.serverStops, 1);
  assert.equal(result.minecraft.serverLogSha256, null);
  assert.equal(result.error, 'Server log checksum failed: unreadable log');
});

test('startup verifies the reported Minecraft version before applying world setup', async () => {
  for (const version of [null, '1.21.4']) {
    const world = fakeWorld();
    const deps = fakeDeps(world);
    const { startServer } = deps;
    deps.startServer = () => {
      const server = startServer();
      server.console.version = version;
      return server;
    };
    const options = parseOptions(['--scenario', 'withdraw', '--accept-eula']);
    const result = await runAcceptance(options, deps);
    assert.equal(result.error, `Expected Minecraft 1.21.1, found ${version ?? 'an unknown version'}.`);
    assert.equal(result.scenarios[0].status, 'skipped');
    assert.deepEqual(world.written, []);
    assert.equal(deps.calls.serverStops, 1);
  }
});

test('settle cancels its escalation timer once the child exits', async () => {
  const timers = () => process.getActiveResourcesInfo().filter((name) => name === 'Timeout').length;
  const before = timers();
  const child = { exitCode: null, signalCode: null };
  let signals = 0;
  await settle(child, Promise.resolve({ code: 0 }), [
    [
      () => {
        signals++;
      },
      60_000,
    ],
  ]);
  assert.equal(signals, 1);
  assert.equal(timers(), before, 'no 60 s timer left keeping the process alive');
});

test('shutdown escalation rejects if the child never exits', async () => {
  const child = { pid: 123, exitCode: null, signalCode: null };
  const exited = new Promise(() => {});
  await assert.rejects(settle(child, exited, [[() => {}, 1]]), /Process 123 did not exit/);
});

test('asynchronous server stdin errors fail pending commands and allow signal shutdown', async () => {
  await mkdir(RUNTIME, { recursive: true });
  const directory = await mkdtemp(join(RUNTIME, 'server-pipe-'));
  try {
    const child = new EventEmitter();
    child.exitCode = null;
    child.signalCode = null;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = new EventEmitter();
    child.stdin.writable = true;
    child.stdin.write = () => {
      setImmediate(() => {
        child.stdin.writable = false;
        child.stdin.emit('error', new Error('EPIPE'));
      });
    };
    child.kill = (signal) => {
      child.signalCode = signal;
      child.emit('exit', null, signal);
      setImmediate(() => {
        child.stdout.emit('data', 'last server output after exit\n');
        child.emit('close', null, signal);
      });
    };
    const server = startServer({ directory, spawnImpl: () => child });
    await assert.rejects(server.console.command('time set 1000'), /server stdin failed: EPIPE/);
    await server.stop();
    assert.equal(child.signalCode, 'SIGTERM');
    assert.equal(await readFile(join(directory, 'server.out'), 'utf8'), 'last server output after exit\n');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('--backend fabric selects the development client with its own default player name', () => {
  assert.throws(() => parseOptions(['--all', '--backend', 'forge']), /--backend must be bot or fabric/);
  assert.equal(parseOptions(['--all']).backend, 'bot');
  assert.equal(parseOptions(['--all']).account, 'LiveBot');
  const fabric = parseOptions(['--fast', '--backend', 'fabric']);
  assert.equal(fabric.backend, 'fabric');
  assert.equal(fabric.account, 'LiveFabric');
  assert.equal(parseOptions(['--all', '--backend', 'fabric', '--account', 'Tester']).account, 'Tester');
  assert.deepEqual(
    fabric.scenarios.map(({ id }) => id),
    parseOptions(['--fast']).scenarios.map(({ id }) => id),
  );
});

test('the Fabric dry-run plan names the client command, its own bridge, and never claims release evidence', () => {
  const plan = buildPlan(parseOptions(['--scenario', 'withdraw', '--backend', 'fabric', '--port', '25570']));
  assert.equal(plan.backend, 'fabric');
  assert.equal(plan.botCommand, undefined);
  assert.match(plan.clientCommand, /^MC_AGENT_HOME=\S+agent-home \S+ \S+scripts\/gradle\.js runClient /);
  assert.match(
    plan.clientCommand,
    / -PquickPlay=127\.0\.0\.1:25570 -PdevUsername=LiveFabric -PclientRunDir=\S+\/client$/,
  );
  assert.match(plan.clientLog, /client\/client\.out$/);
  for (const text of plan.scenarios[0].release)
    assert.match(text, /^pre-check only \(Fabric development client\): RELEASE\.md/);
  assert.ok(plan.scenarios[0].fixture.every((command) => !/LiveBot/.test(command)));
  assert.ok(plan.scenarios[0].prepare.some((command) => /LiveFabric/.test(command)));
  const text = formatPlan(plan);
  assert.match(text, /^Live Fabric acceptance \(development client\) plan/);
  assert.match(text, /never evidence for a RELEASE\.md box/);
  assert.match(text, /start the Fabric client, then prepare:/);
  assert.doesNotMatch(text, /Bot \(per scenario\)/);
  assert.doesNotMatch(formatPlan(buildPlan(parseOptions(['--scenario', 'withdraw']))), /Fabric client/);
});

test('a Fabric run starts a fresh client per scenario and records a separate schema and client log', async () => {
  const world = fakeWorld();
  const deps = fakeDeps(world);
  const starts = [];
  const prepared = [];
  deps.startBot = async () => assert.fail('the bot must not start in a Fabric run');
  deps.prepareFabricGameDirectory = async (options) => prepared.push(options);
  deps.startFabricClient = async (options) => {
    starts.push(options);
    return {
      stop: async () => {
        deps.calls.botStops++;
        world.console.push(`${LOG_PREFIX}${BOT} left the game\n`);
      },
    };
  };
  const options = parseOptions([
    '--scenario',
    'craft-rounds-up',
    '--scenario',
    'craft-no-table',
    '--accept-eula',
    '--backend',
    'fabric',
    '--account',
    BOT,
  ]);
  const results = await runAcceptance(options, deps);
  assert.deepEqual(prepared, [{ directory: '/fake/run/client' }]);
  assert.equal(starts.length, 2);
  for (const start of starts)
    assert.deepEqual(
      { ...start, signal: undefined },
      {
        port: 25566,
        account: BOT,
        bridge: '/fake/run/agent-home/bridge.json',
        home: '/fake/run/agent-home',
        gameDir: '/fake/run/client',
        log: '/fake/run/client/client.out',
        java: 'java',
        signal: undefined,
      },
    );
  assert.equal(deps.calls.botStops, 2);
  assert.equal(results.schema, 'minecraft-agent/live-fabric-acceptance/1');
  assert.equal(results.backend, 'fabric');
  assert.match(results.scope, /not the packaged jars/);
  assert.match(results.review.note, /never evidence for a RELEASE\.md box/);
  assert.deepEqual(results.client, {
    log: '/fake/run/client/client.out',
    logSha256: 'f'.repeat(64),
    gameDirectory: '/fake/run/client',
  });
  for (const scenario of results.scenarios) {
    assert.ok(scenario.steps.some(({ name }) => /fresh Fabric development client/.test(name)));
    assert.ok(scenario.cleanup.some(({ command, ok }) => command === 'stop Fabric client' && ok));
    for (const text of scenario.release) assert.match(text, /^pre-check only/);
  }
  const summary = formatSummary(results, '/fake/results.json');
  assert.match(summary, /^Live Fabric acceptance \(development client\): /);
  assert.match(summary, /Client log: \/fake\/run\/client\/client\.out/);
});

test('scenarios marked proxy join a Fabric run through one pausable proxy; the others join the server directly', async () => {
  const world = fakeWorld();
  const deps = fakeDeps(world);
  const starts = [];
  const proxies = [];
  deps.prepareFabricGameDirectory = async () => {};
  deps.startFabricClient = async (options) => {
    starts.push(options.port);
    return {
      stop: async () => world.console.push(`${LOG_PREFIX}${BOT} left the game\n`),
    };
  };
  deps.startProxy = async (options) => {
    const proxy = {
      port: 40001,
      options,
      paused: false,
      closed: false,
      pause() {
        proxy.paused = true;
      },
      resume() {
        proxy.paused = false;
      },
      async close() {
        proxy.closed = true;
      },
    };
    proxies.push(proxy);
    return proxy;
  };
  const seen = [];
  const stub = (id, proxied) => ({
    id,
    lane: 0,
    title: id,
    backends: ['fabric'],
    ...(proxied && { proxy: true }),
    release: ['RELEASE.md: stub'],
    actions: ['a'],
    expect: ['e'],
    plan: () => ({
      points: { start: { x: 0.5, y: -60, z: 0.5 } },
      fixture: [],
      prepare: [`tp ${BOT} 0.5 -60 0.5`],
      cleanup: [],
    }),
    run: async (ctx) => {
      seen.push(ctx.proxy);
      // A scenario that leaves the replies held must not leave the client cut off.
      ctx.proxy?.pause('toClient');
      ctx.check('ran', true);
    },
  });
  const options = {
    ...parseOptions(['--scenario', 'craft-rounds-up', '--accept-eula', '--backend', 'fabric', '--account', BOT]),
    scenarios: [stub('direct', false), stub('held', true)],
    out: '/fake/results.json',
  };
  const results = await runAcceptance(options, deps);
  assert.equal(proxies.length, 1);
  assert.deepEqual(proxies[0].options, { port: 25566 });
  assert.deepEqual(starts, [25566, 40001]);
  assert.deepEqual(seen, [null, proxies[0]]);
  assert.equal(proxies[0].paused, false);
  assert.equal(proxies[0].closed, true);
  assert.deepEqual(results.proxy, { port: 40001, target: 25566 });
  assert.deepEqual(
    results.scenarios.map(({ status }) => status),
    ['pass', 'pass'],
  );
  const plan = buildPlan({ ...options, dryRun: true });
  assert.match(plan.proxy, /pausable loopback TCP proxy .*127\.0\.0\.1:25566/);
  assert.deepEqual(
    plan.scenarios.map(({ proxy }) => proxy),
    [undefined, true],
  );
  assert.match(formatPlan(plan), /\[held\] held \[proxy\]/);

  // Without a proxied scenario no proxy starts.
  deps.startProxy = async () => assert.fail('no proxy without a proxied scenario');
  await runAcceptance({ ...options, scenarios: [stub('direct', false)] }, deps);
});

test('a Fabric client that cannot be stopped skips the remaining scenarios', async () => {
  const world = fakeWorld();
  const deps = fakeDeps(world);
  deps.prepareFabricGameDirectory = async () => {};
  deps.startFabricClient = async () => {
    throw new ShutdownError('Client remained running after bridge startup timed out.');
  };
  const options = parseOptions([
    '--scenario',
    'craft-rounds-up',
    '--scenario',
    'craft-no-table',
    '--accept-eula',
    '--backend',
    'fabric',
  ]);
  const results = await runAcceptance(options, deps);
  assert.equal(results.scenarios[0].status, 'fail');
  assert.ok(results.scenarios[0].cleanup.some(({ command, ok }) => command === 'stop Fabric client' && !ok));
  assert.equal(results.scenarios[1].status, 'skipped');
  assert.match(results.error, /Could not stop the Fabric client/);
});

test('the Fabric client starts through Gradle with its own home, clears stale state, and stops its process group', async (t) => {
  await mkdir(RUNTIME, { recursive: true });
  const root = await mkdtemp(join(RUNTIME, 'test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const home = join(root, 'agent-home');
  const gameDir = join(root, 'client');
  const bridge = join(home, 'bridge.json');
  const log = join(root, 'client', 'client.out');
  await mkdir(home, { recursive: true });
  await writeFile(bridge, '{"stale":true}');
  await writeFile(join(home, 'homes.json'), '{}');
  await prepareFabricGameDirectory({ directory: gameDir });
  const options = (await readFile(join(gameDir, 'options.txt'), 'utf8')).trim().split('\n');
  assert.deepEqual(options, FABRIC_CLIENT_OPTIONS);
  assert.ok(options.includes('pauseOnLostFocus:false'));

  let spawned;
  const signals = [];
  const realKill = process.kill;
  t.after(() => {
    process.kill = realKill;
  });
  const child = new EventEmitter();
  child.pid = 424242;
  child.exitCode = null;
  child.signalCode = null;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  process.kill = (pid, signal) => {
    if (pid !== -424242) return realKill(pid, signal);
    signals.push(signal);
    if (child.signalCode) return true;
    child.signalCode = signal;
    child.emit('exit', null, signal);
    child.emit('close');
    return true;
  };
  let observed = 0;
  const session = await startFabricClient({
    port: 25570,
    account: 'LiveFabric',
    bridge,
    home,
    gameDir,
    log,
    java: '/opt/jdk-21/bin/java',
    timeoutMs: 5_000,
    spawnImpl: (command, args, spawnOptions) => {
      spawned = { command, args, spawnOptions };
      setImmediate(() => child.stdout.emit('data', '[Render thread/INFO]: Connecting to 127.0.0.1, 25570\n'));
      return child;
    },
    connect: async (path) => {
      assert.equal(path, bridge);
      return {
        observe: async () => (++observed < 2 ? { connected: false } : { connected: true, player: { position: {} } }),
        close: async () => {},
      };
    },
  });
  assert.equal(spawned.command, process.execPath);
  assert.deepEqual(spawned.args, fabricClientArguments({ port: 25570, account: 'LiveFabric', gameDir }));
  assert.equal(spawned.spawnOptions.env.MC_AGENT_HOME, home);
  assert.equal(spawned.spawnOptions.env.JAVA_HOME, '/opt/jdk-21', 'Gradle runs on the --java JDK');
  assert.ok(spawned.spawnOptions.env.PATH.startsWith('/opt/jdk-21/bin'));
  assert.equal(spawned.spawnOptions.detached, true);
  await assert.rejects(readFile(bridge), { code: 'ENOENT' }, 'a stale bridge file from the last client is removed');
  await assert.rejects(readFile(join(home, 'homes.json')), { code: 'ENOENT' });
  await session.stop();
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL'], 'the whole group is killed once the wrapper exits');
  const written = await readFile(log, 'utf8');
  assert.match(written, /start LiveFabric \(pid 424242\)/);
  assert.match(written, /Connecting to 127\.0\.0\.1, 25570/);
});

test('settling waits until the client stops reporting paused, as Fabric does while terrain loads', async () => {
  const world = fakeWorld({ start: { x: 96.5, y: -60, z: 0.5 } });
  let pausedReads = 2;
  const state = world.state;
  world.state = () => ({ ...state(), paused: pausedReads-- > 0 });
  const scenario = {
    id: 'stub-paused',
    lane: 0,
    title: 'stub',
    release: ['RELEASE.md: stub'],
    actions: ['a'],
    expect: ['e'],
    plan: () => ({
      points: { start: { x: 96.5, y: -60, z: 0.5 } },
      fixture: [],
      prepare: [`tp ${BOT} 96.5 -60 0.5`],
      cleanup: [`clear ${BOT}`],
    }),
    run: async (ctx) => ctx.check('ran after settling', true),
  };
  const record = await runScenario(scenario, env(world, fakeDeps(world)));
  assert.equal(record.status, 'pass', record.reason);
  const settled = record.steps.find(({ name }) => /^wait for bridge and server/.test(name));
  assert.equal(settled.detail.paused, false);
  assert.ok(pausedReads < 0, 'the paused observations were read and waited out');
});

test('a Fabric wrapper that exits before its bridge is ready still has its process group killed', async (t) => {
  await mkdir(RUNTIME, { recursive: true });
  const root = await mkdtemp(join(RUNTIME, 'test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const signals = [];
  const realKill = process.kill;
  t.after(() => {
    process.kill = realKill;
  });
  const child = new EventEmitter();
  child.pid = 434343;
  child.exitCode = null;
  child.signalCode = null;
  child.stdout = new EventEmitter();
  process.kill = (pid, signal) => {
    if (pid !== -434343) return realKill(pid, signal);
    signals.push(signal);
    return true;
  };
  await assert.rejects(
    startFabricClient({
      port: 25570,
      account: 'LiveFabric',
      bridge: join(root, 'agent-home', 'bridge.json'),
      home: join(root, 'agent-home'),
      gameDir: join(root, 'client'),
      timeoutMs: 5_000,
      spawnImpl: () => {
        setImmediate(() => {
          child.exitCode = 1;
          child.emit('exit', 1, null);
        });
        return child;
      },
      connect: async () => {
        throw new Error('bridge unavailable');
      },
    }),
    /exited before its bridge was ready/,
  );
  assert.deepEqual(signals, ['SIGKILL']);
});

test('an expected failure counts only when the checks it names are all that failed', async () => {
  const run = async (checks) => {
    const base = byId('withdraw');
    const lane = laneOrigin(base.lane);
    const world = fakeWorld({ start: { x: lane.x + 0.5, y: -60, z: 0.5 } });
    const scenario = {
      ...base,
      expectedFailure: 'Not observable here.',
      expectedChecks: ['the key press reached the game'],
      run: async (ctx) => {
        for (const [name, pass] of checks) ctx.check(name, pass);
      },
    };
    return runScenario(scenario, env(world, fakeDeps(world)));
  };
  const explained = await run([
    ['the key press reached the game (the bridge shows the transition)', false],
    ['mode becomes manual and stays manual', true],
  ]);
  assert.equal(explained.status, 'xfail', explained.reason);
  const unexplained = await run([
    ['the key press reached the game (the bridge shows the transition)', false],
    ['mode becomes manual and stays manual', false],
  ]);
  assert.equal(unexplained.status, 'fail');
});

test('--packaged needs the Fabric backend, defaults to the dist archive and refuses a misnamed --archive', () => {
  assert.throws(() => parseOptions(['--fast', '--packaged']), /--packaged runs only with --backend fabric/);
  assert.throws(
    () => parseOptions(['--fast', '--backend', 'fabric', '--archive', 'dist/minecraft-agent-0.1.0.zip']),
    /--archive requires --packaged/,
  );
  assert.throws(
    () => parseOptions(['--fast', '--backend', 'fabric', '--packaged', '--archive', '/tmp/candidate.zip']),
    /--archive must point to minecraft-agent-0\.1\.0\.zip/,
  );
  const dev = parseOptions(['--fast', '--backend', 'fabric']);
  assert.equal(dev.packaged, false);
  assert.equal(dev.archive, null);
  const packaged = parseOptions(['--fast', '--backend', 'fabric', '--packaged']);
  assert.equal(packaged.packaged, true);
  assert.equal(packaged.archive, resolve('dist/minecraft-agent-0.1.0.zip'));
  assert.deepEqual(
    packaged.scenarios.map(({ id }) => id),
    dev.scenarios.map(({ id }) => id),
    '--packaged runs the same --fast selection',
  );
  const takeover = parseOptions([
    '--scenario',
    'f8-collect',
    '--backend',
    'fabric',
    '--packaged',
    '--archive',
    'candidate/minecraft-agent-0.1.0.zip',
  ]);
  assert.equal(takeover.archive, resolve('candidate/minecraft-agent-0.1.0.zip'));
  assert.deepEqual(
    takeover.scenarios.map(({ id }) => id),
    ['f8-collect'],
  );
});

test('the packaged dry run names the production client, the archive and the smoke check without needing either', async () => {
  const options = parseOptions(['--scenario', 'withdraw', '--backend', 'fabric', '--packaged', '--port', '25570']);
  const plan = buildPlan(options);
  assert.match(plan.clientCommand, / \S+scripts\/gradle\.js runProductionClient -PquickPlay=127\.0\.0\.1:25570 /);
  assert.doesNotMatch(plan.clientCommand, / runClient /);
  assert.equal(plan.packaged.archive, resolve('dist/minecraft-agent-0.1.0.zip'));
  assert.match(plan.packaged.modsDirectory, /run-XXXXXX\/client\/mods$/);
  assert.deepEqual(plan.packaged.jars, [
    'minecraft-agent-0.1.0.jar',
    'baritone-api-fabric-1.11.3.jar',
    'fabric-api-0.116.18+1.21.1.jar',
  ]);
  for (const text of plan.scenarios[0].release)
    assert.match(text, /^pre-check only \(Fabric packaged jars, development launcher\): RELEASE\.md/);
  const text = formatPlan(plan);
  assert.match(text, /^Live Fabric acceptance \(packaged jars, development launcher\) plan/);
  assert.match(text, /Packaged smoke check: .*remappedJars.*minecraft_agent, fabric-api, baritone/);
  assert.match(text, /never evidence for a RELEASE\.md box/);
  assert.doesNotMatch(formatPlan(buildPlan(parseOptions(['--fast', '--backend', 'fabric']))), /Packaged/);
  // No archive, server jar or EULA is needed to list the plan.
  const printed = [];
  const code = await main(
    ['--dry-run', '--backend', 'fabric', '--packaged', '--archive', '/nowhere/minecraft-agent-0.1.0.zip', '--fast'],
    { print: (line) => printed.push(line), warn: () => {} },
  );
  assert.equal(code, 0);
  assert.match(printed.join('\n'), /Packaged archive: \/nowhere\/minecraft-agent-0\.1\.0\.zip/);
});

test('preflight refuses a packaged run whose archive is missing and says to build it', () => {
  const spawnSyncImpl = () => ({ stderr: 'openjdk version "21.0.4" 2024-07-16' });
  const exists = (path) => !path.endsWith('.zip');
  assert.throws(
    () =>
      preflight(
        { acceptEula: true, jar: '/jar', archive: '/dist/minecraft-agent-0.1.0.zip' },
        { exists, spawnSyncImpl },
      ),
    /packaged mod archive is missing: \/dist\/minecraft-agent-0\.1\.0\.zip\. Run npm run build:mod first/,
  );
  assert.equal(preflight({ acceptEula: true, jar: '/jar' }, { exists, spawnSyncImpl }).major, 21);
  assert.deepEqual(fabricClientArguments({ port: 1, account: 'A', gameDir: '/g', packaged: true }).slice(1, 2), [
    'runProductionClient',
  ]);
});

function packagedDeps(world, { smoke } = {}) {
  const deps = fakeDeps(world);
  const calls = { preflight: [], prepare: [], starts: [], checks: [] };
  deps.preflight = (options) => {
    calls.preflight.push(options);
    return { banner: 'openjdk version "21.0.4"', major: 21 };
  };
  deps.prepareFabricGameDirectory = async () => {};
  deps.preparePackagedMods = async (options) => {
    calls.prepare.push(options);
    return {
      archive: options.archive,
      archiveSha256: 'c'.repeat(64),
      build: { sourceCommit: 'abc123', sourceModified: false, version: '0.1.0', commitMatches: true, clean: true },
      modsDirectory: options.modsDir,
      jars: [{ name: 'minecraft-agent-0.1.0.jar', sha256: 'd'.repeat(64) }],
      warnings: ['BUILD.json was built from 0123, not the current commit.'],
    };
  };
  deps.startFabricClient = async (options) => {
    calls.starts.push(options);
    return {
      stop: async () => {
        deps.calls.botStops++;
        world.console.push(`${LOG_PREFIX}${BOT} left the game\n`);
      },
    };
  };
  deps.checkPackagedClient = async (options) => {
    calls.checks.push(options);
    return (
      smoke ?? {
        pass: true,
        production: true,
        remappedJars: ['minecraft-1.21.1-0.20.1'],
        loaderVersion: '0.20.1',
        mods: { minecraft_agent: '0.1.0', 'fabric-api': '0.116.18+1.21.1', baritone: '1.11.3' },
        problems: [],
      }
    );
  };
  return { deps, calls };
}

test('a packaged run verifies the archive jars first, launches the production client and labels every result', async () => {
  const world = fakeWorld();
  const { deps, calls } = packagedDeps(world);
  const warnings = [];
  deps.warn = (line) => warnings.push(line);
  const options = parseOptions([
    '--scenario',
    'craft-rounds-up',
    '--accept-eula',
    '--backend',
    'fabric',
    '--packaged',
    '--account',
    BOT,
  ]);
  const results = await runAcceptance(options, deps);
  assert.equal(calls.preflight[0].archive, resolve('dist/minecraft-agent-0.1.0.zip'));
  assert.deepEqual(calls.prepare, [
    { archive: resolve('dist/minecraft-agent-0.1.0.zip'), modsDir: '/fake/run/client/mods' },
  ]);
  assert.equal(calls.starts.length, 1);
  assert.equal(calls.starts[0].packaged, true);
  assert.equal(calls.starts[0].gameDir, '/fake/run/client');
  assert.deepEqual(calls.checks, [{ gameDir: '/fake/run/client' }]);
  assert.equal(results.schema, 'minecraft-agent/live-fabric-packaged-acceptance/1');
  assert.equal(results.backend, 'fabric');
  assert.match(results.scope, /release archive's three jars in Fabric Loader production mode/);
  assert.match(results.scope, /not a normal launcher/);
  assert.match(results.review.note, /packaged-jar pre-check/);
  assert.match(results.review.note, /never evidence for a RELEASE\.md box/);
  assert.equal(results.packaged.archiveSha256, 'c'.repeat(64));
  assert.equal(results.packaged.modsDirectory, '/fake/run/client/mods');
  assert.equal(results.packaged.smoke.loaderVersion, '0.20.1');
  assert.ok(warnings.some((line) => /Packaged archive: BUILD\.json was built from 0123/.test(line)));
  const [scenario] = results.scenarios;
  assert.ok(
    scenario.steps.some(
      ({ name, status }) => /packaged jars via Gradle runProductionClient/.test(name) && status === 'ok',
    ),
  );
  assert.ok(scenario.steps.some(({ name, status }) => /^packaged-smoke/.test(name) && status === 'ok'));
  assert.ok(scenario.checks.some(({ name, pass }) => name === 'packaged-smoke' && pass));
  assert.equal(scenario.observations.packagedSmoke.loaderVersion, '0.20.1');
  for (const text of scenario.release) assert.match(text, /^pre-check only \(Fabric packaged jars/);
  const summary = formatSummary(results, '/fake/results.json');
  assert.match(summary, /^Live Fabric acceptance \(packaged jars, development launcher\): /);
  assert.match(summary, /Packaged archive: \S+minecraft-agent-0\.1\.0\.zip \(sha256 c{64}\)/);
  assert.match(
    summary,
    /Packaged smoke: Fabric Loader 0\.20\.1, minecraft_agent 0\.1\.0, fabric-api 0\.116\.18\+1\.21\.1/,
  );
});

test('a failed packaged smoke check fails the scenario, and a bad archive stops the run before the server starts', async () => {
  const world = fakeWorld();
  const { deps } = packagedDeps(world, {
    smoke: { pass: false, problems: ['latest.log does not list the mods baritone'], mods: {} },
  });
  const options = parseOptions(['--scenario', 'craft-rounds-up', '--accept-eula', '--backend', 'fabric', '--packaged']);
  const results = await runAcceptance({ ...options, account: BOT }, deps);
  assert.equal(results.scenarios[0].status, 'fail');
  assert.match(results.scenarios[0].reason, /Packaged smoke check failed: latest\.log does not list the mods baritone/);
  assert.equal(deps.calls.botStops, 1, 'the client is still stopped');

  const broken = packagedDeps(fakeWorld());
  let serverStarted = false;
  broken.deps.startServer = () => {
    serverStarted = true;
    throw new Error('the server must not start');
  };
  broken.deps.preparePackagedMods = async () => {
    throw new Error('The packaged archive did not verify: ARCHIVE_SHA256SUMS has no checksum.');
  };
  const refused = await runAcceptance({ ...options, account: BOT }, broken.deps);
  assert.equal(serverStarted, false);
  assert.match(refused.error, /did not verify/);
  assert.equal(refused.scenarios[0].status, 'skipped');
  assert.equal(refused.packaged.archiveSha256, null);
});
