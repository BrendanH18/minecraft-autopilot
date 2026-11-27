import { setTimeout as delay } from 'node:timers/promises';
import { bridgeItemTotals, distance, itemTotals, sameTotals } from './nbt-parse.js';
import { laneOrigin, LOG, STAND, watchBridge } from './scenarios.js';

const QUOTA = 8;
const HOME_RADIUS = 2;
const MINUTES = 10;
const GOAL = 'Collect eight oak logs from the nearby patch, return to the saved home, and finish.';

function collectionPlan({ bot, lane }) {
  const { x, z } = laneOrigin(lane);
  const start = { x: x + 0.5, y: STAND, z: z + 0.5 };
  // The patch is out of reach from home, so the player must leave and come back.
  const marker = { x: x + 8, y: STAND, z: z - 1, name: LOG };
  const patch = `${x + 8} ${STAND} ${z - 1} ${x + 10} ${STAND + 1} ${z + 1}`;
  const loaded = `${x - 16} ${z - 16} ${x + 16} ${z + 16}`;
  const reset = [`clear ${bot}`, `effect clear ${bot}`];
  return {
    points: { start },
    marker,
    fixture: [`forceload add ${loaded}`, `fill ${patch} ${LOG}`],
    prepare: [...reset, `tp ${bot} ${start.x} ${start.y} ${start.z}`, `give ${bot} minecraft:iron_axe 1`],
    cleanup: [
      ...reset,
      `fill ${patch} air`,
      `kill @e[type=item,x=${x},y=${STAND},z=${z},distance=..32]`,
      `forceload remove ${loaded}`,
    ],
  };
}

async function runModelCli(ctx) {
  const { model, ollama, modelTimeout, noThinking } = ctx.options;
  const cli = ctx.cli.start([
    '--json',
    'agent',
    GOAL,
    '--model',
    model,
    '--ollama',
    ollama,
    '--model-timeout',
    String(modelTimeout),
    '--minutes',
    String(MINUTES),
    '--verify-collect',
    `oak_log:${QUOTA}`,
    '--verify-home',
    ...(noThinking ? ['--no-thinking'] : []),
  ]);
  const timer = new AbortController();
  try {
    const { code, signal, stdout, stderr } = await Promise.race([
      cli.exited,
      delay(MINUTES * 60_000 + 10_000, null, { signal: AbortSignal.any([ctx.signal, timer.signal]) }).then(() => {
        throw new Error('The model CLI did not exit after its task deadline.');
      }),
    ]);
    if (code !== 0) {
      ctx.note('modelCliOutput', { code, signal, stdout: stdout.slice(-1500), stderr: stderr.slice(-1500) });
      throw new Error(`The model CLI exited with ${signal ?? code}: ${(stderr.trim() || stdout.trim()).slice(-500)}`);
    }
    return JSON.parse(stdout);
  } finally {
    timer.abort();
    await cli.stop();
  }
}

async function runCollection(ctx) {
  const home = await ctx.step('save home with mc-agent set-home', async () => {
    const { code, stdout, stderr } = await ctx.cli.run(['--json', 'set-home']);
    if (code !== 0) throw new Error(`mc-agent set-home failed: ${stderr.trim() || stdout.trim()}`);
    const job = JSON.parse(stdout);
    if (job.status !== 'completed') throw new Error(`mc-agent set-home did not complete: ${job.message}`);
    const { x, y, z } = await ctx.server.position();
    // Fabric saves the player's block position as home.
    return { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) };
  });
  const before = itemTotals(await ctx.server.inventory());
  ctx.note('initial', { home, inventory: before });

  const result = await ctx.step('run mc-agent agent with real Ollama and collection and home criteria', () =>
    runModelCli(ctx),
  );
  const { state, timedOut } = await watchBridge(ctx, {
    timeoutMs: 5000,
    until: (state) => state.connected && state.mode === 'manual' && !state.stopping && state.job?.status !== 'running',
  }).done;
  const inventory = itemTotals(await ctx.server.inventory());
  const position = await ctx.server.position();
  const bridgeInventory = bridgeItemTotals(state.inventory);
  const logsCollected = (inventory[LOG] ?? 0) - (before[LOG] ?? 0);
  const homeDistance = distance(position, home);
  ctx.note('final', { inventory, position, homeDistance, mode: state.mode, stopping: state.stopping, job: state.job });
  ctx.check(
    'real model drove collection and the CLI verified both criteria',
    result.status === 'criteria_met' &&
      result.verification?.checks?.inventory?.met === true &&
      result.verification?.checks?.home?.met === true &&
      result.actionCounts?.collect > 0 &&
      result.model?.requests > 0,
    { status: result.status, verification: result.verification, actions: result.actionCounts, model: result.model },
  );
  ctx.check(
    'server inventory gained eight or more oak logs and agrees with the bridge',
    logsCollected >= QUOTA && sameTotals(inventory, bridgeInventory),
    { logsCollected, inventory, bridgeInventory },
  );
  ctx.check('server position is within two blocks of the saved home', homeDistance <= HOME_RADIUS, {
    position,
    home,
    homeDistance,
  });
  ctx.check('control returned to manual after the CLI exited', !timedOut, {
    connected: state.connected,
    mode: state.mode,
    stopping: state.stopping,
    job: state.job,
  });
}

export const fabricModelScenario = {
  id: 'fabric-collect-model',
  lane: 80,
  backends: ['fabric'],
  requiresModel: true,
  title: 'Real local model via the Fabric CLI: collect eight oak logs and return home',
  release: ['RELEASE.md: fabric-local-model (local model with explicit collection and home criteria)'],
  plan: collectionPlan,
  run: runCollection,
  actions: [
    'mc-agent --json set-home',
    `mc-agent --json agent "${GOAL}" --model <model> --verify-collect oak_log:${QUOTA} --verify-home`,
  ],
  expect: [
    'Ollama requests and a collection action are recorded, and the CLI reports both criteria met',
    'server inventory gains at least eight oak logs, agrees with the bridge, and server Pos returns within two blocks of home',
    'the CLI exits and the bridge is in manual mode with no running or stopping job',
  ],
};
