#!/usr/bin/env node
import { basename, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  createRunDirectory,
  DEFAULT_JAR,
  MINECRAFT_VERSION,
  portIsFree,
  preflight,
  prepareServerDirectory,
  SEED,
  startServer,
  WORLD_SETUP,
} from './live-acceptance/processes.js';
import { CRAFT_SEQUENCE, readCommands, scenarioPlan, scenarios, storePlan } from './live-acceptance/scenarios.js';

const runtime = resolve(import.meta.dirname, '../.runtime/live-fabric-fixtures');
const fixtures = {
  pit: {
    botScenario: 'recovery-timeout',
    actions: [
      'mc-agent collect oak_log 64',
      'Observe partial progress and the attempt to return to the starting ledge.',
    ],
  },
  'deposit-return': {
    botScenario: 'inspect-preserves-home',
    variations: ['removeStep'],
    actions: [
      'mc-agent set-home',
      'mc-agent deposit oak_log 8',
      'mc-agent home',
      'mc-agent inspect-storage',
      'Check the player position against the saved home.',
    ],
  },
  withdraw: { botScenario: 'withdraw', actions: ['mc-agent withdraw oak_log 8'] },
  'withdraw-omitted': { botScenario: 'withdraw-omitted', actions: ['mc-agent withdraw oak_log'] },
  'withdraw-no-candidate': { botScenario: 'withdraw-no-candidate', actions: ['mc-agent withdraw oak_log 8'] },
  'withdraw-short-stock': { botScenario: 'withdraw-short-stock', actions: ['mc-agent withdraw oak_log 24'] },
  'withdraw-full-inventory': { botScenario: 'withdraw-full-inventory', actions: ['mc-agent withdraw oak_log 8'] },
  'craft-bootstrap': {
    botScenario: 'craft-bootstrap',
    actions: CRAFT_SEQUENCE.map(([item, count]) => `mc-agent craft ${item} ${count}`),
  },
  'craft-missing-ingredients': { botScenario: 'craft-missing-ingredients', actions: ['mc-agent craft oak_planks 12'] },
  'craft-full-inventory': { botScenario: 'craft-full-inventory', actions: ['mc-agent craft oak_planks 4'] },
  'deposit-chest': {
    storage: 'chest',
    variations: ['removeStored', 'blockLid'],
    actions: [
      'mc-agent deposit oak_log 8',
      'mc-agent inspect-storage',
      'For a fresh run with omitted count, use mc-agent deposit oak_log.',
    ],
  },
  'deposit-barrel': {
    storage: 'barrel',
    actions: ['mc-agent deposit oak_log 8', 'For a fresh run with omitted count, use mc-agent deposit oak_log.'],
  },
  'deposit-full-chest': { storage: 'full', actions: ['mc-agent deposit oak_log 8'] },
  'deposit-double-chest': {
    storage: 'double',
    actions: ['mc-agent deposit oak_log', 'Read both halves after the transfer or a takeover.'],
  },
};
const fixtureIds = Object.keys(fixtures);
const usage = `Usage:
  npm run acceptance:fabric-fixtures -- --dry-run [--scenario ID] [--player NAME]
  npm run acceptance:fabric-fixtures -- --scenario ID --player NAME --accept-eula [--port N] [--java PATH] [--server-jar PATH]
Fixtures: ${fixtureIds.join(', ')}`;

export function parseOptions(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      scenario: { type: 'string' },
      player: { type: 'string' },
      'dry-run': { type: 'boolean' },
      'accept-eula': { type: 'boolean' },
      port: { type: 'string' },
      java: { type: 'string' },
      'server-jar': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const { scenario, player, help, java = 'java', 'dry-run': dryRun } = values;
  if (scenario !== undefined && !fixtureIds.includes(scenario))
    throw new Error(`Unknown fixture ${JSON.stringify(scenario)}.`);
  if (player !== undefined && !/^[A-Za-z0-9_]{3,16}$/.test(player))
    throw new Error('--player must be a 3–16 character Minecraft username.');
  if (!help && !dryRun && (!scenario || !player))
    throw new Error('Live setup requires --scenario ID and --player NAME.');
  const port = Number(values.port ?? 25567);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('--port must be an integer from 1024 to 65535.');
  return {
    scenario,
    player: player ?? 'FabricTester',
    help,
    dryRun,
    acceptEula: values['accept-eula'],
    jar: resolve(values['server-jar'] ?? DEFAULT_JAR),
    java: basename(java) === java ? java : resolve(java),
    port,
  };
}

export function fixturePlan(id, player) {
  const { storage, botScenario, actions, variations = [] } = fixtures[id];
  const plan = storage
    ? storePlan({ bot: player, lane: 0 }, { storage, depositLogs: 192 })
    : scenarioPlan(
        scenarios.find((scenario) => scenario.id === botScenario),
        { bot: player },
      );
  const { fixture, prepare, points, reads = [], hooks } = plan;
  return {
    id,
    fixture,
    prepare,
    verify: plan.verify ?? [...readCommands(player, points.chest), ...reads],
    variations: variations.map((name) => hooks[name]),
    actions,
  };
}

function formatFixture({ id, fixture, prepare, actions: commands, verify, variations }) {
  const section = (title, lines) => [title, ...lines.map((line) => `  ${line}`)];
  return [
    `[${id}]`,
    ...section('World fixture (server console)', fixture),
    ...section("Player setup after joining (server console; clears this player's inventory)", prepare),
    ...section('Manual actions (CLI terminal)', commands),
    ...section('Independent reads (server console; repeat after the action or interruption)', verify),
    ...(variations.length
      ? section('Optional changes for separate verification cases (server console)', variations)
      : []),
  ].join('\n');
}

const itemRead = /^data get block (-?\d+) (-?\d+) (-?\d+) Items$/;
async function startFixture(options, plan) {
  preflight(options);
  if (!(await portIsFree(options.port)))
    throw new Error(`Port ${options.port} on 127.0.0.1 is in use. Pass --port to select another port.`);
  const directory = join(await createRunDirectory(runtime), 'server');
  await prepareServerDirectory({ ...options, directory, seed: SEED });
  console.log(`Server log: ${join(directory, 'server.out')}`);
  const server = startServer({ directory, java: options.java });
  const input = createInterface({ input: process.stdin });
  const controller = new AbortController();
  const { signal } = controller;
  const stop = () => controller.abort(new Error('Fixture session ended.'));
  input.once('close', stop);
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  try {
    await server.console.ready({ signal });
    if (server.console.version !== MINECRAFT_VERSION) {
      throw new Error(
        `Expected Minecraft ${MINECRAFT_VERSION}, found ${server.console.version ?? 'an unknown version'}.`,
      );
    }
    for (const command of [...WORLD_SETUP, ...plan.fixture]) await server.console.command(command, { signal });
    console.log(`Join 127.0.0.1:${options.port} as ${options.player} using the packaged Fabric profile.`);
    await server.console.waitFor((line) => line === `${options.player} joined the game`, {
      history: true,
      label: `${options.player} to join`,
      signal,
      timeoutMs: 300_000,
    });
    for (const command of plan.prepare) await server.console.command(command, { signal });
    console.log('Independent baseline reads');
    for (const command of plan.verify) {
      const coords = itemRead.exec(command);
      const value = coords
        ? JSON.stringify(
            await server.console.blockData(Number(coords[1]), Number(coords[2]), Number(coords[3]), 'Items', {
              signal,
            }),
          )
        : await server.console.command(command, { signal });
      console.log(`  ${command}\n    ${value}`);
    }
    console.log(
      `\n${formatFixture(plan)}\nFixture ready. Enter server console commands here. Ctrl+C, end of input, or stop ends the session.`,
    );
    server.console.on('line', (line) => console.log(line));
    input.on('line', (line) => {
      if (line.trim()) server.console.write(`${line.trim().replace(/^\//, '')}\n`);
    });
    await Promise.race([
      new Promise((done) => {
        if (signal.aborted) done();
        else signal.addEventListener('abort', done, { once: true });
      }),
      server.exited.then(({ code, signal: exitSignal }) => {
        if (code !== 0) throw new Error(`Server exited (${exitSignal ?? code}).`);
      }),
    ]);
  } finally {
    input.close();
    try {
      await server.stop();
    } finally {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
    }
  }
}

async function main() {
  try {
    const options = parseOptions(process.argv.slice(2));
    if (options.help) {
      console.log(usage);
    } else if (options.dryRun) {
      const ids = options.scenario ? [options.scenario] : fixtureIds;
      console.log(
        `Fabric fixture dry run for ${options.player}\nWorld settings:\n  ${WORLD_SETUP.join('\n  ')}\n\n${ids.map((id) => formatFixture(fixturePlan(id, options.player))).join('\n\n')}`,
      );
    } else {
      console.log('Disposable offline server on loopback. Setup clears the named player’s inventory in this world.');
      await startFixture(options, fixturePlan(options.scenario, options.player));
    }
  } catch (error) {
    console.error(`Error: ${error.message}\n${usage}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
