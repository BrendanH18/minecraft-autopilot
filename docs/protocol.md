# Local bridge protocol v1

Discover the bridge through this project's `.runtime/bridge.json`, an installed game profile's `config/minecraft-agent/bridge.json` selected with `attach`, or a file selected with `--bridge`. Its `url` is an HTTP origin on `127.0.0.1`, `token` is a bearer token, `protocol` is 1, and `backend` is `fabric`, `mineflayer`, or `demo`. Treat the file as a credential. JSON requests are capped at 8192 bytes; authentication is required for every endpoint. The adjacent `.lock` file records a process ID and random ownership nonce; a second bridge cannot replace a live owner's discovery file.

Every request uses `Authorization: Bearer TOKEN`. POST requests also use `Content-Type: application/json`. Browser-origin requests are rejected. Responses are JSON; failed calls return `{ "error": "explanation" }` with a non-2xx HTTP status.

| Method | Endpoint | Request | Response |
| --- | --- | --- | --- |
| GET | `/v1/state` | None | State observation. |
| POST | `/v1/control` | `{ "action": "acquire", "leaseId": "UUID" }` | `{ "ok": true }` |
| POST | `/v1/control` | `{ "action": "heartbeat", "leaseId": "UUID" }` | `{ "ok": true }` |
| POST | `/v1/control` | `{ "action": "release", "leaseId": "UUID" }` | `{ "ok": true }` |
| POST | `/v1/actions` | `{ "leaseId": "UUID", "action": { ... } }` | Started job. |
| POST | `/v1/cancel` | `{ "leaseId": "UUID" }` | `{ "ok": true }` |
| POST | `/v1/stop` | `{}` | `{ "ok": true }` |

Create a fresh canonical UUID for each control session. Acquire is exclusive, and heartbeat/release/action/cancel require the current owner. Stop requires the bridge bearer token but no lease, allowing a second process to stop the owner. An expired or released UUID cannot renew control. After manual takeover, only a new explicit acquire starts another session.

Heartbeat every two seconds. After eight seconds without a heartbeat, movement, digging, and item use are cancelled. Fabric checks the monotonic lease clock each client tick; Node uses a 250 ms watchdog. A paused/frozen game cannot execute ticks; lease expiry is enforced when its event loop resumes. Minecraft requests are dispatched on the client thread, with queued requests discarded if they time out before execution.

Actions:

```json
{ "type": "goto", "x": 10, "y": 64, "z": -20 }
{ "type": "set_home" }
{ "type": "home" }
{ "type": "collect", "block": "minecraft:oak_log", "count": 8 }
{ "type": "eat" }
{ "type": "wait", "seconds": 30 }
```

Coordinates must be finite, X/Z within ±29,999,984 and Y within -64..320. Count must be an integer in 1..64. Wait duration is 1..3600 seconds. Collection targets are listed in the [usage guide](USAGE.md#collection-and-survival). Most actions have a 180-second timeout; wait's timeout is its duration plus five seconds. Survival retreat has a separate 60-second limit. Collection is measured by inventory increase, not blocks broken. Real backends require a pickaxe for cobblestone collection and fail if no usable pickaxe remains while mining.

Jobs contain `id`, `type`, `status`, and `message`. Status is `running`, `completed`, `failed`, or `cancelled`. Poll state to track the current job; at most one action runs at a time. The last terminal job remains observable until a new action starts. A terminal status means the action stopped, not that the agent's broader goal succeeded.

The CLI planner's explicit inventory/home criteria are checked separately by the client; they are not bridge endpoints. See [Ollama task verification](USAGE.md#run-an-ollama-task) for their scope and exit statuses.

Real-backend collection completes only when its item quota is met and the player is back near the starting point. An unreachable return trip is `failed` even if the inventory quota was met. When matching blocks run out before the quota is met, collection attempts the return trip and remains `failed`; the message reports the inventory total/target and return outcome. Always observe fresh inventory before retrying a partial collection. Cancellation, lease expiry, death, or a survival interruption does not start a collection return trip. Fabric allows up to 60 additional seconds to return after its mining deadline; the bot's return remains within the overall action deadline.

State includes `protocol`, `backend`, `connected`, `paused`, `mode` (`manual` or `agent`), `job`, and, when connected, `player`, `inventory`, `home`, `threats`, `blocks`, and `survival`. Fabric also exposes `recovering` and `focusPaused`. `focusPaused` is true when the only blocker is the pause menu Minecraft opened because its window lost focus (for example, switching to a terminal to run the CLI); acquire closes that menu and disables pause-on-focus-loss for the session. Other screens, such as inventories, chat, or a menu the player opened while focused, still block takeover. Nearby blocks and threats are partial loaded-world observations. Different backends can expose additional fields.

Node bridges also expose `stopping`. Cancellation stops inputs immediately, but an inventory or pathfinder operation can still be awaiting a reply. While it settles, the bridge rejects new actions and takeover instead of overlapping operations. A world, player, or dimension change releases control even when no action is running.

Player data includes name, UUID, health, hunger, dimension, and position. Inventory entries include slot, namespaced item name, and count. Item slots follow the underlying backend's inventory model and are observational; clients should identify items by name rather than assume the same slot numbers in both backends.
