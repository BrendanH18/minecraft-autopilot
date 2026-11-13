import { demand, sum, same, sequence } from './offline-kit.js';
import { wholeCeil, wholeFloor, budgetFits } from './resource-rounding.js';

// Batch 13 operations planners. Every rate, density, delay, and scale is caller
// supplied; nothing here reads a world, encodes a game rule, or executes an action.
const command = (signature, types, description, run) => ({ signature, types, description, run });

// stripmine helpers. A comb is a corridor with perpendicular branches at a pitch
// (branch width plus gap). Branches start outside the corridor, so no cell is shared.
const stripSides = sides => demand(sides <= 2, 'Sides must be 1 or 2.');
// Facing side reveals of neighboring branches overlap once the gap is under two reveals.
const stripShared = (gap, sideReveal) => Math.min(gap, 2 * sideReveal);
const stripReturn = (index, lead, width, gap, length) => length + lead + (index - 1) * (width + gap);
// The larger side holds half the branches, rounded up; `separation` solid cells sit between neighbors.
const stripMouths = (corridorLength, branches, branchWidth, separation) => {
  const larger = Math.ceil(branches / 2);
  demand(larger * branchWidth + Math.max(0, larger - 1) * separation <= corridorLength, separation
    ? 'Branch mouths do not fit: half the branches, rounded up, with one solid cell between neighbors need more than the corridor length.'
    : 'Branch mouths do not fit: half the branches, rounded up, times branch width exceeds the corridor length.');
};
// Roundoff-tolerant "cost fits budget", written with the shared whole-unit policy.
const stripFits = (cost, budget) => cost <= budget || wholeFloor(budget / cost) >= 1;
function stripStackedCoverage(width, gap, height, verticalGap, sideReveal, verticalReveal, stagger) {
  const pitch = width + gap, period = 2 * (height + verticalGap);
  demand(stagger < pitch, 'Stagger must be smaller than the pitch.');
  demand(pitch * period <= 1e6, 'The repeating block (pitch times twice the layer step) is limited to 1,000,000 cells.');
  // Distance from an index to the nearest dug index of a run repeating every `cycle`.
  const distance = (index, start, run, cycle) => { const r = ((index - start) % cycle + cycle) % cycle; return r < run ? 0 : Math.min(r - run + 1, cycle - r); };
  const columns = Array.from({ length: pitch }, (_, x) => [distance(x, 0, width, pitch), distance(x, stagger, width, pitch)]);
  let observed = 0;
  for (let y = 0; y < period; y++) {
    const lower = distance(y, 0, height, period), upper = distance(y, height + verticalGap, height, period);
    for (const [first, second] of columns) {
      if ((lower === 0 && first <= sideReveal) || (upper === 0 && second <= sideReveal) || (first === 0 && lower <= verticalReveal) || (second === 0 && upper <= verticalReveal)) observed++;
    }
  }
  return observed / (pitch * period);
}
function stripBranchesInTime(budget, dig, firstTrip, step) {
  const each = dig + firstTrip;
  const bound = wholeFloor(budget / each);
  demand(bound <= Number.MAX_SAFE_INTEGER, 'The budget allows too many branches; use coarser time units.');
  // A large quotient can sit just below the true count, so the search reaches two
  // past it and the roundoff-tolerant fit test decides every candidate.
  let high = Math.min(bound + 2, Number.MAX_SAFE_INTEGER), low = 0;
  const cost = n => n * each + step * n * (n - 1) / 2;
  while (low < high) { const middle = low + Math.ceil((high - low) / 2); if (stripFits(cost(middle), budget)) low = middle; else high = middle - 1; }
  return low;
}

// herd helpers. A projection starts with adults only. In every cycle the pairs formed
// from the adults counted at the previous cycle end breed, and offspring born in cycle
// k count as adults from the end of cycle k + delay on. Nothing dies unless culled.
const herdSize = state => state.adults + state.juveniles;
const herdBounded = state => demand(herdSize(state) <= 1e12, 'Herd projections are limited to 1,000,000,000,000 animals.');
function herdProjection(adults, offspring, delay) {
  const births = [], state = { adults, juveniles: 0, pairings: 0, cycles: 0 };
  state.step = (pairLimit = Infinity) => {
    const pairs = Math.min(Math.floor(state.adults / 2), pairLimit), born = pairs * offspring;
    births.push(born);
    state.cycles++;
    const matured = state.cycles > delay ? births[state.cycles - delay - 1] : 0;
    state.adults += matured;
    state.juveniles += born - matured;
    state.pairings += pairs;
  };
  return state;
}
// Breed until the herd reaches the target; null when it is short and can never grow.
// Every breeding cycle of two or more adults adds at least one animal, so this ends.
function herdReach(adults, offspring, delay, target) {
  if (adults < target && adults < 2) return null;
  const state = herdProjection(adults, offspring, delay);
  while (herdSize(state) < target) state.step();
  return state;
}
// Run the cull-schedule projection until its culls total the harvest. A cull that leaves
// fewer than two adults and no juveniles ends all breeding, maturation, and culling.
function herdHarvest(adults, offspring, delay, keep, harvest) {
  const state = herdProjection(adults, offspring, delay);
  let culled = 0;
  while (culled < harvest) {
    demand(state.cycles < 1e6, 'Harvests are limited to 1,000,000 cycles.');
    state.step();
    herdBounded(state);
    const cull = Math.max(0, state.adults - keep);
    state.adults -= cull;
    culled += cull;
    if (culled < harvest && state.adults < 2 && state.juveniles === 0) return null;
  }
  return { cycles: state.cycles, culled, herd: herdSize(state) };
}
function herdFeedBudget(adults, offspring, delay, budget, feedPerPair) {
  demand(adults >= 2, 'At least two adults are needed to breed.');
  const affordable = wholeFloor(budget / feedPerPair), state = herdProjection(adults, offspring, delay);
  while (state.pairings + Math.floor(state.adults / 2) <= affordable) {
    demand(state.cycles < 1e6, 'Feed budgets are limited to 1,000,000 cycles; raise feed-per-pair or lower the budget.');
    state.step();
    herdBounded(state);
  }
  return { cycles: state.cycles, pairings: state.pairings, feedUsed: state.pairings * feedPerPair, herd: herdSize(state) };
}
// The herd at a fixed cycle never shrinks when a starting adult is added, so bisect.
function herdFounders(target, offspring, delay, cycles) {
  demand(cycles <= 1000, 'Founder searches are limited to 1,000 cycles.');
  const reaches = adults => {
    const state = herdProjection(adults, offspring, delay);
    while (state.cycles < cycles && herdSize(state) < target) state.step();
    return herdSize(state) >= target;
  };
  let low = 0, high = target;
  while (high - low > 1) { const middle = low + Math.floor((high - low) / 2); if (reaches(middle)) high = middle; else low = middle; }
  return high;
}
function herdFillPen(adults, offspring, delay, capacity) {
  demand(adults <= capacity, 'Starting adults cannot exceed the capacity.');
  const state = herdProjection(adults, offspring, delay);
  for (;;) {
    const room = Math.floor((capacity - herdSize(state)) / offspring);
    if (Math.min(Math.floor(state.adults / 2), room) === 0) break;
    state.step(room);
  }
  return { cycles: state.cycles, herd: herdSize(state), spare: capacity - herdSize(state) };
}
// Root above one of x^(delay + 1) - x^delay = offspring / 2, bisected in logarithms so
// large delays cannot overflow.
function herdGrowthFactor(offspring, delay) {
  let low = 1, high = 1 + offspring / 2;
  if (delay === 0) return high;
  const goal = Math.log(offspring / 2);
  for (let i = 0; i < 200; i++) {
    const middle = low + (high - low) / 2;
    if (middle <= low || middle >= high) break;
    if (delay * Math.log(middle) + Math.log(middle - 1) < goal) low = middle; else high = middle;
  }
  return high;
}
function herdLeastPerimeterPen(animals, areaPerAnimal) {
  const required = animals * areaPerAnimal;
  const lengthFor = width => Math.max(width, wholeCeil(required / width));
  // Widths above the rounded-up square root are squares with a longer perimeter. Below
  // it, width + required / width only grows as the width shrinks, so the scan stops once
  // that bound clears the best half-perimeter (about the fourth root of the area in steps).
  let best = { width: Math.max(1, wholeCeil(Math.sqrt(required))) };
  best.length = lengthFor(best.width);
  for (let width = best.width - 1; width >= 1 && width + required / width <= best.width + best.length + 1; width--) {
    const length = lengthFor(width);
    // Among equal perimeters the narrower candidate has the smaller area.
    if (width + length <= best.width + best.length) best = { width, length };
  }
  return { width: best.width, length: best.length, penArea: best.width * best.length, perimeter: 2 * (best.width + best.length) };
}

// signalplan helpers. A line is wire cells split into runs by one-cell boosters; clocks
// fire at phase + k * period for whole k >= 0 unless a command says otherwise.
const SIGNAL_SAFE = Number.MAX_SAFE_INTEGER;
const signalBase = base => demand(base >= 2, 'Base must be at least 2.');
const signalBits = (bits, label) => demand(bits.every(bit => bit <= 1), `${label} must contain only 0 and 1.`);
const signalGcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
const signalBoosters = (wire, range) => Math.max(0, Math.ceil(wire / range) - 1);
const signalLineDelay = (wire, range, boosterDelay, cellDelay) => signalBoosters(wire, range) * boosterDelay + wire * cellDelay;
// Smallest whole d >= 0 with base^d >= states.
function signalDigits(states, base) {
  let digits = 0;
  for (let capacity = 1; capacity < states; capacity *= base) digits++;
  return digits;
}
function signalLongestLine(budget, range, boosterDelay, cellDelay) {
  demand(budget / cellDelay <= 1e12, 'The latency budget divided by cell-delay is limited to 1,000,000,000,000.');
  // The quotient can sit just below the true answer when it is large, so the bound
  // overshoots by two and the roundoff-tolerant fit test decides every candidate.
  const cap = wholeFloor(budget / cellDelay) + 2;
  // The delay never decreases as the line grows, so the longest fitting line is found by bisection.
  let lo = 0, hi = cap;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (budgetFits(signalLineDelay(mid, range, boosterDelay, cellDelay), budget)) lo = mid; else hi = mid - 1;
  }
  return lo;
}
// Most cells n with minimum + n * loss <= strength under the roundoff-tolerant fit test.
// The subtraction strength - minimum carries roundoff that scales with the inputs, so the
// floored quotient can be one cell off; the fit test settles that one cell either way.
function signalReach(strength, loss, minimum) {
  const quotient = (strength - minimum) / loss, n = wholeFloor(quotient);
  const fits = cells => budgetFits(minimum + cells * loss, strength);
  if (n > 0 && !fits(n)) return n - 1;
  return quotient > n + 0.5 && fits(n + 1) ? n + 1 : n;
}
function signalHighTicks(period, high, phase, start, end) {
  demand(high <= period, 'High ticks cannot exceed the period.');
  demand(start <= end, 'The window start cannot be after its end.');
  // Ticks u in [0, n) with u modulo period below high.
  const below = n => Math.floor(n / period) * high + Math.min(n % period, high);
  const first = ((start - phase) % period + period) % period;
  return below(first + end - start + 1) - below(first);
}
function signalCommonPeriod(periods) {
  let lcm = 1;
  for (const period of periods) {
    const step = lcm / signalGcd(lcm, period);
    demand(step <= SIGNAL_SAFE / period, 'The common period exceeds 9,007,199,254,740,991.');
    lcm = step * period;
  }
  return lcm;
}
function signalFirstCoincidence(firstPeriod, firstPhase, secondPeriod, secondPhase) {
  const g = signalGcd(firstPeriod, secondPeriod);
  if (Math.abs(firstPhase - secondPhase) % g !== 0) return null;
  const from = Math.max(firstPhase, secondPhase);
  let tick = firstPhase + Math.ceil((from - firstPhase) / firstPeriod) * firstPeriod;
  // At most secondPeriod / gcd steps reach the one residue that matches the second clock.
  while ((tick - secondPhase) % secondPeriod !== 0) tick += firstPeriod;
  return { tick, repeatEvery: firstPeriod / g * secondPeriod };
}
function signalCapacity(digits, base) {
  let capacity = 1;
  for (let i = 0; i < digits; i++) {
    demand(capacity <= SIGNAL_SAFE / base, 'Counter capacity (base to the power of digits) exceeds 9,007,199,254,740,991.');
    capacity *= base;
  }
  return capacity;
}
function signalEncode(value, base, width) {
  demand(width <= 1000, 'Width is limited to 1000 digits.');
  let rest = value;
  const digits = sequence(width, () => { const digit = rest % base; rest = Math.floor(rest / base); return digit; }).reverse();
  demand(rest === 0, 'Value needs more digits than the width allows.');
  return digits;
}
function signalStep(durations, tick) {
  const cycle = sum(durations);
  let offset = tick % cycle, step = 0;
  while (offset >= durations[step]) offset -= durations[step++];
  return { step: step + 1, tickInStep: offset, ticksToNext: durations[step] - offset };
}

// linkplan: wide and compact frames with compact = wide / scale.
const linkTidy = value => typeof value === 'number' ? (value === 0 ? 0 : value)
  : Array.isArray(value) ? value.map(linkTidy)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, linkTidy(v)])) : value;
const linkCommand = (signature, types, description, run) => command(signature, types, description, (...args) => linkTidy(run(...args)));
const linkRows = (rows, count, label) => demand(rows.length === count, `${label} must have exactly ${count} ${count === 1 ? 'row' : 'rows'}.`);
// A scale too small for the coordinates overflows to Infinity, which would drop
// candidates or hubs silently, so every scaled value must stay finite.
const linkFinite = value => { demand(Number.isFinite(value), 'Scaled coordinates and distances must be finite; use a larger scale.'); return value; };
const linkImage = ([x, z], scale) => [linkFinite(x / scale), linkFinite(z / scale)];
const linkCell = (point, scale) => linkImage(point, scale).map(wholeFloor);
const linkFloor = point => point.map(wholeFloor);
const linkHypot = (a, b) => linkFinite(Math.hypot(a[0] - b[0], a[1] - b[1]));
// Compact distance between two wide points: wide Euclidean distance divided by scale.
const linkCompactDistance = (a, b, scale) => linkFinite(linkHypot(a, b) / scale);
// Chebyshev distance between two whole cells.
const linkCellGap = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
// Lowest index at the smallest value, scanning candidates in index order; -1 when none qualify.
function linkNearest(count, allowed, distance) {
  let best = -1, bestDistance = Infinity;
  for (let j = 0; j < count; j++) {
    if (!allowed(j)) continue;
    const d = distance(j);
    if (d < bestDistance) { best = j; bestDistance = d; }
  }
  return best;
}
function linkSpanningNetwork(points, scale) {
  const n = points.length, inTree = points.map(() => false), best = points.map(() => Infinity), parent = points.map(() => -1), edges = [];
  let total = 0, added = 0;
  inTree[0] = true;
  for (;;) {
    for (let v = 0; v < n; v++) {
      if (inTree[v]) continue;
      // Compare compact distances, so wide distances that divide to the same compact distance tie.
      const d = linkCompactDistance(points[added], points[v], scale);
      if (d < best[v] || (d === best[v] && added < parent[v])) { best[v] = d; parent[v] = added; }
    }
    const next = linkNearest(n, v => !inTree[v], v => best[v]);
    if (next < 0) break;
    inTree[next] = true;
    added = next;
    edges.push([parent[next] + 1, next + 1]);
    total += best[next];
  }
  return { edges, total };
}

export const OPERATION_GROUPS = [
  { name: 'stripmine', note: 'Offline branch-mining layout arithmetic from supplied corridor sizes, spacings, and densities. Exposure and yield are idealized estimates; no ore distribution, terrain, or hazard is inspected.', commands: [
    command("branch-count <corridor-length> <lead> <branch-width> <gap> <sides>", ["s", "c", "s", "c", "s"], "Count the branches that fit along a corridor as sides (1 or 2) times the largest whole count per side, possibly zero, whose last branch ends at or before the last corridor cell when the first branch starts right after the lead, rejecting a lead longer than the corridor.", (length, lead, width, gap, sides) => {
      stripSides(sides);
      demand(lead <= length, 'Lead cannot exceed the corridor length.');
      return sides * Math.max(0, Math.floor((length - lead + gap) / (width + gap)));
    }),
    command("branch-starts <branches-per-side> <lead> <branch-width> <gap>", ["s", "c", "s", "c"], "List, for branches one to branches-per-side in order from the entrance, the one-based corridor cell index of the first cell of each branch, which is lead plus (index minus one) times the pitch plus one.", (branches, lead, width, gap) => sequence(branches, i => lead + i * (width + gap) + 1)),
    command("comb-footprint <branches-per-side> <lead> <branch-width> <gap> <branch-length> <corridor-width> <sides>", ["s", "c", "s", "c", "s", "s", "s"], "Report the bounding rectangle of a comb as alongCells (lead plus every branch width on one side plus the gaps between those branches), acrossCells (corridor width plus sides, 1 or 2, times branch length), and areaCells (their product).", (branches, lead, width, gap, length, corridorWidth, sides) => {
      stripSides(sides);
      const alongCells = lead + branches * width + (branches - 1) * gap, acrossCells = corridorWidth + sides * length;
      return { alongCells, acrossCells, areaCells: alongCells * acrossCells };
    }),
    command("comb-cells <corridor-length> <corridor-width> <height> <branches> <branch-width> <branch-length>", ["s", "s", "s", "c", "s", "s"], "Count excavated cells as corridorCells (corridor length times corridor width times height), branchCells (branches, the total over both sides, times branch width times branch length times height), and totalCells (their sum), rejecting branches whose larger side, half the branches rounded up, is wider in total than the corridor length.", (length, corridorWidth, height, branches, width, branchLength) => {
      stripMouths(length, branches, width, 0);
      const corridorCells = length * corridorWidth * height, branchCells = branches * width * branchLength * height;
      return { corridorCells, branchCells, totalCells: corridorCells + branchCells };
    }),
    command("comb-faces <corridor-length> <corridor-width> <height> <branches> <branch-width> <branch-length>", ["s", "s", "s", "c", "s", "s"], "Count the solid unit faces bounding a comb as floorFaces and ceilingFaces (each corridor length times corridor width plus branches times branch width times branch length), wallFaces (both corridor side walls less the branch mouths, plus the corridor far end, plus two side walls and one end per branch, with the entrance end open), and totalFaces (their sum), assuming at least one solid cell between neighboring branches on a side and rejecting branches whose larger side, half the branches rounded up, cannot fit along the corridor length that way.", (length, corridorWidth, height, branches, width, branchLength) => {
      stripMouths(length, branches, width, 1);
      const floorFaces = length * corridorWidth + branches * width * branchLength;
      const wallFaces = 2 * height * length + corridorWidth * height + 2 * branches * height * branchLength;
      return { floorFaces, ceilingFaces: floorFaces, wallFaces, totalFaces: 2 * floorFaces + wallFaces };
    }),
    command("comb-reveal <branches> <branch-width> <height> <branch-length> <gap> <side-reveal> <vertical-reveal>", ["s", "s", "s", "s", "c", "c", "c"], "Count the unique cells revealed by one row of branches as sideCells (height times branch length times the sum of twice the side reveal and, for each of the branches minus one gaps, the smaller of the gap and twice the side reveal), verticalCells (twice the vertical reveal times branch width times branch length times branches), and totalCells (their sum).", (branches, width, height, length, gap, sideReveal, verticalReveal) => {
      const sideCells = height * length * (2 * sideReveal + (branches - 1) * stripShared(gap, sideReveal));
      const verticalCells = 2 * verticalReveal * width * length * branches;
      return { sideCells, verticalCells, totalCells: sideCells + verticalCells };
    }),
    command("pitch-efficiency <branch-width> <height> <gap> <side-reveal> <vertical-reveal>", ["s", "s", "c", "c", "c"], "Report the unique revealed cells per dug cell for one interior branch of a long row, which is height times the smaller of the gap and twice the side reveal, plus twice the vertical reveal times branch width, all divided by branch width times height.", (width, height, gap, sideReveal, verticalReveal) => (height * stripShared(gap, sideReveal) + 2 * verticalReveal * width) / (width * height)),
    command("layer-coverage <branch-width> <gap> <side-reveal>", ["s", "c", "c"], "Split one pitch of a long branch row into dugFraction (branch width over pitch), revealedFraction (the smaller of the gap and twice the side reveal, over pitch), and unseenFraction (the remaining gap cells over pitch).", (width, gap, sideReveal) => {
      const pitch = width + gap, shared = stripShared(gap, sideReveal);
      return { dugFraction: width / pitch, revealedFraction: shared / pitch, unseenFraction: (gap - shared) / pitch };
    }),
    command("vein-hit-chance <branch-width> <gap> <side-reveal> <vein-extent>", ["s", "c", "c", "s"], "Report the fraction of the pitch-many equally likely positions along the corridor axis at which a vein spanning vein-extent consecutive cells of that axis has at least one cell dug or side-revealed by a long branch row, which is one minus the larger of zero and gap minus twice the side reveal minus vein-extent plus one, over the pitch.", (width, gap, sideReveal, extent) => {
      const pitch = width + gap;
      return (pitch - Math.max(0, gap - 2 * sideReveal - extent + 1)) / pitch;
    }),
    command("widest-gap <branch-width> <side-reveal> <vein-extent> <target-chance>", ["s", "c", "s", "r"], "Find the largest whole gap whose vein-hit-chance is at least a positive target chance, which is the sum of branch width, twice the side reveal, and vein-extent minus one, divided by the target and rounded down, minus branch width.", (width, sideReveal, extent, target) => {
      demand(target > 0, 'Target chance must be positive; a zero target allows any gap.');
      return wholeFloor((width + 2 * sideReveal + extent - 1) / target) - width;
    }),
    command("stacked-coverage <branch-width> <gap> <height> <vertical-gap> <side-reveal> <vertical-reveal> <stagger>", ["s", "c", "s", "c", "c", "c", "c"], "Report the observed fraction of the cells in one repeating block (pitch columns by twice the layer step in rows) of the stacked cross-section whose every second layer is shifted along the corridor by a stagger smaller than the pitch, rejecting blocks of more than 1,000,000 cells.", stripStackedCoverage),
    command("layer-plan <layers> <height> <vertical-gap> <branch-width> <gap>", ["s", "s", "c", "s", "c"], "List stacked layers from the lowest up as rows with layer (one-based), floorOffset (layer minus one, times the sum of height and vertical gap), and alongShift (zero for odd layers and half the pitch rounded down for even layers).", (layers, height, verticalGap, width, gap) => sequence(layers, i => ({ layer: i + 1, floorOffset: i * (height + verticalGap), alongShift: i % 2 ? Math.floor((width + gap) / 2) : 0 }))),
    command("expected-finds <dug-cells> <revealed-cells> <density>", ["c", "c", "q"], "Multiply the observed cells (dug plus revealed) by a supplied density of expected finds per observed cell.", (dug, revealed, density) => (dug + revealed) * density),
    command("cells-for-finds <target-finds> <density> <revealed-per-dug>", ["q", "p", "q"], "Count the cells to dig, rounded up, so that the observed cells (one plus revealed-per-dug for every dug cell) times the density reach the target finds.", (target, density, revealedPerDug) => wholeCeil(target / (density * (1 + revealedPerDug)))),
    command("find-rate <dig-time-per-cell> <revealed-per-dug> <density> <period>", ["p", "q", "q", "p"], "Report expected finds per period as the period divided by the dig time per cell, times one plus revealed-per-dug, times the density, without rounding to whole cells.", (digTime, revealedPerDug, density, period) => period / digTime * (1 + revealedPerDug) * density),
    command("return-distance <branch-index> <lead> <branch-width> <gap> <branch-length>", ["s", "c", "s", "c", "s"], "Count the cell steps from the far-end cell of the branch with a one-based index back to corridor cell one, which is branch length plus lead plus (index minus one) times the pitch.", stripReturn),
    command("haul-walk <branches> <lead> <branch-width> <gap> <branch-length> <trips-per-branch>", ["s", "c", "s", "c", "s", "s"], "Report totalWalk (twice the sum of the return distances of branches one to branches, times trips-per-branch, the cell steps of that many round trips between corridor cell one and every far end) and meanReturn (the mean of those return distances).", (branches, lead, width, gap, length, trips) => {
      const total = branches * (length + lead) + (width + gap) * (branches * (branches - 1) / 2);
      return { totalWalk: 2 * trips * total, meanReturn: length + lead + (branches - 1) * (width + gap) / 2 };
    }),
    command("branches-within-walk <walk-limit> <lead> <branch-width> <gap> <branch-length>", ["q", "c", "s", "c", "s"], "Count the leading branches of an unbounded row whose return distance does not exceed the walk limit, which is zero when even branch one is too far.", (limit, lead, width, gap, length) => Math.max(0, Math.floor((wholeFloor(limit) - length - lead) / (width + gap)) + 1)),
    command("branch-time <branch-width> <height> <branch-length> <dig-time-per-cell> <walk-time-per-step>", ["s", "s", "s", "q", "q"], "Report the time to dig one branch (branch width times height times branch length cells at the dig time per cell) plus the walk from its far end back to the corridor (branch length steps at the walk time per step).", (width, height, length, digTime, walkTime) => width * height * length * digTime + length * walkTime),
    command("branches-in-time <time-budget> <dig-time> <first-trip-time> <trip-time-step>", ["q", "p", "q", "q"], "Find the largest whole number of branches, possibly zero, whose summed time fits the time budget when branch k (one-based) costs dig-time plus first-trip-time plus (k minus one) times trip-time-step.", stripBranchesInTime),
    command("poke-holes <branch-length> <spacing> <poke-depth> <sides> <hole-reveal>", ["s", "s", "s", "s", "c"], "Report holes (sides, 1 or 2, times branch length divided by spacing and rounded down, one hole per side at every branch cell whose one-based index from the mouth is a multiple of the spacing), dugCells (holes times poke depth), and revealedCells (holes times hole-reveal times the sum of four poke depths and one, with overlaps not removed).", (length, spacing, depth, sides, reveal) => {
      stripSides(sides);
      const holes = sides * Math.floor(length / spacing);
      return { holes, dugCells: holes * depth, revealedCells: holes * reveal * (4 * depth + 1) };
    }),
    command("stair-shaft <depth> <drop-per-step> <width> <headroom>", ["s", "s", "s", "s"], "Report steps (depth divided by drop-per-step, rounded up) and cells (width times the sum of depth and steps times headroom) for a descending stair whose every step advances one cell and clears its column from the new tread up to headroom cells above the previous tread, the last step dropping only the remaining depth.", (depth, drop, width, headroom) => {
      const steps = wholeCeil(depth / drop);
      return { steps, cells: width * (steps * headroom + depth) };
    }),
    command("parallel-combs <strip-width> <corridor-width> <branch-length> <sides> <buffer>", ["s", "s", "s", "s", "c"], "Report spacing (corridor width plus sides, 1 or 2, times branch length plus buffer, the entrance-to-entrance distance of parallel combs), combs (the most combs, possibly zero, each spacing minus buffer cells wide, that fit across the strip width with one buffer between neighbors), and usedWidth (combs times spacing minus buffer, or zero for no combs).", (strip, corridorWidth, length, sides, buffer) => {
      stripSides(sides);
      const spacing = corridorWidth + sides * length + buffer, combs = Math.floor((strip + buffer) / spacing);
      return { spacing, combs, usedWidth: combs ? combs * spacing - buffer : 0 };
    }),
    command("corridor-overhead <corridor-width> <branch-width> <gap> <branch-length> <sides>", ["s", "s", "c", "s", "s"], "Report the fraction of the cells dug per pitch that belong to the corridor, which is corridor width times pitch, over that product plus sides (1 or 2) times branch width times branch length.", (corridorWidth, width, gap, length, sides) => {
      stripSides(sides);
      const corridor = corridorWidth * (width + gap);
      return corridor / (corridor + sides * width * length);
    }),
    command("branch-length-for-overhead <corridor-width> <branch-width> <gap> <sides> <target-fraction>", ["s", "s", "c", "s", "r"], "Find the shortest whole branch length, at least one, whose corridor-overhead does not exceed a positive target fraction.", (corridorWidth, width, gap, sides, target) => {
      stripSides(sides);
      demand(target > 0, 'Target fraction must be positive; the corridor always takes some share.');
      const corridor = corridorWidth * (width + gap);
      return Math.max(1, wholeCeil((corridor / target - corridor) / (sides * width)));
    }),
  ] },
  { name: 'herd', note: 'Offline herd growth, pen, and feed arithmetic from supplied cooldowns, ratios, and densities. No animal behavior, breeding rule, or drop rate is inferred.', commands: [
    command("breeding-round <adults> <offspring-per-pair> <feed-per-pair>", ["c", "s", "q"], "Report one breeding round in which every pair breeds as pairs (adults divided by two, rounded down), unpaired (adults minus twice the pairs), offspring (pairs times offspring-per-pair), and feed (pairs times feed-per-pair).", (adults, offspring, feedPerPair) => {
      const pairs = Math.floor(adults / 2);
      return { pairs, unpaired: adults - 2 * pairs, offspring: pairs * offspring, feed: pairs * feedPerPair };
    }),
    command("fed-round <adults> <feed-stock> <feed-per-pair> <offspring-per-pair>", ["c", "q", "p", "s"], "Report one breeding round limited by a feed stock as pairs (the smaller of adults divided by two, rounded down, and feed-stock divided by feed-per-pair, rounded down), offspring (pairs times offspring-per-pair), feedUsed (pairs times feed-per-pair), and idleAdults (adults minus twice the pairs).", (adults, stock, feedPerPair, offspring) => {
      const pairs = Math.min(Math.floor(adults / 2), wholeFloor(stock / feedPerPair));
      return { pairs, offspring: pairs * offspring, feedUsed: pairs * feedPerPair, idleAdults: adults - 2 * pairs };
    }),
    command("growth-curve <adults> <offspring-per-pair> <maturation-cycles> <cycles>", ["c", "s", "c", "s"], "List the herd (adults plus juveniles) at the end of each of cycles one to cycles, in cycle order, for an unculled projection in which every pair breeds each cycle.", (adults, offspring, delay, cycles) => {
      const state = herdProjection(adults, offspring, delay);
      return sequence(cycles, () => { state.step(); herdBounded(state); return herdSize(state); });
    }),
    command("age-split <adults> <offspring-per-pair> <maturation-cycles> <cycles>", ["c", "s", "c", "c"], "Report adults, juveniles, and herd (their sum) at the end of the given cycle of an unculled projection in which every pair breeds each cycle, which is the starting state when cycles is zero.", (adults, offspring, delay, cycles) => {
      const state = herdProjection(adults, offspring, delay);
      while (state.cycles < cycles) { state.step(); herdBounded(state); }
      return { adults: state.adults, juveniles: state.juveniles, herd: herdSize(state) };
    }),
    command("cycles-to-harvest <adults> <offspring-per-pair> <maturation-cycles> <keep-adults> <harvest>", ["c", "s", "c", "c", "c"], "Report cycles (the fewest cycles of the cull-schedule projection, in which every pair breeds each cycle and each cycle end culls all adults above keep-adults, whose culled adults total at least harvest, zero when harvest is zero), culled (the adults culled over those cycles), and herd (adults plus juveniles after the last of those culls, or the starting adults for zero cycles), or null when the total is still below harvest after a cull that leaves fewer than two adults and no juveniles, rejecting more than 1,000,000 cycles.", herdHarvest),
    command("feed-to-target <adults> <offspring-per-pair> <maturation-cycles> <target-herd> <feed-per-pair>", ["c", "s", "c", "s", "q"], "Report cycles (the cycles an unculled projection in which every pair breeds each cycle needs before its herd, adults plus juveniles, at a cycle end is first at least target-herd, zero when the starting adults already are), pairings (the pairs bred over all of those cycles), feed (pairings times feed-per-pair), and herd (the herd at the end of the last of those cycles, or the starting adults for zero cycles), or null when the starting adults are fewer than both two and target-herd and so never grow to the target.", (adults, offspring, delay, target, feedPerPair) => {
      const state = herdReach(adults, offspring, delay, target);
      return state && { cycles: state.cycles, pairings: state.pairings, feed: state.pairings * feedPerPair, herd: herdSize(state) };
    }),
    command("feed-budget-cycles <adults> <offspring-per-pair> <maturation-cycles> <feed-budget> <feed-per-pair>", ["c", "s", "c", "q", "p"], "Report cycles (the largest number of leading cycles, with every pair breeding in each, whose total pairings do not exceed feed-budget divided by feed-per-pair, rounded down), pairings (the pairs bred over those cycles), feedUsed (pairings times feed-per-pair), and herd (the herd at the end of those cycles), rejecting fewer than two adults and results above 1,000,000 cycles.", herdFeedBudget),
    command("delay-cycles <maturation-time> <cooldown>", ["q", "p"], "Convert a maturation time to maturation-cycles when cycle k breeds at time k minus one, times cooldown, and offspring first breed in the earliest later cycle that is at least maturation-time after their birth, which is maturation-time divided by cooldown, rounded up, minus one, and never below zero.", (maturationTime, cooldown) => Math.max(0, wholeCeil(maturationTime / cooldown) - 1)),
    command("growth-factor <offspring-per-pair> <maturation-cycles>", ["s", "c"], "Report the long-run factor by which an unculled herd multiplies every cycle when unpaired adults are ignored, which is the real x above one for which x to the power of maturation-cycles plus one, minus x to the power of maturation-cycles, equals half of offspring-per-pair.", herdGrowthFactor),
    command("founders-for-target <target-herd> <offspring-per-pair> <maturation-cycles> <cycles>", ["s", "s", "c", "c"], "Find the fewest starting adults whose unculled projection, with every pair breeding each cycle, has a herd of at least target-herd at the end of the given cycle (the starting adults themselves when cycles is zero), rejecting more than 1,000 cycles.", herdFounders),
    command("fill-pen <adults> <offspring-per-pair> <maturation-cycles> <capacity>", ["c", "s", "c", "s"], "Report cycles (the cycles in which at least one pair breeds), herd (the herd after them), and spare (capacity minus herd) for a projection in which each cycle breeds as many of its pairs as possible while the herd including the new offspring stays at or below capacity and which stops at the first cycle that can breed no pair, rejecting more starting adults than capacity.", herdFillPen),
    command("cull-schedule <adults> <offspring-per-pair> <maturation-cycles> <keep-adults> <cycles>", ["c", "s", "c", "c", "s"], "List, for each of cycles one to cycles in order, the adults culled at the end of that cycle when every pair breeds each cycle and each cycle end, after births and maturation, removes all adults above keep-adults and no juveniles.", (adults, offspring, delay, keep, cycles) => {
      const state = herdProjection(adults, offspring, delay);
      return sequence(cycles, () => {
        state.step();
        herdBounded(state);
        const culled = Math.max(0, state.adults - keep);
        state.adults -= culled;
        return culled;
      });
    }),
    command("steady-herd <breeders> <offspring-per-pair> <maturation-cycles>", ["c", "s", "c"], "Report the repeating state of a herd culled back to its breeders at every cycle end as birthsPerCycle (breeders divided by two, rounded down, times offspring-per-pair, which is also the adults culled per cycle), juveniles (birthsPerCycle times maturation-cycles, the juveniles at every cycle end), and peakHerd (breeders plus birthsPerCycle times the sum of maturation-cycles and one, the herd just before each cull).", (breeders, offspring, delay) => {
      const birthsPerCycle = Math.floor(breeders / 2) * offspring;
      return { birthsPerCycle, juveniles: birthsPerCycle * delay, peakHerd: breeders + birthsPerCycle * (delay + 1) };
    }),
    command("sustainable-yield <breeders> <offspring-per-pair> <feed-per-pair> <cooldown> <period>", ["c", "s", "q", "p", "p"], "Report the long-run rates of a constant group of breeders that breeds once per cooldown as pairs (breeders divided by two, rounded down), animalsPerPeriod (pairs times offspring-per-pair times period, divided by cooldown), feedPerPeriod (pairs times feed-per-pair times period, divided by cooldown), and feedPerAnimal (feed-per-pair divided by offspring-per-pair).", (breeders, offspring, feedPerPair, cooldown, period) => {
      const pairs = Math.floor(breeders / 2);
      return { pairs, animalsPerPeriod: pairs * offspring * period / cooldown, feedPerPeriod: pairs * feedPerPair * period / cooldown, feedPerAnimal: feedPerPair / offspring };
    }),
    command("breeders-for-demand <animals-per-period> <offspring-per-pair> <cooldown> <period>", ["q", "s", "p", "p"], "Find the smallest even number of breeders whose sustainable-yield animalsPerPeriod is at least animals-per-period, which is twice the rounded-up quotient of animals-per-period times cooldown over period times offspring-per-pair.", (demandRate, offspring, cooldown, period) => 2 * wholeCeil(demandRate * cooldown / (period * offspring))),
    command("harvest-interval <batch-size> <breeders> <offspring-per-pair> <cooldown>", ["s", "s", "s", "p"], "Report cycles (the fewest whole cycles whose births, at breeders divided by two, rounded down, times offspring-per-pair per cycle, reach batch-size), interval (cycles times cooldown), and surplus (those births minus batch-size), rejecting fewer than two breeders.", (batch, breeders, offspring, cooldown) => {
      demand(breeders >= 2, 'At least two breeders are needed to breed.');
      const births = Math.floor(breeders / 2) * offspring, cycles = Math.ceil(batch / births);
      return { cycles, interval: cycles * cooldown, surplus: cycles * births - batch };
    }),
    command("drop-plan <target-drops> <drops-per-animal> <offspring-per-pair> <feed-per-pair>", ["q", "p", "s", "q"], "Report animals (target-drops divided by drops-per-animal, rounded up, the animals to cull), pairings (animals divided by offspring-per-pair, rounded up, the pairings that replace them), feed (pairings times feed-per-pair), and drops (animals times drops-per-animal).", (target, dropsPerAnimal, offspring, feedPerPair) => {
      const animals = wholeCeil(target / dropsPerAnimal), pairings = Math.ceil(animals / offspring);
      return { animals, pairings, feed: pairings * feedPerPair, drops: animals * dropsPerAnimal };
    }),
    command("product-rate <animals> <yield-per-animal> <regrow-time> <visit-interval> <period>", ["c", "q", "p", "p", "p"], "Report the product gathered per period when collection visits recur every visit-interval and an animal yields yield-per-animal at the first visit at least regrow-time after its previous collection, which is animals times yield-per-animal times period, divided by visit-interval times the rounded-up quotient of regrow-time over visit-interval.", (animals, yieldPerAnimal, regrow, visit, period) => {
      const visitsPerCollection = wholeCeil(regrow / visit);
      demand(Number.isFinite(visitsPerCollection), 'Visit interval is too small for the regrow time.');
      return animals * yieldPerAnimal * period / (visit * visitsPerCollection);
    }),
    command("mixed-feed <adult-counts> <feeds-per-pair>", ["C", "L"], "Report one breeding round for several species listed in matching order as pairs (each adult count divided by two, rounded down), feed (each pairs entry times its feed-per-pair entry), and totalFeed (the sum of the feed entries), rejecting lists of different lengths.", (counts, feeds) => {
      same(counts, feeds);
      const pairs = counts.map(count => Math.floor(count / 2)), feed = pairs.map((count, i) => count * feeds[i]);
      return { pairs, feed, totalFeed: sum(feed) };
    }),
    command("square-pen <animals> <area-per-animal>", ["c", "p"], "Report side (the smallest whole side whose square is at least animals times area-per-animal), penArea (side squared), and capacity (penArea divided by area-per-animal, rounded down).", (animals, areaPerAnimal) => {
      const side = wholeCeil(Math.sqrt(animals * areaPerAnimal));
      return { side, penArea: side * side, capacity: wholeFloor(side * side / areaPerAnimal) };
    }),
    command("min-perimeter-pen <animals> <area-per-animal>", ["s", "p"], "Report width, length, penArea (width times length), and perimeter (twice the sum of width and length) of the rectangle with whole sides, width at most length, and area at least animals times area-per-animal that has the smallest perimeter, taking the smallest area among equal perimeters.", herdLeastPerimeterPen),
    command("pen-length <animals> <area-per-animal> <pen-width>", ["c", "p", "p"], "Find the smallest whole length of a pen of the supplied width whose area is at least animals times area-per-animal, which is that area divided by pen-width, rounded up.", (animals, areaPerAnimal, width) => wholeCeil(animals * areaPerAnimal / width)),
    command("pen-capacity <pen-width> <pen-length> <reserve-fraction> <area-per-animal>", ["p", "p", "r", "p"], "Count the animals that fit a rectangular pen, which is pen-width times pen-length times one minus reserve-fraction (the share of the area kept free), divided by area-per-animal, rounded down.", (width, length, reserve, areaPerAnimal) => wholeFloor(width * length * (1 - reserve) / areaPerAnimal)),
    command("pen-split <animals> <pen-capacity>", ["c", "s"], "List the animals per pen when a herd fills the fewest pens of at most pen-capacity animals as evenly as possible, with pen sizes differing by at most one and larger pens listed first, which is an empty list for zero animals.", (animals, capacity) => {
      const pens = Math.ceil(animals / capacity), base = pens ? Math.floor(animals / pens) : 0, larger = animals - base * pens;
      return sequence(pens, i => base + (i < larger ? 1 : 0));
    }),
    command("cull-to-fit <adults> <juveniles> <capacity> <keep-adults>", ["c", "c", "c", "c"], "Report the culls that bring a herd of adults and juveniles down to capacity as adultsCulled (taken first from the adults above keep-adults), juvenilesCulled (taken second), breedersCulled (taken last from the kept adults), and herdAfter (the herd minus all three), each stage culling only as much of the remaining excess as it holds.", (adults, juveniles, capacity, keep) => {
      const excess = Math.max(0, adults + juveniles - capacity);
      const adultsCulled = Math.min(excess, Math.max(0, adults - keep)), juvenilesCulled = Math.min(juveniles, excess - adultsCulled);
      return { adultsCulled, juvenilesCulled, breedersCulled: excess - adultsCulled - juvenilesCulled, herdAfter: adults + juveniles - excess };
    }),
  ] },
  { name: 'signalplan', note: 'Offline signal-line, delay, and clock arithmetic from supplied ranges, component delays, and periods in caller-chosen ticks. No circuit behavior or game timing is inferred.', commands: [
    command("booster-count <wire-cells> <range>", ["c", "s"], "Count the boosters a line of wire-cells wire cells needs so that no run exceeds range wire cells, which is wire-cells divided by range, rounded up, minus one, and zero for a line of zero wire cells.", signalBoosters),
    command("line-timing <wire-cells> <range> <booster-delay> <cell-delay>", ["c", "s", "q", "q"], "Report totalCells (wire-cells plus the booster-count boosters, each occupying one extra cell) and delay (those boosters times booster-delay plus wire-cells times cell-delay) for a line built with the fewest boosters.", (wire, range, boosterDelay, cellDelay) => ({
      totalCells: wire + signalBoosters(wire, range),
      delay: signalLineDelay(wire, range, boosterDelay, cellDelay),
    })),
    command("longest-line <latency-budget> <range> <booster-delay> <cell-delay>", ["q", "s", "q", "p"], "Find the largest whole number of wire cells, possibly zero, whose line-timing delay with the fewest boosters for the range is at most the latency budget, rejecting a latency budget divided by cell-delay above 1,000,000,000,000.", signalLongestLine),
    command("strength-after <source-strength> <loss-per-cell> <cells>", ["q", "q", "c"], "Report the signal strength after cells wire cells without boosters, which is source-strength minus cells times loss-per-cell, or zero when that is negative.", (strength, loss, cells) => Math.max(0, strength - cells * loss)),
    command("reach-cells <source-strength> <loss-per-cell> <minimum-strength>", ["q", "p", "q"], "Find the most wire cells, possibly zero, after which source-strength minus cells times loss-per-cell, not clamped at zero, is still at least minimum-strength, which is source-strength minus minimum-strength, divided by loss-per-cell, rounded down, rejecting a minimum above the source strength.", (strength, loss, minimum) => {
      demand(minimum <= strength, 'Minimum strength cannot exceed the source strength.');
      return signalReach(strength, loss, minimum);
    }),
    command("path-padding <path-delays> <extra-margin>", ["L", "q"], "List, for each path in input order, the delay to add so that every path arrives together extra-margin after the slowest one, which is the largest path delay plus extra-margin minus that path delay.", (delays, margin) => {
      const slowest = Math.max(...delays);
      return delays.map(delay => slowest - delay + margin);
    }),
    command("clock-align <path-delays> <clock-period>", ["C", "s"], "List, for each whole path delay in input order, the fewest whole ticks of padding, from zero to clock-period minus one, that make the padded delay a whole multiple of clock-period.", (delays, period) => delays.map(delay => (period - delay % period) % period)),
    command("clock-shape <high-ticks> <low-ticks> <ticks-per-second>", ["s", "s", "p"], "Report period (high-ticks plus low-ticks), dutyCycle (high-ticks divided by period), and frequency (ticks-per-second divided by period, in cycles per second) of a clock that is high for high-ticks ticks and then low for low-ticks ticks.", (high, low, perSecond) => ({ period: high + low, dutyCycle: high / (high + low), frequency: perSecond / (high + low) })),
    command("high-tick-count <period> <high-ticks> <phase> <window-start> <window-end>", ["s", "c", "c", "c", "c"], "Count the ticks t from window-start to window-end inclusive at which a clock is high, which is when t minus phase, taken modulo period in 0 to period minus one, is below high-ticks, rejecting high-ticks above the period and a window start after its end.", signalHighTicks),
    command("common-period <periods>", ["S"], "Find the first positive tick at which clocks with the listed whole periods, all firing at tick zero, fire together again, which is their least common multiple, rejecting a result above 9,007,199,254,740,991.", signalCommonPeriod),
    command("first-coincidence <first-period> <first-phase> <second-period> <second-phase>", ["s", "c", "s", "c"], "Report tick (the earliest tick at which both clocks fire, each firing at its phase plus every whole multiple, zero or more, of its period) and repeatEvery (the least common multiple of the periods, the spacing of every later shared tick), or null when the clocks never fire together.", signalFirstCoincidence),
    command("divider-outputs <input-pulses> <divisors> <start-counts>", ["c", "S", "C"], "List, for each divider of a chain in order, the pulses it emits when the first divider receives input-pulses pulses and each later divider receives the output of the one before, where a divider with a start count emits one pulse each time its count, starting at start-count and raised by one per input pulse, reaches its divisor and then restarts from zero, so its output is input plus start-count, divided by divisor, rounded down, rejecting a start count not below its divisor and lists of different lengths.", (pulses, divisors, starts) => {
      same(divisors, starts);
      demand(starts.every((start, i) => start < divisors[i]), 'Each start count must be below its divisor.');
      let input = pulses;
      return divisors.map((divisor, i) => (input = Math.floor((input + starts[i]) / divisor)));
    }),
    command("period-for-rate <items-per-second> <items-per-pulse> <ticks-per-second>", ["p", "p", "p"], "Find the longest whole clock period in ticks at which items-per-pulse items every period still moves at least items-per-second, which is items-per-pulse times ticks-per-second divided by items-per-second, rounded down, or null when that is below one.", (rate, perPulse, perSecond) => {
      const period = wholeFloor(perPulse * perSecond / rate);
      return period >= 1 ? period : null;
    }),
    command("counter-delay <delay-ticks> <clock-period> <base>", ["q", "p", "s"], "Report pulses (delay-ticks divided by clock-period, rounded up, the clock pulses a counting delay waits), digits (the digits-for-states count for pulses states in the base), and actualDelay (pulses times clock-period), rejecting a base below 2 and pulses above 1,000,000,000,000.", (delay, period, base) => {
      signalBase(base);
      const pulses = wholeCeil(delay / period);
      demand(pulses <= 1e12, 'Delay divided by clock period is limited to 1,000,000,000,000 pulses.');
      return { pulses, digits: signalDigits(pulses, base), actualDelay: pulses * period };
    }),
    command("counter-wrap <digits> <base> <pulses>", ["s", "s", "c"], "Report value (the reading of a counter of digits digits in the base, starting at zero, after pulses pulses, which is pulses modulo the capacity base to the power of digits) and wraps (pulses divided by that capacity, rounded down), rejecting a base below 2 and a capacity above 9,007,199,254,740,991.", (digits, base, pulses) => {
      signalBase(base);
      const capacity = signalCapacity(digits, base);
      return { value: pulses % capacity, wraps: Math.floor(pulses / capacity) };
    }),
    command("digits-for-states <states> <base>", ["s", "s"], "Find the fewest digits in the base that can represent states distinct states, which is the smallest whole d, possibly zero, for which base to the power of d is at least states, rejecting a base below 2.", (states, base) => { signalBase(base); return signalDigits(states, base); }),
    command("digit-encode <value> <base> <width>", ["c", "s", "s"], "List the width digits of a value in the base, most significant first and padded with leading zeros, rejecting a base below 2, a width above 1000, and a value of base to the power of width or more.", (value, base, width) => { signalBase(base); return signalEncode(value, base, width); }),
    command("gray-code <value>", ["c"], "Report the reflected binary Gray code of a value as a number, which is the bitwise exclusive-or of the value and the value divided by two, rounded down.", value => value ^ Math.floor(value / 2)),
    command("parity-bit <bits>", ["C"], "Report ones (the count of 1 entries in a list of bits) and parityBit (ones modulo two, the bit that makes the total count of ones even), rejecting entries other than 0 and 1.", bits => {
      signalBits(bits, 'Bits');
      const ones = sum(bits);
      return { ones, parityBit: ones % 2 };
    }),
    command("hamming-distance <first-digits> <second-digits>", ["C", "C"], "Count the positions at which two equally long lists of whole digits hold different values, rejecting lists of different lengths.", (first, second) => {
      same(first, second);
      return first.filter((digit, i) => digit !== second[i]).length;
    }),
    command("edges <samples>", ["C"], "Report rising (the zero-based indexes of samples that are 1 while the sample before is 0) and falling (the zero-based indexes of samples that are 0 while the sample before is 1), both in increasing order, for a list of 0 and 1 samples, one per tick, preceded by a low signal, rejecting entries other than 0 and 1.", samples => {
      signalBits(samples, 'Samples');
      const rising = [], falling = [];
      samples.forEach((sample, i) => {
        const before = i ? samples[i - 1] : 0;
        if (sample > before) rising.push(i); else if (sample < before) falling.push(i);
      });
      return { rising, falling };
    }),
    command("debounce <event-ticks> <hold-ticks>", ["C", "c"], "List, in order, the ticks of the accepted events of a nondecreasing list of whole event ticks, where the first event is accepted and each later event is accepted only when its tick is at least hold-ticks after the tick of the last accepted event, rejecting a decreasing list.", (ticks, hold) => {
      demand(ticks.every((tick, i) => i === 0 || tick >= ticks[i - 1]), 'Event ticks must be nondecreasing.');
      const accepted = [];
      for (const tick of ticks) if (!accepted.length || tick - accepted.at(-1) >= hold) accepted.push(tick);
      return accepted;
    }),
    command("sequencer-step <step-durations> <tick>", ["S", "c"], "Report step (the one-based step active at a tick of a sequencer that starts step one at tick zero and repeats its listed whole step durations forever), tickInStep (the ticks since that step began), and ticksToNext (the ticks until the next step begins).", signalStep),
    command("level-for-fill <filled> <capacity> <top-level>", ["c", "s", "s"], "Report the whole level of a store holding filled units of capacity, which is zero when empty and otherwise one plus filled times (top-level minus one) divided by capacity, rounded down, so a full store reaches top-level, rejecting filled above capacity.", (filled, capacity, top) => {
      demand(filled <= capacity, 'Filled units cannot exceed the capacity.');
      return filled ? 1 + Math.floor(filled * (top - 1) / capacity) : 0;
    }),
    command("fill-for-level <level> <capacity> <top-level>", ["c", "s", "s"], "Find the fewest filled units whose level-for-fill level is at least level, which is the level itself for level zero or one and otherwise (level minus one) times capacity divided by (top-level minus one), rounded up, rejecting a level above top-level.", (level, capacity, top) => {
      demand(level <= top, 'Level cannot exceed the top level.');
      return level <= 1 ? level : Math.ceil((level - 1) * capacity / (top - 1));
    }),
  ] },
  { name: 'linkplan', note: 'Offline planning for two coordinate frames related by a supplied positive scale. Points use [x,z] rows; no link, portal, or travel behavior is predicted.', commands: [
    linkCommand("to-compact <wide-points> <scale>", ["points2", "p"], "List the compact image [x divided by scale, z divided by scale] of each wide point in input order.", (points, scale) => points.map(p => linkImage(p, scale))),
    linkCommand("compact-cells <wide-points> <scale>", ["points2", "p"], "List the compact cell [floor(x divided by scale), floor(z divided by scale)] of each wide point in input order.", (points, scale) => points.map(p => linkCell(p, scale))),
    linkCommand("cell-offsets <wide-points> <scale>", ["points2", "p"], "List, for each wide point in input order, its offset [x minus floor(cellX times scale), z minus floor(cellZ times scale)] from the wide column where the minimum corner of its compact cell [cellX, cellZ] maps back, each offset raised to zero if roundoff makes it negative.", (points, scale) => points.map(p => {
      const cell = linkCell(p, scale);
      return p.map((v, axis) => Math.max(0, v - wholeFloor(cell[axis] * scale)));
    })),
    linkCommand("cell-margins <wide-points> <scale>", ["points2", "p"], "List, for each wide point in input order, the wide distance to the nearest edge of its compact cell [cellX, cellZ], the smallest of x minus cellX times scale, (cellX plus one) times scale minus x, and the same two for z, raised to zero if roundoff makes it negative.", (points, scale) => points.map(p => {
      const cell = linkCell(p, scale);
      return Math.max(0, Math.min(...p.flatMap((v, axis) => [v - cell[axis] * scale, (cell[axis] + 1) * scale - v])));
    })),
    linkCommand("landing-columns <compact-points> <scale>", ["points2", "p"], "List, for each compact point in input order, an object with landing, the wide column [floor(x times scale), floor(z times scale)], and stable, true when the compact cell of that landing column equals the compact point's own cell [floor(x), floor(z)] on both axes.", (points, scale) => points.map(p => {
      const landing = p.map(v => wholeFloor(v * scale));
      const back = linkCell(landing, scale), own = linkFloor(p);
      return { landing, stable: back[0] === own[0] && back[1] === own[1] };
    })),
    linkCommand("cell-footprint <wide-point> <scale> <search-radius>", ["points2", "p", "c"], "For one wide point, report cell (its compact cell [cellX, cellZ]), the inclusive wide column ranges minX, maxX, minZ, and maxZ whose compact cells lie within search-radius cells of it on both axes, where minX is ceil((cellX minus search-radius) times scale) and maxX is ceil((cellX plus search-radius plus one) times scale) minus one and likewise for z, and columns, the count of whole columns in that rectangle (zero when a range is empty).", (rows, scale, radius) => {
      linkRows(rows, 1, 'The wide point');
      const cell = linkCell(rows[0], scale);
      const [minX, minZ] = cell.map(c => wholeCeil((c - radius) * scale));
      const [maxX, maxZ] = cell.map(c => wholeCeil((c + radius + 1) * scale) - 1);
      return { cell, minX, maxX, minZ, maxZ, columns: Math.max(0, maxX - minX + 1) * Math.max(0, maxZ - minZ + 1) };
    }),
    linkCommand("cell-span <wide-points> <scale>", ["points2", "p"], "Report the smallest rectangle of compact cells containing the compact cell of every wide point as minCell [smallest cellX, smallest cellZ], maxCell [largest cellX, largest cellZ], and cells, its whole cell count with both ends inclusive.", (points, scale) => {
      const cells = points.map(p => linkCell(p, scale));
      const minCell = [0, 1].map(axis => Math.min(...cells.map(c => c[axis])));
      const maxCell = [0, 1].map(axis => Math.max(...cells.map(c => c[axis])));
      return { minCell, maxCell, cells: (maxCell[0] - minCell[0] + 1) * (maxCell[1] - minCell[1] + 1) };
    }),
    linkCommand("shared-cells <wide-points> <scale>", ["points2", "p"], "List, for each compact cell that is the compact cell of two or more wide points, the increasing one-based indexes of those points, with groups ordered by their first index.", (points, scale) => {
      const groups = new Map();
      points.forEach((p, i) => {
        const key = linkCell(p, scale).join(',');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(i + 1);
      });
      return [...groups.values()].filter(group => group.length > 1);
    }),
    linkCommand("pair-alignment <wide-links> <compact-links> <scale>", ["points2", "points2", "p"], "Pair wide links with compact links by position in equal-length lists and report offsets, for each pair in input order the compact link cell [floor(x), floor(z)] minus the wide link's compact cell, and aligned, the number of pairs whose offset is [0, 0].", (wide, compact, scale) => {
      same(wide, compact);
      const offsets = wide.map((p, i) => { const a = linkCell(p, scale), b = linkFloor(compact[i]); return [b[0] - a[0], b[1] - a[1]]; });
      return { offsets, aligned: offsets.filter(([dx, dz]) => dx === 0 && dz === 0).length };
    }),
    linkCommand("tunnel-cells <endpoints> <scale>", ["points2", "p"], "For exactly two wide points, report cellsX and cellsZ, the absolute differences between their compact cells on each axis, and tunnelCells, cellsX plus cellsZ plus one, the cells of an L-shaped tunnel one cell wide joining the two cells with both end cells included.", (rows, scale) => {
      linkRows(rows, 2, 'The endpoints');
      const [a, b] = rows.map(p => linkCell(p, scale));
      const cellsX = Math.abs(a[0] - b[0]), cellsZ = Math.abs(a[1] - b[1]);
      return { cellsX, cellsZ, tunnelCells: cellsX + cellsZ + 1 };
    }),
    linkCommand("linked-trip <stops> <scale> <wide-speed> <compact-speed> <transfer-time>", ["points2", "p", "p", "p", "q"], "For exactly four wide points start, entrance, exit, and destination, report walkInTime (start to entrance distance over wide-speed), compactTime (compact distance from entrance to exit over compact-speed), walkOutTime (exit to destination distance over wide-speed), linkedTime (those three plus transfer-time, added in that order), directTime (start to destination distance over wide-speed), and savedTime (directTime minus linkedTime, negative when linking is slower).", (rows, scale, wideSpeed, compactSpeed, transfer) => {
      linkRows(rows, 4, 'The stops');
      const [start, entrance, exit, destination] = rows;
      const walkInTime = linkHypot(start, entrance) / wideSpeed;
      const compactTime = linkCompactDistance(entrance, exit, scale) / compactSpeed;
      const walkOutTime = linkHypot(exit, destination) / wideSpeed;
      const linkedTime = walkInTime + compactTime + walkOutTime + transfer;
      const directTime = linkHypot(start, destination) / wideSpeed;
      return { walkInTime, compactTime, walkOutTime, linkedTime, directTime, savedTime: directTime - linkedTime };
    }),
    linkCommand("best-link-pair <endpoints> <link-sites> <scale> <overhead>", ["points2", "points2", "p", "q"], "For exactly two wide endpoints (start, destination) and at least two wide link sites, choose the ordered pair of different sites minimizing linked distance, the start to entrance distance plus the compact distance from entrance to exit plus the exit to destination distance plus overhead (added in that order), with ties to the lowest entrance and then the lowest exit, and report entrance and exit (one-based site indexes), linkedDistance, directDistance (start to destination), and linkPays (linkedDistance strictly less than directDistance).", (rows, sites, scale, overhead) => {
      linkRows(rows, 2, 'The endpoints');
      demand(sites.length >= 2, 'Supply at least two link sites.');
      const [start, destination] = rows;
      const walkIn = sites.map(site => linkHypot(start, site)), walkOut = sites.map(site => linkHypot(site, destination));
      let entrance = -1, exit = -1, linkedDistance = Infinity;
      for (let a = 0; a < sites.length; a++) {
        for (let b = 0; b < sites.length; b++) {
          if (a === b) continue;
          const cost = walkIn[a] + linkCompactDistance(sites[a], sites[b], scale) + walkOut[b] + overhead;
          if (cost < linkedDistance) { entrance = a; exit = b; linkedDistance = cost; }
        }
      }
      const directDistance = linkHypot(start, destination);
      return { entrance: entrance + 1, exit: exit + 1, linkedDistance, directDistance, linkPays: linkedDistance < directDistance };
    }),
    linkCommand("break-even <scale> <overhead>", ["p", "q"], "Find the direct wide distance at which travelling that distance divided by scale plus overhead equals travelling it directly, overhead times scale divided by (scale minus one), rejecting a scale of one or less.", (scale, overhead) => {
      demand(scale > 1, 'Scale must be greater than 1 for linking to shorten a trip.');
      return overhead * scale / (scale - 1);
    }),
    linkCommand("mixed-route <wide-points> <scale> <overhead>", ["points2", "p", "q"], "For two or more ordered wide stops, link the leg from stop k to stop k plus one when its compact distance plus overhead is strictly less than its wide distance and walk it otherwise, and report linkedLegs (the increasing one-based leg indexes k that link) and total (the sum in leg order of each leg's chosen cost, its compact distance plus overhead when linked and its wide distance when walked).", (points, scale, overhead) => {
      demand(points.length >= 2, 'Supply at least two stops.');
      const linkedLegs = [];
      let total = 0;
      for (let k = 1; k < points.length; k++) {
        const direct = linkHypot(points[k - 1], points[k]), linked = linkCompactDistance(points[k - 1], points[k], scale) + overhead;
        if (linked < direct) linkedLegs.push(k);
        total += Math.min(direct, linked);
      }
      return { linkedLegs, total };
    }),
    linkCommand("relay-legs <endpoints> <scale> <max-leg>", ["points2", "p", "p"], "For exactly two wide points, report compactDistance (their compact distance), legs (compactDistance divided by max-leg, rounded up, zero for coincident points), relays (legs minus one, never below zero), and legLength (compactDistance divided by legs, zero when legs is zero).", (rows, scale, maxLeg) => {
      linkRows(rows, 2, 'The endpoints');
      const compactDistance = linkCompactDistance(rows[0], rows[1], scale), legs = wholeCeil(compactDistance / maxLeg);
      return { compactDistance, legs, relays: Math.max(0, legs - 1), legLength: legs ? compactDistance / legs : 0 };
    }),
    linkCommand("safe-separation <scale> <search-radius>", ["p", "c"], "Find the smallest whole wide separation along one axis that keeps two compact cells more than search-radius cells apart on that axis wherever the first point sits, which is (search-radius plus one) times scale, rounded up.", (scale, radius) => wholeCeil((radius + 1) * scale)),
    linkCommand("collisions <wide-points> <scale> <search-radius>", ["points2", "p", "c"], "List one-based index pairs [i, j] with i less than j, ordered by i then j, of wide points whose compact cells are at most search-radius cells apart on both axes, rejecting more than 1000 pairs.", (points, scale, radius) => {
      const cells = points.map(p => linkCell(p, scale)), pairs = [];
      for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
          if (linkCellGap(cells[i], cells[j]) > radius) continue;
          pairs.push([i + 1, j + 1]);
          demand(pairs.length <= 1000, 'Collision lists are limited to 1000 pairs.');
        }
      }
      return pairs;
    }),
    linkCommand("link-matching <wide-links> <compact-links> <scale> <compact-radius> <wide-radius>", ["points2", "points2", "p", "c", "c"], "Report forward, for each wide link in input order the one-based compact link nearest its compact image among compact links whose cell [floor(x), floor(z)] is within compact-radius cells of its compact cell on both axes, backward, for each compact link in input order the one-based wide link nearest its wide image [x times scale, z times scale] among wide links whose wide column is within wide-radius columns of its landing column [floor(x times scale), floor(z times scale)] on both axes (each entry null when no candidate qualifies, ties to the lowest index), and mutualPairs, the count of wide links whose forward match has that wide link as its backward match.", (wide, compact, scale, compactRadius, wideRadius) => {
      const wideCells = wide.map(p => linkCell(p, scale)), wideColumns = wide.map(linkFloor), compactCells = compact.map(linkFloor);
      const forward = wide.map((p, i) => {
        const image = linkImage(p, scale);
        const j = linkNearest(compact.length, j => linkCellGap(compactCells[j], wideCells[i]) <= compactRadius, j => linkHypot(image, compact[j]));
        return j < 0 ? null : j + 1;
      });
      const backward = compact.map(c => {
        const image = c.map(v => v * scale), landing = image.map(wholeFloor);
        const i = linkNearest(wide.length, i => linkCellGap(wideColumns[i], landing) <= wideRadius, i => linkHypot(image, wide[i]));
        return i < 0 ? null : i + 1;
      });
      return { forward, backward, mutualPairs: forward.filter((j, i) => j !== null && backward[j - 1] === i + 1).length };
    }),
    linkCommand("spokes <wide-points> <compact-hub> <scale>", ["points2", "points2", "p"], "For one compact hub point, report lengths (the distance from the hub to each wide point's compact image in input order), total (their sum in input order), longest (the largest length), and farthest (the lowest one-based index attaining it).", (points, hubRows, scale) => {
      linkRows(hubRows, 1, 'The compact hub');
      const lengths = points.map(p => linkHypot(linkImage(p, scale), hubRows[0])), longest = Math.max(...lengths);
      return { lengths, total: sum(lengths), longest, farthest: lengths.indexOf(longest) + 1 };
    }),
    linkCommand("hub-assign <wide-points> <compact-hubs> <scale>", ["points2", "points2", "p"], "Assign each wide point to the compact hub nearest its compact image, ties to the lowest hub index, and report hubs (the one-based hub index of each point in input order) and loads (the number of points assigned to each hub in hub order, zeros included).", (points, hubs, scale) => {
      const assigned = points.map(p => { const image = linkImage(p, scale); return linkNearest(hubs.length, () => true, h => linkHypot(image, hubs[h])) + 1; });
      return { hubs: assigned, loads: hubs.map((h, k) => assigned.filter(a => a === k + 1).length) };
    }),
    linkCommand("trunk-network <wide-points> <compact-hub> <scale>", ["points2", "points2", "p"], "For one compact hub point, report trunk (the length of a straight trunk along x at the hub z from the smallest to the largest x among the hub and every wide point's compact image), branches (the sum of the absolute z differences between each compact image and the hub, in input order), and total (trunk plus branches).", (points, hubRows, scale) => {
      linkRows(hubRows, 1, 'The compact hub');
      const [hx, hz] = hubRows[0], images = points.map(p => linkImage(p, scale));
      const xs = [hx, ...images.map(([x]) => x)];
      const trunk = Math.max(...xs) - Math.min(...xs), branches = sum(images.map(([, z]) => Math.abs(z - hz)));
      return { trunk, branches, total: trunk + branches };
    }),
    linkCommand("spanning-network <wide-points> <scale>", ["points2", "p"], "Build a minimum spanning network on the compact images by Prim's method from point one, each step adding the unconnected point with the smallest compact distance to any connected point (ties to the lowest index) joined to the lowest-indexed connected point at that distance, and report edges ([connected, added] one-based pairs in the order added) and total (the sum of their compact lengths in that order).", (points, scale) => linkSpanningNetwork(points, scale)),
    linkCommand("errand-plan <wide-points> <compact-hub> <scale> <overhead> <budget>", ["points2", "points2", "p", "q", "q"], "From one compact hub point, cost each wide point as twice the distance from the hub to its compact image plus overhead, visit points in increasing cost order (ties to the lower index) while the running cost stays within budget, stopping at the first that does not fit, and report visits (one-based indexes in visit order) and used (the running cost of those visits).", (points, hubRows, scale, overhead, budget) => {
      linkRows(hubRows, 1, 'The compact hub');
      const costs = points.map((p, i) => ({ index: i + 1, cost: 2 * linkHypot(linkImage(p, scale), hubRows[0]) + overhead }));
      costs.sort((a, b) => a.cost - b.cost || a.index - b.index);
      const visits = [];
      let used = 0;
      for (const { index, cost } of costs) {
        if (!budgetFits(used + cost, budget)) break;
        used += cost;
        visits.push(index);
      }
      return { visits, used };
    }),
    linkCommand("coverage-sites <wide-width> <wide-depth> <scale> <compact-spacing>", ["p", "p", "p", "p"], "Count the link sites on a square compact grid of compact-spacing, each serving a wide square of side compact-spacing times scale, that cover a wide rectangle, reporting alongX (wide-width divided by that side, rounded up), alongZ (wide-depth divided by that side, rounded up), and sites (their product).", (width, depth, scale, spacing) => {
      const side = spacing * scale, alongX = wholeCeil(width / side), alongZ = wholeCeil(depth / side);
      return { alongX, alongZ, sites: alongX * alongZ };
    }),
    linkCommand("coverage-check <wide-points> <compact-sites> <scale> <compact-radius>", ["points2", "points2", "p", "q"], "Split wide points by whether their compact image lies within compact-radius, inclusive, of at least one compact site, reporting covered and uncovered as increasing one-based index lists.", (points, sites, scale, radius) => {
      const covered = [], uncovered = [];
      points.forEach((p, i) => {
        const image = linkImage(p, scale);
        (sites.some(site => budgetFits(linkHypot(image, site), radius)) ? covered : uncovered).push(i + 1);
      });
      return { covered, uncovered };
    }),
  ] },
];
