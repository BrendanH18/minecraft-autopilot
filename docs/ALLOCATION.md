# Multi-item allocation

Offline allocation using explicit positional demands, capacities, priorities, and weights. Reports are mathematical plans; no storage compatibility, item movement, or fairness policy is inferred.

Run `mc-agent allocation COMMAND --help` for positional arguments. All values must be finite, nonnegative, and at most 1,000,000. Counts marked as whole quantities reject fractions; positive divisors and rates reject zero. Fractions use 0 to 1, rather than percentages. Comma-separated lists contain 1 to 1000 values, in positional item order; paired lists must match. Results outside the safe numeric range fail.

| Command | Meaning | Input kinds in argument order |
| --- | --- | --- |
| `priority <demands> <budget>` | Fulfill continuous demands in original priority order. | number ≥0 list, number ≥0 |
| `proportional <demands> <budget>` | Scale all continuous demands by a shared fulfillment fraction. | number ≥0 list, number ≥0 |
| `weighted <weights> <budget>` | Split a continuous budget by positive caller-supplied weights. | number >0 list, number ≥0 |
| `equal-cap <demands> <budget>` | Water-fill continuous grants equally up to each demand cap. | number ≥0 list, number ≥0 |
| `minimum-first <minimums> <demands> <budget>` | Fund minima first, then distribute residual demand proportionally. | number ≥0 list, number ≥0 list, number ≥0 |
| `whole-jobs <costs> <budget>` | Admit indivisible jobs in source order, skipping jobs that do not fit. | number >0 list, number ≥0 |
| `cheapest-jobs <costs> <budget>` | Admit the maximum-count cheapest indivisible jobs with stable tie order. | number >0 list, number ≥0 |
| `value-order <costs> <values>` | Rank indivisible jobs by supplied value per unit cost. | number >0 list, number ≥0 list |
| `coverage <grants> <demands>` | Report per-item fulfillment ratios, leaving zero demand undefined. | number ≥0 list, number ≥0 list |
| `shortages <stocks> <demands>` | Compute independent item shortfalls and surpluses. | number ≥0 list, number ≥0 list |
| `reserve-items <stocks> <reserves>` | Separate per-item protected reserves from allocatable stock. | number ≥0 list, number ≥0 list |
| `cap-grants <requested> <caps>` | Apply independent per-item grant ceilings. | number ≥0 list, number ≥0 list |
| `kit-limit <stocks> <per-kit> <maximum-kits>` | Bound complete mixed-item kits by stock and an external cap. | whole-count list, whole-count list, whole ≥0 |
| `weighted-rounds <weights> <rounds>` | Budget discrete grants when each full round follows integer weights. | whole-count list, whole ≥0 |
| `round-limit <stock> <costs-per-round>` | Bound complete rounds that simultaneously fund every supplied job. | number ≥0, number >0 list |
| `reconcile <planned> <actual>` | Compare actual positional grants with their plan. | number ≥0 list, number ≥0 list |
| `rebalance <stocks> <targets>` | Report positional donor and receiver amounts without assuming interchangeability. | number ≥0 list, number ≥0 list |
| `shared-capacity <counts> <unit-sizes> <capacity>` | Scale an entire continuous load proportionally to one shared volume limit. | number ≥0 list, number >0 list, number ≥0 |
| `priority-capacity <counts> <unit-sizes> <capacity>` | Pack whole units in priority order against a continuous size limit. | whole-count list, number >0 list, number ≥0 |
| `workers <workloads> <workers>` | Allocate integer workers proportionally by largest remainder. | number ≥0 list, whole >0 |
| `capacity-gap <demands> <capacities>` | Compare per-item demand against separately available capacities. | number ≥0 list, number ≥0 list |
| `priority-floor <demands> <budget> <minimum-grant>` | Grant in order only when at least a minimum viable amount can be supplied. | number ≥0 list, number ≥0, number >0 |
| `budget-sensitivity <demands> <current-budget> <extra-budget>` | Measure additional common proportional fulfillment from a budget increase. | number ≥0 list, number ≥0, number ≥0 |
| `minimum-budget <demands> <minimum-coverage>` | Budget a common minimum fraction of every continuous demand. | number ≥0 list, fraction 0–1 |
| `funding-order <demands> <budget>` | Report cumulative funding milestones and the first incompletely funded item. | number ≥0 list, number ≥0 |

Examples:

```sh
mc-agent allocation priority 4,8,3 10
mc-agent allocation proportional 4,8,8 10
mc-agent allocation weighted 1,2,1 12
```

These calculations do not read inventory, acquire control, or execute a routine. They do not infer recipes, prices, fuel properties, stack sizes, or world conditions. Review assumptions before acting.
