# Itinerary planning

The `itinerary` group offers 25 offline multi-stop planning commands. Points use `x,y,z` in one dimension; provide 2–50 points within the supported coordinate bounds. Distances are Euclidean blocks and speed is blocks per second. Ties preserve input order. Stop and leg numbers start at 1. Outputs are JSON with `--json`.

No command takes control or connects to Minecraft. Straight lines ignore terrain, hazards, dimension transfers, and pathfinding. Reordering visits may change a task's meaning. These are plans for review, not validated routes or executing routines.

| # | Command after `mc-agent itinerary` | Behavior |
| --- | --- | --- |
| 1 | `pace <speeds> <points...>` | Arrival times using one comma-separated speed per leg. |
| 2 | `dwell <speed> <seconds> <points...>` | Arrival and departure schedule with dwell at each destination. |
| 3 | `stages <maximum> <points...>` | Pack whole legs into distance-limited stages; flag oversized legs. |
| 4 | `resample <spacing> <points...>` | Sample an entire polyline at uniform traveled-distance intervals. |
| 5 | `stopovers <distance> <points...>` | Select existing stops when distance since the last stop reaches a threshold. |
| 6 | `nearest-order <points...>` | Greedy visit ordering from a fixed first stop. |
| 7 | `cheapest-insert <point> <points...>` | Find the cheapest interior leg for adding a stop. |
| 8 | `remove-cost <points...>` | Measure distance saved by omitting each intermediate stop. |
| 9 | `shortcut <first> <last> <points...>` | Compare a contiguous subroute with a direct shortcut. |
| 10 | `two-opt <points...>` | Choose the best single reversal of intermediate stops, preserving endpoints. |
| 11 | `checkpoints <every> <points...>` | Select checkpoint stops every given number of legs, including endpoints. |
| 12 | `retrace <stop> <points...>` | Plan the reverse prefix from a selected stop back to the start. |
| 13 | `rotate-start <stop> <points...>` | Choose a new first stop on a closed visit cycle. |
| 14 | `window <first> <last> <points...>` | Extract a numbered stop window with original cumulative start distance. |
| 15 | `elevation-cost <speed> <up-seconds> <down-seconds> <points...>` | Add supplied per-block ascent and descent delays to travel. |
| 16 | `effort <horizontal-weight> <up-weight> <down-weight> <points...>` | Score legs with supplied horizontal, ascent, and descent costs. |
| 17 | `deadline-stops <speed> <dwell> <budget> <points...>` | Find destination departures exceeding a travel and dwell budget. |
| 18 | `return-reserve <speed> <budget> <points...>` | Budget each prefix plus direct return to its origin. |
| 19 | `leg-limit <maximum> <points...>` | Locate legs exceeding a distance limit. |
| 20 | `climb-limit <maximum> <points...>` | Locate legs exceeding a positive rise limit. |
| 21 | `turn-limit <degrees> <points...>` | Locate horizontal turns exceeding a threshold; vertical or zero legs are unknown. |
| 22 | `bottleneck <speed> <dwell> <points...>` | Compare travel versus dwell and identify the slowest leg. |
| 23 | `distance-matrix <points...>` | Compute all pairwise stop distances. |
| 24 | `hub <points...>` | Choose the listed stop minimizing the farthest direct journey. |
| 25 | `rendezvous <speed> <points...>` | Choose the listed meeting stop minimizing summed direct travel time. |

Examples:

```sh
mc-agent --json itinerary dwell 4 10 -- 0,64,0 40,64,0 40,64,40
mc-agent --json itinerary pace 4,2 -- 0,64,0 40,64,0 40,64,40
mc-agent --json itinerary two-opt -- 0,64,0 4,64,4 0,64,4 4,64,0
```

Speeds and spacing must be positive, durations/costs/limits nonnegative, and numbered stop arguments integers. Supplied numbers are bounded at 1 billion; route sampling refuses more than 1000 points. `dwell` and `deadline-stops` include a dwell after each destination, including the final one, and none at the origin. `return-reserve` reserves a direct return after each prefix; it does not retrace it. `resample` includes both endpoints and uses the requested interval except for the final shorter interval. A zero-length route emits one sample. `stages` preserves oversized legs and flags them rather than pretending to split them.

`rotate-start` closes the visit cycle, removing one repeated terminal start first if present. `hub` minimizes worst distance and `rendezvous` minimizes summed direct time over listed candidates. `nearest-order` and `two-opt` are bounded heuristics and do not guarantee an optimum. `turn-limit` reports unknown turns beside vertical or zero-length horizontal legs.
