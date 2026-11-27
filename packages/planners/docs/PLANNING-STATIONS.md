# Station planning

These 50 offline commands plan furnace banks and brewing benches from caller-supplied layouts, stocks, rates, and timing assumptions. They return JSON and operate without world access. Supply game-specific recipe compatibility, capacity, rates, and effect durations explicitly.

Use matching units throughout a calculation. The input codes are `c` for a nonnegative whole count, `s` for a positive whole count, `q` for a nonnegative number, `p` for a positive number, and `r` for a fraction from 0 to 1. Uppercase types are comma-separated lists of the corresponding scalar. Lists with paired positions must match in length. Values are at most 1,000,000, and lists and generated output have at most 1,000 entries. All indices are one-based.

`intervals` takes a quoted JSON array of [start, end] pairs with start at most end. `points3` takes a quoted JSON array of three-value rows. List inputs contain at least one row.

## `furnace-bank`

| # | Command | Types | Calculation |
| --- | --- | --- | --- |
| 1 | `bay-layout <zone-sizes> <bay-capacity> <separator>` | `C,s,c` | Lay out each zone in exclusive inline bays with separator blocks between bays. |
| 2 | `branch-feeders <row-widths> <reach>` | `C,c` | Count centered feeders covering disjoint row segments and the longest branch at each row. |
| 3 | `zone-expansion <installed> <additional> <bay-capacity>` | `C,C,s` | Find added bays after taking up vacant places in the existing bays of each zone. |
| 4 | `panel-address <row-widths> <furnace>` | `C,s` | Look up the one-based row and column of a furnace on a densely numbered panel. |
| 5 | `aisle-footprint <row-widths> <aisle> <end-clearance>` | `S,c,c` | Find the floor footprint of parallel single-block rows, with end clearance on both sides. |
| 6 | `dedicated-overflow <demand> <capacities>` | `C,C` | Meet ordinary, blast and smoker demand in dedicated zones, then fill specialist shortfalls from regular capacity. |
| 7 | `fallback-overhead <blast-items> <smoker-items> <regular-seconds> <blast-seconds> <smoker-seconds>` | `c,c,p,p,p` | Price specialist overflow to regular furnaces in additional furnace-seconds. |
| 8 | `retrofit-minimum <installed> <regular-items> <specialist-items> <regular-seconds> <specialist-seconds> <window>` | `c,c,c,p,p,q` | Find the fewest furnace conversions that meet both quotas within one window. |
| 9 | `zone-dispatch <zone-furnaces> <job-zones> <job-items> <item-seconds-by-zone> <releases>` | `C,S,S,P,L` | Assign release-ordered indivisible jobs within their compatible zones. |
| 10 | `staggered-output <zone-furnaces> <gap> <window> <item-seconds>` | `C,q,q,p` | Count completions in zones fired at fixed gaps, starting with the first zone at zero. |
| 11 | `peak-start-load <starts> <start-costs> <window>` | `C,C,s` | Find the heaviest ignition load in one half-open window, with earliest start-event ties. |
| 12 | `activation-waves <zone-sizes> <starts-per-wave> <gap>` | `S,s,p` | Pack consecutive intact zones into waves under a limit on simultaneous starts. |
| 13 | `outage-output <zone-furnaces> <stops> <restarts> <item-seconds> <window>` | `C,C,C,S,c` | Count output before and after each planned outage, dropping partial progress at shutdown. |
| 14 | `loaders-needed <zone-furnaces> <load-seconds> <refill-periods> <busy-fraction>` | `C,P,P,r` | Estimate crew for independent refill cadences, with a limit on each loader’s productive fraction. |
| 15 | `sorter-reservation <zone-rates> <lane-rate>` | `L,p` | Compare separate sorter lanes per zone with shared lanes for the same continuous flow. |
| 16 | `feed-pulse-overflow <offsets> <periods> <pulse-items> <ticks> <trunk-limit>` | `C,S,C,c,c` | Trace rejected items from overlapping discrete feed pulses when there is no trunk buffer. |
| 17 | `pickup-pass <output-by-zone> <visit-order> <carry-limit>` | `C,S,c` | Allocate carry capacity on one pickup pass through distinct selected zones. |
| 18 | `partial-progress <queued> <elapsed> <item-seconds> <seconds>` | `C,C,S,c` | Project each furnace queue using elapsed work on the leading item. |
| 19 | `drain-phases <furnaces> <item-period> <start-step> <trunk-per-tick>` | `c,s,c,c` | Measure steady synchronized drain bursts from regularly offset furnace start clocks. |
| 20 | `dedicated-rack-fit <incoming> <rack-slots> <reserved-slots> <stack-sizes>` | `C,C,C,S` | Budget independent output racks without consuming reserved slots. |
| 21 | `staggered-refills <stocks> <burns-per-round> <reserve> <delivery-lot> <rounds>` | `C,C,c,s,c` | Route one refill each round to the largest impending fuel deficit before deciding which zones can run. |
| 22 | `outfeed-recovery <backlog> <drain> <steady> <burst> <burst-ticks>` | `c,s,c,c,c` | Budget recovery of a shared output queue while steady arrivals continue after a burst. |
| 23 | `purge-sequence <products> <run-items> <residue-depth>` | `S,C,c` | Track quarantined items until shared-line carryover from a previous product is cleared. |
| 24 | `upgrade-rate <zone-furnaces> <item-seconds> <dedicated-rates> <shared-rate> <added-furnaces>` | `C,P,L,q,c` | Compare adding all new furnaces to each zone under local and shared transfer limits. |
| 25 | `circuit-collection <item-seconds> <visit-order> <leg-seconds> <slots-per-furnace> <stack-size> <seconds-per-stack>` | `S,S,C,s,s,c` | Schedule one collector circuit with travel and loading time carried into later visits. |

Zones follow input order. Bays occupy their full width even when partially filled. A separator goes between adjacent bays, and an empty zone has no start block. Branch feeders occupy the center block of each full segment or one of the two middle blocks of an even short segment. End clearance applies to both ends of the longest row, and aisles fill the gaps between rows.

`dedicated-overflow` expects ordinary, blast, and smoker item counts and capacity in that order. It prioritizes ordinary work on regular furnaces, then fills excess blast demand before excess smoker demand. `retrofit-minimum` assumes specialized items can also run on regular furnaces and can share each furnace’s available whole-item slots with ordinary items. It returns null when the quotas are infeasible.

Each dispatched job stays on one furnace. Jobs enter the queue in nondecreasing release order. A job takes the lowest-numbered available furnace at release, or the earliest-free furnace with lower-numbered ties. An outage stops processing during its window and clears partial work at a nonempty stop. Ignition windows include the start and exclude the end. A refilling round sends at most one delivery to the zone with the largest impending deficit, with input order breaking ties. A zone skips the whole round if its protected reserve would be crossed.

Feed pulse traces start at tick 0. Unserved pulses have no carryover, while `outfeed-recovery` models a queued backlog and returns null for one that steady production cannot clear. A collection circuit starts with empty furnace outputs and takes all output that fits each furnace’s slots at arrival, counting missed production as blocked. Its leg times run from one departure to the next arrival.

For example, `mc-agent furnace-bank dedicated-overflow 4,7,5 8,4,2` leaves two smoker items unmet after using the four spare regular slots.

## `brewing-bench`

| # | Command | Types | Calculation |
| --- | --- | --- | --- |
| 1 | `forked-runs <variant-quotas> <bottles-per-stand>` | `C,s` | Pool common-base runs while keeping variant batches separate at the finish bench. |
| 2 | `modifier-budget <variant-quotas> <bottles-per-stand> <modifier-ids> <units-per-run>` | `C,s,S,S` | Budget whole variant batches and consolidate modifier costs by ingredient ID. |
| 3 | `prefix-reuse <first-bottles> <second-bottles> <first-stages> <second-stages> <bottles-per-stand>` | `c,c,S,S,s` | Pool the longest shared recipe prefix and separate all steps after the fork. |
| 4 | `resume-stages <wanted> <stock-after-each-stage> <bottles-per-stand>` | `c,C,s` | Work backward from a finished quota and reuse partially brewed stock at each stage. |
| 5 | `fuel-per-stand <runs> <charges-per-run> <installed-charges> <refill-charges>` | `C,S,C,s` | Buy whole fuel refills for assigned stand workloads without sharing installed charges. |
| 6 | `prioritized-variants <quotas> <ready-base-bottles> <bottles-per-stand> <modifier-stocks> <modifier-per-run>` | `C,c,s,C,S` | Allocate pooled base bottles in variant priority order under independent modifier budgets. |
| 7 | `stage-windows <stage-seconds> <opens> <closes> <bottles-ready>` | `P,L,L,q` | Find the earliest uninterrupted execution of successive brewing stages in their availability windows. |
| 8 | `forked-timeline <quotas> <bottles-per-stand> <base-stands> <finish-stands> <base-seconds> <finish-seconds-by-variant>` | `C,s,s,s,p,P` | Schedule finish batches as pooled base bottles become ready on separate stands. |
| 9 | `rack-order <variant-bottles> <rack-widths>` | `C,S` | Allocate each nonempty variant to one contiguous shelf segment, preserving display order. |
| 10 | `label-ranges <bottle-quotas> <bottles-per-label> <first-label>` | `C,s,s` | Reserve consecutive run labels for each variant without reusing another variant’s partial label. |
| 11 | `bottle-reuse <empty-stock> <filled-stock> <doses-used> <returned-empties> <next-batch>` | `C,C,C,C,C` | Reconcile consumed filled bottles and returned empties before preparing the next session. |
| 12 | `water-rounds <bottles> <water-on-bench> <reserve> <units-per-fetch> <seconds-per-fetch> <seconds-per-fill>` | `c,c,c,s,q,q` | Estimate water replenishment trips and filling time for a single operator. |
| 13 | `effect-renewals <coverage-windows> <duration>` | `intervals,p` | Count doses to cover required time windows, carrying active time between windows. |
| 14 | `simultaneous-doses <players-by-group> <targets-per-dose> <doses>` | `C,S,c` | Serve complete groups in priority order when a dose cannot be shared between groups. |
| 15 | `effect-chain <dose-starts> <effect-durations>` | `L,P` | Measure overlap, gaps and unique active time when repeated doses of one effect can overlap. |
| 16 | `breakage-at-stage <starting-bottles> <bottles-per-stand> <losses-after-stages>` | `c,s,C` | Account for stand slots used and surviving bottles under supplied step-by-step losses. |
| 17 | `ingredient-replenish <stage-ingredients> <stage-needs> <stocks> <refill-sizes>` | `S,C,C,S` | Plan just-in-time ingredient pulls from whole refill packs in recipe-stage order. |
| 18 | `rack-rebalance <rack-stocks> <rack-capacities> <minimum-reserves>` | `C,C,C` | Move identical bottles between racks to meet all minimum reserves with the fewest transfers by bottle count. |
| 19 | `charged-batches <charges-by-stand> <charges-per-batch> <bottles-per-stand>` | `C,s,s` | Measure complete fuel-funded batches and the opportunity stranded by separating charges across stands. |
| 20 | `salvage-clock <stage-seconds> <completed-stages> <elapsed-in-stage> <handoff-delay>` | `P,c,q,q` | Compare finishing a handed-off partial batch with restarting the recipe while keeping both finish clocks explicit. |
| 21 | `fill-and-brew <bottles> <bottles-per-stand> <stands> <load-seconds-per-bottle> <brew-seconds>` | `c,s,s,q,p` | Schedule one serial loader serving reusable brew stands without intermediate staging. |
| 22 | `stand-downtime <stage-seconds> <session-start> <stop-windows>` | `P,q,intervals` | Project sequential finish clocks when one stand pauses during downtime and resumes its progress. |
| 23 | `staging-slots <staging-windows> <bottles> <rack-slots>` | `intervals,C,c` | Find peak temporary rack usage and its first overflow under half-open staging windows. |
| 24 | `changeover-budget <base-ids> <variant-ids> <base-switch-seconds> <variant-switch-seconds>` | `S,S,q,q` | Compare source order with grouped base and variant preparation, preserving order within each group. |
| 25 | `reserve-deadlines <starting-stock> <receipts> <pickups>` | `C,points3,points3` | Apply variant receipts before same-clock pickups and report each expiring shortage. |

Separate variants round up independently when a batch cannot mix variants. A shared base can use all available slots even when the same bottles later go to different variants. In `forked-timeline`, separate finishing stands receive bottles as soon as their pooled base waves finish. The next batch takes the lowest-numbered free stand or the first stand to become free. `fill-and-brew` keeps a stand occupied from the start of loading to the end of brewing.

Rack placements skip empty or unplaceable variants and preserve display order for the rest. Reserve balancing is for interchangeable bottles and returns null if total stock cannot cover the minima. A declared reserve may still require a water fetch when a session has zero fills. `salvage-clock` applies the handoff delay to continuing unfinished work; a restart is measured from now.

Coverage, downtime, and staging windows include their start and exclude their end. Effect overlap counts redundant dose time, gaps exclude time before the first activation, and positive downtime pauses progress on the current stage. Staged bottles that leave at the same clock that others arrive free space before capacity is assessed.

Both `reserve-deadlines` row lists use [time, variant, bottles], with whole values and variant indices into starting stock. Same-time receipts arrive before pickups, and pickups with equal clocks keep their submitted order. Shortages expire at pickup. Use a row such as `[[0,1,0]]` when there are no receipts. Stock is measured through the last pickup.

For example, `mc-agent brewing-bench forked-runs 4,2,0 3` budgets two common-base runs and three separate finish runs.
