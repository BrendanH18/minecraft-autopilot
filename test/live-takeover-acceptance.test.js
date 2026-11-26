import test from 'node:test';
import assert from 'node:assert/strict';
import { LIFECYCLE_SCENARIOS } from '../src/lifecycle-scenarios.js';
import { REPLIES } from '../scripts/live-acceptance/console.js';
import { scenarios as shared } from '../scripts/live-acceptance/scenarios.js';
import {
  escapeCancelledStorage,
  FIRST_LANE,
  HOLD,
  NOT_SCRIPTED,
  probeAcquire,
  takeoverIds,
  takeoverScenarios,
} from '../scripts/live-acceptance/takeover-scenarios.js';
import { KEYS, keyPressCommands, pressKey, startFakeModel } from '../scripts/live-acceptance/takeover-tools.js';
import { buildPlan, formatPlan, formatSummary, main, parseOptions, summarize } from '../scripts/live-bot-acceptance.js';

const FABRIC = ['--backend', 'fabric'];

test('every scripted takeover scenario is a Fabric checklist item, and the rest are listed as not scripted', () => {
  const fabricChecklist = LIFECYCLE_SCENARIOS.filter((scenario) => scenario.manual.includes('fabric')).map(
    ({ id }) => id,
  );
  for (const id of takeoverIds) assert.ok(fabricChecklist.includes(id), id);
  assert.deepEqual(
    fabricChecklist.filter((id) => !takeoverIds.includes(id)),
    Object.keys(NOT_SCRIPTED),
  );
  assert.equal(new Set(takeoverIds).size, takeoverIds.length);
  for (const scenario of takeoverScenarios) {
    assert.deepEqual(scenario.backends, ['fabric']);
    assert.equal(scenario.takeover, true);
    assert.ok(!shared.some(({ id }) => id === scenario.id), `${scenario.id} collides with a shared scenario`);
  }
});

test('--takeover selects the Fabric checklist scenarios and only with the Fabric backend', () => {
  assert.throws(() => parseOptions(['--takeover']), /--takeover runs only with --backend fabric/);
  assert.throws(() => parseOptions(['--takeover', '--fast', ...FABRIC]), /Choose only one/);
  assert.throws(() => parseOptions(['--scenario', 'f8-idle']), /f8-idle runs only with --backend fabric/);
  assert.deepEqual(
    parseOptions(['--takeover', ...FABRIC]).scenarios.map(({ id }) => id),
    takeoverIds,
  );
  // --fast stays the shared table on both backends; --all adds the takeover scenarios only on Fabric.
  const fast = parseOptions(['--fast', ...FABRIC]).scenarios;
  assert.ok(fast.length && fast.every((scenario) => !scenario.takeover));
  assert.ok(parseOptions(['--all']).scenarios.every((scenario) => !scenario.takeover));
  assert.deepEqual(
    parseOptions(['--all', ...FABRIC])
      .scenarios.filter((scenario) => scenario.takeover)
      .map(({ id }) => id),
    takeoverIds,
  );
  assert.deepEqual(
    parseOptions(['--scenario', 'death-goto', '--scenario', 'f8-idle', ...FABRIC]).scenarios.map(({ id }) => id),
    ['f8-idle', 'death-goto'],
  );
});

test('the takeover dry run lists each scenario with known console replies, its own lane, and cleanup', async () => {
  const plan = buildPlan(parseOptions(['--dry-run', '--takeover', ...FABRIC]));
  assert.deepEqual(
    plan.scenarios.map(({ id }) => id),
    takeoverIds,
  );
  const known = (command) => Object.hasOwn(REPLIES, /^(?:execute in \S+ run )?(\S+)/.exec(command)[1]);
  const lanes = new Set();
  for (const scenario of plan.scenarios) {
    const entry = takeoverScenarios.find(({ id }) => id === scenario.id);
    assert.ok(entry.lane >= FIRST_LANE && !shared.some(({ lane }) => lane === entry.lane));
    lanes.add(entry.lane);
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
    assert.ok(scenario.prepare.includes('clear LiveFabric'));
    assert.ok(scenario.verify.includes('data get entity LiveFabric Pos'));
    for (const text of scenario.release) assert.match(text, /^pre-check only \(Fabric development client\): RELEASE/);
    assert.ok(
      scenario.expect.some((text) => /^independently: /.test(text)),
      scenario.id,
    );
    // A cancel keeps its lease, so only a manual outcome lists the old lease's refusal.
    const manual = LIFECYCLE_SCENARIOS.find(({ id }) => id === scenario.id).expect.mode === 'manual';
    assert.equal(
      scenario.actions.some((text) => /old lease/.test(text)),
      manual,
      scenario.id,
    );
  }
  assert.equal(lanes.size, takeoverIds.length);
  const byId = Object.fromEntries(plan.scenarios.map((scenario) => [scenario.id, scenario]));
  assert.match(byId['f8-collect'].actions[1], /press F8$/);
  assert.match(byId['menu-collect'].actions[1], /press E/);
  assert.match(byId['menu-idle'].actions.join('\n'), /let the held model request answer, then after 3 s press Escape/);
  assert.match(byId['stop-goto'].actions[1], /mc-agent stop/);
  assert.match(byId['expiry-idle'].actions[0], /--ollama <loopback stand-in>/);
  assert.match(byId['expiry-idle'].actions[1], /SIGSTOP/);
  assert.match(byId['expiry-goto'].actions[1], /SIGKILL/);
  assert.deepEqual(byId['death-goto'].during, ['kill LiveFabric']);
  assert.deepEqual(byId['disconnect-collect'].during, ['kick LiveFabric']);
  assert.ok(byId['disconnect-collect'].cleanup.every((command) => !command.includes('LiveFabric')));
  assert.match(byId['dimension-goto'].during[0], /^execute in minecraft:the_nether run tp LiveFabric /);
  assert.ok(byId['f8-eat'].fixture.includes('difficulty easy'));
  assert.ok(byId['f8-eat'].cleanup.includes('difficulty peaceful'));
  assert.ok(byId['f8-deposit'].prepare.includes('give LiveFabric minecraft:oak_log 320'));
  assert.equal(byId['f8-deposit'].verify.filter((command) => command.startsWith('data get block')).length, 2);
  assert.deepEqual(byId['inventory-full-collect'].during, ['give LiveFabric minecraft:dirt 64']);
  const text = formatPlan(plan);
  for (const id of takeoverIds) assert.ok(text.includes(`[${id}]`), id);
  assert.match(text, /never evidence for a RELEASE\.md box/);

  const printed = [];
  assert.equal(await main(['--dry-run', '--json', '--takeover', ...FABRIC], { print: (t) => printed.push(t) }), 0);
  assert.deepEqual(
    JSON.parse(printed[0]).scenarios.map(({ id }) => id),
    takeoverIds,
  );
  const warned = [];
  assert.equal(await main(['--takeover'], { warn: (t) => warned.push(t) }), 2);
  assert.match(warned.join('\n'), /--backend fabric/);
});

test('key presses focus the client window and press through xdotool', () => {
  assert.deepEqual(keyPressCommands('f8'), {
    search: ['xdotool', 'search', '--onlyvisible', '--name', '^Minecraft'],
    press: null,
  });
  assert.deepEqual(keyPressCommands('f8', 4194311).press, ['xdotool', 'windowfocus', '4194311', 'key', 'F8']);
  assert.deepEqual(keyPressCommands('escape', '7').press.at(-1), 'Escape');
  assert.deepEqual(keyPressCommands('inventory', '7').press.at(-1), 'e');
  assert.deepEqual(Object.keys(KEYS), ['f8', 'escape', 'inventory', 'tab', 'enter']);
  assert.throws(() => keyPressCommands('f9'), /Unknown key "f9"/);
});

test('pressKey finds the window, then focuses it and presses in one xdotool call', async () => {
  const calls = [];
  const execFileImpl = (command, args, options, callback) => {
    calls.push([command, ...args]);
    assert.ok(options.timeout > 0);
    callback(null, args[0] === 'search' ? '4194311\n4194399\n' : '', '');
  };
  assert.deepEqual(await pressKey('f8', { env: { DISPLAY: ':99' }, execFileImpl }), {
    key: 'f8',
    keysym: 'F8',
    window: '4194311',
    display: ':99',
  });
  assert.deepEqual(calls, [
    ['xdotool', 'search', '--onlyvisible', '--name', '^Minecraft'],
    ['xdotool', 'windowfocus', '4194311', 'key', 'F8'],
  ]);

  await assert.rejects(pressKey('f8', { env: {}, execFileImpl }), /\$DISPLAY is unset.*boat-check/);
  const missing = (_command, _args, _options, callback) =>
    callback(Object.assign(new Error('spawn xdotool ENOENT'), { code: 'ENOENT' }), '', '');
  await assert.rejects(pressKey('f8', { env: { DISPLAY: ':99' }, execFileImpl: missing }), /xdotool is not installed/);
  const none = (_command, _args, _options, callback) =>
    callback(Object.assign(new Error('exit 1'), { code: 1 }), '', '');
  await assert.rejects(pressKey('escape', { env: { DISPLAY: ':99' }, execFileImpl: none }), /No visible window/);
  const failing = (_command, args, _options, callback) =>
    args[0] === 'search'
      ? callback(null, '5\n', '')
      : callback(Object.assign(new Error('exit 1'), { code: 1 }), '', 'BadWindow');
  await assert.rejects(
    pressKey('escape', { env: { DISPLAY: ':99' }, execFileImpl: failing }),
    /xdotool windowfocus 5 key Escape failed: BadWindow/,
  );
});

test('the model stand-in holds each planner request until it is told to answer', async () => {
  const model = await startFakeModel([{ type: 'goto', x: 1, y: 2, z: 3 }]);
  try {
    assert.match(model.url, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.equal((await fetch(`${model.url}/api/tags`)).status, 404);
    let answered = false;
    const response = fetch(`${model.url}/api/chat`, { method: 'POST', body: '{"model":"x"}' }).then((reply) => {
      answered = true;
      return reply.json();
    });
    for (let i = 0; i < 50 && model.requests() < 1; i++) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(model.requests(), 1);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(answered, false);
    model.answer();
    const body = await response;
    assert.deepEqual(JSON.parse(body.message.content), { type: 'goto', x: 1, y: 2, z: 3 });
  } finally {
    await model.close();
  }
});

/** A fake client and server for one takeover scenario: `world` holds the bridge state the scenario observes. */
function fakeTakeover({ keyReaches = true, stopsMining = true } = {}) {
  let clock = 0;
  const world = { mode: 'manual', job: null, logs: 0, position: { x: 100.5, y: -60, z: 0.5 }, presses: [] };
  const checks = [];
  let pending = null;
  let lease = 0;
  const adapter = () => {
    const self = {
      leaseId: null,
      async execute(action) {
        self.leaseId = `lease-${++lease}`;
        world.mode = 'agent';
        world.lease = self.leaseId;
        if (action.type === 'wait') {
          world.mode = 'manual';
          return { status: 'completed', message: 'Wait finished.' };
        }
        world.job = { id: 'job-1', type: action.type, status: 'running', message: 'Started collect' };
        world.logs = 1;
        return new Promise((resolve, reject) => {
          pending = { resolve, reject };
        });
      },
      async cancel() {},
      async acquire() {},
      async request(_path, body) {
        if (body.leaseId !== world.lease || world.mode !== 'agent')
          throw new Error('Control was released or expired. Explicitly start a new session.');
        return { ok: true };
      },
      async close() {},
    };
    return self;
  };
  const ctx = {
    bot: 'LiveFabric',
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
      // Mining that was not stopped keeps adding logs.
      if (!stopsMining && world.job?.status === 'cancelled') world.logs++;
    },
    step: async (_name, fn) => fn(),
    note() {},
    check: (name, pass, detail) => checks.push({ name, pass: !!pass, detail }),
    connect: async () => adapter(),
    keys: {
      press: async (key) => {
        world.presses.push(key);
        if (!keyReaches || key !== 'f8') return { key };
        world.mode = 'manual';
        world.job = { ...world.job, status: 'cancelled', message: 'Control returned to the player with F8.' };
        pending?.reject(new Error('Control was returned to the player.'));
        return { key };
      },
    },
    bridge: {
      observe: async () => ({
        mode: world.mode,
        stopping: false,
        paused: false,
        job: world.job,
        inventory: world.logs ? [{ name: 'minecraft:oak_log', count: world.logs }] : [],
      }),
    },
    server: {
      position: async () => world.position,
      inventory: async () => (world.logs ? [{ id: 'minecraft:oak_log', count: world.logs }] : []),
      command: async () => 'ok',
    },
  };
  return { ctx, world, checks };
}

test('a scripted F8 takeover passes on matching bridge and server evidence and fails when it is missing', async () => {
  const scenario = takeoverScenarios.find(({ id }) => id === 'f8-collect');
  const plan = scenario.plan({ bot: 'LiveFabric', lane: scenario.lane });
  const good = fakeTakeover();
  await scenario.run(good.ctx, plan);
  assert.deepEqual(good.world.presses, ['f8']);
  assert.deepEqual(
    good.checks.filter((check) => !check.pass).map(({ name }) => name),
    [],
  );
  const names = good.checks.map(({ name }) => name);
  for (const expected of [
    /key press reached the game/,
    /mode becomes manual/,
    /job ends cancelled with a message matching/,
    /no further blocks broken/,
    /no further movement/,
    /old session cannot heartbeat or act/,
    /new session starts only when explicitly requested/,
  ])
    assert.ok(
      names.some((name) => expected.test(name)),
      String(expected),
    );

  const ignored = fakeTakeover({ keyReaches: false });
  await scenario.run(ignored.ctx, plan);
  const failed = ignored.checks.filter((check) => !check.pass).map(({ name }) => name);
  assert.ok(failed.some((name) => /key press reached the game/.test(name)));
  assert.ok(failed.some((name) => /mode becomes manual/.test(name)));

  const mining = fakeTakeover({ stopsMining: false });
  await scenario.run(mining.ctx, plan);
  assert.deepEqual(
    mining.checks.filter((check) => !check.pass).map(({ name }) => name),
    [
      'independently: no further blocks broken (`data get entity <player> Inventory` item counts stay the same 5 s apart)',
    ],
  );
});

test('an expected failure is reported with its reason and counted apart from failures', () => {
  const marked = takeoverScenarios.filter((scenario) => scenario.expectedFailure).map(({ id }) => id);
  assert.deepEqual(marked, ['menu-storage-close', 'menu-storage-close-withdraw']);
  const results = {
    backend: 'fabric',
    minecraft: { serverLog: '/run/server/server.out' },
    client: { log: '/run/client/client.out' },
    scenarios: [
      { id: 'f8-idle', status: 'pass', reason: null },
      { id: 'menu-storage-close', status: 'xfail', reason: 'Failed checks: x', expectedFailure: 'Not observable.' },
    ],
  };
  results.summary = summarize(results);
  assert.deepEqual(results.summary, { pass: 1, fail: 0, skipped: 0, expectedFail: 1, error: null });
  const text = formatSummary(results, '/run/results.json');
  assert.match(text, /1 pass, 0 fail, 1 expected failures, 0 skipped/);
  assert.match(text, /XFAIL {3}menu-storage-close — Failed checks: x \(expected: Not observable\.\)/);
  assert.deepEqual(summarize({ scenarios: [{ status: 'pass' }] }), { pass: 1, fail: 0, skipped: 0, error: null });
});

test('the storage-close expected failure needs Escape to have cancelled the same job', () => {
  const storage = /Storage screen was closed or replaced/i;
  const job = (message, extra = {}) => ({ id: 'job-1', status: 'cancelled', message, ...extra });
  const menu = (screen) => job(`A game menu was opened (${screen}). Control returned to the player.`);
  assert.ok(escapeCancelledStorage('job-1', menu('pause menu'), storage));
  assert.ok(escapeCancelledStorage('job-1', menu('pause'), storage));
  assert.ok(!escapeCancelledStorage('job-1', menu('GenericContainerScreen'), storage));
  assert.ok(!escapeCancelledStorage('job-1', menu('inventory'), storage));
  assert.ok(escapeCancelledStorage('job-1', job('Storage screen was closed or replaced.'), storage));
  // An unrelated cancellation, another job, a missing job, or one still running is not the explained failure.
  assert.ok(!escapeCancelledStorage('job-1', job('Cancelled by agent.'), storage));
  assert.ok(!escapeCancelledStorage('job-1', job('Storage screen was closed or replaced.', { id: 'job-2' }), storage));
  assert.ok(!escapeCancelledStorage('job-1', null, storage));
  assert.ok(!escapeCancelledStorage('job-1', { ...menu('pause menu'), status: 'running' }, storage));
  assert.ok(!escapeCancelledStorage(null, menu('pause menu'), storage));
});

/**
 * A fake client, server and proxy for the takeover-while-stopping scenarios. Holding the server's replies leaves the
 * agent's next container click unanswered (`pending`); a stop while it is pending shows `stopping` until released.
 */
function fakeHeldStop({ replyTooFast = false, gotoDuringHold = false, movesAfterStop = false } = {}) {
  let clock = 0;
  const world = {
    mode: 'manual',
    job: null,
    lease: null,
    pending: false,
    held: false,
    chest: 0,
    logs: 320,
    position: { x: 100.5, y: -60, z: 0.5 },
    stops: 0,
    proxyEvents: [],
    gotoArgs: null,
  };
  const checks = [];
  let interrupted = null;
  let gotoDone = null;
  const state = () => ({
    mode: world.mode,
    stopping: world.pending && world.mode === 'manual' && world.job?.status !== 'running',
    paused: false,
    job: world.job && { ...world.job },
    inventory: [{ name: 'minecraft:oak_log', count: world.logs }],
  });
  const refuseAcquire = () => {
    if (world.pending) throw new Error('Previous storage opening is still awaiting the server.');
    if (world.mode === 'agent') throw new Error('Another agent owns control. Stop it or press F8 first.');
  };
  const adapter = () => {
    const self = {
      leaseId: null,
      async execute(action) {
        refuseAcquire();
        self.leaseId = `lease-${action.type}`;
        world.lease = self.leaseId;
        world.mode = 'agent';
        world.job = { id: 'job-1', type: action.type, status: 'running', message: `Started ${action.type}` };
        // The first stack moves before the hold.
        world.logs -= 64;
        world.chest += 64;
        return new Promise((_resolve, reject) => {
          interrupted = reject;
        });
      },
      async request(path, body) {
        if (path === '/v1/control' && body.action === 'acquire') {
          refuseAcquire();
          return { ok: true };
        }
        if (path === '/v1/control' && body.action === 'release') return { ok: true };
        if (body.leaseId !== world.lease || world.mode !== 'agent')
          throw new Error('Control was released or expired. Explicitly start a new session.');
        return { ok: true };
      },
      async close() {},
    };
    return self;
  };
  const proxy = {
    pause(direction) {
      world.proxyEvents.push(`pause ${direction}`);
      world.held = true;
      // The agent clicks again within a tick; with the reply held, the opening stays unanswered.
      if (!replyTooFast) world.pending = true;
      return {};
    },
    resume(direction) {
      world.proxyEvents.push(`resume ${direction}`);
      world.held = false;
      world.pending = false;
      return { held: { toServer: 0, toClient: 512 } };
    },
    stats: () => ({ held: { toClient: world.held ? 512 : 0 } }),
  };
  const ctx = {
    bot: 'LiveFabric',
    proxy,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
      if (movesAfterStop && world.mode === 'manual' && world.job?.status === 'cancelled') world.chest++;
      if (gotoDone && !world.pending) {
        const [, x, y, z] = world.gotoArgs.map(Number);
        world.position = { x: x + 0.5, y, z: z + 0.5 };
        gotoDone({ code: 0, stdout: JSON.stringify({ type: 'goto', status: 'completed' }), stderr: '' });
        gotoDone = null;
      }
    },
    step: async (_name, fn) => fn(),
    note() {},
    check: (name, pass, detail) => checks.push({ name, pass: !!pass, detail }),
    connect: async () => adapter(),
    cliStop: async () => {
      world.stops++;
      world.mode = 'manual';
      world.lease = null;
      world.job = { ...world.job, status: 'cancelled', message: 'Emergency stop requested.' };
      interrupted?.(new Error('Control was returned to the player.'));
      return { code: 0, stdout: '{"ok":true}', stderr: '' };
    },
    cli: {
      start: (args) => {
        world.gotoArgs = args;
        if (gotoDuringHold) world.job = { id: 'job-2', type: 'goto', status: 'running', message: 'Started goto' };
        const exited = new Promise((resolve) => {
          gotoDone = resolve;
        });
        return { exited, output: () => ({ stdout: '', stderr: '' }), stop: async () => ({}) };
      },
    },
    bridge: { observe: async () => state() },
    server: {
      position: async () => world.position,
      inventory: async () => [{ id: 'minecraft:oak_log', count: world.logs }],
      items: async () => (world.chest ? [{ id: 'minecraft:oak_log', count: world.chest }] : []),
      command: async () => 'ok',
    },
  };
  return { ctx, world, checks };
}

const HELD_IDS = [
  'takeover-while-stopping-deposit',
  'takeover-while-stopping-withdraw',
  'takeover-while-stopping-craft',
];

test('the takeover-while-stopping items are scripted with the proxy and the dry run says how', () => {
  const plan = buildPlan(parseOptions(['--dry-run', '--takeover', ...FABRIC]));
  for (const id of HELD_IDS) {
    const scenario = plan.scenarios.find((entry) => entry.id === id);
    assert.ok(scenario, id);
    assert.equal(scenario.proxy, true);
    const actions = scenario.actions.join('\n');
    assert.match(actions, /hold the server's replies/);
    assert.match(actions, /refused as "awaiting the server"/);
    assert.match(actions, /mc-agent stop/);
    assert.match(actions, /mc-agent goto -?\d+ -60 -?\d+ \(three blocks west\)/);
    assert.match(actions, /capped at 8 s, under the 15 s keep-alive/);
    assert.match(actions, /old lease/);
  }
  const craft = plan.scenarios.find(({ id }) => id === 'takeover-while-stopping-craft');
  assert.ok(craft.prepare.includes('give LiveFabric minecraft:oak_planks 32'));
  assert.match(craft.actions[0], /^proxy: hold the server's replies to the client; then bridge: craft chest 4/);
  assert.ok(HOLD.clickMs + HOLD.newSessionMs < HOLD.maxMs && HOLD.maxMs < 15_000);
  assert.ok(plan.scenarios.every((scenario) => scenario.proxy === true));
  assert.match(formatPlan(plan), /pausable loopback TCP proxy/);
});

test('a held container reply shows stopping, keeps the new session waiting, and passes once it settles', async () => {
  const scenario = takeoverScenarios.find(({ id }) => id === 'takeover-while-stopping-deposit');
  const plan = scenario.plan({ bot: 'LiveFabric', lane: scenario.lane });
  assert.deepEqual(plan.points.near, { x: plan.origin.x - 3, y: plan.points.far.y, z: plan.origin.z });
  const good = fakeHeldStop();
  await scenario.run(good.ctx, plan);
  assert.deepEqual(
    good.checks.filter((check) => !check.pass).map(({ name }) => name),
    [],
  );
  assert.deepEqual(good.world.proxyEvents, ['pause toClient', 'resume toClient']);
  assert.equal(good.world.stops, 1);
  assert.deepEqual(good.world.gotoArgs, [
    'goto',
    ...[plan.points.near.x, plan.points.near.y, plan.points.near.z].map(String),
  ]);
  const names = good.checks.map(({ name }) => name);
  for (const expected of [
    /reply was held: a fresh acquire was refused as awaiting the server/,
    /showed stopping: true after the stop/,
    /job ends cancelled with a message matching \/Emergency stop requested\/i/,
    /while stopping is true a new session cannot start work/,
    /stopping clears once the released reply settles/,
    /no further items moved into the container/,
    /new session then starts work: mc-agent goto completes/,
    /old session cannot heartbeat or act/,
  ])
    assert.ok(
      names.some((name) => expected.test(name)),
      String(expected),
    );
});

test('a reply too fast to hold is reported as not observed, never as a pass', async () => {
  const scenario = takeoverScenarios.find(({ id }) => id === 'takeover-while-stopping-craft');
  const plan = scenario.plan({ bot: 'LiveFabric', lane: scenario.lane });
  const fast = fakeHeldStop({ replyTooFast: true });
  await scenario.run(fast.ctx, plan);
  const failed = fast.checks.filter((check) => !check.pass).map(({ name }) => name);
  assert.equal(failed.length, 1);
  assert.match(failed[0], /^not observed: /);
  // The craft holds the replies before it starts, and the hold is always released.
  assert.deepEqual(fast.world.proxyEvents, ['pause toClient', 'resume toClient']);
  assert.equal(fast.world.stops, 0);
});

test('a new session that starts work while stopping, or items that move after the stop, fail the scenario', async () => {
  const scenario = takeoverScenarios.find(({ id }) => id === 'takeover-while-stopping-withdraw');
  const plan = scenario.plan({ bot: 'LiveFabric', lane: scenario.lane });
  const early = fakeHeldStop({ gotoDuringHold: true });
  await scenario.run(early.ctx, plan);
  assert.ok(
    early.checks.some(
      (check) => !check.pass && /while stopping is true a new session cannot start work/.test(check.name),
    ),
  );
  const moving = fakeHeldStop({ movesAfterStop: true });
  await scenario.run(moving.ctx, plan);
  assert.ok(moving.checks.some((check) => !check.pass && /no further items taken from the container/.test(check.name)));
  assert.deepEqual(moving.world.proxyEvents, ['pause toClient', 'resume toClient']);
});

test('without the proxy the held-stop scenarios fail instead of running', async () => {
  const scenario = takeoverScenarios.find(({ id }) => id === 'takeover-while-stopping-deposit');
  const plan = scenario.plan({ bot: 'LiveFabric', lane: scenario.lane });
  const rig = fakeHeldStop();
  rig.ctx.proxy = null;
  await scenario.run(rig.ctx, plan);
  assert.deepEqual(
    rig.checks.map(({ name, pass }) => [name, pass]),
    [["the client joined through the runner's pausable proxy", false]],
  );
});

test('probeAcquire reports a refusal as awaiting the server and releases an accepted probe', async () => {
  const refusing = {
    request: async () => {
      throw new Error('Previous storage opening is still awaiting the server.');
    },
  };
  assert.deepEqual(await probeAcquire(refusing), {
    refused: true,
    awaiting: true,
    message: 'Previous storage opening is still awaiting the server.',
  });
  const busy = {
    request: async () => {
      throw new Error('Another agent owns control. Stop it or press F8 first.');
    },
  };
  assert.equal((await probeAcquire(busy)).awaiting, false);
  const calls = [];
  const accepting = {
    request: async (path, body) => {
      calls.push([path, body.action, body.leaseId]);
      return { ok: true };
    },
  };
  assert.deepEqual(await probeAcquire(accepting), { refused: false, awaiting: false });
  assert.deepEqual(
    calls.map(([path, action]) => [path, action]),
    [
      ['/v1/control', 'acquire'],
      ['/v1/control', 'release'],
    ],
  );
  assert.equal(calls[0][2], calls[1][2]);
});
