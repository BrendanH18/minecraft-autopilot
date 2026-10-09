# Development guide

This guide covers project status, how to build and test, the live test environment, and implementation notes. For usage, see the [README](../README.md); for the bridge API, see [the protocol](protocol.md).

## Goal

Let a local agent take over the **same Minecraft Java character a person is already playing**. The agent can finish tasks or try to keep the character alive, and the player can take control back at any time. This works in single-player and multiplayer.

## Project rules

- **No implicit downloads.** Builds and dev launches use cached dependencies and fail with an error when something is missing. Downloading requires an explicit `--allow-downloads` flag (or `npm ci`) that the developer chooses to run.
- **Keep files in the repository.** npm, Gradle, Minecraft assets, development worlds, and runtime state live in ignored directories inside the checkout (see [Local storage](#local-storage)). No startup services or global packages.
- **Do not leave processes running.** Stop Minecraft, bridges, test servers, and bots after testing. Builds disable persistent Gradle daemons.
- **Treat credentials as secrets.** Never commit or share `.runtime/bridge.json`, `.runtime/auth/`, or a game profile's `config/minecraft-agent/bridge.json`.

## Setup from a fresh clone

Requires Node.js 22+ and Java 21. These commands download dependencies into the repository:

```sh
npm ci
npm run setup:mod -- --allow-downloads           # verified Baritone release
node scripts/gradle.js build --allow-downloads   # Gradle, Minecraft, Fabric, mappings
node scripts/package-mod.js --allow-downloads
```

After that, everyday commands run offline:

```sh
npm run check        # JavaScript syntax
npm test             # Node tests
npm start -- demo --smoke
npm run build:mod    # compile, Java tests, package to dist/
npm run dev:mod      # Fabric development client with a test identity
```

`dev:mod` checks that the Minecraft assets are cached and refuses to download them. The first `runClient` with downloads enabled must happen through `node scripts/gradle.js runClient --allow-downloads`.

## Status

**Implemented:**

1. **Fabric client mod** that controls the player already logged into Minecraft. It targets Minecraft Java 1.21.1, Java 21, Fabric Loader 0.16.14, Fabric API 0.116.17+1.21.1, and Baritone 1.11.3.
2. **Standalone server bot** (Mineflayer) with Microsoft device authentication, or explicit offline authentication for development servers.
3. **CLI and bridge:**
   - An authenticated localhost HTTP API.
   - Observations, home waypoints, navigation, collection, eating, and `guard`.
   - Emergency stop, `doctor`, profile `attach`, and selective cleanup.
4. **MCP stdio server:** observe, explicit takeover, validated actions, cancel, and stop.
5. **Local planner:** a bounded Ollama loop that chooses one structured action at a time.
6. **Simulation:** a deterministic demo that exercises the real HTTP adapter and CLI.

**Not implemented:**
- Combat, crafting, building, and chest deposits.
- Seamless reconnect or account transfer between the client and the bot.
- Automatic takeover from ordinary mouse or movement input.

Single-player automation needs the game running, unpaused, and the computer awake. A standalone bot cannot keep a closed single-player world running.

## Validation

**Automated tests:**
- Node tests cover bridge authentication, simulated actions, cancellation and lease races, MCP, the planner with mocked model replies, independent inventory/home criteria, Mineflayer driver races, partial collection recovery and failed returns, and a Minecraft protocol fixture. Run `npm test` for the current test count.
- Java tests: leases, bridge ownership, and runtime paths.
- `npm run build:mod` compiles against the pinned Minecraft, Fabric, and Baritone APIs.

**Live gameplay (October 2026)** used the Fabric development client and the bot against a local offline vanilla 1.21.1 server and a single-player world. Each item below was observed working:

- **Fabric, multiplayer:**
  - Observation, and takeover while the game was focus-paused.
  - `set-home` and `goto`.
  - `collect`, with quotas counting additional items (oak, birch, sand).
  - `eat`, and automatic eating during an action.
  - Low-health retreat home during `guard`.
  - Emergency `stop` from a second process.
  - Lease expiry about 7 s after the controlling CLI was killed.
  - A clean failure for an unreachable `goto`.
  - Release on death.
- **Fabric, single-player:**
  - Takeover of a paused world.
  - `set-home` and `collect`, ending back on the surface.
  - `goto` and `home`.
- **Fabric, with a person at the keyboard:**
  - F8 and Esc both return control.
  - Closing the menu does not restore agent control.
  - Clicking into the window keeps agent control.
- **Mineflayer bot, offline authentication:**
  - Observation, `set-home`, `goto`, and `collect` with the return trip.
  - `eat`, eating before retreating, and guard retreat.
  - Stop, lease expiry, and Ctrl+C disconnect.
  - Release on death, and refusal to join as a dead character.

**Not yet verified live:**
- Cobblestone collection, which needs a pickaxe.
- Threat observations with hostile mobs, and dimension changes.
- Microsoft-authenticated play, a normal launcher profile, and real Ollama inference.

## Known issues

- On join, the bot logs a non-fatal `PartialReadError` from Mineflayer's protocol library while it decodes a 1.21.1 recipe/armor-trim packet. Gameplay continues normally.
- Bot collection of logs high in trees is slow (about 45 s for 3) because of mineflayer-pathfinder think timeouts.
- One release during testing reported "a game menu was opened" after a window click, and it did not reproduce. Releases now log the screen class and window focus to diagnose a recurrence.

## Implementation notes

These are behaviors found during live testing that the code depends on:

- **Baritone drop tables.** Baritone 1.11.3 loads drop tables lazily in `BlockOptionalMeta$ServerLevelStub` and joins work scheduled on the client thread. A first mining command dispatched on that thread deadlocks the game. The mod starts the load at client startup and refuses `collect` until it finishes.
- **Focus pause.** Minecraft opens the pause menu whenever its window loses focus, for example when you switch to a terminal. The state reports `focusPaused`, and acquire closes only that menu.
- **Collection pits.** Mining often digs downward, and plain navigation never breaks blocks, so `collect` finishes by returning to its starting point with breaking allowed.
  - Fabric: Baritone, limited to 60 s.
  - Bot: walks for up to 20 s, then digs as a fallback within a 60 s return budget, because mineflayer-pathfinder replans after every broken block.
  - A low-health retreat during collection may also break blocks.
  - Exhausting reachable blocks triggers a return attempt even when the quota is unmet. Failed returns report a failed job; inventory progress is preserved. Manual handoff never starts a return trip.
- **Survival order.** Both backends eat before retreating, because health cannot regenerate while hungry.
- **Mineflayer details:**
  - `consume` can take up to 2.5 s to settle after cancellation. The adapter waits up to 10 s for `stopping` to clear before takeover.
  - `timers/promises` rejects with a generic `AbortError`, so the driver rethrows the signal's reason.
  - Joining as a dead character emits `death` but never `spawn`.
  - Each block attempt during collection is capped at 20 s.
- **Death screen.** Servers can send the death screen before the health update, so Fabric treats `DeathScreen` as death.
- **CLI version flag.** The CLI's own version flag is `-V, --cli-version` so that `server --version` reaches the subcommand.

## Live test environment

This setup uses the vanilla server jar that Loom caches during the build. Running a server requires accepting the [Minecraft EULA](https://aka.ms/MinecraftEULA).

```sh
mkdir -p .runtime/test-server && cd .runtime/test-server
cp ../../.gradle-user/caches/fabric-loom/1.21.1/minecraft-server.jar server.jar
echo eula=true > eula.txt   # only after reading and accepting the EULA
printf 'online-mode=false\nserver-ip=127.0.0.1\nlevel-seed=agenttest\nspawn-protection=0\n' > server.properties
: > console.in
tail -f console.in | java -Xmx2G -jar server.jar nogui > server.out 2>&1   # run in the background
# Admin commands: printf 'give PlayerName bread 4\n' >> console.in
```

- **Join the server:** `node scripts/gradle.js runClient -PquickPlay=127.0.0.1:25565`. To open a saved single-player world from `mod/run/saves` instead, use `-PquickPlayWorld=NAME`.
- **Usernames change:** the development username is random on each launch (`PlayerNNN`), so saved homes do not carry over between launches.
- **Fresh profiles:** a fresh `mod/run` profile shows the accessibility onboarding screen, and quick-play waits behind it. Put `onboardAccessibility:false` in `mod/run/options.txt` before the first launch.
- **Run the bot:** `npm start -- server --host 127.0.0.1 --account BotTester --auth offline --version 1.21.1`. Use `--bridge` with another discovery file to run it alongside the Fabric client.
- **Clean up:** stop the client, bot, `tail`, and server afterward. The test world is in `.runtime/test-server/world`.

## Files and architecture

| Location | Purpose |
| --- | --- |
| `src/cli.js` | CLI entry point |
| `src/fabric-adapter.js` | HTTP client, lease heartbeats, action polling |
| `src/harness.js`, `src/operation-gate.js` | Node lease/job lifecycle and native operation serialization |
| `src/mineflayer-driver.js` | Server bot actions, observations, and survival |
| `src/agent.js`, `src/mcp.js` | Ollama planner and MCP interface |
| `src/config.js`, `src/runtime.js`, `src/bridge-server.js` | Paths, private files, process ownership, cleanup, HTTP serving |
| `mod/src/main/java/dev/minecraftagent/` | Fabric controller, client events, bridge, and Java lease/storage helpers |
| `scripts/` | Dependency setup, offline build wrapper, packaging, syntax checks |
| `test/`, `mod/src/test/` | Regression tests |

### Local storage

All of these directories are ignored by Git:

- `.gradle-user/`: Gradle distribution, dependencies, and Minecraft assets.
- `.deps/`: Baritone jar and its extracted native dependency.
- `.npm-cache/`, `node_modules/`: npm cache and dependencies.
- `.runtime/`: bridge discovery, locks, server sign-in caches, waypoints, test servers, and temporary files.
- `mod/run/`: development game profile and worlds. Cleanup preserves this directory.
- `dist/`: packaged mod jars, install notes, and checksums.

Installed game profiles use their own `config/minecraft-agent/` directory. `attach` stores a reference to its discovery file rather than copying credentials.

## Suggested next work

The next milestone is **validated everyday use**. Complete these checks in order and record the Minecraft/backend/model versions and observed results here:

1. **Normal launcher installation and a real agent task.** Install the three packaged jars in a normal Fabric 1.21.1 profile. Save a home, record starting inventory, then ask a real Ollama or MCP agent to collect eight additional oak logs and return home. With Ollama, use `--verify-collect oak_log:8 --verify-home` to check the inventory increase and original home automatically. Verify released control independently of the agent's explanation. Repeat with partial collection, an unreachable return, and F8 during inference; a failed return must not report success, and no delayed action may resume after handoff.
2. **Microsoft-authenticated multiplayer handoff.** Record UUID and inventory in the normal client, disconnect, connect the bot, perform a bounded task, disconnect the bot, then reconnect the normal client. Verify the same UUID and server-side inventory, and confirm both clients were never connected simultaneously.
3. **Remaining gameplay coverage.** Validate cobblestone collection with a pickaxe, hostile-mob observations, and release on dimension change. Include partial collection recovery in a pit for both backends. The collection recovery changes have Node regression coverage but still need fresh live gameplay validation.

CI runs the simulation smoke check and packages the installation bundle after building the mod. Successful mod jobs upload `dist/` as the `minecraft-agent-installation` artifact.
