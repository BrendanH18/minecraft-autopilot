# Abstract farm estimates

Offline plot, harvest, and replenishment estimates from supplied dimensions, yields, growth times, and loss assumptions. No crop mechanics, hydration, random tick behavior, or actual yield is inferred.

Run `mc-agent farmplan COMMAND --help` for positional arguments. All values must be finite, nonnegative, and at most 1,000,000. Counts marked as whole quantities reject fractions; positive divisors and rates reject zero. Fractions use 0 to 1, rather than percentages. Comma-separated lists contain 1 to 1000 values, in positional item order; paired lists must match. Results outside the safe numeric range fail.

| Command | Meaning | Input kinds in argument order |
| --- | --- | --- |
| `rows <width> <length> <row-gap>` | Count one-cell planting rows separated by explicit empty-row gaps. | whole >0, whole >0, whole ≥0 |
| `beds <width> <length> <bed-width> <path-width>` | Count planting columns in repeating beds and paths with a clipped final bed. | whole >0, whole >0, whole >0, whole ≥0 |
| `grid-spacing <width> <length> <x-spacing> <z-spacing>` | Count plants at regular lattice positions beginning at the origin cell. | whole >0, whole >0, whole >0, whole >0 |
| `edge-margin <width> <length> <margin>` | Remove an equal unplanted border from a rectangular plot. | whole >0, whole >0, whole ≥0 |
| `seed-budget <plants> <seeds-per-plant> <reserve>` | Budget initial planting and an explicit held seed reserve. | whole ≥0, whole >0, whole ≥0 |
| `harvest <plants> <yield-per-plant> <survival>` | Estimate gross and surviving harvest with a supplied fractional survival. | whole ≥0, number ≥0, fraction 0–1 |
| `replant <harvested-seeds> <plants> <seed-cost>` | Separate replanting seed requirement from distributable excess. | whole ≥0, whole ≥0, whole >0 |
| `cycles <target> <plants> <yield-per-cycle>` | Estimate complete harvest cycles for a target under constant yields. | number ≥0, whole >0, number >0 |
| `growth-schedule <cycles> <growth-minutes> <harvest-minutes>` | List bounded sequential cycle completion times including harvest work. | whole ≥0, number >0, number ≥0 |
| `stagger <beds> <cycle-minutes>` | Offset equal beds uniformly across an assumed cycle. | whole >0, number >0 |
| `steady-yield <plants> <yield> <cycle-minutes>` | Convert an assumed repeated harvest to ideal average output flow. | whole ≥0, number ≥0, number >0 |
| `target-area <items-per-hour> <yield-per-cell> <cycle-minutes>` | Estimate planting cells needed for a constant average output target. | number ≥0, number >0, number >0 |
| `water-lattice <width> <length> <coverage-width> <coverage-length>` | Count rectangular coverage tiles with supplied spans; no hydration simulation. | whole >0, whole >0, whole >0, whole >0 |
| `path-share <width> <length> <path-every>` | Count full-width cross paths every given row starting at the last row of each period. | whole >0, whole >0, whole >0 |
| `fertilizer <plants> <applications> <units-per-application>` | Budget caller-supplied fertilizer use per plant and application. | whole ≥0, whole ≥0, number ≥0 |
| `compost <inputs> <success-fraction> <levels-per-output>` | Estimate output from independent expected compost-level contributions. | whole ≥0, fraction 0–1, whole >0 |
| `seed-multiply <initial-seeds> <net-multiplier> <cycles>` | Project bounded compounded seed stock under a supplied net multiplier. | whole ≥0, number >0, whole ≥0 |
| `loss-buffer <target> <loss-fraction> <yield-per-plant>` | Inflate required plant count for expected fractional harvest losses. | number ≥0, fraction 0–1, number >0 |
| `rotation <areas> <yields>` | Estimate harvest by positional crop area and supplied yield. | whole-count list, number ≥0 list |
| `harvest-work <plants> <seconds-per-plant> <workers>` | Estimate whole-plant work waves across equal workers. | whole ≥0, number >0, whole >0 |
| `storage <plants> <yield> <cycles> <stack-size>` | Estimate occupied whole slots for accumulated expected harvest. | whole ≥0, number ≥0, whole ≥0, whole >0 |
| `consumption-balance <harvest> <cycle-minutes> <consumption-per-minute>` | Compare one harvest with consumption during its assumed growth cycle. | number ≥0, number >0, number ≥0 |
| `expansion <current-plants> <target-plants> <seeds-per-plant>` | Budget seed costs for only the additional planting area. | whole ≥0, whole ≥0, whole >0 |
| `season <minutes> <growth-minutes> <plants> <yield>` | Estimate complete harvests inside an explicit time window. | number ≥0, number >0, whole ≥0, number ≥0 |
| `bed-allocation <total-plants> <weights>` | Allocate integer planting cells by largest remainders of explicit crop weights. | whole ≥0, number >0 list |

Examples:

```sh
mc-agent farmplan rows 10 8 2
mc-agent farmplan beds 10 8 3 1
mc-agent farmplan grid-spacing 10 8 3 2
```

These calculations do not read inventory, acquire control, or execute a routine. They do not infer recipes, prices, fuel properties, stack sizes, or world conditions. Review assumptions before acting.

Whole-count rounding normalizes small floating-point roundoff near nonzero integer boundaries. Genuine fractional shortages remain unmet; positive tiny demands still require a whole unit.
