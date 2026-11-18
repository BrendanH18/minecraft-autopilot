import { demand, same, sum } from './offline-kit.js';
import { budgetFits, wholeCeil, wholeFloor } from './resource-rounding.js';

const command = (signature, types, description, run) => ({ signature, types, description, run });

function checkSafeInteger(value) {
  demand(Number.isSafeInteger(value), 'This plan exceeds the exact whole-block counting range.');
  return value;
}

function deckArea(length, width, opening) {
  const area = length * width;
  demand(opening <= area, 'Openings cannot exceed the deck area.');
  return area - opening;
}

function decimalParts(value) {
  const [mantissa, exponent = '0'] = String(value).split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  return { units: BigInt(whole + fraction), exponent: Number(exponent) - fraction.length };
}

// Subtract surveyed decimal coordinates before rounding the span back to a Number.
function coordinateDifference(left, right) {
  if (left === right || (Number.isInteger(left) && Number.isInteger(right))) return left - right;
  const a = decimalParts(left);
  const b = decimalParts(right);
  const exponent = Math.min(a.exponent, b.exponent);
  const units = a.units * 10n ** BigInt(a.exponent - exponent) - b.units * 10n ** BigInt(b.exponent - exponent);
  return Number(`${units}e${exponent}`);
}

function cantilever(supports, reach) {
  const sorted = [...new Set(supports)].sort((a, b) => a - b);
  const intervals = [];
  for (const support of sorted) {
    const min = support - reach;
    const max = support + reach;
    const previous = intervals.at(-1);
    if (previous && min <= previous[1] + 1) previous[1] = max;
    else intervals.push([min, max]);
  }
  return intervals;
}

const scaffoldPlan = {
  name: 'scaffold-plan',
  note: 'Estimate temporary construction access with caller-supplied dimensions, reach, rates, and limits.',
  commands: [
    command(
      'column-bill <ground-levels> <deck-y> <blocks-per-level>',
      ['l', 'i', 's'],
      'Count support blocks under a fixed deck based on measured ground levels.',
      (ground, deck, blocks) => {
        return ground.map((level) => {
          demand(Number.isInteger(level) && level <= deck, 'Ground must be a whole level at or below the deck.');
          return (deck - level) * blocks;
        });
      },
    ),
    command(
      'frame-grid <length> <width> <max-length-span> <max-width-span>',
      ['s', 's', 's', 's'],
      'Size an endpoint-inclusive rectangular frame grid with independent span limits.',
      (length, width, spanX, spanZ) => {
        const rows = Math.ceil(width / spanZ) + 1;
        const columns = Math.ceil(length / spanX) + 1;
        return { rows, columns, supports: rows * columns };
      },
    ),
    command(
      'brace-span-check <attachment-heights> <bay-widths> <maximum-brace-length>',
      ['l', 'P', 'p'],
      'List one-based bays whose diagonal between adjacent attachment heights exceeds the available brace length.',
      (heights, widths, maximum) => {
        demand(heights.length === widths.length + 1, 'Supply one attachment height at each bay boundary.');
        return widths.flatMap((width, index) =>
          budgetFits(Math.hypot(width, heights[index + 1] - heights[index]), maximum) ? [] : [index + 1],
        );
      },
    ),
    command(
      'cantilever-coverage <support-columns> <reach>',
      ['l', 'c'],
      'Find inclusive intervals reachable from the supplied support columns.',
      (supports, reach) => {
        demand(supports.every(Number.isInteger), 'Support columns must be whole coordinates.');
        return cantilever(supports, reach);
      },
    ),
    command(
      'unsupported-deck <first-column> <last-column> <support-columns> <reach>',
      ['i', 'i', 'l', 'c'],
      'Count unsupported deck columns within a proposed run.',
      (first, last, supports, reach) => {
        demand(first <= last && supports.every(Number.isInteger), 'Supply ordered bounds and whole support columns.');
        const covered = sum(
          cantilever(supports, reach).map(([min, max]) => Math.max(0, Math.min(last, max) - Math.max(first, min) + 1)),
        );
        return last - first + 1 - covered;
      },
    ),
    command(
      'stacked-decks <length> <width> <openings-by-level>',
      ['s', 's', 'C'],
      'Find total decking for equal-footprint levels with different openings.',
      (length, width, openings) => sum(openings.map((opening) => deckArea(length, width, opening))),
    ),
    command(
      'guardrail-gaps <side-lengths> <openings-by-side> <rows>',
      ['S', 'C', 's'],
      'Count guardrail blocks with a separate opening budget for each side.',
      (lengths, openings, rows) => {
        same(lengths, openings);
        return (
          sum(
            lengths.map((length, index) => {
              demand(openings[index] <= length, 'Openings cannot exceed their side length.');
              return length - openings[index];
            }),
          ) * rows
        );
      },
    ),
    command(
      'ladder-landings <rise> <maximum-flight> <landing-depth>',
      ['s', 's', 's'],
      'Count ladder flights, interior landings, and their combined depth.',
      (rise, maxFlight, depth) => {
        const flights = Math.ceil(rise / maxFlight);
        return { flights, landings: flights - 1, totalLandingDepth: (flights - 1) * depth };
      },
    ),
    command(
      'ladder-extensions <installed-heights> <target-heights>',
      ['C', 'C'],
      'Count extra ladder pieces at each access point without crediting excess elsewhere.',
      (installed, targets) => {
        same(installed, targets);
        return targets.map((target, index) => Math.max(0, target - installed[index]));
      },
    ),
    command(
      'deck-clearance <deck-levels> <undersides> <required-clearance>',
      ['l', 'l', 'q'],
      'Report the one-based decks with insufficient vertical clearance.',
      (levels, undersides, clearance) => {
        same(levels, undersides);
        return levels.flatMap((level, index) =>
          clearance <= coordinateDifference(undersides[index], level) ? [] : [index + 1],
        );
      },
    ),
    command(
      'workface-reach <target-levels> <deck-levels> <reach-above-deck>',
      ['l', 'l', 'q'],
      'Assign each target level to the highest usable deck at or below it, or null.',
      (targets, decks, reach) => {
        const sorted = [...decks].sort((a, b) => b - a);
        return targets.map((target) => sorted.find((deck) => deck <= target && target - deck <= reach) ?? null);
      },
    ),
    command(
      'mast-joins <column-heights> <section-height>',
      ['C', 's'],
      'Count joints between stacked mast sections, omitting the base joint.',
      (heights, section) => sum(heights.map((height) => Math.max(0, Math.ceil(height / section) - 1))),
    ),
    command(
      'anchor-levels <bottom-y> <top-y> <maximum-gap>',
      ['i', 'i', 's'],
      'Space anchors from the bottom level through the top level, including both.',
      (bottom, top, gap) => {
        demand(bottom <= top, 'The bottom must be at or below the top.');
        const count = Math.ceil((top - bottom) / gap) + 1;
        demand(count <= 1000, 'At most 1000 anchor levels can be listed.');
        return Array.from({ length: count }, (_, index) => Math.min(top, bottom + index * gap));
      },
    ),
    command(
      'tie-materials <anchor-counts> <wall-distances> <end-blocks>',
      ['C', 'C', 'c'],
      'Count tie runs and end blocks for anchor banks with different wall distances.',
      (counts, distances, endBlocks) => {
        same(counts, distances);
        return checkSafeInteger(sum(counts.map((count, index) => count * (distances[index] + endBlocks))));
      },
    ),
    command(
      'bay-brace-stock <braces-per-bay> <brace-lengths> <stock-length>',
      ['C', 'P', 'p'],
      'Estimate stock pieces for each bay when every brace is cut as one piece.',
      (counts, lengths, stock) => {
        same(counts, lengths);
        return counts.map((count, index) => {
          if (!count) return 0;
          const perStock = wholeFloor(stock / lengths[index]);
          demand(perStock >= 1, 'A brace cannot be longer than the stock it is cut from.');
          return Math.ceil(count / Math.min(count, perStock));
        });
      },
    ),
    command(
      'outrigger-footprint <length> <width> <left> <right> <front> <back>',
      ['s', 's', 'c', 'c', 'c', 'c'],
      'Measure the enlarged obstruction footprint with asymmetrical outrigger extensions.',
      (length, width, left, right, front, back) => {
        const totalLength = length + front + back;
        const totalWidth = width + left + right;
        return { length: totalLength, width: totalWidth, extraArea: totalLength * totalWidth - length * width };
      },
    ),
    command(
      'relocation-overlap <deck-length> <step> <moves>',
      ['s', 's', 'c'],
      'Compute distance served and unchecked gaps when a deck moves by fixed steps.',
      (length, step, moves) => ({
        covered: length + Math.min(length, step) * moves,
        uncovered: Math.max(step - length, 0) * moves,
        reusedLengthPerMove: Math.max(length - step, 0),
      }),
    ),
    command(
      'recovered-modules <removed-by-type> <recovery-fractions>',
      ['C', 'L'],
      'Estimate whole modules recovered by type, rounding losses independently.',
      (removed, fractions) => {
        same(removed, fractions);
        demand(
          fractions.every((fraction) => fraction <= 1),
          'Recovery fractions must be between zero and one.',
        );
        return removed.map((count, index) => wholeFloor(count * fractions[index]));
      },
    ),
    command(
      'rolling-stock <staged-bays> <blocks-per-bay> <recovery> <relocations>',
      ['s', 's', 'r', 'c'],
      'Budget the initial build and top-ups when a single bay is dismantled and reinstalled each move.',
      (bays, blocks, recovery, moves) => {
        const installed = bays * blocks;
        const topUps = moves * (blocks - wholeFloor(blocks * recovery));
        return { installed, topUps, total: installed + topUps };
      },
    ),
    command(
      'build-strip-time <placed> <removed> <place-rate> <remove-rate> <setup-time>',
      ['c', 'c', 'p', 'p', 'q'],
      'Estimate setup, installation, and teardown time for one crew working in series.',
      (placed, removed, placeRate, removeRate, setup) => {
        const building = placed / placeRate;
        const stripping = removed / removeRate;
        return { building, stripping, total: setup + building + stripping };
      },
    ),
    command(
      'deck-crew <deck-blocks> <worker-rate> <deadline> <setup-per-worker>',
      ['c', 'p', 'p', 'q'],
      'Size a parallel crew whose workers each lose setup time from the shared window.',
      (blocks, rate, deadline, setup) => {
        if (!blocks) return 0;
        if (setup >= deadline) return null;
        return checkSafeInteger(wholeCeil(blocks / ((deadline - setup) * rate)));
      },
    ),
    command(
      'winch-hauls <demand-per-level> <haul-capacity> <ground-y> <deck-levels>',
      ['C', 's', 'i', 'l'],
      'Count separate loaded trips by deck and total loaded vertical travel.',
      (quantities, capacity, ground, decks) => {
        same(quantities, decks);
        demand(
          decks.every((deck) => Number.isInteger(deck) && deck >= ground),
          'Decks must be whole levels at or above the ground.',
        );
        const trips = quantities.map((quantity) => Math.ceil(quantity / capacity));
        return { trips, loadedTravel: sum(trips.map((count, index) => count * (decks[index] - ground))) };
      },
    ),
    command(
      'staggered-inspections <bay-count> <bays-per-round> <days-between-rounds>',
      ['s', 's', 's'],
      'Count inspection rounds and the interval between successive inspections of the same bay.',
      (bays, batch, spacing) => {
        const rounds = Math.ceil(bays / batch);
        return { rounds, revisitDays: rounds * spacing };
      },
    ),
    command(
      'strike-order <deck-levels> <removable-levels>',
      ['l', 'l'],
      'Identify the consecutive highest decks ready to come down, stopping at the first retained deck.',
      (decks, removable) => {
        const ready = new Set(removable);
        const sorted = [...new Set(decks)].sort((a, b) => b - a);
        const firstRetained = sorted.findIndex((deck) => !ready.has(deck));
        return firstRetained === -1 ? sorted : sorted.slice(0, firstRetained);
      },
    ),
    command(
      'missing-ground-pads <support-points> <pad-points>',
      ['points2', 'points2-empty'],
      'List distinct support points that still need a matching ground pad.',
      (supports, pads) => {
        const occupied = new Set(pads.map((pad) => pad.join(',')));
        return supports.filter((support) => {
          const key = support.join(',');
          if (occupied.has(key)) return false;
          occupied.add(key);
          return true;
        });
      },
    ),
  ],
};

// Square base dimensions widen by two per layer, starting at the top.
function tierLayers(topWidth, tiers) {
  demand(tiers <= 1000, 'Plans are limited to 1000 tiers.');
  return Array.from({ length: tiers }, (_, index) => topWidth + 2 * index);
}

const tierCost = (topWidth, tiers) => sum(tierLayers(topWidth, tiers).map((width) => width ** 2));
const gridDistance = ([x1, z1], [x2, z2]) =>
  Math.max(Math.abs(coordinateDifference(x1, x2)), Math.abs(coordinateDifference(z1, z2)));

function bestSite(sites, stations) {
  return sites.reduce((best, site, index) => {
    const radius = Math.max(...stations.map((station) => gridDistance(site, station)));
    return !best || radius < best.radius ? { site: index + 1, radius } : best;
  }, null);
}

function unionWidth(ranges) {
  let width = 0;
  let end = -Infinity;
  for (const [min, max] of ranges.sort((a, b) => a[0] - b[0])) {
    if (max <= end) continue;
    width += max - Math.max(end, min);
    end = max;
  }
  return width;
}

function coveredColumns(beacons, radius) {
  demand(beacons.flat().every(Number.isInteger), 'Coverage requires whole column coordinates.');
  const squares = beacons.map(([x, z]) => [x - radius, x + radius + 1, z - radius, z + radius + 1]);
  const edges = [...new Set(squares.flatMap((square) => square.slice(0, 2)))].sort((a, b) => a - b);
  let columns = 0;
  for (let index = 1; index < edges.length; index++) {
    const left = edges[index - 1];
    const right = edges[index];
    const ranges = squares.flatMap(([x0, x1, z0, z1]) => (x0 <= left && x1 >= right ? [[z0, z1]] : []));
    columns += (right - left) * unionWidth(ranges);
  }
  return columns;
}

const beaconPlan = {
  name: 'beacon-plan',
  note: 'Budget square beacon structures, beam routes, and abstract service coverage using supplied dimensions and ranges.',
  commands: [
    command(
      'tier-materials <top-width> <tiers>',
      ['s', 's'],
      'Count full square layers that widen by two blocks per tier, from top to bottom.',
      (width, tiers) => {
        const layers = tierLayers(width, tiers).map((side) => side ** 2);
        return { layers, total: sum(layers) };
      },
    ),
    command(
      'highest-affordable-tier <top-width> <block-stock> <maximum-tiers>',
      ['s', 'c', 's'],
      'Find the highest tier build affordable with the given block stock.',
      (width, stock, maximum) => {
        let spent = 0;
        let tiers = 0;
        for (const side of tierLayers(width, maximum)) {
          if (spent + side ** 2 > stock) break;
          spent += side ** 2;
          tiers++;
        }
        return { tiers, spent, left: stock - spent };
      },
    ),
    command(
      'donation-shortfall <top-width> <tiers> <blocks-by-material> <ingots-by-material> <ingots-per-block>',
      ['s', 's', 'C', 'C', 's'],
      'Use whole-block donations and convert each material separately before reporting the build shortfall.',
      (width, tiers, blocks, ingots, each) => {
        same(blocks, ingots);
        const available = sum(blocks.map((count, index) => count + Math.floor(ingots[index] / each)));
        return Math.max(0, tierCost(width, tiers) - available);
      },
    ),
    command(
      'upgrade-reserve <top-width> <current-tiers> <target-tiers> <spare-fraction>',
      ['s', 'c', 's', 'r'],
      'Budget missing lower tiers plus a fractional spare allowance.',
      (width, current, target, spare) => {
        demand(current <= target, 'Current tiers cannot exceed the upgrade target.');
        const additional = sum(
          tierLayers(width, target)
            .slice(current)
            .map((side) => side ** 2),
        );
        const reserve = wholeCeil(additional * spare);
        return { additional, reserve, total: additional + reserve };
      },
    ),
    command(
      'rebuild-budget <old-top-width> <old-tiers> <new-top-width> <new-tiers> <recovery>',
      ['s', 's', 's', 's', 'r'],
      'Budget new blocks after reclaiming a fraction from a dismantled base.',
      (oldWidth, oldTiers, newWidth, newTiers, recovery) => {
        const reclaimed = wholeFloor(tierCost(oldWidth, oldTiers) * recovery);
        const needed = tierCost(newWidth, newTiers);
        return { reclaimed, needed, buy: Math.max(0, needed - reclaimed) };
      },
    ),
    command(
      'border-replacement <top-width> <tiers> <border-width>',
      ['s', 's', 'c'],
      'Count blocks in the perimeter bands across all layers, counting corners once.',
      (width, tiers, border) =>
        sum(tierLayers(width, tiers).map((side) => side ** 2 - Math.max(0, side - 2 * border) ** 2)),
    ),
    command(
      'foundation-excavation <top-width> <tiers> <margin> <depth>',
      ['s', 's', 'c', 'c'],
      'Estimate excavation for the widest footprint and a margin on all sides.',
      (width, tiers, margin, depth) => checkSafeInteger((width + 2 * (tiers - 1 + margin)) ** 2 * depth),
    ),
    command(
      'base-fit <available-width> <available-depth> <available-height> <top-width> <tiers>',
      ['s', 's', 's', 's', 's'],
      'Report remaining clearances and fit for the base plus the beacon block.',
      (width, depth, height, top, tiers) => {
        const bottom = top + 2 * (tiers - 1);
        const clearances = [width - bottom, depth - bottom, height - tiers - 1];
        return { clearances, fits: clearances.every((clearance) => clearance >= 0) };
      },
    ),
    command(
      'layer-levels <beacon-y> <floor-y> <tiers>',
      ['i', 'i', 's'],
      'List tier levels and count how many sit below the supplied build floor.',
      (beacon, floor, tiers) => {
        demand(tiers <= 1000, 'Plans are limited to 1000 tiers.');
        const levels = Array.from({ length: tiers }, (_, index) => beacon - index - 1);
        return { levels, belowFloor: levels.filter((y) => y < floor).length };
      },
    ),
    command(
      'beam-obstructions <beacons> <opaque-blocks>',
      ['points3', 'points3-empty'],
      'Find the nearest opaque block above each proposed beam in its exact column.',
      (beacons, blocks) =>
        beacons.map(([x, y, z]) => {
          let obstruction = null;
          for (const [bx, by, bz] of blocks) {
            if (bx === x && bz === z && by > y && (obstruction === null || by < obstruction)) obstruction = by;
          }
          return obstruction;
        }),
    ),
    command(
      'beam-conflicts <beacons>',
      ['points3'],
      'Group one-based beacon indexes that share a vertical beam column.',
      (beacons) => {
        const columns = new Map();
        beacons.forEach(([x, , z], index) => {
          const key = `${x},${z}`;
          if (!columns.has(key)) columns.set(key, []);
          columns.get(key).push(index + 1);
        });
        return [...columns.values()].filter((column) => column.length > 1);
      },
    ),
    command(
      'beam-windows <beacons> <ceiling-levels> <glass-thickness>',
      ['points3', 'l', 's'],
      'List glass levels for one vertical window per beam, starting at the paired ceiling.',
      (beacons, ceilings, thickness) => {
        same(beacons, ceilings);
        demand(beacons.length * thickness <= 1000, 'At most 1000 window blocks can be listed.');
        return beacons.flatMap(([x, y, z], index) => {
          const ceiling = ceilings[index];
          demand(ceiling > y && Number.isInteger(ceiling), 'Each ceiling must be a whole level above its beacon.');
          return Array.from({ length: thickness }, (_, offset) => [x, ceiling + offset, z]);
        });
      },
    ),
    command(
      'glass-palette-stock <glass-by-color> <existing-by-color> <beams>',
      ['C', 'C', 's'],
      'Budget missing glass by color for beams that all use the same palette.',
      (perBeam, stock, beams) => {
        same(perBeam, stock);
        return perBeam.map((required, index) => Math.max(0, required * beams - stock[index]));
      },
    ),
    command(
      'beam-sleeve <levels> <inner-width> <wall-thickness> <access-voids>',
      ['s', 's', 's', 'c'],
      'Count blocks around a square beam shaft after deducting access voids.',
      (levels, inner, wall, voids) => {
        const area = (inner + 2 * wall) ** 2 - inner ** 2;
        demand(voids <= area * levels, 'Access voids cannot exceed the sleeve stock.');
        return checkSafeInteger(area * levels - voids);
      },
    ),
    command(
      'service-uptime <active-intervals> <window-start> <window-end>',
      ['intervals', 'n', 'n'],
      'Measure covered service time clipped to a window, counting overlapping intervals once.',
      (active, start, end) => {
        demand(start < end, 'A service window needs positive duration.');
        const clipped = active
          .map(([min, max]) => [Math.max(start, min), Math.min(end, max)])
          .filter(([min, max]) => min < max);
        const duration = unionWidth(clipped);
        return { duration, fraction: duration / (end - start) };
      },
    ),
    command(
      'rotation-coverage <active-time> <recharge-time> <beacons>',
      ['p', 'q', 's'],
      'Estimate uncovered time per cycle when identical beacons take successive non-overlapping active slots.',
      (active, recharge, beacons) => {
        const cycle = active + recharge;
        const staffed = active * beacons;
        return { cycle, uncovered: budgetFits(cycle, staffed) ? 0 : cycle - staffed };
      },
    ),
    command(
      'minimum-radius <site> <stations>',
      ['points2', 'points2'],
      'Find the least square radius at one site that reaches every station.',
      (sites, stations) => {
        demand(sites.length === 1, 'Supply exactly one site.');
        return bestSite(sites, stations).radius;
      },
    ),
    command(
      'uncovered-stations <sites> <radii> <stations>',
      ['points2', 'L', 'points2'],
      'List one-based stations outside all square service areas, with a radius per site.',
      (sites, radii, stations) => {
        same(sites, radii);
        return stations.flatMap((station, index) =>
          sites.some((site, siteIndex) => gridDistance(station, site) <= radii[siteIndex]) ? [] : [index + 1],
        );
      },
    ),
    command(
      'shared-stations <sites> <radius> <stations>',
      ['points2', 'q', 'points2'],
      'List covered station indexes and their supporting sites when at least two sites reach them.',
      (sites, radius, stations) =>
        stations.flatMap((station, index) => {
          const covering = sites.flatMap((site, siteIndex) =>
            gridDistance(station, site) <= radius ? [siteIndex + 1] : [],
          );
          return covering.length > 1 ? [{ station: index + 1, sites: covering }] : [];
        }),
    ),
    command(
      'backup-radius <sites> <stations>',
      ['points2', 'points2'],
      'Find the least common square radius that lets two sites reach every station.',
      (sites, stations) => {
        demand(sites.length >= 2, 'Supply at least two sites for backup coverage.');
        return Math.max(
          ...stations.map((station) => {
            let first = Infinity;
            let second = Infinity;
            for (const site of sites) {
              const distance = gridDistance(station, site);
              if (distance < first) {
                second = first;
                first = distance;
              } else if (distance < second) second = distance;
            }
            return second;
          }),
        );
      },
    ),
    command(
      'station-assignment <sites> <radius> <stations>',
      ['points2', 'q', 'points2'],
      'Assign each station to its closest site within range, breaking ties by input order.',
      (sites, radius, stations) =>
        stations.map((station) => {
          let assigned = null;
          let best = Infinity;
          sites.forEach((site, index) => {
            const distance = gridDistance(station, site);
            if (distance <= radius && distance < best) {
              assigned = index + 1;
              best = distance;
            }
          });
          return assigned;
        }),
    ),
    command(
      'candidate-site <candidate-sites> <stations>',
      ['points2', 'points2'],
      'Choose the first candidate that minimizes the radius needed to reach every station.',
      bestSite,
    ),
    command(
      'coverage-columns <sites> <radius>',
      ['points2', 'c'],
      'Count unique integer columns inside the union of inclusive square service areas.',
      coveredColumns,
    ),
    command(
      'upgrade-impact <sites> <current-radius> <new-radius> <stations>',
      ['points2', 'q', 'q', 'points2'],
      'List one-based stations that gain service when all site radii expand.',
      (sites, current, next, stations) => {
        demand(current <= next, 'New radius must be at least the current radius.');
        return stations.flatMap((station, index) => {
          const nearest = Math.min(...sites.map((site) => gridDistance(station, site)));
          return current < nearest && nearest <= next ? [index + 1] : [];
        });
      },
    ),
    command(
      'served-floors <beacon-y> <range-below> <range-above> <floor-levels>',
      ['i', 'c', 'c', 'l'],
      'List one-based floors within the inclusive asymmetric vertical service window.',
      (y, below, above, floors) =>
        floors.flatMap((floor, index) => (floor >= y - below && floor <= y + above ? [index + 1] : [])),
    ),
  ],
};

export const CONSTRUCTION_GROUPS = [scaffoldPlan, beaconPlan];
