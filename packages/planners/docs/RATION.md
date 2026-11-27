# Trip consumption and reserves

Offline ration estimates from explicit consumption rates and usable supply values. Units are chosen by the caller; no food saturation, spoilage, exhaustion, or guaranteed survival is inferred.

Run `mc-agent ration COMMAND --help` for positional arguments. All values must be finite, nonnegative, and at most 1,000,000. Counts marked as whole quantities reject fractions; positive divisors and rates reject zero. Fractions use 0 to 1, rather than percentages. Comma-separated lists contain 1 to 1000 values, in positional item order; paired lists must match. Results outside the safe numeric range fail.

| Command | Meaning | Input kinds in argument order |
| --- | --- | --- |
| `trip <minutes> <units-per-minute> <reserve-units>` | Budget steady consumption with a separate held reserve. | number ≥0, number ≥0, number ≥0 |
| `phases <minutes> <rates> <reserve>` | Sum consumption across sequential phases with separate rates. | number ≥0 list, number ≥0 list, number ≥0 |
| `portions <required-units> <units-per-item>` | Convert required usable supply units to whole consumable items. | number ≥0, number >0 |
| `endurance <stock-units> <units-per-minute> <reserve>` | Estimate time before a held supply reserve would be crossed. | number ≥0, number >0, number ≥0 |
| `return-budget <outbound-minutes> <return-minutes> <rate> <reserve>` | Separate outbound and return consumption allowances. | number ≥0, number ≥0, number ≥0, number ≥0 |
| `turnaround <stock-units> <outbound-rate> <return-rate> <reserve>` | Estimate latest turnaround for symmetric travel durations. | number ≥0, number >0, number >0, number ≥0 |
| `party <minutes> <individual-rates> <reserve-each>` | Budget a party with supplied individual consumption rates. | number ≥0, number ≥0 list, number ≥0 |
| `share-stock <stock-units> <people> <rate-each>` | Estimate common endurance when supplies are shared equally. | number ≥0, whole >0, number >0 |
| `refill <current> <target> <units-per-item>` | Budget whole replacement items to restore a target supply level. | number ≥0, number ≥0, number >0 |
| `checkpoint <stock> <elapsed-minutes> <rate> <reserve>` | Project stock and reserve margin at one elapsed-time checkpoint. | number ≥0, number ≥0, number ≥0, number ≥0 |
| `checkpoints <stock> <times> <rate> <reserve>` | Project supply margins at caller-supplied elapsed times. | number ≥0, number ≥0 list, number ≥0, number ≥0 |
| `activity <minutes> <base-rate> <multiplier> <reserve>` | Scale an assumed consumption rate for a more demanding activity. | number ≥0, number ≥0, number >0, number ≥0 |
| `uncertainty <minutes> <low-rate> <high-rate> <reserve>` | Bound supply needs over an explicit consumption-rate interval. | number ≥0, number ≥0, number ≥0, number ≥0 |
| `delay <planned-units> <delay-minutes> <idle-rate>` | Add consumption for an explicit unplanned waiting interval. | number ≥0, number ≥0, number ≥0 |
| `loss <required-usable> <loss-fraction> <units-per-item>` | Inflate whole-item supply demand for an expected unusable fraction. | number ≥0, fraction 0–1, number >0 |
| `cache-leg <leg-minutes> <rates> <reserve-per-leg>` | Budget independent legs assuming a full refill before each leg. | number ≥0 list, number ≥0 list, number ≥0 |
| `refill-interval <capacity-units> <rate> <reserve>` | Estimate maximum interval between refills without using a reserve. | number ≥0, number >0, number ≥0 |
| `refill-count <trip-minutes> <capacity> <rate> <reserve>` | Count mid-trip full refills while preserving reserve for each stage. | number ≥0, number >0, number >0, number ≥0 |
| `loadout <counts> <unit-values> <stack-sizes>` | Sum usable values and occupied slots for distinct carried supplies. | whole-count list, number >0 list, whole-count list |
| `density <unit-values> <stack-sizes>` | Rank supplied consumable types by usable units per full slot. | number >0 list, whole-count list |
| `portion-plan <stock> <servings> <reserve>` | Divide usable supply into equal planned servings. | number ≥0, whole >0, number ≥0 |
| `meal-clock <trip-minutes> <interval-minutes> <units-per-meal>` | Count scheduled meals after departure through the trip endpoint. | number ≥0, number >0, number ≥0 |
| `resupply-gap <arrival-minutes> <supply-ready-minutes> <waiting-rate>` | Budget extra consumption while waiting for a resupply to become ready. | number ≥0, number ≥0, number ≥0 |
| `escape-reserve <distance> <speed-blocks-per-minute> <rate> <margin-units>` | Convert a supplied direct escape distance to a consumption reserve. | number ≥0, number >0, number ≥0, number ≥0 |
| `actual-rate <starting-units> <ending-units> <elapsed-minutes>` | Infer a net observed consumption rate from two supplied stock readings. | number ≥0, number ≥0, number >0 |

Examples:

```sh
mc-agent ration trip 30 2 10
mc-agent ration phases 10,20 2,3 5
mc-agent ration portions 70 8
```

These calculations do not read inventory, acquire control, or execute a routine. They do not infer recipes, prices, fuel properties, stack sizes, or world conditions. Review assumptions before acting.

Whole-count rounding normalizes small floating-point roundoff near nonzero integer boundaries. Genuine fractional shortages remain unmet; positive tiny demands still require a whole unit.
