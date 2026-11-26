# Lifecycle scenarios

Control can end or change in many ways: the player presses F8 or opens a menu, any process sends an emergency stop, the agent cancels, its lease expires, the connection drops, the player dies, or the dimension changes. Each backend implements these transitions separately, so one shared table in [`src/lifecycle-scenarios.js`](../src/lifecycle-scenarios.js) states what must be observable afterwards, independent of backend:

- the control mode (`manual`, or `agent` when the agent only cancelled);
- the job status and a message pattern that both the Harness and the Fabric controller messages satisfy;
- what must not happen any more (movement, mining, food consumption, deposits, withdrawals, crafts);
- whether a new session must wait while the interrupted work is still `stopping`;
- what the next session needs: the old lease is rejected, and a new session starts only when explicitly requested (or is refused while the player is dead or disconnected).

Every scenario assigns each backend exactly once: `automated` (run by `node --test test/lifecycle-scenarios.test.js`), `manual` (Fabric, below), or a named gap that says why the backend cannot express the transition. The test fails if a backend is unassigned or if the table claims automation that a test rig cannot drive, so nothing is skipped silently.

## Automated runs

[`test/lifecycle-scenarios.test.js`](../test/lifecycle-scenarios.test.js) runs each automated scenario through a real `Harness`:

- **demo**: the `DemoDriver` simulation. It has one fixed, always-connected world, so disconnects, dimension changes, and collection recovery are gaps.
- **mineflayer**: the real `MineflayerDriver` on a mocked bot (EventEmitter, minecraft-data 1.21.1, Vec3) whose pathfinder walks one block per tick, whose digging, equipping, container openings, and crafts stay pending like real server replies, and which emits mineflayer's `death`, `end`, and `game` events.

The rigs interrupt at exact milestones (first step, dig, equip, first stack, first craft, return trip) and use an injected clock for lease expiry. Death, disconnect, dimension changes, and expiry are detected by the Harness's own tick, as they would be live. The `inventory-full-collect` row is a failure rather than a handoff: the rigs fill the inventory mid-collection, and the job must fail on its own (no collection deadline is shortened) while the session keeps control. Every automated case asserts the shared expectation strictly. Mark a newly found mismatch as a `todo` in the test's `KNOWN` table until the source is fixed.

The table first exposed `death-goto`, `dimension-goto`, and `disconnect-collect` on mineflayer: the driver aborted on the bot event before the Harness tick, so the job ended `failed` with the driver's raw reason. The Harness now runs its lifecycle check when an action fails, so these end `cancelled` with the shared message on every backend.

## Adding a scenario

1. Add an entry to `SCENARIOS` with a unique `id`, a `transition` from `TRANSITIONS`, the activity it `interrupts` from `ACTIVITIES`, and an `expect` block (use `released(...)` for transitions that return control).
2. Assign every backend in `BACKENDS`: list it in `automated` or `manual`, or explain in `gaps` why it cannot express the transition.
3. For an automated backend, make sure its rig in the test can start the activity and trigger the transition; extend the rig if needed.
4. For Fabric, give `fabric.setup`, `fabric.action`, and `fabric.observe` (plus optional `fabric.expected`), then regenerate the checklist below:

   ```sh
   node -e "import('./src/lifecycle-scenarios.js').then(m => process.stdout.write(m.renderFabricChecklist()))"
   ```

   Paste the output between the markers. The test compares this section with `renderFabricChecklist()` exactly.

## Fabric checklist

Fabric needs a person at the keyboard. Use the packaged mod in a normal launcher profile on Minecraft 1.21.1, joined to a local server whose console you can use (or a single-player world with cheats). Keep a second terminal for `mc-agent job` and `mc-agent stop`. Judge the results with independent server reads (`data get entity <player> Pos`, `Inventory`, `foodLevel`, `Dimension`, and `data get block <x> <y> <z> Items`), not the agent's report. Record the commit, artifact checksum, and result for each item. A scenario is not passed until it has been observed.

Use the [Fabric fixture helper](LIVE-ACCEPTANCE.md#fabric-fixtures) for repeatable takeover, cobblestone, hostile observation, dimension change, pit, deposit, withdrawal, and crafting setups.

### Scripted pre-checks

Every item below also runs without a person as `npm run acceptance:fabric -- --takeover`, in Boat on the headless development client ([takeover scenarios](LIVE-ACCEPTANCE.md#takeover-scenarios)). Each scenario has the item's id, takes its expected outcome from this table, presses real keys with `xdotool` on the Xvfb display, and checks the outcome with the same independent server reads. Run them on the candidate before the keyboard session, so it starts from known results. They don't replace the session: key presses on Xvfb reach a development client, not the packaged mod in a normal launcher.

On 26 November 2026, 32 of the 34 scripted items passed on the development client. `menu-storage-close` and `menu-storage-close-withdraw` can't be observed against a local server: the agent's container screen opens and closes within one frame, so Escape always lands between stacks, which the scenarios check instead. A person on a slower server may still reach the screen. `disconnect-collect` stops short of rejoining. The three `takeover-while-stopping-*` items get their latency from a loopback proxy that holds the server's replies (deposit and withdrawal after the first stack, the craft before it starts, since it opens its table once); they wait until a fresh acquire is refused as "awaiting the server" before running `mc-agent stop`, and report "not observed" rather than passing if `stopping` never appears.

<!-- fabric-checklist:start -->

1. **F8 while the agent waits for model inference** (`f8-idle`; f8 during idle)
    - Setup: Start `mc-agent agent "<goal>" --model <model>` and wait for it to request a model decision.
    - Action: Press F8 before the model answers.
    - Expected: mode becomes `manual`; no job is started or resumed; no further movement; the old session cannot heartbeat or act; a new session starts only when explicitly requested and is then accepted.
    - Observe: The agent CLI reports that control returned to the player and runs no action after the model answers; `mc-agent job` shows `manual`. Independently: two `data get entity <player> Pos` reads 5 s apart match.
2. **F8 while mining for a collection quota** (`f8-collect`; f8 during collect)
    - Setup: Stand near trees and run `mc-agent collect oak_log 8`.
    - Action: Press F8 while a log is being broken.
    - Expected: mode becomes `manual`; the job ends `cancelled` with a message matching `/Control returned to the player with (F8|the takeover binding)/i`; no further blocks broken; no further movement; the old session cannot heartbeat or act; a new session starts only when explicitly requested and is then accepted.
    - Observe: Count logs with `data get entity <player> Inventory` at F8 and 5 s later. Independently: `data get entity <player> Inventory` item counts stay the same 5 s apart; two `data get entity <player> Pos` reads 5 s apart match.
3. **F8 while eating** (`f8-eat`; f8 during eat)
    - Setup: Lower food to about 10 (`/effect give <player> minecraft:hunger 10 100`, then `/effect clear <player>`); hold bread. Run `mc-agent eat`.
    - Action: Press F8 during the eating animation (about 1.6 s). Repeat if the food was eaten before F8.
    - Expected: mode becomes `manual`; the job ends `cancelled` with a message matching `/Control returned to the player with (F8|the takeover binding)/i`; no food consumed after the transition; the old session cannot heartbeat or act; a new session starts only when explicitly requested and is then accepted.
    - Observe: Bread count and `data get entity <player> foodLevel` before the command and 5 s after F8. Independently: `data get entity <player> Inventory` keeps the food count and `foodLevel` does not rise.
4. **F8 while returning from a collection** (`f8-collect-recovery`; f8 during collect-recovery)
    - Setup: Place two sand blocks about 8 blocks away and run `mc-agent collect sand 5`, so collection fails and returns.
    - Action: Press F8 once `mc-agent job` reports "returning to where collection started".
    - Expected: mode becomes `manual`; the job ends `cancelled` with a message matching `/Control returned to the player with (F8|the takeover binding)/i`; no further movement; no further blocks broken; the old session cannot heartbeat or act; a new session starts only when explicitly requested and is then accepted.
    - Observe: Position reads 5 s apart; no blocks broken while the return was digging out. Independently: two `data get entity <player> Pos` reads 5 s apart match; `data get entity <player> Inventory` item counts stay the same 5 s apart.
5. **F8 between deposit stacks** (`f8-deposit`; f8 during deposit)
    - Setup: Hold at least three stacks of logs within 16 blocks of an empty double chest; run `mc-agent deposit oak_log`.
    - Action: Press F8 while the chest screen is open and stacks are moving.
    - Expected: mode becomes `manual`; the job ends `cancelled` with a message matching `/Control returned to the player with (F8|the takeover binding)/i`; no further items moved into the container; the old session cannot heartbeat or act; a new session starts only when explicitly requested and is then accepted.
    - Observe: Chest `Items` and player `Inventory` reads 5 s apart. Independently: `data get block <x> <y> <z> Items` reads 5 s apart match.
6. **Pause menu during inference, then close it** (`menu-idle`; menu during idle)
    - Setup: Start `mc-agent agent "<goal>" --model <model>` and wait for a model decision.
    - Action: Press Escape, wait for the model to answer, then close the menu.
    - Expected: mode becomes `manual`; no job is started or resumed; no further movement; the old session cannot heartbeat or act; a new session starts only when explicitly requested and is then accepted. Closing the menu does not resume the session.
    - Observe: `mc-agent job` after closing the menu; position reads 5 s apart. Independently: two `data get entity <player> Pos` reads 5 s apart match.
7. **Inventory screen while mining, then close it** (`menu-collect`; menu during collect)
    - Setup: Run `mc-agent collect oak_log 8` near trees.
    - Action: Press E while a log is being broken, wait 3 s, then close the inventory.
    - Expected: mode becomes `manual`; the job ends `cancelled` with a message matching `/game menu was opened/i`; no further blocks broken; no further movement; the old session cannot heartbeat or act; a new session starts only when explicitly requested and is then accepted. Closing the screen does not resume mining.
    - Observe: Inventory and position reads 5 s after closing. Independently: `data get entity <player> Inventory` item counts stay the same 5 s apart; two `data get entity <player> Pos` reads 5 s apart match.
8. **Pause menu while eating, then close it** (`menu-eat`; menu during eat)
    - Setup: Lower food to about 10 as in the F8 eating check; run `mc-agent eat`.
    - Action: Press Escape during the eating animation, then close the menu.
    - Expected: mode becomes `manual`; the job ends `cancelled` with a message matching `/game menu was opened/i`; no food consumed after the transition; the old session cannot heartbeat or act; a new session starts only when explicitly requested and is then accepted. Closing the menu does not resume eating.
    - Observe: Bread count and `foodLevel` before the command and after closing the menu. Independently: `data get entity <player> Inventory` keeps the food count and `foodLevel` does not rise.
9. **Pause menu during the collection return, then close it** (`menu-collect-recovery`; menu during collect-recovery)
    - Setup: Set up the failing sand collection from the F8 return check.
    - Action: Press Escape during "returning to where collection started", then close the menu.
    - Expected: mode becomes `manual`; the job ends `cancelled` with a message matching `/game menu was opened/i`; no further movement; no further blocks broken; the old session cannot heartbeat or act; a new session starts only when explicitly requested and is then accepted. Closing the menu does not resume the return.
    - Observe: Position reads 5 s apart after closing. Independently: two `data get entity <player> Pos` reads 5 s apart match; `data get entity <player> Inventory` item counts stay the same 5 s apart.
10. **Player closes the storage screen the agent opened** (`menu-storage-close`; menu during deposit)
    - Setup: Run `mc-agent deposit oak_log` with three stacks held and a chest nearby.
    - Action: Press Escape while the agent has the chest screen open.
    - Expected: mode becomes `manual`; the job ends `cancelled` with a message matching `/Storage screen was closed or replaced/i`; no further items moved into the container; the old session cannot heartbeat or act; a new session starts only when explicitly requested and is then accepted.
    - Observe: Chest `Items` reads 5 s apart. Independently: `data get block <x> <y> <z> Items` reads 5 s apart match.
11. **F8 between withdraw stacks** (`f8-withdraw`; f8 during withdraw)
    - Setup: Fill a double chest within 16 blocks with at least three stacks of logs (`/give` them, then `mc-agent deposit oak_log`); run `mc-agent withdraw oak_log`.
    - Action: Press F8 while the chest screen is open and stacks are moving.
    - Expected: mode becomes `manual`; the job ends `cancelled` with a message matching `/Control returned to the player with (F8|the takeover binding)/i`; no further items taken from the container; the old session cannot heartbeat or act; a new session starts only when explicitly requested and is then accepted.
    - Observe: Chest `Items` and player `Inventory` reads 5 s apart. Independently: `data get block <x> <y> <z> Items` reads 5 s apart match.
12. **Player closes the storage screen a withdrawal opened** (`menu-storage-close-withdraw`; menu during withdraw)
    - Setup: Run `mc-agent withdraw oak_log` beside a chest holding three stacks of logs.
    - Action: Press Escape while the agent has the chest screen open.
    - Expected: mode becomes `manual`; the job ends `cancelled` with a message matching `/Storage screen was closed or replaced/i`; no further items taken from the container; the old session cannot heartbeat or act; a new session starts only when explicitly requested and is then accepted.
    - Observe: Chest `Items` reads 5 s apart. Independently: `data get block <x> <y> <z> Items` reads 5 s apart match.
13. **F8 between crafts** (`f8-craft`; f8 during craft)
    - Setup: Hold 32 planks within 16 blocks of a crafting table; run `mc-agent craft chest 4`.
    - Action: Press F8 while the crafting table screen is open and chests are being crafted.
    - Expected: mode becomes `manual`; the job ends `cancelled` with a message matching `/Control returned to the player with (F8|the takeover binding)/i`; no further crafts; the old session cannot heartbeat or act; a new session starts only when explicitly requested and is then accepted.
    - Observe: Plank and chest counts in `data get entity <player> Inventory` at F8 and 5 s later. Independently: `data get entity <player> Inventory` item counts stay the same 5 s apart.
14. **Player closes the crafting table screen the agent opened** (`menu-crafting-close`; menu during craft)
    - Setup: Hold 32 planks within 16 blocks of a crafting table; run `mc-agent craft chest 4`.
    - Action: Press Escape while the agent has the crafting table screen open.
    - Expected: mode becomes `manual`; the job ends `cancelled` with a message matching `/(?:Storage|Crafting(?: table)?) screen was closed or replaced/i`; no further crafts; the old session cannot heartbeat or act; a new session starts only when explicitly requested and is then accepted. Closing the screen does not resume crafting.
    - Observe: Plank and chest counts 5 s after closing. Independently: `data get entity <player> Inventory` item counts stay the same 5 s apart.
15. **Emergency stop while idle** (`stop-idle`; stop during idle)
    - Setup: Acquire control with `mc-agent agent` waiting for a model decision.
    - Action: Run `mc-agent stop` from a second terminal.
    - Expected: mode becomes `manual`; no job is started or resumed; no further movement; the old session cannot heartbeat or act; a new session starts only when explicitly requested and is then accepted.
    - Observe: The agent CLI reports that control returned to the player; `mc-agent job` shows `manual`. Independently: two `data get entity <player> Pos` reads 5 s apart match.
16. **Emergency stop during navigation** (`stop-goto`; stop during goto)
    - Setup: Run `mc-agent goto <x> <y> <z>` about 40 blocks away.
    - Action: Run `mc-agent stop` from a second terminal mid-walk.
    - Expected: mode becomes `manual`; the job ends `cancelled` with a message matching `/Emergency stop requested/i`; no further movement; the old session cannot heartbeat or act; a new session starts only when explicitly requested and is then accepted.
    - Observe: Position reads 5 s apart. Independently: two `data get entity <player> Pos` reads 5 s apart match.
17. **Emergency stop while mining** (`stop-collect`; stop during collect)
    - Setup: Run `mc-agent collect oak_log 8` near trees.
    - Action: Run `mc-agent stop` while a log is being broken.
    - Expected: mode becomes `manual`; the job ends `cancelled` with a message matching `/Emergency stop requested/i`; no further blocks broken; no further movement; the old session cannot heartbeat or act; a new session starts only when explicitly requested and is then accepted.
    - Observe: Log count and position 5 s apart. Independently: `data get entity <player> Inventory` item counts stay the same 5 s apart; two `data get entity <player> Pos` reads 5 s apart match.
18. **Emergency stop during recovery after a mining timeout** (`stop-collect-recovery`; stop during collect-recovery)
    - Setup: Set up the failing sand collection from the F8 return check (Fabric returns after a failure or its 180 s mining deadline).
    - Action: Run `mc-agent stop` during "returning to where collection started".
    - Expected: mode becomes `manual`; the job ends `cancelled` with a message matching `/Emergency stop requested/i`; no further movement; no further blocks broken; the old session cannot heartbeat or act; a new session starts only when explicitly requested and is then accepted. The return does not fall back to digging after the stop.
    - Observe: Position and nearby blocks 5 s apart. Independently: two `data get entity <player> Pos` reads 5 s apart match; `data get entity <player> Inventory` item counts stay the same 5 s apart.
19. **Emergency stop between deposit stacks** (`stop-deposit`; stop during deposit)
    - Setup: Run `mc-agent deposit oak_log` with three stacks held and an empty double chest nearby.
    - Action: Run `mc-agent stop` while stacks are moving.
    - Expected: mode becomes `manual`; the job ends `cancelled` with a message matching `/Emergency stop requested/i`; no further items moved into the container; the old session cannot heartbeat or act; a new session starts only when explicitly requested and is then accepted.
    - Observe: Chest `Items` reads 5 s apart. Independently: `data get block <x> <y> <z> Items` reads 5 s apart match.
20. **Emergency stop between withdraw stacks** (`stop-withdraw`; stop during withdraw)
    - Setup: Run `mc-agent withdraw oak_log` beside a double chest holding at least three stacks of logs.
    - Action: Run `mc-agent stop` while stacks are moving.
    - Expected: mode becomes `manual`; the job ends `cancelled` with a message matching `/Emergency stop requested/i`; no further items taken from the container; the old session cannot heartbeat or act; a new session starts only when explicitly requested and is then accepted.
    - Observe: Chest `Items` reads 5 s apart. Independently: `data get block <x> <y> <z> Items` reads 5 s apart match.
21. **Emergency stop between crafts** (`stop-craft`; stop during craft)
    - Setup: Hold 16 oak logs; run `mc-agent craft oak_planks 64`.
    - Action: Run `mc-agent stop` while planks are being crafted.
    - Expected: mode becomes `manual`; the job ends `cancelled` with a message matching `/Emergency stop requested/i`; no further crafts; the old session cannot heartbeat or act; a new session starts only when explicitly requested and is then accepted.
    - Observe: Log and plank counts in `data get entity <player> Inventory` 5 s apart. Independently: `data get entity <player> Inventory` item counts stay the same 5 s apart.
22. **Agent cancel between crafts keeps control** (`cancel-craft`; cancel during craft)
    - Setup: Hold 16 oak logs; from an MCP client take control and call `minecraft_action` with `{"type":"craft","item":"oak_planks","count":64}`.
    - Action: Cancel that call (or call `minecraft_cancel`) while planks are being crafted.
    - Expected: mode stays `agent`; the job ends `cancelled` with a message matching `/Cancelled by agent/i`; no further crafts; the same session can start its next action once `stopping` is `false`.
    - Observe: Log and plank counts 5 s apart; `mc-agent job` shows `agent` and the next `minecraft_action` is accepted without taking control again. Independently: `data get entity <player> Inventory` item counts stay the same 5 s apart.
23. **Agent cancel during a wait keeps control** (`cancel-wait`; cancel during wait)
    - Setup: From an MCP client, call `minecraft_take_control`, then `minecraft_action` with `{"type":"wait","seconds":30}`.
    - Action: Cancel the in-flight `minecraft_action` call from the MCP client (or call `minecraft_cancel` if the client allows concurrent calls).
    - Expected: mode stays `agent`; the job ends `cancelled` with a message matching `/Cancelled by agent/i`; no further movement; the same session can start its next action once `stopping` is `false`.
    - Observe: `mc-agent job` shows `agent`; the next `minecraft_action` is accepted without taking control again. Independently: two `data get entity <player> Pos` reads 5 s apart match.
24. **Agent cancel during eating** (`cancel-eat`; cancel during eat)
    - Setup: Lower food to 17 or 18, not lower: the session keeps control after a cancel, and at 16 or less automatic eating starts at once. From an MCP client take control and call `minecraft_action` with `{"type":"eat"}`.
    - Action: Cancel that call (or call `minecraft_cancel`) during the eating animation.
    - Expected: mode stays `agent`; the job ends `cancelled` with a message matching `/Cancelled by agent/i`; no food consumed after the transition; the same session can start its next action once `stopping` is `false`.
    - Observe: Bread count and `foodLevel` before and 5 s after the cancel. Independently: `data get entity <player> Inventory` keeps the food count and `foodLevel` does not rise.
25. **Lease expiry while idle** (`expiry-idle`; expiry during idle)
    - Setup: Start `mc-agent agent "<goal>" --model <model>` and wait for a model decision.
    - Action: Suspend the CLI (Ctrl+Z) and wait 10 s, then resume it with `fg`.
    - Expected: mode becomes `manual`; no job is started or resumed; no further movement; the old session cannot heartbeat or act; a new session starts only when explicitly requested and is then accepted. The resumed CLI does not regain control or act.
    - Observe: `mc-agent job` from a second terminal during the suspension. Independently: two `data get entity <player> Pos` reads 5 s apart match.
26. **Lease expiry during navigation** (`expiry-goto`; expiry during goto)
    - Setup: Run `mc-agent goto <x> <y> <z>` about 60 blocks away.
    - Action: Kill the CLI process (`kill -9 <pid>`) mid-walk; wait 10 s.
    - Expected: mode becomes `manual`; the job ends `cancelled` with a message matching `/lease expired/i`; no further movement; the old session cannot heartbeat or act; a new session starts only when explicitly requested and is then accepted.
    - Observe: Position reads after expiry, 5 s apart. Independently: two `data get entity <player> Pos` reads 5 s apart match.
27. **Disconnect while mining** (`disconnect-collect`; disconnect during collect)
    - Setup: Join a local server and run `mc-agent collect oak_log 8`.
    - Action: Stop the server (or `/kick <player>`) while mining.
    - Expected: mode becomes `manual`; the job ends `cancelled` with a message matching `/Disconnected/i`; no further blocks broken; no further movement; the old session cannot heartbeat or act; a new session is refused with a message matching `/Enter a (Minecraft )?world/i` until the player recovers. After rejoining, the session does not resume; a new one must be started explicitly.
    - Observe: `mc-agent job` at the title screen and after rejoining. Independently: `data get entity <player> Inventory` item counts stay the same 5 s apart; two `data get entity <player> Pos` reads 5 s apart match.
28. **Death during navigation** (`death-goto`; death during goto)
    - Setup: Run `mc-agent goto <x> <y> <z>` about 40 blocks away.
    - Action: Run `/kill <player>` in the server console mid-walk; respawn manually afterwards.
    - Expected: mode becomes `manual`; the job ends `cancelled` with a message matching `/died/i`; no further movement; the old session cannot heartbeat or act; a new session is refused with a message matching `/dead|Respawn/i` until the player recovers. After the manual respawn, the session does not resume.
    - Observe: `mc-agent job` at the death screen and after respawning. Independently: two `data get entity <player> Pos` reads 5 s apart match.
29. **Dimension change while idle** (`dimension-idle`; dimension during idle)
    - Setup: Start `mc-agent agent "<goal>" --model <model>` and wait for a model decision.
    - Action: Run `/execute in minecraft:the_nether run tp <player> 0 100 0`.
    - Expected: mode becomes `manual`; no job is started or resumed; no further movement; the old session cannot heartbeat or act; a new session starts only when explicitly requested and is then accepted.
    - Observe: `mc-agent job` and `data get entity <player> Dimension`. Independently: two `data get entity <player> Pos` reads 5 s apart match.
30. **Dimension change during navigation** (`dimension-goto`; dimension during goto)
    - Setup: Run `mc-agent goto <x> <y> <z>` about 40 blocks away.
    - Action: Run `/execute in minecraft:the_nether run tp <player> 0 100 0` mid-walk.
    - Expected: mode becomes `manual`; the job ends `cancelled` with a message matching `/dimension changed/i`; no further movement; the old session cannot heartbeat or act; a new session starts only when explicitly requested and is then accepted.
    - Observe: Position and `Dimension` reads 5 s apart. Independently: two `data get entity <player> Pos` reads 5 s apart match.
31. **New session while a container opening is still awaiting the server** (`takeover-while-stopping-deposit`; takeover-while-stopping during deposit)
    - Setup: Use a server with noticeable latency (e.g. a remote server); run `mc-agent deposit oak_log` with a chest nearby.
    - Action: Run `mc-agent stop` immediately after the agent clicks the chest, then immediately start `mc-agent goto` nearby.
    - Expected: mode becomes `manual`; the job ends `cancelled` with a message matching `/Emergency stop requested/i`; no further items moved into the container; while `stopping` is `true` a new session cannot start work, and it can once the interrupted work settles; the old session cannot heartbeat or act; a new session starts only when explicitly requested and is then accepted. If `stopping` never appears because the reply was too fast, record "not observed" rather than passing.
    - Observe: `mc-agent job` in a loop (`mc-agent watch`); chest `Items` reads. Independently: `data get block <x> <y> <z> Items` reads 5 s apart match.
32. **New session while a withdrawal is still opening its container** (`takeover-while-stopping-withdraw`; takeover-while-stopping during withdraw)
    - Setup: Use a server with noticeable latency (e.g. a remote server); run `mc-agent withdraw oak_log` beside a chest holding logs.
    - Action: Run `mc-agent stop` immediately after the agent clicks the chest, then immediately start `mc-agent goto` nearby.
    - Expected: mode becomes `manual`; the job ends `cancelled` with a message matching `/Emergency stop requested/i`; no further items taken from the container; while `stopping` is `true` a new session cannot start work, and it can once the interrupted work settles; the old session cannot heartbeat or act; a new session starts only when explicitly requested and is then accepted. If `stopping` never appears because the reply was too fast, record "not observed" rather than passing.
    - Observe: `mc-agent job` in a loop (`mc-agent watch`); chest `Items` reads. Independently: `data get block <x> <y> <z> Items` reads 5 s apart match.
33. **New session while a cancelled craft is still clicking** (`takeover-while-stopping-craft`; takeover-while-stopping during craft)
    - Setup: Use a server with noticeable latency; hold 32 planks within 16 blocks of a crafting table and run `mc-agent craft chest 4`.
    - Action: Run `mc-agent stop` immediately after the agent clicks the crafting table, then immediately start `mc-agent goto` nearby.
    - Expected: mode becomes `manual`; the job ends `cancelled` with a message matching `/Emergency stop requested/i`; no further crafts; while `stopping` is `true` a new session cannot start work, and it can once the interrupted work settles; the old session cannot heartbeat or act; a new session starts only when explicitly requested and is then accepted. If `stopping` never appears because the reply was too fast, record "not observed" rather than passing.
    - Observe: `mc-agent job` in a loop (`mc-agent watch`); plank and chest counts. Independently: `data get entity <player> Inventory` item counts stay the same 5 s apart.
34. **Inventory fills while mining for a collection quota** (`inventory-full-collect`; inventory-full during collect)
    - Setup: Stand near trees holding an axe and no oak logs; fill all but one of the other main slots (hotbar and inventory) with full stacks, e.g. `/give <player> minecraft:cobblestone 2176` (34 stacks). From an MCP client, call `minecraft_take_control`.
    - Action: Call `minecraft_action` with `{"type":"collect","block":"oak_log","count":8}`; while the first log is being broken, run `/give <player> minecraft:dirt 64` to fill the last slot. Start over if a log was picked up first.
    - Expected: mode stays `agent`; the job ends `failed` with a message matching `/Inventory full; collected \d+ of \d+ \w+\./i`; no further blocks broken; the same session can start its next action once `stopping` is `false`. The job fails within seconds of the last slot filling rather than at the 180 s mining deadline, after the bounded return to where collection started.
    - Observe: The `minecraft_action` result and `mc-agent job` (still `agent`); the next `minecraft_action` is accepted without taking control again. Independently: `data get entity <player> Inventory` item counts stay the same 5 s apart.

Not run on Fabric:

- `takeover-while-stopping-eat`: Fabric ends eating on the client thread during release, so eating leaves no stopping window to take over into.

<!-- fabric-checklist:end -->
