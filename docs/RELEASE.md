# v0.1 release checklist

v0.1.0 is an **experimental preview** of the existing Minecraft 1.21.1 player harness. It includes Fabric control, the standalone bot, CLI, MCP, local Ollama planning, bounded collection/navigation/eating, chest deposits, and explicit handoff. Chest withdrawals and crafting from a bounded allowlist of basic items are also included as experimental actions; Fabric withdraw and craft need live acceptance. It does not include combat, other crafting, building, automatic reconnect transfer, or guaranteed survival.

## Automated release checks

- [x] JavaScript syntax and Node regression tests pass.
- [x] The simulated bridge completes a collection/eating/home/handoff smoke check.
- [x] The Fabric mod compiles against the pinned APIs; Java helper tests pass.
- [x] Explicit agent inventory/home criteria are checked independently of model explanations.
- [x] Packaging verifies exact jar names, manifest hashes, and pinned third-party hashes; it includes the project license.
- [x] CI is configured to run the simulation and produce a verified installation artifact.

The CI workflow is configured, but its remote execution on the final release commit must also pass. Automated checks and simulated/mocked model replies do not substitute for the live checks below.

## Live checks required before shipping

Record each session with [`mc-agent acceptance`](ACCEPTANCE.md). For packaged Fabric and authenticated handoff, pass the launcher profile's `mods` folder with `acceptance start --mods-dir`. The [bot scenario runner](LIVE-ACCEPTANCE.md) and the [Fabric lifecycle checklist](LIFECYCLE-SCENARIOS.md) cover several of these boxes.

Before ticking any remaining box, capture `acceptance status` with every open gate eligible on one candidate. Keep its commit and archive SHA-256 with the reviewed evidence for publication. The status report covers the open gates, so take this snapshot while they are all still open. A person reviews the evidence and ticks the boxes.

- [ ] Install the packaged jars in a normal Fabric launcher profile, enter a real world, attach the CLI, and observe the existing character.
- [ ] Run collection with partial progress and recovery from a pit on the latest Fabric and bot code. Verify an unreachable return is reported as failed and inventory progress remains observable. *(Bot: partial progress with a return and an unreachable home both verified on 20 October 2026. Fabric and an actual pit are still pending.)*
- [x] Run a real installed Ollama model with `--verify-collect oak_log:8 --verify-home`. Record the model name/version, initial inventory, result, and final manual control. *(`qwen3.5:4b-mlx` with the Mineflayer bot, 20 October 2026; see [DEVELOPMENT.md](DEVELOPMENT.md#validation).)*
- [x] Use a real MCP agent to observe, explicitly acquire, perform an action, and stop. *(Claude Code 2.1.312 headless with only the five Minecraft tools, against the Mineflayer bot, 27 October 2026; see [DEVELOPMENT.md](DEVELOPMENT.md#validation).)*
- [ ] Press F8 during inference/action; close the menu afterward and verify no command resumes. Check emergency stop and lease expiry with the packaged mod.
- [ ] With the packaged Fabric mod, force failed food consumption while hungry and low on health. Verify eating backoff, retreat, and action/retreat deadlines; interrupt eating and recovery with F8 and stop.
- [ ] Force a bot mining timeout in a real pit. Verify the bounded return attempt, failure status, preserved inventory progress, and immediate cancellation during recovery. *(Offline run in Boat passed on 20 November 2026; see [DEVELOPMENT.md](DEVELOPMENT.md#validation). Awaiting review on the release candidate.)*
- [ ] Validate Fabric chest/barrel deposits with exact and omitted counts, full/blocked containers, double chests, fresh inspection and return, and F8/menu/stop/expiry during transfers.
- [ ] Validate Fabric withdraw (exact and omitted counts, no candidate, short container, full inventory) and craft (inventory-grid and table recipes, missing ingredients, placing a held table, full inventory), with F8/menu/stop/expiry during each. Run a real local model with `--verify-withdraw` and `--verify-craft`.
- [ ] Validate bot withdraw and craft against a local server with the same cases, including a real local model with `--verify-withdraw` and `--verify-craft`. *(Every offline case passed in Boat on 20 November 2026 and awaits review; the real-model run is still pending.)*
- [ ] Run collect-and-store with both criteria. Remove stored items during inference and block inspection; stale contents must not produce success. Verify final inspection preserves return-home criteria or reports failure. *(Passed offline in Boat with scripted inference on 20 November 2026 and awaits review; the real-model run is still pending.)*
- [ ] Run a real local model and an actual MCP agent against the packaged Fabric mod; historical bot acceptance does not close this gate.
- [ ] Validate authenticated client → bot → client handoff. Check the UUID and inventory at each stage; never connect both as the same account simultaneously.
- [ ] Validate cobblestone with a pickaxe, hostile observations, and release on dimension change. *(Bot verified on 20 October 2026; Fabric still pending.)*

Earlier offline gameplay results are recorded in [DEVELOPMENT.md](DEVELOPMENT.md#validation). These boxes remain open until the latest release candidate has been observed working. Record failures and fix blocking regressions before marking them complete. Testing authenticated play requires the account owner; testing a normal launcher and F8 requires a person at the keyboard.

## Build and distribute

Use Node.js 22.12+ and a full Java 21 JDK on PATH. Follow the development guide's explicit download setup if dependencies are not cached. Then run:

```sh
npm run check
npm test
npm start -- demo --smoke
npm run build:mod
npm run verify:mod
```

Before live acceptance, commit the candidate source, confirm `git status --short` is empty, and build the bundle. `dist/BUILD.json` must identify that commit with `sourceModified: false`. Keep that archive and its checksums through acceptance and publication.

The installation download is `dist/minecraft-agent-0.1.0.zip`; it includes three mod jars, install instructions, license, jar checksums, and build metadata. The CLI remains source-installed with `npm ci`; `package.json` is private, and this release does not publish an npm package. Provide the source/tag link alongside the mod download.

After the live checks and remote CI pass, confirm the ZIP's SHA-256 matches both `dist/ARCHIVE_SHA256SUMS` and the saved candidate status. Tag the saved candidate commit as `v0.1.0` and publish that exact ZIP and its checksum. Release notes must call it an experimental preview, list the tested launcher/model/server configurations, and retain the documented limitations and known issues.

## Planning estimate

The code and packaging can be prepared independently of live account access. The remaining critical path includes packaged Fabric acceptance, recovery and storage failure scenarios, authenticated handoff, any resulting fixes, and remote CI on the candidate commit. There is no fixed session-count estimate. There is no scheduled release date; authenticated handoff and Fabric gameplay with the packaged mod have not yet been verified. See the [roadmap](ROADMAP.md) for priorities and [changelog](../CHANGELOG.md) for the planned release contents.
