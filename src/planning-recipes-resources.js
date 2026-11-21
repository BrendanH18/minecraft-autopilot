const compare = (purpose, baseline, candidate) => ({ purpose, request: { baseline, candidates: [candidate] } });

export const resourceRecipes = {
  queueplan: {
    fcfs: compare(
      'Stagger the middle cart at a single unloading dock to change the arrival queue.',
      ['0,2,10', '5,4,2'],
      ['0,6,10', '5,4,2'],
    ),
    waits: compare(
      'Move the final shulker pickup later to test how much time it spends in line.',
      ['0,2,4', '5,4,2'],
      ['0,2,7', '5,4,2'],
    ),
    turnaround: compare(
      'Speed up the second smelting load to measure the effect on each order’s turnaround.',
      ['0,2,6', '4,7,3'],
      ['0,2,6', '4,4,3'],
    ),
    'idle-gaps': compare(
      'See how moving the second delivery earlier shifts the idle gaps at a depot.',
      ['3,12,18', '4,6,3'],
      ['3,8,18', '4,6,3'],
    ),
    'completion-deadlines': compare(
      'Check which paving orders meet their handoff times after adjusting one deadline.',
      ['0,2,4', '3,5,4', '3,7,13'],
      ['0,2,4', '3,5,4', '3,9,13'],
    ),
    'mean-wait': compare(
      'Spread out three deliveries and compare the average time each crew waits to unload.',
      ['0,1,2', '4,4,4'],
      ['0,3,6', '4,4,4'],
    ),
    'busy-fraction': compare(
      'Compare a long gap between furnace runs with a tighter pickup schedule.',
      ['0,8', '3,4'],
      ['0,4', '3,4'],
    ),
    'finish-window': compare(
      'See which quarry orders come off the queue during an earlier crew shift.',
      ['0,2,2', '4,3,5', 5, 12],
      ['0,2,2', '4,3,5', 3, 8],
    ),
    'backlog-at': compare(
      'Count how many dock jobs are still open just before and at the second completion.',
      ['0,1,3', '4,5,6', 8],
      ['0,1,3', '4,5,6', 9],
    ),
    'remaining-work': compare(
      'Estimate unfinished labor at a fixed shift check-in after shortening a repair job.',
      ['0,2,15', '6,5,2', 4],
      ['0,2,15', '5,5,2', 4],
    ),
    clearance: compare(
      'Measure whether a shorter middle dig frees the excavation crew sooner.',
      ['2,4,6', '4,8,2'],
      ['2,4,6', '4,6,2'],
    ),
    'maximum-wait': compare(
      'Reschedule the last delivery and find which cart has the longest wait.',
      ['0,2,3', '6,4,3'],
      ['0,2,8', '6,4,3'],
    ),
    'service-shares': compare(
      'Measure each order’s share of sorting time before and after a labeling change.',
      ['8,4,6'],
      ['5,4,6'],
    ),
    'shortest-first': compare(
      'Reorder ready repair tasks after revising the longest duration estimate.',
      ['12,3,7'],
      ['4,3,7'],
    ),
    'weighted-order': compare(
      'Promote the bridge repair in the ready queue by raising its priority weight.',
      ['5,8,3', '1,1,1'],
      ['5,8,3', '1,4,1'],
    ),
    'earliest-deadline': compare(
      'Reschedule ready delivery jobs when the second build crew needs its stock sooner.',
      ['4,2,5', '8,10,13'],
      ['4,2,5', '8,5,13'],
    ),
    'slack-order': compare(
      'Compare repair urgency before and after the rail crew moves its deadline forward.',
      ['6,3,4', '14,13,17', 5],
      ['6,3,4', '14,9,17', 5],
    ),
    'parallel-dispatch': compare(
      'Assign four ready jobs with two workstations and then with a third available.',
      ['6,3,4,8', 2],
      ['6,3,4,8', 3],
    ),
    'parallel-loads': compare(
      'Put the longest smelting batch first and compare total work assigned to each bank.',
      ['3,3,3,8', 2],
      ['8,3,3,3', 2],
    ),
    'parallel-makespan': compare(
      'Estimate when the last load finishes with two sorting crews versus three.',
      ['8,5,7,6,2', 2],
      ['8,5,7,6,2', 3],
    ),
    'longest-first-dispatch': compare(
      'Compare longest-first assignments for a pair of kilns and three kilns.',
      ['2,8,4,5', 2],
      ['2,8,4,5', 3],
    ),
    'batch-arrivals': compare(
      'Deliver twelve orders to the dock in groups of three or groups of four.',
      [12, 5, 3],
      [12, 5, 4],
    ),
    'wait-threshold': compare(
      'Track which jobs exceed a shorter wait tolerance during a busy handoff.',
      ['0,1,2,6', '4,5,3,1', 4],
      ['0,1,2,6', '4,5,3,1', 2],
    ),
    'service-speedup': compare(
      'Project the completion clocks if a layout improvement halves unloading time.',
      ['0,3,5', '5,4,6', 1],
      ['0,3,5', '5,4,6', 2],
    ),
    'arrival-shift': compare(
      'Shift every delivery five minutes to fit a gate opening and check finish times.',
      ['1,4,6', '5,3,3', 0],
      ['1,4,6', '5,3,3', 5],
    ),
  },
  replenish: {
    'inventory-position': compare(
      'Calculate the position of a stone depot with and without an outstanding pallet.',
      [128, 64, 32],
      [128, 0, 32],
    ),
    'review-order': compare(
      'Round a restock to the supplier’s normal pack size versus a half-size pack.',
      [38, 120, 64],
      [38, 120, 32],
    ),
    'lead-demand': compare(
      'Estimate rail demand if the heavy building phase continues for one extra day.',
      ['24,56,18', '2,3,2'],
      ['24,56,18', '2,4,2'],
    ),
    'review-target': compare(
      'Raise the target when a supplier adds two days to its delivery lead time.',
      [22, 3, 7, 32],
      [22, 5, 7, 32],
    ),
    'coverage-days': compare(
      'Check how long torch stock covers prep before and after the dig pace increases.',
      [96, 12],
      [96, 18],
    ),
    'order-trigger': compare(
      'Check whether a rail depot’s reorder point trips after a scheduled withdrawal.',
      [96, 80],
      [76, 80],
    ),
    'order-gap': compare(
      'Shift a glass delivery one period later to see the projected stock balances.',
      [80, '0,48,0', '30,60,24'],
      [80, '0,0,48', '30,60,24'],
    ),
    'stockout-period': compare(
      'See whether an early half shipment avoids the first wool shortage.',
      [50, '0,0,80', '32,32,24'],
      [50, '0,32,48', '32,32,24'],
    ),
    'backorder-area': compare(
      'Estimate aggregate unfilled chest orders after one scheduled receipt falls short.',
      [20, '0,30,40', '35,30,20'],
      [20, '0,20,40', '35,30,20'],
    ),
    'positive-stock-area': compare(
      'Estimate stock tied up when a resupply cart arrives a period early.',
      [48, '0,0,64', '16,16,16'],
      [48, '0,64,0', '16,16,16'],
    ),
    'economic-order': compare(
      'Estimate the order size when placing a separate ore order becomes twice as costly.',
      [4096, 6, 1],
      [4096, 12, 1],
    ),
    'orders-per-year': compare(
      'Estimate annual order frequency for timber lots of 128 or 192 units.',
      [3072, 128],
      [3072, 192],
    ),
    'order-cycle': compare(
      'Estimate time between orders when a larger construction crew consumes stone faster.',
      [192, 24],
      [192, 36],
    ),
    'cycle-stock': compare(
      'Check the average inventory cost driver of a larger protected stock reserve.',
      [320, 64],
      [320, 96],
    ),
    'annual-policy-cost': compare(
      'Compare annual ordering and holding cost for two vendor lot sizes.',
      [3200, 128, 12, 1],
      [3200, 256, 12, 1],
    ),
    'purchase-budget': compare(
      'Check the total annual budget if a price rise leaves the stocking policy unchanged.',
      [2200, 2, 740],
      [2200, 2.5, 740],
    ),
    'safety-from-errors': compare(
      'Estimate safety stock from recent plank forecast errors at two buffer multipliers.',
      ['-16,8,12,-4', 1],
      ['-16,8,12,-4', 2],
    ),
    'lead-variability': compare(
      'Size demand safety stock for three versus five days of ferry lead time.',
      [8, 3, 2],
      [8, 5, 2],
    ),
    'lead-time-variability': compare(
      'Estimate extra bridge stock when the regular delivery lead time is less reliable.',
      [28, 1, 2],
      [28, 2.5, 2],
    ),
    'combined-variability': compare(
      'Estimate the reserve impact of reducing both demand and resupply variability.',
      [32, 8, 4, 1.5, 2],
      [32, 5, 4, 1, 2],
    ),
    'service-fill': compare(
      'Measure how much of a depot request can be filled immediately after increasing prepared stock.',
      [180, 148],
      [180, 172],
    ),
    'shelf-expiry': compare(
      'Estimate unused supplies left in a temporary depot before it must be cleared.',
      [210, 28, 5],
      [210, 36, 5],
    ),
    'minimum-lot': compare(
      'Check how a larger shortage affects a supply order with a fixed minimum and increment.',
      [37, 60, 16],
      [72, 60, 16],
    ),
    'open-order-due': compare(
      'Count incoming brick before two possible build handoff days.',
      ['48,64,32', '2,5,7', 4],
      ['48,64,32', '2,5,7', 6],
    ),
    'expedite-need': compare(
      'Estimate emergency glass stock needed when regular resupply slips by two days.',
      [58, 16, 3, 24],
      [58, 16, 5, 24],
    ),
  },
  haul: {
    'round-trip-clock': compare(
      'Time a depot round trip with a shorter return path than the loaded route.',
      [160, 160, 4, 8, 6],
      [160, 120, 4, 8, 6],
    ),
    'fleet-throughput': compare(
      'Estimate ideal delivery flow before and after adding a third cart.',
      [2, 96, 12],
      [3, 96, 12],
    ),
    'fleet-for-flow': compare(
      'Size the fleet when queueing at the depot makes every trip take longer.',
      [24, 64, 8],
      [24, 64, 12],
    ),
    'outbound-loads': compare(
      'Plan whole-unit loads for a foundation delivery with two carrying capacities.',
      [370, 128],
      [370, 96],
    ),
    'return-backhaul': compare(
      'Check whether a larger salvage pickup adds a round trip to the outbound timber route.',
      [230, 128, 96],
      [230, 320, 96],
    ),
    'loaded-distance': compare(
      'Compare freight-distance work if the second stone load goes to a closer staging site.',
      ['64,96,32', '140,260,180'],
      ['64,96,32', '140,170,180'],
    ),
    'empty-ratio': compare(
      'Estimate empty-travel share after converting one return leg to a salvage pickup.',
      [640, 480],
      [800, 320],
    ),
    'payload-utilization': compare(
      'Check fleet utilization with the same loads packed in larger carts.',
      ['61,54,28', 64],
      ['61,54,28', 80],
    ),
    'vehicle-distance': compare(
      'Measure overall travel saved by rerouting only the return legs of six deliveries.',
      [6, 180, 210],
      [6, 180, 160],
    ),
    'trip-cost': compare(
      'Estimate whether a shortcut offsets an increase in the unloading charge.',
      [180, 0.2, 8],
      [140, 0.2, 12],
    ),
    'shipment-cost': compare(
      'Estimate the shipment cost of fitting more stone onto each charged trip.',
      [290, 64, 12, 0.25],
      [290, 96, 12, 0.25],
    ),
    'split-haulers': compare(
      'Load the highest-priority carts first and see how swapping their dispatch order changes allocations.',
      [195, '64,96,128'],
      [195, '128,96,64'],
    ),
    'fleet-capacity-gap': compare(
      'Calculate how much paving material is left after one small hauler is upgraded.',
      [330, '96,64,128'],
      [330, '96,128,128'],
    ),
    'transit-inventory': compare(
      'Estimate stock tied up in transit at the same delivery rate with a faster route.',
      [18, 22],
      [18, 15],
    ),
    'loading-bottleneck': compare(
      'Check whether a faster unloading station can support the requested cart flow.',
      ['16,12,20', 15],
      ['16,18,20', 15],
    ),
    'convoy-completion': compare(
      'Check first and last arrival times when the convoy leaves in shorter intervals.',
      [7, 3, 18],
      [7, 2, 18],
    ),
    'arrival-clock': compare(
      'Project independent shipment arrival times after the final crew takes a detour.',
      ['0,4,7', '12,10,9'],
      ['0,4,7', '12,10,14'],
    ),
    'late-shipment': compare(
      'Check which shipments miss their deadlines after bringing the first departure forward.',
      ['4,6,9', '8,10,7', '10,18,17'],
      ['2,6,9', '8,10,7', '10,18,17'],
    ),
    'staging-need': compare(
      'Compare the material staged at the dock before either of two departure times.',
      ['6,12,18', '64,96,52', 11],
      ['6,12,18', '64,96,52', 12],
    ),
    'handling-clock': compare(
      'Estimate loading plus unloading time when only the loading crew gets a helper.',
      [192, 16, 24],
      [192, 24, 24],
    ),
    'relay-time': compare(
      'Estimate a supply relay’s travel time if the middle transfer can be made at a prepared depot.',
      ['160,240,80', '4,6,4', '6,12,4'],
      ['160,240,80', '4,6,4', '6,7,4'],
    ),
    'rate-distance-penalty': compare(
      'Compare ideal haul rates for two detour lengths around a blocked path.',
      [16, 30, 5, 96],
      [16, 75, 5, 96],
    ),
    'shared-departure': compare(
      'Check which loads can leave together at two departure cutoffs.',
      ['4,11,13,17', 11],
      ['4,11,13,17', 14],
    ),
    'weight-volume-limit': compare(
      'Compare carrying limits when bulkier packaging uses more of the same cart volume.',
      [240, 180, 3, 2],
      [240, 180, 3, 3],
    ),
    'partial-departure-cost': compare(
      'Estimate the cost of dispatching partial loads versus packing the same cargo into fewer departures.',
      ['40,50,30,40', 80, 7],
      ['80,80', 80, 7],
    ),
  },
  bufferplan: {
    trace: compare(
      'Trace a furnace input buffer when the first receipt is split across two periods.',
      [30, '60,0,10', '28,36,30', 70],
      [30, '35,25,10', '28,36,30', 70],
    ),
    'closing-stock': compare(
      'Project closing buffer stock before and after raising the last withdrawal.',
      [40, '20,10,35', '24,18,21', 72],
      [40, '20,10,35', '24,18,38', 72],
    ),
    'spilled-units': compare(
      'Estimate wasted receipt volume and test how much an extra buffer section could retain.',
      [30, '75,20', '18,28', 80],
      [30, '75,20', '18,28', 112],
    ),
    'unmet-units': compare(
      'Measure supplies unserved by a storage buffer when the resupply cart is delayed.',
      [45, '0,38,0', '24,29,26', 90],
      [45, '0,0,38', '24,29,26', 90],
    ),
    'first-shortage': compare(
      'Check when the stock buffer first falls short with and without a midshift refill.',
      [32, '0,0,48', '18,18,20', 70],
      [32, '0,18,30', '18,18,20', 70],
    ),
    'first-overflow': compare(
      'Check whether spreading deliveries across more periods avoids the first overflow.',
      [28, '65,0,24', '17,24,14', 72],
      [28, '38,27,24', '17,24,14', 72],
    ),
    'served-fraction': compare(
      'Measure the served share of withdrawals when starting with an extra emergency stockpile.',
      [16, '0,36,0', '20,26,17', 60],
      [32, '0,36,0', '20,26,17', 60],
    ),
    'mean-closing': compare(
      'Choose between two receipt schedules based on average supplies left in storage.',
      [25, '0,36,0,25', '12,17,20,13', 64],
      [25, '18,18,0,25', '12,17,20,13', 64],
    ),
    'capacity-occupancy': compare(
      'Estimate how much of an expanded depot sits occupied at the end of a period.',
      [30, '25,20,12', '14,16,21', 64],
      [30, '25,20,12', '14,16,21', 96],
    ),
    'empty-periods': compare(
      'Compare empty-buffer periods when a steady trickle replaces a single delivery.',
      [24, '0,0,45', '16,18,26', 80],
      [24, '15,15,15', '16,18,26', 80],
    ),
    'reserve-breaches': compare(
      'Compare how often the emergency reserve is breached at two reserve levels.',
      [40, '0,30,10', '18,22,16', 70, 20],
      [40, '0,30,10', '18,22,16', 70, 25],
    ),
    'capacity-comparison': compare(
      'Test three depot sizes before and after moving part of the last delivery earlier.',
      [28, '0,20,75', '40,12,20', '48,64,96'],
      [28, '20,20,55', '40,12,20', '48,64,96'],
    ),
    'unbounded-peak': compare(
      'Compare peak storage needs when part of the first delivery is deferred to the last.',
      [14, '48,16,0', '12,23,19'],
      [14, '32,16,16', '12,23,19'],
    ),
    'minimum-initial': compare(
      'Find the minimum prefill if the second receipt slips to the last period.',
      ['5,24,10', '16,17,19'],
      ['5,0,34', '16,17,19'],
    ),
    'net-periods': compare(
      'Compare period surpluses and deficits before and after shifting a withdrawal earlier.',
      ['16,32,20', '18,25,24'],
      ['16,32,20', '24,25,18'],
    ),
    'cumulative-net': compare(
      'Compare cumulative stock changes when a delivery is spread across three work periods.',
      ['45,0,0', '22,17,11'],
      ['15,15,15', '22,17,11'],
    ),
    'fill-clock': compare(
      'Estimate whether a faster conveyor fills a buffer sooner with withdrawal still running.',
      [24, 144, 18, 12],
      [24, 144, 24, 12],
    ),
    'drain-clock': compare(
      'Estimate time to empty when the backup supply provides a smaller continuing inflow.',
      [144, 8, 20],
      [144, 4, 20],
    ),
    'outage-bridge': compare(
      'Check remaining supply and unmet demand for a short or extended depot outage.',
      [128, 16, 5],
      [128, 16, 10],
    ),
    'restart-refill': compare(
      'Estimate time to restore reserve after restart with two running withdrawal rates.',
      [30, 120, 24, 8],
      [30, 120, 24, 12],
    ),
    'reserve-clock': compare(
      'Set a restock alarm by comparing time to a modest and a conservative reserve.',
      [180, 48, 12],
      [180, 72, 12],
    ),
    'burst-room': compare(
      'Check how much of an immediate shipment fits before and after clearing surplus stock.',
      [100, 160, 85],
      [65, 160, 85],
    ),
    'flow-balance': compare(
      'Check the net impact of adding a backup input while two nearby lines draw material.',
      ['12,10', '17,8'],
      ['12,10,6', '17,8'],
    ),
    'working-volume': compare(
      'Compare usable buffer volume under two lower and upper operating limits.',
      [256, 0.25, 0.75],
      [256, 0.15, 0.9],
    ),
    'surge-capacity': compare(
      'Size a receiving buffer for a sequence of bursts at two withdrawal rates.',
      [24, '18,32,12', '2,4,3', 12],
      [24, '18,32,12', '2,4,3', 20],
    ),
  },
  batchflow: {
    'required-start': compare(
      'Estimate the quarry input for a finished stone quota when sorting loses less material.',
      [480, '0.75,0.8,0.9'],
      [480, '0.9,0.8,0.9'],
    ),
    'stage-outputs': compare(
      'Compare intermediate material counts when a second processing stage has lower conversion yield.',
      [160, '0.9,2,0.75'],
      [160, '0.9,1.5,0.75'],
    ),
    'stage-losses': compare(
      'Locate material loss when gentler transport improves survival in the final stage.',
      [512, '0.95,0.8,0.9'],
      [512, '0.95,0.8,0.98'],
    ),
    'serial-latency': compare(
      'Estimate the time for one unit to move through sorting, processing, and packing after speeding up packing.',
      ['5,12,7'],
      ['5,12,3'],
    ),
    'pipeline-cycle': compare(
      'Estimate the ideal bottleneck cycle before and after adding a second processing station.',
      ['6,15,4', '1,1,1'],
      ['6,15,4', '1,2,1'],
    ),
    'pipeline-rate': compare(
      'Estimate flow for three parallel processing stations versus four.',
      ['4,20,3', '1,3,1'],
      ['4,20,3', '1,4,1'],
    ),
    'stage-utilizations': compare(
      'Check stage utilization when the requested production rate increases.',
      ['3,8,4', '1,3,2', 0.25],
      ['3,8,4', '1,3,2', 0.4],
    ),
    'limiting-stages': compare(
      'Find the stage that limits a pipeline after doubling its slowest station.',
      ['8,12,5', '1,1,1'],
      ['8,12,5', '1,2,1'],
    ),
    'stage-machines': compare(
      'Round station counts up for a smaller job or a production surge.',
      ['4,8,12', 0.25],
      ['4,8,12', 0.4],
    ),
    'cycle-upgrade': compare(
      'Compare adding one or two stations to a slow processing stage.',
      ['3,16,4', '2,1,2', 2, 1],
      ['3,16,4', '2,1,2', 2, 2],
    ),
    'first-last': compare(
      'Estimate first and last output times for a pilot batch or a full-sized order.',
      [12, '3,6,2'],
      [30, '3,6,2'],
    ),
    'transfer-batches': compare('Schedule staging transfers for small or large bundles.', [190, 32, 6], [190, 48, 6]),
    'transfer-overhead': compare(
      'Compare repeated setup time with smaller transfers versus fully consolidated trips.',
      [360, 64, 4],
      [360, 120, 4],
    ),
    'stage-wip': compare(
      'Estimate stock in process if a middle stage takes longer to finish the same throughput.',
      ['12,12,11', '1.5,3,1'],
      ['12,12,11', '1.5,4,1'],
    ),
    'yield-adjusted-rates': compare(
      'Recalculate required upstream flow after reducing expected losses at the sorting stage.',
      [24, '0.8,0.75,0.9'],
      [24, '0.8,0.9,0.9'],
    ),
    'stage-scrap-value': compare(
      'Value waste recovery before and after a crew finds a better use for offcuts.',
      ['14,20,9', '2,1,3'],
      ['14,20,9', '2,2.5,3'],
    ),
    'parallel-paths': compare(
      'Check whether a third processing line closes a demand shortfall.',
      ['12,16', 36],
      ['12,16,10', 36],
    ),
    'serial-availability': compare(
      'Estimate serial line availability after improving the least reliable stage.',
      ['0.95,0.8,0.92'],
      ['0.95,0.9,0.92'],
    ),
    'redundant-availability': compare(
      'Estimate availability with a third independent processing path available.',
      ['0.83,0.92'],
      ['0.83,0.92,0.75'],
    ),
    'changeover-sequence': compare(
      'Compare production campaign clocks with less setup between material batches.',
      ['18,24,16', '4,8,5'],
      ['18,24,16', '4,3,3'],
    ),
    'setup-share': compare(
      'Measure how much of a campaign spends on setup when the team makes shorter batch runs.',
      ['25,30,20', '5,4,4'],
      ['12,16,14', '5,4,4'],
    ),
    'output-after-downtime': compare(
      'Estimate remaining output for two maintenance durations in the same shift.',
      [16, 8, 1],
      [16, 8, 2.5],
    ),
    'rework-load': compare(
      'Budget repeat inspection work for lower and higher rework estimates.',
      [240, 0.1, 3],
      [240, 0.25, 3],
    ),
    'backward-deadlines': compare(
      'Work backward from a fixed handoff while allowing more time for final inspection.',
      [56, '12,16,9'],
      [56, '12,16,14'],
    ),
    'phase-material': compare(
      'Measure committed materials before the afternoon shift when one stage starts earlier.',
      ['96,48,32', '2,9,15', 12],
      ['96,48,32', '2,9,12', 12],
    ),
  },
  durability: {
    'action-budget': compare(
      'Check the usable workload if the mining crew protects more durability for the return.',
      [90, 1, 12],
      [90, 1, 25],
    ),
    'wear-phases': compare(
      'Budget total wear when a shorter excavation phase precedes the same repair work.',
      ['32,14,10', '1,2,1'],
      ['24,14,10', '1,2,1'],
    ),
    'remaining-after': compare(
      'Compare a partial clear with completing the full dig on the same tool.',
      [100, 68, 1],
      [100, 108, 1],
    ),
    'replacement-tools': compare(
      'Budget fresh tools for a tunnel section before and after increasing the reserve per tool.',
      [420, 120, 1, 12],
      [420, 120, 1, 22],
    ),
    'fleet-actions': compare(
      'Estimate whole actions in a shared tool kit after swapping in a less worn spare.',
      ['70,48,22', 2, 9],
      ['70,48,55', 2, 9],
    ),
    'weakest-tool': compare(
      'Find the weakest kit item before and after replacing a heavily worn tool.',
      ['60,102,24,75'],
      ['60,102,92,75'],
    ),
    'repair-gap': compare(
      'Compare repair material needs for a near-term dig and a higher reserve target.',
      [48, 90, 12],
      [48, 115, 12],
    ),
    'repair-overflow': compare(
      'Check whether an extra repair unit adds usable durability or wastes capacity.',
      [94, 150, 2, 20],
      [94, 150, 3, 20],
    ),
    'wear-efficiency': compare(
      'Measure how much tunnel was cleared per wear unit before and after a smaller measured loss.',
      [72, 90],
      [72, 80],
    ),
    'wear-comparison': compare(
      'Compare expected wear savings for a modest and a larger process improvement.',
      [140, 1.5, 1.3],
      [140, 1.5, 1.05],
    ),
    'phase-checkpoints': compare(
      'Check remaining wear budget after each phase when the middle dig grows.',
      [140, '40,20,35', '1,2,1'],
      [140, '40,30,35', '1,2,1'],
    ),
    'first-break-phase': compare(
      'Check whether repairing before departure postpones projected breakage beyond the last phase.',
      [100, '38,34,30', '1,1,1'],
      [124, '38,34,30', '1,1,1'],
    ),
    'reserve-fraction': compare(
      'Measure how much of a tool’s full durability remains after a short or full work shift.',
      [88, 160],
      [40, 160],
    ),
    'wear-margin': compare(
      'Check the wear margin before and after extending the requested branch tunnel.',
      [90, 63, 18],
      [90, 84, 18],
    ),
    'repair-interval': compare(
      'Estimate how early a conservative repair trigger requires service.',
      [160, 20, 5],
      [160, 45, 5],
    ),
    'maintenance-downtime': compare(
      'Budget repair stops during a long job with two service intervals.',
      [320, 60, 3],
      [320, 80, 3],
    ),
    'loss-adjusted-wear': compare(
      'Budget extra wear with light or heavy allowance for cleanup work.',
      [180, 1, 0.08],
      [180, 1, 0.2],
    ),
    'weighted-wear': compare(
      'Compare the expected average wear for two mixes of clearing and finishing work.',
      ['50,25,15', '1,2,1'],
      ['35,40,15', '1,2,1'],
    ),
    'shared-spares': compare(
      'Find the additional tools to bring after the team protects more emergency spares.',
      [12, 8, 2],
      [12, 8, 4],
    ),
    'salvage-value': compare(
      'Estimate the change in a spare tool’s residual value after a short side job.',
      [95, 160, 12],
      [60, 160, 12],
    ),
    'repair-or-replace': compare(
      'Check whether a higher repair-material price changes the cheaper tool option.',
      [4, 2, 10],
      [4, 3, 10],
    ),
    'mission-return-reserve': compare(
      'Budget wear separately for the dig and a longer planned return route.',
      [55, 20, 1, 12],
      [55, 35, 1, 12],
    ),
    'first-insufficient-tool': compare(
      'Screen spare tools against a short dig and a larger requested workload.',
      ['90,64,42,108', 50],
      ['90,64,42,108', 72],
    ),
    'repair-kit-budget': compare(
      'Pack repair units independently for three tools at two sets of targets.',
      ['36,78,55', '80,100,100', 20],
      ['36,78,55', '100,120,100', 20],
    ),
    'action-prefix': compare(
      'Compare feasible prefixes of ordered work with and without preserving a return reserve.',
      [45, '9,13,8,15,7', 0],
      [45, '9,13,8,15,7', 8],
    ),
  },
  harvest: {
    'net-cycle-yield': compare(
      'Estimate usable harvest if preparing new plots increases replant demand.',
      [150, 24, 12],
      [150, 42, 12],
    ),
    'plot-cycle-output': compare(
      'Estimate expected output for the same garden under two survival assumptions.',
      [48, 3, 0.95],
      [48, 3, 0.7],
    ),
    'replant-shortfall': compare(
      'Check which of two plot counts can be replanted from the same gathered seed.',
      [58, 48, 1],
      [58, 72, 1],
    ),
    'mature-count': compare(
      'Count plots ready to harvest on an initial and a later age survey.',
      ['11,14,17,9,20', 16],
      ['15,18,21,13,24', 16],
    ),
    'next-ready': compare(
      'Compare time to readiness if a second seed batch was planted later.',
      ['4,9,14,18', 20],
      ['4,5,14,18', 20],
    ),
    'window-yield': compare(
      'Compare food available before departure when the harvesting window is extended.',
      ['8,14,20,22', '24,36,28,44', 17],
      ['8,14,20,22', '24,36,28,44', 22],
    ),
    'repeat-cycles': compare(
      'Check whether waiting through the next regrowth cycle adds a harvest.',
      [16, 4, 7],
      [18, 4, 7],
    ),
    'repeat-clock': compare(
      'Compare harvest calendars when the first crop comes ready one period later.',
      [28, 3, 6],
      [28, 4, 6],
    ),
    'repeat-total': compare(
      'Budget retained crops when extending the campaign by two repeated harvests.',
      [5, 96, 28],
      [7, 96, 28],
    ),
    'last-cycle-release': compare(
      'Estimate the retained crop after releasing the last seed reserve in a shorter campaign.',
      [6, 80, 24],
      [4, 80, 24],
    ),
    'stagger-offsets': compare('Space six plots or eight evenly across a supplied growth cycle.', [6, 24], [8, 24]),
    'stagger-flow': compare(
      'Check how lower retained yield would affect a staggered plot’s steady output.',
      [12, 18, 16],
      [12, 12, 16],
    ),
    'labor-demand': compare(
      'Budget harvesting and replanting time if a better layout shortens work per plot.',
      [32, 3, 2],
      [32, 2, 2],
    ),
    'labor-limit': compare(
      'Check whole plots a crew can service before two possible shift boundaries.',
      [45, 3, 2],
      [58, 3, 2],
    ),
    'harvest-before-expiry': compare(
      'Check which harvests go unused when slower service occupies the crew longer.',
      ['0,3,6,9', 3, 4],
      ['0,3,6,9', 4, 4],
    ),
    'spoilage-budget': compare(
      'Estimate edible yield if a longer storage delay leaves more planned waste.',
      [160, 0.05, 32],
      [160, 0.2, 32],
    ),
    'seed-growth': compare(
      'Check the impact of a smaller maximum farm size across five expansion cycles.',
      [12, 1.8, 5, 140],
      [12, 1.8, 5, 72],
    ),
    'seed-reserve': compare(
      'Budget enough seed to replant three or four times without depending on the harvest.',
      [48, 1, 3],
      [48, 1, 4],
    ),
    'rotation-land': compare(
      'Size a rotation when experimental beds rest three periods or five between uses.',
      [36, 8, 3],
      [36, 8, 5],
    ),
    'fertilizer-budget': compare(
      'Budget crop treatment for the same campaign at two application intervals.',
      [42, 2, 20, 4],
      [42, 2, 20, 6],
    ),
    'water-budget': compare(
      'Estimate fluid use with a larger middle field and unchanged per-plot rates.',
      ['18,24,12', '1.5,2,1', 8],
      ['18,32,12', '1.5,2,1', 8],
    ),
    'storage-peak': compare(
      'Size harvest storage before and after shifting a delivery of food to the kitchen earlier.',
      ['60,48,32', '30,25,35'],
      ['60,48,32', '44,35,11'],
    ),
    'quota-cycles': compare(
      'Estimate whole harvests to fill a food quota before and after raising the seed reserve.',
      [320, 96, 24],
      [320, 96, 40],
    ),
    'mixed-field-output': compare(
      'Estimate output from three fields when one row loses more plants.',
      ['24,18,32', '3,2,4', '0.95,0.85,0.9'],
      ['24,18,32', '3,2,4', '0.95,0.65,0.9'],
    ),
    'missed-cycle-loss': compare(
      'Estimate unrecovered yield when the crew misses one harvest or three.',
      [110, 1, 0.35],
      [110, 3, 0.35],
    ),
  },
  blending: {
    'weighted-property': compare(
      'Compare the weighted shade score of two decorative aggregate palettes.',
      ['30,50,20', '1,4,9'],
      ['20,50,30', '1,4,9'],
    ),
    'component-shares': compare(
      'Check how adding light accent blocks changes the fractions in a proposed palette.',
      ['48,32,16'],
      ['48,32,32'],
    ),
    'target-two-share': compare('Solve the dark component share for two weighted shade targets.', [2, 9, 5], [2, 9, 7]),
    'target-two-load': compare(
      'Solve component quantities for a fixed order with two target warmth scores.',
      [10, 24, 14, 180],
      [10, 24, 17, 180],
    ),
    'additive-need': compare(
      'Find how much lighter aggregate would bring a stockpile to either brightness target.',
      [80, 3, 10, 5],
      [80, 3, 10, 6],
    ),
    'dilution-need': compare(
      'Estimate extra zero-contribution stock for two lower mixture scores.',
      [96, 12, 9],
      [96, 12, 6],
    ),
    'blend-cost': compare(
      'Compare decorative mixes with the same volume but different amounts of the expensive component.',
      ['24,48,28', '4,2,3'],
      ['12,60,28', '4,2,3'],
    ),
    'property-contribution': compare(
      'Separate each palette component’s contribution after switching the mid-tone stock.',
      ['24,64,32', '-2,3,6'],
      ['24,64,32', '-2,2,6'],
    ),
    'remove-proportional': compare(
      'Check remaining mixed stock after extracting a small versus a large display sample.',
      ['30,45,25', 12],
      ['30,45,25', 28],
    ),
    'scale-recipe': compare(
      'Scale a demonstration blend for two planned courtyard sizes.',
      ['4,6,10', 120],
      ['4,6,10', 180],
    ),
    'stock-limited-scale': compare(
      'Check available mix capacity before and after receiving more of a limiting component.',
      ['2,4,5', '20,28,35'],
      ['2,4,5', '20,44,50'],
    ),
    'mixture-shortfalls': compare(
      'Check how a partial supplier delivery changes the deficits in a fixed palette order.',
      ['96,68,40', '72,20,50'],
      ['96,68,40', '72,48,50'],
    ),
    'property-bounds': compare(
      'Bound reachable palette lightness if the main accent is allowed a larger share.',
      ['2,5,9', '0.2,0.25,0.1', '0.5,0.6,0.25'],
      ['2,5,9', '0.2,0.25,0.1', '0.5,0.6,0.4'],
    ),
    'minimum-compliance': compare(
      'Measure how far an adjusted coarse mix sits above a minimum texture score.',
      ['32,45,23', '1,4,7', 4],
      ['24,45,31', '1,4,7', 4],
    ),
    'range-compliance': compare(
      'Check two mixtures against the same lightness band before sourcing display material.',
      ['40,60', '2,8', 4, 6],
      ['60,40', '2,8', 4, 6],
    ),
    'replace-component': compare(
      'Find how much of a fixed pile must be swapped for darker material at two target scores.',
      [120, 8, 2, 6],
      [120, 8, 2, 5],
    ),
    'mix-two-stock': compare(
      'Check the total and resulting shade score when combining two stockpiles with different incoming quantities.',
      [64, 4, 96, 9],
      [64, 4, 48, 9],
    ),
    'mixture-loss': compare(
      'Estimate post-sorting component quantities before and after changing coarse-fraction retention.',
      ['75,50,25', '0.9,0.9,0.8'],
      ['75,50,25', '0.9,0.9,0.95'],
    ),
    'post-loss-property': compare(
      'Estimate the shade score after retaining more of the darkest component during sorting.',
      ['20,55,25', '2,5,9', '0.9,0.8,0.6'],
      ['20,55,25', '2,5,9', '0.9,0.8,0.9'],
    ),
    'cost-cap-share': compare(
      'Find the maximum premium component share under two unit-cost limits.',
      [2, 7, 3.5],
      [2, 7, 4.5],
    ),
    'impurity-mass': compare(
      'Compare expected unwanted material before and after sourcing cleaner fill.',
      ['80,50,70', '0.08,0.04,0.06'],
      ['80,50,70', '0.03,0.04,0.06'],
    ),
    'purification-loss': compare(
      'Estimate how much useful aggregate two screening setups retain.',
      [160, 0.18, 0.94],
      [160, 0.18, 0.85],
    ),
    'ratio-adjustment': compare(
      'Calculate additions to bring stock on hand to either of two accent ratios.',
      [42, 28, 1],
      [42, 28, 2],
    ),
    'component-budget': compare(
      'Allocate costs for a fixed-size mix after shifting some quantity toward a premium component.',
      [240, '0.5,0.3,0.2', '2,5,9'],
      [240, '0.4,0.3,0.3', '2,5,9'],
    ),
    'property-sensitivity': compare(
      'Compare how the average shade responds to adding a dark or a light component.',
      ['28,48,24', '1,4,9', 1],
      ['28,48,24', '1,4,9', 3],
    ),
  },
  apportion: {
    'exact-quotas': compare(
      'Recompute ideal lantern shares after revising one district’s path length weight.',
      ['9,15,8', 48],
      ['9,20,8', 48],
    ),
    'lower-quotas': compare(
      'Check guaranteed floor allocations when sixteen more paving stacks become available.',
      ['8,5,3', 48],
      ['8,5,3', 64],
    ),
    'upper-quotas': compare(
      'Check maximum quota bands when a new wing adds to one district’s workload.',
      ['7,9,4', 22],
      ['7,14,4', 22],
    ),
    'quota-remainders': compare(
      'Identify fractional claims left after rounding allocations for two batches of fence posts.',
      ['7,5,3', 17],
      ['7,5,3', 19],
    ),
    'floor-residual': compare(
      'Compare undistributed units from an exactly divisible stockpile and a slightly larger one.',
      ['7,4,1', 12],
      ['7,4,1', 13],
    ),
    dhondt: compare(
      'Divide supply bundles among mining crews before and after updating a workload estimate.',
      ['22,12,6', 14],
      ['22,17,6', 14],
    ),
    webster: compare(
      'Assign equal-size depot bays across projects at the current and expanded depot sizes.',
      ['17,8,4', 9],
      ['17,8,4', 12],
    ),
    imperiali: compare(
      'Allocate a scarce rail delivery to three crews with and without more supplies.',
      ['30,12,6', 7],
      ['30,12,6', 11],
    ),
    'modified-webster': compare(
      'Compare warehouse shelf assignments when the smallest depot receives more workload weight.',
      ['16,7,1', 10],
      ['16,7,5', 10],
    ),
    'allocation-errors': compare(
      'Audit deviations from ideal supply quotas before and after shifting units from the largest build.',
      ['9,7,4', '12,6,2'],
      ['9,7,4', '9,7,4'],
    ),
    'relative-errors': compare(
      'Measure relative under- and over-allocation from two distributions of the same lamp stock.',
      ['11,6,3', '13,5,2'],
      ['11,6,3', '10,6,4'],
    ),
    'quota-violations': compare(
      'Audit a planned tool split after moving two tools away from the middle crew.',
      ['6,3,1', '6,3,1'],
      ['6,3,1', '6,1,3'],
    ),
    'absolute-error': compare(
      'Compare total quota deviation before and after reallocating two bridge kits.',
      ['12,8,4', '8,3,1'],
      ['12,8,4', '6,4,2'],
    ),
    'squared-error': compare(
      'Compare two splits of the same decorative material, penalizing large deviations more heavily.',
      ['13,8,5', '13,6,7'],
      ['13,8,5', '13,7,6'],
    ),
    representation: compare(
      'Compare work weight represented by each depot station before and after reassignment.',
      ['18,10,8', '6,3,0'],
      ['18,10,8', '5,2,2'],
    ),
    'zero-grant-weight': compare(
      'Measure demand weight still unserved after adding one slot for a small crew.',
      ['11,8,3,2', '4,2,0,0'],
      ['11,8,3,2', '4,2,1,0'],
    ),
    'next-dhondt': compare(
      'Find the next depot in the D’Hondt sequence after moving the first grant to a different crew.',
      ['12,8,6', '1,0,0'],
      ['12,8,6', '0,1,0'],
    ),
    'next-webster': compare(
      'Find the next depot by odd-divisor priority under two prior distributions.',
      ['15,10,6', '1,1,0'],
      ['15,10,6', '1,0,1'],
    ),
    'dhondt-prefix': compare(
      'Preview the delivery order before and after two late-arriving material bundles are added.',
      ['19,12,5', 8],
      ['19,12,5', 10],
    ),
    'webster-prefix': compare(
      'Compare sequential stock handoffs before and after raising one crew’s demand weight.',
      ['14,10,3', 8],
      ['14,10,7', 8],
    ),
    'method-comparison': compare(
      'Check both allocation methods for a trial order and a larger combined order.',
      ['21,9,5', 9],
      ['21,9,5', 13],
    ),
    'protected-grants': compare(
      'Check how a larger protected minimum for the third site changes total kit awards.',
      ['2,2,1', '16,9,5', 14],
      ['2,2,3', '16,9,5', 14],
    ),
    'cap-dhondt': compare(
      'Redistribute depot stock when the largest site has less shelf space than expected.',
      ['18,10,6', '9,7,6', 16],
      ['18,10,6', '5,7,6', 16],
    ),
    'transfer-distance': compare(
      'Compare minimum depot transfers for a modest rebalance and an expanded relocation.',
      ['12,8,4', '10,9,5'],
      ['12,8,4', '7,10,7'],
    ),
    'house-increment': compare(
      'Compare which crews get additional depot bays under two expansion sizes.',
      ['23,14,9', 12, 3],
      ['23,14,9', 12, 6],
    ),
  },
  'project-cost': {
    'line-items': compare(
      'Reprice separate dock materials when the planned beam count increases.',
      ['64,28,16', '2.5,4,8'],
      ['64,36,16', '2.5,4,8'],
    ),
    subtotal: compare(
      'Compare the material subtotal for a narrow footpath and a wider version.',
      ['80,32,14', '2,3,9'],
      ['112,40,14', '2,3,9'],
    ),
    'fixed-variable': compare(
      'Check how spreading a fixed setup cost over a larger paving run changes cost per unit.',
      [180, 96, 2.5],
      [180, 144, 2.5],
    ),
    overhead: compare(
      'Budget the same bridge work for shared supervision or more costly dedicated supervision.',
      [830, 0.1, 45],
      [830, 0.18, 60],
    ),
    contingency: compare('Set a budget cap for two allowances on an estimated tunnel cost.', [1750, 0.1], [1750, 0.2]),
    'stacked-discounts': compare(
      'Check the purchase price of bulk trim with and without a second supplier discount.',
      [480, '0.12'],
      [480, '0.12,0.08'],
    ),
    'shipping-threshold': compare(
      'Check how a small addition to the cargo affects the delivered total at a shipping cutoff.',
      [175, 180, 16],
      [182, 180, 16],
    ),
    'price-break': compare(
      'Check a brick order just below and at a quoted all-unit discount threshold.',
      [95, 96, 3, 2.6],
      [96, 96, 3, 2.6],
    ),
    'marginal-tiers': compare(
      'Price two timber orders that reach different finite pricing tiers.',
      [72, '48,48,64', '3,2.7,2.4'],
      [112, '48,48,64', '3,2.7,2.4'],
    ),
    'labor-budget': compare(
      'Price survey, grading, and paving labor when a detour raises grading hours.',
      ['3,12,9', '18,12,15'],
      ['3,16,9', '18,12,15'],
    ),
    'rent-or-buy': compare(
      'Check supplied equipment costs for a short dig and a longer clearing campaign.',
      [280, 42, 4, 70],
      [280, 42, 7, 70],
    ),
    'break-even-units': compare(
      'Estimate how many finished items cover setup at the original and reduced sale prices.',
      [124, 7, 3],
      [124, 6, 3],
    ),
    'unit-margin': compare('Check the margin on a workshop’s output if the input price rises.', [12, 7.5], [12, 9.25]),
    'budget-variance': compare(
      'Measure the variance against the same budget before and after adding a missed supply charge.',
      [600, 580],
      [600, 624],
    ),
    'remaining-budget': compare(
      'Check what is still uncommitted before and after reserving funds for fence supplies.',
      [760, 240, 120],
      [760, 240, 350],
    ),
    'cost-to-complete': compare(
      'Estimate remaining build cost before and after the crew completes another section.',
      [144, 65, 3.25],
      [144, 96, 3.25],
    ),
    'estimate-at-completion': compare(
      'Reforecast the total build cost if the remaining supplies cost more per unit.',
      [415, 86, 3, 60],
      [415, 86, 4, 60],
    ),
    'phase-cashflow': compare(
      'Project balances after layout, excavation, and trim when excavation goes over its estimate.',
      ['125,240,190', 620],
      ['125,330,190', 620],
    ),
    'first-overbudget': compare(
      'Identify the first phase exceeding the cap if the finishing material price drops.',
      ['80,220,180', 425],
      ['80,220,110', 425],
    ),
    'weighted-unit-cost': compare(
      'Compare average procurement cost after ordering more of the cheaper grade.',
      ['36,48,60', '4,3,2'],
      ['36,48,108', '4,3,2'],
    ),
    'price-sensitivity': compare(
      'Measure combined cost change when two price quotes rise and one falls.',
      ['48,120,60', '0.5,0,0'],
      ['48,120,60', '0.5,0.25,-0.4'],
    ),
    'waste-adjustment': compare(
      'Budget how many paving units to order under better or worse usable yield.',
      [258, 0.95, 1.5],
      [258, 0.85, 1.5],
    ),
    'reuse-credit': compare(
      'Estimate cost net of salvaged blocks before and after recovering more stone trim.',
      [520, '28,16', '2,4'],
      [520, '28,28', '2,4'],
    ),
    'scenario-budget': compare(
      'Compare low and high project cost estimates when widening the planned path.',
      ['64,28,14', '1.5,3,4', '2.5,4,5.5', 80],
      ['96,28,14', '1.5,3,4', '2.5,4,5.5', 80],
    ),
    'cost-priority': compare(
      'Reorder optional depot upgrades when one becomes cheaper to build.',
      ['40,60,36', '24,30,18'],
      ['40,60,24', '24,30,18'],
    ),
  },
};
