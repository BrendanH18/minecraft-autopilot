import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { projectRoot } from '../src/config.js';
import { runAgent } from '../src/agent.js';
import {
  createObjective,
  parseTimeBudgetCriterion,
  parseTotalCriterion,
  parseWaypointCriterion,
  resolveWaypointCriterion,
} from '../src/objective.js';
import { Harness } from '../src/harness.js';
import { DemoDriver } from '../src/demo-driver.js';
import { startBridge } from '../src/bridge-server.js';
import { testDirectory } from './helpers.js';

const OVERWORLD = 'minecraft:overworld';
function state() {
  return {
    connected: true,
    mode: 'agent',
    player: { uuid: 'player-1', dimension: OVERWORLD, health: 20, position: { x: 0, y: 64, z: 0 } },
    inventory: [{ name: 'minecraft:cobblestone', count: 10 }],
    containers: [
      { name: 'minecraft:chest', x: 3, y: 64, z: 0, items: [{ name: 'minecraft:cobblestone', count: 20 }] },
      { name: 'minecraft:chest', x: 5, y: 64, z: 0, items: null },
    ],
  };
}

test('total, waypoint, and time-budget criteria parse and reject out-of-range values', () => {
  assert.deepEqual(parseTotalCriterion('cobblestone:128'), { item: 'minecraft:cobblestone', count: 128 });
  assert.deepEqual(parseTotalCriterion('minecraft:oak_log:100000'), { item: 'minecraft:oak_log', count: 100_000 });
  for (const bad of ['cobblestone:0', 'cobblestone:100001', 'cobblestone', 'Cobble:1'])
    assert.throws(() => parseTotalCriterion(bad), /total from 1 to 100000/);
  assert.deepEqual(parseWaypointCriterion('base'), { name: 'base', radius: 2 });
  assert.deepEqual(parseWaypointCriterion('mine-1,4.5'), { name: 'mine-1', radius: 4.5 });
  for (const bad of ['base,65', 'base,-1', 'base,x']) assert.throws(() => parseWaypointCriterion(bad), /0 to 64/);
  for (const bad of ['', 'base,', 'base,1,2']) assert.throws(() => parseWaypointCriterion(bad), /name or name,radius/);
  assert.throws(() => parseWaypointCriterion('Base'), /Waypoint names/);
  assert.equal(parseTimeBudgetCriterion('90'), 90);
  for (const bad of ['0', '86401', '1.5', '-3', 'soon', ''])
    assert.throws(() => parseTimeBudgetCriterion(bad), /1 to 86400/);
  const saved = [{ name: 'base', x: 10, y: 64, z: -4, dimension: OVERWORLD, savedAt: '2026-11-27T00:00:00.000Z' }];
  assert.deepEqual(resolveWaypointCriterion({ name: 'base', radius: 3 }, saved), {
    name: 'base',
    x: 10,
    y: 64,
    z: -4,
    dimension: OVERWORLD,
    radius: 3,
  });
  assert.throws(() => resolveWaypointCriterion({ name: 'mine', radius: 2 }, saved), /No waypoint named mine/);
});

test('a total counts held items alone, and opened storage only once it has been refreshed', () => {
  const objective = createObjective({ total: { item: 'cobblestone', count: 25 } }, state());
  const initial = objective.check(state());
  assert.deepEqual(initial.checks.total, {
    item: 'minecraft:cobblestone',
    held: 10,
    stored: 20,
    total: 30,
    required: 25,
    evidence: 'last_observed',
    met: false,
  });
  assert.equal(objective.check(state(), { storageRefreshed: true }).met, true);
  // Held items alone prove the total without any storage read.
  const rich = state();
  rich.inventory = [
    { name: 'minecraft:cobblestone', count: 20 },
    { name: 'minecraft:cobblestone', count: 5 },
  ];
  assert.equal(objective.check(rich).checks.total.met, true);
  // Separate opened containers add up.
  const two = state();
  two.containers.push({ x: 7, y: 64, z: 0, items: [{ name: 'minecraft:cobblestone', count: 6 }] });
  const both = createObjective({ total: { item: 'cobblestone', count: 36 } }, two).check(two, {
    storageRefreshed: true,
  });
  assert.equal(both.checks.total.stored, 26);
  assert.equal(both.met, true);
  // Unopened storage counts nothing, and a double chest reported at both halves counts once.
  const double = state();
  double.containers = [
    { x: 3, y: 64, z: 0, members: [{ x: 3, y: 64, z: 1 }], items: [{ name: 'minecraft:cobblestone', count: 9 }] },
    { x: 3, y: 64, z: 1, members: [{ x: 3, y: 64, z: 0 }], items: [{ name: 'minecraft:cobblestone', count: 9 }] },
    { x: 8, y: 64, z: 0, items: null },
  ];
  const doubled = objective.check(double, { storageRefreshed: true }).checks.total;
  assert.equal(doubled.stored, 9);
  assert.equal(doubled.met, false);
  // Another player's view or a missing inventory never counts.
  const other = state();
  other.player.uuid = 'other';
  assert.equal(objective.check(other, { storageRefreshed: true }).checks.total.held, null);
  const missing = state();
  delete missing.inventory;
  assert.equal(objective.check(missing, { storageRefreshed: true }).checks.total.met, false);
  const noStorage = state();
  delete noStorage.containers;
  assert.throws(
    () => createObjective({ total: { item: 'cobblestone', count: 1 } }, noStorage),
    /does not report container contents/,
  );
});

test('a waypoint criterion needs the same dimension and a final position within its radius', () => {
  const waypoint = { name: 'base', x: 10, y: 64, z: 0, dimension: OVERWORLD, radius: 3 };
  const objective = createObjective({ waypoint }, state());
  assert.deepEqual(objective.description.waypoint, waypoint);
  assert.equal(objective.check(state()).checks.waypoint.distance, 10);
  assert.equal(objective.check(state()).met, false);
  const near = state();
  near.player.position = { x: 8, y: 64, z: 1 };
  assert.equal(objective.check(near).met, true);
  delete near.player.position;
  assert.equal(objective.check(near).checks.waypoint.distance, null);
  assert.throws(
    () => createObjective({ waypoint: { ...waypoint, dimension: 'minecraft:the_nether' } }, state()),
    /Waypoint base is in minecraft:the_nether, but the player is in minecraft:overworld/,
  );
  assert.equal(
    createObjective({ waypoint: { name: 'base', x: 0, y: 64, z: 0, dimension: OVERWORLD } }, state()).description
      .waypoint.radius,
    2,
  );
  assert.throws(() => createObjective({ waypoint: { ...waypoint, name: 'Bad Name' } }, state()));
});

test('a time budget is measured from the task start and expires for good', () => {
  let now = 1_000;
  const objective = createObjective({ timeBudget: 60 }, state(), { startedAt: 1_000, clock: () => now });
  assert.deepEqual(objective.description.timeBudget, { seconds: 60 });
  assert.deepEqual(objective.check(state()).checks.timeBudget, {
    elapsedSeconds: 0,
    budgetSeconds: 60,
    remainingSeconds: 60,
    met: true,
  });
  now = 61_000;
  assert.equal(objective.check(state()).met, true);
  assert.equal(objective.budgetExpired(), false);
  now = 61_001;
  assert.equal(objective.check(state()).met, false);
  assert.equal(objective.check(state()).checks.timeBudget.remainingSeconds, 0);
  assert.equal(objective.budgetExpired(), true);
  assert.equal(createObjective({ returnHome: false }, state()), null);
});

function storageAdapter({ inspectError } = {}) {
  return {
    state: { ...state(), mode: 'manual', backend: 'mineflayer' },
    actions: [],
    async observe() {
      return structuredClone(this.state);
    },
    async acquire() {
      this.state.mode = 'agent';
    },
    async execute(action) {
      this.actions.push(action);
      if (action.type === 'inspect_storage') {
        if (inspectError) throw new Error(inspectError);
        // The live read shows another player took 15 from the chest.
        this.state.containers[0].items = [{ name: 'minecraft:cobblestone', count: 5 }];
      }
      if (action.type === 'collect') this.state.inventory[0].count += action.count;
      if (action.type === 'wait') this.clock.now += action.seconds * 1000;
      return { status: 'completed' };
    },
    async release() {
      this.state.mode = 'manual';
    },
  };
}
const reply = (decision) =>
  new Response(JSON.stringify({ message: { content: JSON.stringify(decision) } }), { status: 200 });
const scripted = (decisions, bodies = []) => {
  const queue = [...decisions];
  return async (_url, request) => {
    bodies.push(JSON.parse(request.body));
    return reply(queue.length > 1 ? queue.shift() : queue[0]);
  };
};
const quiet = { model: 'test', log() {} };

test('the agent reopens every opened container before a total counts storage', async () => {
  const adapter = storageAdapter();
  const done = { type: 'done', reason: 'Enough cobblestone between inventory and chest.' };
  const stale = await runAgent(adapter, 'Have 25 cobblestone', {
    ...quiet,
    criteria: { total: { item: 'cobblestone', count: 25 } },
    fetchImpl: scripted([done]),
  });
  // The last-observed chest said 20 (total 30); the live read says 5 (total 15), so success is refused.
  assert.deepEqual(
    adapter.actions.filter((action) => action.type === 'inspect_storage'),
    [{ type: 'inspect_storage' }, { type: 'inspect_storage' }, { type: 'inspect_storage' }],
  );
  assert.equal(stale.status, 'criteria_unmet');
  assert.equal(stale.verification.checks.total.total, 15);
  assert.equal(stale.verification.checks.total.evidence, 'refreshed');

  const collecting = storageAdapter();
  const met = await runAgent(collecting, 'Have 25 cobblestone', {
    ...quiet,
    criteria: { total: { item: 'cobblestone', count: 25 } },
    fetchImpl: scripted([{ type: 'collect', block: 'cobblestone', count: 10 }, done]),
  });
  assert.equal(met.status, 'criteria_met');
  assert.deepEqual(met.verification.checks.total, {
    item: 'minecraft:cobblestone',
    held: 20,
    stored: 5,
    total: 25,
    required: 25,
    evidence: 'refreshed',
    met: true,
  });

  const blocked = storageAdapter({ inspectError: 'The chest at 3 64 0 did not open.' });
  const failed = await runAgent(blocked, 'Have 25 cobblestone', {
    ...quiet,
    criteria: { total: { item: 'cobblestone', count: 25 } },
    fetchImpl: scripted([done]),
  });
  assert.equal(failed.status, 'criteria_unmet');
  assert.equal(failed.verification.checks.total.met, false);
  assert.equal(failed.verification.checks.total.evidence, 'last_observed');
  assert.match(failed.verification.checks.total.error, /did not open/);

  // Held items that already prove the total need no storage trip.
  const holding = storageAdapter();
  holding.state.inventory[0].count = 30;
  const held = await runAgent(holding, 'Have 25 cobblestone', {
    ...quiet,
    criteria: { total: { item: 'cobblestone', count: 25 } },
    fetchImpl: scripted([done]),
  });
  assert.equal(held.status, 'criteria_met');
  assert.deepEqual(holding.actions, []);
  assert.equal(held.verification.checks.total.evidence, 'last_observed');
});

test('a spent time budget stops the task between actions with time_budget', async () => {
  const realNow = Date.now;
  const clock = { now: realNow() };
  Date.now = () => clock.now;
  try {
    const adapter = storageAdapter();
    adapter.clock = clock;
    const bodies = [];
    const result = await runAgent(adapter, 'Wait around', {
      ...quiet,
      criteria: { timeBudget: 30 },
      fetchImpl: scripted(
        [
          { type: 'wait', seconds: 20 },
          { type: 'wait', seconds: 20 },
          { type: 'collect', block: 'cobblestone', count: 1 },
        ],
        bodies,
      ),
    });
    assert.equal(result.status, 'time_budget');
    assert.match(result.reason, /30-second time budget ran out/);
    assert.equal(result.steps, 2);
    assert.equal(result.verification.met, false);
    assert.equal(result.verification.checks.timeBudget.elapsedSeconds, 40);
    assert.deepEqual(
      adapter.actions.map((action) => action.type),
      ['wait', 'wait'],
    );
    assert.equal(adapter.state.mode, 'manual');
    // The model sees the remaining time in its progress.
    const progress = JSON.parse(bodies[1].messages[1].content).progress;
    assert.equal(progress.checks.timeBudget.remainingSeconds, 10);

    // A decision that arrives after the budget ran out is not dispatched.
    const late = storageAdapter();
    const slow = async (url, request) => {
      clock.now += 31_000;
      return scripted([{ type: 'collect', block: 'cobblestone', count: 1 }])(url, request);
    };
    const stopped = await runAgent(late, 'Collect', { ...quiet, criteria: { timeBudget: 30 }, fetchImpl: slow });
    assert.equal(stopped.status, 'time_budget');
    assert.equal(stopped.steps, 1);
    assert.deepEqual(late.actions, []);

    // A done after the budget ran out is not verified, so a total starts no storage inspection.
    const lateDone = storageAdapter();
    const slowDone = async (url, request) => {
      clock.now += 31_000;
      return scripted([{ type: 'done', reason: 'Finished.' }])(url, request);
    };
    const overrun = await runAgent(lateDone, 'Count cobblestone', {
      ...quiet,
      criteria: { timeBudget: 30, total: { item: 'cobblestone', count: 25 } },
      fetchImpl: slowDone,
    });
    assert.equal(overrun.status, 'time_budget');
    assert.deepEqual(lateDone.actions, []);

    // A budget spent during the final storage inspection ends the task with that verification.
    const slowChest = storageAdapter();
    slowChest.clock = clock;
    const execute = slowChest.execute.bind(slowChest);
    slowChest.execute = async (action) => {
      if (action.type === 'inspect_storage') clock.now += 31_000;
      return execute(action);
    };
    const inspecting = await runAgent(slowChest, 'Count cobblestone', {
      ...quiet,
      criteria: { timeBudget: 30, total: { item: 'cobblestone', count: 25 } },
      fetchImpl: scripted([{ type: 'done', reason: 'Finished.' }]),
    });
    assert.equal(inspecting.status, 'time_budget');
    assert.match(inspecting.reason, /during final verification/);
    assert.equal(inspecting.verification.checks.total.evidence, 'refreshed');
    assert.equal(slowChest.actions.length, 1);

    // With a scoped deposit criterion too, a budget the total's inspection spent starts no deposit inspection.
    const both = storageAdapter();
    const run = both.execute.bind(both);
    both.execute = async (action) => {
      if (action.type === 'inspect_storage') clock.now += 31_000;
      if (action.type !== 'deposit') return run(action);
      both.actions.push(action);
      both.state.inventory[0].count -= 5;
      both.state.containers[0].items = [{ name: 'minecraft:cobblestone', count: 25 }];
      const before = [{ name: 'minecraft:cobblestone', count: 20 }];
      return { status: 'completed', container: { name: 'minecraft:chest', x: 3, y: 64, z: 0, before } };
    };
    const skipped = await runAgent(both, 'Store and count cobblestone', {
      ...quiet,
      criteria: {
        timeBudget: 30,
        total: { item: 'cobblestone', count: 25 },
        deposit: { item: 'cobblestone', count: 5 },
      },
      fetchImpl: scripted([
        { type: 'deposit', item: 'cobblestone', count: 5 },
        { type: 'done', reason: 'Stored.' },
      ]),
    });
    assert.equal(skipped.status, 'time_budget');
    assert.deepEqual(
      both.actions.map(({ type, containers }) => (containers ? `${type} scoped` : type)),
      ['deposit', 'inspect_storage'],
    );
    assert.match(skipped.verification.checks.deposit.error, /time budget ran out/);
  } finally {
    Date.now = realNow;
  }
});

test('a time budget cuts off a model request that outlasts it and returns time_budget', async (t) => {
  // AbortSignal.timeout does not keep Node alive, and the fake request holds no handle of its own.
  const keepAlive = setInterval(() => {}, 1000);
  t.after(() => clearInterval(keepAlive));
  const adapter = storageAdapter();
  let aborted = false;
  // Never answers; only the request's signal ends it.
  const hanging = (_url, request) =>
    new Promise((_resolve, reject) =>
      request.signal.addEventListener('abort', () => {
        aborted = true;
        reject(request.signal.reason);
      }),
    );
  const result = await runAgent(adapter, 'Think for a long time', {
    ...quiet,
    criteria: { timeBudget: 1 },
    fetchImpl: hanging,
  });
  assert.equal(aborted, true);
  assert.equal(result.status, 'time_budget');
  assert.equal(result.steps, 0);
  assert.equal(adapter.state.mode, 'manual');
});

function cli(args, env) {
  return new Promise((resolve) =>
    execFile(
      process.execPath,
      [join(projectRoot, 'src/cli.js'), ...args],
      { timeout: 15_000, env },
      (error, stdout, stderr) => resolve({ error, stdout, stderr }),
    ),
  );
}

test('the agent CLI resolves --verify-waypoint from saved waypoints and checks the other criteria', {
  timeout: 30_000,
}, async (t) => {
  const directory = await testDirectory(t, 'criteria-cli-');
  const discoveryPath = join(directory, 'bridge.json');
  const bridge = await startBridge(new Harness(new DemoDriver()), { discoveryPath });
  t.after(() => bridge.close());
  const replies = [];
  const server = createServer(async (request, response) => {
    for await (const _chunk of request);
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ message: { content: JSON.stringify(replies.shift()) } }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const env = { ...process.env, MC_AGENT_HOME: directory };
  for (const name of ['MC_AGENT_MODEL', 'MC_AGENT_OLLAMA']) delete env[name];
  const url = `http://127.0.0.1:${server.address().port}`;
  const agent = (...args) =>
    cli(['--bridge', discoveryPath, 'agent', 'Walk to base', '--model', 'mock', '--ollama', url, ...args], env);

  const missing = await agent('--verify-waypoint', 'base', '--dry-run');
  assert.notEqual(missing.error, null);
  assert.match(missing.stderr, /No waypoint named base/);

  // The demo player starts at 0 64 0 holding eight bread.
  const position = { x: 1, y: 64, z: 1 };
  await writeFile(
    join(directory, 'waypoints.json'),
    JSON.stringify({
      version: 1,
      waypoints: [{ name: 'base', ...position, dimension: 'minecraft:overworld', savedAt: '2026-11-27T00:00:00.000Z' }],
    }),
  );
  replies.push({ type: 'done', reason: 'Already at base.' });
  const run = await agent('--verify-waypoint', 'base,3', '--verify-within', '600', '--verify-total', 'bread:8');
  assert.equal(run.error, null, run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.verification.checks.waypoint.name, 'base');
  assert.equal(result.verification.checks.waypoint.radius, 3);
  assert.equal(result.verification.checks.timeBudget.budgetSeconds, 600);
  assert.equal(result.verification.checks.timeBudget.met, true);
  assert.equal(result.status, 'criteria_met');
  assert.equal(result.verification.checks.total.held, 8);

  const invalid = await agent('--verify-within', '0', '--dry-run');
  assert.notEqual(invalid.error, null);
  assert.match(invalid.stderr, /1 to 86400/);
});
