#!/usr/bin/env node
import { Command, Option, InvalidArgumentError } from 'commander';
import { mkdtemp, rm } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FabricAdapter } from './fabric-adapter.js';
import { bridgeFile, dataDirectory } from './config.js';
import { attachBridge, cleanupRuntime, assertBridgeNotRunning } from './runtime.js';
import { Harness } from './harness.js';
import { startBridge } from './bridge-server.js';
import { DemoDriver, demoScenarios } from './demo-driver.js';
import { parseCollectionCriterion, parseDepositCriterion, parseInventoryCriterion, parseDestinationCriterion, parseMaxInventoryCriterion } from './objective.js';
import { positionSchema, normalizeAction } from './protocol.js';
import { inventoryView, nearbyView, homeView, storageView, distanceTo, playerPosition, healthView, itemName } from './cli-views.js';
import { summaryView, jobView, findItemView, storageTotalsView, nearestView, directionView, foodView, freeSlotsView, snapshotView, parseSnapshot, compareView } from './cli-views.js';
import { watchSample, busyReasons, riskView, censusView, slotsView, homeTarget, parseRoutePoints, routeView, diffSnapshotsView } from './cli-views.js';
import { waypointFile, waypointName, dimensionId, readWaypoints, writeWaypoints, addWaypoint, removeWaypoint, findWaypoint, assertSameDimension } from './waypoints.js';
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { registerSupplies } from './supplies.js';
import { registerSurvey } from './survey.js';
import { registerNavigation } from './navigation.js';
import { registerRoutineTools } from './routine-tools.js';
import { registerStockTools } from './stock-tools.js';
import { registerSceneTools } from './scene-tools.js';
import { registerGeometryTools } from './geometry-tools.js';
import { registerRoutineWorkbench } from './routine-workbench.js';
import { registerTimelineTools } from './timeline-tools.js';
import { registerTerrainTools } from './terrain-tools.js';
import { registerLogisticsTools } from './logistics-tools.js';
import { registerRoutineAudit } from './routine-audit.js';
import { registerExpeditionTools } from './expedition-tools.js';
import { registerBlueprintTools } from './blueprint-tools.js';
import { registerCheckpointTools } from './snapshot-checks.js';
import { registerRoutineCompose } from './routine-compose.js';
import { registerItineraryTools } from './itinerary-tools.js';
import { registerWorkareaTools } from './workarea-tools.js';
import { registerLedgerTools } from './ledger-tools.js';
import { registerDepotTools } from './depot-tools.js';
import { registerJournalTools } from './journal-tools.js';
import { registerDiagnoseTools } from './diagnose-tools.js';
import { registerRoutineCompare } from './routine-compare.js';
import { registerRoutineSelect } from './routine-select.js';
import { registerBearingTools } from './bearing-tools.js';
import { registerGridTools } from './grid-tools.js';
import { registerShapeTools } from './shape-tools.js';
import { registerEarthworksTools } from './earthworks-tools.js';
import { registerRailplanTools } from './railplan-tools.js';
import { registerLightplanTools } from './lightplan-tools.js';
import { registerPerimeterTools } from './perimeter-tools.js';
import { registerPackingTools } from './packing-tools.js';
import { registerProductionTools } from './production-tools.js';
import { registerFuelplanTools } from './fuelplan-tools.js';
import { registerTradeplanTools } from './tradeplan-tools.js';
import { registerFarmplanTools } from './farmplan-tools.js';
import { registerRationTools } from './ration-tools.js';
import { registerAllocationTools } from './allocation-tools.js';
import { registerInventorySeriesTools } from './inventory-series-tools.js';
import { registerStorageSeriesTools } from './storage-series-tools.js';
import { registerVitalsSeriesTools } from './vitals-series-tools.js';
import { registerRoutineMetricsTools } from './routine-metrics-tools.js';
import { registerEventQueryTools } from './event-query-tools.js';
import { registerSnapshotQueryTools } from './snapshot-query-tools.js';
import { registerPlanningTools, registerPlanningExtensions } from './planning-tools.js';
import { registerPlanningStudies } from './planning-studies.js';

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
  .option('--relative', 'treat X Y Z as offsets from the current position')
  .action(async (x, y, z, options) => {
    if (options.relative) {
      const adapter = await connect();
      let position;
      try { position = playerPosition(await adapter.observe()); } finally { await adapter.close(); }
      const target = { x: position.x + x, y: position.y + y, z: position.z + z };
      if (!positionSchema.safeParse(target).success) throw new Error(`Relative target ${target.x} ${target.y} ${target.z} is outside the world: Y must be -64 to 320 and X/Z within ±29,999,984.`);
      ({ x, y, z } = target);
    }
    return perform({ type: 'goto', x, y, z });
  });
program.command('collect').description('Collect additional logs, dirt, sand, or cobblestone (up to 64).')
  .argument('<block>', 'Minecraft block name').argument('<count>', 'additional item count', positiveInteger)
  .action((block, count) => perform({ type: 'collect', block, count }));
program.command('eat').description('Eat supported food from inventory.')
  .option('--until <hunger>', 'repeat until hunger reaches 1–20, at most 10 meals', value => {
    const parsed = positiveInteger(value);
    if (parsed > 20) throw new InvalidArgumentError('Must be an integer from 1 to 20.');
    return parsed;
  })
  .action(async ({ until: target }) => {
    if (target === undefined) return perform({ type: 'eat' });
    const adapter = await connect();
    try {
      let { hunger } = healthView(await adapter.observe());
      if (!Number.isFinite(hunger)) throw new Error('Hunger is unavailable from this backend.');
      if (hunger >= target) return print({ status: 'already_satisfied', meals: 0, hunger, target });
      await adapter.acquire();
      let meals = 0;
      while (hunger < target) {
        if (meals === 10) throw new Error(`Hunger is ${hunger} after 10 meals, below the target of ${target}. Stopping.`);
        abortController.signal.throwIfAborted();
        const state = await adapter.observe();
        if (state.mode !== 'agent' || adapter.leaseError) throw new Error('Control returned to the player.');
        // Automatic eating can run between meals; let it finish and recount before asking for another.
        if (state.recovering || state.stopping) {
          await delay(500, undefined, { signal: abortController.signal });
          hunger = healthView(await adapter.observe()).hunger;
          continue;
        }
        log(`Meal ${meals + 1}: hunger ${hunger}/${target}`);
        try { await adapter.execute({ type: 'eat' }, { signal: abortController.signal, onProgress: job => log(job.message) }); }
        catch (error) {
          if (abortController.signal.aborted || adapter.leaseError || (await adapter.observe()).mode !== 'agent') throw error;
          throw new Error(`Stopped after ${meals} meal(s) at hunger ${hunger}/${target}: ${error.message} Food may have run out; check inventory for supported food.`);
        }
        meals++;
        const after = healthView(await adapter.observe()).hunger;
        if (!(after > hunger)) throw new Error(`Hunger stayed at ${after} after eating; stopping after ${meals} meal(s) below the target of ${target}.`);
        hunger = after;
      }
      print({ status: 'completed', meals, hunger, target });
    } finally { await adapter.close(); }
  });
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
/** Exactly one of X Y Z or --home; null means measure to the saved home after observing. */
function coordinatesOrHome(x, y, z, options) {
  const given = [x, y, z].filter(value => value !== undefined).length;
  if (options.home ? given : given !== 3) throw new Error('Pass either all three X Y Z coordinates or --home.');
  return options.home ? null : positionSchema.parse({ x, y, z });
}
program.command('distance').description('Measure straight-line and horizontal distance to a coordinate or the saved home without moving.')
  .argument('[x]', 'X coordinate', number).argument('[y]', 'Y coordinate', number).argument('[z]', 'Z coordinate', number)
  .option('--home', 'measure to the saved home instead of a coordinate')
  .action((x, y, z, options) => {
    const target = coordinatesOrHome(x, y, z, options);
    return view(state => distanceTo(state, target ?? homeTarget(state)));
  });
program.command('position').description('Show current coordinates and dimension without taking control.')
  .action(() => view(state => ({ position: playerPosition(state), dimension: state.player.dimension })));
program.command('health').description('Show health, hunger, and survival status without taking control.')
  .action(() => view(healthView));
program.command('summary').description('Show position, vitals, control, home distance, threats, and inventory totals without taking control.')
  .action(() => view(summaryView));
program.command('job').description('Show control mode, stopping state, and the current job without taking control.')
  .action(() => view(jobView));
program.command('find-item').description('Find an item in inventory and last observed storage without opening containers.')
  .argument('<item>', 'Minecraft item name', itemName)
  .action(item => view(state => findItemView(state, item)));
program.command('storage-totals').description('Total last observed contents across known containers without opening them.')
  .option('--item <name>', 'only count this item', itemName)
  .action(options => view(state => storageTotalsView(state, options)));
program.command('nearest').description('Show the nearest observed block of a type with distance and bearing.')
  .argument('<block>', 'Minecraft block name', itemName)
  .action(block => view(state => nearestView(state, block)));
program.command('direction').description('Show compass bearing, yaw, pitch, and distance to a coordinate or the saved home without moving.')
  .argument('[x]', 'X coordinate', number).argument('[y]', 'Y coordinate', number).argument('[z]', 'Z coordinate', number)
  .option('--home', 'point to the saved home instead of a coordinate')
  .action((x, y, z, options) => {
    const target = coordinatesOrHome(x, y, z, options);
    return view(state => directionView(state, target ?? homeTarget(state)));
  });
program.command('food').description('List inventory food and the hunger it can restore without eating.')
  .action(() => view(foodView));
program.command('free-slots').description('Count free main inventory slots and, optionally, room for an item.')
  .option('--item <name>', 'also estimate room for this item', itemName)
  .action(options => view(state => freeSlotsView(state, options)));
program.command('snapshot').description('Save the current observation to a private local JSON file; no credentials or job details.')
  .argument('<file>', 'output JSON file').option('--force', 'overwrite an existing file')
  .action((file, options) => {
    const path = resolve(file);
    if (!options.force && existsSync(path)) throw new Error(`${path} already exists; pass --force to overwrite it.`);
    return view(state => {
      const snapshot = snapshotView(state);
      // Removing first means --force never writes through a symlink or keeps an existing file's permissions.
      if (options.force) rmSync(path, { force: true });
      writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
      chmodSync(path, 0o600);
      return { file: path, savedAt: snapshot.savedAt };
    });
  });
program.command('compare').description('Compare a saved snapshot with the current observation without taking control.')
  .argument('<file>', 'snapshot JSON file from the snapshot command')
  .action(file => {
    let text;
    try { text = readFileSync(file, 'utf8'); } catch (error) { throw new Error(`Cannot read snapshot ${file}: ${error.code || error.message}.`); }
    const snapshot = parseSnapshot(text);
    return view(state => compareView(snapshot, state));
  });
const within = (min, max, integer) => value => {
  const parsed = number(value);
  if (parsed < min || parsed > max || integer && !Number.isInteger(parsed)) throw new InvalidArgumentError(`Must be ${integer ? 'an integer' : 'a number'} from ${min} to ${max}.`);
  return parsed;
};
program.command('watch').description('Print one compact JSON observation line per interval without taking control; Ctrl+C stops.')
  .option('--interval <seconds>', 'seconds between samples, 1 to 60', within(1, 60), 5)
  .option('--count <n>', 'stop after 1 to 10000 samples; default runs until Ctrl+C', within(1, 10_000, true))
  .action(async options => {
    const adapter = await connect();
    try {
      for (let sample = 0; options.count === undefined || sample < options.count; sample++) {
        if (sample) await delay(options.interval * 1000, undefined, { signal: abortController.signal });
        console.log(JSON.stringify(watchSample(await adapter.observe())));
      }
    } catch (error) { if (!abortController.signal.aborted) throw error; }
    finally { await adapter.close(); }
  });
program.command('wait-idle').description('Wait until no job is running or stopping, without taking control.')
  .option('--timeout <seconds>', 'give up after 1 to 3600 seconds', within(1, 3600), 60)
  .option('--manual', 'also wait until control has returned to the player')
  .action(async options => {
    const adapter = await connect();
    const started = Date.now(), deadline = started + options.timeout * 1000;
    try {
      while (true) {
        const state = await adapter.observe();
        const busy = busyReasons(state, options);
        if (!busy.length) return print({ status: 'idle', waitedMs: Date.now() - started, mode: state.mode ?? null, job: jobView(state).job });
        if (Date.now() >= deadline) throw new Error(`Still busy after ${options.timeout} s: ${busy.join('; ')}.`);
        await delay(Math.min(250, deadline - Date.now()), undefined, { signal: abortController.signal });
      }
    } finally { await adapter.close(); }
  });
program.command('risk').description('Rate observed danger low, medium, or high from health, hunger, food, and threats; a heuristic.')
  .action(() => view(riskView));
program.command('census').description('Count observed blocks by name and threats by type; a partial observation.')
  .option('--radius <blocks>', 'maximum distance from the player', positiveNumber)
  .action(options => view(state => censusView(state, options)));
program.command('slots').description('List occupied inventory slots with stack size and room without taking control.')
  .action(() => view(slotsView));
program.command('route').description('Measure straight-line legs from the current position through 1–50 x,y,z points without moving.')
  .argument('<points...>', 'points as x,y,z; put -- before the first point if it starts with a minus sign')
  .action(points => {
    const parsed = parseRoutePoints(points);
    return view(state => routeView(state, parsed));
  });
function readSnapshotFile(file) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch (error) { throw new Error(`Cannot read snapshot ${file}: ${error.code || error.message}.`); }
  try { return parseSnapshot(text); } catch (error) { throw new Error(`${file}: ${error.message}`); }
}
program.command('diff-snapshots').description('Compare two snapshot files offline without contacting the bridge.')
  .argument('<first>', 'earlier snapshot JSON file').argument('<second>', 'later snapshot JSON file')
  .action((first, second) => print(diffSnapshotsView(readSnapshotFile(first), readSnapshotFile(second))));
const waypoint = program.command('waypoint').description('Save, list, remove, and walk to named waypoints stored in the project data directory.');
waypoint.command('add').description('Save a waypoint at the current position or at X Y Z.')
  .argument('<name>', 'lowercase name, up to 32 letters, digits, _ or -', waypointName)
  .argument('[x]', 'X coordinate', number).argument('[y]', 'Y coordinate', number).argument('[z]', 'Z coordinate', number)
  .option('--dimension <id>', 'dimension for X Y Z, for example minecraft:the_nether; defaults to the observed dimension', dimensionId)
  .option('--force', 'replace an existing waypoint with the same name')
  .action(async (name, x, y, z, options) => {
    const given = [x, y, z].filter(value => value !== undefined).length;
    if (given !== 0 && given !== 3) throw new Error('Pass all three X Y Z coordinates, or none to use the current position.');
    if (!given && options.dimension) throw new Error('--dimension applies only with X Y Z; the current position uses the observed dimension.');
    const existing = await readWaypoints();
    if (!options.force && existing.some(entry => entry.name === name)) throw new Error(`Waypoint ${name} already exists; pass --force to replace it.`);
    let dimension = options.dimension;
    if (!given || !dimension) {
      const adapter = await connect();
      let state;
      try { state = await adapter.observe(); } finally { await adapter.close(); }
      if (!given) ({ x, y, z } = playerPosition(state));
      dimension = state.player.dimension;
      if (typeof dimension !== 'string') throw new Error('The backend did not report a dimension; pass X Y Z with --dimension.');
    }
    const result = addWaypoint(await readWaypoints(), { name, x, y, z, dimension }, { force: options.force });
    await writeWaypoints(result.waypoints);
    print({ saved: result.waypoint, replaced: result.replaced, file: waypointFile });
  });
waypoint.command('list').description('List saved waypoints by name; works without a bridge.')
  .option('--distance', 'also observe the player and add distances for waypoints in the same dimension')
  .action(async options => {
    let waypoints = await readWaypoints();
    if (options.distance) {
      const adapter = await connect();
      let state;
      try { state = await adapter.observe(); } finally { await adapter.close(); }
      waypoints = waypoints.map(entry => ({ ...entry, distance: entry.dimension === state.player?.dimension ? distanceTo(state, entry).distance : null }));
    }
    print({ count: waypoints.length, waypoints, file: waypointFile });
  });
waypoint.command('remove').description('Delete a saved waypoint.')
  .argument('<name>', 'waypoint name', waypointName)
  .action(async name => {
    const waypoints = removeWaypoint(await readWaypoints(), name);
    await writeWaypoints(waypoints);
    print({ removed: name, remaining: waypoints.length, file: waypointFile });
  });
waypoint.command('goto').description('Walk to a saved waypoint like goto; refuses a waypoint in another dimension before taking control.')
  .argument('<name>', 'waypoint name', waypointName)
  .action(async name => {
    const target = findWaypoint(await readWaypoints(), name);
    const adapter = await connect();
    try {
      assertSameDimension(target, await adapter.observe());
      await adapter.acquire();
      // Recheck under control: a portal between the first check and acquisition must not redirect the walk.
      assertSameDimension(target, await adapter.observe());
      log(`Walking to waypoint ${target.name} at ${target.x} ${target.y} ${target.z} in ${target.dimension}.`);
      print(await adapter.execute({ type: 'goto', x: target.x, y: target.y, z: target.z }, { signal: abortController.signal, onProgress: job => log(job.message) }));
    } finally { await adapter.close(); }
  });
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
program.command('run').description('Validate a JSON routine of 1–100 actions, then run it in order under one control session.')
  .argument('<file>', 'JSON file containing { "actions": [ ... ] } or an array of actions (at most 1 MiB)')
  .option('--dry-run', 'validate and print the plan without taking control')
  .option('--from-step <n>', 'start at this 1-based step after validating the whole routine', positiveInteger)
  .option('--continue-on-error', 'record failed actions in errors and continue; loss of control and cancellation still stop')
  .option('--repeat <n>', 'run the selected steps 1 to 20 times under one control session', positiveInteger, 1)
  .option('--stop-below-health <n>', 'stop before any step when observed health is below 1 to 19', number)
  .action(async (file, options) => {
    const { loadRoutine, runRoutine, MAX_ROUTINE_REPEAT } = await import('./routine.js');
    const actions = await loadRoutine(file);
    if (options.fromStep > actions.length) throw new Error(`--from-step must be from 1 to ${actions.length}, the routine length.`);
    if (options.repeat > MAX_ROUTINE_REPEAT) throw new Error(`--repeat must be from 1 to ${MAX_ROUTINE_REPEAT}.`);
    if (options.stopBelowHealth !== undefined && !(options.stopBelowHealth >= 1 && options.stopBelowHealth <= 19)) throw new Error('--stop-below-health must be from 1 to 19.');
    if (options.dryRun) return print({ status: 'validated', total: actions.length, ...(options.fromStep !== undefined && { startStep: options.fromStep }), ...(options.repeat > 1 && { iterations: options.repeat }), actions });
    const adapter = await connect();
    try {
      const result = await runRoutine(adapter, actions, { signal: abortController.signal, log, fromStep: options.fromStep, continueOnError: !!options.continueOnError,
        repeat: options.repeat, stopBelowHealth: options.stopBelowHealth });
      print(result);
      if (result.status !== 'completed') process.exitCode = 1;
    } finally { await adapter.close(); }
  });
program.command('paths').description('Show local data and discovery file locations without contacting the bridge or printing credentials.')
  .action(async () => {
    const { profileFile, resolveBridgePath } = await import('./config.js');
    const bridge = await resolveBridgePath(program.opts().bridge);
    const waypointsFile = waypointFile;
    print({ dataDirectory, defaultBridgeFile: bridgeFile, profileFile, profileExists: existsSync(profileFile),
      bridgeFile: bridge, bridgeExists: existsSync(bridge), waypointsFile, waypointsExists: existsSync(waypointsFile) });
  });
program.command('stop').description('Cancel all agent actions and return control, including another CLI session.')
  .action(async () => print(await (await connect()).emergencyStop()));

const numberIn = (min, max, integer) => value => {
  const parsed = number(value);
  if (parsed < min || parsed > max || integer && !Number.isInteger(parsed)) throw new InvalidArgumentError(`Must be ${integer ? 'an integer' : 'a number'} from ${min} to ${max}.`);
  return parsed;
};
const ollamaOption = () => new Option('--ollama <url>', 'local Ollama URL').env('MC_AGENT_OLLAMA').default('http://127.0.0.1:11434');
program.command('agent').description('Run a bounded natural-language task using a local Ollama model.')
  .argument('[goal]', 'task for the agent; or use --goal-file').addOption(new Option('--model <name>', 'installed Ollama model name').env('MC_AGENT_MODEL').makeOptionMandatory())
  .addOption(ollamaOption())
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
  .option('--verify-max-inventory <item:count>', 'maximum items held at completion, 0 to 2304, for example oak_log:0', parseMaxInventoryCriterion)
  .option('--verify-max-distance <n>', 'final position within 0 to 10000 blocks of the starting position', numberIn(0, 10_000))
  .option('--dry-run', 'check settings and criteria against the current observation without taking control or contacting the model')
  .option('--transcript <file>', 'append one JSON line per planner event to this file (created owner-only)')
  .option('--max-failures <n>', 'consecutive failed actions before stopping, 1 to 10', numberIn(1, 10, true), 3)
  .option('--context-tokens <n>', 'Ollama context window, 2048 to 131072', numberIn(2048, 131_072, true), 8192)
  .option('--history <n>', 'recent decisions sent to the model, 1 to 50', numberIn(1, 50, true), 12)
  .option('--fence <blocks>', 'refuse goto targets farther than 1 to 10000 blocks horizontally from the start', numberIn(1, 10_000))
  .option('--allow-actions <list>', 'comma list of allowed planner actions; done is always allowed')
  .option('--verify-min-free-slots <n>', 'minimum free main inventory slots at completion, 0 to 36', numberIn(0, 36, true))
  .option('--verify-max-health-loss <n>', 'final health at most 0 to 20 below the starting health', numberIn(0, 20))
  .option('--goal-file <file>', 'read the goal from a regular text file (at most 16000 characters) instead of the argument')
  .option('--stop-below-health <n>', 'stop between actions when health is below 1 to 19 (exit 2)', numberIn(1, 19))
  .option('--retry-invalid <n>', 'consecutive invalid model outputs to refuse and retry, 0 to 5', numberIn(0, 5, true), 0)
  .option('--temperature <t>', 'Ollama sampling temperature, 0 to 2', numberIn(0, 2), 0)
  .option('--seed <n>', 'Ollama sampling seed, 0 to 2147483647', numberIn(0, 2_147_483_647, true))
  .option('--show-prompt', 'with --dry-run, include the system prompt and first model message')
  .action(async (goal, options) => {
    if (options.steps > 1000 || options.minutes > 1440 || options.modelTimeout > 3600) throw new Error('Limits must be <= 1000 steps, <= 1440 minutes, and a model timeout <= 3600 seconds.');
    if ((goal === undefined) === (options.goalFile === undefined)) throw new Error('Give the goal either as an argument or with --goal-file, not both.');
    if (options.showPrompt && !options.dryRun) throw new Error('--show-prompt requires --dry-run.');
    const { runAgent, parseAllowedActions, readGoalFile } = await import('./agent.js');
    if (options.goalFile !== undefined) goal = await readGoalFile(options.goalFile);
    const allowActions = options.allowActions === undefined ? undefined : parseAllowedActions(options.allowActions);
    const adapter = await connect();
    try {
      const result = await runAgent(adapter, goal, { model: options.model, ollamaUrl: options.ollama, maxSteps: options.steps, minutes: options.minutes,
        modelTimeout: options.modelTimeout, think: options.thinking ? undefined : false, criteria: { collect: options.verifyCollect, deposit: options.verifyDeposit, returnHome: options.verifyHome, minHealth: options.verifyHealth, minHunger: options.verifyHunger, destination: options.verifyAt, inventory: options.verifyInventory, maxThreats: options.verifyMaxThreats, homeRadius: options.verifyHomeRadius, maxInventory: options.verifyMaxInventory, maxDistance: options.verifyMaxDistance, minFreeSlots: options.verifyMinFreeSlots, maxHealthLoss: options.verifyMaxHealthLoss }, signal: abortController.signal, log,
        dryRun: !!options.dryRun, transcript: options.transcript, maxFailures: options.maxFailures, contextTokens: options.contextTokens, history: options.history, fence: options.fence, allowActions,
        stopBelowHealth: options.stopBelowHealth, retryInvalid: options.retryInvalid, temperature: options.temperature, seed: options.seed, showPrompt: !!options.showPrompt });
      print(result);
      if (result.status === 'criteria_unmet' || result.status === 'health_stop' || result.status === 'step_limit' && result.verification) process.exitCode = 2;
    }
    finally { await adapter.close(); }
  });

program.command('models').description('List locally installed Ollama models without connecting to Minecraft.')
  .addOption(ollamaOption())
  .action(async options => {
    const { listModels } = await import('./agent.js');
    const models = await listModels({ ollamaUrl: options.ollama, signal: abortController.signal });
    if (!models.length) log('No models are installed. Pull one with Ollama first, for example: ollama pull MODEL_NAME');
    print(models);
  });
program.command('transcript-summary').description('Summarize a planner --transcript file offline, without connecting to Minecraft or Ollama.')
  .argument('<file>', 'JSON Lines transcript written by agent --transcript (at most 10 MiB)')
  .option('--run <n>', 'summarize this run (1 = first start event); default is the last run', positiveInteger)
  .action(async (file, options) => {
    const { readTranscript, summarizeTranscript } = await import('./transcript.js');
    print(summarizeTranscript(await readTranscript(file), { run: options.run }));
  });

program.command('mcp').description('Expose Minecraft tools over MCP stdio for a local agent.')
  .action(async () => {
    const { serveMcp } = await import('./mcp.js');
    const server = activeMcp = await serveMcp(await connect());
    process.stdin.once('end', () => shutdown().then(() => server.close()).catch(console.error));
  });

program.command('demo').description('Run a simulated player bridge; no Minecraft or model needed.')
  .option('--smoke', 'run a short end-to-end demonstration and exit')
  .addOption(new Option('--scenario <name>', 'starting state: default, hungry (hunger 4, health 10), hostile (a nearby zombie), stocked (a pre-opened chest with items), or full (all 36 inventory slots occupied)').choices(demoScenarios).default('default'))
  .action(async options => {
    let directory;
    if (options.smoke) {
      const { mkdir } = await import('node:fs/promises');
      await mkdir(join(dataDirectory, 'tmp'), { recursive: true });
      directory = await mkdtemp(join(dataDirectory, 'tmp', 'demo-'));
    }
    const path = directory ? join(directory, 'bridge.json') : program.opts().bridge;
    activeBridge = await startBridge(new Harness(new DemoDriver({ scenario: options.scenario })), { discoveryPath: path });
    log(`DEMO SIMULATION (${options.scenario} scenario) — no real Minecraft world is connected.`);
    if (!options.smoke) { log(`Bridge ready. In a second terminal: npm start -- observe\nDiscovery file: ${path}\nCtrl+C stops the demo.`); return; }
    const adapter = activeAdapter = await FabricAdapter.connect(path);
    try {
      await adapter.execute({ type: 'set_home' });
      await adapter.execute({ type: 'goto', x: 5, y: 64, z: 5 });
      // A full inventory has no slot for new logs until something is stored.
      if (options.scenario === 'full') await adapter.execute({ type: 'deposit', item: 'sand' });
      await adapter.execute({ type: 'collect', block: 'oak_log', count: 8 });
      await adapter.execute({ type: 'deposit', item: 'oak_log', count: 8 });
      await adapter.execute({ type: 'eat' });
      await adapter.execute({ type: 'home' });
      await adapter.release();
      print({ demonstration: 'simulation', scenario: options.scenario, ...(await adapter.observe()) });
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
  .option('--ollama <url>', 'also check a local Ollama server, for example http://127.0.0.1:11434')
  .option('--strict', 'exit 1 unless ready is true (Node, JDK, bundle, bridge, and any requested Ollama)')
  .action(async options => {
    const { inspectPrerequisites } = await import('./doctor.js');
    const result = await inspectPrerequisites({ discoveryPath: program.opts().bridge, ollamaUrl: options.ollama });
    print(result);
    if (options.strict && !result.ready) process.exitCode = 1;
  });

registerSupplies(program, { view, print });
registerSurvey(program, { view, print });
registerNavigation(program, { print });
registerRoutineTools(program, { print });
registerStockTools(program, { view });
registerSceneTools(program, { view });
registerGeometryTools(program, { print });
registerRoutineWorkbench(program, { print });
registerTimelineTools(program, { print });
registerTerrainTools(program, { view });
registerLogisticsTools(program, { view });
registerRoutineAudit(program, { print });
registerExpeditionTools(program, { view });
registerBlueprintTools(program, { print });
registerCheckpointTools(program, { print });
registerRoutineCompose(program, { print });
registerItineraryTools(program, { print });
registerWorkareaTools(program, { print });
registerLedgerTools(program, { print });
registerDepotTools(program, { print });
registerJournalTools(program, { print });
registerDiagnoseTools(program, { print });
registerRoutineCompare(program, { print });
registerRoutineSelect(program, { print });
registerBearingTools(program, { print });
registerGridTools(program, { print });
registerShapeTools(program, { print });
registerEarthworksTools(program, { print });
registerRailplanTools(program, { print });
registerLightplanTools(program, { print });
registerPerimeterTools(program, { print });
registerPackingTools(program, { print });
registerProductionTools(program, { print });
registerFuelplanTools(program, { print });
registerTradeplanTools(program, { print });
registerFarmplanTools(program, { print });
registerRationTools(program, { print });
registerAllocationTools(program, { print });
registerInventorySeriesTools(program, { print });
registerStorageSeriesTools(program, { print });
registerVitalsSeriesTools(program, { print });
registerRoutineMetricsTools(program, { print });
registerEventQueryTools(program, { print });
registerSnapshotQueryTools(program, { print });
registerPlanningTools(program, { print });
registerPlanningExtensions(program, { print });
registerPlanningStudies(program, { print });

try { await program.parseAsync(); }
catch (error) {
  console.error(program.opts().json ? JSON.stringify({ error: error.message }) : `Error: ${error.message}`);
  await shutdown();
  process.exitCode = 1;
}
