# Stock and kit planning

`mc-agent stock` reads one observation without acquiring control, opening storage,
or moving items. It works with demo, Fabric, or bot observations. Storage contents
are last observed and can be stale; unopened and unreported containers do not
contribute. A missing stored item means absent from the observation, not absent
from the world. `supported` distinguishes unavailable container reporting.

Kit arguments use `item=count`, for example:

```sh
mc-agent stock kit-check torch=32 bread=8 oak_log=64
mc-agent stock kit-restock torch=32 bread=8
mc-agent stock kit-capacity oak_log=128 iron_pickaxe=1
mc-agent stock source-plan oak_log 64
```

Quantities are whole numbers from 0 through 1,000,000, with at most 100 distinct
kit entries. Names accept the optional `minecraft:` prefix. Duplicate kit names
are rejected. Commands requiring a positive count reject zero. Decimal rates,
factors, radii, and fill percentages are accepted in plain decimal notation.
All results are JSON.

The 25 commands are:

1. `kit-check <entries...>` reports each carried quota, shortage, and whether the entire kit is satisfied.
2. `kit-restock <entries...>` allocates withdrawals from nearest known containers to fill carried shortages; reports unmet remainder.
3. `kit-deposit <entries...>` retains a named kit and plans deposits of all surplus inventory, including unnamed items.
4. `kit-capacity <entries...>` treats quantities as **additional items**, consumes matching partial stack room, and shares remaining inventory slots across the manifest.
5. `kit-trips <entries...>` calculates estimated packed slots and the number of trips with an empty 36-slot inventory; excludes food/tool reserves and travel.
6. `kit-scale <factor> <entries...>` scales every quantity, rounding up; rejects scaled quantities above the quota limit.
7. `composition` reports each item total as a share of all carried item units.
8. `slot-pressure` ranks items by observed occupied stacks and their fraction of all occupied stacks.
9. `stack-histogram` counts occupied stacks grouped by current stack quantity.
10. `least-stocked <limit>` lists the smallest carried item totals, using names to break ties.
11. `count-range <minimum> <maximum>` finds carried item totals in the inclusive quantity range.
12. `only <items...>` selects exact item names, useful for a planned material list.
13. `exclude <items...>` removes exact item names from an inventory report.
14. `families` groups carried quantities by the last underscore-separated name component, such as `log`; this is name grouping, not crafting knowledge.
15. `food-portions <hunger>` estimates complete hunger budgets covered by supported carried food.
16. `food-duration <hunger-per-hour>` estimates hours of food at the supplied consumption rate.
17. `storage-only` finds observed stored item types absent from carried inventory.
18. `carried-only` finds carried item types absent from observed storage.
19. `shared-stock` finds item types present in both inventory and observed storage.
20. `storage-balance` reports carried/stored quantities and the carried share of each combined item total.
21. `container-diversity` ranks opened containers by distinct item types, then distance.
22. `storage-within <radius>` totals known stored contents within an inclusive straight-line radius of the player.
23. `storage-older <seconds>` lists opened containers whose content observations are at least that age or have no timestamp; age is `null` when unknown. Future timestamps are excluded.
24. `source-plan <item> <count>` allocates a positive requested quantity across nearest known containers and reports the unsourced remainder.
25. `stack-fill <percent>` selects carried stacks at or below a percentage of their estimated maximum capacity.

Packing estimates use the existing item-name stack-size table. Components,
enchantments, equipment slots, backend slot conventions, and other restrictions
can make estimates inaccurate. No report guarantees that withdrawals, deposits,
or travel can execute. Food estimates use the supported hunger-value table;
saturation, effects, and hunger wasted by overfeeding are not modeled.
