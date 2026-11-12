# Routine composition

`mc-agent compose` prints a validated routine as `{ "actions": [...] }`. It runs
entirely offline and never executes steps or overwrites a source file. Save the
output to a **different** file before inspecting or running it. Redirecting output
onto an input path can truncate that input before the CLI reads it.

Every command starts with `<file>`, the input routine. Secondary `<other>` inputs
accept the same routine format. Steps and inclusive range endpoints are 1-based.
Input and output must contain 1–100 actions. Expansions are refused before their
output is allocated. All generated actions retain the protocol's coordinate,
collection (1–64), deposit (1–2304), and wait (1–3600 seconds) limits.

These are edits to requested actions, not predictions of gameplay. Reordering,
repeating, or transforming actions can change collection, deposits, and home
semantics. They do not undo earlier actions or check terrain, hazards, inventory,
container access, dimensions, or backend capabilities.

## Commands

The table omits the common `mc-agent compose` prefix. Points use `x,y,z`. Put `--`
before the arguments when passing negative numbers or coordinates.

| Command and arguments | Result |
| --- | --- |
| `replace-range <file> <first> <last> <other>` | Replace an inclusive range with the complete secondary routine. |
| `reverse-range <file> <first> <last>` | Reverse the order of the selected actions, preserving the prefix and suffix. |
| `repeat-range <file> <first> <last> <times>` | Replace the range with 1–100 consecutive copies, subject to the total step limit. |
| `move-range <file> <first> <last> <target>` | Remove the range and insert it at slot `target` in the remaining routine. Slots run from 1 through remaining length + 1; the last appends. |
| `swap-ranges <file> <first-a> <last-a> <first-b> <last-b>` | Exchange two nonoverlapping ranges. They can have unequal lengths and be supplied in either order. |
| `weave-chunks <file> <other> <size>` | Alternate chunks of 1–100 actions from each routine, starting with the input. Append the longer routine's remainder. |
| `cycle-insert <file> <other> <every>` | Insert the secondary routine after each complete group of `every` original actions, including after the last action if it completes a group. Inserted actions do not affect counting. |
| `before-type <file> <type> <other>` | Insert the secondary routine before each original action of `type`. |
| `after-type <file> <type> <other>` | Insert it after each matching original action. |
| `replace-type <file> <type> <other>` | Replace every matching original action with the secondary routine. |
| `mirror-route <file> <axis> <pivot>` | Reflect all goto coordinates on `x`, `y`, or `z`: new coordinate = 2 × pivot − old coordinate. |
| `rotate-route <file> <pivot> <turns>` | Rotate goto X/Z around the point. Turns are integers from −4 to 4; +1 maps relative `(x,z)` to `(-z,x)`. Y is unchanged. |
| `scale-route <file> <pivot> <factor>` | Scale all three goto coordinate offsets from the pivot by a positive factor from 0.000001 to 1,000,000. |
| `snap-route <file> <grid>` | Round each goto coordinate to the nearest world-origin-aligned grid multiple. Grid is 0.000001–1,000,000. Ties round toward positive infinity. |
| `anchor-route <file> <point>` | Translate all gotos so the first goto equals the target point. Requires a goto. |
| `offset-range <file> <first> <last> <dx> <dy> <dz>` | Translate only goto actions inside the selected step range. |
| `set-collect <file> <item> <count>` | Assign the same 1–64 quota to each collection for that exact normalized item name. Other collections stay unchanged. |
| `set-deposit <file> <item> <count>` | Assign a 1–2304 quota to each matching deposit, including deposit-all actions. |
| `set-wait-range <file> <first> <last> <seconds>` | Set durations of waits in the range, preserving other actions. Fractional durations are accepted. |
| `waypoint-waits <file> <seconds> <points...>` | Append a goto followed by a wait at each of 1–50 points. |
| `round-trip <file> <points...>` | Append a route through 2–50 points, then visit preceding points in reverse, ending at the first point. The final outbound point is not duplicated. |
| `patrol <file> <laps> <points...>` | Append a goto to the first point and 1–100 closed laps through 2–50 points, subject to the total step limit. Every lap returns to the first point. |
| `resolve-home <file> <point>` | Replace every dynamic home action with a goto to an explicit coordinate. This freezes the destination and removes the runtime home-dimension check for those steps. |
| `storage-round <file> <points...>` | Append a goto and storage inspection at each of 1–50 points. Inspections use the backend's nearby/known storage behavior; no exact container is selected. |
| `gather-store <file> <item> <count> <batch> <source> <depot>` | Append repeated source goto → collect → depot goto → inspect storage → deposit trips. Count is 1–2304; each batch is 1–64 and the final batch is reduced to the remainder. Supports the existing collection target list. |

Type selection accepts `goto`, `home`, `set_home`, `collect`, `eat`,
`inspect_storage`, `deposit`, and `wait`. It selects original steps only. A valid
but absent target type or item leaves the input unchanged. Coordinate edits affect
only explicit goto actions; they do not move a saved home or change where
collection searches or deposits happen.

## Examples

Prepare a routine that inspects storage before each deposit:

```sh
mc-agent compose before-type trip.json deposit inspect.json > reviewed-trip.json
mc-agent routine numbered reviewed-trip.json
```

`inspect.json` can contain `[{ "type": "inspect_storage" }]`. The edit is static;
inspection can still fail at execution.

Move original steps 2–4 to the end of a six-step routine:

```sh
mc-agent compose move-range six-steps.json 2 4 4 > reordered.json
```

Removing three actions leaves three actions and four insertion slots, so target 4
appends. The slot is measured **after** removing the range.

Append two collection trips requesting 32 additional oak logs each:

```sh
mc-agent compose gather-store preparation.json oak_log 64 32 10,64,0 0,64,0 > deliveries.json
```

The source and depot are goto destinations. Collection may return toward home;
deposits choose storage under the backend's existing rules. Existing carried stock,
failures, and stale observations prevent this generated routine from proving a
net delivery. Inspect its steps and use the existing independent objective checks
when executing a task.
