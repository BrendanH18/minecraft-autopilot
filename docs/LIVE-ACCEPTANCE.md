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
node scripts/live-bot-acceptance.js --accept-eula --scenario collect-and-store
node scripts/live-bot-acceptance.js --accept-eula --all
node scripts/live-bot-acceptance.js --accept-eula --scenario stale-removal-model --model YOUR_LOCAL_MODEL [--no-thinking]
```

Options: `--scenario ID` (repeatable) or `--all`; `--port N`; `--out FILE` (default `.runtime/live-acceptance/results-<time>.json`); `--account NAME` (offline username, default `LiveBot`); `--java PATH`; `--model NAME` and `--ollama URL` for model scenarios; `--keep-server`.

A full `--all` run has not been timed yet; expect it to take well over ten minutes, because the three pit scenarios each wait out the bot's 180-second mining deadline.

## What a run does

1. Copies the jar into `.runtime/live-acceptance/server/`, writes `eula.txt` and `server.properties` (offline mode, `127.0.0.1`, fixed seed, superflat world, spawn protection 0, peaceful), and deletes the previous world so every run starts identically.
2. Starts `java -jar server.jar nogui` with stdin as the console and mirrors all output to `server.out`. Readiness is the `Done (…s)! For help` line; the reported version must be 1.21.1.
3. Applies world rules: peaceful, no daylight/weather cycle, no mob spawning, random tick speed 0, time 1000, clear weather.
4. For each scenario, in its own 64-block lane (beyond the bot's 48-block collection search): force-loads the lane, builds the fixture, starts a **fresh bot session** with `node src/cli.js --bridge .runtime/live-acceptance/bridge.json server --host 127.0.0.1 --port N --account LiveBot --auth offline --version 1.21.1` (so storage remembered from earlier scenarios never affects inspection), resets the player, teleports it, and waits until the bridge and server agree on its position and inventory.
5. Runs the scenario, then always sends a bridge emergency stop, removes the fixture, and stops the bot process — also after a failed check, an exception, or Ctrl+C.
6. Stops the server (`stop`, then SIGTERM/SIGKILL if needed) and writes the results file.

Independent verification uses only server console reads: `data get block X Y Z Items`, `data get entity NAME Inventory`, and `data get entity NAME Pos`. The bot's own reports are compared against them, never trusted alone.

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

- The console reply patterns and SNBT formats were written for vanilla 1.21.1 and are covered by unit tests with representative lines, but have not yet been observed against a real server by this runner. A first live run may need pattern or fixture adjustments; check `server.out` when a command step fails.
- The pit fixture relies on mining fatigue slowing Mineflayer's digging so 64 logs cannot be reached in 180 s. If the bot exhausts the shaft or reaches the quota, `recovery-timeout` fails rather than passing.
- The harness's overall `collect` deadline is the job limit + 75 s: the driver's 60 s return budget, which starts after the 180 s mining deadline, plus a 15 s margin. A `recovery-timeout` failure with "Action timed out." means the return overran that margin and should be reviewed as a finding.
- Cancellation races: if the return trip finishes before the cancel lands, the cancel scenarios fail with "interrupt issued while recovery was running".
- Server output is matched one command at a time; a reply that arrives after its command timed out could be attributed to the next command. Timeouts are recorded in `steps`.
