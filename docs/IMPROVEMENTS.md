# Improvement batches

Each batch below inventories focused additions and how they were validated.

## Batch 4: 100 planning and reporting additions

Four CLI groups each add 25 documented commands (100 total):

| Numbers | Group | Numbered command inventory |
| --- | --- | --- |
| 1–25 | `supplies` | [Inventory and storage](SUPPLIES.md) |
| 26–50 | `survey` | [Position and nearby observations](SURVEY.md) |
| 51–75 | `nav` | [Offline coordinates and routes](NAVIGATION.md) |
| 76–100 | `routine` | [Offline routine tools](ROUTINE-TOOLS.md) |

Local numbering in each inventory runs from 1 to 25. These commands reuse the
existing observation and action schemas. They do not extend the bridge protocol
or change the Fabric mod. Storage remains last observed; observations remain
partial. Offline calculations do not inspect terrain, and generated routines
need review before execution.

Validation includes behavior and Commander-dispatch tests for all 100 additions,
an authenticated demo-bridge CLI test for all 50 connected reports, syntax checks,
the full Node regression suite, and the demo smoke flow. No packaged Fabric or
authenticated-handoff acceptance gate is claimed passing by these additions.

## Batch 3: watching, waypoints, planner safety, and routine controls

This batch adds observation and waypoint commands, planner safety and sampling options, two more
criteria, routine controls, MCP tools, a demo scenario, and diagnostics without changing the bridge
wire protocol or the Fabric mod. See [usage](USAGE.md#watching-risk-routes-and-waypoints) for
commands, ranges, and limits.

### Watching, assessment, routes, and waypoints

1. `watch`: one compact JSON line per sample (time, position, dimension, vitals, mode, job, threat count) every 1–60 seconds, for `--count` samples or until Ctrl+C; never takes control.
2. `wait-idle`: wait until no job is running or stopping (and, with `--manual`, control is back with the player); a timeout fails and names what is still busy.
3. `risk`: a heuristic `low`/`medium`/`high` rating from health, hunger, listed food, and observed threat distances, with reasons, inputs, and a partial-observation caveat.
4. `census`: observed block counts by name and threat counts by type, optionally within `--radius`; `threats: null` when the backend reports none.
5. `slots`: occupied inventory slots with count, stack size, remaining room, and whether the stack size is assumed.
6. `distance --home` and `direction --home`: measure to the saved home; refused without a home or when the home is in another dimension.
7. `route`: straight-line legs from the current position through 1–50 `x,y,z` points, with per-leg distances and compass bearings plus totals.
8. `waypoint add|list|remove`: up to 100 named waypoints in an owner-only, atomically written `waypoints.json`; `list` works offline and corrupt files are reported, never overwritten.
9. `waypoint goto`: walk to a saved waypoint like `goto`, after checking the observed dimension and before taking control.
10. `diff-snapshots`: compare two `snapshot` files offline with the same deltas as `compare` and the time between them.

### Planner safety, sampling, and criteria

11. `--verify-min-free-slots`: require at least 0–36 free main inventory slots at completion.
12. `--verify-max-health-loss`: require final health within 0–20 of the starting health.
13. `--goal-file`: read the goal from a regular file with the same validation; the goal argument becomes optional.
14. `--stop-below-health`: stop between actions and release control when health falls below 1–19, returning `health_stop` (exit 2).
15. `--retry-invalid`: refuse up to 0–5 consecutive invalid model outputs, show the model why, and let it try again.
16. `--temperature`: Ollama sampling temperature from 0 to 2 (default 0).
17. `--seed`: a fixed Ollama sampling seed for repeatable runs.
18. Results report model `requests`, prompt/output tokens, and model time; transcript decisions include per-request tokens.
19. `--show-prompt`: dry runs include the exact system prompt and the first model message, built by the same code as real requests.
20. `transcript-summary`: summarize a transcript run offline (decisions by type, rejections, errors, status, duration), tolerating malformed lines.

### Routines, MCP, simulation, and diagnostics

21. `run --from-step`: start a fully validated routine at a later step; step numbers stay absolute.
22. `run --continue-on-error`: record failed actions and continue, ending `completed_with_errors`; loss of control and cancellation still stop.
23. `run --repeat`: run the selected steps 1–20 times under one control session.
24. `run --stop-below-health`: stop before any step when observed health is below 1–19.
25. MCP `minecraft_summary`: read-only overview matching `summary`.
26. MCP `minecraft_find_item`: read-only inventory and last-observed storage counts matching `find-item`.
27. MCP `minecraft_direction`: read-only bearing and distance to a coordinate or the saved home, sharing the `direction --home` dimension check.
28. `demo --scenario full`: all 36 slots occupied, so collecting a new item fails clearly until a stack is stored.
29. `doctor` reports `ready`, and `doctor --strict` exits 1 when it is false.
30. `paths`: data, profile, bridge, and waypoint file locations without contacting the bridge or printing credentials.

### Validation

`test/cli-views-batch3.test.js` covers every risk threshold boundary, waypoint limits and corrupt
files, and runs each new observation and waypoint command as a CLI process against the demo bridge,
counting acquisitions to show read-only commands never take control. `test/agent-batch3.test.js`
covers each planner option and criterion through the API with fake model replies, including invalid
values refused before control, and runs `--goal-file`, `--stop-below-health`, and
`transcript-summary` through the CLI with a fake local Ollama server. `test/routine-mcp-batch3.test.js`
covers the routine controls through the API and CLI, the three MCP tools over stdio, the `full`
scenario and its smoke run, `doctor --strict`, and `paths`. The full Node suite, syntax check, and
demo smoke runs (`default` and `full`) exercise the integrated change. These checks use the
simulation and fake local servers; they do not extend the recorded real-game or real-model
acceptance in [development](DEVELOPMENT.md#validation).

## Batch 2: overview commands, planner controls, routines, and MCP tools

This batch adds CLI commands, planner options, criteria, MCP tools, and demo scenarios without
changing the bridge wire protocol or the Fabric mod. See [usage](USAGE.md#overview-search-and-snapshot-commands)
for commands, ranges, and limits.

### Read-only overview and search commands

1. `summary`: position, dimension, vitals, control mode, current job, home distance, threat count, and inventory totals.
2. `job`: control mode, stopping flag, and the current job.
3. `find-item`: an item's inventory total and last-observed counts per container; unopened containers are counted separately, never as empty.
4. `storage-totals`: last-observed item totals across known containers, each coordinate counted once.
5. `nearest`: the nearest observed block of a type, with distance and bearing.
6. `direction`: 8-point compass bearing, Minecraft yaw and pitch, and distances to a coordinate.
7. `food`: inventory food and the hunger it can restore, against current missing hunger.
8. `free-slots`: used/free main slots and, with `--item`, room for more of an item.
9. `snapshot`: save an owner-only observation file without job or credential-like fields; no overwrite without `--force`.
10. `compare`: inventory, position, vitals, home, and dimension changes since a snapshot.

### Planner controls and criteria

11. `agent --dry-run`: validate settings and criteria against one observation without control or model calls.
12. `--transcript`: append-only, owner-only JSON Lines of planner events; symlinks refused.
13. `--max-failures`: configurable consecutive-failure stop (1–10, default 3).
14. `--context-tokens`: configurable Ollama context window (2048–131072, default 8192).
15. `--history`: configurable number of recent decisions sent to the model (1–50, default 12).
16. `--fence`: refuse `goto` targets beyond a horizontal radius from the starting position.
17. `--allow-actions`: restrict the planner's action set in both the output schema and dispatch.
18. Results report `durationMs`, per-action `actionCounts`, and the `final` position/health/hunger.
19. `--verify-max-inventory`: an upper bound on held items, such as `oak_log:0` after storing everything.
20. `--verify-max-distance`: the final position must be within a radius of the starting position.
21. `MC_AGENT_MODEL` and `MC_AGENT_OLLAMA` supply planner defaults; explicit flags win.
22. `models`: list locally installed Ollama models through the shared localhost-only URL check.

### Routines, MCP, simulation, and diagnostics

23. MCP `minecraft_inventory`: read-only combined item counts with an optional filter.
24. MCP `minecraft_nearby`: read-only blocks, threats, or containers nearest first.
25. MCP `minecraft_release`: gracefully end this session's control without an emergency stop.
26. `run FILE`: validate every action of a 1–100 step JSON routine before taking control, then run it under one lease and stop at the first failure.
27. `goto --relative`: offsets from the observed position, bounds-checked before control is taken.
28. `eat --until`: eat up to ten meals until hunger reaches a target, stopping when food runs out or hunger does not rise.
29. `demo --scenario`: `hungry`, `hostile`, and `stocked` starting states for the simulation.
30. `doctor`: check the full `>=22.12` Node requirement and optionally a local Ollama with `--ollama`.

### Validation

`test/cli-observation.test.js` runs all ten overview commands as CLI processes against the demo
bridge while another controller holds the lease. `test/agent-options.test.js` covers each planner
option and criterion through the API with fake model replies and through the CLI with a fake local
Ollama server. `test/routine-mcp.test.js` covers routines, relative goto, repeated eating, demo
scenarios, the three MCP tools over stdio, and the doctor Ollama check. The full Node suite, syntax
check, and demo smoke exercise the integrated change. These checks use the simulation and fake local
servers; they do not extend the recorded real-game or real-model acceptance in
[development](DEVELOPMENT.md#validation).

## Batch 1: CLI, verification, and planner improvements

This batch extends the existing bridge without changing its wire protocol or Fabric mod.
See [usage](USAGE.md#focused-observations-and-final-state-checks) for commands and limits.

### CLI tools

1. `inventory`: aggregate stacks, filter by item, report item and occupied-slot totals.
2. `blocks`: sort loaded block observations by distance; filter by name/radius and limit results.
3. `threats`: sort observed hostiles by distance, with radius and result limits.
4. `home-info`: report the saved waypoint and its distance without walking there.
5. `storage`: show nearby cached container contents, distances, and backend support.
6. `distance`: calculate three-dimensional/horizontal distances and vertical offset.
7. `position`: show player coordinates and dimension.
8. `health`: show health, hunger, control/recovery, and survival status.
9. `inspect-storage`: explicitly refresh known storage using the bounded action path.
10. `wait`: perform a cancellable controlled wait of 1–3600 seconds.

### Independent task verification

11. `--verify-health`: require a minimum final health.
12. `--verify-hunger`: require a minimum final hunger; unavailable data stays unmet.
13. `--verify-at`: require arrival at coordinates within a bounded radius.
14. `--verify-inventory`: require an absolute held-item quantity across stacks.
15. `--verify-max-threats`: bound the observed hostile count; unavailable data stays unmet.
16. `--verify-home-radius`: configure the original-home arrival tolerance.
17. Deduplicate initial container coordinates so repeated observations cannot inflate the storage baseline.
18. Retain each newly discovered source's first baseline across subsequent checks.
19. Reject empty explicit storage provenance instead of treating old stock as new deposits.
20. Reject nonnumeric or nonfinite health as proof of a living player.

### Planner reliability

21. Validate goal/model text before acquiring control.
22. Validate public API runtime, decision, inference timeout, and thinking options.
23. Refuse credentials in local Ollama URLs.
24. Explain local Ollama connection failures with recovery guidance.
25. Explain empty model actions with model/timeout/thinking recovery suggestions.
26. Reject oversized model action text above 65,536 characters.
27. Validate protocol action coordinates and identifiers before dispatch.
28. Allow the model to choose `inspect_storage`, subject to backend support.
29. Treat returned failed/cancelled action statuses as failures for the three-failure stop.
30. Detect ineffective repeated actions even when the model alternates short and namespaced item names.

### Validation

`test/cli-tools.test.js` runs all ten tools as real CLI processes against the demo bridge,
including read-only queries while another controller owns the lease. `test/agent-cli.test.js`
exercises all new verification flags together and verifies step-limit exit code 2 for new criteria.
`test/objective.test.js` and `test/agent.test.js` cover each verification/planner improvement.
The full Node suite, syntax check, and demo smoke exercise the integrated change.
These checks use a simulation and local fake Ollama responses; they do not extend the project's
recorded real-game or real-model acceptance claims in [development](DEVELOPMENT.md#validation).
