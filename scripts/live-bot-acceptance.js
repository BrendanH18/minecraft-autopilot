#!/usr/bin/env node
/**
 * Scripted live acceptance for the Mineflayer server bot (roadmap step 4). Starts the cached vanilla 1.21.1 server,
 * builds fixtures with console commands, drives the bot through the repo CLI and bridge client, verifies with
 * independent `data get` reads, and writes a JSON results file. Results need human review before they count.
 *
 * `--backend fabric` runs the same scenarios against the Fabric development client instead (a fresh `runClient`
 * per scenario, joined with quick play). That is a pre-check for the keyboard sessions; it uses the development
 * client, not the packaged jars, so its results are never evidence for a RELEASE.md box.
 */
import { parseArgs } from 'node:util';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createInterface } from 'node:readline';
import { writePrivateJson } from '../src/config.js';
import { FabricAdapter } from '../src/fabric-adapter.js';
import { runAgent } from '../src/agent.js';
import { bridgeItemTotals, distance, itemTotals, sameTotals, toPosition } from './live-acceptance/nbt-parse.js';
import { scenarios, scenarioIds, scenarioPlan } from './live-acceptance/scenarios.js';
import {
  DEFAULT_JAR,
  RUNTIME,
  MINECRAFT_VERSION,
  SEED,
  WORLD_SETUP,
  HELP,
  ShutdownError,
  preflight,
  portIsFree,
  sha256File,
  serverProperties,
  createRunDirectory,
  prepareServerDirectory,
  startServer,
  startBot,
  botArguments,
  startFabricClient,
  fabricClientArguments,
  prepareFabricGameDirectory,
  runCli,
  environment,
} from './live-acceptance/processes.js';

export { SEED, WORLD_SETUP };
const REVIEW_NOTE =
  'Machine-checked observations only. These results become acceptance evidence for RELEASE.md only after a person reviews them, including server.out.';
const FABRIC_REVIEW_NOTE =
  'Fabric development-client pre-check. These results find bugs before the keyboard sessions; they are never evidence for a RELEASE.md box, which needs the packaged jars in a normal launcher.';

/** What differs between the server bot and the Fabric development client. */
export const BACKENDS = {
  bot: {
    label: 'bot',
    title: 'Live bot acceptance',
    schema: 'minecraft-agent/live-bot-acceptance/1',
    scope: 'Mineflayer server bot only; does not cover Fabric or authenticated handoff.',
    account: 'LiveBot',
    startStep: 'start a fresh bot session via the repo CLI',
    stopStep: 'stop bot process',
    reviewNote: REVIEW_NOTE,
  },
  fabric: {
    label: 'Fabric client',
    title: 'Live Fabric acceptance (development client)',
    schema: 'minecraft-agent/live-fabric-acceptance/1',
    scope:
      'Fabric development client (runClient with quick play) only; not the packaged jars, a normal launcher, the bot, or authenticated handoff.',
    account: 'LiveFabric',
    startStep: 'start a fresh Fabric development client via Gradle runClient',
    stopStep: 'stop Fabric client',
    reviewNote: FABRIC_REVIEW_NOTE,
  },
};
const USAGE = `Usage: node scripts/live-bot-acceptance.js (--scenario <id> ... | --all | --fast) [--accept-eula] [--server-jar <path>] [--dry-run [--json]]
  [--backend bot|fabric] [--keep-server] [--port N] [--out <file>] [--account NAME] [--java <path>] [--model NAME [--ollama URL] [--no-thinking]]
--fast runs offline scenarios without the long pit recovery cases.
--backend fabric starts a fresh Fabric development client per scenario instead of the bot (npm run acceptance:fabric);
  it needs a display (xvfb-run on a headless host) and the cached Minecraft assets, and is a pre-check, not release evidence.
Scenarios: ${scenarioIds.join(', ')}`;

export function parseOptions(argv) {
  const { values } = parseArgs({
    args: argv,
    allowPositionals: false,
    options: {
      scenario: { type: 'string', multiple: true },
      all: { type: 'boolean' },
      fast: { type: 'boolean' },
      backend: { type: 'string' },
      'server-jar': { type: 'string' },
      'dry-run': { type: 'boolean' },
      json: { type: 'boolean' },
      'keep-server': { type: 'boolean' },
      port: { type: 'string' },
      out: { type: 'string' },
      'accept-eula': { type: 'boolean' },
      account: { type: 'string' },
      java: { type: 'string' },
      model: { type: 'string' },
      ollama: { type: 'string' },
      'no-thinking': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const port = values.port === undefined ? 25566 : Number(values.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('--port must be an integer from 1024 to 65535.');
  const backend = values.backend ?? 'bot';
  if (!Object.hasOwn(BACKENDS, backend)) throw new Error('--backend must be bot or fabric.');
  const account = values.account ?? BACKENDS[backend].account;
  if (!/^[A-Za-z0-9_]{3,16}$/.test(account))
    throw new Error('--account must be a 3–16 character offline username (letters, digits, _).');
  const java = values.java ?? 'java';
  const model = values.model?.trim();
  if (values.model !== undefined && !model) throw new Error('--model must name an installed Ollama model.');
  if (values.json && !values['dry-run']) throw new Error('--json requires --dry-run.');
  if ([values.scenario, values.all, values.fast].filter(Boolean).length > 1)
    throw new Error('Choose only one of --scenario, --all, and --fast.');
  for (const id of values.scenario ?? [])
    if (!scenarioIds.includes(id))
      throw new Error(`Unknown scenario ${JSON.stringify(id)}. Choose from: ${scenarioIds.join(', ')}.`);
  if (!values.help && !values.all && !values.fast && !values.scenario && !values['dry-run'])
    throw new Error(`Choose --scenario <id> (repeatable), --all, or --fast.\n${USAGE}`);
  const selected = scenarios.filter((scenario) => {
    if (values.fast) return !scenario.longRunning && !scenario.requiresModel;
    return !values.scenario || values.scenario.includes(scenario.id);
  });
  return {
    help: !!values.help,
    dryRun: !!values['dry-run'],
    json: !!values.json,
    keepServer: !!values['keep-server'],
    acceptEula: !!values['accept-eula'],
    backend,
    port,
    account,
    jar: resolve(values['server-jar'] ?? DEFAULT_JAR),
    java: basename(java) === java ? java : resolve(java),
    model: model ?? null,
    ollama: values.ollama ?? 'http://127.0.0.1:11434',
    noThinking: !!values['no-thinking'],
    out: values.out ? resolve(values.out) : null,
    scenarios: selected,
  };
}

// The Fabric mod writes its bridge file into MC_AGENT_HOME; the bot is told where to write it.
const paths = (options, directory) => ({
  server: join(directory, 'server'),
  serverLog: join(directory, 'server', 'server.out'),
  bridge: options.backend === 'fabric' ? join(directory, 'agent-home', 'bridge.json') : join(directory, 'bridge.json'),
  home: join(directory, 'agent-home'),
  client: join(directory, 'client'),
  clientLog: join(directory, 'client', 'client.out'),
  out: options.out ?? join(directory, 'results.json'),
});
const backendOf = (options) => BACKENDS[options.backend ?? 'bot'];

/** Everything the run would do, without starting anything. */
export function buildPlan(options) {
  const where = paths(options, join(RUNTIME, 'run-XXXXXX'));
  return {
    serverDirectory: where.server,
    serverLog: where.serverLog,
    resultsFile: where.out,
    serverJar: options.jar,
    java: options.java,
    port: options.port,
    serverProperties: serverProperties({ port: options.port, seed: SEED }).trim().split('\n'),
    serverCommand: `${options.java} -Xmx2G -jar server.jar nogui   (cwd ${where.server}; console on stdin, readiness on "Done (")`,
    worldSetup: WORLD_SETUP,
    backend: options.backend ?? 'bot',
    ...(options.backend === 'fabric'
      ? {
          clientCommand: `MC_AGENT_HOME=${where.home} ${process.execPath} ${fabricClientArguments({ port: options.port, account: options.account, gameDir: where.client }).join(' ')}`,
          clientLog: where.clientLog,
          reviewNote: FABRIC_REVIEW_NOTE,
        }
      : {
          botCommand: `MC_AGENT_HOME=${where.home} ${process.execPath} ${botArguments({ port: options.port, account: options.account, bridge: where.bridge }).join(' ')}`,
        }),
    scenarios: options.scenarios.map((scenario) => ({
      id: scenario.id,
      title: scenario.title,
      release: releaseFor(options, scenario),
      requiresModel: !!scenario.requiresModel,
      willSkip: !!scenario.requiresModel && !options.model,
      ...scenarioPlan(scenario, { bot: options.account }),
    })),
  };
}

/** Fabric development-client runs only pre-check a release box; the text says so wherever it appears. */
function releaseFor(options, scenario) {
  if (options.backend !== 'fabric') return scenario.release;
  return scenario.release.map((text) => `pre-check only (Fabric development client): ${text}`);
}

export function formatPlan(plan) {
  const fabric = plan.backend === 'fabric';
  const lines = [
    `${fabric ? BACKENDS.fabric.title : BACKENDS.bot.title} plan (dry run; nothing is started)`,
    `Server: ${plan.serverCommand}`,
    `Jar: ${plan.serverJar}`,
    `Server log: ${plan.serverLog}`,
    `Results: ${plan.resultsFile}`,
    `server.properties: ${plan.serverProperties.join(', ')}`,
    'World setup:',
    ...plan.worldSetup.map((command) => `  > ${command}`),
    ...(fabric
      ? [`Fabric client (fresh per scenario): ${plan.clientCommand}`, `Client log: ${plan.clientLog}`, plan.reviewNote]
      : [`Bot (per scenario): ${plan.botCommand}`]),
  ];
  for (const scenario of plan.scenarios) {
    lines.push(
      '',
      `[${scenario.id}] ${scenario.title}${scenario.requiresModel ? ` (requires --model${scenario.willSkip ? '; will be skipped' : ''})` : ''}`,
      ...scenario.release.map((text) => `  maps to ${text}`),
      '  fixture:',
      ...scenario.fixture.map((command) => `    > ${command}`),
      `  start the ${fabric ? 'Fabric client' : 'bot'}, then prepare:`,
      ...scenario.prepare.map((command) => `    > ${command}`),
      '  actions:',
      ...scenario.actions.map((text) => `    - ${text}`),
      ...(scenario.during.length
        ? ['  console commands sent during the run:', ...scenario.during.map((command) => `    > ${command}`)]
        : []),
      '  independent reads (before and after):',
      ...scenario.verify.map((command) => `    > ${command}`),
      '  expected:',
      ...scenario.expect.map((text) => `    - ${text}`),
      '  cleanup (also on failure):',
      ...scenario.cleanup.map((command) => `    > ${command}`),
    );
  }
  return lines.join('\n');
}

const compact = (value) => {
  if (value === undefined) return undefined;
  try {
    const text = JSON.stringify(value);
    return text.length <= 4000 ? JSON.parse(text) : `${text.slice(0, 4000)}…`;
  } catch {
    return String(value);
  }
};

/** The scenario-facing API; every method is backed by the injectable console/bridge/CLI. */
export function createContext({ record, options, serverConsole, bridge, deps, signal }) {
  let actor = null,
    observer = null;
  const agentLog = [];
  const ctx = {
    options,
    bot: options.account,
    signal,
    observations: record.observations,
    now: deps.now,
    sleep: (ms) => deps.sleep(ms, signal),
    async step(name, fn) {
      const entry = { name, status: 'running', startedAt: new Date(deps.now()).toISOString() };
      record.steps.push(entry);
      const started = deps.now();
      try {
        const value = await fn();
        entry.status = 'ok';
        entry.detail = compact(value);
        return value;
      } catch (error) {
        entry.status = 'failed';
        entry.error = error.message;
        throw error;
      } finally {
        entry.durationMs = deps.now() - started;
      }
    },
    note(key, value) {
      record.observations[key] = compact(value);
    },
    check(name, pass, detail = {}) {
      const report = compact(detail);
      record.checks.push({ ...(typeof report === 'string' ? { detail: report } : report), name, pass: !!pass });
    },
    server: {
      command: (command) => serverConsole.command(command, { signal }),
      items: async ({ x, y, z }) => serverConsole.blockData(x, y, z, 'Items', { signal }),
      inventory: async () => serverConsole.entityData(options.account, 'Inventory', { signal }),
      position: async () => toPosition(await serverConsole.entityData(options.account, 'Pos', { signal })),
      // `execute if block X Y Z BLOCK`: true when the server reports "Test passed".
      testBlock: async ({ x, y, z }, block) =>
        /^Test passed/.test(await serverConsole.command(`execute if block ${x} ${y} ${z} ${block}`, { signal })),
    },
    bridge: {
      async execute(action, extra = {}) {
        actor ??= await deps.connect(bridge);
        return actor.execute(action, { signal, ...extra });
      },
      async cancel() {
        if (actor) await actor.cancel();
      },
      async observe() {
        observer ??= await deps.connect(bridge);
        return observer.observe();
      },
      async release() {
        const current = actor;
        actor = null;
        await current?.close();
      },
      async emergencyStop() {
        observer ??= await deps.connect(bridge);
        return observer.emergencyStop();
      },
    },
    cliStop: () => deps.runCli(['stop'], { bridge }),
    async agent({ goal, criteria, fetchImpl, model }) {
      await ctx.bridge.release();
      const adapter = await deps.connect(bridge);
      try {
        return await deps.runAgent(adapter, goal, {
          model: model ?? 'scripted-acceptance-planner',
          ollamaUrl: options.ollama,
          fetchImpl,
          criteria,
          maxSteps: 20,
          minutes: 10,
          think: options.noThinking ? false : undefined,
          signal,
          log: (line) => {
            agentLog.push(String(line));
            ctx.note('agentLog', agentLog.slice(-60));
          },
        });
      } finally {
        await adapter.close();
      }
    },
    async close() {
      const current = observer;
      observer = null;
      try {
        await ctx.bridge.release();
      } finally {
        await current?.close();
      }
    },
  };
  return ctx;
}

/** Waits until the bot is at the start and the bridge reflects the fixture's inventory. */
async function settle(ctx, { points: { start }, marker }, timeoutMs = 15_000) {
  const deadline = ctx.now() + timeoutMs;
  let last;
  while (true) {
    const state = await ctx.bridge.observe();
    const server = await ctx.server.position();
    const held = itemTotals(await ctx.server.inventory());
    const bridgeHeld = bridgeItemTotals(state.inventory);
    const markerSeen =
      !marker ||
      state.blocks?.some(
        (block) => block.name === marker.name && block.x === marker.x && block.y === marker.y && block.z === marker.z,
      );
    // Fabric reports paused while the terrain-loading screen is still open after joining; actions are refused then.
    last = { bridge: state.player?.position ?? null, server, held, bridgeHeld, markerSeen, paused: !!state.paused };
    if (
      !state.paused &&
      state.player?.position &&
      distance(state.player.position, start) <= 1 &&
      distance(server, start) <= 1 &&
      sameTotals(held, bridgeHeld) &&
      markerSeen &&
      !state.job
    )
      return last;
    if (ctx.now() >= deadline) throw new Error(`The bot did not settle at the start: ${JSON.stringify(last)}`);
    await ctx.sleep(500);
  }
}

function scenarioRecord(scenario, reason = null, options = {}) {
  return {
    id: scenario.id,
    title: scenario.title,
    release: releaseFor(options, scenario),
    requiresModel: !!scenario.requiresModel,
    status: 'skipped',
    reason,
    startedAt: null,
    durationMs: 0,
    steps: [],
    observations: {},
    checks: [],
    cleanup: [],
  };
}

/** Fixture → fresh bot or client session → prepare → run → stop job → cleanup → stop session. Cleanup always runs. */
export async function runScenario(scenario, { options, deps, serverConsole, signal, where }) {
  const backend = backendOf(options);
  if (scenario.requiresModel && !options.model) {
    return scenarioRecord(scenario, 'Requires a real local model; pass --model NAME to run it.', options);
  }
  if (signal.aborted) {
    return scenarioRecord(scenario, 'Interrupted before this scenario started.', options);
  }
  const record = scenarioRecord(scenario, null, options);
  const plan = scenarioPlan(scenario, { bot: options.account });
  record.startedAt = new Date(deps.now()).toISOString();
  if (scenario.requiresModel) record.observations.model = options.model;
  const started = deps.now();
  const ctx = createContext({ record, options, serverConsole, bridge: where.bridge, deps, signal });
  let bot = null;
  try {
    for (const command of plan.fixture) await ctx.step(`fixture: ${command}`, () => ctx.server.command(command));
    const session = { port: options.port, account: options.account, bridge: where.bridge, home: where.home, signal };
    bot = await ctx.step(backend.startStep, () =>
      options.backend === 'fabric'
        ? deps.startFabricClient({ ...session, gameDir: where.client, log: where.clientLog })
        : deps.startBot(session),
    );
    for (const command of plan.prepare) await ctx.step(`prepare: ${command}`, () => ctx.server.command(command));
    await ctx.step('wait for bridge and server to agree on start position and inventory', () =>
      // Software-rendered Fabric clients load teleported chunks more slowly than the bot.
      settle(ctx, plan, options.backend === 'fabric' ? 60_000 : 15_000),
    );
    await scenario.run(ctx, plan);
    const failed = record.checks.filter((check) => !check.pass);
    record.status = failed.length || !record.checks.length ? 'fail' : 'pass';
    record.reason = failed.length
      ? `Failed checks: ${failed.map((check) => check.name).join('; ')}`
      : record.checks.length
        ? null
        : 'No checks ran.';
  } catch (error) {
    record.status = 'fail';
    record.reason = signal.aborted ? `Interrupted: ${signal.reason?.message ?? 'aborted'}` : error.message;
    if (error.botOutput) ctx.note('botOutput', error.botOutput);
    if (error instanceof ShutdownError)
      record.cleanup.push({ command: backend.stopStep, ok: false, error: error.message });
  } finally {
    // Cleanup ignores the run signal so an interrupted scenario still leaves no bot activity or fixtures behind.
    const clean = async (command, fn) => {
      try {
        record.cleanup.push({ command, ok: true, ...(await fn()) });
      } catch (error) {
        record.cleanup.push({ command, ok: false, error: error.message });
      }
    };
    if (bot)
      await clean('bridge: /v1/stop', async () => {
        await ctx.bridge.emergencyStop();
      });
    await clean('close bridge connections', () => ctx.close());
    const runCleanup = (command) =>
      clean(command, async () => {
        await serverConsole.command(command);
      });
    const keepFixture = options.keepServer && !signal.aborted;
    const deferred = [];
    for (const command of plan.cleanup) {
      if (keepFixture && !/^(?:clear|effect) /.test(command)) deferred.push(command);
      else await runCleanup(command);
    }
    if (bot) {
      await clean(backend.stopStep, async () => {
        const wait = new AbortController();
        const left = serverConsole
          .waitFor((message) => message === `${options.account} left the game`, {
            timeoutMs: 20_000,
            signal: wait.signal,
            label: `the ${backend.label} to leave`,
          })
          .catch(() => null);
        try {
          await bot.stop();
          return { leftGame: (await left) !== null };
        } finally {
          wait.abort();
        }
      });
    }
    if (signal.aborted) {
      for (const command of deferred) await runCleanup(command);
      record.status = 'fail';
      record.reason = `Interrupted: ${signal.reason?.message ?? 'aborted'}`;
    }
    const failures = record.cleanup.filter((entry) => !entry.ok);
    if (failures.length) {
      record.status = 'fail';
      record.reason = [record.reason, `Cleanup failed: ${failures.map(({ command }) => command).join(', ')}`]
        .filter(Boolean)
        .join(' | ');
    }
    if (record.status === 'fail' && bot?.output?.length) ctx.note('botOutput', bot.output.join('').trim().slice(-3000));
    record.durationMs = deps.now() - started;
  }
  return record;
}

export function summarize(results) {
  const count = (status) => results.scenarios.filter((scenario) => scenario.status === status).length;
  return { pass: count('pass'), fail: count('fail'), skipped: count('skipped'), error: results.error ?? null };
}

export function formatSummary(results, out) {
  const backend = BACKENDS[results.backend ?? 'bot'];
  const lines = [
    `${backend.title}: ${results.summary.pass} pass, ${results.summary.fail} fail, ${results.summary.skipped} skipped${results.error ? ` (run error: ${results.error})` : ''}`,
  ];
  for (const scenario of results.scenarios)
    lines.push(
      `  ${scenario.status.toUpperCase().padEnd(7)} ${scenario.id}${scenario.reason ? ` — ${scenario.reason}` : ''}`,
    );
  lines.push(`Results: ${out}`, `Server log: ${results.minecraft.serverLog}`);
  if (results.client) lines.push(`Client log: ${results.client.log}`);
  lines.push(backend.reviewNote);
  return lines.join('\n');
}

/** Keeps the server for inspection; console lines typed here are forwarded until Ctrl+C or end of input. */
async function keepAlive(server, signal) {
  console.error(
    'Server left running for inspection (session stopped). Type console commands here; Ctrl+C or end of input stops the server.',
  );
  const lines = createInterface({ input: process.stdin });
  lines.on('line', (line) => {
    if (line.trim()) server.console.write(`${line.trim()}\n`);
  });
  server.console.on('line', (message) => console.error(`[server] ${message}`));
  await new Promise((resolve) => {
    lines.once('close', resolve);
    signal.addEventListener('abort', resolve, { once: true });
    server.exited.then(resolve);
  });
  lines.close();
}

export const defaultDeps = {
  now: Date.now,
  sleep: (ms, signal) => delay(ms, undefined, { signal }),
  connect: (path) => FabricAdapter.connect(path),
  runAgent,
  preflight,
  portIsFree,
  sha256File,
  createRunDirectory,
  prepareServerDirectory,
  startServer,
  startBot,
  startFabricClient,
  prepareFabricGameDirectory,
  runCli: (args, options) => runCli(args, options),
  environment,
  writeResults: (path, value) => writePrivateJson(path, value),
  keepAlive,
  print: (text) => console.log(text),
  warn: (text) => console.error(text),
};

/** Runs the selected scenarios; always stops the bot and server and writes results unless preflight refuses. */
export async function runAcceptance(options, deps = defaultDeps, signal = new AbortController().signal) {
  const javaInfo = deps.preflight({ acceptEula: options.acceptEula, jar: options.jar, java: options.java });
  if (!(await deps.portIsFree(options.port)))
    throw new Error(`Port ${options.port} on 127.0.0.1 is in use. Stop the other server or pass --port.`);
  const where = paths(options, await deps.createRunDirectory());
  const backend = backendOf(options);
  const fabric = options.backend === 'fabric';
  const results = {
    schema: backend.schema,
    ...(fabric && { backend: 'fabric' }),
    startedAt: new Date(deps.now()).toISOString(),
    finishedAt: null,
    review: { reviewed: false, note: backend.reviewNote },
    scope: backend.scope,
    environment: { ...deps.environment({ java: options.java }), javaPreflight: javaInfo?.banner ?? null },
    minecraft: {
      expectedVersion: MINECRAFT_VERSION,
      serverVersion: null,
      serverLog: where.serverLog,
      serverLogSha256: null,
      jar: options.jar,
      jarSha256: null,
      seed: SEED,
      levelType: 'minecraft:flat',
    },
    options: {
      port: options.port,
      account: options.account,
      keepServer: options.keepServer,
      model: options.model,
      noThinking: !!options.noThinking,
      scenarios: options.scenarios.map((scenario) => scenario.id),
    },
    ...(fabric && { client: { log: where.clientLog, logSha256: null, gameDirectory: where.client } }),
    scenarios: [],
    summary: null,
    error: null,
  };
  let server = null;
  let inspecting = false;
  try {
    await deps.prepareServerDirectory({
      directory: where.server,
      jar: options.jar,
      port: options.port,
      seed: SEED,
      acceptEula: options.acceptEula,
    });
    results.minecraft.jarSha256 = await deps.sha256File(join(where.server, 'server.jar'));
    if (fabric) await deps.prepareFabricGameDirectory({ directory: where.client });
    server = deps.startServer({ directory: where.server, java: options.java });
    await server.console.ready({ signal });
    results.minecraft.serverVersion = server.console.version;
    if (server.console.version !== MINECRAFT_VERSION)
      throw new Error(
        `Expected Minecraft ${MINECRAFT_VERSION}, found ${server.console.version ?? 'an unknown version'}.`,
      );
    for (const command of WORLD_SETUP) await server.console.command(command, { signal });
    for (const scenario of options.scenarios) {
      deps.warn(`[${scenario.id}] ${scenario.title}`);
      const record = await runScenario(scenario, { options, deps, serverConsole: server.console, signal, where });
      results.scenarios.push(record);
      deps.warn(`[${scenario.id}] ${record.status}${record.reason ? `: ${record.reason}` : ''}`);
      signal.throwIfAborted();
      if (record.cleanup.some(({ command, ok }) => command === backend.stopStep && !ok))
        throw new Error(`Could not stop the ${backend.label} after ${scenario.id}. Remaining scenarios were skipped.`);
    }
    if (options.keepServer) {
      inspecting = true;
      await deps.keepAlive(server, signal);
    }
  } catch (error) {
    results.error = signal.aborted ? `Interrupted: ${signal.reason?.message ?? 'aborted'}` : error.message;
    const remaining = options.scenarios.slice(results.scenarios.length);
    results.scenarios.push(...remaining.map((scenario) => scenarioRecord(scenario, results.error, options)));
  } finally {
    if (server) {
      try {
        await server.stop();
        results.minecraft.serverLogSha256 = await deps.sha256File(where.serverLog).catch((error) => {
          results.error ??= `Server log checksum failed: ${error.message}`;
          return null;
        });
      } catch (error) {
        results.error ??= `Server stop failed: ${error.message}`;
      }
    }
    if (fabric) results.client.logSha256 = await deps.sha256File(where.clientLog).catch(() => null);
    if (signal.aborted && !inspecting) results.error ??= `Interrupted: ${signal.reason?.message ?? 'aborted'}`;
    const { commit, dirty } = deps.environment({ java: options.java });
    results.environment.sourceAtFinish = { commit, dirty };
    results.finishedAt = new Date(deps.now()).toISOString();
    results.summary = summarize(results);
    await deps.writeResults(where.out, results);
    deps.print(formatSummary(results, where.out));
  }
  return results;
}

export async function main(argv = process.argv.slice(2), deps = defaultDeps) {
  let options;
  try {
    options = parseOptions(argv);
  } catch (error) {
    deps.warn(`Error: ${error.message}`);
    return 2;
  }
  if (options.help) {
    deps.print(USAGE);
    return 0;
  }
  if (options.dryRun) {
    const plan = buildPlan(options);
    deps.print(options.json ? JSON.stringify(plan, null, 2) : formatPlan(plan));
    return 0;
  }
  const controller = new AbortController();
  let interrupts = 0;
  const onSignal = () => {
    if (++interrupts > 1) {
      deps.warn('Second interrupt: exiting without waiting for cleanup.');
      process.exit(130);
    }
    deps.warn(
      `Interrupted: stopping the ${backendOf(options).label}, cleaning fixtures, and stopping the server (Ctrl+C again to force).`,
    );
    controller.abort(new Error('Interrupted by user.'));
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  try {
    const results = await runAcceptance(options, deps, controller.signal);
    return results.summary.fail || results.error || !results.summary.pass ? 1 : 0;
  } catch (error) {
    deps.warn(`Error: ${error.message}`);
    if (!/See docs\/DEVELOPMENT\.md/.test(error.message)) deps.warn(HELP);
    return 1;
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  process.exitCode = await main();
