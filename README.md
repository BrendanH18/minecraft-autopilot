# Minecraft Autopilot

[![CI](https://github.com/BrendanH18/minecraft-autopilot/actions/workflows/ci.yml/badge.svg)](https://github.com/BrendanH18/minecraft-autopilot/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Let a local agent take over **the Minecraft Java character you're already playing**, perform a bounded task, and return control to you.

Minecraft Autopilot combines a Fabric client mod, a standalone server bot, a CLI, an MCP server, and an Ollama planner. Fabric controls your logged-in player; the bot provides a separate connection while your regular client is closed. Actions run through an authenticated localhost bridge with exclusive control leases and an emergency stop.

**Status: experimental; v0.1.0 is in preparation.** Basic gameplay and handoff have recorded live validation in development worlds. Automated checks cover control ownership, simulated tasks, and independent task criteria. Normal launcher installation, Microsoft-authenticated handoff, real local-model runs, and the latest recovery changes still need live acceptance testing. See the [release checklist](docs/RELEASE.md) and [validation record](docs/DEVELOPMENT.md#validation).

## What it can do

| Capability | Available today |
| --- | --- |
| Observe | Health, hunger, inventory, position, home, nearby loaded blocks and hostile entities |
| Navigate | Walk to coordinates or a saved home |
| Collect | Additional logs, dirt, sand, or cobblestone, with a bounded return attempt |
| Eat and guard | Eat supported food and attempt a low-health retreat to a saved shelter |
| Local planning | One validated Ollama action at a time, with time and step limits |
| Agent integration | Five MCP tools for observation, takeover, actions, cancellation, and stop |
| Handoff | F8/menu takeover in Fabric, emergency stop, and heartbeat expiry |
| Verify tasks | Check additional inventory and return to the original home independently of the model |

Combat, crafting, building, chest deposits, automatic reconnect transfer, and ordinary mouse/movement takeover are future work. Guard reacts to hunger and health; it does not fight enemies or construct shelter.

## Try it in two minutes

Install [Node.js](https://nodejs.org/) **22 or newer**, then:

```sh
git clone https://github.com/BrendanH18/minecraft-autopilot.git
cd minecraft-autopilot
npm ci
npm start -- demo --smoke
```

This runs a **simulation** through the real bridge: save home, move, collect eight logs, eat, return home, and release control. Neither Minecraft nor a model is required.

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
| Demo | You want to test the CLI, bridge, MCP, or planner without touching a world | Node.js 22+ |

A closed single-player world cannot continue through the bot. Keep it open in Fabric or host it on a dedicated server. Only use automation on servers where it is allowed.

## Install the Fabric mod

The pinned stack is Minecraft Java **1.21.1**, Fabric Loader **0.16.14**, Fabric API **0.116.17+1.21.1**, and Baritone **1.11.3**. Building requires a full **Java 21 JDK** with `java`, `javac`, and `jar` on PATH; the CLI requires Node.js 22+.

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

The planner chooses one bounded action at a time. Explicit criteria compare final inventory to starting inventory and check return within two blocks of the original home. Results are `criteria_met` or `criteria_unmet`; unmet criteria exit with code 2. These checks verify only the supplied criteria, not every requirement in free-form goal text.

Without verification flags, `model_finished` records the model's explanation and does not independently prove success. Requests are restricted to a local Ollama endpoint. The planner rechecks control after inference and releases its lease on exit.

For another agent, configure the [MCP server](docs/USAGE.md#connect-an-mcp-agent). For a dedicated server, follow the [server bot guide](docs/USAGE.md#use-the-server-bot).

## Take control back

- **F8** returns control in Fabric. Rebind it under Options → Controls → Minecraft Agent.
- Opening a menu, dying, disconnecting, or changing dimensions releases Fabric control. Closing the menu does not resume the agent.
- `npm start -- stop` cancels a session, including one started by another process.
- **Ctrl+C** stops the current CLI/planner. In the server terminal, it disconnects the bot so you can reconnect your regular client.

Minecraft must remain running and unpaused, and the computer must remain awake. Taking control can close the focus-loss pause menu; other screens block takeover. Ordinary mouse/movement input is not an automatic takeover trigger.

Heartbeats run every two seconds; the bridge cancels activity after eight seconds without one. A frozen game enforces expiry when its event loop resumes. Local survival behavior runs only during an active session. A saved home is a waypoint, not a guarantee of safety.

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
