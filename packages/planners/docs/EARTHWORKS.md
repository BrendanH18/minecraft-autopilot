# Earthworks estimates

Offline continuous material and time estimates using caller-supplied rates. Units must be consistent. No terrain, fluid, geology, support, stability, game mechanics, or construction feasibility is checked. No excavation is executed.

Run `mc-agent earthworks --help` for all commands. Every output is JSON with `result` and `note`. This group is offline and never acquires control or connects to Minecraft. Numeric inputs must be finite and are bounded to one million unless a narrower domain is documented; integer counts reject fractions. Structured outputs are capped at 1000 entries and results outside the safe numeric range are rejected.

| Command | Meaning |
| --- | --- |
| `bench-cut <width> <run> <rise>` | Estimate a triangular-prism bench excavation. |
| `trapezoid-cut <bottom> <top> <depth> <length>` | Estimate trapezoidal ditch volume. |
| `side-slope-width <bottom> <depth> <slope>` | Compute ditch top width from horizontal run per vertical rise. |
| `bank-swell <in-place> <swell-percent>` | Estimate loose spoil volume after supplied positive percentage swell. |
| `compact-fill <loose> <shrink-percent>` | Estimate compacted fill from loose material and supplied shrink percentage. |
| `borrow-required <compacted> <shrink-percent>` | Estimate loose borrow required for compacted fill. |
| `cut-fill-balance <cut> <fill> <recovery-percent>` | Compute usable cut, borrow deficit, and surplus. |
| `haul-trips <volume> <capacity>` | Round up haul trips at supplied capacity. |
| `haul-time <trips> <distance> <speed> <loading> <unloading>` | Estimate serial roundtrip hauling time in supplied units. |
| `dig-time <blocks> <blocks-per-second>` | Estimate active excavation time at supplied throughput. |
| `crew-time <work> <rate> <workers> <efficiency>` | Estimate completion time at supplied per-worker rate and efficiency. |
| `lift-count <height> <maximum-lift>` | Count fill lifts at a supplied maximum thickness. |
| `lift-schedule <height> <maximum-lift> <area>` | List lift heights and volumes up to 1000 lifts. |
| `overdig <width> <length> <depth> <allowance>` | Compute additional volume from outward side overdig only. |
| `topsoil-strip <width> <length> <thickness>` | Estimate topsoil stripping volume. |
| `stockpile-cone <radius> <height>` | Estimate ideal conical spoil pile capacity. |
| `stockpile-height <volume> <radius>` | Find height of an ideal conical stockpile. |
| `stockpile-footprint <volume> <height>` | Find circular footprint area of an ideal conical stockpile. |
| `average-end-area <first-area> <last-area> <length>` | Estimate excavation using the average-end-area method. |
| `prismoidal <first-area> <middle-area> <last-area> <length>` | Estimate volume with the prismoidal formula. |
| `retaining-pressure <height> <density>` | Estimate ideal hydrostatic-style triangular load from supplied density. |
| `batter-run <height> <horizontal-per-vertical>` | Compute horizontal bank run from a supplied batter. |
| `slope-face <height> <run> <length>` | Compute inclined bank face area. |
| `drain-fall <length> <grade-percent>` | Compute drain fall from a supplied nonnegative percentage grade. |
| `dewatering-time <volume> <inflow> <pumping>` | Estimate draining time, requiring pumping to exceed inflow. |

Examples:

```sh
mc-agent earthworks bench-cut 4 6 2
mc-agent earthworks trapezoid-cut 2 4 3 5
mc-agent earthworks side-slope-width 2 3 0.5
```

Fractional volumes and lengths are continuous estimates; round and choose actual game materials separately. No command executes an action.
