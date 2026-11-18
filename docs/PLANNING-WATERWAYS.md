# Underwater builds and packed-ice roads

Run `mc-agent sponge-plan --help` or `mc-agent ice-road --help` for the command list. Commands print JSON with `result` and a group note. They use caller-supplied estimates and run without a Minecraft connection. Use consistent units.

Whole number types are s (positive) and c (nonnegative). Real number types are p (positive), q (nonnegative) and r (0 to 1). Uppercase types take a comma-separated list. points2 and intervals take JSON arrays of pairs. Numbers are bounded by 1,000,000 in magnitude and lists by 1,000 entries. Counts use the shared [rounding policy](PLANNING-RESOURCES.md). Grid and list indices start at one. Offsets start at zero.

### sponge-plan

The grid divides a rectangular interior at regular block offsets and clips far edges. `section-at` measures the sections before each divider consumes the first row or column of the next section. Cofferdam walls stand outside the interior. Pump schedules count setup time separately for each flooded section. Each one starts its setup at the supplied volume. All water, time, and sponge capacities use values you supply.

| Command | Types | Calculation |
| --- | --- | --- |
| `section-grid <length> <width> <section-length> <section-width>` | `s,s,s,s` | Count rectangular sections, including clipped sections along the far edges. |
| `section-at <length> <width> <section-length> <section-width> <column> <row>` | `s,s,s,s,s,s` | Locate and size a one-based section in a rectangular grid. |
| `divider-cells <length> <width> <depth> <section-length> <section-width>` | `s,s,s,s,s` | Budget full-depth grid dividers, counting intersections once. |
| `cofferdam-wall <length> <width> <depth> <freeboard> <thickness>` | `s,s,c,c,s` | Budget exterior rectangular wall cells below and above the waterline. |
| `divider-gates <wall-length> <depth> <widths> <height> <rib>` | `s,s,S,s,c` | Fit gate openings separated by solid ribs into a single divider wall. |
| `barrier-kit <installs> <removals> <initial-stock>` | `C,C,c` | Find the peak barrier stock needed when each phase reclaims material before installing more. |
| `barrier-labor <cells> <install-rate> <remove-rate> <setups> <setup-time>` | `c,p,p,c,q` | Budget installation, removal, and repeated barrier crew setup time. |
| `layer-profile <flooded-footprints>` | `C` | Report flooded cells and the depths of occupied layers from the waterline down. |
| `temporary-fill <volumes> <blocked-cells> <recovery-fraction>` | `C,C,r` | Estimate temporary fill and recovered cells independently for each section. |
| `sponge-loads <volumes> <cells-per-sponge>` | `C,s` | Count whole sponge placements with separate partial placements for each section. |
| `drying-backlog <wet-arrivals> <capacity>` | `C,s` | Track dried sponges and the wet backlog after each processing batch. |
| `reuse-shifts <placements> <clean-stock> <dry-per-shift> <shifts>` | `c,c,c,c` | Project work and remaining stock under end-of-shift sponge reuse. |
| `staging-stock <batch-size> <batch-interval> <return-time> <contingency>` | `s,p,q,c` | Find ready sponge stock for concurrent reuse batches and a safety reserve. |
| `pump-crew <volume> <inflow> <rate-per-pump> <setup-time> <deadline>` | `q,q,p,q,q` | Find the fewest equal pumps that can drain by the deadline, with inflow during setup. |
| `pump-outage <volume> <pump-rate> <inflow> <outage-start> <downtime>` | `q,p,q,q,q` | Estimate completion after a single pump interruption while inflow continues. |
| `pump-handoff <volume> <inflow> <first-rate> <first-time> <next-rate>` | `q,q,q,q,q` | Find the completion clock when the active pump rate changes once. |
| `pump-schedule <volumes> <inflows> <pump-rate> <setup-time>` | `L,L,p,q` | Estimate section completion clocks for one traveling pump crew. |
| `wet-checkpoints <initial> <capacities> <inflows> <withdrawals>` | `q,L,L,L` | Track water and spill after pumping, then reflooding up to each checkpoint capacity. |
| `breach-level <left-area> <left-water-depth> <right-area> <right-water-depth>` | `p,q,p,q` | Estimate equalized depth and transferred volume when the divider between equal-elevation basins opens. |
| `stage-depth <depth> <step> <stage>` | `s,s,s` | Locate a vertical work stage from the waterline down and clip it to the floor. |
| `draining-method <volume> <cells-per-sponge> <sponges-per-batch> <batch-time> <pump-setup> <pump-net-rate>` | `c,s,s,q,q,p` | Compare sequential sponge batches with a single pump setup and net rate. |
| `leak-test <pool-area> <before-depth> <after-depth> <withdrawn> <duration>` | `p,q,q,q,p` | Infer net inflow from two depths and the amount withdrawn between measurements. |
| `seal-survey <leaks> <sealed-fractions> <pump-rate>` | `L,L,q` | Estimate residual inflow and pump headroom after partial sealing. |
| `dry-first <volumes> <inflows> <pump-rate> <setup-time> <window>` | `L,L,p,q,q` | Finish the most flooded sections in a window by scheduling drainable sections shortest first. |
| `refuge-work <depth> <descent-rate> <ascent-rate> <transition-time> <time-budget> <work-rate>` | `q,p,p,q,q,q` | Set a completed-cell quota after reserving travel time to and from a refuge. |

`mc-agent sponge-plan sponge-loads '8,9,0,7' 4` returns `placements: [2, 3, 0, 2], total: 7`.

### ice-road

Waypoint commands use JSON rows `[x,z]` with positive x east and positive z south. Consecutive whole block coordinates must differ on exactly one axis. Retracing a leg counts as a reversal. Collinear legs with the same heading share a straight approach. Road gap intervals `[start,end)` include their start and exclude their end. Passing-bay spacing is measured along the centerline and may be fractional.

| Command | Types | Calculation |
| --- | --- | --- |
| `turn-mix <waypoints>` | `points2` | Count left, right, reverse and straight transitions on an orthogonal route. |
| `turn-spacing <waypoints> <minimum-straight>` | `points2,c` | Find consecutive bends with less than the required straight run between them. |
| `curve-clearance <waypoints> <quarter-run> <reverse-run>` | `points2,c,c` | Check that the straight approach reservations of neighboring bends fit. |
| `corner-stock <waypoints> <quarter-ice> <reverse-ice> <quarter-guards> <reverse-guards>` | `points2,c,c,c,c` | Budget ice and guards for corner retrofits by bend class. |
| `striped-deck <length> <lanes> <ice-width> <lane-gap> <shoulder>` | `s,s,s,c,c` | Size a straight deck with ice lanes, gaps between lanes, and shoulders on both sides. |
| `switchyard-deck <length> <main-width> <parking-width> <divider-width> <opening-lengths>` | `s,s,s,s,C` | Budget a parallel parking lane and transfer openings through a divider. |
| `raised-road <pier-depths> <posts-per-pier> <cap-cells> <footing-cells>` | `C,s,c,c` | Budget variable-height support posts with a cap and footing at each supplied pier. |
| `gap-crossings <length> <gaps> <bank-overlap> <deck-width>` | `s,intervals,c,s` | Count deck over merged gap spans with overlaps onto both banks. |
| `roadside-chests <segment-lengths> <maximum-walk> <kit-per-chest>` | `S,s,c` | Budget maintenance chests at junctions and at intermediate access points. |
| `material-budget <ice-cells> <on-hand> <loss-fraction> <reserve>` | `c,c,r,c` | Find how much new ice to acquire after planned loss and a reserve. |
| `station-coverage <length> <offsets> <radius>` | `s,C,c` | Merge station reach on a route and measure the distance outside all stations. |
| `station-platform <length> <stall-width> <clear-ends> <sides>` | `s,s,c,s` | Fit whole parking stalls between clear ends on one or both sides of a platform. |
| `passing-bays <length> <maximum-gap> <bay-length> <extra-width>` | `s,s,s,c` | Budget equally spaced passing bays between terminal refuges, refusing overlapping footprints. |
| `patch-window <lengths> <width> <repair-rate> <setup-time> <window>` | `S,s,p,q,q` | Find the prefix of scheduled repairs that fits within a closure window. |
| `transfer-window <spur-length> <spur-speed> <transfer-delay> <departures> <main-length> <main-speed>` | `q,p,q,L,q,p` | Catch the earliest feasible main-road departure after travel from a portal spur. |
| `route-clock <waypoints> <speed> <quarter-delay> <reverse-delay>` | `points2,p,q,q` | Estimate orthogonal travel time with explicit bend and reversal delays. |
| `dwell-budget <lengths> <speeds> <dwells> <deadline>` | `L,P,L,q` | Estimate platform arrival and departure clocks and a deadline margin with dwell included. |
| `directional-trip <lengths> <forward-speeds> <reverse-speeds> <origin-dwell> <destination-dwell>` | `L,P,P,q,q` | Estimate a corridor round trip for different speeds on each segment and direction. |
| `launch-headway <length> <speeds> <separation>` | `p,P,q` | Find earliest launch times keeping the requested distance between successive boats until exit. |
| `terminal-capacity <cycle-time> <loading-spots> <loading-time> <fleet> <depart-gap>` | `p,s,p,c,p` | Estimate departures per time unit subject to fleet, loader, and lane bottlenecks. |
| `upgrade-priority <lengths> <old-speeds> <ice-speed> <build-times>` | `L,P,p,P` | Rank useful resurfacing projects by travel time saved per build time. |
| `spur-budget <lengths> <deck-width> <transfer-cells> <portal-cells>` | `C,s,c,c` | Budget independent portal spurs, each with a transfer pad and a portal kit. |
| `neighboring-spurs <length> <offsets> <position>` | `s,C,c` | Find the nearest portal spur in each direction along the main road. |
| `alternate-window <length> <forward-speed> <reverse-speed> <clearance-time> <window>` | `p,p,p,q,q` | Count finished trips in each direction in an alternating single-lane schedule. |
| `breakdown-detour <closure-length> <bypass-length> <ice-speed> <bypass-speed> <switch-time>` | `q,q,p,p,q` | Estimate the trip delay from a bypass and two transfers at a closed road segment. |

`mc-agent ice-road route-clock '[[0,0],[6,0],[6,12]]' 3 2 5` returns `distance: 18, turnTime: 2, total: 8`.
