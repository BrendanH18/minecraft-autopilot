# Improvement batches

Each batch below inventories focused additions and how they were validated.

## 1,000 release and planner improvements

The batch counts each distinct runnable worked example once. Its inputs and
expected result come from the corresponding planner’s independent test
fixtures. Use `mc-agent study examples` for the machine-readable inventory
of those planner keys and `mc-agent study example GROUP COMMAND` to run one.

| Range | Work | Count |
| --- | --- | ---: |
| 1–250 | [Bot acceptance and resource planner examples](improvement-batch-bot.md) | 250 |
| 251–500 | [Release evidence, Fabric fixtures, and analysis planner examples](improvement-batch-evidence.md) | 250 |
| 501–750 | [Fabric reliability and spatial planner examples](improvement-batch-fabric.md) | 250 |
| 751–1,000 | CLI startup and build planner examples described below | 250 |
| | **Total** | **1,000** |

Item 751 defers loading offline planner modules for core CLI commands,
retaining the full command tree for root help and unknown-command suggestions.
Items 752–1,000 expose 249 worked examples. They cover the scaffold, beacon,
tunnel ventilation, canal lock, sponge, ice road, furnace, brewing, orchard,
and greenhouse planners. The first nine groups contribute 25 each. The
greenhouse group contributes 24.

## Batch 4: 100 planning and reporting additions

Four CLI groups each add 25 documented commands (100 total):

| Numbers | Group | Numbered command inventory |
| --- | --- | --- |
| 1–25 | `supplies` | [Inventory and storage](../packages/planners/docs/SUPPLIES.md) |
| 26–50 | `survey` | [Position and nearby observations](../packages/planners/docs/SURVEY.md) |
| 51–75 | `nav` | [Offline coordinates and routes](../packages/planners/docs/NAVIGATION.md) |
| 76–100 | `routine` | [Offline routine tools](../packages/planners/docs/ROUTINE-TOOLS.md) |

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

## Batch 5: 100 stock, spatial, geometry, and workbench additions

This batch adds 100 independently callable CLI commands, in four groups of 25.
The numbered inventories, arguments, examples, and limitations are in:

- [Stock planning: additions 1–25](../packages/planners/docs/STOCK.md)
- [Spatial observation queries: additions 26–50](../packages/planners/docs/SCENE.md) (local numbering 1–25)
- [Geometry: additions 51–75](../packages/planners/docs/GEOMETRY.md) (local numbering 1–25)
- [Routine workbench: additions 76–100](../packages/planners/docs/WORKBENCH.md) (local numbering 1–25)

Stock and scene consume one observation without acquiring a control lease or opening
containers. Geometry and workbench run offline. Routine outputs are revalidated
against the existing action protocol before being printed, and never executed.
No new backend capability or live acceptance claim is introduced.

Focused tests check each command's results, registration, and invalid inputs.
`packages/planners/test/feature-cli.test.js` also sends all 50 new observation commands through the
authenticated demo bridge while another controller owns the lease, checking that
player state, inventory, storage, and ownership remain unchanged. The full Node
suite, syntax check, and demo smoke cover integration.

## Batch 6: 100 logistics, terrain, routine audit, and timeline additions

Four independently callable CLI groups each add 25 commands (100 total):

| Numbers | Group | Numbered command inventory |
| --- | --- | --- |
| 1–25 | `logistics` | [Stock logistics](../packages/planners/docs/LOGISTICS.md) |
| 26–50 | `terrain` | [Observed terrain](../packages/planners/docs/TERRAIN.md) |
| 51–75 | `audit` | [Routine audit](../packages/planners/docs/ROUTINE-AUDIT.md) |
| 76–100 | `timeline` | [Snapshot timelines](../packages/planners/docs/TIMELINE.md) |

Each linked inventory uses local numbering 1–25. Logistics and terrain read one
observation without acquiring a lease. Audit and timeline run offline. None of
these commands executes a routine, moves items, or writes input files. Storage
is last observed; terrain reports do not establish safe paths. Timeline changes
are sampled net differences, not evidence of their cause.

Validation covers all 100 command results and Commander dispatch, invalid inputs,
authenticated bridge reports during another controller's lease, offline CLI
file reports, the full Node suite, syntax checks, and demo smoke. Remote CI also
builds and verifies the unchanged Fabric package. Packaged Fabric and authenticated
handoff acceptance gates remain open.

## Batch 7: 100 expedition, blueprint, checkpoint, and composition additions

Four independently callable CLI groups each add 25 commands (100 total):

| Numbers | Group | Command inventory |
| --- | --- | --- |
| 1–25 | `expedition` | [Trip, food, collection, hauling, and supplied production budgets](../packages/planners/docs/EXPEDITION.md) |
| 26–50 | `blueprint` | [Block-count material plans for structures and workloads](../packages/planners/docs/BLUEPRINT.md) |
| 51–75 | `checkpoint` | [Saved-observation predicates and data-quality checks](../packages/planners/docs/CHECKPOINT.md) |
| 76–100 | `compose` | [Routine range edits, coordinate transforms, and appended workflows](../packages/planners/docs/COMPOSE.md) |

Expedition reads one observation without acquiring a control lease. The other
groups work offline. Blueprint does not build, expedition does not craft or
smelt, and compose does not execute routines or overwrite files. All routine
outputs must pass the existing action protocol and 100-step bound. A checkpoint
predicate reports `passes: true`, `false`, or `null` for unknown evidence; it
does not establish current world state or independently verify task execution.

Focused tests independently calculate expected results for all 100 commands,
including thin structures, missing evidence, cross-dimension homes, invalid
inputs, immutable inputs, and routine expansion bounds. `packages/planners/test/batch7-cli.test.js`
executes all 100 commands as real CLI processes: all 25 expedition commands
cross the authenticated demo bridge during another controller's lease, and
the other 75 run with a nonexistent bridge. It checks unchanged ownership and
game state, unchanged input files, and loadable generated routine JSON.

The full Node suite, syntax checks, and demo smoke cover integration. These
are simulation, protocol-fixture, and offline checks. Existing packaged Fabric
and authenticated-handoff acceptance gates remain open until observed passing.

## Batch 8: 200 offline planning and evidence analysis additions

Eight independently callable CLI groups each add 25 commands (200 total):

| Numbers | Group | Numbered command inventory |
| --- | --- | --- |
| 1–25 | `itinerary` | [Multi-stop scheduling, distance budgets, and visit alternatives](../packages/planners/docs/ITINERARY.md) |
| 26–50 | `workarea` | [Inclusive block cells, grid coverage, and disjoint work partitions](../packages/planners/docs/WORKAREA.md) |
| 51–75 | `ledger` | [Carried composition, quota, food, and packing comparisons](../packages/planners/docs/LEDGER.md) |
| 76–100 | `depot` | [Stored-stock changes and container evidence comparisons](../packages/planners/docs/DEPOT.md) |
| 101–125 | `journal` | [Transcript run inspection, filters, and line provenance](../packages/planners/docs/JOURNAL.md) |
| 126–150 | `diagnose` | [Recorded outcomes, timing gaps, usage, budgets, and requests](../packages/planners/docs/DIAGNOSE.md) |
| 151–175 | `compare-routines` | [Aligned, sequence, multiset, quota, and policy comparisons](../packages/planners/docs/ROUTINE-COMPARE.md) |
| 176–200 | `select-routine` | [Item, occurrence, spatial, wait, and section extraction](../packages/planners/docs/ROUTINE-SELECT.md) |

Each guide numbers its 25 commands locally and documents arguments, examples,
and limitations. All eight groups run offline without acquiring control or
contacting a bridge or model. Inputs are never overwritten. Generated routine
selections preserve original order and pass the existing action protocol and
1–100-step bounds, but may omit prerequisites; review them before execution.

Workarea uses floored inclusive block cells rather than continuous geometry.
Route estimates ignore terrain and hazards; visit reordering is a review aid.
Snapshot comparisons require chronological observations, preserve unknown
evidence, and do not infer causes. Storage contents are recorded observations,
not refreshes. Transcript decisions are requested actions, not proof of
execution, and inter-event gaps are not model inference latency.

Focused tests independently check all 200 behaviors, including invalid inputs,
missing evidence, dimension changes, empty selections, disjoint cell partitions,
and unchanged input data. The batch 8 CLI tests plus
`packages/planners/test/itinerary-workarea.test.js` exercise every command as a real process with
a nonexistent bridge, check expected results and unchanged files, and validate
generated routines. The complete Node suite, syntax checks, and demo smoke
cover integration. These offline and simulated checks do not close packaged
Fabric or authenticated-handoff acceptance gates.

## Batch 9: 500 offline planning and evidence improvements

Twenty independently callable groups each add 25 commands (500 total).
The linked guides enumerate the commands, their arguments, examples, and limits.

| Numbers | Group | Guide |
| --- | --- | --- |
| 1–25 | `bearing` | [Orientation and angle calculations](../packages/planners/docs/BEARING.md) |
| 26–50 | `grid` | [Chunk and region coordinates](../packages/planners/docs/GRID.md) |
| 51–75 | `shape` | [Planar polygon calculations](../packages/planners/docs/SHAPE.md) |
| 76–100 | `earthworks` | [Excavation and fill estimates](../packages/planners/docs/EARTHWORKS.md) |
| 101–125 | `railplan` | [Rail material and grade estimates](../packages/planners/docs/RAILPLAN.md) |
| 126–150 | `lightplan` | [Abstract lighting geometry](../packages/planners/docs/LIGHTPLAN.md) |
| 151–175 | `perimeter` | [Boundary and fence estimates](../packages/planners/docs/PERIMETER.md) |
| 176–200 | `packing` | [Stack and slot logistics](../packages/planners/docs/PACKING.md) |
| 201–225 | `production` | [User-supplied production ratios](../packages/planners/docs/PRODUCTION.md) |
| 226–250 | `fuelplan` | [User-supplied fuel budgets](../packages/planners/docs/FUELPLAN.md) |
| 251–275 | `tradeplan` | [User-supplied exchange budgets](../packages/planners/docs/TRADEPLAN.md) |
| 276–300 | `farmplan` | [Abstract plot and yield estimates](../packages/planners/docs/FARMPLAN.md) |
| 301–325 | `ration` | [Consumption and reserve budgets](../packages/planners/docs/RATION.md) |
| 326–350 | `allocation` | [Resource allocation calculations](../packages/planners/docs/ALLOCATION.md) |
| 351–375 | `inventory-series` | [Recorded inventory trends](../packages/planners/docs/INVENTORY-SERIES.md) |
| 376–400 | `storage-series` | [Recorded storage evidence trends](../packages/planners/docs/STORAGE-SERIES.md) |
| 401–425 | `vitals-series` | [Recorded vitals and movement trends](../packages/planners/docs/VITALS-SERIES.md) |
| 426–450 | `routine-metrics` | [Static routine metrics](../packages/planners/docs/ROUTINE-METRICS.md) |
| 451–475 | `event-query` | [Transcript event queries](../packages/planners/docs/EVENT-QUERY.md) |
| 476–500 | `snapshot-query` | [Saved snapshot queries](../packages/planners/docs/SNAPSHOT-QUERY.md) |

All groups run offline, print JSON reports, and leave input files untouched.
No group acquires control, calls a model, or executes Minecraft actions.
Resource budgets use explicit caller-supplied rates and ratios; estimates do
not establish in-game recipes, prices, growth, fuel behavior, or successful
execution. Geometric coverage ignores obstructions, terrain, and game mechanics.
Recorded evidence is partial; changes and event requests do not prove causes
or action completion. Missing fields remain unknown where a report requires
them. Existing packaged Fabric and authenticated-handoff acceptance gates
remain open.

Each group has focused behavioral tests and command registration coverage.
The batch inventory test requires exactly 25 unique command names per group
and exactly 500 new registered commands overall. The complete Node suite,
syntax checks, and demo smoke provide regression coverage.

## Batch 10: 1,000 offline planning and analysis improvements

Forty groups add exactly 25 independently callable commands each. The four
linked guides enumerate all 1,000 signatures and describe their inputs,
examples, assumptions, and limits. Run `mc-agent GROUP --help` for arguments.

| Numbers | Group | Command guide |
| --- | --- | --- |
| 1–25 | `vector` | [Spatial planning](../packages/planners/docs/PLANNING-SPATIAL.md#vector) |
| 26–50 | `voxel` | [Spatial planning](../packages/planners/docs/PLANNING-SPATIAL.md#voxel) |
| 51–75 | `tunnel` | [Spatial planning](../packages/planners/docs/PLANNING-SPATIAL.md#tunnel) |
| 76–100 | `bridgeplan` | [Spatial planning](../packages/planners/docs/PLANNING-SPATIAL.md#bridgeplan) |
| 101–125 | `roofplan` | [Spatial planning](../packages/planners/docs/PLANNING-SPATIAL.md#roofplan) |
| 126–150 | `facade` | [Spatial planning](../packages/planners/docs/PLANNING-SPATIAL.md#facade) |
| 151–175 | `spiral` | [Spatial planning](../packages/planners/docs/PLANNING-SPATIAL.md#spiral) |
| 176–200 | `symmetry` | [Spatial planning](../packages/planners/docs/PLANNING-SPATIAL.md#symmetry) |
| 201–225 | `landmark` | [Spatial planning](../packages/planners/docs/PLANNING-SPATIAL.md#landmark) |
| 226–250 | `district` | [Spatial planning](../packages/planners/docs/PLANNING-SPATIAL.md#district) |
| 251–275 | `queueplan` | [Resources planning](../packages/planners/docs/PLANNING-RESOURCES.md#queueplan) |
| 276–300 | `replenish` | [Resources planning](../packages/planners/docs/PLANNING-RESOURCES.md#replenish) |
| 301–325 | `haul` | [Resources planning](../packages/planners/docs/PLANNING-RESOURCES.md#haul) |
| 326–350 | `bufferplan` | [Resources planning](../packages/planners/docs/PLANNING-RESOURCES.md#bufferplan) |
| 351–375 | `batchflow` | [Resources planning](../packages/planners/docs/PLANNING-RESOURCES.md#batchflow) |
| 376–400 | `durability` | [Resources planning](../packages/planners/docs/PLANNING-RESOURCES.md#durability) |
| 401–425 | `harvest` | [Resources planning](../packages/planners/docs/PLANNING-RESOURCES.md#harvest) |
| 426–450 | `blending` | [Resources planning](../packages/planners/docs/PLANNING-RESOURCES.md#blending) |
| 451–475 | `apportion` | [Resources planning](../packages/planners/docs/PLANNING-RESOURCES.md#apportion) |
| 476–500 | `project-cost` | [Resources planning](../packages/planners/docs/PLANNING-RESOURCES.md#project-cost) |
| 501–525 | `series` | [Analysis planning](../packages/planners/docs/PLANNING-ANALYSIS.md#series) |
| 526–550 | `distribution` | [Analysis planning](../packages/planners/docs/PLANNING-ANALYSIS.md#distribution) |
| 551–575 | `association` | [Analysis planning](../packages/planners/docs/PLANNING-ANALYSIS.md#association) |
| 576–600 | `anomaly` | [Analysis planning](../packages/planners/docs/PLANNING-ANALYSIS.md#anomaly) |
| 601–625 | `smooth` | [Analysis planning](../packages/planners/docs/PLANNING-ANALYSIS.md#smooth) |
| 626–650 | `trend` | [Analysis planning](../packages/planners/docs/PLANNING-ANALYSIS.md#trend) |
| 651–675 | `probability` | [Analysis planning](../packages/planners/docs/PLANNING-ANALYSIS.md#probability) |
| 676–700 | `experiment` | [Analysis planning](../packages/planners/docs/PLANNING-ANALYSIS.md#experiment) |
| 701–725 | `scorecard` | [Analysis planning](../packages/planners/docs/PLANNING-ANALYSIS.md#scorecard) |
| 726–750 | `forecast` | [Analysis planning](../packages/planners/docs/PLANNING-ANALYSIS.md#forecast) |
| 751–775 | `interval-set` | [Coordination planning](../packages/planners/docs/PLANNING-COORDINATION.md#interval-set) |
| 776–800 | `shiftplan` | [Coordination planning](../packages/planners/docs/PLANNING-COORDINATION.md#shiftplan) |
| 801–825 | `dependency` | [Coordination planning](../packages/planners/docs/PLANNING-COORDINATION.md#dependency) |
| 826–850 | `pathplan` | [Coordination planning](../packages/planners/docs/PLANNING-COORDINATION.md#pathplan) |
| 851–875 | `pointcloud` | [Coordination planning](../packages/planners/docs/PLANNING-COORDINATION.md#pointcloud) |
| 876–900 | `index-set` | [Coordination planning](../packages/planners/docs/PLANNING-COORDINATION.md#index-set) |
| 901–925 | `tiling` | [Coordination planning](../packages/planners/docs/PLANNING-COORDINATION.md#tiling) |
| 926–950 | `elevation` | [Coordination planning](../packages/planners/docs/PLANNING-COORDINATION.md#elevation) |
| 951–975 | `reach` | [Coordination planning](../packages/planners/docs/PLANNING-COORDINATION.md#reach) |
| 976–1000 | `patrol` | [Coordination planning](../packages/planners/docs/PLANNING-COORDINATION.md#patrol) |

All commands run offline and print JSON without contacting Minecraft, a model,
or a bridge. They never acquire control or execute actions. CSV numeric lists
and JSON coordinate arrays describe caller-supplied plans or measurements;
they are not fresh world observations. Geometry ignores terrain and obstacles.
Rates, yields, wear, prices, and probability models are supplied assumptions,
not claims about Minecraft mechanics. Statistical summaries do not establish
causation, predict guaranteed outcomes, or establish gameplay safety.

Use consistent units within a calculation. Scalar inputs are bounded to
±1,000,000; count arguments require whole numbers. Input and output lists
are limited to 1,000 entries, and nonfinite or unsafe-range results fail
without a success report. Negative CLI arguments may follow `--`.

Every command has an independent expected-result case, exercised through both
the pure calculation boundary and Commander argument parsing. The inventory
test checks all 1,000 unique names, signatures, documentation, and examples;
real CLI processes check every group's help and a representative result with
a nonexistent bridge. Full Node regressions, syntax checks, demo smoke, and
remote CI cover integration. These offline and simulated checks leave packaged
Fabric and authenticated-handoff acceptance gates open.

## Batch 11: 5,000 offline planner/workflow combinations

Five reusable workflows now apply to every one of the 1,000 batch 10 planners:
batch evaluation, baseline comparison, parameter sweeps, one-at-a-time
sensitivity, and candidate ranking. This counts **5 × 1,000 = 5,000 newly
supported combinations**, not 5,000 distinct algorithms or gameplay actions.

The [planning studies guide](../packages/planners/docs/PLANNING-STUDIES.md) documents requests, examples,
result deltas, ranking objectives, bounds, and all 40 supported groups.
`mc-agent study catalog` prints the exact inventory and argument signatures.
Requests accept inline JSON, `@file`, or stdin. Invalid candidates fail the
whole request before any success report is printed. Existing planner
assumptions and numerical limits remain in force.

| Workflow | New combinations | Behavior |
| --- | --- | --- |
| `study batch` | 1,000 | Evaluate independent full argument rows together. |
| `study compare` | 1,000 | Compare candidate results with one baseline using JSON-pointer deltas. |
| `study sweep` | 1,000 | Replace one complete scalar, CSV, or JSON-string argument with supplied alternatives. |
| `study sensitivity` | 1,000 | Vary multiple argument positions independently against an unchanged baseline. |
| `study rank` | 1,000 | Sort supplied candidates by one result objective, with stable ties and optional top limits. |

All 5,000 combinations have API and Commander coverage against independent
worked examples. Focused tests prove varying inputs, nested differences,
rank ordering, request limits, and failure behavior; real CLI processes cover
every workflow without a bridge. Full Node regressions, syntax checks, and
demo smoke cover integration. These offline studies leave the packaged
Fabric and authenticated-handoff acceptance gates open.

## Batch 12: 1,000 constraint-screening combinations

`study screen` adds explicit constraint checks to all 1,000 batch 10 planners:
**one new workflow × 40 groups × 25 planners = 1,000 new combinations**.
This is one reusable capability, with all planner signatures discoverable in
`study catalog`, which now reports 6,000 total study combinations.

Users can check up to 20 scalar or length criteria against each candidate and
see every measured value, pass/fail outcome, and aggregate count. Numeric bounds,
exact scalar equality, nested JSON Pointers, and ordered per-case diagnostics
support reviewing supplied plans without connecting to Minecraft. See
[constraint screening](../packages/planners/docs/PLANNING-STUDIES.md#constraint-screening) for the contract.

All 1,000 new combinations have API and Commander coverage against independent
planner examples. Focused tests cover mixed pass/fail outcomes, numeric bounds,
scalar types, nested paths, lengths, and atomic validation errors. Real CLI
processes cover inline JSON, file, and stdin requests. Packaged Fabric and
authenticated-handoff acceptance gates remain open.

## Batch 13: 200 planners and three study workflows

Eight new groups add exactly 25 typed planners each, and three new study
workflows apply to every typed planner. The count is **200 new commands plus
4,800 new planner/workflow combinations = 5,000 new callable entries**; the
study catalog grows from 6,000 to 10,800. This is 200 new calculations and
three reusable capabilities, not 5,000 distinct algorithms or gameplay actions.

| Numbers | Addition | Count | Guide |
| --- | --- | --- | --- |
| 1–25 | `stairplan` planners | 25 | [Structures](../packages/planners/docs/PLANNING-STRUCTURES.md#stairplan) |
| 26–50 | `roundplan` planners | 25 | [Structures](../packages/planners/docs/PLANNING-STRUCTURES.md#roundplan) |
| 51–75 | `rampart` planners | 25 | [Structures](../packages/planners/docs/PLANNING-STRUCTURES.md#rampart) |
| 76–100 | `warehouse` planners | 25 | [Structures](../packages/planners/docs/PLANNING-STRUCTURES.md#warehouse) |
| 101–125 | `stripmine` planners | 25 | [Operations](../packages/planners/docs/PLANNING-OPERATIONS.md#stripmine) |
| 126–150 | `herd` planners | 25 | [Operations](../packages/planners/docs/PLANNING-OPERATIONS.md#herd) |
| 151–175 | `signalplan` planners | 25 | [Operations](../packages/planners/docs/PLANNING-OPERATIONS.md#signalplan) |
| 176–200 | `linkplan` planners | 25 | [Operations](../packages/planners/docs/PLANNING-OPERATIONS.md#linkplan) |
| 201–1,400 | The six earlier study workflows on the 200 new planners | 1,200 | [Planning studies](../packages/planners/docs/PLANNING-STUDIES.md) |
| 1,401–2,600 | `study factorial` on all 1,200 typed planners | 1,200 | [Factorial grids](../packages/planners/docs/PLANNING-STUDIES.md#factorial-grids) |
| 2,601–3,800 | `study summarize` on all 1,200 typed planners | 1,200 | [Result summaries](../packages/planners/docs/PLANNING-STUDIES.md#result-summaries) |
| 3,801–5,000 | `study pareto` on all 1,200 typed planners | 1,200 | [Pareto fronts](../packages/planners/docs/PLANNING-STUDIES.md#pareto-fronts) |

The structure planners cover stairs, ladders and ramps; cell counts for round
builds; battlements, towers and moats; and storage-hall layout. The operations
planners cover branch-mining layouts, herd growth and pens, signal lines and
clocks, and travel between two scaled coordinate frames. Each guide lists every
signature with its ordered input types and a conventions paragraph. All inputs
are caller-supplied assumptions: no group encodes stack sizes, tick rates,
growth times, signal ranges, or any other game rule, and none inspects a world.

`study factorial` evaluates every combination of replacement values for
several arguments, `study summarize` reports the distinct values and numeric
statistics of one result objective across candidates, and `study pareto`
separates non-dominated candidates from dominated ones across several
objectives. Like the earlier workflows they accept inline JSON, `@file`, or
stdin, are limited to 100 cases, and fail atomically. They examine only the
supplied candidates and do not establish optimality, safety, or feasibility.

## Batch 14: 200 offline build planners

Eight groups each add 25 direct CLI commands. The count covers distinct
calculations. Run `mc-agent GROUP --help` for the available signatures.

| Numbers | CLI group | Count | Guide |
| --- | --- | ---: | --- |
| 1–25 | `scaffold-plan` | 25 | [Scaffolds](../packages/planners/docs/PLANNING-CONSTRUCTION.md#scaffold-plan) |
| 26–50 | `beacon-plan` | 25 | [Beacons](../packages/planners/docs/PLANNING-CONSTRUCTION.md#beacon-plan) |
| 51–75 | `tunnel-vent` | 25 | [Tunnel ventilation](../packages/planners/docs/PLANNING-INFRASTRUCTURE.md#tunnel-vent) |
| 76–100 | `canal-lock` | 25 | [Canal locks](../packages/planners/docs/PLANNING-INFRASTRUCTURE.md#canal-lock) |
| 101–125 | `sponge-plan` | 25 | [Underwater draining](../packages/planners/docs/PLANNING-WATERWAYS.md#sponge-plan) |
| 126–150 | `ice-road` | 25 | [Ice roads](../packages/planners/docs/PLANNING-WATERWAYS.md#ice-road) |
| 151–175 | `furnace-bank` | 25 | [Furnace banks](../packages/planners/docs/PLANNING-STATIONS.md#furnace-bank) |
| 176–200 | `brewing-bench` | 25 | [Brewing benches](../packages/planners/docs/PLANNING-STATIONS.md#brewing-bench) |
| | **Total** | **200** | |

The commands estimate materials, layouts, coverage, throughput, and schedules
from supplied dimensions, rates, and limits. They are intended for design
work before a build. Each calculation has an expected-output test, and the
CLI tests exercise discovery and execution for all eight groups.

## Batch 15: 200 settlement planners

Each group adds 25 commands for planning a Minecraft settlement offline.

| Groups | Commands | Reference |
| --- | ---: | --- |
| `orchardplan`, `greenhouse` | 50 | [Gardens](../packages/planners/docs/PLANNING-GARDENS.md) |
| `maproom`, `bookbind`, `bannerhall` | 75 | [Settlements](../packages/planners/docs/PLANNING-SETTLEMENTS.md) |
| `harborplan`, `aqueduct`, `viaduct` | 75 | [Crossings](../packages/planners/docs/PLANNING-CROSSINGS.md) |

## Batch 16: 100 creative project planners

| CLI group | Commands | Guide |
| --- | ---: | --- |
| `textile` | 25 | [Textiles](../packages/planners/docs/PLANNING-TEXTILES.md) |
| `note-score` | 25 | [Note-block scores](../packages/planners/docs/PLANNING-SCORE.md) |
| `library-plan` | 25 | [Libraries](../packages/planners/docs/PLANNING-LIBRARY.md) |
| `mural` | 25 | [Pixel murals](../packages/planners/docs/PLANNING-MURAL.md) |
