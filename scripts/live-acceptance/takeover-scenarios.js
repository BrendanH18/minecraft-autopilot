// Fabric-only takeover and lifecycle scenarios: the person-free part of the Fabric checklist in
// docs/LIFECYCLE-SCENARIOS.md, run against the headless development client. Each scenario takes its expected
// outcome from src/lifecycle-scenarios.js and checks it with independent server reads. Keys are real X key presses on
// the Xvfb display (xdotool), so this is a pre-check: it never proves the packaged mod in a normal launcher.
import { randomUUID } from 'node:crypto';
import { HALTS, LIFECYCLE_SCENARIOS, describeExpectation } from '../../src/lifecycle-scenarios.js';
import { bridgeItemTotals, distance, itemTotals, parseDataReply, sameTotals } from './nbt-parse.js';
import { LOG, laneOrigin, STAND, scriptedPlanner } from './scenarios.js';

// Lanes 40 and up, clear of the shared scenario table's lanes.
export const FIRST_LANE = 40;
const NETHER = 'minecraft:the_nether';
const OVERWORLD = 'minecraft:overworld';
const BREAD = 'minecraft:bread';
const PLANKS = 'minecraft:oak_planks';
const CHEST = 'minecraft:chest';
const SAND = 'minecraft:sand';
const RETURNING = /returning to where collection started/;
const GOAL = 'Walk east along the lane.';
export const MODEL = 'scripted-acceptance-planner';
// Held logs for storage scenarios: five stacks, so a takeover lands between stacks with some still to move.
const STACKS = 5;
// Food is lowered to this before eating. A released session never eats on its own; a session that keeps control
// (cancel) would start the automatic eating reflex at 16 or less, so cancel-eat stops above it.
const HUNGRY = 12;
const PECKISH = 18;

export const RELEASE_TAKEOVER = {
  takeover:
    'RELEASE.md: "Press F8 during inference/action; close the menu afterward and verify no command resumes. Check emergency stop and lease expiry with the packaged mod."',
  eating:
    'RELEASE.md: "With the packaged Fabric mod, force failed food consumption while hungry and low on health. ... interrupt eating and recovery with F8 and stop." (interruption cases)',
  deposits:
    'RELEASE.md: "Validate Fabric chest/barrel deposits ... and F8/menu/stop/expiry during transfers." (takeover cases)',
  withdrawCraft:
    'RELEASE.md: "Validate Fabric withdraw ... and craft ..., with F8/menu/stop/expiry during each." (takeover cases)',
  dimension:
    'RELEASE.md: "Validate cobblestone with a pickaxe, hostile observations, and release on dimension change." (release on dimension change)',
};

const at = (o, dx, y, dz) => `${o.x + dx} ${y} ${o.z + dz}`;
const point = (o, dx, y, dz) => ({ x: o.x + dx, y, z: o.z + dz });
const center = (p) => ({ x: p.x + 0.5, y: p.y, z: p.z + 0.5 });

/**
 * The fixture for one scenario: a cleared 64-block lane with a start, a walk target 40 blocks east, and what the
 * activity needs (trees, two sand blocks, a double chest, a crafting table, food, or a Nether landing pad).
 */
export function takeoverPlan({ bot, lane }, fixture) {
  const o = laneOrigin(lane);
  const start = center(point(o, 0, STAND, 0));
  const far = point(o, 40, STAND, 0);
  const forceload = (verb) => `forceload ${verb} ${o.x - 16} ${o.z - 16} ${o.x + 56} ${o.z + 16}`;
  const clearArea = `fill ${at(o, -8, STAND, -4)} ${at(o, 44, STAND + 3, 4)} air`;
  const killDrops = `kill @e[type=item,x=${o.x + 20},y=${STAND},z=${o.z},distance=..48]`;
  const chest = point(o, 2, STAND, 0);
  const otherHalf = point(o, 2, STAND, -1);
  const pad = { x: 8, y: 200, z: 8 };
  const landing = { x: pad.x + 2.5, y: pad.y + 1, z: pad.z + 2.5 };
  const nether = `execute in ${NETHER} run`;
  const trees = Array.from({ length: 3 }, (_, dx) =>
    Array.from({ length: 2 }, (_, dy) => Array.from({ length: 3 }, (_, dz) => point(o, -6 + dx, STAND + dy, -1 + dz))),
  ).flat(2);
  const plan = {
    origin: o,
    fixtureKind: fixture,
    points: { start, far },
    hooks: {},
    reads: [],
    fixture: [forceload('add'), clearArea],
    prepare: [`clear ${bot}`, `effect clear ${bot}`, `tp ${bot} ${start.x} ${start.y} ${start.z}`],
    cleanup: [`clear ${bot}`, `effect clear ${bot}`, clearArea, killDrops, forceload('remove')],
  };
  // With the player offline (kicked) or dead, commands that name the player fail; the next scenario resets it.
  const worldOnlyCleanup = () => {
    plan.cleanup = plan.cleanup.filter((command) => !command.includes(bot));
  };
  switch (fixture) {
    case 'ground':
      break;
    case 'death':
      worldOnlyCleanup();
      break;
    case 'nether':
      plan.points.landing = landing;
      plan.hooks.teleport = `${nether} tp ${bot} ${landing.x} ${landing.y} ${landing.z}`;
      plan.reads.push(`data get entity ${bot} Dimension`);
      plan.fixture.push(
        `${nether} forceload add ${pad.x} ${pad.z} ${pad.x + 4} ${pad.z + 4}`,
        `${nether} fill ${pad.x} ${pad.y} ${pad.z} ${pad.x + 4} ${pad.y} ${pad.z + 4} minecraft:stone`,
      );
      plan.cleanup.splice(0, 0, `execute in ${OVERWORLD} run tp ${bot} ${start.x} ${start.y} ${start.z}`);
      plan.cleanup.splice(
        -1,
        0,
        `${nether} fill ${pad.x} ${pad.y} ${pad.z} ${pad.x + 4} ${pad.y} ${pad.z + 4} minecraft:air`,
        `${nether} forceload remove ${pad.x} ${pad.z} ${pad.x + 4} ${pad.z + 4}`,
      );
      break;
    case 'trees':
    case 'trees-offline':
    case 'trees-full':
      plan.points.trees = trees;
      plan.fixture.push(`fill ${at(o, -6, STAND, -1)} ${at(o, -4, STAND + 1, 1)} oak_log`);
      if (fixture === 'trees-offline') {
        plan.hooks.kick = `kick ${bot}`;
        plan.reads.push(...trees.map(({ x, y, z }) => `execute if block ${x} ${y} ${z} ${LOG}`));
        worldOnlyCleanup();
      }
      if (fixture === 'trees-full') {
        plan.prepare.push(`give ${bot} minecraft:wooden_axe 1`, `give ${bot} minecraft:cobblestone ${34 * 64}`);
        plan.hooks.fillLastSlot = `give ${bot} minecraft:dirt 64`;
      }
      break;
    case 'sand':
      // Two sand blocks ten blocks east: collection fails after both and returns to the start.
      plan.fixture.push(`fill ${at(o, 10, STAND, 0)} ${at(o, 10, STAND, 1)} ${SAND}`);
      break;
    case 'food':
      // Peaceful refills hunger by itself, which would hide or fake consumption; easy does not.
      plan.fixture.push('difficulty easy');
      plan.prepare.push(`give ${bot} ${BREAD} 8`);
      plan.hooks.hunger = `effect give ${bot} minecraft:hunger 120 40 true`;
      plan.hooks.sated = `effect clear ${bot}`;
      plan.reads.push(`data get entity ${bot} foodLevel`);
      plan.cleanup.splice(-1, 0, 'difficulty peaceful');
      break;
    case 'deposit':
    case 'withdraw': {
      const stock =
        fixture === 'withdraw'
          ? Array.from({ length: STACKS }, (_, slot) => `{Slot:${slot}b,id:"${LOG}",count:64}`).join(',')
          : '';
      plan.points.chest = chest;
      plan.containers = [chest, otherHalf];
      plan.fixture.push(
        `setblock ${chest.x} ${chest.y} ${chest.z} minecraft:chest[facing=west,type=left]{Items:[${stock}]}`,
        `setblock ${otherHalf.x} ${otherHalf.y} ${otherHalf.z} minecraft:chest[facing=west,type=right]`,
      );
      plan.reads.push(`data get block ${otherHalf.x} ${otherHalf.y} ${otherHalf.z} Items`);
      if (fixture === 'deposit') plan.prepare.push(`give ${bot} ${LOG} ${STACKS * 64}`);
      break;
    }
    case 'table':
    case 'table-32':
      plan.points.table = chest;
      plan.fixture.push(`setblock ${chest.x} ${chest.y} ${chest.z} minecraft:crafting_table`);
      plan.prepare.push(`give ${bot} ${PLANKS} ${fixture === 'table-32' ? 32 : 64}`);
      break;
    case 'grid':
      plan.prepare.push(`give ${bot} ${LOG} 16`);
      break;
    default:
      throw new Error(`Unknown takeover fixture ${fixture}.`);
  }
  plan.decision = { type: 'goto', x: far.x, y: far.y, z: far.z };
  // Three blocks west of the start, away from the chest or table: where the next session walks.
  plan.points.near = point(o, -3, STAND, 0);
  return plan;
}

// What each activity starts, and when it has reached the point the checklist interrupts.
const ACTIVITIES = {
  idle: {
    text: (plan) =>
      `in-process agent (runAgent, scripted planner) with goal "${GOAL}"; its first model request is held open, so it waits for inference with control held (the scripted answer is goto ${plan.decision.x} ${plan.decision.y} ${plan.decision.z})`,
  },
  'idle-cli': {
    text: (plan) =>
      `second process: mc-agent agent "${GOAL}" --model ${MODEL} --ollama <loopback stand-in>; the stand-in holds the first /api/chat request open (its answer is goto ${plan.decision.x} ${plan.decision.y} ${plan.decision.z})`,
  },
  goto: { text: (plan) => `bridge: goto ${plan.points.far.x} ${STAND} ${plan.points.far.z} (40 blocks east)` },
  'goto-cli': {
    text: (plan) => `second process: mc-agent goto ${plan.points.far.x} ${STAND} ${plan.points.far.z}`,
  },
  collect: { text: () => 'bridge: collect oak_log 8 beside an 18-log patch' },
  'collect-full': { text: () => 'bridge: collect oak_log 8 with one free main inventory slot' },
  'collect-recovery': { text: () => 'bridge: collect sand 5 with two sand blocks ten blocks east' },
  eat: {
    text: (_plan, spec) =>
      `lower food to ${spec.food} or less (hunger effect, then effect clear), then bridge: eat with bread held`,
  },
  deposit: { text: () => `bridge: deposit oak_log (${STACKS} stacks held, empty double chest two blocks east)` },
  withdraw: { text: () => `bridge: withdraw oak_log (${STACKS} stacks in a double chest two blocks east)` },
  'craft-table': { text: () => 'bridge: craft chest 8 with 64 planks held and a crafting table two blocks east' },
  'craft-table-4': {
    text: () =>
      "proxy: hold the server's replies to the client; then bridge: craft chest 4 with 32 planks held and a crafting table two blocks east",
  },
  'craft-grid': { text: () => 'bridge: craft oak_planks 64 from 16 held logs (inventory grid)' },
  wait: { text: () => 'bridge: wait 30' },
};

const READY_TEXT = {
  idle: 'once the planner request is open',
  'idle-cli': 'once the stand-in has the request',
  goto: 'once the server shows the player moving',
  'goto-cli': 'once the server shows the player moving',
  collect: 'once the first log is held (mining the next)',
  'collect-full': 'once the server shows the player walking to the logs',
  'collect-recovery': 'once the job reports "returning to where collection started"',
  eat: 'as soon as the eat job is running (the animation lasts 1.6 s; retried up to 3 times if the food is eaten first)',
  deposit: 'once the first stack has left the inventory',
  withdraw: 'once the first stack is held',
  'craft-table': 'once the first chest is crafted',
  'craft-table-4': 'once the craft job is running',
  'craft-grid': 'once the first planks are crafted',
  wait: 'once the wait is running',
};

const TRIGGERS = {
  f8: { text: () => 'xdotool: focus the client window and press F8' },
  escape: { text: () => 'xdotool: press Escape (opens the pause menu)' },
  inventory: { text: () => 'xdotool: press E (opens the inventory screen)' },
  'escape-screen': {
    text: () =>
      'xdotool: press Escape while the agent has its screen open (closes it); for storage, retried up to 4 times when the press lands between screen openings',
  },
  stop: { text: () => 'second process: mc-agent stop' },
  'stop-held': {
    text: () =>
      "second process: mc-agent stop, once a fresh session's acquire is refused as awaiting the server (the agent clicked and its reply is held)",
  },
  cancel: { text: () => 'bridge: /v1/cancel with the session lease' },
  suspend: { text: () => 'SIGSTOP the agent CLI (as Ctrl+Z) and wait for the 8 s lease to expire' },
  kill: { text: () => 'SIGKILL the CLI (kill -9) and wait for the 8 s lease to expire' },
  teleport: { text: (plan) => `server: ${plan.hooks.teleport}`, during: (plan) => [plan.hooks.teleport] },
  death: { text: (plan) => `server: kill ${plan.bot}`, during: (plan) => [`kill ${plan.bot}`] },
  kick: { text: (plan) => `server: ${plan.hooks.kick}`, during: (plan) => [plan.hooks.kick] },
  fill: { text: (plan) => `server: ${plan.hooks.fillLastSlot}`, during: (plan) => [plan.hooks.fillLastSlot] },
};

const STORAGE_SCREEN_UNREACHABLE =
  "Not observable on a local server: the agent's container screen opens when the server reply is handled at the start of a frame and closes in that frame's tick, so it never reaches the end-of-frame input poll and Escape always lands between stacks instead. Each attempt still checks that Escape between stacks returns control and stops the transfer.";

// The only checks STORAGE_SCREEN_UNREACHABLE explains; any other failed check is a real failure.
const STORAGE_SCREEN_CHECKS = ['the key press reached the game', 'the job ends cancelled with a message matching'];

// One row per checklist item that runs without a person. `id` is the checklist id.
const TABLE = [
  { id: 'f8-idle', fixture: 'ground', activity: 'idle', trigger: 'f8', release: 'takeover' },
  { id: 'f8-collect', fixture: 'trees', activity: 'collect', trigger: 'f8', release: 'takeover' },
  { id: 'f8-eat', fixture: 'food', activity: 'eat', trigger: 'f8', release: 'eating', food: HUNGRY },
  { id: 'f8-collect-recovery', fixture: 'sand', activity: 'collect-recovery', trigger: 'f8', release: 'takeover' },
  { id: 'f8-deposit', fixture: 'deposit', activity: 'deposit', trigger: 'f8', release: 'deposits' },
  { id: 'menu-idle', fixture: 'ground', activity: 'idle', trigger: 'escape', close: true, release: 'takeover' },
  { id: 'menu-collect', fixture: 'trees', activity: 'collect', trigger: 'inventory', close: true, release: 'takeover' },
  {
    id: 'menu-eat',
    fixture: 'food',
    activity: 'eat',
    trigger: 'escape',
    close: true,
    release: 'eating',
    food: HUNGRY,
  },
  {
    id: 'menu-collect-recovery',
    fixture: 'sand',
    activity: 'collect-recovery',
    trigger: 'escape',
    close: true,
    release: 'takeover',
  },
  {
    id: 'menu-storage-close',
    fixture: 'deposit',
    activity: 'deposit',
    trigger: 'escape-screen',
    release: 'deposits',
    expectedFailure: STORAGE_SCREEN_UNREACHABLE,
  },
  { id: 'f8-withdraw', fixture: 'withdraw', activity: 'withdraw', trigger: 'f8', release: 'withdrawCraft' },
  {
    id: 'menu-storage-close-withdraw',
    fixture: 'withdraw',
    activity: 'withdraw',
    trigger: 'escape-screen',
    release: 'withdrawCraft',
    expectedFailure: STORAGE_SCREEN_UNREACHABLE,
  },
  { id: 'f8-craft', fixture: 'table', activity: 'craft-table', trigger: 'f8', release: 'withdrawCraft' },
  {
    id: 'menu-crafting-close',
    fixture: 'table',
    activity: 'craft-table',
    trigger: 'escape-screen',
    release: 'withdrawCraft',
  },
  { id: 'stop-idle', fixture: 'ground', activity: 'idle', trigger: 'stop', release: 'takeover' },
  { id: 'stop-goto', fixture: 'ground', activity: 'goto', trigger: 'stop', release: 'takeover' },
  { id: 'stop-collect', fixture: 'trees', activity: 'collect', trigger: 'stop', release: 'takeover' },
  {
    id: 'stop-collect-recovery',
    fixture: 'sand',
    activity: 'collect-recovery',
    trigger: 'stop',
    release: 'takeover',
  },
  { id: 'stop-deposit', fixture: 'deposit', activity: 'deposit', trigger: 'stop', release: 'deposits' },
  { id: 'stop-withdraw', fixture: 'withdraw', activity: 'withdraw', trigger: 'stop', release: 'withdrawCraft' },
  { id: 'stop-craft', fixture: 'grid', activity: 'craft-grid', trigger: 'stop', release: 'withdrawCraft' },
  { id: 'cancel-craft', fixture: 'grid', activity: 'craft-grid', trigger: 'cancel', release: 'withdrawCraft' },
  { id: 'cancel-wait', fixture: 'ground', activity: 'wait', trigger: 'cancel', release: 'takeover' },
  { id: 'cancel-eat', fixture: 'food', activity: 'eat', trigger: 'cancel', release: 'eating', food: PECKISH },
  { id: 'expiry-idle', fixture: 'ground', activity: 'idle-cli', trigger: 'suspend', release: 'takeover' },
  { id: 'expiry-goto', fixture: 'ground', activity: 'goto-cli', trigger: 'kill', release: 'takeover' },
  { id: 'disconnect-collect', fixture: 'trees-offline', activity: 'collect', trigger: 'kick', release: 'takeover' },
  { id: 'death-goto', fixture: 'death', activity: 'goto', trigger: 'death', release: 'takeover' },
  { id: 'dimension-idle', fixture: 'nether', activity: 'idle', trigger: 'teleport', release: 'dimension' },
  { id: 'dimension-goto', fixture: 'nether', activity: 'goto', trigger: 'teleport', release: 'dimension' },
  {
    id: 'inventory-full-collect',
    fixture: 'trees-full',
    activity: 'collect-full',
    trigger: 'fill',
    release: 'takeover',
  },
  // The proxy holds the server's replies, so the agent's container opening stays unanswered across the stop.
  {
    id: 'takeover-while-stopping-deposit',
    fixture: 'deposit',
    activity: 'deposit',
    trigger: 'stop-held',
    release: 'deposits',
  },
  {
    id: 'takeover-while-stopping-withdraw',
    fixture: 'withdraw',
    activity: 'withdraw',
    trigger: 'stop-held',
    release: 'withdrawCraft',
  },
  {
    id: 'takeover-while-stopping-craft',
    fixture: 'table-32',
    activity: 'craft-table-4',
    trigger: 'stop-held',
    release: 'withdrawCraft',
  },
];

/** Checklist items the runner leaves to a person, and why. */
export const NOT_SCRIPTED = Object.freeze({});

// How long the proxy may hold the server's replies. The server drops a client that leaves a keep-alive unanswered
// for 15 s and the client gives up after 30 s without a packet; the hold stays well under both.
export const HOLD = Object.freeze({ clickMs: 2000, newSessionMs: 2500, maxMs: 8000 });

// Rejoining after the kick goes through the client's own screens, as a person would: the disconnect screen's only
// button (Back to server list; Tab focuses it, Enter presses it), the server list's Direct Connection button (quick
// play adds its server hidden, so the list has no entry to join), then the address and Enter. Each screen gets
// `settleMs` to open; the join must finish within `joinMs` (the software-rendered client loads terrain slowly).
export const REJOIN = Object.freeze({ settleMs: 1500, joinMs: 60_000 });

const REJOIN_STEPS = [
  'at the disconnect screen: mc-agent job from another process',
  "rejoin through the client's screens: Tab and Enter on the disconnect screen (Back to server list), click Direct Connection on the server list, type the server address, Enter; not rejoining within 60 s fails as not observed",
  'after the rejoin: the bridge must show the player again; mode, job and independent reads (position, inventory, the target logs) at the rejoin, 1 s later and 5 s later; mc-agent job; the old lease must still be refused',
];

const REJOIN_EXPECT = [
  "after rejoining through the client's screens, the bridge shows the player again, mode stays manual and no job is started or resumed",
  'independently after rejoining: Pos and Inventory reads at the rejoin, 1 s and 5 s later match, and the target logs are as the kick left them',
];

const lifecycleById = new Map(LIFECYCLE_SCENARIOS.map((scenario) => [scenario.id, scenario]));

function heldSteps(spec, plan) {
  const { near } = plan.points;
  const lines = [ACTIVITIES[spec.activity].text(plan, spec)];
  if (spec.activity !== 'craft-table-4')
    lines.push(`${READY_TEXT[spec.activity]}: proxy: hold the server's replies to the client`);
  lines.push(
    `within ${HOLD.clickMs / 1000} s: a fresh /v1/control acquire is refused as "awaiting the server" (the agent clicked and the reply is held); "not observed" fails the scenario`,
    TRIGGERS[spec.trigger].text(plan),
    'the bridge must show stopping: true, manual, and the job cancelled; independent reads at the stop',
    `at once: second process: mc-agent goto ${near.x} ${near.y} ${near.z} (three blocks west); a fresh acquire must be refused while stopping is true`,
    `for ${HOLD.newSessionMs / 1000} s: stopping stays true and no new job starts`,
    `release the held replies (the whole hold is capped at ${HOLD.maxMs / 1000} s, under the 15 s keep-alive): stopping must clear and the goto must then run and complete`,
    'independent reads 1 s after the release and 5 s later, compared with the reads at the stop',
    'old lease: /v1/control heartbeat and /v1/actions must be refused',
  );
  return lines;
}

function steps(spec, plan) {
  if (spec.trigger === 'stop-held') return heldSteps(spec, plan);
  const activity = ACTIVITIES[spec.activity].text(plan, spec);
  const trigger = TRIGGERS[spec.trigger].text({ ...plan, bot: plan.bot });
  const lines = [activity, `${READY_TEXT[spec.activity]}: ${trigger}`];
  if (spec.close)
    lines.push(
      spec.activity === 'idle'
        ? 'let the held model request answer, then after 3 s press Escape to close the screen'
        : 'after 3 s, press Escape to close the screen',
    );
  if (spec.trigger === 'suspend')
    lines.push('during the suspension: mc-agent job from a third process; then SIGCONT and let the model answer');
  if (spec.trigger === 'death') lines.push('after the refusal: press Tab and Enter on the death screen to respawn');
  lines.push('independent reads 1 s after the transition and 5 s later');
  const { next, mode } = lifecycleById.get(spec.id).expect;
  if (mode === 'manual') lines.push('old lease: /v1/control heartbeat and /v1/actions must be refused');
  if (next.refused) lines.push('a new session must be refused while the player cannot play');
  if (spec.trigger === 'kick') lines.push(...REJOIN_STEPS);
  if (next.lease === 'same') lines.push('the same lease then runs wait 1');
  else lines.push('only then: a new, explicitly started session runs wait 1');
  return lines;
}

export const takeoverScenarios = TABLE.map((spec, index) => {
  const lifecycle = lifecycleById.get(spec.id);
  if (!lifecycle?.manual.includes('fabric')) throw new Error(`${spec.id} is not on the Fabric checklist.`);
  return {
    id: spec.id,
    lane: FIRST_LANE + index,
    title: `${lifecycle.title} (scripted Fabric checklist item)`,
    backends: ['fabric'],
    takeover: true,
    // Every takeover scenario joins through the runner's pausable proxy; only stop-held pauses it.
    proxy: true,
    lifecycle: spec.id,
    spec,
    ...(spec.expectedFailure && { expectedFailure: spec.expectedFailure, expectedChecks: STORAGE_SCREEN_CHECKS }),
    release: [RELEASE_TAKEOVER[spec.release]],
    plan: (input) => ({ ...takeoverPlan(input, spec.fixture), bot: input.bot }),
    during: (plan) => TRIGGERS[spec.trigger].during?.(plan) ?? [],
    actions: (plan) => steps(spec, plan),
    expect: [
      ...describeExpectation(lifecycle.expect),
      ...lifecycle.expect.halts.map((halt) => `independently: ${HALTS[halt].observe}`),
      ...(spec.trigger === 'kick' ? REJOIN_EXPECT : []),
    ],
    run: (ctx, plan) =>
      spec.trigger === 'stop-held' ? runHeldStop(ctx, plan, spec, lifecycle) : runTakeover(ctx, plan, spec, lifecycle),
  };
});

export const takeoverIds = takeoverScenarios.map((scenario) => scenario.id);

// ---------------------------------------------------------------------------------------------------------------

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const settledOf = (promise) =>
  promise.then(
    (value) => ({ ok: true, value }),
    (error) => ({ ok: false, message: error?.message ?? String(error) }),
  );
const held = (state, item) => bridgeItemTotals(state.inventory)[item] ?? 0;

/** Polls `probe` until it reports ok (or stop) or the time runs out; returns the last probe result either way. */
async function poll(ctx, probe, { timeoutMs, intervalMs = 100 }) {
  const deadline = ctx.now() + timeoutMs;
  while (true) {
    const result = await probe();
    if (result.ok || result.stop) return result;
    if (ctx.now() >= deadline) return { ...result, ok: false, timedOutAfterMs: timeoutMs };
    await ctx.sleep(intervalMs);
  }
}

const serverValue = async (ctx, command) => parseDataReply(await ctx.server.command(command)).value;

/** The independent reads one halt comparison needs. */
async function reads(ctx, plan, halts, { offline = false } = {}) {
  const out = {};
  if (offline) {
    out.online = await ctx.server.command('list');
    if (halts.includes('mining')) {
      let logs = 0;
      for (const cell of plan.points.trees) if (await ctx.server.testBlock(cell, LOG)) logs++;
      out.logBlocks = logs;
    }
    return out;
  }
  out.position = await ctx.server.position();
  out.inventory = itemTotals(await ctx.server.inventory());
  if (halts.includes('consumption')) out.food = await serverValue(ctx, `data get entity ${ctx.bot} foodLevel`);
  if (plan.fixtureKind === 'nether') out.dimension = await serverValue(ctx, `data get entity ${ctx.bot} Dimension`);
  if (halts.includes('deposit') || halts.includes('withdraw'))
    out.containers = await Promise.all(plan.containers.map(async (c) => itemTotals(await ctx.server.items(c))));
  return out;
}

/** Checks each halt between two reads (and, for food, against the read before the command). */
function checkHalts(ctx, halts, first, last, baseline, { offline }) {
  for (const halt of halts) {
    const name = `independently: ${HALTS[halt].text} (${HALTS[halt].observe})`;
    if (offline) {
      if (halt === 'movement')
        ctx.check(`${name}: the player is offline`, /There are 0 of/.test(last.online), { online: last.online });
      else ctx.check(name, first.logBlocks === last.logBlocks, { first: first.logBlocks, last: last.logBlocks });
      continue;
    }
    if (halt === 'movement') {
      const moved = distance(first.position, last.position);
      ctx.check(name, moved <= 0.2, { first: first.position, last: last.position, moved });
    } else if (halt === 'mining' || halt === 'crafting')
      ctx.check(name, sameTotals(first.inventory, last.inventory), { first: first.inventory, last: last.inventory });
    else if (halt === 'consumption') {
      const bread = (read) => read.inventory[BREAD] ?? 0;
      ctx.check(
        name,
        bread(first) === bread(baseline) &&
          bread(last) === bread(baseline) &&
          first.food <= baseline.food &&
          last.food <= first.food,
        {
          bread: [bread(baseline), bread(first), bread(last)],
          foodLevel: [baseline.food, first.food, last.food],
        },
      );
    } else if (halt === 'deposit' || halt === 'withdraw')
      ctx.check(
        name,
        first.containers.every((items, index) => sameTotals(items, last.containers[index])),
        { first: first.containers, last: last.containers },
      );
  }
}

async function lowerFood(ctx, plan, target) {
  const food = () => serverValue(ctx, `data get entity ${ctx.bot} foodLevel`);
  if ((await food()) <= target) return food();
  await ctx.server.command(plan.hooks.hunger);
  try {
    const result = await poll(
      ctx,
      async () => {
        const level = await food();
        return { ok: level <= target, level };
      },
      { timeoutMs: 90_000, intervalMs: 200 },
    );
    if (!result.ok) throw new Error(`Food did not fall to ${target}: ${result.level}.`);
    return result.level;
  } finally {
    await ctx.server.command(plan.hooks.sated);
  }
}

/** Starts the activity; returns the handle the trigger and checks use. */
async function startActivity(ctx, plan, spec, session) {
  const { activity } = spec;
  const start = plan.points.start;
  if (activity === 'idle') {
    const adapter = await ctx.connect();
    session.adapters.push(adapter);
    const inference = deferred();
    const answer = deferred();
    const fetchImpl = scriptedPlanner([plan.decision], {
      before: {
        0: async () => {
          inference.resolve();
          await answer.promise;
        },
      },
    });
    const settled = settledOf(ctx.agent({ goal: GOAL, adapter, fetchImpl, maxSteps: 2 }));
    session.release = answer.resolve;
    return {
      adapter,
      settled,
      finish: async () => {
        answer.resolve();
        return settled;
      },
      ready: async () => {
        const first = await Promise.race([
          inference.promise.then(() => 'inference'),
          settled.then(() => 'ended'),
          ctx.sleep(30_000).then(() => 'timeout'),
        ]);
        const state = await ctx.bridge.observe();
        return { ok: first === 'inference' && state.mode === 'agent', first, mode: state.mode, job: state.job };
      },
    };
  }
  if (activity === 'idle-cli') {
    const model = await ctx.fakeModel([plan.decision]);
    session.cleanups.push(() => model.close());
    const cli = ctx.cli.start([
      'agent',
      GOAL,
      '--model',
      MODEL,
      '--ollama',
      model.url,
      '--steps',
      '2',
      '--minutes',
      '5',
      '--model-timeout',
      '300',
    ]);
    session.cleanups.push(() => cli.stop());
    return {
      cli,
      model,
      settled: cli.exited,
      finish: async () => {
        cli.resume();
        model.answer();
        return Promise.race([cli.exited, ctx.sleep(30_000).then(() => ({ timedOut: true, ...cli.output() }))]);
      },
      ready: () =>
        poll(
          ctx,
          async () => {
            const state = await ctx.bridge.observe();
            return {
              ok: model.requests() >= 1 && state.mode === 'agent',
              requests: model.requests(),
              mode: state.mode,
            };
          },
          { timeoutMs: 30_000, intervalMs: 250 },
        ),
    };
  }
  if (activity === 'goto-cli') {
    const { far } = plan.points;
    const cli = ctx.cli.start(['goto', String(far.x), String(far.y), String(far.z)]);
    session.cleanups.push(() => cli.stop());
    return {
      cli,
      settled: cli.exited,
      finish: () => cli.exited,
      ready: () => moving(ctx, start),
    };
  }
  const actions = {
    goto: { type: 'goto', ...plan.decision },
    collect: { type: 'collect', block: 'oak_log', count: 8 },
    'collect-full': { type: 'collect', block: 'oak_log', count: 8 },
    'collect-recovery': { type: 'collect', block: 'sand', count: 5 },
    eat: { type: 'eat' },
    deposit: { type: 'deposit', item: 'oak_log' },
    withdraw: { type: 'withdraw', item: 'oak_log' },
    'craft-table': { type: 'craft', item: 'chest', count: 8 },
    'craft-table-4': { type: 'craft', item: 'chest', count: 4 },
    'craft-grid': { type: 'craft', item: 'oak_planks', count: 64 },
    wait: { type: 'wait', seconds: 30 },
  };
  const action = actions[activity];
  const adapter = await ctx.connect();
  session.adapters.push(adapter);
  // A retry starts a new job of the same type; the previous attempt's job is not this one.
  const previous = (await ctx.bridge.observe()).job?.id ?? null;
  const settled = settledOf(adapter.execute(action));
  const ours = (state) => state.job?.type === action.type && state.job.id !== previous;
  const running = (state) => ours(state) && state.job.status === 'running';
  const readyWhen = {
    goto: null,
    collect: (state) => held(state, LOG) >= 1,
    'collect-full': null,
    'collect-recovery': (state) => RETURNING.test(state.job?.message ?? ''),
    eat: () => true,
    deposit: (state) => held(state, LOG) < STACKS * 64,
    withdraw: (state) => held(state, LOG) >= 1,
    'craft-table': (state) => held(state, CHEST) >= 1,
    'craft-table-4': () => true,
    'craft-grid': (state) => held(state, PLANKS) >= 4,
    wait: () => true,
  }[activity];
  const timeoutMs = activity.startsWith('collect') ? 120_000 : 60_000;
  return {
    adapter,
    action,
    settled,
    finish: () => settled,
    ready: async () => {
      if (!readyWhen) {
        return moving(ctx, start, action.type, previous);
      }
      return poll(
        ctx,
        async () => {
          const state = await ctx.bridge.observe();
          const ended = ours(state) && state.job.status !== 'running';
          if (ended) return { ok: false, stop: true, ended: true, job: state.job };
          return { ok: running(state) && readyWhen(state), job: state.job, lease: adapter.leaseId };
        },
        // Eating lasts 1.6 s, so it is polled as fast as the bridge answers.
        { timeoutMs, intervalMs: activity === 'eat' ? 25 : 100 },
      );
    },
  };
}

/** Ready once the bridge shows a running goto/collect and the server shows the player a block from the start. */
function moving(ctx, start, type, previous = null) {
  return poll(
    ctx,
    async () => {
      const state = await ctx.bridge.observe();
      const job = state.job;
      if (!(job?.status === 'running' && (!type || job.type === type) && job.id !== previous) || state.mode !== 'agent')
        return { ok: false, job };
      const position = await ctx.server.position();
      return { ok: distance(position, start) >= 1, job, position, state: { inventory: state.inventory } };
    },
    { timeoutMs: 60_000, intervalMs: 200 },
  );
}

/** Performs the transition. Returns what was sent. */
async function trigger(ctx, plan, spec, handle) {
  switch (spec.trigger) {
    case 'f8':
      return ctx.keys.press('f8');
    case 'escape':
    case 'escape-screen':
      return ctx.keys.press('escape');
    case 'inventory':
      return ctx.keys.press('inventory');
    case 'stop':
      return ctx.cliStop();
    case 'cancel':
      await handle.adapter.cancel();
      return { cancelled: true };
    case 'suspend':
      handle.cli.suspend();
      return { suspended: handle.cli.pid };
    case 'kill':
      handle.cli.kill();
      return { killed: handle.cli.pid };
    case 'teleport':
      return ctx.server.command(plan.hooks.teleport);
    case 'death':
      return ctx.server.command(`kill ${ctx.bot}`);
    case 'kick':
      return ctx.server.command(plan.hooks.kick);
    case 'fill':
      return ctx.server.command(plan.hooks.fillLastSlot);
    default:
      throw new Error(`Unknown trigger ${spec.trigger}.`);
  }
}

/** Waits for the bridge to show the transition the lifecycle table expects. */
function transition(ctx, expect, jobId, { timeoutMs }) {
  return poll(
    ctx,
    async () => {
      const state = await ctx.bridge.observe();
      const job = state.job;
      const ours = !!jobId && job?.id === jobId;
      const ok =
        expect.mode === 'manual'
          ? state.mode === 'manual' && (!ours || job.status !== 'running')
          : ours && job.status === expect.job.status;
      return { ok, mode: state.mode, stopping: state.stopping, paused: state.paused, job };
    },
    { timeoutMs, intervalMs: 100 },
  );
}

const MENU = /game menu was opened/i;
// Only the pause menu, not another screen the agent doesn't own (that would be an unrelated cancellation).
const PAUSE_MENU = /game menu was opened \((?:pause menu|pause)\)/i;

/**
 * Escape cancelled this storage job: through the storage screen, or through the pause menu between stacks. The
 * expected failure of the storage-close scenarios (STORAGE_SCREEN_UNREACHABLE) holds only with this evidence.
 */
export function escapeCancelledStorage(jobId, job, storageMessage) {
  return (
    !!jobId &&
    job?.id === jobId &&
    job.status === 'cancelled' &&
    (PAUSE_MENU.test(job.message ?? '') || storageMessage.test(job.message ?? ''))
  );
}

/** Whether this attempt missed the moment the checklist interrupts, so it is repeated. */
function missed(spec, jobId, state) {
  if (spec.activity === 'eat') return state.job?.id === jobId && state.job.status === 'completed';
  if (spec.trigger === 'escape-screen' && spec.activity !== 'craft-table')
    return state.job?.id === jobId && MENU.test(state.job.message ?? '');
  return false;
}

async function closeMenu(ctx) {
  await ctx.keys.press('escape');
  return poll(
    ctx,
    async () => {
      const state = await ctx.bridge.observe();
      return { ok: !state.paused, paused: state.paused, mode: state.mode, job: state.job };
    },
    { timeoutMs: 5000, intervalMs: 200 },
  );
}

async function refusedSession(ctx, pattern) {
  const fresh = await ctx.connect();
  try {
    await fresh.acquire();
    return { refused: false };
  } catch (error) {
    return { refused: true, message: error.message, matches: new RegExp(pattern, 'i').test(error.message) };
  } finally {
    await fresh.close();
  }
}

async function explicitSession(ctx) {
  const fresh = await ctx.connect();
  try {
    const job = await fresh.execute({ type: 'wait', seconds: 1 });
    return { accepted: true, status: job.status, message: job.message };
  } catch (error) {
    return { accepted: false, message: error.message };
  } finally {
    await fresh.close();
  }
}

async function oldLease(adapter, leaseId) {
  const attempt = async (path, body) => {
    try {
      await adapter.request(path, body);
      return { refused: false };
    } catch (error) {
      return { refused: true, message: error.message };
    }
  };
  return {
    heartbeat: await attempt('/v1/control', { action: 'heartbeat', leaseId }),
    action: await attempt('/v1/actions', { leaseId, action: { type: 'wait', seconds: 1 } }),
  };
}

/**
 * Nothing came back with the player: manual control, no stopping window, and no job but the interrupted one, which
 * stays cancelled. `state` is a bridge state or `mc-agent job` output.
 */
export function nothingResumed(jobId, state) {
  if (state?.mode !== 'manual' || state.stopping) return false;
  return !state.job || (!!jobId && state.job.id === jobId && state.job.status === 'cancelled');
}

/** The address the client joined: the runner's proxy when the scenario goes through it, else the server itself. */
export const serverAddress = (ctx) => `127.0.0.1:${ctx.proxy?.port ?? ctx.options.port}`;

/**
 * disconnect-collect after the kick: `mc-agent job` at the disconnect screen, rejoin through the client's screens,
 * then check that nothing resumed (bridge, independent reads, the target logs, the old lease). Returns whether the
 * client rejoined, so the explicit new session runs only then; a missing rejoin fails as "not observed".
 */
async function rejoinChecks(ctx, plan, expect, { jobId, leaseId, handle, atKick }) {
  const job = async (name) => {
    const output = await ctx.step(name, () => ctx.cli.run(['job']));
    return { ok: output.code === 0 && nothingResumed(jobId, parseJson(output.stdout ?? '')), output };
  };
  const atScreen = await job('mc-agent job at the disconnect screen');
  ctx.check('mc-agent job at the disconnect screen shows manual control and no running job', atScreen.ok, atScreen);

  const address = serverAddress(ctx);
  const rejoined = await ctx.step(
    `rejoin: Tab and Enter (Back to server list), click Direct Connection, type ${address}, Enter`,
    async () => {
      const sent = [await ctx.keys.press('tab'), await ctx.keys.press('enter')];
      await ctx.sleep(REJOIN.settleMs);
      sent.push(await ctx.keys.click('direct-connection'));
      await ctx.sleep(REJOIN.settleMs);
      sent.push(await ctx.keys.type(address), await ctx.keys.press('enter'));
      const joined = await poll(
        ctx,
        async () => {
          const state = await ctx.bridge.observe();
          const ok = !!state.connected && state.player?.name === ctx.bot && !state.paused;
          return { ok, connected: state.connected, paused: state.paused, mode: state.mode, job: state.job };
        },
        { timeoutMs: REJOIN.joinMs, intervalMs: 250 },
      );
      return { address, sent, joined, proxy: ctx.proxy?.stats?.() ?? null };
    },
  );
  const online = await ctx.server.command('list');
  const back = rejoined.joined.ok && new RegExp(`online: (?:.*\\W)?${ctx.bot}(?:\\W|$)`).test(online);
  ctx.check(
    back
      ? 'the client rejoined through the disconnect screen and the server list, and the bridge shows the player again'
      : 'not observed: the client did not rejoin through the disconnect screen and the server list',
    back,
    { rejoined, online },
  );
  if (!back) return false;

  // Independent reads at the rejoin, 1 s later and 5 s after that, with the bridge state beside each.
  const both = async () => ({
    ...(await reads(ctx, plan, expect.halts)),
    ...(await reads(ctx, plan, expect.halts, { offline: true })),
    bridge: await ctx.bridge.observe(),
  });
  const atRejoin = await ctx.step('independent reads at the rejoin', both);
  await ctx.sleep(1000);
  const second = await ctx.step('independent reads 1 s after the rejoin', both);
  await ctx.sleep(5000);
  const third = await ctx.step('independent reads 5 s later', both);
  const series = [atRejoin, second, third];
  ctx.note('rejoinReads', { atKick, atRejoin, second, third });

  ctx.check(
    'after rejoining, mode stays manual and no job is started or resumed (bridge at the rejoin, 1 s and 5 s later)',
    series.every((read) => nothingResumed(jobId, read.bridge)),
    { jobId, bridge: series.map(({ bridge }) => ({ mode: bridge.mode, stopping: bridge.stopping, job: bridge.job })) },
  );
  const moved = Math.max(
    distance(atRejoin.position, second.position),
    distance(second.position, third.position),
    distance(atRejoin.position, third.position),
  );
  ctx.check(
    `independently after rejoining: ${HALTS.movement.text} (Pos at the rejoin, 1 s and 5 s later match)`,
    moved <= 0.2,
    { positions: series.map(({ position }) => position), moved },
  );
  ctx.check(
    `independently after rejoining: ${HALTS.mining.text} (Inventory at the rejoin, 1 s and 5 s later match, and the target logs are as the kick left them)`,
    sameTotals(atRejoin.inventory, second.inventory) &&
      sameTotals(second.inventory, third.inventory) &&
      series.every(({ logBlocks }) => logBlocks === atKick.logBlocks),
    {
      inventory: series.map(({ inventory }) => inventory),
      logBlocks: [atKick.logBlocks, ...series.map((r) => r.logBlocks)],
    },
  );
  const after = await job('mc-agent job after rejoining');
  ctx.check('mc-agent job after rejoining shows manual control and no running job', after.ok, after);
  if (leaseId) {
    const old = await ctx.step('old lease after rejoining: heartbeat and action', () =>
      oldLease(handle.adapter, leaseId),
    );
    ctx.check(
      'after rejoining, the old session still cannot heartbeat or act',
      old.heartbeat.refused && old.action.refused,
      old,
    );
  }
  return true;
}

/** One scripted checklist item: start → reach the interrupt point → transition → independent halts → next session. */
export async function runTakeover(ctx, plan, spec, lifecycle) {
  const { expect } = lifecycle;
  const offline = spec.trigger === 'kick';
  const session = { adapters: [], cleanups: [], release: null };
  try {
    const attempts = [];
    const maxAttempts = spec.activity === 'eat' ? 3 : spec.trigger === 'escape-screen' ? 4 : 1;
    let handle, ready, sent, after, jobId, leaseId, baseline, triggeredAt, transitionAt;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (spec.activity === 'eat')
        await ctx.step(`lower food to ${spec.food} or less`, () => lowerFood(ctx, plan, spec.food));
      baseline = await ctx.step('independent baseline before the command', () => reads(ctx, plan, expect.halts));
      handle = await ctx.step(ACTIVITIES[spec.activity].text(plan, spec), () =>
        startActivity(ctx, plan, spec, session),
      );
      ready = await ctx.step(`wait until ${READY_TEXT[spec.activity]}`, () => handle.ready());
      jobId = ready.job?.id ?? null;
      leaseId = handle.adapter?.leaseId ?? null;
      if (!ready.ok) {
        attempts.push({ attempt, ready });
        break;
      }
      triggeredAt = ctx.now();
      sent = await ctx.step(TRIGGERS[spec.trigger].text({ ...plan, bot: ctx.bot }), () =>
        trigger(ctx, plan, spec, handle),
      );
      const timeoutMs = spec.trigger === 'suspend' || spec.trigger === 'kill' ? 20_000 : 10_000;
      after = await ctx.step('wait for the bridge to show the transition', () =>
        transition(ctx, expect, jobId, { timeoutMs }),
      );
      transitionAt = ctx.now();
      attempts.push({ attempt, ready: { job: ready.job }, sent, after });
      if (!missed(spec, jobId, after) || attempt === maxAttempts) break;
      // Missed: the food was eaten first, or Escape opened the pause menu between storage screens. Reset and retry.
      await ctx.step('missed the interrupt point; reset for another attempt', async () => {
        if (after.paused) await closeMenu(ctx);
        session.release?.();
        await handle.settled;
        for (const adapter of session.adapters.splice(0)) await adapter.close();
        return { job: after.job };
      });
      // Storage retries need stacks left to move.
      const logs = held(await ctx.bridge.observe(), LOG);
      if (spec.activity === 'deposit' ? logs < 128 : spec.activity === 'withdraw' && logs > (STACKS - 2) * 64) break;
    }
    ctx.note('attempts', attempts);
    ctx.check(`the activity reached the interrupt point (${READY_TEXT[spec.activity]})`, ready?.ok, {
      ready,
      attempts: attempts.length,
    });
    if (!ready?.ok) return;
    const keyed = ['f8', 'escape', 'escape-screen', 'inventory'].includes(spec.trigger);
    ctx.check(
      keyed ? 'the key press reached the game (the bridge shows the transition)' : 'the bridge shows the transition',
      after.ok && !missed(spec, jobId, after),
      { sent, after, attempts: attempts.length },
    );
    if (spec.trigger === 'escape-screen' && spec.activity !== 'craft-table')
      ctx.check(
        'every Escape returned control at once and cancelled its own job, including between stacks (pause menu)',
        // A retried attempt cancelled by any other screen is a failure, not a missed interrupt point.
        attempts.every(
          ({ ready: start, after: each }) =>
            !each ||
            (each.ok &&
              each.mode === 'manual' &&
              escapeCancelledStorage(start.job?.id, each.job, new RegExp(expect.job.message, 'i'))),
        ),
        { attempts: attempts.map(({ after: each }) => each && { mode: each.mode, job: each.job?.message }) },
      );
    if (spec.trigger === 'death') await deathChecks(ctx, expect);
    const stateAtReady = ready.state ?? {};

    // The menu stays open while the held model request answers; then it is closed.
    let outcome = null;
    if (spec.activity === 'idle' || spec.activity === 'idle-cli') {
      if (spec.trigger === 'suspend') {
        const job = await ctx.step('during the suspension: mc-agent job from another process', () =>
          ctx.cli.run(['job']),
        );
        ctx.check('mc-agent job during the suspension shows manual control', /"mode":\s*"manual"/.test(job.stdout), {
          job,
        });
      }
      outcome = await ctx.step('let the held model request answer', () => handle.finish());
    }
    if (spec.close) {
      await ctx.sleep(3000);
      const closed = await ctx.step('press Escape to close the screen', () => closeMenu(ctx));
      ctx.check('the screen closed', closed.ok, closed);
      await ctx.sleep(1000);
    }
    if (spec.trigger === 'teleport')
      await ctx.step('wait for the client to load the new dimension', () =>
        poll(
          ctx,
          async () => {
            const state = await ctx.bridge.observe();
            return { ok: !state.paused && state.player?.dimension === NETHER, dimension: state.player?.dimension };
          },
          { timeoutMs: 60_000, intervalMs: 500 },
        ),
      );

    await ctx.sleep(1000);
    const first = await ctx.step('independent reads after the transition', () =>
      reads(ctx, plan, expect.halts, { offline }),
    );
    const stateFirst = await ctx.bridge.observe();
    await ctx.sleep(5000);
    const last = await ctx.step('independent reads 5 s later', () => reads(ctx, plan, expect.halts, { offline }));
    const state = await ctx.bridge.observe();
    ctx.note('reads', { baseline, first, last });
    ctx.note('final', { mode: state.mode, stopping: state.stopping, job: state.job, paused: state.paused });

    ctx.check(
      expect.mode === 'manual' ? 'mode becomes manual and stays manual' : 'mode stays agent',
      stateFirst.mode === expect.mode && state.mode === expect.mode,
      { first: stateFirst.mode, last: state.mode },
    );
    if (expect.job) {
      const pattern = new RegExp(expect.job.message, 'i');
      ctx.check(
        `the job ends ${expect.job.status} with a message matching /${expect.job.message}/i`,
        !!jobId && state.job?.id === jobId && state.job.status === expect.job.status && pattern.test(state.job.message),
        { jobId, job: state.job },
      );
    } else
      ctx.check('no job is started or resumed', !state.job || (jobId && state.job.id === jobId), {
        job: state.job,
      });
    if (spec.expectedFailure)
      ctx.check(
        'Escape cancelled this job (through the storage screen or the pause menu between stacks)',
        escapeCancelledStorage(jobId, state.job, new RegExp(expect.job.message, 'i')),
        { jobId, job: state.job },
      );
    if (spec.trigger === 'fill') {
      ctx.check('no log was held when the last slot filled', held(stateAtReady, LOG) === 0, {
        logsAtReady: held(stateAtReady, LOG),
      });
      ctx.check(
        'the job failed within 30 s of the last slot filling, not at the 180 s mining deadline',
        transitionAt - triggeredAt <= 30_000,
        { afterMs: transitionAt - triggeredAt },
      );
    }
    checkHalts(ctx, expect.halts, first, last, baseline, { offline });
    ctx.check('no stopping window (stopping is false)', state.stopping === false, { stopping: state.stopping });
    if (spec.trigger === 'teleport')
      ctx.check(
        'the server shows the player on the Nether pad',
        first.dimension === NETHER && last.dimension === NETHER && distance(last.position, plan.points.landing) <= 0.6,
        { first: first.dimension, last: last.dimension, position: last.position },
      );

    // The interrupted session must not have gone on.
    if (spec.activity === 'idle')
      ctx.check(
        'the agent reports that control returned to the player and runs no action after the model answers',
        outcome && !outcome.ok && /Control returned to the player/.test(outcome.message),
        { outcome },
      );
    else if (spec.activity === 'idle-cli')
      ctx.check(
        'the resumed agent CLI exits without regaining control or acting',
        outcome &&
          !outcome.timedOut &&
          outcome.code !== 0 &&
          /Control (?:returned to the player|was released)/.test(outcome.stderr),
        { outcome },
      );
    else if (handle.cli) {
      const settled = await Promise.race([handle.settled, ctx.sleep(10_000).then(() => ({ pending: true }))]);
      ctx.check('the killed CLI is gone', settled.signal === 'SIGKILL', { settled });
    } else {
      const settled = await Promise.race([handle.settled, ctx.sleep(10_000).then(() => ({ pending: true }))]);
      ctx.check('the interrupted command did not complete', settled.ok === false, { settled });
    }

    if (expect.mode === 'manual') {
      if (leaseId) {
        const old = await ctx.step('old lease: heartbeat and action', () => oldLease(handle.adapter, leaseId));
        ctx.check('the old session cannot heartbeat or act', old.heartbeat.refused && old.action.refused, old);
      } else ctx.note('oldLease', 'The interrupted CLI process held the lease; the runner cannot use it.');
    }

    if (expect.next.refused && spec.trigger !== 'death') {
      const refused = await ctx.step('a new session while the player cannot play', () =>
        refusedSession(ctx, expect.next.refused),
      );
      ctx.check(`a new session is refused with a message matching /${expect.next.refused}/i`, refused.matches, refused);
    }
    if (offline && !(await rejoinChecks(ctx, plan, expect, { jobId, leaseId, handle, atKick: last }))) return;
    if (expect.next.lease === 'same') {
      const next = await ctx.step('the same lease runs wait 1', async () => {
        try {
          const job = await handle.adapter.execute({ type: 'wait', seconds: 1 });
          return { accepted: true, status: job.status };
        } catch (error) {
          return { accepted: false, message: error.message };
        }
      });
      ctx.check('the same session can start its next action', next.accepted && next.status === 'completed', next);
    } else {
      const next = await ctx.step('a new, explicitly started session runs wait 1', () => explicitSession(ctx));
      const end = await ctx.bridge.observe();
      ctx.check(
        'a new session starts only when explicitly requested and is then accepted',
        next.accepted && next.status === 'completed' && end.mode === 'manual',
        { next, modeAfter: end.mode },
      );
    }
  } finally {
    session.release?.();
    for (const cleanup of session.cleanups.reverse()) await cleanup().catch(() => {});
    for (const adapter of session.adapters) await adapter.close().catch(() => {});
  }
}

const AWAITING = /awaiting the server/i;

/**
 * What a fresh session's acquire gets from the mod right now: refused as "awaiting the server" while the agent's
 * container opening is unanswered. An accepted probe (no session held control) is released at once.
 */
export async function probeAcquire(adapter) {
  const leaseId = randomUUID();
  try {
    await adapter.request('/v1/control', { action: 'acquire', leaseId });
    await adapter.request('/v1/control', { action: 'release', leaseId }).catch(() => {});
    return { refused: false, awaiting: false };
  } catch (error) {
    return { refused: true, awaiting: AWAITING.test(error.message), message: error.message };
  }
}

const pick = (state) => ({
  stopping: state.stopping,
  mode: state.mode,
  job: state.job && { id: state.job.id, type: state.job.type, status: state.job.status, message: state.job.message },
});

const parseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/** The promise's value, or `late()` after `timeoutMs`; polled in short sleeps so no long timer outlives it. */
async function settleWithin(ctx, promise, timeoutMs, late) {
  let outcome = null;
  promise.then((value) => {
    outcome = { value };
  });
  await Promise.resolve();
  const deadline = ctx.now() + timeoutMs;
  while (!outcome && ctx.now() < deadline) await ctx.sleep(100);
  return outcome ? outcome.value : late();
}

/**
 * takeover-while-stopping: the proxy holds the server's replies so the agent's container click stays unanswered;
 * `mc-agent stop` then cancels the job while the opening still awaits the server (`stopping`), and a new session
 * (`mc-agent goto`) must wait until the released reply settles it. If `stopping` never appears the scenario fails
 * as "not observed"; it never passes without it.
 */
export async function runHeldStop(ctx, plan, spec, lifecycle) {
  const { expect } = lifecycle;
  const { proxy } = ctx;
  const session = { adapters: [], cleanups: [], release: null };
  let heldAt = null;
  let watchdog = null;
  let overran = false;
  const release = () => {
    clearTimeout(watchdog);
    if (heldAt === null) return null;
    const heldMs = ctx.now() - heldAt;
    heldAt = null;
    return { heldMs, ...proxy.resume('toClient') };
  };
  const hold = () => {
    const at = proxy.pause('toClient');
    heldAt = ctx.now();
    // Never hold past the cap, whatever step is waiting: a longer hold would let the keep-alive time out.
    watchdog = setTimeout(() => {
      overran = true;
      release();
    }, HOLD.maxMs);
    watchdog.unref?.();
    return at;
  };
  try {
    if (!proxy) {
      ctx.check("the client joined through the runner's pausable proxy", false, { proxy: null });
      return;
    }
    const probe = await ctx.connect();
    session.adapters.push(probe);
    const baseline = await ctx.step('independent baseline before the command', () => reads(ctx, plan, expect.halts));
    // A craft opens its table once, at the start, so the replies are held before it; storage reopens per stack.
    const holdFirst = spec.activity === 'craft-table-4';
    if (holdFirst) await ctx.step("proxy: hold the server's replies to the client", async () => hold());
    const handle = await ctx.step(ACTIVITIES[spec.activity].text(plan, spec), () =>
      startActivity(ctx, plan, spec, session),
    );
    const ready = await ctx.step(`wait until ${READY_TEXT[spec.activity]}`, () => handle.ready());
    ctx.check(`the activity reached the interrupt point (${READY_TEXT[spec.activity]})`, ready.ok, { ready });
    if (!ready.ok) return;
    const jobId = ready.job?.id ?? null;
    const leaseId = handle.adapter?.leaseId ?? null;
    if (!holdFirst) await ctx.step("proxy: hold the server's replies to the client", async () => hold());

    const clicked = await ctx.step('wait for the agent to click and await the held reply', () =>
      poll(
        ctx,
        async () => {
          const answer = await probeAcquire(probe);
          return { ...answer, ok: answer.awaiting };
        },
        { timeoutMs: HOLD.clickMs, intervalMs: 50 },
      ),
    );
    ctx.check(
      clicked.ok
        ? 'the agent clicked and its reply was held: a fresh acquire was refused as awaiting the server'
        : 'not observed: the agent never awaited a held container reply, so `stopping` could not be observed',
      clicked.ok,
      { clicked, proxy: proxy.stats() },
    );
    if (!clicked.ok) {
      ctx.note('stoppingWindow', 'not observed');
      return;
    }

    const stop = await ctx.step(TRIGGERS[spec.trigger].text(plan), () => ctx.cliStop());
    const stopped = await ctx.step('the bridge shows stopping, manual control and the cancelled job', () =>
      poll(
        ctx,
        async () => {
          const state = await ctx.bridge.observe();
          const ended = !!jobId && state.job?.id === jobId && state.job.status !== 'running';
          return { ...pick(state), ok: state.stopping === true && state.mode === 'manual' && ended };
        },
        { timeoutMs: 1500, intervalMs: 50 },
      ),
    );
    const atStop = await ctx.step('independent reads at the stop', () => reads(ctx, plan, expect.halts));
    const { near } = plan.points;
    const next = ctx.cli.start(['goto', String(near.x), String(near.y), String(near.z)]);
    session.cleanups.push(() => next.stop());
    const refused = await ctx.step('a fresh session while stopping is true', () => probeAcquire(probe));
    const during = await ctx.step(
      `watch the bridge for ${HOLD.newSessionMs / 1000} s with the reply held`,
      async () => {
        const seen = [];
        const from = ctx.now();
        const until = from + HOLD.newSessionMs;
        while (ctx.now() < until && ctx.now() - heldAt < HOLD.maxMs - 1000) {
          const state = await ctx.bridge.observe();
          seen.push({ ...pick(state), job: state.job?.id === jobId ? 'interrupted' : pick(state).job });
          await ctx.sleep(100);
        }
        // Cut short when the hold neared its cap: the window then wasn't watched in full.
        seen.windowMs = ctx.now() - from;
        return seen;
      },
    );
    const refusedLate = await probeAcquire(probe);
    const released = await ctx.step('release the held replies', async () => release());
    const releasedAt = ctx.now();
    const settled = await ctx.step('wait for stopping to clear', () =>
      poll(
        ctx,
        async () => {
          const state = await ctx.bridge.observe();
          return { ...pick(state), ok: state.stopping === false };
        },
        { timeoutMs: 10_000, intervalMs: 50 },
      ),
    );
    await ctx.sleep(Math.max(0, releasedAt + 1000 - ctx.now()));
    const first = await ctx.step('independent reads 1 s after the release', () => reads(ctx, plan, expect.halts));
    await ctx.sleep(5000);
    const last = await ctx.step('independent reads 5 s later', () => reads(ctx, plan, expect.halts));
    ctx.note('reads', { baseline, atStop, first, last });
    const walked = await ctx.step('wait for mc-agent goto to finish', () =>
      settleWithin(ctx, next.exited, 60_000, () => ({ timedOut: true, ...next.output() })),
    );
    const position = await ctx.server.position();
    const end = await ctx.bridge.observe();
    ctx.note('final', pick(end));

    ctx.check('mc-agent stop exited 0', stop?.code === 0, { stop });
    ctx.check(
      stopped.ok
        ? 'the bridge showed stopping: true after the stop, with manual control and the job no longer running'
        : 'not observed: `stopping` never appeared after the stop',
      stopped.ok,
      { stopped },
    );
    if (!stopped.ok) ctx.note('stoppingWindow', 'not observed');
    const pattern = new RegExp(expect.job.message, 'i');
    ctx.check(
      `the job ends ${expect.job.status} with a message matching /${expect.job.message}/i`,
      stopped.job?.id === jobId && stopped.job.status === expect.job.status && pattern.test(stopped.job.message),
      { jobId, job: stopped.job },
    );
    ctx.check(
      'while stopping is true a new session cannot start work (a fresh acquire is refused; mc-agent goto starts no job)',
      refused.awaiting &&
        refusedLate.awaiting &&
        during.length > 0 &&
        during.windowMs >= HOLD.newSessionMs &&
        during.every((each) => each.stopping === true && each.mode === 'manual' && each.job === 'interrupted'),
      { refused, refusedLate, during, windowMs: during.windowMs },
    );
    ctx.check(
      `the proxy held the server's replies (under ${HOLD.maxMs / 1000} s, so no keep-alive timed out)`,
      !overran && !!released && released.held.toClient > 0 && released.heldMs <= HOLD.maxMs,
      { released, overran },
    );
    ctx.check('stopping clears once the released reply settles the opening', settled.ok, { settled });
    // Nothing moves between the stop and the release, nor in the 5 s after it.
    checkHalts(ctx, expect.halts, atStop, first, baseline, { offline: false });
    checkHalts(ctx, expect.halts, first, last, baseline, { offline: false });
    const gotoJob = parseJson(walked.stdout ?? '');
    ctx.check(
      'the new session then starts work: mc-agent goto completes three blocks west',
      walked.code === 0 &&
        gotoJob?.type === 'goto' &&
        gotoJob.status === 'completed' &&
        distance(position, center(near)) <= 1.5,
      { walked: { ...walked, stdout: walked.stdout?.slice(-2000) }, position },
    );
    ctx.check(
      'mode becomes manual and stays manual apart from the explicitly started goto',
      stopped.mode === 'manual' && end.mode === 'manual',
      { atStop: stopped.mode, end: end.mode },
    );
    ctx.check('no stopping window at the end (stopping is false)', end.stopping === false, { stopping: end.stopping });
    const interrupted = await settleWithin(ctx, handle.settled, 10_000, () => ({ pending: true }));
    ctx.check('the interrupted command did not complete', interrupted.ok === false, { settled: interrupted });
    if (leaseId) {
      const old = await ctx.step('old lease: heartbeat and action', () => oldLease(handle.adapter, leaseId));
      ctx.check('the old session cannot heartbeat or act', old.heartbeat.refused && old.action.refused, old);
    }
  } finally {
    // Never leave the client cut off from the server, whatever failed.
    if (heldAt !== null) release();
    for (const cleanup of session.cleanups.reverse()) await cleanup().catch(() => {});
    for (const adapter of session.adapters) await adapter.close().catch(() => {});
  }
}

/** Death: refused while dead, then respawn with the keyboard; the session must not resume. */
async function deathChecks(ctx, expect) {
  await ctx.sleep(500);
  const refused = await ctx.step('a new session at the death screen', () => refusedSession(ctx, expect.next.refused));
  ctx.check(`a new session is refused with a message matching /${expect.next.refused}/i`, refused.matches, refused);
  // The death screen enables its buttons after a second; Tab focuses Respawn and Enter presses it.
  await ctx.sleep(2000);
  const respawned = await ctx.step('press Tab and Enter on the death screen to respawn', async () => {
    await ctx.keys.press('tab');
    await ctx.keys.press('enter');
    return poll(
      ctx,
      async () => {
        const state = await ctx.bridge.observe();
        return { ok: !state.paused && state.player?.health > 0, health: state.player?.health, mode: state.mode };
      },
      { timeoutMs: 20_000, intervalMs: 250 },
    );
  });
  ctx.check(
    'the player respawned from the keyboard and the session did not resume',
    respawned.ok && respawned.mode === 'manual',
    respawned,
  );
}
