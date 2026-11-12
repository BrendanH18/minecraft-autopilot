# Logistics reports

`mc-agent logistics COMMAND` reads one connected observation and prints JSON.
It does not acquire control, open containers, withdraw, deposit, or execute a plan.
Storage reports mark `contents: "last_observed"`, report backend support and the
number of unopened containers, and deduplicate repeated container coordinates.
Unopened containers are unknown, never counted as empty stock.

Manifest arguments use `item=count`, for example `oak_log=64 torch=16`.
Use 1–100 distinct item names with integer quantities from 0 to 1,000,000;
at least one quantity must be positive. Unqualified names mean `minecraft:`.
Bundles are complete repetitions of a manifest, limited by the scarcest item.
Zero requirements do not limit bundle counts. Scalar quantities are integers
from 0 to 1,000,000 unless a command lists a narrower range.

| # | Command | Result |
| --- | --- | --- |
| 1 | `carried-bundles <entries...>` | Complete manifest bundles carried, with the limiting item names. |
| 2 | `pooled-bundles <entries...>` | Complete bundles available across carried and observed stored stock. |
| 3 | `bundle-shortage <bundles> <entries...>` | Required and missing quantities for 1–1,000,000 bundles, using pooled stock. |
| 4 | `split-manifest <loads> <entries...>` | Divide each manifest quantity evenly among 1–100 loads, distributing remainders to earlier loads. Empty loads are preserved; capacity is not checked. |
| 5 | `restock-stops <entries...>` | Combine withdrawals needed to reach a carried kit into nearest-first container stops. Skip containers that supply nothing still needed and report remaining shortfalls. Distance is from the player, not a solved travel route. |
| 6 | `balance-item <item>` | Per-container target and signed change for an even distribution among all opened containers. Earlier observations get any remainder; no transfer is executed. |
| 7 | `fewest-sources <item> <count>` | Allocate a positive withdrawal from richest containers first, minimizing source count. Break equal-quantity ties by distance. |
| 8 | `retain-percent <percent>` | Keep a rounded-up 0–100 percent of each carried item and calculate deposits of the rest. |
| 9 | `withdraw-percent <percent>` | Withdraw a rounded-down 0–100 percent of each item from each opened container. |
| 10 | `stack-topups` | Allocate observed stored stock to existing partial carried stacks in observation order, without reusing stock. Report room left after each proposed top-up. |
| 11 | `slot-map` | All 36 main inventory slot indices (0–35; Mineflayer window slots 36–44 map to hotbar 0–8), each slot's observed stacks, and observations with missing or out-of-range slot indices. |
| 12 | `full-stacks` | Carried stacks exactly at their estimated stack limit. |
| 13 | `stack-remainders` | Full-stack count and final remainder after consolidating each carried item by name. |
| 14 | `stack-size-groups` | Carried items, quantities, and current occupied stack counts grouped by estimated limits of 1, 16, or 64. |
| 15 | `container-loads` | Opened containers ranked by `minimumStacksEstimate` from per-item totals, with quantity and distance. Physical `occupiedStacks` is null: backends aggregate stacks by item name. |
| 16 | `storage-redundancy <copies>` | Stored item types held in fewer than 1–100 observed source containers. Items absent everywhere cannot appear in this report. |
| 17 | `exclusive-stock` | Stored item types held in exactly one observed source container, including its coordinates. |
| 18 | `container-overlap` | Shared item names for every pair of opened containers, including pairs sharing nothing. Limited to 200 opened containers. |
| 19 | `storage-fragmentation` | Per-item and total `minimumPotentiallyFreedEstimate` comparing per-container minimum stack estimates with `pooledStacksEstimate`. Physical `occupiedStacks` and actual `potentiallyFreed` are null. Estimates ignore item components and restrictions; they are not guaranteed savings. |
| 20 | `freshness-summary <seconds>` | Count fresh, stale, future-dated, and untimed opened observations at a 0–1,000,000 second threshold. Exactly at the threshold is stale. |
| 21 | `untimed-storage` | Opened containers without a finite observation timestamp. |
| 22 | `observation-window` | Oldest and newest finite opened-container timestamps and the elapsed seconds between them; null when none are known. |
| 23 | `kit-containers <entries...>` | Opened containers that individually supply at least one complete manifest bundle. |
| 24 | `storage-stack-sizes` | Stored items and quantities grouped by estimated stack limits of 1, 16, or 64. |
| 25 | `source-distances <item>` | Nearest, farthest, and quantity-weighted straight-line distances for known sources of an item. Distances are null without known stock. |

Examples:

```sh
mc-agent logistics carried-bundles oak_log=16 torch=8
mc-agent logistics bundle-shortage 3 oak_log=64 bread=4
mc-agent logistics restock-stops oak_log=128 torch=64 bread=16
mc-agent logistics split-manifest 3 oak_log=128 torch=32
mc-agent logistics balance-item oak_log
mc-agent logistics fewest-sources oak_log 96
mc-agent logistics freshness-summary 120
```

Every report includes a caution: observations may be stale or incomplete; item
components and stack restrictions may prevent merging; container capacity,
terrain, hazards, and reachability are not checked. A balance plan can propose
putting items in a container without room, and a manifest load can exceed player
capacity. These are explicit planning estimates, not promised executable actions.
No report establishes packaged Fabric or authenticated-handoff acceptance.
