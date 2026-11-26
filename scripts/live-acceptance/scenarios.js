import {
  bridgeItemTotals,
  distance,
  itemCount,
  itemTotals,
  parseDataReply,
  sameTotals,
  toPosition,
} from './nbt-parse.js';

// Superflat 1.21.1: bedrock -64, dirt -63..-62, grass -61; players stand at y = -60.
export const STAND = -60;
export const LOG = 'minecraft:oak_log';
// Lanes are 64 blocks apart so no fixture's logs are within the bot's 48-block collection search of another lane.
export const laneOrigin = (lane) => ({ x: 96 + 64 * lane, z: 0 });
const RETURNING = /returning to where collection started/;
const COLLECTION_DEADLINE_MS = 180_000;
const RETURN_BUDGET_MS = 60_000;
const COBBLESTONE = 'minecraft:cobblestone';
const PICKAXE = 'minecraft:iron_pickaxe';
const HUSK = 'minecraft:husk';
const OVERWORLD = 'minecraft:overworld';
const NETHER = 'minecraft:the_nether';

export const RELEASE = {
  pit: 'RELEASE.md: "Force a bot mining timeout in a real pit. Verify the bounded return attempt, failure status, preserved inventory progress, and immediate cancellation during recovery."',
  partial:
    'RELEASE.md: "Run collection with partial progress and recovery from a pit ..." (bot half only; Fabric still pending)',
  store:
    'RELEASE.md: "Run collect-and-store with both criteria. Remove stored items during inference and block inspection; stale contents must not produce success. Verify final inspection preserves return-home criteria or reports failure."',
  withdraw:
    'RELEASE.md: "Validate bot withdraw and craft against a local server with the same cases ..." (withdrawal cases)',
  craft:
    'RELEASE.md: "Validate bot withdraw and craft against a local server with the same cases ..." (crafting cases)',
  cobblestone:
    'RELEASE.md: "Validate cobblestone with a pickaxe, hostile observations, and release on dimension change." (bot half)',
  // Fabric gates. On the bot these scenarios are supplemental: they check the bot's own survival behaviour.
  eating:
    'RELEASE.md: "With the packaged Fabric mod, force failed food consumption while hungry and low on health. Verify eating backoff, retreat, and action/retreat deadlines ..." (Fabric gate; the interruption cases are the takeover scenarios)',
  fullInventory:
    'docs/LIFECYCLE-SCENARIOS.md: inventory-full-collect (the job fails on its own and the session keeps control; Fabric checklist item)',
};

const at = (o, dx, y, dz) => `${o.x + dx} ${y} ${o.z + dz}`;
const point = (o, dx, y, dz) => ({ x: o.x + dx, y, z: o.z + dz });
const center = (p) => ({ x: p.x + 0.5, y: p.y, z: p.z + 0.5 });
const forceload = (o, verb) => `forceload ${verb} ${o.x - 16} ${o.z - 16} ${o.x + 16} ${o.z + 16}`;
const killDrops = (o) => `kill @e[type=item,x=${o.x},y=${STAND},z=${o.z},distance=..32]`;
const resetPlayer = (bot) => [`clear ${bot}`, `effect clear ${bot}`];
const teleport = (bot, p) => `tp ${bot} ${p.x} ${p.y} ${p.z}`;
export const readCommands = (bot, chest) => [
  ...(chest ? [`data get block ${chest.x} ${chest.y} ${chest.z} Items`] : []),
  `data get entity ${bot} Inventory`,
  `data get entity ${bot} Pos`,
];

/** A stone plateau with a 3x3, nine-deep oak-log shaft; mining fatigue makes the 180 s mining deadline expire well before 64 logs. */
function pitPlan({ bot, lane }) {
  const o = laneOrigin(lane);
  const start = center(point(o, 3, STAND + 10, 0));
  return {
    origin: o,
    points: { start },
    fixture: [
      forceload(o, 'add'),
      `fill ${at(o, -5, STAND, -5)} ${at(o, 5, STAND + 14, 5)} air`,
      `fill ${at(o, -4, STAND, -4)} ${at(o, 4, STAND + 9, 4)} stone`,
      `fill ${at(o, -1, STAND + 1, -1)} ${at(o, 1, STAND + 9, 1)} oak_log`,
    ],
    prepare: [...resetPlayer(bot), `effect give ${bot} minecraft:mining_fatigue 900 0 true`, teleport(bot, start)],
    cleanup: [
      ...resetPlayer(bot),
      `fill ${at(o, -5, STAND, -5)} ${at(o, 5, STAND + 14, 5)} air`,
      killDrops(o),
      forceload(o, 'remove'),
    ],
  };
}

/** A pre-seeded chest beside the start and an 18-log patch five blocks west. */
export function storePlan({ bot, lane }, { storage = 'chest', depositLogs = 4 } = {}) {
  const o = laneOrigin(lane);
  const chest = point(o, 2, STAND, 0);
  const start = center(point(o, 0, STAND, 0));
  const otherHalf = point(o, 2, STAND, -1);
  const container =
    storage === 'barrel' ? 'barrel[facing=up]' : `chest[facing=west${storage === 'double' ? ',type=left' : ''}]`;
  let items = '{Slot:0b,id:"minecraft:cobblestone",count:5},{Slot:1b,id:"minecraft:oak_log",count:3}';
  if (storage === 'full') {
    items = Array.from({ length: 27 }, (_, slot) => `{Slot:${slot}b,id:"minecraft:cobblestone",count:64}`).join(',');
  } else if (storage === 'double') {
    items = '';
  }
  return {
    origin: o,
    points: { start, chest },
    hooks: {
      removeStored: `data remove block ${chest.x} ${chest.y} ${chest.z} Items`,
      blockLid: `setblock ${chest.x} ${chest.y + 1} ${chest.z} stone`,
    },
    fixture: [
      forceload(o, 'add'),
      `fill ${at(o, -8, STAND, -3)} ${at(o, 4, STAND + 3, 3)} air`,
      `setblock ${chest.x} ${chest.y} ${chest.z} minecraft:${container}{Items:[${items}]}`,
      ...(storage === 'double'
        ? [`setblock ${otherHalf.x} ${otherHalf.y} ${otherHalf.z} minecraft:chest[facing=west,type=right]`]
        : []),
      `fill ${at(o, -6, STAND, -1)} ${at(o, -4, STAND + 1, 1)} oak_log`,
    ],
    prepare: [...resetPlayer(bot), teleport(bot, start), `give ${bot} minecraft:oak_log ${depositLogs}`],
    ...(storage === 'double'
      ? {
          reads: [
            `data get block ${otherHalf.x} ${otherHalf.y} ${otherHalf.z} Items`,
            `execute if block ${chest.x} ${chest.y} ${chest.z} minecraft:chest[facing=west,type=left]`,
            `execute if block ${otherHalf.x} ${otherHalf.y} ${otherHalf.z} minecraft:chest[facing=west,type=right]`,
          ],
        }
      : {}),
    cleanup: [
      ...resetPlayer(bot),
      `fill ${at(o, -8, STAND, -3)} ${at(o, 4, STAND + 3, 3)} air`,
      killDrops(o),
      forceload(o, 'remove'),
    ],
  };
}

/** Home on a two-high stone platform with one step down; an empty chest nine blocks east, out of reach but within 16. */
function platformPlan({ bot, lane }) {
  const o = laneOrigin(lane);
  const chest = point(o, 9, STAND, 0);
  const step = point(o, 2, STAND, 0);
  const start = center(point(o, 0, STAND + 2, 0));
  return {
    origin: o,
    points: { start, chest, step },
    hooks: { removeStep: `setblock ${step.x} ${step.y} ${step.z} air` },
    fixture: [
      forceload(o, 'add'),
      `fill ${at(o, -2, STAND, -2)} ${at(o, 10, STAND + 3, 2)} air`,
      `fill ${at(o, -1, STAND, -1)} ${at(o, 1, STAND + 1, 1)} stone`,
      `setblock ${step.x} ${step.y} ${step.z} stone`,
      `setblock ${chest.x} ${chest.y} ${chest.z} minecraft:chest[facing=west]`,
    ],
    prepare: [...resetPlayer(bot), teleport(bot, start), `give ${bot} minecraft:oak_log 8`],
    cleanup: [
      ...resetPlayer(bot),
      `fill ${at(o, -2, STAND, -2)} ${at(o, 10, STAND + 3, 2)} air`,
      killDrops(o),
      forceload(o, 'remove'),
    ],
  };
}

function cobblestonePlan({ bot, lane }) {
  const o = laneOrigin(lane);
  const start = center(point(o, 0, STAND, 0));
  // Drops can land out of pickup range; keep a reserve so this gate can also exercise navigation.
  const cobblestoneRow = `${at(o, -4, STAND, -1)} ${at(o, -4, STAND, 6)}`;
  const husks = [
    { tag: 'bot_fixture_near', z: 9 },
    { tag: 'bot_fixture_far', z: 22 },
  ].map(({ tag, z }) => ({
    tag,
    pos: center(point(o, 0, STAND, z)),
    box: `${at(o, -1, STAND, z - 1)} ${at(o, 1, STAND + 2, z + 1)}`,
    inside: `${at(o, 0, STAND, z)} ${at(o, 0, STAND + 1, z)}`,
    selector: `@e[type=${HUSK},tag=${tag},limit=1]`,
  }));
  // The pad is above the Nether roof, where the teleport never lands inside terrain.
  const landing = { x: 2.5, y: 201, z: 2.5 };
  const nether = `execute in ${NETHER} run`;
  return {
    origin: o,
    points: { start, landing, cobblestone: point(o, -4, STAND, 0), destination: point(o, 40, STAND, 0) },
    hooks: { teleport: `${nether} ${teleport(bot, landing)}` },
    reads: [`data get entity ${bot} Dimension`, ...husks.map(({ selector }) => `data get entity ${selector} Pos`)],
    fixture: [
      forceload(o, 'add'),
      `fill ${cobblestoneRow} ${COBBLESTONE}`,
      'difficulty normal',
      ...husks.flatMap(({ box, inside, pos, tag }) => [
        `fill ${box} minecraft:glass`,
        `fill ${inside} minecraft:air`,
        `summon ${HUSK} ${pos.x} ${pos.y} ${pos.z} {NoAI:1b,PersistenceRequired:1b,Tags:["${tag}"]}`,
      ]),
      `${nether} forceload add 0 0 4 4`,
      `${nether} fill 0 200 0 4 200 4 minecraft:stone`,
    ],
    prepare: [...resetPlayer(bot), teleport(bot, start), `give ${bot} ${PICKAXE} 1`],
    cleanup: [
      `execute in ${OVERWORLD} run ${teleport(bot, start)}`,
      ...resetPlayer(bot),
      ...husks.flatMap(({ selector, box }) => [`kill ${selector}`, `fill ${box} minecraft:air`]),
      `fill ${cobblestoneRow} minecraft:air`,
      killDrops(o),
      'difficulty peaceful',
      `${nether} fill 0 200 0 4 200 4 minecraft:air`,
      `${nether} forceload remove 0 0 4 4`,
      forceload(o, 'remove'),
    ],
  };
}

function withdrawPlan(
  { bot, lane },
  { outOfRange = false, logs = 20, extraLogs = 0, fullInventory = false, storage = 'chest' } = {},
) {
  const o = laneOrigin(lane);
  const chest = outOfRange ? point(o, 14, STAND, 14) : point(o, 2, STAND, 0);
  const start = center(point(o, 0, STAND, 0));
  // An observable block in the same chunk proves the bot has received the out-of-range chest's chunk.
  const marker = outOfRange ? { ...point(o, 2, STAND, 0), name: LOG } : null;
  const stocks = [
    ...(logs ? [`{Slot:0b,id:"minecraft:oak_log",count:${logs}}`] : []),
    '{Slot:1b,id:"minecraft:cobblestone",count:5}',
    ...(extraLogs ? [`{Slot:2b,id:"minecraft:oak_log",count:${extraLogs}}`] : []),
  ];
  const held = fullInventory ? { [LOG]: 60, 'minecraft:cobblestone': 35 * 64 } : {};
  const clearCorner = outOfRange ? at(o, 14, STAND + 3, 14) : at(o, 4, STAND + 3, 3);
  const clearArea = `fill ${at(o, -3, STAND, -3)} ${clearCorner} air`;
  return {
    origin: o,
    points: { start, chest },
    marker,
    held,
    stock: { [LOG]: logs + extraLogs, 'minecraft:cobblestone': 5 },
    storage,
    fixture: [
      forceload(o, 'add'),
      clearArea,
      `setblock ${chest.x} ${chest.y} ${chest.z} minecraft:${storage}[facing=west]{Items:[${stocks.join(',')}]}`,
      ...(marker ? [`setblock ${marker.x} ${marker.y} ${marker.z} ${marker.name}`] : []),
    ],
    prepare: [
      ...resetPlayer(bot),
      teleport(bot, start),
      ...Object.entries(held).map(([item, count]) => `give ${bot} ${item} ${count}`),
    ],
    cleanup: [...resetPlayer(bot), clearArea, killDrops(o), forceload(o, 'remove')],
  };
}

/**
 * Open ground with no crafting table; the player holds 3 oak logs and 3 cobblestone. The craft action places the
 * crafting table it made on one of the eight blocks beside the start, all of which are read before and after.
 */
function craftPlan({ bot, lane }, supplies = ['minecraft:oak_log 3', 'minecraft:cobblestone 3']) {
  const o = laneOrigin(lane);
  const start = center(point(o, 0, STAND, 0));
  const beside = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ].map(([dx, dz]) => point(o, dx, STAND, dz));
  return {
    origin: o,
    points: { start, beside },
    reads: beside.map((cell) => tableAt(cell)),
    fixture: [forceload(o, 'add'), `fill ${at(o, -4, STAND, -4)} ${at(o, 4, STAND + 3, 4)} air`],
    prepare: [...resetPlayer(bot), teleport(bot, start), ...supplies.map((stack) => `give ${bot} ${stack}`)],
    cleanup: [
      ...resetPlayer(bot),
      `fill ${at(o, -4, STAND, -4)} ${at(o, 4, STAND + 3, 4)} air`,
      killDrops(o),
      forceload(o, 'remove'),
    ],
  };
}
export const tableAt = ({ x, y, z }) => `execute if block ${x} ${y} ${z} minecraft:crafting_table`;
/** The craft-bootstrap sequence: 3 logs → 12 planks → table → 4 sticks → stone pickaxe (places the table) → wooden pickaxe (reuses it). */
export const CRAFT_SEQUENCE = [
  ['oak_planks', 12],
  ['crafting_table', 1],
  ['stick', 4],
  ['stone_pickaxe', 1],
  ['wooden_pickaxe', 1],
];
// What the server inventory must hold afterwards: 12 planks − 4 (table) − 2 (sticks) − 3 (wooden pickaxe) = 3.
const CRAFT_RESULT = {
  'minecraft:stone_pickaxe': 1,
  'minecraft:wooden_pickaxe': 1,
  'minecraft:oak_planks': 3,
  'minecraft:stick': 0,
  'minecraft:crafting_table': 0,
  'minecraft:oak_log': 0,
  'minecraft:cobblestone': 0,
};

/** Planner decisions served without a model; `before[i]` runs while the agent awaits decision i (its "inference" window). */
export function scriptedPlanner(decisions, { before = {} } = {}) {
  let request = 0;
  const fetchImpl = async () => {
    const index = request++;
    if (before[index]) await before[index]();
    const decision = decisions[Math.min(index, decisions.length - 1)];
    return {
      ok: true,
      status: 200,
      json: async () => ({ message: { content: JSON.stringify(decision) } }),
      text: async () => '',
    };
  };
  fetchImpl.requests = () => request;
  return fetchImpl;
}

/** Wraps a real model's fetch: the first request matching `trigger` also runs `hook`, so the change lands during that inference. */
export function interceptInference(trigger, hook, fetchImpl = fetch) {
  let fired = false;
  const wrapped = async (url, init) => {
    let body = null;
    try {
      body = JSON.parse(init?.body);
    } catch {}
    if (!fired && body && trigger(body)) {
      fired = true;
      const [response] = await Promise.all([fetchImpl(url, init), hook()]);
      return response;
    }
    return fetchImpl(url, init);
  };
  wrapped.fired = () => fired;
  return wrapped;
}

/** True once the planner history (sent with every request) shows a completed deposit. */
export function depositCompleted(body) {
  let content = {};
  try {
    content = JSON.parse(body.messages?.at(-1)?.content ?? '{}');
  } catch {}
  return (content.history || []).some((entry) => entry.action?.type === 'deposit' && entry.result);
}

async function snapshot(ctx, chest) {
  const items = chest ? await ctx.server.items(chest) : null;
  const inventory = await ctx.server.inventory();
  const position = await ctx.server.position();
  return { chest: items && itemTotals(items), held: itemCount(inventory, LOG), position };
}

const spread = (samples) =>
  Math.max(
    ...['x', 'y', 'z'].map(
      (axis) => Math.max(...samples.map((s) => s[axis])) - Math.min(...samples.map((s) => s[axis])),
    ),
  );
const heldOnBridge = (state) =>
  (state.inventory || []).filter((item) => item.name === LOG).reduce((total, item) => total + item.count, 0);

async function runCobblestone(ctx, plan) {
  const { landing, destination, cobblestone } = plan.points;
  const [dimensionRead, nearRead, farRead] = plan.reads;
  const serverData = async (command) => parseDataReply(await ctx.server.command(command)).value;
  const baseline = await ctx.step(
    'independent baseline (inventory, player position and dimension, husk positions)',
    async () => ({
      inventory: itemTotals(await ctx.server.inventory()),
      position: await ctx.server.position(),
      cobblestonePresent: await ctx.server.testBlock(cobblestone, COBBLESTONE),
      dimension: await serverData(dimensionRead),
      near: toPosition(await serverData(nearRead)),
      far: toPosition(await serverData(farRead)),
    }),
  );
  ctx.check(
    'server starts in the Overworld with a pickaxe, cobblestone in the fixture, and none held',
    baseline.dimension === OVERWORLD && baseline.cobblestonePresent && sameTotals(baseline.inventory, { [PICKAXE]: 1 }),
    baseline,
  );

  const threats = await ctx.step('bridge: observe nearby hostiles', async () => (await ctx.bridge.observe()).threats);
  const husks = (threats ?? []).filter(({ type }) => type === HUSK);
  const nearDistance = distance(baseline.position, baseline.near);
  const near = husks.find((threat) => distance(threat, baseline.near) <= 0.5);
  const farDistance = distance(baseline.position, baseline.far);
  ctx.check(
    'bridge reports the nearby husk at the server position and distance',
    nearDistance <= 16 && !!near && Math.abs(near.distance - nearDistance) <= 0.5,
    { serverPosition: baseline.near, serverDistance: nearDistance, observed: near },
  );
  ctx.check(
    'bridge omits the husk outside the 16-block threat radius',
    farDistance > 16 && !husks.some((threat) => distance(threat, baseline.far) <= 0.5),
    { serverPosition: baseline.far, serverDistance: farDistance, observed: husks },
  );

  const collected = await ctx.step('bridge: collect cobblestone 4 with the held pickaxe', () =>
    ctx.bridge.execute({ type: 'collect', block: COBBLESTONE, count: 4 }),
  );
  const inventory = await ctx.step('independent inventory after collection', async () =>
    itemTotals(await ctx.server.inventory()),
  );
  const observedInventory = bridgeItemTotals((await ctx.bridge.observe()).inventory);
  const held = inventory[COBBLESTONE] ?? 0;
  ctx.check(
    'collection completes and server inventory contains at least four cobblestone and the pickaxe',
    collected.status === 'completed' && held >= 4 && sameTotals(inventory, { [PICKAXE]: 1, [COBBLESTONE]: held }),
    { job: collected, inventory },
  );
  ctx.check('bridge inventory agrees with the server', sameTotals(inventory, observedInventory), {
    inventory,
    observedInventory,
  });

  const position = await ctx.server.position();
  const navigation = ctx.bridge
    .execute(
      { type: 'goto', ...destination },
      {
        signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(15_000)]),
      },
    )
    .then(
      (job) => ({ job }),
      (error) => ({ error: error.message }),
    );
  const moving = await ctx.step('wait for an active goto with server-observed movement', async () => {
    const deadline = ctx.now() + 8000;
    do {
      const { mode, job } = await ctx.bridge.observe();
      if (mode === 'agent' && job?.type === 'goto' && job.status === 'running') {
        const current = await ctx.server.position();
        if (distance(current, position) >= 1) return { job, position: current };
      } else if (job?.type === 'goto' && job.status !== 'running') return null;
      await ctx.sleep(250);
    } while (ctx.now() < deadline);
    return null;
  });
  ctx.check('dimension change is triggered during active navigation', !!moving, { moving });
  if (!moving) {
    await ctx.bridge.cancel();
    ctx.note('navigation', await navigation);
    return;
  }
  await ctx.step('server: teleport the player to the Nether while goto runs', () =>
    ctx.server.command(plan.hooks.teleport),
  );
  const outcome = await navigation;
  const landed = () =>
    ctx.step('independent server dimension and position', async () => ({
      dimension: await serverData(dimensionRead),
      position: await ctx.server.position(),
    }));
  const first = await landed();
  await ctx.sleep(1500);
  const last = await landed();
  const state = await ctx.bridge.observe();
  ctx.check(
    'the same goto is cancelled by the dimension change and control returns to manual',
    state.connected &&
      state.mode === 'manual' &&
      !state.stopping &&
      state.job?.id === moving.job.id &&
      state.job.status === 'cancelled' &&
      /dimension changed/i.test(state.job.message) &&
      !!outcome.error,
    { outcome, mode: state.mode, stopping: state.stopping, job: state.job },
  );
  ctx.check(
    'server confirms the Nether landing and no resumed navigation',
    first.dimension === NETHER &&
      last.dimension === NETHER &&
      distance(first.position, landing) <= 0.5 &&
      distance(first.position, last.position) <= 0.2,
    { first, last, landing },
  );
  ctx.check(
    'bridge position and dimension agree with the server',
    state.player?.dimension === last.dimension &&
      !!state.player?.position &&
      distance(state.player.position, last.position) <= 0.5,
    { bridge: state.player, server: last },
  );
}

/** Shared by the timeout, cancel, and stop scenarios. mode: timeout | cancel | stop. */
async function runRecovery(ctx, plan, mode) {
  const { start } = plan.points;
  const before = await ctx.step('independent baseline (server inventory and Pos)', () => snapshot(ctx));
  ctx.note('baseline', before);
  const progress = [];
  const started = ctx.now();
  let returningAt = null;
  let interrupt = null;
  const issue = async () => {
    await ctx.sleep(1000);
    const state = await ctx.bridge.observe();
    const record = { atMs: ctx.now() - started, jobBefore: state.job, positionBefore: state.player?.position ?? null };
    if (state.job?.status !== 'running') return record;
    record.requestedAt = ctx.now();
    if (mode === 'cancel') await ctx.bridge.cancel();
    else record.cli = await ctx.cliStop();
    return record;
  };
  const outcome = await ctx.step(
    'bridge: collect oak_log 64 in the pit (mining deadline 180 s, return budget 60 s)',
    async () => {
      try {
        const job = await ctx.bridge.execute(
          { type: 'collect', block: 'oak_log', count: 64 },
          {
            onProgress: (job) => {
              progress.push({ atMs: ctx.now() - started, status: job.status, message: job.message });
              if (returningAt === null && RETURNING.test(job.message || '')) {
                returningAt = ctx.now();
                if (mode !== 'timeout')
                  interrupt = ctx
                    .step(
                      `${mode === 'cancel' ? 'bridge: /v1/cancel (lease cancel)' : 'cli: mc-agent stop (emergency stop from a second process)'} during recovery`,
                      issue,
                    )
                    // Handled now so Ctrl+C or a refused cancel cannot become an unhandled rejection before it is awaited.
                    .catch((error) => ({ error: error.message }));
              }
            },
          },
        );
        return { settled: 'completed', message: job.message };
      } catch (error) {
        return { settled: 'rejected', message: error.message };
      }
    },
  );
  const endedAt = ctx.now();
  const interruptRecord = interrupt ? await interrupt : null;
  ctx.note('progress', progress);
  ctx.note('outcome', {
    ...outcome,
    durationMs: endedAt - started,
    returnStartedAfterMs: returningAt && returningAt - started,
    interrupt: interruptRecord,
  });

  let settledState = await ctx.bridge.observe();
  if (mode !== 'timeout' && interruptRecord?.requestedAt) {
    for (
      let waited = 0;
      (settledState.stopping || settledState.job?.status === 'running') && waited < 10_000;
      waited += 250
    ) {
      await ctx.sleep(250);
      settledState = await ctx.bridge.observe();
    }
    ctx.note('settledAfterMs', ctx.now() - interruptRecord.requestedAt);
  }
  const after = await ctx.step('independent final state', () => snapshot(ctx));
  ctx.note('final', {
    server: after,
    bridgeJob: settledState.job,
    mode: settledState.mode,
    bridgePosition: settledState.player?.position ?? null,
  });
  const inventoryMatch = /Inventory: (\d+)\/(\d+)/.exec(outcome.message);
  ctx.check('inventory progress preserved on the server', after.held > before.held, {
    before: before.held,
    after: after.held,
  });
  ctx.check('bridge inventory agrees with the server', heldOnBridge(settledState) === after.held, {
    bridge: heldOnBridge(settledState),
    server: after.held,
  });

  if (mode === 'timeout') {
    ctx.check('job failed', settledState.job?.status === 'failed' && outcome.settled === 'rejected', {
      job: settledState.job,
    });
    ctx.check(
      'failure is the mining deadline',
      /Collection timed out before reaching the requested quota/.test(outcome.message),
      { message: outcome.message },
    );
    ctx.check(
      'return attempt started after the mining deadline',
      returningAt !== null && returningAt - started >= COLLECTION_DEADLINE_MS - 10_000,
      { returnStartedAfterMs: returningAt && returningAt - started },
    );
    ctx.check(
      'return attempt bounded (≤ 60 s + 10 s polling slack)',
      returningAt !== null && endedAt - returningAt <= RETURN_BUDGET_MS + 10_000,
      { returnMs: returningAt && endedAt - returningAt },
    );
    ctx.check(
      'reported inventory matches the server',
      inventoryMatch !== null && Number(inventoryMatch[1]) === after.held,
      { reported: inventoryMatch?.[0] ?? null, server: after.held },
    );
    const gap = distance(after.position, start);
    if (/Returned to the starting point/.test(outcome.message))
      ctx.check('reported return agrees with server Pos (≤ 2.5 blocks)', gap <= 2.5, { distance: gap });
    else
      ctx.check('reported failed return agrees with server Pos (> 2 blocks)', gap > 2, {
        distance: gap,
        message: outcome.message,
      });
    return;
  }
  ctx.check(
    'interrupt issued while recovery was running',
    interruptRecord?.requestedAt !== undefined && RETURNING.test(interruptRecord?.jobBefore?.message || ''),
    {
      jobBefore: interruptRecord?.jobBefore ?? null,
      note: interruptRecord ? undefined : 'No return trip was observed; the bot never moved more than 2 blocks.',
    },
  );
  ctx.check('job cancelled, not failed or completed', settledState.job?.status === 'cancelled', {
    job: settledState.job,
  });
  ctx.check(
    'bridge settled (no job running or stopping) within 5 s',
    !settledState.stopping && ctx.observations.settledAfterMs <= 5000,
    { settledAfterMs: ctx.observations.settledAfterMs },
  );
  if (mode === 'stop')
    ctx.check('emergency stop returned control (mode manual)', settledState.mode === 'manual', {
      mode: settledState.mode,
    });
  else
    ctx.check('cancel reported as cancelled by the agent', /Cancelled by agent/.test(settledState.job?.message || ''), {
      message: settledState.job?.message,
    });
  const samples = await ctx.step('independent Pos samples after a 1.5 s settle, 1.5 s apart', async () => {
    await ctx.sleep(1500);
    const out = [];
    for (let i = 0; i < 3; i++) {
      if (i) await ctx.sleep(1500);
      out.push(await ctx.server.position());
    }
    return out;
  });
  ctx.note('positionSamples', samples);
  ctx.check('position stopped changing (spread ≤ 0.2 blocks)', spread(samples) <= 0.2, { spread: spread(samples) });
  const bridgePosition = (await ctx.bridge.observe()).player?.position;
  ctx.check(
    'bridge position agrees with server Pos (≤ 0.6 blocks)',
    !!bridgePosition && distance(bridgePosition, samples.at(-1)) <= 0.6,
    { bridge: bridgePosition, server: samples.at(-1) },
  );
}

/** Shared by the gather-and-store, stale-removal, blocked-lid, and model scenarios. */
async function runStore(ctx, plan, variant) {
  const { chest, start } = plan.points;
  const before = await ctx.step('independent baseline (chest Items, Inventory, Pos)', () => snapshot(ctx, chest));
  ctx.note('baseline', before);
  await ctx.step('bridge: set_home at the start position', () => ctx.bridge.execute({ type: 'set_home' }));
  const criteria = {
    collect: { block: 'oak_log', count: 8 },
    deposit: { item: 'oak_log', count: 8 },
    returnHome: true,
  };
  const goal = 'Collect eight additional oak logs, store them in the nearby chest, then return home.';
  let storedBeforeRemoval = null;
  const removeStored = async () => {
    storedBeforeRemoval = await ctx.step('independent chest read before removal', async () =>
      itemTotals(await ctx.server.items(chest)),
    );
    return ctx.step(`server (stored items removed externally): ${plan.hooks.removeStored}`, () =>
      ctx.server.command(plan.hooks.removeStored),
    );
  };
  const blockLid = () =>
    ctx.step(`server (lid blocked): ${plan.hooks.blockLid}`, () => ctx.server.command(plan.hooks.blockLid));
  const decisions = [
    { type: 'collect', block: 'oak_log', count: 8 },
    { type: 'deposit', item: 'oak_log', count: 8 },
    { type: 'home' },
    { type: 'done', reason: 'Scripted acceptance run finished.' },
  ];
  let result;
  if (variant === 'model') {
    const fetchImpl = interceptInference(depositCompleted, removeStored);
    result = await ctx.step(`agent with real model ${ctx.options.model}`, () =>
      ctx.agent({ goal, criteria, model: ctx.options.model, fetchImpl }),
    );
    ctx.note('removalDuringInference', fetchImpl.fired());
    ctx.check('items were removed during a model inference after a completed deposit', fetchImpl.fired(), {});
    ctx.check(
      'the deposit stored 8 before the removal, so a stale +8 existed',
      (storedBeforeRemoval?.[LOG] || 0) - (before.chest[LOG] || 0) >= 8,
      { beforeRemoval: storedBeforeRemoval, baseline: before.chest },
    );
  } else {
    const before3 = variant === 'stale' ? removeStored : variant === 'blocked' ? blockLid : null;
    result = await ctx.step('agent with scripted planner (no model): collect 8 → deposit 8 → home → done', () =>
      ctx.agent({ goal, criteria, fetchImpl: scriptedPlanner(decisions, { before: before3 ? { 3: before3 } : {} }) }),
    );
  }
  ctx.note('agent', {
    status: result.status,
    steps: result.steps,
    verification: result.verification ?? null,
    actionCounts: result.actionCounts,
  });
  const after = await ctx.step('independent final state', () => snapshot(ctx, chest));
  ctx.note('final', after);
  const deposit = result.verification?.checks?.deposit;
  const inventory = result.verification?.checks?.inventory;
  const serverStored = (after.chest[LOG] || 0) - (before.chest[LOG] || 0);
  ctx.check(
    'agent storage evidence matches server chest (no cached count)',
    deposit?.storedAdditional === serverStored || (variant === 'blocked' && deposit?.error),
    { agentStoredAdditional: deposit?.storedAdditional ?? null, serverStoredAdditional: serverStored },
  );
  if (variant === 'store') {
    ctx.check('agent reports criteria_met', result.status === 'criteria_met', { status: result.status });
    ctx.check('deposit evidence was refreshed', deposit?.evidence === 'refreshed', { evidence: deposit?.evidence });
    ctx.check('server chest holds 8 more oak logs', serverStored >= 8, { serverStoredAdditional: serverStored });
    ctx.check(
      'net collection across inventory and storage ≥ 8 on the server',
      after.held - before.held + serverStored >= 8,
      { heldBefore: before.held, heldAfter: after.held, serverStored },
    );
    ctx.check(
      'other chest contents untouched',
      (after.chest['minecraft:cobblestone'] || 0) === (before.chest['minecraft:cobblestone'] || 0),
      { before: before.chest, after: after.chest },
    );
    ctx.check('agent inventory count matches server', inventory?.currentCount === after.held, {
      agent: inventory?.currentCount,
      server: after.held,
    });
    ctx.check('server Pos within 2 blocks of home', distance(after.position, start) <= 2, {
      distance: distance(after.position, start),
    });
  } else if (variant === 'stale') {
    ctx.check(
      'the deposit really stored 8 before the removal, so a stale +8 existed',
      (storedBeforeRemoval?.[LOG] || 0) - (before.chest[LOG] || 0) >= 8,
      { beforeRemoval: storedBeforeRemoval, baseline: before.chest },
    );
    ctx.check('no success after external removal', result.status !== 'criteria_met', { status: result.status });
    ctx.check('final deposit evidence was refreshed', deposit?.evidence === 'refreshed', {
      evidence: deposit?.evidence,
    });
    ctx.check('server chest empty after removal', !after.chest[LOG], { chest: after.chest });
  } else if (variant === 'blocked') {
    ctx.check('no success with a blocked lid', result.status !== 'criteria_met', { status: result.status });
    ctx.check(
      'inspection failure reported in deposit check',
      /did not open/.test(deposit?.error || '') && deposit?.met === false,
      { deposit },
    );
    ctx.check('items really were stored (server +8), so failure is not a missing deposit', serverStored >= 8, {
      serverStoredAdditional: serverStored,
    });
    const direct = await ctx.step('bridge: inspect_storage with the lid still blocked', async () => {
      try {
        return { settled: 'completed', message: (await ctx.bridge.execute({ type: 'inspect_storage' })).message };
      } catch (error) {
        return { settled: 'rejected', message: error.message };
      }
    });
    ctx.check(
      'direct inspect_storage fails with a blocked lid',
      direct.settled === 'rejected' && /did not open/.test(direct.message),
      direct,
    );
  } else if (variant === 'model') {
    const success = result.status === 'criteria_met';
    ctx.check(
      'success only with fresh server evidence',
      !success || (serverStored >= 8 && deposit?.evidence === 'refreshed'),
      { status: result.status, serverStored },
    );
  }
}

const settledAction = async (ctx, action) => {
  try {
    const job = await ctx.bridge.execute(action);
    return { settled: 'completed', message: job.message, container: job.container ?? null };
  } catch (error) {
    return { settled: 'rejected', message: error.message, container: error.container ?? null };
  }
};

function depositScenario({ id, lane, title, storage, count, held, moved, failure }) {
  return {
    id,
    lane,
    title,
    release: [RELEASE.store],
    plan(input) {
      const plan = storePlan(input, { storage, depositLogs: held });
      const { chest } = plan.points;
      const containers = [chest];
      const filler = storage === 'full' ? 27 * 64 : 5;
      let stock = [{ [LOG]: storage === 'full' ? 0 : 3, 'minecraft:cobblestone': filler }];
      if (storage === 'double') {
        const other = { ...chest, z: chest.z - 1 };
        const items = Array.from({ length: 26 }, (_, slot) => `{Slot:${slot}b,id:"minecraft:cobblestone",count:64}`);
        // Each half has exactly one empty slot; moving more than one stack must use both halves.
        plan.fixture.push(...[chest, other].map(({ x, y, z }) => `data merge block ${x} ${y} ${z} {Items:[${items}]}`));
        containers.push(other);
        stock = containers.map(() => ({ 'minecraft:cobblestone': 26 * 64 }));
      }
      return { ...plan, containers, stock };
    },
    async run(ctx, plan) {
      const read = async () => ({
        storage: await Promise.all(
          plan.containers.map(async (position) => itemTotals(await ctx.server.items(position))),
        ),
        inventory: itemTotals(await ctx.server.inventory()),
      });
      const before = await ctx.step('independent baseline (storage Items and Inventory)', read);
      ctx.check(
        'server starts with the expected storage and held items',
        before.storage.every((contents, index) => sameTotals(contents, plan.stock[index])) &&
          sameTotals(before.inventory, { [LOG]: held }),
        { before, stock: plan.stock },
      );
      const outcome = await ctx.step(`deposit oak_log${count === undefined ? '' : ` ${count}`}`, () =>
        settledAction(ctx, { type: 'deposit', item: 'oak_log', ...(count === undefined ? {} : { count }) }),
      );
      const state = await ctx.bridge.observe();
      const after = await ctx.step('independent final state (storage Items and Inventory)', read);
      const changes = after.storage.map((contents, index) => (contents[LOG] ?? 0) - (before.storage[index][LOG] ?? 0));
      ctx.check(
        'job reports the expected transfer or refusal',
        state.job?.status === (failure ? 'failed' : 'completed') &&
          outcome.settled === (failure ? 'rejected' : 'completed') &&
          (failure ? failure.test(outcome.message) : outcome.message.startsWith(`Deposited ${moved} oak_log into `)),
        { outcome, status: state.job?.status },
      );
      ctx.check(
        'independent server reads show the expected transfer across storage and inventory',
        changes.every((change) => change > 0 || (moved === 0 && change === 0)) &&
          changes.reduce((sum, change) => sum + change, 0) === moved &&
          after.storage.every((contents, index) =>
            sameTotals({ ...contents, [LOG]: 0 }, { ...before.storage[index], [LOG]: 0 }),
          ) &&
          sameTotals(after.inventory, { [LOG]: held - moved }) &&
          sameTotals(bridgeItemTotals(state.inventory), after.inventory),
        { before, after, moved, changes },
      );
    },
    actions: [
      `bridge: deposit oak_log${count === undefined ? '' : ` ${count}`} into ${storage} with ${held} logs held`,
    ],
    expect: [
      failure ? `job fails with ${failure}` : `job reports ${moved} logs deposited`,
      `server independently shows ${moved} logs moved and non-matching contents preserved`,
    ],
  };
}

async function runWithdraw(ctx, plan, { count, moved = count, failure, noCandidate = false }) {
  const { chest, start } = plan.points;
  const read = async () => ({
    chest: itemTotals(await ctx.server.items(chest)),
    inventory: itemTotals(await ctx.server.inventory()),
    position: await ctx.server.position(),
  });
  const before = await ctx.step('independent baseline (chest Items, Inventory, Pos)', read);
  ctx.note('baseline', before);
  const outcome = await ctx.step(`bridge: withdraw oak_log${count === undefined ? '' : ` ${count}`}`, () =>
    settledAction(ctx, { type: 'withdraw', item: 'oak_log', ...(count === undefined ? {} : { count }) }),
  );
  ctx.note('outcome', outcome);
  const state = await ctx.bridge.observe();
  const after = await ctx.step('independent final state', read);
  ctx.note('final', { server: after, bridgeJob: state.job, bridgeContainers: state.containers ?? null });
  ctx.check(
    'server baseline matches the seeded chest and starting inventory',
    sameTotals(before.chest, plan.stock) && sameTotals(before.inventory, plan.held),
    { before, expectedChest: plan.stock, expectedInventory: plan.held },
  );
  const status = failure ? 'failed' : 'completed';
  ctx.check(`job ${status}`, outcome.settled === (failure ? 'rejected' : 'completed') && state.job?.status === status, {
    outcome,
    job: state.job,
  });
  const message = outcome.message || '';
  ctx.check(
    failure ? 'job reports the expected withdrawal failure' : `job reports ${moved} oak logs withdrawn`,
    failure ? failure.test(message) : message.startsWith(`Withdrew ${moved} oak_log from `),
    { message },
  );
  const taken = (before.chest[LOG] || 0) - (after.chest[LOG] || 0);
  ctx.check(`server chest holds exactly ${moved} fewer oak logs`, taken === moved, {
    before: before.chest,
    after: after.chest,
  });
  ctx.check('other chest contents untouched', sameTotals({ ...before.chest, [LOG]: 0 }, { ...after.chest, [LOG]: 0 }), {
    before: before.chest,
    after: after.chest,
  });
  const expectedInventory = { ...before.inventory, [LOG]: (before.inventory[LOG] || 0) + moved };
  ctx.check(
    `server inventory holds ${moved} more oak logs with other items unchanged`,
    sameTotals(after.inventory, expectedInventory),
    { expected: expectedInventory, after: after.inventory },
  );
  const reported = outcome.container;
  const bridgeInventory = bridgeItemTotals(state.inventory);
  ctx.check('bridge inventory agrees with the server', sameTotals(bridgeInventory, after.inventory), {
    bridge: bridgeInventory,
    server: after.inventory,
  });
  ctx.check('the bot stayed within 2 blocks of the start', distance(after.position, start) <= 2, {
    distance: distance(after.position, start),
  });
  if (noCandidate) {
    ctx.check('job reports no container', !reported, { container: reported });
    const drift = distance(before.position, after.position);
    ctx.check('server position stayed fixed when no container was in range', drift <= 0.2, { distance: drift });
    return;
  }
  ctx.check(
    'job names the seeded container',
    reported?.name === `minecraft:${plan.storage}` &&
      reported.x === chest.x &&
      reported.y === chest.y &&
      reported.z === chest.z,
    { container: reported, chest },
  );
  ctx.check(
    'job container.before matches the server baseline',
    Array.isArray(reported?.before) && sameTotals(bridgeItemTotals(reported.before), before.chest),
    { reported: reported?.before ?? null, server: before.chest },
  );
  const observed = (state.containers || []).find(
    (entry) => entry.x === chest.x && entry.y === chest.y && entry.z === chest.z,
  );
  ctx.check(
    'bridge container observation agrees with the server chest',
    Array.isArray(observed?.items) && sameTotals(bridgeItemTotals(observed.items), after.chest),
    { bridge: observed?.items ?? null, server: after.chest },
  );
}

async function runCraft(ctx, plan) {
  const { start, beside } = plan.points;
  const tables = async () => {
    const found = [];
    for (const cell of beside) if (await ctx.server.testBlock(cell, 'minecraft:crafting_table')) found.push(cell);
    return found;
  };
  const before = await ctx.step('independent baseline (Inventory, crafting tables beside the start)', async () => ({
    inventory: itemTotals(await ctx.server.inventory()),
    tables: await tables(),
  }));
  ctx.note('baseline', before);
  const jobs = {};
  for (const [item, count] of CRAFT_SEQUENCE)
    jobs[item] = await ctx.step(`bridge: craft ${item} ${count}`, () =>
      settledAction(ctx, { type: 'craft', item, count }),
    );
  ctx.note('jobs', jobs);
  const state = await ctx.bridge.observe();
  const after = await ctx.step(
    'independent final state (Inventory, crafting tables beside the start, Pos)',
    async () => ({
      inventory: itemTotals(await ctx.server.inventory()),
      tables: await tables(),
      position: await ctx.server.position(),
    }),
  );
  ctx.note('final', { server: after, bridgeInventory: state.inventory ?? null });
  ctx.check(
    'every craft completed',
    CRAFT_SEQUENCE.every(([item]) => jobs[item]?.settled === 'completed'),
    { jobs },
  );
  ctx.check(
    'each job reports the crafted amount',
    CRAFT_SEQUENCE.every(([item, count]) => new RegExp(`Crafted ${count} ${item}\\b`).test(jobs[item]?.message || '')),
    { messages: Object.fromEntries(CRAFT_SEQUENCE.map(([item]) => [item, jobs[item]?.message])) },
  );
  ctx.check('no crafting table beside the start before crafting', before.tables.length === 0, {
    tables: before.tables,
  });
  ctx.check(
    'server inventory holds the crafted results and nothing left over',
    sameTotals(Object.fromEntries(Object.keys(CRAFT_RESULT).map((id) => [id, after.inventory[id] || 0])), CRAFT_RESULT),
    { expected: CRAFT_RESULT, server: after.inventory },
  );
  const placed = /Placed a crafting table at (-?\d+) (-?\d+) (-?\d+)/.exec(jobs.stone_pickaxe?.message || '');
  const reported = placed && { x: Number(placed[1]), y: Number(placed[2]), z: Number(placed[3]) };
  ctx.check('exactly one crafting table now stands beside the start', after.tables.length === 1, {
    tables: after.tables,
  });
  ctx.check(
    'the stone_pickaxe job placed it and reported its block',
    !!reported && after.tables.some((cell) => cell.x === reported.x && cell.y === reported.y && cell.z === reported.z),
    { reported, tables: after.tables },
  );
  ctx.check(
    'the wooden_pickaxe job reused the placed table',
    !/Placed a crafting table/.test(jobs.wooden_pickaxe?.message || ''),
    {
      message: jobs.wooden_pickaxe?.message,
    },
  );
  const bridgeInventory = bridgeItemTotals(state.inventory);
  ctx.check('bridge inventory agrees with the server', sameTotals(bridgeInventory, after.inventory), {
    bridge: bridgeInventory,
    server: after.inventory,
  });
  ctx.check('the bot stayed at the start (server Pos within 1.5 blocks)', distance(after.position, start) <= 1.5, {
    distance: distance(after.position, start),
  });
}

function craftRefusalScenario({ id, lane, title, count, cobblestone, message }) {
  return {
    id,
    lane,
    title,
    release: [RELEASE.craft],
    plan(input) {
      const supplies = ['minecraft:oak_log 2'];
      if (cobblestone) supplies.push(`minecraft:cobblestone ${cobblestone}`);
      return { ...craftPlan(input, supplies), reads: [] };
    },
    async run(ctx, plan) {
      const before = await ctx.step('independent baseline (Inventory)', async () => {
        const stacks = await ctx.server.inventory();
        return { inventory: itemTotals(stacks), stacks: stacks.length };
      });
      ctx.note('baseline', before);
      ctx.check(
        'server inventory matches the fixture',
        sameTotals(before.inventory, { [LOG]: 2, 'minecraft:cobblestone': cobblestone }) &&
          before.stacks === (cobblestone ? 36 : 1),
        before,
      );
      const outcome = await ctx.step(`bridge: craft oak_planks ${count}`, () =>
        settledAction(ctx, { type: 'craft', item: 'oak_planks', count }),
      );
      const state = await ctx.bridge.observe();
      ctx.check(
        'craft failed for the expected reason',
        outcome.settled === 'rejected' && state.job?.status === 'failed' && outcome.message.startsWith(message),
        { outcome, job: state.job },
      );
      const after = await ctx.step('independent final state (Inventory, Pos)', async () => ({
        inventory: itemTotals(await ctx.server.inventory()),
        position: await ctx.server.position(),
      }));
      ctx.note('final', after);
      ctx.check(
        'server inventory still holds the ingredients and no planks',
        sameTotals(before.inventory, after.inventory),
        { before: before.inventory, after: after.inventory },
      );
      ctx.check(
        'bridge inventory agrees with the server',
        sameTotals(bridgeItemTotals(state.inventory), after.inventory),
        {
          bridge: state.inventory,
          server: after.inventory,
        },
      );
      const moved = distance(after.position, plan.points.start);
      ctx.check('bot stays within 1.5 blocks of the start', moved <= 1.5, { distance: moved });
    },
    actions: [`bridge: craft oak_planks ${count}`],
    expect: [`job failed with "${message}"`, 'server inventory retains all ingredients and holds no planks'],
  };
}

function craftInventoryScenario({ id, lane, title, held, expected = held, item, count, table = false, failure }) {
  const supplies = Object.entries(held).map(([name, amount]) => `${name} ${amount}`);
  return {
    id,
    lane,
    title,
    release: [RELEASE.craft],
    plan(input) {
      const plan = craftPlan(input, supplies);
      const existingTable = plan.points.beside[0];
      if (table) plan.fixture.push(`setblock ${at(plan.origin, 1, STAND, 0)} minecraft:crafting_table`);
      return { ...plan, reads: [tableAt(existingTable)], points: { ...plan.points, existingTable } };
    },
    async run(ctx, plan) {
      const { existingTable } = plan.points;
      const read = async () => ({
        inventory: itemTotals(await ctx.server.inventory()),
        table: await ctx.server.testBlock(existingTable, 'minecraft:crafting_table'),
      });
      const before = await ctx.step('independent baseline (Inventory and crafting table)', read);
      ctx.check(
        'server starts with the requested ingredients and table setup',
        sameTotals(before.inventory, held) && before.table === table,
        before,
      );
      const outcome = await ctx.step(`bridge: craft ${item} ${count}`, () =>
        settledAction(ctx, { type: 'craft', item, count }),
      );
      const state = await ctx.bridge.observe();
      const after = await ctx.step('independent final state (Inventory and crafting table)', read);
      const produced = (expected[`minecraft:${item}`] ?? 0) - (held[`minecraft:${item}`] ?? 0);
      ctx.check(
        'job reports the expected result',
        outcome.settled === (failure ? 'rejected' : 'completed') &&
          state.job?.status === (failure ? 'failed' : 'completed') &&
          (failure ? failure.test(outcome.message) : outcome.message === `Crafted ${produced} ${item}.`),
        { outcome, status: state.job?.status },
      );
      ctx.check(
        'server inventory and crafting table reflect the expected outcome',
        sameTotals(after.inventory, expected) &&
          sameTotals(bridgeItemTotals(state.inventory), after.inventory) &&
          after.table === table,
        { after, expected, table },
      );
    },
    actions: [`bridge: craft ${item} ${count}`],
    expect: [
      failure ? `job fails with ${failure}` : 'job reports the amount crafted',
      `server inventory totals ${JSON.stringify(expected)} and the table setup is preserved`,
    ],
  };
}

function withdrawCraftPlan(args) {
  const plan = withdrawPlan(args);
  return {
    ...plan,
    fixture: [...plan.fixture, `setblock ${at(plan.origin, -2, STAND, 0)} minecraft:crafting_table`],
    prepare: [...plan.prepare, `give ${args.bot} minecraft:stick 2`],
  };
}

async function runWithdrawCraftModel(ctx, { points: { chest }, stock }) {
  const readState = async () => ({
    chest: itemTotals(await ctx.server.items(chest)),
    inventory: itemTotals(await ctx.server.inventory()),
  });
  const before = await ctx.step('independent baseline (chest Items, Inventory)', readState);
  ctx.note('baseline', before);
  ctx.check(
    'server chest and inventory match the fixture',
    sameTotals(before.chest, stock) && sameTotals(before.inventory, { 'minecraft:stick': 2 }),
    { before, stock },
  );
  const model = ctx.options.model;
  const criteria = { withdraw: { item: 'cobblestone', count: 1 }, craft: { item: 'stone_pickaxe', count: 1 } };
  const result = await ctx.step(`agent with real model ${model}`, () =>
    ctx.agent({
      goal: 'Withdraw exactly four cobblestone from the nearby chest. Craft one stone pickaxe with three of them and your two sticks at the nearby crafting table. Keep the fourth cobblestone and report done.',
      criteria,
      model,
    }),
  );
  ctx.note('agent', {
    criteria,
    status: result.status,
    steps: result.steps,
    verification: result.verification ?? null,
    actionCounts: result.actionCounts,
  });
  const after = await ctx.step('independent final state (chest Items, Inventory)', readState);
  ctx.note('final', after);
  ctx.check('agent reports criteria_met', result.status === 'criteria_met', { status: result.status });
  for (const criterion of Object.keys(criteria)) {
    const check = result.verification?.checks?.[criterion];
    ctx.check(`agent verified ${criterion} independently`, check?.met === true, { check });
  }
  const expectedChest = { ...stock, 'minecraft:cobblestone': stock['minecraft:cobblestone'] - 4 };
  ctx.check('server chest lost exactly four cobblestone and nothing else', sameTotals(after.chest, expectedChest), {
    expected: expectedChest,
    actual: after.chest,
  });
  const expectedInventory = { 'minecraft:stone_pickaxe': 1, 'minecraft:cobblestone': 1 };
  ctx.check(
    'server inventory holds the crafted pickaxe and one cobblestone',
    sameTotals(after.inventory, expectedInventory),
    { expected: expectedInventory, actual: after.inventory },
  );
  const { mode, job, stopping } = await ctx.step('observe control from a separate bridge session', () =>
    ctx.bridge.observe(),
  );
  ctx.check('agent handed back manual control', mode === 'manual' && job?.status !== 'running' && !stopping, {
    mode,
    job,
    stopping,
  });
}

/** Shared by the two return-home inspection scenarios. variant: preserve | blocked. */
async function runInspectHome(ctx, plan, variant) {
  const { chest, start } = plan.points;
  const before = await ctx.step('independent baseline (chest Items, Inventory, Pos)', () => snapshot(ctx, chest));
  ctx.note('baseline', before);
  await ctx.step('bridge: set_home on the platform', () => ctx.bridge.execute({ type: 'set_home' }));
  const removeStep = () =>
    ctx.step(`server (platform becomes a one-way drop): ${plan.hooks.removeStep}`, () =>
      ctx.server.command(plan.hooks.removeStep),
    );
  const decisions = [
    { type: 'deposit', item: 'oak_log', count: 8 },
    { type: 'home' },
    { type: 'done', reason: 'Scripted acceptance run finished.' },
  ];
  // Server Pos before each planner request shows where each step, and each retried final inspection, left the player.
  const positions = [];
  const beforeRequest = Object.fromEntries(
    [0, 1, 2, 3, 4].map((request) => [
      request,
      async () => {
        positions.push({ request, ...(await ctx.server.position()) });
        if (variant === 'blocked' && request === 2) await removeStep();
      },
    ]),
  );
  const result = await ctx.step(
    'agent with scripted planner (no model): deposit 8 → home → done (final inspection walks 9 blocks)',
    () =>
      ctx.agent({
        goal: 'Store eight oak logs in the chest, then return home.',
        criteria: { deposit: { item: 'oak_log', count: 8 }, returnHome: true },
        fetchImpl: scriptedPlanner(decisions, { before: beforeRequest }),
      }),
  );
  ctx.note('agent', { status: result.status, steps: result.steps, verification: result.verification ?? null });
  ctx.note('serverPosBeforePlannerRequests', positions);
  const after = await ctx.step('independent final state', () => snapshot(ctx, chest));
  ctx.note('final', after);
  const checks = result.verification?.checks || {};
  const serverDistance = distance(after.position, start);
  // Measured from the agent's own home target: Fabric saves home as its block (480 -58 0), the bot as the exact
  // position (480.5 -58 0.5), and that half-block offset alone can exceed the tolerance.
  const targetDistance = distance(after.position, checks.home?.target ?? start);
  ctx.check(
    'agent home distance agrees with server Pos (± 0.5)',
    Number.isFinite(checks.home?.distance) && Math.abs(checks.home.distance - targetDistance) <= 0.5,
    { agent: checks.home?.distance ?? null, server: targetDistance, target: checks.home?.target ?? null },
  );
  if (variant === 'preserve') {
    ctx.check('agent reports criteria_met', result.status === 'criteria_met', { status: result.status });
    ctx.check('home check met after final inspection', checks.home?.met === true, { home: checks.home });
    ctx.check('server Pos within 2 blocks of home', serverDistance <= 2, { distance: serverDistance });
    ctx.check(
      'deposit evidence refreshed and server chest +8',
      checks.deposit?.evidence === 'refreshed' && (after.chest[LOG] || 0) - (before.chest[LOG] || 0) >= 8,
      { deposit: checks.deposit, chest: after.chest },
    );
  } else {
    ctx.check('no success when the inspection cannot return', result.status !== 'criteria_met', {
      status: result.status,
    });
    ctx.check(
      'failure reported (inspection error or unmet home)',
      !!checks.deposit?.error || checks.home?.met === false,
      { deposit: checks.deposit, home: checks.home },
    );
    ctx.check(
      'items really were stored (server +8), so failure is not a missing deposit',
      (after.chest[LOG] || 0) - (before.chest[LOG] || 0) >= 8,
      { before: before.chest, after: after.chest },
    );
    ctx.check('the bot really could not return (server Pos more than 2 blocks from home)', serverDistance > 2, {
      distance: serverDistance,
    });
  }
}

// Survival scenarios: eating, low-health retreat, and a collection that fills the inventory.
// Bread that takes 30 s to eat: the Fabric mod gives up on consumption after 5 s, so every attempt there fails.
export const SLOW_BREAD = 'minecraft:bread[food={nutrition:5,saturation:6,eat_seconds:30}]';
const BREAD = 'minecraft:bread';
const AXE = 'minecraft:iron_axe';
// Food is lowered to this or less; automatic eating starts at 16.
const HUNGRY = 12;
// Fabric timing policy (ActionTiming.java, AgentController.java): consumption gives up after 5 s, automatic eating
// then backs off for 10 s, and a survival retreat has 60 s. The bot's retreat has the same 60 s.
export const EAT_TIMEOUT_MS = 5000;
// Mineflayer's consume stops waiting for the server after 2.5 s (its CONSUME_TIMEOUT); the bot then backs off as Fabric.
export const BOT_CONSUME_TIMEOUT_MS = 2500;
export const EAT_BACKOFF_MS = 10_000;
export const RETREAT_BUDGET_MS = 60_000;
const RETREATING = /Low health: retreating home/;
const INTERRUPTED_FOR_SURVIVAL = /Action interrupted for survival/;
/** A bedrock shell around the lane's start, so a home saved there can be neither reached nor dug into. */
export const enclosure = (o) => `fill ${at(o, -2, STAND - 1, -2)} ${at(o, 2, STAND + 3, 2)} minecraft:bedrock hollow`;

/**
 * Open ground for vitals: easy difficulty (peaceful refills food and heals) and no natural regeneration, so food and
 * health change only through the fixture and the agent. `away` is a walk target east of the start; `enclose` adds a
 * hook that walls the start in bedrock.
 */
function vitalsPlan({ bot, lane }, { bread = 0, away = 0, enclose = false } = {}) {
  const o = laneOrigin(lane);
  const start = center(point(o, 0, STAND, 0));
  const reach = Math.max(away + 4, 6);
  const area = `${at(o, -3, STAND, -3)} ${at(o, reach, STAND + 3, 3)}`;
  const loaded = (verb) => `forceload ${verb} ${o.x - 16} ${o.z - 16} ${o.x + reach + 16} ${o.z + 16}`;
  // Instant effects: full health and food for this scenario, and again for the next one.
  const restore = [
    `effect give ${bot} minecraft:instant_health 1 10 true`,
    `effect give ${bot} minecraft:saturation 1 10 true`,
  ];
  const shell = enclose ? enclosure(o) : null;
  const wall = point(o, 2, STAND, 0);
  return {
    origin: o,
    points: { start, ...(away && { away: point(o, away, STAND, 0) }), ...(shell && { wall }) },
    hooks: {
      hunger: `effect give ${bot} minecraft:hunger 120 255 true`,
      sated: `effect clear ${bot} minecraft:hunger`,
      wound: `damage ${bot} 13 minecraft:generic`,
      ...(shell && { enclose: shell }),
    },
    reads: [
      `data get entity ${bot} foodLevel`,
      `data get entity ${bot} Health`,
      ...(shell ? [`execute if block ${wall.x} ${wall.y} ${wall.z} minecraft:bedrock`] : []),
    ],
    fixture: [loaded('add'), `fill ${area} air`, 'difficulty easy', 'gamerule naturalRegeneration false'],
    prepare: [
      ...resetPlayer(bot),
      ...restore,
      teleport(bot, start),
      ...(bread ? [`give ${bot} ${SLOW_BREAD} ${bread}`] : []),
    ],
    cleanup: [
      ...resetPlayer(bot),
      ...restore,
      'gamerule naturalRegeneration true',
      'difficulty peaceful',
      ...(shell
        ? [
            `fill ${at(o, -2, STAND, -2)} ${at(o, 2, STAND + 3, 2)} air`,
            // The shell's floor replaced the grass under the start.
            `fill ${at(o, -2, STAND - 1, -2)} ${at(o, 2, STAND - 1, 2)} minecraft:grass_block`,
          ]
        : []),
      `fill ${area} air`,
      killDrops(o),
      loaded('remove'),
    ],
  };
}

/** An oak-log patch five blocks west; the player holds an axe, 34 cobblestone stacks, and 58 logs in the last slot. */
function fullInventoryPlan({ bot, lane }) {
  const o = laneOrigin(lane);
  const start = center(point(o, 0, STAND, 0));
  const area = `${at(o, -8, STAND, -3)} ${at(o, 3, STAND + 3, 3)}`;
  return {
    origin: o,
    points: { start },
    held: { [AXE]: 1, [COBBLESTONE]: 34 * 64, [LOG]: 58 },
    fixture: [
      forceload(o, 'add'),
      `fill ${area} air`,
      `fill ${at(o, -6, STAND, -1)} ${at(o, -4, STAND + 1, 1)} oak_log`,
    ],
    // Given in this order: the axe, then 34 stacks, then the logs in the 36th main slot, six short of a stack.
    prepare: [
      ...resetPlayer(bot),
      teleport(bot, start),
      `give ${bot} ${AXE} 1`,
      `give ${bot} ${COBBLESTONE} ${34 * 64}`,
      `give ${bot} ${LOG} 58`,
    ],
    cleanup: [...resetPlayer(bot), `fill ${area} air`, killDrops(o), forceload(o, 'remove')],
  };
}

const serverValue = async (ctx, command) => parseDataReply(await ctx.server.command(command))?.value;

/** Server reads of the player's bread, vitals, and position. */
async function vitals(ctx) {
  const inventory = await ctx.server.inventory();
  return {
    bread: itemCount(inventory, BREAD),
    food: await serverValue(ctx, `data get entity ${ctx.bot} foodLevel`),
    health: await serverValue(ctx, `data get entity ${ctx.bot} Health`),
    position: await ctx.server.position(),
  };
}

/** Hunger effect until the server's foodLevel is at most `target`, then clear it; returns the level after clearing. */
async function lowerFood(ctx, plan, target) {
  const food = () => serverValue(ctx, `data get entity ${ctx.bot} foodLevel`);
  await ctx.server.command(plan.hooks.hunger);
  try {
    const deadline = ctx.now() + 60_000;
    for (let level = await food(); !(level <= target); level = await food()) {
      if (ctx.now() >= deadline) throw new Error(`foodLevel did not fall to ${target}: ${level}.`);
      await ctx.sleep(100);
    }
  } finally {
    await ctx.server.command(plan.hooks.sated);
  }
  return food();
}

/** Observes the bridge until `test` passes or the time runs out; returns the passing state or null. */
async function pollBridge(ctx, test, { timeoutMs, intervalMs = 100 }) {
  const deadline = ctx.now() + timeoutMs;
  while (true) {
    const state = await ctx.bridge.observe();
    if (test(state)) return state;
    if (ctx.now() >= deadline) return null;
    await ctx.sleep(intervalMs);
  }
}

/**
 * Polls the bridge in the background and records every change of survival status, mode, and job, timed from
 * `origin`. `done` settles once `until(state, changes)` passes or `timeoutMs` runs out.
 */
export function watchBridge(ctx, { origin = ctx.now(), timeoutMs, until, intervalMs = 100 }) {
  const changes = [];
  const done = (async () => {
    const deadline = ctx.now() + timeoutMs;
    let last = null;
    while (true) {
      const state = await ctx.bridge.observe();
      const { type, status, message } = state.job ?? {};
      const entry = {
        survival: state.survival ?? null,
        mode: state.mode ?? null,
        job: state.job ? { type, status, message } : null,
      };
      const key = JSON.stringify(entry);
      if (key !== last) {
        last = key;
        changes.push({ atMs: ctx.now() - origin, ...entry });
      }
      if (until(state, changes)) return { state, timedOut: false };
      if (ctx.now() >= deadline) return { state, timedOut: true };
      await ctx.sleep(intervalMs);
    }
  })();
  return { changes, done };
}

/** Eating attempts in a recorded timeline: each change to `Eating`, and what the status changed to next. */
export function eatingAttempts(changes) {
  const attempts = [];
  let previous = null;
  for (const { atMs, survival } of changes) {
    if (survival === previous) continue;
    const open = attempts.at(-1);
    if (previous === 'Eating' && open) Object.assign(open, { endMs: atMs, outcome: survival });
    if (survival === 'Eating') attempts.push({ startMs: atMs, endMs: null, outcome: null });
    previous = survival;
  }
  return attempts;
}

/**
 * The time from each failed eating attempt to the next attempt. `failedAtMs` is an earlier failure seen outside the
 * timeline (the explicit eat), or null.
 */
export function eatingGaps(attempts, failedAtMs = null) {
  const gaps = [];
  let failed = failedAtMs;
  for (const attempt of attempts) {
    if (failed !== null) gaps.push(attempt.startMs - failed);
    failed = attempt.outcome === 'Could not eat.' ? attempt.endMs : null;
  }
  return gaps;
}

const within = (value, low, high) => Number.isFinite(value) && value >= low && value <= high;
const waitEnded = (state) => state.job?.type === 'wait' && state.job.status !== 'running';
const firstAt = (changes, test) => changes.find(test)?.atMs ?? null;
const retreatStart = (changes) => firstAt(changes, ({ job }) => RETREATING.test(job?.message ?? ''));
const waitEnd = (changes) => firstAt(changes, ({ job }) => job?.type === 'wait' && job.status !== 'running');

async function runEatTimeout(ctx, plan) {
  const fabric = ctx.options.backend === 'fabric';
  // How long each backend waits for the server to finish eating before it gives up.
  const timeoutMs = fabric ? EAT_TIMEOUT_MS : BOT_CONSUME_TIMEOUT_MS;
  const before = await ctx.step('independent baseline (Inventory, foodLevel, Health)', () => vitals(ctx));
  ctx.check(
    'server starts with eight slow bread and full food and health',
    before.bread === 8 && before.food === 20 && before.health === 20,
    before,
  );
  const hungry = await ctx.step(`lower food to ${HUNGRY} or less (hunger effect, then effect clear)`, () =>
    lowerFood(ctx, plan, HUNGRY),
  );
  const started = ctx.now();
  const eaten = await ctx.step('bridge: eat (the bread takes 30 s to consume)', () =>
    settledAction(ctx, { type: 'eat' }),
  );
  const failedAt = ctx.now();
  const explicitMs = failedAt - started;
  const afterEat = await ctx.step('independent reads after the eat job', () => vitals(ctx));
  ctx.note('explicitEat', { ...eaten, durationMs: explicitMs, hungry, after: afterEat });
  ctx.check(
    `explicit eat fails with "Eating timed out." after ${timeoutMs / 1000} s`,
    eaten.settled === 'rejected' &&
      /^Eating timed out\./.test(eaten.message) &&
      within(explicitMs, timeoutMs - 200, timeoutMs + 2500),
    { eaten, durationMs: explicitMs },
  );
  ctx.check('server shows no bread eaten and food not raised', afterEat.bread === 8 && afterEat.food <= hungry, {
    hungry,
    after: afterEat,
  });

  // Automatic eating while a wait job runs, and after it under the same lease: two attempts, each a backoff apart.
  const wait = settledAction(ctx, { type: 'wait', seconds: 20 });
  const watched = watchBridge(ctx, {
    origin: failedAt,
    timeoutMs: 40_000,
    until: (state, changes) => eatingAttempts(changes).length >= 2 && (waitEnded(state) || !state.job),
  });
  const { timedOut } = await ctx.step('watch automatic eating for two attempts', () => watched.done);
  const waited = await wait;
  await ctx.step('bridge: release control (ends automatic eating)', () => ctx.bridge.release());
  const after = await ctx.step('independent final reads', () => vitals(ctx));
  const attempts = eatingAttempts(watched.changes);
  const gaps = eatingGaps(attempts, 0);
  ctx.note('automaticEating', { changes: watched.changes, attempts, gaps, timedOut, wait: waited });
  ctx.check('two automatic attempts were seen', attempts.length >= 2 && !timedOut, {
    attempts: attempts.length,
    timedOut,
  });
  const finished = attempts.filter((attempt) => attempt.endMs !== null);
  ctx.check(
    `each attempt gives up after about ${timeoutMs / 1000} s ("Could not eat.")`,
    finished.length >= 1 &&
      finished.every(
        (attempt) =>
          attempt.outcome === 'Could not eat.' &&
          within(attempt.endMs - attempt.startMs, timeoutMs - 500, timeoutMs + 1500),
      ),
    { attempts },
  );
  ctx.check(
    'each attempt starts 10 s after the previous failure (the backoff)',
    // The first gap starts when the client saw the explicit eat fail, up to one 250 ms job poll (plus a request) late.
    gaps.length >= 2 &&
      gaps.every((gap, index) => within(gap, EAT_BACKOFF_MS - (index ? 500 : 1000), EAT_BACKOFF_MS + 2000)),
    { gaps },
  );
  // Fabric pauses the job to eat and then resumes it. The bot interrupts the job to eat and leaves replanning to the
  // agent, so its failed attempt ends the job.
  ctx.check(
    fabric
      ? 'the wait job paused to eat and still finished on its own'
      : 'bot: the wait job was interrupted to eat and failed when eating failed',
    fabric
      ? waited.settled === 'completed' &&
          watched.changes.some(({ job }) => job?.type === 'wait' && /Paused to eat/.test(job.message ?? ''))
      : waited.settled === 'rejected' &&
          /^Interrupted to eat, but could not eat \(Eating timed out\.\)/.test(waited.message),
    { wait: waited },
  );
  ctx.check('server shows no bread eaten and food not raised', after.bread === 8 && after.food <= hungry, {
    hungry,
    after,
  });
}

/** Saves home at the start and walks to the plan's `away` point. */
async function walkAway(ctx, plan) {
  const { away, start } = plan.points;
  await ctx.step('bridge: set_home at the start', () => ctx.bridge.execute({ type: 'set_home' }));
  const walked = await ctx.step(`bridge: goto ${away.x} ${away.y} ${away.z}`, () =>
    settledAction(ctx, { type: 'goto', ...away }),
  );
  const position = await ctx.step('independent Pos after the walk', () => ctx.server.position());
  const minimum = Math.floor(distance(away, start)) - 3;
  ctx.check(
    `the walk ended at least ${minimum} blocks from home`,
    walked.settled === 'completed' && distance(position, start) >= minimum,
    { walked, position, distance: distance(position, start) },
  );
}

/**
 * Starts a wait job under the scenario's lease and waits until the bridge shows it running. Returns the job's
 * settlement in an object, since returning the pending promise itself would wait for the job to end.
 */
async function startWait(ctx, seconds) {
  const job = settledAction(ctx, { type: 'wait', seconds });
  const running = await ctx.step(`bridge: wait ${seconds} is running`, () =>
    pollBridge(ctx, (state) => state.job?.type === 'wait' && state.job.status === 'running', { timeoutMs: 10_000 }),
  );
  if (!running) throw new Error('The wait job did not start.');
  return { job };
}

async function wound(ctx, plan) {
  await ctx.step(`server: ${plan.hooks.wound}`, () => ctx.server.command(plan.hooks.wound));
  return serverValue(ctx, `data get entity ${ctx.bot} Health`);
}

async function runLowHealthRetreat(ctx, plan) {
  const { start } = plan.points;
  const before = await ctx.step('independent baseline (Inventory, foodLevel, Health, Pos)', () => vitals(ctx));
  ctx.check('server starts with full food and health', before.food === 20 && before.health === 20, before);
  await walkAway(ctx, plan);
  const { job } = await startWait(ctx, 60);
  const origin = ctx.now();
  const health = await wound(ctx, plan);
  const watched = watchBridge(ctx, { origin, timeoutMs: RETREAT_BUDGET_MS + 15_000, until: waitEnded });
  const { timedOut } = await ctx.step('watch the retreat until the wait job ends', () => watched.done);
  const outcome = await job;
  const after = await ctx.step('independent final reads', () => vitals(ctx));
  const state = await ctx.bridge.observe();
  const retreatMs = retreatStart(watched.changes);
  const endMs = waitEnd(watched.changes);
  ctx.note('retreat', { health, changes: watched.changes, outcome, timedOut, after });
  ctx.check('server Health is at most 8 after the damage', health <= 8, { health });
  ctx.check('the wait job reported the retreat home', retreatMs !== null, { retreatMs });
  ctx.check(
    'the job failed on its own with the survival interruption',
    outcome.settled === 'rejected' && INTERRUPTED_FOR_SURVIVAL.test(outcome.message) && state.job?.status === 'failed',
    { outcome, job: state.job },
  );
  ctx.check('the retreat ended within its 60 s budget', !timedOut && endMs !== null && endMs <= RETREAT_BUDGET_MS, {
    endMs,
  });
  ctx.check('server Pos is within 2 blocks of home', distance(after.position, start) <= 2, {
    distance: distance(after.position, start),
  });
  ctx.check('server Health did not regenerate', after.health === health, { before: health, after: after.health });
  ctx.check('the session kept control (mode agent)', state.mode === 'agent', { mode: state.mode });
}

async function runEatRetreatTimeout(ctx, plan) {
  const fabric = ctx.options.backend === 'fabric';
  const { start, wall } = plan.points;
  const before = await ctx.step('independent baseline (Inventory, foodLevel, Health, Pos)', () => vitals(ctx));
  ctx.check(
    'server starts with eight slow bread and full food and health',
    before.bread === 8 && before.food === 20 && before.health === 20,
    before,
  );
  await walkAway(ctx, plan);
  await ctx.step(`server (home walled in): ${plan.hooks.enclose}`, () => ctx.server.command(plan.hooks.enclose));
  const { job } = await startWait(ctx, 120);
  const origin = ctx.now();
  const health = await wound(ctx, plan);
  const watched = watchBridge(ctx, { origin, timeoutMs: RETREAT_BUDGET_MS + 30_000, until: waitEnded });
  // Awaited below; if a step in between fails, its rejection must not crash the runner before cleanup.
  watched.done.catch(() => {});
  // Food falls only once the retreat is under way, so on Fabric the eating attempts interrupt the retreat.
  await ctx.step('wait for the retreat to start', () =>
    pollBridge(ctx, (state) => RETREATING.test(state.job?.message ?? '') || waitEnded(state), { timeoutMs: 10_000 }),
  );
  const hungry = await ctx.step(`lower food to ${HUNGRY} or less during the retreat`, () =>
    lowerFood(ctx, plan, HUNGRY),
  );
  const { timedOut } = await ctx.step('watch the retreat until the wait job ends', () => watched.done);
  const outcome = await job;
  const after = await ctx.step('independent reads when the job ended', async () => ({
    ...(await vitals(ctx)),
    enclosed: await ctx.server.testBlock(wall, 'minecraft:bedrock'),
  }));
  await ctx.step('bridge: release control (ends automatic eating and retreats)', () => ctx.bridge.release());
  const retreatMs = retreatStart(watched.changes);
  const endMs = waitEnd(watched.changes);
  const attempts = eatingAttempts(watched.changes).filter(({ startMs }) => retreatMs !== null && startMs >= retreatMs);
  const gap = distance(after.position, start);
  ctx.note('retreat', { health, hungry, changes: watched.changes, attempts, outcome, timedOut, after });
  ctx.check('server Health is at most 8 after the damage', health <= 8, { health });
  ctx.check('server foodLevel fell to 16 or less during the retreat', hungry <= 16, { hungry });
  ctx.check('the wait job reported the retreat home', retreatMs !== null, { retreatMs });
  ctx.check('server Pos is outside the walled-in home (more than 2 blocks away)', gap > 2, { distance: gap });
  ctx.check('the bedrock walls are intact', after.enclosed, { wall });
  ctx.check('server shows no bread eaten and food not raised', after.bread === 8 && after.food <= hungry, {
    hungry,
    after,
  });
  const retreatToEndMs = retreatMs === null || endMs === null ? null : endMs - retreatMs;
  if (fabric) {
    ctx.check(
      'the job failed when the 60 s retreat budget ran out',
      outcome.settled === 'rejected' &&
        /^Survival retreat timed out\./.test(outcome.message) &&
        !timedOut &&
        within(retreatToEndMs, RETREAT_BUDGET_MS - 2000, RETREAT_BUDGET_MS + 2000),
      { outcome, retreatToEndMs },
    );
    ctx.check(
      'eating attempts continued during the retreat and each failed (at least two observed failures)',
      attempts.filter(({ outcome }) => outcome === 'Could not eat.').length >= 2 &&
        // The retreat deadline may cut off the last attempt: still open, or ended by Fabric's "Retreat timed out".
        attempts.every(
          ({ outcome }, index) =>
            outcome === 'Could not eat.' ||
            (index === attempts.length - 1 && (outcome === null || outcome === 'Retreat timed out')),
        ),
      { attempts },
    );
    return;
  }
  // The bot's action guard stops once the retreat starts, so it does not eat during the retreat. Its retreat ends
  // when the pathfinder gives up ("Could not reach ...; stopped N blocks away") or at the 60 s budget.
  const failure = watched.changes
    .map(({ survival }) => survival ?? '')
    .find((survival) => /^Retreat failed: /.test(survival));
  const reported = /stopped (\d+(?:\.\d+)?) blocks away/.exec(failure ?? '');
  // Once the retreat fails the bot is free to eat again, and an attempt can replace the "Retreat failed" status
  // before the next 100 ms poll. The job's failure and the server reads below still cover that case.
  const overwritten =
    !failure && watched.changes.some(({ survival, job }) => survival === 'Eating' && job?.status === 'failed');
  ctx.check(
    'bot: the job failed with the survival interruption within the 60 s retreat budget',
    outcome.settled === 'rejected' &&
      INTERRUPTED_FOR_SURVIVAL.test(outcome.message) &&
      !timedOut &&
      within(retreatToEndMs, 0, RETREAT_BUDGET_MS + 5000),
    { outcome, retreatToEndMs },
  );
  ctx.check(
    'bot: the failed retreat is reported (or replaced at once by the next eating attempt), and any distance it gives agrees with server Pos (± 1 block)',
    (!!failure || overwritten) && (!reported || Math.abs(Number(reported[1]) - gap) <= 1),
    { reported: failure ?? null, overwritten, server: gap },
  );
}

async function runCollectFullInventory(ctx, plan) {
  const { start } = plan.points;
  const read = async () => {
    const inventory = await ctx.server.inventory();
    return { totals: itemTotals(inventory), stacks: inventory.length, position: await ctx.server.position() };
  };
  const before = await ctx.step('independent baseline (Inventory, Pos)', read);
  ctx.check(
    'server inventory holds the axe, 34 cobblestone stacks, and 58 logs: no empty slot, room for six logs',
    sameTotals(before.totals, plan.held) && before.stacks === 36,
    before,
  );
  // One bridge client throughout, so the follow-up action shows the same lease goes on.
  const adapter = await ctx.connect();
  const progress = [];
  const started = ctx.now();
  const outcome = await ctx.step('bridge: collect oak_log 8', async () => {
    try {
      const job = await adapter.execute(
        { type: 'collect', block: 'oak_log', count: 8 },
        { onProgress: (job) => progress.push({ atMs: ctx.now() - started, message: job.message }) },
      );
      return { settled: 'completed', message: job.message };
    } catch (error) {
      return { settled: 'rejected', message: error.message };
    }
  });
  const durationMs = ctx.now() - started;
  const leaseId = adapter.leaseId;
  const state = await ctx.bridge.observe();
  const after = await ctx.step('independent final state (Inventory, Pos)', read);
  ctx.note('progress', progress);
  ctx.note('outcome', { ...outcome, durationMs, job: state.job, mode: state.mode });
  ctx.check(
    'job failed on its own with the inventory-full outcome after six logs',
    outcome.settled === 'rejected' &&
      state.job?.status === 'failed' &&
      /^Inventory full; collected 6 of 8 oak_log\. Inventory: 64\/66\./.test(outcome.message),
    { outcome, job: state.job },
  );
  ctx.check('the job ended long before the 180 s mining deadline', durationMs <= 90_000, { durationMs });
  ctx.check(
    'server inventory holds exactly 64 logs with the axe and cobblestone unchanged',
    sameTotals(after.totals, { ...plan.held, [LOG]: 64 }) && after.stacks === 36,
    { after: after.totals, stacks: after.stacks },
  );
  const gap = distance(after.position, start);
  if (/(?:Returned to|At) the starting point/.test(outcome.message))
    ctx.check('reported return agrees with server Pos (≤ 2.5 blocks)', gap <= 2.5, { distance: gap });
  else
    ctx.check(
      'reported failed return agrees with server Pos (> 2 blocks)',
      /Could not return to the starting point/.test(outcome.message) && gap > 2,
      { message: outcome.message, distance: gap },
    );
  ctx.check('bridge inventory agrees with the server', sameTotals(bridgeItemTotals(state.inventory), after.totals), {
    bridge: bridgeItemTotals(state.inventory),
    server: after.totals,
  });
  ctx.check('the session kept control (mode agent)', state.mode === 'agent' && !!leaseId, { mode: state.mode });
  const next = await ctx.step('bridge: wait 1 under the same lease', async () => {
    try {
      const job = await adapter.execute({ type: 'wait', seconds: 1 });
      return { settled: 'completed', message: job.message, leaseId: adapter.leaseId };
    } catch (error) {
      return { settled: 'rejected', message: error.message, leaseId: adapter.leaseId };
    }
  });
  ctx.check('the same lease runs the next action', next.settled === 'completed' && next.leaseId === leaseId, {
    next,
    leaseId,
  });
}

/** The scenario table. plan() is pure so --dry-run prints exactly what run() sends. */
export const scenarios = [
  {
    id: 'recovery-timeout',
    lane: 0,
    longRunning: true,
    title: 'Mining timeout in a real pit: bounded return, failure status, preserved inventory',
    release: [RELEASE.pit, RELEASE.partial],
    plan: pitPlan,
    run: (ctx, plan) => runRecovery(ctx, plan, 'timeout'),
    actions: [
      'bridge: collect oak_log 64 under mining fatigue (cannot reach 64 in 180 s)',
      'wait for the job to fail (≈ 180 s mining + ≤ 60 s return)',
    ],
    expect: [
      'job failed with "Collection timed out before reaching the requested quota"',
      'return attempt started after ≈ 180 s and ended within 60 s (+ slack)',
      'server Inventory holds more oak logs than before and matches the reported count',
      'reported return outcome agrees with server Pos',
    ],
  },
  {
    id: 'recovery-cancel',
    lane: 1,
    longRunning: true,
    title: 'Lease cancel during pit recovery stops immediately',
    release: [RELEASE.pit],
    plan: pitPlan,
    run: (ctx, plan) => runRecovery(ctx, plan, 'cancel'),
    actions: [
      'bridge: collect oak_log 64 under mining fatigue',
      'when progress says "returning to where collection started", wait 1 s, then POST /v1/cancel with the lease',
    ],
    expect: [
      'job cancelled; no job running or stopping within 5 s',
      'three server Pos reads 1.5 s apart differ by ≤ 0.2 blocks',
      'inventory progress preserved',
    ],
  },
  {
    id: 'recovery-stop',
    lane: 2,
    longRunning: true,
    title: 'Emergency stop from a second CLI process during pit recovery stops immediately',
    release: [RELEASE.pit],
    plan: pitPlan,
    run: (ctx, plan) => runRecovery(ctx, plan, 'stop'),
    actions: [
      'bridge: collect oak_log 64 under mining fatigue',
      'when progress says "returning to where collection started", wait 1 s, then run `node src/cli.js --bridge <bridge> stop`',
    ],
    expect: [
      'job cancelled and mode manual; settled within 5 s',
      'three server Pos reads 1.5 s apart differ by ≤ 0.2 blocks',
      'inventory progress preserved',
    ],
  },
  {
    id: 'collect-and-store',
    lane: 3,
    title: 'Collect-and-store with --verify-collect, --verify-deposit, and --verify-home criteria',
    release: [RELEASE.store],
    plan: storePlan,
    run: (ctx, plan) => runStore(ctx, plan, 'store'),
    actions: [
      'bridge: set_home at the start',
      'agent (in-process runAgent, scripted planner, no model) with criteria collect oak_log:8, deposit oak_log:8, returnHome: collect 8 → deposit 8 → home → done',
    ],
    expect: [
      'criteria_met with refreshed deposit evidence',
      'server chest +8 oak logs, cobblestone untouched, net increase ≥ 8',
      'server Pos within 2 blocks of home',
    ],
  },
  {
    id: 'stale-removal',
    lane: 4,
    title: 'Stored items removed externally before final inspection must not yield stale success',
    release: [RELEASE.store],
    plan: storePlan,
    run: (ctx, plan) => runStore(ctx, plan, 'stale'),
    during: (plan) => [plan.hooks.removeStored],
    actions: (plan) => [
      'bridge: set_home',
      'scripted agent: collect 8 → deposit 8 → home',
      `while the agent awaits the done decision: > ${plan.hooks.removeStored}`,
      'scripted agent: done (repeated; rejected twice, third ends the task)',
    ],
    expect: [
      'status is not criteria_met',
      'deposit evidence refreshed and storedAdditional equals the server chest change',
    ],
  },
  {
    id: 'blocked-lid',
    lane: 5,
    title: 'Blocked chest lid before final inspection reports inspection failure',
    release: [RELEASE.store],
    plan: storePlan,
    run: (ctx, plan) => runStore(ctx, plan, 'blocked'),
    during: (plan) => [plan.hooks.blockLid],
    actions: (plan) => [
      'bridge: set_home',
      'scripted agent: collect 8 → deposit 8 → home',
      `while the agent awaits the done decision: > ${plan.hooks.blockLid}`,
      'scripted agent: done (repeated)',
      'bridge: inspect_storage with the lid still blocked',
    ],
    expect: [
      'status is not criteria_met; deposit check carries "did not open"',
      'server chest still shows +8 (items exist, success still refused)',
      'direct inspect_storage fails',
    ],
  },
  {
    id: 'inspect-preserves-home',
    lane: 6,
    title: 'Final storage inspection walks away and preserves the completed return home',
    release: [RELEASE.store],
    plan: platformPlan,
    run: (ctx, plan) => runInspectHome(ctx, plan, 'preserve'),
    actions: [
      'bridge: set_home on the platform',
      'scripted agent with criteria deposit oak_log:8 and returnHome: deposit 8 → home → done',
    ],
    expect: [
      'criteria_met; home check met after the final inspection',
      'server Pos within 2 blocks of home and agrees with the agent distance',
    ],
  },
  {
    id: 'inspect-return-blocked',
    lane: 7,
    title: 'Final storage inspection that cannot return reports failure',
    release: [RELEASE.store],
    plan: platformPlan,
    run: (ctx, plan) => runInspectHome(ctx, plan, 'blocked'),
    during: (plan) => [plan.hooks.removeStep],
    actions: (plan) => [
      'bridge: set_home on the platform',
      'scripted agent: deposit 8 → home',
      `while the agent awaits the done decision (platform becomes a one-way drop): > ${plan.hooks.removeStep}`,
      'scripted agent: done (repeated)',
    ],
    expect: [
      'status is not criteria_met; inspection error or unmet home reported',
      'agent home distance agrees with server Pos',
    ],
  },
  {
    id: 'stale-removal-model',
    lane: 8,
    requiresModel: true,
    title: 'Real local model: stored items removed during model inference must not yield stale success',
    release: [RELEASE.store],
    plan: storePlan,
    run: (ctx, plan) => runStore(ctx, plan, 'model'),
    during: (plan) => [plan.hooks.removeStored],
    actions: (plan) => [
      'bridge: set_home',
      'agent with the --model given (real Ollama) and criteria collect oak_log:8, deposit oak_log:8, returnHome',
      `on the first model request after a completed deposit, concurrently with the inference: > ${plan.hooks.removeStored}`,
    ],
    expect: [
      'criteria_met only if the refreshed server chest really holds +8; otherwise any non-success status',
      'storedAdditional equals the server chest change',
    ],
  },
  {
    id: 'withdraw',
    lane: 9,
    title: 'Withdraw from a seeded chest; server reads confirm the move and the reported baseline',
    release: [RELEASE.withdraw],
    plan: withdrawPlan,
    run: (ctx, plan) => runWithdraw(ctx, plan, { count: 8 }),
    actions: ['bridge: withdraw oak_log 8 (chest seeded with 20 oak logs and 5 cobblestone, in reach of the start)'],
    expect: [
      'job completed with "Withdrew 8 oak_log"; it names the seeded chest',
      'server chest −8 oak logs, cobblestone untouched; server inventory +8 oak logs',
      'job container.before equals the seeded contents read by the server before the action',
      'bridge inventory and container observation agree with the server',
    ],
  },
  {
    id: 'withdraw-omitted',
    lane: 11,
    title: 'Omitting the withdrawal count transfers every matching stack',
    release: [RELEASE.withdraw],
    plan: (args) => withdrawPlan(args, { extraLogs: 64 }),
    run: (ctx, plan) => runWithdraw(ctx, plan, { moved: 84 }),
    actions: ['bridge: withdraw oak_log (no count, chest seeded with 84 oak logs across two stacks)'],
    expect: [
      'job completed and reports 84 oak logs withdrawn',
      'server chest has no logs and retains its cobblestone; server inventory holds all 84 logs',
    ],
  },
  {
    id: 'withdraw-no-candidate',
    lane: 12,
    title: 'Withdrawing with no container in range fails without moving',
    release: [RELEASE.withdraw],
    plan: (args) => withdrawPlan(args, { outOfRange: true }),
    run: (ctx, plan) =>
      runWithdraw(ctx, plan, { count: 8, moved: 0, failure: /No chest or barrel within 16 blocks/, noCandidate: true }),
    actions: [
      'wait for the bridge to see the marker in the chest chunk',
      'bridge: withdraw oak_log 8 (chest outside 16 blocks)',
    ],
    expect: ['job failed and reports no candidate', 'server chest contents, bot inventory, and position are unchanged'],
  },
  {
    id: 'withdraw-short-stock',
    lane: 13,
    title: 'Withdrawing more than the chest holds reports the partial transfer',
    release: [RELEASE.withdraw],
    plan: withdrawPlan,
    run: (ctx, plan) =>
      runWithdraw(ctx, plan, { count: 24, moved: 20, failure: /held only 20 oak_log; withdrew 20 of 24 oak_log/ }),
    actions: ['bridge: withdraw oak_log 24 (the chest holds 20 logs)'],
    expect: [
      'job failed and reports 20 of 24 logs withdrawn',
      'server chest has no logs and retains its cobblestone; server inventory holds 20 oak logs',
    ],
  },
  {
    id: 'withdraw-full-inventory',
    lane: 14,
    title: 'Withdrawal stops when the only compatible stack fills',
    release: [RELEASE.withdraw],
    plan: (args) => withdrawPlan(args, { fullInventory: true }),
    run: (ctx, plan) =>
      runWithdraw(ctx, plan, { count: 8, moved: 4, failure: /Inventory full; withdrew 4 of 8 oak_log/ }),
    actions: ['bridge: withdraw oak_log 8 (the only inventory room is four logs in one stack)'],
    expect: [
      'job failed with full inventory and reports 4 of 8 logs withdrawn',
      'server chest holds 16 logs; inventory holds 64 logs and all 35 stacks of cobblestone',
    ],
  },
  {
    id: 'craft-bootstrap',
    lane: 10,
    title: 'Craft from logs to a stone pickaxe, placing the crafting table the craft made',
    release: [RELEASE.craft],
    plan: craftPlan,
    run: (ctx, plan) => runCraft(ctx, plan),
    actions: CRAFT_SEQUENCE.map(
      ([item, count]) =>
        `bridge: craft ${item} ${count}${item === 'stone_pickaxe' ? ' (no table within 16 blocks: places the held one beside the bot)' : item === 'wooden_pickaxe' ? ' (reuses the placed table)' : ''}`,
    ),
    expect: [
      'every craft completed and reports the amount crafted',
      'server inventory: 1 stone_pickaxe, 1 wooden_pickaxe, 3 oak_planks; no logs, cobblestone, sticks, or crafting table left',
      'no crafting table beside the start before; exactly one after, at the block the stone_pickaxe job reported',
      'bridge inventory agrees with the server',
    ],
  },
  craftRefusalScenario({
    id: 'craft-missing-ingredients',
    lane: 15,
    title: 'Crafting refuses a quota without enough ingredients',
    count: 12,
    cobblestone: 0,
    message: 'Missing ingredients for 12 oak_planks',
  }),
  craftRefusalScenario({
    id: 'craft-full-inventory',
    lane: 16,
    title: 'Crafting refuses output that cannot fit after consuming the ingredient',
    count: 4,
    cobblestone: 35 * 64,
    message: 'Inventory full; crafted 0 of 4 oak_planks.',
  }),
  {
    id: 'withdraw-craft-model',
    lane: 17,
    requiresModel: true,
    title: 'Real local model: withdraw cobblestone and craft a stone pickaxe',
    release: [RELEASE.withdraw, RELEASE.craft],
    plan: withdrawCraftPlan,
    run: runWithdrawCraftModel,
    actions: ['agent with the --model given (real Ollama): withdraw 4 cobblestone → craft 1 stone_pickaxe → done'],
    expect: [
      'agent reports criteria_met for withdraw cobblestone:1 and craft stone_pickaxe:1',
      'server chest loses exactly 4 cobblestone and retains every oak log',
      'server inventory holds 1 stone pickaxe and 1 cobblestone',
      'a separate observation shows manual control',
    ],
  },
  depositScenario({
    id: 'deposit-barrel-exact',
    lane: 18,
    title: 'Deposit an exact count into a barrel with existing contents',
    storage: 'barrel',
    count: 8,
    held: 12,
    moved: 8,
  }),
  depositScenario({
    id: 'deposit-full-chest',
    lane: 19,
    title: 'A full chest cannot take any of the requested deposit',
    storage: 'full',
    count: 8,
    held: 8,
    moved: 0,
    failure: /is full; deposited 0 of 8 oak_log/,
  }),
  depositScenario({
    id: 'deposit-double-chest-omitted',
    lane: 20,
    title: 'Omitted count deposits every matching stack across both halves of a double chest',
    storage: 'double',
    held: 80,
    moved: 80,
  }),
  depositScenario({
    id: 'deposit-over-held',
    lane: 21,
    title: 'A deposit larger than the held count fails before transferring items',
    storage: 'chest',
    held: 4,
    count: 8,
    moved: 0,
    failure: /Only 4 oak_log in inventory; cannot deposit 8/,
  }),
  {
    id: 'withdraw-barrel-exact',
    lane: 22,
    title: 'Withdraw from a barrel with existing contents',
    release: [RELEASE.withdraw],
    plan: (args) => withdrawPlan(args, { storage: 'barrel' }),
    run: (ctx, plan) => runWithdraw(ctx, plan, { count: 8 }),
    actions: ['bridge: withdraw oak_log 8 (barrel seeded with 20 oak logs and 5 cobblestone)'],
    expect: ['job names the barrel and reports 8 logs moved', 'server verifies the inventory and barrel deltas'],
  },
  {
    id: 'withdraw-no-matching-stock',
    lane: 23,
    title: 'Withdrawing from a chest that holds only other items fails without moving them',
    release: [RELEASE.withdraw],
    plan: (args) => withdrawPlan(args, { logs: 0 }),
    run: (ctx, plan) => runWithdraw(ctx, plan, { count: 8, moved: 0, failure: /holds no oak_log; withdrew 0 of 8/ }),
    actions: ['bridge: withdraw oak_log 8 (chest seeded with cobblestone only)'],
    expect: ['job reports zero logs moved', 'chest retains all cobblestone and inventory remains empty'],
  },
  craftInventoryScenario({
    id: 'craft-rounds-up',
    lane: 24,
    title: 'A five-plank request requires two whole crafts and produces eight planks',
    held: { [LOG]: 3 },
    expected: { [LOG]: 1, 'minecraft:oak_planks': 8 },
    item: 'oak_planks',
    count: 5,
  }),
  craftInventoryScenario({
    id: 'craft-mixed-planks',
    lane: 25,
    title: 'The inventory grid accepts two different kinds of planks for sticks',
    held: { 'minecraft:oak_planks': 1, 'minecraft:birch_planks': 1 },
    expected: { 'minecraft:stick': 4 },
    item: 'stick',
    count: 4,
  }),
  craftInventoryScenario({
    id: 'craft-mixed-stone',
    lane: 26,
    title: 'A crafting table accepts three different stone materials for a stone pickaxe',
    held: {
      'minecraft:cobblestone': 1,
      'minecraft:blackstone': 1,
      'minecraft:cobbled_deepslate': 1,
      'minecraft:stick': 2,
    },
    expected: { 'minecraft:stone_pickaxe': 1 },
    item: 'stone_pickaxe',
    count: 1,
    table: true,
  }),
  craftInventoryScenario({
    id: 'craft-reuses-consumed-slot',
    lane: 27,
    title: 'A full inventory can craft when consuming an ingredient frees its output slot',
    held: { [LOG]: 1, 'minecraft:cobblestone': 35 * 64 },
    expected: { 'minecraft:oak_planks': 4, 'minecraft:cobblestone': 35 * 64 },
    item: 'oak_planks',
    count: 4,
  }),
  craftInventoryScenario({
    id: 'craft-no-table',
    lane: 28,
    title: 'A table recipe fails without a placed or held table and leaves its inputs intact',
    held: { 'minecraft:cobblestone': 3, 'minecraft:stick': 2 },
    item: 'stone_pickaxe',
    count: 1,
    failure: /needs a crafting table; none is within 16 blocks and none is held/,
  }),
  {
    id: 'cobblestone-hostiles-dimension',
    lane: 29,
    title: 'Collect cobblestone, observe hostile mobs, and release control on entering the Nether',
    release: [RELEASE.cobblestone],
    plan: cobblestonePlan,
    run: runCobblestone,
    during: ({ hooks }) => [hooks.teleport],
    actions: [
      'bridge: observe hostile mobs, checked against server positions',
      'bridge: collect cobblestone 4 with the held pickaxe',
      'bridge: goto along the flat lane; teleport to the Nether after server-observed movement',
    ],
    expect: [
      'bridge shows the nearby husk and omits the one beyond 16 blocks',
      'server inventory holds at least four cobblestone and the pickaxe',
      'the same goto is cancelled because the dimension changed; bridge is manual and settled',
      'server and bridge show a stationary player on the Nether landing pad',
    ],
  },
  {
    id: 'eat-timeout',
    lane: 30,
    longRunning: true,
    title: 'Food that takes 30 s to eat: the 5 s eating timeout and the 10 s automatic-eating backoff',
    release: [RELEASE.eating],
    plan: (args) => vitalsPlan(args, { bread: 8 }),
    run: runEatTimeout,
    during: (plan) => [plan.hooks.hunger, plan.hooks.sated],
    actions: [
      `lower food to ${HUNGRY} or less (hunger effect, then effect clear) before taking control`,
      'bridge: eat with eight slow bread held (30 s to consume)',
      'bridge: wait 20 straight after the failed eat, recording each automatic attempt until the second starts, then release control',
    ],
    expect: [
      'eat fails with "Eating timed out." after the backend\'s consumption timeout (Fabric 5 s, bot 2.5 s)',
      'each automatic attempt ends "Could not eat." after that timeout and starts 10 s after the previous failure',
      'Fabric: the wait pauses to eat and still finishes; bot: the wait is interrupted to eat and fails with the failed attempt',
      'server bread count stays 8 and foodLevel does not rise',
    ],
  },
  {
    id: 'low-health-retreat',
    lane: 31,
    title: 'Low health during a wait: retreat to the saved home and fail the job',
    release: [RELEASE.eating],
    plan: (args) => vitalsPlan(args, { away: 16 }),
    run: runLowHealthRetreat,
    during: (plan) => [plan.hooks.wound],
    actions: (plan) => [
      'bridge: set_home at the start (full health and food, natural regeneration off)',
      `bridge: goto ${plan.points.away.x} ${STAND} ${plan.points.away.z} (16 blocks east)`,
      'bridge: wait 60',
      `while it runs: > ${plan.hooks.wound}`,
    ],
    expect: [
      'server Health at most 8 and never regenerates',
      'the wait job reports "Low health: retreating home" and fails with "Action interrupted for survival" within 60 s',
      'server Pos within 2 blocks of home; the session keeps control',
    ],
  },
  {
    id: 'eat-retreat-timeout',
    lane: 32,
    longRunning: true,
    title: 'Retreat to a walled-in home while slow food cannot be eaten: the 60 s retreat budget',
    release: [RELEASE.eating],
    plan: (args) => vitalsPlan(args, { bread: 8, away: 24, enclose: true }),
    run: runEatRetreatTimeout,
    during: (plan) => [plan.hooks.enclose, plan.hooks.wound, plan.hooks.hunger, plan.hooks.sated],
    actions: (plan) => [
      'bridge: set_home at the start with eight slow bread held',
      `bridge: goto ${plan.points.away.x} ${STAND} ${plan.points.away.z} (24 blocks east)`,
      `> ${plan.hooks.enclose}`,
      'bridge: wait 120',
      `while it runs: > ${plan.hooks.wound}`,
      `once the retreat starts, lower food to ${HUNGRY} or less (hunger effect, then effect clear)`,
      'record the retreat, each eating attempt, and the job outcome; release control when the job ends',
    ],
    expect: [
      'Fabric: eating attempts keep failing during the retreat, and the job fails with "Survival retreat timed out." 60 s after the retreat starts',
      'bot: the job fails with "Action interrupted for survival" within 60 s; any distance the failed retreat reports agrees with server Pos',
      'server Pos outside the bedrock walls, the walls intact, bread count 8 and foodLevel not raised',
    ],
  },
  {
    id: 'collect-full-inventory',
    lane: 33,
    title: 'The last inventory slot fills during collection: the job fails on its own and the session keeps control',
    release: [RELEASE.fullInventory],
    plan: fullInventoryPlan,
    run: runCollectFullInventory,
    actions: [
      'bridge: collect oak_log 8 with an iron axe, 34 cobblestone stacks, and 58 logs (room for six more)',
      'bridge: wait 1 under the same lease',
    ],
    expect: [
      'job fails with "Inventory full; collected 6 of 8 oak_log. Inventory: 64/66." well before the 180 s mining deadline',
      'the reported return agrees with server Pos',
      'server inventory holds exactly 64 logs, the axe, and all cobblestone; the bridge agrees',
      'mode stays agent and the same lease runs wait 1',
    ],
  },
];

export const scenarioIds = scenarios.map((scenario) => scenario.id);

/** Resolved plan for printing and running; includes the independent read commands. */
export function scenarioPlan(scenario, { bot }) {
  const plan = scenario.plan({ bot, lane: scenario.lane });
  const resolve = (value) => (typeof value === 'function' ? value(plan) : (value ?? []));
  return {
    ...plan,
    verify: [...readCommands(bot, plan.points.chest), ...(plan.reads ?? [])],
    during: resolve(scenario.during),
    actions: resolve(scenario.actions),
    expect: scenario.expect,
  };
}
