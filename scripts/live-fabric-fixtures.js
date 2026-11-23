#!/usr/bin/env node
import { basename, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  createRunDirectory,
  DEFAULT_JAR,
  MINECRAFT_VERSION,
  portIsFree,
  preflight,
  prepareServerDirectory,
  SEED,
  startServer,
  WORLD_SETUP,
} from './live-acceptance/processes.js';
import {
  CRAFT_SEQUENCE,
  readCommands,
  scenarioPlan,
  scenarios,
  STAND,
  storePlan,
} from './live-acceptance/scenarios.js';

const runtime = resolve(import.meta.dirname, '../.runtime/live-fabric-fixtures');

function preparePlayer(player) {
  return [`clear ${player}`, `effect clear ${player}`, `tp ${player} 96.5 ${STAND} 0.5`];
}

function takeoverPlan(player) {
  return {
    fixture: ['forceload add 80 -16 112 16', `fill 92 ${STAND} -1 92 ${STAND + 1} 4 minecraft:oak_log`],
    prepare: [...preparePlayer(player), `effect give ${player} minecraft:mining_fatigue 900 0 true`],
    verify: readCommands(player),
    actions: [
      'mc-agent collect oak_log 8',
      'While mining, try F8, the inventory menu (then close it), or mc-agent stop from a second terminal. Use a fresh run for each.',
      'For lease expiry use mc-agent goto 156 -60 0, run kill -9 <pid> on the controlling CLI mid-walk, and wait 10 seconds.',
      'For expiry, mc-agent job must show manual control and a cancelled goto job with a lease expired message.',
      'For takeover during inference, start a goal with mc-agent agent and a real local model, then press F8 before it answers.',
      'Confirm manual control with mc-agent observe and repeat the independent reads five seconds apart.',
    ],
  };
}

function dimensionPlan(player) {
  // The landing pad is above the Nether roof and away from terrain and mobs.
  const nether = 'execute in minecraft:the_nether';
  const husk = '@e[type=minecraft:husk,tag=fabric_fixture_hostile,limit=1]';
  return {
    fixture: [
      'forceload add 80 -16 112 16',
      `fill 92 ${STAND} -1 92 ${STAND + 1} 2 minecraft:cobblestone`,
      'difficulty normal',
      `fill 95 ${STAND} 8 97 ${STAND + 2} 10 minecraft:glass`,
      `fill 96 ${STAND} 9 96 ${STAND + 1} 9 minecraft:air`,
      `summon minecraft:husk 96.5 ${STAND} 9.5 {NoAI:1b,PersistenceRequired:1b,Tags:["fabric_fixture_hostile"]}`,
      `${nether} run forceload add 0 0 4 4`,
      `${nether} run fill 0 200 0 4 200 4 minecraft:stone`,
    ],
    prepare: [...preparePlayer(player), `give ${player} minecraft:iron_pickaxe 1`],
    verify: [...readCommands(player), `data get entity ${player} Dimension`, `data get entity ${husk} Pos`],
    actions: [
      'mc-agent collect cobblestone 4',
      'Read the player inventory to confirm the cobblestone gain.',
      'mc-agent threats --radius 16',
      'Compare the observed husk and distance with player and husk positions from the server.',
      'mc-agent goto 136 -60 0',
      `While the player is walking, enter ${nether} run tp ${player} 2.5 201 2.5 in the fixture terminal.`,
      'Check mc-agent job for manual control and a cancelled goto job with a dimension changed message.',
      'Repeat the player position and dimension reads five seconds apart.',
    ],
  };
}

function eatingPlan(player) {
  return {
    fixture: ['difficulty normal', 'gamerule naturalRegeneration false'],
    prepare: [...preparePlayer(player), `give ${player} minecraft:bread 8`],
    vitalTarget: { path: 'foodLevel', effect: 'hunger', amplifier: 100, target: 10 },
    verify: [...readCommands(player), `data get entity ${player} foodLevel`, `data get entity ${player} Health`],
    actions: [
      'mc-agent eat',
      'During the eating animation, press F8, open the pause menu, or run mc-agent stop from a second terminal. Use a fresh run for each.',
      'Repeat the food level and inventory reads five seconds apart once control is manual.',
    ],
  };
}

function failedEatingPlan(player) {
  const plan = eatingPlan(player);
  const bread = 'minecraft:bread[food={nutrition:5,saturation:6,eat_seconds:30}]';
  return {
    ...plan,
    prepare: [...preparePlayer(player), `give ${player} ${bread} 8`],
    actions: [
      'mc-agent eat',
      'Record the elapsed time to Eating timed out (about 5 seconds). Check the server food level and bread count against the baseline.',
      'In a fresh run use mc-agent wait 25. From a second terminal, sample mc-agent health about once a second.',
      'Record Eating, Could not eat after about 5 seconds, and the next Eating at least 10 seconds after the failure. Record the wait result and repeat the server food level and inventory reads.',
    ],
  };
}

function unreachableHome() {
  return `fill 94 ${STAND - 1} -2 98 ${STAND + 3} 2 minecraft:bedrock hollow`;
}

function failedEatingRetreatPlan(player) {
  const plan = failedEatingPlan(player);
  return {
    ...plan,
    fixture: [...plan.fixture, 'forceload add 80 -16 128 16'],
    verify: [...plan.verify, `execute if block 98 ${STAND} 0 minecraft:bedrock`],
    actions: [
      'mc-agent set-home',
      `In the fixture terminal, enter tp ${player} 120.5 ${STAND} 0.5, then ${unreachableHome()}.`,
      'mc-agent wait 120',
      `While the wait is running, enter damage ${player} 13 minecraft:generic in the fixture terminal. Read Health to confirm it is at most 8.`,
      'Sample mc-agent health and mc-agent job from a second terminal. Record the failed eating attempt, the start of retreat, and the elapsed time to Survival retreat timed out (about 60 seconds from the retreat start).',
      'Compare the server food level and bread count with the baseline and confirm the bedrock enclosure remained in place. Repeat position reads five seconds apart after the job ends.',
    ],
  };
}

function lowHealthPlan(player) {
  const [poison, clearPoison] = vitalCommands(player, { effect: 'poison', amplifier: 1 });
  return {
    fixture: ['difficulty normal', 'gamerule naturalRegeneration false', 'forceload add 80 -16 128 16'],
    prepare: preparePlayer(player),
    verify: [...readCommands(player), `data get entity ${player} Health`],
    actions: [
      'mc-agent set-home',
      `In the fixture terminal, enter tp ${player} 120.5 ${STAND} 0.5`,
      'mc-agent wait 120',
      'From a second terminal, confirm with mc-agent job that the wait job is running.',
      `Enter ${poison} in the fixture terminal. Read Health until it is at most 8, then enter ${clearPoison}.`,
      'Check for a retreat toward the saved home. In separate runs, press F8 or run mc-agent stop during retreat.',
      'Check mc-agent job and repeat the position reads five seconds apart after interruption.',
    ],
  };
}

function collectionReturnPlan(player) {
  return {
    fixture: ['forceload add 64 -16 112 16', `fill 80 ${STAND} 0 81 ${STAND} 0 minecraft:sand`],
    prepare: [...preparePlayer(player), `give ${player} minecraft:iron_shovel 1`],
    verify: [...readCommands(player), ...[80, 81].map((x) => `execute if block ${x} ${STAND} 0 minecraft:sand`)],
    actions: [
      'mc-agent collect sand 5',
      'Once the job reports returning to where collection started, press F8, open the pause menu, or run mc-agent stop in a second terminal. Use a fresh run for each.',
      'Compare inventory and position after the transition and five seconds later.',
    ],
  };
}

function unreachableReturnPlan(player) {
  const sand = `64 ${STAND} 0`;
  return {
    fixture: ['forceload add 48 -16 112 16', `setblock ${sand} minecraft:sand`],
    prepare: [...preparePlayer(player), `give ${player} minecraft:iron_shovel 1`],
    verify: [
      ...readCommands(player),
      `execute if block ${sand} minecraft:sand`,
      `execute if block 94 ${STAND} 0 minecraft:bedrock`,
    ],
    actions: [
      'mc-agent collect sand 5',
      `Once the server Pos read shows x below 93 and before the player mines the sand, enter ${unreachableHome()} in the fixture terminal.`,
      'Record one sand collected and a failed return to the starting point. Read the inventory, position, and both blocks again to confirm partial progress and the intact enclosure.',
    ],
  };
}

function fullInventoryCollectionPlan(player) {
  const plan = takeoverPlan(player);
  return {
    ...plan,
    prepare: [
      ...preparePlayer(player),
      `effect give ${player} minecraft:mining_fatigue 900 1 true`,
      `give ${player} minecraft:iron_axe 1`,
      `give ${player} minecraft:cobblestone 2176`,
    ],
    actions: [
      'Call minecraft_take_control, then call minecraft_action with {"action":{"type":"collect","block":"oak_log","count":8}}.',
      `While the job is running and before the first log drops, enter give ${player} minecraft:dirt 64 in the fixture terminal.`,
      'Read the inventory and confirm it contains all 64 dirt items before evaluating the result.',
      'Check the inventory-full failure and bounded return, then verify that the original MCP session still accepts actions.',
    ],
  };
}

function withdrawTransferPlan(player, expiry = false) {
  const { fixture, points, reads } = storePlan({ bot: player, lane: 0 }, { storage: 'double' });
  const { x, y, z } = points.chest;
  const seed = (halfZ, stacks) => {
    const logs = Array.from({ length: stacks }, (_, slot) => `{Slot:${slot}b,id:"minecraft:oak_log",count:64}`);
    return `data merge block ${x} ${y} ${halfZ} {Items:[${logs.join(',')}]}`;
  };
  return {
    fixture: [...fixture, ...(expiry ? [seed(z, 27), seed(z - 1, 9)] : [seed(z, 3)])],
    prepare: preparePlayer(player),
    verify: [...readCommands(player, points.chest), ...reads],
    actions: expiry
      ? expiryActions('mc-agent withdraw oak_log', 'Repeat both chest half reads and the player inventory read.')
      : [
          'mc-agent withdraw oak_log',
          'While stacks are moving, press F8, close the storage screen, or run mc-agent stop from a second terminal. Use a fresh run for each.',
          'Repeat both chest half reads and the player inventory read five seconds apart.',
        ],
  };
}

function craftInterruptionPlan(player, expiry = false) {
  return {
    fixture: ['forceload add 80 -16 112 16', `setblock 98 ${STAND} 0 minecraft:crafting_table`],
    prepare: [...preparePlayer(player), `give ${player} minecraft:oak_planks ${expiry ? 512 : 32}`],
    verify: [...readCommands(player), `execute if block 98 ${STAND} 0 minecraft:crafting_table`],
    actions: expiry
      ? expiryActions(
          'mc-agent craft chest 64',
          'Repeat the player inventory read and compare the plank and chest counts.',
        )
      : [
          'mc-agent craft chest 4',
          'While crafting, press F8, close the crafting table screen, or run mc-agent stop from a second terminal. Use a fresh run for each.',
          'Repeat the player inventory read five seconds apart and compare plank and chest counts.',
        ],
  };
}

function expiryActions(command, followUp) {
  return [
    'In the fixture terminal, enter tick rate 5 to give the server-confirmed steps enough time to observe expiry.',
    command,
    'Suspend the controlling CLI (Ctrl+Z) as soon as the first items move. Wait 10 seconds and run mc-agent job from a second terminal.',
    'Record manual control, a cancelled job naming lease expiry, and partial progress. If the job settled before expiry, repeat on a fresh fixture.',
    `${followUp} Resume the old CLI with fg and repeat the reads five seconds later. Confirm nothing else moved and control stayed manual.`,
  ];
}

function depositExpiryPlan(player) {
  const { fixture, prepare, points, reads } = storePlan(
    { bot: player, lane: 0 },
    { storage: 'double', depositLogs: 2304 },
  );
  return {
    fixture,
    prepare,
    verify: [...readCommands(player, points.chest), ...reads],
    actions: expiryActions('mc-agent deposit oak_log', 'Repeat both chest half reads and the player inventory read.'),
  };
}

function blockedDepositPlan(player) {
  const { fixture, prepare, points, hooks } = storePlan({ bot: player, lane: 0 });
  const { x, y, z } = points.chest;
  return {
    fixture: [...fixture, hooks.blockLid],
    prepare,
    verify: [...readCommands(player, points.chest), `execute if block ${x} ${y + 1} ${z} minecraft:stone`],
    actions: [
      'mc-agent deposit oak_log 4',
      'Verify failure to open storage and confirm both the player inventory and chest contents stayed at their baseline counts.',
    ],
  };
}

function scopedInspectionPlan(player) {
  const chest = `98 ${STAND} 0`;
  const barrel = `94 ${STAND} 0`;
  const lid = `98 ${STAND + 1} 0`;
  return {
    fixture: [
      'forceload add 80 -16 112 16',
      `setblock ${chest} minecraft:chest[facing=west]`,
      `setblock ${barrel} minecraft:barrel[facing=up]`,
    ],
    prepare: [...preparePlayer(player), `give ${player} minecraft:oak_log 16`],
    verify: [
      ...readCommands(player),
      `data get block ${chest} Items`,
      `data get block ${barrel} Items`,
      `execute if block ${lid} minecraft:stone`,
    ],
    actions: [
      `In the fixture terminal, enter tp ${player} 97.5 ${STAND} 0.5, then run mc-agent deposit oak_log 8.`,
      `In the fixture terminal, enter tp ${player} 95.5 ${STAND} 0.5, then run mc-agent deposit oak_log 8.`,
      `In the fixture terminal, enter data modify block ${barrel} Items[0].count set value 2, then setblock ${lid} minecraft:stone. Repeat the server reads.`,
      `In the fixture terminal, enter tp ${player} 84.5 ${STAND} 0.5 and record Pos. This is 10 blocks from the barrel.`,
      `mc-agent inspect-storage --container 94,${STAND},0`,
      'Read Pos while the player walks to the barrel. Confirm the scoped inspection succeeded, mc-agent observe shows two logs in the barrel, and the final Pos is within 1.75 blocks of the inspection start.',
      `mc-agent inspect-storage --container 98,${STAND},0`,
      'Verify the blocked chest refresh fails. Repeat the server reads and keep the failed inspection result with the last-observed storage snapshot.',
    ],
  };
}

function mcpCollectionPlan(player) {
  const log = `98 ${STAND} 0`;
  return {
    fixture: ['forceload add 80 -16 112 16', `setblock ${log} minecraft:oak_log`],
    prepare: [...preparePlayer(player), `give ${player} minecraft:iron_axe 1`],
    verify: [...readCommands(player), `execute if block ${log} minecraft:oak_log`],
    actions: [
      'In an actual MCP client connected to mc-agent mcp, ask the agent to observe, take control, collect one oak log, and stop.',
      'Record minecraft_observe, minecraft_take_control, minecraft_action with {"action":{"type":"collect","block":"oak_log","count":1}}, and minecraft_stop.',
      'After the stop, record one oak log and manual mode from mc-agent observe. Confirm the log in the server inventory and check that the original block is gone.',
    ],
  };
}

function deathPlan(player) {
  return {
    fixture: ['gamerule keepInventory true', 'forceload add 80 -16 144 16'],
    prepare: preparePlayer(player),
    verify: [...readCommands(player), `data get entity ${player} Health`],
    actions: [
      `mc-agent goto 136 ${STAND} 0`,
      `While the character is walking, enter kill ${player} in the fixture terminal.`,
      'Check that mc-agent job reports manual control and the navigation job cancelled due to death.',
      'Respawn manually and verify that the old job stays cancelled. Repeat position reads five seconds apart.',
    ],
  };
}

function disconnectPlan(player) {
  const plan = takeoverPlan(player);
  return {
    ...plan,
    actions: [
      'mc-agent collect oak_log 8',
      `While mining, enter kick ${player} Fixture disconnect in the fixture terminal.`,
      'Check manual control and the disconnected job at the title screen.',
      'Rejoin the same server, check that the old job does not resume, then compare position and inventory reads five seconds apart.',
    ],
  };
}

const fixtures = {
  takeover: { build: takeoverPlan },
  'cobblestone-hostiles-dimension': { build: dimensionPlan },
  pit: {
    botScenario: 'recovery-timeout',
    actions: [
      'mc-agent set-home',
      'mc-agent collect oak_log 64',
      'Record partial progress and the attempt to return to the starting ledge. Compare the job outcome with the initial and final server inventory and position.',
    ],
  },
  'deposit-return': {
    botScenario: 'inspect-preserves-home',
    variations: ['removeStep'],
    actions: [
      'mc-agent set-home',
      'mc-agent deposit oak_log 8',
      'mc-agent home',
      'mc-agent inspect-storage',
      'Check the player position against the saved home.',
    ],
  },
  withdraw: { botScenario: 'withdraw', actions: ['mc-agent withdraw oak_log 8'] },
  'withdraw-omitted': { botScenario: 'withdraw-omitted', actions: ['mc-agent withdraw oak_log'] },
  'withdraw-no-candidate': { botScenario: 'withdraw-no-candidate', actions: ['mc-agent withdraw oak_log 8'] },
  'withdraw-short-stock': { botScenario: 'withdraw-short-stock', actions: ['mc-agent withdraw oak_log 24'] },
  'withdraw-full-inventory': { botScenario: 'withdraw-full-inventory', actions: ['mc-agent withdraw oak_log 8'] },
  'craft-bootstrap': {
    botScenario: 'craft-bootstrap',
    actions: CRAFT_SEQUENCE.map(([item, count]) => `mc-agent craft ${item} ${count}`),
  },
  'craft-missing-ingredients': { botScenario: 'craft-missing-ingredients', actions: ['mc-agent craft oak_planks 12'] },
  'craft-full-inventory': { botScenario: 'craft-full-inventory', actions: ['mc-agent craft oak_planks 4'] },
  'withdraw-craft-model': {
    botScenario: 'withdraw-craft-model',
    actions: [
      'mc-agent models',
      'mc-agent agent "Withdraw exactly four cobblestone from the nearby chest. Craft one stone pickaxe with three of them and your two sticks at the nearby crafting table. Keep the fourth cobblestone and report done." --model YOUR_LOCAL_MODEL --verify-withdraw cobblestone:1 --verify-craft stone_pickaxe:1',
      'Check for criteria_met and confirm manual control with mc-agent observe. Read the chest and player inventory again. The chest should hold 20 oak logs and one cobblestone. The player should hold one stone pickaxe and one cobblestone.',
    ],
  },
  'mcp-collection': { build: mcpCollectionPlan },
  'deposit-chest': {
    storage: 'chest',
    variations: ['removeStored', 'blockLid'],
    actions: [
      'mc-agent deposit oak_log 8',
      'mc-agent inspect-storage',
      'For a fresh run with omitted count, use mc-agent deposit oak_log.',
    ],
  },
  'deposit-barrel': {
    storage: 'barrel',
    actions: ['mc-agent deposit oak_log 8', 'For a fresh run with omitted count, use mc-agent deposit oak_log.'],
  },
  'deposit-full-chest': { storage: 'full', actions: ['mc-agent deposit oak_log 8'] },
  'deposit-blocked-chest': { build: blockedDepositPlan },
  'deposit-double-chest': {
    storage: 'double',
    actions: [
      'mc-agent deposit oak_log',
      'While stacks are moving, press F8, close the storage screen, or run mc-agent stop from a second terminal. Use a fresh run for each.',
      'Read both chest halves and the player inventory after the transfer or a takeover. Repeat after five seconds.',
    ],
  },
  'deposit-expiry': { build: depositExpiryPlan },
  'inspect-scoped-storage': { build: scopedInspectionPlan },
  'eat-interruption': { build: eatingPlan },
  'eat-timeout': { build: failedEatingPlan },
  'low-health-retreat': { build: lowHealthPlan },
  'eat-retreat-timeout': { build: failedEatingRetreatPlan },
  'collection-return': { build: collectionReturnPlan },
  'collection-unreachable-return': { build: unreachableReturnPlan },
  'collect-full-inventory': { build: fullInventoryCollectionPlan },
  'withdraw-multi-stack': { build: withdrawTransferPlan },
  'withdraw-expiry': { build: (player) => withdrawTransferPlan(player, true) },
  'craft-interruption': { build: craftInterruptionPlan },
  'craft-expiry': { build: (player) => craftInterruptionPlan(player, true) },
  'death-navigation': { build: deathPlan },
  'disconnect-mining': { build: disconnectPlan },
};
const fixtureIds = Object.keys(fixtures);
const usage = `Usage:
  npm run acceptance:fabric-fixtures -- --dry-run [--scenario ID] [--player NAME]
  npm run acceptance:fabric-fixtures -- --scenario ID --player NAME --accept-eula [--port N] [--java PATH] [--server-jar PATH]
Fixtures: ${fixtureIds.join(', ')}`;

export function parseOptions(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      scenario: { type: 'string' },
      player: { type: 'string' },
      'dry-run': { type: 'boolean' },
      'accept-eula': { type: 'boolean' },
      port: { type: 'string' },
      java: { type: 'string' },
      'server-jar': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const { scenario, player, help, java = 'java', 'dry-run': dryRun } = values;
  if (scenario !== undefined && !fixtureIds.includes(scenario))
    throw new Error(`Unknown fixture ${JSON.stringify(scenario)}.`);
  if (player !== undefined && !/^[A-Za-z0-9_]{3,16}$/.test(player))
    throw new Error('--player must be a 3–16 character Minecraft username.');
  if (!help && !dryRun && (!scenario || !player))
    throw new Error('Live setup requires --scenario ID and --player NAME.');
  const port = Number(values.port ?? 25567);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('--port must be an integer from 1024 to 65535.');
  return {
    scenario,
    player: player ?? 'FabricTester',
    help,
    dryRun,
    acceptEula: values['accept-eula'],
    jar: resolve(values['server-jar'] ?? DEFAULT_JAR),
    java: basename(java) === java ? java : resolve(java),
    port,
  };
}

export function fixturePlan(id, player) {
  const { build, storage, botScenario, actions, variations = [] } = fixtures[id];
  if (build) return { id, variations, ...build(player) };
  const plan = storage
    ? storePlan({ bot: player, lane: 0 }, { storage, depositLogs: 192 })
    : scenarioPlan(
        scenarios.find((scenario) => scenario.id === botScenario),
        { bot: player },
      );
  const { fixture, prepare, points, reads = [], hooks } = plan;
  return {
    id,
    fixture,
    prepare,
    verify: plan.verify ?? [...readCommands(player, points.chest), ...reads],
    variations: variations.map((name) => hooks[name]),
    actions,
  };
}

function vitalCommands(player, { effect, amplifier }) {
  return [
    `effect give ${player} minecraft:${effect} 20 ${amplifier} true`,
    `effect clear ${player} minecraft:${effect}`,
  ];
}

function formatFixture({ id, fixture, prepare, actions: commands, verify, variations, vitalTarget }, player) {
  const section = (title, lines) => [title, ...lines.map((line) => `  ${line}`)];
  const [apply, clear] = vitalTarget ? vitalCommands(player, vitalTarget) : [];
  return [
    `[${id}]`,
    ...section('World fixture (server console)', fixture),
    ...section("Player setup after joining (server console; clears this player's inventory)", prepare),
    ...(vitalTarget
      ? [`  ${apply}`, `  Wait for ${vitalTarget.path} to reach ${vitalTarget.target}, then enter ${clear}`]
      : []),
    ...section('Manual actions (CLI terminal)', commands),
    ...section('Independent reads (server console; repeat after the action or interruption)', verify),
    ...(variations.length
      ? section('Optional changes for separate verification cases (server console)', variations)
      : []),
  ].join('\n');
}

const itemRead = /^data get block (-?\d+) (-?\d+) (-?\d+) Items$/;
async function lowerVital(console, player, vitalTarget, signal) {
  const { path, target } = vitalTarget;
  const [apply, clear] = vitalCommands(player, vitalTarget);
  await console.command(apply, { signal });
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if ((await console.entityData(player, path, { signal })) <= target) {
      await console.command(clear, { signal });
      return;
    }
    await delay(250, undefined, { signal });
  }
  throw new Error(`${path} did not fall to ${target} during player setup.`);
}

async function startFixture(options, plan) {
  preflight(options);
  if (!(await portIsFree(options.port)))
    throw new Error(`Port ${options.port} on 127.0.0.1 is in use. Pass --port to select another port.`);
  const directory = join(await createRunDirectory(runtime), 'server');
  await prepareServerDirectory({ ...options, directory, seed: SEED });
  console.log(`Server log: ${join(directory, 'server.out')}`);
  const server = startServer({ directory, java: options.java });
  const input = createInterface({ input: process.stdin });
  const controller = new AbortController();
  const { signal } = controller;
  const stop = () => controller.abort(new Error('Fixture session ended.'));
  input.once('close', stop);
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  try {
    await server.console.ready({ signal });
    if (server.console.version !== MINECRAFT_VERSION) {
      throw new Error(
        `Expected Minecraft ${MINECRAFT_VERSION}, found ${server.console.version ?? 'an unknown version'}.`,
      );
    }
    for (const command of [...WORLD_SETUP, ...plan.fixture]) await server.console.command(command, { signal });
    console.log(`Join 127.0.0.1:${options.port} as ${options.player} using the packaged Fabric profile.`);
    await server.console.waitFor((line) => line === `${options.player} joined the game`, {
      history: true,
      label: `${options.player} to join`,
      signal,
      timeoutMs: 300_000,
    });
    for (const command of plan.prepare) await server.console.command(command, { signal });
    if (plan.vitalTarget) await lowerVital(server.console, options.player, plan.vitalTarget, signal);
    console.log('Independent baseline reads');
    for (const command of plan.verify) {
      const coords = itemRead.exec(command);
      const value = coords
        ? JSON.stringify(
            await server.console.blockData(Number(coords[1]), Number(coords[2]), Number(coords[3]), 'Items', {
              signal,
            }),
          )
        : await server.console.command(command, { signal });
      console.log(`  ${command}\n    ${value}`);
    }
    console.log(
      `\n${formatFixture(plan, options.player)}\nFixture ready. Enter server console commands here. Ctrl+C, end of input, or stop ends the session.`,
    );
    server.console.on('line', (line) => console.log(line));
    input.on('line', (line) => {
      if (line.trim()) server.console.write(`${line.trim().replace(/^\//, '')}\n`);
    });
    await Promise.race([
      new Promise((done) => {
        if (signal.aborted) done();
        else signal.addEventListener('abort', done, { once: true });
      }),
      server.exited.then(({ code, signal: exitSignal }) => {
        if (code !== 0) throw new Error(`Server exited (${exitSignal ?? code}).`);
      }),
    ]);
  } finally {
    input.close();
    try {
      await server.stop();
    } finally {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
    }
  }
}

async function main() {
  try {
    const options = parseOptions(process.argv.slice(2));
    if (options.help) {
      console.log(usage);
    } else if (options.dryRun) {
      const ids = options.scenario ? [options.scenario] : fixtureIds;
      console.log(
        `Fabric fixture dry run for ${options.player}\nWorld settings:\n  ${WORLD_SETUP.join('\n  ')}\n\n${ids.map((id) => formatFixture(fixturePlan(id, options.player), options.player)).join('\n\n')}`,
      );
    } else {
      console.log('Disposable offline server on loopback. Setup clears the named player’s inventory in this world.');
      await startFixture(options, fixturePlan(options.scenario, options.player));
    }
  } catch (error) {
    console.error(`Error: ${error.message}\n${usage}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
