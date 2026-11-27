# routine-metrics

Measure the static structure of one protocol-valid routine containing 1 to 100 actions. These reports do not execute actions.

```sh
mc-agent routine-metrics type-entropy routine.json
mc-agent routine-metrics type-coverage routine.json collect deposit home
mc-agent routine-metrics step-cost routine.json collect=5,deposit=2,home=10,wait=1
```

Routine files accept an action array or `{ "actions": [...] }`. Type costs are nonnegative supplied estimates up to one billion per request; every used type must be supplied. They do not measure actual durations. Entropy uses base-2 bits. Step lags and spacing refer to source ordering, not time. Collection pressure tracks prefix requested collection minus explicit requested deposits with a zero lower bound on the reported peak; deposit-all makes that item’s peak unknown. Coverage deduplicates requested targets. Recurrence reports index differences; spacing reports intervening steps. Coordinate revisits compare exact goto coordinates without asserting reachability. Vertical reversals ignore zero rises. Empty numerical populations remain null.

| Command | Meaning |
| --- | --- |
| `type-entropy <file>` | Shannon entropy in bits of requested action types. |
| `type-concentration <file>` | Sum of squared action-type shares. |
| `switch-rate <file>` | Fraction of adjacent steps changing action type. |
| `transition-probabilities <file>` | Conditional next-type probabilities. |
| `trigrams <file>` | Counts of adjacent action-type triples. |
| `lag-pairs <file> <lag>` | Type-pair counts at an explicit step lag. |
| `type-recurrence <file> <type>` | Gaps in step numbers between repeated types. |
| `item-recurrence <file> <item>` | Gaps between any requests mentioning one item. |
| `prefix-diversity <file>` | Distinct action types encountered through each step. |
| `suffix-diversity <file>` | Distinct action types remaining from each step. |
| `wait-share <file>` | Explicit waits as a fraction of steps, not runtime. |
| `collection-concentration <file>` | Sum of squared shares of per-item requested collection quotas. |
| `deposit-uncertainty <file>` | Steps with deposit-all and their share of deposit requests. |
| `collection-pressure <file>` | Maximum prefix balance of collected, withdrawn, and crafted items minus explicit deposits; a deposit-all or withdraw-all makes subsequent balance unknown. |
| `wait-spacing <file>` | Number of intervening steps between waits. |
| `inspection-spacing <file>` | Number of intervening steps between storage inspections. |
| `return-spacing <file>` | Number of intervening steps between home returns. |
| `type-coverage <file> <types...>` | Share and missing members of an explicit action-type set. |
| `item-coverage <file> <items...>` | Share and missing members of an explicit item set. |
| `wait-quantiles <file>` | Minimum, median, and maximum explicit wait request durations. |
| `collect-quantiles <file>` | Minimum, median, and maximum collection quotas. |
| `deposit-quantiles <file>` | Minimum, median, and maximum explicit deposit counts; deposit-all excluded. |
| `goto-revisit <file>` | Occurrences returning to an earlier exact requested coordinate. |
| `vertical-reversals <file>` | Sign changes among nonzero Y differences of consecutive goto destinations. |
| `step-cost <file> <costs>` | Per-step and total supplied type=cost estimates; every used type required. |
