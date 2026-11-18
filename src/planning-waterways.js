import { compensatedAdder, demand, same, sum } from './offline-kit.js';
import { budgetFits, wholeCeil, wholeFloor } from './resource-rounding.js';

const command = (signature, types, description, run) => ({ signature, types, description, run });

function sectionGrid(length, width, sectionLength, sectionWidth) {
  const columns = Math.ceil(length / sectionLength);
  const rows = Math.ceil(width / sectionWidth);
  return { columns, rows, sections: columns * rows };
}

function sectionAt(length, width, sectionLength, sectionWidth, column, row) {
  const { columns, rows } = sectionGrid(length, width, sectionLength, sectionWidth);
  demand(column <= columns && row <= rows, 'The section index is outside the grid.');
  const x = (column - 1) * sectionLength;
  const z = (row - 1) * sectionWidth;
  return { x, z, length: Math.min(sectionLength, length - x), width: Math.min(sectionWidth, width - z) };
}

function dividerCells(length, width, depth, sectionLength, sectionWidth) {
  const { columns, rows } = sectionGrid(length, width, sectionLength, sectionWidth);
  const alongWidth = (columns - 1) * width * depth;
  const alongLength = (rows - 1) * length * depth;
  const shared = (columns - 1) * (rows - 1) * depth;
  return { alongWidth, alongLength, shared, total: alongWidth + alongLength - shared };
}

function cofferdamWall(length, width, depth, freeboard, thickness) {
  // Expand the inner footprint on each side. Count corner cells just once.
  const cellsPerLayer = 2 * thickness * (length + width + 2 * thickness);
  return { submerged: cellsPerLayer * depth, aboveWater: cellsPerLayer * freeboard };
}

function barrierKit(installs, removals, initial) {
  same(installs, removals);
  let installed = 0;
  let peak = 0;
  for (const [index, cells] of installs.entries()) {
    demand(removals[index] <= installed, 'A phase cannot reclaim more cells than were already installed.');
    installed += cells - removals[index];
    peak = Math.max(peak, installed);
  }
  return { peak, extra: Math.max(0, peak - initial), stillInstalled: installed };
}

function spongeLoads(volumes, capacity) {
  // A used sponge cannot finish a second section before it is dried again.
  const placements = volumes.map((volume) => Math.ceil(volume / capacity));
  return { placements, total: sum(placements) };
}

function dryingBacklog(arrivals, capacity) {
  let pending = 0;
  return arrivals.map((arrived) => {
    const dried = Math.min(capacity, pending + arrived);
    pending += arrived - dried;
    return { dried, pending };
  });
}

function reuseShifts(placements, cleanStock, dryPerShift, shifts) {
  let clean = cleanStock;
  let wet = 0;
  let remaining = placements;
  let elapsed = 0;
  while (elapsed < shifts && remaining > 0 && clean > 0) {
    const used = Math.min(clean, remaining);
    clean -= used;
    remaining -= used;
    // Sponges used this shift may dry in its end-of-shift batch.
    wet += used;
    const dried = Math.min(wet, dryPerShift);
    clean += dried;
    wet -= dried;
    elapsed++;
  }
  return { elapsed, placed: placements - remaining, remaining, clean, wet };
}

function pumpCrew(volume, inflow, rate, setup, deadline) {
  if (volume === 0) return 0;
  if (deadline <= setup) return null;
  const timeToPump = deadline - setup;
  const needed = (volume + inflow * deadline) / timeToPump;
  // A positive task always needs at least one pump, even below rounding precision.
  return Math.max(1, wholeCeil(needed / rate));
}

function pumpOutage(volume, rate, inflow, outageStart, downtime) {
  if (volume === 0) return 0;
  const net = rate - inflow;
  if (net <= 0) return null;
  const normal = volume / net;
  if (budgetFits(normal, outageStart)) return normal;
  return normal + downtime + (inflow * downtime) / net;
}

function pumpHandoff(volume, inflow, firstRate, firstTime, nextRate) {
  if (volume === 0) return 0;
  const firstNet = firstRate - inflow;
  if (firstNet > 0 && budgetFits(volume / firstNet, firstTime)) return volume / firstNet;
  const nextNet = nextRate - inflow;
  if (nextNet <= 0) return null;
  return firstTime + (volume - firstNet * firstTime) / nextNet;
}

function pumpSchedule(volumes, inflows, rate, setup) {
  same(volumes, inflows);
  const advance = compensatedAdder();
  return volumes.map((volume, index) => {
    if (volume === 0) return advance(0);
    const net = rate - inflows[index];
    demand(net > 0, 'Pump rate must exceed inflow in every flooded section.');
    return advance(pumpDuration(volume, inflows[index], net, setup));
  });
}

function pumpDuration(volume, inflow, netRate, setup) {
  return setup + (volume + inflow * setup) / netRate;
}

function wetCheckpoints(initial, capacities, inflows, withdrawals) {
  same(capacities, inflows, withdrawals);
  let water = initial;
  return capacities.map((capacity, index) => {
    const afterDrain = Math.max(0, water - withdrawals[index]);
    const incoming = afterDrain + inflows[index];
    water = Math.min(capacity, incoming);
    return { water, spill: Math.max(0, incoming - capacity) };
  });
}

function breachLevel(leftArea, leftDepth, rightArea, rightDepth) {
  const waterDepth = (leftArea * leftDepth + rightArea * rightDepth) / (leftArea + rightArea);
  const moved = (Math.abs(leftDepth - rightDepth) * leftArea * rightArea) / (leftArea + rightArea);
  const direction = leftDepth === rightDepth ? null : leftDepth > rightDepth ? 'left-to-right' : 'right-to-left';
  return { waterDepth, moved, direction };
}

function stageDepth(depth, step, stage) {
  demand(stage <= Math.ceil(depth / step), 'The stage is below the excavation floor.');
  return { top: (stage - 1) * step, bottom: Math.min(depth, stage * step) };
}

function dryingMethod(volume, cellsPerSponge, spongesPerBatch, batchTime, setup, pumpNetRate) {
  const batches = Math.ceil(Math.ceil(volume / cellsPerSponge) / spongesPerBatch);
  const spongeTime = batches * batchTime;
  const pumpTime = volume === 0 ? 0 : setup + volume / pumpNetRate;
  let preferred = 'tie';
  if (!budgetFits(spongeTime, pumpTime)) preferred = 'pump';
  if (!budgetFits(pumpTime, spongeTime)) preferred = 'sponge';
  return { batches, spongeTime, pumpTime, preferred };
}

function temporaryFill(volumes, blocked, recovery) {
  same(volumes, blocked);
  const fill = volumes.map((volume, index) => {
    demand(blocked[index] <= volume, 'Blocked cells must fit inside their section.');
    return volume - blocked[index];
  });
  const recovered = fill.map((cells) => wholeFloor(cells * recovery));
  return { fill, recovered, consumed: sum(fill) - sum(recovered) };
}

function dividerGates(wallLength, depth, widths, height, rib) {
  demand(height <= depth, 'The gate openings cannot be taller than the wall.');
  const span = sum(widths) + (widths.length - 1) * rib;
  demand(span <= wallLength, 'The gate openings and ribs do not fit across the wall.');
  const removed = sum(widths) * height;
  return { span, removed, remaining: wallLength * depth - removed };
}

function leakTest(area, before, after, removed, duration) {
  // Positive net inflow remains after adding back water deliberately removed.
  const netVolume = (after - before) * area + removed;
  return { netVolume, netRate: netVolume / duration };
}

function sealSurvey(leaks, sealedFractions, ratedPump) {
  same(leaks, sealedFractions);
  demand(
    sealedFractions.every((fraction) => fraction <= 1),
    'Sealed fractions must be between zero and one.',
  );
  const residual = sum(leaks.map((leak, index) => leak * (1 - sealedFractions[index])));
  return { residual, headroom: ratedPump - residual, drains: !budgetFits(ratedPump, residual) };
}

function dryFirst(volumes, inflows, rate, setup, window) {
  same(volumes, inflows);
  const jobs = [];
  for (const [index, volume] of volumes.entries()) {
    if (volume === 0 || rate <= inflows[index]) continue;
    jobs.push({ section: index + 1, duration: pumpDuration(volume, inflows[index], rate - inflows[index], setup) });
  }
  jobs.sort((a, b) => a.duration - b.duration || a.section - b.section);
  const completed = [];
  let used = 0;
  for (const job of jobs) {
    if (!budgetFits(used + job.duration, window)) break;
    completed.push(job.section);
    used += job.duration;
  }
  return { completed, used };
}

function refugeWork(depth, downRate, upRate, transition, timeBudget, workRate) {
  const travelTime = depth / downRate + depth / upRate + transition;
  const workTime = Math.max(0, timeBudget - travelTime);
  return {
    travelTime,
    feasible: budgetFits(travelTime, timeBudget),
    workTime,
    completeCells: wholeFloor(workTime * workRate),
  };
}

// Unit segments use Minecraft's x/z axes: +x east and +z south. Consecutive
// legs may retrace a road, so a U-turn is still part of the travel sequence.
function iceLegs(points) {
  demand(points.length >= 2, 'Supply at least two road waypoints.');
  demand(
    points.every((point) => point.every(Number.isInteger)),
    'Road waypoints must be whole block coordinates.',
  );
  return points.slice(1).map(([x, z], index) => {
    const dx = x - points[index][0];
    const dz = z - points[index][1];
    demand((dx === 0) !== (dz === 0), 'Consecutive waypoints must define a nonzero axis-aligned leg.');
    return { dx: Math.sign(dx), dz: Math.sign(dz), length: Math.abs(dx) + Math.abs(dz) };
  });
}

function iceTurns(legs) {
  return legs.slice(1).map((next, index) => {
    const prior = legs[index];
    const cross = prior.dx * next.dz - prior.dz * next.dx;
    if (cross !== 0) return cross > 0 ? 'right' : 'left';
    return sameDirection(prior, next) ? 'straight' : 'reverse';
  });
}

function iceTurnMix(points) {
  const mix = { left: 0, right: 0, reverse: 0, straight: 0 };
  for (const turn of iceTurns(iceLegs(points))) mix[turn]++;
  return mix;
}

function iceTurnSpacing(points, minimum) {
  const legs = iceLegs(points);
  const turns = iceTurns(legs);
  const tight = [];
  let distance = 0;
  let previous = null;
  for (const [index, turn] of turns.entries()) {
    distance += legs[index].length;
    if (turn === 'straight') continue;
    if (previous && distance - previous.distance < minimum) {
      tight.push({ from: previous.index, to: index + 2, distance: distance - previous.distance });
    }
    previous = { index: index + 2, distance };
  }
  return tight;
}

function iceCurveClearance(points, quarterRun, reverseRun) {
  const legs = iceLegs(points);
  const runs = iceTurns(legs).map((turn) => (turn === 'straight' ? 0 : turn === 'reverse' ? reverseRun : quarterRun));
  const straightRuns = legs.map(({ length }, index) => length - (runs[index - 1] ?? 0) - (runs[index] ?? 0));
  // Collinear supplied waypoints do not split a physical straight run.
  const merged = [];
  for (const [index, length] of straightRuns.entries()) {
    if (index > 0 && sameDirection(legs[index - 1], legs[index])) merged[merged.length - 1] += length;
    else merged.push(length);
  }
  return { straightRuns: merged, fits: merged.every((length) => length >= 0) };
}

function sameDirection(prior, next) {
  return prior.dx === next.dx && prior.dz === next.dz;
}

function gapCrossings(length, gaps, overlap, width) {
  demand(
    gaps.every(
      ([start, end]) => Number.isInteger(start) && Number.isInteger(end) && start >= 0 && start < end && end <= length,
    ),
    'Gaps must be nonempty whole half-open intervals inside the road.',
  );
  const spans = mergeSpans(gaps.map(([start, end]) => [Math.max(0, start - overlap), Math.min(length, end + overlap)]));
  return { spans, deckCells: sum(spans.map(([start, end]) => end - start)) * width };
}

function mergeSpans(intervals) {
  const spans = [];
  for (const [start, end] of intervals.sort((a, b) => a[0] - b[0])) {
    const last = spans.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else spans.push([start, end]);
  }
  return spans;
}

function stationCoverage(length, offsets, radius) {
  demand(
    offsets.every((offset) => offset <= length),
    'Station offsets must be inside the road.',
  );
  const covered = mergeSpans(
    offsets.map((offset) => [Math.max(0, offset - radius), Math.min(length, offset + radius)]),
  );
  return { covered, uncoveredLength: length - sum(covered.map(([start, end]) => end - start)) };
}

function passingBays(length, gap, bayLength, widening) {
  // The terminals already provide clearance. The bay midpoint is the refuge.
  const count = Math.ceil(length / gap) - 1;
  const spacing = length / (count + 1);
  if ((count === 1 && bayLength > length) || (count > 1 && bayLength > spacing)) return null;
  return { count, spacing, wideningCells: count * bayLength * widening };
}

function directionalTrip(lengths, forward, reverse, originDwell, destinationDwell) {
  same(lengths, forward, reverse);
  const outbound = sum(lengths.map((length, index) => length / forward[index]));
  const inbound = sum(lengths.map((length, index) => length / reverse[index]));
  return { outbound, inbound, cycle: outbound + inbound + originDwell + destinationDwell };
}

function launchHeadway(length, speeds, separation) {
  let next = 0;
  const gap = Math.min(length, separation);
  return speeds.map((speed, index) => {
    if (index === 0) return next;
    const prior = speeds[index - 1];
    next += Math.max(gap / prior, length / prior - (length - gap) / speed);
    return next;
  });
}

function alternateWindow(length, forwardSpeed, reverseSpeed, clearance, window) {
  const forward = length / forwardSpeed;
  const reverse = length / reverseSpeed;
  const pair = forward + reverse + 2 * clearance;
  const outbound = budgetFits(forward, window) ? 1 + Math.max(0, wholeFloor((window - forward) / pair)) : 0;
  const firstReturn = forward + clearance + reverse;
  const inbound = budgetFits(firstReturn, window) ? 1 + Math.max(0, wholeFloor((window - firstReturn) / pair)) : 0;
  return { outbound, inbound };
}

function upgradePriority(lengths, oldSpeeds, iceSpeed, labor) {
  same(lengths, oldSpeeds, labor);
  return lengths
    .map((length, index) => {
      const timeSaved = length / oldSpeeds[index] - length / iceSpeed;
      return { segment: index + 1, timeSaved, savingsPerBuildTime: timeSaved / labor[index] };
    })
    .filter(({ timeSaved }) => timeSaved > 0)
    .sort((a, b) => b.savingsPerBuildTime - a.savingsPerBuildTime || a.segment - b.segment);
}

function materialBudget(target, stock, loss, reserve) {
  const gap = Math.max(0, target + reserve - stock);
  if (gap === 0) return 0;
  if (loss === 1) return null;
  return wholeCeil(gap / (1 - loss));
}

function patchWindow(lengths, width, rate, setup, window) {
  let patches = 0;
  let cells = 0;
  let used = 0;
  for (const length of lengths) {
    const patchCells = length * width;
    const next = used + setup + patchCells / rate;
    if (!budgetFits(next, window)) break;
    patches++;
    cells += patchCells;
    used = next;
  }
  return { patches, cells, used };
}

function transferWindow(spurLength, spurSpeed, transferDelay, departures, mainLength, mainSpeed) {
  const ready = spurLength / spurSpeed + transferDelay;
  let index = -1;
  for (const [candidate, departure] of departures.entries()) {
    if (budgetFits(ready, departure) && (index === -1 || departure < departures[index])) index = candidate;
  }
  if (index === -1) return null;
  const departure = departures[index];
  return { departureIndex: index + 1, ready, departure, arrival: departure + mainLength / mainSpeed };
}

function dwellBudget(lengths, speeds, dwells, deadline) {
  same(lengths, speeds, dwells);
  const advance = compensatedAdder();
  const times = lengths.map((length, index) => {
    const arrival = advance(length / speeds[index]);
    const departure = advance(dwells[index]);
    return { arrival, departure };
  });
  const used = times.at(-1).departure;
  const fits = budgetFits(used, deadline);
  const slack = fits && budgetFits(deadline, used) ? 0 : deadline - used;
  return { times, slack, fits };
}

function neighboringSpurs(length, offsets, position) {
  demand(position <= length && offsets.every((offset) => offset <= length), 'Offsets must be inside the road.');
  let behind = null;
  let ahead = null;
  const route = offsets.map((offset, index) => ({ spur: index + 1, distance: Math.abs(offset - position) }));
  for (const [index, offset] of offsets.entries()) {
    const candidate = route[index];
    if (offset <= position && (behind === null || candidate.distance < behind.distance)) behind = candidate;
    if (offset >= position && (ahead === null || candidate.distance < ahead.distance)) ahead = candidate;
  }
  return { behind, ahead };
}

export const WATERWAY_GROUPS = [
  {
    name: 'sponge-plan',
    note: 'Offline underwater-build estimates from supplied dimensions, volumes, schedules, and removal rates.',
    commands: [
      command(
        'section-grid <length> <width> <section-length> <section-width>',
        ['s', 's', 's', 's'],
        'Count rectangular sections, including clipped sections along the far edges.',
        sectionGrid,
      ),
      command(
        'section-at <length> <width> <section-length> <section-width> <column> <row>',
        ['s', 's', 's', 's', 's', 's'],
        'Locate and size a one-based section in a rectangular grid.',
        sectionAt,
      ),
      command(
        'divider-cells <length> <width> <depth> <section-length> <section-width>',
        ['s', 's', 's', 's', 's'],
        'Budget full-depth grid dividers, counting intersections once.',
        dividerCells,
      ),
      command(
        'cofferdam-wall <length> <width> <depth> <freeboard> <thickness>',
        ['s', 's', 'c', 'c', 's'],
        'Budget exterior rectangular wall cells below and above the waterline.',
        cofferdamWall,
      ),
      command(
        'divider-gates <wall-length> <depth> <widths> <height> <rib>',
        ['s', 's', 'S', 's', 'c'],
        'Fit gate openings separated by solid ribs into a single divider wall.',
        dividerGates,
      ),
      command(
        'barrier-kit <installs> <removals> <initial-stock>',
        ['C', 'C', 'c'],
        'Find the peak barrier stock needed when each phase reclaims material before installing more.',
        barrierKit,
      ),
      command(
        'barrier-labor <cells> <install-rate> <remove-rate> <setups> <setup-time>',
        ['c', 'p', 'p', 'c', 'q'],
        'Budget installation, removal, and repeated barrier crew setup time.',
        (cells, installRate, removeRate, setups, time) => {
          const install = cells / installRate;
          const removal = cells / removeRate;
          const setupTime = setups * time;
          return { install, removal, setupTime, total: install + removal + setupTime };
        },
      ),
      command(
        'layer-profile <flooded-footprints>',
        ['C'],
        'Report flooded cells and the depths of occupied layers from the waterline down.',
        (layers) => ({
          total: sum(layers),
          wettedLayers: layers.filter((cells) => cells > 0).length,
          deepest: layers.findLastIndex((cells) => cells > 0) + 1,
        }),
      ),
      command(
        'temporary-fill <volumes> <blocked-cells> <recovery-fraction>',
        ['C', 'C', 'r'],
        'Estimate temporary fill and recovered cells independently for each section.',
        temporaryFill,
      ),
      command(
        'sponge-loads <volumes> <cells-per-sponge>',
        ['C', 's'],
        'Count whole sponge placements with separate partial placements for each section.',
        spongeLoads,
      ),
      command(
        'drying-backlog <wet-arrivals> <capacity>',
        ['C', 's'],
        'Track dried sponges and the wet backlog after each processing batch.',
        dryingBacklog,
      ),
      command(
        'reuse-shifts <placements> <clean-stock> <dry-per-shift> <shifts>',
        ['c', 'c', 'c', 'c'],
        'Project work and remaining stock under end-of-shift sponge reuse.',
        reuseShifts,
      ),
      command(
        'staging-stock <batch-size> <batch-interval> <return-time> <contingency>',
        ['s', 'p', 'q', 'c'],
        'Find ready sponge stock for concurrent reuse batches and a safety reserve.',
        (size, interval, turnaround, contingency) => size * Math.max(1, wholeCeil(turnaround / interval)) + contingency,
      ),
      command(
        'pump-crew <volume> <inflow> <rate-per-pump> <setup-time> <deadline>',
        ['q', 'q', 'p', 'q', 'q'],
        'Find the fewest equal pumps that can drain by the deadline, with inflow during setup.',
        pumpCrew,
      ),
      command(
        'pump-outage <volume> <pump-rate> <inflow> <outage-start> <downtime>',
        ['q', 'p', 'q', 'q', 'q'],
        'Estimate completion after a single pump interruption while inflow continues.',
        pumpOutage,
      ),
      command(
        'pump-handoff <volume> <inflow> <first-rate> <first-time> <next-rate>',
        ['q', 'q', 'q', 'q', 'q'],
        'Find the completion clock when the active pump rate changes once.',
        pumpHandoff,
      ),
      command(
        'pump-schedule <volumes> <inflows> <pump-rate> <setup-time>',
        ['L', 'L', 'p', 'q'],
        'Estimate section completion clocks for one traveling pump crew.',
        pumpSchedule,
      ),
      command(
        'wet-checkpoints <initial> <capacities> <inflows> <withdrawals>',
        ['q', 'L', 'L', 'L'],
        'Track water and spill after pumping, then reflooding up to each checkpoint capacity.',
        wetCheckpoints,
      ),
      command(
        'breach-level <left-area> <left-water-depth> <right-area> <right-water-depth>',
        ['p', 'q', 'p', 'q'],
        'Estimate equalized depth and transferred volume when the divider between equal-elevation basins opens.',
        breachLevel,
      ),
      command(
        'stage-depth <depth> <step> <stage>',
        ['s', 's', 's'],
        'Locate a vertical work stage from the waterline down and clip it to the floor.',
        stageDepth,
      ),
      command(
        'draining-method <volume> <cells-per-sponge> <sponges-per-batch> <batch-time> <pump-setup> <pump-net-rate>',
        ['c', 's', 's', 'q', 'q', 'p'],
        'Compare sequential sponge batches with a single pump setup and net rate.',
        dryingMethod,
      ),
      command(
        'leak-test <pool-area> <before-depth> <after-depth> <withdrawn> <duration>',
        ['p', 'q', 'q', 'q', 'p'],
        'Infer net inflow from two depths and the amount withdrawn between measurements.',
        leakTest,
      ),
      command(
        'seal-survey <leaks> <sealed-fractions> <pump-rate>',
        ['L', 'L', 'q'],
        'Estimate residual inflow and pump headroom after partial sealing.',
        sealSurvey,
      ),
      command(
        'dry-first <volumes> <inflows> <pump-rate> <setup-time> <window>',
        ['L', 'L', 'p', 'q', 'q'],
        'Finish the most flooded sections in a window by scheduling drainable sections shortest first.',
        dryFirst,
      ),
      command(
        'refuge-work <depth> <descent-rate> <ascent-rate> <transition-time> <time-budget> <work-rate>',
        ['q', 'p', 'p', 'q', 'q', 'q'],
        'Set a completed-cell quota after reserving travel time to and from a refuge.',
        refugeWork,
      ),
    ],
  },
  {
    name: 'ice-road',
    note: 'Offline packed-ice route and build estimates from supplied geometry, speeds, costs, and service delays.',
    commands: [
      command(
        'turn-mix <waypoints>',
        ['points2'],
        'Count left, right, reverse and straight transitions on an orthogonal route.',
        iceTurnMix,
      ),
      command(
        'turn-spacing <waypoints> <minimum-straight>',
        ['points2', 'c'],
        'Find consecutive bends with less than the required straight run between them.',
        iceTurnSpacing,
      ),
      command(
        'curve-clearance <waypoints> <quarter-run> <reverse-run>',
        ['points2', 'c', 'c'],
        'Check that the straight approach reservations of neighboring bends fit.',
        iceCurveClearance,
      ),
      command(
        'corner-stock <waypoints> <quarter-ice> <reverse-ice> <quarter-guards> <reverse-guards>',
        ['points2', 'c', 'c', 'c', 'c'],
        'Budget ice and guards for corner retrofits by bend class.',
        (points, quarterIce, reverseIce, quarterGuards, reverseGuards) => {
          const { left, right, reverse } = iceTurnMix(points);
          return {
            ice: (left + right) * quarterIce + reverse * reverseIce,
            guards: (left + right) * quarterGuards + reverse * reverseGuards,
          };
        },
      ),
      command(
        'striped-deck <length> <lanes> <ice-width> <lane-gap> <shoulder>',
        ['s', 's', 's', 'c', 'c'],
        'Size a straight deck with ice lanes, gaps between lanes, and shoulders on both sides.',
        (length, lanes, iceWidth, gap, shoulder) => {
          const iceWidthTotal = lanes * iceWidth;
          const otherWidth = (lanes - 1) * gap + 2 * shoulder;
          return {
            deckWidth: iceWidthTotal + otherWidth,
            iceCells: iceWidthTotal * length,
            otherCells: otherWidth * length,
          };
        },
      ),
      command(
        'switchyard-deck <length> <main-width> <parking-width> <divider-width> <opening-lengths>',
        ['s', 's', 's', 's', 'C'],
        'Budget a parallel parking lane and transfer openings through a divider.',
        (length, main, parking, divider, openings) => {
          const open = sum(openings);
          demand(open <= length, 'The non-overlapping openings must fit along the switchyard.');
          return {
            laneCells: length * (main + parking),
            transferCells: open * divider,
            dividerCells: (length - open) * divider,
          };
        },
      ),
      command(
        'raised-road <pier-depths> <posts-per-pier> <cap-cells> <footing-cells>',
        ['C', 's', 'c', 'c'],
        'Budget variable-height support posts with a cap and footing at each supplied pier.',
        (depths, posts, cap, footing) => ({
          postCells: sum(depths) * posts,
          capCells: depths.length * cap,
          footingCells: depths.length * footing,
        }),
      ),
      command(
        'gap-crossings <length> <gaps> <bank-overlap> <deck-width>',
        ['s', 'intervals', 'c', 's'],
        'Count deck over merged gap spans with overlaps onto both banks.',
        gapCrossings,
      ),
      command(
        'roadside-chests <segment-lengths> <maximum-walk> <kit-per-chest>',
        ['S', 's', 'c'],
        'Budget maintenance chests at junctions and at intermediate access points.',
        (segments, walk, kit) => {
          const additional = segments.map((length) => Math.ceil(length / (2 * walk)) - 1);
          const chests = segments.length + 1 + sum(additional);
          return { additional, chests, kit: chests * kit };
        },
      ),
      command(
        'material-budget <ice-cells> <on-hand> <loss-fraction> <reserve>',
        ['c', 'c', 'r', 'c'],
        'Find how much new ice to acquire after planned loss and a reserve.',
        materialBudget,
      ),
      command(
        'station-coverage <length> <offsets> <radius>',
        ['s', 'C', 'c'],
        'Merge station reach on a route and measure the distance outside all stations.',
        stationCoverage,
      ),
      command(
        'station-platform <length> <stall-width> <clear-ends> <sides>',
        ['s', 's', 'c', 's'],
        'Fit whole parking stalls between clear ends on one or both sides of a platform.',
        (length, width, clear, sides) => {
          demand(sides <= 2, 'A station can have 1 or 2 parking sides.');
          const usable = Math.max(0, length - 2 * clear);
          const perSide = Math.floor(usable / width);
          return { perSide, stalls: perSide * sides, sparePerSide: usable - perSide * width };
        },
      ),
      command(
        'passing-bays <length> <maximum-gap> <bay-length> <extra-width>',
        ['s', 's', 's', 'c'],
        'Budget equally spaced passing bays between terminal refuges, refusing overlapping footprints.',
        passingBays,
      ),
      command(
        'patch-window <lengths> <width> <repair-rate> <setup-time> <window>',
        ['S', 's', 'p', 'q', 'q'],
        'Find the prefix of scheduled repairs that fits within a closure window.',
        patchWindow,
      ),
      command(
        'transfer-window <spur-length> <spur-speed> <transfer-delay> <departures> <main-length> <main-speed>',
        ['q', 'p', 'q', 'L', 'q', 'p'],
        'Catch the earliest feasible main-road departure after travel from a portal spur.',
        transferWindow,
      ),
      command(
        'route-clock <waypoints> <speed> <quarter-delay> <reverse-delay>',
        ['points2', 'p', 'q', 'q'],
        'Estimate orthogonal travel time with explicit bend and reversal delays.',
        (points, speed, quarter, reverse) => {
          const legs = iceLegs(points);
          const distance = sum(legs.map((leg) => leg.length));
          const turnTime = sum(
            iceTurns(legs).map((turn) => (turn === 'straight' ? 0 : turn === 'reverse' ? reverse : quarter)),
          );
          return { distance, turnTime, total: distance / speed + turnTime };
        },
      ),
      command(
        'dwell-budget <lengths> <speeds> <dwells> <deadline>',
        ['L', 'P', 'L', 'q'],
        'Estimate platform arrival and departure clocks and a deadline margin with dwell included.',
        dwellBudget,
      ),
      command(
        'directional-trip <lengths> <forward-speeds> <reverse-speeds> <origin-dwell> <destination-dwell>',
        ['L', 'P', 'P', 'q', 'q'],
        'Estimate a corridor round trip for different speeds on each segment and direction.',
        directionalTrip,
      ),
      command(
        'launch-headway <length> <speeds> <separation>',
        ['p', 'P', 'q'],
        'Find earliest launch times keeping the requested distance between successive boats until exit.',
        launchHeadway,
      ),
      command(
        'terminal-capacity <cycle-time> <loading-spots> <loading-time> <fleet> <depart-gap>',
        ['p', 's', 'p', 'c', 'p'],
        'Estimate departures per time unit subject to fleet, loader, and lane bottlenecks.',
        (cycle, spots, loading, fleet, gap) => {
          const fleetRate = fleet / cycle;
          const loadingRate = spots / loading;
          const laneRate = 1 / gap;
          return { fleetRate, loadingRate, laneRate, capacity: Math.min(fleetRate, loadingRate, laneRate) };
        },
      ),
      command(
        'upgrade-priority <lengths> <old-speeds> <ice-speed> <build-times>',
        ['L', 'P', 'p', 'P'],
        'Rank useful resurfacing projects by travel time saved per build time.',
        upgradePriority,
      ),
      command(
        'spur-budget <lengths> <deck-width> <transfer-cells> <portal-cells>',
        ['C', 's', 'c', 'c'],
        'Budget independent portal spurs, each with a transfer pad and a portal kit.',
        (lengths, width, pad, kit) => ({
          deckCells: sum(lengths) * width,
          transferCells: lengths.length * pad,
          portalCells: lengths.length * kit,
        }),
      ),
      command(
        'neighboring-spurs <length> <offsets> <position>',
        ['s', 'C', 'c'],
        'Find the nearest portal spur in each direction along the main road.',
        neighboringSpurs,
      ),
      command(
        'alternate-window <length> <forward-speed> <reverse-speed> <clearance-time> <window>',
        ['p', 'p', 'p', 'q', 'q'],
        'Count finished trips in each direction in an alternating single-lane schedule.',
        alternateWindow,
      ),
      command(
        'breakdown-detour <closure-length> <bypass-length> <ice-speed> <bypass-speed> <switch-time>',
        ['q', 'q', 'p', 'p', 'q'],
        'Estimate the trip delay from a bypass and two transfers at a closed road segment.',
        (closure, bypass, iceSpeed, bypassSpeed, time) => {
          const original = closure / iceSpeed;
          const detour = bypass / bypassSpeed + 2 * time;
          return { original, detour, delay: detour - original };
        },
      ),
    ],
  },
];
