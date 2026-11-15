import { distance, itemCount, itemTotals } from './nbt-parse.js';

// Superflat 1.21.1: bedrock -64, dirt -63..-62, grass -61; players stand at y = -60.
export const STAND = -60;
export const LOG = 'minecraft:oak_log';
// Lanes are 64 blocks apart so no fixture's logs are within the bot's 48-block collection search of another lane.
export const laneOrigin = lane => ({ x: 96 + 64 * lane, z: 0 });
const RETURNING = /returning to where collection started/;
const COLLECTION_DEADLINE_MS = 180_000;
const RETURN_BUDGET_MS = 60_000;

export const RELEASE = {
  pit: 'RELEASE.md: "Force a bot mining timeout in a real pit. Verify the bounded return attempt, failure status, preserved inventory progress, and immediate cancellation during recovery."',
  partial: 'RELEASE.md: "Run collection with partial progress and recovery from a pit ..." (bot half only; Fabric still pending)',
  store: 'RELEASE.md: "Run collect-and-store with both criteria. Remove stored items during inference and block inspection; stale contents must not produce success. Verify final inspection preserves return-home criteria or reports failure."',
};

const at = (o, dx, y, dz) => `${o.x + dx} ${y} ${o.z + dz}`;
const point = (o, dx, y, dz) => ({ x: o.x + dx, y, z: o.z + dz });
const center = p => ({ x: p.x + 0.5, y: p.y, z: p.z + 0.5 });
const forceload = (o, verb) => `forceload ${verb} ${o.x - 16} ${o.z - 16} ${o.x + 16} ${o.z + 16}`;
const killDrops = o => `kill @e[type=item,x=${o.x},y=${STAND},z=${o.z},distance=..32]`;
const resetPlayer = bot => [`clear ${bot}`, `effect clear ${bot}`];
const teleport = (bot, p) => `tp ${bot} ${p.x} ${p.y} ${p.z}`;
export const readCommands = (bot, chest) => [...(chest ? [`data get block ${chest.x} ${chest.y} ${chest.z} Items`] : []), `data get entity ${bot} Inventory`, `data get entity ${bot} Pos`];

/** A stone plateau with a 3x3, nine-deep oak-log shaft; mining fatigue makes the 180 s mining deadline expire well before 64 logs. */
function pitPlan({ bot, lane }) {
  const o = laneOrigin(lane);
  const start = center(point(o, 3, STAND + 10, 0));
  return {
    origin: o, points: { start },
    fixture: [forceload(o, 'add'), `fill ${at(o, -5, STAND, -5)} ${at(o, 5, STAND + 14, 5)} air`, `fill ${at(o, -4, STAND, -4)} ${at(o, 4, STAND + 9, 4)} stone`,
      `fill ${at(o, -1, STAND + 1, -1)} ${at(o, 1, STAND + 9, 1)} oak_log`],
    prepare: [...resetPlayer(bot), `effect give ${bot} minecraft:mining_fatigue 900 0 true`, teleport(bot, start)],
    cleanup: [...resetPlayer(bot), `fill ${at(o, -5, STAND, -5)} ${at(o, 5, STAND + 14, 5)} air`, killDrops(o), forceload(o, 'remove')],
  };
}

/** A pre-seeded chest beside the start and an 18-log patch five blocks west. */
function storePlan({ bot, lane }) {
  const o = laneOrigin(lane);
  const chest = point(o, 2, STAND, 0);
  const start = center(point(o, 0, STAND, 0));
  return {
    origin: o, points: { start, chest },
    hooks: { removeStored: `data remove block ${chest.x} ${chest.y} ${chest.z} Items`, blockLid: `setblock ${chest.x} ${chest.y + 1} ${chest.z} stone` },
    fixture: [forceload(o, 'add'), `fill ${at(o, -8, STAND, -3)} ${at(o, 4, STAND + 3, 3)} air`,
      `setblock ${chest.x} ${chest.y} ${chest.z} minecraft:chest[facing=west]{Items:[{Slot:0b,id:"minecraft:cobblestone",count:5},{Slot:1b,id:"minecraft:oak_log",count:3}]}`,
      `fill ${at(o, -6, STAND, -1)} ${at(o, -4, STAND + 1, 1)} oak_log`],
    prepare: [...resetPlayer(bot), teleport(bot, start), `give ${bot} minecraft:oak_log 4`],
    cleanup: [...resetPlayer(bot), `fill ${at(o, -8, STAND, -3)} ${at(o, 4, STAND + 3, 3)} air`, killDrops(o), forceload(o, 'remove')],
  };
}

/** Home on a two-high stone platform with one step down; an empty chest nine blocks east, out of reach but within 16. */
function platformPlan({ bot, lane }) {
  const o = laneOrigin(lane);
  const chest = point(o, 9, STAND, 0);
  const step = point(o, 2, STAND, 0);
  const start = center(point(o, 0, STAND + 2, 0));
  return {
    origin: o, points: { start, chest, step }, hooks: { removeStep: `setblock ${step.x} ${step.y} ${step.z} air` },
    fixture: [forceload(o, 'add'), `fill ${at(o, -2, STAND, -2)} ${at(o, 10, STAND + 3, 2)} air`, `fill ${at(o, -1, STAND, -1)} ${at(o, 1, STAND + 1, 1)} stone`,
      `setblock ${step.x} ${step.y} ${step.z} stone`, `setblock ${chest.x} ${chest.y} ${chest.z} minecraft:chest[facing=west]`],
    prepare: [...resetPlayer(bot), teleport(bot, start), `give ${bot} minecraft:oak_log 8`],
    cleanup: [...resetPlayer(bot), `fill ${at(o, -2, STAND, -2)} ${at(o, 10, STAND + 3, 2)} air`, killDrops(o), forceload(o, 'remove')],
  };
}

/** Planner decisions served without a model; `before[i]` runs while the agent awaits decision i (its "inference" window). */
export function scriptedPlanner(decisions, { before = {} } = {}) {
  let request = 0;
  const fetchImpl = async () => {
    const index = request++;
    if (before[index]) await before[index]();
    const decision = decisions[Math.min(index, decisions.length - 1)];
    return { ok: true, status: 200, json: async () => ({ message: { content: JSON.stringify(decision) } }), text: async () => '' };
  };
  fetchImpl.requests = () => request;
  return fetchImpl;
}

/** Wraps a real model's fetch: the first request matching `trigger` also runs `hook`, so the change lands during that inference. */
export function interceptInference(trigger, hook, fetchImpl = fetch) {
  let fired = false;
  const wrapped = async (url, init) => {
    let body = null;
    try { body = JSON.parse(init?.body); } catch {}
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
  try { content = JSON.parse(body.messages?.at(-1)?.content ?? '{}'); } catch {}
  return (content.history || []).some(entry => entry.action?.type === 'deposit' && entry.result);
}

async function snapshot(ctx, chest) {
  const items = chest ? await ctx.server.items(chest) : null;
  const inventory = await ctx.server.inventory();
  const position = await ctx.server.position();
  return { chest: items && itemTotals(items), held: itemCount(inventory, LOG), position };
}

const spread = samples => Math.max(...['x', 'y', 'z'].map(axis => Math.max(...samples.map(s => s[axis])) - Math.min(...samples.map(s => s[axis]))));
const heldOnBridge = state => (state.inventory || []).filter(item => item.name === LOG).reduce((total, item) => total + item.count, 0);

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
  const outcome = await ctx.step('bridge: collect oak_log 64 in the pit (mining deadline 180 s, return budget 60 s)', async () => {
    try {
      const job = await ctx.bridge.execute({ type: 'collect', block: 'oak_log', count: 64 }, { onProgress: job => {
        progress.push({ atMs: ctx.now() - started, status: job.status, message: job.message });
        if (returningAt === null && RETURNING.test(job.message || '')) {
          returningAt = ctx.now();
          if (mode !== 'timeout') interrupt = ctx.step(`${mode === 'cancel' ? 'bridge: /v1/cancel (lease cancel)' : 'cli: mc-agent stop (emergency stop from a second process)'} during recovery`, issue)
            // Handled now so Ctrl+C or a refused cancel cannot become an unhandled rejection before it is awaited.
            .catch(error => ({ error: error.message }));
        }
      } });
      return { settled: 'completed', message: job.message };
    } catch (error) { return { settled: 'rejected', message: error.message }; }
  });
  const endedAt = ctx.now();
  const interruptRecord = interrupt ? await interrupt : null;
  ctx.note('progress', progress);
  ctx.note('outcome', { ...outcome, durationMs: endedAt - started, returnStartedAfterMs: returningAt && returningAt - started, interrupt: interruptRecord });

  let settledState = await ctx.bridge.observe();
  if (mode !== 'timeout' && interruptRecord?.requestedAt) {
    for (let waited = 0; (settledState.stopping || settledState.job?.status === 'running') && waited < 10_000; waited += 250) { await ctx.sleep(250); settledState = await ctx.bridge.observe(); }
    ctx.note('settledAfterMs', ctx.now() - interruptRecord.requestedAt);
  }
  const after = await ctx.step('independent final state', () => snapshot(ctx));
  ctx.note('final', { server: after, bridgeJob: settledState.job, mode: settledState.mode, bridgePosition: settledState.player?.position ?? null });
  const inventoryMatch = /Inventory: (\d+)\/(\d+)/.exec(outcome.message);
  ctx.check('inventory progress preserved on the server', after.held > before.held, { before: before.held, after: after.held });
  ctx.check('bridge inventory agrees with the server', heldOnBridge(settledState) === after.held, { bridge: heldOnBridge(settledState), server: after.held });

  if (mode === 'timeout') {
    ctx.check('job failed', settledState.job?.status === 'failed' && outcome.settled === 'rejected', { job: settledState.job });
    ctx.check('failure is the mining deadline', /Collection timed out before reaching the requested quota/.test(outcome.message), { message: outcome.message });
    ctx.check('return attempt started after the mining deadline', returningAt !== null && returningAt - started >= COLLECTION_DEADLINE_MS - 10_000,
      { returnStartedAfterMs: returningAt && returningAt - started });
    ctx.check('return attempt bounded (≤ 60 s + 10 s polling slack)', returningAt !== null && endedAt - returningAt <= RETURN_BUDGET_MS + 10_000, { returnMs: returningAt && endedAt - returningAt });
    ctx.check('reported inventory matches the server', inventoryMatch !== null && Number(inventoryMatch[1]) === after.held, { reported: inventoryMatch?.[0] ?? null, server: after.held });
    const gap = distance(after.position, start);
    if (/Returned to the starting point/.test(outcome.message)) ctx.check('reported return agrees with server Pos (≤ 2.5 blocks)', gap <= 2.5, { distance: gap });
    else ctx.check('reported failed return agrees with server Pos (> 2 blocks)', gap > 2, { distance: gap, message: outcome.message });
    return;
  }
  ctx.check('interrupt issued while recovery was running', interruptRecord?.requestedAt !== undefined && RETURNING.test(interruptRecord?.jobBefore?.message || ''),
    { jobBefore: interruptRecord?.jobBefore ?? null, note: interruptRecord ? undefined : 'No return trip was observed; the bot never moved more than 2 blocks.' });
  ctx.check('job cancelled, not failed or completed', settledState.job?.status === 'cancelled', { job: settledState.job });
  ctx.check('bridge settled (no job running or stopping) within 5 s', !settledState.stopping && ctx.observations.settledAfterMs <= 5000, { settledAfterMs: ctx.observations.settledAfterMs });
  if (mode === 'stop') ctx.check('emergency stop returned control (mode manual)', settledState.mode === 'manual', { mode: settledState.mode });
  else ctx.check('cancel reported as cancelled by the agent', /Cancelled by agent/.test(settledState.job?.message || ''), { message: settledState.job?.message });
  const samples = await ctx.step('independent Pos samples after a 1.5 s settle, 1.5 s apart', async () => {
    await ctx.sleep(1500);
    const out = [];
    for (let i = 0; i < 3; i++) { if (i) await ctx.sleep(1500); out.push(await ctx.server.position()); }
    return out;
  });
  ctx.note('positionSamples', samples);
  ctx.check('position stopped changing (spread ≤ 0.2 blocks)', spread(samples) <= 0.2, { spread: spread(samples) });
  const bridgePosition = (await ctx.bridge.observe()).player?.position;
  ctx.check('bridge position agrees with server Pos (≤ 0.6 blocks)', !!bridgePosition && distance(bridgePosition, samples.at(-1)) <= 0.6, { bridge: bridgePosition, server: samples.at(-1) });
}

/** Shared by the gather-and-store, stale-removal, blocked-lid, and model scenarios. */
async function runStore(ctx, plan, variant) {
  const { chest, start } = plan.points;
  const before = await ctx.step('independent baseline (chest Items, Inventory, Pos)', () => snapshot(ctx, chest));
  ctx.note('baseline', before);
  await ctx.step('bridge: set_home at the start position', () => ctx.bridge.execute({ type: 'set_home' }));
  const criteria = { collect: { block: 'oak_log', count: 8 }, deposit: { item: 'oak_log', count: 8 }, returnHome: true };
  const goal = 'Collect eight additional oak logs, store them in the nearby chest, then return home.';
  let storedBeforeRemoval = null;
  const removeStored = async () => {
    storedBeforeRemoval = await ctx.step('independent chest read before removal', async () => itemTotals(await ctx.server.items(chest)));
    return ctx.step(`server (stored items removed externally): ${plan.hooks.removeStored}`, () => ctx.server.command(plan.hooks.removeStored));
  };
  const blockLid = () => ctx.step(`server (lid blocked): ${plan.hooks.blockLid}`, () => ctx.server.command(plan.hooks.blockLid));
  const decisions = [{ type: 'collect', block: 'oak_log', count: 8 }, { type: 'deposit', item: 'oak_log', count: 8 }, { type: 'home' }, { type: 'done', reason: 'Scripted acceptance run finished.' }];
  let result;
  if (variant === 'model') {
    const fetchImpl = interceptInference(depositCompleted, removeStored);
    result = await ctx.step(`agent with real model ${ctx.options.model}`, () => ctx.agent({ goal, criteria, model: ctx.options.model, fetchImpl }));
    ctx.note('removalDuringInference', fetchImpl.fired());
    ctx.check('items were removed during a model inference after a completed deposit', fetchImpl.fired(), {});
    ctx.check('the deposit stored 8 before the removal, so a stale +8 existed', (storedBeforeRemoval?.[LOG] || 0) - (before.chest[LOG] || 0) >= 8,
      { beforeRemoval: storedBeforeRemoval, baseline: before.chest });
  } else {
    const before3 = variant === 'stale' ? removeStored : variant === 'blocked' ? blockLid : null;
    result = await ctx.step('agent with scripted planner (no model): collect 8 → deposit 8 → home → done', () =>
      ctx.agent({ goal, criteria, fetchImpl: scriptedPlanner(decisions, { before: before3 ? { 3: before3 } : {} }) }));
  }
  ctx.note('agent', { status: result.status, steps: result.steps, verification: result.verification ?? null, actionCounts: result.actionCounts });
  const after = await ctx.step('independent final state', () => snapshot(ctx, chest));
  ctx.note('final', after);
  const deposit = result.verification?.checks?.deposit;
  const inventory = result.verification?.checks?.inventory;
  const serverStored = (after.chest[LOG] || 0) - (before.chest[LOG] || 0);
  ctx.check('agent storage evidence matches server chest (no cached count)', deposit?.storedAdditional === serverStored || (variant === 'blocked' && deposit?.error),
    { agentStoredAdditional: deposit?.storedAdditional ?? null, serverStoredAdditional: serverStored });
  if (variant === 'store') {
    ctx.check('agent reports criteria_met', result.status === 'criteria_met', { status: result.status });
    ctx.check('deposit evidence was refreshed', deposit?.evidence === 'refreshed', { evidence: deposit?.evidence });
    ctx.check('server chest holds 8 more oak logs', serverStored >= 8, { serverStoredAdditional: serverStored });
    ctx.check('net collection across inventory and storage ≥ 8 on the server', after.held - before.held + serverStored >= 8, { heldBefore: before.held, heldAfter: after.held, serverStored });
    ctx.check('other chest contents untouched', (after.chest['minecraft:cobblestone'] || 0) === (before.chest['minecraft:cobblestone'] || 0), { before: before.chest, after: after.chest });
    ctx.check('agent inventory count matches server', inventory?.currentCount === after.held, { agent: inventory?.currentCount, server: after.held });
    ctx.check('server Pos within 2 blocks of home', distance(after.position, start) <= 2, { distance: distance(after.position, start) });
  } else if (variant === 'stale') {
    ctx.check('the deposit really stored 8 before the removal, so a stale +8 existed', (storedBeforeRemoval?.[LOG] || 0) - (before.chest[LOG] || 0) >= 8,
      { beforeRemoval: storedBeforeRemoval, baseline: before.chest });
    ctx.check('no success after external removal', result.status !== 'criteria_met', { status: result.status });
    ctx.check('final deposit evidence was refreshed', deposit?.evidence === 'refreshed', { evidence: deposit?.evidence });
    ctx.check('server chest empty after removal', !after.chest[LOG], { chest: after.chest });
  } else if (variant === 'blocked') {
    ctx.check('no success with a blocked lid', result.status !== 'criteria_met', { status: result.status });
    ctx.check('inspection failure reported in deposit check', /did not open/.test(deposit?.error || '') && deposit?.met === false, { deposit });
    ctx.check('items really were stored (server +8), so failure is not a missing deposit', serverStored >= 8, { serverStoredAdditional: serverStored });
    const direct = await ctx.step('bridge: inspect_storage with the lid still blocked', async () => {
      try { return { settled: 'completed', message: (await ctx.bridge.execute({ type: 'inspect_storage' })).message }; }
      catch (error) { return { settled: 'rejected', message: error.message }; }
    });
    ctx.check('direct inspect_storage fails with a blocked lid', direct.settled === 'rejected' && /did not open/.test(direct.message), direct);
  } else if (variant === 'model') {
    const success = result.status === 'criteria_met';
    ctx.check('success only with fresh server evidence', !success || (serverStored >= 8 && deposit?.evidence === 'refreshed'), { status: result.status, serverStored });
  }
}

/** Shared by the two return-home inspection scenarios. variant: preserve | blocked. */
async function runInspectHome(ctx, plan, variant) {
  const { chest, start } = plan.points;
  const before = await ctx.step('independent baseline (chest Items, Inventory, Pos)', () => snapshot(ctx, chest));
  ctx.note('baseline', before);
  await ctx.step('bridge: set_home on the platform', () => ctx.bridge.execute({ type: 'set_home' }));
  const removeStep = () => ctx.step(`server (platform becomes a one-way drop): ${plan.hooks.removeStep}`, () => ctx.server.command(plan.hooks.removeStep));
  const decisions = [{ type: 'deposit', item: 'oak_log', count: 8 }, { type: 'home' }, { type: 'done', reason: 'Scripted acceptance run finished.' }];
  const result = await ctx.step('agent with scripted planner (no model): deposit 8 → home → done (final inspection walks 9 blocks)', () =>
    ctx.agent({ goal: 'Store eight oak logs in the chest, then return home.', criteria: { deposit: { item: 'oak_log', count: 8 }, returnHome: true },
      fetchImpl: scriptedPlanner(decisions, { before: variant === 'blocked' ? { 2: removeStep } : {} }) }));
  ctx.note('agent', { status: result.status, steps: result.steps, verification: result.verification ?? null });
  const after = await ctx.step('independent final state', () => snapshot(ctx, chest));
  ctx.note('final', after);
  const checks = result.verification?.checks || {};
  const serverDistance = distance(after.position, start);
  ctx.check('agent home distance agrees with server Pos (± 0.5)', Number.isFinite(checks.home?.distance) && Math.abs(checks.home.distance - serverDistance) <= 0.5,
    { agent: checks.home?.distance ?? null, server: serverDistance });
  if (variant === 'preserve') {
    ctx.check('agent reports criteria_met', result.status === 'criteria_met', { status: result.status });
    ctx.check('home check met after final inspection', checks.home?.met === true, { home: checks.home });
    ctx.check('server Pos within 2 blocks of home', serverDistance <= 2, { distance: serverDistance });
    ctx.check('deposit evidence refreshed and server chest +8', checks.deposit?.evidence === 'refreshed' && (after.chest[LOG] || 0) - (before.chest[LOG] || 0) >= 8, { deposit: checks.deposit, chest: after.chest });
  } else {
    ctx.check('no success when the inspection cannot return', result.status !== 'criteria_met', { status: result.status });
    ctx.check('failure reported (inspection error or unmet home)', !!checks.deposit?.error || checks.home?.met === false, { deposit: checks.deposit, home: checks.home });
    ctx.check('items really were stored (server +8), so failure is not a missing deposit', (after.chest[LOG] || 0) - (before.chest[LOG] || 0) >= 8, { before: before.chest, after: after.chest });
    ctx.check('the bot really could not return (server Pos more than 2 blocks from home)', serverDistance > 2, { distance: serverDistance });
  }
}

/** The scenario table. plan() is pure so --dry-run prints exactly what run() sends. */
export const scenarios = [
  { id: 'recovery-timeout', lane: 0, title: 'Mining timeout in a real pit: bounded return, failure status, preserved inventory', release: [RELEASE.pit, RELEASE.partial],
    plan: pitPlan, run: (ctx, plan) => runRecovery(ctx, plan, 'timeout'),
    actions: ['bridge: collect oak_log 64 under mining fatigue (cannot reach 64 in 180 s)', 'wait for the job to fail (≈ 180 s mining + ≤ 60 s return)'],
    expect: ['job failed with "Collection timed out before reaching the requested quota"', 'return attempt started after ≈ 180 s and ended within 60 s (+ slack)',
      'server Inventory holds more oak logs than before and matches the reported count', 'reported return outcome agrees with server Pos'] },
  { id: 'recovery-cancel', lane: 1, title: 'Lease cancel during pit recovery stops immediately', release: [RELEASE.pit],
    plan: pitPlan, run: (ctx, plan) => runRecovery(ctx, plan, 'cancel'),
    actions: ['bridge: collect oak_log 64 under mining fatigue', 'when progress says "returning to where collection started", wait 1 s, then POST /v1/cancel with the lease'],
    expect: ['job cancelled; no job running or stopping within 5 s', 'three server Pos reads 1.5 s apart differ by ≤ 0.2 blocks', 'inventory progress preserved'] },
  { id: 'recovery-stop', lane: 2, title: 'Emergency stop from a second CLI process during pit recovery stops immediately', release: [RELEASE.pit],
    plan: pitPlan, run: (ctx, plan) => runRecovery(ctx, plan, 'stop'),
    actions: ['bridge: collect oak_log 64 under mining fatigue', 'when progress says "returning to where collection started", wait 1 s, then run `node src/cli.js --bridge <bridge> stop`'],
    expect: ['job cancelled and mode manual; settled within 5 s', 'three server Pos reads 1.5 s apart differ by ≤ 0.2 blocks', 'inventory progress preserved'] },
  { id: 'collect-and-store', lane: 3, title: 'Collect-and-store with --verify-collect, --verify-deposit, and --verify-home criteria', release: [RELEASE.store],
    plan: storePlan, run: (ctx, plan) => runStore(ctx, plan, 'store'),
    actions: ['bridge: set_home at the start', 'agent (in-process runAgent, scripted planner, no model) with criteria collect oak_log:8, deposit oak_log:8, returnHome: collect 8 → deposit 8 → home → done'],
    expect: ['criteria_met with refreshed deposit evidence', 'server chest +8 oak logs, cobblestone untouched, net increase ≥ 8', 'server Pos within 2 blocks of home'] },
  { id: 'stale-removal', lane: 4, title: 'Stored items removed externally before final inspection must not yield stale success', release: [RELEASE.store],
    plan: storePlan, run: (ctx, plan) => runStore(ctx, plan, 'stale'),
    during: plan => [plan.hooks.removeStored],
    actions: plan => ['bridge: set_home', 'scripted agent: collect 8 → deposit 8 → home', `while the agent awaits the done decision: > ${plan.hooks.removeStored}`, 'scripted agent: done (repeated; rejected twice, third ends the task)'],
    expect: ['status is not criteria_met', 'deposit evidence refreshed and storedAdditional equals the server chest change'] },
  { id: 'blocked-lid', lane: 5, title: 'Blocked chest lid before final inspection reports inspection failure', release: [RELEASE.store],
    plan: storePlan, run: (ctx, plan) => runStore(ctx, plan, 'blocked'),
    during: plan => [plan.hooks.blockLid],
    actions: plan => ['bridge: set_home', 'scripted agent: collect 8 → deposit 8 → home', `while the agent awaits the done decision: > ${plan.hooks.blockLid}`, 'scripted agent: done (repeated)', 'bridge: inspect_storage with the lid still blocked'],
    expect: ['status is not criteria_met; deposit check carries "did not open"', 'server chest still shows +8 (items exist, success still refused)', 'direct inspect_storage fails'] },
  { id: 'inspect-preserves-home', lane: 6, title: 'Final storage inspection walks away and preserves the completed return home', release: [RELEASE.store],
    plan: platformPlan, run: (ctx, plan) => runInspectHome(ctx, plan, 'preserve'),
    actions: ['bridge: set_home on the platform', 'scripted agent with criteria deposit oak_log:8 and returnHome: deposit 8 → home → done'],
    expect: ['criteria_met; home check met after the final inspection', 'server Pos within 2 blocks of home and agrees with the agent distance'] },
  { id: 'inspect-return-blocked', lane: 7, title: 'Final storage inspection that cannot return reports failure', release: [RELEASE.store],
    plan: platformPlan, run: (ctx, plan) => runInspectHome(ctx, plan, 'blocked'),
    during: plan => [plan.hooks.removeStep],
    actions: plan => ['bridge: set_home on the platform', 'scripted agent: deposit 8 → home', `while the agent awaits the done decision (platform becomes a one-way drop): > ${plan.hooks.removeStep}`, 'scripted agent: done (repeated)'],
    expect: ['status is not criteria_met; inspection error or unmet home reported', 'agent home distance agrees with server Pos'] },
  { id: 'stale-removal-model', lane: 8, requiresModel: true, title: 'Real local model: stored items removed during model inference must not yield stale success', release: [RELEASE.store],
    plan: storePlan, run: (ctx, plan) => runStore(ctx, plan, 'model'),
    during: plan => [plan.hooks.removeStored],
    actions: plan => ['bridge: set_home', 'agent with the --model given (real Ollama) and criteria collect oak_log:8, deposit oak_log:8, returnHome',
      `on the first model request after a completed deposit, concurrently with the inference: > ${plan.hooks.removeStored}`],
    expect: ['criteria_met only if the refreshed server chest really holds +8; otherwise any non-success status', 'storedAdditional equals the server chest change'] },
];

export const scenarioIds = scenarios.map(scenario => scenario.id);

/** Resolved plan for printing and running; includes the independent read commands. */
export function scenarioPlan(scenario, { bot }) {
  const plan = scenario.plan({ bot, lane: scenario.lane });
  const resolve = value => typeof value === 'function' ? value(plan) : value ?? [];
  return { ...plan, verify: readCommands(bot, plan.points.chest), during: resolve(scenario.during), actions: resolve(scenario.actions), expect: scenario.expect };
}
