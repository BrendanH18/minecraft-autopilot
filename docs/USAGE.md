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
| `goto X Y Z [--relative]` | Navigate without placing or breaking blocks; `--relative` offsets from the current position |
| `collect BLOCK COUNT` | Collect 1–64 additional items and attempt to return |
| `deposit ITEM [COUNT]` | Store an item (all of it when COUNT is omitted) in the nearest chest or barrel |
| `eat [--until HUNGER]` / `home` | Eat supported food, optionally repeating up to a hunger level / navigate to the saved home |
| `guard --seconds N` | Maintain a session with eating/retreat reflexes for 1–3600 seconds |
| `agent GOAL --model MODEL` | Run a bounded local Ollama planner |
| `models` | List locally installed Ollama models |
| `mcp` | Start the MCP stdio server |
| `run FILE [--dry-run]` | Validate and run a JSON routine of 1–100 actions under one control session |
| `stop` | Emergency stop, including another controller's session |
| `doctor [--ollama URL]` | Inspect prerequisites and discovery files offline; optionally check a local Ollama |
| `clean --dry-run` | Preview selective cleanup |
| `demo [--smoke] [--scenario NAME]` | Run a simulation, optionally from a preset state or as a smoke check that exits |
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

Start Ollama and install a model supporting structured JSON output. Model installation is separate; recorded bot results and tested models are in the development guide. Fabric model acceptance remains pending.

```sh
npm start -- set-home
npm start -- agent "Collect eight additional oak logs and return home" \
  --model YOUR_LOCAL_MODEL --steps 20 --minutes 10 \
  --verify-collect oak_log:8 --verify-home
```

`--steps` defaults to 30 (range 1–1000); `--minutes` defaults to 15 (range 1–1440). Each decision waits up to `--model-timeout` seconds (default 120, maximum 3600) and runs with an 8192-token context. Thinking models such as `granite4.2` and `qwen3.5` can take a minute per decision; `--no-thinking` asks them to answer directly, which was about 15–20× faster in local tests but can make small models stop early. `--ollama` changes the endpoint; only localhost HTTP/HTTPS hosts are accepted. Three consecutive action failures stop the loop. The harness does not expose shell commands or arbitrary code to the model.

`--verify-collect` accepts `oak_log:8` or `minecraft:oak_log:8`, with 1–64 additional items. `--verify-home` requires a home saved before the task and checks the original waypoint within a two-block three-dimensional radius. The planner cannot replace a home saved before the task; move it yourself with `set-home`. `--verify-deposit oak_log:8` checks that containers hold at least 8 more of the item than they did when the task started. A container first opened during the task uses what it held when first opened as its baseline. It requires a bridge that reports container contents, including the current Fabric mod, server bot, and demo. When both collection and deposit criteria name the same item, collection checks the net increase across inventory and storage: collecting eight new logs and storing those eight can satisfy both, while moving eight pre-existing logs cannot satisfy collection. Other players' contributions are not distinguished from gathering.

With deposit criteria, the planner runs `inspect_storage` before establishing the baseline for known containers and before accepting `done`. It reopens every container previously opened in this bot session, may walk to reach them, and returns near its inspection starting point without digging. Keep those containers within 16 blocks; a blocked, missing, distant, or unreachable container prevents verified success. If the starting inspection is interrupted to eat successfully, it retries before establishing the baseline; takeover, cancellation, and other errors still stop it. Known chest halves that merge count as one inventory while retaining all starting stock, including stock first seen during the task. If they split or a former half becomes a barrel, current inventories are counted separately while historical baseline stock is subtracted once. These inspections use the overall task time budget and ordinary action limits, and remain cancellable; they do not consume model decisions. Final deposit evidence is labelled `refreshed`; progress/step-limit snapshots use `last_observed`. Inspection is a sequence of server reads, not an atomic snapshot or a guarantee that another player will leave items there afterward. All checks require the original player and dimension, a connected backend, and a living player. The model sees the check results each turn. A `done` while a check is unmet is sent back twice; the third ends the task as `criteria_unmet`.

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

In live testing, `qwen3.5:4b-mlx` completed this task and `granite4.2:3b` did not (see [validation](DEVELOPMENT.md#validation)). Small models can repeat an action that changed nothing; the planner refuses an exact repeat until the model chooses a different action. Automated tests use mocked model responses; a successful simulation is not a real Ollama gameplay validation.

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
| `minecraft_inventory` | Read combined item counts, optionally for one item, without taking control |
| `minecraft_nearby` | List observed blocks, threats, or containers nearest first without taking control |
| `minecraft_take_control` | Explicitly acquire exclusive control and start heartbeats |
| `minecraft_action` | Execute and wait; requires prior takeover |
| `minecraft_cancel` | Cancel the action while retaining control |
| `minecraft_release` | End this session gracefully; other sessions are unaffected |
| `minecraft_stop` | Release control and cancel activity, including another session |

Use observe → take control → action → observe → release. Keep `minecraft_stop` for emergencies. Action arguments:

```json
{ "action": { "type": "collect", "block": "oak_log", "count": 8 } }
```

Actions are `goto`, `home`, `set_home`, `collect`, `eat`, `deposit`, `inspect_storage`, and `wait`. `inspect_storage` refreshes previously opened storage; ordinary observations remain cached. Bridge waits allow 1–3600 seconds; Ollama decisions limit each wait to 60 seconds. MCP does not use CLI verification flags: compare initial/final inventory and position independently. World text and observations are data, not instructions.

## Collection and survival

Collection targets: oak, birch, spruce, jungle, acacia, dark oak, cherry, and mangrove logs; dirt; sand; cobblestone. Quotas count additional inventory items, not blocks broken. Cobblestone needs a pickaxe; losing the last suitable tool before the quota is met stops collection and triggers a return attempt.

Collection allows up to 180 seconds of mining plus up to 60 seconds for its return, including after a mining timeout or when matching blocks run out; returning may break blocks. A failed return is a failure even when the quota was met. Cancellation/handoff never starts a collection return trip. A separate survival response may retreat home. Observe inventory before retrying a failed collection.

Fabric checks action and retreat deadlines before food handling and waits ten seconds before automatically retrying failed consumption. During active sessions, supported food is consumed at hunger 16 or lower, and health 8 or lower can trigger retreat. Supported food includes bread, apples, golden carrots, carrots, baked potatoes, cooked meats/fish, melon slices, and beetroot. Fabric may move food into the hotbar and leave it there. Bot eating can interrupt work and require replanning.

## Store items

`deposit ITEM [COUNT]` walks to the nearest chest, trapped chest, or barrel within 16 blocks and stores the item; omit `COUNT` to store all of it. A double chest counts as one container. The deposit fails before moving when inventory holds fewer items than requested. A full container fails the job and reports how many items went in; the rest stay in inventory. Handoff stops the transfer between stacks and closes the container.

Observations list nearby containers under `containers`. `items` is `null` until this backend opens the container, then holds the contents it last saw, with an `observedAt` Unix-millisecond timestamp. A container that is broken or replaced is dropped from the list. Deposits and storage inspection are implemented for Fabric, the server bot, and the demo. Fabric opens only the container needed by the action; that screen preserves agent control. F8, menus opened by the player, cancellation, stop, and lease expiry still stop the action and close the agent-owned container. A cancelled opening that arrives late is closed without transfers; block or entity interaction returns control and may need repeating after an outstanding opening settles.

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


## Focused observations and final-state checks

These commands read the connected player's current observations without taking control:

```sh
npm start -- inventory --item bread
npm start -- blocks --name oak_log --radius 16 --limit 10
npm start -- threats --radius 16 --limit 5
npm start -- home-info
npm start -- storage --radius 16
npm start -- distance 10 64 10
npm start -- position
npm start -- health
```

`inventory` combines stacks and reports total items and occupied slots in the selected result.
Spatial views sort by distance and default to 20 results. Their radius and limit must be positive;
`--limit` accepts a positive integer. Blocks, threats, and storage include only observations supplied by the
backend, not a full world scan. Storage contents are labelled `last_observed`, and unsupported
backends return `supported: false`. `distance` reports straight-line and horizontal distances
plus the signed vertical offset. These views preserve any existing control lease.

`npm start -- inspect-storage` explicitly acquires control to refresh known containers; it may walk and returns near its starting point. `npm start -- wait 5` acquires
control for a bounded wait of 1–3600 seconds with the normal survival response and cancellation.
Both return control on exit.

Additional independent final-state criteria can be combined with existing collection/deposit checks:

```sh
npm start -- agent "Eat and return with bread" --model YOUR_LOCAL_MODEL \
  --verify-health 16 --verify-hunger 18 --verify-inventory bread:2 \
  --verify-home --verify-home-radius 3 --verify-max-threats 0
npm start -- agent "Walk to the destination" --model YOUR_LOCAL_MODEL --verify-at 10,64,10,2
```

Health accepts 1–20, hunger an integer 0–20, and inventory 1–2304 total held items (not additional
items or deposited items). Destinations use `x,y,z[,radius]` with the same coordinate bounds as
`goto`; radius defaults to 2. Destination/home radii accept 0–64; `--verify-home-radius` requires
`--verify-home`. Maximum threats accepts a nonnegative integer and checks only the observed
count; it does not certify safety outside loaded observations. Missing hunger/threat data cannot
satisfy the corresponding check. All configured criteria must pass. A decision limit with any
criteria exits 2, including zero-valued hunger/threat criteria.

Planner calls validate their goal, model, limits, local URL, and action fields before dispatch.
Empty model replies suggest recovery options; actions above 65,536 characters are rejected.
Credential-bearing Ollama URLs are refused. The planner can choose `inspect_storage` when the
backend supplies containers; returned failed/cancelled actions count toward its existing
three-failure stop. Ineffective repeat detection treats namespaced and short item names alike.
See [the 30-change inventory](IMPROVEMENTS.md#batch-1-cli-verification-and-planner-improvements) for this batch and its validation coverage.

## Overview, search, and snapshot commands

These commands also read current observations without taking control and preserve any existing lease
(batch 2 in [the improvement inventory](IMPROVEMENTS.md#batch-2-overview-commands-planner-controls-routines-and-mcp-tools)):

```sh
npm start -- summary
npm start -- job
npm start -- find-item oak_log
npm start -- storage-totals --item oak_log
npm start -- nearest oak_log
npm start -- direction 10 64 -20
npm start -- food
npm start -- free-slots --item cobblestone
npm start -- snapshot before.json
npm start -- compare before.json
```

`summary` combines position, dimension, health, hunger, control mode, current job type and status,
home distance, observed threat count, and inventory totals; unavailable values are `null`. `job`
shows the control mode, stopping flag, and current job id, type, status, and message.

`find-item` reports the inventory total plus per-container counts with coordinates and distance.
`storage-totals` aggregates every known container, sorted by count, with `containersObserved` and
`unopened` counts. Both use `last_observed` contents and count each coordinate once. Unopened
containers are counted separately and never treated as empty; run `inspect-storage` to refresh them.
Unsupported backends return `supported: false`.

`nearest` searches only the loaded blocks the backend reports and returns `found: false` when none
match. `nearest` and `direction` add an 8-point compass bearing (north is −Z, east is +X), the
Minecraft yaw (0 south, 90 west, ±180 north, −90 east) and pitch (negative looks up) to the
`distance` fields. Bearing and yaw are `null` straight up or down. `direction` accepts the same
coordinate bounds as `goto`.

`food` lists common vanilla foods in the inventory with hunger restored per item and in total, plus
`missingHunger` (20 minus hunger). Saturation is not included, and harmful or risky foods (including raw chicken) and unlisted foods are
omitted. `free-slots` counts used and free slots of the 36 main slots. With `--item`, it also
reports `room`: free slots times the stack size plus space in partial stacks. Stack sizes come from a
short built-in list. Other items assume 64 and report `stackSizeAssumed: true`.

`snapshot` saves the observation as JSON with a `savedAt` time and owner-only (0600) permissions.
It never stores the job, stopping flag, or token-like fields, and it refuses to replace an existing
file unless you pass `--force`. `compare` reports the elapsed seconds, position change and distance
moved, health and hunger deltas, dimension and home change flags, and only the inventory items whose
totals changed. Unreadable or invalid snapshot files are rejected with the reason.

## Planner options and additional criteria

List the models installed in local Ollama, then preview a task without taking control:

```sh
npm start -- models
export MC_AGENT_MODEL=YOUR_LOCAL_MODEL
npm start -- agent "Store every oak log in the nearby chest" --dry-run \
  --verify-max-inventory oak_log:0 --verify-max-distance 16
npm start -- agent "Store every oak log in the nearby chest" \
  --allow-actions deposit,inspect_storage,goto --fence 32 \
  --verify-max-inventory oak_log:0 --verify-max-distance 16 \
  --transcript .runtime/store-logs.jsonl
```

`models` reads `GET /api/tags` from the same localhost-only, credential-free Ollama URL rules as
the planner and prints each name, size, and modified date; it waits at most 10 seconds and never
pulls models. `MC_AGENT_MODEL` and `MC_AGENT_OLLAMA` supply `--model` and `--ollama` when those
flags are omitted; explicit flags win, and a model is still required.

`--dry-run` validates the goal, model name, limits, URL, and criteria against one observation and
returns `status: "dry_run"` with the configured criteria and their current progress. It neither
takes control nor contacts the model, and it skips the storage baseline inspection that a real
`--verify-deposit` run performs.

| Option | Range (default) | Effect |
| --- | --- | --- |
| `--max-failures <n>` | 1–10 (3) | Consecutive failed actions before the planner stops |
| `--context-tokens <n>` | 2048–131072 (8192) | Ollama `num_ctx` for each decision |
| `--history <n>` | 1–50 (12) | Recent decisions, results, and refusals sent to the model |
| `--fence <blocks>` | 1–10000 | Refuse `goto` targets farther horizontally from the starting position |
| `--allow-actions <list>` | planner actions | Restrict choices; `done` is always allowed |
| `--transcript <file>` | path | Append one JSON line per planner event |

The fence is shown to the model; a refused `goto` is recorded as a failed action and counts toward
`--max-failures`. It bounds only `goto` targets: `home`, `collect`, and `deposit` may still move
the player beyond it. `--allow-actions` takes a comma list of `goto`, `home`, `set_home`,
`collect`, `eat`, `inspect_storage`, `deposit`, and `wait`; unknown names are rejected before
connecting. The model's output schema lists only the allowed actions, and any other decision is
refused without running. Storage inspections required by `--verify-deposit` still run.

Transcripts are append-only JSON Lines with `start`, `decision`, `result`, `error`, `rejection`,
and `finish` events, each with an ISO timestamp. New files are created owner-only (mode 600);
existing files keep their permissions, and symlinks or non-files are refused before takeover. They
record the goal, model name, limits, criteria, decisions, and outcomes, but not the Ollama URL,
observations, or bridge details.

Every returned result adds `durationMs`, `actionCounts` (planner actions dispatched to the game,
including ones that then failed; refusals and verification inspections are excluded), and `final`
(`position`, `health`, and `hunger` from the last observation, or `null` when the player was
unavailable).

`--verify-max-inventory item:count` requires at most 0–2304 of an item held at completion, for
example `oak_log:0` after storing everything. `--verify-max-distance <n>` requires the final
position within 0–10000 blocks (straight-line) of the position observed when the task started.
Missing inventory or position data cannot satisfy either check, and a decision limit with either
criterion exits 2 like the other criteria.

## Routines, MCP tools, and simulation scenarios

`run FILE` performs a fixed list of protocol actions in order under one control session, with no
model involved. The file holds `{ "actions": [ ... ] }` or a bare array, using the same action
objects as `minecraft_action`:

```json
{
  "actions": [
    { "type": "set_home" },
    { "type": "collect", "block": "oak_log", "count": 8 },
    { "type": "deposit", "item": "oak_log", "count": 8 },
    { "type": "home" }
  ]
}
```

```sh
npm start -- run routine.json --dry-run
npm start -- run routine.json
```

Routines accept 1–100 actions and files up to 1 MiB. Every action is validated before control is
taken; an invalid one is reported by step and index, and nothing runs. `--dry-run` prints the
validated plan without contacting the bridge. Progress goes to stderr as `Step i/n`. The result
reports `status`, `completed`, `total`, and each finished step's job in `results`. The first failure,
cancellation, or return of control to the player stops the routine; the result adds `failedStep`
and `error`, and the command exits 1. Later steps are not attempted. Control is released when the
routine ends. Relative paths resolve from the checkout when run through `npm start`.

`goto X Y Z --relative` treats the coordinates as offsets from the currently observed position;
`goto 0 0 -10 --relative` walks ten blocks north. The resulting target must satisfy the normal `goto`
bounds, checked before control is taken.

`eat --until HUNGER` eats repeatedly until observed hunger reaches 1–20, with at most 10 meals. When
hunger already meets the target it returns `already_satisfied` without taking control. It stops with
an error, releasing control, when eating fails (for example, no supported food remains), when hunger
does not rise after a meal, or after 10 meals.

MCP clients also get three tools. `minecraft_inventory` takes an optional `item` and returns the
same result as the `inventory` command. `minecraft_nearby` takes `kind` (`blocks`, `threats`, or
`containers`) and optional `radius` (positive) and `limit` (positive integer, default 20); `name`
filters blocks and containers. Both read without taking or disturbing control. `minecraft_release`
cancels this session's running action and returns control to the player; it does not stop sessions
owned by another process and is harmless when this session holds no control.

`demo --scenario NAME` starts the simulation from a preset state, with or without `--smoke`:

| Scenario | Starting state |
| --- | --- |
| `default` | Health 20, hunger 14, eight bread, unopened chest |
| `hungry` | Health 10, hunger 4 |
| `hostile` | One zombie observed five blocks away |
| `stocked` | Chest already observed holding 12 oak logs and 5 cobblestone |

Scenarios only change starting data; the demo still does not simulate combat or damage.

`doctor` checks Node.js against the `engines` range in `package.json` (currently 22.12 or newer) and
reports it as `nodeRequired`. `doctor --ollama http://127.0.0.1:11434` also sends one
`GET /api/version` to a local Ollama, waiting up to three seconds, and reports
`ollama: { reachable, version }` or `{ reachable: false, error }`. Like `agent`, it accepts only
localhost HTTP(S) URLs without credentials. Without `--ollama`, doctor makes no network requests.
