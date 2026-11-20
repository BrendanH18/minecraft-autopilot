// Shared lifecycle scenarios: one table of control transitions, executed against the Harness with the demo and
// mocked Mineflayer drivers (test/lifecycle-scenarios.test.js) and rendered as the manual Fabric checklist in
// docs/LIFECYCLE-SCENARIOS.md. Expectations are backend-neutral; message patterns are case-insensitive regex sources
// that the Harness and the Fabric controller messages both satisfy.

const deep = (value) => {
  for (const child of Object.values(value)) if (child && typeof child === 'object') deep(child);
  return Object.freeze(value);
};

export const BACKENDS = Object.freeze(['demo', 'mineflayer', 'fabric']);

export const TRANSITIONS = deep({
  f8: 'The player presses F8 (the takeover binding), also while a screen is open.',
  menu: 'The player opens or closes a game screen (pause menu, inventory, or the storage or crafting screen the agent opened).',
  stop: 'Emergency stop: `/v1/stop` (`mc-agent stop`, `minecraft_stop`) from any process.',
  cancel: 'Agent cancel: `/v1/cancel` (`minecraft_cancel`) with the session lease; control is kept.',
  expiry: 'Lease expiry: the controlling process stops heartbeating for the 8 s lease.',
  disconnect: 'The connection to the world or server ends.',
  death: 'The player dies.',
  dimension: 'The world, player, or dimension changes under the session.',
  'takeover-while-stopping':
    'Control is taken back and a new session is requested before the interrupted native work has settled.',
  'inventory-full':
    'The inventory runs out of room for the collection target: no empty main slot and no partial stack of it with space.',
});

export const ACTIVITIES = deep({
  idle: 'Control held with no job running (the agent is waiting for model inference).',
  goto: 'Navigating to a coordinate.',
  collect: 'Mining blocks for a collection quota.',
  'collect-recovery': 'Returning to the collection start after mining ended (deadline or failure).',
  eat: 'Equipping and consuming food.',
  deposit: 'Moving stacks into a chest or barrel.',
  withdraw: 'Taking stacks out of a chest or barrel.',
  craft: 'Repeating a crafting recipe in the inventory grid or at a crafting table.',
  wait: 'A timed wait.',
});

// What must not happen after the transition takes effect, and how to see it without trusting the agent.
export const HALTS = deep({
  movement: { text: 'no further movement', observe: 'two `data get entity <player> Pos` reads 5 s apart match' },
  mining: {
    text: 'no further blocks broken',
    observe: '`data get entity <player> Inventory` item counts stay the same 5 s apart',
  },
  consumption: {
    text: 'no food consumed after the transition',
    observe: '`data get entity <player> Inventory` keeps the food count and `foodLevel` does not rise',
  },
  deposit: {
    text: 'no further items moved into the container',
    observe: '`data get block <x> <y> <z> Items` reads 5 s apart match',
  },
  withdraw: {
    text: 'no further items taken from the container',
    observe: '`data get block <x> <y> <z> Items` reads 5 s apart match',
  },
  crafting: {
    text: 'no further crafts',
    observe: '`data get entity <player> Inventory` item counts stay the same 5 s apart',
  },
});

const M = {
  stop: 'Emergency stop requested',
  cancel: 'Cancelled by agent',
  expiry: 'lease expired',
  death: 'died',
  disconnect: 'Disconnected',
  dimension: 'dimension changed',
  f8: 'Control returned to the player with (F8|the takeover binding)',
  menu: 'game menu was opened',
  storageScreen: 'Storage screen was closed or replaced',
  craftingScreen: '(?:Storage|Crafting(?: table)?) screen was closed or replaced',
  inventoryFull: 'Inventory full; collected \\d+ of \\d+ \\w+\\.',
};
const NEW_SESSION = { lease: 'new' };
const released = (message, halts, extra = {}) => ({
  mode: 'manual',
  job: message ? { status: 'cancelled', message } : null,
  halts,
  stoppingWindow: false,
  next: NEW_SESSION,
  ...extra,
});
const ALL = { automated: ['demo', 'mineflayer'], manual: ['fabric'] };
const FABRIC_ONLY = (reason) => ({ automated: [], manual: ['fabric'], gaps: { demo: reason, mineflayer: reason } });
const NO_INPUT = 'No in-game player input on this backend; `stop` scenarios cover its takeover path.';
const NO_RECOVERY = 'DemoDriver collection has no mining phase or return trip to interrupt.';
const NO_WORLD =
  'DemoDriver is always connected to one fixed world and has no identity(); the Harness check is covered by mineflayer.';
const NO_STOPPING_EAT =
  'Fabric ends eating on the client thread during release, so eating leaves no stopping window to take over into.';

const SCENARIOS = [
  // Fabric-only player input during inference, mining, eating, return, and storage transfers.
  {
    id: 'f8-idle',
    title: 'F8 while the agent waits for model inference',
    transition: 'f8',
    interrupts: 'idle',
    ...FABRIC_ONLY(NO_INPUT),
    expect: released(null, ['movement']),
    fabric: {
      setup: 'Start `mc-agent agent "<goal>" --model <model>` and wait for it to request a model decision.',
      action: 'Press F8 before the model answers.',
      observe:
        'The agent CLI reports that control returned to the player and runs no action after the model answers; `mc-agent job` shows `manual`.',
    },
  },
  {
    id: 'f8-collect',
    title: 'F8 while mining for a collection quota',
    transition: 'f8',
    interrupts: 'collect',
    ...FABRIC_ONLY(NO_INPUT),
    expect: released(M.f8, ['mining', 'movement']),
    fabric: {
      setup: 'Stand near trees and run `mc-agent collect oak_log 8`.',
      action: 'Press F8 while a log is being broken.',
      observe: 'Count logs with `data get entity <player> Inventory` at F8 and 5 s later.',
    },
  },
  {
    id: 'f8-eat',
    title: 'F8 while eating',
    transition: 'f8',
    interrupts: 'eat',
    ...FABRIC_ONLY(NO_INPUT),
    expect: released(M.f8, ['consumption']),
    fabric: {
      setup:
        'Lower food to about 10 (`/effect give <player> minecraft:hunger 10 100`, then `/effect clear <player>`); hold bread. Run `mc-agent eat`.',
      action: 'Press F8 during the eating animation (about 1.6 s). Repeat if the food was eaten before F8.',
      observe: 'Bread count and `data get entity <player> foodLevel` before the command and 5 s after F8.',
    },
  },
  {
    id: 'f8-collect-recovery',
    title: 'F8 while returning from a collection',
    transition: 'f8',
    interrupts: 'collect-recovery',
    ...FABRIC_ONLY(NO_INPUT),
    expect: released(M.f8, ['movement', 'mining']),
    fabric: {
      setup:
        'Place two sand blocks about 8 blocks away and run `mc-agent collect sand 5`, so collection fails and returns.',
      action: 'Press F8 once `mc-agent job` reports "returning to where collection started".',
      observe: 'Position reads 5 s apart; no blocks broken while the return was digging out.',
    },
  },
  {
    id: 'f8-deposit',
    title: 'F8 between deposit stacks',
    transition: 'f8',
    interrupts: 'deposit',
    ...FABRIC_ONLY(NO_INPUT),
    expect: released(M.f8, ['deposit']),
    fabric: {
      setup:
        'Hold at least three stacks of logs within 16 blocks of an empty double chest; run `mc-agent deposit oak_log`.',
      action: 'Press F8 while the chest screen is open and stacks are moving.',
      observe: 'Chest `Items` and player `Inventory` reads 5 s apart.',
    },
  },
  {
    id: 'menu-idle',
    title: 'Pause menu during inference, then close it',
    transition: 'menu',
    interrupts: 'idle',
    ...FABRIC_ONLY(NO_INPUT),
    expect: released(null, ['movement']),
    fabric: {
      setup: 'Start `mc-agent agent "<goal>" --model <model>` and wait for a model decision.',
      action: 'Press Escape, wait for the model to answer, then close the menu.',
      expected: 'Closing the menu does not resume the session.',
      observe: '`mc-agent job` after closing the menu; position reads 5 s apart.',
    },
  },
  {
    id: 'menu-collect',
    title: 'Inventory screen while mining, then close it',
    transition: 'menu',
    interrupts: 'collect',
    ...FABRIC_ONLY(NO_INPUT),
    expect: released(M.menu, ['mining', 'movement']),
    fabric: {
      setup: 'Run `mc-agent collect oak_log 8` near trees.',
      action: 'Press E while a log is being broken, wait 3 s, then close the inventory.',
      expected: 'Closing the screen does not resume mining.',
      observe: 'Inventory and position reads 5 s after closing.',
    },
  },
  {
    id: 'menu-eat',
    title: 'Pause menu while eating, then close it',
    transition: 'menu',
    interrupts: 'eat',
    ...FABRIC_ONLY(NO_INPUT),
    expect: released(M.menu, ['consumption']),
    fabric: {
      setup: 'Lower food to about 10 as in the F8 eating check; run `mc-agent eat`.',
      action: 'Press Escape during the eating animation, then close the menu.',
      expected: 'Closing the menu does not resume eating.',
      observe: 'Bread count and `foodLevel` before the command and after closing the menu.',
    },
  },
  {
    id: 'menu-collect-recovery',
    title: 'Pause menu during the collection return, then close it',
    transition: 'menu',
    interrupts: 'collect-recovery',
    ...FABRIC_ONLY(NO_INPUT),
    expect: released(M.menu, ['movement', 'mining']),
    fabric: {
      setup: 'Set up the failing sand collection from the F8 return check.',
      action: 'Press Escape during "returning to where collection started", then close the menu.',
      expected: 'Closing the menu does not resume the return.',
      observe: 'Position reads 5 s apart after closing.',
    },
  },
  {
    id: 'menu-storage-close',
    title: 'Player closes the storage screen the agent opened',
    transition: 'menu',
    interrupts: 'deposit',
    ...FABRIC_ONLY(NO_INPUT),
    expect: released(M.storageScreen, ['deposit']),
    fabric: {
      setup: 'Run `mc-agent deposit oak_log` with three stacks held and a chest nearby.',
      action: 'Press Escape while the agent has the chest screen open.',
      observe: 'Chest `Items` reads 5 s apart.',
    },
  },
  {
    id: 'f8-withdraw',
    title: 'F8 between withdraw stacks',
    transition: 'f8',
    interrupts: 'withdraw',
    ...FABRIC_ONLY(NO_INPUT),
    expect: released(M.f8, ['withdraw']),
    fabric: {
      setup:
        'Fill a double chest within 16 blocks with at least three stacks of logs (`/give` them, then `mc-agent deposit oak_log`); run `mc-agent withdraw oak_log`.',
      action: 'Press F8 while the chest screen is open and stacks are moving.',
      observe: 'Chest `Items` and player `Inventory` reads 5 s apart.',
    },
  },
  {
    id: 'menu-storage-close-withdraw',
    title: 'Player closes the storage screen a withdrawal opened',
    transition: 'menu',
    interrupts: 'withdraw',
    ...FABRIC_ONLY(NO_INPUT),
    expect: released(M.storageScreen, ['withdraw']),
    fabric: {
      setup: 'Run `mc-agent withdraw oak_log` beside a chest holding three stacks of logs.',
      action: 'Press Escape while the agent has the chest screen open.',
      observe: 'Chest `Items` reads 5 s apart.',
    },
  },
  {
    id: 'f8-craft',
    title: 'F8 between crafts',
    transition: 'f8',
    interrupts: 'craft',
    ...FABRIC_ONLY(NO_INPUT),
    expect: released(M.f8, ['crafting']),
    fabric: {
      setup: 'Hold 32 planks within 16 blocks of a crafting table; run `mc-agent craft chest 4`.',
      action: 'Press F8 while the crafting table screen is open and chests are being crafted.',
      observe: 'Plank and chest counts in `data get entity <player> Inventory` at F8 and 5 s later.',
    },
  },
  {
    id: 'menu-crafting-close',
    title: 'Player closes the crafting table screen the agent opened',
    transition: 'menu',
    interrupts: 'craft',
    ...FABRIC_ONLY(NO_INPUT),
    expect: released(M.craftingScreen, ['crafting']),
    fabric: {
      setup: 'Hold 32 planks within 16 blocks of a crafting table; run `mc-agent craft chest 4`.',
      action: 'Press Escape while the agent has the crafting table screen open.',
      expected: 'Closing the screen does not resume crafting.',
      observe: 'Plank and chest counts 5 s after closing.',
    },
  },

  // Shared transitions automated against the Harness.
  {
    id: 'stop-idle',
    title: 'Emergency stop while idle',
    transition: 'stop',
    interrupts: 'idle',
    ...ALL,
    expect: released(null, ['movement']),
    fabric: {
      setup: 'Acquire control with `mc-agent agent` waiting for a model decision.',
      action: 'Run `mc-agent stop` from a second terminal.',
      observe: 'The agent CLI reports that control returned to the player; `mc-agent job` shows `manual`.',
    },
  },
  {
    id: 'stop-goto',
    title: 'Emergency stop during navigation',
    transition: 'stop',
    interrupts: 'goto',
    ...ALL,
    expect: released(M.stop, ['movement']),
    fabric: {
      setup: 'Run `mc-agent goto <x> <y> <z>` about 40 blocks away.',
      action: 'Run `mc-agent stop` from a second terminal mid-walk.',
      observe: 'Position reads 5 s apart.',
    },
  },
  {
    id: 'stop-collect',
    title: 'Emergency stop while mining',
    transition: 'stop',
    interrupts: 'collect',
    ...ALL,
    expect: released(M.stop, ['mining', 'movement']),
    fabric: {
      setup: 'Run `mc-agent collect oak_log 8` near trees.',
      action: 'Run `mc-agent stop` while a log is being broken.',
      observe: 'Log count and position 5 s apart.',
    },
  },
  {
    id: 'stop-collect-recovery',
    title: 'Emergency stop during recovery after a mining timeout',
    transition: 'stop',
    interrupts: 'collect-recovery',
    automated: ['mineflayer'],
    manual: ['fabric'],
    gaps: { demo: NO_RECOVERY },
    expect: released(M.stop, ['movement', 'mining']),
    fabric: {
      setup:
        'Set up the failing sand collection from the F8 return check (Fabric returns after a failure or its 180 s mining deadline).',
      action: 'Run `mc-agent stop` during "returning to where collection started".',
      expected: 'The return does not fall back to digging after the stop.',
      observe: 'Position and nearby blocks 5 s apart.',
    },
  },
  {
    id: 'stop-deposit',
    title: 'Emergency stop between deposit stacks',
    transition: 'stop',
    interrupts: 'deposit',
    ...ALL,
    expect: released(M.stop, ['deposit']),
    fabric: {
      setup: 'Run `mc-agent deposit oak_log` with three stacks held and an empty double chest nearby.',
      action: 'Run `mc-agent stop` while stacks are moving.',
      observe: 'Chest `Items` reads 5 s apart.',
    },
  },
  {
    id: 'stop-withdraw',
    title: 'Emergency stop between withdraw stacks',
    transition: 'stop',
    interrupts: 'withdraw',
    ...ALL,
    expect: released(M.stop, ['withdraw']),
    fabric: {
      setup: 'Run `mc-agent withdraw oak_log` beside a double chest holding at least three stacks of logs.',
      action: 'Run `mc-agent stop` while stacks are moving.',
      observe: 'Chest `Items` reads 5 s apart.',
    },
  },
  {
    id: 'stop-craft',
    title: 'Emergency stop between crafts',
    transition: 'stop',
    interrupts: 'craft',
    ...ALL,
    expect: released(M.stop, ['crafting']),
    fabric: {
      setup: 'Hold 16 oak logs; run `mc-agent craft oak_planks 64`.',
      action: 'Run `mc-agent stop` while planks are being crafted.',
      observe: 'Log and plank counts in `data get entity <player> Inventory` 5 s apart.',
    },
  },
  {
    id: 'cancel-craft',
    title: 'Agent cancel between crafts keeps control',
    transition: 'cancel',
    interrupts: 'craft',
    ...ALL,
    expect: {
      mode: 'agent',
      job: { status: 'cancelled', message: M.cancel },
      halts: ['crafting'],
      stoppingWindow: false,
      next: { lease: 'same' },
    },
    fabric: {
      setup:
        'Hold 16 oak logs; from an MCP client take control and call `minecraft_action` with `{"type":"craft","item":"oak_planks","count":64}`.',
      action: 'Cancel that call (or call `minecraft_cancel`) while planks are being crafted.',
      observe:
        'Log and plank counts 5 s apart; `mc-agent job` shows `agent` and the next `minecraft_action` is accepted without taking control again.',
    },
  },
  {
    id: 'cancel-wait',
    title: 'Agent cancel during a wait keeps control',
    transition: 'cancel',
    interrupts: 'wait',
    ...ALL,
    expect: {
      mode: 'agent',
      job: { status: 'cancelled', message: M.cancel },
      halts: ['movement'],
      stoppingWindow: false,
      next: { lease: 'same' },
    },
    fabric: {
      setup:
        'From an MCP client, call `minecraft_take_control`, then `minecraft_action` with `{"type":"wait","seconds":30}`.',
      action:
        'Cancel the in-flight `minecraft_action` call from the MCP client (or call `minecraft_cancel` if the client allows concurrent calls).',
      observe: '`mc-agent job` shows `agent`; the next `minecraft_action` is accepted without taking control again.',
    },
  },
  {
    id: 'cancel-eat',
    title: 'Agent cancel during eating',
    transition: 'cancel',
    interrupts: 'eat',
    ...ALL,
    expect: {
      mode: 'agent',
      job: { status: 'cancelled', message: M.cancel },
      halts: ['consumption'],
      stoppingWindow: false,
      next: { lease: 'same' },
    },
    fabric: {
      setup:
        'Lower food to about 10; from an MCP client take control and call `minecraft_action` with `{"type":"eat"}`.',
      action: 'Cancel that call (or call `minecraft_cancel`) during the eating animation.',
      observe: 'Bread count and `foodLevel` before and 5 s after the cancel.',
    },
  },
  {
    id: 'expiry-idle',
    title: 'Lease expiry while idle',
    transition: 'expiry',
    interrupts: 'idle',
    ...ALL,
    expect: released(null, ['movement']),
    fabric: {
      setup: 'Start `mc-agent agent "<goal>" --model <model>` and wait for a model decision.',
      action: 'Suspend the CLI (Ctrl+Z) and wait 10 s, then resume it with `fg`.',
      expected: 'The resumed CLI does not regain control or act.',
      observe: '`mc-agent job` from a second terminal during the suspension.',
    },
  },
  {
    id: 'expiry-goto',
    title: 'Lease expiry during navigation',
    transition: 'expiry',
    interrupts: 'goto',
    ...ALL,
    expect: released(M.expiry, ['movement']),
    fabric: {
      setup: 'Run `mc-agent goto <x> <y> <z>` about 60 blocks away.',
      action: 'Kill the CLI process (`kill -9 <pid>`) mid-walk; wait 10 s.',
      observe: 'Position reads after expiry, 5 s apart.',
    },
  },
  {
    id: 'disconnect-collect',
    title: 'Disconnect while mining',
    transition: 'disconnect',
    interrupts: 'collect',
    automated: ['mineflayer'],
    manual: ['fabric'],
    gaps: { demo: NO_WORLD },
    expect: released(M.disconnect, ['mining', 'movement'], {
      next: { lease: 'new', refused: 'Enter a (Minecraft )?world' },
    }),
    fabric: {
      setup: 'Join a local server and run `mc-agent collect oak_log 8`.',
      action: 'Stop the server (or `/kick <player>`) while mining.',
      expected: 'After rejoining, the session does not resume; a new one must be started explicitly.',
      observe: '`mc-agent job` at the title screen and after rejoining.',
    },
  },
  {
    id: 'death-goto',
    title: 'Death during navigation',
    transition: 'death',
    interrupts: 'goto',
    ...ALL,
    expect: released(M.death, ['movement'], { next: { lease: 'new', refused: 'dead|Respawn' } }),
    fabric: {
      setup: 'Run `mc-agent goto <x> <y> <z>` about 40 blocks away.',
      action: 'Run `/kill <player>` in the server console mid-walk; respawn manually afterwards.',
      expected: 'After the manual respawn, the session does not resume.',
      observe: '`mc-agent job` at the death screen and after respawning.',
    },
  },
  {
    id: 'dimension-idle',
    title: 'Dimension change while idle',
    transition: 'dimension',
    interrupts: 'idle',
    automated: ['mineflayer'],
    manual: ['fabric'],
    gaps: { demo: NO_WORLD },
    expect: released(null, ['movement']),
    fabric: {
      setup: 'Start `mc-agent agent "<goal>" --model <model>` and wait for a model decision.',
      action: 'Run `/execute in minecraft:the_nether run tp <player> 0 100 0`.',
      observe: '`mc-agent job` and `data get entity <player> Dimension`.',
    },
  },
  {
    id: 'dimension-goto',
    title: 'Dimension change during navigation',
    transition: 'dimension',
    interrupts: 'goto',
    automated: ['mineflayer'],
    manual: ['fabric'],
    gaps: { demo: NO_WORLD },
    expect: released(M.dimension, ['movement']),
    fabric: {
      setup: 'Run `mc-agent goto <x> <y> <z>` about 40 blocks away.',
      action: 'Run `/execute in minecraft:the_nether run tp <player> 0 100 0` mid-walk.',
      observe: 'Position and `Dimension` reads 5 s apart.',
    },
  },
  {
    id: 'takeover-while-stopping-eat',
    title: 'New session while cancelled eating is still settling',
    transition: 'takeover-while-stopping',
    interrupts: 'eat',
    automated: ['demo', 'mineflayer'],
    manual: [],
    gaps: { fabric: NO_STOPPING_EAT },
    expect: released(M.stop, ['consumption'], { stoppingWindow: true }),
  },
  {
    id: 'takeover-while-stopping-deposit',
    title: 'New session while a container opening is still awaiting the server',
    transition: 'takeover-while-stopping',
    interrupts: 'deposit',
    ...ALL,
    expect: released(M.stop, ['deposit'], { stoppingWindow: true }),
    fabric: {
      setup:
        'Use a server with noticeable latency (e.g. a remote server); run `mc-agent deposit oak_log` with a chest nearby.',
      action:
        'Run `mc-agent stop` immediately after the agent clicks the chest, then immediately start `mc-agent goto` nearby.',
      expected:
        'If `stopping` never appears because the reply was too fast, record "not observed" rather than passing.',
      observe: '`mc-agent job` in a loop (`mc-agent watch`); chest `Items` reads.',
    },
  },
  {
    id: 'takeover-while-stopping-withdraw',
    title: 'New session while a withdrawal is still opening its container',
    transition: 'takeover-while-stopping',
    interrupts: 'withdraw',
    ...ALL,
    expect: released(M.stop, ['withdraw'], { stoppingWindow: true }),
    fabric: {
      setup:
        'Use a server with noticeable latency (e.g. a remote server); run `mc-agent withdraw oak_log` beside a chest holding logs.',
      action:
        'Run `mc-agent stop` immediately after the agent clicks the chest, then immediately start `mc-agent goto` nearby.',
      expected:
        'If `stopping` never appears because the reply was too fast, record "not observed" rather than passing.',
      observe: '`mc-agent job` in a loop (`mc-agent watch`); chest `Items` reads.',
    },
  },
  {
    id: 'takeover-while-stopping-craft',
    title: 'New session while a cancelled craft is still clicking',
    transition: 'takeover-while-stopping',
    interrupts: 'craft',
    ...ALL,
    expect: released(M.stop, ['crafting'], { stoppingWindow: true }),
    fabric: {
      setup:
        'Use a server with noticeable latency; hold 32 planks within 16 blocks of a crafting table and run `mc-agent craft chest 4`.',
      action:
        'Run `mc-agent stop` immediately after the agent clicks the crafting table, then immediately start `mc-agent goto` nearby.',
      expected:
        'If `stopping` never appears because the reply was too fast, record "not observed" rather than passing.',
      observe: '`mc-agent job` in a loop (`mc-agent watch`); plank and chest counts.',
    },
  },

  // Failures that end a job without releasing control.
  {
    id: 'inventory-full-collect',
    title: 'Inventory fills while mining for a collection quota',
    transition: 'inventory-full',
    interrupts: 'collect',
    automated: ['demo', 'mineflayer'],
    manual: ['fabric'],
    expect: {
      mode: 'agent',
      job: { status: 'failed', message: M.inventoryFull },
      halts: ['mining'],
      stoppingWindow: false,
      next: { lease: 'same' },
    },
    fabric: {
      setup:
        'Stand near trees holding an axe and no oak logs; fill all but one of the other main slots (hotbar and inventory) with full stacks, e.g. `/give <player> minecraft:cobblestone 2176` (34 stacks). From an MCP client, call `minecraft_take_control`.',
      action:
        'Call `minecraft_action` with `{"type":"collect","block":"oak_log","count":8}`; while the first log is being broken, run `/give <player> minecraft:dirt 64` to fill the last slot. Start over if a log was picked up first.',
      expected:
        'The job fails within seconds of the last slot filling rather than at the 180 s mining deadline, after the bounded return to where collection started.',
      observe:
        'The `minecraft_action` result and `mc-agent job` (still `agent`); the next `minecraft_action` is accepted without taking control again.',
    },
  },
];

export const LIFECYCLE_SCENARIOS = deep(SCENARIOS);

const regex = (source) => `\`/${source}/i\``;

/** Backend-neutral expected outcome as one sentence list, shared by the checklist and test names. */
export function describeExpectation(expect) {
  const parts = [expect.mode === 'manual' ? 'mode becomes `manual`' : 'mode stays `agent`'];
  parts.push(
    expect.job
      ? `the job ends \`${expect.job.status}\` with a message matching ${regex(expect.job.message)}`
      : 'no job is started or resumed',
  );
  parts.push(...expect.halts.map((halt) => HALTS[halt].text));
  if (expect.stoppingWindow)
    parts.push(
      'while `stopping` is `true` a new session cannot start work, and it can once the interrupted work settles',
    );
  if (expect.mode === 'manual') parts.push('the old session cannot heartbeat or act');
  if (expect.next.refused)
    parts.push(
      `a new session is refused with a message matching ${regex(expect.next.refused)} until the player recovers`,
    );
  else if (expect.next.lease === 'same')
    parts.push('the same session can start its next action once `stopping` is `false`');
  else parts.push('a new session starts only when explicitly requested and is then accepted');
  return parts;
}

/** Markdown checklist of every scenario that must be run by hand on Fabric, in table order. */
export function renderFabricChecklist(scenarios = LIFECYCLE_SCENARIOS) {
  const lines = [];
  scenarios
    .filter((scenario) => scenario.manual.includes('fabric'))
    .forEach((scenario, index) => {
      const { fabric, expect } = scenario;
      const halts = expect.halts.map((halt) => HALTS[halt].observe).join('; ');
      lines.push(
        `${index + 1}. **${scenario.title}** (\`${scenario.id}\`; ${scenario.transition} during ${scenario.interrupts})`,
        `    - Setup: ${fabric.setup}`,
        `    - Action: ${fabric.action}`,
        `    - Expected: ${describeExpectation(expect).join('; ')}.${fabric.expected ? ` ${fabric.expected}` : ''}`,
        `    - Observe: ${fabric.observe} Independently: ${halts}.`,
      );
    });
  const gaps = scenarios.filter((scenario) => scenario.gaps?.fabric);
  if (gaps.length) {
    lines.push('', 'Not run on Fabric:', '');
    for (const scenario of gaps) lines.push(`- \`${scenario.id}\`: ${scenario.gaps.fabric}`);
  }
  return lines.length ? `${lines.join('\n')}\n` : '';
}
