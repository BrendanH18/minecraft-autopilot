# Supplies reports

`mc-agent supplies` adds 25 read-only reports. Each command uses one bridge
observation, takes no control lease, and performs no item movement. Run the
usual `demo` bridge or attach a running backend first. Outputs are JSON; the
root `--json` option also makes failures machine-readable.

Examples:

```sh
mc-agent supplies need oak_log 64
mc-agent supplies deposit-plan oak_log 16
mc-agent supplies storage-richest oak_log
mc-agent supplies meal 20
```

Inventory reports describe the backend's carried inventory, which may exclude
equipped armor and offhand items. Storage reports deduplicate coordinates and
use the most recent opened record, matching existing storage reports. Stored
counts are last observed, may be stale, and exclude unopened or unreported
containers. They are planning evidence, not fresh storage verification.

Stack estimates reuse the existing item-name stack table. Unknown sizes are
flagged with `stackSizeAssumed`; components, enchantments, and other restrictions
can prevent merging. Capacity and consolidation estimates are not promises
that a transfer will fit.

1. `overview` combines inventory totals, distinct item count, and slot occupancy.
2. `ranked [limit]` sorts carried items by descending count, breaking ties by
   name; the default limit is 10.
3. `matching <text>` searches carried names by a lowercase substring.
4. `stacks <item>` shows every occupied slot and count for the requested item.
5. `need <item> <count>` computes a carried quota shortage and whether it is met.
6. `reserve <item> <count>` computes surplus above a reserve and any reserve
   shortfall. A zero reserve is accepted.
7. `capacity <item> <count>` estimates room for an additional quantity and its
   overflow beyond empty slots and matching partial stacks.
8. `packing <item> <count>` estimates the stacks and final stack size needed
   for a planned quantity.
9. `tools` lists carried tools and weapons by name; it does not infer durability.
10. `armor` lists carried armor and elytra; it does not infer equipped slots.
11. `food-ranked` orders supported foods by hunger points restored per item.
12. `meal <target>` compares one serving of each supported food against a hunger
    target of 1–20, showing whether it reaches the target and wasted hunger.
    Foods reaching the target appear first, then less waste. Saturation and
    effects are not modeled; unavailable hunger is explicit.
13. `collectables` filters carried logs, dirt, sand, and cobblestone for planning
    existing collection actions. Observing an item does not imply nearby blocks.
14. `deposit-plan <item> <keep>` computes how many carried items can be deposited
    while retaining a reserve. `keep` can be zero. No action runs, and container
    capacity and reachability are not checked.
15. `storage-health` counts known, opened, unopened, and observed-empty containers.
16. `storage-matching <text>` searches aggregated last-observed stored item names.
17. `storage-need <item> <count>` computes a quota shortage using carried items
    plus known stored items. `observedQuotaMet` is based on possibly stale data.
18. `storage-richest <item>` ranks containers by observed quantity, with distance
    breaking ties, to help choose a source.
19. `storage-empty` locates containers last observed empty, nearest first.
20. `storage-unopened` locates containers with unknown contents, nearest first.
21. `storage-spread <item>` reports container count, total quantity, and the
    fraction held in the richest container. An absent item has a null share.
22. `compare <first> <second>` compares carried quantities, their difference,
    and their ratio. A zero denominator gives a null ratio.
23. `nonstackable` lists items whose estimated maximum stack is one.
24. `partial-stacks` locates stacks below the estimated maximum and their
    remaining room.
25. `consolidation` estimates minimum slots per item name and potentially freed
    slots if matching stacks could be merged; it does not rearrange anything.

Item arguments accept `oak_log` or `minecraft:oak_log`. Quantities and limits
are whole numbers from 1 to 1,000,000 unless a zero reserve is documented above.
Search text accepts 1–100 lowercase letters, digits, underscores, or colons.
All reports reject disconnected observations.
