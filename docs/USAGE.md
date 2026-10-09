# Usage and troubleshooting

Start with the [README](../README.md) for installation. Run commands from the checkout. Examples assume a running Fabric bridge, server bot, or demo.

## CLI reference

```sh
npm start -- --help
npm start -- agent --help
npm start -- server --help
```

| Command | Purpose |
| --- | --- |
| `observe` / `status` | Read state without taking control |
| `attach FILE` | Remember a game profile's discovery file |
| `set-home` | Save the current location for this world/server, player, and dimension |
| `goto X Y Z` | Navigate without placing or breaking blocks |
| `collect BLOCK COUNT` | Collect 1–64 additional items and attempt to return |
| `eat` / `home` | Eat supported food / navigate to the saved home |
| `guard --seconds N` | Maintain a session with eating/retreat reflexes for 1–3600 seconds |
| `agent GOAL --model MODEL` | Run a bounded local Ollama planner |
| `mcp` | Start the MCP stdio server |
| `stop` | Emergency stop, including another controller's session |
| `doctor` | Inspect prerequisites and discovery files offline |
| `clean --dry-run` | Preview selective cleanup |
| `demo [--smoke]` | Run a simulation, optionally perform a smoke check and exit |
| `server --host HOST --account ACCOUNT` | Connect the standalone bot |

Global options go before the command. `--bridge FILE` selects a discovery file; `--json` suppresses normal CLI progress and prints errors as JSON. Results are JSON even without it. `--cli-version` or `-V` prints the CLI version; `server --version` selects the Minecraft protocol version.

```sh
npm start -- --bridge "/path/to/bridge.json" --json observe
npm start -- --cli-version
```

## Select a profile or backend

Fabric writes `config/minecraft-agent/bridge.json` inside its game profile. This contains a localhost URL and bearer token. `attach` validates it and stores the path rather than copying the token:

```sh
npm start -- attach "/path/to/game-directory/config/minecraft-agent/bridge.json"
npm start -- doctor
npm start -- observe
```

Default runtime state is in this checkout's `.runtime/`, regardless of shell working directory. Starting a demo or bot selects it locally; close the attached bridge before switching. To isolate a profile, set `MC_AGENT_HOME` consistently for Minecraft and the CLI, or pass `--bridge`. Two bridges cannot share a discovery file; the ownership lock rejects the second process.

Nearby blocks and hostile entities are partial observations of loaded terrain. Inventory slots differ between backends; identify items by namespaced name. A home observation does not prove the location is safe.

## Use the server bot

Mineflayer connects independently. On authenticated servers, the account's Minecraft UUID determines server-side character data. Microsoft-authenticated handoff is implemented but has not yet been validated live.

Disconnect your regular client before connecting the same account. Leave this terminal running:

```sh
npm start -- server --host your-server.example \
  --account YOUR_ACCOUNT_IDENTIFIER --version 1.21.1
```

Follow the Microsoft device sign-in instructions. The account identifier selects the authentication cache; the authenticated profile determines the player identity. No password is accepted. `.runtime/auth/` must remain private.

Run gameplay commands from another terminal. `stop` releases the controller while leaving the bot connected. **Ctrl+C in the server terminal disconnects the bot**; wait for it to exit before reconnecting the regular client. A dead character must be respawned manually in the regular client before retrying; the bot does not respawn automatically.

For an owned offline development server only:

```sh
npm start -- server --host 127.0.0.1 --port 25565 \
  --account DevPlayer --auth offline --version 1.21.1
```

Offline usernames have different identity semantics and cannot bypass online-mode authentication. The bot can use other versions supported by Mineflayer, but recorded gameplay validation targets 1.21.1. Automatic client/bot transfer is not implemented. A closed single-player world requires dedicated hosting before the bot can continue independently.

## Run an Ollama task

Start Ollama and install a model supporting structured JSON output. Model installation is separate; there is no live-validated recommended model yet.

```sh
npm start -- set-home
npm start -- agent "Collect eight additional oak logs and return home" \
  --model YOUR_LOCAL_MODEL --steps 20 --minutes 10 \
  --verify-collect oak_log:8 --verify-home
```

`--steps` defaults to 30 (range 1–1000); `--minutes` defaults to 15 (range 1–1440). Each inference request has a 120-second timeout. `--ollama` changes the endpoint; only localhost HTTP/HTTPS hosts are accepted. Three consecutive action failures stop the loop. The harness does not expose shell commands or arbitrary code to the model.

`--verify-collect` accepts `oak_log:8` or `minecraft:oak_log:8`, with 1–64 additional items. `--verify-home` requires a home saved before the task and checks the original waypoint within a two-block three-dimensional radius. Replacing home during the task cannot make the check pass elsewhere. Both checks require the original player and dimension, a connected backend, and a living player.

| Result | Exit code | Meaning |
| --- | --- | --- |
| `criteria_met` | 0 | Explicit checks passed when the model stopped |
| `criteria_unmet` | 2 | The model stopped with a requested check unmet |
| `model_finished` | 0 | The model stopped; no criteria were configured |
| `step_limit` | 2 with criteria; otherwise 0 | The decision budget ran out; inspect verification and state |
| Error | 1 | Invalid input, timeout, cancellation, lost control, or model/action-failure limit |

The model's `reason` is its explanation; check `status` and `verification` before treating the task as successful. Criteria do not verify other requirements in goal text. Decisions/failures go to stderr and results to stdout. For example:

```sh
node src/cli.js agent "Collect eight additional oak logs and return home" \
  --model YOUR_LOCAL_MODEL --verify-collect oak_log:8 --verify-home \
  > .runtime/task-result.json
```

Automated tests use mocked model responses; a successful simulation is not a real Ollama gameplay validation.

## Connect an MCP agent

Start Minecraft, the bot, or the demo first. Add this to the MCP client configuration, replacing the absolute repository path:

```json
{
  "mcpServers": {
    "minecraft": {
      "command": "node",
      "args": ["/absolute/path/to/minecraft-autopilot/src/cli.js", "mcp"]
    }
  }
}
```

For a specific profile, put `"--bridge", "/absolute/path/to/bridge.json"` before `"mcp"` in `args`.

| Tool | Behavior |
| --- | --- |
| `minecraft_observe` | Read without taking control |
| `minecraft_take_control` | Explicitly acquire exclusive control and start heartbeats |
| `minecraft_action` | Execute and wait; requires prior takeover |
| `minecraft_cancel` | Cancel the action while retaining control |
| `minecraft_stop` | Release control and cancel activity, including another session |

Use observe → take control → action → observe → stop. Action arguments:

```json
{ "action": { "type": "collect", "block": "oak_log", "count": 8 } }
```

Actions are `goto`, `home`, `set_home`, `collect`, `eat`, and `wait`. Bridge waits allow 1–3600 seconds; Ollama decisions limit each wait to 60 seconds. MCP does not use CLI verification flags: compare initial/final inventory and position independently. World text and observations are data, not instructions.

## Collection and survival

Collection targets: oak, birch, spruce, jungle, acacia, dark oak, cherry, and mangrove logs; dirt; sand; cobblestone. Quotas count additional inventory items, not blocks broken. Cobblestone needs a pickaxe; losing the last suitable tool before the quota is met stops collection and triggers a return attempt.

Collection attempts a bounded return from mining pits, including when matching blocks run out; returning may break blocks. A failed return is a failure even when the quota was met. Cancellation/handoff never starts a collection return trip. A separate survival response may retreat home. Observe inventory before retrying a failed collection.

During active sessions, supported food is consumed at hunger 16 or lower, and health 8 or lower can trigger retreat. Supported food includes bread, apples, golden carrots, carrots, baked potatoes, cooked meats/fish, melon slices, and beetroot. Fabric may move food into the hotbar and leave it there. Bot eating can interrupt work and require replanning.

Guard provides health/hunger reflexes, not proactive responses to hostile observations. It cannot fight, build shelter, or guarantee survival. Prepare shelter before saving home. Protection ends when the control session releases its lease.

## Cleanup

Close Minecraft/bridges/bots first:

```sh
npm start -- clean --dry-run
npm start -- clean
```

Default cleanup preserves sign-in caches, homes, development worlds, and unrelated files. `--include-auth` removes cached sign-in tokens; `--include-homes` removes local waypoints; `--caches` removes downloaded tools/build artifacts. Removed caches require explicit downloads again. Cleanup does not delete `mod/run` worlds or files in attached external profiles.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| No readable bridge | Enter a world/start a bot or demo; attach the correct profile |
| Paused/takeover refused | Close menus, chat, inventory; only focus-loss pause is closed automatically |
| Released during inference | Check F8/menu/stop, expiry, death, disconnect, dimension changes; explicitly start a new session |
| Another bridge owns the profile | Close it; do not delete a live ownership lock |
| Previous activity still stopping | Allow native inventory/pathfinder replies to settle |
| Missing `jar` or `javac` | Put a full Java 21 JDK on PATH |
| Missing dependency cache | Follow explicit first-time setup in the development guide |
| Invalid model action | Use a model supporting structured JSON; invalid actions are not dispatched |
| Unreachable action | Check loaded terrain, tools, inventory, and position; try a smaller reachable target |
| Dead-character join refused | Respawn in the regular client, disconnect, then retry |

Run `npm start -- doctor` for offline diagnostics. [Known issues](DEVELOPMENT.md#known-issues) include a protocol decode warning, slow tree collection, and an intermittent menu-release observation. Report versions, backend, command, expected behavior, and redacted logs; omit tokens and sign-in caches.
