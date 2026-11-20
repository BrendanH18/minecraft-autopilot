# Offline routine audits and edits

`mc-agent audit COMMAND routine.json ...` reads a regular JSON routine file
(up to 1 MiB), validates every action, and prints JSON. It never connects to
Minecraft, executes actions, or modifies the input file. Every step number is
one-based. Policies report `passes` and violations; a policy violation is a
report result, not a CLI failure.

These are static checks. A passing policy does not prove that a routine is safe
or executable. Inventory, terrain, saved home, action duration, backend support,
and execution failures are unknown. Generated actions require review before
using `mc-agent run`.

## Numbered inventory (25 additions)

| # | Command after `audit` | Result and limits |
| --- | --- | --- |
| 1 | `allowlist FILE TYPES...` | Actions outside the supplied action types. Types must be existing protocol types; provide 1–8 entries. |
| 2 | `collect-ceiling FILE COUNT` | Collection steps requesting more than COUNT (integer 1–64). |
| 3 | `wait-ceiling FILE SECONDS` | Waits longer than SECONDS (1–3600, decimals allowed). |
| 4 | `deposit-ceiling FILE COUNT` | Deposits exceeding COUNT (integer 1–2304), plus every deposit-all step because its count is unknown. |
| 5 | `travel-ceiling FILE DISTANCE` | Adjacent goto pairs whose straight-line distance exceeds DISTANCE (0–100000000). Initial travel, home, collection, and terrain are excluded. |
| 6 | `chunk-visits FILE` | Goto steps grouped by X/Z chunk, using floor division by 16, including negative coordinates. Repeated visits are retained. |
| 7 | `altitude-bands FILE HEIGHT` | Goto steps in zero-anchored, half-open Y bands of integer HEIGHT (1–768). Negative altitude uses floor division. |
| 8 | `collect-streaks FILE STEPS` | Consecutive collection streaks longer than STEPS (integer 1–100), including requested item totals. |
| 9 | `deposit-order FILE` | Each deposit and its latest earlier matching collection; absent earlier collection means initial stock or another source would be needed. Requested collection does not guarantee stock. |
| 10 | `home-overwrites FILE` | Each `set_home` after the first and the earlier routine definition it replaces, assuming successful execution. The first may also overwrite a pre-existing home. |
| 11 | `storage-check-gaps FILE` | Each deposit's preceding explicit `inspect_storage` step and intervening step count. This is an order report, not proof of current storage or backend refresh behavior. |
| 12 | `wait-budget FILE SECONDS` | Total explicit waits against a budget (0–360000), remaining allowance, and wait steps that exceed it. Other action time is excluded. |
| 13 | `item-spans FILE` | First/last step, use count, and inclusive span for each collect/deposit item. |
| 14 | `return-tail FILE` | Final `home` position, whether it ends the routine, and all trailing actions. A home action is only a requested return. |
| 15 | `execution-sections FILE SIZE` | Fixed-size sections (integer SIZE 1–100), with step bounds, waits, and requested collection totals. |
| 16 | `split-collect FILE COUNT` | Split each collection into quotas at most COUNT (integer 1–64), preserving requested totals and order. |
| 17 | `split-waits FILE SECONDS` | Divide each wait into equal waits no longer than SECONDS (1–3600). Reject output requiring waits below the protocol minimum of one second. |
| 18 | `split-deposits FILE COUNT` | Split explicit deposit quantities at COUNT (integer 1–2304). Deposit-all steps remain unchanged. |
| 19 | `merge-waits FILE` | Combine adjacent waits; totals over 3600 are divided evenly into valid durations. |
| 20 | `merge-collect FILE` | Combine consecutive collections of the same block, then split at 64 items. Other actions and block changes break the group. |
| 21 | `pause-before FILE TYPE SECONDS` | Insert a wait (1–3600 seconds) before every matching action type. |
| 22 | `checkpoint-after FILE TYPE` | Insert a `home` action after every matching action type. Requires a saved home when executed. |
| 23 | `repeat-step FILE STEP COUNT` | Replace STEP with COUNT copies (integer 1–100). COUNT includes the original occurrence. |
| 24 | `remove-range FILE FIRST LAST` | Remove an inclusive valid step range. Refuse an empty result. |
| 25 | `set-goto-height FILE Y` | Replace Y in every goto destination (−64 through 320, decimals allowed). Other actions remain unchanged. |

Action types are `goto`, `home`, `set_home`, `collect`, `eat`,
`inspect_storage`, `deposit`, `withdraw`, `craft`, and `wait`. Every transformed result is validated
again against the action protocol and the 1–100 action limit. Splitting,
merging, repetition, and checkpoint insertion can change backend behavior,
including per-action collection return or timeout behavior; equal requested
item totals do not imply identical execution outcomes. Editing coordinates does
not check terrain or dimension.

## Examples

```sh
mc-agent audit allowlist routine.json collect home deposit
mc-agent audit deposit-ceiling routine.json 64
mc-agent audit wait-budget routine.json 120
mc-agent audit chunk-visits routine.json
mc-agent audit split-collect routine.json 16 > smaller-quotas.json
mc-agent audit checkpoint-after routine.json collect > return-between-collections.json
mc-agent audit remove-range routine.json 3 5 > shortened.json
```

Use a different output path from the input. Shell redirection to the same path
can truncate the file before the command reads it.
