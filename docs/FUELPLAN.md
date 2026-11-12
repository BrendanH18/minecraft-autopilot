# Explicit smelting budgets

Offline smelting arithmetic from supplied burn times, item times, furnace counts, and costs. No fuel table, recipe, game tick rate, or actual furnace scheduling is inferred.

Run `mc-agent fuelplan COMMAND --help` for positional arguments. All values must be finite, nonnegative, and at most 1,000,000. Counts marked as whole quantities reject fractions; positive divisors and rates reject zero. Fractions use 0 to 1, rather than percentages. Comma-separated lists contain 1 to 1000 values, in positional item order; paired lists must match. Results outside the safe numeric range fail.

| Command | Meaning | Input kinds in argument order |
| --- | --- | --- |
| `fuel-count <items> <item-seconds> <fuel-seconds>` | Budget whole fuel items for one continuous furnace run. | whole ≥0, number >0, number >0 |
| `capacity <fuel-items> <fuel-seconds> <item-seconds>` | Count complete items supported by one continuous burn budget. | whole ≥0, number >0, number >0 |
| `furnace-split <items> <furnaces> <item-seconds> <fuel-seconds>` | Split items evenly and round fuel independently per furnace. | whole ≥0, whole >0, number >0, number >0 |
| `continuous-vs-split <items> <runs> <item-seconds> <fuel-seconds>` | Compare fuel rounding for balanced isolated runs and continuous burn. | whole ≥0, whole >0, number >0, number >0 |
| `burn-credit <items> <item-seconds> <remaining-burn> <fuel-seconds>` | Apply existing usable burn time before adding new fuel. | whole ≥0, number >0, number ≥0, number >0 |
| `fuel-cost <items> <item-seconds> <fuel-seconds> <cost-per-fuel>` | Price a whole-fuel continuous run with supplied unit costs. | whole ≥0, number >0, number >0, number ≥0 |
| `compare <items> <item-seconds> <burn-times> <unit-costs>` | Compare whole-fuel options for one continuous run. | whole ≥0, number >0, number >0 list, number ≥0 list |
| `efficiency <used-burn-seconds> <supplied-burn-seconds>` | Measure fraction of supplied burn time put to use. | number ≥0, number >0 |
| `finish-time <items> <furnaces> <item-seconds> <startup-seconds>` | Include per-furnace startup before balanced whole-item waves. | whole ≥0, whole >0, number >0, number ≥0 |
| `deadline-furnaces <items> <item-seconds> <deadline-seconds>` | Compute furnaces required for complete items by a deadline. | whole ≥0, number >0, number >0 |
| `feed-rate <furnaces> <item-seconds>` | Estimate ideal item and ingredient feed rate. | whole >0, number >0 |
| `fuel-rate <furnaces> <fuel-seconds>` | Estimate sustained whole fuel demand as a fractional rate. | whole >0, number >0 |
| `stock-duration <fuel-stock> <fuel-seconds> <furnaces>` | Divide aggregate fuel time equally across continuously active furnaces. | whole ≥0, number >0, whole >0 |
| `reserve <items> <item-seconds> <fuel-seconds> <reserve-fuel>` | Add held whole fuel reserve to the operational budget. | whole ≥0, number >0, number >0, whole ≥0 |
| `refill <fuel-stock> <target-items> <item-seconds> <fuel-seconds>` | Compute extra fuel needed after using supplied fuel stock. | whole ≥0, whole ≥0, number >0, number >0 |
| `mixed-burn <fuel-counts> <burn-times> <item-seconds>` | Combine supplied fuel types into one continuous burn budget. | whole-count list, number >0 list, number >0 |
| `substitute <old-count> <old-burn> <new-burn>` | Replace an aggregate burn budget with whole units of another fuel. | whole ≥0, number >0, number >0 |
| `restart-loss <runs> <lost-seconds-per-run> <fuel-seconds>` | Express caller-estimated restart burn loss in whole fuel units. | whole ≥0, number ≥0, number >0 |
| `preheat <idle-seconds> <fuel-seconds> <furnaces>` | Budget fuel consumed by a supplied idle preheat interval. | number ≥0, number >0, whole >0 |
| `loading-window <input-buffer> <furnaces> <item-seconds>` | Estimate when a shared input buffer empties at ideal continuous throughput. | whole ≥0, whole >0, number >0 |
| `output-buffer <slots> <stack-size> <furnaces> <item-seconds>` | Estimate shared empty output capacity and fill time at ideal throughput. | whole ≥0, whole >0, whole >0, number >0 |
| `collect-interval <capacity> <existing> <items-per-minute>` | Estimate remaining time before a shared output capacity is reached. | whole ≥0, whole ≥0, number >0 |
| `throughput-cap <input-per-minute> <output-per-minute> <furnaces> <item-seconds>` | Bound smelting throughput by input, output, and ideal furnace capacity. | number ≥0, number ≥0, whole >0, number >0 |
| `batch-checkpoints <items> <every-items> <item-seconds>` | List bounded single-furnace completion checkpoints. | whole ≥0, whole >0, number >0 |
| `net-fuel <fuel-produced> <fuel-consumed> <burn-seconds>` | Account for whole fuel stock change and its equivalent burn time. | whole ≥0, whole ≥0, number >0 |

Examples:

```sh
mc-agent fuelplan fuel-count 10 10 80
mc-agent fuelplan capacity 2 80 10
mc-agent fuelplan furnace-split 10 3 10 80
```

These calculations do not read inventory, acquire control, or execute a routine. They do not infer recipes, prices, fuel properties, stack sizes, or world conditions. Review assumptions before acting.

Whole-count rounding normalizes small floating-point roundoff near nonzero integer boundaries. Genuine fractional shortages remain unmet; positive tiny demands still require a whole unit.
