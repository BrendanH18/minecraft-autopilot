import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { projectRoot } from '../src/config.js';
import {
  watchSample,
  busyReasons,
  riskView,
  censusView,
  slotsView,
  homeTarget,
  parseRoutePoints,
  routeView,
  diffSnapshotsView,
  headingBetween,
  directionView,
  snapshotView,
  compareView,
  parseSnapshot,
  MAX_ROUTE_POINTS,
} from '../src/cli-views.js';
import {
  addWaypoint,
  removeWaypoint,
  findWaypoint,
  assertSameDimension,
  readWaypoints,
  writeWaypoints,
  waypointName,
  dimensionId,
  MAX_WAYPOINTS,
} from '../src/waypoints.js';
import { DemoDriver } from '../src/demo-driver.js';
import { Harness } from '../src/harness.js';
import { startBridge } from '../src/bridge-server.js';
import { FabricAdapter } from '../src/fabric-adapter.js';
import { testDirectory } from './helpers.js';

const demoState = () => ({ protocol: 1, ...new DemoDriver().observe(), mode: 'manual', stopping: false, job: null });

async function demoBridge(t, prefix) {
  const directory = await testDirectory(t, prefix);
  const driver = new DemoDriver();
  const harness = new Harness(driver, { leaseMs: 60_000 });
  const discoveryPath = join(directory, 'bridge.json');
  const bridge = await startBridge(harness, { discoveryPath });
  t.after(() => bridge.close());
  let acquires = 0;
  const acquire = harness.acquire.bind(harness);
  harness.acquire = (leaseId) => {
    acquires++;
    return acquire(leaseId);
  };
  const exec = (...args) =>
    promisify(execFile)(process.execPath, [join(projectRoot, 'src/cli.js'), '--bridge', discoveryPath, ...args], {
      timeout: 15_000,
      env: { ...process.env, MC_AGENT_HOME: directory },
    });
  const run = async (...args) => JSON.parse((await exec(...args)).stdout);
  return { directory, driver, harness, discoveryPath, exec, run, acquires: () => acquires };
}

test('watch samples and wait-idle reasons are compact and honest about missing data', () => {
  const state = demoState();
  state.job = { id: 'j', type: 'goto', status: 'running', message: 'x' };
  assert.deepEqual(watchSample(state, new Date('2026-01-01T00:00:00Z')), {
    time: '2026-01-01T00:00:00.000Z',
    position: { x: 0, y: 64, z: 0 },
    dimension: 'minecraft:overworld',
    health: 20,
    hunger: 14,
    mode: 'manual',
    job: { type: 'goto', status: 'running' },
    threats: 0,
  });
  assert.equal(watchSample({ ...state, threats: undefined }).threats, null);
  assert.throws(() => watchSample({ connected: false }), /Enter a world/);
  assert.deepEqual(busyReasons(state), ['job goto is running']);
  assert.deepEqual(busyReasons({ ...state, job: { ...state.job, status: 'completed' } }), []);
  assert.deepEqual(
    busyReasons(
      { ...state, job: { ...state.job, status: 'cancelled' }, stopping: true, mode: 'agent' },
      { manual: true },
    ),
    ['previous activity is stopping', 'control mode is agent'],
  );
  assert.deepEqual(busyReasons({ ...state, job: null, mode: 'agent' }), []);
  assert.deepEqual(busyReasons({ job: null }, { manual: true }), ['control mode is unknown']);
});

test('risk applies the documented thresholds at their boundaries', () => {
  const at = ({ health = 20, hunger = 20, threats = [], food = true } = {}) => {
    const state = demoState();
    Object.assign(state.player, { health, hunger });
    state.threats = threats ?? undefined;
    if (!food) state.inventory = [{ slot: 0, name: 'minecraft:dirt', count: 3 }];
    return riskView(state);
  };
  const low = at();
  assert.deepEqual(low, {
    level: 'low',
    reasons: [],
    inputs: { health: 20, hunger: 20, nearestThreatDistance: null, threatsWithin16: 0, foodHunger: 40 },
    caveat: low.caveat,
  });
  assert.match(low.caveat, /Heuristic over partial observations/);
  assert.equal(at({ health: 13, hunger: 11 }).level, 'low');
  assert.deepEqual(at({ health: 12 }).reasons, ['health 12 <= 12']);
  assert.equal(at({ health: 12 }).level, 'medium');
  assert.deepEqual([at({ health: 6 }).level, at({ health: 6 }).reasons], ['high', ['health 6 <= 6']]);
  assert.equal(at({ health: 7 }).level, 'medium');
  assert.deepEqual([at({ hunger: 10 }).level, at({ hunger: 6 }).level], ['medium', 'medium']);
  assert.deepEqual(
    [at({ hunger: 6, food: false }).level, at({ hunger: 6, food: false }).reasons],
    ['high', ['hunger 6 <= 6 with no listed food in inventory']],
  );
  assert.deepEqual(
    [at({ hunger: 7, food: false }).level, at({ hunger: 7, food: false }).reasons],
    ['medium', ['hunger 7 <= 10', 'no listed food in inventory']],
  );
  assert.deepEqual(at({ food: false }).reasons, ['no listed food in inventory']);
  const zombie = (distance) => [{ type: 'minecraft:zombie', distance }];
  assert.deepEqual(
    [at({ threats: zombie(5) }).level, at({ threats: zombie(5) }).reasons],
    ['high', ['minecraft:zombie 5 blocks away (within 5)']],
  );
  assert.deepEqual(
    [at({ threats: zombie(5.1) }).level, at({ threats: zombie(5.1) }).reasons],
    ['medium', ['1 threat(s) within 16 blocks']],
  );
  assert.equal(at({ threats: zombie(16) }).level, 'medium');
  assert.equal(at({ threats: zombie(16.1) }).level, 'low');
  assert.deepEqual(at({ threats: [...zombie(30), { type: 'minecraft:skeleton', x: 3, y: 64, z: 4 }] }).inputs, {
    health: 20,
    hunger: 20,
    nearestThreatDistance: 5,
    threatsWithin16: 1,
    foodHunger: 40,
  });
  const unknown = at({ threats: null });
  assert.deepEqual(
    [unknown.level, unknown.reasons, unknown.inputs.threatsWithin16],
    ['medium', ['threat data unavailable; absence does not prove safety'], null],
  );
  const vitals = demoState();
  vitals.player.health = undefined;
  vitals.player.hunger = null;
  assert.deepEqual(riskView(vitals).reasons, ['health unavailable', 'hunger unavailable']);
  assert.throws(() => riskView({ connected: false }), /Enter a world/);
});

test('census counts by name, slots list each stack, and home targets refuse other dimensions', () => {
  const state = demoState();
  state.blocks.push(
    { name: 'minecraft:dirt', x: 1, y: 64, z: 0 },
    { name: 'minecraft:dirt', x: 2, y: 64, z: 0 },
    { name: 'minecraft:oak_log', x: 0, y: 64, z: 30 },
  );
  state.threats = [
    { type: 'minecraft:zombie', distance: 3 },
    { type: 'minecraft:zombie', distance: 20 },
    { type: 'minecraft:creeper', distance: 4 },
  ];
  const all = censusView(state);
  assert.deepEqual(
    [all.radius, all.observedBlocks, all.blocks, all.observedThreats, all.threats],
    [
      null,
      4,
      [
        { name: 'minecraft:dirt', count: 2 },
        { name: 'minecraft:oak_log', count: 2 },
      ],
      3,
      [
        { type: 'minecraft:zombie', count: 2 },
        { type: 'minecraft:creeper', count: 1 },
      ],
    ],
  );
  const near = censusView(state, { radius: 10 });
  assert.deepEqual(
    [near.radius, near.observedBlocks, near.blocks.map((block) => block.name), near.threats],
    [
      10,
      3,
      ['minecraft:dirt', 'minecraft:oak_log'],
      [
        { type: 'minecraft:creeper', count: 1 },
        { type: 'minecraft:zombie', count: 1 },
      ],
    ],
  );
  assert.deepEqual(
    [
      censusView({ ...state, threats: undefined }).threats,
      censusView({ ...state, threats: undefined }).observedThreats,
    ],
    [null, null],
  );
  assert.match(all.note, /partial observation/);

  state.inventory = [
    { slot: 9, name: 'minecraft:oak_log', count: 60 },
    { name: 'create:wrench', count: 1 },
    { slot: 2, name: 'minecraft:ender_pearl', count: 3 },
    { slot: 1, name: 'minecraft:mystery', count: 64 },
    { slot: 3, name: 'minecraft:dirt', count: 0 },
  ];
  assert.deepEqual(slotsView(state), {
    occupiedSlots: 4,
    slots: [
      { slot: 1, name: 'minecraft:mystery', count: 64, maxStack: 64, room: 0, stackSizeAssumed: true },
      { slot: 2, name: 'minecraft:ender_pearl', count: 3, maxStack: 16, room: 13, stackSizeAssumed: false },
      { slot: 9, name: 'minecraft:oak_log', count: 60, maxStack: 64, room: 4, stackSizeAssumed: false },
      { slot: null, name: 'create:wrench', count: 1, maxStack: 64, room: 63, stackSizeAssumed: true },
    ],
  });
  assert.deepEqual(slotsView({ inventory: undefined }), { occupiedSlots: 0, slots: [] });

  assert.throws(() => homeTarget(state), /No home is saved/);
  state.home = { x: 3, y: 68, z: 0 };
  assert.deepEqual(homeTarget(state), { x: 3, y: 68, z: 0 });
  state.home.dimension = 'minecraft:overworld';
  assert.deepEqual(homeTarget(state), { x: 3, y: 68, z: 0 });
  state.home.dimension = 'minecraft:the_nether';
  assert.throws(() => homeTarget(state), /Home is in minecraft:the_nether but the player is in minecraft:overworld/);
  assert.throws(() => homeTarget({ ...state, player: { ...state.player, dimension: undefined } }), /unknown dimension/);
});

test('route legs share the direction bearing helper and validate every point', () => {
  const state = demoState();
  for (const target of [
    { x: 0, y: 64, z: 5 },
    { x: -3, y: 70, z: -3 },
    { x: 0, y: 70, z: 0 },
    { x: 0, y: 64, z: 0 },
  ]) {
    const { compass, yaw, pitch } = directionView(state, target);
    assert.deepEqual(headingBetween(state.player.position, target), { compass, yaw, pitch });
  }
  const points = parseRoutePoints(['3,68,0', ' 3 , 68 , 10 ', '-1.5,64,10']);
  assert.deepEqual(points, [
    { x: 3, y: 68, z: 0 },
    { x: 3, y: 68, z: 10 },
    { x: -1.5, y: 64, z: 10 },
  ]);
  const route = routeView(state, points);
  assert.deepEqual(route.start, { x: 0, y: 64, z: 0 });
  assert.deepEqual(route.legs.slice(0, 2), [
    {
      from: { x: 0, y: 64, z: 0 },
      to: { x: 3, y: 68, z: 0 },
      distance: 5,
      horizontalDistance: 3,
      verticalOffset: 4,
      compass: 'east',
    },
    {
      from: { x: 3, y: 68, z: 0 },
      to: { x: 3, y: 68, z: 10 },
      distance: 10,
      horizontalDistance: 10,
      verticalOffset: 0,
      compass: 'south',
    },
  ]);
  assert.equal(route.legs[2].compass, 'west');
  assert.deepEqual(route.totals, { legs: 3, distance: 15 + Math.hypot(4.5, 4), horizontalDistance: 13 + 4.5 });
  assert.equal(routeView(state, [{ x: 0, y: 70, z: 0 }]).legs[0].compass, null);
  assert.equal(parseRoutePoints(Array(MAX_ROUTE_POINTS).fill('0,64,0')).length, 50);
  assert.throws(() => parseRoutePoints([]), /1 to 50 route points/);
  assert.throws(() => parseRoutePoints(Array(51).fill('0,64,0')), /1 to 50 route points/);
  for (const bad of ['1,2', '1,2,3,4', 'a,64,0', '1,,3', '', 'Infinity,64,0'])
    assert.throws(() => parseRoutePoints(['0,64,0', bad]), /Route point 2 .* must be x,y,z numbers/);
  assert.throws(() => parseRoutePoints(['0,321,0']), /Route point 1 "0,321,0" is outside the world/);
  assert.throws(() => parseRoutePoints(['30000000,64,0']), /outside the world/);
  assert.throws(() => routeView({ connected: false }, points), /Enter a world/);
});

test('diff-snapshots shares compare logic and measures elapsed time between saves', () => {
  const first = demoState();
  const second = demoState();
  second.player.position = { x: 3, y: 68, z: 0 };
  second.player.health = 12;
  second.inventory = [
    { slot: 0, name: 'minecraft:bread', count: 5 },
    { slot: 1, name: 'minecraft:oak_log', count: 4 },
  ];
  second.home = { x: 1, y: 64, z: 1 };
  const a = parseSnapshot(JSON.stringify(snapshotView(first, new Date('2026-01-01T00:00:00Z'))));
  const b = parseSnapshot(JSON.stringify(snapshotView(second, new Date('2026-01-01T00:02:00.3Z'))));
  const diff = diffSnapshotsView(a, b);
  assert.deepEqual(diff, {
    from: '2026-01-01T00:00:00.000Z',
    to: '2026-01-01T00:02:00.300Z',
    elapsedSeconds: 120.3,
    position: { from: { x: 0, y: 64, z: 0 }, to: { x: 3, y: 68, z: 0 }, delta: { x: 3, y: 4, z: 0 }, distanceMoved: 5 },
    dimensionChanged: false,
    health: { from: 20, to: 12, delta: -8 },
    hunger: { from: 14, to: 14, delta: 0 },
    homeChanged: true,
    inventory: [
      { name: 'minecraft:bread', from: 8, to: 5, delta: -3 },
      { name: 'minecraft:oak_log', from: 0, to: 4, delta: 4 },
    ],
  });
  const { savedAt, ...live } = compareView(a, second, new Date('2026-01-01T00:02:00.3Z'));
  const { from, to, ...offline } = diff;
  assert.deepEqual([savedAt, live], [from, offline]);
  assert.equal(diffSnapshotsView(b, a).elapsedSeconds, -120.3);
  assert.throws(() => diffSnapshotsView(a, { savedAt: a.savedAt }), /player/);
});

test('waypoint helpers validate names, bounds, limits, duplicates, and dimensions', async (t) => {
  const now = new Date('2026-01-01T00:00:00Z');
  assert.equal(waypointName('base_1-a'), 'base_1-a');
  for (const bad of ['', 'Base', '-base', 'a'.repeat(33), 'a b', '../x'])
    assert.throws(() => waypointName(bad), /Waypoint names/);
  assert.equal(waypointName('a'.repeat(32)).length, 32);
  assert.equal(dimensionId('minecraft:the_nether'), 'minecraft:the_nether');
  assert.throws(() => dimensionId('nether'), /dimension id/);
  const first = addWaypoint([], { name: 'mine', x: 1, y: 12, z: -3, dimension: 'minecraft:overworld' }, { now });
  assert.deepEqual(first, {
    replaced: false,
    waypoint: {
      name: 'mine',
      x: 1,
      y: 12,
      z: -3,
      dimension: 'minecraft:overworld',
      savedAt: '2026-01-01T00:00:00.000Z',
    },
    waypoints: [
      { name: 'mine', x: 1, y: 12, z: -3, dimension: 'minecraft:overworld', savedAt: '2026-01-01T00:00:00.000Z' },
    ],
  });
  const second = addWaypoint(
    first.waypoints,
    { name: 'base', x: 0, y: 64, z: 0, dimension: 'minecraft:overworld' },
    { now },
  );
  assert.deepEqual(
    second.waypoints.map((entry) => entry.name),
    ['base', 'mine'],
  );
  assert.throws(
    () => addWaypoint(second.waypoints, { name: 'mine', x: 0, y: 64, z: 0, dimension: 'minecraft:overworld' }),
    /already exists; pass --force/,
  );
  const replaced = addWaypoint(
    second.waypoints,
    { name: 'mine', x: 9, y: 64, z: 9, dimension: 'minecraft:overworld' },
    { force: true },
  );
  assert.deepEqual(
    [replaced.replaced, replaced.waypoints.length, findWaypoint(replaced.waypoints, 'mine').x],
    [true, 2, 9],
  );
  assert.throws(
    () => addWaypoint([], { name: 'high', x: 0, y: 321, z: 0, dimension: 'minecraft:overworld' }),
    /outside goto bounds/,
  );
  assert.throws(() => addWaypoint([], { name: 'x', x: 0, y: 64, z: 0, dimension: 'bad' }), /dimension id/);
  const full = Array.from({ length: MAX_WAYPOINTS }, (_, index) => ({
    name: `w${index}`,
    x: 0,
    y: 64,
    z: 0,
    dimension: 'minecraft:overworld',
    savedAt: now.toISOString(),
  }));
  assert.throws(
    () => addWaypoint(full, { name: 'extra', x: 0, y: 64, z: 0, dimension: 'minecraft:overworld' }),
    /At most 100 waypoints/,
  );
  assert.equal(
    addWaypoint(full, { name: 'w5', x: 1, y: 64, z: 0, dimension: 'minecraft:overworld' }, { force: true }).waypoints
      .length,
    100,
  );
  assert.deepEqual(
    removeWaypoint(second.waypoints, 'base').map((entry) => entry.name),
    ['mine'],
  );
  assert.throws(() => removeWaypoint(second.waypoints, 'nope'), /No waypoint named nope/);
  assert.doesNotThrow(() => assertSameDimension(first.waypoint, demoState()));
  assert.throws(
    () => assertSameDimension({ ...first.waypoint, dimension: 'minecraft:the_end' }, demoState()),
    /in minecraft:the_end but the player is in minecraft:overworld; not taking control/,
  );
  assert.throws(() => assertSameDimension(first.waypoint, { player: {} }), /unknown dimension/);

  const directory = await testDirectory(t, 'waypoints-');
  const path = join(directory, 'nested', 'waypoints.json');
  assert.deepEqual(await readWaypoints(path), []);
  await writeWaypoints(second.waypoints, path);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  assert.equal((await stat(join(directory, 'nested'))).mode & 0o777, 0o700);
  assert.deepEqual(await readWaypoints(path), second.waypoints);
  await assert.rejects(writeWaypoints([...full, second.waypoint], path));
  const corrupt = async (text, pattern) => {
    await writeFile(path, text);
    await assert.rejects(readWaypoints(path), pattern);
  };
  await corrupt('{', /is not valid JSON; fix or remove it/);
  await corrupt('{"version":2,"waypoints":[]}', /is invalid \(version/);
  await corrupt(
    JSON.stringify({ version: 1, waypoints: [first.waypoint, first.waypoint] }),
    /duplicate waypoint names/,
  );
  await corrupt(
    JSON.stringify({ version: 1, waypoints: [{ ...first.waypoint, extra: 1 }] }),
    /is invalid \(waypoints\.0/,
  );
  await corrupt(JSON.stringify({ version: 1, waypoints: [{ ...first.waypoint, name: 'Bad' }] }), /waypoints\.0\.name/);
  await corrupt(' '.repeat(1024 * 1024 + 1), /larger than 1 MiB/);
  await assert.rejects(readWaypoints(directory), /not a regular file/);
  const fifo = join(directory, 'fifo.json');
  if (spawnSync('mkfifo', [fifo]).status === 0)
    await assert.rejects(readWaypoints(fifo), /not a regular file/, 'a FIFO is refused without blocking');
});

test('watch, risk, census, slots, route, and home measurements run against the demo bridge without control', {
  timeout: 20_000,
}, async (t) => {
  const { driver, harness, exec, run, acquires } = await demoBridge(t, 'cli-batch3-read-');
  driver.threats.push({ type: 'minecraft:zombie', x: 4, y: 64, z: -3 });
  const started = Date.now();
  const lines = (await exec('watch', '--interval', '1', '--count', '2')).stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.ok(Date.now() - started >= 1000);
  assert.equal(lines.length, 2);
  assert.deepEqual(Object.keys(lines[0]), [
    'time',
    'position',
    'dimension',
    'health',
    'hunger',
    'mode',
    'job',
    'threats',
  ]);
  assert.deepEqual(
    [lines[0].mode, lines[0].job, lines[0].threats, lines[1].dimension],
    ['manual', null, 1, 'minecraft:overworld'],
  );
  assert.ok(Date.parse(lines[1].time) - Date.parse(lines[0].time) >= 900);
  const [risk, census, slots, route] = await Promise.all([
    run('risk'),
    run('census', '--radius', '6'),
    run('slots'),
    run('route', '--', '-3,68,0', '-3,68,10'),
  ]);
  assert.deepEqual(
    [risk.level, risk.reasons, risk.inputs.nearestThreatDistance],
    ['high', ['minecraft:zombie 5 blocks away (within 5)'], 5],
  );
  assert.deepEqual([census.observedBlocks, census.threats], [0, [{ type: 'minecraft:zombie', count: 1 }]]);
  assert.deepEqual(slots.slots, [
    { slot: 0, name: 'minecraft:bread', count: 8, maxStack: 64, room: 56, stackSizeAssumed: false },
  ]);
  assert.deepEqual([route.legs.map((leg) => leg.compass), route.totals.distance], [['west', 'south'], 15]);
  await assert.rejects(exec('distance', '--home'), /No home is saved/);
  driver.home = { x: 3, y: 68, z: 0 };
  const [distance, direction, plain] = await Promise.all([
    run('distance', '--home'),
    run('direction', '--home'),
    run('distance', '3', '64', '4'),
  ]);
  assert.deepEqual(distance, { target: { x: 3, y: 68, z: 0 }, distance: 5, horizontalDistance: 3, verticalOffset: 4 });
  assert.deepEqual([direction.compass, direction.yaw, direction.distance], ['east', -90, 5]);
  assert.equal(plain.distance, 5);
  driver.home.dimension = 'minecraft:the_nether';
  await assert.rejects(
    exec('direction', '--home'),
    /Home is in minecraft:the_nether but the player is in minecraft:overworld/,
  );
  const errors = await Promise.allSettled(
    [
      ['distance', '1', '2', '3', '--home'],
      ['direction', '1', '--home'],
      ['distance'],
      ['direction', '0', '64'],
      ['watch', '--interval', '0'],
      ['watch', '--interval', '61'],
      ['watch', '--count', '0'],
      ['watch', '--count', '1.5'],
      ['watch', '--count', '10001'],
      ['census', '--radius', '0'],
      ['route'],
      ['route', '1,2'],
      ['route', '0,400,0'],
      ['route', ...Array(51).fill('0,64,0')],
    ].map((args) => exec(...args)),
  );
  assert.deepEqual(
    errors.map((result) => result.status),
    Array(errors.length).fill('rejected'),
  );
  assert.match(errors[0].reason.stderr, /Pass either all three X Y Z coordinates or --home/);
  assert.match(errors[4].reason.stderr, /Must be a number from 1 to 60/);
  assert.match(errors[13].reason.stderr, /1 to 50 route points/);
  assert.equal(acquires(), 0);
  assert.equal(harness.observe().mode, 'manual');
});

test('watch stops cleanly on SIGINT without taking control', { timeout: 20_000 }, async (t) => {
  const { discoveryPath, directory, acquires } = await demoBridge(t, 'cli-batch3-watch-');
  const { spawn } = await import('node:child_process');
  const child = spawn(
    process.execPath,
    [join(projectRoot, 'src/cli.js'), '--bridge', discoveryPath, 'watch', '--interval', '60'],
    { env: { ...process.env, MC_AGENT_HOME: directory } },
  );
  let stdout = '',
    stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    if (stdout.includes('\n')) child.kill('SIGINT');
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  const code = await new Promise((resolve) => child.on('exit', resolve));
  assert.equal(code, 0, stderr);
  assert.equal(stdout.trim().split('\n').length, 1);
  assert.equal(acquires(), 0);
});

test('wait-idle waits for a running job, reports what is busy on timeout, and honors --manual', {
  timeout: 20_000,
}, async (t) => {
  const { harness, discoveryPath, exec, run, acquires } = await demoBridge(t, 'cli-batch3-idle-');
  const quiet = await run('wait-idle', '--manual');
  assert.deepEqual({ ...quiet, waitedMs: 0 }, { status: 'idle', waitedMs: 0, mode: 'manual', job: null });
  assert.ok(quiet.waitedMs < 1000);
  const adapter = await FabricAdapter.connect(discoveryPath);
  t.after(() => adapter.close());
  const job = adapter.execute({ type: 'wait', seconds: 5 });
  while (harness.job?.status !== 'running') await new Promise((resolve) => setTimeout(resolve, 20));
  const before = acquires();
  const waiting = run('wait-idle', '--timeout', '10');
  const started = Date.now();
  await assert.rejects(exec('wait-idle', '--timeout', '1'), (error) =>
    /Still busy after 1 s: job wait is running/.test(error.stderr),
  );
  assert.ok(Date.now() - started >= 1000);
  const idle = await waiting;
  assert.deepEqual([idle.status, idle.mode, idle.job.type, idle.job.status], ['idle', 'agent', 'wait', 'completed']);
  assert.ok(idle.waitedMs >= 500);
  assert.equal((await job).status, 'completed');
  await assert.rejects(exec('wait-idle', '--manual', '--timeout', '1'), /control mode is agent/);
  await adapter.close();
  assert.deepEqual((await run('wait-idle', '--manual')).mode, 'manual');
  assert.equal(acquires(), before);
  for (const args of [
    ['wait-idle', '--timeout', '0'],
    ['wait-idle', '--timeout', '3601'],
    ['wait-idle', '--timeout', 'x'],
  ])
    await assert.rejects(exec(...args));
});

test('waypoints persist privately, list offline, refuse corrupt files, and goto checks the dimension first', {
  timeout: 20_000,
}, async (t) => {
  const { directory, driver, harness, exec, run, acquires } = await demoBridge(t, 'cli-batch3-waypoint-');
  const file = join(directory, 'waypoints.json');
  const offline = (...args) =>
    promisify(execFile)(
      process.execPath,
      [join(projectRoot, 'src/cli.js'), '--bridge', join(directory, 'missing.json'), ...args],
      { timeout: 10_000, env: { ...process.env, MC_AGENT_HOME: directory } },
    );
  assert.deepEqual(JSON.parse((await offline('waypoint', 'list')).stdout), { count: 0, waypoints: [], file });
  driver.player.position = { x: 2, y: 64, z: 0 };
  const here = await run('waypoint', 'add', 'start');
  assert.deepEqual(
    [here.saved.name, here.saved.x, here.saved.y, here.saved.z, here.saved.dimension, here.replaced, here.file],
    ['start', 2, 64, 0, 'minecraft:overworld', false, file],
  );
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  const nether = JSON.parse(
    (await offline('waypoint', 'add', 'portal', '--dimension', 'minecraft:the_nether', '8', '70', '-8')).stdout,
  );
  assert.deepEqual([nether.saved.x, nether.saved.z, nether.saved.dimension], [8, -8, 'minecraft:the_nether']);
  assert.equal((await run('waypoint', 'add', 'mine', '5', '64', '0')).saved.dimension, 'minecraft:overworld');
  const errors = await Promise.allSettled(
    [
      ['waypoint', 'add', 'Bad'],
      ['waypoint', 'add', 'x', '1', '2'],
      ['waypoint', 'add', 'x', '0', '321', '0', '--dimension', 'minecraft:overworld'],
      ['waypoint', 'add', 'x', '--dimension', 'minecraft:overworld'],
      ['waypoint', 'add', 'x', '1', '64', '1', '--dimension', 'nether'],
      ['waypoint', 'remove', 'nope'],
      ['waypoint', 'goto', 'nope'],
      ['waypoint', 'goto', '../x'],
      ['waypoint', 'goto', 'portal'],
      ['waypoint', 'add', 'mine', '6', '64', '0'],
    ]
      .map((args) => exec(...args))
      .concat([offline('waypoint', 'add', 'cave', '1', '2', '3'), offline('waypoint', 'list', '--distance')]),
  );
  assert.deepEqual(
    errors.map((result) => result.status),
    Array(errors.length).fill('rejected'),
  );
  assert.deepEqual(
    errors.map((result) => /Error: (.*)/.exec(result.reason.stderr)[1].slice(0, 20)),
    [
      'Waypoint names are 1',
      'Pass all three X Y Z',
      'Waypoint 0 321 0 is ',
      '--dimension applies ',
      'Use a dimension id s',
      'No waypoint named no',
      'No waypoint named no',
      'Waypoint names are 1',
      'Waypoint portal is i',
      'Waypoint mine alread',
      'No readable bridge a',
      'No readable bridge a',
    ],
  );
  assert.match(
    errors[8].reason.stderr,
    /Waypoint portal is in minecraft:the_nether but the player is in minecraft:overworld; not taking control/,
  );
  assert.match(errors[9].reason.stderr, /Waypoint mine already exists; pass --force/);
  assert.equal(acquires(), 0);
  assert.equal((await run('waypoint', 'add', 'mine', '6', '64', '0', '--force')).replaced, true);
  const [listed, measured] = await Promise.all([
    offline('waypoint', 'list').then((result) => JSON.parse(result.stdout)),
    run('waypoint', 'list', '--distance'),
  ]);
  assert.deepEqual(
    [listed.count, listed.waypoints.map((entry) => entry.name), listed.waypoints[0].distance],
    [3, ['mine', 'portal', 'start'], undefined],
  );
  assert.deepEqual(
    measured.waypoints.map((entry) => [entry.name, entry.distance]),
    [
      ['mine', 4],
      ['portal', null],
      ['start', 0],
    ],
  );
  const goto = await run('waypoint', 'goto', 'mine');
  assert.equal(goto.status, 'completed');
  assert.deepEqual(driver.player.position, { x: 6, y: 64, z: 0 });
  assert.equal(acquires(), 1);
  assert.equal(harness.observe().mode, 'manual');
  // A portal crossed between the first check and acquisition is caught under control, before any goto is sent.
  const jobs = harness.start.bind(harness);
  let started = 0;
  harness.start = (...args) => {
    started++;
    return jobs(...args);
  };
  const acquireOnce = harness.acquire;
  harness.acquire = (leaseId) => {
    const result = acquireOnce(leaseId);
    driver.player.dimension = 'minecraft:the_nether';
    return result;
  };
  await assert.rejects(
    exec('waypoint', 'goto', 'start'),
    /Waypoint start is in minecraft:overworld but the player is in minecraft:the_nether/,
  );
  assert.deepEqual([started, harness.observe().mode, driver.player.position], [0, 'manual', { x: 6, y: 64, z: 0 }]);
  harness.acquire = acquireOnce;
  driver.player.dimension = 'minecraft:overworld';
  assert.deepEqual(JSON.parse((await offline('waypoint', 'remove', 'portal')).stdout), {
    removed: 'portal',
    remaining: 2,
    file,
  });
  const saved = await readFile(file, 'utf8');
  assert.deepEqual(
    JSON.parse(saved).waypoints.map((entry) => entry.name),
    ['mine', 'start'],
  );
  await writeFile(file, '{"version":1,"waypoints":[{"name":"Bad"}]}');
  await Promise.all(
    [
      ['waypoint', 'list'],
      ['waypoint', 'add', 'new', '1', '64', '1', '--dimension', 'minecraft:overworld'],
      ['waypoint', 'remove', 'mine'],
    ].map((args) =>
      assert.rejects(
        offline(...args),
        /Waypoint file .*waypoints\.json is invalid \(waypoints\.0\.name.*fix or remove it/,
      ),
    ),
  );
  assert.equal(await readFile(file, 'utf8'), '{"version":1,"waypoints":[{"name":"Bad"}]}');
});

test('diff-snapshots compares two files offline and rejects unreadable or invalid snapshots', {
  timeout: 20_000,
}, async (t) => {
  const directory = await testDirectory(t, 'cli-batch3-diff-');
  const exec = (...args) =>
    promisify(execFile)(
      process.execPath,
      [join(projectRoot, 'src/cli.js'), '--bridge', join(directory, 'missing.json'), ...args],
      { timeout: 10_000 },
    );
  const later = demoState();
  later.player.position.x = 3;
  later.inventory[0].count = 6;
  const a = join(directory, 'a.json'),
    b = join(directory, 'b.json'),
    invalid = join(directory, 'invalid.json');
  await writeFile(a, JSON.stringify(snapshotView(demoState(), new Date('2026-01-01T00:00:00Z'))));
  await writeFile(b, JSON.stringify(snapshotView(later, new Date('2026-01-01T00:00:30Z'))));
  await writeFile(invalid, '{"savedAt":1}');
  const diff = JSON.parse((await exec('diff-snapshots', a, b)).stdout);
  assert.deepEqual(
    [diff.from, diff.to, diff.elapsedSeconds, diff.position.distanceMoved, diff.inventory],
    [
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:30.000Z',
      30,
      3,
      [{ name: 'minecraft:bread', from: 8, to: 6, delta: -2 }],
    ],
  );
  await assert.rejects(exec('diff-snapshots', a, invalid), (error) =>
    error.stderr.includes(`${invalid}: Snapshot is not a valid mc-agent snapshot (savedAt`),
  );
  await assert.rejects(
    exec('diff-snapshots', join(directory, 'none.json'), b),
    /Cannot read snapshot .*none\.json: ENOENT/,
  );
  await assert.rejects(exec('diff-snapshots', a));
});
