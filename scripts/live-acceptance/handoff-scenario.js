import { isDeepStrictEqual } from 'node:util';
import { itemTotals, sameTotals } from './nbt-parse.js';
import { laneOrigin, STAND } from './scenarios.js';

const STOCK = { 'minecraft:oak_log': 3, 'minecraft:bread': 2 };

function planHandoff({ bot, lane }) {
  const origin = laneOrigin(lane);
  const { x, z } = origin;
  const start = { x: x + 0.5, y: STAND, z: z + 0.5 };
  return {
    origin,
    points: { start },
    fixture: [],
    prepare: [
      `clear ${bot}`,
      `tp ${bot} ${start.x} ${start.y} ${start.z}`,
      ...Object.entries(STOCK).map(([id, count]) => `give ${bot} ${id} ${count}`),
    ],
    reads: [`data get entity ${bot} UUID`, 'list'],
    cleanup: [],
  };
}

async function readPlayer(ctx, stage) {
  return ctx.step(`server reads after ${stage} joins`, async () => {
    const roster = await ctx.server.command('list');
    const players = /^There are 1 of a max of \d+ players online: (.+)$/.exec(roster);
    const uuid = await ctx.server.uuid();
    const inventory = await ctx.server.inventory();
    if (
      players?.[1] !== ctx.bot ||
      !Array.isArray(uuid) ||
      uuid.length !== 4 ||
      !uuid.every(Number.isInteger) ||
      !Array.isArray(inventory) ||
      !inventory.every(({ Slot }) => Number.isInteger(Slot))
    ) {
      throw new Error(`Invalid server snapshot for ${stage}: ${roster}, UUID ${JSON.stringify(uuid)}.`);
    }
    return { roster, uuid, inventory: [...inventory].sort((a, b) => a.Slot - b.Slot) };
  });
}

async function runHandoff(ctx, _plan, switchSession) {
  const before = await readPlayer(ctx, 'the first Fabric client');
  ctx.check('the first Fabric client has the fixture inventory', sameTotals(itemTotals(before.inventory), STOCK), {
    before,
  });

  await switchSession('bot');
  const bot = await readPlayer(ctx, 'the Mineflayer bot');
  ctx.check('the bot has the same UUID and inventory as the first Fabric client', isDeepStrictEqual(bot, before), {
    bot,
  });

  await switchSession('fabric');
  const after = await readPlayer(ctx, 'the returning Fabric client');
  ctx.check('the returning Fabric client has the original UUID and inventory', isDeepStrictEqual(after, before), {
    after,
  });
}

export const handoffScenario = {
  id: 'handoff-rehearsal',
  lane: 82,
  backends: ['fabric'],
  packagedOnly: true,
  longRunning: true,
  title: 'Rehearse the packaged Fabric → Mineflayer → Fabric handoff offline',
  release: ['RELEASE.md: client → bot → client handoff (offline rehearsal)'],
  plan: planHandoff,
  run: runHandoff,
  actions: [
    'stop the first Fabric client and confirm the server roster is empty before starting Mineflayer',
    'join Mineflayer in offline mode using the same username and read the server-side UUID and inventory',
    'stop Mineflayer and confirm the server roster is empty before relaunching the packaged Fabric client',
  ],
  expect: [
    'the three joins report the same UUID and exact inventory',
    'the server confirms each departure before the next connection',
  ],
};
