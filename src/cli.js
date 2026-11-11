#!/usr/bin/env node
import { Command, Option, InvalidArgumentError } from 'commander';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FabricAdapter } from './fabric-adapter.js';
import { bridgeFile, dataDirectory } from './config.js';
import { attachBridge, cleanupRuntime, assertBridgeNotRunning } from './runtime.js';
import { Harness } from './harness.js';
import { startBridge } from './bridge-server.js';
import { DemoDriver } from './demo-driver.js';
import { parseCollectionCriterion, parseDepositCriterion, parseInventoryCriterion, parseDestinationCriterion } from './objective.js';
import { positionSchema, normalizeAction } from './protocol.js';
import { inventoryView, nearbyView, homeView, storageView, distanceTo, playerPosition, healthView, itemName } from './cli-views.js';

const program = new Command();
program.name('mc-agent').description('Let a local agent play your Minecraft Java character.').version('0.1.0', '-V, --cli-version')
  .option('--bridge <file>', 'bridge discovery file', bridgeFile).option('--json', 'print machine-readable results');

const abortController = new AbortController();
let activeAdapter;
let activeBridge;
let activeMcp;
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  abortController.abort(new Error('Stopped by user.'));
  await activeAdapter?.close();
  await activeBridge?.close();
  await activeMcp?.close();
}
process.once('SIGINT', () => { shutdown().catch(console.error); });
process.once('SIGTERM', () => { shutdown().catch(console.error); });

function number(value) {
  const parsed = Number(value);
  if (value.trim() === '' || !Number.isFinite(parsed)) throw new InvalidArgumentError('Must be a finite number.');
  return parsed;
}
function positiveInteger(value) {
  const parsed = number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new InvalidArgumentError('Must be a positive integer.');
  return parsed;
}
function positiveNumber(value) {
  const parsed = number(value);
  if (parsed <= 0) throw new InvalidArgumentError('Must be greater than zero.');
  return parsed;
}
function print(value) { console.log(JSON.stringify(value, null, 2)); }
function log(value) { if (!program.opts().json) console.error(value); }
async function connect() { activeAdapter = await FabricAdapter.connect(program.opts().bridge); return activeAdapter; }
async function perform(action) {
  const adapter = await connect();
  try {
    const result = await adapter.execute(action, { signal: abortController.signal, onProgress: job => log(job.message) });
    print(result);
  } finally { await adapter.close(); }
}

program.command('observe').alias('status').description('Inspect the current player without taking control.')
  .action(async () => print(await (await connect()).observe()));
program.command('attach').description('Remember the discovery file for a Minecraft profile; credentials stay in that profile.')
  .argument('<file>', 'path to the profile’s config/minecraft-agent/bridge.json')
  .action(async path => print(await attachBridge(path)));
program.command('clean').description('Remove stopped-session files from the project; preserve sign-in tokens and worlds by default.')
  .option('--dry-run', 'list files without removing them')
  .option('--include-auth', 'also remove cached Microsoft sign-in tokens')
  .option('--include-homes', 'also remove saved home waypoints')
  .option('--caches', 'also remove this project’s downloaded tools and build caches')
  .action(async options => print(await cleanupRuntime(options)));
program.command('set-home').description('Save your current position as home for this world and dimension.').action(() => perform({ type: 'set_home' }));
program.command('home').description('Walk to the saved home.').action(() => perform({ type: 'home' }));
program.command('goto').description('Navigate to a coordinate without placing or breaking blocks.')
  .argument('<x>', 'X coordinate', number).argument('<y>', 'Y coordinate', number).argument('<z>', 'Z coordinate', number)
  .action((x, y, z) => perform({ type: 'goto', x, y, z }));
program.command('collect').description('Collect additional logs, dirt, sand, or cobblestone (up to 64).')
  .argument('<block>', 'Minecraft block name').argument('<count>', 'additional item count', positiveInteger)
  .action((block, count) => perform({ type: 'collect', block, count }));
program.command('eat').description('Eat supported food from inventory.').action(() => perform({ type: 'eat' }));
program.command('deposit').description('Store an item in the nearest chest or barrel within 16 blocks (server bot and demo).')
  .argument('<item>', 'Minecraft item name').argument('[count]', 'items to store; all when omitted', positiveInteger)
  .action((item, count) => perform({ type: 'deposit', item, ...(count !== undefined && { count }) }));
async function view(select) {
  const adapter = await connect();
  try { print(select(await adapter.observe())); }
  finally { await adapter.close(); }
}
program.command('inventory').description('Show combined item counts and occupied inventory slots without taking control.')
  .option('--item <name>', 'only show this item', itemName)
  .action(options => view(state => inventoryView(state, options)));
program.command('blocks').description('List observed loaded blocks nearest first; this is a partial observation.')
  .option('--name <name>', 'only show this block', itemName)
  .option('--radius <blocks>', 'maximum distance from the player', positiveNumber)
  .option('--limit <n>', 'maximum results', positiveInteger, 20)
  .action(options => view(state => nearbyView(state, 'blocks', options)));
program.command('threats').description('List observed hostile entities nearest first; absence does not prove safety.')
  .option('--radius <blocks>', 'maximum distance from the player', positiveNumber)
  .option('--limit <n>', 'maximum results', positiveInteger, 20)
  .action(options => view(state => nearbyView(state, 'threats', options)));
program.command('home-info').description('Show the saved home and its distance without taking control.')
  .action(() => view(homeView));
program.command('storage').description('Show nearby storage and last observed contents without opening containers.')
  .option('--radius <blocks>', 'maximum distance from the player', positiveNumber)
  .option('--limit <n>', 'maximum results', positiveInteger, 20)
  .action(options => view(state => storageView(state, options)));
program.command('distance').description('Measure straight-line and horizontal distance to a coordinate without moving.')
  .argument('<x>', 'X coordinate', number).argument('<y>', 'Y coordinate', number).argument('<z>', 'Z coordinate', number)
  .action((x, y, z) => {
    const target = positionSchema.parse({ x, y, z });
    return view(state => distanceTo(state, target));
  });
program.command('position').description('Show current coordinates and dimension without taking control.')
  .action(() => view(state => ({ position: playerPosition(state), dimension: state.player.dimension })));
program.command('health').description('Show health, hunger, and survival status without taking control.')
  .action(() => view(healthView));
program.command('inspect-storage').description('Open known storage to refresh observed contents (server bot and demo); takes control.')
  .action(() => perform({ type: 'inspect_storage' }));
program.command('wait').description('Stay under agent control for 1–3600 seconds with local survival behavior.')
  .argument('<seconds>', 'duration in seconds', positiveNumber)
  .action(seconds => perform(normalizeAction({ type: 'wait', seconds })));
program.command('guard').description('Stay under agent control with local eating and low-health retreat behavior.')
  .option('--seconds <n>', 'duration, between 1 and 3600 seconds', positiveInteger, 300)
  .action(async options => {
    if (options.seconds > 3600) throw new Error('Guard duration must be at most 3600 seconds.');
    const adapter = await connect();
    const until = Date.now() + options.seconds * 1000;
    try {
      await adapter.acquire();
      while (Date.now() < until) {
        abortController.signal.throwIfAborted();
        if ((await adapter.observe()).mode !== 'agent' || adapter.leaseError) throw new Error('Control returned to the player.');
        try { await adapter.execute({ type: 'wait', seconds: Math.max(1, Math.min(60, (until - Date.now()) / 1000)) }, { signal: abortController.signal, onProgress: job => log(job.message) }); }
        catch (error) {
          if (abortController.signal.aborted || adapter.leaseError || (await adapter.observe()).mode !== 'agent') throw error;
          log(error.message);
          const state = await adapter.observe();
          if (state.player.health <= 8) throw new Error('Health remains low after survival response. Take control and check your shelter.');
        }
      }
      print({ status: 'completed', message: 'Guard duration finished.' });
    } finally { await adapter.close(); }
  });
program.command('stop').description('Cancel all agent actions and return control, including another CLI session.')
  .action(async () => print(await (await connect()).emergencyStop()));

program.command('agent').description('Run a bounded natural-language task using a local Ollama model.')
  .argument('<goal>', 'task for the agent').requiredOption('--model <name>', 'installed Ollama model name')
  .option('--ollama <url>', 'local Ollama URL', 'http://127.0.0.1:11434')
  .option('--steps <n>', 'maximum model decisions', positiveInteger, 30)
  .option('--minutes <n>', 'maximum runtime', positiveInteger, 15)
  .option('--verify-collect <block:count>', 'verify additional collected items, for example oak_log:8', parseCollectionCriterion)
  .option('--verify-deposit <item:count>', 'verify additional items stored in nearby containers, for example oak_log:8', parseDepositCriterion)
  .option('--verify-home', 'verify return within two blocks of the home saved before the task')
  .option('--verify-health <n>', 'minimum final health, from 1 to 20', number)
  .option('--verify-hunger <n>', 'minimum final hunger, from 0 to 20', number)
  .option('--verify-at <x,y,z[,radius]>', 'verify a destination; radius defaults to 2', parseDestinationCriterion)
  .option('--verify-inventory <item:count>', 'verify total items held at completion', parseInventoryCriterion)
  .option('--verify-max-threats <n>', 'maximum observed threats at completion', number)
  .option('--verify-home-radius <n>', 'home verification radius from 0 to 64; requires --verify-home', number)
  .option('--model-timeout <seconds>', 'maximum seconds to wait for each model decision', positiveInteger, 120)
  .option('--no-thinking', 'ask thinking models to answer without reasoning first (much faster)')
  .action(async (goal, options) => {
    if (options.steps > 1000 || options.minutes > 1440 || options.modelTimeout > 3600) throw new Error('Limits must be <= 1000 steps, <= 1440 minutes, and a model timeout <= 3600 seconds.');
    const { runAgent } = await import('./agent.js');
    const adapter = await connect();
    try {
      const result = await runAgent(adapter, goal, { model: options.model, ollamaUrl: options.ollama, maxSteps: options.steps, minutes: options.minutes,
        modelTimeout: options.modelTimeout, think: options.thinking ? undefined : false, criteria: { collect: options.verifyCollect, deposit: options.verifyDeposit, returnHome: options.verifyHome, minHealth: options.verifyHealth, minHunger: options.verifyHunger, destination: options.verifyAt, inventory: options.verifyInventory, maxThreats: options.verifyMaxThreats, homeRadius: options.verifyHomeRadius }, signal: abortController.signal, log });
      print(result);
      if (result.status === 'criteria_unmet' || result.status === 'step_limit' && result.verification) process.exitCode = 2;
    }
    finally { await adapter.close(); }
  });

program.command('mcp').description('Expose Minecraft tools over MCP stdio for a local agent.')
  .action(async () => {
    const { serveMcp } = await import('./mcp.js');
    const server = activeMcp = await serveMcp(await connect());
    process.stdin.once('end', () => shutdown().then(() => server.close()).catch(console.error));
  });

program.command('demo').description('Run a simulated player bridge; no Minecraft or model needed.')
  .option('--smoke', 'run a short end-to-end demonstration and exit')
  .action(async options => {
    let directory;
    if (options.smoke) {
      const { mkdir } = await import('node:fs/promises');
      await mkdir(join(dataDirectory, 'tmp'), { recursive: true });
      directory = await mkdtemp(join(dataDirectory, 'tmp', 'demo-'));
    }
    const path = directory ? join(directory, 'bridge.json') : program.opts().bridge;
    activeBridge = await startBridge(new Harness(new DemoDriver()), { discoveryPath: path });
    log('DEMO SIMULATION — no real Minecraft world is connected.');
    if (!options.smoke) { log(`Bridge ready. In a second terminal: npm start -- observe\nDiscovery file: ${path}\nCtrl+C stops the demo.`); return; }
    const adapter = activeAdapter = await FabricAdapter.connect(path);
    try {
      await adapter.execute({ type: 'set_home' });
      await adapter.execute({ type: 'goto', x: 5, y: 64, z: 5 });
      await adapter.execute({ type: 'collect', block: 'oak_log', count: 8 });
      await adapter.execute({ type: 'deposit', item: 'oak_log', count: 8 });
      await adapter.execute({ type: 'eat' });
      await adapter.execute({ type: 'home' });
      await adapter.release();
      print({ demonstration: 'simulation', ...(await adapter.observe()) });
    } finally { await adapter.close(); await activeBridge.close(); await rm(directory, { recursive: true, force: true }); }
  });

program.command('server').description('Connect a standalone bot to a Java server as your account; disconnect your game client first.')
  .requiredOption('--host <address>', 'Minecraft server hostname')
  .option('--port <n>', 'server port', positiveInteger, 25565)
  .requiredOption('--account <identifier>', 'Microsoft account identifier, or username for an offline development server')
  .addOption(new Option('--auth <mode>', 'authentication mode').choices(['microsoft', 'offline']).default('microsoft'))
  .option('--version <version>', 'Minecraft server version', '1.21.1')
  .action(async options => {
    if (options.port > 65535) throw new Error('Port must be <= 65535.');
    await assertBridgeNotRunning(program.opts().bridge);
    const { MineflayerDriver } = await import('./mineflayer-driver.js');
    log(`Connecting to ${options.host}:${options.port}. Disconnect your Minecraft client before using the same account.`);
    const driver = await MineflayerDriver.connect(options, { log, signal: abortController.signal });
    if (abortController.signal.aborted) { await driver.close(); return; }
    try { activeBridge = await startBridge(new Harness(driver), { discoveryPath: program.opts().bridge }); }
    catch (error) { await driver.close(); throw error; }
    log(`Connected as ${driver.bot.username}. Bridge ready. Use commands from a second terminal. Ctrl+C disconnects the bot.`);
  });

program.command('doctor').description('Check local prerequisites without connecting to Minecraft.')
  .action(async () => {
    const { inspectPrerequisites } = await import('./doctor.js');
    print(await inspectPrerequisites({ discoveryPath: program.opts().bridge }));
  });

try { await program.parseAsync(); }
catch (error) {
  console.error(program.opts().json ? JSON.stringify({ error: error.message }) : `Error: ${error.message}`);
  await shutdown();
  process.exitCode = 1;
}
