# Resource planning tools

These 250 commands run offline, print JSON, and never contact a bridge or execute actions. All numeric assumptions come from the caller. Use matching units (for example, rates per minute with times in minutes). Reports do not establish recipes, safe routes, actual crop growth, or successful execution.

Arguments: `n` signed number, `q` nonnegative, `p` positive, `c` whole nonnegative, `s` whole positive, `r` fraction in [0,1]. CSV lists use `l` signed, `L` nonnegative, `P` positive, `C` whole nonnegative, `S` whole positive. Numeric magnitudes are at most 1,000,000; lists and generated sequences have at most 1,000 entries. Multi-list calculations require matching lengths unless documented otherwise. Indices are one-based. Zero denominators and infeasible plans are rejected or explicitly return null where documented. Computed equality comparisons and whole-unit rounding tolerate only narrow floating-point roundoff using the shared resource rounding policy. Use `--` before positional arguments containing negative CSV values, for example `mc-agent replenish safety-from-errors -- '-2,2' 2`.

## `queueplan`

Offline deterministic job queues with supplied arrival times and service durations; no game scheduling guarantees.

| # | Command | Input types | Behavior |
| --- | --- | --- | --- |
| 1 | `fcfs <arrivals> <services>` | `L,P` | Schedule a single server in source order; arrivals must be nondecreasing. |
| 2 | `waits <arrivals> <services>` | `L,P` | Extract waiting times from the deterministic first-come queue. |
| 3 | `turnaround <arrivals> <services>` | `L,P` | Measure elapsed time from each arrival to completion. |
| 4 | `idle-gaps <arrivals> <services>` | `L,P` | Measure server idle gaps immediately before each source-order job. |
| 5 | `completion-deadlines <arrivals> <services> <deadlines>` | `L,P,L` | Compare each completion with its absolute supplied deadline. |
| 6 | `mean-wait <arrivals> <services>` | `L,P` | Average queue waiting time across supplied jobs. |
| 7 | `busy-fraction <arrivals> <services>` | `L,P` | Measure busy time divided by the clock through last completion. |
| 8 | `finish-window <arrivals> <services> <from> <until>` | `L,P,q,q` | List one-based jobs completing in a closed time window. |
| 9 | `backlog-at <arrivals> <services> <time>` | `L,P,q` | Count arrived but unfinished jobs at a time; completion wins ties. |
| 10 | `remaining-work <arrivals> <services> <time>` | `L,P,q` | Sum unserved work for jobs already arrived at a time. |
| 11 | `clearance <arrivals> <services>` | `L,P` | Measure time from first arrival through final completion. |
| 12 | `maximum-wait <arrivals> <services>` | `L,P` | Find worst waiting time and first one-based job attaining it. |
| 13 | `service-shares <services>` | `P` | Normalize job service durations to their shares of total work. |
| 14 | `shortest-first <services>` | `P` | Order all immediately available jobs by shortest processing time with stable ties. |
| 15 | `weighted-order <services> <weights>` | `P,P` | Rank immediately available jobs by service per positive priority weight. |
| 16 | `earliest-deadline <services> <deadlines>` | `P,L` | Schedule ready jobs by increasing absolute deadline with source-order ties. |
| 17 | `slack-order <services> <deadlines> <now>` | `P,L,q` | Rank ready jobs by deadline minus current time minus duration. |
| 18 | `parallel-dispatch <services> <servers>` | `P,s` | Greedily dispatch source-order ready jobs to the first least-busy server. |
| 19 | `parallel-loads <services> <servers>` | `P,s` | Report greedy source-order final server loads including unused servers. |
| 20 | `parallel-makespan <services> <servers>` | `P,s` | Find the completion time of the final greedily dispatched job. |
| 21 | `longest-first-dispatch <services> <servers>` | `P,s` | Dispatch longest ready jobs first and preserve their original identities. |
| 22 | `batch-arrivals <jobs> <interval> <batch-size>` | `c,p,s` | Generate deterministic equally spaced arrival batches, first at zero. |
| 23 | `wait-threshold <arrivals> <services> <maximum-wait>` | `L,P,q` | List one-based jobs whose queued wait exceeds a supplied threshold. |
| 24 | `service-speedup <arrivals> <services> <factor>` | `L,P,p` | Recompute queue finishes after dividing every service duration by a factor. |
| 25 | `arrival-shift <arrivals> <services> <delay>` | `L,P,q` | Delay arrivals uniformly and report resulting absolute finishes. |

Example: `mc-agent queueplan fcfs '0,1,5' '2,3,1'` returns `result: [{"start": 0, "finish": 2, "wait": 0}, {"start": 2, "finish": 5, "wait": 1}, {"start": 5, "finish": 6, "wait": 0}]`.

## `replenish`

Offline inventory control from caller-supplied demand, lead times, and costs. Fractional fluid stock unless whole units are named.

| # | Command | Input types | Behavior |
| --- | --- | --- | --- |
| 26 | `inventory-position <on-hand> <on-order> <backorders>` | `q,q,q` | Compute signed stock position including outstanding orders and backorders. |
| 27 | `review-order <position> <target> <pack>` | `n,q,s` | Round positive order-up-to shortfall to whole vendor packs. |
| 28 | `lead-demand <rates> <durations>` | `L,L` | Budget variable demand across explicitly supplied lead-time phases. |
| 29 | `review-target <daily-demand> <lead-days> <review-days> <safety-stock>` | `q,q,q,q` | Compute target covering lead time plus periodic review and a safety amount. |
| 30 | `coverage-days <position> <daily-demand>` | `n,p` | Report signed coverage duration including backorders. |
| 31 | `order-trigger <position> <reorder-level>` | `n,q` | Test whether signed inventory position has reached the supplied trigger. |
| 32 | `order-gap <on-hand> <deliveries> <demands>` | `q,L,L` | Project signed closing stock after each paired receipt and demand period. |
| 33 | `stockout-period <on-hand> <deliveries> <demands>` | `q,L,L` | Find the first one-based period with negative closing stock, or null. |
| 34 | `backorder-area <on-hand> <deliveries> <demands>` | `q,L,L` | Sum negative closing stock magnitudes over equal-duration periods. |
| 35 | `positive-stock-area <on-hand> <deliveries> <demands>` | `q,L,L` | Sum positive closing stock over equal-duration periods for holding estimates. |
| 36 | `economic-order <annual-demand> <order-cost> <unit-holding-cost>` | `q,p,p` | Compute continuous economic order quantity under constant-demand assumptions. |
| 37 | `orders-per-year <annual-demand> <order-quantity>` | `q,p` | Estimate continuous annual orders at a supplied lot size. |
| 38 | `order-cycle <order-quantity> <daily-demand>` | `q,p` | Estimate constant-demand duration between identical replenishment lots. |
| 39 | `cycle-stock <order-quantity> <safety-stock>` | `q,q` | Estimate mean stock for instantaneous replenishment and linear depletion. |
| 40 | `annual-policy-cost <annual-demand> <lot> <order-cost> <holding-cost>` | `q,p,q,q` | Sum annual ordering and cycle-stock holding costs, excluding purchase cost. |
| 41 | `purchase-budget <annual-demand> <unit-price> <policy-cost>` | `q,q,q` | Add annual purchase spend to a separately supplied policy cost. |
| 42 | `safety-from-errors <forecast-errors> <multiplier>` | `l,q` | Scale population standard deviation of supplied forecast errors. |
| 43 | `lead-variability <daily-sd> <lead-days> <multiplier>` | `q,q,q` | Estimate demand safety stock under independent equal-variance days. |
| 44 | `lead-time-variability <daily-demand> <lead-sd> <multiplier>` | `q,q,q` | Estimate safety stock from lead-time variability at constant daily demand. |
| 45 | `combined-variability <daily-mean> <daily-sd> <lead-mean> <lead-sd> <multiplier>` | `q,q,q,q,q` | Combine independent demand and lead-time variance assumptions. |
| 46 | `service-fill <demand> <immediately-filled>` | `p,q` | Compute immediate unit fill fraction, rejecting overfilled demand. |
| 47 | `shelf-expiry <lot> <daily-demand> <shelf-days>` | `q,q,q` | Estimate units left when a deterministic shelf-life deadline arrives. |
| 48 | `minimum-lot <wanted> <minimum-order> <increment>` | `q,q,s` | Apply a minimum order only to positive demand and round by increment. |
| 49 | `open-order-due <quantities> <due-days> <horizon>` | `L,L,q` | Sum outstanding receipts due at or before a supplied horizon. |
| 50 | `expedite-need <on-hand> <demand-rate> <regular-lead> <safety>` | `q,q,q,q` | Estimate additional units to bridge regular lead time while retaining safety stock. |

Example: `mc-agent replenish inventory-position 10 5 3` returns `result: 12`.

## `haul`

Offline transport arithmetic with supplied capacities, distances, speeds, and costs. Loads are divisible unless units or trips are named.

| # | Command | Input types | Behavior |
| --- | --- | --- | --- |
| 51 | `round-trip-clock <outbound> <inbound> <speed> <loading> <unloading>` | `q,q,p,q,q` | Sum travel and terminal service time for one supplied transport cycle. |
| 52 | `fleet-throughput <vehicles> <capacity> <cycle-time>` | `s,p,p` | Estimate ideal steady divisible flow from identical circulating vehicles. |
| 53 | `fleet-for-flow <flow> <capacity> <cycle-time>` | `q,p,p` | Find whole identical vehicles for an ideal requested sustained flow. |
| 54 | `outbound-loads <units> <capacity>` | `c,p` | List bounded whole-unit trip loads with the last load partial. |
| 55 | `return-backhaul <outbound-units> <return-units> <capacity>` | `q,q,p` | Count round trips sharing outbound and return capacity independently. |
| 56 | `loaded-distance <loads> <distances>` | `L,L` | Sum quantity-distance work across separately supplied legs. |
| 57 | `empty-ratio <loaded-distance> <empty-distance>` | `q,q` | Measure empty travel fraction, leaving zero travel undefined. |
| 58 | `payload-utilization <loads> <capacity>` | `L,p` | Measure mean load fraction for supplied capacity-valid trips. |
| 59 | `vehicle-distance <trips> <outbound> <returning>` | `c,q,q` | Sum route distance over whole round trips. |
| 60 | `trip-cost <distance> <distance-cost> <service-cost>` | `q,q,q` | Estimate one trip cost with distance and fixed terminal charges. |
| 61 | `shipment-cost <units> <capacity> <trip-charge> <unit-handling>` | `q,p,q,q` | Estimate whole-trip charges plus per-unit handling for a shipment. |
| 62 | `split-haulers <units> <capacities>` | `q,P` | Fill heterogeneous vehicle loads in source priority order once. |
| 63 | `fleet-capacity-gap <units> <capacities>` | `q,P` | Report unshipped quantity after one pass of a heterogeneous fleet. |
| 64 | `transit-inventory <flow> <travel-time>` | `q,q` | Estimate divisible cargo in transit under a steady supplied flow. |
| 65 | `loading-bottleneck <load-rates> <vehicle-flow>` | `P,q` | Compare one vehicle flow against independently required terminal load rates. |
| 66 | `convoy-completion <vehicles> <dispatch-gap> <travel-time>` | `s,q,q` | Compute first and last arrival clocks for a regularly dispatched convoy. |
| 67 | `arrival-clock <departures> <travel-times>` | `L,L` | Add independent departure and transit durations per shipment. |
| 68 | `late-shipment <departures> <travel-times> <deadlines>` | `L,L,L` | List one-based shipments whose supplied transit misses its deadline. |
| 69 | `staging-need <arrivals> <loads> <departure>` | `L,L,q` | Sum cargo staged by a supplied departure time, including ties. |
| 70 | `handling-clock <units> <load-rate> <unload-rate>` | `q,p,p` | Sum sequential loading and unloading durations for a divisible shipment. |
| 71 | `relay-time <distances> <speeds> <transfer-delays>` | `P,P,L` | Sum travel for a relay with one terminal delay per leg. |
| 72 | `rate-distance-penalty <old-cycle> <extra-distance> <speed> <capacity>` | `p,q,p,p` | Compare ideal flow before and after an added route distance. |
| 73 | `shared-departure <ready-times> <cutoff>` | `L,q` | Partition shipment indices by whether they are ready at a cutoff. |
| 74 | `weight-volume-limit <weight-cap> <volume-cap> <unit-weight> <unit-volume>` | `q,q,p,p` | Find whole identical units limited jointly by weight and volume. |
| 75 | `partial-departure-cost <loads> <capacity> <fixed-cost>` | `L,p,q` | Compare actual charged departures with ideal fully consolidated departures. |

Example: `mc-agent haul round-trip-clock 10 20 5 2 3` returns `result: 11`.

## `bufferplan`

Offline capped fluid buffers with caller-supplied per-period inflow and withdrawal. Receipts occur before withdrawal; unmet withdrawals are not backordered.

| # | Command | Input types | Behavior |
| --- | --- | --- | --- |
| 76 | `trace <initial> <inflows> <withdrawals> <capacity>` | `q,L,L,p` | Simulate capped storage and unmet demand at each period end. |
| 77 | `closing-stock <initial> <inflows> <withdrawals> <capacity>` | `q,L,L,p` | Extract closing stock from the bounded buffer trace. |
| 78 | `spilled-units <initial> <inflows> <withdrawals> <capacity>` | `q,L,L,p` | Sum receipts discarded before demand due to capacity limits. |
| 79 | `unmet-units <initial> <inflows> <withdrawals> <capacity>` | `q,L,L,p` | Sum withdrawals that could not be served from capped storage. |
| 80 | `first-shortage <initial> <inflows> <withdrawals> <capacity>` | `q,L,L,p` | Return first one-based shortage period or null. |
| 81 | `first-overflow <initial> <inflows> <withdrawals> <capacity>` | `q,L,L,p` | Return first one-based overflow period or null. |
| 82 | `served-fraction <initial> <inflows> <withdrawals> <capacity>` | `q,L,L,p` | Compute total withdrawal fill fraction; zero demand has null fraction. |
| 83 | `mean-closing <initial> <inflows> <withdrawals> <capacity>` | `q,L,L,p` | Average period-end capped stock levels. |
| 84 | `capacity-occupancy <initial> <inflows> <withdrawals> <capacity>` | `q,L,L,p` | Compute mean closing-stock fraction of supplied capacity. |
| 85 | `empty-periods <initial> <inflows> <withdrawals> <capacity>` | `q,L,L,p` | List one-based periods ending with an empty buffer. |
| 86 | `reserve-breaches <initial> <inflows> <withdrawals> <capacity> <reserve>` | `q,L,L,p,q` | List one-based periods ending strictly below a supplied reserve. |
| 87 | `capacity-comparison <initial> <inflows> <withdrawals> <capacities>` | `q,L,L,P` | Compare total spill and shortage across supplied candidate capacities. |
| 88 | `unbounded-peak <initial> <inflows> <withdrawals>` | `q,L,L` | Find maximum stock before withdrawal when negative stock is allowed. |
| 89 | `minimum-initial <inflows> <withdrawals>` | `L,L` | Find initial stock preventing negative balances in an unlimited buffer. |
| 90 | `net-periods <inflows> <withdrawals>` | `L,L` | Compute signed net stock change per unconstrained period. |
| 91 | `cumulative-net <inflows> <withdrawals>` | `L,L` | Compute cumulative signed net stock change before constraints. |
| 92 | `fill-clock <initial> <capacity> <inflow-rate> <outflow-rate>` | `q,p,q,q` | Estimate time to full under positive net flow, or null if never filling. |
| 93 | `drain-clock <initial> <inflow-rate> <outflow-rate>` | `q,q,q` | Estimate emptying time under negative net flow, or null if never draining. |
| 94 | `outage-bridge <stock> <withdrawal-rate> <outage-time>` | `q,q,q` | Estimate remaining stock and unmet demand across an inflow outage. |
| 95 | `restart-refill <stock> <target> <inflow-rate> <withdrawal-rate>` | `q,q,q,q` | Estimate refill duration after supply restarts, requiring positive net flow when needed. |
| 96 | `reserve-clock <stock> <reserve> <net-drain>` | `q,q,p` | Estimate time until reserve is reached under an explicit net withdrawal rate. |
| 97 | `burst-room <stock> <capacity> <burst>` | `q,p,q` | Assess spare room and spill from one immediate receipt burst. |
| 98 | `flow-balance <inflow-rates> <outflow-rates>` | `L,L` | Compare total independent input and output flow rates. |
| 99 | `working-volume <capacity> <lower-fraction> <upper-fraction>` | `p,r,r` | Compute usable fluid volume between lower and upper operating levels. |
| 100 | `surge-capacity <baseline> <burst-rates> <durations> <drain-rate>` | `q,L,L,q` | Find capacity needed for supplied sequential bursts with floor at zero. |

Example: `mc-agent bufferplan trace 3 '4,0' '2,6' 5` returns `result: [{"stock": 3, "spill": 2, "shortage": 0}, {"stock": 0, "spill": 0, "shortage": 3}]`.

## `batchflow`

Offline multi-stage flow estimates. Stage order, conversion yields, durations, and machine counts are supplied assumptions; no recipes are inferred.

| # | Command | Input types | Behavior |
| --- | --- | --- | --- |
| 101 | `required-start <final-target> <survival-fractions>` | `q,P` | Back-calculate continuous raw input through positive stage survival fractions at most one. |
| 102 | `stage-outputs <initial> <multipliers>` | `q,P` | Project quantity after each sequential conversion multiplier. |
| 103 | `stage-losses <initial> <survival-fractions>` | `q,P` | Account for material lost independently at each sequential survival stage. |
| 104 | `serial-latency <stage-times>` | `L` | Sum one unit latency through sequential stages. |
| 105 | `pipeline-cycle <stage-times> <machines>` | `P,S` | Find ideal bottleneck cycle time with independently parallelized stages. |
| 106 | `pipeline-rate <stage-times> <machines>` | `P,S` | Find ideal bottleneck units per time with unit-preserving stages. |
| 107 | `stage-utilizations <stage-times> <machines> <target-rate>` | `P,S,q` | Compute utilization of each supplied stage at a target unit flow. |
| 108 | `limiting-stages <stage-times> <machines>` | `P,S` | List all one-based stages tied for minimum supplied unit-flow capacity. |
| 109 | `stage-machines <stage-times> <target-rate>` | `P,q` | Round required independent machine counts up for each unit-preserving stage. |
| 110 | `cycle-upgrade <stage-times> <machines> <stage> <extra>` | `P,S,s,c` | Compare bottleneck cycle before and after adding machines to one stage. |
| 111 | `first-last <units> <stage-times>` | `s,P` | Estimate a no-buffer-blocking serial unit pipeline with one machine per stage. |
| 112 | `transfer-batches <units> <batch-size> <transfer-interval>` | `c,s,q` | Schedule whole-unit transfer lots on a supplied interval, first after one interval. |
| 113 | `transfer-overhead <units> <batch-size> <overhead>` | `c,s,q` | Estimate repeated transfer setup cost between two stages. |
| 114 | `stage-wip <stage-rates> <stage-latencies>` | `L,L` | Estimate steady work in process at each supplied stage. |
| 115 | `yield-adjusted-rates <final-rate> <survival-fractions>` | `q,P` | Back-calculate needed input rates for every stage to sustain a final flow. |
| 116 | `stage-scrap-value <losses> <recovery-values>` | `L,L` | Value stage-specific waste using supplied recoverable unit values. |
| 117 | `parallel-paths <path-rates> <required-rate>` | `L,q` | Assess combined independent parallel path capacity against final flow demand. |
| 118 | `serial-availability <stage-availability>` | `L` | Multiply independent stage availability fractions for a strict serial path. |
| 119 | `redundant-availability <path-availability>` | `L` | Compute independent parallel availability when any one complete path suffices. |
| 120 | `changeover-sequence <run-times> <changeovers>` | `L,L` | Sum ordered processing and one supplied changeover before each run. |
| 121 | `setup-share <run-times> <changeovers>` | `L,L` | Measure fraction of ordered campaign time consumed by supplied changeovers. |
| 122 | `output-after-downtime <rate> <horizon> <downtime>` | `q,q,q` | Estimate output after supplied aggregate nonoverlapping downtime. |
| 123 | `rework-load <first-pass-units> <rework-fraction> <passes>` | `q,r,c` | Estimate additional work across bounded repeated independent rework passes. |
| 124 | `backward-deadlines <finish-deadline> <stage-times>` | `q,L` | Compute latest stage start clocks working backward from a final deadline. |
| 125 | `phase-material <stage-inputs> <stage-starts> <clock>` | `L,L,q` | Sum supplied stage material committed by a clock, without asserting execution. |

Example: `mc-agent batchflow required-start 18 '0.5,0.75'` returns `result: 48`.

## `durability`

Offline wear accounting from explicit durability and wear assumptions. No tool metadata, enchantments, damage mechanics, or successful action is inferred.

| # | Command | Input types | Behavior |
| --- | --- | --- | --- |
| 126 | `action-budget <remaining> <wear-per-action> <reserve>` | `q,q,q` | Count whole identical actions before a protected durability reserve. |
| 127 | `wear-phases <actions> <wear-rates>` | `C,L` | Compute total durability consumed by multiple explicit action phases. |
| 128 | `remaining-after <remaining> <actions> <wear>` | `q,c,q` | Project signed durability after a whole-action workload. |
| 129 | `replacement-tools <actions> <durability> <wear> <reserve>` | `c,p,q,q` | Count fresh tools required when each tool protects the same reserve. |
| 130 | `fleet-actions <durabilities> <wear> <reserve>` | `L,p,q` | Sum whole actions possible across separately consumed tools. |
| 131 | `weakest-tool <durabilities>` | `L` | Find minimum durability and all one-based tools attaining it. |
| 132 | `repair-gap <remaining> <target> <repair-per-unit>` | `q,q,p` | Round repair material need up to a whole supplied repair unit. |
| 133 | `repair-overflow <remaining> <maximum> <repair-units> <repair-per-unit>` | `q,p,c,p` | Measure capped durability restored and wasted repair potential. |
| 134 | `wear-efficiency <work-units> <wear-used>` | `q,p` | Compute supplied completed work per unit of consumed durability. |
| 135 | `wear-comparison <work> <old-wear> <new-wear>` | `q,q,q` | Compare durability cost for a fixed divisible workload. |
| 136 | `phase-checkpoints <remaining> <actions> <wear-rates>` | `q,C,L` | Project signed durability after each action phase. |
| 137 | `first-break-phase <remaining> <actions> <wear-rates>` | `q,C,L` | Find first phase whose projected ending durability is zero or below. |
| 138 | `reserve-fraction <remaining> <maximum>` | `q,p` | Report durability fraction, rejecting remaining values beyond maximum. |
| 139 | `wear-margin <remaining> <required-wear> <reserve>` | `q,q,q` | Compute signed durability margin over workload and reserve. |
| 140 | `repair-interval <maximum> <repair-trigger> <wear-rate>` | `p,q,p` | Estimate time from full durability to a supplied repair trigger. |
| 141 | `maintenance-downtime <actions> <actions-between-services> <service-time>` | `c,s,q` | Count services strictly before the final action and sum their downtime. |
| 142 | `loss-adjusted-wear <actions> <wear> <extra-fraction>` | `c,q,r` | Inflate deterministic expected wear by an explicit additional-loss fraction. |
| 143 | `weighted-wear <action-counts> <wear-rates>` | `C,L` | Compute average durability cost per action over a mixed workload. |
| 144 | `shared-spares <needed-tools> <already-held> <spare-reserve>` | `c,c,c` | Compute additional whole tools after accounting for held tools and protected spares. |
| 145 | `salvage-value <remaining> <maximum> <full-value>` | `q,p,q` | Estimate linear residual tool value from supplied full-tool value. |
| 146 | `repair-or-replace <repair-units> <repair-unit-cost> <new-tool-cost>` | `c,q,q` | Compare supplied repair and replacement costs with stable repair preference on ties. |
| 147 | `mission-return-reserve <outbound-actions> <return-actions> <wear> <contingency>` | `c,c,q,q` | Separate mission and return wear with an explicit contingency. |
| 148 | `first-insufficient-tool <durabilities> <required-wear>` | `L,q` | List one-based tools unable to cover a supplied wear budget. |
| 149 | `repair-kit-budget <durabilities> <targets> <repair-unit>` | `L,L,p` | Budget whole independent repair units for every tool, without sharing overfill. |
| 150 | `action-prefix <remaining> <action-wear> <reserve>` | `q,L,q` | Count the longest source-order action prefix fitting available durability. |

Example: `mc-agent durability action-budget 25 3 4` returns `result: 7`.

## `harvest`

Offline repeated-harvest estimates from supplied yields, timings, replant needs, and losses. No crop rules or growth probabilities are assumed.

| # | Command | Input types | Behavior |
| --- | --- | --- | --- |
| 151 | `net-cycle-yield <gross> <replant> <loss>` | `q,q,q` | Compute signed net harvest after per-cycle replant and explicit loss. |
| 152 | `plot-cycle-output <plots> <yield-per-plot> <survival>` | `c,q,r` | Estimate expected gross output from plots under an explicit surviving fraction. |
| 153 | `replant-shortfall <harvested-seeds> <plots> <seeds-per-plot>` | `q,c,q` | Compute missing replant seed quantity after a harvest. |
| 154 | `mature-count <ages> <maturity>` | `L,p` | Count supplied plot ages at or above one explicit maturity threshold. |
| 155 | `next-ready <ages> <maturity>` | `L,p` | Report time until each supplied plot becomes mature. |
| 156 | `window-yield <ready-times> <yields> <horizon>` | `L,L,q` | Sum supplied harvest outputs whose readiness lies inside a horizon. |
| 157 | `repeat-cycles <horizon> <first-ready> <regrow-time>` | `q,q,p` | Count harvests from first readiness through an inclusive horizon. |
| 158 | `repeat-clock <horizon> <first-ready> <regrow-time>` | `q,q,p` | List bounded harvest timestamps including a ready event exactly at the horizon. |
| 159 | `repeat-total <cycles> <gross-per-cycle> <replant-per-cycle>` | `c,q,q` | Account for aggregate gross, replant commitment, and signed usable output. |
| 160 | `last-cycle-release <cycles> <gross-per-cycle> <replant-per-cycle>` | `c,q,q` | Budget a finite campaign with no replant after its final harvest. |
| 161 | `stagger-offsets <plots> <cycle-time>` | `s,p` | Spread plot readiness offsets evenly across one supplied growth cycle. |
| 162 | `stagger-flow <plots> <net-yield> <cycle-time>` | `s,q,p` | Estimate ideal long-run staggered usable output rate. |
| 163 | `labor-demand <plots> <harvest-time> <replant-time>` | `c,q,q` | Budget per-cycle harvest and replant labor for all plots. |
| 164 | `labor-limit <available-time> <harvest-time> <replant-time>` | `q,q,q` | Count whole plots serviceable under sequential harvest plus replant labor. |
| 165 | `harvest-before-expiry <ready-times> <service-time> <shelf-time>` | `L,p,q` | Simulate source-order harvesting and report whether each finishes before readiness plus shelf time. |
| 166 | `spoilage-budget <gross> <spoil-fraction> <replant>` | `q,r,q` | Estimate usable output after explicit spoilage and seed retention. |
| 167 | `seed-growth <initial-plots> <seed-multiplier> <cycles> <plot-cap>` | `c,p,c,s` | Project whole replanted plots with a cap after each bounded cycle. |
| 168 | `seed-reserve <plots> <seeds-per-plot> <extra-cycles>` | `c,q,c` | Budget seeds for supplied full replant cycles without recovery credit. |
| 169 | `rotation-land <active-plots> <growing-time> <rest-time>` | `c,p,p` | Estimate whole total plots to sustain active plots with a supplied rest period. |
| 170 | `fertilizer-budget <plots> <dose> <campaign-time> <application-interval>` | `c,q,q,p` | Budget scheduled doses from time zero strictly before a supplied campaign endpoint. |
| 171 | `water-budget <field-plots> <rates-each> <duration>` | `C,L,q` | Estimate cumulative fluid use across fields with independent supplied per-plot rates. |
| 172 | `storage-peak <harvest-amounts> <withdrawals>` | `L,L` | Compute peak retained harvest when each receipt precedes same-period withdrawal. |
| 173 | `quota-cycles <wanted-net> <gross-per-cycle> <replant>` | `q,q,q` | Find whole harvest cycles needed for positive net retained yield. |
| 174 | `mixed-field-output <plots> <yields> <survival-fractions>` | `C,L,L` | Estimate output per field and total from paired explicit assumptions. |
| 175 | `missed-cycle-loss <gross-per-cycle> <missed-cycles> <recoverable-fraction>` | `q,c,r` | Estimate unrecoverable output after crediting a supplied fraction of missed harvests. |

Example: `mc-agent harvest net-cycle-yield 20 4 3` returns `result: 13`.

## `blending`

Offline divisible material mixtures with explicit quantities and scalar properties. Compatible units and linear mixing are assumptions; no item conversion is performed.

| # | Command | Input types | Behavior |
| --- | --- | --- | --- |
| 176 | `weighted-property <quantities> <properties>` | `L,l` | Compute quantity-weighted scalar mixture property. |
| 177 | `component-shares <quantities>` | `L` | Normalize positive-total component quantities to mixture fractions. |
| 178 | `target-two-share <low-property> <high-property> <target>` | `n,n,n` | Solve high-component fraction for a bounded two-component target. |
| 179 | `target-two-load <low-property> <high-property> <target> <total>` | `n,n,n,q` | Solve both component quantities for a fixed two-component mixture total. |
| 180 | `additive-need <current-units> <current-property> <additive-property> <target>` | `q,n,n,n` | Solve nonnegative additive quantity for a reachable target without removing base. |
| 181 | `dilution-need <current-units> <current-property> <target>` | `q,p,p` | Compute zero-property diluent needed to lower a nonnegative property. |
| 182 | `blend-cost <quantities> <unit-costs>` | `L,L` | Compute total and per-unit cost of a positive-total mixture. |
| 183 | `property-contribution <quantities> <properties>` | `L,l` | List each component contribution to the total extensive property. |
| 184 | `remove-proportional <quantities> <removed-total>` | `L,q` | Remove a homogeneous sample while preserving component fractions. |
| 185 | `scale-recipe <quantities> <target-total>` | `L,q` | Scale a positive-total reference mixture to a new total quantity. |
| 186 | `stock-limited-scale <recipe-quantities> <available>` | `P,L` | Find maximum common recipe multiplier allowed by component stock. |
| 187 | `mixture-shortfalls <quantities> <available>` | `L,L` | List shortage quantities for independently supplied recipe components. |
| 188 | `property-bounds <properties> <minimum-shares> <maximum-shares>` | `l,L,L` | Bound scalar blend property under component share intervals summing to one. |
| 189 | `minimum-compliance <quantities> <properties> <minimum>` | `L,l,n` | Report signed weighted-property margin above a supplied lower specification. |
| 190 | `range-compliance <quantities> <properties> <minimum> <maximum>` | `L,l,n,n` | Check whether linear mixture property lies in an inclusive supplied specification. |
| 191 | `replace-component <total> <current-property> <incoming-property> <target>` | `p,n,n,n` | Solve how much homogeneous blend to replace with incoming material at fixed total. |
| 192 | `mix-two-stock <first-units> <first-property> <second-units> <second-property>` | `q,n,q,n` | Compute resulting units and property when combining two homogeneous stocks. |
| 193 | `mixture-loss <quantities> <retained-fractions>` | `L,L` | Project retained component quantities and total after differential loss. |
| 194 | `post-loss-property <quantities> <properties> <retained-fractions>` | `L,l,L` | Compute weighted property after component-specific retained fractions. |
| 195 | `cost-cap-share <low-cost> <high-cost> <budget-per-unit>` | `q,q,q` | Find maximum high-cost fraction meeting an achievable linear unit-cost cap. |
| 196 | `impurity-mass <quantities> <impurity-fractions>` | `L,L` | Sum impurity mass under explicit per-component impurity fractions. |
| 197 | `purification-loss <input> <impurity-fraction> <good-retained>` | `q,r,r` | Estimate retained good material and removed impurity for a one-pass separation. |
| 198 | `ratio-adjustment <current-a> <current-b> <target-a-to-b>` | `q,q,p` | Solve nonnegative additions to whichever component is deficient for a target ratio. |
| 199 | `component-budget <total> <shares> <unit-costs>` | `q,L,L` | Allocate a blend total by fractions summing to one and price every component. |
| 200 | `property-sensitivity <quantities> <properties> <component>` | `L,l,s` | Compute derivative of weighted property with respect to adding one component. |

Example: `mc-agent blending weighted-property '2,3' '10,20'` returns `result: 16`.

## `apportion`

Offline whole-unit allocations and fairness audits. Weights are caller-supplied, nonnegative, and must have positive total; ties favor original order.

| # | Command | Input types | Behavior |
| --- | --- | --- | --- |
| 201 | `exact-quotas <weights> <units>` | `L,c` | Compute ideal continuous quotas underlying a discrete allocation. |
| 202 | `lower-quotas <weights> <units>` | `L,c` | Round each ideal quota downward without distributing residual units. |
| 203 | `upper-quotas <weights> <units>` | `L,c` | Round each ideal quota upward, without forcing their sum to available units. |
| 204 | `quota-remainders <weights> <units>` | `L,c` | List fractional residuals after quota floors. |
| 205 | `floor-residual <weights> <units>` | `L,c` | Count units remaining after assigning all lower quotas. |
| 206 | `dhondt <weights> <units>` | `L,c` | Allocate units by descending weight divided by next whole unit count. |
| 207 | `webster <weights> <units>` | `L,c` | Allocate units by odd-divisor highest averages with source-order ties. |
| 208 | `imperiali <weights> <units>` | `L,c` | Allocate by divisors 2, 3, 4 and onward, favoring larger weights. |
| 209 | `modified-webster <weights> <units>` | `L,c` | Use first divisor 1.4 followed by 3, 5, 7 to reduce tiny first grants. |
| 210 | `allocation-errors <weights> <grants>` | `L,C` | Compute grant minus ideal quota for the supplied total grant. |
| 211 | `relative-errors <weights> <grants>` | `L,C` | Compute relative over- or under-allocation; zero weight has null relative error. |
| 212 | `quota-violations <weights> <grants>` | `L,C` | List recipients outside their inclusive floor-to-ceiling quota band. |
| 213 | `absolute-error <weights> <grants>` | `L,C` | Sum absolute deviation of discrete grants from their ideal quotas. |
| 214 | `squared-error <weights> <grants>` | `L,C` | Sum squared discrete-grant deviations from ideal quotas. |
| 215 | `representation <weights> <grants>` | `L,C` | Compute represented weight per granted unit, null for recipients with no units. |
| 216 | `zero-grant-weight <weights> <grants>` | `L,C` | Sum positive weight of recipients receiving no discrete units. |
| 217 | `next-dhondt <weights> <grants>` | `L,C` | Identify next unit recipient by the D'Hondt priority from current grants. |
| 218 | `next-webster <weights> <grants>` | `L,C` | Identify next unit recipient by odd-divisor priority from current grants. |
| 219 | `dhondt-prefix <weights> <units>` | `L,c` | List source-order recipient identities for each sequential D'Hondt unit. |
| 220 | `webster-prefix <weights> <units>` | `L,c` | List source-order recipient identities for each sequential odd-divisor unit. |
| 221 | `method-comparison <weights> <units>` | `L,c` | Compare D'Hondt and Webster whole-unit results at one fixed total. |
| 222 | `protected-grants <minimums> <weights> <units>` | `C,L,c` | Reserve whole minima before assigning remaining units by D'Hondt. |
| 223 | `cap-dhondt <weights> <caps> <units>` | `L,C,c` | Allocate units by highest averages while respecting whole recipient ceilings. |
| 224 | `transfer-distance <before> <after>` | `C,C` | Count minimum whole transfers between equal-total allocations. |
| 225 | `house-increment <weights> <units> <extra>` | `L,c,c` | Compare D'Hondt allocations before and after expanding the total house. |

Example: `mc-agent apportion exact-quotas '1,2,3' 12` returns `result: [2, 4, 6]`.

## `project-cost`

Offline project budgets in caller-chosen common cost and time units. Prices, discounts, and financing assumptions are supplied; no market or financial recommendation is made.

| # | Command | Input types | Behavior |
| --- | --- | --- | --- |
| 226 | `line-items <quantities> <unit-costs>` | `L,L` | Price independently supplied project quantities. |
| 227 | `subtotal <quantities> <unit-costs>` | `L,L` | Sum explicit project material line-item costs. |
| 228 | `fixed-variable <fixed-cost> <units> <unit-cost>` | `q,q,q` | Estimate total and mean project cost; zero output has null mean. |
| 229 | `overhead <direct-cost> <overhead-fraction> <fixed-overhead>` | `q,r,q` | Add proportional and fixed overhead to a direct cost estimate. |
| 230 | `contingency <base-cost> <contingency-fraction>` | `q,r` | Separate a percentage project contingency from its resulting budget cap. |
| 231 | `stacked-discounts <base-cost> <discount-fractions>` | `q,L` | Apply sequential multiplicative discounts, each between zero and one. |
| 232 | `shipping-threshold <goods-cost> <free-threshold> <shipping-charge>` | `q,q,q` | Apply a supplied delivery charge only below a free-shipping threshold. |
| 233 | `price-break <quantity> <break-quantity> <regular-unit-cost> <discount-unit-cost>` | `q,q,q,q` | Apply an all-unit supplied price break at a quantity threshold. |
| 234 | `marginal-tiers <quantity> <tier-widths> <unit-costs>` | `q,P,L` | Price finite successive quantity tiers without all-unit repricing. |
| 235 | `labor-budget <hours> <hourly-rates>` | `L,L` | Price separate supplied labor tasks with matching hourly rates. |
| 236 | `rent-or-buy <purchase-cost> <rental-per-period> <periods> <resale-value>` | `q,p,q,q` | Compare a supplied finite rental campaign with net ownership cost. |
| 237 | `break-even-units <fixed-cost> <price> <variable-cost>` | `q,p,p` | Find whole units needed to cover fixed cost under a positive contribution margin. |
| 238 | `unit-margin <price> <unit-cost>` | `p,q` | Report signed unit contribution and its fraction of supplied price. |
| 239 | `budget-variance <planned> <actual>` | `q,q` | Report signed actual cost variance and relative variance, null when plan is zero. |
| 240 | `remaining-budget <budget> <spent> <committed>` | `q,q,q` | Compute signed uncommitted budget after actual and obligated costs. |
| 241 | `cost-to-complete <total-units> <completed> <remaining-unit-cost>` | `q,q,q` | Estimate future variable cost for unfinished units. |
| 242 | `estimate-at-completion <spent> <remaining-units> <unit-cost> <fixed-remaining>` | `q,q,q,q` | Combine observed spend with explicit remaining variable and fixed costs. |
| 243 | `phase-cashflow <phase-costs> <initial-budget>` | `L,q` | Project signed cash balance after each sequential cost phase. |
| 244 | `first-overbudget <phase-costs> <budget>` | `L,q` | Find first one-based project phase exceeding cumulative budget, or null. |
| 245 | `weighted-unit-cost <quantities> <costs>` | `L,L` | Compute blended supplied procurement unit cost for a positive quantity total. |
| 246 | `price-sensitivity <quantities> <unit-price-changes>` | `L,l` | Estimate signed project-cost change from per-item price changes. |
| 247 | `waste-adjustment <needed> <usable-fraction> <unit-cost>` | `q,p,q` | Price whole purchased units under a supplied deterministic usable fraction. |
| 248 | `reuse-credit <gross-cost> <reused-quantities> <replacement-values>` | `q,L,L` | Subtract explicit reuse credits while preserving signed net cost. |
| 249 | `scenario-budget <quantities> <low-prices> <high-prices> <fixed>` | `L,L,L,q` | Bound project cost with independently supplied per-item price intervals. |
| 250 | `cost-priority <costs> <benefits>` | `P,L` | Rank project options by supplied benefit per cost, stable on ties. |

Example: `mc-agent project-cost line-items '4,6' '2,3'` returns `result: [8, 18]`.
