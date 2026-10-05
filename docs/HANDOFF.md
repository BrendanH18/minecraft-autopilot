# Agent handoff

Updated 2026-10-05. This records the state after implementation commit `8e3be15`; check `git status` and later commits before continuing.

## User's goal and constraints

Build a local harness that can take over the **same Minecraft Java character the user has been playing**, finish tasks, or attempt to keep the character alive. Support single-player and multiplayer.

The user authorized continued development and asked us to **commit as we go**. Make separate commits for verified milestones.

The user is concerned about software scattered around their machine. Their explicit instruction is: **“You can use the tools you previously installed. Just don't install anything else without asking first.”** Reuse cached tools. Ask before downloading or installing any additional software, dependency, update, model, launcher, or server. Do not run `npm ci`, package-manager installs, model pulls, or `--allow-downloads` commands without that approval.

Keep project caches and development runtime files inside this repository. Do not leave Minecraft, bridges, or persistent build daemons running after validation. Do not delete worlds or authentication caches as routine cleanup.

## Workspace and existing tools

- Repository: `/Users/brendanhallas/code/minecraft_agent_cli` (macOS also resolves the `Code` spelling).
- Previously observed tools: Node 22.23.2 and Java 21.0.12; both were already installed.
- Existing project downloads: npm dependencies, Gradle 8.12.1, Minecraft 1.21.1 development files/assets, Fabric, and Baritone.
- No official Minecraft Launcher was installed, no Minecraft account was signed in, and no startup service or global npm package was added by this work.
- Ollama and a local model have not been installed by this project.
- Previously created external Gradle/npm cache entries were moved into the repository, and our external temporary files were removed.

Git does not include caches or compiled jars. A checkout on another machine will need approved dependency setup before building. The current machine can reuse the existing caches.

## Implemented

1. **Fabric client mod:** controls the player already logged into Minecraft. Targets Minecraft Java **1.21.1**, Java 21, Fabric Loader 0.16.14, Fabric API 0.116.17+1.21.1, and Baritone 1.11.3. Works architecturally for single-player and compatible multiplayer through the same client.
2. **Standalone server bot:** Mineflayer adapter with Microsoft device authentication or explicit offline development authentication. Same-account server handoff requires the normal client to disconnect first; connecting as a separate username does not take over the original authenticated character.
3. **CLI and bridge:** authenticated localhost HTTP API, observations, home waypoints, navigation, collection, eating, waiting/guard, emergency stop, diagnostics, attaching an installed game profile, and selective cleanup.
4. **MCP stdio server:** observe, explicit takeover, validated actions, cancellation, and stop.
5. **Local planner:** bounded Ollama loop that chooses structured actions, checks control ownership after inference, and releases control on exit.
6. **Simulation:** deterministic demo exercises the actual HTTP adapter and CLI without Minecraft.

Actions are `goto`, `home`, `set_home`, `collect`, `eat`, and `wait`. Collection counts **additional inventory items**, up to 64 per action. The supported block and food lists are in the source and README.

Control is exclusive. Heartbeats run every two seconds and leases expire after eight seconds. Fabric releases control on F8, menus/pause, death, disconnect, or a world/dimension change. Survival behavior attempts food consumption and retreat to a saved home; it cannot guarantee survival.

## Latest milestone: cancellation and handoff

Commit `8e3be15` fixed delayed work after handoff:

- Queued actions check cancellation and ownership before dispatch.
- `OperationGate` serializes Mineflayer native operations and tracks them until they actually settle, even if their caller has already cancelled.
- A late inventory reply cannot trigger follow-on consumption after release. New takeover is refused while old work is still stopping.
- Idle world/player/dimension changes release the Node bridge lease.
- Closing the HTTP adapter during slow acquisition releases a late lease instead of restarting its heartbeat.
- Adapter shutdown interrupts polling/action waits; concurrent submissions are rejected.

There is **no uncommitted implementation in progress** at this handoff. The next work is live gameplay validation, then fixing any issues it reveals.

## Validation completed and its limits

- At `8e3be15`, **25 Node tests passed**, JavaScript syntax checks passed, and `git diff --check` passed.
- At `5178e8e`, the Fabric mod built and packaged offline, and the Java unit tests passed. The latest milestone changed only Node code/tests and protocol documentation.
- A real Fabric development client was previously launched successfully. Baritone and its native library loaded, and the authenticated bridge answered from the **main menu** with no world connected. The client was stopped afterward.
- A real Mineflayer connection was tested against a local **Minecraft protocol fixture**, checking identity, home persistence, and release on death. This fixture is not a complete Minecraft server/gameplay test.
- Planner tests use mocked model replies. No real Ollama inference was validated.

**Not yet verified:** movement, mining, eating, survival retreat, or F8 handoff inside a real Minecraft world; Microsoft-authenticated multiplayer; normal launcher/profile installation; or gameplay with a real local model. Do not describe those as proven working.

## Suggested next work

1. Use the already cached development client to validate gameplay in a new, isolated test world. Protect existing worlds. Verify observations, saved home, movement, collection quotas, food consumption, emergency stop, menu/F8 takeover, and lease expiry. Stop the client afterward.
2. Fix issues exposed by live validation, add focused regression coverage, and commit the milestone.
3. Validate an authenticated multiplayer handoff when the user provides an account/server and authorizes the connection. Do not log in or accept agreements on their behalf without appropriate authorization.
4. Connect an existing local agent through MCP, or ask before installing Ollama/downloading a model if a real local-model test is wanted.

A possible development-only world bootstrap was investigated but **not implemented**. Existing cached mapped Minecraft jars can be inspected with Java tools; no new library is needed just to inspect the APIs. Computer-use tooling previously could not select the Java game window, so automated GUI gameplay remains unverified.

Combat, crafting, building, chest deposits, seamless reconnect/account transfer, and ordinary mouse/movement input automatically taking back control are not implemented. Single-player automation needs the game to stay running, unpaused, and the computer awake. A standalone bot cannot keep a closed single-player world running by itself.

## Commands that reuse existing tools

Run from the repository root:

```sh
git status --short
npm run check
npm test
npm start -- doctor
npm start -- demo --smoke
npm run build:mod
```

`build:mod` uses cached dependencies and offline Gradle by default. Missing caches must produce an error rather than a download. The built distribution is in `dist/mods/`, with installation instructions and checksums in `dist/`.

For an explicitly launched development game session:

```sh
npm run dev:mod
```

This uses cached assets and a development identity. It is not an authenticated launcher session. Close the game when finished.

## Files and architecture

| Location | Purpose |
| --- | --- |
| `README.md` | Usage, installation, limits, storage, and cleanup |
| `docs/protocol.md` | HTTP endpoints, ownership, actions, and state |
| `src/cli.js` | CLI entry point |
| `src/fabric-adapter.js` | HTTP client, lease heartbeats, action polling |
| `src/harness.js`, `src/operation-gate.js` | Node lease/job lifecycle and native operation serialization |
| `src/mineflayer-driver.js` | Server bot actions, observations, and survival |
| `src/agent.js`, `src/mcp.js` | Ollama planner and MCP interface |
| `src/config.js`, `src/runtime.js`, `src/bridge-server.js` | Paths, private files, process ownership, cleanup, HTTP serving |
| `mod/src/main/java/dev/minecraftagent/` | Fabric controller, client events, bridge, and Java lease/storage helpers |
| `scripts/` | Cached dependency setup, offline build wrapper, packaging, syntax checks |
| `test/`, `mod/src/test/` | Regression tests |

Local-only storage:

- `.gradle-user/`: Gradle distribution, dependencies, and Minecraft assets.
- `.deps/`: Baritone/Fabric jars and extracted native dependency.
- `.npm-cache/`, `node_modules/`: npm cache and dependencies.
- `.runtime/`: development bridge discovery, locks, server authentication caches, waypoints, and temporary test files.
- `mod/run/`: development game profile and worlds; cleanup preserves this directory.
- Installed normal game profiles use their own `config/minecraft-agent/` directory. `attach` stores a reference to their discovery file rather than copying its credentials.

Do not share `.runtime/bridge.json`, authentication caches, or other credential files with a different agent/machine as part of a text handoff. The source, README, protocol, this document, and Git history are enough for development context.

## Commit history

- `e0c5902` — Initial Minecraft player agent harness.
- `5178e8e` — Keep runtime files local and require explicit downloads.
- `8e3be15` — Prevent delayed actions from resuming after player handoff.

Keep this handoff updated when the implementation or validation status changes.
