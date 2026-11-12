# Explicit production ratios

Offline production arithmetic from caller-supplied recipe inputs, yields, and rates. No Minecraft recipe, crafting ability, or machine behavior is assumed.

Run `mc-agent production COMMAND --help` for positional arguments. All values must be finite, nonnegative, and at most 1,000,000. Counts marked as whole quantities reject fractions; positive divisors and rates reject zero. Fractions use 0 to 1, rather than percentages. Comma-separated lists contain 1 to 1000 values, in positional item order; paired lists must match. Results outside the safe numeric range fail.

| Command | Meaning | Input kinds in argument order |
| --- | --- | --- |
| `recipe <wanted> <yield> <input-per-batch>` | Round output demand to whole recipe batches. | whole ≥0, whole >0, whole >0 |
| `stock-batches <stock> <input-per-batch> <yield>` | Limit complete recipe batches by one input stock. | whole ≥0, whole >0, whole >0 |
| `bottleneck <stocks> <per-batch>` | Limit production by multiple independently consumed inputs. | whole-count list, whole-count list |
| `shortfall <wanted> <yield> <stocks> <per-batch>` | Compute additional input quantities for a target output. | whole ≥0, whole >0, whole-count list, whole-count list |
| `chain <wanted-final> <first-yield> <second-input> <second-yield>` | Budget two recipe stages with a unit raw input per first batch. | whole ≥0, whole >0, whole >0, whole >0 |
| `byproduct <batches> <main-yield> <byproduct-yield>` | Calculate paired main and byproduct quantities. | whole ≥0, whole >0, whole ≥0 |
| `recycle <initial> <recovery-fraction> <passes>` | Estimate repeated fractional recycling for a bounded number of passes. | number ≥0, fraction 0–1, whole ≥0 |
| `cycle-time <batches> <seconds-per-batch> <machines>` | Estimate synchronized identical machines processing whole batches. | whole ≥0, number >0, whole >0 |
| `rate <yield> <seconds-per-batch> <machines>` | Calculate ideal sustained output rate for supplied machine behavior. | whole >0, number >0, whole >0 |
| `deadline <batches> <seconds-per-batch> <seconds-available>` | Find machines needed to meet a whole-batch deadline. | whole ≥0, number >0, number >0 |
| `batch-cap <wanted> <yield> <maximum-batches>` | Report fulfillment under a hard batch cap. | whole ≥0, whole >0, whole ≥0 |
| `startup <batches> <startup-seconds> <batch-seconds>` | Add one startup cost only when production is nonempty. | whole ≥0, number ≥0, number >0 |
| `setup-runs <batches> <run-capacity> <setup-seconds> <batch-seconds>` | Include setup once per bounded production run. | whole ≥0, whole >0, number ≥0, number >0 |
| `input-rate <output-per-minute> <input-per-batch> <yield>` | Convert desired output flow to ideal ingredient flow. | number ≥0, number >0, number >0 |
| `utilization <demand-per-minute> <yield> <seconds-per-batch> <machines>` | Compare desired output flow with ideal installed capacity. | number ≥0, whole >0, number >0, whole >0 |
| `parallel-lines <batches> <lines>` | Assign whole batches evenly across bounded production lines. | whole ≥0, whole >0 |
| `output-stock <batches> <yield> <existing> <target>` | Reconcile produced and existing finished stock against a target. | whole ≥0, whole >0, whole ≥0, whole ≥0 |
| `loss-allowance <wanted> <yield> <survival-fraction>` | Inflate batch demand by an explicit deterministic expected survival fraction. | whole ≥0, whole >0, fraction 0–1 |
| `change-yield <wanted> <old-yield> <new-yield>` | Compare required batches after changing a supplied recipe yield. | whole ≥0, whole >0, whole >0 |
| `shared-input <stock> <first-batches> <first-cost> <second-cost>` | Reserve input for one product before budgeting a second product. | whole ≥0, whole ≥0, whole >0, whole >0 |
| `quota-order <quotas> <yields> <input-costs>` | Sum shared raw input needed for separate product quotas. | whole-count list, whole-count list, whole-count list |
| `work-in-progress <started> <completed> <input-per-batch> <yield>` | Account for raw material tied up in incomplete batches. | whole ≥0, whole ≥0, whole >0, whole >0 |
| `reorder-point <consumption-per-minute> <lead-minutes> <buffer>` | Estimate raw-input reorder level from flow and lead time. | number ≥0, number ≥0, whole ≥0 |
| `campaign <targets> <yields> <batch-seconds>` | Sum sequential production time for separate product targets. | whole-count list, whole-count list, number ≥0 list |
| `completion-window <batches> <fast-seconds> <slow-seconds> <machines>` | Bound completion time using supplied fast and slow batch durations. | whole ≥0, number >0, number >0, whole >0 |

Examples:

```sh
mc-agent production recipe 17 4 3
mc-agent production stock-batches 17 3 4
mc-agent production bottleneck 20,9 3,2
```

These calculations do not read inventory, acquire control, or execute a routine. They do not infer recipes, prices, fuel properties, stack sizes, or world conditions. Review assumptions before acting.
