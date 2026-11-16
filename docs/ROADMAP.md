# Roadmap

The original goal remains: let a local agent take over **the same Minecraft Java character a person is already playing**, perform a bounded task or attempt survival, and return control on demand. Fabric is the primary acceptance path for that experience. The standalone bot is a complementary mode for dedicated servers; bot results do not establish Fabric readiness.

The immediate milestone is an experimental **v0.1.0** on Minecraft 1.21.1. Readiness depends on acceptance of the release candidate, not a fixed date. [RELEASE.md](RELEASE.md) is the authoritative shipping checklist.

## Foundation and reliability work

Implemented: Fabric control, server bot, authenticated bridge/leases, CLI, MCP, Ollama planning, navigation, bounded collection, eating/retreat, explicit handoff, independent criteria, and verified packaging. Recorded live results are in [DEVELOPMENT.md](DEVELOPMENT.md#validation).

The November audit identified recovery and verification gaps. The following source changes have regression coverage; they still require live acceptance:

- Fabric backs off automatic eating for ten seconds after failed consumption. Action and retreat deadlines are checked before eating, so failed food use cannot indefinitely defer recovery.
- Bot mining has a separate deadline and up to sixty seconds for a return attempt. Takeover, cancellation, expiry, death, and survival interruption still stop collection without starting recovery.
- Combined collection/deposit criteria for the same item check the net increase across inventory and storage, so storing the collected quota does not require gathering a duplicate quota.
- Deposit verification never uses cached contents for success. On every backend, each container's baseline is the live contents the task's first deposit read there, and the final check reopens only the task's containers. Failed inspection cannot pass using cached contents. Ordinary observations remain last-observed snapshots.
- Fabric timing policy is extracted into a helper tested without Minecraft. Controller/game integration still needs live tests; helper tests do not establish full backend parity.

## v0.1 critical path

1. **Finish automated checks on the candidate.** Run Node regressions, demo smoke, Java tests, mod compilation, offline rebuild, bundle verification, and remote CI. Preserve cancellation coverage alongside the new recovery and storage cases.
2. **Prove the original Fabric workflow with packaged jars.** Install in a normal launcher, enter an existing character in single-player and multiplayer, attach the CLI, save home, collect a small quota, verify inventory/position, and resume manual play. Repeat with an actual MCP agent and a real local model; the existing model/MCP results are bot-only. Validate packaged chest/barrel deposits and storage inspection, including exact/omitted counts, full/blocked containers, double chests, refreshed contents, return, and takeover during transfers.
3. **Exercise Fabric failure and takeover paths.** Check partial collection, a real pit, tool loss, unreachable return, failed consumption while hungry and low on health, and deadlines while eating/retreating. Press F8 and open menus during inference, mining, eating, and return; closing menus must not resume the session. Check emergency stop, expiry, death, and dimension changes. The [Fabric lifecycle checklist](LIFECYCLE-SCENARIOS.md) lists each case.
4. **Recheck bot recovery and verification live.** Force a mining timeout in a pit and cancel during recovery. Run collect-and-store with both criteria. Remove stored items during model inference and block a chest lid before final inspection; neither may produce stale success. Inspecting storage must preserve a completed return-home result or report failure. [`npm run acceptance:bot`](LIVE-ACCEPTANCE.md) scripts these scenarios against a local server.
5. **Validate authenticated client → bot → client continuity.** Check the UUID and inventory at each stage. Never connect both as the same account simultaneously. This requires the account owner.
6. **Release a verified artifact.** Rebuild from a clean source commit, verify the archive, and publish the preview only after the required checks pass. Record the commit, artifact checksum, backend, launcher/server/model configuration, scenario, and result for each acceptance session.

Historical bot Ollama acceptance (20 October 2026) and MCP acceptance (27 October 2026) remain useful evidence, but do not close the Fabric gates. The remaining duration depends on live failures and resulting fixes; there is no firm session-count estimate.

## After v0.1

Evaluate these in order of evidence from actual use:

1. Shared behavioral scenarios for Fabric and bot lifecycle transitions, plus better terrain/tool/inventory recovery. *(The [lifecycle scenario table](LIFECYCLE-SCENARIOS.md) now runs against the demo driver and the bot driver on a mocked bot and generates the Fabric checklist. All three backends stop collection promptly when the inventory is full; Fabric's check still needs live acceptance, and terrain/tool recovery remains.)*
2. Richer task criteria and storage inspection scoped to the task rather than every container opened in the bot session. *(Deposit verification is now task-scoped on all three backends; Fabric's scoped path still needs live acceptance.)*
3. Crafting/building and richer survival or combat, after current actions are reliable.
4. Easier client/bot transfer and optional ordinary-input takeover.

Each new action needs preconditions, observable completion, execution limits, and cancellation that respects player takeover. Do not expand the action set at the expense of the Fabric acceptance path.
