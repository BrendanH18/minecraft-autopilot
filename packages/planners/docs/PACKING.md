# Stack and container packing

Offline packing estimates using explicit stack sizes and available slots. Item types in positional lists remain separate; no inventory or container compatibility is inferred.

Run `mc-agent packing COMMAND --help` for positional arguments. All values must be finite, nonnegative, and at most 1,000,000. Counts marked as whole quantities reject fractions; positive divisors and rates reject zero. Fractions use 0 to 1, rather than percentages. Comma-separated lists contain 1 to 1000 values, in positional item order; paired lists must match. Results outside the safe numeric range fail.

| Command | Meaning | Input kinds in argument order |
| --- | --- | --- |
| `merge <first> <second> <stack-size>` | Merge two same-item quantities and report freed occupied slots. | whole ≥0, whole ≥0, whole >0 |
| `fragmentation <counts> <stack-size>` | Compare separate same-item partial stacks with consolidated stacks. | whole-count list, whole >0 |
| `split <count> <piece-size>` | Divide a quantity into bounded pieces, retaining a final remainder. | whole ≥0, whole >0 |
| `headroom <counts> <stack-size>` | Sum unused space in supplied occupied same-item stacks. | whole-count list, whole >0 |
| `fill-partials <counts> <incoming> <stack-size>` | Fill partial same-item stacks from left to right before new slots. | whole-count list, whole ≥0, whole >0 |
| `transfer-limit <incoming> <partial-room> <free-slots> <stack-size>` | Bound an incoming transfer by known compatible capacity. | whole ≥0, whole ≥0, whole ≥0, whole >0 |
| `reserved-capacity <slots> <reserved> <stack-size>` | Compute item capacity after reserving empty slots. | whole ≥0, whole ≥0, whole >0 |
| `container-loads <count> <slots> <stack-size>` | Produce whole-container loads plus final partial load. | whole ≥0, whole >0, whole >0 |
| `container-balance <count> <containers> <stack-size>` | Distribute one item count evenly across containers and count slots. | whole ≥0, whole >0, whole >0 |
| `item-slots <counts> <stack-sizes>` | Count occupied slots separately for distinct item quantities. | whole-count list, whole-count list |
| `kit-copies <available> <per-kit>` | Compute complete mixed-item kit copies and remaining stock. | whole-count list, whole-count list |
| `kit-slots <per-kit> <copies> <stack-sizes>` | Count slots when identical kits may consolidate by item. | whole-count list, whole ≥0, whole-count list |
| `isolated-kits <per-kit> <copies> <stack-sizes>` | Count slots when each kit must stay separately packed. | whole-count list, whole ≥0, whole-count list |
| `repack <count> <old-stack-size> <new-stack-size>` | Measure occupied-slot change under a different supplied limit. | whole ≥0, whole >0, whole >0 |
| `bundle-overhead <count> <bundle-size> <wrapper-per-bundle>` | Count wrappers and packed units for whole packaging bundles. | whole ≥0, whole >0, whole ≥0 |
| `slot-waste <counts> <stack-sizes>` | Measure unused capacity in slots occupied by separate item types. | whole-count list, whole-count list |
| `compact-order <counts> <stack-sizes>` | Rank item types by reclaimable slots after removing that type. | whole-count list, whole-count list |
| `drain <counts> <requested>` | Remove from supplied same-item stacks left to right. | whole-count list, whole ≥0 |
| `swap-space <outgoing> <incoming> <stack-size>` | Compute net slot change replacing one whole item type with another. | whole ≥0, whole ≥0, whole >0 |
| `trip-remainder <count> <capacity> <completed-trips>` | Report stock remaining after complete capacity-sized trips. | whole ≥0, whole >0, whole ≥0 |
| `priority-load <counts> <stack-sizes> <slots>` | Pack separate item types in given priority order using full slots. | whole-count list, whole-count list, whole ≥0 |
| `minimum-slot-load <counts> <stack-sizes>` | Find the smallest indivisible whole-item load by occupied slots. | whole-count list, whole-count list |
| `reserve-stock <count> <reserve> <stack-size>` | Split held reserve from transferable stock with separate slot costs. | whole ≥0, whole ≥0, whole >0 |
| `stack-threshold <count> <stack-size>` | Report removal needed to free one slot and addition needed to occupy another. | whole ≥0, whole >0 |
| `parallel-carry <carriers> <slots-each> <stack-size> <count>` | Budget synchronized rounds across equally equipped carriers. | whole >0, whole >0, whole >0, whole ≥0 |

Examples:

```sh
mc-agent packing merge 40 20 64
mc-agent packing fragmentation 20,30,0,10 64
mc-agent packing split 10 4
```

These calculations do not read inventory, acquire control, or execute a routine. They do not infer recipes, prices, fuel properties, stack sizes, or world conditions. Review assumptions before acting.
