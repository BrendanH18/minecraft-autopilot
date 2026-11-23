// Catalog of the v0.1 live release gates in docs/RELEASE.md ("Live checks required before shipping").
// `release` is the exact checkbox text (without its italic history note); tests compare it with RELEASE.md.
// Tooling never closes a gate: closed entries mirror boxes a person ticked after reviewing evidence.

const deep = (value) => {
  for (const child of Object.values(value)) if (child && typeof child === 'object') deep(child);
  return Object.freeze(value);
};
const PACKAGED =
  'The packaged dist/minecraft-agent-0.1.0.zip rebuilt from a clean source commit (`npm run build:mod`), with dist/BUILD.json and dist/ARCHIVE_SHA256SUMS.';
const FABRIC_PROFILE =
  'Minecraft Java 1.21.1 with Fabric Loader 0.16.14 or newer and the three packaged jars installed in the profile mods directory.';
const BOT = 'The standalone bot (`mc-agent server`) from the same commit on a Java 1.21.1 server.';

export const GATE_BACKENDS = Object.freeze(['fabric', 'mineflayer', 'both']);
export const SESSION_BACKENDS = Object.freeze(['fabric', 'mineflayer', 'both', 'demo']);

export const ACCEPTANCE_GATES = deep([
  {
    id: 'fabric-packaged-install',
    status: 'open',
    backend: 'fabric',
    keyboard: true,
    owner: false,
    title: 'Packaged jars in a normal Fabric launcher profile',
    release:
      'Install the packaged jars in a normal Fabric launcher profile, enter a real world, attach the CLI, and observe the existing character.',
    prerequisites: [
      PACKAGED,
      'A normal launcher profile for Minecraft Java 1.21.1 with Fabric Loader 0.16.14 or newer.',
      'Copy the three packaged jars into the profile before recording their hashes with acceptance start --mods-dir.',
    ],
    steps: [
      'Confirm the three packaged jars are installed in the launcher profile and record the installation.',
      'Enter a real world with the existing character.',
      'Attach the CLI to the profile config/minecraft-agent/bridge.json (`mc-agent attach <path>`).',
      'Run `mc-agent observe` and confirm it reports the existing character.',
    ],
    evidence: [
      'Launcher, Fabric Loader, and world type (single-player or server).',
      'The observed name, position, and inventory compared with what the player sees in game.',
    ],
  },
  {
    id: 'collection-pit-recovery',
    status: 'open',
    backend: 'both',
    keyboard: false,
    owner: false,
    title: 'Partial collection and pit recovery on Fabric and bot',
    release:
      'Run collection with partial progress and recovery from a pit on the latest Fabric and bot code. Verify an unreachable return is reported as failed and inventory progress remains observable.',
    history:
      'Bot: partial progress with a return and an unreachable home both verified on 20 October 2026. Fabric and an actual pit are still pending.',
    prerequisites: [
      PACKAGED,
      'One session per backend on the same candidate: the packaged Fabric mod, and the bot.',
      'A home saved with `mc-agent set-home`.',
    ],
    steps: [
      'Run a collection that ends with partial progress.',
      'Exercise recovery from an actual pit.',
      'Make the return unreachable and verify it is reported as failed.',
      'Verify inventory progress remains observable after the failure.',
    ],
    evidence: [
      'Initial and final item counts from an independent server `data get entity` read.',
      'Job status and error text.',
      'Final position relative to home.',
    ],
  },
  {
    id: 'fabric-f8-takeover',
    status: 'open',
    backend: 'fabric',
    keyboard: true,
    owner: false,
    title: 'F8, menu, emergency stop, and lease expiry with the packaged mod',
    release:
      'Press F8 during inference/action; close the menu afterward and verify no command resumes. Check emergency stop and lease expiry with the packaged mod.',
    prerequisites: [PACKAGED, FABRIC_PROFILE, 'A real local model for the inference step.'],
    steps: [
      'Press F8 while the planner waits for model inference and verify control returns.',
      'Press F8 during an action and verify control returns.',
      'Close the menu afterward and verify no command resumes.',
      'Check emergency `mc-agent stop` from a second process with the packaged mod.',
      'Check lease expiry after the controlling CLI is killed with the packaged mod.',
    ],
    evidence: [
      'Control mode from a separate `mc-agent observe` after each step.',
      'Independent position or inventory reads several seconds apart showing no further actions.',
    ],
  },
  {
    id: 'fabric-eating-recovery',
    status: 'open',
    backend: 'fabric',
    keyboard: true,
    owner: false,
    title: 'Failed eating, retreat, and deadlines with the packaged mod',
    release:
      'With the packaged Fabric mod, force failed food consumption while hungry and low on health. Verify eating backoff, retreat, and action/retreat deadlines; interrupt eating and recovery with F8 and stop.',
    prerequisites: [PACKAGED, FABRIC_PROFILE, 'A home saved for the retreat.'],
    steps: [
      'Make the character hungry and low on health, then force food consumption to fail.',
      'Verify eating backoff.',
      'Verify retreat.',
      'Verify the action and retreat deadlines.',
      'Interrupt eating with F8 and with `mc-agent stop`.',
      'Interrupt recovery with F8 and with `mc-agent stop`.',
    ],
    evidence: [
      'Health, hunger, and food counts from independent reads.',
      'Job status, error text, and elapsed time against each deadline.',
      'Control mode after each interruption.',
    ],
  },
  {
    id: 'bot-mining-timeout',
    status: 'open',
    backend: 'mineflayer',
    keyboard: false,
    owner: false,
    title: 'Bot mining timeout and recovery in a real pit',
    release:
      'Force a bot mining timeout in a real pit. Verify the bounded return attempt, failure status, preserved inventory progress, and immediate cancellation during recovery.',
    prerequisites: [BOT, 'A home saved with `mc-agent set-home`.'],
    steps: [
      'Force a bot mining timeout in a real pit.',
      'Verify the bounded return attempt.',
      'Verify the failure status.',
      'Verify inventory progress is preserved.',
      'Cancel during recovery and verify cancellation is immediate.',
    ],
    evidence: [
      'Item counts before and after from an independent server `data get entity` read.',
      'Job status, error text, and return timing.',
      'Control mode immediately after cancellation.',
    ],
  },
  {
    id: 'fabric-storage-deposits',
    status: 'open',
    backend: 'fabric',
    keyboard: true,
    owner: false,
    title: 'Fabric chest and barrel deposits with takeover',
    release:
      'Validate Fabric chest/barrel deposits with exact and omitted counts, full/blocked containers, double chests, fresh inspection and return, and F8/menu/stop/expiry during transfers.',
    prerequisites: [PACKAGED, FABRIC_PROFILE, 'Chests and barrels within 16 blocks, including a double chest.'],
    steps: [
      'Deposit with an exact count.',
      'Deposit with the count omitted.',
      'Deposit into a full container and verify the failure.',
      'Deposit into a blocked container and verify the failure.',
      'Deposit into a double chest.',
      'Run a fresh `mc-agent inspect-storage` and verify the return.',
      'Press F8 during a transfer.',
      'Open the menu during a transfer.',
      'Run `mc-agent stop` during a transfer.',
      'Let the lease expire during a transfer.',
    ],
    evidence: [
      'Container contents from independent server `data get block` reads before and after each step.',
      'Player inventory from an independent read.',
      'Reads several seconds apart after each takeover showing no further deposits.',
    ],
  },
  {
    id: 'fabric-withdraw-craft',
    status: 'open',
    backend: 'fabric',
    keyboard: true,
    owner: false,
    title: 'Fabric withdraw and craft with takeover',
    release:
      'Validate Fabric withdraw (exact and omitted counts, no candidate, short container, full inventory) and craft (inventory-grid and table recipes, missing ingredients, placing a held table, full inventory), with F8/menu/stop/expiry during each. Run a real local model with `--verify-withdraw` and `--verify-craft`.',
    prerequisites: [
      PACKAGED,
      FABRIC_PROFILE,
      'A chest within 16 blocks holding logs and cobblestone, and a local model.',
    ],
    steps: [
      'Withdraw with an exact count, then with the count omitted.',
      'Withdraw with no candidate container, from a container holding too few, and into a full inventory; verify each failure.',
      'Craft planks and sticks in the inventory grid.',
      'Craft a stone pickaxe with no table nearby while holding one; verify it is placed and used.',
      'Craft with missing ingredients and with a full inventory; verify each failure.',
      'Press F8, open the menu, run `mc-agent stop`, and let the lease expire during a withdrawal and during a craft.',
      'Run a real local model with `--verify-withdraw` and `--verify-craft`.',
    ],
    evidence: [
      'Container contents and player inventory from independent server `data get` reads before and after each step.',
      'The placed table confirmed with `execute if block`.',
      'Reads several seconds apart after each takeover showing no further transfers or crafts.',
    ],
  },
  {
    id: 'bot-withdraw-craft',
    status: 'open',
    backend: 'mineflayer',
    keyboard: false,
    owner: false,
    title: 'Bot withdraw and craft on a local server',
    release:
      'Validate bot withdraw and craft against a local server with the same cases, including a real local model with `--verify-withdraw` and `--verify-craft`.',
    prerequisites: [
      BOT,
      'For the real-model check, a chest within 16 blocks holding logs and cobblestone, and a local model.',
    ],
    steps: [
      'Run `npm run acceptance:bot -- --accept-eula --scenario withdraw --scenario withdraw-omitted --scenario withdraw-no-candidate --scenario withdraw-short-stock --scenario withdraw-full-inventory --scenario craft-bootstrap --scenario craft-missing-ingredients --scenario craft-full-inventory`.',
      'Run a real local model with `--verify-withdraw` and `--verify-craft`.',
    ],
    evidence: [
      'The runner results file and `server.out`, reviewed by a person.',
      'Container contents and player inventory from independent server `data get` reads.',
    ],
  },
  {
    id: 'collect-and-store-verification',
    status: 'open',
    backend: 'mineflayer',
    keyboard: false,
    owner: false,
    title: 'Collect-and-store with both criteria and stale-content checks',
    release:
      'Run collect-and-store with both criteria. Remove stored items during inference and block inspection; stale contents must not produce success. Verify final inspection preserves return-home criteria or reports failure.',
    prerequisites: [BOT, 'A real local model for `mc-agent agent`.', 'A home and a nearby chest or barrel.'],
    steps: [
      'Run collect-and-store with both criteria (`--verify-collect` and `--verify-deposit`).',
      'Remove stored items during model inference and verify stale contents do not produce success.',
      'Block inspection before the final check and verify stale contents do not produce success.',
      'With `--verify-home`, verify the final inspection preserves the return-home criterion or reports failure.',
    ],
    evidence: [
      'Container contents from independent server `data get block` reads.',
      'Model name and version, criteria, and the planner result status.',
      'Final position relative to home.',
    ],
  },
  {
    id: 'fabric-local-model',
    status: 'open',
    backend: 'fabric',
    keyboard: false,
    owner: false,
    title: 'Real local model against the packaged Fabric mod',
    release:
      'Run a real local model and an actual MCP agent against the packaged Fabric mod; historical bot acceptance does not close this gate.',
    prerequisites: [PACKAGED, FABRIC_PROFILE, 'A real installed local model (`mc-agent models`).'],
    steps: [
      'Attach the CLI to the packaged Fabric mod.',
      'Run `mc-agent agent` with the real local model and explicit `--verify-*` criteria.',
      'Confirm the result with an independent read and verify the session ends in manual control.',
    ],
    evidence: [
      'Model name and version, initial inventory, criteria, and result status.',
      'Final inventory and position from an independent read.',
      'Final manual control.',
    ],
  },
  {
    id: 'fabric-mcp-agent',
    status: 'open',
    backend: 'fabric',
    keyboard: false,
    owner: false,
    title: 'Actual MCP agent against the packaged Fabric mod',
    release:
      'Run a real local model and an actual MCP agent against the packaged Fabric mod; historical bot acceptance does not close this gate.',
    prerequisites: [PACKAGED, FABRIC_PROFILE, 'An actual MCP client running `mc-agent mcp`.'],
    steps: [
      'Connect the MCP agent to `mc-agent mcp` attached to the packaged Fabric mod.',
      'Have the agent observe, explicitly acquire control, perform an action, and stop.',
      'Confirm the action and manual control with a separate `mc-agent observe`.',
    ],
    evidence: [
      'MCP client name and version and the tools it was allowed.',
      'The tool call sequence and raw results.',
      'Independent inventory and control mode after the agent stops.',
    ],
  },
  {
    id: 'authenticated-handoff',
    status: 'open',
    backend: 'both',
    combined: true,
    keyboard: true,
    owner: true,
    title: 'Authenticated client to bot to client handoff',
    release:
      'Validate authenticated client → bot → client handoff. Check the UUID and inventory at each stage; never connect both as the same account simultaneously.',
    prerequisites: [PACKAGED, FABRIC_PROFILE, BOT, 'The account owner, signed in with their own Microsoft account.'],
    steps: [
      'In the authenticated client, record the UUID and inventory.',
      'Disconnect the client, then connect the bot as the same account; record the UUID and inventory.',
      'Disconnect the bot, then reconnect the client; record the UUID and inventory.',
      'Confirm the client and the bot were never connected as the same account at the same time.',
    ],
    evidence: [
      'UUID and inventory at each stage from independent reads.',
      'Disconnect and connect times for each stage.',
    ],
  },
  {
    id: 'cobblestone-hostiles-dimension',
    status: 'open',
    backend: 'both',
    keyboard: false,
    owner: false,
    title: 'Cobblestone, hostile observations, and dimension-change release',
    release: 'Validate cobblestone with a pickaxe, hostile observations, and release on dimension change.',
    history: 'Bot verified on 20 October 2026; Fabric still pending.',
    prerequisites: [
      PACKAGED,
      'One session per backend on the same candidate: the packaged Fabric mod, and the bot.',
      'A pickaxe, a nearby hostile mob, and a way to change dimension.',
      'For the bot, run `npm run acceptance:bot -- --accept-eula --scenario cobblestone-hostiles-dimension`.',
    ],
    steps: [
      'Collect cobblestone with a pickaxe.',
      'Verify a nearby hostile appears in observations (`mc-agent threats`).',
      'Change dimension while under agent control and verify control is released.',
    ],
    evidence: [
      'Cobblestone counts from an independent read.',
      'Observed threat type and distance.',
      'Control mode and release message after the dimension change.',
    ],
  },
  {
    id: 'bot-ollama-model',
    status: 'closed',
    backend: 'mineflayer',
    keyboard: false,
    owner: false,
    closedOn: '2026-10-20',
    title: 'Real installed Ollama model with the bot',
    release:
      'Run a real installed Ollama model with `--verify-collect oak_log:8 --verify-home`. Record the model name/version, initial inventory, result, and final manual control.',
    history: '`qwen3.5:4b-mlx` with the Mineflayer bot, 20 October 2026; see DEVELOPMENT.md#validation.',
    prerequisites: [],
    steps: [],
    evidence: ['Recorded in docs/DEVELOPMENT.md Validation (20 October 2026).'],
  },
  {
    id: 'bot-mcp-agent',
    status: 'closed',
    backend: 'mineflayer',
    keyboard: false,
    owner: false,
    closedOn: '2026-10-27',
    title: 'Real MCP agent with the bot',
    release: 'Use a real MCP agent to observe, explicitly acquire, perform an action, and stop.',
    history:
      'Claude Code 2.1.312 headless with only the five Minecraft tools, against the Mineflayer bot, 27 October 2026; see DEVELOPMENT.md#validation.',
    prerequisites: [],
    steps: [],
    evidence: ['Recorded in docs/DEVELOPMENT.md Validation (27 October 2026).'],
  },
]);

export const OPEN_GATES = Object.freeze(ACCEPTANCE_GATES.filter((gate) => gate.status === 'open'));

export function findGate(id) {
  const gate = ACCEPTANCE_GATES.find((entry) => entry.id === id);
  if (!gate) throw new Error(`Unknown acceptance gate ${id}. Run "mc-agent acceptance list" to see gate ids.`);
  return gate;
}

/** Backends that each need eligible evidence: a combined gate needs one session that exercises both. */
export const requiredBackends = (gate) =>
  gate.combined ? ['both'] : gate.backend === 'both' ? ['fabric', 'mineflayer'] : [gate.backend];
