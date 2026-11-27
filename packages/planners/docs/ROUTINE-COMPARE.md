# Compare routine revisions

`mc-agent compare-routines COMMAND before.json after.json` compares two validated
routine files without connecting to Minecraft, executing actions, or changing files.
Use `--json` for machine-readable output. Both files use the existing routine
format: an array or `{ "actions": [...] }`, with 1–100 protocol-valid actions,
at most 1 MiB each. Item identifiers are normalized before comparison.

Each command below is a separate addition. All take `<before> <after>`; `budget`
also takes three ceilings after those filenames. Step numbers start at 1.

| # | Command | Result |
| --- | --- | --- |
| 1 | `aligned` | Unequal actions at the same absolute step, including missing trailing steps as `null`. |
| 2 | `prefix` | Longest identical starting sequence and its length. |
| 3 | `suffix` | Longest identical ending sequence, with start steps in both files. |
| 4 | `lcs` | One longest identical subsequence with source/destination step pairs. |
| 5 | `edit-script` | Retained subsequence, removed source steps, and inserted destination steps. |
| 6 | `type-counts` | Before/after counts and changes for each action type. |
| 7 | `collection-delta` | Changes in requested collection totals per item. |
| 8 | `deposit-delta` | Changes in explicit deposit totals and separate deposit-all occurrence counts. |
| 9 | `wait-delta` | Changes in total explicit wait time and longest wait. |
| 10 | `destination-pairs` | Goto destinations paired by occurrence, with vector and straight-line displacement. |
| 11 | `type-sequence` | Action-type order comparison independent of parameters. |
| 12 | `added-actions` | Additional exact action multiplicities, ignoring order. |
| 13 | `removed-actions` | Removed exact action multiplicities, ignoring order. |
| 14 | `shared-actions` | Common exact action multiplicities, ignoring order. |
| 15 | `changed-fields` | Field changes at aligned steps with the same action type. |
| 16 | `first-divergence` | Earliest positional change, or `null` for identical routines. |
| 17 | `last-divergence` | Latest positional change, or `null` for identical routines. |
| 18 | `step-ratio` | Before/after step counts, their difference, and after/before ratio. |
| 19 | `item-set` | Added, removed, and shared mentioned item identities. |
| 20 | `transition-delta` | Changes in occurrence counts for adjacent action-type pairs. |
| 21 | `chunk-set` | Added, removed, and shared X/Z chunks containing requested destinations. |
| 22 | `altitude-envelope` | Minimum/maximum goto Y in each file; `null` where there is no goto. |
| 23 | `home-policy` | Home definitions and home requests before the first definition. |
| 24 | `inspection-policy` | Inspection counts and deposits before the first inspection. |
| 25 | `budget <extra-steps> <extra-wait> <extra-collect>` | Whether increases fit explicit ceilings; negative changes satisfy nonnegative ceilings. |

Examples:

```sh
npm start -- --json compare-routines edit-script original.json revised.json
npm start -- compare-routines destination-pairs original.json revised.json
npm start -- compare-routines budget original.json revised.json 5 30 16
```

The subsequence algorithm preserves order. If several longest matches exist,
it deterministically skips a source step when the two alternatives tie. The
edit script is an explanation using original step coordinates, not an executable
patch. Prefix and suffix are independent reports and may overlap.

Comparison uses requested actions, not observed gameplay. Collection and deposit
requests can fail; deposit-all quantities, initial inventory, dimensions, terrain,
and action durations are unknown. A zero explicit deposit total alongside a
positive deposit-all count is not evidence that zero items will be deposited.
Paired destinations are ordinal matches, not proof that two waypoints refer to the
same place or dimension. Storage inspections and home definitions are static
ordering evidence only. A passing budget reports only those three arithmetic
ceilings and does not certify safety or task completion.
