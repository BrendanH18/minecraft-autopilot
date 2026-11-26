# Live bot acceptance runner

`scripts/live-bot-acceptance.js` automates [roadmap](ROADMAP.md) step 4, "Recheck bot recovery and verification live", against a local vanilla 1.21.1 server. It starts the server, builds each fixture with console commands, drives the Mineflayer bot through the repository CLI and bridge client, checks every outcome with independent server `data get` reads, and writes a JSON results file.

**Scope.** This covers the standalone **server bot** only. It does not cover the Fabric mod, a normal launcher, F8, or authenticated client → bot → client handoff; those [release](RELEASE.md) boxes stay open regardless of these results. The same scenarios can also run against the Fabric development client as a pre-check; see [Fabric development client mode](#fabric-development-client-mode).

**Results are not acceptance evidence by themselves.** A run produces machine-checked observations. They count toward a RELEASE.md box only after a person reviews the results file and `server.out`, confirms the fixtures behaved as intended, and records the commit, configuration, and outcome in [DEVELOPMENT.md](DEVELOPMENT.md#validation).

## Requirements

- Node.js 22.12+ with dependencies already installed (`npm ci` was run earlier).
- A full Java 21 JDK on `PATH`, or `--java PATH`.
- The vanilla server jar that Loom caches during the mod build: `.gradle-user/caches/fabric-loom/1.21.1/minecraft-server.jar` (or `--server-jar PATH`). Build the mod once as described in the [development guide](DEVELOPMENT.md#setup-from-a-fresh-clone).
- A free local port (default 25566).

The runner never downloads anything. It refuses with a pointer to DEVELOPMENT.md when Java 21 or the jar is missing, and refuses to write `eula=true` unless you pass `--accept-eula` after reading the [Minecraft EULA](https://aka.ms/MinecraftEULA).

## Running

```sh
node scripts/live-bot-acceptance.js --dry-run --all            # print every command and check; starts nothing
node scripts/live-bot-acceptance.js --dry-run --fast
node scripts/live-bot-acceptance.js --dry-run --json --scenario craft-mixed-stone
node scripts/live-bot-acceptance.js --accept-eula --scenario collect-and-store
node scripts/live-bot-acceptance.js --accept-eula --fast
node scripts/live-bot-acceptance.js --accept-eula --all
node scripts/live-bot-acceptance.js --accept-eula --scenario stale-removal-model --model YOUR_LOCAL_MODEL [--no-thinking]
node scripts/live-bot-acceptance.js --accept-eula --scenario withdraw-craft-model --model YOUR_LOCAL_MODEL [--no-thinking]
```

Choose one of `--scenario ID` (repeatable), `--all`, or `--fast`. The fast preset
runs offline collection, storage, withdrawal, crafting, and dimension-change scenarios. It
omits the three pit recovery scenarios and scenarios that require a real model.
Use `--dry-run --json` to read the selected fixtures, actions, and checks as structured data.

Other options include `--port N`, `--out FILE` (default `results.json` in the run
directory), `--account NAME` (offline username, default `LiveBot`), `--java PATH`,
`--model NAME` and `--ollama URL` for model scenarios, and `--keep-server`. Use
distinct ports and, if supplying `--out`, distinct output files for concurrent
runs.

Agents run it in Boat through the [Boat check script](DEVELOPMENT.md#boat-checks),
which also copies the results back:
`scripts/boat-check.sh --fetch .runtime/live-acceptance -- npm run acceptance:bot -- --accept-eula --fast`.
A `--fast` run takes about 4.5 minutes in Boat, and a full offline `--all`
run took about 15 minutes. The three pit
scenarios each wait out the bot's 180-second mining deadline. See the
[observed results](DEVELOPMENT.md#validation).

The [Bot acceptance workflow](../.github/workflows/bot-acceptance.yml) runs
`--fast` weekly on a GitHub-hosted `ubuntu-24.04` runner, and on pull requests
that change `src/`, the scenario runner (`scripts/live-bot-acceptance.js`,
`scripts/live-acceptance/`), the server jar setup (including the `mod/` Gradle files), the npm dependencies or the
workflow itself. `--fast` leaves out the three long-running `recovery-*`
scenarios. To run it on demand, select **Bot
acceptance** in GitHub Actions and choose **Run workflow**. Download the
`bot-acceptance` artifact to review `results.json` and `server.out`. The artifact
is kept for seven days, including when a scenario fails and produces evidence.

## What a run does

1. Creates a private `.runtime/live-acceptance/run-<id>/` directory, copies the jar into its `server/` subdirectory, and writes `eula.txt` and `server.properties` (offline mode, `127.0.0.1`, fixed seed, superflat world, spawn protection 0, peaceful, and the tick watchdog off so a slow or swapping host cannot kill the server mid-run). The server creates a fresh world in that directory.
2. Starts `java -jar server.jar nogui` with stdin as the console and mirrors all output to `server.out`. Readiness is the `Done (…s)! For help` line; the reported version must be 1.21.1.
3. Applies world rules: peaceful, no daylight/weather cycle, no mob spawning, random tick speed 0, time 1000, clear weather.
4. For each scenario, in its own 64-block lane (beyond the bot's 48-block collection search): force-loads the lane, builds the fixture, starts a **fresh bot session** with `node src/cli.js --bridge <run-dir>/bridge.json server --host 127.0.0.1 --port N --account LiveBot --auth offline --version 1.21.1` and sets `MC_AGENT_HOME` to `<run-dir>/agent-home`. Then it resets the player, teleports it, and waits until the bridge and server agree on its position and inventory.
5. Runs the scenario, then always sends a bridge emergency stop, removes the fixture, and stops the bot process — also after a failed check, an exception, or Ctrl+C.
6. Stops the server (`stop`, then SIGTERM/SIGKILL if needed), captures the final Git state, writes the results file, and prints the paths to it and `server.out`. The report includes the log path even when `--out` puts the report elsewhere. Run directories are retained for review and accumulate on disk.

Independent verification uses only server console reads: `data get block X Y Z Items`, `data get entity NAME Inventory`, `data get entity NAME Pos`, and, for blocks without data such as a crafting table, `execute if block X Y Z BLOCK` ("Test passed" or "Test failed"). The bot's own reports are compared against them, never trusted alone.

Ctrl+C stops the current scenario, cleans up its fixture even with `--keep-server`, skips the rest, stops the server, and writes results. The interrupt sequence has unit coverage with fake processes. A second Ctrl+C exits immediately and kills the child processes. After a normal run, `--keep-server` retains fixtures, keeps the server running with every bot session stopped, and forwards console commands until Ctrl+C or end of input.

## Scenarios

| ID | Fixture and action | Passes when | RELEASE.md box |
| --- | --- | --- | --- |
| `recovery-timeout` | Stone plateau with a 3×3, nine-deep oak-log shaft. Mining fatigue I; `collect oak_log 64`. | Job `failed` with "Collection timed out before reaching the requested quota"; the return attempt starts after ≈180 s and ends within 60 s (+10 s polling slack); server inventory holds more logs than before and matches the reported `Inventory: N/T` and the bridge; the reported return (or failure to return) agrees with server `Pos`. | "Force a bot mining timeout in a real pit…" (return, failure, inventory); bot half of "Run collection with partial progress and recovery from a pit…" |
| `recovery-cancel` | Same pit. When progress reports the return trip, wait 1 s, then cancel with the lease (`/v1/cancel`, as MCP cancel does). | Job `cancelled` by the agent; no job running or stopping within 5 s; three server `Pos` reads 1.5 s apart differ by ≤ 0.2 blocks; bridge and server positions agree; inventory preserved. | "…immediate cancellation during recovery" |
| `recovery-stop` | Same pit. During the return trip run `node src/cli.js --bridge … stop` from a second process. | As above, plus control returns to `manual`. | "…immediate cancellation during recovery" |
| `collect-and-store` | Chest pre-seeded with 5 cobblestone and 3 oak logs; 18 logs nearby; player holds 4 logs. Agent with criteria collect `oak_log:8`, deposit `oak_log:8`, home. | `criteria_met` with `refreshed` deposit evidence; server chest +8 logs, cobblestone untouched; net server increase across inventory and chest ≥ 8; agent counts equal server counts; server `Pos` within 2 blocks of home. | "Run collect-and-store with both criteria." |
| `stale-removal` | As above; while the agent awaits its `done` decision, `data remove block … Items` empties the chest. | Not `criteria_met`; deposit evidence `refreshed`; the agent's stored count equals the server's (no cached +8). | "Remove stored items during inference … stale contents must not produce success." |
| `blocked-lid` | As above; while the agent awaits `done`, a stone block is placed on the chest lid. Then a direct `inspect_storage`. | Not `criteria_met`; the deposit check carries "did not open"; the server shows the 8 logs really were stored; direct inspection fails. | "…and block inspection; stale contents must not produce success." |
| `inspect-preserves-home` | Home on a two-high platform with one step; empty chest 9 blocks away (out of reach, within 16). Agent: deposit 8 → home → done. | `criteria_met`; the home check is met after the final inspection walked to the chest and back; agent home distance matches server `Pos` (±0.5); chest +8. | "Verify final inspection preserves return-home criteria…" |
| `inspect-return-blocked` | Same platform; while the agent awaits `done`, the step is removed so the platform becomes a one-way drop. | Not `criteria_met`; an inspection error or unmet home is reported; agent home distance matches server `Pos`. | "…or reports failure." |
| `stale-removal-model` | Store fixture with a **real local model** (`--model`). The first model request after a completed deposit also empties the chest, concurrently with the inference. | `criteria_met` only if the refreshed server chest really holds +8; otherwise any non-success; stored counts agree with the server. Skipped without `--model`. | "Remove stored items during inference…" with an actual model |
| `withdraw` | Chest two blocks from the start, seeded with 20 oak logs and 5 cobblestone. `withdraw oak_log 8`. | Job completes and names the chest. The server shows eight logs moved to inventory and cobblestone preserved. The job's container baseline and bridge observations agree with server reads. | Bot withdraw and craft, exact count. |
| `withdraw-omitted` | Chest holds 84 logs in two stacks and 5 cobblestone. `withdraw oak_log`. | Job completes. The server shows all 84 logs moved to inventory and cobblestone preserved. | Bot withdraw and craft, omitted count. |
| `withdraw-no-candidate` | Seeded chest outside 16 blocks. The bot sees a nearby oak-log marker in the chest's chunk before `withdraw oak_log 8`. | Job fails without a candidate. The server shows the player's position, inventory, and chest contents stayed the same. | Bot withdraw and craft, no candidate. |
| `withdraw-short-stock` | Chest holds 20 logs. `withdraw oak_log 24`. | Job fails and reports 20 of 24 transferred. The server shows all 20 logs moved to inventory and cobblestone preserved. | Bot withdraw and craft, short container. |
| `withdraw-full-inventory` | Player holds 60 logs and 35 full stacks of cobblestone. `withdraw oak_log 8`. | Job fails and reports 4 of 8 transferred. The server shows 16 logs in the chest, 64 held, and cobblestone preserved. | Bot withdraw and craft, full inventory. |
| `craft-bootstrap` | Open ground, no crafting table; player holds 3 oak logs and 3 cobblestone. `craft oak_planks 12` → `crafting_table 1` → `stick 4` → `stone_pickaxe 1` → `wooden_pickaxe 1`. | Every craft `completed` and reports its amount; server inventory holds 1 stone pickaxe, 1 wooden pickaxe, and 3 planks with no logs, cobblestone, sticks, or crafting table left; `execute if block` finds no table on the eight blocks beside the start before, and exactly one after, at the block the `stone_pickaxe` job reported placing; the `wooden_pickaxe` job reuses it; bridge inventory agrees with the server. | Bot withdraw and craft, inventory-grid and table recipes and held-table placement. |
| `craft-missing-ingredients` | Player holds 2 oak logs. `craft oak_planks 12` needs 3. | Job fails with `Missing ingredients`; the server still shows both logs and no planks. | Bot withdraw and craft, missing ingredients. |
| `craft-full-inventory` | Player holds 2 oak logs and 35 full cobblestone stacks. `craft oak_planks 4` would consume one log, leaving every slot occupied. | Job fails with `Inventory full`; the server still shows all the starting items and no planks. | Bot withdraw and craft, full inventory. |
| `withdraw-craft-model` | Player holds two sticks near a crafting table and a chest with 5 cobblestone and 20 oak logs. A local model (`--model`) withdraws 4 cobblestone and crafts one stone pickaxe. | Agent reports `criteria_met` for both `--verify-withdraw cobblestone:1` and `--verify-craft stone_pickaxe:1`. The server shows a pickaxe and one cobblestone in inventory and one cobblestone and 20 oak logs in the chest. A separate bridge observation shows manual control. Skipped without `--model`. | Bot withdraw and craft, real-model workflow. |
| `deposit-barrel-exact` | Player holds 12 logs. `deposit oak_log 8` into a barrel holding logs and cobblestone. | The barrel gains exactly 8 logs, retains all cobblestone, and the player keeps 4 logs. | Bot storage verification, barrel. |
| `deposit-full-chest` | Every chest slot holds a full cobblestone stack. `deposit oak_log 8`. | Job reports a full chest and zero moved. Inventory and chest contents stay the same. | Bot storage verification, full chest. |
| `deposit-double-chest-omitted` | Each half of a double chest has one free slot. `deposit oak_log` with 80 held. | Both halves gain logs. Their combined gain is 80 and all cobblestone remains. | Bot storage verification, both chest halves and omitted count. |
| `deposit-over-held` | Player holds 4 logs. `deposit oak_log 8`. | Job reports that the player holds too few logs. Chest and inventory stay the same. | Bot storage verification, insufficient items. |
| `withdraw-barrel-exact` | Barrel holds 20 logs and 5 cobblestone. `withdraw oak_log 8`. | Job names the barrel and its correct baseline. The server shows exactly 8 logs moved. | Bot withdraw and craft, barrel. |
| `withdraw-no-matching-stock` | Chest holds cobblestone only. `withdraw oak_log 8`. | Job reports zero logs moved. Chest retains all cobblestone and inventory stays empty. | Bot withdraw and craft, missing item. |
| `craft-rounds-up` | Player holds 3 oak logs. `craft oak_planks 5`. | Job reports eight planks from two whole crafts. One log remains. | Bot withdraw and craft, whole crafts. |
| `craft-mixed-planks` | Player holds one oak and one birch plank. `craft stick 4`. | Server inventory holds four sticks and both planks were consumed. | Bot withdraw and craft, mixed inventory-grid inputs. |
| `craft-mixed-stone` | Player holds one each of cobblestone, blackstone, and cobbled deepslate plus two sticks. `craft stone_pickaxe 1` beside a table. | Server inventory holds one pickaxe and the existing table remains. | Bot withdraw and craft, mixed table inputs. |
| `craft-reuses-consumed-slot` | Player holds one log and 35 full cobblestone stacks. `craft oak_planks 4`. | The planks occupy the slot freed by the log. All cobblestone remains. | Bot withdraw and craft, full inventory with room after consumption. |
| `craft-no-table` | Player has the inputs for a stone pickaxe with no crafting table held or nearby. | Job reports that a table is required. The server confirms the inputs remain. | Bot withdraw and craft, missing table. |
| `cobblestone-hostiles-dimension` | The bot starts with an iron pickaxe near eight cobblestone blocks and two enclosed husks. The server teleports the bot to a Nether landing pad during navigation. | Server inventory confirms at least four cobblestone. The bridge includes the husk within 16 blocks. Navigation is cancelled on the dimension change and control returns to manual. Server position reads confirm the bot stays on the landing pad. | Bot half of the cobblestone, hostile observations, and dimension-change gate. |

### Collect-and-store without a model

The `agent` command always needs an Ollama model; there is no deterministic CLI routine that applies `--verify-collect`/`--verify-deposit`/`--verify-home`. The storage scenarios therefore call the same exported `runAgent` the CLI uses, in process, against the bot's bridge, with a **scripted planner** supplied as its model transport. No model or network is involved; the decisions are fixed (for example collect 8 → deposit 8 → home → done), while the criteria checks, each deposit's reported container baseline, the task-scoped final `inspect_storage`, the `done` rejections, and the bridge actions are the production code paths. The "during inference" changes happen while the agent is awaiting that scripted decision, which is the same window a model's inference occupies. The real-model variant is `stale-removal-model`; it is never simulated.

## Results file

```text
schema, startedAt, finishedAt
review: { reviewed: false, note }          # a person sets this when they accept the run
scope                                      # bot only; not Fabric or authenticated handoff
environment: { commit, dirty, node, java, platform, javaPreflight, sourceAtFinish: { commit, dirty } }
minecraft: { expectedVersion, serverVersion, jar, jarSha256, serverLog, serverLogSha256, seed, levelType }
options: { port, account, keepServer, model, noThinking, scenarios }
scenarios[]: { id, title, release[], requiresModel, status: pass|fail|skipped, reason,
               startedAt, durationMs, steps[], observations{}, checks[], cleanup[] }
timings: { serverStartMs, worldSetupMs, scenariosMs, serverStopMs, totalMs }
summary: { pass, fail, skipped, error }, error
```

`steps` record every console command, bridge/CLI action, and read with timing and outcome. Each `cleanup` entry also has a `durationMs`, and `timings` gives the wall time of each run phase (`null` for a phase the run never reached), so a slow run shows where its time went. `observations` hold baselines, final server state, job progress, agent verification, and position samples. `checks` list each pass/fail criterion with expected and actual values. `jarSha256` hashes the copied jar used to start the server. Candidate evidence requires the same clean source commit at the start and finish.

Cleanup failures fail the affected scenario. If the runner cannot stop the bot, it records the failure and skips the remaining scenarios. Failed runs include the last available bot output alongside the server log. A run exits unsuccessfully if it cannot hash the server log after shutdown or records zero passing scenarios, including a selection made up entirely of real-model scenarios without `--model`.

## Reviewing a run

Use the archive's `sourceCommit` from `dist/BUILD.json` to review one or more
runner results together:

```sh
npm start -- acceptance review-bot --commit "$candidate_commit" offline/results.json model/results.json
```

The JSON report shows `pass`, `fail`, `skipped`, or `missing` for each runner
scenario, with separate offline and real-model totals for each gate. Each
outcome points to its results file. `serverLogPath` uses the runner's recorded
log when available. For a copied `results.json`, the reviewer uses the
adjacent `server/server.out` if its SHA-256 matches the recorded log. The most
recently finished run that attempted a scenario takes precedence. A skip is
shown if no run attempted that scenario.
Unreadable, malformed, dirty, and different-commit files are listed under
`rejected`, and the command exits unsuccessfully if any file was rejected.
Passing scenarios must contain passing checks and identify the Minecraft
server version and jar SHA-256, and their server log must match its recorded
SHA-256. The reviewer rejects older passing runs without final Git provenance
and can still report runs containing only failed or skipped scenarios.
Real-model scenarios also identify the
configured model. The report lists all distinct server jar hashes so reviewers
can see which configurations the supplied runs cover. The report covers the
runner's share of the bot gates. A person records the sessions and signs off.

For each scenario, confirm in the results and `server.out` that the fixture built as intended (no command errors), the bot was in the expected place, and the checks reflect the RELEASE.md wording, not only that they passed. In particular: the pit run really timed out (not "No reachable matching blocks remain"), the cancel landed during the return trip, and storage changes happened before the final inspection. Then record the commit, jar checksum, server/bot/model configuration, scenario, and result in DEVELOPMENT.md before ticking a box.

## Known limitations

- The console reply patterns and SNBT formats are specific to vanilla 1.21.1. Check `server.out` when a console command fails or times out.
- The pit fixture relies on mining fatigue slowing Mineflayer's digging so 64 logs cannot be reached in 180 s. If the bot exhausts the shaft or reaches the quota, `recovery-timeout` fails rather than passing.
- The harness's overall `collect` deadline is the job limit + 75 s: the driver's 60 s return budget, which starts after the 180 s mining deadline, plus a 15 s margin. A `recovery-timeout` failure with "Action timed out." means the return overran that margin and should be reviewed as a finding.
- Cancellation races: if the return trip finishes before the cancel lands, the cancel scenarios fail with "interrupt issued while recovery was running".
- Server output is matched one command at a time. If a command times out, the console reader stops issuing commands so a late reply cannot be attributed to a later read. Timeouts are recorded in `steps`.

## Fabric development client mode

`--backend fabric` (or `npm run acceptance:fabric --`) runs the same scenarios
against the Fabric **development client** instead of the bot. It is a pre-check:
it finds Fabric bugs before the packaged keyboard sessions, so those sessions are
spent on what only a person can check.

```sh
npm run acceptance:fabric -- --dry-run --fast
npm run acceptance:fabric -- --accept-eula --scenario craft-bootstrap
npm run acceptance:fabric -- --accept-eula --fast
```

For each scenario the runner builds the fixture, then starts a fresh client with
`node scripts/gradle.js runClient -PquickPlay=127.0.0.1:PORT -PdevUsername=LiveFabric -PclientRunDir=RUN/client`
(the run directory is passed relative to `mod/`).
The client joins the runner's server as the offline player `LiveFabric` (or
`--account`). Its game directory is inside the run directory, with an
`options.txt` that turns off pause on focus loss, first-run screens, sound and the
narrator. `MC_AGENT_HOME` points at the run's `agent-home`, where the mod writes
`bridge.json`. The checks and independent `data get` reads are the same as the
bot's. The client is stopped after each scenario, so no scenario sees another's
opened containers, saved home or last job.

- **Not release evidence.** The results use their own schema,
  `minecraft-agent/live-fabric-acceptance/1`, and each `release` entry starts with
  `pre-check only`. `acceptance review-bot` rejects these files. The RELEASE.md
  Fabric boxes still need the packaged jars in a normal launcher.
- **Needs the cached client.** `scripts/gradle.js` runs offline and refuses if the
  Minecraft assets aren't cached. Run `node scripts/gradle.js downloadAssets --allow-downloads`
  once to cache them; on the Mac that needs approval first. The Boat check
  caches them on its own.
- **Needs a display.** On the Mac the client opens a window for each scenario.
  Leave it in the background: the client doesn't pause when it loses focus, and
  focusing it doesn't take over control. Don't press keys in it. In a Boat
  sandbox, `scripts/boat-check.sh -- npm run acceptance:fabric -- --accept-eula --fast`
  runs it headless under Xvfb with software OpenGL. See [Boat checks](DEVELOPMENT.md#boat-checks).
- **Waits for the game to be playable.** After joining, Fabric reports
  `paused` while the terrain-loading screen is open. Settling waits for that to
  clear, because the mod refuses actions until it does.
- **Output.** `client/client.out` collects every session's Gradle and game
  output, and the results file records its path and SHA-256 under `client`.
  Minecraft's own log is `client/logs/latest.log`, and it only covers the last
  session.
- **Slow starts.** Each scenario waits up to ten minutes for the bridge, because
  Gradle starts again every time. Settling at the start position allows 60
  seconds, not 15, because the client has to load the teleported chunks.
- **Results.** On 25 November 2026 all 25 `--fast` scenarios passed, in about
  ten minutes, and so did the three `recovery-*` scenarios, which `--fast`
  leaves out (run them with `--scenario`; each takes about 3.5 minutes).
  `inspect-preserves-home` used to end five blocks from home
  ([#78](https://github.com/BrendanH18/minecraft-autopilot/issues/78)); its
  results now record the server `Pos` before each planner request.
- **Not covered.** The packaged mods folder, the normal launcher and handoff
  can't be scripted here. F8, menus, stop, expiry, death and dimension changes
  are covered as pre-checks by the [takeover scenarios](#takeover-scenarios).

### Takeover scenarios

`--takeover` (Fabric only) runs the [Fabric checklist](LIFECYCLE-SCENARIOS.md#fabric-checklist)
items that need no person, so the keyboard session starts from known results.
Each scenario has the checklist item's id (`f8-idle`, `menu-collect`,
`expiry-goto`, ...) and takes its expected outcome from
[`src/lifecycle-scenarios.js`](../src/lifecycle-scenarios.js). They live in
[`scripts/live-acceptance/takeover-scenarios.js`](../scripts/live-acceptance/takeover-scenarios.js).

```sh
npm run acceptance:fabric -- --dry-run --takeover
scripts/boat-check.sh --fetch .runtime/live-acceptance -- npm run acceptance:fabric -- --accept-eula --takeover
scripts/boat-check.sh --fetch .runtime/live-acceptance -- npm run acceptance:fabric -- --accept-eula --scenario f8-collect --scenario stop-goto
```

- **How the transitions happen.** Keys are real X key presses: `xdotool`
  focuses the client window on the Xvfb display and presses F8, Escape or E
  (Tab and Enter press Respawn on the death screen). A key counts only when the
  bridge then shows the transition. "Waiting for model inference" is the
  in-process agent with a scripted planner whose first request is held open.
  For `expiry-idle` the real `mc-agent agent` runs as a second process against a
  loopback stand-in for Ollama, and is suspended with SIGSTOP. `mc-agent stop`
  and `mc-agent job` run as separate processes, `expiry-goto` kills
  `mc-agent goto` with SIGKILL, and server commands kill, kick, teleport to the
  Nether or fill the last inventory slot.
- **What is checked.** The bridge mode and job message from the lifecycle
  table; independent `data get` reads 1 s after the transition and 5 s later
  (position, inventory, `foodLevel`, `Dimension`, both halves of the chest);
  that the old lease can neither heartbeat nor act; and that a new session is
  refused while the player is dead or disconnected, runs only when explicitly
  started (`wait 1`), or, after a cancel, that the same lease goes on.
- **Retries.** Eating lasts 1.6 s, so an eat scenario repeats (up to three
  times) when the food is eaten before the key lands. Escape reaches a storage
  screen only while the agent has it open, which is about one tick per stack, so
  `menu-storage-close` and `menu-storage-close-withdraw` repeat up to four times
  when Escape opens the pause menu instead.
- **Not in `--fast`.** Each scenario starts its own client, so `--takeover`
  takes about 18 minutes in Boat (31 scenarios). On Fabric, `--all` includes them.
- **Needs Xvfb and xdotool.** The scenarios refuse to run without `$DISPLAY` or
  `xdotool`; the Boat check installs both. Don't run them on the Mac.
- **Not proof for the packaged gates.** Synthetic key presses on Xvfb reach the
  development client through XTEST, not a person's keyboard in a normal
  launcher with the packaged jars. `fabric-f8-takeover` and the RELEASE.md
  boxes still need the keyboard sessions; `acceptance review-bot` rejects these
  results like any Fabric result.
- **Not scripted.** The three `takeover-while-stopping-*` items need a server
  slow enough to leave a container opening unanswered, and the loopback server
  replies within a tick. `disconnect-collect` doesn't rejoin after the kick.
- **Results (25 November 2026).** On the development client in Boat, 29 of the
  31 scenarios pass and `menu-storage-close` and `menu-storage-close-withdraw`
  are expected failures (`XFAIL`): the agent's container screen opens and
  closes within one frame, so no key press reaches it. Escape lands between
  stacks instead, and that path is checked. An expected failure is reported
  and counted apart from failures, and doesn't fail the run, but only when the
  key-press and job-message checks are the only ones that failed. The first runs
  found two Fabric bugs, now fixed: a takeover key press (F8) or the pause
  menu between storage stacks was lost, so the transfer went on, and a new
  session at the death screen was refused as "paused" instead of asking the
  player to respawn.

## Fabric fixtures

The fixture helper starts a fresh vanilla 1.21.1 server for a packaged Fabric
session and prepares one scenario. It uses the same cached jar and Java
requirements as the bot runner. The server binds to loopback in offline mode,
and setup clears the named player's inventory in this disposable world.

```sh
npm run acceptance:fabric-fixtures -- --dry-run
npm run acceptance:fabric-fixtures -- --dry-run --scenario deposit-double-chest --player YourName
npm run acceptance:fabric-fixtures -- --scenario deposit-double-chest --player YourName --accept-eula
```

1. Use `--dry-run` to print all fixture commands and independent reads, or
   select one with `--scenario`. Dry runs require neither a server jar nor
   EULA acceptance.
2. For a live run, enter the exact Minecraft profile name with `--player`.
   Join `127.0.0.1:25567` from the packaged Fabric profile when prompted.
   Override the port with `--port` if needed. The helper waits up to five
   minutes for that player, teleports and equips them, and prints the
   server's baseline reads. It also saves the timestamped baseline to
   `checkpoints.json` in the fixture run directory.
3. Once it prints `Fixture ready`, use `mc-agent observe` in a separate
   terminal to confirm the CLI is attached to your Fabric profile. Follow the
   [Fabric checklist](LIFECYCLE-SCENARIOS.md#fabric-checklist), including any
   additional player setup it calls for. At each observation point, enter
   `read <label>` in the fixture terminal to run and save the same independent
   reads, for example `read after-f8` and `read five-seconds-later`. A checkpoint
   records the time range, each command, and each value or error. Manual server
   commands still work in the fixture terminal. Wait for the fixture command
   confirmation in chat before starting the next observation. If the session
   ends during a read, the checkpoint saves completed reads and marks itself
   interrupted. Use a fresh
   run for each alternative or retry. Use a different `--port` for each run
   in the same client session, or restart the Minecraft client before
   reusing an address. Fabric remembers storage observations by server
   address while the client is open.
4. Enter `stop` or press Ctrl+C to stop the server. The world and
   `server.out` are retained under `.runtime/live-fabric-fixtures/run-*/server/`.
   Keep `checkpoints.json` from the run directory alongside the server log.
   Record the relevant checkpoint reads and the separate CLI observations in
   the candidate's acceptance session.

| Fixtures | Setup and reads |
| --- | --- |
| `takeover` | Oak logs and mining fatigue give the operator time to press F8, open and close the inventory, or send emergency stop during mining. For expiry, use `kill -9 <pid>` on the controlling CLI during navigation and verify that the lease expired and cancelled the job. Use fresh runs and compare server inventory and position five seconds apart after each interruption. The inference check uses a real local model. |
| `cobblestone-hostiles-dimension` | Cobblestone blocks, an iron pickaxe, and a stationary husk enclosed in glass. Read player inventory after collection and compare `mc-agent threats` with server positions. During the printed navigation run, enter the provided teleport command to land on a prepared Nether platform. Verify that the dimension change cancelled the job and repeat the player position and dimension reads. |
| `pit` | Bot runner's oak-log shaft and mining fatigue, with player inventory and position reads before collection and after recovery. |
| `deposit-chest`, `deposit-barrel`, `deposit-full-chest`, `deposit-double-chest` | Three stacks of logs and nearby storage. The single chest setup also prints the contents-removal and blocked-lid commands for fresh inspection. The double chest prints item reads for both halves. |
| `deposit-blocked-chest` | A stone block over the lid before the first deposit. Read the lid, chest contents, and player inventory to verify the failure leaves all counts unchanged. |
| `deposit-return` | The bot runner's elevated home and chest out of reach. Optionally remove the step once the player is back at home to test the blocked return. |
| `inspect-scoped-storage` | Deposit into a chest and barrel, then change the barrel stock and block the chest. The barrel-only refresh must read the changed count and preserve the start position. A chest-only refresh must report failure. |
| `withdraw`, `withdraw-omitted`, `withdraw-no-candidate`, `withdraw-short-stock`, `withdraw-full-inventory` | The bot runner's stocks, distances, and player inventories, with independent chest and player reads. |
| `craft-bootstrap`, `craft-missing-ingredients`, `craft-full-inventory` | Start with the bot runner's supplies. Bootstrap also reads the possible crafting-table placement blocks before and after crafting. |
| `withdraw-craft-model` | A stocked chest, crafting table, and two sticks for a real Ollama run with withdrawal and crafting criteria. |
| `mcp-collection` | A single oak log and an iron axe for an actual MCP agent to collect, with independent block, inventory, and position reads. |
| `eat-interruption` | Bread and measured hunger reduced to about ten, with food level and inventory reads for F8, menu, or stop during the eating animation. |
| `eat-timeout` | Bread with a 30-second consumption time. Run explicit eating to observe the five-second timeout, then run a fresh wait case to measure the ten-second backoff between automatic attempts. Read bread count and hunger independently. |
| `low-health-retreat` | Disabled regeneration. Save home while healthy, move away, start a wait job, then apply poison and observe or interrupt the retreat. |
| `eat-retreat-timeout` | The same slow bread and a home enclosed in bedrock after the player moves away. Lower health during a wait and measure the retreat's 60-second budget while eating attempts continue. |
| `collection-return` | Two sand blocks and a shovel for a partial collection and interruption on the way back. |
| `collection-unreachable-return` | One sand block at a distance and a bedrock enclosure added around the starting point once the character leaves. Read the sand, enclosure, inventory, and position to verify a partial collection followed by a failed return. |
| `collect-full-inventory` | An axe, 34 stacks, and enough time to fill the last slot during mining and verify the bounded return. |
| `withdraw-multi-stack` | A double chest stocked with three stacks and independent reads for both halves after interruption. |
| `craft-interruption` | A placed crafting table and enough planks for four chests to check interruption between crafts. |
| `deposit-expiry`, `withdraw-expiry`, `craft-expiry` | A double chest and 36 stacks to transfer, or 64 chests to craft. Slow the fixture server to five ticks per second and suspend the controlling CLI after the first items move. Observe partial progress, the lease-expired cancellation, and unchanged counts after resuming the old CLI. |
| `death-navigation`, `disconnect-mining` | Dedicated player death or kick steps during an active job, with the server left running for follow-up observations after respawn or rejoin. |

Fixture startup verifies server setup and baseline reads. The packaged client
actions, F8, model and MCP sessions, and authenticated handoff still require
the observations in [the release checklist](RELEASE.md).

### Packaged Fabric model and MCP sessions

Install the candidate jars in a normal launcher profile and start each
[acceptance session](ACCEPTANCE.md#workflow) with `--backend fabric` and that
profile's `--mods-dir`. Use the fixture helper to start a fresh server for each
session and run the printed commands only after `Fixture ready`.

1. **Real local model (`fabric-local-model`).** Start `withdraw-craft-model`
   and record the installed Ollama model name and version. Capture the initial
   chest and player inventory reads, then use the printed `mc-agent agent`
   command with that model. It asks for four cobblestone so one remains in
   inventory after crafting, satisfying `--verify-withdraw cobblestone:1`
   alongside `--verify-craft stone_pickaxe:1`. Record `criteria_met`, the final
   chest contents (20 oak logs and one cobblestone), the final player inventory
   (one stone pickaxe and one cobblestone), the server position, and manual
   control from a separate `mc-agent observe`. These observations also cover
   the real-model step of `fabric-withdraw-craft`.
2. **Actual MCP agent (`fabric-mcp-agent`).** Start `mcp-collection`. Connect
   an [MCP client](USAGE.md#connect-an-mcp-agent) to the packaged profile's bridge
   and have the agent observe, explicitly take control, collect one oak log,
   and stop with `minecraft_stop`. Record the client name and version, allowed
   tools, call sequence, and raw tool results. After stop, repeat the server
   reads to confirm the log block is gone and the player has one oak log. Record
   the inventory gain and `mode: manual` from a separate `mc-agent observe`.
