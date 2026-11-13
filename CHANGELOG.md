# Changelog

Changes being prepared for the initial experimental release. Acceptance is tracked in [docs/RELEASE.md](docs/RELEASE.md).

## Unreleased — intended for v0.1.0

### Added

- Constraint screening for all 1,000 typed planners: 1,000 new planner/workflow
  combinations, bringing the study catalog to 6,000. Check up to 20 explicit
  criteria per candidate with per-check outcomes and pass/fail totals; see
  [constraint screening](docs/PLANNING-STUDIES.md#constraint-screening).
  This is one reusable offline workflow and does not extend gameplay claims.

- Five offline study workflows for each of the 1,000 typed planners: 5,000
  planner/workflow combinations for batch evaluation, baseline comparison,
  parameter sweeps, sensitivity, and ranking. Includes a machine-readable
  catalog, bounded JSON/file/stdin requests, and atomic failure reporting;
  see [planning studies](docs/PLANNING-STUDIES.md). These are reusable workflows,
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

Recorded live tests used development single-player/offline multiplayer. Real Ollama planning and a real MCP agent (Claude Code) were validated with the bot. Authenticated handoff, normal launcher installation, and Fabric recovery/tool changes remain on the acceptance checklist. Combat, crafting, building, seamless transfer, and guaranteed survival are not implemented.

## Batch 6 — logistics, terrain, routine audit, and timelines

- Add 100 CLI planning/reporting commands in four groups of 25, with numbered
  inventories in `docs/IMPROVEMENTS.md` and focused command documentation.
- Keep observation reports read-only and offline tools disconnected from gameplay;
  no bridge protocol changes or new Fabric acceptance claims.
