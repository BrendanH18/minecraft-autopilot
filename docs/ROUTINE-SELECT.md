# Extract routine selections

`mc-agent select-routine COMMAND routine.json ARGS` prints a validated routine
selection, preserving original order. It works offline, never executes actions,
and never changes input files. Files use the existing routine format, with 1–100
valid actions and at most 1 MiB. Output is `{ "actions": [...] }`, suitable for
review and saving to a different file. Empty selections fail rather than emit an
invalid routine. Step and occurrence numbers start at 1.

Each signature below follows `mc-agent select-routine`.

| # | Command and arguments | Selection |
| --- | --- | --- |
| 1 | `item <file> <item>` | Collect/deposit requests mentioning the item. |
| 2 | `except-item <file> <item>` | All actions except requests mentioning the item. |
| 3 | `types <file> <types...>` | Actions matching any listed protocol action type. |
| 4 | `between-types <file> <start-type> <end-type>` | First start occurrence through first end occurrence at or after it, inclusive. |
| 5 | `before-match <file> <type> <occurrence>` | Prefix excluding the chosen matching occurrence. |
| 6 | `after-match <file> <type> <occurrence>` | Suffix excluding the chosen matching occurrence. |
| 7 | `match-context <file> <type> <before> <after>` | All matches and their neighboring step contexts; overlaps merge. |
| 8 | `nth-type <file> <type> <occurrence>` | One matching action. |
| 9 | `occurrences <file> <type> <first> <last>` | Only matching actions in an inclusive occurrence range. |
| 10 | `collect-range <file> <minimum> <maximum>` | Collection requests with quotas inside the inclusive range. |
| 11 | `deposit-range <file> <minimum> <maximum>` | Explicit deposits inside the inclusive count range; deposit-all is excluded. |
| 12 | `wait-range <file> <minimum> <maximum>` | Waits with durations inside the inclusive range. |
| 13 | `goto-box <file> <corner-a> <corner-b>` | Goto destinations inside an inclusive box; corner order is arbitrary. |
| 14 | `goto-sphere <file> <center> <radius>` | Goto destinations at or within a three-dimensional radius. |
| 15 | `goto-chunk <file> <chunk-x> <chunk-z>` | Goto destinations in one horizontal chunk, using floor division. |
| 16 | `goto-altitude <file> <minimum> <maximum>` | Goto destinations in an inclusive Y range. |
| 17 | `first-per-item <file>` | First collect and first deposit for each mentioned item. |
| 18 | `last-per-item <file>` | Last collect and last deposit for each mentioned item. |
| 19 | `every-nth <file> <start> <stride>` | Steps beginning at `start` and then every `stride` original steps. |
| 20 | `indices <file> <steps...>` | Distinct listed steps, emitted in original order rather than argument order. |
| 21 | `exclude-indices <file> <steps...>` | All steps except the distinct listed indices. |
| 22 | `home-section <file> <occurrence>` | Chosen set_home occurrence through the step before the next set_home, or the end. |
| 23 | `collection-cycle <file> <item> <occurrence>` | Chosen matching collection through its first subsequent matching deposit, including intervening steps. |
| 24 | `wait-window <file> <start-seconds> <end-seconds>` | Whole waits intersecting a half-open cumulative explicit-wait interval. |
| 25 | `dependency-window <file> <first> <last>` | Inclusive step range, expanded back to a preceding set_home if a selected home requires it. |

Examples:

```sh
npm start -- --json select-routine match-context work.json collect 1 2
npm start -- --json select-routine goto-box work.json -- -16,60,-16 16,80,16
npm start -- --json select-routine indices work.json 2 5 8 > selected.json
```

Points use `x,y,z` within the supported world bounds. Numeric ranges must be
ordered and finite. Occurrences, step indices, strides, and context sizes are
integers. Use `--` before negative positional values. Items accept short or
`minecraft:` names.

Selections can remove prerequisites or necessary travel, food, and inspection
steps. Protocol validity establishes action shape only. First/last-per-item
selection is a manual review aid; repeated requests may be intentional. A
collection cycle may include other collections or intervening work and is not
proof that a deposit contains only that collection's yield. The wait window
counts explicit waits only, excluding every action's execution time; it keeps
entire overlapping waits without truncating them.

`dependency-window` expands contiguously only for a selected home whose nearest
preceding definition lies before the requested range. It keeps intervening
actions, does not invent a missing definition, and does not resolve dimensions,
runtime failures, or other dependencies. Review generated JSON before execution.
