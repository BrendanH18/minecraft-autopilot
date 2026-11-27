# Railplan estimates

Offline abstract railway planning. Speeds, spacing, deceleration, recipes, rates, and capacities are supplied assumptions, not Minecraft physics or recipe guarantees. Candidate placement uses zero-based track-cell indices. Does not build track or implement signaling.

Run `mc-agent railplan --help` for all commands. Every output is JSON with `result` and `note`. This group is offline and never acquires control or connects to Minecraft. Numeric inputs must be finite and are bounded to one million unless a narrower domain is documented; integer counts reject fractions. Structured outputs are capped at 1000 entries and results outside the safe numeric range are rejected.

| Command | Meaning |
| --- | --- |
| `powered-layout <length> <interval>` | List powered-rail candidate indices, including endpoints. |
| `powered-count <length> <interval>` | Count powered candidates with endpoint coverage. |
| `regular-count <length> <interval>` | Count remaining ordinary rail positions after powered candidate placement. |
| `track-batches <rails> <output-per-batch>` | Plan whole supplied rail recipe batches and surplus. |
| `material-shortage <regular> <powered> <held-regular> <held-powered>` | Compare planned track types with held rail counts. |
| `dual-track <length> <separation>` | Count rails and rectangular corridor width for two parallel single-cell tracks. |
| `bed-shoulders <length> <tracks> <track-gap> <shoulder>` | Count single-layer shoulder cells outside a multi-track bed. |
| `station-platforms <length> <tracks> <platform-width> <end-padding>` | Estimate separate full-length platforms beside each supplied track. |
| `slope-length <horizontal> <rise>` | Compute ideal inclined track length. |
| `grade-check <horizontal> <rise> <maximum-percent>` | Check absolute ideal grade against a supplied maximum. |
| `ramp-run <rise> <maximum-grade-percent>` | Compute minimum horizontal run at a supplied positive grade. |
| `ramp-blocks <rise> <run-per-rise>` | Estimate stair-step rail blocks using one rising rail per rise. |
| `travel-time <distance> <speed> <dwell>` | Estimate travel plus station dwell in seconds. |
| `roundtrip <distance> <speed> <dwell-each-end>` | Estimate out-and-back time at a supplied constant speed. |
| `headway <roundtrip> <carts>` | Estimate evenly spaced departures from a fleet cycle. |
| `fleet-size <roundtrip> <desired-headway>` | Round up fleet size needed for a departure interval. |
| `throughput <items-per-cart> <headway>` | Estimate items per minute at a supplied departure interval. |
| `cargo-trips <items> <slots> <stack-size>` | Round up carts for uniform items and supplied cargo capacity. |
| `station-capacity <bays> <service-seconds>` | Estimate maximum serviced carts per minute. |
| `queue-clearance <queued-carts> <headway>` | Estimate time to dispatch a waiting queue, first cart departing immediately. |
| `signal-blocks <length> <maximum-block-length>` | Count abstract occupancy blocks; does not design redstone. |
| `signal-boundaries <length> <maximum-block-length>` | List bounded evenly divided abstract signal block boundaries. |
| `braking-distance <speed> <deceleration>` | Estimate ideal braking distance at supplied constant deceleration. |
| `stopping-reserve <speed> <deceleration> <reaction-seconds>` | Estimate reaction travel plus ideal braking distance. |
| `curve-arc <radius> <degrees>` | Compute ideal continuous curve length, not placeable rail geometry. |

Examples:

```sh
mc-agent railplan powered-layout 10 4
mc-agent railplan powered-count 10 4
mc-agent railplan regular-count 10 4
```

Fractional volumes and lengths are continuous estimates; round and choose actual game materials separately. No command executes an action.
