# Roadmap

The original goal remains: let a local agent take over **the same Minecraft Java character a person is already playing**, perform a bounded task or attempt survival, and return control on demand. Fabric is the primary acceptance path for that experience. The standalone bot is a complementary mode for dedicated servers; bot results do not establish Fabric readiness.

The immediate milestone is an experimental **v0.1.0** on Minecraft 1.21.1. Readiness depends on acceptance of the release candidate, not a fixed date. [RELEASE.md](RELEASE.md) is the authoritative shipping checklist.

## Foundation and reliability work

Implemented: Fabric control, server bot, authenticated bridge/leases, CLI, MCP, Ollama planning, navigation, bounded collection, eating/retreat, explicit handoff, independent criteria, task-scoped storage verification, chest withdrawals, allowlisted basic crafting, and verified packaging. Recorded live results are in [DEVELOPMENT.md](DEVELOPMENT.md#validation).

The November audit identified recovery and verification gaps. The following source changes have regression coverage. The bot side has offline live runs awaiting review; the Fabric side still requires live acceptance:

- Fabric backs off automatic eating for ten seconds after failed consumption. Action and retreat deadlines are checked before eating, so failed food use cannot indefinitely defer recovery.
- Bot mining has a separate deadline and up to sixty seconds for a return attempt. Takeover, cancellation, expiry, death, and survival interruption still stop collection without starting recovery.
- If the bot runs out of matching blocks, a pickup during the return can still satisfy the collection quota. A failed return remains a failed action.
- Combined collection/deposit criteria for the same item check the net increase across inventory and storage, so storing the collected quota does not require gathering a duplicate quota.
- Deposit verification never uses cached contents for success. On every backend, each container's baseline is the live contents the task's first deposit read there, and the final check reopens only the task's containers. Failed inspection cannot pass using cached contents. Ordinary observations remain last-observed snapshots.
- Fabric timing policy is extracted into a helper tested without Minecraft. Controller/game integration still needs live tests; helper tests do not establish full backend parity.

## Audit (20 November 2026)

- **Fabric has not run live since 11 November.** That development-client run covered deposits, fresh inspection, and F8 during a transfer. Fabric task-scoped inspection and the full-inventory stop (`31bec80`), and Fabric withdraw and craft (`4cf0b0d`), have only helper tests. Bot crafting passed its mocked tests and still failed intermittently on its first real server (`6d83b48`), so expect similar findings on Fabric.
- **Bot step 4 is further along than the checklist shows.** Clean offline runs in Boat passed the ten recovery and storage scenarios (`1b1d7f4`) and the eight withdrawal and crafting scenarios (`f0eecd8`). They still need a person's review on the release candidate. The real-model scenarios have not been run.
- **Most recent effort went outside the critical path.** About half of the last 50 commits added offline planners, recipes, and study combinations. `src/planning-*.js` is 23,008 of the 43,630 lines in `src/*.js`, and most of `docs/` and `test/` serve those tools. None of that work advances a release gate. It does add review, CI, and CLI start-up cost: `src/cli.js` imports every tool group, even for `stop` and `mcp`.
- **Code review found Fabric crafting risks.** Automatic eating checks only for an open screen, and an inventory-grid craft has none, so eating can start mid-craft and pause `FabricStorage.tick` for up to 5 s against the crafting step's 5 s timeout. Placing a held crafting table trusts the client's predicted block, not the server. The allowlist is defined twice, in `src/recipes.js` and `CraftingRecipes.java`, with no parity test.
- **Evidence can look more current than it is.** `acceptance status` checks each gate on its own. It does not show that every gate's evidence came from one candidate commit and archive, or that the launcher loaded those jars. The bot runner's results file is separate from acceptance sessions.
- **Stale documentation** said Fabric ignored scoped inspection, that Fabric had no full-inventory stop, that the bot runner had never run, and that crafting was unimplemented. These were corrected with this audit.

## Six-month plan: 23 November 2026 – 9 May 2027

Each month is four weeks. Every month's work assumes the month before it shipped. If v0.1.0 slips, its remaining gates come first and later months move back by the same amount. Dates are targets; releases still depend on reviewed acceptance, not the calendar.

| Month | Dates | Theme | Exit criterion |
| --- | --- | --- | --- |
| 1 | 23 Nov – 20 Dec | Ship v0.1.0 | v0.1.0 is tagged from a reviewed candidate, or its open gates are recorded. |
| 2 | 21 Dec – 17 Jan | Automate Fabric checks; slim the core | A scripted Fabric run covers the non-keyboard gates, and the planners no longer load with the core CLI. |
| 3 | 18 Jan – 14 Feb | Move to a current Minecraft release | Both backends pass their offline suites on the new version. |
| 4 | 15 Feb – 14 Mar | Recovery and richer criteria | Tool, terrain, and inventory recovery pass shared scenarios on all three backends. |
| 5 | 15 Mar – 11 Apr | Smelting and small builds | `smelt` and `build` pass offline bot and scripted Fabric scenarios. |
| 6 | 12 Apr – 9 May | Ship v0.2.0 | v0.2.0 is tagged from a reviewed candidate. |

Throughout: the weekly `acceptance:bot` workflow stays green, user-reported v0.1 bugs come before new features, and each month ends with one keyboard session on the Mac for the checks only a person can do.

## Month 1 (23 November – 20 December 2026): ship v0.1.0

The goal for the month is a reviewed v0.1.0 candidate. Agents do the headless work in Boat; a person runs the packaged Fabric sessions on the Mac; the account owner runs the authenticated handoff. If a person or the account owner is unavailable, the release waits; nothing ships on partial evidence.

Use [candidate preflight](ACCEPTANCE.md#workflow) to check the archive and installed jars before opening a live session. The [Fabric fixture helper](LIVE-ACCEPTANCE.md#fabric-fixtures) prepares the storage, recovery, and expiry cases for the keyboard sessions. The bot runner now covers the bot half of the cobblestone, hostile observation, and dimension-change gate on the candidate under review.

Strict acceptance start verifies the installable ZIP and its pinned dependencies, and sessions keep the checklist used during the run. The next release decisions still depend on packaged Fabric, real-model and MCP evidence, and the account owner's authenticated handoff recorded against one clean candidate.

### Week 1 (23–29 November): harden and prepare (headless, Boat)

**Done (25 November).** All six items landed in #72–#75. Two month 2 items were also brought forward to reduce risk in the week 2 keyboard session: the Fabric mode of the live runner and the version spike (see month 2).

| Item | Done when |
| --- | --- |
| Defer automatic eating while a Fabric storage or craft action owns the inventory, and wait for the server to confirm a placed crafting table. | Java helper tests cover both. `npm run build:mod` and `npm run lint:mod` pass. |
| Add a recipe parity test between `src/recipes.js` and `CraftingRecipes.java`. | The test fails when an item, yield, ingredient, or table requirement differs. |
| Add a `withdraw-craft-model` real-model scenario and a `--fast` preset (no pit scenarios) to the [bot runner](LIVE-ACCEPTANCE.md). | `--dry-run` lists both, and `--fast` passes in Boat in under five minutes (4 min 19 s on 26 November). |
| Add a [Fabric fixture helper](LIVE-ACCEPTANCE.md#fabric-fixtures) for pit, chest and barrel deposits, withdrawals, and crafting on a local server. | A dry run prints the fixture and independent server reads for each provided setup, and a Boat run builds them on the vanilla server. |
| Make `acceptance status` report whether all eligible evidence shares one candidate commit and archive checksum, and let `acceptance start` record the hashes of the jars in a launcher `mods` folder. | Mixed candidates and jars that don't match the archive are reported as ineligible, with tests. |
| Add a weekly and on-demand `acceptance:bot` workflow on a GitHub-hosted runner. It is not a required check. | One manual run passes and uploads `results.json` and `server.out`. |

### Week 2 (30 November – 6 December): bot gates and the first Fabric session

Before packaged Fabric session 1, run `npm run acceptance:fabric -- --accept-eula --fast` and `npm run acceptance:fabric -- --accept-eula --takeover` on the candidate in Boat. Then the keyboard session starts from the known Fabric failures, not from finding them. `--takeover` scripts the [Fabric checklist](LIFECYCLE-SCENARIOS.md#fabric-checklist) items that need no person (F8, menus, stop, cancel, expiry, death, disconnect, dimension change, full inventory) with real key presses on the headless client; the session still runs them with the packaged jars, because Xvfb key presses aren't evidence for those gates. Since 27 November the two storage-screen-close items pass too, with the mod's opt-in `-Dminecraftagent.storageStepDelayTicks=20` holding the agent's chest screen open long enough for Escape; the keyboard session adds the same JVM argument for those two items.

**Agent candidate run done (26 November).** Candidate `3fca55b` passed `acceptance:bot --all` (28 offline scenarios; the two real-model ones skipped), all 25 Fabric `--fast` scenarios, and 29 of 31 `--takeover` scenarios, the other two being the known storage-screen-close expected failures. The run found one bug, in the runner: the test server's synchronous chunk writes stalled a `forceload` in Boat and failed the second half of every `--all` run. It is fixed with a test. No Fabric failures were found, so session 1 starts from the packaged-only items. Later that day the runner gained eating, retreat and full-inventory scenarios on both backends and scripted takeover while stopping on Fabric, so the eating half of `fabric-eating-recovery` in session 2 also starts from known headless results. Then the packaged jars themselves were pre-checked headless: `acceptance:fabric --packaged` runs the scenarios on the release archive's three jars with Fabric Loader in production mode, and all 27 `--fast` scenarios passed, so session 1 shouldn't hit a remapping, mixin or nested-jar failure. `disconnect-collect` now scripts the rejoin too, and a non-required `Fabric acceptance` workflow runs `--fast` on mod pull requests and `--fast`, `--takeover` and `--packaged` weekly. Details are in [DEVELOPMENT.md](DEVELOPMENT.md#validation).

| Item | Done when | Who and where |
| --- | --- | --- |
| Build a clean candidate in Boat and run `acceptance:bot --all`. | Every offline scenario passes on the candidate commit. | Agent, Boat. **Done (26 November)** on `3fca55b`. |
| Review the bot results for `bot-mining-timeout`, `bot-withdraw-craft`, `collect-and-store-verification`, and the bot half of `collection-pit-recovery`. | A person records the review in [DEVELOPMENT.md](DEVELOPMENT.md#validation) and ticks the boxes the evidence supports. | Person. |
| Run `stale-removal-model` and `withdraw-craft-model` with a real local model. | Both pass and are recorded. | Person, Mac with Ollama. Both passed a Boat pre-check with `qwen3.5:4b` on the CPU on 27 November, after three planner and observation fixes ([DEVELOPMENT.md](DEVELOPMENT.md#validation)). |
| Packaged Fabric session 1: `fabric-packaged-install`, `fabric-f8-takeover`, `cobblestone-hostiles-dimension`, and the Fabric half of `collection-pit-recovery`. | Each gate has a finished `mc-agent acceptance` session with independent server reads, and each failure has an issue. | Person at the keyboard, Mac. |

### Week 3 (7–13 December): Fabric fixes and the second Fabric session

| Item | Done when | Who and where |
| --- | --- | --- |
| Fix the session 1 failures. | Each fix has a regression test and passes CI and `npm run verify:mod` on a clean rebuild. | Agent, Boat. |
| Packaged Fabric session 2: `fabric-eating-recovery`, `fabric-storage-deposits`, `fabric-withdraw-craft`, `fabric-local-model`, and `fabric-mcp-agent`. | Each gate has eligible evidence on the candidate, and every run ends in manual control. | Person at the keyboard, Mac with Ollama and an MCP client. |

### Week 4 (14–20 December): handoff and release

| Item | Done when | Who and where |
| --- | --- | --- |
| Authenticated client → bot → client handoff (`authenticated-handoff`). | UUID and server-side inventory match at each stage, and the client and bot are never connected as the account at the same time. | Account owner, Mac. |
| Freeze the candidate, rerun `acceptance:bot --all` and the affected Fabric checks, and run remote CI. | `dist/BUILD.json` shows `sourceModified: false`, the archive verifies, and `node` and `mod` pass. Every RELEASE.md box is ticked by a person against that candidate. | Agent, Boat and CI; person for sign-off. |
| Tag and publish `v0.1.0` as an experimental preview, or record what blocks it. | The release notes list the tested configurations and known issues. Otherwise this roadmap names the open gates and the next session. | Person. |

`stop`, `observe`, `mcp` and the other core commands now skip the offline tool groups, planners and acceptance tooling (26 November: about 15 ms faster to start on Boat). The planners then moved out of the core into the [`@minecraft-autopilot/planners`](../packages/planners/README.md) workspace package (27 November, brought forward from month 2).

### Not in month 1

- No new offline planner groups, recipe packs, or study combinations until v0.1.0 ships. Existing commands stay, and catalog counts are not release progress.
- No new gameplay actions, recipes, or protocol features beyond the approved allowlist.

### Decisions for the owner

The first three affect month 1; the rest affect later months.


1. If Fabric withdraw and craft are still unstable after week 3, ship v0.1.0 with them marked bot-only, or hold the release?
2. Should a core subset of the [Fabric checklist](LIFECYCLE-SCENARIOS.md#fabric-checklist) block each release candidate, with the rest as targeted regression checks? A possible core: F8, menu close, stop, expiry, death, dimension change, storage or craft screen closed by the player, and full inventory.
3. Do the October bot Ollama and MCP ticks still stand? MCP has since grown from five tools to eleven, and RELEASE.md asks for the latest candidate.
4. ~~Month 2: should the offline planners move to a workspace package in this repository or to a separate repository? Once moved, new planners go only there.~~ **Resolved (27 November):** a workspace package in this repository, `packages/planners/`. New planners go only there.
5. Month 3: which Minecraft version to target, and does v0.1.x on 1.21.1 keep receiving fixes after the port?
6. Month 5: are `smelt` and small `build` the right next actions, or should something else take that month?

## v0.1 critical path

1. **Finish automated checks on the candidate.** Run Node regressions, demo smoke, Java tests, mod compilation, offline rebuild, bundle verification, and remote CI. Preserve cancellation coverage alongside the new recovery and storage cases.
2. **Prove the original Fabric workflow with packaged jars.** Install in a normal launcher, enter an existing character in single-player and multiplayer, attach the CLI, save home, collect a small quota, verify inventory/position, and resume manual play. Repeat with an actual MCP agent and a real local model; the existing model/MCP results are bot-only. Validate packaged chest/barrel deposits and storage inspection, including exact/omitted counts, full/blocked containers, double chests, refreshed contents, return, and takeover during transfers. Validate packaged withdraw and craft the same way, including placing a held crafting table and takeover between crafts.
3. **Exercise Fabric failure and takeover paths.** Check partial collection, a real pit, tool loss, unreachable return, failed consumption while hungry and low on health, and deadlines while eating/retreating. Press F8 and open menus during inference, mining, eating, and return; closing menus must not resume the session. Check emergency stop, expiry, death, and dimension changes. The [Fabric lifecycle checklist](LIFECYCLE-SCENARIOS.md) lists each case.
4. **Recheck bot recovery and verification live.** Force a mining timeout in a pit and cancel during recovery. Run collect-and-store with both criteria. Remove stored items during model inference and block a chest lid before final inspection; neither may produce stale success. Inspecting storage must preserve a completed return-home result or report failure. Run the withdrawal and crafting scenarios too. [`npm run acceptance:bot`](LIVE-ACCEPTANCE.md) scripts all of these against a local server. *(The offline scenarios passed in Boat on 20 November 2026; they need review on the release candidate, and the real-model scenarios have not been run.)*
5. **Validate authenticated client → bot → client continuity.** Check the UUID and inventory at each stage. Never connect both as the same account simultaneously. This requires the account owner.
6. **Release a verified artifact.** Rebuild from a clean source commit, verify the archive, and publish the preview only after the required checks pass. Record the commit, artifact checksum, backend, launcher/server/model configuration, scenario, and result for each acceptance session.

Historical bot Ollama acceptance (20 October 2026) and MCP acceptance (27 October 2026) remain useful evidence, but do not close the Fabric gates. The remaining duration depends on live failures and resulting fixes; there is no firm session-count estimate.

## Months 2–6 (21 December 2026 – 9 May 2027)

### Month 2 (21 December – 17 January): automate Fabric checks and slim the core

Human time is short over the holidays, so this month is mostly headless and builds tooling that saves keyboard time later.

| Item | Done when | Who and where |
| --- | --- | --- |
| Fix v0.1.0 bugs reported by users, and ship v0.1.1 if any are serious. | Each fix has a regression test; a patch release follows the same release checklist. | Agents in Boat; a person to release. |
| Add a Fabric mode to the live acceptance runner. It starts the development client with `-PquickPlay` against the runner's offline server, then reuses the fixtures and independent `data get` checks. | Storage, withdraw, craft, pit, eating, and full-inventory scenarios run against Fabric with no one at the keyboard. | Agent, on the Mac (the client needs a GPU). **Brought forward:** `npm run acceptance:fabric` ([Fabric development client mode](LIVE-ACCEPTANCE.md#fabric-development-client-mode)) runs every bot scenario on the development client, headless in Boat (Xvfb with software OpenGL), so it doesn't need the Mac. The first runs (25 November) found and fixed three Fabric bugs: dropped `null` fields in bridge state, which broke every storage verification; job messages that differed from the bot's; and a short deposit that was refused before a job existed. A fourth, `home` and inspection returns that stopped short of their block ([#78](https://github.com/BrendanH18/minecraft-autopilot/issues/78)), is fixed too, and all 25 `--fast` scenarios and the three `recovery-*` scenarios now pass. Eating, retreat and full-inventory scenarios (`eat-timeout`, `low-health-retreat`, `eat-retreat-timeout`, `collect-full-inventory`) followed on 26 November and pass on both backends; they found and fixed a missing eating backoff on the bot. The takeover half of the [Fabric checklist](LIFECYCLE-SCENARIOS.md#fabric-checklist) followed (`--takeover`, [takeover scenarios](LIVE-ACCEPTANCE.md#takeover-scenarios)): 29 of its 31 scenarios pass headless in Boat, and the two storage-screen-close items were expected failures because the screen never survived a frame (they pass since 27 November, with opt-in storage pacing). The first runs found and fixed two Fabric bugs: F8 or the pause menu between storage stacks was lost and the transfer continued, and the death screen refused a new session as "paused". The three `takeover-while-stopping-*` items are scripted too (26 November): a pausable proxy holds the server's replies after the agent clicks the container, and 32 of the now 34 scenarios pass. `disconnect-collect` rejoins after the kick through the disconnect screen (26 November). The same scenarios also run on the release archive's jars in Fabric production mode (`--packaged`; all 27 `--fast` scenarios pass), and the `Fabric acceptance` workflow runs them on GitHub-hosted runners. |
| Load offline tool groups lazily. | `stop`, `observe`, and `mcp` import no `planning-*.js` module, with a test that checks it. | Agents in Boat. **Done early (26 November):** core commands also skip the 44 offline tool groups, now listed in `packages/planners/src/tool-groups.js`; `test/cli-startup.test.js` checks both. |
| Move the offline planners into a separate workspace package (or repository; owner decision). The core keeps no planner imports. | The core's tests, docs, and CLI run without the planner package installed; the planner package has its own tests and CI job. | Agents in Boat. **Done early (27 November):** the owner chose a workspace package in this repository. `packages/planners/` (`@minecraft-autopilot/planners`) holds the `planning-*.js` modules, the 44 tool groups, their helpers, tests and reference docs; the core keeps the modules the live, bridge, MCP and acceptance code needs. `src/cli.js` imports the package dynamically only for commands it doesn't define, and without it prints a note saying where the commands went. `test/cli-startup.test.js` runs the core CLI from a copy without the package, the CI `node` job runs `npm test` and the demo smoke with the package removed, and the new `planners` job runs `npm run test:planners`. |
| Spike: the target Minecraft version. Check that Fabric API, Baritone, and Mineflayer support it, and list the protocol and mapping changes. | A short written go/no-go with the chosen version. | Agent. **Done early:** [VERSION-SPIKE.md](VERSION-SPIKE.md) recommends 26.1.2, to be re-checked on 18 January, and lists open questions for the owner. |

### Month 3 (18 January – 14 February): move to a current Minecraft release

1.21.1 was current when the project started. Users will expect a current release, and porting before adding more actions means each later feature is tested once, on the version it ships for.

| Item | Done when | Who and where |
| --- | --- | --- |
| Port the Fabric mod, packaging, and pinned dependencies to the chosen version. | `npm run build:mod` and `npm run verify:mod` pass offline, and the bundle names the new version. | Agents in Boat. |
| Port the bot and the acceptance runner (console patterns, SNBT, protocol fixture). | `acceptance:bot --all` passes on the new server jar. | Agents in Boat. |
| Run the scripted Fabric suite on the new version, plus one keyboard session for F8, menus, and the normal launcher. | Every Fabric gate has evidence on the new version. | Agent and a person, Mac. |

Decide whether 1.21.1 keeps receiving fixes after the port. The default is no: v0.1.x stays on 1.21.1, and v0.2 targets only the new version.

### Month 4 (15 February – 14 March): recovery and richer criteria

| Item | Done when | Who and where |
| --- | --- | --- |
| Tool recovery: pick the best held tool, stop cleanly when a tool breaks, and optionally withdraw or craft a replacement from the allowlist. | Shared lifecycle scenarios pass on demo, bot, and scripted Fabric runs. | Agents; Fabric runs on the Mac. |
| Terrain recovery: detect being stuck or trapped (pit, water, enclosed space) and get out within a bounded budget, or fail with the position. | New pit, water, and enclosure fixtures pass on the bot and Fabric. | As above. |
| Inventory recovery: deposit to known storage when full instead of only stopping, if the task allows it. | A collect-with-overflow scenario passes on both backends. | As above. |
| Richer criteria: item totals across inventory and storage, "within N blocks of" a waypoint, and a time budget. | Each criterion is checked against independent server reads in the runner. | Agents in Boat. |

### Month 5 (15 March – 11 April): smelting and small builds

| Item | Done when | Who and where |
| --- | --- | --- |
| `smelt ITEM COUNT` with a furnace within 16 blocks or a held one placed, fuel from inventory, and takeover between items. | Offline bot and scripted Fabric scenarios pass for exact counts, missing fuel, a full output slot, and F8 or stop mid-smelt. | Agents; Fabric on the Mac. |
| `build` from a small blueprint (at most 64 blocks) produced by the offline planners, placing only held blocks, never breaking blocks, and refusing occupied cells. | Scenarios verify every block with `execute if block`, and takeover leaves a partial build with an accurate report. | As above. |
| Planner and MCP support for both, with `--verify-smelt` and `--verify-build`. | A real local model completes a smelt and a 3×3 build on the bot. | Person, Mac with Ollama. |

### Month 6 (12 April – 9 May): ship v0.2.0

| Item | Done when | Who and where |
| --- | --- | --- |
| Easier client → bot transfer: one command that leaves the world on the client, starts the bot as the same account, and reverses it, never connecting both at once. | The authenticated handoff passes using the single command. | Account owner, Mac. |
| Feature freeze, then the full release checklist on a single candidate: the bot suite, the scripted Fabric suite, one keyboard session, real-model and MCP runs, and the handoff. | Every v0.2 box is ticked by a person against one commit and archive. | Agents, a person, and the account owner. |
| Release v0.2.0 with updated install docs and known issues. | The tag, archive, and checksum identify the reviewed candidate. | Person. |

### Beyond May 2027

Optional ordinary-input takeover, combat and richer survival, more recipes, and multi-version support. Choose them based on evidence from v0.1 and v0.2 users.

Each new action needs preconditions, observable completion, execution limits, and cancellation that respects player takeover. Do not expand the action set at the expense of the Fabric acceptance path.
