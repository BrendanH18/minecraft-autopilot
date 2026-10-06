# Agent handoff

Updated 2026-10-05. This records the state after the live-validation milestone that follows `7fc5817`; check `git status` and later commits before continuing.

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

## Latest milestone: live gameplay validation

The user approved running the **already cached** vanilla 1.21.1 server jar as a local offline test server and accepting its EULA for that purpose. Live testing found and fixed:

- **Collection froze the game.** Baritone 1.11.3 loads drop tables in `BlockOptionalMeta$ServerLevelStub`'s static initializer and then joins work scheduled on the client thread. Our first `mineByName` ran on that thread, so it deadlocked. The mod now triggers that load at client startup and refuses `collect` (with a retry message) until it has finished.
- **Takeover failed after switching to a terminal.** Minecraft opens the pause menu when its window loses focus. Fabric now reports `focusPaused`, and acquire closes only that menu.
- **Bot reflexes were in the wrong order.** At low health and low hunger, the Mineflayer bot retreated without eating, so health never regenerated and every action was interrupted. It now eats first, matching Fabric.
- **Commands failed with "still stopping" after a released reflex.** The adapter now waits up to 10 s for `stopping` to settle before takeover.
- **`server --version 1.21.1` printed the CLI version and exited.** The CLI's own version flag is now `-V, --cli-version`.
- **A refused bot connection kept the CLI alive for 30 s** and printed the raw error to stdout. Both are fixed.
- Death now reports "player died" instead of "a game menu was opened" (Fabric) or "The operation was aborted" (bot). The bot's survival status also returns to `Ready` after a reflex.

### Follow-up session with the user at the keyboard

- **Collection stranded the player in its own pit.** In single-player, Fabric collected sand by digging down five blocks. After that, `home` (which never breaks blocks) failed with "No path".
  - Both backends now finish `collect` by returning to the starting point. Fabric uses Baritone with breaking allowed and a 60 s limit.
  - The bot walks first, then falls back to digging movements. mineflayer-pathfinder replans after every broken block and sometimes reports "Took to long to decide path", so digging is a slow fallback.
  - A low-health retreat during collection may also break blocks.
  - Failing to return does not turn a completed quota into a failure; the message says the player could not return.
- **The bot collection loop had no per-block bound.** One block stalled for about 60 s live. Each block attempt is now capped at 20 s; the stall did not reproduce afterward.
- **A dead character made `server` wait for the full 2-minute timeout.** Mineflayer emits `death` and never `spawn`; the bot now fails immediately with respawn instructions.

## Previous milestone: cancellation and handoff

Commit `8e3be15` fixed delayed work after handoff:

- Queued actions check cancellation and ownership before dispatch.
- `OperationGate` serializes Mineflayer native operations and tracks them until they actually settle, even if their caller has already cancelled.
- A late inventory reply cannot trigger follow-on consumption after release. New takeover is refused while old work is still stopping.
- Idle world/player/dimension changes release the Node bridge lease.
- Closing the HTTP adapter during slow acquisition releases a late lease instead of restarting its heartbeat.
- Adapter shutdown interrupts polling/action waits; concurrent submissions are rejected.

There is **no uncommitted implementation in progress** at this handoff. The next work is live gameplay validation, then fixing any issues it reveals.

## Validation completed and its limits

**Live gameplay (2026-10-05)** ran against a local offline vanilla 1.21.1 server with mob spawning disabled. Every item below was observed working after the fixes above.

- **Fabric development client over multiplayer:**
  - Observation and takeover from the focus-paused state.
  - `set-home` and `goto` (about 13 blocks in under 5 s).
  - `collect` with additive quotas (oak 3, then +2 = 5), plus birch and sand.
  - `eat`, and automatic eating during `goto`.
  - Low-health retreat home during `guard`.
  - Emergency `stop` from a second process.
  - Lease expiry about 7 s after the controlling CLI was SIGKILLed.
  - A clean "No path" failure for an unreachable goto.
  - Release on death.
- **Fabric single-player world** (created by the user):
  - Takeover from a genuinely paused, focus-paused world.
  - `set-home`, and `collect sand` ending back on the surface.
  - `goto`, and `home`.
  - Eat and retreat were not repeated here: there was no food, and cheats were off.
- **Mineflayer bot, offline auth:**
  - Connect and observe, `set-home`, `goto`, and `collect`.
  - `eat`, plus eat-before-retreat at low health and hunger.
  - Guard retreat, emergency stop, lease expiry, Ctrl+C disconnect, and release on death.
  - The death *message* fix is covered by the protocol fixture test, not re-run live.
- **With the user at the keyboard (Fabric):**
  - F8 returned control, and the CLI's `guard` exited.
  - Esc returned control (`GameMenuScreen`, window focused). Closing the menu did not restore agent control.
  - Clicking into the game window while the agent had control kept agent control. One earlier session was released as "a game menu was opened" after a click, and it did not reproduce. Releases now log the screen class and window focus, and the message includes the screen name.
- **Still not verified live:**
  - Cobblestone (needs a pickaxe), threat observations with hostile mobs, and dimension changes.
  - Microsoft-authenticated play, an installed launcher profile, and Ollama.
- The bot logs a non-fatal `PartialReadError` from Mineflayer's protocol library while decoding a 1.21.1 recipe/armor-trim packet on join. Gameplay continued normally.

Earlier validation:

- After live validation, **31 Node tests pass**, and the mod builds and packages offline. At `8e3be15`, 25 Node tests passed, JavaScript syntax checks passed, and `git diff --check` passed.
- At `5178e8e`, the Fabric mod built and packaged offline, and the Java unit tests passed. The latest milestone changed only Node code/tests and protocol documentation.
- A real Fabric development client was previously launched successfully. Baritone and its native library loaded, and the authenticated bridge answered from the **main menu** with no world connected. The client was stopped afterward.
- A real Mineflayer connection was tested against a local **Minecraft protocol fixture**, checking identity, home persistence, and release on death. This fixture is not a complete Minecraft server/gameplay test.
- Planner tests use mocked model replies. No real Ollama inference was validated.

**Not yet verified:** movement, mining, eating, survival retreat, or F8 handoff inside a real Minecraft world; Microsoft-authenticated multiplayer; normal launcher/profile installation; or gameplay with a real local model. Do not describe those as proven working.

## Live test environment

Everything stays under `.runtime/` and `mod/run/`. No downloads are needed on this machine.

```sh
mkdir -p .runtime/test-server && cd .runtime/test-server
cp ../../.gradle-user/caches/fabric-loom/1.21.1/minecraft-server.jar server.jar
echo eula=true > eula.txt   # user approved accepting the Minecraft EULA for this local test server
printf 'online-mode=false\nserver-ip=127.0.0.1\nlevel-seed=agenttest\nspawn-protection=0\n' > server.properties
: > console.in
tail -f console.in | java -Xmx2G -jar server.jar nogui > server.out 2>&1   # run in the background
# Admin commands: printf 'give PlayerName bread 4\n' >> console.in
```

- Join with `node scripts/gradle.js runClient -PquickPlay=127.0.0.1:25565`, or open a saved single-player world with `-PquickPlayWorld=NAME`. The development username is random for each launch (`PlayerNNN`), so saved homes do not carry over between launches.
- A **fresh** `mod/run` profile shows the accessibility onboarding screen, and quick-play waits behind it. Seed `mod/run/options.txt` with `onboardAccessibility:false` before the first launch.
- Background jobs started by an agent tool may have a time limit; a server that silently stops shows up as "Disconnected."
- Run the bot with `npm start -- server --host 127.0.0.1 --account BotTester --auth offline --version 1.21.1`.
- Stop the client, bot, `tail`, and server afterward. The test world is in `.runtime/test-server/world`.

## Suggested next work

1. If an unexplained "game menu was opened" release recurs, check the logged screen class. Bot collection of high logs is slow (about 45 s for 3) because of pathfinder think timeouts.
2. Validate an authenticated multiplayer handoff when the user provides an account/server and authorizes the connection. Do not log in or accept agreements on their behalf without appropriate authorization.
3. Connect an existing local agent through MCP, or ask before installing Ollama/downloading a model if a real local-model test is wanted.

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
- `7fc5817` — Document project status and constraints for agent handoff.
- Live-validation fixes — Fix issues found in live gameplay validation (this milestone).

Keep this handoff updated when the implementation or validation status changes.
