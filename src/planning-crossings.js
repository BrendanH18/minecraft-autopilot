import { demand, same, sequence, sum } from './offline-kit.js';

const command = (signature, types, description, run) => ({ signature, types, description, run });

function balancedMarks(distance, gap) {
  if (distance === 0) return [0];
  const intervals = Math.ceil(distance / gap);
  return sequence(intervals + 1, (i) => Math.floor((i * distance) / intervals));
}

function runs(eligible) {
  const windows = [];
  for (const [i, ok] of eligible.entries()) {
    if (!ok) continue;
    if (i === 0 || !eligible[i - 1]) windows.push([i + 1, i + 1]);
    else windows.at(-1)[1] = i + 1;
  }
  return windows;
}

const harborplanCommands = [
  command(
    'quay-frontage <vessel-lengths> <gap> <end-buffer>',
    ['S', 'c', 'c'],
    'Measure occupied quay length with gaps between vessels and a buffer at both ends.',
    (lengths, gap, ends) => sum(lengths) + (lengths.length - 1) * gap + 2 * ends,
  ),
  command(
    'berth-count <frontage> <vessel-length> <gap>',
    ['c', 's', 'c'],
    'Fit equal vessels along a quay with gaps only between neighbors.',
    (frontage, length, gap) => Math.floor((frontage + gap) / (length + gap)),
  ),
  command(
    'berth-assignment <berth-lengths> <vessel-lengths>',
    ['S', 'S'],
    'Assign arriving vessels to the smallest unused berth that fits, choosing earlier ties. Zero means unassigned.',
    (berths, vessels) => {
      const available = [...berths];
      return vessels.map((length) => {
        let best = -1;
        for (const [i, space] of available.entries()) {
          if (space >= length && (best === -1 || space < available[best])) best = i;
        }
        if (best !== -1) available[best] = 0;
        return best + 1;
      });
    },
  ),
  command(
    'finger-decks <lengths> <width> <layers>',
    ['S', 's', 's'],
    'Count blocks in rectangular finger piers extending outside the quay.',
    (lengths, width, layers) => sum(lengths) * width * layers,
  ),
  command(
    'pile-cuts <bed-levels> <deck-bottom> <embed>',
    ['l', 'i', 'c'],
    'Size piles from the surveyed bed boundary up to the deck underside plus buried length.',
    (beds, top, embed) =>
      beds.map((bed) => {
        demand(Number.isSafeInteger(bed) && bed <= top, 'Beds must be whole levels at or below the deck underside.');
        return top - bed + embed;
      }),
  ),
  command(
    'breakwater-shell <length> <width> <height> <skin>',
    ['s', 's', 's', 's'],
    'Count the outer shell of a closed cuboid breakwater including top, bottom and ends.',
    (length, width, height, skin) => {
      const cap = Math.min(height, 2 * skin);
      const side = Math.min(width, 2 * skin);
      const end = Math.min(length, 2 * skin);
      return length * width * cap + (height - cap) * (length * side + (width - side) * end);
    },
  ),
  command(
    'dredge-cuts <depths> <target> <strip-width>',
    ['C', 'c', 's'],
    'Calculate excavation for successive one-block strips shallower than target depth.',
    (depths, target, width) => sum(depths.map((depth) => Math.max(0, target - depth) * width)),
  ),
  command(
    'depth-windows <depths> <draft> <margin>',
    ['C', 'c', 'c'],
    'List consecutive one-based survey stations deep enough for a vessel and margin.',
    (depths, draft, margin) => runs(depths.map((depth) => depth >= draft + margin)),
  ),
  command(
    'turning-basin <diameter> <side-margin> <width> <length>',
    ['s', 'c', 's', 's'],
    'Check a circular turning envelope against a rectangular basin and report both shortfalls.',
    (diameter, margin, width, length) => ({
      widthShort: Math.max(0, diameter + 2 * margin - width),
      lengthShort: Math.max(0, diameter + 2 * margin - length),
    }),
  ),
  command(
    'fender-offsets <frontage> <max-gap>',
    ['s', 's'],
    'Place fenders at both ends of a quay with balanced gaps no wider than the limit. Offsets start at zero.',
    (frontage, gap) => balancedMarks(frontage - 1, gap),
  ),
  command(
    'terminal-gates <arrivals> <gate-limit>',
    ['C', 's'],
    'Trace the queue after arrivals and a fixed departure capacity each tick.',
    (arrivals, capacity) => {
      let queue = 0;
      return arrivals.map((count) => {
        queue = Math.max(0, queue + count - capacity);
        return queue;
      });
    },
  ),
  command(
    'gangway-run <height-difference> <max-rise> <unit-run>',
    ['c', 's', 's'],
    'Find the horizontal run in whole ramp modules needed for a rise.',
    (rise, limit, run) => Math.ceil(rise / limit) * run,
  ),
  command(
    'cargo-manifest <lots> <crate-size>',
    ['C', 's'],
    'Count sealed and partial crates for separate cargo lots.',
    (lots, size) =>
      lots.map((lot) => ({ full: Math.floor(lot / size), partial: lot % size === 0 ? 0 : 1, loose: lot % size })),
  ),
  command(
    'shuttle-clock <loads> <capacity> <outbound> <return-time> <turnaround>',
    ['c', 's', 'c', 'c', 'c'],
    'Estimate the last delivery time, including return and turnaround between trips.',
    (loads, capacity, outbound, back, turn) => {
      const trips = Math.ceil(loads / capacity);
      return trips * outbound + Math.max(0, trips - 1) * (back + turn);
    },
  ),
  command(
    'unload-order <cargo> <rates>',
    ['C', 'S'],
    'Order vessels by increasing whole unload ticks with input-order ties.',
    (cargo, rates) => {
      same(cargo, rates);
      return cargo
        .map((count, i) => ({ vessel: i + 1, ticks: Math.ceil(count / rates[i]) }))
        .sort((a, b) => a.ticks - b.ticks || a.vessel - b.vessel);
    },
  ),
  command(
    'dock-appointments <arrival-ticks> <service-ticks>',
    ['C', 'C'],
    'Queue vessels at one dock in listed arrival order and report departure clocks.',
    (arrivals, service) => {
      same(arrivals, service);
      let free = 0;
      return arrivals.map((arrival, i) => {
        demand(i === 0 || arrival >= arrivals[i - 1], 'Arrivals must be ordered.');
        free = Math.max(arrival, free) + service[i];
        return free;
      });
    },
  ),
  command(
    'bollard-pairs <offsets> <min-span> <max-span>',
    ['C', 'c', 'c'],
    'Count distinct pairs of listed bollards whose separation meets both limits.',
    (offsets, min, max) => {
      demand(min <= max, 'Minimum span exceeds maximum span.');
      const sorted = [...new Set(offsets)].sort((a, b) => a - b);
      let pairs = 0;
      for (const [i, start] of sorted.entries()) {
        for (let j = i + 1; j < sorted.length && sorted[j] - start <= max; j++) if (sorted[j] - start >= min) pairs++;
      }
      return pairs;
    },
  ),
  command(
    'tide-steps <deck-level> <water-levels> <max-step>',
    ['i', 'l', 's'],
    'Compute whole access steps from the waterline to a fixed landing, zero at or above the deck.',
    (deck, water, step) => water.map((level) => Math.ceil(Math.max(0, deck - level) / step)),
  ),
  command(
    'fairway-width <beams> <bank-clearance> <passing-gap>',
    ['S', 'c', 'c'],
    'Measure a fairway serving all listed vessels side by side with bank and passing clearance.',
    (beams, bank, gap) => sum(beams) + 2 * bank + (beams.length - 1) * gap,
  ),
  command(
    'drydock-pump <length> <width> <depth> <pumps> <per-pump> <inflow>',
    ['s', 's', 'c', 's', 's', 'c'],
    'Estimate ticks to empty a flooded rectangular dock with constant inflow. Null means no net drainage.',
    (length, width, depth, pumps, rate, inflow) => {
      if (depth === 0) return 0;
      const net = BigInt(pumps * rate - inflow);
      if (net <= 0n) return null;
      const volume = BigInt(length) * BigInt(width) * BigInt(depth);
      return Number((volume + net - 1n) / net);
    },
  ),
  command(
    'yard-stack <cargo> <pad-width> <pad-depth> <max-height>',
    ['c', 's', 's', 's'],
    'Fill a rectangular staging pad layer by layer and report stored and overflow crates.',
    (cargo, w, d, h) => {
      const stored = Math.min(cargo, w * d * h);
      return { stored, layers: Math.ceil(stored / (w * d)), overflow: cargo - stored };
    },
  ),
  command(
    'channel-buoys <leg-lengths> <spacing>',
    ['S', 's'],
    'Count paired end markers and intermediate pairs at a maximum spacing, sharing leg junctions.',
    (legs, spacing) => 2 * (1 + sum(legs.map((leg) => Math.ceil(leg / spacing)))),
  ),
  command(
    'slipway-profile <top-level> <drop-every> <stations>',
    ['i', 's', 's'],
    'Survey a stepped slipway dropping one block at each complete horizontal interval.',
    (top, interval, stations) => sequence(stations, (i) => top - Math.floor(i / interval)),
  ),
  command(
    'quay-resurface <strip-lengths> <damaged-widths> <spare-blocks>',
    ['S', 'C', 'c'],
    'Budget one-layer patches in disjoint quay strips against stocks.',
    (lengths, widths, stock) => {
      same(lengths, widths);
      const repair = sum(lengths.map((length, i) => length * widths[i]));
      return { repair, missing: Math.max(0, repair - stock) };
    },
  ),
  command(
    'crane-reach <crane-x> <crane-z> <radius> <targets>',
    ['i', 'i', 'c', 'points2'],
    'Identify one-based loading positions within horizontal reach of the crane pivot.',
    (x, z, r, targets) => targets.flatMap(([tx, tz], i) => ((tx - x) ** 2 + (tz - z) ** 2 <= r ** 2 ? [i + 1] : [])),
  ),
];

const aqueductCommands = [
  command(
    'trough-section <inside-width> <wall-height> <wall-thickness> <base-thickness>',
    ['s', 's', 's', 's'],
    'Measure the solid cross section of an open rectangular trough with its bed extending under the walls.',
    (width, height, wall, base) => (width + 2 * wall) * base + 2 * wall * height,
  ),
  command(
    'reach-volume <lengths> <widths> <depths>',
    ['S', 'S', 'C'],
    'Total the water cells in disjoint rectangular reaches of different dimensions.',
    (lengths, widths, depths) => {
      same(lengths, widths, depths);
      return sum(lengths.map((length, i) => length * widths[i] * depths[i]));
    },
  ),
  command(
    'invert-profile <start-level> <reach-drops>',
    ['i', 'C'],
    'Trace the channel floor boundary level at the downstream end of every reach.',
    (start, drops) => {
      let level = start;
      return drops.map((drop) => {
        level -= drop;
        return level;
      });
    },
  ),
  command(
    'terrain-crossings <floor-levels> <ground-levels>',
    ['l', 'l'],
    'Find exposed and buried distances from surveyed ground to the channel floor at each station.',
    (floor, ground) => {
      same(floor, ground);
      return floor.map((level, i) => ({
        exposed: Math.max(0, level - ground[i]),
        buried: Math.max(0, ground[i] - level),
      }));
    },
  ),
  command(
    'crest-freeboard <crests> <surfaces>',
    ['l', 'l'],
    'Measure signed spare height from each water surface to its wall crest. Negative values indicate overtopping.',
    (crests, surfaces) => {
      same(crests, surfaces);
      return crests.map((level, i) => level - surfaces[i]);
    },
  ),
  command(
    'source-strips <lengths> <channel-width> <max-run>',
    ['S', 's', 's'],
    'Count full-width source strips for independently restarted reaches given coverage per source.',
    (lengths, width, reach) => sum(lengths.map((length) => Math.ceil(length / reach))) * width,
  ),
  command(
    'drop-stations <length> <total-drop>',
    ['s', 'c'],
    'Distribute whole elevation drops over a reach and report cumulative drop after each block.',
    (length, drop) => sequence(length, (i) => Math.floor(((i + 1) * drop) / length)),
  ),
  command(
    'gate-openings <widths> <gate-heights> <lifts>',
    ['S', 'S', 'C'],
    'Find open area across a bank of lifting sluices, clamping each lift to the gate height.',
    (widths, heights, lifts) => {
      same(widths, heights, lifts);
      return sum(widths.map((width, i) => width * Math.min(heights[i], lifts[i])));
    },
  ),
  command(
    'supply-split <supply> <branch-limits> <requests>',
    ['c', 'C', 'C'],
    'Deliver the available flow in branch priority order, respecting each branch intake limit.',
    (supply, limits, requests) => {
      same(limits, requests);
      let remaining = supply;
      const deliveries = requests.map((request, i) => {
        const given = Math.min(remaining, request, limits[i]);
        remaining -= given;
        return given;
      });
      return { deliveries, remaining };
    },
  ),
  command(
    'leak-trace <inlet> <reach-losses> <tributaries>',
    ['c', 'C', 'C'],
    'Trace outlet flow per reach after leakage capped at incoming flow, then add local tributaries.',
    (inlet, losses, tributaries) => {
      same(losses, tributaries);
      let flow = inlet;
      return losses.map((loss, i) => {
        flow = Math.max(0, flow - loss) + tributaries[i];
        return flow;
      });
    },
  ),
  command(
    'reservoir-cycle <initial> <capacity> <receipts> <demands>',
    ['c', 'c', 'C', 'C'],
    'Track storage through successive periods, spilling excess receipts before serving each demand.',
    (initial, capacity, receipts, demands) => {
      demand(initial <= capacity, 'Initial storage exceeds capacity.');
      same(receipts, demands);
      let stored = initial;
      return receipts.map((receipt, i) => {
        const spill = Math.max(0, stored + receipt - capacity);
        stored += receipt - spill;
        const delivered = Math.min(stored, demands[i]);
        stored -= delivered;
        return { stored, spill, unmet: demands[i] - delivered };
      });
    },
  ),
  command(
    'isolation-loss <gate-offsets> <end-offset> <breach>',
    ['indexes', 's', 'c'],
    'Find the half-open reach containing a breach between gates, including implicit end gates.',
    (gates, end, breach) => {
      demand(breach < end && gates.every((gate) => gate <= end), 'Offsets must lie within the aqueduct.');
      const from = Math.max(0, ...gates.filter((gate) => gate <= breach));
      const until = Math.min(end, ...gates.filter((gate) => gate > breach));
      return { from, until, length: until - from };
    },
  ),
  command(
    'lining-tiles <length> <inside-width> <wet-depth> <tile-area>',
    ['s', 's', 'c', 's'],
    'Budget tiles for the bed and both wetted faces, rounding each face separately.',
    (length, width, depth, tile) => Math.ceil((length * width) / tile) + 2 * Math.ceil((length * depth) / tile),
  ),
  command(
    'settling-bays <flow> <hold-ticks> <bay-volume>',
    ['c', 'c', 's'],
    'Find whole settling bays providing the target holding time for a supplied flow.',
    (flow, hold, bay) => Math.ceil((flow * hold) / bay),
  ),
  command(
    'overflow-weirs <inflows> <main-limit> <weir-limit>',
    ['C', 'c', 'c'],
    'Split supplied flow among the main channel, bypass weir and excess at each sample.',
    (inflows, main, weir) =>
      inflows.map((flow) => ({
        main: Math.min(main, flow),
        bypass: Math.min(weir, Math.max(0, flow - main)),
        excess: Math.max(0, flow - main - weir),
      })),
  ),
  command(
    'channel-neck <widths> <depths> <required-area>',
    ['S', 'C', 'c'],
    'Locate the first minimum wet cross section and the area missing from the design target.',
    (widths, depths, required) => {
      same(widths, depths);
      const areas = widths.map((width, i) => width * depths[i]);
      const area = Math.min(...areas);
      return { station: areas.indexOf(area) + 1, area, missing: Math.max(0, required - area) };
    },
  ),
  command(
    'siphon-head <inlet> <low-point> <outlet>',
    ['i', 'i', 'i'],
    'Measure both siphon legs and available elevation head from inlet to outlet.',
    (inlet, low, outlet) => {
      demand(low <= Math.min(inlet, outlet), 'Low point must be at or below both ends.');
      return { descent: inlet - low, ascent: outlet - low, head: inlet - outlet };
    },
  ),
  command(
    'access-crossings <walk-offsets> <length>',
    ['indexes', 's'],
    'Find the longest gap between maintenance crossings including both ends, choosing the earliest tie.',
    (walks, length) => {
      demand(
        walks.every((offset) => offset <= length),
        'Crossing lies beyond the channel.',
      );
      const ordered = [0, ...walks.sort((a, b) => a - b), length];
      let best = { from: 0, until: 0 };
      for (let i = 1; i < ordered.length; i++)
        if (ordered[i] - ordered[i - 1] > best.until - best.from) best = { from: ordered[i - 1], until: ordered[i] };
      return best;
    },
  ),
  command(
    'divider-walls <lanes> <reach> <depth> <thickness>',
    ['s', 's', 's', 's'],
    'Count blocks in continuous interior partitions between parallel water lanes.',
    (lanes, reach, depth, thickness) => (lanes - 1) * reach * depth * thickness,
  ),
  command(
    'drop-pools <drops> <pool-length-per-drop> <width>',
    ['C', 's', 's'],
    'Reserve receiving pool footprints sized in proportion to the fall at each drop.',
    (drops, length, width) => drops.map((drop) => drop * length * width),
  ),
  command(
    'cover-slabs <length> <width> <opening-rows>',
    ['s', 's', 'indexes'],
    'Count roof slabs after leaving the listed distinct zero-based rows open across the channel.',
    (length, width, rows) => {
      demand(
        rows.every((row) => row < length),
        'Opening row lies outside the channel.',
      );
      return (length - new Set(rows).size) * width;
    },
  ),
  command(
    'inlet-screen <opening-width> <bar-width> <max-gap>',
    ['s', 's', 's'],
    'Find the fewest interior bars that divide an opening into gaps at most the supplied width.',
    (width, bar, gap) => {
      const count = Math.max(0, Math.ceil((width - gap) / (bar + gap)));
      return count * bar > width ? null : { bars: count, freeWidth: width - count * bar };
    },
  ),
  command(
    'feeder-headroom <branch-flows> <trunk-limits>',
    ['C', 'C'],
    'Compute signed spare trunk flow before each downstream takeoff assuming all branches are served.',
    (branches, limits) => {
      same(branches, limits);
      let remainingFlow = sum(branches);
      return limits.map((limit, i) => {
        const room = limit - remainingFlow;
        remainingFlow -= branches[i];
        return room;
      });
    },
  ),
  command(
    'winter-drain <reach-volumes> <outlet-rates>',
    ['C', 'S'],
    'Estimate parallel reach drainage time and the last reach to finish, choosing the earliest tie.',
    (volumes, rates) => {
      same(volumes, rates);
      const times = volumes.map((volume, i) => Math.ceil(volume / rates[i]));
      const ticks = Math.max(...times);
      return { ticks, reach: times.indexOf(ticks) + 1 };
    },
  ),
  command(
    'inspection-route <leg-lengths> <closed-legs> <detours>',
    ['S', 'C', 'C'],
    'Evaluate a maintenance route that uses a specified replacement length for each closed leg.',
    (legs, closed, detours) => {
      same(legs, closed, detours);
      demand(
        closed.every((flag) => flag <= 1),
        'Closure flags must be zero or one.',
      );
      return sum(legs.map((length, i) => (closed[i] ? detours[i] : length)));
    },
  ),
];

const viaductCommands = [
  command(
    'span-balance <crossing-length> <max-span>',
    ['s', 's'],
    'Split a crossing into the fewest spans under a limit, putting longer spans first.',
    (length, limit) => {
      const count = Math.ceil(length / limit);
      return sequence(count, (i) => Math.floor(length / count) + (i < length % count ? 1 : 0));
    },
  ),
  command(
    'pier-chainage <clear-spans> <interior-pier-width>',
    ['S', 's'],
    'Locate the upstream edge of each interior pier from the start of the first clear span.',
    (spans, width) => {
      let at = 0;
      return spans.slice(0, -1).map((span) => {
        const edge = at + span;
        at = edge + width;
        return edge;
      });
    },
  ),
  command(
    'deck-surface <span-lengths> <pier-widths> <traffic-width>',
    ['S', 'C', 's'],
    'Measure paved area across clear spans and supplied pier caps including both end caps.',
    (spans, piers, traffic) => {
      demand(piers.length === spans.length + 1, 'Provide one pier width at each end and each span joint.');
      return (sum(spans) + sum(piers)) * traffic;
    },
  ),
  command(
    'soffit-clearance <deck-tops> <deck-depths> <obstacle-tops>',
    ['l', 'S', 'l'],
    'Measure vertical clearance from each obstacle top to the underside of the deck.',
    (tops, depths, obstacles) => {
      same(tops, depths, obstacles);
      return tops.map((top, i) => top - depths[i] - obstacles[i]);
    },
  ),
  command(
    'pier-shafts <heights> <widths> <depths>',
    ['C', 'S', 'S'],
    'Count masonry blocks in rectangular pier shafts with individual dimensions.',
    (heights, widths, depths) => {
      same(heights, widths, depths);
      return heights.map((h, i) => h * widths[i] * depths[i]);
    },
  ),
  command(
    'hollow-piers <outside-width> <outside-depth> <height> <wall>',
    ['s', 's', 's', 's'],
    'Measure blocks saved by an open hollow core through a rectangular pier.',
    (w, d, h, wall) => Math.max(0, w - 2 * wall) * Math.max(0, d - 2 * wall) * h,
  ),
  command(
    'corbel-layers <shaft-width> <cap-width> <max-step>',
    ['s', 's', 's'],
    'List widths of symmetric corbel courses, advancing both sides up to the allowed step.',
    (shaft, cap, step) => {
      demand(cap >= shaft && (cap - shaft) % 2 === 0, 'Centering requires a nonnegative even width difference.');
      const layers = Math.ceil((cap - shaft) / (2 * step));
      return sequence(layers, (i) => Math.min(cap, shaft + (i + 1) * 2 * step));
    },
  ),
  command(
    'footing-spread <width> <depth> <courses> <spread-per-side>',
    ['s', 's', 's', 'c'],
    'Budget foundation blocks as each successive course expands on all four sides from the first course.',
    (w, d, n, spread) => {
      const steps = ((n - 1) * n) / 2;
      const squares = ((n - 1) * n * (2 * n - 1)) / 6;
      return n * w * d + 2 * spread * (w + d) * steps + 4 * spread ** 2 * squares;
    },
  ),
  command(
    'bearing-pads <span-count> <beams-per-span> <blocks-per-seat>',
    ['s', 's', 's'],
    'Count separate bearing pads under both ends of every beam including adjacent span ends.',
    (spans, beams, blocks) => 2 * spans * beams * blocks,
  ),
  command(
    'arch-ordinates <span> <rise>',
    ['s', 'c'],
    'Sample a parabolic arch at each whole horizontal offset including both ends, rounding height down.',
    (span, rise) => sequence(span + 1, (i) => Math.floor((4 * rise * i * (span - i)) / (span * span))),
  ),
  command(
    'spandrel-fill <arch-heights> <deck-base> <barrel-width>',
    ['C', 'c', 's'],
    'Fill between sampled arch crown boundaries and a level deck base across the barrel width.',
    (heights, base, width) => {
      demand(
        heights.every((height) => height <= base),
        'An arch crown exceeds the deck base.',
      );
      return sum(heights.map((height) => base - height)) * width;
    },
  ),
  command(
    'arch-centering <opening-heights> <bent-spacing>',
    ['C', 's'],
    'Budget temporary uprights at the first and last columns and every spacing interval between them.',
    (heights, spacing) => sum(heights.filter((_, i) => i % spacing === 0 || i === heights.length - 1)),
  ),
  command(
    'parapet-openings <length> <side-one> <side-two> <height>',
    ['s', 'C', 'C', 's'],
    'Count parapet blocks after subtracting total opening widths on each side.',
    (length, left, right, height) => {
      const a = sum(left),
        b = sum(right);
      demand(a <= length && b <= length, 'Opening widths exceed a parapet length.');
      return (2 * length - a - b) * height;
    },
  ),
  command(
    'lane-envelope <deck-width> <edges> <lanes> <divider-width>',
    ['s', 'c', 'S', 'c'],
    'Report spare deck width after edge strips on both sides, each lane and interior dividers.',
    (width, edge, lanes, divider) => width - 2 * edge - sum(lanes) - (lanes.length - 1) * divider,
  ),
  command(
    'joint-offsets <span-lengths> <max-panel>',
    ['S', 's'],
    'Find interior deck joints, restarting panel spacing in each span and including every interior span boundary.',
    (spans, panel) => {
      const count = sum(spans.map((length) => Math.ceil(length / panel))) - 1;
      demand(count <= 1000, 'Output is limited to 1000 joints.');
      const joints = [];
      let start = 0;
      for (const [i, length] of spans.entries()) {
        for (let offset = panel; offset < length; offset += panel) joints.push(start + offset);
        start += length;
        if (i < spans.length - 1) joints.push(start);
      }
      return joints;
    },
  ),
  command(
    'expansion-gaps <panels> <growth-per-panel> <gap-capacities>',
    ['C', 'S', 'C'],
    'Check independent joints against the combined growth of their assigned panels in the supplied length unit.',
    (panels, growth, capacities) => {
      same(panels, growth, capacities);
      return panels.map((count, i) => Math.max(0, count * growth[i] - capacities[i]));
    },
  ),
  command(
    'approach-stairs <end-heights> <landing-every> <landing-length>',
    ['C', 's', 'c'],
    'Compute horizontal run for unit-rise steps with intermediate landings between flights.',
    (heights, flight, landing) =>
      heights.map((height) => height + Math.max(0, Math.ceil(height / flight) - 1) * landing),
  ),
  command(
    'deck-camber <half-width> <crown-rise>',
    ['s', 'c'],
    'Sample the symmetric stepped cross slope from left edge through the center to the right edge.',
    (half, rise) => sequence(2 * half + 1, (i) => Math.floor(((half - Math.abs(i - half)) * rise) / half)),
  ),
  command(
    'pier-avoidance <proposed-offsets> <forbidden-bounds>',
    ['C', 'intervals'],
    'Flag one-based proposed pier sites inside any inclusive exclusion interval.',
    (offsets, bounds) => offsets.flatMap((x, i) => (bounds.some(([a, b]) => a <= x && x <= b) ? [i + 1] : [])),
  ),
  command(
    'lift-batches <beam-weights> <lift-limit>',
    ['S', 's'],
    'Pack consecutive indivisible beams into lifts, starting a new lift when the next beam would exceed capacity.',
    (weights, limit) => {
      const lifts = [];
      let load = 0;
      for (const weight of weights) {
        demand(weight <= limit, 'A beam exceeds the lift limit.');
        if (load + weight > limit) {
          lifts.push(load);
          load = 0;
        }
        load += weight;
      }
      return [...lifts, load];
    },
  ),
  command(
    'erection-fronts <span-work> <left-rate> <right-rate>',
    ['S', 's', 's'],
    'Find a split of contiguous spans between end crews that minimizes completion ticks. Earliest split wins ties.',
    (work, leftRate, rightRate) => {
      const total = sum(work);
      let left = 0,
        best = { leftSpans: 0, ticks: Math.ceil(total / rightRate) };
      for (const [i, amount] of work.entries()) {
        left += amount;
        const ticks = Math.max(Math.ceil(left / leftRate), Math.ceil((total - left) / rightRate));
        if (ticks < best.ticks) best = { leftSpans: i + 1, ticks };
      }
      return best;
    },
  ),
  command(
    'staging-decks <span-work> <ready-piers>',
    ['C', 'C'],
    'Identify spans with an outstanding workload and completed support piers at both ends.',
    (work, ready) => {
      demand(
        ready.length === work.length + 1 && ready.every((flag) => flag <= 1),
        'Supply a zero or one readiness flag for every bounding pier.',
      );
      return work.flatMap((count, i) => (count && ready[i] && ready[i + 1] ? [i + 1] : []));
    },
  ),
  command(
    'repair-possession <work-ticks> <window> <setup>',
    ['C', 's', 'c'],
    'Count work windows for resumable serial repairs after paying setup time in each window.',
    (work, window, setup) => {
      const ticks = sum(work);
      return ticks === 0 ? 0 : window <= setup ? null : Math.ceil(ticks / (window - setup));
    },
  ),
  command(
    'deck-stockpiles <supply> <work-per-span> <reserve>',
    ['c', 'C', 'c'],
    'Find how many consecutive whole spans can be completed while preserving a minimum stock.',
    (supply, work, reserve) => {
      demand(reserve <= supply, 'Reserve exceeds stock.');
      let stock = supply;
      let completed = 0;
      for (const need of work) {
        if (need > stock - reserve) break;
        stock -= need;
        completed++;
      }
      return { completed, stock };
    },
  ),
  command(
    'survey-deviation <start-level> <end-level> <observed>',
    ['i', 'i', 'l'],
    'Measure signed deviations from the linear grade through design end levels at equally spaced stations.',
    (start, end, observed) => {
      demand(observed.length >= 2, 'Supply both end stations.');
      return observed.map((value, i) => value - (start + ((end - start) * i) / (observed.length - 1)));
    },
  ),
];

export const crossingGroups = [
  {
    name: 'harborplan',
    note: 'Offline harbor layouts, berth assignments and freight schedules from supplied dimensions and clocks.',
    commands: harborplanCommands,
  },
  {
    name: 'aqueduct',
    note: 'Offline canal-channel sections, water budgets and elevation surveys from supplied measurements.',
    commands: aqueductCommands,
  },
  {
    name: 'viaduct',
    note: 'Offline viaduct span layouts, clearance checks and construction quantities from supplied dimensions.',
    commands: viaductCommands,
  },
];
