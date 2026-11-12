# Explicit trade budgets

Offline exchange arithmetic using caller-supplied prices, stock, limits, and restock assumptions. No live offer, villager discount, demand, availability, or currency value is inferred.

Run `mc-agent tradeplan COMMAND --help` for positional arguments. All values must be finite, nonnegative, and at most 1,000,000. Counts marked as whole quantities reject fractions; positive divisors and rates reject zero. Fractions use 0 to 1, rather than percentages. Comma-separated lists contain 1 to 1000 values, in positional item order; paired lists must match. Results outside the safe numeric range fail.

| Command | Meaning | Input kinds in argument order |
| --- | --- | --- |
| `buy <wanted> <yield-per-trade> <cost-per-trade>` | Round desired purchased output to whole exchanges. | whole ≥0, whole >0, whole >0 |
| `sell <stock> <input-per-trade> <payout>` | Sell complete input lots while retaining unusable remainder. | whole ≥0, whole >0, whole >0 |
| `budget <currency> <cost-per-trade> <yield-per-trade>` | Bound output purchases by a whole-currency budget. | whole ≥0, whole >0, whole >0 |
| `limited <wanted-trades> <remaining-uses> <cost-per-trade> <yield>` | Apply a supplied remaining-use cap to intended trades. | whole ≥0, whole ≥0, whole >0, whole >0 |
| `restocks <wanted-trades> <initial-uses> <uses-per-restock>` | Compute additional supplied-capacity restocks for a trade target. | whole ≥0, whole ≥0, whole >0 |
| `restock-time <wanted-trades> <initial-uses> <uses-per-restock> <restock-minutes>` | Estimate waiting time assuming evenly available restocks. | whole ≥0, whole ≥0, whole >0, number >0 |
| `price-change <trades> <old-price> <new-price>` | Compare total whole-currency costs across supplied prices. | whole ≥0, whole >0, whole >0 |
| `unit-price <cost-per-trade> <yield-per-trade>` | Express supplied exchange cost per output unit. | number >0, number >0 |
| `compare-offers <wanted> <prices> <yields>` | Compare rounded target purchase costs across separate offers. | whole ≥0, whole-count list, whole-count list |
| `round-trip <input-cost> <first-yield> <second-input> <second-yield>` | Evaluate a single first exchange followed by as many complete second exchanges as possible. | whole >0, whole >0, whole >0, whole >0 |
| `fund-target <target-cost> <sale-input> <sale-payout>` | Budget complete sale exchanges to fund a purchase cost. | whole ≥0, whole >0, whole >0 |
| `net-currency <sales> <sale-payout> <purchases> <purchase-cost>` | Reconcile currency earned and spent in two explicit exchange flows. | whole ≥0, whole >0, whole ≥0, whole >0 |
| `commission <gross> <fee-fraction> <flat-fee>` | Apply a supplied fractional and flat exchange fee. | number ≥0, fraction 0–1, number ≥0 |
| `price-ceiling <currency> <wanted-trades>` | Compute the largest whole-unit price that fits a trade count. | whole ≥0, whole >0 |
| `stock-limit <currency> <price> <stock-trades> <yield>` | Apply budget and supplier stock limits jointly. | whole ≥0, whole >0, whole ≥0, whole >0 |
| `parallel-sellers <wanted-trades> <uses-each> <sellers>` | Allocate one simultaneous round over equally supplied sellers. | whole ≥0, whole >0, whole >0 |
| `progressive-cost <trades> <starting-price> <increase-per-trade>` | Sum an explicitly assumed arithmetic price progression. | whole ≥0, whole >0, whole ≥0 |
| `progressive-buy <budget> <starting-price> <increase-per-trade>` | Find maximum complete exchanges in an arithmetic price progression. | whole ≥0, whole >0, whole ≥0 |
| `quota-basket <quantities> <yields> <prices>` | Budget independent rounded purchases for a mixed-item basket. | whole-count list, whole-count list, whole-count list |
| `priority-basket <quantities> <yields> <prices> <budget>` | Buy whole required exchanges in item priority order under a shared budget. | whole-count list, whole-count list, whole-count list, whole ≥0 |
| `reserve-budget <currency> <reserve> <price> <yield>` | Hold currency reserve before buying whole exchanges. | whole ≥0, whole ≥0, whole >0, whole >0 |
| `trade-time <trades> <seconds-each> <travel-seconds>` | Estimate exchange time with a one-time travel allowance. | whole ≥0, number >0, number ≥0 |
| `throughput <uses> <restock-minutes> <yield>` | Estimate sustained output per minute from supplied restock assumptions. | whole >0, number >0, whole >0 |
| `change-loss <currency> <price>` | Measure currency unusable for another whole exchange at a given price. | whole ≥0, whole >0 |
| `sell-keep <stock> <reserve> <input-per-trade> <payout>` | Sell only complete lots beyond a held input reserve. | whole ≥0, whole ≥0, whole >0, whole >0 |

Examples:

```sh
mc-agent tradeplan buy 17 4 3
mc-agent tradeplan sell 17 3 2
mc-agent tradeplan budget 17 3 4
```

These calculations do not read inventory, acquire control, or execute a routine. They do not infer recipes, prices, fuel properties, stack sizes, or world conditions. Review assumptions before acting.
