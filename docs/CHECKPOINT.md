# Saved snapshot checkpoints

`mc-agent checkpoint` evaluates 25 offline predicates against one saved snapshot.
It needs neither a running bridge nor Minecraft. Capture a snapshot using
`mc-agent snapshot before.json`, then inspect it:

```sh
mc-agent checkpoint health-range before.json 10 20
mc-agent checkpoint kit before.json oak_log=16 bread=4
mc-agent checkpoint at-home before.json 2
mc-agent checkpoint fresh before.json 60 2026-01-01T12:01:00Z
mc-agent checkpoint within-box before.json minecraft:overworld -- -16,60,-16 16,80,16
```

Every output includes `passes`: `true` means the recorded predicate held,
`false` means recorded evidence contradicts it, and `null` means evidence is
missing or unusable. These are reports: a false or unknown predicate still
prints JSON and exits successfully. Malformed files or arguments are errors.
No check executes a routine, acquires control, or changes its input file.

All commands take `<file>` first. Points use `x,y,z`; use `--` before negative
arguments. Ranges, boxes, radii, freshness windows, and time windows include
both endpoints. Dimensions use full names such as `minecraft:overworld`.

| Command after `checkpoint` | Recorded predicate |
| --- | --- |
| `health-range <file> <minimum> <maximum>` | Health lies inside a range from 0 to 1024. |
| `hunger-range <file> <minimum> <maximum>` | Integer hunger from 0 to 20 lies inside the requested range. |
| `alive <file>` | Health is positive. Zero health fails; missing/negative health is unknown. |
| `dimension <file> <dimension>` | Player dimension matches the supplied identifier. |
| `within-box <file> <dimension> <corner-a> <corner-b>` | Player lies in the cuboid in the specified dimension; corner order does not matter. |
| `within-radius <file> <dimension> <point> <radius>` | Player is within a three-dimensional straight-line radius in the specified dimension. |
| `altitude <file> <minimum> <maximum>` | Player Y lies within a band from -64 to 320. |
| `home-saved <file>` | An explicit home exists. Explicit `null` fails; omitted home is unknown. |
| `home-dimension <file>` | Known home and player dimensions match. |
| `at-home <file> <radius>` | Player is within a three-dimensional radius of home in the same known dimension. |
| `item-range <file> <item> <minimum> <maximum>` | Total carried quantity of one item is in the requested integer range. |
| `kit <file> <entries...>` | Every `item=count` carried quota is met. |
| `allowed-items <file> <items...>` | Every positive carried item belongs to the supplied allowlist. |
| `item-ratio <file> <numerator> <denominator> <minimum> <maximum>` | Carried numerator/denominator quantity lies inside the requested range. A zero denominator is unknown. |
| `total-items <file> <minimum> <maximum>` | Total positive carried quantity is within an integer range. |
| `diversity <file> <minimum> <maximum>` | Number of distinct positive item names is within an integer range. |
| `inventory-records <file> <maximum>` | Number of positive recorded inventory entries does not exceed a maximum. |
| `food-reserve <file> <hunger>` | Supported carried food supplies at least this many hunger points before overfeeding losses. |
| `fresh <file> <seconds> <now>` | Saved age is between zero and a maximum, measured against explicit ISO UTC `now`. Future snapshots fail. |
| `saved-between <file> <earliest> <latest>` | Saved time lies inside the given ISO UTC interval. |
| `border-clearance <file> <blocks>` | Horizontal clearance from X/Z ±29,999,984 is at least the requested amount. |
| `chunk <file> <dimension> <x> <z>` | Player is in the given dimension and chunk indices; negative coordinates use floor division. |
| `section <file> <y>` | Player is in the specified vertical 16-block section (indices -4 to 20). |
| `inventory-quality <file>` | Inventory was explicitly recorded, names are supported Minecraft names, quantities are nonnegative safe integers, and totals retain safe precision. |
| `vitals-quality <file>` | Health is finite and nonnegative; hunger is an integer from 0 to 20. Provided invalid readings fail; missing readings are unknown. |

Inventory names are normalized with the optional `minecraft:` prefix and
duplicate records are summed. Zero-count records do not contribute to totals,
diversity, or allowlist violations. Missing inventory is unknown, even though
the general snapshot parser supports omitted inventory. Invalid quantities or
names make inventory-dependent predicates unknown and fail `inventory-quality`.
An explicit empty inventory is known to be empty.

Home distance needs both dimension identifiers. Unknown dimensions return
`null`; different known dimensions fail without calculating a distance. A
missing home cannot prove proximity. Border clearance uses the supported
coordinate limit, not a server's configurable world border. Chunk and section
checks are geometric and do not prove chunks are loaded.

Inventory records do not identify distinct occupied physical slots. Food
reserves use only the supported hunger table, ignore saturation and effects,
and can overestimate usable hunger when portions overfeed. A saved observation
may already be stale. Passing any check proves only its stated recorded
predicate; it does not prove current safety, reachability, collection, or task
success. No live acceptance gates change.
