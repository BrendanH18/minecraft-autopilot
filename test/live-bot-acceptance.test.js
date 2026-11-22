import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
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
} from '../scripts/live-acceptance/scenarios.js';
import {
  createRunDirectory,
  preflight,
  javaVersion,
  prepareServerDirectory,
  RUNTIME,
  serverProperties,
  settle,
} from '../scripts/live-acceptance/processes.js';
import {
  parseOptions,
  buildPlan,
  formatPlan,
  runAcceptance,
  runScenario,
  main,
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

test('command errors and timeouts reject without blocking later commands', async () => {
  const { serverConsole, written } = fakeConsole();
  const bad = serverConsole.command('data get entity LiveBot Pos');
  await new Promise(setImmediate);
  serverConsole.push(`${LOG_PREFIX}No entity was found\n`);
  await assert.rejects(
    bad,
    (error) => error instanceof CommandError && /failed: No entity was found/.test(error.message),
  );
  await assert.rejects(
    serverConsole.command('time set 1000', { timeoutMs: 20 }),
    /Timed out after 20 ms waiting for a reply to "time set 1000"/,
  );
  const next = serverConsole.command('weather clear');
  await new Promise(setImmediate);
  serverConsole.push(`${LOG_PREFIX}Set the weather to clear\n`);
  assert.equal(await next, 'Set the weather to clear');
  await assert.rejects(serverConsole.command('summon zombie'), /No reply pattern is known for "summon"/);
  await assert.rejects(serverConsole.command('say a\nstop'), /Invalid console command/);
  assert.ok(!written.some((text) => text.startsWith('summon') || text.includes('stop')));
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
      scenario.cleanup.some((command) => /^fill .* air$/.test(command)),
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
  assert.throws(() => parseOptions([]), /--scenario <id> \(repeatable\), --all, or --fast/);
  assert.throws(() => parseOptions(['--scenario', 'nope']), /Unknown scenario "nope"/);
  assert.throws(() => parseOptions(['--all', '--scenario', 'blocked-lid']), /Choose only one/);
  assert.throws(() => parseOptions(['--all', '--port', '80']), /--port/);
  assert.throws(() => parseOptions(['--all', '--account', 'a b']), /--account/);
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
  };
  const reply = (command) => {
    const [verb, ...rest] = command.split(' ');
    if (verb === 'data' && rest[0] === 'get' && rest[1] === 'block')
      return `${rest[2]}, ${rest[3]}, ${rest[4]} has the following block data: [${world.chest.map((item, slot) => `{count: ${item.count}, Slot: ${slot}b, id: "${item.id}"}`).join(', ')}]`;
    if (verb === 'data' && rest[0] === 'get' && rest.at(-1) === 'Inventory')
      return `${BOT} has the following entity data: [${world.inventory.map((item, slot) => `{count: ${item.count}, Slot: ${slot}b, id: "${item.id}"}`).join(', ')}]`;
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
      world.inventory.push({ id: rest[1], count: Number(rest[2]) });
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
    connected: true,
    mode: world.mode,
    stopping: world.stopping,
    job: world.job && { ...world.job },
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

test('withdraw-craft-model checks the agent result against both independent server reads', async () => {
  const scenario = byId('withdraw-craft-model');
  const start = { x: laneOrigin(scenario.lane).x + 0.5, y: -60, z: 0.5 };
  const model = 'test-model';
  for (const [status, oakLogs, leftoverSticks, failure] of [
    ['criteria_met', 20, 0, null],
    ['criteria_unmet', 20, 0, /agent reports criteria_met/],
    ['criteria_met', 19, 0, /server chest lost exactly three cobblestone/],
    ['criteria_met', 20, 1, /server inventory holds only the crafted stone pickaxe/],
  ]) {
    const world = fakeWorld({ start });
    const deps = fakeDeps(world, {
      runAgent: async (_adapter, goal, options) => {
        assert.match(goal, /Withdraw exactly three cobblestone.*craft one stone pickaxe/);
        assert.equal(options.model, model);
        assert.equal(options.fetchImpl, undefined);
        assert.deepEqual(options.criteria, { craft: { item: 'stone_pickaxe', count: 1 } });
        world.chest.find((item) => item.id === 'minecraft:cobblestone').count = 2;
        world.chest.find((item) => item.id === 'minecraft:oak_log').count = oakLogs;
        world.inventory = [{ id: 'minecraft:stone_pickaxe', count: 1 }];
        if (leftoverSticks) world.inventory.push({ id: 'minecraft:stick', count: leftoverSticks });
        return { status };
      },
    });
    const record = await runScenario(scenario, env(world, deps, { model }));
    assert.equal(record.status, failure ? 'fail' : 'pass', record.reason);
    if (failure) assert.match(record.reason, failure);
  }
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
    ].sort(),
  );
  assert.equal(value.schema, 'minecraft-agent/live-bot-acceptance/1');
  assert.equal(value.review.reviewed, false);
  assert.deepEqual(
    { commit: value.environment.commit, dirty: value.environment.dirty },
    { commit: 'abc123', dirty: false },
  );
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
    failed.cleanup.every((entry) => entry.ok),
    JSON.stringify(failed.cleanup),
  );
  assert.equal(skip.status, 'skipped');
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
    ...parseOptions(['--all', '--accept-eula']),
    scenarios: [hanging, { ...hanging, id: 'stub-next' }],
    out: '/fake/r.json',
  };
  const results = await runAcceptance(options, deps, controller.signal);
  assert.equal(results.scenarios[0].status, 'fail');
  assert.match(results.scenarios[0].reason, /^Interrupted: Interrupted by user/);
  assert.equal(results.scenarios[1].status, 'skipped');
  assert.ok(world.written.includes('fill 90 -60 -5 100 -55 5 air'));
  assert.equal(deps.calls.botStops, 1);
  assert.equal(deps.calls.serverStops, 1);
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

test('--fast dry-run includes the offline storage and crafting scenarios and excludes pits and models', () => {
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
