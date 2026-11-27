import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { bridgeItemTotals, distance, itemTotals, sameTotals } from './nbt-parse.js';
import { CLI } from './processes.js';
import { laneOrigin, LOG, STAND } from './scenarios.js';

const AXE = 'minecraft:iron_axe';

function planMcpCollection({ bot, lane }) {
  const origin = laneOrigin(lane);
  const { x, z } = origin;
  const start = { x: x + 0.5, y: STAND, z: z + 0.5 };
  const log = { x: x + 2, y: STAND, z };
  const logCoords = `${log.x} ${log.y} ${log.z}`;
  const laneChunks = `${x - 16} ${z - 16} ${x + 16} ${z + 16}`;
  const reset = [`clear ${bot}`, `effect clear ${bot}`];
  return {
    origin,
    points: { start, log },
    marker: { ...log, name: LOG },
    fixture: [`forceload add ${laneChunks}`, `setblock ${logCoords} ${LOG}`],
    prepare: [...reset, `tp ${bot} ${start.x} ${start.y} ${start.z}`, `give ${bot} ${AXE} 1`],
    reads: [`execute if block ${logCoords} ${LOG}`, `execute if block ${logCoords} minecraft:air`],
    cleanup: [
      ...reset,
      `setblock ${logCoords} minecraft:air`,
      `kill @e[type=item,x=${x},y=${STAND},z=${z},distance=..32]`,
      `forceload remove ${laneChunks}`,
    ],
  };
}

function observedPlayer(state) {
  return {
    name: state.player?.name,
    mode: state.mode,
    stopping: state.stopping,
    jobStatus: state.job?.status ?? null,
    position: state.player?.position,
    inventory: bridgeItemTotals(state.inventory),
  };
}

function manualIdle({ mode, stopping, jobStatus }) {
  return mode === 'manual' && stopping === false && jobStatus !== 'running';
}

async function runMcpCollection(ctx, { points: { log } }) {
  const client = new Client({ name: 'minecraft-fabric-precheck', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [CLI, '--bridge', ctx.bridgePath, 'mcp'],
    stderr: 'pipe',
  });
  let stderr = '';
  transport.stderr?.on('data', (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-3000);
  });
  const call = async (name, args = {}, timeout = 15_000) => {
    const result = await client.callTool({ name, arguments: args }, undefined, { signal: ctx.signal, timeout });
    const content = result.content?.[0];
    if (content?.type !== 'text') throw new Error(`${name} did not return JSON text.`);
    const value = JSON.parse(content.text);
    if (result.isError) throw new Error(`${name} failed: ${value.error ?? content.text}`);
    return value;
  };

  const before = await ctx.step('read baseline inventory, position and log block from the server', async () => ({
    inventory: itemTotals(await ctx.server.inventory()),
    position: await ctx.server.position(),
    logPresent: await ctx.server.testBlock(log, LOG),
  }));
  ctx.check('server starts with the axe and log', before.logPresent && sameTotals(before.inventory, { [AXE]: 1 }), {
    before,
  });
  try {
    await ctx.step('connect a scripted MCP client to mc-agent mcp over stdio', () =>
      client.connect(transport, { signal: ctx.signal, timeout: 15_000 }),
    );
    const initial = await ctx.step('MCP: observe the current player before taking control', async () =>
      observedPlayer(await call('minecraft_observe')),
    );
    ctx.check(
      'MCP observes the same player and leaves control manual',
      manualIdle(initial) &&
        initial.name === ctx.bot &&
        !!initial.position &&
        distance(initial.position, before.position) <= 1 &&
        sameTotals(initial.inventory, before.inventory),
      { initial, server: before },
    );

    const takeover = await ctx.step('MCP: explicitly take control', () => call('minecraft_take_control'));
    const { mode } = await ctx.step('confirm takeover from a separate bridge connection', () => ctx.bridge.observe());
    ctx.check('MCP acquired agent control', takeover.controlled === true && mode === 'agent', { takeover, mode });
    const action = await ctx.step('MCP: collect one oak log', () =>
      call('minecraft_action', { action: { type: 'collect', block: 'oak_log', count: 1 } }, 245_000),
    );
    ctx.check('MCP collection completed', action.status === 'completed', { action });

    const stop = await ctx.step('MCP: stop and hand control back', () => call('minecraft_stop'));
    const final = await ctx.step('MCP: observe after stop while the stdio session is still open', async () =>
      observedPlayer(await call('minecraft_observe')),
    );
    const handback = await ctx.step('confirm handback from a separate bridge connection', async () =>
      observedPlayer(await ctx.bridge.observe()),
    );
    ctx.check(
      'MCP stop returned idle manual control',
      stop.controlled === false && manualIdle(final) && manualIdle(handback),
      { stop, final, handback },
    );

    const after = await ctx.step('read final inventory and check the original log block from the server', async () => ({
      inventory: itemTotals(await ctx.server.inventory()),
      logGone: await ctx.server.testBlock(log, 'minecraft:air'),
    }));
    ctx.check(
      'server confirms the log was mined and is in inventory',
      after.logGone &&
        sameTotals(after.inventory, { [AXE]: 1, [LOG]: 1 }) &&
        sameTotals(final.inventory, after.inventory),
      { after, mcpInventory: final.inventory },
    );
  } finally {
    await client.close();
    if (stderr.trim()) ctx.note('mcpStderr', stderr.trim());
  }
}

export const fabricMcpScenario = {
  id: 'fabric-collect-mcp',
  lane: 81,
  backends: ['fabric'],
  title: 'Scripted MCP client observes, takes control, collects an oak log, and stops',
  release: ['RELEASE.md: packaged Fabric MCP gate (scripted client rehearsal; an actual MCP agent is still required)'],
  plan: planMcpCollection,
  run: runMcpCollection,
  actions: [
    'connect a scripted MCP client to mc-agent mcp over stdio',
    'minecraft_observe → minecraft_take_control → minecraft_action (collect oak_log 1)',
    'minecraft_stop → minecraft_observe while stdio is open',
  ],
  expect: [
    'the observation describes the live player, the takeover succeeds, and collection completes',
    'the server inventory gains one oak log, the original block becomes air, and MCP observes the same inventory',
    'stop returns the player to manual control with no active job before the MCP client closes',
  ],
};
