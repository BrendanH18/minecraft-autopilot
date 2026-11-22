# Live bot acceptance runner

`scripts/live-bot-acceptance.js` automates [roadmap](ROADMAP.md) step 4, "Recheck bot recovery and verification live", against a local vanilla 1.21.1 server. It starts the server, builds each fixture with console commands, drives the Mineflayer bot through the repository CLI and bridge client, checks every outcome with independent server `data get` reads, and writes a JSON results file.

**Scope.** This covers the standalone **server bot** only. It does not cover the Fabric mod, a normal launcher, F8, or authenticated client → bot → client handoff; those [release](RELEASE.md) boxes stay open regardless of these results.

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
node scripts/live-bot-acceptance.js --accept-eula --scenario collect-and-store
node scripts/live-bot-acceptance.js --accept-eula --fast
node scripts/live-bot-acceptance.js --accept-eula --all
node scripts/live-bot-acceptance.js --accept-eula --scenario stale-removal-model --model YOUR_LOCAL_MODEL [--no-thinking]
node scripts/live-bot-acceptance.js --accept-eula --scenario withdraw-craft-model --model YOUR_LOCAL_MODEL [--no-thinking]
```

Choose one of `--scenario ID` (repeatable), `--all`, or `--fast`. The fast preset
runs offline collection, storage, withdrawal, and crafting scenarios. It
omits the three pit recovery scenarios and scenarios that require a real model.

Other options include `--port N`, `--out FILE` (default `results.json` in the run
directory), `--account NAME` (offline username, default `LiveBot`), `--java PATH`,
`--model NAME` and `--ollama URL` for model scenarios, and `--keep-server`. Use
distinct ports and, if supplying `--out`, distinct output files for concurrent
runs.

Agents run it in Boat through the [Boat check script](DEVELOPMENT.md#boat-checks),
which also copies the results back:
`scripts/boat-check.sh --fetch .runtime/live-acceptance -- npm run acceptance:bot -- --accept-eula --fast`.
A full offline `--all` run took about 15 minutes in Boat. The three pit
scenarios each wait out the bot's 180-second mining deadline. See the
[observed results](DEVELOPMENT.md#validation).

The [Bot acceptance workflow](../.github/workflows/bot-acceptance.yml) runs
`--fast` weekly on a GitHub-hosted `ubuntu-24.04` runner. To run it on demand, select **Bot
acceptance** in GitHub Actions and choose **Run workflow**. Download the
`bot-acceptance` artifact to review `results.json` and `server.out`. The artifact
is kept for seven days, including when a scenario fails and produces evidence.

## What a run does

1. Creates a private `.runtime/live-acceptance/run-<id>/` directory, copies the jar into its `server/` subdirectory, and writes `eula.txt` and `server.properties` (offline mode, `127.0.0.1`, fixed seed, superflat world, spawn protection 0, peaceful, and the tick watchdog off so a slow or swapping host cannot kill the server mid-run). The server creates a fresh world in that directory.
2. Starts `java -jar server.jar nogui` with stdin as the console and mirrors all output to `server.out`. Readiness is the `Done (…s)! For help` line; the reported version must be 1.21.1.
3. Applies world rules: peaceful, no daylight/weather cycle, no mob spawning, random tick speed 0, time 1000, clear weather.
4. For each scenario, in its own 64-block lane (beyond the bot's 48-block collection search): force-loads the lane, builds the fixture, starts a **fresh bot session** with `node src/cli.js --bridge <run-dir>/bridge.json server --host 127.0.0.1 --port N --account LiveBot --auth offline --version 1.21.1` and sets `MC_AGENT_HOME` to `<run-dir>/agent-home`. Then it resets the player, teleports it, and waits until the bridge and server agree on its position and inventory.
5. Runs the scenario, then always sends a bridge emergency stop, removes the fixture, and stops the bot process — also after a failed check, an exception, or Ctrl+C.
6. Stops the server (`stop`, then SIGTERM/SIGKILL if needed), writes the results file, and prints the paths to it and `server.out`. The report includes the log path even when `--out` puts the report elsewhere. Run directories are retained for review and accumulate on disk.

Independent verification uses only server console reads: `data get block X Y Z Items`, `data get entity NAME Inventory`, `data get entity NAME Pos`, and, for blocks without data such as a crafting table, `execute if block X Y Z BLOCK` ("Test passed" or "Test failed"). The bot's own reports are compared against them, never trusted alone.

Ctrl+C is designed to stop the current scenario, clean up, skip the rest, stop the server, and still write results (covered by unit tests with fake processes, not yet observed live); a second Ctrl+C exits immediately and kills the child processes. `--keep-server` leaves every scenario's fixture in place and keeps the server running after the run (each bot session is still stopped) and forwards console commands typed into the runner until Ctrl+C or end of input.

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
| `withdraw-craft-model` | Player holds two sticks. A crafting table and a chest with 5 cobblestone and 20 oak logs are nearby. A local model (`--model`) withdraws 3 cobblestone and crafts one stone pickaxe. | Agent reports `criteria_met`. The server shows only one stone pickaxe in the player's inventory and exactly 2 cobblestone and 20 oak logs in the chest. Skipped without `--model`. | Bot withdraw and craft, real-model workflow. |

### Collect-and-store without a model

The `agent` command always needs an Ollama model; there is no deterministic CLI routine that applies `--verify-collect`/`--verify-deposit`/`--verify-home`. The storage scenarios therefore call the same exported `runAgent` the CLI uses, in process, against the bot's bridge, with a **scripted planner** supplied as its model transport. No model or network is involved; the decisions are fixed (for example collect 8 → deposit 8 → home → done), while the criteria checks, each deposit's reported container baseline, the task-scoped final `inspect_storage`, the `done` rejections, and the bridge actions are the production code paths. The "during inference" changes happen while the agent is awaiting that scripted decision, which is the same window a model's inference occupies. The real-model variant is `stale-removal-model`; it is never simulated.

## Results file

```text
schema, startedAt, finishedAt
review: { reviewed: false, note }          # a person sets this when they accept the run
scope                                      # bot only; not Fabric or authenticated handoff
environment: { commit, dirty, node, java, platform, javaPreflight }
minecraft: { expectedVersion, serverVersion, jar, jarSha256, seed, levelType }
options: { port, account, keepServer, model, scenarios }
scenarios[]: { id, title, release[], requiresModel, status: pass|fail|skipped, reason,
               startedAt, durationMs, steps[], observations{}, checks[], cleanup[] }
summary: { pass, fail, skipped, error }, error
```

`steps` record every console command, bridge/CLI action, and read with timing and outcome. `observations` hold baselines, final server state, job progress, agent verification, and position samples. `checks` list each pass/fail criterion with expected and actual values. A run from a dirty tree (`dirty: true`) is not release-candidate evidence.

## Reviewing a run

For each scenario, confirm in the results and `server.out` that the fixture built as intended (no command errors), the bot was in the expected place, and the checks reflect the RELEASE.md wording, not only that they passed. In particular: the pit run really timed out (not "No reachable matching blocks remain"), the cancel landed during the return trip, and storage changes happened before the final inspection. Then record the commit, jar checksum, server/bot/model configuration, scenario, and result in DEVELOPMENT.md before ticking a box.

## Known limitations

- The console reply patterns and SNBT formats are specific to vanilla 1.21.1. Check `server.out` when a console command fails or times out.
- The pit fixture relies on mining fatigue slowing Mineflayer's digging so 64 logs cannot be reached in 180 s. If the bot exhausts the shaft or reaches the quota, `recovery-timeout` fails rather than passing.
- The harness's overall `collect` deadline is the job limit + 75 s: the driver's 60 s return budget, which starts after the 180 s mining deadline, plus a 15 s margin. A `recovery-timeout` failure with "Action timed out." means the return overran that margin and should be reviewed as a finding.
- Cancellation races: if the return trip finishes before the cancel lands, the cancel scenarios fail with "interrupt issued while recovery was running".
- Server output is matched one command at a time; a reply that arrives after its command timed out could be attributed to the next command. Timeouts are recorded in `steps`.

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
   server's baseline reads.
3. Once it prints `Fixture ready`, use `mc-agent observe` in a separate
   terminal to confirm the CLI is attached to your Fabric profile. Follow the
   [Fabric checklist](LIFECYCLE-SCENARIOS.md#fabric-checklist), including any
   additional player setup it calls for. Enter the printed server reads in
   the fixture terminal at the checklist's observation points. After an
   interruption, repeat the reads at the checklist's interval. Use a fresh
   run for each alternative or retry. Use a different `--port` for each run
   in the same client session, or restart the Minecraft client before
   reusing an address. Fabric remembers storage observations by server
   address while the client is open.
4. Enter `stop` or press Ctrl+C to stop the server. The world and
   `server.out` are retained under `.runtime/live-fabric-fixtures/run-*/server/`.
   Copy the relevant baseline and follow-up reads into the candidate's
   acceptance session.

| Fixtures | Setup and reads |
| --- | --- |
| `takeover` | Oak logs and mining fatigue give the operator time to press F8, open and close the inventory, or send emergency stop during mining. For expiry, use `kill -9 <pid>` on the controlling CLI during navigation and verify that the lease expired and cancelled the job. Use fresh runs and compare server inventory and position five seconds apart after each interruption. The inference check uses a real local model. |
| `cobblestone-hostiles-dimension` | Cobblestone blocks, an iron pickaxe, and a stationary husk enclosed in glass. Read player inventory after collection and compare `mc-agent threats` with server positions. During the printed navigation run, enter the provided teleport command to land on a prepared Nether platform. Verify that the dimension change cancelled the job and repeat the player position and dimension reads. |
| `pit` | Bot runner's oak-log shaft and mining fatigue, with player inventory and position reads before collection and after recovery. |
| `deposit-chest`, `deposit-barrel`, `deposit-full-chest`, `deposit-double-chest` | Three stacks of logs and nearby storage. The single chest setup also prints the contents-removal and blocked-lid commands for fresh inspection. The double chest prints item reads for both halves. |
| `deposit-return` | The bot runner's elevated home and chest out of reach. Optionally remove the step once the player is back at home to test the blocked return. |
| `withdraw`, `withdraw-omitted`, `withdraw-no-candidate`, `withdraw-short-stock`, `withdraw-full-inventory` | The bot runner's stocks, distances, and player inventories, with independent chest and player reads. |
| `craft-bootstrap`, `craft-missing-ingredients`, `craft-full-inventory` | Start with the bot runner's supplies. Bootstrap also reads the possible crafting-table placement blocks before and after crafting. |

Fixture startup verifies server setup and baseline reads. The packaged client
actions, F8, model and MCP sessions, and authenticated handoff still require
the observations in [the release checklist](RELEASE.md).
