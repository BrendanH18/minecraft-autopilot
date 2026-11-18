import { demand, same, sequence, sum } from './offline-kit.js';
import { budgetFits, wholeCeil, wholeFloor } from './resource-rounding.js';

const command = (signature, types, description, run) => ({ signature, types, description, run });

// Merge ranges before comparing them, so duplicate observations never add coverage.
function mergeRanges(ranges) {
  const merged = [];
  for (const [start, end] of [...ranges].sort(([a], [b]) => a - b)) {
    const last = merged.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else if (start < end) merged.push([start, end]);
  }
  return merged;
}

function intersectRanges(first, second) {
  const intersections = [];
  let i = 0;
  let j = 0;
  while (i < first.length && j < second.length) {
    const [aStart, aEnd] = first[i];
    const [bStart, bEnd] = second[j];
    const start = Math.max(aStart, bStart);
    const end = Math.min(aEnd, bEnd);
    if (end > start) intersections.push([start, end]);
    if (aEnd < bEnd) i++;
    else j++;
  }
  return intersections;
}

function spanPositions(lengths, gap, start) {
  let offset = start;
  return lengths.map((length) => {
    const end = offset + length;
    const span = [offset, end];
    offset = end + gap;
    return span;
  });
}

export const INFRASTRUCTURE_GROUPS = [
  {
    name: 'tunnel-vent',
    note: 'Offline planning for tunnel ducts, retrofits, and service access from supplied dimensions and rates.',
    commands: [
      command(
        'clear-profile <width> <height> <side-duct> <overhead-duct> <required-width> <required-height>',
        ['s', 's', 'c', 'c', 's', 's'],
        'Check the clear rectangular passage after a side duct and overhead duct consume space.',
        (width, height, side, overhead, requiredWidth, requiredHeight) => {
          demand(side <= width && overhead <= height, 'Ducts exceed the tunnel profile.');
          const clearWidth = width - side;
          const clearHeight = height - overhead;
          const widthMargin = clearWidth - requiredWidth;
          const heightMargin = clearHeight - requiredHeight;
          return { clearWidth, clearHeight, widthMargin, heightMargin, fits: widthMargin >= 0 && heightMargin >= 0 };
        },
      ),
      command(
        'parallel-duct-fit <width> <passage> <duct-width> <duct-gap> <wall-offset>',
        ['s', 's', 's', 'c', 'c'],
        'Count identical ducts fitting beside a protected lane with gaps between ducts.',
        (width, passage, duct, gap, wall) => {
          demand(passage + wall <= width, 'The passage and wall offset exceed tunnel width.');
          const available = width - passage - wall;
          const ducts = Math.floor((available + gap) / (duct + gap));
          const used = ducts ? ducts * duct + (ducts - 1) * gap : 0;
          return { ducts, spareWidth: available - used };
        },
      ),
      command(
        'retrofit-cut <length> <old-width> <old-height> <new-width> <new-height>',
        ['s', 's', 's', 's', 's'],
        'Separate side and ceiling excavation for a rectangular bore enlargement.',
        (length, oldWidth, oldHeight, newWidth, newHeight) => {
          demand(newWidth >= oldWidth && newHeight >= oldHeight, 'The new profile must contain the old profile.');
          const sideCells = (newWidth - oldWidth) * oldHeight * length;
          const ceilingCells = newWidth * (newHeight - oldHeight) * length;
          return { sideCells, ceilingCells, cutCells: sideCells + ceilingCells };
        },
      ),
      command(
        'service-trench <length> <width> <depth> <conduit-width> <conduit-height>',
        ['s', 's', 's', 's', 's'],
        'Budget a straight trench with a one-cell cover and backfill around its conduit.',
        (length, width, depth, conduitWidth, conduitHeight) => {
          demand(
            conduitWidth <= width && conduitHeight < depth,
            'The trench needs room for the conduit and its cover.',
          );
          const coverBlocks = length * width;
          const cutCells = coverBlocks * depth;
          const backfillBlocks =
            length * ((width - conduitWidth) * conduitHeight + width * (depth - conduitHeight - 1));
          return { cutCells, coverBlocks, backfillBlocks };
        },
      ),
      command(
        'offset-riser <lower-y> <upper-y> <x-offset> <z-offset> <straight-ends>',
        ['i', 'i', 'i', 'i', 'c'],
        'Measure a duct riser with two optional horizontal legs and specified straight end sections.',
        (lower, upper, x, z, straightEnds) => {
          const rise = upper - lower;
          demand(rise > 0 && rise >= straightEnds * 2, 'The vertical rise must fit both straight ends.');
          const horizontalRun = Math.abs(x) + Math.abs(z);
          return { rise, horizontalRun, totalRun: rise + horizontalRun };
        },
      ),
      command(
        'opening-separation <intake-start> <intake-width> <exhaust-start> <exhaust-width> <minimum-gap>',
        ['i', 's', 'i', 's', 'c'],
        'Compare half-open intake and exhaust footprints along one wall.',
        (intake, intakeWidth, exhaust, exhaustWidth, minimum) => {
          const signedGap = Math.max(intake, exhaust) - Math.min(intake + intakeWidth, exhaust + exhaustWidth);
          return { signedGap, gapMargin: signedGap - minimum, fits: signedGap >= minimum };
        },
      ),
      command(
        'duct-module-run <length> <module> <joint-overlap>',
        ['s', 's', 'c'],
        'Find the fewest standard duct modules and the trim at the far end.',
        (length, module, overlap) => {
          demand(overlap < module, 'Joint overlap must be smaller than a duct module.');
          const modules = 1 + Math.ceil(Math.max(0, length - module) / (module - overlap));
          return { modules, joints: modules - 1, trim: module + (modules - 1) * (module - overlap) - length };
        },
      ),
      command(
        'hanger-layout <length> <max-span> <pieces-per-hanger>',
        ['s', 's', 's'],
        'Space hangers at both ends with nearly equal whole-cell gaps.',
        (length, maxSpan, pieces) => {
          const spans = Math.ceil(length / maxSpan);
          const base = Math.floor(length / spans);
          const remainder = length % spans;
          const offsets = sequence(spans + 1, (index) => base * index + Math.min(index, remainder));
          return { offsets, bracketPieces: offsets.length * pieces };
        },
      ),
      command(
        'access-gap-audit <length> <access-offsets> <max-distance>',
        ['s', 'C', 'q'],
        'Find the farthest point from an access door, including the tunnel ends.',
        (length, offsets, maxDistance) => {
          const sorted = offsets.toSorted((a, b) => a - b);
          demand(sorted.at(-1) <= length, 'An access door lies beyond the tunnel.');
          let farthest = sorted[0];
          for (let index = 1; index < sorted.length; index++) {
            farthest = Math.max(farthest, (sorted[index] - sorted[index - 1]) / 2);
          }
          farthest = Math.max(farthest, length - sorted.at(-1));
          return { farthest, margin: maxDistance - farthest, fits: farthest <= maxDistance };
        },
      ),
      command(
        'hatch-coverage <length> <hatch-offsets> <reach-before> <reach-after>',
        ['s', 'C', 'c', 'c'],
        'Count the length serviceable from hatches while clipping ends and merging overlaps.',
        (length, offsets, before, after) => {
          demand(
            offsets.every((offset) => offset <= length),
            'A hatch lies beyond the tunnel.',
          );
          const coverage = mergeRanges(
            offsets.map((offset) => [Math.max(0, offset - before), Math.min(length, offset + after)]),
          );
          const served = sum(coverage.map(([start, end]) => end - start));
          return { coverage, served, unserved: length - served };
        },
      ),
      command(
        'sleeve-lengths <wall-thicknesses> <inside-projection> <outside-projection> <stock-length>',
        ['S', 'c', 'c', 's'],
        'Check each wall crossing against an unspliced sleeve stock length.',
        (walls, inside, outside, stock) =>
          walls.map((wall) => {
            const sleeveLength = wall + inside + outside;
            return { sleeveLength, margin: stock - sleeveLength, fits: stock >= sleeveLength };
          }),
      ),
      command(
        'grate-free-area <width> <height> <vertical-bars> <horizontal-bars> <bar-width>',
        ['s', 's', 'c', 'c', 's'],
        'Compute the free aperture of a framed opening with perpendicular bars.',
        (width, height, vertical, horizontal, bar) => {
          const freeWidth = width - vertical * bar;
          const freeHeight = height - horizontal * bar;
          demand(freeWidth >= 0 && freeHeight >= 0, 'Grate bars exceed the aperture.');
          const openArea = freeWidth * freeHeight;
          const area = width * height;
          return { openArea, blockedArea: area - openArea, openFraction: openArea / area };
        },
      ),
      command(
        'conduit-fill <opening-width> <opening-height> <cable-diameters> <cable-counts> <max-fill>',
        ['p', 'p', 'P', 'C', 'r'],
        'Compare circular cable area with a rectangular opening and a supplied fill limit.',
        (width, height, diameters, counts, maxFill) => {
          same(diameters, counts);
          const cableArea = (Math.PI / 4) * sum(diameters.map((diameter, index) => diameter ** 2 * counts[index]));
          const fill = cableArea / (width * height);
          const largestFits = diameters.every(
            (diameter, index) => !counts[index] || diameter <= Math.min(width, height),
          );
          return { cableArea, fill, largestFits, withinFillLimit: budgetFits(fill, maxFill) };
        },
      ),
      command(
        'cable-reel-allocation <section-lengths> <end-tail> <reel-length>',
        ['S', 'c', 's'],
        'Allocate consecutive unspliced cable sections to reels with slack at both ends.',
        (lengths, tail, reel) => {
          const cuts = lengths.map((length) => length + 2 * tail);
          demand(
            cuts.every((cut) => cut <= reel),
            'A complete cut exceeds the reel length.',
          );
          let reels = 1;
          let remaining = reel;
          const reelBySection = cuts.map((cut) => {
            if (cut > remaining) {
              reels++;
              remaining = reel;
            }
            remaining -= cut;
            return reels;
          });
          return { reelBySection, reels, unusedLength: reels * reel - sum(cuts) };
        },
      ),
      command(
        'pull-section-check <section-lengths> <bend-counts> <max-length> <max-bends>',
        ['P', 'C', 'p', 'c'],
        'Flag cable pull sections exceeding either length or bend limits.',
        (lengths, bends, maxLength, maxBends) => {
          same(lengths, bends);
          return lengths.map((length, index) => {
            const lengthMargin = maxLength - length;
            const bendMargin = maxBends - bends[index];
            return { section: index + 1, lengthMargin, bendMargin, fits: lengthMargin >= 0 && bendMargin >= 0 };
          });
        },
      ),
      command(
        'branch-isolation <length> <damper-offsets> <work-offset>',
        ['s', 'C', 'c'],
        'Find the two available dampers that bound work at a duct location.',
        (length, dampers, work) => {
          demand(work <= length && dampers.every((offset) => offset <= length), 'Offsets must lie within the duct.');
          demand(!dampers.includes(work), 'The work offset must lie away from a damper.');
          let before = null;
          let after = null;
          for (const offset of dampers) {
            if (offset < work) before = Math.max(before ?? 0, offset);
            if (offset > work) after = Math.min(after ?? length, offset);
          }
          return { before, after, isolatedLength: before === null || after === null ? null : after - before };
        },
      ),
      command(
        'bottleneck-profile <opening-widths> <opening-heights> <blockage-areas>',
        ['S', 'S', 'C'],
        'Find the narrowest usable cross section among surveyed duct stations.',
        (widths, heights, blockages) => {
          same(widths, heights, blockages);
          const openAreas = widths.map((width, index) => width * heights[index] - blockages[index]);
          demand(
            openAreas.every((area) => area >= 0),
            'A blockage is larger than its opening.',
          );
          const minimumArea = Math.min(...openAreas);
          return {
            minimumArea,
            stations: openAreas.flatMap((area, index) => (area === minimumArea ? [index + 1] : [])),
          };
        },
      ),
      command(
        'ceiling-conflicts <duct-ranges> <restricted-ranges>',
        ['intervals', 'intervals'],
        'Locate the merged portions of ceiling ducts that overlap restricted headroom zones.',
        (ducts, restrictions) => {
          const conflicts = intersectRanges(mergeRanges(ducts), mergeRanges(restrictions));
          return { conflicts, conflictingLength: sum(conflicts.map(([start, end]) => end - start)) };
        },
      ),
      command(
        'slope-headroom <floor-levels> <duct-bottoms> <required-clearance>',
        ['l', 'l', 'p'],
        'Check paired floor and duct elevations for overhead clearance at each survey station.',
        (floors, bottoms, required) => {
          same(floors, bottoms);
          const margins = floors.map((floor, index) => bottoms[index] - floor - required);
          return {
            minimumMargin: Math.min(...margins),
            failingStations: margins.flatMap((margin, index) => (margin < 0 ? [index + 1] : [])),
          };
        },
      ),
      command(
        'shaft-landing-check <shaft-width> <shaft-depth> <landing-width> <landing-depth> <edge-margin>',
        ['s', 's', 's', 's', 'c'],
        'Check whether a landing leaves usable access inside a shaft after edge setbacks.',
        (width, depth, landingWidth, landingDepth, margin) => {
          const widthSpare = width - landingWidth - margin * 2;
          const depthSpare = depth - landingDepth - margin * 2;
          return { widthSpare, depthSpare, fits: widthSpare >= 0 && depthSpare >= 0 };
        },
      ),
      command(
        'maintenance-lap <segment-lengths> <walk-speeds> <service-times>',
        ['L', 'P', 'L'],
        'Budget a round trip with one service stop after each outbound segment.',
        (lengths, speeds, stops) => {
          same(lengths, speeds, stops);
          const walkingTime = 2 * sum(lengths.map((length, index) => length / speeds[index]));
          const serviceTime = sum(stops);
          return { walkingTime, serviceTime, totalTime: walkingTime + serviceTime };
        },
      ),
      command(
        'simultaneous-closures <left-closures> <right-closures> <max-full-closure>',
        ['intervals', 'intervals', 'q'],
        'Find times when both bores are shut and test the longest uninterrupted closure.',
        (left, right, maxClosure) => {
          const fullClosures = intersectRanges(mergeRanges(left), mergeRanges(right));
          const longestClosure = Math.max(0, ...fullClosures.map(([start, end]) => end - start));
          return { fullClosures, longestClosure, fits: budgetFits(longestClosure, maxClosure) };
        },
      ),
      command(
        'missing-panels <panel-widths> <panel-heights> <needed-counts> <stock-counts>',
        ['S', 'S', 'C', 'C'],
        'Find replacement panel shortages by exact dimensions without rotating the panels.',
        (widths, heights, needed, stock) => {
          same(widths, heights, needed, stock);
          const bySize = new Map();
          for (const [index, width] of widths.entries()) {
            const height = heights[index];
            const key = `${width},${height}`;
            const entry = bySize.get(key) ?? { width, height, needed: 0, stock: 0 };
            entry.needed += needed[index];
            entry.stock += stock[index];
            bySize.set(key, entry);
          }
          const shortages = [...bySize.values()].flatMap(({ width, height, needed, stock }) =>
            needed > stock ? [{ width, height, missing: needed - stock }] : [],
          );
          return {
            shortages,
            missingArea: sum(shortages.map(({ width, height, missing }) => width * height * missing)),
          };
        },
      ),
      command(
        'bypass-detour <original-run> <offset> <transition-run> <blocked-length>',
        ['s', 's', 's', 's'],
        'Estimate a bypass with two rectilinear transitions around a blocked duct segment.',
        (length, offset, transition, blocked) => {
          demand(blocked + 2 * transition <= length, 'The bypass and its transitions exceed the original run.');
          const addedRun = 2 * offset;
          return { bypassRun: blocked + 2 * transition + addedRun, addedRun, totalRun: length + addedRun };
        },
      ),
      command(
        'retrofit-phases <bore-widths> <work-closures> <required-open-width>',
        ['S', 'C', 'c'],
        'Check independent work phases when one bore at a time loses some of its width.',
        (widths, closures, required) => {
          same(widths, closures);
          const totalWidth = sum(widths);
          return closures.map((closure, index) => {
            demand(closure <= widths[index], 'A work closure is wider than its bore.');
            const openWidth = totalWidth - closure;
            return { phase: index + 1, openWidth, margin: openWidth - required, fits: openWidth >= required };
          });
        },
      ),
    ],
  },
  {
    name: 'canal-lock',
    note: 'Offline estimates for lock chambers, water budgets, traffic, and towpaths from supplied dimensions and rates.',
    commands: [
      command(
        'flight-lifts <lower-level> <upper-level> <max-lift>',
        ['i', 'i', 's'],
        'Split a rise into the fewest lock stages with nearly equal whole-cell lifts.',
        (lower, upper, maxLift) => {
          const rise = upper - lower;
          demand(rise > 0, 'The upper level must be above the lower level.');
          const stages = Math.ceil(rise / maxLift);
          const shortLift = Math.floor(rise / stages);
          const tallStages = rise % stages;
          let entryLevel = lower;
          return sequence(stages, (index) => {
            const lift = shortLift + Number(index < tallStages);
            const exitLevel = entryLevel + lift;
            const stage = { entryLevel, exitLevel, lift };
            entryLevel = exitLevel;
            return stage;
          });
        },
      ),
      command(
        'chamber-clearance <length> <width> <boat-length> <boat-width> <end-clearance> <side-clearance>',
        ['s', 's', 's', 's', 'c', 'c'],
        'Verify a boat fits a chamber with the chosen clearance on every side.',
        (length, width, boatLength, boatWidth, ends, sides) => {
          const lengthMargin = length - boatLength - 2 * ends;
          const widthMargin = width - boatWidth - 2 * sides;
          return { lengthMargin, widthMargin, fits: lengthMargin >= 0 && widthMargin >= 0 };
        },
      ),
      command(
        'sill-margin <water-level> <bed-level> <sill-level> <draft> <under-keel>',
        ['i', 'i', 'i', 'p', 'q'],
        'Check clearance over whichever is higher, the lock sill or approach bed.',
        (water, bed, sill, draft, underKeel) => {
          const depth = water - Math.max(bed, sill);
          demand(depth >= 0, 'Water level must reach both the bed and the sill.');
          const margin = depth - (draft + underKeel);
          return { depth, margin, fits: budgetFits(draft + underKeel, depth) };
        },
      ),
      command(
        'wall-crest <chamber-floor> <low-water-depth> <lift> <freeboard> <existing-crest>',
        ['i', 's', 's', 'c', 'i'],
        'Find the required crest elevation and the additional height for each wall.',
        (floor, lowWater, lift, freeboard, crest) => {
          const highWaterLevel = floor + lowWater + lift;
          const requiredCrest = highWaterLevel + freeboard;
          return { highWaterLevel, requiredCrest, raiseBy: Math.max(0, requiredCrest - crest) };
        },
      ),
      command(
        'chamber-fill <length> <width> <lift> <fixed-displacement>',
        ['s', 's', 's', 'c'],
        'Count the volume between water levels after subtracting solid cells in that layer.',
        (length, width, lift, displaced) => {
          const grossVolume = length * width * lift;
          demand(displaced <= grossVolume, 'Solid displacement exceeds the lifted volume.');
          return { grossVolume, waterVolume: grossVolume - displaced };
        },
      ),
      command(
        'fill-schedule <water-volumes> <inflow-rates> <loss-rates> <changeover-time>',
        ['L', 'P', 'L', 'q'],
        'Schedule consecutive fills with separate net inflow rates and gaps between chambers.',
        (volumes, inflows, losses, changeover) => {
          same(volumes, inflows, losses);
          let start = 0;
          return volumes.map((volume, index) => {
            const rate = inflows[index] - losses[index];
            demand(volume === 0 || rate > 0, 'Every nonempty fill must have positive net inflow.');
            const end = start + (volume === 0 ? 0 : volume / rate);
            const stage = { chamber: index + 1, start, end };
            start = end + changeover;
            return stage;
          });
        },
      ),
      command(
        'cascade-reserve <fill-volumes> <returned-volumes>',
        ['C', 'C'],
        'Find the starting reserve that funds each chamber before reclaimed water arrives.',
        (fills, returns) => {
          same(fills, returns);
          let cumulativeWithdrawal = 0;
          let startingReserve = 0;
          for (const [index, fill] of fills.entries()) {
            const returned = returns[index];
            demand(returned <= fill, 'A stage cannot return more water than it withdraws.');
            cumulativeWithdrawal += fill;
            startingReserve = Math.max(startingReserve, cumulativeWithdrawal);
            cumulativeWithdrawal -= returned;
          }
          return { startingReserve, consumed: cumulativeWithdrawal, remaining: startingReserve - cumulativeWithdrawal };
        },
      ),
      command(
        'wall-blocks <length> <low-water-depth> <lift> <freeboard> <wall-thickness> <foundation-depth>',
        ['s', 's', 's', 'c', 's', 'c'],
        'Separate the two straight side walls into submerged, crest, and foundation block counts.',
        (length, lowWater, lift, freeboard, thickness, foundation) => {
          const layer = 2 * length * thickness;
          const submerged = layer * (lowWater + lift);
          const crest = layer * freeboard;
          const foundationBlocks = layer * foundation;
          return { submerged, crest, foundationBlocks, blocks: submerged + crest + foundationBlocks };
        },
      ),
      command(
        'gate-span <opening-width> <left-leaf> <right-leaf> <required-overlap>',
        ['s', 's', 's', 'c'],
        'Check the closed span of two gate leaves measured inward from the sides.',
        (width, left, right, overlap) => {
          demand(left <= width && right <= width, 'A leaf extends beyond the opposite side.');
          const actualOverlap = left + right - width;
          return { actualOverlap, margin: actualOverlap - overlap, fits: actualOverlap >= overlap };
        },
      ),
      command(
        'gate-positions <chamber-lengths> <gate-thickness> <approach-length>',
        ['S', 's', 'c'],
        'Locate gates when each neighboring pair of chambers shares one gate.',
        (lengths, thickness, approach) => {
          const chambers = spanPositions(lengths, thickness, approach + thickness);
          const gates = [[approach, approach + thickness], ...chambers.map(([, end]) => [end, end + thickness])];
          demand(gates.length <= 1000, 'Output is limited to 1000 gates.');
          return { chambers, gates, farEdge: gates.at(-1)[1] };
        },
      ),
      command(
        'transit-window <window-time> <startup-time> <passage-time> <reset-time>',
        ['q', 'q', 'p', 'q'],
        'Count complete passages in a time window, with startup once and reset only between passages.',
        (window, startup, passage, reset) => {
          const first = startup + passage;
          if (startup >= window || !budgetFits(first, window)) return { passages: 0, unusedTime: window };
          const cycle = passage + reset;
          const additional = Math.max(0, wholeFloor((window - first) / cycle));
          const lastFinish = first + additional * cycle;
          const nextFinish = first + (additional + 1) * cycle;
          const canExtend = nextFinish > lastFinish && budgetFits(nextFinish, window);
          return {
            passages: 1 + additional + Number(canExtend),
            unusedTime: Math.max(0, window - (canExtend ? nextFinish : lastFinish)),
          };
        },
      ),
      command(
        'approach-holding <length> <width> <boat-length> <boat-width> <length-gap> <side-gap>',
        ['s', 's', 's', 's', 'c', 'c'],
        'Count waiting boats in a rectangular holding area with clearance between rows and lanes.',
        (length, width, boatLength, boatWidth, lengthGap, sideGap) => {
          const rows = Math.floor((length + lengthGap) / (boatLength + lengthGap));
          const lanes = Math.floor((width + sideGap) / (boatWidth + sideGap));
          return { rows, lanes, boats: rows * lanes };
        },
      ),
      command(
        'convoy-load <length> <boat-lengths> <boat-gap> <end-clearance>',
        ['s', 'S', 'c', 'c'],
        'Load the longest fitting prefix of a single-file boat queue.',
        (length, boats, gap, clearance) => {
          const usableLength = length - 2 * clearance;
          demand(usableLength >= 0, 'End clearance exceeds the chamber length.');
          let usedLength = 0;
          let loaded = 0;
          for (const boat of boats) {
            const next = usedLength + boat + (loaded ? gap : 0);
            if (next > usableLength) break;
            usedLength = next;
            loaded++;
          }
          return { loaded, waiting: boats.length - loaded, spareLength: usableLength - usedLength };
        },
      ),
      command(
        'reservoir-buffer <surface-area> <allowed-drop> <fill-volume> <protected-reserve>',
        ['p', 'q', 'p', 'q'],
        'Budget whole lock fills from a reservoir after holding back protected water.',
        (area, drop, fill, reserve) => {
          const drawable = area * drop;
          demand(budgetFits(reserve, drawable), 'The protected reserve exceeds drawable water.');
          const usable = Math.max(0, drawable - reserve);
          let fills = wholeFloor(usable / fill);
          // Subtracting the reserve can lose precision at an exact whole-fill boundary.
          if (usable > 0 && budgetFits(reserve + (fills + 1) * fill, drawable)) fills++;
          return { drawable, usable, fills, remainingUsable: Math.max(0, usable - fills * fill) };
        },
      ),
      command(
        'equalization-check <chamber-level> <lower-level> <upper-level> <level-tolerance>',
        ['n', 'n', 'n', 'q'],
        'Find each gate water-level difference and test the caller-supplied tolerance.',
        (chamber, lower, upper, tolerance) => {
          demand(upper > lower, 'The upper level must be above the lower level.');
          const lowerDifference = chamber - lower;
          const upperDifference = chamber - upper;
          return {
            lowerDifference,
            upperDifference,
            lowerWithinTolerance: budgetFits(Math.abs(lowerDifference), tolerance),
            upperWithinTolerance: budgetFits(Math.abs(upperDifference), tolerance),
          };
        },
      ),
      command(
        'refill-plan <directions> <starting-level> <fill-volume>',
        ['C', 'c', 's'],
        'Count fills and drains serving up and down transits in their supplied order.',
        (directions, startLevel, volume) => {
          demand(
            startLevel <= 1 && directions.every((direction) => direction <= 1),
            'Levels and directions must be 0 or 1.',
          );
          let level = startLevel;
          let fills = 0;
          let drains = 0;
          for (const direction of directions) {
            if (direction === 1) {
              drains += level;
              fills++;
            } else {
              fills += 1 - level;
              drains++;
            }
            level = direction;
          }
          return { fills, drains, waterDrawn: fills * volume, waterReleased: drains * volume, finalLevel: level };
        },
      ),
      command(
        'towpath-ramp <lift> <max-grade> <landing-length> <available-run>',
        ['s', 'p', 'c', 'c'],
        'Check the shortest whole-cell towpath ramp run including two landings.',
        (lift, grade, landing, available) => {
          const rampRun = wholeCeil(lift / grade);
          const totalRun = rampRun + 2 * landing;
          return { rampRun, totalRun, margin: available - totalRun, fits: totalRun <= available };
        },
      ),
      command(
        'towpath-embankment <ramp-width> <rise> <run-per-step> <peak-landing>',
        ['s', 's', 's', 'c'],
        'Count fill under a stepped towpath and its top landing.',
        (width, rise, run, landing) => {
          const rampBlocks = width * run * ((rise * (rise + 1)) / 2);
          const landingBlocks = width * rise * landing;
          return { rampBlocks, landingBlocks, fillBlocks: rampBlocks + landingBlocks };
        },
      ),
      command(
        'towpath-crossings <chamber-length> <crossing-offsets> <crossing-width> <water-span> <bank-overhang>',
        ['s', 'C', 's', 's', 'c'],
        'Check crossing deck footprints and count deck blocks including both overhangs.',
        (length, offsets, width, span, overhang) => {
          const sorted = offsets.toSorted((a, b) => a - b);
          demand(sorted.at(-1) + width <= length, 'A crossing extends beyond the chamber.');
          demand(
            sorted.every((offset, index) => index === 0 || offset >= sorted[index - 1] + width),
            'Crossing decks overlap.',
          );
          return {
            crossings: sorted.map((start) => [start, start + width]),
            deckBlocks: sorted.length * width * (span + 2 * overhang),
          };
        },
      ),
      command(
        'draft-window <initial-depth> <final-depth> <duration> <draft> <under-keel>',
        ['q', 'q', 'p', 'p', 'q'],
        'Find the interval with enough draft during a supplied linear change in water depth.',
        (initial, final, duration, draft, underKeel) => {
          const required = draft + underKeel;
          if (budgetFits(required, Math.min(initial, final))) return [0, duration];
          if (!budgetFits(required, Math.max(initial, final))) return null;
          const ratio = (required - initial) / (final - initial);
          const crossing = Math.max(0, Math.min(1, ratio)) * duration;
          return initial < final ? [crossing, duration] : [0, crossing];
        },
      ),
      command(
        'lining-repair <chamber-length> <chamber-width> <water-depth> <floor-damage> <side-damage> <spare-fraction>',
        ['s', 's', 's', 'r', 'r', 'r'],
        'Budget floor and side lining replacements separately, then add spare stock.',
        (length, width, depth, floorDamage, sideDamage, spare) => {
          const floorBlocks = wholeCeil(length * width * floorDamage);
          const sideBlocks = wholeCeil(2 * length * depth * sideDamage);
          const spareBlocks = wholeCeil((floorBlocks + sideBlocks) * spare);
          return { floorBlocks, sideBlocks, spareBlocks, totalBlocks: floorBlocks + sideBlocks + spareBlocks };
        },
      ),
      command(
        'approach-profile <chainages> <bed-levels> <max-grade>',
        ['L', 'l', 'q'],
        'Find approach bed segments steeper than a supplied absolute rise-to-run limit.',
        (chainages, levels, maxGrade) => {
          same(chainages, levels);
          demand(chainages.length >= 2, 'Supply at least two survey stations.');
          const grades = chainages.slice(1).map((end, index) => {
            const run = end - chainages[index];
            demand(run > 0, 'Chainages must be strictly increasing.');
            return (levels[index + 1] - levels[index]) / run;
          });
          return {
            grades,
            steepSegments: grades.flatMap((grade, index) => (budgetFits(Math.abs(grade), maxGrade) ? [] : [index + 1])),
          };
        },
      ),
      command(
        'cycle-baseline <entry-time> <seal-time> <level-change-time> <exit-time> <reset-time> <boats-per-cycle>',
        ['q', 'q', 'q', 'q', 'q', 's'],
        'Budget an outbound-and-reset cycle and its average time per loaded boat.',
        (entry, seal, level, exit, reset, boats) => {
          const passageTime = entry + seal + level + exit;
          const cycleTime = passageTime + reset;
          return { passageTime, cycleTime, timePerBoat: cycleTime / boats };
        },
      ),
      command(
        'chamber-bumpers <length> <width> <end-clearance> <max-uncovered-gap> <bumper-width>',
        ['s', 's', 'c', 'c', 's'],
        'Fit identical bumpers on both side walls while keeping a central boat lane.',
        (length, width, clearance, gap, bumper) => {
          demand(2 * clearance <= length, 'End clearance exceeds the chamber length.');
          const available = length - 2 * clearance;
          const count = Math.max(0, Math.ceil((available - gap) / (1 + gap)));
          const clearWidth = count ? width - 2 * bumper : width;
          demand(clearWidth > 0, 'Bumpers leave no central boat lane.');
          return { bumpers: count * 2, clearWidth };
        },
      ),
      command(
        'bank-berms <length> <height> <top-width> <outward-step> <banks>',
        ['s', 's', 's', 'c', 's'],
        'Count stepped berm fill and the footprint of one or two banks.',
        (length, height, top, step, banks) => {
          demand(banks <= 2, 'Supply one or two banks.');
          const bottomWidth = top + (height - 1) * step;
          const perBankSection = height * top + step * ((height * (height - 1)) / 2);
          return { bottomWidth, footprint: length * banks * bottomWidth, fillBlocks: length * banks * perBankSection };
        },
      ),
    ],
  },
];
