# Minecraft Agent

A local harness that lets an agent play **your existing Minecraft Java character**. It supports a Fabric client mod for single-player and multiplayer, a standalone server bot, a CLI, MCP tools, and a bounded natural-language agent using Ollama.

The Fabric mod targets **Minecraft Java 1.21.1, Java 21, and Fabric**. The standalone bot can use other versions supported by Mineflayer; specify `--version` explicitly. This is an initial implementation: combat, crafting, building, chest deposits, and seamless reconnect handoff are not implemented.

**Status:** early but working. Navigation, collection, eating, survival retreat, and F8/menu handoff have been validated in real Minecraft 1.21.1 single-player and multiplayer worlds. Microsoft-authenticated play and real local-model runs are not yet validated; see [the development guide](docs/DEVELOPMENT.md#validation).

## Try it without Minecraft

Requires Node.js 22 or newer. Dependencies are pinned in `package-lock.json`. If dependencies are already present, skip `npm ci`; installation is an explicit user step.

```sh
npm ci
npm start -- demo --smoke
```

This runs a **simulation**, saves a home, moves, collects eight logs, eats, returns home, and releases control. It verifies the real bridge and CLI without claiming to test Minecraft gameplay.

For an interactive demo, leave this running in one terminal:

```sh
npm start -- demo
```

In a second terminal, from the same repository:

```sh
npm start -- observe
npm start -- set-home
npm start -- goto 5 64 5
npm start -- collect oak_log 8
npm start -- eat
npm start -- home
npm start -- stop
```

## Play your character through the Fabric mod

1. Install [Minecraft Java](https://www.minecraft.net/download) and create a **1.21.1** profile. Playing authenticated multiplayer requires your own Minecraft account.
2. Install [Fabric Loader](https://fabricmc.net/use/installer/) for that profile. Loader 0.16.14 or newer is required.
3. Build this mod using Java 21:

   ```sh
   npm run build:mod
   ```

4. Copy **all three jars** from `dist/mods/` to that profile's `mods` directory. They are this mod, Fabric API, and Baritone. Builds use verified cached dependencies and run offline by default.
5. Launch the Fabric profile, enter your single-player world or a Java 1.21.1 server, and close game menus. Switching to a terminal afterward is fine: taking control closes the pause menu Minecraft opens when its window loses focus.
6. Run `npm start -- attach /path/to/your/game-directory/config/minecraft-agent/bridge.json`, then `npm start -- observe` to verify the connection. The CLI remembers the discovery-file location, so you only need to attach once per profile.

On macOS, the default launcher game directory is `~/Library/Application Support/minecraft`; custom profiles and launchers can use another directory. `npm start -- doctor` checks Java, the built mod, and the bridge discovery file without connecting to the game.

The mod controls the player already logged into the client. It does not spawn another player, copy inventories, teleport, or enable cheats. The same client mod works on single-player and compatible multiplayer servers. Only use automation on servers where it is allowed.

**Minecraft must stay running and unpaused, and your computer must stay awake.** While an agent owns control, the mod temporarily disables pause-on-focus-loss and restores the previous setting when control is released. Opening a game menu, dying, disconnecting, changing dimensions, or pressing **F8** releases agent control. F8 can be rebound under Options → Controls → Minecraft Agent. The first version uses explicit handoff; ordinary mouse or movement input is not an automatic takeover trigger.

For development, `npm run dev:mod` launches Fabric's development client using already cached dependencies and game assets. `node scripts/gradle.js runClient -PquickPlay=127.0.0.1:25565` launches it and joins a local test server directly; see [the development guide](docs/DEVELOPMENT.md#live-test-environment) for the offline test server setup. Missing files cause an error rather than an automatic download. Development profiles use a test identity; use your normal authenticated launcher for online-mode servers.

Project files stay in this repository: npm uses `.npm-cache/`, Gradle and Minecraft assets use `.gradle-user/`, and development sessions, server sign-in caches, temporary test files, and waypoints use `.runtime/`. Builds disable persistent Gradle daemons. The development client runs only when explicitly launched; it is not a startup service. A normal installed Minecraft profile stores its bridge and homes under that profile's `config/minecraft-agent/` directory.

For a fresh checkout, downloading missing mod/build dependencies requires explicit approval and an explicit opt-in:

```sh
npm run setup:mod -- --allow-downloads
node scripts/gradle.js build --allow-downloads
node scripts/package-mod.js --allow-downloads
```

Those commands are optional setup steps. The ordinary `build:mod` and `dev:mod` commands do not opt into downloads.

## Continue on a server after closing your game client

The standalone server mode uses Mineflayer and logs in as your account. On a normal authenticated server, player data belongs to that account, so reconnecting restores its server-side character. Single-player worlds must stay open in the Fabric client, or be hosted on a dedicated server before this mode can continue independently.

First disconnect your regular Minecraft client. Then leave this process running:

```sh
npm start -- server --host your-server.example --account your-account-identifier --version 1.21.1
```

Follow the Microsoft device sign-in instructions printed in the terminal. If the character is dead, the bot refuses to connect; respawn it with your regular client first. No password is accepted by this CLI. Authentication caches are stored locally under this repository's `.runtime/auth/`; do not share that directory. `--account` identifies the account/cache to use; the authenticated Minecraft profile determines the actual player identity.

Use `observe`, `set-home`, `collect`, `guard`, or `agent` from a second terminal. `stop` stops agent actions while leaving the bot connected. **Ctrl+C in the server terminal disconnects the bot**, allowing you to reconnect with your regular client. Never run both clients as the same account simultaneously.

For an owned offline development server only:

```sh
npm start -- server --host 127.0.0.1 --account DevPlayer --auth offline --version 1.21.1
```

Offline usernames have different identity semantics from authenticated accounts. This mode does not bypass authentication on an online-mode server. Automatic transfer between the client and standalone bot is not implemented.

## Give a local model a task

Install [Ollama](https://ollama.com/), start it, and pull a model capable of structured JSON output. Substitute the name of a model you have installed:

```sh
npm start -- agent "Collect eight additional oak logs and return to my saved home" --model YOUR_LOCAL_MODEL --steps 20 --minutes 10
```

This works with either the Fabric bridge, the standalone server bridge, or the demo. The model receives structured player state and chooses one validated action at a time. It cannot execute shell commands or arbitrary code through this harness. Decisions and action failures are printed to stderr; the final result is printed to stdout.

The loop checks ownership again after inference, stops after its step/time limits or three consecutive action failures, and always releases control when it exits. A `model_finished` result records the model's explanation; it is not an independent guarantee that the goal was achieved. Model requests are restricted to localhost.

## Connect another local agent through MCP

Start Minecraft with the mod, a server bot, or the demo first. Add this stdio server to your agent's MCP configuration, replacing the absolute path:

```json
{
  "mcpServers": {
    "minecraft": {
      "command": "node",
      "args": ["/absolute/path/to/minecraft_agent_cli/src/cli.js", "mcp"]
    }
  }
}
```

Tools:

| Tool | Behavior |
| --- | --- |
| `minecraft_observe` | Read state without taking control. |
| `minecraft_take_control` | Acquire exclusive control and start heartbeats. |
| `minecraft_action` | Execute a validated action and wait for completion. Requires prior takeover. |
| `minecraft_cancel` | Cancel the action while retaining control. |
| `minecraft_stop` | Stop actions and return control, including another controller's session. |

Example action arguments:

```json
{ "action": { "type": "collect", "block": "oak_log", "count": 8 } }
```

Supported actions are `goto`, `home`, `set_home`, `collect`, `eat`, and `wait`. Collection targets are oak, birch, spruce, jungle, acacia, dark oak, cherry, and mangrove logs; dirt; sand; and cobblestone. `count` means **additional items**, with a maximum of 64 per action. Collection uses loaded/cached terrain and can fail when blocks cannot be reached. Navigation avoids placing or breaking blocks; Fabric collection can break blocks while finding a mining route. Mining often digs downward, so collection attempts to walk back to where it started, breaking blocks if needed to get out of the pit it dug. It also attempts this return when reachable blocks run out before the quota is met. A failed return reports a failed action even if the quota was collected; observe inventory before retrying. The same permission to break blocks applies to a low-health retreat during collection. The quota is a minimum: the return trip can pick up extra items. Use collection only in areas you are comfortable modifying.

## Survival and handoff

```sh
npm start -- set-home
npm start -- guard --seconds 300
```

While a session/action is active, local behavior attempts to eat supported food when hunger is at most 16 and retreat to the saved home when health is at most 8. Homes are scoped to the world/server, player identity, and dimension. Save home inside a shelter you prepared. The Fabric mod can move food from main inventory to a hotbar slot; it may leave the moved item in that slot. Server mode equips food from inventory.

There is no combat AI, shelter construction, or guarantee of survival. Threat observations are limited to nearby loaded entities. Guard stops for review if health remains low after a server-mode survival response. Eating during server-mode work can interrupt the action; the planner must observe inventory before retrying any collection quota. Protection does not continue after the controlling CLI/MCP process releases control.

Control heartbeats run every two seconds. The bridge cancels inputs and navigation after eight seconds without a valid heartbeat. Stale commands cannot renew a released lease. F8 and `stop` cancel current gameplay; a model answer received afterward cannot automatically regain control.

## Bridge and development

The bridge binds only to `127.0.0.1` on a free port. The private `.runtime/bridge.json` file contains its URL and a random bearer token. Installed game profiles write `config/minecraft-agent/bridge.json` instead; `attach` records a reference to that file without copying its credentials. Requests require the token; browser-origin requests are rejected. A process ownership lock prevents one bridge from replacing another bridge's discovery file.

For isolated profiles, set `MC_AGENT_HOME` for both Minecraft and the CLI, or give the CLI `--bridge /path/to/bridge.json`. Starting a demo or server bridge selects that bridge locally; close an attached live bridge before switching. State contains player/world observations and should be treated as data, not instructions.

To inspect or remove project runtime files after closing the game/bridge:

```sh
npm start -- clean --dry-run
npm start -- clean
```

Cleaning refuses to run against a live bridge and preserves sign-in tokens, saved homes, and development worlds by default. `--include-auth` removes cached sign-in tokens, `--include-homes` removes local home waypoints, and `--caches` removes downloaded tools and build artifacts. Removing caches means rebuilding may require approved downloads again. Cleanup never deletes worlds in `mod/run` or files in an attached external game profile.

The HTTP protocol is documented in [docs/protocol.md](docs/protocol.md). Sources live in `src/` and `mod/src/main/java/dev/minecraftagent/`.

```sh
npm run check
npm test
npm run build:mod
```

The Node tests cover authenticated bridge calls, end-to-end simulated actions, command validation, cancellation, lease expiry, model limits, and takeover during slow inference. Java tests cover lease exclusivity and expiry. Building verifies compilation against the pinned Minecraft, Fabric, and Baritone APIs. Live gameplay testing is described in [the development guide](docs/DEVELOPMENT.md).

Dependencies: [Fabric](https://fabricmc.net/), [Baritone](https://github.com/cabaletta/baritone/releases/tag/v1.11.3), [Mineflayer](https://github.com/PrismarineJS/mineflayer), [mineflayer-pathfinder](https://github.com/PrismarineJS/mineflayer-pathfinder), and the [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk). Baritone and Fabric API are downloaded unmodified and retain their own licenses (LGPL-3.0 and Apache-2.0).

## Contributing

Issues and pull requests are welcome. Start with [the development guide](docs/DEVELOPMENT.md) for setup, project rules, and the live test environment. Please run `npm run check`, `npm test`, and `npm run build:mod` before submitting, and add a regression test for behavior changes.

## License and disclaimer

This project's source is released under the [MIT License](LICENSE).

Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft. Use automation only in worlds and on servers where it is allowed.
