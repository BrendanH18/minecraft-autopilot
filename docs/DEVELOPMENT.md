# Development guide

This guide covers project status, how to build and test, the live test environment, and implementation notes. Start with the [README](../README.md), use the [usage guide](USAGE.md) for commands and troubleshooting, and read [CONTRIBUTING.md](../CONTRIBUTING.md) before changing code. The [protocol](protocol.md) documents the bridge API.

## Goal

Let a local agent take over the **same Minecraft Java character a person is already playing**. The agent can finish tasks or try to keep the character alive, and the player can take control back at any time. This works in single-player and multiplayer.

## Project rules

- **No implicit downloads.** Builds and dev launches use cached dependencies and fail with an error when something is missing. Downloading requires an explicit `--allow-downloads` flag (or `npm ci`) that the developer chooses to run.
- **Keep files in the repository.** npm, Gradle, Minecraft assets, development worlds, and runtime state live in ignored directories inside the checkout (see [Local storage](#local-storage)). No startup services or global packages.
- **Do not leave processes running.** Stop Minecraft, bridges, test servers, and bots after testing. Builds disable persistent Gradle daemons.
- **Treat credentials as secrets.** Never commit or share `.runtime/bridge.json`, `.runtime/auth/`, or a game profile's `config/minecraft-agent/bridge.json`.

## Setup from a fresh clone

Requires Node.js 22.12+ and a full Java 21 JDK (`java`, `javac`, and `jar` on PATH). These commands download dependencies into the repository:

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
npm run verify:mod   # verify the loose installation, pinned hashes, and ZIP (requires unzip)
npm run dev:mod      # Fabric development client with a test identity
```

`dev:mod` checks that the Minecraft assets are cached and refuses to download them. The first `runClient` with downloads enabled must happen through `node scripts/gradle.js runClient --allow-downloads`.

## Boat checks

Agents run builds, tests and the headless bot acceptance in a
[Boat](https://boat.dev) sandbox through `scripts/boat-check.sh`, not on the
development machine. It needs the `boat` CLI, signed in, plus `jq` and `git`.

```sh
scripts/boat-check.sh -- node --test test/harness.test.js   # a targeted check: any command
scripts/boat-check.sh                 # the full CONTRIBUTING.md list, to reproduce CI
scripts/boat-check.sh --fetch .runtime/live-acceptance -- npm run acceptance:bot -- --accept-eula --scenario withdraw
scripts/boat-check.sh --fetch dist -- 'npm run build:mod && npm run verify:mod'   # a verified bundle for the Mac
scripts/boat-check.sh --save          # the full list, then refresh the warm snapshot
scripts/boat-check.sh --status        # this worktree's sandbox
scripts/boat-check.sh --done          # delete it when the work ends
```

CI is the full check (owner decision, 2026-11-22): it runs every command in
the CONTRIBUTING.md list on the pushed commit, so agents run only targeted
checks here while working, such as the affected tests, `npm run lint`,
`npm run check`, `npm run lint:mod` or `node scripts/gradle.js test`. The full
list with no command is for reproducing a CI failure. See
[AGENTS.md](../AGENTS.md) for the cheap choices on each side.

Each worktree gets one long-lived sandbox, so a series of checks spends one of
the account's daily sandbox starts instead of one per check (owner decision,
2026-11-21). The account's daily starts (see `boat limits`) are shared by all
the owner's projects, and a `boat run` per check would spend one start and
reinstall everything each time. The first check
creates it from the saved snapshot `minecraft-autopilot-warm`, or from a bare
machine when there is none, names it
`minecraft-autopilot-check-<worktree>-<path hash>-<key>` (the account is shared by every
project), and records its id in `.runtime/boat-check/`.
Every check then pushes the working tree (tracked and untracked, non-ignored
files) into a new directory under `/home/user/checks/` and runs there with no
time limit. The three newest check directories are kept. `--fetch PATH`
copies `PATH` from the check directory to `.runtime/boat-check/<check>/` here.
A bot acceptance run also brings back its world, about 100 MB. Interrupting
the script interrupts the check in the sandbox too.

Caches that outlive a check live in `/home/user/mca-cache`, and each checkout
links to them: Gradle's user home (with the vanilla server jar), `.deps`, the
npm cache, and `node_modules` hard-linked from a copy keyed by
`package-lock.json`. When the lockfile changes, the script runs `npm ci`. When
the files that pin the mod's dependencies change (the same files as CI's
cache key), it runs the [fresh-clone setup](#setup-from-a-fresh-clone) with
downloads. It installs OpenJDK 21 if the sandbox lacks it. A bare sandbox goes
through all of this on its first check, in about three minutes. `boat push`
copies no Git metadata, so the script also sends a bundle of `HEAD`. Build
stamps and acceptance results then record the real commit and whether the
tree was modified.

The script stops the sandbox as soon as a check ends, and the next check
resumes it (owner decision, 2026-11-22; it used to idle for 45 minutes). A
stopped sandbox bills nothing. Boat keeps the machine, unbilled, for about 10
minutes after the stop, and a resume in that time (or while the sandbox still
reads `stopping`) takes it back without counting as a start. A later resume
counts as one start. While a check runs, the sandbox's auto-stop is 30
minutes, and a background keepalive renews it every 10 minutes only while the
script's own process is alive. If the script is killed outright, for example
by an agent's tool timeout, the renewals stop and Boat stops the sandbox within
30 minutes. The keepalive also gives up after `MCA_BOAT_MAX_CHECK` seconds
(default 7200), so a hung check can't keep a sandbox up indefinitely. The exit
trap that stops the sandbox is armed before the script creates or resumes it,
so a run that fails part way still stops it. `MCA_BOAT_IDLE=<seconds>` keeps
the sandbox up that long after a check instead of stopping it.
Sandboxes start with `--no-env`, so none of the
account's stored logins, tokens or keys go in. They also start with
`--fail-fast`: a start that finds no machine ready fails without counting, and
the script tries six times, 5 seconds apart. Such a failed resume can leave
Boat busy for a moment, answering the next attempt with "resume already in
progress"; the script waits 10 seconds before retrying that, and reuses the
sandbox if the earlier resume finished after all. When the plan's included starts are
used up, the script refuses to pay for extra ones unless `MCA_BOAT_PAID_STARTS=1`.
Other settings are `MCA_BOAT_KEY`, which gives a second agent sharing a
checkout its own sandbox, and `MCA_BOAT_TYPE` (default `default`: 4 vCPUs,
8 GB). There are also `MCA_BOAT_SNAPSHOT` and `MCA_BOAT_KEEP_CHECKS`. A check holds a per-sandbox lock, so two runs never
share a sandbox at once.

`--save` runs the full CONTRIBUTING.md list and, if it passes, saves the sandbox as the warm
snapshot, without check directories. The sandbox remains available for this
worktree's later checks. Re-run it after changes to dependencies or the
toolchain. The interactive Minecraft client, packaged Fabric acceptance,
authenticated handoff and Ollama runs stay on the Mac, and the script refuses
`dev:mod`, `runClient` and model options.

The one client run allowed in a sandbox is the headless
[Fabric development client mode](LIVE-ACCEPTANCE.md#fabric-development-client-mode)
of the live runner (`npm run acceptance:fabric`). For that command the remote
script installs Xvfb, Mesa and xdotool (which presses keys for the `--takeover` scenarios) if they're missing, checks the client asset cache with
`downloadAssets --allow-downloads`, which fetches only missing objects, and runs the command
under `xvfb-run`. Mesa's llvmpipe gives OpenGL 4.5 core in software, which is
enough for Minecraft 1.21.1. The client's low render settings keep it to about
a fifth of a core when idle on the default 4 vCPU, 8 GB sandbox.

## Status

**Implemented:**

1. **Fabric client mod** that controls the player already logged into Minecraft. It targets Minecraft Java 1.21.1, Java 21, Fabric Loader 0.20.1, Fabric API 0.116.18+1.21.1, and Baritone 1.11.3.
2. **Standalone server bot** (Mineflayer) with Microsoft device authentication, or explicit offline authentication for development servers.
3. **CLI and bridge:**
   - An authenticated localhost HTTP API.
   - Observations, home waypoints, navigation, collection, eating, chest deposits, and `guard`.
   - Emergency stop, `doctor`, profile `attach`, and selective cleanup.
4. **MCP stdio server:** observe, explicit takeover, validated actions, cancel, and stop.
5. **Local planner:** a bounded Ollama loop that chooses one structured action at a time.
6. **Simulation:** a deterministic demo that exercises the real HTTP adapter and CLI.

**Not implemented:**
- Combat, building, smelting, and crafting beyond the [allowlisted basic recipes](USAGE.md#craft-items).
- Seamless reconnect or account transfer between the client and the bot.
- Automatic takeover from ordinary mouse or movement input.

Single-player automation needs the game running, unpaused, and the computer awake. A standalone bot cannot keep a closed single-player world running.

## Validation

**Automated tests:**
- Node tests cover bridge authentication, simulated actions, cancellation and lease races, MCP, the planner with mocked model replies, independent inventory/home criteria, Mineflayer driver races, partial collection recovery and failed returns, and a Minecraft protocol fixture. Run `npm test` for the current test count.
- Java tests: leases, bridge ownership, runtime paths, isolated action/retreat deadlines and failed-eating backoff, storage transfer/slot selection, pending-opening cancellation/acknowledgements, and when a walk home or back to an inspection start has arrived. The controller enforces deadlines before food handling; these helper tests do not replace game integration checks.
- `npm run build:mod` compiles against the pinned Minecraft, Fabric, and Baritone APIs.

**November reliability changes** have automated regression scenarios for bot mining-timeout recovery and takeover during recovery, combined gather-and-store verification without duplicate quotas, refreshed storage baselines/final contents, failure to inspect storage, and handoff during storage opening. The planner refreshes known storage before its baseline and final deposit check; ordinary observations remain cached and carry read timestamps. Full Fabric controller/game behavior and these new failure scenarios still require the current packaged candidate's live acceptance in [RELEASE.md](RELEASE.md).

**Release candidate pre-checks (26 November 2026).** In Boat, clean commit
`3fca55b` built and verified (`sourceModified: false`, archive SHA-256
`93c8fd5bb8aad60b19bf71690e8b3c354684e386bc0a17c91e8a6f7fa6705c9f`). It ran
with Minecraft 1.21.1, Fabric Loader 0.20.1, Fabric API 0.116.18+1.21.1,
Baritone 1.11.3, Mineflayer 4.39.0, Node 24.22.1 and OpenJDK 21.0.13.1.
`acceptance:bot --all` passed 28 scenarios and skipped the two real-model ones,
in 19 min 16 s. The development client passed all 25
`acceptance:fabric --fast` scenarios in 10 min 49 s. In `--takeover`, 29 of 31
scenarios passed in 18 min 27 s; the two storage-screen-close items are the
known expected failures. In `recovery-timeout` the bot stopped at its mining
deadline with 16 of 64 logs and reported a failed return, which matched the
server position. On `main` (`cea1ec8`), `--all` failed three runs out of three. About 14 minutes in,
`withdraw-no-candidate`'s `forceload` got no reply within 15 s, and the
remaining 17 scenarios failed with it. Thread dumps showed the server thread
waiting on a region file while the sandbox took about 100 ms per synchronous
write. The runner's test server now sets `sync-chunk-writes=false`, with a
regression test. These are pre-checks, not release evidence: the packaged
Fabric and bot review boxes in [RELEASE.md](RELEASE.md) stay open.

**Packaged jars and the disconnect rejoin, headless (26 November 2026).** In
Boat, `npm run acceptance:fabric -- --packaged --fast` ran all 27 `--fast`
scenarios on the three jars from the release archive with Fabric Loader in
production mode (Loom's production client run on the official client jar,
remapped to intermediary at launch). All 27 passed in 10 min 34 s. Four
takeover scenarios (`f8-collect`, `stop-goto`, `menu-collect`,
`takeover-while-stopping-deposit`) also passed under `--packaged` in 2 min 6 s.
Loader loaded 57 mods, the nested nether-pathfinder 1.6 among them, and the
client log had no mixin, refmap or linkage errors. No packaging bugs were found.
`disconnect-collect` now rejoins after the kick through the disconnect screen
and Direct Connection. It passed three runs out of three (55 to 62 s each,
about 5 s of that the rejoin), and nothing resumed after the rejoin. The
`--takeover` count is unchanged: 32 of 34 pass and the two
`menu-storage-close*` items are expected failures. These runs used an
uncommitted tree. They are pre-checks, not release evidence: a development
launcher isn't a normal launcher profile, and Xvfb key presses aren't a person
at the keyboard.

**Eating, retreat, full inventory and takeover while stopping (26 November
2026).** In Boat, on `318a213` plus this branch's changes, the four new
runner scenarios (`eat-timeout`, `low-health-retreat`, `eat-retreat-timeout`,
`collect-full-inventory`) passed on both the bot and the Fabric development
client. On Fabric, explicit `eat` of 30-second bread timed out after 5.6 s, the
next automatic attempts started 9.8 s and 10.0 s after the previous failure,
and the walled-in retreat failed with "Survival retreat timed out." 60.0 s
after it started. The bot runs found that the bot had no eating backoff: a
wounded bot holding food it couldn't eat retried at once, never retreated, and
refused actions meanwhile. It now waits 10 s after a failed attempt, as Fabric
does, with regression tests. `--fast` now runs 27 scenarios in 4 min 12 s;
`eat-timeout` and `eat-retreat-timeout` are left out of it. The three
`takeover-while-stopping-*` Fabric items are now scripted through a pausable
loopback proxy that holds the server's replies after the agent clicks the
container. The full `--takeover` run passed 32 of 34 scenarios in 17 min 38 s,
and the two storage-screen-close items are still the expected failures. These
are pre-checks, not release evidence.

**Fast bot acceptance (26 November 2026).** In Boat, two runs of
`npm run acceptance:bot -- --accept-eula --fast` on commit `87cde78` passed
all 25 scenarios in 4 min 19 s and 4 min 18 s, including server startup and
shutdown. The second run also had an uncommitted docs edit. That meets the
roadmap's five-minute target. The same preset took 12 min 2 s on `cea1ec8`
earlier that day. Its timings showed that 19 of the 25 scenarios spent about
19.5 s each stopping a bot that had already left the game. Mineflayer 4.39's
window waits, such as `openContainer`, leave a 20-second timer running after
the window opens, and it kept the stopped bot process alive. The `server`
command now exits as soon as a signal has closed the bridge, the driver and
the connection. Time outside the recorded scenario steps, nearly all of it
stopping bots, fell from 367 s to 10 s across the run. Starting bot sessions fell from 146 s to 28 s. The runner now
checks for a ready session every 200 ms instead of every 500 ms, but that
accounts for only a few seconds of the drop. The rest wasn't isolated.
Scenarios, fixtures, fresh bot sessions and server reads are unchanged. Most
of the remaining time is gameplay in `collect-and-store`, `stale-removal`,
`blocked-lid` and the two inspection scenarios. `results.json` now records
each run phase under `timings` and how long each cleanup step took. The
Fabric dry run and a Fabric `withdraw` run still passed. With the release-candidate fix above also merged, `--all` passed 28
scenarios (two real-model ones skipped) in 13 min 25 s, down from 19 min 16 s,
and the three `recovery-*` scenarios passed on their own.

**Fabric development-client pre-checks (25 November 2026).** In Boat, the
development client of clean commit `88dc26d` passed all 25
`npm run acceptance:fabric -- --fast` scenarios in 9 min 28 s, and all three
`recovery-*` scenarios. The mining timeout stopped at 18 of 64 logs and
returned to within 1.4 blocks of the start. A lease cancel during the return settled in 300 ms and
an emergency stop in 601 ms; server positions didn't move afterwards. Before
the fix for [#78](https://github.com/BrendanH18/minecraft-autopilot/issues/78),
`inspect-preserves-home` failed every run; with it, it passed three runs out
of three and the `--fast` run, ending 0.75 blocks from home. These are pre-checks, not
release evidence: the packaged Fabric boxes in [RELEASE.md](RELEASE.md) stay open.

**Acceptance tooling follow-up (21 November 2026).** All 11 new bot scenarios
passed in Boat on vanilla Minecraft 1.21.1 with Mineflayer 4.39.0, Node 24.22.1,
and OpenJDK 21.0.13.1 from a modified checkout. The eight new Fabric fixtures
were exercised on the same vanilla server with an offline Mineflayer client.
Independent server reads confirmed the storage and inventory setup, the
prepared blocks, and the hunger and poison effects. The resulting retreat
instructions start a wait job before asking the operator to apply poison.
Packaged Fabric gameplay and authenticated handoff still require acceptance.

**Model scenario smoke test (21 November 2026).** In Boat, the
`withdraw-craft-model` scenario passed against vanilla Minecraft 1.21.1 with
Mineflayer 4.39.0, Node 24.22.1, and OpenJDK 21.0.13.1. A loopback HTTP
endpoint supplied scripted responses to the planner. Independent server
reads confirmed that three cobblestone left the chest, all 20 oak logs
remained, and the player held one stone pickaxe and nothing else. Acceptance
with a real local Ollama model remains open.

**Fast bot acceptance (21 November 2026).** A development run in Boat passed
all 13 scenarios against offline vanilla Minecraft 1.21.1 with Mineflayer
4.39.0, Node 24.22.1, and OpenJDK 21.0.13.1 on Linux x64. It took 13 min 31 s
including server startup and shutdown. The roadmap's five-minute target was
still open then; the 26 November entry above meets it. The run checked
collection, storage verification, withdrawal, and crafting. See [the bot runner guide](LIVE-ACCEPTANCE.md) for the preset and
workflow artifacts.

**Fabric fixture helper (21 November 2026).** In Boat, all 14
[fixture setups](LIVE-ACCEPTANCE.md#fabric-fixtures) started on vanilla
Minecraft 1.21.1 with OpenJDK 21.0.13.1. An offline Mineflayer 4.39.0 client
joined each server to trigger player setup. Server reads confirmed the starting
inventory, position, container stock, both halves of the double chest, and the
empty crafting-table placement area. All servers shut down cleanly, including
one Ctrl+C and one end-of-input test. These results cover fixture setup and
server reads. Packaged Fabric gameplay still requires the release checklist.

The `takeover` and `cobblestone-hostiles-dimension` fixtures also ran in Boat
on the same Minecraft, Java, and Mineflayer versions. Server reads confirmed
the oak logs and mining fatigue, cobblestone and an iron pickaxe, the husk's
position, and a teleport onto the prepared Nether platform. The packaged
client actions and release of control still need to be observed in game.

**Offline bot acceptance (20 November 2026)** used Mineflayer 4.39.0, Node
24.22.1, and OpenJDK 21.0.13.1 on Linux x64 against a fresh offline vanilla
Minecraft 1.21.1 superflat world in Boat. Server jar SHA-256 was
`e3bc55693e93cda0188f2e60aea28113fc647c5e85a15fa3d1b347349231b4bb`.
A clean `1b1d7f4` run of `npm run acceptance:bot -- --accept-eula --all`
passed all ten offline scenarios in 15 min 5 s. The real Ollama scenario was
skipped. The results and vanilla console log showed the following:

- Mining timed out after 180 s with 15 of 64 logs collected. The return
  attempt ended after about 5 s and reported failure. The server placed the
  bot 9.3 blocks from its start with all 15 logs still held.
- Lease cancellation and emergency stop interrupted pit recovery. The bridge
  settled in 94 ms and 399 ms respectively. The bot held 16 and 15 logs,
  and its server position stayed fixed across all three samples in each run.
- The combined collect, deposit, and home criteria passed with eight more logs
  in the seeded chest and the cobblestone untouched. Stale removal during
  scripted inference and a blocked lid both prevented success. Final
  inspection returned to within one block of home with the step in place,
  and reported failure when the step was removed.
- The exact withdrawal moved eight logs into inventory and preserved the five
  cobblestone in the chest. The reported chest baseline matched the server.
- Crafting was intermittent on `1b1d7f4`. A separate run stopped at four of
  twelve planks with two logs still held. Moving the result directly into
  inventory and refreshing the crafting window between crafts passed six
  consecutive replays, including a clean checkout of `4b2e42c`. Each ended
  with both pickaxes, three planks, and exactly one placed crafting table.

The [release checklist](RELEASE.md) still calls for final-candidate review,
the remaining bot withdrawal and crafting cases, real-model runs, MCP on
Fabric, packaged Fabric gameplay, and authenticated handoff.

**Offline withdrawal and crafting follow-up (20 November 2026).** A clean
`f0eecd8` run in Boat with the same Minecraft server jar, Mineflayer, Node,
and Java versions passed all eight targeted scenarios. The omitted count
moved all 84 logs across two stacks. The out-of-range chest stayed untouched
after the bot confirmed it had loaded the chest's chunk. Short stock and
limited inventory room reported 20 of 24 and 4 of 8 logs withdrawn,
respectively, matching the server reads. Both refused crafts preserved all
ingredients. Exact withdrawal and the two-pickaxe bootstrap passed again.
The results await human review for the release checklist.

**Live gameplay (October 2026)** used the Fabric development client and the bot against a local offline vanilla 1.21.1 server and a single-player world. Each item below was observed working:

These are historical observations, not acceptance results for the latest release candidate. The [release checklist](RELEASE.md) requires fresh checks of the current packaged code.

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

**Fabric storage checks (11 November 2026)** used the development client on the pinned Minecraft 1.21.1/Fabric/Baritone stack against a local offline vanilla server. Independent server `data get` queries confirmed an exact deposit of 8 from 20 logs (8 stored, 12 held), followed by an omitted-count deposit of the remaining 12 (20 stored). After externally removing the stored logs, `inspect-storage` reported empty contents. A blocked chest lid failed after approximately five seconds. A barrel with room for four logs failed a request for ten with four confirmed deposited and six retained. The final candidate also deposited into a double chest reported as one inventory with both member coordinates. F8 stopped an active large-chest transfer; independent server reads seven seconds apart showed no further deposits. Escape during a wait returned control, and closing the menu did not resume the session. A follow-up navigation check used a walled passage with a closed wooden door: Baritone opened it, deposited eight logs beyond it, and a fresh inspection through the reclosed door returned within two blocks of its starting position. Component-selection checks put named logs before ordinary logs in inventory: a full barrel with room only in ordinary logs accepted the later compatible stack, and an earlier empty barrel slot stayed empty when a compatible partial stack could be filled. Independent server reads confirmed the named logs stayed with the player. These development results do not close the normal-launcher, packaged-artifact, authenticated-handoff, or real-model/MCP Fabric acceptance gates.

**Real Ollama and bot checks (20 October 2026)** used Ollama 0.40.6 on Apple silicon with `qwen3.5:4b-mlx` (`61aa3858e9d3`, MLX runner) and `granite4.2:3b` (`40577dc168a3`, llama.cpp runner). The task was "Collect eight additional oak logs and return home" with `--verify-collect oak_log:8 --verify-home`. Simulation runs started from a fresh demo bridge with a home at the origin and 8 logs already held. Live runs used the Mineflayer bot on the local offline server. Every run ended in manual control.

| Model | Backend | Thinking | Result |
| --- | --- | --- | --- |
| qwen3.5:4b-mlx | Simulation | Off | `criteria_met`, 4 decisions, 11 s |
| qwen3.5:4b-mlx | Simulation | On | `criteria_met`, 4 decisions, 60 s |
| qwen3.5:4b-mlx | Bot | Off | `criteria_met`, 3 decisions, 127 s (9 → 19 logs, 1.0 block from home) |
| qwen3.5:4b-mlx | Bot | On | `criteria_met`, 4 decisions, 370 s (28 → 42 logs). The first `collect` hit the 180 s job limit, then a second `collect` finished. |
| granite4.2:3b | Simulation | Off/On | Exit 2. It answered `done` with a plan, then looped on `goto`. Its `set_home` attempt was refused. |
| granite4.2:3b | Bot | Off | Exit 2 (`step_limit`). It never chose `collect` and repeated `goto` to its own position until the step limit. |

Use `qwen3.5:4b-mlx` or a stronger model; granite4.2:3b does not follow this action format. `--no-thinking` was 5× faster for qwen with the same result.

These runs found and fixed:
- **Model safeguards.** Models answering `done` with a plan, a planner `set_home` overwriting the player's home, and repeated no-op actions.
- **Ollama limits.** The llama.cpp runner ignoring the `oneOf` output schema, and Ollama's 4096-token default context.
- **Navigation.** mineflayer-pathfinder reporting `goto` success without arriving, and the bot wedging on a block edge.

The same session also verified these with the bot:
- A `home` to a point in mid-air fails with "Could not reach…".
- A bot wedged on a block edge (x = 32.3) hops free and returns home.
- `collect cobblestone` without a pickaxe fails before moving.
- With a pickaxe one use from breaking, `collect cobblestone 3` stops at 1/3 and returns to the start.
- A summoned zombie at 4.3 blocks appears in `threats`, while a skeleton at 18 blocks does not.
- A Nether teleport during `guard` releases control immediately with "World or dimension changed."

**Real MCP agent check (27 October 2026)** used Claude Code 2.1.312 in headless mode (`claude -p --strict-mcp-config`) with only the five Minecraft MCP tools allowed. The MCP server was `node src/cli.js mcp` against the Mineflayer bot as a fresh offline account on the local server (peaceful, daytime). The agent was asked to observe, take control, save a home, collect 3 additional sand, verify, stop, and confirm manual mode. It called `minecraft_observe` → `minecraft_take_control` → `set_home` → `collect` sand 3 → `minecraft_observe` → `minecraft_stop` → `minecraft_observe`. The raw tool results showed inventory going from empty to 3 sand and the bot ending 1.97 blocks from home. A separate CLI `observe` then confirmed the 3 sand and `manual` mode independently of the agent, and the MCP server process exited with the client.

**Chest deposits with the bot (27 October 2026)** used the Mineflayer bot as a fresh offline account on the local 1.21.1 server. Containers were placed and inspected with server commands, and every result below was confirmed with the server's `data get block`, not the bot's report.
- A double chest is one container in observations. Depositing 8 of 20 oak logs and then the remaining 12 from 10 blocks away put 20 logs in the chest; the 5 cobblestone already in the other half stayed.
- A barrel with room for 4 logs failed `deposit oak_log 10` with "deposited 4 of 10"; 6 logs stayed in inventory.
- A broken barrel disappears from `containers`.
- A stone block on the chest lid fails the deposit with "did not open" after 5 s without leaving the bridge stopping. After the lid is cleared, the next deposit succeeds.
- `qwen3.5:4b-mlx` (`--no-thinking`) ran "Collect eight additional oak logs, then store them in the nearby chest." with `--verify-deposit oak_log:8`. It returned `criteria_met` in 5 decisions and 123 s (goto, goto, collect 8, deposit, done; the first goto was unreachable). The server showed the chest going from 30 to 38 logs.

Live testing found and fixed: a chest already in reach failed when the bot first tried to stand next to it; the pathfinder giving up planning ("Took to long to decide path") after walking most of the way; a full container reporting every item as deposited because leftovers sit on the cursor until the window closes; and the model sending collect's block as `item`.

**Faster bot log collection (27 October 2026)** was benchmarked on the local offline server from a restored world snapshot. A fresh offline bot was teleported to the same spot with an empty inventory and ran `collect oak_log N`; times include the return trip.

| Quota | Before | After |
| --- | --- | --- |
| 8 logs | 86.4 s, 92.7 s | 52.7 s, 52.8 s |
| 16 logs | 125.3 s | 91.2 s |

Instrumentation showed where the time went. Each unreachable log cost a 5 s planning timeout, and walking to a mined block high in the air cost up to 10 s. Digging by hand takes about 3 s per log and is unchanged.

**Not yet verified live:**
- Cobblestone, hostile observations, dimension changes, and partial collection in a pit with the Fabric client.
- Microsoft-authenticated play and a normal launcher profile.
- A real MCP agent with the Fabric client.

## Known issues

- On join, the bot logs a non-fatal `PartialReadError` from Mineflayer's protocol library while it decodes a 1.21.1 recipe/armor-trim packet. Gameplay continues normally.
- Bot log collection is bounded by digging by hand (about 3 s per log) and by logs it cannot reach high in trees. After the October 2026 speedup, 8 logs took 53 s and 16 took 91 s from the test spot. Once nearby trees are gone, a large quota can still exceed the harness's 180 s job limit; the task can recover with another `collect`.
- minecraft-data 3.117.0 maps 1.21.1 entity attributes with the 1.20.5 IDs; for example, movement speed is labelled `generic.step_height`. prismarine-physics uses its own step height and default speed, so bot movement is unaffected.
- An idle server bot in manual mode has no reflexes. During testing, a skeleton killed it between runs. Respawn it in the regular client, then reconnect the bot.
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
- **Survival order.** Both backends eat before retreating, because health cannot regenerate while hungry. After failed food use (Fabric gives up after 5 s, Mineflayer's `consume` after 2.5 s), both back off automatic eating for 10 s, so food that can't be eaten never defers a retreat.
- **Mineflayer details:**
  - `consume` can take up to 2.5 s to settle after cancellation. The adapter waits up to 10 s for `stopping` to clear before takeover.
  - `timers/promises` rejects with a generic `AbortError`, so the driver rethrows the signal's reason.
  - Joining as a dead character emits `death` but never `spawn`.
  - Each block attempt during collection is capped at 20 s.
  - Deposits open the container from wherever it is in reach (4 blocks from the eyes), and walk with `GoalGetToBlock` otherwise. They count stored items from the container window, because a failed transfer leaves the remainder on the cursor until the window closes.
  - Withdrawals reuse that approach and count from the window too. `bot.inventory` is only synced from an open container window when it closes, so room is read from the window's own player slots, and each click sequence moves at most one stack and no more than fits: items left on the cursor would be dropped on the ground when the window closes. They call `bot.transfer` directly because `window.withdraw` refuses whenever the stale `bot.inventory` has no empty slot, even if a matching stack has room.
  - Crafting fills the grid one ingredient at a time and checks cancellation between clicks. The grid uses a minecraft-data recipe shape filled from what `planCraft` consumes, which allows mixed planks or stone. The bot checks inventory room before crafting, shift-clicks each result directly into inventory, and waits for the server to refresh the window before starting another craft or closing the table. A held crafting table is placed with `placeBlock` on an air block beside the feet that has solid ground and does not overlap the 0.6-wide player.
  - Planning a path to a collection target gets 2 s instead of the pathfinder's 5 s default. An unreachable log high in a tree used to burn the full 5 s; a block that times out is retried with the full budget only after quicker blocks run out.
  - After mining, the bot walks to where the drop lands (the first solid block below), not to the mined block, which may be in the air. Walking to a point in the air cost up to 10 s per log.
- **Death screen.** Servers can send the death screen before the health update, so Fabric treats `DeathScreen` as death.
- **CLI version flag.** The CLI's own version flag is `-V, --cli-version` so that `server --version` reaches the subcommand.

## Live test environment

[`npm run acceptance:bot`](LIVE-ACCEPTANCE.md) automates this recipe for the bot recovery and storage checks (roadmap step 4). It needs `--accept-eula`, writes results under `.runtime/live-acceptance/`, and its results become evidence only after review. Record sessions with [`mc-agent acceptance`](ACCEPTANCE.md).

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
| `src/objective.js` | Independent inventory and home verification for explicit planner criteria |
| `src/config.js`, `src/runtime.js`, `src/bridge-server.js` | Paths, private files, process ownership, cleanup, HTTP serving |
| `mod/src/main/java/dev/minecraftagent/` | Fabric controller, client events, bridge, and Java lease/storage helpers |
| `scripts/` | Dependency setup, offline build wrapper, packaging, syntax checks, Boat checks |
| `test/`, `mod/src/test/` | Regression tests |

### Local storage

All of these directories are ignored by Git:

- `.gradle-user/`: Gradle distribution, dependencies, and Minecraft assets.
- `.deps/`: Baritone jar and its extracted native dependency.
- `.npm-cache/`, `node_modules/`: npm cache and dependencies.
- `.runtime/`: bridge discovery, locks, server sign-in caches, waypoints, test servers, temporary files, and the Boat check sandbox id and fetched results (`.runtime/boat-check/`).
- `mod/run/`: development game profile and worlds. Cleanup preserves this directory.
- `dist/`: packaged mod jars, install notes, and checksums.

Installed game profiles use their own `config/minecraft-agent/` directory. `attach` stores a reference to its discovery file rather than copying credentials.

## Suggested next work

The next milestone is **validated everyday use**. The [roadmap](ROADMAP.md) sets priorities and the [release checklist](RELEASE.md) is the acceptance record. Complete these checks in order and record the Minecraft/backend/model versions and observed results here:

1. **Normal launcher installation and a real agent task.** Install the three packaged jars in a normal Fabric 1.21.1 profile. Save a home, record starting inventory, then ask a real Ollama or MCP agent to collect eight additional oak logs and return home. With Ollama, use `--verify-collect oak_log:8 --verify-home` to check the inventory increase and original home automatically. Verify released control independently of the agent's explanation. Repeat with partial collection, an unreachable return, and F8 during inference; a failed return must not report success, and no delayed action may resume after handoff.
2. **Microsoft-authenticated multiplayer handoff.** Record UUID and inventory in the normal client, disconnect, connect the bot, perform a bounded task, disconnect the bot, then reconnect the normal client. Verify the same UUID and server-side inventory, and confirm both clients were never connected simultaneously.
3. **Remaining gameplay coverage.** Validate cobblestone collection with a pickaxe, hostile-mob observations, and release on dimension change. Include partial collection recovery in a pit for both backends. The collection recovery changes have Node regression coverage but still need fresh live gameplay validation.

CI runs on GitHub-hosted standard runners (`ubuntu-24.04`) for pushes to `main`, pull requests, a weekly schedule, and manual dispatch. The Node job runs actionlint on the workflows, the Biome lint, the syntax check, tests, and the simulation smoke check. The mod job caches `.gradle-user/` and `.deps/`, builds once with `--allow-downloads` (the build includes the Spotless Java format check), then rebuilds from a clean output with the offline `npm run build:mod` and runs `npm run verify:mod`, so a build step that would need an implicit download fails CI. The weekly run skips the mod cache to catch broken upstream downloads. Successful mod jobs on pushes to `main`, the weekly schedule, and manual runs upload the offline-built `dist/` as the `minecraft-agent-installation` artifact, kept for 7 days; pull requests build and verify it without uploading. The non-required `Fabric acceptance` workflow runs the headless Fabric client under Xvfb on `ubuntu-24.04`: `--fast` on pull requests that touch the mod, the Fabric side of the CLI or the runner, and `--fast`, `--takeover` and `--packaged --fast` weekly or on demand. It uploads `results.json`, the server log and the client log for 7 days. Like `bot-acceptance`, its results are pre-checks, never release evidence. Dependabot proposes grouped weekly updates for npm, the Gradle build in `mod/`, and GitHub Actions; the Baritone and Fabric API jars pinned by hash in `scripts/` are updated by hand. The [v0.1 release checklist](RELEASE.md) tracks shipping scope, live acceptance checks, and how to publish the verified archive.
