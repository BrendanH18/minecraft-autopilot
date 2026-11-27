# Tunnel and canal planning

These 50 offline CLI commands print JSON with `result` and `note`. Use dimensions, times, and rates in consistent units. The estimates use the inputs you provide and describe idealized layouts and schedules. Each command runs without a Minecraft connection.

| Input type | Meaning |
| --- | --- |
| `n`, `q`, `p` | Signed, nonnegative, and positive numbers |
| `i`, `c`, `s` | Signed, nonnegative, and positive whole numbers |
| `r` | Fraction from 0 to 1 inclusive |
| `l`, `L`, `P`, `C`, `S` | Comma-separated lists of signed, nonnegative, positive, whole nonnegative, and whole positive numbers |
| `intervals` | One quoted JSON array of `[start,end]` pairs with each end at or after its start |

Numbers have magnitude at most 1,000,000. Lists and generated arrays are limited to 1,000 entries. Lists paired by index must have the same length. Use `--` before positional arguments beginning with a minus sign. Whole-unit estimates and inclusive budget checks follow the shared floating-point rounding policy where applicable.

## `tunnel-vent`

Use `mc-agent tunnel-vent hanger-layout 13 5 2` to place hangers at offsets 0, 5, 9, and 13 and count eight bracket pieces.

- Passage dimensions describe clear space before a retrofit. Cut estimates count whole cells. The trench cover occupies the top cell in each trench column. Side excavation in `retrofit-cut` ends at the old ceiling, and ceiling excavation spans the full new width.
- Offsets start at zero unless a signed origin is part of the input. Intervals use half-open bounds. Duplicate and overlapping ranges count once, touching ranges merge, and zero-length intersections are omitted. Hatch reach clips to both tunnel ends.
- Duct stock overlaps only at internal joints. Hanger gaps are whole cells and the longer gaps come first. Sleeve length includes both projections. The grate's dimensions are the aperture inside its frame.
- `conduit-fill` reports the individual cable diameter and aggregate area checks separately. A length from `cable-reel-allocation` includes the supplied tail at both ends and stays on one reel. Cuts preserve section order and move to a new reel only when the current one cannot supply the next cut. Stations, sections, phases, and reels are numbered from one.
- A missing damper is reported as `null`. Both dampers must be present to report an isolated length. Maintenance return walks use the same segments and speeds as the outbound leg. Panel stock is aggregated by the supplied width and height in that order. A closure in `retrofit-phases` reduces the usable width of the corresponding bore for its phase.

| # | Command | Input types | Behavior |
| --- | --- | --- | --- |
| 1 | `clear-profile <width> <height> <side-duct> <overhead-duct> <required-width> <required-height>` | `s,s,c,c,s,s` | Check the clear rectangular passage after a side duct and overhead duct consume space. |
| 2 | `parallel-duct-fit <width> <passage> <duct-width> <duct-gap> <wall-offset>` | `s,s,s,c,c` | Count identical ducts fitting beside a protected lane with gaps between ducts. |
| 3 | `retrofit-cut <length> <old-width> <old-height> <new-width> <new-height>` | `s,s,s,s,s` | Separate side and ceiling excavation for a rectangular bore enlargement. |
| 4 | `service-trench <length> <width> <depth> <conduit-width> <conduit-height>` | `s,s,s,s,s` | Budget a straight trench with a one-cell cover and backfill around its conduit. |
| 5 | `offset-riser <lower-y> <upper-y> <x-offset> <z-offset> <straight-ends>` | `i,i,i,i,c` | Measure a duct riser with two optional horizontal legs and specified straight end sections. |
| 6 | `opening-separation <intake-start> <intake-width> <exhaust-start> <exhaust-width> <minimum-gap>` | `i,s,i,s,c` | Compare half-open intake and exhaust footprints along one wall. |
| 7 | `duct-module-run <length> <module> <joint-overlap>` | `s,s,c` | Find the fewest standard duct modules and the trim at the far end. |
| 8 | `hanger-layout <length> <max-span> <pieces-per-hanger>` | `s,s,s` | Space hangers at both ends with nearly equal whole-cell gaps. |
| 9 | `access-gap-audit <length> <access-offsets> <max-distance>` | `s,C,q` | Find the farthest point from an access door, including the tunnel ends. |
| 10 | `hatch-coverage <length> <hatch-offsets> <reach-before> <reach-after>` | `s,C,c,c` | Count the length serviceable from hatches while clipping ends and merging overlaps. |
| 11 | `sleeve-lengths <wall-thicknesses> <inside-projection> <outside-projection> <stock-length>` | `S,c,c,s` | Check each wall crossing against an unspliced sleeve stock length. |
| 12 | `grate-free-area <width> <height> <vertical-bars> <horizontal-bars> <bar-width>` | `s,s,c,c,s` | Compute the free aperture of a framed opening with perpendicular bars. |
| 13 | `conduit-fill <opening-width> <opening-height> <cable-diameters> <cable-counts> <max-fill>` | `p,p,P,C,r` | Compare circular cable area with a rectangular opening and a supplied fill limit. |
| 14 | `cable-reel-allocation <section-lengths> <end-tail> <reel-length>` | `S,c,s` | Allocate consecutive unspliced cable sections to reels with slack at both ends. |
| 15 | `pull-section-check <section-lengths> <bend-counts> <max-length> <max-bends>` | `P,C,p,c` | Flag cable pull sections exceeding either length or bend limits. |
| 16 | `branch-isolation <length> <damper-offsets> <work-offset>` | `s,C,c` | Find the two available dampers that bound work at a duct location. |
| 17 | `bottleneck-profile <opening-widths> <opening-heights> <blockage-areas>` | `S,S,C` | Find the narrowest usable cross section among surveyed duct stations. |
| 18 | `ceiling-conflicts <duct-ranges> <restricted-ranges>` | `intervals,intervals` | Locate the merged portions of ceiling ducts that overlap restricted headroom zones. |
| 19 | `slope-headroom <floor-levels> <duct-bottoms> <required-clearance>` | `l,l,p` | Check paired floor and duct elevations for overhead clearance at each survey station. |
| 20 | `shaft-landing-check <shaft-width> <shaft-depth> <landing-width> <landing-depth> <edge-margin>` | `s,s,s,s,c` | Check whether a landing leaves usable access inside a shaft after edge setbacks. |
| 21 | `maintenance-lap <segment-lengths> <walk-speeds> <service-times>` | `L,P,L` | Budget a round trip with one service stop after each outbound segment. |
| 22 | `simultaneous-closures <left-closures> <right-closures> <max-full-closure>` | `intervals,intervals,q` | Find times when both bores are shut and test the longest uninterrupted closure. |
| 23 | `missing-panels <panel-widths> <panel-heights> <needed-counts> <stock-counts>` | `S,S,C,C` | Find replacement panel shortages by exact dimensions without rotating the panels. |
| 24 | `bypass-detour <original-run> <offset> <transition-run> <blocked-length>` | `s,s,s,s` | Estimate a bypass with two rectilinear transitions around a blocked duct segment. |
| 25 | `retrofit-phases <bore-widths> <work-closures> <required-open-width>` | `S,C,c` | Check independent work phases when one bore at a time loses some of its width. |

## `canal-lock`

Use `mc-agent canal-lock flight-lifts -- -5 8 5` to lay out three stages with lifts of five, four, and four cells.

- Plan dimensions are usable chamber dimensions unless a wall or gate dimension is specified. Freeboard is height above the top water level. `wall-blocks` counts two side walls along the chamber's clear length. `gate-positions` returns half-open intervals for solid gates and chamber spaces, measured from the start of the approach. A gate between chambers is counted once.
- `fill-schedule` starts at time zero with changeover between each pair of stages. `cascade-reserve` credits each returned volume only after paying the full withdrawal for that stage. Reservoir drawdown assumes a constant surface area. In `refill-plan`, a level of 0 is low and 1 is high. A direction of 0 sends a boat from high to low and 1 from low to high. The totals include a fill or drain needed to reach a boat's entry level.
- Holding gaps go between rows and lanes. End clearance for a convoy applies at both ends. `draft-window` returns the inclusive time interval, measured from zero, that meets the supplied depth requirement, or `null` if no part does.
- Grade means rise divided by horizontal run. Each towpath stair advances one elevation cell per step. Crossings are counted as one layer of deck blocks. Side lining covers the two long walls only. Bumpers each occupy one longitudinal cell and both paths of bumpers share the same spacing. A berm widens outward by the supplied step at each layer below the top.

| # | Command | Input types | Behavior |
| --- | --- | --- | --- |
| 1 | `flight-lifts <lower-level> <upper-level> <max-lift>` | `i,i,s` | Split a rise into the fewest lock stages with nearly equal whole-cell lifts. |
| 2 | `chamber-clearance <length> <width> <boat-length> <boat-width> <end-clearance> <side-clearance>` | `s,s,s,s,c,c` | Verify a boat fits a chamber with the chosen clearance on every side. |
| 3 | `sill-margin <water-level> <bed-level> <sill-level> <draft> <under-keel>` | `i,i,i,p,q` | Check clearance over whichever is higher, the lock sill or approach bed. |
| 4 | `wall-crest <chamber-floor> <low-water-depth> <lift> <freeboard> <existing-crest>` | `i,s,s,c,i` | Find the required crest elevation and the additional height for each wall. |
| 5 | `chamber-fill <length> <width> <lift> <fixed-displacement>` | `s,s,s,c` | Count the volume between water levels after subtracting solid cells in that layer. |
| 6 | `fill-schedule <water-volumes> <inflow-rates> <loss-rates> <changeover-time>` | `L,P,L,q` | Schedule consecutive fills with separate net inflow rates and gaps between chambers. |
| 7 | `cascade-reserve <fill-volumes> <returned-volumes>` | `C,C` | Find the starting reserve that funds each chamber before reclaimed water arrives. |
| 8 | `wall-blocks <length> <low-water-depth> <lift> <freeboard> <wall-thickness> <foundation-depth>` | `s,s,s,c,s,c` | Separate the two straight side walls into submerged, crest, and foundation block counts. |
| 9 | `gate-span <opening-width> <left-leaf> <right-leaf> <required-overlap>` | `s,s,s,c` | Check the closed span of two gate leaves measured inward from the sides. |
| 10 | `gate-positions <chamber-lengths> <gate-thickness> <approach-length>` | `S,s,c` | Locate gates when each neighboring pair of chambers shares one gate. |
| 11 | `transit-window <window-time> <startup-time> <passage-time> <reset-time>` | `q,q,p,q` | Count complete passages in a time window, with startup once and reset only between passages. |
| 12 | `approach-holding <length> <width> <boat-length> <boat-width> <length-gap> <side-gap>` | `s,s,s,s,c,c` | Count waiting boats in a rectangular holding area with clearance between rows and lanes. |
| 13 | `convoy-load <length> <boat-lengths> <boat-gap> <end-clearance>` | `s,S,c,c` | Load the longest fitting prefix of a single-file boat queue. |
| 14 | `reservoir-buffer <surface-area> <allowed-drop> <fill-volume> <protected-reserve>` | `p,q,p,q` | Budget whole lock fills from a reservoir after holding back protected water. |
| 15 | `equalization-check <chamber-level> <lower-level> <upper-level> <level-tolerance>` | `n,n,n,q` | Find each gate water-level difference and test the caller-supplied tolerance. |
| 16 | `refill-plan <directions> <starting-level> <fill-volume>` | `C,c,s` | Count fills and drains serving up and down transits in their supplied order. |
| 17 | `towpath-ramp <lift> <max-grade> <landing-length> <available-run>` | `s,p,c,c` | Check the shortest whole-cell towpath ramp run including two landings. |
| 18 | `towpath-embankment <ramp-width> <rise> <run-per-step> <peak-landing>` | `s,s,s,c` | Count fill under a stepped towpath and its top landing. |
| 19 | `towpath-crossings <chamber-length> <crossing-offsets> <crossing-width> <water-span> <bank-overhang>` | `s,C,s,s,c` | Check crossing deck footprints and count deck blocks including both overhangs. |
| 20 | `draft-window <initial-depth> <final-depth> <duration> <draft> <under-keel>` | `q,q,p,p,q` | Find the interval with enough draft during a supplied linear change in water depth. |
| 21 | `lining-repair <chamber-length> <chamber-width> <water-depth> <floor-damage> <side-damage> <spare-fraction>` | `s,s,s,r,r,r` | Budget floor and side lining replacements separately, then add spare stock. |
| 22 | `approach-profile <chainages> <bed-levels> <max-grade>` | `L,l,q` | Find approach bed segments steeper than a supplied absolute rise-to-run limit. |
| 23 | `cycle-baseline <entry-time> <seal-time> <level-change-time> <exit-time> <reset-time> <boats-per-cycle>` | `q,q,q,q,q,s` | Budget an outbound-and-reset cycle and its average time per loaded boat. |
| 24 | `chamber-bumpers <length> <width> <end-clearance> <max-uncovered-gap> <bumper-width>` | `s,s,c,c,s` | Fit identical bumpers on both side walls while keeping a central boat lane. |
| 25 | `bank-berms <length> <height> <top-width> <outward-step> <banks>` | `s,s,s,c,s` | Count stepped berm fill and the footprint of one or two banks. |
