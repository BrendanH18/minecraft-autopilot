# Target Minecraft version spike

The month 2 spike from the [roadmap](ROADMAP.md#month-2-21-december--17-january-automate-fabric-checks-and-slim-the-core): choose the Minecraft version for the month 3 port, check that Fabric API, Baritone and Mineflayer support it, and list what will break. Facts were checked on 25 November 2026 against the sources linked below. Anything marked *unverified* still needs a check during the port.

## Recommendation

**Go, targeting Minecraft Java 26.1.2, provided the first bot check on a 26.1.2 server passes; otherwise 26.1.** 26.1.2 is the newest release with published Fabric API and Baritone builds whose protocol a published Mineflayer release covers. Mineflayer itself names only 26.1, so 26.1.2 support rests on the minecraft-data mapping (see *Unverified* below):

- Fabric API `0.155.3+26.1.2` exists.
- Baritone v1.18.0 ships `baritone-api-fabric-1.18.0.jar`. Its `fabric.mod.json` declares `minecraft: 26.1.*`, and it still nests `nether-pathfinder-1.6.jar`.
- Mineflayer 4.39.0, the version already pinned, lists 26.1 as its newest tested version. minecraft-data 3.119.0 maps 26.1.2 to the 26.1 data, and both use protocol 775.

26.2 and 26.3 are blocked by Mineflayer: no published PrismarineJS release supports them, only open pull requests. The bot and the Fabric client have to share a server version for the client → bot → client handoff, so the mod can't move ahead of the bot.

Re-check this when the port starts on 18 January. Use the newest release that has all three of these, published (not open pull requests):

1. a Fabric API build;
2. an official cabaletta Baritone Fabric API jar;
3. Mineflayer, minecraft-protocol and minecraft-data releases that support it.

Today that rule gives 26.1.2. 26.4 is in pre-release and will probably be out by January, but it will almost certainly fail the Mineflayer condition.

Most of the porting work is the same for any 26.x target: moving from Yarn to Mojang names, the unobfuscated Loom plugin, and Java 25. Moving from 26.1.2 to a later 26.x afterwards is a smaller port. The roadmap reason for porting ("users will expect a current release") is only partly met, because 26.1.2 will be two or three drops old when v0.2 ships.

## Releases

| Version | Released | Status on 25 Nov 2026 |
| --- | --- | --- |
| 1.21.1 | Aug 2024 | Current target. |
| 1.21.11 | 9 Dec 2025 | The last version with Yarn and Intermediary, and the last obfuscated one. |
| 26.1 / 26.1.1 / 26.1.2 | Mar 2026 onwards (exact 26.1.x dates *unverified*) | Unobfuscated; needs Java 25. All three share protocol 775. |
| 26.2 | Jun 2026 | Protocol 776. |
| 26.3 | 15 Sep 2026 | Latest stable release. Protocol 777. |
| 26.4 | not released | `26.4-pre-1` is out, after the 10th and last snapshot (17 Nov). |

Sources: [Fabric game version list](https://meta.fabricmc.net/v2/versions/game), [minecraft.wiki 26.4 Snapshot 10](https://minecraft.wiki/w/Java_Edition_26.4_Snapshot_10), [Fabric 1.21.11 post](https://fabricmc.net/2025/12/05/12111.html), [Fabric 26.3 post](https://fabricmc.net/2026/09/15/263.html), [minecraft-data protocolVersions.json](https://github.com/PrismarineJS/minecraft-data/blob/master/data/pc/common/protocolVersions.json).

## Support table

| | 1.21.1 (now) | 1.21.11 | 26.1.2 | 26.2 | 26.3 |
| --- | --- | --- | --- | --- | --- |
| Fabric API (newest) | 0.116.17 (pinned) | 0.141.6 | 0.155.3 | 0.161.0 | 0.167.0 |
| Fabric Loader | 0.16.14 (pinned) | any recent | ≥ 0.19.3 (Baritone's floor) | ≥ 0.19.3 | ≥ 0.19.5 |
| Mappings | Yarn | Yarn (last) or Mojang | Mojang only (unobfuscated) | Mojang only | Mojang only |
| Loom plugin | `fabric-loom` 1.10.5 (pinned) | `fabric-loom-remap`, 1.14+ | `net.fabricmc.fabric-loom`, 1.15+ | 1.17+ | 1.17+ |
| Java for the game and the Gradle JVM | 21 | 21 | 25 | 25 | 25 |
| Baritone (Fabric API jar) | v1.11.3 (pinned) | v1.17.0 | v1.18.0 (`26.1.*`) | v1.19.0 | v1.20.0 (`~26.3`) |
| Mineflayer / minecraft-protocol / minecraft-data | 4.39.0 / 1.68.0 / 3.119.0 | supported | supported (tested as 26.1) | **no release** (open PRs) | **no release** (open PRs) |

Sources: [Fabric API on maven](https://maven.fabricmc.net/net/fabricmc/fabric-api/fabric-api/maven-metadata.xml), [Fabric Loader versions](https://meta.fabricmc.net/v2/versions/loader), [Yarn versions](https://meta.fabricmc.net/v2/versions/yarn) (no build after `1.21.11+build.6`), [Fabric 26.1 post](https://fabricmc.net/2026/03/14/261.html), [Fabric 26.2 post](https://fabricmc.net/2026/06/15/262.html), [Loom releases](https://github.com/FabricMC/fabric-loom/releases), [Baritone releases](https://github.com/cabaletta/baritone/releases) (each release note names its Minecraft version), [mineflayer `lib/version.js`](https://github.com/PrismarineJS/mineflayer/blob/master/lib/version.js), [node-minecraft-protocol `src/version.js`](https://github.com/PrismarineJS/node-minecraft-protocol/blob/master/src/version.js), and the open pull requests for [mineflayer 26.3](https://github.com/PrismarineJS/mineflayer/pull/4206) and [node-minecraft-protocol 26.2](https://github.com/PrismarineJS/node-minecraft-protocol/pull/1550) / [26.3](https://github.com/PrismarineJS/node-minecraft-protocol/pull/1553).

Baritone and npm details were read from the published artifacts themselves: the `fabric.mod.json` inside the Baritone jars, and `lib/version.js`, `src/version.js` and `protocolVersions.json` inside the npm tarballs. The Baritone v1.18.0 Fabric API jar's SHA-256 is `beec850e73591ab1dc81cb359d1d224ef3230a35d21dc6e72f8e8d287e7b79d2`. Re-check it in `scripts/setup-mod.js` when pinning.

*Unverified:* that a Mineflayer bot created with `version: '26.1.2'` actually plays on a 26.1.2 server. minecraft-data resolves it to the 26.1 data, but Mineflayer only tests `26.1`, and an open [node-minecraft-protocol PR for 26.1.2](https://github.com/PrismarineJS/node-minecraft-protocol/pull/1487) suggests something may still differ. The first port step on the bot side is one `acceptance:bot` scenario on a 26.1.2 server jar. That needs runner changes first: `botArguments` in `scripts/live-acceptance/processes.js` always passes `MINECRAFT_VERSION` (1.21.1) as the bot's `--version`, and the default jar path and preflight are fixed to 1.21.1, so pass the tested version through and use `--server-jar`. Only a failure after the bot has joined counts as a compatibility result; a setup failure doesn't. If the bot really can't play, fall back to 26.1 for both sides; Baritone's `26.1.*` range and Fabric API `0.145.1+26.1` cover it.

## Toolchain impact (Java 25)

- 26.1 and later need Java 25, both to run the game and for the Gradle JVM ([Fabric 26.1 post](https://fabricmc.net/2026/03/14/261.html)). Loom 1.18 and later (1.19.4 is the newest) use Java 25's Foreign Function and Memory API ([Loom 1.18 release](https://github.com/FabricMC/fabric-loom/releases)), so they need Java 25 even for older targets. That is why 1.21.1 should stay on Loom ≤ 1.17 while it is maintained.
- Files that pin Java 21 today:
  - `mod/build.gradle` (`options.release = 21`, `sourceCompatibility`/`targetCompatibility`)
  - `mod/src/main/resources/minecraft_agent.mixins.json` (`JAVA_21`)
  - `mod/src/main/resources/fabric.mod.json` (`"java": ">=21"`)
  - `.github/workflows/ci.yml:60` and `.github/workflows/bot-acceptance.yml:42` (`java-version: 21`)
  - `scripts/boat-check-remote.sh:53-71` (finds or installs OpenJDK 21)
- The vanilla 26.x server jar that the acceptance runner starts also needs Java 25. So the `bot-acceptance` job and the Boat snapshot need it too, not just the mod build. Refresh the snapshot with `scripts/boat-check.sh --save` afterwards.
- On the Mac, the normal launcher bundles its own Java runtime, so players aren't affected. Running `npm run dev:mod` and packaged acceptance there needs a local JDK 25, which is a new install and needs the owner's approval.
- Gradle: the wrapper is already 9.9.1. Fabric recommended Gradle 9.4–9.6 for Loom 1.15–1.17, and Loom 1.14+ needs Gradle ≥ 9.2. Moving from Loom 1.10.5 to 1.15+ is a major plugin jump.
- The build script changes for unobfuscated versions:
  - plugin id `net.fabricmc.fabric-loom`;
  - no `mappings` line;
  - `modImplementation` and `modRuntimeOnly` become `implementation` and `runtimeOnly`;
  - `remapJar` becomes `jar`.

  Fabric's [porting guide](https://docs.fabricmc.net/26.1.2/develop/porting) has the details. `scripts/package-mod.js` and `scripts/verify-mod.js` check exact jar names, so check them against the new task outputs.
- *Unverified:* whether palantir-java-format 2.102.0 (Spotless) runs on JDK 25, and whether Loom still caches the server jar at `.gradle-user/caches/fabric-loom/<version>/minecraft-server.jar`. `scripts/live-acceptance/processes.js:30`, `docs/LIVE-ACCEPTANCE.md` and `docs/DEVELOPMENT.md` depend on that path.

## Expected breakages

Grouped by the version that introduced each change. Items are confirmed by a linked source unless marked *unverified*; line numbers are on the current branch.

### Every 26.x target: mappings and dependency pins

- **Yarn → Mojang names in all mod code.** Every `net.minecraft.*` import in `mod/src/main/java/dev/minecraftagent/` changes. That is about 50 distinct classes, for example `MinecraftClient`, `ScreenHandler`, `SlotActionType`, `PlayerInventory`, `ClientWorld`, `KeyBinding`, `InputUtil`, `HandledScreen`, `DataComponentTypes`, `WorldSavePath` and `RaycastContext`. Fabric advises migrating mappings before porting: run Loom's Yarn → Mojang migration on 1.21.1 first, so the rename lands as its own reviewable change ([mappings migration](https://docs.fabricmc.net/develop/porting/mappings/)).
- **Mixin targets.** `mixin/StoragePacketMixin.java:14` targets `ClientConnection.send(Packet)`. `mixin/StorageInteractionMixin.java:33-50` targets `ClientPlayNetworkHandler.onOpenScreen`, `onPlayerActionResponse`, `onInventory` and `onScreenHandlerSlotUpdate`. All of these are Yarn names, and the packet classes they reference are Yarn names too. Loom can now remap mixins ([Fabric 1.21.11 post](https://fabricmc.net/2025/12/05/12111.html)), but `defaultRequire: 1` makes a missed target fail at startup, so test them first.
- **Fabric API renames to official names** ([Fabric 26.1 post](https://fabricmc.net/2026/03/14/261.html)). Affected: `AgentClient.java:6,29` (`KeyBindingHelper`), and the screen, tick and lifecycle events and `UseBlockCallback`/`UseEntityCallback` used in `AgentClient.java`. *Unverified:* the exact new names; use the Fabric API 26.1 rename list.
- **Version pins.**
  - `mod/gradle.properties` (all five versions)
  - `mod/build.gradle` (Baritone jar name, `nether-pathfinder` path)
  - `scripts/setup-mod.js` (Baritone name, tag, SHA-256)
  - `scripts/package-mod.js:9,23,33,45,55` (Fabric API name and URL, install text, manifest `minecraft`)
  - `src/bundle.js:15`
  - `fabric.mod.json` (`minecraft`, `fabricloader`, `java`)
  - `src/acceptance-gates.js:12,13,30`
  - `src/cli.js:1019` (default `--version 1.21.1`)
  - `scripts/live-acceptance/processes.js:13,30`
  - the test fixtures: `test/server.test.js` (`version: '1.21.1'`), `test/mineflayer-driver.test.js`, `test/runtime.test.js`, `test/withdraw-craft.test.js`, `test/lifecycle-scenarios.test.js`, `test/acceptance-tools.test.js`, `test/bot-evidence-review.test.js`
  - the docs that name 1.21.1: README, USAGE, DEVELOPMENT, LIVE-ACCEPTANCE, RELEASE, LIFECYCLE-SCENARIOS, protocol

### 1.21.2: recipes are no longer sent to the client

- The client recipe book shows only recipe displays now; Fabric API 0.141 added opt-in recipe sync to restore the old behaviour ([Fabric 1.21.11 post](https://fabricmc.net/2025/12/05/12111.html)). Fabric crafting uses its own recipe table (`CraftingRecipes.java`, built from `src/recipes.js`) and plain `clickSlot`, so the expected impact is low. The bot's `src/mineflayer-driver.js:1114` (`recipesAll`) reads minecraft-data's recipes, not the server's. *Unverified:* that 26.1 data still matches the allowlisted recipes. `test/withdraw-craft.test.js` and the craft scenario will show it.

### 1.21.5: inventory and entity data

- **The selected slot is private.** The `selectedSlot` field became an accessor. Expected at `AgentController.java:365,490,495,517` and `FabricStorage.java:622,623,636`. *Unverified* (from memory of the 1.21.5 API; the Mojang-name migration will show it).
- **Player armor and offhand moved to an `equipment` field** in entity data ([MC-296199](https://mojira.dev/MC-296199), quoting the changelog). `data get entity NAME Inventory` should now return only the main and hotbar slots. The runner's `itemCount`/`itemTotals` (`scripts/live-acceptance/nbt-parse.js:110-118`) only sum item ids, so they should still work; `src/mineflayer-driver.js:733` already excludes armor and offhand.
- **SNBT printing.** 1.21.5 also extended the SNBT grammar. *Unverified* whether `data get` output changed in ways that `parseSnbt` (`scripts/live-acceptance/nbt-parse.js`) rejects, for example booleans, typed lists or quoting. The runner's own `setblock … {Items:[{Slot:0b,id:…,count:N}]}` inputs (`scripts/live-acceptance/scenarios.js:83-99,211-228`) also need re-checking. Capture real `data get block … Items` and `data get entity … Inventory|Pos|Dimension` output from the 26.1.2 jar and add it as parser fixtures.

### 1.21.9: input and key bindings

- `KeyBinding` takes a category object instead of a translation-key string (`AgentClient.java:29-30`). The screen input callbacks take event objects instead of raw `key, scan, modifiers` / `x, y, button`, which affects `ScreenKeyboardEvents.allowKeyPress` and `ScreenMouseEvents.allowMouseClick` at `AgentClient.java:41,46`. *Unverified*, from memory of the 1.21.9 changes; these are where F8 and menu takeover live, so the keyboard session in month 3 must cover them.

### 1.21.11: game rules

- **Game rules were renamed to snake_case registry names**, and some were merged or removed. For example, `doDaylightCycle` → `advance_time`, `doMobSpawning` → `spawn_mobs`, and `doFireTick` was replaced by `fire_spread_radius_around_player` ([Nodecraft summary](https://nodecraft.com/support/games/minecraft/general/minecraft-update-1-21-11-gamerule-changes), a secondary source).
  - All ten `gamerule` lines in `scripts/live-acceptance/processes.js:16-26` need the new names. Check each name against the 26.1.2 jar's `/gamerule` completions.
  - *Unverified:* whether the reply text still matches `REPLIES.gamerule` in `scripts/live-acceptance/console.js:39`.
- The other console replies in `scripts/live-acceptance/console.js:29-50` (`fill`, `setblock`, `give`, `clear`, `data`, `list`, `execute`, ...) are documented as 1.21.1 text. *Unverified* for 26.1.2: run each command once and update the patterns.
- The `server.properties` keys the runner writes (`scripts/live-acceptance/processes.js:90-103`: `online-mode`, `level-type`, `difficulty`, `enforce-secure-profile`, ...) are believed unchanged. Newer versions add keys (for example the 1.21.9 management server, off by default). *Unverified.* The superflat layout assumed at `scripts/live-acceptance/scenarios.js:11` also needs a check.

### 26.1: unobfuscated game

- Java 25 and the Loom changes are covered above. `ItemStackTemplate` was added for immutable item, count and component values ([Fabric 26.1 post](https://fabricmc.net/2026/03/14/261.html)). The mod builds `ItemStack`s (`FabricCrafting.java`, `AgentController.java:703`); *unverified* whether any of those calls moved.

### Only if the target is 26.2 or later

- **26.2:** getting and setting the current screen moved from `Minecraft` to `Minecraft.gui` ([Fabric 26.2 post](https://fabricmc.net/2026/06/15/262.html)). That affects `AgentController.java:128,321,333-336,482,732,738,745,755`, `FabricStorage.java:253,553,556` and the `currentScreen` checks in `FabricCrafting.java`.
- **26.3:** GLFW was replaced by SDL, and some input constants changed ([Fabric 26.3 post](https://fabricmc.net/2026/09/15/263.html)). `AgentClient.java:17,30` binds F8 with `GLFW.GLFW_KEY_F8` and must switch to `InputConstants`. Fuel moved into item components, which affects month 5's `smelt` (not current code).

### Not expected to change

- **Chat signing:** the runner sets `enforce-secure-profile=false` on an offline server, and nothing found in the 1.21.2–26.3 notes affects that. *Unverified.*
- **Baritone API use** (`BaritoneAPI`, `IBaritone`, `GoalNear`, `GoalGetToBlock`, `Settings`, `Input`): Baritone keeps its own API names across versions, but each Baritone major version may change settings. *Unverified* until the mod compiles against v1.18.0.

## Risks

- **Mineflayer lag decides the target.** PrismarineJS still has 26.2 support in open pull requests five months after that release. If it stays this slow, every later port waits on it, or the bot backend ends up on a different version from the mod.
- **26.1.2 is not "current".** v0.2 will ship (May 2027) two or three drops behind. Players on the newest launcher default will need to pick 26.1.2 in the launcher.
- **The mapping migration touches every Java file at once.** Doing it as a separate change on 1.21.1 first keeps review and bisection possible.
- **Java 25 everywhere.** CI, the `bot-acceptance` workflow, the Boat snapshot and the owner's Mac all need JDK 25. Until the snapshot is refreshed, Boat checks for the port start cold.
- **Baritone 1.18.0** was published in the same batch as 1.19.0 and 1.20.0. Nobody here has run it yet, and its settings or behaviour may differ from 1.11.3. The pathing scenarios (collect, return home, pit) are the first live check.
- **Unverified console and SNBT formats** could make acceptance runs fail in confusing ways. Capturing fixtures from the real jar early is cheaper than debugging failed scenarios.

## Open questions for the owner

1. Accept 26.1.2, with the January re-check rule above? Or wait for Mineflayer and target 26.3 or 26.4, accepting the risk that the bot backend slips past month 3?
2. Does v0.1.x on 1.21.1 keep receiving fixes after the port? The roadmap default is no. If yes, `main` needs a 1.21.1 maintenance branch that stays on Yarn, Loom ≤ 1.17 and Java 21, with its own CI on JDK 21.
3. Should the Yarn → Mojang mapping migration land on 1.21.1 before month 3, as a separate pull request?
4. JDK 25 on the Mac: installing it needs your approval. It is needed for `dev:mod`, `runClient` and the scripted Fabric suite on the new version.
5. If Mineflayer stalls on a future version, is it acceptable to pin PrismarineJS packages to a git commit from an open pull request, or must the bot only use published releases?
