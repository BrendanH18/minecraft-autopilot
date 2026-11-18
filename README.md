# Minecraft Autopilot

[![CI](https://github.com/BrendanH18/minecraft-autopilot/actions/workflows/ci.yml/badge.svg)](https://github.com/BrendanH18/minecraft-autopilot/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Let a local agent take over **the Minecraft Java character you're already playing**, perform a bounded task, and return control to you.

Minecraft Autopilot combines a Fabric client mod, a standalone server bot, a CLI, an MCP server, and an Ollama planner. Fabric controls your logged-in player; the bot provides a separate connection while your regular client is closed. Actions run through an authenticated localhost bridge with exclusive control leases and an emergency stop.

**Status: experimental; v0.1.0 is in preparation.** Basic gameplay and handoff have recorded live validation in development worlds. Automated checks cover control ownership, simulated tasks, and independent task criteria. A real Ollama model and a real MCP agent have completed bot tasks. Normal launcher installation, Microsoft-authenticated handoff, and the latest Fabric recovery changes still need live acceptance testing. See the [release checklist](docs/RELEASE.md) and [validation record](docs/DEVELOPMENT.md#validation).

## What it can do

| Capability | Available today |
| --- | --- |
| Observe | Health, hunger, inventory, position, home, nearby loaded blocks and hostile entities |
| Navigate | Walk to coordinates or a saved home |
| Collect | Additional logs, dirt, sand, or cobblestone, with a bounded return attempt |
| Eat and guard | Eat supported food and attempt a low-health retreat to a saved shelter |
| Store | Deposit items into the nearest chest or barrel (Fabric, server bot, and demo) |
| Local planning | One validated Ollama action at a time, with time and step limits |
| Agent integration | Eight MCP tools for observation, inventory, nearby lookups, takeover, actions, cancellation, release, and stop |
| Handoff | F8/menu takeover in Fabric, emergency stop, and heartbeat expiry |
| Verify tasks | Check additional inventory, items stored in containers, and return to the original home independently of the model |

Combat, crafting, building, automatic reconnect transfer, and ordinary mouse/movement takeover are future work. Guard reacts to hunger and health; it does not fight enemies or construct shelter.

## Planning and reports

The CLI also includes [100 focused planning and reporting additions](docs/IMPROVEMENTS.md#batch-4-100-planning-and-reporting-additions):

- [`supplies`](docs/SUPPLIES.md): 25 inventory, food, quota, and last-observed storage reports.
- [`survey`](docs/SURVEY.md): 25 position, nearby-resource, threat, and observation reports.
- [`nav`](docs/NAVIGATION.md): 25 offline coordinate and route calculators.
- [`routine`](docs/ROUTINE-TOOLS.md): 25 offline routine inspection, editing, and generation tools.

`supplies` and `survey` read the connected backend without taking control. `nav`
and `routine` work without Minecraft or a model. Reports describe partial observations;
geometry and generated routines do not guarantee safe or successful execution.
Use `mc-agent <group> --help` to browse the commands.

A further [100 additions](docs/IMPROVEMENTS.md#batch-5-100-stock-spatial-geometry-and-workbench-additions) support more detailed planning:

- [`stock`](docs/STOCK.md): multi-item kits, shared capacity, food budgets, and storage sourcing.
- [`scene`](docs/SCENE.md): spatial filters, home neighbors, and observed threat clearances.
- [`geometry`](docs/GEOMETRY.md): route progress, projections, turns, volumes, and travel estimates.
- [`workbench`](docs/WORKBENCH.md): routine dependencies, quota balance, and validated transformations.

Each group has 25 commands. Stock and scene read observations without taking control;
geometry and workbench run offline. Plans do not execute actions or guarantee safety.

### Planning studies

[`study`](docs/PLANNING-STUDIES.md) adds batch evaluation, baseline comparison,
parameter sweeps, one-at-a-time sensitivity, candidate ranking, constraint
screening, factorial grids, result summaries, and Pareto fronts to each of the
1,400 typed planners: **12,600 planner/workflow combinations** from nine
reusable capabilities. Supply inline JSON, `@request.json`, or stdin. These
offline studies evaluate supplied plans without taking control of Minecraft.

```sh
mc-agent study sweep durability action-budget '{"args":[25,3,4],"index":2,"values":[1,2,3]}'
mc-agent study factorial durability action-budget '{"args":[25,3,4],"axes":[{"index":1,"values":[25,40]},{"index":2,"values":[2,3]}]}'
mc-agent study catalog
```

## Release acceptance tooling

v0.1 ships only after live checks pass. Three tools make those sessions faster and easier to audit; none of them marks a release gate as passed:

- [`acceptance`](docs/ACCEPTANCE.md) records live sessions for each open [release gate](docs/RELEASE.md): the commit, worktree state, `dist/BUILD.json`, archive checksum, backend and configuration, step observations, and result. It prints Markdown for the validation record and reports which sessions are eligible evidence.
- [`npm run acceptance:bot`](docs/LIVE-ACCEPTANCE.md) runs scripted bot recovery and storage scenarios against a local vanilla 1.21.1 server, checking results with independent server `data get` reads. It needs Java 21 and the cached server jar; try `npm run acceptance:bot -- --dry-run --all` first.
- [Lifecycle scenarios](docs/LIFECYCLE-SCENARIOS.md) define one table of takeover, stop, expiry, death, and dimension-change expectations. Tests run it against the demo driver and the bot driver on a mocked bot, and it generates the manual Fabric checklist.

## Try it in two minutes

Install [Node.js](https://nodejs.org/) **22 or newer**, then:

```sh
git clone https://github.com/BrendanH18/minecraft-autopilot.git
cd minecraft-autopilot
npm ci
npm start -- demo --smoke
```

This runs a **simulation** through the real bridge: save home, move, collect eight logs, store them in a chest, eat, return home, and release control. Neither Minecraft nor a model is required.

For an interactive simulation, leave `npm start -- demo` running in one terminal. In another, from the same checkout:

```sh
npm start -- observe
npm start -- set-home
npm start -- collect oak_log 8
npm start -- home
npm start -- stop
```

## Choose how to play

| Mode | Use it when | Requirements |
| --- | --- | --- |
| Fabric client | An agent should control your single-player or multiplayer character | Minecraft Java 1.21.1, Fabric Loader 0.16.14+, three mod jars, and a running game |
| Server bot | A dedicated server should stay connected while your regular client is closed | A compatible Java server and your account; authenticated handoff still needs live validation |
| Demo | You want to test the CLI, bridge, MCP, or planner without touching a world | Node.js 22.12+ |

A closed single-player world cannot continue through the bot. Keep it open in Fabric or host it on a dedicated server. Only use automation on servers where it is allowed.

## Install the Fabric mod

The pinned stack is Minecraft Java **1.21.1**, Fabric Loader **0.16.14**, Fabric API **0.116.17+1.21.1**, and Baritone **1.11.3**. Building requires a full **Java 21 JDK** with `java`, `javac`, and `jar` on PATH; the CLI requires Node.js 22.12+.

From the checkout above, first-time setup explicitly downloads the build dependencies:

```sh
npm run setup:mod -- --allow-downloads
node scripts/gradle.js build --allow-downloads
node scripts/package-mod.js --allow-downloads
npm run verify:mod
```

After setup, `npm run build:mod` builds and packages using the local cache, offline by default. Missing dependencies fail instead of downloading silently.

1. Create a Minecraft Java 1.21.1 launcher profile and install [Fabric Loader](https://fabricmc.net/use/installer/) for it.
2. Copy **all three jars** from `dist/mods/` into that profile's `mods` directory:
   - `minecraft-agent-0.1.0.jar`
   - `fabric-api-0.116.17+1.21.1.jar`
   - `baritone-api-fabric-1.11.3.jar`
3. Launch the profile, enter a world or compatible server, and close game menus.
4. Attach the CLI:

   ```sh
   npm start -- attach "/path/to/game-directory/config/minecraft-agent/bridge.json"
   npm start -- observe
   ```

The attachment is remembered. On macOS, the default game directory is `~/Library/Application Support/minecraft`; quote paths containing spaces. Other launchers and custom profiles may use different directories.

Save a home **inside a shelter you prepared**, then try a small task:

```sh
npm start -- set-home
npm start -- collect oak_log 8
npm start -- home
```

`count` means additional items, not the final inventory total. Cobblestone needs a pickaxe. Collection can break terrain while mining or returning from a pit; use it in an area you are comfortable modifying. An unmet quota or failed return reports failure. Observe inventory before retrying so you do not repeat a full quota after partial progress.

## Give a local agent a task

Install and start [Ollama](https://ollama.com/), and choose an installed model that supports structured JSON output. Save a home first, then:

```sh
npm start -- agent "Collect eight additional oak logs and return home" \
  --model YOUR_LOCAL_MODEL --steps 20 --minutes 10 \
  --verify-collect oak_log:8 --verify-home
```

The planner chooses one bounded action at a time. Explicit criteria compare final inventory to starting inventory and check return within two blocks of the original home. For gather-and-store, combine `--verify-collect oak_log:8` with `--verify-deposit oak_log:8`: net new items in inventory and storage count toward collection. Deposit verification reopens known storage before final success; see the [verification limits](docs/USAGE.md#run-an-ollama-task). Results are `criteria_met` or `criteria_unmet`; unmet criteria exit with code 2. These checks verify only the supplied criteria, not every requirement in free-form goal text.

Without verification flags, `model_finished` records the model's explanation and does not independently prove success. Requests are restricted to a local Ollama endpoint. The planner rechecks control after inference and releases its lease on exit.

For another agent, configure the [MCP server](docs/USAGE.md#connect-an-mcp-agent). For a dedicated server, follow the [server bot guide](docs/USAGE.md#use-the-server-bot).

## Take control back

- **F8** returns control in Fabric. Rebind it under Options → Controls → Minecraft Agent.
- Opening a menu, dying, disconnecting, or changing dimensions releases Fabric control. Closing the menu does not resume the agent.
- `npm start -- stop` cancels a session, including one started by another process.
- **Ctrl+C** stops the current CLI/planner. In the server terminal, it disconnects the bot so you can reconnect your regular client.

Minecraft must remain running and unpaused, and the computer must remain awake. Taking control can close the focus-loss pause menu; other screens block takeover. Ordinary mouse/movement input is not an automatic takeover trigger.

Heartbeats run every two seconds; the bridge cancels activity after eight seconds without one. A frozen game enforces expiry when its event loop resumes. Local survival behavior runs only during an active session. A saved home is a waypoint, not a guarantee of safety.

Focused read-only commands include `inventory`, `blocks`, `threats`, `home-info`, `storage`, `distance`, `position`, and `health`. Use `inspect-storage` to refresh known containers or `wait` for a bounded controlled pause. [Additional final-state checks](docs/USAGE.md#focused-observations-and-final-state-checks) verify health, hunger, destinations, held inventory, observed threats, and a configurable home radius.

## Documentation

| Guide | Purpose |
| --- | --- |
| [Usage and troubleshooting](docs/USAGE.md) | CLI, bot, Ollama, MCP, profile selection, and cleanup |
| [Development](docs/DEVELOPMENT.md) | Setup, architecture, tests, gameplay validation, and known issues |
| [Bridge protocol](docs/protocol.md) | HTTP authentication, leases, action contracts, and observations |
| [Roadmap](docs/ROADMAP.md) | v0.1 scope, acceptance work, and later candidates |
| [Release checklist](docs/RELEASE.md) | Shipping gates and artifact verification |
| [Contributing](CONTRIBUTING.md) | Issues, changes, and pull request validation |
| [Changelog](CHANGELOG.md) | Changes being prepared for the initial release |

`npm start -- doctor` checks prerequisites, the bundle, and the selected discovery file without connecting to Minecraft. Runtime files, authentication caches, dependencies, and development worlds stay in ignored project-local directories. Installed profiles keep credentials and homes in their own `config/minecraft-agent/` directory. Do not share bridge tokens or sign-in caches.

## Contributing and license

Issues and pull requests are welcome; start with [CONTRIBUTING.md](CONTRIBUTING.md). The CLI is source-installed and is not published to npm.

Project source is [MIT licensed](LICENSE). [Fabric](https://fabricmc.net/), [Baritone](https://github.com/cabaletta/baritone/releases/tag/v1.11.3), [Mineflayer](https://github.com/PrismarineJS/mineflayer), [mineflayer-pathfinder](https://github.com/PrismarineJS/mineflayer-pathfinder), and the [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk) retain their respective licenses. Packaged Fabric API and Baritone jars are unmodified, checksum-pinned releases.

Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.

### More planning and analysis tools

The [100 batch 6 additions](docs/IMPROVEMENTS.md#batch-6-100-logistics-terrain-routine-audit-and-timeline-additions)
provide [logistics](docs/LOGISTICS.md), [terrain observations](docs/TERRAIN.md),
[offline routine auditing](docs/ROUTINE-AUDIT.md), and
[snapshot timelines](docs/TIMELINE.md). Run `mc-agent GROUP --help` for commands.

The next [100 batch 7 additions](docs/IMPROVEMENTS.md#batch-7-100-expedition-blueprint-checkpoint-and-composition-additions)
provide [expedition budgets](docs/EXPEDITION.md),
[construction material estimates](docs/BLUEPRINT.md),
[saved-snapshot checks](docs/CHECKPOINT.md), and
[routine composition](docs/COMPOSE.md), with 25 commands per group.
Expedition reads one observation; the other three groups run offline.
Construction and production plans are estimates; gameplay building and crafting
remain future work. Generated routines print validated JSON for review before execution.

The [200 batch 8 additions](docs/IMPROVEMENTS.md#batch-8-200-offline-planning-and-evidence-analysis-additions)
add eight groups of 25 offline commands:

- [`itinerary`](docs/ITINERARY.md): multi-stop schedules, return reserves, and route alternatives.
- [`workarea`](docs/WORKAREA.md): inclusive block-cell accounting and disjoint work partitions.
- [`ledger`](docs/LEDGER.md): inventory composition, quota progress, and packing changes between snapshots.
- [`depot`](docs/DEPOT.md): storage evidence, container changes, and recorded stock redistribution.
- [`journal`](docs/JOURNAL.md): transcript runs, event filters, and source-line inspection.
- [`diagnose`](docs/DIAGNOSE.md): recorded planner outcomes, costs, timing gaps, and request analysis.
- [`compare-routines`](docs/ROUTINE-COMPARE.md): routine differences, subsequences, and budget changes.
- [`select-routine`](docs/ROUTINE-SELECT.md): validated extraction of routine sections for review.

These commands never connect to Minecraft or execute actions. Unknown evidence
stays unknown; recorded changes do not prove their cause. Use
`mc-agent GROUP --help` for arguments and the linked guides for examples.

The [500 batch 9 improvements](docs/IMPROVEMENTS.md#batch-9-500-offline-planning-and-evidence-improvements)
add 20 offline groups for spatial calculations, explicit resource budgets,
and recorded evidence queries. Each group has 25 commands; run
`mc-agent GROUP --help` and consult its linked guide for arguments and limits.
These reports neither execute gameplay nor establish safety or successful actions.

The [1,000 batch 10 improvements](docs/IMPROVEMENTS.md#batch-10-1000-offline-planning-and-analysis-improvements)
add 40 groups of 25 offline tools for
[spatial plans](docs/PLANNING-SPATIAL.md),
[resource budgets](docs/PLANNING-RESOURCES.md),
[measurement analysis](docs/PLANNING-ANALYSIS.md), and
[route and schedule coordination](docs/PLANNING-COORDINATION.md).
They calculate from supplied data and print JSON; they never execute gameplay.
Use `mc-agent GROUP --help` for arguments and each guide for assumptions.

The [batch 13 additions](docs/IMPROVEMENTS.md#batch-13-200-planners-and-three-study-workflows)
add 200 more typed planners in eight groups of 25:
[structures](docs/PLANNING-STRUCTURES.md) (`stairplan`, `roundplan`, `rampart`,
`warehouse`) and [operations](docs/PLANNING-OPERATIONS.md) (`stripmine`, `herd`,
`signalplan`, `linkplan`). Together with three new study workflows they make
5,000 new callable entries: the 200 commands plus 4,800 planner/workflow
combinations. Every rate, size, and delay is a supplied assumption; nothing
here encodes game rules or executes gameplay.

[Batch 14](docs/IMPROVEMENTS.md#batch-14-200-offline-build-planners)
adds 200 direct CLI planners for
[construction](docs/PLANNING-CONSTRUCTION.md),
[infrastructure](docs/PLANNING-INFRASTRUCTURE.md),
[waterways](docs/PLANNING-WATERWAYS.md), and
[production stations](docs/PLANNING-STATIONS.md). Use
`mc-agent GROUP --help` for command signatures. For example,
`mc-agent beacon-plan tier-materials 3 4` budgets a four-layer square beacon base.
