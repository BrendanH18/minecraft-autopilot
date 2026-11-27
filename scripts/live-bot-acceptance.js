#!/usr/bin/env node
/**
 * Scripted live acceptance for the Mineflayer server bot (roadmap step 4). Starts the cached vanilla 1.21.1 server,
 * builds fixtures with console commands, drives the bot through the repo CLI and bridge client, verifies with
 * independent `data get` reads, and writes a JSON results file. Results need human review before they count.
 *
 * `--backend fabric` runs the same scenarios against the Fabric development client instead (a fresh `runClient`
 * per scenario, joined with quick play). That is a pre-check for the keyboard sessions; it uses the development
 * client, not the packaged jars, so its results are never evidence for a RELEASE.md box.
 *
 * `--backend fabric --packaged` runs them with the release archive's three jars instead: Fabric Loader in production
 * mode (Loom's `runProductionClient`) with only those jars in the client's mods folder. That catches remapping,
 * refmap, nested-jar and dependency-set problems the development client cannot, but it is still Loom's launcher on
 * Xvfb, not a normal launcher, so these results are pre-checks too.
 *
 * A `--model` run inside a Boat check (scripts/boat-check.sh exports MCA_BOAT_CHECK=1) uses a small model on the
 * sandbox's CPU. It finds prompt, parsing and tool-call bugs before the owner's session; its results are marked
 * `modelPrecheck`, and `acceptance review-bot` rejects them as real-model evidence.
 */
import { parseArgs } from 'node:util';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createInterface } from 'node:readline';
import { writePrivateJson } from '../src/config.js';
import { FabricAdapter } from '../src/fabric-adapter.js';
import { runAgent } from '../src/agent.js';
import { bridgeItemTotals, distance, itemTotals, sameTotals, toPosition } from './live-acceptance/nbt-parse.js';
import { fabricMcpScenario } from './live-acceptance/fabric-mcp-scenario.js';
import { fabricModelScenario } from './live-acceptance/fabric-model-scenario.js';
import { handoffScenario } from './live-acceptance/handoff-scenario.js';
import { scenarios as sharedScenarios, scenarioPlan } from './live-acceptance/scenarios.js';
import { takeoverIds, takeoverScenarios } from './live-acceptance/takeover-scenarios.js';
import { clickTarget, pressKey, startCli, startFakeModel, typeText } from './live-acceptance/takeover-tools.js';
import { startProxy } from './live-acceptance/proxy.js';
import {
  DEFAULT_ARCHIVE,
  PACKAGED_JARS,
  PACKAGED_MOD_IDS,
  PACKAGED_NESTED_IDS,
  archiveNameProblem,
  checkPackagedClient,
  preparePackagedMods,
} from './live-acceptance/packaged.js';
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
const fabricAgentScenarios = [fabricModelScenario, fabricMcpScenario];
const scenarios = [...sharedScenarios, ...fabricAgentScenarios, ...takeoverScenarios, handoffScenario];
const scenarioIds = scenarios.map((scenario) => scenario.id);
const runsOn = (scenario, backend) => !scenario.backends || scenario.backends.includes(backend);
const REVIEW_NOTE =
  'Machine-checked observations only. These results become acceptance evidence for RELEASE.md only after a person reviews them, including server.out.';
const MODEL_PRECHECK_NOTE =
  'Real-model pre-check: a small model on the CPU of a Boat sandbox. It finds prompt, parsing and tool-call bugs before the owner runs the real-model scenarios on the Mac; it is never evidence for a RELEASE.md box or a real-model gate.';
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
    releasePrefix: 'pre-check only (Fabric development client)',
  },
};
const PACKAGED_REVIEW_NOTE =
  "Fabric packaged-jar pre-check: the release archive's jars in Fabric Loader production mode, started by Loom's runProductionClient (the development toolchain's launcher) on Xvfb. These results find packaging bugs before the keyboard sessions; they are never evidence for a RELEASE.md box, which needs the packaged jars in a normal launcher.";
/** `--backend fabric --packaged`: the same Fabric scenarios on the release archive's jars, labelled as such. */
export const PACKAGED_FABRIC = {
  ...BACKENDS.fabric,
  title: 'Live Fabric acceptance (packaged jars, development launcher)',
  schema: 'minecraft-agent/live-fabric-packaged-acceptance/1',
  scope:
    "The release archive's three jars in Fabric Loader production mode, started by Loom's runProductionClient with quick play. Offline pre-checks only; normal-launcher and authenticated sessions are separate.",
  startStep: 'start a fresh Fabric client with the packaged jars via Gradle runProductionClient',
  reviewNote: PACKAGED_REVIEW_NOTE,
  releasePrefix: 'pre-check only (Fabric packaged jars, development launcher)',
};
const USAGE = `Usage: node scripts/live-bot-acceptance.js (--scenario <id> ... | --all | --fast | --takeover) [--accept-eula] [--server-jar <path>] [--dry-run [--json]]
  [--backend bot|fabric [--packaged [--archive <zip>]]] [--keep-server] [--port N] [--out <file>] [--account NAME] [--java <path>]
  [--model NAME [--ollama URL] [--no-thinking] [--model-timeout SECONDS]]
--model-timeout (default 120, as for mc-agent agent) bounds each model decision; a CPU-only model may need more.
--fast runs offline scenarios without the long-running ones (pit recovery, eat-timeout, eat-retreat-timeout)
  or the takeover scenarios.
--backend fabric starts a fresh Fabric development client per scenario instead of the bot (npm run acceptance:fabric);
  it needs a display (xvfb-run on a headless host) and the cached Minecraft assets, and is a pre-check, not release evidence.
--packaged (Fabric only) runs the client in Fabric Loader production mode with only the release archive's three jars
  in its mods folder, verified against the archive (default dist/${basename(DEFAULT_ARCHIVE)}; run npm run build:mod first,
  or pass --archive with ARCHIVE_SHA256SUMS and BUILD.json beside it). Each session checks latest.log for production
  mode, the mods ${PACKAGED_MOD_IDS.join(', ')} (and nested ${PACKAGED_NESTED_IDS.join(', ')}) and no mixin or linkage
  errors. Still a pre-check, not release evidence. Needs node scripts/gradle.js prepareProductionClient --allow-downloads once.
--takeover (Fabric only) runs the scripted Fabric checklist items: F8, menus, stop, cancel, expiry, death, dimension
  change and full inventory. They press keys with xdotool on the X display, so run them under Xvfb (Boat).
Scenarios: ${sharedScenarios.map(({ id }) => id).join(', ')}
Fabric agent scenarios: ${fabricAgentScenarios.map(({ id }) => id).join(', ')}
Fabric takeover scenarios: ${takeoverIds.join(', ')}
Packaged-only scenario: ${handoffScenario.id}`;

export function parseOptions(argv, env = process.env) {
  const { values } = parseArgs({
    args: argv,
    allowPositionals: false,
    options: {
      scenario: { type: 'string', multiple: true },
      all: { type: 'boolean' },
      fast: { type: 'boolean' },
      takeover: { type: 'boolean' },
      backend: { type: 'string' },
      packaged: { type: 'boolean' },
      archive: { type: 'string' },
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
      'model-timeout': { type: 'string' },
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
  const modelTimeout = values['model-timeout'] === undefined ? 120 : Number(values['model-timeout']);
  if (!Number.isInteger(modelTimeout) || modelTimeout < 1 || modelTimeout > 3600)
    throw new Error('--model-timeout must be a whole number of seconds from 1 to 3600.');
  if (values.json && !values['dry-run']) throw new Error('--json requires --dry-run.');
  if ([values.scenario, values.all, values.fast, values.takeover].filter(Boolean).length > 1)
    throw new Error('Choose only one of --scenario, --all, --fast, and --takeover.');
  if (values.takeover && backend !== 'fabric')
    throw new Error('--takeover runs only with --backend fabric (npm run acceptance:fabric).');
  if (values.packaged && backend !== 'fabric')
    throw new Error('--packaged runs only with --backend fabric (npm run acceptance:fabric).');
  if (values.archive !== undefined && !values.packaged) throw new Error('--archive requires --packaged.');
  const archive = values.packaged ? resolve(values.archive ?? DEFAULT_ARCHIVE) : null;
  const archiveProblem = archive && archiveNameProblem(archive);
  if (archiveProblem) throw new Error(archiveProblem);
  for (const id of values.scenario ?? []) {
    if (!scenarioIds.includes(id))
      throw new Error(`Unknown scenario ${JSON.stringify(id)}. Choose from: ${scenarioIds.join(', ')}.`);
    const scenario = scenarios.find((entry) => entry.id === id);
    if (!runsOn(scenario, backend)) throw new Error(`Scenario ${id} runs only with --backend fabric.`);
    if (scenario.packagedOnly && !values.packaged) throw new Error(`Scenario ${id} requires --packaged.`);
  }
  if (!values.help && !values.all && !values.fast && !values.takeover && !values.scenario && !values['dry-run'])
    throw new Error(`Choose --scenario <id> (repeatable), --all, --fast, or --takeover.\n${USAGE}`);
  const selected = scenarios.filter((scenario) => {
    if (!runsOn(scenario, backend) || (scenario.packagedOnly && !values.packaged)) return false;
    if (values.fast) return !scenario.longRunning && !scenario.requiresModel && !scenario.takeover;
    if (values.takeover) return !!scenario.takeover;
    return !values.scenario || values.scenario.includes(scenario.id);
  });
  return {
    help: !!values.help,
    dryRun: !!values['dry-run'],
    json: !!values.json,
    keepServer: !!values['keep-server'],
    acceptEula: !!values['accept-eula'],
    backend,
    packaged: !!values.packaged,
    archive,
    port,
    account,
    jar: resolve(values['server-jar'] ?? DEFAULT_JAR),
    java: basename(java) === java ? java : resolve(java),
    model: model ?? null,
    ollama: values.ollama ?? 'http://127.0.0.1:11434',
    noThinking: !!values['no-thinking'],
    modelTimeout,
    // A model run inside a Boat check is a CPU pre-check, whatever model it names.
    modelPrecheck: !!model && env.MCA_BOAT_CHECK === '1',
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
  // With --packaged, the archive's jars go in the client's own mods folder, where a launcher puts them.
  mods: join(directory, 'client', 'mods'),
  out: options.out ?? join(directory, 'results.json'),
});
const isPackaged = (options) => options.backend === 'fabric' && !!options.packaged;
const backendOf = (options) => (isPackaged(options) ? PACKAGED_FABRIC : BACKENDS[options.backend ?? 'bot']);

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
    ...(isPackaged(options) && {
      packaged: {
        archive: options.archive,
        modsDirectory: where.mods,
        jars: PACKAGED_JARS,
        verify: `Copy the three jars out of the archive into the mods folder (nothing else goes there) and check the archive and the copies against ARCHIVE_SHA256SUMS, BUILD.json and the bundle's SHA256SUMS before the server starts.`,
        smoke: `After each client joins: ${join(where.client, '.fabric', 'remappedJars')} exists (Fabric Loader production mode), latest.log lists ${PACKAGED_MOD_IDS.join(', ')} and the nested ${PACKAGED_NESTED_IDS.join(', ')}, and has no mixin, refmap or linkage error.`,
      },
    }),
    ...(options.backend === 'fabric'
      ? {
          clientCommand: `${basename(options.java) === options.java ? '' : `JAVA_HOME=${dirname(dirname(options.java))} `}MC_AGENT_HOME=${where.home} ${process.execPath} ${fabricClientArguments({ port: options.port, account: options.account, gameDir: where.client, packaged: isPackaged(options) }).join(' ')}`,
          clientLog: where.clientLog,
          reviewNote: backendOf(options).reviewNote,
          ...(options.scenarios.some((scenario) => scenario.proxy) && {
            proxy: `Scenarios marked [proxy] join through a pausable loopback TCP proxy (an ephemeral port forwarding to 127.0.0.1:${options.port}), so a scenario can hold the server's replies.`,
          }),
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
      ...(scenario.proxy && { proxy: true }),
      ...scenarioPlan(scenario, { bot: options.account }),
    })),
  };
}

/** Fabric runs and Boat model runs only pre-check a release box; the text says so wherever it appears. */
function releaseFor(options, scenario) {
  let release = scenario.release;
  if (options.modelPrecheck && scenario.requiresModel)
    release = release.map((text) => `pre-check only (small model on a Boat CPU): ${text}`);
  if (options.backend !== 'fabric') return release;
  return release.map((text) => `${backendOf(options).releasePrefix}: ${text}`);
}

export function formatPlan(plan) {
  const fabric = plan.backend === 'fabric';
  const backend = plan.packaged ? PACKAGED_FABRIC : BACKENDS[fabric ? 'fabric' : 'bot'];
  const lines = [
    `${backend.title} plan (dry run; nothing is started)`,
    `Server: ${plan.serverCommand}`,
    `Jar: ${plan.serverJar}`,
    `Server log: ${plan.serverLog}`,
    `Results: ${plan.resultsFile}`,
    `server.properties: ${plan.serverProperties.join(', ')}`,
    'World setup:',
    ...plan.worldSetup.map((command) => `  > ${command}`),
    ...(plan.packaged
      ? [
          `Packaged archive: ${plan.packaged.archive}`,
          `Mods folder: ${plan.packaged.modsDirectory} (${plan.packaged.jars.join(', ')})`,
          `  ${plan.packaged.verify}`,
          `Packaged smoke check: ${plan.packaged.smoke}`,
        ]
      : []),
    ...(fabric
      ? [
          `Fabric client (fresh per scenario): ${plan.clientCommand}`,
          `Client log: ${plan.clientLog}`,
          ...(plan.proxy ? [plan.proxy] : []),
          plan.reviewNote,
        ]
      : [`Bot (per scenario): ${plan.botCommand}`]),
  ];
  for (const scenario of plan.scenarios) {
    lines.push(
      '',
      `[${scenario.id}] ${scenario.title}${scenario.requiresModel ? ` (requires --model${scenario.willSkip ? '; will be skipped' : ''})` : ''}${fabric && scenario.proxy ? ' [proxy]' : ''}`,
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
export function createContext({ record, options, serverConsole, bridge, deps, signal, proxy = null }) {
  let actor = null,
    observer = null;
  const extra = new Set();
  const agentLog = [];
  const ctx = {
    options,
    bot: options.account,
    bridgePath: bridge,
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
      uuid: async () => serverConsole.entityData(options.account, 'UUID', { signal }),
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
    // A bridge client of the scenario's own (its lease stays visible to the scenario); closed with the context.
    async connect() {
      const adapter = await deps.connect(bridge);
      extra.add(adapter);
      return adapter;
    },
    cli: {
      run: (args) => deps.runCli(args, { bridge }),
      start: (args) => deps.startCli(args, { bridge }),
    },
    keys: {
      press: (key) => deps.pressKey(key),
      click: (target) => deps.clickTarget(target),
      type: (text) => deps.typeText(text),
    },
    // The pausable forwarder between the client and the server, for scenarios that join through it; else null.
    proxy,
    fakeModel: (decisions) => deps.startFakeModel(decisions),
    async agent({ goal, criteria, fetchImpl, model, adapter: given, maxSteps = 20 }) {
      await ctx.bridge.release();
      const adapter = given ?? (await deps.connect(bridge));
      try {
        return await deps.runAgent(adapter, goal, {
          model: model ?? 'scripted-acceptance-planner',
          ollamaUrl: options.ollama,
          fetchImpl,
          criteria,
          maxSteps,
          minutes: 10,
          modelTimeout: options.modelTimeout ?? 120,
          think: options.noThinking ? false : undefined,
          signal,
          log: (line) => {
            agentLog.push(String(line));
            ctx.note('agentLog', agentLog.slice(-60));
          },
        });
      } finally {
        if (!given) await adapter.close();
      }
    },
    async close() {
      const current = observer;
      observer = null;
      try {
        await ctx.bridge.release();
        for (const adapter of extra) await adapter.close().catch(() => {});
        extra.clear();
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

async function stopSession(session, serverConsole, account, label, timeoutMs = 20_000) {
  const wait = new AbortController();
  const left = serverConsole
    .waitFor((message) => message === `${account} left the game`, {
      timeoutMs,
      signal: wait.signal,
      label: `the ${label} to leave`,
    })
    .catch(() => null);
  try {
    await session.stop();
    return await left;
  } finally {
    wait.abort();
  }
}

/** Fixture → fresh bot or client session → prepare → run → stop job → cleanup → stop session. Cleanup always runs. */
export async function runScenario(scenario, { options, deps, serverConsole, signal, where, proxy = null }) {
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
  const proxied = scenario.proxy && options.backend === 'fabric' ? proxy : null;
  const ctx = createContext({ record, options, serverConsole, bridge: where.bridge, deps, signal, proxy: proxied });
  let session = null;
  let activeBackend = backend;
  const packaged = isPackaged(options);
  async function startSession(kind) {
    activeBackend = kind === 'fabric' ? backend : BACKENDS.bot;
    const joiningBot = kind === 'bot' && options.backend === 'fabric';
    const connection = {
      port: proxied?.port ?? options.port,
      account: options.account,
      bridge: joiningBot ? join(where.home, 'handoff-bot.json') : where.bridge,
      home: where.home,
      signal,
    };
    session = await ctx.step(activeBackend.startStep, () =>
      kind === 'fabric'
        ? deps.startFabricClient({
            ...connection,
            gameDir: where.client,
            log: where.clientLog,
            java: options.java,
            ...(packaged && { packaged: true }),
            ...(scenario.storageStepDelayTicks && { storageStepDelayTicks: scenario.storageStepDelayTicks }),
          })
        : deps.startBot(connection),
    );
    if (packaged && kind === 'fabric') {
      // Every session proves it ran the packaged jars in production mode; a scenario on anything else means nothing.
      const smoke = await ctx.step(
        'packaged-smoke: production mode, the archive mods, no mixin or linkage errors',
        async () => {
          const report = await deps.checkPackagedClient({ gameDir: where.client });
          ctx.note('packagedSmoke', report);
          if (!report.pass) throw new Error(`Packaged smoke check failed: ${report.problems.join('; ')}`);
          return report;
        },
      );
      ctx.check('packaged-smoke', smoke.pass, {
        loaderVersion: smoke.loaderVersion,
        mods: smoke.mods,
        remappedJars: smoke.remappedJars,
      });
    }
  }
  async function switchSession(kind) {
    await ctx.close();
    await ctx.step(`confirm the ${activeBackend.label} left before the next join`, async () => {
      // Allow the full Fabric shutdown escalation (35 s), plus time for the server to notice the disconnect.
      const left = await stopSession(session, serverConsole, options.account, activeBackend.label, 55_000);
      session = null;
      const roster = await ctx.server.command('list');
      if (!left || !/^There are 0 of a max of \d+ players online: ?$/.test(roster))
        throw new Error(
          `Expected the ${activeBackend.label} departure and an empty roster, got ${left ?? 'no departure'} and "${roster}".`,
        );
      return { left, roster };
    });
    signal.throwIfAborted();
    await startSession(kind);
  }
  try {
    for (const command of plan.fixture) await ctx.step(`fixture: ${command}`, () => ctx.server.command(command));
    await startSession(options.backend ?? 'bot');
    for (const command of plan.prepare) await ctx.step(`prepare: ${command}`, () => ctx.server.command(command));
    await ctx.step('wait for bridge and server to agree on start position and inventory', () =>
      // Software-rendered Fabric clients load teleported chunks more slowly than the bot.
      settle(ctx, plan, options.backend === 'fabric' ? 60_000 : 15_000),
    );
    // The packaged smoke check doesn't count: the scenario itself must check something.
    const before = record.checks.length;
    await scenario.run(ctx, plan, switchSession);
    const failed = record.checks.filter((check) => !check.pass);
    const ran = record.checks.length > before;
    record.status = failed.length || !ran ? 'fail' : 'pass';
    record.reason = failed.length
      ? `Failed checks: ${failed.map((check) => check.name).join('; ')}`
      : ran
        ? null
        : 'No checks ran.';
  } catch (error) {
    record.status = 'fail';
    record.reason = signal.aborted ? `Interrupted: ${signal.reason?.message ?? 'aborted'}` : error.message;
    if (error.botOutput) ctx.note('botOutput', error.botOutput);
    if (error instanceof ShutdownError)
      record.cleanup.push({ command: activeBackend.stopStep, ok: false, error: error.message });
  } finally {
    // Cleanup ignores the run signal so an interrupted scenario still leaves no bot activity or fixtures behind.
    proxied?.resume();
    const clean = async (command, fn) => {
      const begun = deps.now();
      try {
        record.cleanup.push({ command, ok: true, ...(await fn()), durationMs: deps.now() - begun });
      } catch (error) {
        record.cleanup.push({ command, ok: false, error: error.message, durationMs: deps.now() - begun });
      }
    };
    if (session && activeBackend === backend)
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
    if (session) {
      await clean(activeBackend.stopStep, async () => {
        const left = await stopSession(session, serverConsole, options.account, activeBackend.label);
        return { leftGame: left !== null };
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
    if (record.status === 'fail' && session?.output?.length)
      ctx.note('botOutput', session.output.join('').trim().slice(-3000));
    record.durationMs = deps.now() - started;
  }
  return record;
}

export function summarize(results) {
  const count = (status) => results.scenarios.filter((scenario) => scenario.status === status).length;
  return { pass: count('pass'), fail: count('fail'), skipped: count('skipped'), error: results.error ?? null };
}

export function formatSummary(results, out) {
  const backend = results.packaged ? PACKAGED_FABRIC : BACKENDS[results.backend ?? 'bot'];
  const lines = [
    `${backend.title}: ${results.summary.pass} pass, ${results.summary.fail} fail, ${results.summary.skipped} skipped${results.error ? ` (run error: ${results.error})` : ''}`,
  ];
  for (const scenario of results.scenarios)
    lines.push(
      `  ${scenario.status.toUpperCase().padEnd(7)} ${scenario.id}${scenario.reason ? ` — ${scenario.reason}` : ''}`,
    );
  lines.push(`Results: ${out}`, `Server log: ${results.minecraft.serverLog}`);
  if (results.client) lines.push(`Client log: ${results.client.log}`);
  if (results.packaged) {
    const { archive, archiveSha256, smoke, warnings } = results.packaged;
    lines.push(`Packaged archive: ${archive}${archiveSha256 ? ` (sha256 ${archiveSha256})` : ' (not verified)'}`);
    if (smoke)
      lines.push(
        `Packaged smoke: Fabric Loader ${smoke.loaderVersion ?? 'unknown'}, ${PACKAGED_MOD_IDS.map((id) => `${id} ${smoke.mods?.[id] ?? 'missing'}`).join(', ')}`,
      );
    for (const warning of warnings ?? []) lines.push(`Packaged warning: ${warning}`);
  }
  lines.push(backend.reviewNote);
  if (results.modelPrecheck) lines.push(results.modelPrecheck.note);
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
  preparePackagedMods: (options) => preparePackagedMods(options),
  checkPackagedClient: (options) => checkPackagedClient(options),
  runCli: (args, options) => runCli(args, options),
  startCli,
  pressKey,
  clickTarget,
  typeText,
  startFakeModel,
  startProxy,
  environment,
  writeResults: (path, value) => writePrivateJson(path, value),
  keepAlive,
  print: (text) => console.log(text),
  warn: (text) => console.error(text),
};

/** Runs the selected scenarios; always stops the bot and server and writes results unless preflight refuses. */
export async function runAcceptance(options, deps = defaultDeps, signal = new AbortController().signal) {
  const packaged = isPackaged(options);
  const javaInfo = deps.preflight({
    acceptEula: options.acceptEula,
    jar: options.jar,
    java: options.java,
    ...(packaged && { archive: options.archive }),
  });
  if (!(await deps.portIsFree(options.port)))
    throw new Error(`Port ${options.port} on 127.0.0.1 is in use. Stop the other server or pass --port.`);
  const where = paths(options, await deps.createRunDirectory());
  const backend = backendOf(options);
  const fabric = options.backend === 'fabric';
  const results = {
    schema: backend.schema,
    ...(fabric && { backend: 'fabric' }),
    // What the packaged run loaded: filled in once the jars are copied and checked, before the server starts.
    ...(packaged && {
      packaged: {
        archive: options.archive,
        archiveSha256: null,
        build: null,
        modsDirectory: where.mods,
        jars: [],
        warnings: [],
        smoke: null,
      },
    }),
    startedAt: new Date(deps.now()).toISOString(),
    finishedAt: null,
    review: { reviewed: false, note: options.modelPrecheck ? MODEL_PRECHECK_NOTE : backend.reviewNote },
    // Never real-model evidence: acceptance review-bot rejects any file that carries it.
    ...(options.modelPrecheck && { modelPrecheck: { host: 'boat', note: MODEL_PRECHECK_NOTE } }),
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
      modelTimeout: options.modelTimeout ?? 120,
      scenarios: options.scenarios.map((scenario) => scenario.id),
    },
    ...(fabric && { client: { log: where.clientLog, logSha256: null, gameDirectory: where.client } }),
    scenarios: [],
    // Wall time of each run phase; each scenario's steps and cleanup entries carry their own durationMs.
    timings: { serverStartMs: null, worldSetupMs: null, scenariosMs: null, serverStopMs: null, totalMs: null },
    summary: null,
    error: null,
  };
  const runStarted = deps.now();
  // A phase that fails or is interrupted still records how long it ran, so a stalled run shows where it stalled.
  let phase = null;
  const begin = (name) => {
    phase = { name, since: deps.now() };
  };
  const end = () => {
    if (phase) results.timings[phase.name] = deps.now() - phase.since;
    phase = null;
  };
  let server = null;
  let proxy = null;
  let inspecting = false;
  try {
    begin('serverStartMs');
    await deps.prepareServerDirectory({
      directory: where.server,
      jar: options.jar,
      port: options.port,
      seed: SEED,
      acceptEula: options.acceptEula,
    });
    results.minecraft.jarSha256 = await deps.sha256File(join(where.server, 'server.jar'));
    if (fabric) await deps.prepareFabricGameDirectory({ directory: where.client });
    if (packaged) {
      Object.assign(
        results.packaged,
        await deps.preparePackagedMods({ archive: options.archive, modsDir: where.mods }),
      );
      for (const warning of results.packaged.warnings) deps.warn(`Packaged archive: ${warning}`);
    }
    server = deps.startServer({ directory: where.server, java: options.java });
    await server.console.ready({ signal });
    results.minecraft.serverVersion = server.console.version;
    if (server.console.version !== MINECRAFT_VERSION)
      throw new Error(
        `Expected Minecraft ${MINECRAFT_VERSION}, found ${server.console.version ?? 'an unknown version'}.`,
      );
    end();
    begin('worldSetupMs');
    for (const command of WORLD_SETUP) await server.console.command(command, { signal });
    // One forwarder for the run: scenarios marked `proxy` join through it so they can hold the server's replies.
    if (fabric && options.scenarios.some((scenario) => scenario.proxy)) {
      proxy = await deps.startProxy({ port: options.port });
      results.proxy = { port: proxy.port, target: options.port };
    }
    end();
    begin('scenariosMs');
    for (const scenario of options.scenarios) {
      deps.warn(`[${scenario.id}] ${scenario.title}`);
      const record = await runScenario(scenario, {
        options,
        deps,
        serverConsole: server.console,
        signal,
        where,
        proxy,
      });
      results.scenarios.push(record);
      if (packaged) results.packaged.smoke ??= record.observations.packagedSmoke ?? null;
      deps.warn(`[${scenario.id}] ${record.status}${record.reason ? `: ${record.reason}` : ''}`);
      signal.throwIfAborted();
      const failedStop = [backend, BACKENDS.bot].find(({ stopStep }) =>
        record.cleanup.some(({ command, ok }) => command === stopStep && !ok),
      );
      if (failedStop)
        throw new Error(
          `Could not stop the ${failedStop.label} after ${scenario.id}. Remaining scenarios were skipped.`,
        );
    }
    end();
    if (options.keepServer) {
      inspecting = true;
      await deps.keepAlive(server, signal);
    }
  } catch (error) {
    end();
    results.error = signal.aborted ? `Interrupted: ${signal.reason?.message ?? 'aborted'}` : error.message;
    const remaining = options.scenarios.slice(results.scenarios.length);
    results.scenarios.push(...remaining.map((scenario) => scenarioRecord(scenario, results.error, options)));
  } finally {
    await proxy?.close().catch(() => {});
    if (server) {
      begin('serverStopMs');
      try {
        await server.stop();
        end();
        results.minecraft.serverLogSha256 = await deps.sha256File(where.serverLog).catch((error) => {
          results.error ??= `Server log checksum failed: ${error.message}`;
          return null;
        });
      } catch (error) {
        end();
        results.error ??= `Server stop failed: ${error.message}`;
      }
    }
    if (fabric) results.client.logSha256 = await deps.sha256File(where.clientLog).catch(() => null);
    if (signal.aborted && !inspecting) results.error ??= `Interrupted: ${signal.reason?.message ?? 'aborted'}`;
    const { commit, dirty } = deps.environment({ java: options.java });
    results.environment.sourceAtFinish = { commit, dirty };
    results.finishedAt = new Date(deps.now()).toISOString();
    results.timings.totalMs = deps.now() - runStarted;
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
