import { demand, sum, same, sequence } from './offline-kit.js';
import { wholeCeil, wholeFloor, budgetFits } from './resource-rounding.js';

// Batch 13 structure planners. Every quantity is caller supplied; nothing here
// reads a world, encodes a game rule, or executes an action.
const command = (signature, types, description, run) => ({ signature, types, description, run });

// stairplan helpers. A count derived from a real quotient stays within the
// kit's scalar range so a tiny divisor fails with a clear message.
const stairCount = (value) => {
  demand(value <= 1e6, 'Computed counts are limited to 1,000,000.');
  return value;
};
// Shared by stairplan and warehouse. Round down a quotient of a difference of
// inputs, whose subtraction roundoff scales with the inputs rather than the
// quotient and can leave the floor one unit off. The roundoff-tolerant limit test fits(n) settles that one unit: the
// count rises by one when the quotient lies within a half below the next whole
// number and that number fits, and falls by one when the floor does not fit.
// Moving by at most one unit keeps a divisor below the inputs' roundoff from
// inventing counts. fits(0) is known to pass.
function fitFloor(quotient, fits) {
  const n = wholeFloor(quotient);
  if (n > 0 && !fits(n)) return n - 1;
  return quotient > n + 0.5 && fits(n + 1) ? n + 1 : n;
}
// Treat only floating-point roundoff at an arithmetic equality as zero.
const stairGap = (a, b) => (budgetFits(a, b) && budgetFits(b, a) ? 0 : a - b);
const stairDegrees = (ratio) => (Math.atan(ratio) * 180) / Math.PI;
// Whole inputs: the fewest flights holding at most `maximum` risers each.
const stairFlights = (risers, maximum) => Math.ceil(risers / maximum);
const stairGcd = (a, b) => {
  while (b) [a, b] = [b, a % b];
  return a;
};

// roundplan helpers. Cell centers sit at half-cell offsets, so every test runs
// on doubled offsets u = 2i + 1 - size, which keeps the arithmetic whole and exact.
const roundPlanar = (...sizes) =>
  demand(
    sizes.every((size) => size <= 1000),
    'Planar sizes are limited to 1000 cells.',
  );
const roundSolid = (...sizes) =>
  demand(
    sizes.every((size) => size <= 120),
    'Three-dimensional sizes are limited to 120 cells.',
  );
// Map every cell index of one axis to fn(doubled offset).
const roundAxis = (size, fn) => Array.from({ length: size }, (_, index) => fn(2 * index + 1 - size));
// Largest whole root with root * root * denominator <= numerator (numerator >= 0).
function roundRoot(numerator, denominator) {
  let root = Math.floor(Math.sqrt(numerator / denominator));
  while (root * root * denominator > numerator) root--;
  while ((root + 1) * (root + 1) * denominator <= numerator) root++;
  return root;
}
// Cells of one row of a size-wide grid whose doubled offset u satisfies
// u * u * denominator <= numerator; the cells form one centered span.
function roundSpan(size, numerator, denominator = 1) {
  const parity = (size - 1) % 2;
  if (!(numerator >= parity * denominator)) return 0;
  const root = Math.min(roundRoot(numerator, denominator), size - 1);
  return root - ((root - parity) % 2) + 1;
}
const roundDiscRows = (diameter) => roundAxis(diameter, (v) => roundSpan(diameter, diameter * diameter - v * v));
const roundDisc = (diameter) => sum(roundDiscRows(diameter));
const roundEllipseRows = (width, depth) =>
  roundAxis(depth, (v) => roundSpan(width, width * width * (depth * depth - v * v), depth * depth));
const roundSphere = (diameter) =>
  roundAxis(diameter, (w) => roundAxis(diameter, (v) => roundSpan(diameter, diameter * diameter - w * w - v * v)));
// Cells per row that keep every orthogonal neighbor. Rows are centered spans of
// one parity, so the kept cells of a row are the narrowest span among the row
// less its two end cells, the adjacent rows, and the same row of each cover layer.
const roundCore = (rows, ...covers) =>
  rows.map((cells, row) =>
    Math.max(
      0,
      Math.min(cells - 2, rows[row - 1] ?? 0, rows[row + 1] ?? 0, ...covers.map((cover) => cover?.[row] ?? 0)),
    ),
  );
const roundOutline = (rows) => sum(rows) - sum(roundCore(rows));
const roundShell = (layers) =>
  layers.map((rows, layer) => sum(rows) - sum(roundCore(rows, layers[layer - 1], layers[layer + 1])));

// rampart helpers. Battlement inputs are whole cells, so the merlon pattern is
// exact integer arithmetic: m merlons and m - 1 crenels fill m*M + (m-1)*C cells.
function rampartMerlons(length, merlon, crenel) {
  demand(merlon <= length, 'The wall is shorter than one merlon.');
  const merlons = Math.floor((length + crenel) / (merlon + crenel));
  return { merlons, crenels: merlons - 1, leftover: length - merlons * merlon - (merlons - 1) * crenel };
}
const rampartDegrees = (radians) => (radians * 180) / Math.PI;
// Cells in one course of a rectangular ring wall `thickness` cells thick.
// Equal to width * depth minus the inner rectangle, without the large products
// that lose whole cells above 2^53.
const rampartRing = (width, depth, thickness) => 2 * thickness * (width + depth - 2 * thickness);

// warehouse helpers. Halls are double-loaded aisles of bays and levels; walking
// inputs are whole, so every distance is an exact multiple of one half.
const warehouseCount = (value) => {
  demand(value <= 1e6, 'Computed counts are limited to 1,000,000.');
  return value;
};
// Treat only floating-point roundoff at an arithmetic equality as zero.
const warehouseGap = (a, b) => (budgetFits(a, b) && budgetFits(b, a) ? 0 : a - b);
// Exact floor and ceiling quotients of whole numbers (numerator >= 0, divisor > 0).
function warehouseFloor(numerator, divisor) {
  let quotient = Math.floor(numerator / divisor);
  if (quotient * divisor > numerator) quotient--;
  else if ((quotient + 1) * divisor <= numerator) quotient++;
  return quotient;
}
const warehouseCeil = (numerator, divisor) => warehouseFloor(numerator + divisor - 1, divisor);
const warehouseIndex = (aisle, side, bay, level, bays, levels) =>
  (((aisle - 1) * 2 + side - 1) * bays + bay - 1) * levels + level;
// Twice the one-way walk from the door to bay `bay` of aisle `aisle`.
const warehouseWalk2 = (aisle, bay, door, aislePitch, bayPitch) =>
  2 * door + 2 * (aisle - 1) * aislePitch + (2 * bay - 1) * bayPitch;
// Distinct pick aisles in ascending order with the deepest listed bay of each.
function warehouseAisles(aisles, bays) {
  same(aisles, bays);
  const deepest = new Map();
  aisles.forEach((aisle, i) => deepest.set(aisle, Math.max(deepest.get(aisle) ?? 0, bays[i])));
  return [...deepest].sort((x, y) => x[0] - y[0]);
}
// Indexes of item types by picks descending, ties in list order.
const warehouseRank = (picks) => picks.map((_, i) => i).sort((i, j) => picks[j] - picks[i] || i - j);

export const STRUCTURE_GROUPS = [
  {
    name: 'stairplan',
    note: 'Offline stair, ladder, and ramp arithmetic from supplied rises, runs, and widths. Step sizes are caller assumptions; no terrain, collision, or movement rule is checked.',
    commands: [
      command(
        'riser-count <total-rise> <maximum-rise>',
        ['p', 'p'],
        'Find the fewest equal risers that climb total-rise with no riser taller than maximum-rise, returning {risers, rise} where risers is total-rise divided by maximum-rise rounded up and rise is total-rise divided by risers.',
        (total, maximum) => {
          const risers = Math.max(1, stairCount(wholeCeil(total / maximum)));
          return { risers, rise: total / risers };
        },
      ),
      command(
        'riser-options <total-rise> <minimum-rise> <maximum-rise>',
        ['p', 'p', 'p'],
        'Bound the whole numbers of equal risers whose rise lies between minimum-rise and maximum-rise inclusive, returning {fewest, most} where fewest is total-rise divided by maximum-rise rounded up and most is total-rise divided by minimum-rise rounded down, or null when fewest exceeds most.',
        (total, minimum, maximum) => {
          demand(minimum <= maximum, 'Minimum rise must not exceed maximum rise.');
          const fewest = Math.max(1, stairCount(wholeCeil(total / maximum))),
            most = stairCount(wholeFloor(total / minimum));
          return fewest > most ? null : { fewest, most };
        },
      ),
      command(
        'flight-size <risers> <rise> <run>',
        ['s', 'p', 'p'],
        'Measure one flight, returning {treads, totalRise, totalRun, stringerLength, pitchDegrees} where treads is risers minus one, totalRise is risers times rise, totalRun is treads times run, stringerLength is the straight distance from the foot of the first riser to the top nosing, and pitchDegrees is the arctangent of rise divided by run.',
        (risers, rise, run) => {
          const treads = risers - 1,
            totalRise = risers * rise,
            totalRun = treads * run;
          return {
            treads,
            totalRise,
            totalRun,
            stringerLength: Math.hypot(totalRise, totalRun),
            pitchDegrees: stairDegrees(rise / run),
          };
        },
      ),
      command(
        'flight-in-run <available-run> <rise> <run>',
        ['q', 'p', 'p'],
        'Find the tallest flight whose own treads fit in available-run, returning {risers, totalRise} where risers is one more than available-run divided by run rounded down and totalRise is risers times rise.',
        (available, rise, run) => {
          const risers = stairCount(wholeFloor(available / run) + 1);
          return { risers, totalRise: risers * rise };
        },
      ),
      command(
        'comfort-check <rise> <run> <minimum-stride> <maximum-stride>',
        ['p', 'p', 'q', 'p'],
        'Test the stride rule, returning {stride, fits} where stride is run plus twice rise and fits is true when stride lies between minimum-stride and maximum-stride inclusive.',
        (rise, run, minimum, maximum) => {
          demand(minimum <= maximum, 'Minimum stride must not exceed maximum stride.');
          const stride = 2 * rise + run;
          return { stride, fits: budgetFits(minimum, stride) && budgetFits(stride, maximum) };
        },
      ),
      command(
        'comfort-runs <rise> <minimum-stride> <maximum-stride>',
        ['p', 'q', 'p'],
        'Solve the stride rule for run, returning {minimumRun, maximumRun} where maximumRun is maximum-stride minus twice rise and minimumRun is minimum-stride minus twice rise but never below zero, or null when maximumRun is not positive.',
        (rise, minimum, maximum) => {
          demand(minimum <= maximum, 'Minimum stride must not exceed maximum stride.');
          const maximumRun = stairGap(maximum, 2 * rise);
          return maximumRun <= 0 ? null : { minimumRun: Math.max(0, stairGap(minimum, 2 * rise)), maximumRun };
        },
      ),
      command(
        'flight-split <risers> <maximum-per-flight>',
        ['s', 's'],
        'Split risers into the fewest flights of at most maximum-per-flight risers with sizes that differ by at most one, returning {flights, landings, risersPerFlight} where landings is flights minus one and the list runs bottom to top with the larger flights first; at most 1000 flights.',
        (risers, maximum) => {
          const flights = stairFlights(risers, maximum);
          demand(flights <= 1000, 'Splits are limited to 1000 flights.');
          const base = Math.floor(risers / flights),
            extra = risers % flights;
          return {
            flights,
            landings: flights - 1,
            risersPerFlight: sequence(flights, (i) => base + (i < extra ? 1 : 0)),
          };
        },
      ),
      command(
        'landing-levels <flight-risers> <rise>',
        ['S', 'p'],
        'List the height above the lower floor reached at the top of each listed flight, in the supplied bottom-to-top order, as the running total of risers times rise, so the last entry is the upper floor.',
        (flights, rise) => {
          let risers = 0;
          return flights.map((count) => (risers += count) * rise);
        },
      ),
      command(
        'straight-run <risers> <maximum-per-flight> <tread-run> <landing-depth>',
        ['s', 's', 'p', 'q'],
        'Measure a straight stair broken by landings into the fewest flights of at most maximum-per-flight risers, returning {flights, landings, treads, totalRun} where landings is flights minus one, treads is risers minus flights, and totalRun is treads times tread-run plus landings times landing-depth.',
        (risers, maximum, run, depth) => {
          const flights = stairFlights(risers, maximum),
            landings = flights - 1,
            treads = risers - flights;
          return { flights, landings, treads, totalRun: treads * run + landings * depth };
        },
      ),
      command(
        'switchback-footprint <flights> <risers-per-flight> <tread-run> <stair-width> <landing-depth> <well-gap>',
        ['s', 's', 'p', 'p', 'p', 'q'],
        'Size the rectangle covered by a switchback stair whose equal flights alternate between two parallel lanes, returning {length, width} where length is (risers-per-flight minus one) times tread-run, plus landing-depth once for two flights or twice for three or more, and width is stair-width for one flight and otherwise twice stair-width plus well-gap.',
        (flights, risers, run, stairWidth, depth, gap) => {
          return {
            length: (risers - 1) * run + Math.min(flights - 1, 2) * depth,
            width: flights === 1 ? stairWidth : 2 * stairWidth + gap,
          };
        },
      ),
      command(
        'corner-footprint <lower-risers> <upper-risers> <tread-run> <stair-width>',
        ['s', 's', 'p', 'p'],
        'Size the rectangle covered by an L-shaped stair with a square corner landing of side stair-width, returning {length, width} where length is (lower-risers minus one) times tread-run plus stair-width and width is (upper-risers minus one) times tread-run plus stair-width.',
        (lower, upper, run, stairWidth) => {
          return { length: (lower - 1) * run + stairWidth, width: (upper - 1) * run + stairWidth };
        },
      ),
      command(
        'opening-length <headroom> <floor-thickness> <rise> <run>',
        ['p', 'q', 'p', 'p'],
        'Compute how far back from the top nosing the opening in the upper floor must extend so the nosing line passes at least headroom below the underside of that floor, as (headroom plus floor-thickness) times run divided by rise.',
        (headroom, thickness, rise, run) => {
          return ((headroom + thickness) * run) / rise;
        },
      ),
      command(
        'clear-steps <ceiling-height> <headroom> <rise>',
        ['p', 'q', 'p'],
        'Count the steps from the bottom whose tread surface still has at least headroom below a flat ceiling at ceiling-height above the lower floor, as (ceiling-height minus headroom) divided by rise, rounded down.',
        (ceiling, headroom, rise) => {
          demand(headroom <= ceiling, 'Headroom must not exceed the ceiling height.');
          return stairCount(fitFloor((ceiling - headroom) / rise, (k) => budgetFits(k * rise + headroom, ceiling)));
        },
      ),
      command(
        'step-surface <risers> <rise> <run> <width>',
        ['s', 'p', 'p', 'p'],
        'Measure the faces of one flight, returning {treadArea, riserArea} where treadArea is (risers minus one) times run times width and riserArea is risers times rise times width.',
        (risers, rise, run, width) => {
          return { treadArea: (risers - 1) * run * width, riserArea: risers * rise * width };
        },
      ),
      command(
        'under-stair-space <risers> <rise> <run> <width> <tread-thickness> <clear-height>',
        ['s', 'p', 'p', 'p', 'q', 'q'],
        'Measure the usable space beneath a flight, returning {treads, floorArea, volume} over the steps numbered 1 to risers minus one whose underside, at step number times rise minus tread-thickness above the lower floor, is at least clear-height, where floorArea is treads times run times width and volume is the sum of each underside height times run times width.',
        (risers, rise, run, width, thickness, clear) => {
          const first = Math.max(1, wholeCeil((clear + thickness) / rise)),
            treads = Math.max(0, risers - first);
          if (treads === 0) return { treads: 0, floorArea: 0, volume: 0 };
          const stepSum = ((first + risers - 1) * treads) / 2;
          return {
            treads,
            floorArea: treads * run * width,
            volume: Math.max(0, (rise * stepSum - thickness * treads) * run * width),
          };
        },
      ),
      command(
        'rail-posts <risers> <run> <maximum-spacing> <rails>',
        ['s', 'p', 'p', 's'],
        'Place rail posts on step nosings at most maximum-spacing apart horizontally, returning {treadInterval, postsPerRail, posts} where treadInterval is maximum-spacing divided by run rounded down, posts stand on step 1, on every treadInterval-th step after it, and on the top step, and posts is postsPerRail times rails.',
        (risers, run, spacing, rails) => {
          demand(run <= spacing, 'Maximum spacing must be at least one tread run.');
          const treadInterval = stairCount(wholeFloor(spacing / run)),
            postsPerRail = Math.ceil((risers - 1) / treadInterval) + 1;
          return { treadInterval, postsPerRail, posts: postsPerRail * rails };
        },
      ),
      command(
        'lane-count <overall-width> <lane-width> <rail-width> <rails>',
        ['p', 'p', 'q', 'c'],
        'Count the walking lanes that fit side by side between rails, returning {clearWidth, lanes, spareWidth} where clearWidth is overall-width minus rails times rail-width, lanes is clearWidth divided by lane-width rounded down, and spareWidth is clearWidth minus lanes times lane-width.',
        (overall, lane, railWidth, rails) => {
          const railTotal = rails * railWidth,
            clearWidth = stairGap(overall, railTotal);
          demand(clearWidth >= 0, 'Rails are wider than the stair.');
          const lanes = stairCount(fitFloor(clearWidth / lane, (n) => budgetFits(n * lane + railTotal, overall)));
          // Spare width is roundoff, hence 0, when lanes and rails fill overall-width.
          const used = lanes * lane + railTotal,
            filled = budgetFits(used, overall) && budgetFits(overall, used);
          return { clearWidth, lanes, spareWidth: filled ? 0 : Math.max(0, clearWidth - lanes * lane) };
        },
      ),
      command(
        'ladder-rungs <height> <rung-spacing> <first-rung-height>',
        ['p', 'p', 'q'],
        'Count ladder rungs placed at first-rung-height and at every rung-spacing above it up to and including height, returning {rungs, topRungHeight} where topRungHeight is first-rung-height plus (rungs minus one) times rung-spacing.',
        (height, spacing, first) => {
          demand(first <= height, 'The first rung is above the ladder top.');
          const rungs = stairCount(
            fitFloor((height - first) / spacing, (j) => budgetFits(first + j * spacing, height)) + 1,
          );
          return { rungs, topRungHeight: first + (rungs - 1) * spacing };
        },
      ),
      command(
        'ladder-sections <height> <maximum-climb> <overlap>',
        ['s', 's', 'c'],
        'Break a ladder climb into sections of maximum-climb with the remainder on top and a rest platform between consecutive sections, returning {sections, platforms, topSection, ladderLength} where sections is height divided by maximum-climb rounded up, platforms is sections minus one, topSection is the height of the last section, and ladderLength is height plus platforms times overlap.',
        (height, maximum, overlap) => {
          const sections = Math.ceil(height / maximum),
            platforms = sections - 1;
          return {
            sections,
            platforms,
            topSection: height - platforms * maximum,
            ladderLength: height + platforms * overlap,
          };
        },
      ),
      command(
        'leaning-ladder <height> <height-per-offset>',
        ['p', 'p'],
        'Set a straight ladder against a wall it touches at height, returning {baseOffset, length, angleDegrees} where baseOffset is height divided by height-per-offset, length is the straight distance from foot to top, and angleDegrees is the arctangent of height-per-offset, measured from the ground.',
        (height, ratio) => {
          const baseOffset = height / ratio;
          return { baseOffset, length: Math.hypot(height, baseOffset), angleDegrees: stairDegrees(ratio) };
        },
      ),
      command(
        'ramp-legs <rise> <run-per-rise> <maximum-leg-run> <landing-length>',
        ['p', 'p', 'p', 'q'],
        'Break a ramp whose run is rise times run-per-rise into the fewest equal legs no longer than maximum-leg-run with a level landing between consecutive legs, returning {legs, landings, legRun, legRise, totalLength} where totalLength is the ramp run plus landings times landing-length.',
        (rise, ratio, maximum, landing) => {
          const run = rise * ratio,
            legs = Math.max(1, stairCount(wholeCeil(run / maximum))),
            landings = legs - 1;
          return { legs, landings, legRun: run / legs, legRise: rise / legs, totalLength: run + landings * landing };
        },
      ),
      command(
        'two-rise-mix <total-rise> <steps> <low-rise> <high-rise>',
        ['s', 's', 's', 's'],
        'Find how many of exactly the given number of steps must rise low-rise and how many high-rise to climb total-rise in whole units, returning {lowSteps, highSteps}, or null when no whole mix reaches it exactly.',
        (total, steps, low, high) => {
          demand(low < high, 'Low rise must be smaller than high rise.');
          const excess = total - steps * low,
            highSteps = excess / (high - low);
          return excess < 0 || !Number.isInteger(highSteps) || highSteps > steps
            ? null
            : { lowSteps: steps - highSteps, highSteps };
        },
      ),
      command(
        'common-rise <story-heights> <maximum-rise>',
        ['S', 's'],
        'Find the largest whole rise not above maximum-rise that divides every whole story height exactly, returning {rise, risersPerStory, totalRisers} with risersPerStory in the supplied order and totalRisers their sum.',
        (heights, maximum) => {
          const shared = heights.reduce(stairGcd);
          let rise = Math.min(shared, maximum);
          while (shared % rise !== 0) rise--;
          const risersPerStory = heights.map((height) => height / rise);
          return { rise, risersPerStory, totalRisers: sum(risersPerStory) };
        },
      ),
      command(
        'climb-time <flight-risers> <seconds-per-riser> <seconds-per-landing>',
        ['S', 'q', 'q'],
        'Total the time to climb the listed flights as the sum of their risers times seconds-per-riser plus seconds-per-landing for each landing between consecutive flights.',
        (flights, perRiser, perLanding) => {
          return sum(flights) * perRiser + (flights.length - 1) * perLanding;
        },
      ),
      command(
        'nosing-profile <risers> <rise> <run>',
        ['s', 'p', 'p'],
        'List the nosing of every step from bottom to top as [horizontal, height] rows, with step k at [(k minus one) times run, k times rise]; at most 1000 steps.',
        (risers, rise, run) => {
          demand(risers <= 1000, 'Profiles are limited to 1000 steps.');
          return sequence(risers, (i) => [i * run, (i + 1) * rise]);
        },
      ),
    ],
  },
  {
    name: 'roundplan',
    note: 'Offline counts of integer grid cells in discs, rings, ellipses, cylinders, spheres, domes, and cones sized by whole diameters. A cell counts when its center lies inside the ideal shape; no world blocks are inspected and no particular circle generator is matched.',
    commands: [
      command(
        'disc-cells <diameter>',
        ['s'],
        'Count the cells inside a disc of the given whole diameter; diameter at most 1000.',
        (diameter) => {
          roundPlanar(diameter);
          return roundDisc(diameter);
        },
      ),
      command(
        'disc-outline <diameter>',
        ['s'],
        'Count the outline cells of a disc, meaning its inside cells with at least one of the four orthogonal neighbors not inside; diameter at most 1000.',
        (diameter) => {
          roundPlanar(diameter);
          return roundOutline(roundDiscRows(diameter));
        },
      ),
      command(
        'thick-outline <diameter>',
        ['s'],
        'Count the inside cells of a disc with at least one of the eight orthogonal or diagonal neighbors not inside, which is the outline with its diagonal steps filled in; diameter at most 1000.',
        (diameter) => {
          roundPlanar(diameter);
          const rows = roundDiscRows(diameter);
          return sum(
            rows.map((cells, row) => cells - Math.max(0, Math.min(cells, rows[row - 1] ?? 0, rows[row + 1] ?? 0) - 2)),
          );
        },
      ),
      command(
        'disc-rows <diameter>',
        ['s'],
        'List the number of inside cells in each row of a disc, from row 1 to row diameter; diameter at most 1000.',
        (diameter) => {
          roundPlanar(diameter);
          const rows = roundDiscRows(diameter);
          return sequence(diameter, (row) => rows[row]);
        },
      ),
      command(
        'row-span <diameter> <row>',
        ['s', 's'],
        'Locate the inside cells of one row of a disc, returning {firstCell, lastCell, cells} where firstCell and lastCell are the one-based positions along the row of its first and last inside cells and cells is the number of inside cells, which are contiguous; row is one-based and at most diameter, and diameter is at most 1000.',
        (diameter, row) => {
          roundPlanar(diameter);
          demand(row <= diameter, 'Row must not exceed the diameter.');
          const v = 2 * row - 1 - diameter,
            cells = roundSpan(diameter, diameter * diameter - v * v),
            firstCell = (diameter - cells) / 2 + 1;
          return { firstCell, lastCell: firstCell + cells - 1, cells };
        },
      ),
      command(
        'row-runs <diameter>',
        ['s'],
        'Group the rows of a disc, from row 1 onward, into maximal runs of consecutive rows holding the same number of inside cells, returning one [cells, rows] pair per run where cells is that number and rows is the length of the run; diameter at most 1000.',
        (diameter) => {
          roundPlanar(diameter);
          const runs = [];
          for (const cells of roundDiscRows(diameter)) {
            if (runs.length && runs.at(-1)[0] === cells) runs.at(-1)[1]++;
            else runs.push([cells, 1]);
          }
          return runs;
        },
      ),
      command(
        'quadrant-split <diameter>',
        ['s'],
        'Split a disc along its two center lines, returning {quadrantCells, armCells, centerCells} where quadrantCells counts the inside cells whose x and z center offsets are both positive, armCells counts the inside cells with a zero x offset and a positive z offset, and centerCells counts the inside cells with both offsets zero, so the disc holds four times quadrantCells plus four times armCells plus centerCells; diameter at most 1000.',
        (diameter) => {
          roundPlanar(diameter);
          const centerCells = diameter % 2,
            armCells = (centerCells * (diameter - 1)) / 2;
          return { quadrantCells: (roundDisc(diameter) - 4 * armCells - centerCells) / 4, armCells, centerCells };
        },
      ),
      command(
        'square-fill <diameter>',
        ['s'],
        'Compare a disc with its bounding square of diameter times diameter cells, returning {cornerCells, cellsPerCorner, fillFraction} where cornerCells counts the square cells that are not inside, cellsPerCorner is one quarter of cornerCells, and fillFraction is the inside cells divided by the square cells; diameter at most 1000.',
        (diameter) => {
          roundPlanar(diameter);
          const square = diameter * diameter,
            inside = roundDisc(diameter),
            cornerCells = square - inside;
          return { cornerCells, cellsPerCorner: cornerCells / 4, fillFraction: inside / square };
        },
      ),
      command(
        'inscribed-square <diameter>',
        ['s'],
        'Find the side, in cells, of the largest square block of cells that is centered on the disc center and lies entirely inside the disc; the side has the same parity as diameter, and diameter is at most 1000.',
        (diameter) => {
          roundPlanar(diameter);
          let side = diameter;
          while (2 * (side - 1) ** 2 > diameter * diameter) side -= 2;
          return side;
        },
      ),
      command(
        'inscribed-depth <diameter> <width>',
        ['s', 's'],
        'Find the greatest depth, in rows, of a rectangular block of cells that is width cells wide, centered on the disc center, and entirely inside the disc, which equals the number of rows holding at least width inside cells; width is at most diameter and of the same parity, and diameter is at most 1000.',
        (diameter, width) => {
          roundPlanar(diameter);
          demand(width <= diameter, 'Width must not exceed the diameter.');
          demand((diameter - width) % 2 === 0, 'Width must have the same parity as the diameter.');
          let depth = diameter;
          while ((width - 1) ** 2 + (depth - 1) ** 2 > diameter * diameter) depth -= 2;
          return depth;
        },
      ),
      command(
        'diameter-for-cells <target-cells>',
        ['s'],
        'Find the smallest diameter from 1 to 1000 whose disc has at least target-cells inside cells, rejecting a target that the disc of diameter 1000 cannot hold.',
        (target) => {
          demand(target <= roundDisc(1000), 'No diameter up to 1000 holds that many cells.');
          let diameter = 1;
          while (roundDisc(diameter) < target) diameter++;
          return diameter;
        },
      ),
      command(
        'outline-within-budget <available-cells>',
        ['s'],
        'Find the largest diameter from 1 to 1000 whose disc outline, counted by the four-neighbor rule, has at most available-cells cells.',
        (available) => {
          // From diameter 2 up every row holds at least two cells and its two end
          // cells are outline cells, so an outline never has fewer than 2 * diameter cells.
          for (let diameter = Math.min(1000, Math.floor(available / 2)); diameter > 1; diameter--)
            if (roundOutline(roundDiscRows(diameter)) <= available) return diameter;
          return 1;
        },
      ),
      command(
        'ring-bands <diameter> <band-width>',
        ['s', 's'],
        'List the inside cells of a disc in concentric bands band-width cells wide from the rim inward, returning one count per band for bands 1 to diameter divided by twice band-width rounded up, where band k holds the inside cells whose centers lie farther from the disc center than half of diameter minus k times band-width but not farther than half of diameter minus (k minus one) times band-width; diameter at most 1000.',
        (diameter, width) => {
          roundPlanar(diameter);
          // Disc cells with u * u + v * v <= reach * reach; a reach of zero or less holds none.
          const within = (reach) =>
            reach > 0 ? sum(roundAxis(diameter, (v) => roundSpan(diameter, reach * reach - v * v))) : 0;
          return sequence(
            Math.ceil(diameter / (2 * width)),
            (band) => within(diameter - 2 * band * width) - within(diameter - 2 * (band + 1) * width),
          );
        },
      ),
      command(
        'thick-ring <diameter> <thickness>',
        ['s', 'p'],
        'Count the inside cells of a disc whose centers lie farther from the disc center than half of diameter minus thickness, for a real thickness of at most half of diameter; diameter at most 1000.',
        (diameter, thickness) => {
          roundPlanar(diameter);
          demand(2 * thickness <= diameter, 'Thickness must not exceed half the diameter.');
          const hole = (diameter - 2 * thickness) ** 2;
          return sum(
            roundAxis(
              diameter,
              (v) => roundSpan(diameter, diameter * diameter - v * v) - roundSpan(diameter, hole - v * v),
            ),
          );
        },
      ),
      command(
        'ellipse-cells <width> <depth>',
        ['s', 's'],
        'Count the cells inside an ellipse whose bounding grid is width cells along x by depth cells along z; width and depth are each at most 1000.',
        (width, depth) => {
          roundPlanar(width, depth);
          return sum(roundEllipseRows(width, depth));
        },
      ),
      command(
        'ellipse-outline <width> <depth>',
        ['s', 's'],
        'Count the outline cells of an ellipse, meaning its inside cells with at least one of the four orthogonal neighbors not inside; width and depth are each at most 1000.',
        (width, depth) => {
          roundPlanar(width, depth);
          return roundOutline(roundEllipseRows(width, depth));
        },
      ),
      command(
        'cylinder-parts <diameter> <height>',
        ['s', 's'],
        'Break down an upright cylinder of height layers that are each a disc of the given diameter, returning {solidCells, wallCells, capCells, shellCells, hollowCells} where solidCells is every inside cell, wallCells is the disc outline cells of every layer, capCells is the disc cells that are not outline cells in the bottom layer and in the top layer (counted once when height is 1), shellCells is wallCells plus capCells, and hollowCells is solidCells minus shellCells; diameter at most 120.',
        (diameter, height) => {
          roundSolid(diameter);
          const rows = roundDiscRows(diameter),
            disc = sum(rows),
            outline = roundOutline(rows);
          const solidCells = disc * height,
            wallCells = outline * height,
            capCells = (disc - outline) * Math.min(height, 2);
          return {
            solidCells,
            wallCells,
            capCells,
            shellCells: wallCells + capCells,
            hollowCells: solidCells - wallCells - capCells,
          };
        },
      ),
      command(
        'sphere-cells <diameter>',
        ['s'],
        'Count the cells inside a sphere of the given whole diameter; diameter at most 120.',
        (diameter) => {
          roundSolid(diameter);
          return sum(roundSphere(diameter).map((rows) => sum(rows)));
        },
      ),
      command(
        'sphere-shell-cells <diameter>',
        ['s'],
        'Count the shell cells of a sphere, meaning its inside cells with at least one of the six orthogonal neighbors not inside; diameter at most 120.',
        (diameter) => {
          roundSolid(diameter);
          return sum(roundShell(roundSphere(diameter)));
        },
      ),
      command(
        'sphere-layers <diameter>',
        ['s'],
        'List the number of inside cells in each horizontal layer of a sphere, from the bottom layer to the top layer; diameter at most 120.',
        (diameter) => {
          roundSolid(diameter);
          const layers = roundSphere(diameter);
          return sequence(diameter, (layer) => sum(layers[layer]));
        },
      ),
      command(
        'shell-layers <diameter>',
        ['s'],
        'List the number of sphere shell cells, counted by the six-neighbor rule, in each horizontal layer of a sphere, from the bottom layer to the top layer; diameter at most 120.',
        (diameter) => {
          roundSolid(diameter);
          const shell = roundShell(roundSphere(diameter));
          return sequence(diameter, (layer) => shell[layer]);
        },
      ),
      command(
        'dome-parts <diameter>',
        ['s'],
        'Break down a dome made of the sphere layers whose cell centers are at or above the sphere center, returning {layers, solidCells, roofCells, floorCells, shellCells} where layers is half of diameter rounded up, solidCells is the inside cells of those layers, roofCells is the sphere shell cells of those layers, floorCells is the inside cells of the lowest dome layer that are not sphere shell cells, and shellCells is roofCells plus floorCells; diameter at most 120.',
        (diameter) => {
          roundSolid(diameter);
          const sphere = roundSphere(diameter),
            layers = Math.ceil(diameter / 2),
            lowest = diameter - layers;
          const inside = sphere.map((rows) => sum(rows)),
            shell = roundShell(sphere);
          const roofCells = sum(shell.slice(lowest)),
            floorCells = inside[lowest] - shell[lowest];
          return {
            layers,
            solidCells: sum(inside.slice(lowest)),
            roofCells,
            floorCells,
            shellCells: roofCells + floorCells,
          };
        },
      ),
      command(
        'ellipsoid-cells <width> <height> <depth>',
        ['s', 's', 's'],
        'Count the cells inside an ellipsoid whose bounding grid is width cells along x by height cells along y by depth cells along z; each size is at most 120.',
        (width, height, depth) => {
          roundSolid(width, height, depth);
          const scale = height * height * depth * depth;
          return sum(
            roundAxis(height, (w) =>
              sum(
                roundAxis(depth, (v) =>
                  roundSpan(width, width * width * (scale - w * w * depth * depth - v * v * height * height), scale),
                ),
              ),
            ),
          );
        },
      ),
      command(
        'cone-layers <diameter> <height>',
        ['s', 's'],
        'Count the cells of an upright cone layer by layer, returning {layerCells, totalCells} where layerCells lists layers 1 to height from the base upward, a cell of layer k is inside when its center lies within half of diameter times (height minus k plus one half) divided by height of the vertical axis, and totalCells is the sum of the list; diameter at most 120 and height at most 1000.',
        (diameter, height) => {
          roundSolid(diameter);
          demand(height <= 1000, 'Cones are limited to 1000 layers.');
          const scale = 4 * height * height;
          const layerCells = sequence(height, (layer) => {
            const reach = diameter * (2 * height - 2 * layer - 1);
            return sum(roundAxis(diameter, (v) => roundSpan(diameter, reach * reach - v * v * scale, scale)));
          });
          return { layerCells, totalCells: sum(layerCells) };
        },
      ),
      command(
        'profile-cells <layer-diameters>',
        ['S'],
        'Count the cells of a stack of discs with the listed whole diameters, returning {layerCells, totalCells} where layerCells holds the inside cells of each disc in the supplied order and totalCells is their sum; each diameter is at most 1000.',
        (diameters) => {
          roundPlanar(...diameters);
          const layerCells = diameters.map(roundDisc);
          return { layerCells, totalCells: sum(layerCells) };
        },
      ),
    ],
  },
  {
    name: 'rampart',
    note: 'Offline battlement, wall, tower, gate, moat, and earthwork geometry from supplied dimensions. Cell counts are whole unit cubes and other results are ideal continuous geometry; no structural, defensive, or gameplay claim is made.',
    commands: [
      command(
        'merlon-fit <wall-length> <merlon-width> <crenel-width>',
        ['s', 's', 's'],
        'Fit the most merlons merlon-width cells wide along wall-length cells when the run starts and ends with a merlon and crenel-width cells separate neighbors, returning {merlons, crenels, leftover} where merlons is wall-length plus crenel-width divided by merlon-width plus crenel-width rounded down, crenels is merlons minus one, and leftover is wall-length less the cells the merlons and crenels use.',
        (length, merlon, crenel) => rampartMerlons(length, merlon, crenel),
      ),
      command(
        'merlon-offsets <wall-length> <merlon-width> <crenel-width>',
        ['s', 's', 's'],
        'List the zero-based start cell of each merlon of the merlon-fit pattern in order along the wall, centering the pattern by leaving leftover divided by two rounded down unused cells before the first merlon; at most 1000 merlons.',
        (length, merlon, crenel) => {
          const { merlons, leftover } = rampartMerlons(length, merlon, crenel);
          demand(merlons <= 1000, 'Merlon lists are limited to 1000 merlons.');
          const start = Math.floor(leftover / 2);
          return sequence(merlons, (i) => start + i * (merlon + crenel));
        },
      ),
      command(
        'crenellated-parapet <wall-length> <thickness> <parapet-height> <merlon-width> <crenel-width> <crenel-depth>',
        ['s', 's', 's', 's', 's', 's'],
        'Count a crenellated parapet built as a solid wall-length by thickness by parapet-height block of cells from which each crenel of the merlon-fit pattern removes a full-thickness notch crenel-width wide and crenel-depth deep from the top, returning {crenels, removedCells, cells}; crenel-depth must not exceed parapet-height.',
        (length, thickness, height, merlon, crenel, depth) => {
          demand(depth <= height, 'Crenel depth must not exceed parapet height.');
          const { crenels } = rampartMerlons(length, merlon, crenel);
          const removedCells = crenels * crenel * depth * thickness;
          return { crenels, removedCells, cells: length * thickness * height - removedCells };
        },
      ),
      command(
        'wall-walk <wall-thickness> <parapet-thickness> <rail-thickness> <walk-length>',
        ['p', 'q', 'q', 'p'],
        'Find the clear wall-walk left on top of a wall beside its parapet and rear rail, returning {clearWidth, area} where clearWidth is wall-thickness minus parapet-thickness minus rail-thickness and must be positive, and area is clearWidth times walk-length.',
        (thickness, parapet, rail, length) => {
          demand(!budgetFits(thickness, parapet + rail), 'Parapet and rail leave no clear walk.');
          const clearWidth = thickness - parapet - rail;
          return { clearWidth, area: clearWidth * length };
        },
      ),
      command(
        'battered-courses <height> <base-thickness> <top-thickness> <length>',
        ['s', 's', 's', 's'],
        'Taper a stepped battered wall of height one-cell courses from base-thickness to top-thickness, returning {courseThickness, cells} where course k counted from 1 at the bottom is base-thickness minus a taper of (base-thickness minus top-thickness) times (k minus 1) divided by (height minus 1) rounded down, so the rounding goes to the taper and no course is thinner than the straight-line taper, the list runs bottom to top, and cells is the sum of the course thicknesses times length; top-thickness must not exceed base-thickness, a one-course wall needs equal thicknesses, and height is at most 1000.',
        (height, base, top, length) => {
          demand(top <= base, 'Top thickness must not exceed base thickness.');
          demand(height <= 1000, 'Battered walls are limited to 1000 courses.');
          demand(height > 1 || top === base, 'A one-course wall cannot taper.');
          const courseThickness = sequence(height, (k) =>
            height === 1 ? base : base - Math.floor(((base - top) * k) / (height - 1)),
          );
          return { courseThickness, cells: sum(courseThickness) * length };
        },
      ),
      command(
        'batter-slope <height> <base-thickness> <top-thickness>',
        ['p', 'p', 'p'],
        'Describe the one battered face of a wall whose other face is vertical, returning {batterRun, faceLength, angleDegrees} where batterRun is base-thickness minus top-thickness, faceLength is the straight sloped length of that face from foot to top, and angleDegrees is the angle between the face and level ground, 90 when batterRun is 0; top-thickness must not exceed base-thickness.',
        (height, base, top) => {
          demand(top <= base, 'Top thickness must not exceed base thickness.');
          const batterRun = base - top;
          return {
            batterRun,
            faceLength: Math.hypot(height, batterRun),
            angleDegrees: rampartDegrees(Math.atan2(height, batterRun)),
          };
        },
      ),
      command(
        'embrasure-cells <wall-thickness> <slit-width> <widen-every> <height>',
        ['s', 's', 's', 's'],
        'Count the cells removed for one splayed embrasure cut through a wall wall-thickness cells deep and height cells tall that is slit-width cells wide at the outer face and grows one cell wider on each side after every widen-every layers inward, returning {layerWidths, removedCells} where layerWidths lists the width of each one-cell layer from the outer face to the inner face, layer j counted from 0 at the outer face being slit-width plus twice j divided by widen-every rounded down, and removedCells is height times the sum of the layer widths; wall-thickness is at most 1000.',
        (thickness, slit, every, height) => {
          demand(thickness <= 1000, 'Embrasures are limited to 1000 layers.');
          const layerWidths = sequence(thickness, (j) => slit + 2 * Math.floor(j / every));
          return { layerWidths, removedCells: height * sum(layerWidths) };
        },
      ),
      command(
        'circuit-towers <width> <depth> <maximum-spacing>',
        ['p', 'p', 'p'],
        'Place towers on a width by depth rectangular circuit measured between tower centers, with a tower at each corner and each side split into its length divided by maximum-spacing rounded up equal gaps, returning {towers, widthSpacing, depthSpacing} where towers is twice the width-side gaps plus twice the depth-side gaps and each spacing is that side length divided by its gap count.',
        (width, depth, spacing) => {
          const widthGaps = wholeCeil(width / spacing),
            depthGaps = wholeCeil(depth / spacing);
          return {
            towers: 2 * widthGaps + 2 * depthGaps,
            widthSpacing: width / widthGaps,
            depthSpacing: depth / depthGaps,
          };
        },
      ),
      command(
        'curtain-spans <circuit-length> <towers> <tower-width>',
        ['p', 's', 'p'],
        'Share a closed circuit of circuit-length among towers equal towers each tower-width long along the circuit and evenly spaced, returning {span, totalCurtain} where totalCurtain is circuit-length minus towers times tower-width and must be positive, and span is the curtain length between neighboring towers, totalCurtain divided by towers.',
        (length, towers, width) => {
          demand(!budgetFits(length, towers * width), 'Towers leave no curtain on the circuit.');
          const totalCurtain = length - towers * width;
          return { span: totalCurtain / towers, totalCurtain };
        },
      ),
      command(
        'enclosure-cells <width> <depth> <wall-height> <wall-thickness> <tower-size> <tower-height>',
        ['s', 's', 's', 's', 's', 's'],
        'Count a rectangular enclosure of width by depth outer cells whose curtain is a ring wall-thickness cells thick and wall-height tall and whose four corners hold solid tower-size by tower-size towers tower-height tall flush with the outer faces, counting every cell once, returning {curtainCells, towerCells, totalCells} where curtainCells leaves out ring cells inside tower footprints; wall-thickness must not exceed tower-size, wall-height must not exceed tower-height, and twice tower-size must not exceed width or depth.',
        (width, depth, height, thickness, size, towerHeight) => {
          demand(thickness <= size, 'Towers must be at least as thick as the curtain wall.');
          demand(height <= towerHeight, 'Towers must be at least as tall as the curtain wall.');
          demand(2 * size <= width && 2 * size <= depth, 'Corner towers must fit along every side.');
          const curtainCells =
            height *
            (rampartRing(width, depth, thickness) - 4 * (size * size - (size - thickness) * (size - thickness)));
          const towerCells = 4 * size * size * towerHeight;
          return { curtainCells, towerCells, totalCells: curtainCells + towerCells };
        },
      ),
      command(
        'concentric-rings <inner-width> <inner-depth> <wall-thickness> <ward-width> <rings>',
        ['s', 's', 's', 's', 's'],
        'Count one course of each of rings concentric rectangular ring walls wall-thickness cells thick, the innermost with outer size inner-width by inner-depth and each next ring outside the previous one with a ward-width gap between them, returning {ringCells, outerWidth, outerDepth} where ringCells lists the cells per course from the innermost ring outward and the outer sizes are those of the outermost ring; twice wall-thickness must be less than inner-width and inner-depth, and rings is at most 1000.',
        (width, depth, thickness, ward, rings) => {
          demand(2 * thickness < width && 2 * thickness < depth, 'The innermost ring must enclose a ward.');
          demand(rings <= 1000, 'Concentric plans are limited to 1000 rings.');
          const grow = (k) => 2 * k * (thickness + ward);
          return {
            ringCells: sequence(rings, (k) => rampartRing(width + grow(k), depth + grow(k), thickness)),
            outerWidth: width + grow(rings - 1),
            outerDepth: depth + grow(rings - 1),
          };
        },
      ),
      command(
        'tower-floors <tower-height> <clear-height> <slab-thickness> <outer-size> <wall-thickness>',
        ['s', 's', 's', 's', 's'],
        'Stack stories in a hollow square tower outer-size cells wide with walls wall-thickness cells thick, each story being a floor slab slab-thickness cells thick filling the interior followed by clear-height open cells, returning {stories, slabCells, leftover} where stories is tower-height divided by slab-thickness plus clear-height rounded down, slabCells is stories times slab-thickness times the squared interior width outer-size minus twice wall-thickness, and leftover is the height above the last story; twice wall-thickness must be less than outer-size.',
        (height, clear, slab, size, thickness) => {
          demand(2 * thickness < size, 'Tower walls leave no interior.');
          const stories = Math.floor(height / (slab + clear)),
            inside = size - 2 * thickness;
          return { stories, slabCells: stories * slab * inside * inside, leftover: height - stories * (slab + clear) };
        },
      ),
      command(
        'gate-passage <wall-thickness> <passage-width> <passage-height> <slot-depth> <slot-thickness>',
        ['s', 's', 's', 'c', 'c'],
        'Count cells removed from a wall for a gate passage passage-width wide and passage-height tall through the full wall-thickness plus a portcullis slot slot-thickness cells long along the passage that reaches slot-depth cells into both side walls and the ceiling, returning {passageCells, slotCells, removedCells} where slotCells is slot-thickness times ((passage-width plus twice slot-depth) times (passage-height plus slot-depth) minus passage-width times passage-height); slot-thickness must not exceed wall-thickness.',
        (thickness, width, height, depth, slot) => {
          demand(slot <= thickness, 'The portcullis slot must fit within the wall thickness.');
          const passageCells = width * height * thickness,
            slotCells = slot * ((width + 2 * depth) * (height + depth) - width * height);
          return { passageCells, slotCells, removedCells: passageCells + slotCells };
        },
      ),
      command(
        'machicolation <gallery-length> <corbel-width> <maximum-gap> <projection>',
        ['p', 'p', 'p', 'p'],
        'Find the fewest corbels, at least two with one flush at each end of the gallery, whose equal gaps are no wider than maximum-gap, returning {corbels, gap, holeArea} where corbels is the larger of 2 and gallery-length plus maximum-gap divided by corbel-width plus maximum-gap rounded up, the open length is gallery-length minus corbels times corbel-width, gap is the open length divided by corbels minus one, and holeArea is the open length times projection, or null when the open length would be negative; twice corbel-width must not exceed gallery-length.',
        (length, corbel, gap, projection) => {
          demand(budgetFits(2 * corbel, length), 'The gallery must hold a corbel at each end.');
          const corbels = Math.max(2, wholeCeil((length + gap) / (corbel + gap)));
          if (!budgetFits(corbels * corbel, length)) return null;
          const open = Math.max(0, length - corbels * corbel);
          return { corbels, gap: open / (corbels - 1), holeArea: open * projection };
        },
      ),
      command(
        'loophole-offsets <wall-length> <spacing> <end-margin>',
        ['s', 's', 'c'],
        'List the zero-based cell offsets of loopholes along a wall of wall-length cells in increasing order, starting at end-margin and repeating every spacing cells while at least end-margin cells remain after the loophole cell; twice end-margin must be less than wall-length and at most 1000 loopholes are listed.',
        (length, spacing, margin) => {
          demand(2 * margin < length, 'End margins leave no room for a loophole.');
          const count = Math.floor((length - 1 - 2 * margin) / spacing) + 1;
          demand(count <= 1000, 'Loophole lists are limited to 1000 loopholes.');
          return sequence(count, (i) => margin + i * spacing);
        },
      ),
      command(
        'loophole-field <slot-width> <wall-depth> <range>',
        ['p', 'p', 'q'],
        'Measure the horizontal field of fire through a straight slot slot-width wide in a wall wall-depth thick, bounded by the lines joining opposite edges of the inner and outer openings, returning {fieldDegrees, swathWidth} where fieldDegrees is twice the arctangent of slot-width divided by wall-depth and swathWidth is the width covered at range beyond the outer face, slot-width times (1 plus twice range divided by wall-depth).',
        (width, depth, range) => ({
          fieldDegrees: 2 * rampartDegrees(Math.atan(width / depth)),
          swathWidth: width * (1 + (2 * range) / depth),
        }),
      ),
      command(
        'blind-ground <crest-height> <eye-height> <eye-setback> <target-height>',
        ['p', 'p', 'p', 'q'],
        'Find the length of ground outward from the wall foot in which a target of target-height stays hidden from an eye at eye-height that looks over a parapet crest at crest-height on the outer wall face eye-setback horizontally in front of the eye, all heights above the outside ground, as (crest-height minus target-height) times eye-setback divided by (eye-height minus crest-height), or 0 when target-height is at least crest-height; eye-height must exceed crest-height.',
        (crest, eye, setback, target) => {
          demand(!budgetFits(eye, crest), 'The eye must be above the parapet crest.');
          return (Math.max(0, crest - target) * setback) / (eye - crest);
        },
      ),
      command(
        'moat <enclosure-width> <enclosure-depth> <berm> <top-width> <bottom-width> <moat-depth>',
        ['p', 'p', 'q', 'p', 'q', 'p'],
        'Measure a moat ring of symmetric trapezoid section around an enclosure beyond a berm, top-width wide at ground level and bottom-width wide at moat-depth with sloped sides meeting on the corner diagonals, returning {bermArea, innerPerimeter, outerPerimeter, surfaceArea, volume} where the inner edge is the enclosure grown by berm on every side, the outer edge is the inner edge grown by top-width, bermArea and surfaceArea are the ground areas between enclosure and inner edge and between inner and outer edge, and volume is the section area times (innerPerimeter plus four times top-width); bottom-width must not exceed top-width.',
        (width, depth, berm, top, bottom, deep) => {
          demand(bottom <= top, 'Moat bottom width must not exceed top width.');
          const innerWidth = width + 2 * berm,
            innerDepth = depth + 2 * berm,
            innerPerimeter = 2 * (innerWidth + innerDepth);
          return {
            bermArea: innerWidth * innerDepth - width * depth,
            innerPerimeter,
            outerPerimeter: innerPerimeter + 8 * top,
            surfaceArea: (innerWidth + 2 * top) * (innerDepth + 2 * top) - innerWidth * innerDepth,
            volume: ((top + bottom) / 2) * deep * (innerPerimeter + 4 * top),
          };
        },
      ),
      command(
        'glacis-ring <enclosure-width> <enclosure-depth> <height> <run>',
        ['p', 'p', 'p', 'p'],
        'Measure a glacis bank around an enclosure that falls from height at the enclosure edge to the ground run away, with planar slopes meeting on the corner diagonals, returning {volume, faceArea, footPerimeter} where volume is height times run times (enclosure-width plus enclosure-depth) plus four thirds of height times run squared, faceArea is the slope length from crest to foot times (twice enclosure-width plus twice enclosure-depth plus four times run), and footPerimeter is the perimeter of the enclosure grown by run on every side.',
        (width, depth, height, run) => ({
          volume: height * run * (width + depth) + (4 * height * run * run) / 3,
          faceArea: Math.hypot(height, run) * (2 * width + 2 * depth + 4 * run),
          footPerimeter: 2 * (width + depth) + 8 * run,
        }),
      ),
      command(
        'spoil-rampart <ditch-width> <ditch-depth> <bulking-factor> <top-width> <side-slope>',
        ['p', 'p', 'p', 'q', 'q'],
        'Size a bank of symmetric trapezoid section raised from the spoil of a rectangular ditch section, returning {bankHeight, baseWidth} where bankHeight solves ditch-width times ditch-depth times bulking-factor equals bankHeight times (top-width plus side-slope times bankHeight), side-slope is horizontal run per unit rise on each side, and baseWidth is top-width plus twice side-slope times bankHeight; top-width and side-slope must not both be 0.',
        (width, depth, bulking, top, slope) => {
          demand(top > 0 || slope > 0, 'A bank needs a positive top width or side slope.');
          const area = width * depth * bulking;
          const bankHeight = slope === 0 ? area / top : (2 * area) / (top + Math.sqrt(top * top + 4 * slope * area));
          return { bankHeight, baseWidth: top + 2 * slope * bankHeight };
        },
      ),
      command(
        'drawbridge <moat-width> <far-bearing> <anchor-height>',
        ['p', 'q', 'p'],
        'Size a drawbridge leaf hinged at the near moat edge that spans moat-width plus far-bearing, with a chain from the leaf tip to an anchor anchor-height directly above the hinge, returning {leafLength, loweredChain, raisedChain, chainTravel} where loweredChain is the straight chain length with the leaf level, raisedChain is the chain length with the leaf vertical above the hinge, and chainTravel is loweredChain minus raisedChain.',
        (moat, bearing, anchor) => {
          const leafLength = moat + bearing,
            loweredChain = Math.hypot(leafLength, anchor),
            raisedChain = Math.abs(anchor - leafLength);
          return { leafLength, loweredChain, raisedChain, chainTravel: loweredChain - raisedChain };
        },
      ),
      command(
        'motte <base-diameter> <top-diameter> <height>',
        ['p', 'q', 'p'],
        'Measure a motte as a truncated cone, returning {volume, topArea, slopeLength, slopeDegrees} where volume is pi times height times (base radius squared plus base radius times top radius plus top radius squared) divided by 3, topArea is the area of the flat top disc, slopeLength is the straight side length from base edge to top edge, and slopeDegrees is the side angle above level ground, 90 for equal diameters; top-diameter must not exceed base-diameter.',
        (base, top, height) => {
          demand(top <= base, 'Top diameter must not exceed base diameter.');
          const big = base / 2,
            small = top / 2,
            run = big - small;
          return {
            volume: (Math.PI * height * (big * big + big * small + small * small)) / 3,
            topArea: Math.PI * small * small,
            slopeLength: Math.hypot(height, run),
            slopeDegrees: rampartDegrees(Math.atan2(height, run)),
          };
        },
      ),
      command(
        'polygon-trace <sides> <side-length>',
        ['s', 'p'],
        'Describe a regular polygon fortress trace of sides equal sides each side-length long, returning {perimeter, circumradius, apothem, area, interiorDegrees} where circumradius is the center-to-vertex distance, apothem is the center-to-side-midpoint distance, area is the enclosed area, and interiorDegrees is each interior angle; sides must be at least 3.',
        (sides, side) => {
          demand(sides >= 3, 'A polygon trace needs at least 3 sides.');
          const half = Math.PI / sides,
            apothem = side / (2 * Math.tan(half));
          return {
            perimeter: sides * side,
            circumradius: side / (2 * Math.sin(half)),
            apothem,
            area: (sides * side * apothem) / 2,
            interiorDegrees: (180 * (sides - 2)) / sides,
          };
        },
      ),
      command(
        'gate-arch <span> <rise>',
        ['p', 'p'],
        'Describe a circular arch over a gate with chord span between springings and rise from the springing line to the crown, a segmental arc when rise is less than half of span, a semicircle at half, and a horseshoe arc of more than 180 degrees above half, returning {radius, angleDegrees, arcLength} where radius is (span squared divided by 4 plus rise squared) divided by twice rise, angleDegrees is the angle the arc subtends at its center, four times the arctangent of twice rise divided by span, and arcLength is the length of the arc.',
        (span, rise) => {
          const radius = ((span * span) / 4 + rise * rise) / (2 * rise),
            angle = 4 * Math.atan((2 * rise) / span);
          return { radius, angleDegrees: rampartDegrees(angle), arcLength: radius * angle };
        },
      ),
      command(
        'ladder-standoff <wall-height> <ladder-length>',
        ['p', 'p'],
        'Find the horizontal distance from the wall foot beyond which a straight ladder of ladder-length with its foot on level ground cannot reach the top of a wall of wall-height, the square root of ladder-length squared minus wall-height squared, or 0 when ladder-length does not exceed wall-height.',
        (height, ladder) => (ladder > height ? Math.sqrt(ladder * ladder - height * height) : 0),
      ),
    ],
  },
  {
    name: 'warehouse',
    note: 'Offline storage-hall layout and capacity arithmetic from supplied container sizes, slot counts, and stack sizes. No container contents, item properties, or sorting behavior are inferred.',
    commands: [
      command(
        'hall-capacity <aisles> <bays-per-side> <levels> <slots-per-container> <stack-size>',
        ['s', 's', 's', 's', 's'],
        'Count a hall of double-loaded aisles holding one container per location, returning {locations, slots, items} where locations is aisles times 2 times bays-per-side times levels, slots is locations times slots-per-container, and items is slots times stack-size.',
        (aisles, bays, levels, slots, stack) => {
          const locations = aisles * 2 * bays * levels;
          return { locations, slots: locations * slots, items: locations * slots * stack };
        },
      ),
      command(
        'aisle-modules <hall-width> <container-depth> <aisle-width> <containers-deep>',
        ['p', 'p', 'p', 's'],
        'Fit aisle modules across hall-width, each one aisle-width aisle with a rack containers-deep containers of container-depth on both sides, returning {aisles, rowsAcross, leftover} where aisles is hall-width divided by (2 times containers-deep times container-depth plus aisle-width) rounded down, rowsAcross is 2 times aisles times containers-deep, and leftover is hall-width minus aisles times that module width.',
        (width, depth, aisle, deep) => {
          const module = 2 * deep * depth + aisle,
            aisles = warehouseCount(wholeFloor(width / module));
          return { aisles, rowsAcross: 2 * aisles * deep, leftover: Math.max(0, warehouseGap(width, aisles * module)) };
        },
      ),
      command(
        'hall-footprint <aisles> <bays-per-side> <containers-deep> <container-depth> <aisle-width> <bay-width> <cross-aisle-width>',
        ['s', 's', 's', 'p', 'p', 'p', 'q'],
        'Size the floor of a hall of aisle modules with one front and one rear cross aisle, returning {width, depth, area} where width is aisles times (2 times containers-deep times container-depth plus aisle-width), depth is bays-per-side times bay-width plus 2 times cross-aisle-width, and area is width times depth.',
        (aisles, bays, deep, depth, aisle, bay, cross) => {
          const width = aisles * (2 * deep * depth + aisle),
            length = bays * bay + 2 * cross;
          return { width, depth: length, area: width * length };
        },
      ),
      command(
        'levels-under-ceiling <clear-height> <first-level-height> <container-height> <level-gap>',
        ['p', 'q', 'p', 'q'],
        'Count the container levels under clear-height when level 1 stands on first-level-height and each level stands container-height plus level-gap above the one below, so level k fits when first-level-height plus (k minus 1) times (container-height plus level-gap) plus container-height is at most clear-height, giving 0 when level 1 does not fit.',
        (clear, first, height, gap) => {
          if (!budgetFits(first + height, clear)) return 0;
          const step = height + gap;
          return warehouseCount(
            fitFloor(Math.max(0, clear - first - height) / step, (k) => budgetFits(first + k * step + height, clear)) +
              1,
          );
        },
      ),
      command(
        'container-wall <wall-length> <container-width> <levels> <opening-starts> <opening-widths>',
        ['p', 'p', 's', 'L', 'P'],
        'Line a wall with container columns around openings, where the i-th opening starts at the i-th opening-starts distance from the wall start and is the i-th opening-widths wide, returning {segmentColumns, columns, containers} where segmentColumns lists each clear segment from the wall start (before the first opening, between neighbors, after the last) divided by container-width rounded down, columns is their sum, and containers is columns times levels; openings must be in increasing order, must not overlap, and must end within the wall.',
        (length, width, levels, starts, widths) => {
          same(starts, widths);
          starts.forEach((start, i) =>
            demand(
              i === 0 || budgetFits(starts[i - 1] + widths[i - 1], start),
              'Openings must be in increasing order and must not overlap.',
            ),
          );
          demand(budgetFits(starts.at(-1) + widths.at(-1), length), 'Openings must end within the wall.');
          const edges = [0, ...starts.flatMap((start, i) => [start, start + widths[i]]), length];
          const segmentColumns = sequence(starts.length + 1, (i) => {
            const [from, to] = [edges[2 * i], edges[2 * i + 1]];
            return warehouseCount(
              fitFloor(Math.max(0, warehouseGap(to, from)) / width, (n) => budgetFits(from + n * width, to)),
            );
          });
          const columns = sum(segmentColumns);
          return { segmentColumns, columns, containers: columns * levels };
        },
      ),
      command(
        'location-index <aisle> <side> <bay> <level> <bays-per-side> <levels>',
        ['s', 's', 's', 's', 's', 's'],
        'Return the one-based location index (((aisle minus 1) times 2 plus side minus 1) times bays-per-side plus bay minus 1) times levels plus level; side must be 1 or 2, bay at most bays-per-side, and level at most levels.',
        (aisle, side, bay, level, bays, levels) => {
          demand(side <= 2, 'Side must be 1 or 2.');
          demand(bay <= bays, 'Bay must not exceed bays-per-side.');
          demand(level <= levels, 'Level must not exceed levels.');
          return warehouseIndex(aisle, side, bay, level, bays, levels);
        },
      ),
      command(
        'location-address <index> <aisles> <bays-per-side> <levels>',
        ['s', 's', 's', 's'],
        'Invert the location index, returning {aisle, side, bay, level} for an index of at most aisles times 2 times bays-per-side times levels.',
        (index, aisles, bays, levels) => {
          demand(index <= aisles * 2 * bays * levels, 'Index exceeds the locations of the hall.');
          let rest = index - 1;
          const level = (rest % levels) + 1;
          rest = (rest - level + 1) / levels;
          const bay = (rest % bays) + 1;
          rest = (rest - bay + 1) / bays;
          const side = (rest % 2) + 1;
          return { aisle: (rest - side + 1) / 2 + 1, side, bay, level };
        },
      ),
      command(
        'bay-walk <aisle> <bay> <door-offset> <aisle-pitch> <bay-pitch>',
        ['s', 's', 'c', 's', 's'],
        'Return the one-way walking distance from the door to a bay, door-offset plus (aisle minus 1) times aisle-pitch plus (bay minus one half) times bay-pitch.',
        (aisle, bay, door, aislePitch, bayPitch) => warehouseWalk2(aisle, bay, door, aislePitch, bayPitch) / 2,
      ),
      command(
        'mean-walk <aisles> <bays-per-side> <door-offset> <aisle-pitch> <bay-pitch>',
        ['s', 's', 'c', 's', 's'],
        'Average the bay-walk distance over every location of the hall, returning {mean, farthest} where mean is door-offset plus (aisles minus 1) times aisle-pitch divided by 2 plus bays-per-side times bay-pitch divided by 2, and farthest is the bay-walk distance to bay bays-per-side of aisle aisles.',
        (aisles, bays, door, aislePitch, bayPitch) => ({
          mean: (2 * door + (aisles - 1) * aislePitch + bays * bayPitch) / 2,
          farthest: warehouseWalk2(aisles, bays, door, aislePitch, bayPitch) / 2,
        }),
      ),
      command(
        'return-route <pick-aisles> <pick-bays> <door-offset> <aisle-pitch> <bay-pitch>',
        ['S', 'S', 'c', 's', 's'],
        'Measure a return-routing pick tour that walks the front cross aisle from the door to the highest listed aisle and back and enters each distinct listed aisle only to its deepest listed bay and back, returning {aislesVisited, length} where length is 2 times (door-offset plus (highest aisle minus 1) times aisle-pitch) plus, for each distinct listed aisle, 2 times (its deepest listed bay minus one half) times bay-pitch.',
        (aisles, bays, door, aislePitch, bayPitch) => {
          const visited = warehouseAisles(aisles, bays);
          const cross = 2 * (door + (visited.at(-1)[0] - 1) * aislePitch);
          return {
            aislesVisited: visited.length,
            length: cross + sum(visited.map(([, deepest]) => (2 * deepest - 1) * bayPitch)),
          };
        },
      ),
      command(
        'traversal-route <pick-aisles> <pick-bays> <bays-per-side> <door-offset> <aisle-pitch> <bay-pitch>',
        ['S', 'S', 's', 'c', 's', 's'],
        'Measure an S-shape pick tour that walks the full length of each distinct listed aisle, returning {aislesVisited, length} where length is 2 times (door-offset plus (highest aisle minus 1) times aisle-pitch) plus bays-per-side times bay-pitch per distinct listed aisle, except that when the number of distinct aisles is odd the highest one is entered only to its deepest listed bay and back, adding 2 times (that bay minus one half) times bay-pitch instead; every listed bay must be at most bays-per-side.',
        (aisles, bays, aisleBays, door, aislePitch, bayPitch) => {
          demand(
            bays.every((bay) => bay <= aisleBays),
            'Every listed bay must be at most bays-per-side.',
          );
          const visited = warehouseAisles(aisles, bays),
            odd = visited.length % 2 === 1;
          const cross = 2 * (door + (visited.at(-1)[0] - 1) * aislePitch);
          const through = (visited.length - (odd ? 1 : 0)) * aisleBays * bayPitch;
          return {
            aislesVisited: visited.length,
            length: cross + through + (odd ? (2 * visited.at(-1)[1] - 1) * bayPitch : 0),
          };
        },
      ),
      command(
        'pick-sequence <pick-aisles> <pick-bays>',
        ['S', 'S'],
        'Order picks along the S-shape tour, returning the one-based pick numbers sorted by aisle ascending and then, within the j-th distinct listed aisle counted from the lowest, by bay ascending when j is odd and descending when j is even, keeping picks with equal aisle and bay in list order.',
        (aisles, bays) => {
          const visit = new Map(warehouseAisles(aisles, bays).map(([aisle], j) => [aisle, j % 2 === 0 ? 1 : -1]));
          return aisles
            .map((_, i) => i)
            .sort((i, j) => aisles[i] - aisles[j] || visit.get(aisles[i]) * (bays[i] - bays[j]) || i - j)
            .map((i) => i + 1);
        },
      ),
      command(
        'door-aisle <aisle-picks> <aisle-pitch>',
        ['C', 's'],
        'Place the door on the front cross aisle at the mouth of the weighted median aisle, where the i-th entry of aisle-picks counts the picks in aisle i, returning {aisle, crossWalk} where aisle is the smallest k for which the picks of aisles 1 to k are at least half the total, and crossWalk sums over all aisles i the picks of aisle i times the absolute difference of i and k times aisle-pitch; the total must be positive.',
        (picks, pitch) => {
          const total = sum(picks);
          demand(total > 0, 'Supply at least one pick.');
          let running = 0;
          const aisle = picks.findIndex((count) => 2 * (running += count) >= total) + 1;
          return { aisle, crossWalk: sum(picks.map((count, i) => count * Math.abs(i + 1 - aisle) * pitch)) };
        },
      ),
      command(
        'aisle-balance <type-picks> <type-aisles> <aisles>',
        ['C', 'S', 's'],
        'Total the picks of each item type in the aisle that stores it, returning {aislePicks, busiestAisle, peakToMean} where aislePicks lists the totals of aisles 1 to aisles, busiestAisle is the lowest-numbered aisle with the largest total, and peakToMean is that largest total times aisles divided by the sum of all picks; every type aisle must be at most aisles, aisles at most 1000, and the sum positive.',
        (picks, homes, aisles) => {
          same(picks, homes);
          demand(aisles <= 1000, 'Aisle lists are limited to 1000 aisles.');
          demand(
            homes.every((aisle) => aisle <= aisles),
            'Every type aisle must be at most aisles.',
          );
          const total = sum(picks);
          demand(total > 0, 'Supply at least one pick.');
          const aislePicks = sequence(aisles, () => 0);
          homes.forEach((aisle, i) => {
            aislePicks[aisle - 1] += picks[i];
          });
          const peak = Math.max(...aislePicks);
          return { aislePicks, busiestAisle: aislePicks.indexOf(peak) + 1, peakToMean: (peak * aisles) / total };
        },
      ),
      command(
        'abc-classes <type-picks> <a-cut> <b-cut>',
        ['C', 'r', 'r'],
        'Classify item types by pick share, ranking them by picks descending with ties in list order and giving each the letter A when the picks of the types ranked before it are less than a-cut times the total, else B when they are less than b-cut times the total, else C, and return the letters in list order; a-cut must not exceed b-cut and the total must be positive.',
        (picks, a, b) => {
          demand(a <= b, 'The A cut must not exceed the B cut.');
          const total = sum(picks);
          demand(total > 0, 'Supply at least one pick.');
          const letters = picks.map(() => 'C');
          let ahead = 0;
          for (const i of warehouseRank(picks)) {
            letters[i] = !budgetFits(a * total, ahead) ? 'A' : !budgetFits(b * total, ahead) ? 'B' : 'C';
            ahead += picks[i];
          }
          return letters;
        },
      ),
      command(
        'coi-order <space-needed> <type-picks>',
        ['S', 'C'],
        'Rank item types by cube-per-order index, space-needed divided by type-picks, ascending, with zero-pick types after all others and ties kept in list order, and return the one-based type numbers in that order.',
        (space, picks) => {
          same(space, picks);
          const key = (i, j) =>
            picks[i] === 0 ? (picks[j] === 0 ? 0 : 1) : picks[j] === 0 ? -1 : space[i] * picks[j] - space[j] * picks[i];
          return space
            .map((_, i) => i)
            .sort((i, j) => key(i, j) || i - j)
            .map((i) => i + 1);
        },
      ),
      command(
        'nearest-slotting <type-picks> <aisles> <bays-per-side> <levels> <door-offset> <aisle-pitch> <bay-pitch>',
        ['C', 's', 's', 's', 'c', 's', 's'],
        'Give the busiest item types the nearest locations by pairing types ranked by picks descending, ties in list order, with locations ranked by bay-walk distance ascending, ties by location index ascending, and return the location index of each type in list order; there must be no more types than locations.',
        (picks, aisles, bays, levels, door, aislePitch, bayPitch) => {
          const n = picks.length;
          demand(n <= aisles * 2 * bays * levels, 'There are more item types than locations.');
          // Every bay strictly nearer than (a, b) precedes it, so the first n
          // locations lie in bays with a * b <= n; equal walks keep aisle order.
          const bayList = [];
          for (let a = 1; a <= Math.min(aisles, n); a++)
            for (let b = 1; b <= Math.min(bays, Math.floor(n / a)); b++)
              bayList.push([a, b, warehouseWalk2(a, b, door, aislePitch, bayPitch)]);
          bayList.sort((x, y) => x[2] - y[2] || x[0] - y[0]);
          const order = [];
          for (const [a, b] of bayList) {
            for (let side = 1; side <= 2; side++)
              for (let level = 1; level <= levels && order.length < n; level++)
                order.push(warehouseIndex(a, side, b, level, bays, levels));
            if (order.length >= n) break;
          }
          const result = picks.map(() => 0);
          warehouseRank(picks).forEach((type, rank) => {
            result[type] = order[rank];
          });
          return result;
        },
      ),
      command(
        'demand-zones <type-picks> <zones>',
        ['C', 's'],
        'Split item types kept in list order into contiguous pick zones, putting each type in zone zones times (2 times the picks of the types listed before it plus its own picks) divided by 2 times the total picks, rounded down, plus 1, but at most zones, and return {zoneOfType, zonePicks} where zonePicks lists the picks of zones 1 to zones; zones is at most 1000 and the total must be positive.',
        (picks, zones) => {
          demand(zones <= 1000, 'Zone lists are limited to 1000 zones.');
          const total = sum(picks);
          demand(total > 0, 'Supply at least one pick.');
          const zonePicks = sequence(zones, () => 0);
          let ahead = 0;
          const zoneOfType = picks.map((count) => {
            const zone = Math.min(zones, warehouseFloor(zones * (2 * ahead + count), 2 * total) + 1);
            ahead += count;
            zonePicks[zone - 1] += count;
            return zone;
          });
          return { zoneOfType, zonePicks };
        },
      ),
      command(
        'depth-zones <class-locations> <aisles> <levels> <bays-per-side>',
        ['S', 's', 's', 's'],
        'Give storage classes in list order consecutive bay depths starting at bay 1, where one bay depth holds 2 times aisles times levels locations across all aisles and a class takes its class-locations divided by that rounded up, returning one {firstBay, lastBay, locations} per class with locations its bay depths times the bay-depth size; the classes must fit within bays-per-side.',
        (wanted, aisles, levels, bays) => {
          const size = 2 * aisles * levels;
          let used = 0;
          const zones = wanted.map((count) => {
            const depth = warehouseCeil(count, size),
              zone = { firstBay: used + 1, lastBay: used + depth, locations: depth * size };
            used += depth;
            return zone;
          });
          demand(used <= bays, 'The classes need more bays than bays-per-side.');
          return zones;
        },
      ),
      command(
        'dedicated-vs-shared <counts> <stack-sizes> <slots-per-container>',
        ['C', 'S', 's'],
        'Compare dedicated containers, each holding one item type, with shared containers holding any types in separate stacks, returning {perType, dedicated, shared, saving} where a type needs counts divided by stack-sizes rounded up slots, perType lists those slots divided by slots-per-container rounded up, dedicated is their sum, shared is the sum of all needed slots divided by slots-per-container rounded up, and saving is dedicated minus shared.',
        (counts, stacks, slots) => {
          same(counts, stacks);
          const needed = counts.map((count, i) => warehouseCeil(count, stacks[i]));
          const perType = needed.map((count) => warehouseCeil(count, slots)),
            dedicated = sum(perType),
            shared = warehouseCeil(sum(needed), slots);
          return { perType, dedicated, shared, saving: dedicated - shared };
        },
      ),
      command(
        'section-fit <type-containers> <section-containers>',
        ['S', 's'],
        'Assign item types first-fit to wall sections of section-containers containers without splitting a type, taking types in list order and putting each in the lowest-numbered open section with enough free containers or else in a new section, returning {sections, sectionOfType, freeContainers} where freeContainers lists what remains free in each section; no type may need more than section-containers.',
        (needs, size) => {
          demand(
            needs.every((need) => need <= size),
            'A type needs more containers than one section holds.',
          );
          const freeContainers = [];
          const sectionOfType = needs.map((need) => {
            let section = freeContainers.findIndex((free) => free >= need);
            if (section < 0) {
              freeContainers.push(size);
              section = freeContainers.length - 1;
            }
            freeContainers[section] -= need;
            return section + 1;
          });
          return { sections: freeContainers.length, sectionOfType, freeContainers };
        },
      ),
      command(
        'overflow-by-type <counts> <stack-sizes> <assigned-containers> <slots-per-container>',
        ['C', 'S', 'C', 's'],
        'Check dedicated assignments where a type holds at most assigned-containers times slots-per-container times stack-sizes items, returning {overflowItems, idleSlots, totalOverflow, totalIdle} where overflowItems lists the count beyond that capacity or 0, idleSlots lists assigned-containers times slots-per-container minus the stored items, the smaller of counts and that capacity, divided by stack-sizes rounded up, so it is never negative, and the totals sum the lists.',
        (counts, stacks, assigned, slots) => {
          same(counts, stacks, assigned);
          const overflowItems = counts.map((count, i) => Math.max(0, count - assigned[i] * slots * stacks[i]));
          const idleSlots = counts.map(
            (count, i) => assigned[i] * slots - warehouseCeil(count - overflowItems[i], stacks[i]),
          );
          return { overflowItems, idleSlots, totalOverflow: sum(overflowItems), totalIdle: sum(idleSlots) };
        },
      ),
      command(
        'fill-state <stored-items> <containers> <container-items> <reserve-fraction>',
        ['c', 's', 's', 'r'],
        'Report fill against a reserve of containers kept empty, returning {capacity, reserveContainers, usableCapacity, freeUsable, intoReserve, fillFraction} where capacity is containers times container-items, reserveContainers is containers times reserve-fraction rounded up, usableCapacity is (containers minus reserveContainers) times container-items, freeUsable is usableCapacity minus stored-items or 0 if negative, intoReserve is stored-items minus usableCapacity or 0 if negative, and fillFraction is stored-items divided by capacity; stored-items must not exceed capacity.',
        (stored, containers, items, reserve) => {
          const capacity = containers * items;
          demand(stored <= capacity, 'Stored items exceed capacity.');
          const reserveContainers = wholeCeil(containers * reserve),
            usableCapacity = (containers - reserveContainers) * items;
          return {
            capacity,
            reserveContainers,
            usableCapacity,
            freeUsable: Math.max(0, usableCapacity - stored),
            intoReserve: Math.max(0, stored - usableCapacity),
            fillFraction: stored / capacity,
          };
        },
      ),
      command(
        'compact-hall <target-items> <levels> <container-items> <door-offset> <aisle-pitch> <bay-pitch>',
        ['s', 's', 's', 'c', 's', 's'],
        'Choose the hall with the least mean-walk mean that holds target-items, where containers is target-items divided by container-items rounded up, positions is containers divided by 2 times levels rounded up, and each aisle count from 1 to positions takes positions divided by that aisle count rounded up as bays per side, breaking ties by fewer locations and then fewer aisles, returning {aisles, baysPerSide, locations, meanWalk}.',
        (target, levels, items, door, aislePitch, bayPitch) => {
          const positions = warehouseCeil(warehouseCeil(target, items), 2 * levels);
          let best;
          for (let aisles = 1; aisles <= positions; aisles++) {
            const bays = warehouseCeil(positions, aisles),
              walk = 2 * door + (aisles - 1) * aislePitch + bays * bayPitch,
              locations = aisles * 2 * bays * levels;
            if (!best || walk < best.walk || (walk === best.walk && locations < best.locations))
              best = { aisles, bays, locations, walk };
          }
          return { aisles: best.aisles, baysPerSide: best.bays, locations: best.locations, meanWalk: best.walk / 2 };
        },
      ),
      command(
        'expansion-bays <stored-items> <growth-per-period> <periods> <aisles> <bays-per-side> <levels> <container-items>',
        ['c', 'c', 'c', 's', 's', 's', 's'],
        'Plan the bays to add to every aisle side for linear growth, returning {futureItems, containersNeeded, addBays} where futureItems is stored-items plus growth-per-period times periods, containersNeeded is futureItems divided by container-items rounded up, and addBays is containersNeeded divided by 2 times aisles times levels rounded up minus bays-per-side, or 0 if that is negative.',
        (stored, growth, periods, aisles, bays, levels, items) => {
          const futureItems = stored + growth * periods,
            containersNeeded = warehouseCeil(futureItems, items);
          return {
            futureItems,
            containersNeeded,
            addBays: Math.max(0, warehouseCeil(containersNeeded, 2 * aisles * levels) - bays),
          };
        },
      ),
    ],
  },
];
