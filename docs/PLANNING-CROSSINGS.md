# Crossing planners

For a signed list beginning with a minus sign, place `--` after the command name and before its arguments.

Plan Minecraft harbors, aqueducts and viaducts from supplied measurements. Each command prints JSON and runs offline. Dimensions are in blocks. Elevation differences use boundary levels. Supply rates, clearances and timing assumptions in consistent units.

Use `s` for positive whole numbers, `c` for nonnegative whole numbers and `i` for signed whole numbers. `S`, `C` and `l` are comma-separated lists of positive whole numbers, nonnegative whole numbers and signed numbers respectively. Quote JSON pairs for `points2` and `intervals`. For `indexes`, supply comma-separated nonnegative whole offsets or `''` for an empty list. Other lists have 1–1,000 elements. Input magnitudes are limited to 1,000,000 and each output list to 1,000 elements.

## `harborplan`

A 19-block quay fits three five-block vessels with two-block gaps. Run `mc-agent harborplan berth-count 19 5 2` to check the layout.

| Command | Types | Calculation |
| --- | --- | --- |
| `quay-frontage <vessel-lengths> <gap> <end-buffer>` | `S,c,c` | Measure occupied quay length with gaps between vessels and a buffer at both ends. |
| `berth-count <frontage> <vessel-length> <gap>` | `c,s,c` | Fit equal vessels along a quay with gaps only between neighbors. |
| `berth-assignment <berth-lengths> <vessel-lengths>` | `S,S` | Assign arriving vessels to the smallest unused berth that fits, choosing earlier ties. Zero means unassigned. |
| `finger-decks <lengths> <width> <layers>` | `S,s,s` | Count blocks in rectangular finger piers extending outside the quay. |
| `pile-cuts <bed-levels> <deck-bottom> <embed>` | `l,i,c` | Size piles from the surveyed bed boundary up to the deck underside plus buried length. |
| `breakwater-shell <length> <width> <height> <skin>` | `s,s,s,s` | Count the outer shell of a closed cuboid breakwater including top, bottom and ends. |
| `dredge-cuts <depths> <target> <strip-width>` | `C,c,s` | Calculate excavation for successive one-block strips shallower than target depth. |
| `depth-windows <depths> <draft> <margin>` | `C,c,c` | List consecutive one-based survey stations deep enough for a vessel and margin. |
| `turning-basin <diameter> <side-margin> <width> <length>` | `s,c,s,s` | Check a circular turning envelope against a rectangular basin and report both shortfalls. |
| `fender-offsets <frontage> <max-gap>` | `s,s` | Place fenders at both ends of a quay with balanced gaps no wider than the limit. Offsets start at zero. |
| `terminal-gates <arrivals> <gate-limit>` | `C,s` | Trace the queue after arrivals and a fixed departure capacity each tick. |
| `gangway-run <height-difference> <max-rise> <unit-run>` | `c,s,s` | Find the horizontal run in whole ramp modules needed for a rise. |
| `cargo-manifest <lots> <crate-size>` | `C,s` | Count sealed and partial crates for separate cargo lots. |
| `shuttle-clock <loads> <capacity> <outbound> <return-time> <turnaround>` | `c,s,c,c,c` | Estimate the last delivery time, including return and turnaround between trips. |
| `unload-order <cargo> <rates>` | `C,S` | Order vessels by increasing whole unload ticks with input-order ties. |
| `dock-appointments <arrival-ticks> <service-ticks>` | `C,C` | Queue vessels at one dock in listed arrival order and report departure clocks. |
| `bollard-pairs <offsets> <min-span> <max-span>` | `C,c,c` | Count distinct pairs of listed bollards whose separation meets both limits. |
| `tide-steps <deck-level> <water-levels> <max-step>` | `i,l,s` | Compute whole access steps from the waterline to a fixed landing, zero at or above the deck. |
| `fairway-width <beams> <bank-clearance> <passing-gap>` | `S,c,c` | Measure a fairway serving all listed vessels side by side with bank and passing clearance. |
| `drydock-pump <length> <width> <depth> <pumps> <per-pump> <inflow>` | `s,s,c,s,s,c` | Estimate ticks to empty a flooded rectangular dock with constant inflow. Null means no net drainage. |
| `yard-stack <cargo> <pad-width> <pad-depth> <max-height>` | `c,s,s,s` | Fill a rectangular staging pad layer by layer and report stored and overflow crates. |
| `channel-buoys <leg-lengths> <spacing>` | `S,s` | Count paired end markers and intermediate pairs at a maximum spacing, sharing leg junctions. |
| `slipway-profile <top-level> <drop-every> <stations>` | `i,s,s` | Survey a stepped slipway dropping one block at each complete horizontal interval. |
| `quay-resurface <strip-lengths> <damaged-widths> <spare-blocks>` | `S,C,c` | Budget one-layer patches in disjoint quay strips against stocks. |
| `crane-reach <crane-x> <crane-z> <radius> <targets>` | `i,i,c,points2` | Identify one-based loading positions within horizontal reach of the crane pivot. |

## `aqueduct`

For an aqueduct ending at offset 12 with gates at 3 and 8, a breach exactly at offset 3 isolates the five-block reach immediately downstream. Run `mc-agent aqueduct isolation-loss 3,8 12 3`.

| Command | Types | Calculation |
| --- | --- | --- |
| `trough-section <inside-width> <wall-height> <wall-thickness> <base-thickness>` | `s,s,s,s` | Measure the solid cross section of an open rectangular trough with its bed extending under the walls. |
| `reach-volume <lengths> <widths> <depths>` | `S,S,C` | Total the water cells in disjoint rectangular reaches of different dimensions. |
| `invert-profile <start-level> <reach-drops>` | `i,C` | Trace the channel floor boundary level at the downstream end of every reach. |
| `terrain-crossings <floor-levels> <ground-levels>` | `l,l` | Find exposed and buried distances from surveyed ground to the channel floor at each station. |
| `crest-freeboard <crests> <surfaces>` | `l,l` | Measure signed spare height from each water surface to its wall crest. Negative values indicate overtopping. |
| `source-strips <lengths> <channel-width> <max-run>` | `S,s,s` | Count full-width source strips for independently restarted reaches given coverage per source. |
| `drop-stations <length> <total-drop>` | `s,c` | Distribute whole elevation drops over a reach and report cumulative drop after each block. |
| `gate-openings <widths> <gate-heights> <lifts>` | `S,S,C` | Find open area across a bank of lifting sluices, clamping each lift to the gate height. |
| `supply-split <supply> <branch-limits> <requests>` | `c,C,C` | Deliver the available flow in branch priority order, respecting each branch intake limit. |
| `leak-trace <inlet> <reach-losses> <tributaries>` | `c,C,C` | Trace outlet flow per reach after leakage capped at incoming flow, then add local tributaries. |
| `reservoir-cycle <initial> <capacity> <receipts> <demands>` | `c,c,C,C` | Track storage through successive periods, spilling excess receipts before serving each demand. |
| `isolation-loss <gate-offsets> <end-offset> <breach>` | `indexes,s,c` | Find the half-open reach containing a breach between gates, including implicit end gates. |
| `lining-tiles <length> <inside-width> <wet-depth> <tile-area>` | `s,s,c,s` | Budget tiles for the bed and both wetted faces, rounding each face separately. |
| `settling-bays <flow> <hold-ticks> <bay-volume>` | `c,c,s` | Find whole settling bays providing the target holding time for a supplied flow. |
| `overflow-weirs <inflows> <main-limit> <weir-limit>` | `C,c,c` | Split supplied flow among the main channel, bypass weir and excess at each sample. |
| `channel-neck <widths> <depths> <required-area>` | `S,C,c` | Locate the first minimum wet cross section and the area missing from the design target. |
| `siphon-head <inlet> <low-point> <outlet>` | `i,i,i` | Measure both siphon legs and available elevation head from inlet to outlet. |
| `access-crossings <walk-offsets> <length>` | `indexes,s` | Find the longest gap between maintenance crossings including both ends, choosing the earliest tie. |
| `divider-walls <lanes> <reach> <depth> <thickness>` | `s,s,s,s` | Count blocks in continuous interior partitions between parallel water lanes. |
| `drop-pools <drops> <pool-length-per-drop> <width>` | `C,s,s` | Reserve receiving pool footprints sized in proportion to the fall at each drop. |
| `cover-slabs <length> <width> <opening-rows>` | `s,s,indexes` | Count roof slabs after leaving the listed distinct zero-based rows open across the channel. |
| `inlet-screen <opening-width> <bar-width> <max-gap>` | `s,s,s` | Find the fewest interior bars that divide an opening into gaps at most the supplied width. |
| `feeder-headroom <branch-flows> <trunk-limits>` | `C,C` | Compute signed spare trunk flow before each downstream takeoff assuming all branches are served. |
| `winter-drain <reach-volumes> <outlet-rates>` | `C,S` | Estimate parallel reach drainage time and the last reach to finish, choosing the earliest tie. |
| `inspection-route <leg-lengths> <closed-legs> <detours>` | `S,C,C` | Evaluate a maintenance route that uses a specified replacement length for each closed leg. |

## `viaduct`

To split a 17-block crossing with a five-block span limit, run `mc-agent viaduct span-balance 17 5`. The resulting spans are 5, 4, 4 and 4 blocks.

| Command | Types | Calculation |
| --- | --- | --- |
| `span-balance <crossing-length> <max-span>` | `s,s` | Split a crossing into the fewest spans under a limit, putting longer spans first. |
| `pier-chainage <clear-spans> <interior-pier-width>` | `S,s` | Locate the upstream edge of each interior pier from the start of the first clear span. |
| `deck-surface <span-lengths> <pier-widths> <traffic-width>` | `S,C,s` | Measure paved area across clear spans and supplied pier caps including both end caps. |
| `soffit-clearance <deck-tops> <deck-depths> <obstacle-tops>` | `l,S,l` | Measure vertical clearance from each obstacle top to the underside of the deck. |
| `pier-shafts <heights> <widths> <depths>` | `C,S,S` | Count masonry blocks in rectangular pier shafts with individual dimensions. |
| `hollow-piers <outside-width> <outside-depth> <height> <wall>` | `s,s,s,s` | Measure blocks saved by an open hollow core through a rectangular pier. |
| `corbel-layers <shaft-width> <cap-width> <max-step>` | `s,s,s` | List widths of symmetric corbel courses, advancing both sides up to the allowed step. |
| `footing-spread <width> <depth> <courses> <spread-per-side>` | `s,s,s,c` | Budget foundation blocks as each successive course expands on all four sides from the first course. |
| `bearing-pads <span-count> <beams-per-span> <blocks-per-seat>` | `s,s,s` | Count separate bearing pads under both ends of every beam including adjacent span ends. |
| `arch-ordinates <span> <rise>` | `s,c` | Sample a parabolic arch at each whole horizontal offset including both ends, rounding height down. |
| `spandrel-fill <arch-heights> <deck-base> <barrel-width>` | `C,c,s` | Fill between sampled arch crown boundaries and a level deck base across the barrel width. |
| `arch-centering <opening-heights> <bent-spacing>` | `C,s` | Budget temporary uprights at the first and last columns and every spacing interval between them. |
| `parapet-openings <length> <side-one> <side-two> <height>` | `s,C,C,s` | Count parapet blocks after subtracting total opening widths on each side. |
| `lane-envelope <deck-width> <edges> <lanes> <divider-width>` | `s,c,S,c` | Report spare deck width after edge strips on both sides, each lane and interior dividers. |
| `joint-offsets <span-lengths> <max-panel>` | `S,s` | Find interior deck joints, restarting panel spacing in each span and including every interior span boundary. |
| `expansion-gaps <panels> <growth-per-panel> <gap-capacities>` | `C,S,C` | Check independent joints against the combined growth of their assigned panels in the supplied length unit. |
| `approach-stairs <end-heights> <landing-every> <landing-length>` | `C,s,c` | Compute horizontal run for unit-rise steps with intermediate landings between flights. |
| `deck-camber <half-width> <crown-rise>` | `s,c` | Sample the symmetric stepped cross slope from left edge through the center to the right edge. |
| `pier-avoidance <proposed-offsets> <forbidden-bounds>` | `C,intervals` | Flag one-based proposed pier sites inside any inclusive exclusion interval. |
| `lift-batches <beam-weights> <lift-limit>` | `S,s` | Pack consecutive indivisible beams into lifts, starting a new lift when the next beam would exceed capacity. |
| `erection-fronts <span-work> <left-rate> <right-rate>` | `S,s,s` | Find a split of contiguous spans between end crews that minimizes completion ticks. Earliest split wins ties. |
| `staging-decks <span-work> <ready-piers>` | `C,C` | Identify spans with an outstanding workload and completed support piers at both ends. |
| `repair-possession <work-ticks> <window> <setup>` | `C,s,c` | Count work windows for resumable serial repairs after paying setup time in each window. |
| `deck-stockpiles <supply> <work-per-span> <reserve>` | `c,C,c` | Find how many consecutive whole spans can be completed while preserving a minimum stock. |
| `survey-deviation <start-level> <end-level> <observed>` | `i,i,l` | Measure signed deviations from the linear grade through design end levels at equally spaced stations. |
