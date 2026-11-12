# Inventory comparison ledger

The 25 `ledger` commands compare two saved observations offline. They do not
connect to Minecraft or Ollama, acquire control, change files, or execute actions.
Use snapshots written by `mc-agent snapshot FILE`. The second save time must be
strictly later. Both inputs must be regular JSON files of at most 10 MiB.

Missing inventory produces `known: false` and null measurements. Explicit empty
inventory is known zero. Invalid names, negative/fractional quantities, and
ambiguous kit entries are rejected. Up to 1,000 item records and one billion total
items per inventory are supported; the bound preserves exact aggregate arithmetic.
Repeated short and namespaced names are normalized and aggregated.

Every signature below follows `mc-agent --json ledger`:

1. `item-percent <before> <after> <item>` — Report percent quantity change; a zero baseline has no percentage.
2. `composition-shift <before> <after>` — Compare item shares of each inventory total.
3. `new-types <before> <after>` — Find item types newly present in carried stock.
4. `vanished-types <before> <after>` — Find previously carried types absent from the later inventory.
5. `retained-stock <before> <after>` — Calculate quantity shared by both recorded inventories.
6. `replacement-load <before> <after>` — Measure unmatched outgoing and incoming quantities.
7. `quota-progress <before> <after> <item> <target>` — Compare the remaining shortfall to one carried quota.
8. `quota-crossings <before> <after> <entries...>` — Find item quotas crossed upward or downward.
9. `kit-regressions <before> <after> <entries...>` — Find kit shortfalls that grew.
10. `kit-progress <before> <after> <entries...>` — Compare total capped progress toward a kit.
11. `kit-bundles <before> <after> <entries...>` — Compare complete kit bundle counts.
12. `food-change <before> <after>` — Compare supported carried hunger reserves.
13. `food-mix <before> <after>` — Compare hunger contribution shares by food type.
14. `ration-change <before> <after> <hunger-per-day>` — Compare estimated ration days at an explicit hunger demand.
15. `minimum-stacks <before> <after>` — Compare minimum consolidated stack estimates.
16. `item-stacks <before> <after> <item>` — Compare consolidated full and partial stacks for one item.
17. `stack-pressure <before> <after> <slot-budget>` — Compare minimum-stack pressure against a slot budget.
18. `packing-room <before> <after> <item> <reserved-slots>` — Compare theoretical additional capacity after consolidation and reserved slots.
19. `loss-budget <before> <after> <entries...>` — Check observed item losses against per-item budgets.
20. `gain-budget <before> <after> <entries...>` — Check observed item gains against per-item ceilings.
21. `allowed-losses <before> <after> <items...>` — Find losses outside an explicit item allowlist.
22. `unchanged-except <before> <after> <items...>` — Find quantity changes outside explicitly permitted item types.
23. `share-shift <before> <after> <item>` — Measure one item share change in percentage points.
24. `type-similarity <before> <after>` — Measure Jaccard similarity of carried item-type sets.
25. `quantity-similarity <before> <after>` — Measure weighted Jaccard similarity using item quantities.

`entries...` means one or more unique `item=count` values (maximum 100), with
integer quotas from zero to 1,000,000. `items...` is an explicit allowlist of
1–100 names. Percent changes with a zero baseline and shares of an empty inventory
are null. Similarity of two explicitly empty inventories is defined as one.

`kit-progress` sums quantities capped at each quota; it does not let excess
bread compensate for missing logs. `kit-bundles` needs a positive quota and
ignores zero quotas. Budget checks evaluate only the named items; use
`allowed-losses` or `unchanged-except` to inspect other types.

Stack calculations consolidate by item name, use the existing estimated vanilla
stack limits, and ignore components and restrictions. `packing-room` reserves
0–36 completely empty slots; it returns null when the consolidated stock plus
the reservation cannot fit. It is theoretical capacity, not actual slot occupancy.
Food calculations use the supported hunger table, ignoring saturation, harmful
foods, and effects. Net changes never prove why an item appeared or disappeared.

Examples:

`mc-agent --json ledger quota-progress before.json after.json oak_log 64`

`mc-agent --json ledger loss-budget before.json after.json bread=2 torch=4`

`mc-agent --json ledger packing-room before.json after.json dirt 4`
