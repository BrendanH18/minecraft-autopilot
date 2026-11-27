# Changelog

Changes being prepared for the initial experimental release. Acceptance is tracked in [docs/RELEASE.md](docs/RELEASE.md).

## Unreleased — intended for v0.1.0

### Changed

- The offline planners, planning studies and the 44 report and tool groups moved into the `@minecraft-autopilot/planners` npm workspace package in `packages/planners/`, with their tests and reference docs. `npm install` in the repository root still installs them, and the commands are unchanged. The core CLI runs without the package: core commands never load it, and other commands then report that the package isn't installed.

- Core commands such as `stop`, `observe` and `mcp` no longer load the 44 offline tool groups (supplies, survey, ledger and the rest). Those load only for their own commands, root help and unknown-command suggestions. Help output is unchanged.

### Added

- `npm run acceptance:fabric -- --packaged` runs the Fabric scenarios on the three jars from the release archive, with Fabric Loader in production mode, after checking the jars against the archive. It also checks the client log for the loaded mods and for mixin or refmap errors. The new `Fabric acceptance` workflow runs `--fast` on mod pull requests, plus `--takeover` and `--packaged` weekly. `disconnect-collect` now rejoins after the kick through the disconnect screen. All of these are pre-checks, not release evidence.

- `npm run acceptance:fabric -- --takeover` scripts the Fabric checklist items that need no person: F8, the pause menu and inventory screen, closing the agent's storage or crafting screen, emergency stop, cancel, lease expiry, death, disconnect, dimension change and a full inventory. It presses real keys with xdotool on the headless client and checks each outcome with independent server reads. These are pre-checks for the keyboard session, not release evidence.

- `npm run acceptance:fabric` runs the live acceptance scenarios against the Fabric development client, with a fresh client per scenario. It runs headless in a Boat sandbox under Xvfb with software OpenGL. Its results are pre-checks for the packaged keyboard sessions and never count as release evidence.

- `study examples` and `study example GROUP COMMAND` list and run worked
  planner examples. Reports show the inputs, computed result, and
  independently calculated expected output. See [worked examples](packages/planners/docs/PLANNING-STUDIES.md#worked-examples).

- Packaged Fabric acceptance fixtures for keyboard and lease takeover, plus cobblestone collection, hostile observations, and dimension-change release.

- The opt-in `withdraw-craft-model` bot scenario uses a local Ollama model to withdraw cobblestone and craft a stone pickaxe, with independent server checks of the chest and player inventory.

- Run the offline storage and crafting scenarios with `acceptance:bot --fast`. The weekly and on-demand GitHub Actions workflow retains the results and vanilla server log.

- A local fixture helper prepares repeatable pit, storage and crafting setups for packaged Fabric acceptance and prints independent server reads for before and after each action.

- Release acceptance status detects evidence from mixed candidate commits or archives. Packaged Fabric and authenticated handoff sessions verify the installed jar hashes against the candidate archive with `acceptance start --mods-dir`.

- Live bot acceptance scenarios cover omitted withdrawal counts, missing or short storage, and full inventory for withdrawals and crafts. The crafting scenarios also check insufficient ingredients for a requested quota.

- [Batch 16](docs/IMPROVEMENTS.md#batch-16-100-creative-project-planners) adds 100 offline planners for textile floors, note-block scores, library collections, and pixel murals.

- Experimental `withdraw` and `craft` actions. `withdraw ITEM [COUNT]` takes an
  item from a chest or barrel within 16 blocks and reports the container like a
  deposit. `craft ITEM COUNT` makes 1–64 of an allowlisted item (planks, sticks,
  crafting tables, torches, chests, furnaces, wooden and stone pickaxes, axes
  and shovels), using a crafting table within 16 blocks or placing a held one.
  Both are available from the CLI, routines, MCP, and the Ollama planner, with
  `--verify-withdraw` and `--verify-craft` criteria that check the final held
  increase. The planner refuses actions that would satisfy one gain criterion
  through another, such as withdrawing a collection quota. Fabric and bot
  behaviour still need live acceptance.

- [200 settlement planners](docs/IMPROVEMENTS.md#batch-15-200-settlement-planners) cover gardens, map rooms, books, banners, and crossings. All support the nine planning study workflows.

- 200 offline build planners for scaffolds, beacon bases, tunnel ventilation
  layouts, canal locks, underwater draining, ice roads, furnace banks, and
  brewing benches. Each command calculates from supplied assumptions and can
  run without a bridge. All 200 also support the nine [study workflows](packages/planners/docs/PLANNING-STUDIES.md). See [the command inventory](docs/IMPROVEMENTS.md#batch-14-200-offline-build-planners).

- Fabric parity for task-scoped storage verification and the full-inventory
  collection stop. Fabric deposit jobs now report `container` (canonical
  position, block name, and the `before` contents read from the opened screen
  before any click) on completed, failed, and cancelled jobs, and Fabric
  `inspect_storage` honours `containers`, reopening only those inventories
  (either half of a double chest selects it once; an unopened position fails
  before anything moves). The planner's `--verify-deposit` now takes the
  scoped path on Fabric too, so unrelated storage opened earlier no longer has
  to stay within 16 blocks. Fabric collection stops with `Inventory full;
  collected N of M <block>.` as soon as no main slot can take the drop, keeps
  its progress, and makes the bounded return attempt. Decision logic lives in
  Minecraft-free helpers (`InventoryRoom`, `StorageTargets`) with JUnit
  coverage, and the `inventory-full-collect` lifecycle scenario now has a
  manual Fabric check. Both changes still need live Fabric acceptance.

- Task-scoped storage verification on the server bot and demo (Fabric followed; see above). Deposits report
  the container they used and its live contents just before the transfer; with
  `--verify-deposit`, the agent counts only those containers against those
  baselines and reopens only them before accepting `done`. A container opened
  earlier elsewhere in the session no longer fails a correct task. Stale,
  blocked, merged-with-unread, or unattributed storage still fails closed.
  `inspect_storage` accepts an optional `containers` list (1–16 positions;
  `inspect-storage --container x,y,z`). Fabric honours it too; see the Fabric
  parity entry above. See [usage](docs/USAGE.md).

- Collection stops promptly when the inventory is full (server bot and demo).
  Instead of breaking blocks whose drops cannot be picked up until the 180 s
  mining deadline, collection fails with `Inventory full; collected N of M
  <block>.`, keeps its progress, and still makes the bounded return attempt.
  A new `inventory-full-collect` [lifecycle scenario](docs/LIFECYCLE-SCENARIOS.md)
  covers both backends; Fabric followed (see the Fabric parity entry above). The demo now
  respects 64-item stacks, so the `full` scenario refuses further collection.

- v0.1 acceptance tooling. `mc-agent acceptance` (`list`, `show`, `start`,
  `step`, `finish`, `sessions`, `report`, `status`) records live release-gate
  sessions with commit, worktree, build and archive provenance, and reports
  which sessions are eligible evidence. It never edits the release checklist.
  `npm run acceptance:bot` runs scripted bot recovery and storage scenarios
  against a local vanilla server with independent `data get` checks; offline
  runs on 20 November 2026 are recorded in
  [DEVELOPMENT.md](docs/DEVELOPMENT.md#validation). A shared lifecycle scenario table is
  tested against the demo driver and the bot driver on a mocked bot, and generates the Fabric manual
  checklist; see [acceptance](docs/ACCEPTANCE.md),
  [live bot acceptance](docs/LIVE-ACCEPTANCE.md), and
  [lifecycle scenarios](docs/LIFECYCLE-SCENARIOS.md).

- 200 offline planners in eight new groups (`stairplan`, `roundplan`,
  `rampart`, `warehouse`, `stripmine`, `herd`, `signalplan`, `linkplan`) and
  three study workflows for every typed planner (`factorial`, `summarize`,
  `pareto`): 5,000 new callable entries, made of the 200 commands plus 4,800
  planner/workflow combinations, with the study catalog growing from 6,000 to
  10,800; see [batch 13](docs/IMPROVEMENTS.md#batch-13-200-planners-and-three-study-workflows).
  These are supplied-data calculations and three reusable workflows, not 5,000
  algorithms, and they do not extend gameplay claims.

- Constraint screening for all 1,000 typed planners: 1,000 new planner/workflow
  combinations, bringing the study catalog to 6,000. Check up to 20 explicit
  criteria per candidate with per-check outcomes and pass/fail totals; see
  [constraint screening](packages/planners/docs/PLANNING-STUDIES.md#constraint-screening).
  This is one reusable offline workflow and does not extend gameplay claims.

- Five offline study workflows for each of the 1,000 typed planners: 5,000
  planner/workflow combinations for batch evaluation, baseline comparison,
  parameter sweeps, sensitivity, and ranking. Includes a machine-readable
  catalog, bounded JSON/file/stdin requests, and atomic failure reporting;
  see [planning studies](packages/planners/docs/PLANNING-STUDIES.md). These are reusable workflows,
  not 5,000 new algorithms, and leave live gameplay acceptance gates open.

- 1,000 offline planning and analysis commands in 40 groups of 25, covering
  spatial layouts, resource budgets, measurement statistics, dependency
  graphs, routes, schedules, and patrol estimates; see
  [batch 10](docs/IMPROVEMENTS.md#batch-10-1000-offline-planning-and-analysis-improvements).
  These supplied-data calculations do not extend gameplay acceptance claims.

- 500 offline planning and evidence commands across 20 groups: spatial
  calculations, caller-supplied resource budgets, snapshot trends, routine
  metrics, and transcript queries; see [batch 9](docs/IMPROVEMENTS.md#batch-9-500-offline-planning-and-evidence-improvements).
  Live gameplay acceptance gates remain open.

- 200 offline CLI additions for route schedules, discrete work areas, inventory
  and storage comparisons, transcript inspection and diagnostics, and routine
  comparison and selection; see [batch 8](docs/IMPROVEMENTS.md#batch-8-200-offline-planning-and-evidence-analysis-additions).
  Eight groups of 25 have behavioral and real CLI process coverage, without
  extending the live gameplay acceptance claims.

- 100 CLI additions for read-only expedition budgets, offline construction
  material estimates, saved-snapshot predicates, and validated routine
  composition; see [batch 7](docs/IMPROVEMENTS.md#batch-7-100-expedition-blueprint-checkpoint-and-composition-additions).
  Each addition has behavioral and real CLI process coverage. Existing live
  Fabric and authenticated-handoff acceptance gates remain open.

- 100 more CLI tools for multi-item stock planning, spatial observation queries, route geometry, and validated routine editing; see [batch 5](docs/IMPROVEMENTS.md#batch-5-100-stock-spatial-geometry-and-workbench-additions).

- 100 CLI additions across inventory/storage reports, world surveys, offline navigation, and routine tooling; see [batch 4](docs/IMPROVEMENTS.md#batch-4-100-planning-and-reporting-additions).

- Ten focused CLI commands, six final-state verification criteria/options, and planner/storage reliability improvements; see [the 30-change inventory](docs/IMPROVEMENTS.md#batch-1-cli-verification-and-planner-improvements).
- Ten read-only overview/search/snapshot commands, planner dry runs, transcripts, fences, action allow-lists and tuning options, two more criteria, JSON routines, three MCP tools, demo scenarios, and an Ollama doctor check; see [batch 2](docs/IMPROVEMENTS.md#batch-2-overview-commands-planner-controls-routines-and-mcp-tools).
- Watch/wait-idle/risk/census/slots/route commands, named waypoints, offline snapshot diffs, planner health stops, invalid-output retries, sampling controls, model usage stats, prompt previews, transcript summaries, two more criteria, routine step/repeat/error/health controls, three MCP tools, a full-inventory demo scenario, `doctor --strict`, and `paths`; see [batch 3](docs/IMPROVEMENTS.md#batch-3-watching-waypoints-planner-safety-and-routine-controls).

- Fabric 1.21.1 control of the logged-in character through Baritone.
- Mineflayer server bot with Microsoft device authentication and explicit offline development mode.
- CLI observation, waypoints, navigation, collection, eating, guard, profile attachment, diagnostics, and cleanup.
- Authenticated localhost bridge with exclusive leases, heartbeats, bounded jobs, cancellation, and emergency stop.
- MCP stdio tools and a bounded Ollama planner using structured actions.
- Simulation, Node/Java regression tests, and CI installation artifacts.
- Independent inventory/home checks through `--verify-collect` and `--verify-home`.
- Chest and barrel deposits for Fabric, the server bot, and demo through `deposit`, MCP, and the planner, with container observations and an independent `--verify-deposit` check.
- Planner progress against explicit criteria, `--model-timeout`, and `--no-thinking` for faster local models.
- Verified installation ZIP with license, checksums, and source commit/checkout metadata.
- Usage, contributor, roadmap, protocol, troubleshooting, and release documentation.

### Fixed

- Fabric `home` now walks into the saved home block, and an inventory inspection walks back into the block it started in. Both used to stop as soon as the player was within 1.75 blocks, which could be half way up a step. The planner's final inspection then counted the step below as "returned", and each retried inspection started where the last stopped, so `inspect-preserves-home` ended five blocks from home ([#78](https://github.com/BrendanH18/minecraft-autopilot/issues/78)). If Baritone can't enter the home block, `home` still finishes beside it.
- Fabric: F8, or opening the pause menu or inventory, between storage stacks no longer gets lost. Each container screen the agent opened cleared the pending key press before the end of the tick, or replaced the player's menu, so the deposit or withdrawal went on. The takeover binding now acts when the key arrives, and the player's menu returns control as it opens.
- A new session at the death screen is refused with "Your character is dead. Respawn manually", not "Minecraft is paused", because Fabric's death screen also reports paused.
- Fabric's bridge now sends `"items": null` for containers it hasn't opened. It used to leave the field out, so the planner rejected Fabric state, and every storage task with an unopened chest nearby failed verification. The scripted Fabric run found this.
- Fabric job messages now match the bot's wording for deposits, withdrawals and crafting. For example, `Deposited 8 oak_log into the chest at X Y Z.` and `Placed a crafting table at X Y Z.`, with no `minecraft:` prefixes. A Fabric deposit with too few items held now fails as a job, as on the bot, instead of the request being refused.

- Core CLI commands, including `stop`, `observe`, and `mcp`, start without
  loading the offline planner catalog.

- Fabric checks for lost control before processing queued bridge requests,
  preserves existing saved homes if a write fails, and validates the crafting
  grid and recipe yield before taking output.

- Acceptance evidence validates the archived build manifest and serializes
  updates to the session file. New bot scenarios and Fabric fixtures exercise
  additional storage, crafting, and player lifecycle cases.

- Fabric defers automatic eating during storage and crafting, and waits for
  server confirmation before using a newly placed crafting table. A regression
  test keeps the Fabric and Node crafting allowlists in sync.

- The server bot moves a craft's result directly into inventory and refreshes
  the crafting window before proceeding, preventing stale cursor state from
  interrupting a batch of planks.

- Give bot collection a 15 s margin past its 60 s return budget, so a full-length return after a mining timeout reports its inventory progress instead of "Action timed out."
- End bot jobs interrupted by death, disconnect, or a world/dimension change as `cancelled` with the shared lifecycle message, matching the demo and Fabric, instead of `failed` with the driver's raw reason.
- Check Fabric action/retreat deadlines before eating and back off failed consumption, with isolated timing-policy regression tests.
- Reserve bot collection recovery time after a mining timeout while preserving immediate handoff cancellation.
- Verify gather-and-store against net inventory/storage gains, refresh container baselines and final contents, and reject stale success when storage cannot be inspected.

- Prevent delayed actions/model replies/inventory operations from resuming after handoff or cancellation.
- Recover from collection pits and unmet quotas; report unsuccessful returns as failures.
- Require cobblestone harvesting tools and recover when the last pickaxe breaks.
- Refuse dead-character bot joins instead of waiting indefinitely for spawn.
- Eat before low-health retreat and replan after interrupted collection.
- Handle focus-loss takeover, preload Baritone mining data, and scope homes to world/player/dimension.
- Detect runtime-only Java and follow the selected profile without exposing credentials.
- Reject premature model `done` replies while explicit criteria are unmet, refuse planner `set_home` over an existing home, use an 8192-token Ollama context, and explain model timeouts.
- Constrain model output with a flat schema that Ollama's llama.cpp runner enforces, and refuse repeated actions that changed nothing.
- Fail bot navigation that stops short of its goal, and hop free when the pathfinder is stuck on a block edge instead of waiting for the job timeout.
- Collect logs about 40% faster with the bot by failing fast on logs it cannot reach and walking to where drops land.

### Validation limits

Recorded live tests used development single-player/offline multiplayer. Real Ollama planning and a real MCP agent (Claude Code) were validated with the bot. Authenticated handoff, normal launcher installation, and Fabric recovery/tool changes remain on the acceptance checklist. Combat, crafting, building, seamless transfer, and guaranteed survival were not implemented at the time; allowlisted crafting was added later (see Unreleased).

## Batch 6 — logistics, terrain, routine audit, and timelines

- Add 100 CLI planning/reporting commands in four groups of 25, with numbered
  inventories in `docs/IMPROVEMENTS.md` and focused command documentation.
- Keep observation reports read-only and offline tools disconnected from gameplay;
  no bridge protocol changes or new Fabric acceptance claims.
