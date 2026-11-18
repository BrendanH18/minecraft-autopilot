import { compensatedAdder, demand, same, sequence, sum } from './offline-kit.js';
import { budgetFits, decimalParts, unitsAtExponent, wholeCeil, wholeFloor } from './resource-rounding.js';

const command = (signature, types, description, run) => ({ signature, types, description, run });
const batches = (items, slots) => Math.ceil(items / slots);
const shortage = (wanted, supplied) => Math.max(0, wanted - supplied);

function sumRates(rates) {
  const add = compensatedAdder();
  let total = 0;
  for (const rate of rates) total = add(rate);
  return total;
}

function availableSlot(ready, clock, fits = budgetFits) {
  let earliest = 0;
  for (const [i, time] of ready.entries()) {
    if (fits(time, clock)) return i;
    if (!fits(ready[earliest], time)) earliest = i;
  }
  return earliest;
}

function zoneDispatch(machines, zones, items, periods, releases) {
  same(zones, items, releases);
  same(machines, periods);
  // Keep every release and completion on the same exact decimal clock until reporting seconds.
  const durations = periods.map(decimalParts);
  const arrivals = releases.map(decimalParts);
  const exponent = Math.min(...[...durations, ...arrivals].map((time) => time.exponent));
  const ticksPerItem = durations.map((duration) => unitsAtExponent(duration, exponent));
  const seconds = (ticks) => Number(`${ticks}e${exponent}`);
  const readyByZone = machines.map(() => []);
  return zones.map((zone, index) => {
    demand(zone <= machines.length && machines[zone - 1] > 0, 'Every job needs a zone with a furnace.');
    demand(index === 0 || releases[index - 1] <= releases[index], 'Release times must be nondecreasing.');
    const ready = readyByZone[zone - 1];
    // Use the lowest numbered available machine at the release clock.
    const release = unitsAtExponent(arrivals[index], exponent);
    let slot = availableSlot(ready, release, (a, b) => a <= b);
    let start = release;
    if (ready[slot] > release) {
      if (ready.length < machines[zone - 1]) slot = ready.length;
      else start = ready[slot];
    }
    const finish = start + BigInt(items[index]) * ticksPerItem[zone - 1];
    ready[slot] = finish;
    return { zone, furnace: slot + 1, start: seconds(start), finish: seconds(finish) };
  });
}

function retrofitMinimum(installed, ordinary, specialist, regularTime, specialistTime, window) {
  demand(specialistTime <= regularTime, 'A specialist must be at least as fast as a regular furnace.');
  const regularEach = Math.min(ordinary + specialist, wholeFloor(window / regularTime));
  const specialistEach = Math.min(specialist, wholeFloor(window / specialistTime));
  const reserved = ordinary === 0 ? 0 : Math.ceil(ordinary / regularEach);
  if (reserved > installed) return null;
  const flexible = installed - reserved;
  const capacity = installed * regularEach - ordinary;
  if (capacity >= specialist) return 0;
  // Converted machines come exclusively from the unreserved regular furnaces.
  const gain = specialistEach - regularEach;
  const converted = Math.ceil((specialist - capacity) / gain);
  return gain > 0 && converted <= flexible ? converted : null;
}

function peakStartLoad(starts, costs, window) {
  same(starts, costs);
  demand(
    starts.every((start, i) => i === 0 || start >= starts[i - 1]),
    'Start times must be nondecreasing.',
  );
  let peak = { from: starts[0], until: starts[0] + window, units: 0 };
  let end = 0;
  let total = 0;
  for (const [i, start] of starts.entries()) {
    while (end < starts.length && starts[end] < start + window) total += costs[end++];
    if (total > peak.units) peak = { from: start, until: start + window, units: total };
    total -= costs[i];
  }
  return peak;
}

function refills(initial, burns, reserve, lot, rounds) {
  same(initial, burns);
  demand(
    initial.every((stock) => stock >= reserve),
    'Starting stocks must cover the protected reserve.',
  );
  const stocks = [...initial];
  return sequence(rounds, () => {
    let refilled = null;
    let longestDeficit = 0;
    for (const [i, stock] of stocks.entries()) {
      const deficit = reserve + burns[i] - stock;
      if (deficit > longestDeficit) {
        longestDeficit = deficit;
        refilled = i;
      }
    }
    if (refilled !== null) stocks[refilled] += lot;
    let idled = 0;
    for (const [i, stock] of stocks.entries()) {
      if (stock - burns[i] >= reserve) stocks[i] -= burns[i];
      else idled++;
    }
    return { refilled: refilled === null ? null : refilled + 1, idled, stock: sum(stocks) };
  });
}

function circuitCollection(periods, order, travel, slots, stack, handling) {
  same(order, travel);
  const visited = new Set();
  let time = 0;
  return order.map((furnace, i) => {
    demand(furnace <= periods.length && !visited.has(furnace), 'Visit distinct furnaces on the circuit.');
    visited.add(furnace);
    time += travel[i];
    const produced = wholeFloor(time / periods[furnace - 1]);
    const items = Math.min(produced, slots * stack);
    const arrival = time;
    time += batches(items, stack) * handling;
    return { furnace, arrival, items, blocked: produced - items, departure: time };
  });
}

function gcd(left, right) {
  while (right !== 0) [left, right] = [right, left % right];
  return left;
}

const furnaceCommands = [
  command(
    'bay-layout <zone-sizes> <bay-capacity> <separator>',
    ['C', 's', 'c'],
    'Lay out each zone in exclusive inline bays with separator blocks between bays.',
    (sizes, capacity, separator) => {
      let length = 0;
      const zones = sizes.map((size) => {
        const count = batches(size, capacity);
        const firstBlock = count === 0 ? null : length + (length === 0 ? 0 : separator) + 1;
        if (firstBlock !== null) length = firstBlock - 1 + count * capacity + (count - 1) * separator;
        return { bays: count, firstBlock };
      });
      return { length, zones };
    },
  ),
  command(
    'branch-feeders <row-widths> <reach>',
    ['C', 'c'],
    'Count centered feeders covering disjoint row segments and the longest branch at each row.',
    (widths, reach) =>
      widths.map((width) => ({
        feeders: batches(width, 2 * reach + 1),
        branch: Math.min(reach, Math.floor(width / 2)),
      })),
  ),
  command(
    'zone-expansion <installed> <additional> <bay-capacity>',
    ['C', 'C', 's'],
    'Find added bays after taking up vacant places in the existing bays of each zone.',
    (installed, additional, capacity) => {
      same(installed, additional);
      return installed.map((size, i) => {
        const oldBays = batches(size, capacity);
        const newBays = batches(size + additional[i], capacity);
        return {
          usedExistingSpace: Math.min(additional[i], oldBays * capacity - size),
          addedBays: newBays - oldBays,
          openPlaces: newBays * capacity - size - additional[i],
        };
      });
    },
  ),
  command(
    'panel-address <row-widths> <furnace>',
    ['C', 's'],
    'Look up the one-based row and column of a furnace on a densely numbered panel.',
    (widths, furnace) => {
      let column = furnace;
      const row = widths.findIndex((width) => {
        if (column <= width) return true;
        column -= width;
        return false;
      });
      demand(row >= 0, 'Furnace number falls outside the panel.');
      return { row: row + 1, column };
    },
  ),
  command(
    'aisle-footprint <row-widths> <aisle> <end-clearance>',
    ['S', 'c', 'c'],
    'Find the floor footprint of parallel single-block rows, with end clearance on both sides.',
    (widths, aisle, ends) => {
      const width = Math.max(...widths) + 2 * ends;
      const depth = widths.length + (widths.length - 1) * aisle;
      const furnaces = sum(widths);
      return { width, depth, furnaces, clearCells: width * depth - furnaces };
    },
  ),
  command(
    'dedicated-overflow <demand> <capacities>',
    ['C', 'C'],
    'Meet ordinary, blast and smoker demand in dedicated zones, then fill specialist shortfalls from regular capacity.',
    (wanted, capacity) => {
      demand(wanted.length === 3 && capacity.length === 3, 'Supply ordinary, blast and smoker counts in that order.');
      const dedicated = wanted.map((count, i) => Math.min(count, capacity[i]));
      const spare = capacity[0] - dedicated[0];
      const blast = Math.min(wanted[1] - dedicated[1], spare);
      const smoker = Math.min(wanted[2] - dedicated[2], spare - blast);
      const overflow = [0, blast, smoker];
      return { dedicated, overflow, unmet: wanted.map((count, i) => count - dedicated[i] - overflow[i]) };
    },
  ),
  command(
    'fallback-overhead <blast-items> <smoker-items> <regular-seconds> <blast-seconds> <smoker-seconds>',
    ['c', 'c', 'p', 'p', 'p'],
    'Price specialist overflow to regular furnaces in additional furnace-seconds.',
    (blast, smoker, regularSeconds, blastSeconds, smokerSeconds) => {
      demand(
        blastSeconds <= regularSeconds && smokerSeconds <= regularSeconds,
        'Specialist times must not exceed regular time.',
      );
      const blastExtra = blast * (regularSeconds - blastSeconds);
      const smokerExtra = smoker * (regularSeconds - smokerSeconds);
      return { blastExtra, smokerExtra, totalExtra: blastExtra + smokerExtra };
    },
  ),
  command(
    'retrofit-minimum <installed> <regular-items> <specialist-items> <regular-seconds> <specialist-seconds> <window>',
    ['c', 'c', 'c', 'p', 'p', 'q'],
    'Find the fewest furnace conversions that meet both quotas within one window.',
    retrofitMinimum,
  ),
  command(
    'zone-dispatch <zone-furnaces> <job-zones> <job-items> <item-seconds-by-zone> <releases>',
    ['C', 'S', 'S', 'P', 'L'],
    'Assign release-ordered indivisible jobs within their compatible zones.',
    zoneDispatch,
  ),
  command(
    'staggered-output <zone-furnaces> <gap> <window> <item-seconds>',
    ['C', 'q', 'q', 'p'],
    'Count completions in zones fired at fixed gaps, starting with the first zone at zero.',
    (sizes, gap, window, period) => {
      const byZone = sizes.map((size, i) => {
        const start = i * gap;
        if (size === 0 || start >= window) return 0;
        const quotient = (window - start) / period;
        const cycles = wholeFloor(quotient);
        // If subtraction drops a whole cycle, compare the original clocks.
        const nextFits = cycles + 1 - quotient < 0.5 && budgetFits(start + (cycles + 1) * period, window);
        return size * (cycles + Number(nextFits));
      });
      return { byZone, total: sum(byZone) };
    },
  ),
  command(
    'peak-start-load <starts> <start-costs> <window>',
    ['C', 'C', 's'],
    'Find the heaviest ignition load in one half-open window, with earliest start-event ties.',
    peakStartLoad,
  ),
  command(
    'activation-waves <zone-sizes> <starts-per-wave> <gap>',
    ['S', 's', 'p'],
    'Pack consecutive intact zones into waves under a limit on simultaneous starts.',
    (sizes, limit, gap) => {
      let wave = 0;
      let occupied = 0;
      return sizes.map((size) => {
        demand(size <= limit, 'A zone exceeds the wave start limit.');
        if (occupied + size > limit) {
          wave++;
          occupied = 0;
        }
        occupied += size;
        return { wave: wave + 1, start: wave * gap };
      });
    },
  ),
  command(
    'outage-output <zone-furnaces> <stops> <restarts> <item-seconds> <window>',
    ['C', 'C', 'C', 'S', 'c'],
    'Count output before and after each planned outage, dropping partial progress at shutdown.',
    (sizes, stops, restarts, periods, window) => {
      same(sizes, stops, restarts, periods);
      return sizes.map((size, i) => {
        demand(stops[i] <= restarts[i], 'A restart must be at or after its stop clock.');
        const baseline = size * Math.floor(window / periods[i]);
        if (stops[i] === restarts[i]) return { actual: baseline, lost: 0 };
        const before = Math.floor(Math.min(window, stops[i]) / periods[i]);
        const after = Math.floor(shortage(window, restarts[i]) / periods[i]);
        const actual = size * (before + after);
        return { actual, lost: baseline - actual };
      });
    },
  ),
  command(
    'loaders-needed <zone-furnaces> <load-seconds> <refill-periods> <busy-fraction>',
    ['C', 'P', 'P', 'r'],
    'Estimate crew for independent refill cadences, with a limit on each loader’s productive fraction.',
    (sizes, timings, periods, fraction) => {
      same(sizes, timings, periods);
      demand(fraction > 0, 'The productive fraction must be positive.');
      const byZone = sizes.map((size, i) => (size * timings[i]) / periods[i]);
      const busy = sumRates(byZone);
      return { byZone, busy, loaders: wholeCeil(busy / fraction) };
    },
  ),
  command(
    'sorter-reservation <zone-rates> <lane-rate>',
    ['L', 'p'],
    'Compare separate sorter lanes per zone with shared lanes for the same continuous flow.',
    (rates, laneRate) => {
      const perZone = rates.map((rate) => wholeCeil(rate / laneRate));
      const shared = wholeCeil(sumRates(rates) / laneRate);
      return { perZone, shared, extra: sum(perZone) - shared };
    },
  ),
  command(
    'feed-pulse-overflow <offsets> <periods> <pulse-items> <ticks> <trunk-limit>',
    ['C', 'S', 'C', 'c', 'c'],
    'Trace rejected items from overlapping discrete feed pulses when there is no trunk buffer.',
    (offsets, periods, pulses, ticks, limit) => {
      same(offsets, periods, pulses);
      return sequence(ticks, (tick) => {
        let input = 0;
        for (const [i, offset] of offsets.entries()) {
          if (tick >= offset && (tick - offset) % periods[i] === 0) input += pulses[i];
        }
        return { input, rejected: shortage(input, limit) };
      });
    },
  ),
  command(
    'pickup-pass <output-by-zone> <visit-order> <carry-limit>',
    ['C', 'S', 'c'],
    'Allocate carry capacity on one pickup pass through distinct selected zones.',
    (outputs, order, carry) => {
      let room = carry;
      const seen = new Set();
      const stops = order.map((zone) => {
        demand(zone <= outputs.length && !seen.has(zone), 'Visit distinct zones inside the bank.');
        seen.add(zone);
        const taken = Math.min(outputs[zone - 1], room);
        room -= taken;
        return { zone, taken, left: outputs[zone - 1] - taken };
      });
      return { stops, uncollected: sum(outputs) - (carry - room) };
    },
  ),
  command(
    'partial-progress <queued> <elapsed> <item-seconds> <seconds>',
    ['C', 'C', 'S', 'c'],
    'Project each furnace queue using elapsed work on the leading item.',
    (queued, elapsed, periods, window) => {
      same(queued, elapsed, periods);
      return queued.map((count, i) => {
        demand(
          elapsed[i] < periods[i] && (count > 0 || elapsed[i] === 0),
          'Partial progress must belong to an unfinished item.',
        );
        const complete = Math.min(count, Math.floor((window + elapsed[i]) / periods[i]));
        return {
          complete,
          pending: count - complete,
          progress: complete < count ? (window + elapsed[i]) % periods[i] : 0,
        };
      });
    },
  ),
  command(
    'drain-phases <furnaces> <item-period> <start-step> <trunk-per-tick>',
    ['c', 's', 'c', 'c'],
    'Measure steady synchronized drain bursts from regularly offset furnace start clocks.',
    (furnaces, period, step, capacity) => {
      const phaseCycle = period / gcd(period, step);
      const occupiedPhases = Math.min(furnaces, phaseCycle);
      const peak = batches(furnaces, phaseCycle);
      const rejectedPerPeriod = shortage(furnaces, capacity * occupiedPhases);
      return { occupiedPhases, peak, rejectedPerPeriod };
    },
  ),
  command(
    'dedicated-rack-fit <incoming> <rack-slots> <reserved-slots> <stack-sizes>',
    ['C', 'C', 'C', 'S'],
    'Budget independent output racks without consuming reserved slots.',
    (incoming, slots, held, sizes) => {
      same(incoming, slots, held, sizes);
      return incoming.map((items, i) => {
        demand(held[i] <= slots[i], 'Reserved slots cannot exceed the rack size.');
        const capacity = (slots[i] - held[i]) * sizes[i];
        return {
          stored: Math.min(items, capacity),
          overflow: shortage(items, capacity),
          freeSlots: Math.max(0, slots[i] - held[i] - batches(items, sizes[i])),
        };
      });
    },
  ),
  command(
    'staggered-refills <stocks> <burns-per-round> <reserve> <delivery-lot> <rounds>',
    ['C', 'C', 'c', 's', 'c'],
    'Route one refill each round to the largest impending fuel deficit before deciding which zones can run.',
    refills,
  ),
  command(
    'outfeed-recovery <backlog> <drain> <steady> <burst> <burst-ticks>',
    ['c', 's', 'c', 'c', 'c'],
    'Budget recovery of a shared output queue while steady arrivals continue after a burst.',
    (backlog, drain, steady, burst, ticks) => {
      const afterBurst = Math.max(0, backlog + (burst - drain) * ticks);
      return {
        peak: Math.max(backlog, afterBurst),
        afterBurst,
        recoveryTicks: afterBurst === 0 ? 0 : steady >= drain ? null : batches(afterBurst, drain - steady),
      };
    },
  ),
  command(
    'purge-sequence <products> <run-items> <residue-depth>',
    ['S', 'C', 'c'],
    'Track quarantined items until shared-line carryover from a previous product is cleared.',
    (products, loads, depth) => {
      same(products, loads);
      let previous;
      let remaining = 0;
      return products.map((product, i) => {
        const items = loads[i];
        if (items > 0) {
          if (previous !== undefined && previous !== product) remaining = depth;
          previous = product;
        }
        const quarantined = Math.min(items, remaining);
        remaining -= quarantined;
        return { clean: items - quarantined, quarantined };
      });
    },
  ),
  command(
    'upgrade-rate <zone-furnaces> <item-seconds> <dedicated-rates> <shared-rate> <added-furnaces>',
    ['C', 'P', 'L', 'q', 'c'],
    'Compare adding all new furnaces to each zone under local and shared transfer limits.',
    (sizes, periods, rates, shared, extra) => {
      same(sizes, periods, rates);
      const capacities = sizes.map((size, i) => Math.min(size / periods[i], rates[i]));
      const localTotal = sumRates(capacities);
      const baseline = Math.min(shared, localTotal);
      const options = sizes.map((size, i) => {
        const additional = Math.min((size + extra) / periods[i], rates[i]) - capacities[i];
        return Math.min(shared, localTotal + additional) - baseline;
      });
      const best = Math.max(...options);
      return { baseline, gains: options, bestZone: best === 0 ? null : options.indexOf(best) + 1 };
    },
  ),
  command(
    'circuit-collection <item-seconds> <visit-order> <leg-seconds> <slots-per-furnace> <stack-size> <seconds-per-stack>',
    ['S', 'S', 'C', 's', 's', 'c'],
    'Schedule one collector circuit with travel and loading time carried into later visits.',
    circuitCollection,
  ),
];

function forkedTimeline(quotas, slots, baseStands, finishStands, baseSeconds, finishSeconds) {
  same(quotas, finishSeconds);
  const needed = sum(quotas.map((count) => batches(count, slots)));
  const ready = sequence(Math.min(needed, finishStands), () => 0);
  demand(needed <= 1000, 'Timelines are limited to 1000 finish batches.');
  let released = 0;
  return quotas.flatMap((quota, variant) =>
    sequence(batches(quota, slots), (i) => {
      const bottles = Math.min(slots, quota - i * slots);
      released += bottles;
      const baseReady = batches(batches(released, slots), baseStands) * baseSeconds;
      // Source order has priority, then the lowest numbered free stand.
      const stand = availableSlot(ready, baseReady);
      const start = Math.max(baseReady, ready[stand]);
      const finish = start + finishSeconds[variant];
      ready[stand] = finish;
      return { variant: variant + 1, stand: stand + 1, bottles, baseReady, start, finish };
    }),
  );
}

function effectRenewals(windows, duration) {
  let coveredUntil = 0;
  return windows.map(([start, end], i) => {
    demand(start >= 0 && (i === 0 || start >= windows[i - 1][1]), 'Use ordered nonnegative windows with no overlaps.');
    const from = Math.max(start, coveredUntil);
    if (from >= end || budgetFits(end, coveredUntil)) return { doses: 0, coveredUntil };
    const quotient = (end - from) / duration;
    const rounded = wholeCeil(quotient);
    const previous = rounded - 1;
    const previousFits = previous > 0 && quotient - previous < 0.5 && budgetFits(end, from + previous * duration);
    const doses = rounded - Number(previousFits);
    coveredUntil = from + doses * duration;
    return { doses, coveredUntil };
  });
}

function standDowntime(durations, start, windows) {
  for (const [i, [begin, end]] of windows.entries()) {
    demand(
      begin >= 0 && (i === 0 || begin >= windows[i - 1][1]),
      'Use ordered nonnegative downtime windows with no overlaps.',
    );
    demand(begin < end, 'Downtime windows must have positive length.');
  }
  let time = start;
  let outage = 0;
  return durations.map((duration) => {
    let remaining = duration;
    while (outage < windows.length) {
      const [begin, end] = windows[outage];
      if (time < begin && budgetFits(time + remaining, begin)) break;
      if (time < end) {
        remaining -= Math.max(0, begin - time);
        time = end;
      }
      outage++;
    }
    time += remaining;
    return time;
  });
}

function stagingSlots(windows, bottles, room) {
  same(windows, bottles);
  const changes = new Map();
  const change = (time, units) => changes.set(time, (changes.get(time) ?? 0) + units);
  for (const [i, [from, until]] of windows.entries()) {
    demand(from >= 0, 'Rack staging clocks must be nonnegative.');
    change(from, bottles[i]);
    change(until, -bottles[i]);
  }
  let present = 0;
  let peak = 0;
  let peakAt = null;
  let firstOverflow = null;
  for (const [time, units] of [...changes].sort(([a], [b]) => a - b)) {
    present += units;
    if (present > peak) {
      peak = present;
      peakAt = time;
    }
    if (firstOverflow === null && present > room) firstOverflow = time;
  }
  return { peak, peakAt, firstOverflow };
}

function fillAndBrew(bottles, slots, stands, loadSeconds, brewSeconds) {
  const count = batches(bottles, slots);
  demand(count <= 1000, 'Timelines are limited to 1000 batches.');
  const ready = sequence(Math.min(count, stands), () => 0);
  let loaderFree = 0;
  return sequence(count, (i) => {
    const stand = availableSlot(ready, loaderFree);
    const loadStart = Math.max(loaderFree, ready[stand]);
    const batchBottles = Math.min(slots, bottles - i * slots);
    loaderFree = loadStart + batchBottles * loadSeconds;
    const finish = loaderFree + brewSeconds;
    ready[stand] = finish;
    return { stand: stand + 1, bottles: batchBottles, loadStart, brewStart: loaderFree, finish };
  });
}

function reserveDeadlines(initial, receives, grabs) {
  const stock = [...initial];
  const read = (rows) => {
    demand(
      rows.every(
        ([time, id, quantity]) =>
          [time, id, quantity].every(Number.isSafeInteger) &&
          time >= 0 &&
          id > 0 &&
          id <= stock.length &&
          quantity >= 0,
      ),
      'Use rows of [whole nonnegative time, valid one-based variant, whole nonnegative bottles].',
    );
    return rows;
  };
  const receipts = [...read(receives)].sort(([a], [b]) => a - b);
  const pickups = read(grabs);
  demand(
    pickups.every(([time], i) => i === 0 || time >= pickups[i - 1][0]),
    'Pickup times must be nondecreasing.',
  );
  let receipt = 0;
  const pickup = pickups.map(([time, id, quantity]) => {
    while (receipt < receipts.length && receipts[receipt][0] <= time) {
      const [, variant, count] = receipts[receipt++];
      stock[variant - 1] += count;
    }
    const taken = Math.min(stock[id - 1], quantity);
    stock[id - 1] -= taken;
    return { taken, unmet: quantity - taken };
  });
  return { pickups: pickup, stockAfterLastPickup: stock };
}

const brewingCommands = [
  command(
    'forked-runs <variant-quotas> <bottles-per-stand>',
    ['C', 's'],
    'Pool common-base runs while keeping variant batches separate at the finish bench.',
    (quotas, slots) => {
      const baseRuns = batches(sum(quotas), slots);
      const separateRuns = quotas.map((quota) => batches(quota, slots));
      return {
        baseRuns,
        finishRuns: separateRuns,
        baseRunsSaved: sum(separateRuns) - baseRuns,
        finishEmptySlots: separateRuns.map((runs, i) => runs * slots - quotas[i]),
      };
    },
  ),
  command(
    'modifier-budget <variant-quotas> <bottles-per-stand> <modifier-ids> <units-per-run>',
    ['C', 's', 'S', 'S'],
    'Budget whole variant batches and consolidate modifier costs by ingredient ID.',
    (quotas, slots, modifiers, quantities) => {
      same(quotas, modifiers, quantities);
      const needed = new Map();
      for (const [i, quota] of quotas.entries()) {
        if (quota === 0) continue;
        const modifier = modifiers[i];
        needed.set(modifier, (needed.get(modifier) ?? 0) + batches(quota, slots) * quantities[i]);
      }
      return [...needed].map(([modifier, units]) => ({ modifier, units }));
    },
  ),
  command(
    'prefix-reuse <first-bottles> <second-bottles> <first-stages> <second-stages> <bottles-per-stand>',
    ['c', 'c', 'S', 'S', 's'],
    'Pool the longest shared recipe prefix and separate all steps after the fork.',
    (first, second, a, b, slots) => {
      let sharedStages = 0;
      while (sharedStages < a.length && sharedStages < b.length && a[sharedStages] === b[sharedStages]) sharedStages++;
      const sharedRuns = sharedStages * batches(first + second, slots);
      const firstRuns = (a.length - sharedStages) * batches(first, slots);
      const secondRuns = (b.length - sharedStages) * batches(second, slots);
      return {
        sharedStages,
        sharedRuns,
        firstRuns,
        secondRuns,
        savedRuns: sharedStages * (batches(first, slots) + batches(second, slots)) - sharedRuns,
      };
    },
  ),
  command(
    'resume-stages <wanted> <stock-after-each-stage> <bottles-per-stand>',
    ['c', 'C', 's'],
    'Work backward from a finished quota and reuse partially brewed stock at each stage.',
    (wanted, stocks, slots) => {
      const steps = [];
      let need = wanted;
      for (const stock of stocks.toReversed()) {
        const reused = Math.min(stock, need);
        need -= reused;
        steps.push({ reused, stands: batches(need, slots) });
      }
      return { freshBottles: need, stages: steps.reverse() };
    },
  ),
  command(
    'fuel-per-stand <runs> <charges-per-run> <installed-charges> <refill-charges>',
    ['C', 'S', 'C', 's'],
    'Buy whole fuel refills for assigned stand workloads without sharing installed charges.',
    (runs, costs, stocks, refill) => {
      same(runs, costs, stocks);
      return runs.map((count, i) => {
        const required = count * costs[i];
        const refills = batches(shortage(required, stocks[i]), refill);
        return { refills, leftoverCharges: stocks[i] + refills * refill - required };
      });
    },
  ),
  command(
    'prioritized-variants <quotas> <ready-base-bottles> <bottles-per-stand> <modifier-stocks> <modifier-per-run>',
    ['C', 'c', 's', 'C', 'S'],
    'Allocate pooled base bottles in variant priority order under independent modifier budgets.',
    (quotas, base, slots, stocks, costs) => {
      same(quotas, stocks, costs);
      let remainingBase = base;
      const variants = quotas.map((quota, i) => {
        const capacity = Math.floor(stocks[i] / costs[i]) * slots;
        const made = Math.min(quota, remainingBase, capacity);
        remainingBase -= made;
        return { made, short: quota - made, modifierUsed: batches(made, slots) * costs[i] };
      });
      return { variants, remainingBase };
    },
  ),
  command(
    'stage-windows <stage-seconds> <opens> <closes> <bottles-ready>',
    ['P', 'L', 'L', 'q'],
    'Find the earliest uninterrupted execution of successive brewing stages in their availability windows.',
    (durations, opens, closes, ready) => {
      same(durations, opens, closes);
      demand(
        opens.every((open, i) => open <= closes[i]),
        'An availability window cannot close before it opens.',
      );
      const stages = [];
      for (const [i, duration] of durations.entries()) {
        const start = Math.max(ready, opens[i]);
        const finish = start + duration;
        if (start >= closes[i] || !budgetFits(finish, closes[i])) return { stages, blockedStage: i + 1 };
        stages.push({ start, finish });
        ready = finish;
      }
      return { stages, blockedStage: null };
    },
  ),
  command(
    'forked-timeline <quotas> <bottles-per-stand> <base-stands> <finish-stands> <base-seconds> <finish-seconds-by-variant>',
    ['C', 's', 's', 's', 'p', 'P'],
    'Schedule finish batches as pooled base bottles become ready on separate stands.',
    forkedTimeline,
  ),
  command(
    'rack-order <variant-bottles> <rack-widths>',
    ['C', 'S'],
    'Allocate each nonempty variant to one contiguous shelf segment, preserving display order.',
    (quotas, shelves) => {
      let rack = 0;
      let used = 0;
      return quotas.map((count) => {
        if (count === 0) return null;
        const candidate = shelves.findIndex((slots, i) => i >= rack && count <= slots - (i === rack ? used : 0));
        if (candidate === -1) return null;
        if (candidate !== rack) used = 0;
        rack = candidate;
        const firstSlot = used + 1;
        used += count;
        return { rack: rack + 1, firstSlot, lastSlot: used };
      });
    },
  ),
  command(
    'label-ranges <bottle-quotas> <bottles-per-label> <first-label>',
    ['C', 's', 's'],
    'Reserve consecutive run labels for each variant without reusing another variant’s partial label.',
    (quotas, size, first) => {
      let next = first;
      return quotas.map((count) => {
        if (count === 0) return null;
        const firstLabel = next;
        next += batches(count, size);
        return { firstLabel, lastLabel: next - 1 };
      });
    },
  ),
  command(
    'bottle-reuse <empty-stock> <filled-stock> <doses-used> <returned-empties> <next-batch>',
    ['C', 'C', 'C', 'C', 'C'],
    'Reconcile consumed filled bottles and returned empties before preparing the next session.',
    (empty, filled, used, back, next) => {
      same(empty, filled, used, back, next);
      return filled.map((stock, i) => {
        demand(used[i] <= stock && back[i] <= used[i], 'Used bottles must be filled, and returns cannot exceed use.');
        const empties = empty[i] + back[i];
        return { remainingFilled: stock - used[i], empties, newEmptiesNeeded: shortage(next[i], empties) };
      });
    },
  ),
  command(
    'water-rounds <bottles> <water-on-bench> <reserve> <units-per-fetch> <seconds-per-fetch> <seconds-per-fill>',
    ['c', 'c', 'c', 's', 'q', 'q'],
    'Estimate water replenishment trips and filling time for a single operator.',
    (bottles, water, reserve, units, fetchTime, fillTime) => {
      const fetches = batches(shortage(bottles + reserve, water), units);
      return {
        fetches,
        seconds: fetches * fetchTime + bottles * fillTime,
        waterLeft: water + fetches * units - bottles,
      };
    },
  ),
  command(
    'effect-renewals <coverage-windows> <duration>',
    ['intervals', 'p'],
    'Count doses to cover required time windows, carrying active time between windows.',
    effectRenewals,
  ),
  command(
    'simultaneous-doses <players-by-group> <targets-per-dose> <doses>',
    ['C', 'S', 'c'],
    'Serve complete groups in priority order when a dose cannot be shared between groups.',
    (players, targets, doses) => {
      same(players, targets);
      let remaining = doses;
      const groups = players.map((count, i) => {
        const needed = batches(count, targets[i]);
        const used = needed <= remaining ? needed : 0;
        remaining -= used;
        return { needed, used, covered: used === needed };
      });
      return { groups, remaining };
    },
  ),
  command(
    'effect-chain <dose-starts> <effect-durations>',
    ['L', 'P'],
    'Measure overlap, gaps and unique active time when repeated doses of one effect can overlap.',
    (starts, durations) => {
      same(starts, durations);
      let until = starts[0];
      let active = 0;
      let overlap = 0;
      let gaps = 0;
      for (const [i, start] of starts.entries()) {
        demand(i === 0 || start >= starts[i - 1], 'Dose starts must be nondecreasing.');
        const end = start + durations[i];
        overlap += Math.min(durations[i], shortage(until, start));
        gaps += shortage(start, until);
        active += shortage(end, Math.max(start, until));
        until = Math.max(until, end);
      }
      return { active, overlap, gaps, until };
    },
  ),
  command(
    'breakage-at-stage <starting-bottles> <bottles-per-stand> <losses-after-stages>',
    ['c', 's', 'C'],
    'Account for stand slots used and surviving bottles under supplied step-by-step losses.',
    (start, slots, losses) => {
      let stock = start;
      return losses.map((lost) => {
        demand(lost <= stock, 'Losses cannot exceed bottles entering the stage.');
        const runs = batches(stock, slots);
        const emptySlots = runs * slots - stock;
        stock -= lost;
        return { runs, emptySlots, remaining: stock };
      });
    },
  ),
  command(
    'ingredient-replenish <stage-ingredients> <stage-needs> <stocks> <refill-sizes>',
    ['S', 'C', 'C', 'S'],
    'Plan just-in-time ingredient pulls from whole refill packs in recipe-stage order.',
    (ids, needs, initial, pack) => {
      same(ids, needs);
      same(initial, pack);
      const stocks = [...initial];
      return ids.map((id, i) => {
        demand(id <= stocks.length, 'Use an ingredient ID within the stocked list.');
        const idx = id - 1;
        const packs = batches(shortage(needs[i], stocks[idx]), pack[idx]);
        stocks[idx] += packs * pack[idx] - needs[i];
        return { ingredient: id, packs, remaining: stocks[idx] };
      });
    },
  ),
  command(
    'rack-rebalance <rack-stocks> <rack-capacities> <minimum-reserves>',
    ['C', 'C', 'C'],
    'Move identical bottles between racks to meet all minimum reserves with the fewest transfers by bottle count.',
    (initial, capacities, reserve) => {
      same(initial, capacities, reserve);
      demand(
        capacities.every((capacity, i) => initial[i] <= capacity && reserve[i] <= capacity),
        'Rack stocks and desired reserves must fit their capacities.',
      );
      const stocks = [...initial];
      const moves = sum(reserve.map((minimum, i) => shortage(minimum, stocks[i])));
      if (sum(stocks) < sum(reserve)) return null;
      // Transfer the earliest available surplus into each deficit.
      let donor = 0;
      for (const [i, minimum] of reserve.entries()) {
        while (stocks[i] < minimum) {
          while (stocks[donor] <= reserve[donor]) donor++;
          const bottles = Math.min(minimum - stocks[i], stocks[donor] - reserve[donor]);
          stocks[donor] -= bottles;
          stocks[i] += bottles;
        }
      }
      return { movedBottles: moves, stocks };
    },
  ),
  command(
    'charged-batches <charges-by-stand> <charges-per-batch> <bottles-per-stand>',
    ['C', 's', 's'],
    'Measure complete fuel-funded batches and the opportunity stranded by separating charges across stands.',
    (charges, cost, slots) => {
      const byStand = charges.map((count) => Math.floor(count / cost));
      const complete = sum(byStand);
      return { byStand, bottles: slots * complete, pooledExtraBatches: Math.floor(sum(charges) / cost) - complete };
    },
  ),
  command(
    'salvage-clock <stage-seconds> <completed-stages> <elapsed-in-stage> <handoff-delay>',
    ['P', 'c', 'q', 'q'],
    'Compare finishing a handed-off partial batch with restarting the recipe while keeping both finish clocks explicit.',
    (durations, done, elapsed, delay) => {
      demand(
        done <= durations.length && elapsed < (durations[done] ?? 1) && (done < durations.length || elapsed === 0),
        'Progress must refer to the current unfinished stage.',
      );
      const restart = sum(durations);
      if (done === durations.length) return { resume: 0, restart, saved: restart };
      const resume = delay + sum(durations.slice(done)) - elapsed;
      return { resume, restart, saved: restart - resume };
    },
  ),
  command(
    'fill-and-brew <bottles> <bottles-per-stand> <stands> <load-seconds-per-bottle> <brew-seconds>',
    ['c', 's', 's', 'q', 'p'],
    'Schedule one serial loader serving reusable brew stands without intermediate staging.',
    fillAndBrew,
  ),
  command(
    'stand-downtime <stage-seconds> <session-start> <stop-windows>',
    ['P', 'q', 'intervals'],
    'Project sequential finish clocks when one stand pauses during downtime and resumes its progress.',
    standDowntime,
  ),
  command(
    'staging-slots <staging-windows> <bottles> <rack-slots>',
    ['intervals', 'C', 'c'],
    'Find peak temporary rack usage and its first overflow under half-open staging windows.',
    stagingSlots,
  ),
  command(
    'changeover-budget <base-ids> <variant-ids> <base-switch-seconds> <variant-switch-seconds>',
    ['S', 'S', 'q', 'q'],
    'Compare source order with grouped base and variant preparation, preserving order within each group.',
    (bases, variants, baseTime, variantTime) => {
      same(bases, variants);
      const ids = bases.map((base, index) => ({ index, base, variant: variants[index] }));
      const measure = (ordered) => {
        let seconds = 0;
        for (let i = 1; i < ordered.length; i++) {
          const baseChanged = ordered[i].base !== ordered[i - 1].base;
          if (baseChanged) seconds += baseTime;
          if (baseChanged || ordered[i].variant !== ordered[i - 1].variant) seconds += variantTime;
        }
        return seconds;
      };
      const ordered = [...ids].sort((a, b) => a.base - b.base || a.variant - b.variant);
      return {
        sourceSeconds: measure(ids),
        groupedSeconds: measure(ordered),
        order: ordered.map(({ index }) => index + 1),
      };
    },
  ),
  command(
    'reserve-deadlines <starting-stock> <receipts> <pickups>',
    ['C', 'points3', 'points3'],
    'Apply variant receipts before same-clock pickups and report each expiring shortage.',
    reserveDeadlines,
  ),
];

export const STATION_GROUPS = [
  {
    name: 'furnace-bank',
    note: 'Offline furnace layout, routing and dispatch from supplied assumptions.',
    commands: furnaceCommands,
  },
  {
    name: 'brewing-bench',
    note: 'Offline brewing batches, ingredient checks and session planning from supplied assumptions.',
    commands: brewingCommands,
  },
];
