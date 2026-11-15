#!/usr/bin/env node
/**
 * Scripted live acceptance for the Mineflayer server bot (roadmap step 4). Starts the cached vanilla 1.21.1 server,
 * builds fixtures with console commands, drives the bot through the repo CLI and bridge client, verifies with
 * independent `data get` reads, and writes a JSON results file. Results need human review before they count.
 */
import { parseArgs } from 'node:util';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createInterface } from 'node:readline';
import { writePrivateJson } from '../src/config.js';
import { FabricAdapter } from '../src/fabric-adapter.js';
import { runAgent } from '../src/agent.js';
import { toPosition, distance, itemCount } from './live-acceptance/nbt-parse.js';
import { scenarios, scenarioIds, scenarioPlan, LOG } from './live-acceptance/scenarios.js';
import { DEFAULT_JAR, RUNTIME, MINECRAFT_VERSION, HELP, preflight, portIsFree, sha256File, serverProperties, prepareServerDirectory, startServer, startBot,
  botArguments, runCli, environment } from './live-acceptance/processes.js';

export const SEED = 'minecraft-agent-live-acceptance';
export const WORLD_SETUP = ['difficulty peaceful', 'gamerule doDaylightCycle false', 'gamerule doWeatherCycle false', 'gamerule doMobSpawning false',
  'gamerule doInsomnia false', 'gamerule doPatrolSpawning false', 'gamerule doTraderSpawning false', 'gamerule randomTickSpeed 0', 'gamerule doFireTick false',
  'gamerule mobGriefing false', 'gamerule spawnRadius 0', 'time set 1000', 'weather clear'];
const REVIEW_NOTE = 'Machine-checked observations only. These results become acceptance evidence for RELEASE.md only after a person reviews them, including server.out.';
const USAGE = `Usage: node scripts/live-bot-acceptance.js (--scenario <id> ... | --all) [--accept-eula] [--server-jar <path>] [--dry-run]
  [--keep-server] [--port N] [--out <file>] [--account NAME] [--java <path>] [--model NAME [--ollama URL] [--no-thinking]]
Scenarios: ${scenarioIds.join(', ')}`;

export function parseOptions(argv) {
  const { values } = parseArgs({ args: argv, allowPositionals: false, options: {
    scenario: { type: 'string', multiple: true }, all: { type: 'boolean' }, 'server-jar': { type: 'string' }, 'dry-run': { type: 'boolean' },
    'keep-server': { type: 'boolean' }, port: { type: 'string' }, out: { type: 'string' }, 'accept-eula': { type: 'boolean' }, account: { type: 'string' },
    java: { type: 'string' }, model: { type: 'string' }, ollama: { type: 'string' }, 'no-thinking': { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
  } });
  const port = values.port === undefined ? 25566 : Number(values.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('--port must be an integer from 1024 to 65535.');
  const account = values.account ?? 'LiveBot';
  if (!/^[A-Za-z0-9_]{3,16}$/.test(account)) throw new Error('--account must be a 3–16 character offline username (letters, digits, _).');
  if (values.all && values.scenario) throw new Error('Use --scenario or --all, not both.');
  for (const id of values.scenario ?? []) if (!scenarioIds.includes(id)) throw new Error(`Unknown scenario ${JSON.stringify(id)}. Choose from: ${scenarioIds.join(', ')}.`);
  if (!values.help && !values.all && !values.scenario && !values['dry-run']) throw new Error(`Choose --scenario <id> (repeatable) or --all.\n${USAGE}`);
  return {
    help: !!values.help, dryRun: !!values['dry-run'], keepServer: !!values['keep-server'], acceptEula: !!values['accept-eula'], port, account,
    jar: resolve(values['server-jar'] ?? DEFAULT_JAR), java: values.java ?? 'java', model: values.model ?? null, ollama: values.ollama ?? 'http://127.0.0.1:11434',
    noThinking: !!values['no-thinking'], out: values.out ? resolve(values.out) : null,
    scenarios: values.scenario ? scenarios.filter(scenario => values.scenario.includes(scenario.id)) : scenarios,
  };
}

const paths = options => ({ runtime: RUNTIME, server: join(RUNTIME, 'server'), bridge: join(RUNTIME, 'bridge.json'), home: join(RUNTIME, 'agent-home'),
  out: options.out ?? join(RUNTIME, `results-${new Date().toISOString().replace(/[:.]/g, '-')}.json`) });

/** Everything the run would do, without starting anything. */
export function buildPlan(options) {
  const where = paths(options);
  return {
    serverDirectory: where.server, serverJar: options.jar, java: options.java, port: options.port,
    serverProperties: serverProperties({ port: options.port, seed: SEED }).trim().split('\n'),
    serverCommand: `${options.java} -Xmx2G -jar server.jar nogui   (cwd ${where.server}; console on stdin, readiness on "Done (")`,
    worldSetup: WORLD_SETUP,
    botCommand: `MC_AGENT_HOME=${where.home} ${process.execPath} ${botArguments({ port: options.port, account: options.account, bridge: where.bridge }).join(' ')}`,
    scenarios: options.scenarios.map(scenario => ({ id: scenario.id, title: scenario.title, release: scenario.release, requiresModel: !!scenario.requiresModel,
      willSkip: !!scenario.requiresModel && !options.model, ...scenarioPlan(scenario, { bot: options.account }) })),
  };
}

export function formatPlan(plan) {
  const lines = ['Live bot acceptance plan (dry run; nothing is started)', `Server: ${plan.serverCommand}`, `Jar: ${plan.serverJar}`,
    `server.properties: ${plan.serverProperties.join(', ')}`, 'World setup:', ...plan.worldSetup.map(command => `  > ${command}`), `Bot (per scenario): ${plan.botCommand}`];
  for (const scenario of plan.scenarios) {
    lines.push('', `[${scenario.id}] ${scenario.title}${scenario.requiresModel ? ` (requires --model${scenario.willSkip ? '; will be skipped' : ''})` : ''}`,
      ...scenario.release.map(text => `  maps to ${text}`), '  fixture:', ...scenario.fixture.map(command => `    > ${command}`),
      '  start the bot, then prepare:', ...scenario.prepare.map(command => `    > ${command}`), '  actions:', ...scenario.actions.map(text => `    - ${text}`),
      ...(scenario.during.length ? ['  console commands sent during the run:', ...scenario.during.map(command => `    > ${command}`)] : []),
      '  independent reads (before and after):', ...scenario.verify.map(command => `    > ${command}`), '  expected:', ...scenario.expect.map(text => `    - ${text}`),
      '  cleanup (also on failure):', ...scenario.cleanup.map(command => `    > ${command}`));
  }
  return lines.join('\n');
}

const compact = value => {
  if (value === undefined) return undefined;
  try { const text = JSON.stringify(value); return text.length <= 4000 ? JSON.parse(text) : `${text.slice(0, 4000)}…`; } catch { return String(value); }
};

/** The scenario-facing API; every method is backed by the injectable console/bridge/CLI. */
export function createContext({ record, options, serverConsole, bridge, deps, signal }) {
  let actor = null, observer = null;
  const agentLog = [];
  const ctx = {
    options, bot: options.account, signal, observations: record.observations,
    now: deps.now, sleep: ms => deps.sleep(ms, signal),
    async step(name, fn) {
      const entry = { name, status: 'running', startedAt: new Date(deps.now()).toISOString() };
      record.steps.push(entry);
      const started = deps.now();
      try { const value = await fn(); entry.status = 'ok'; entry.detail = compact(value); return value; }
      catch (error) { entry.status = 'failed'; entry.error = error.message; throw error; }
      finally { entry.durationMs = deps.now() - started; }
    },
    note(key, value) { record.observations[key] = compact(value); },
    check(name, pass, detail = {}) { record.checks.push({ name, pass: !!pass, ...compact(detail) }); },
    server: {
      command: command => serverConsole.command(command, { signal }),
      items: async ({ x, y, z }) => serverConsole.blockData(x, y, z, 'Items', { signal }),
      inventory: async () => serverConsole.entityData(options.account, 'Inventory', { signal }),
      position: async () => toPosition(await serverConsole.entityData(options.account, 'Pos', { signal })),
    },
    bridge: {
      async execute(action, extra = {}) { actor ??= await deps.connect(bridge); return actor.execute(action, { signal, ...extra }); },
      async cancel() { if (actor) await actor.cancel(); },
      async observe() { observer ??= await deps.connect(bridge); return observer.observe(); },
      async release() { const current = actor; actor = null; await current?.close(); },
      async emergencyStop() { observer ??= await deps.connect(bridge); return observer.emergencyStop(); },
    },
    cliStop: () => deps.runCli(['stop'], { bridge }),
    async agent({ goal, criteria, fetchImpl, model }) {
      await ctx.bridge.release();
      const adapter = await deps.connect(bridge);
      try {
        return await deps.runAgent(adapter, goal, { model: model ?? 'scripted-acceptance-planner', ollamaUrl: options.ollama, fetchImpl, criteria, maxSteps: 20, minutes: 10,
          think: options.noThinking ? false : undefined, signal, log: line => { agentLog.push(String(line)); ctx.note('agentLog', agentLog.slice(-60)); } });
      } finally { await adapter.close(); }
    },
    async close() { await ctx.bridge.release().catch(() => {}); const current = observer; observer = null; await current?.close().catch(() => {}); },
  };
  return ctx;
}

/** Waits until the bridge and server agree that the bot stands at the start with the given oak-log count. */
async function settle(ctx, start, timeoutMs = 15_000) {
  const deadline = ctx.now() + timeoutMs;
  let last;
  while (true) {
    const state = await ctx.bridge.observe();
    const server = await ctx.server.position();
    const held = itemCount(await ctx.server.inventory(), LOG);
    const bridgeHeld = (state.inventory || []).filter(item => item.name === LOG).reduce((total, item) => total + item.count, 0);
    last = { bridge: state.player?.position ?? null, server, held, bridgeHeld };
    if (state.player?.position && distance(state.player.position, start) <= 1 && distance(server, start) <= 1 && held === bridgeHeld && !state.job) return last;
    if (ctx.now() >= deadline) throw new Error(`The bot did not settle at the start: ${JSON.stringify(last)}`);
    await ctx.sleep(500);
  }
}

/** Fixture → fresh bot session → prepare → run → stop job → cleanup → stop bot. Cleanup always runs. */
export async function runScenario(scenario, { options, deps, serverConsole, signal, where }) {
  const record = { id: scenario.id, title: scenario.title, release: scenario.release, requiresModel: !!scenario.requiresModel, status: 'skipped', reason: null,
    startedAt: null, durationMs: 0, steps: [], observations: {}, checks: [], cleanup: [] };
  if (scenario.requiresModel && !options.model) { record.reason = 'Requires a real local model; pass --model NAME to run it.'; return record; }
  if (signal.aborted) { record.reason = 'Interrupted before this scenario started.'; return record; }
  const plan = scenarioPlan(scenario, { bot: options.account });
  record.startedAt = new Date(deps.now()).toISOString();
  if (scenario.requiresModel) record.observations.model = options.model;
  const started = deps.now();
  const ctx = createContext({ record, options, serverConsole, bridge: where.bridge, deps, signal });
  let bot = null;
  try {
    for (const command of plan.fixture) await ctx.step(`fixture: ${command}`, () => ctx.server.command(command));
    bot = await ctx.step('start a fresh bot session via the repo CLI', () => deps.startBot({ port: options.port, account: options.account, bridge: where.bridge, home: where.home, signal }));
    for (const command of plan.prepare) await ctx.step(`prepare: ${command}`, () => ctx.server.command(command));
    await ctx.step('wait for bridge and server to agree on start position and inventory', () => settle(ctx, plan.points.start));
    await scenario.run(ctx, plan);
    const failed = record.checks.filter(check => !check.pass);
    record.status = failed.length || !record.checks.length ? 'fail' : 'pass';
    record.reason = failed.length ? `Failed checks: ${failed.map(check => check.name).join('; ')}` : record.checks.length ? null : 'No checks ran.';
  } catch (error) {
    record.status = 'fail';
    record.reason = signal.aborted ? `Interrupted: ${signal.reason?.message ?? 'aborted'}` : error.message;
  } finally {
    // Cleanup ignores the run signal so an interrupted scenario still leaves no bot activity or fixtures behind.
    if (bot) await ctx.bridge.emergencyStop().then(() => record.cleanup.push({ command: 'bridge: /v1/stop', ok: true }),
      error => record.cleanup.push({ command: 'bridge: /v1/stop', ok: false, error: error.message }));
    await ctx.close();
    const cleanup = options.keepServer ? plan.cleanup.filter(command => /^(?:clear|effect) /.test(command)) : plan.cleanup;
    for (const command of cleanup) {
      try { await serverConsole.command(command); record.cleanup.push({ command, ok: true }); }
      catch (error) { record.cleanup.push({ command, ok: false, error: error.message }); }
    }
    if (bot) {
      const left = serverConsole.waitFor(message => message === `${options.account} left the game`, { timeoutMs: 20_000, label: 'the bot to leave' }).catch(() => null);
      await bot.stop();
      record.cleanup.push({ command: 'stop bot process', ok: true, leftGame: (await left) !== null });
    }
    record.durationMs = deps.now() - started;
  }
  return record;
}

export function summarize(results) {
  const count = status => results.scenarios.filter(scenario => scenario.status === status).length;
  return { pass: count('pass'), fail: count('fail'), skipped: count('skipped'), error: results.error ?? null };
}

export function formatSummary(results, out) {
  const lines = [`Live bot acceptance: ${results.summary.pass} pass, ${results.summary.fail} fail, ${results.summary.skipped} skipped${results.error ? ` (run error: ${results.error})` : ''}`];
  for (const scenario of results.scenarios) lines.push(`  ${scenario.status.toUpperCase().padEnd(7)} ${scenario.id}${scenario.reason ? ` — ${scenario.reason}` : ''}`);
  lines.push(`Results: ${out}`, REVIEW_NOTE);
  return lines.join('\n');
}

/** Keeps the server for inspection; console lines typed here are forwarded until Ctrl+C or end of input. */
async function keepAlive(server, signal) {
  console.error('Server left running for inspection (bot stopped). Type console commands here; Ctrl+C or end of input stops the server.');
  const lines = createInterface({ input: process.stdin });
  lines.on('line', line => { if (line.trim()) server.console.write(`${line.trim()}\n`); });
  server.console.on('line', message => console.error(`[server] ${message}`));
  await new Promise(resolve => { lines.once('close', resolve); signal.addEventListener('abort', resolve, { once: true }); server.exited.then(resolve); });
  lines.close();
}

export const defaultDeps = {
  now: Date.now, sleep: (ms, signal) => delay(ms, undefined, { signal }), connect: path => FabricAdapter.connect(path), runAgent,
  preflight, portIsFree, sha256File, prepareServerDirectory, startServer, startBot, runCli: (args, options) => runCli(args, options), environment,
  writeResults: (path, value) => writePrivateJson(path, value), keepAlive, print: text => console.log(text), warn: text => console.error(text),
};

/** Runs the selected scenarios; always stops the bot and server and writes results unless preflight refuses. */
export async function runAcceptance(options, deps = defaultDeps, signal = new AbortController().signal) {
  const where = paths(options);
  const javaInfo = deps.preflight({ acceptEula: options.acceptEula, jar: options.jar, java: options.java });
  if (!(await deps.portIsFree(options.port))) throw new Error(`Port ${options.port} on 127.0.0.1 is in use. Stop the other server or pass --port.`);
  const results = {
    schema: 'minecraft-agent/live-bot-acceptance/1', startedAt: new Date(deps.now()).toISOString(), finishedAt: null,
    review: { reviewed: false, note: REVIEW_NOTE }, scope: 'Mineflayer server bot only; does not cover Fabric or authenticated handoff.',
    environment: { ...deps.environment({ java: options.java }), javaPreflight: javaInfo?.banner ?? null },
    minecraft: { expectedVersion: MINECRAFT_VERSION, serverVersion: null, jar: options.jar, jarSha256: await deps.sha256File(options.jar), seed: SEED, levelType: 'minecraft:flat' },
    options: { port: options.port, account: options.account, keepServer: options.keepServer, model: options.model, scenarios: options.scenarios.map(scenario => scenario.id) },
    scenarios: [], summary: null, error: null,
  };
  let server = null;
  try {
    await deps.prepareServerDirectory({ directory: where.server, jar: options.jar, port: options.port, seed: SEED, acceptEula: options.acceptEula });
    server = deps.startServer({ directory: where.server, java: options.java });
    await server.console.ready({ signal });
    results.minecraft.serverVersion = server.console.version;
    if (server.console.version && server.console.version !== MINECRAFT_VERSION) throw new Error(`The jar is Minecraft ${server.console.version}; the bot targets ${MINECRAFT_VERSION}.`);
    for (const command of WORLD_SETUP) await server.console.command(command, { signal });
    for (const scenario of options.scenarios) {
      deps.warn(`[${scenario.id}] ${scenario.title}`);
      const record = await runScenario(scenario, { options, deps, serverConsole: server.console, signal, where });
      results.scenarios.push(record);
      deps.warn(`[${scenario.id}] ${record.status}${record.reason ? `: ${record.reason}` : ''}`);
    }
    if (options.keepServer && !signal.aborted) await deps.keepAlive(server, signal);
  } catch (error) {
    results.error = signal.aborted ? `Interrupted: ${signal.reason?.message ?? 'aborted'}` : error.message;
  } finally {
    if (server) await server.stop().catch(error => { results.error ??= `Server stop failed: ${error.message}`; });
    results.finishedAt = new Date(deps.now()).toISOString();
    results.summary = summarize(results);
    await deps.writeResults(where.out, results);
    deps.print(formatSummary(results, where.out));
  }
  return results;
}

export async function main(argv = process.argv.slice(2), deps = defaultDeps) {
  let options;
  try { options = parseOptions(argv); }
  catch (error) { deps.warn(`Error: ${error.message}`); return 2; }
  if (options.help) { deps.print(USAGE); return 0; }
  if (options.dryRun) { deps.print(formatPlan(buildPlan(options))); return 0; }
  const controller = new AbortController();
  let interrupts = 0;
  const onSignal = () => {
    if (++interrupts > 1) { deps.warn('Second interrupt: exiting without waiting for cleanup.'); process.exit(130); }
    deps.warn('Interrupted: stopping the bot, cleaning fixtures, and stopping the server (Ctrl+C again to force).');
    controller.abort(new Error('Interrupted by user.'));
  };
  process.on('SIGINT', onSignal); process.on('SIGTERM', onSignal);
  try {
    const results = await runAcceptance(options, deps, controller.signal);
    return results.summary.fail || results.error ? 1 : 0;
  } catch (error) {
    deps.warn(`Error: ${error.message}`);
    if (!/See docs\/DEVELOPMENT\.md/.test(error.message)) deps.warn(HELP);
    return 1;
  } finally { process.off('SIGINT', onSignal); process.off('SIGTERM', onSignal); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await main();
