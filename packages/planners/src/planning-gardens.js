import { demand, same, sequence, sum } from './offline-kit.js';

const command = (signature, types, description, run) => ({ signature, types, description, run });
const perRow = (a, b, fn) => {
  same(a, b);
  return a.map((value, i) => fn(value, b[i]));
};
const fits = (span, margin, pitch) => Math.max(0, Math.ceil((span - 2 * margin) / pitch));

function openingArea(openings, width, height) {
  demand(openings <= width * height, 'Openings exceed the face area.');
  return width * height - openings;
}

const orchard = [
  command(
    'planting-grid <length> <width> <end-margin> <side-margin> <tree-pitch> <row-pitch>',
    ['s', 's', 'c', 'c', 's', 's'],
    'Count trunk centers on a rectangular grid with clear borders.',
    (l, w, end, side, tree, row) => {
      const rows = fits(w, side, row);
      const perRow = fits(l, end, tree);
      return { rows, perRow, trees: rows * perRow };
    },
  ),
  command(
    'staggered-sites <length> <rows> <pitch> <alternate-offset>',
    ['s', 'c', 's', 'c'],
    'Count sites when every second row starts farther along the plot.',
    (length, rows, pitch, offset) => {
      demand(offset < pitch, 'Offset must be smaller than pitch.');
      const odd = Math.ceil(length / pitch);
      const even = Math.max(0, Math.ceil((length - offset) / pitch));
      return { odd, even, trees: odd * Math.ceil(rows / 2) + even * Math.floor(rows / 2) };
    },
  ),
  command(
    'canopy-gaps <centers> <radii>',
    ['C', 'C'],
    'Find signed clearance between neighboring inclusive canopy intervals along one row.',
    (centers, radii) => {
      same(centers, radii);
      return centers.slice(1).map((x, i) => {
        demand(x > centers[i], 'Trunk centers must increase.');
        const rightStart = x - radii[i + 1];
        const leftEnd = centers[i] + radii[i];
        if (rightStart > leftEnd) return rightStart - leftEnd - 1;
        const overlapStart = Math.max(centers[i] - radii[i], rightStart);
        const overlapEnd = Math.min(leftEnd, x + radii[i + 1]);
        return -(overlapEnd - overlapStart + 1);
      });
    },
  ),
  command(
    'headland-extension <sites> <pitch> <end-margin> <available>',
    ['s', 's', 'c', 'c'],
    'Budget extra row length for a target planting and two headlands.',
    (sites, pitch, end, available) => Math.max(0, (sites - 1) * pitch + 1 + 2 * end - available),
  ),
  command(
    'underplant-strips <row-gaps> <clearance> <bed-width>',
    ['C', 'c', 's'],
    'Fit whole understory beds in each inter-row gap after two buffers.',
    (gaps, clear, bed) => gaps.map((gap) => Math.floor(Math.max(0, gap - 2 * clear) / bed)),
  ),
  command(
    'trunk-guards <trunk-widths> <clearance> <gates>',
    ['S', 'c', 'C'],
    'Count square guard rings with the specified gate openings removed.',
    (widths, clear, gates) =>
      perRow(widths, gates, (w, g) => {
        const perimeter = 4 * (w + 2 * clear + 1);
        demand(g <= perimeter, 'Gate openings exceed the guard ring.');
        return perimeter - g;
      }),
  ),
  command(
    'boundary-posts <length> <width> <max-span>',
    ['s', 's', 's'],
    'Count distinct corner and intermediate posts around a rectangular plot.',
    (l, w, span) => {
      demand(l >= 2 && w >= 2, 'A fenced rectangle needs two distinct corners on each axis.');
      return 2 * (Math.ceil((l - 1) / span) + Math.ceil((w - 1) / span));
    },
  ),
  command(
    'tree-address <row-counts> <label>',
    ['C', 's'],
    'Locate a one-based tree label on a serpentine walk counting columns from the same end.',
    (counts, label) => {
      for (const [i, n] of counts.entries()) {
        if (label <= n) return { row: i + 1, column: i % 2 === 0 ? label : n - label + 1 };
        label -= n;
      }
      throw new Error('Label exceeds total trees.');
    },
  ),
  command(
    'replant-stock <empty-sites> <saplings-per-site> <stocks>',
    ['C', 'S', 'C'],
    'Allocate species-specific saplings to complete planting sites.',
    (empty, per, stocks) => {
      same(empty, per, stocks);
      return empty.map((n, i) => {
        const planted = Math.min(n, Math.floor(stocks[i] / per[i]));
        return { planted, vacant: n - planted, remaining: stocks[i] - planted * per[i] };
      });
    },
  ),
  command(
    'nursery-release <stocks> <reserve> <bundle>',
    ['C', 'C', 's'],
    'Release complete bundles per species while protecting nursery stock.',
    (stocks, reserve, bundle) => perRow(stocks, reserve, (n, r) => Math.floor(Math.max(0, n - r) / bundle)),
  ),
  command(
    'thin-row <sites> <keep-every> <first-kept>',
    ['c', 's', 's'],
    'Mark one-based planting positions to retain in a regular thinning pass.',
    (n, pitch, start) => {
      demand(start <= pitch, 'First retained position must lie in the first spacing cycle.');
      return sequence(Math.max(0, Math.floor((n - start) / pitch) + 1), (i) => start + i * pitch);
    },
  ),
  command(
    'stocktake <planned> <standing> <stumps>',
    ['C', 'C', 'C'],
    'Reconcile planted rows and classify missing and cleared sites.',
    (planned, standing, stumps) => {
      same(planned, standing, stumps);
      return planned.map((n, i) => {
        const missing = n - standing[i] - stumps[i];
        demand(missing >= 0, 'Recorded trees and stumps exceed planned sites.');
        return { missing, replant: missing + stumps[i] };
      });
    },
  ),
  command(
    'rotation-rows <row-count> <cohorts> <round>',
    ['s', 's', 's'],
    'List the rows assigned to a repeating one-cohort harvest round.',
    (rows, cohorts, round) => {
      const first = 1 + ((round - 1) % cohorts);
      return sequence(Math.max(0, Math.floor((rows - first) / cohorts) + 1), (i) => first + i * cohorts);
    },
  ),
  command(
    'rest-window <last-cut> <rest> <now>',
    ['C', 'S', 'c'],
    'Find remaining rest time per row after its previous cut.',
    (last, rest, now) =>
      perRow(last, rest, (cut, delay) => {
        demand(cut <= now, 'Previous cuts must be at or before the planning clock.');
        return Math.max(0, cut + delay - now);
      }),
  ),
  command(
    'log-forecast <trees> <logs-per-tree> <standing-reserve>',
    ['C', 'C', 'C'],
    'Estimate harvestable logs while retaining a specified number of trees per row.',
    (trees, yieldPer, reserve) => {
      same(trees, yieldPer, reserve);
      return trees.map((n, i) => Math.max(0, n - reserve[i]) * yieldPer[i]);
    },
  ),
  command(
    'quota-cut <trees> <logs-per-tree> <target>',
    ['C', 'S', 'c'],
    'Select whole trees in row order until the log target is reached.',
    (trees, yields, target) => {
      same(trees, yields);
      let logs = 0;
      const cuts = trees.map((n, i) => {
        const count = Math.min(n, Math.ceil(Math.max(0, target - logs) / yields[i]));
        logs += count * yields[i];
        return count;
      });
      return { cuts, logs, shortfall: Math.max(0, target - logs) };
    },
  ),
  command(
    'axe-budget <log-counts> <tool-durabilities> <reserve-per-tool>',
    ['C', 'C', 'c'],
    'Compare planned log breaks with usable durability across the tool kit.',
    (logs, tools, reserve) => {
      const usable = sum(tools.map((n) => Math.max(0, n - reserve)));
      return { usable, shortfall: Math.max(0, sum(logs) - usable) };
    },
  ),
  command(
    'unload-rows <row-yields> <carry>',
    ['C', 's'],
    'Unload before a row when its entire yield would exceed remaining capacity.',
    (yields, carry) => {
      let load = 0;
      const before = [];
      for (const [i, n] of yields.entries()) {
        demand(n <= carry, 'One row exceeds the full carry capacity.');
        if (load + n > carry) {
          before.push(i + 1);
          load = 0;
        }
        load += n;
      }
      return { before, finalLoad: load };
    },
  ),
  command(
    'collection-distance <row-lengths> <crossings>',
    ['S', 'C'],
    'Measure a serpentine walk including approach and the distance entering each later row.',
    (lengths, cross) => {
      same(lengths, cross);
      return sum(lengths) - lengths.length + sum(cross);
    },
  ),
  command(
    'ladder-allocation <trunk-heights> <reach> <stock>',
    ['S', 'c', 'c'],
    'Assign ladders in order to whole trunks whose tops exceed unaided reach.',
    (heights, reach, stock) =>
      heights.map((h) => {
        const needed = Math.max(0, h - reach);
        if (needed > stock) return { assigned: 0, accessible: false };
        stock -= needed;
        return { assigned: needed, accessible: true };
      }),
  ),
  command(
    'harvest-priority <ready-logs> <work-ticks>',
    ['C', 'S'],
    'Rank rows by expected logs per work tick with ties in row order.',
    (logs, ticks) => {
      same(logs, ticks);
      return logs
        .map((_, i) => i)
        .sort((a, b) => logs[b] * ticks[a] - logs[a] * ticks[b] || a - b)
        .map((i) => i + 1);
    },
  ),
  command(
    'deadwood-run <failed> <minimum>',
    ['C', 's'],
    'Find consecutive runs of failed planting sites meeting a removal threshold.',
    (failed, min) => {
      const runs = [];
      let length = 0;
      for (let i = 0; i <= failed.length; i++) {
        if (i < failed.length) demand(failed[i] <= 1, 'Use 1 for failed sites and 0 for live sites.');
        if (failed[i] === 1) length++;
        else {
          if (length >= min) runs.push({ first: i - length + 1, last: i });
          length = 0;
        }
      }
      return runs;
    },
  ),
  command(
    'reserve-splits <logs> <keep-logs> <planks-per-log> <plank-quota>',
    ['c', 'c', 's', 'c'],
    'Split the fewest available logs toward a plank quota while protecting raw logs.',
    (logs, keep, yieldPer, quota) => {
      const split = Math.min(Math.max(0, logs - keep), Math.ceil(quota / yieldPer));
      return { split, raw: logs - split, planks: split * yieldPer, shortfall: Math.max(0, quota - split * yieldPer) };
    },
  ),
  command(
    'harvest-waves <row-work> <shift>',
    ['C', 's'],
    'Pack contiguous whole row jobs into shifts without interrupting a row.',
    (work, shift) => {
      let wave = 1,
        used = 0;
      return work.map((n) => {
        demand(n <= shift, 'A row needs more than one shift.');
        if (used + n > shift) {
          wave++;
          used = 0;
        }
        used += n;
        return wave;
      });
    },
  ),
  command(
    'sapling-ledger <initial> <received> <planted>',
    ['c', 'C', 'C'],
    'Track sapling stock and unfilled planting requests over successive rounds.',
    (stock, received, planted) =>
      perRow(received, planted, (supply, need) => {
        stock += supply;
        const filled = Math.min(need, stock);
        stock -= filled;
        return { stock, unfilled: need - filled };
      }),
  ),
];

const greenhouse = [
  command(
    'wall-glazing <width> <length> <height> <openings>',
    ['s', 's', 's', 'c'],
    'Count rectangular shell wall blocks, counting corners once and subtracting openings.',
    (w, l, h, holes) => {
      demand(w >= 3 && l >= 3, 'The shell needs an interior.');
      return openingArea(holes, 2 * (w + l) - 4, h);
    },
  ),
  command(
    'gable-infill <base-width> <step-inset> <ends>',
    ['s', 's', 's'],
    'Count solid stepped gable infill including the full bottom course on each end.',
    (width, inset, ends) => {
      const rows = Math.ceil(width / (2 * inset));
      return ends * (rows * width - inset * (rows - 1) * rows);
    },
  ),
  command(
    'ridge-roof <half-run> <length> <end-overhang>',
    ['s', 's', 'c'],
    'Count one covering block per horizontal column on either side and along a single ridge.',
    (run, l, overhang) => {
      const ridge = l + 2 * overhang;
      return { sides: 2 * run * ridge, ridge, total: (2 * run + 1) * ridge };
    },
  ),
  command(
    'frame-stations <length> <max-bay>',
    ['s', 's'],
    'Place end frames and intermediate frames at maximum pitch with a shorter final bay.',
    (length, pitch) => {
      const last = length - 1;
      return sequence(Math.ceil(last / pitch) + 1, (i) => Math.min(last, i * pitch));
    },
  ),
  command(
    'frame-infill <post-centers> <sill-y> <eave-y>',
    ['C', 'i', 'i'],
    'Count infill between consecutive one-block posts and strictly between sill and eave.',
    (posts, sill, eave) => {
      demand(eave > sill, 'Eave must be above the sill.');
      return posts.slice(1).map((post, i) => {
        demand(post > posts[i], 'Frame posts must increase.');
        return (post - posts[i] - 1) * (eave - sill - 1);
      });
    },
  ),
  command(
    'door-clearance <opening-widths> <opening-heights> <load-width> <load-height>',
    ['C', 'C', 's', 's'],
    'List entrances that pass a rectangular load at its supplied orientation.',
    (widths, heights, w, h) => {
      same(widths, heights);
      return widths.flatMap((width, i) => (width >= w && heights[i] >= h ? [i + 1] : []));
    },
  ),
  command(
    'bed-cross-section <interior-width> <wall-gap> <bed-width> <aisle>',
    ['s', 'c', 's', 's'],
    'Fit equal raised beds across the interior with an aisle between neighbors.',
    (width, gap, bed, aisle) => {
      const usable = Math.max(0, width - 2 * gap);
      const beds = Math.floor((usable + aisle) / (bed + aisle));
      return { beds, spare: usable - beds * bed - Math.max(0, beds - 1) * aisle };
    },
  ),
  command(
    'bench-levels <clear-height> <first-deck> <crop-clearance> <deck-thickness>',
    ['s', 'c', 's', 's'],
    'Count complete growing tiers above a bottom offset including deck thickness and headroom on every tier.',
    (height, offset, clear, deck) => Math.floor(Math.max(0, height - offset) / (clear + deck)),
  ),
  command(
    'planter-fill <inner-lengths> <inner-widths> <soil-depths>',
    ['S', 'S', 'C'],
    'Budget soil fill for each rectangular planter and the full greenhouse.',
    (lengths, widths, depths) => {
      same(lengths, widths, depths);
      const planters = lengths.map((l, i) => l * widths[i] * depths[i]);
      return { planters, total: sum(planters) };
    },
  ),
  command(
    'bed-edging <outer-length> <outer-width> <wall-thickness> <courses>',
    ['s', 's', 's', 's'],
    'Count edging material around an open rectangular bed for a specified number of courses.',
    (l, w, thick, courses) => {
      demand(2 * thick < Math.min(l, w), 'Edging must leave an open bed interior.');
      return (l * w - (l - 2 * thick) * (w - 2 * thick)) * courses;
    },
  ),
  command(
    'channel-stripes <width> <reach>',
    ['s', 'c'],
    'Place the fewest water columns so every floor column lies within the supplied horizontal reach.',
    (width, reach) => {
      const stride = 2 * reach + 1;
      return sequence(Math.ceil(width / stride), (i) => Math.min(width, 1 + reach + i * stride));
    },
  ),
  command(
    'channel-crossings <channel-widths> <walkway-widths>',
    ['S', 'S'],
    'Budget deck blocks for disjoint rectangular walkways crossing each channel.',
    (channels, walks) => sum(channels) * sum(walks),
  ),
  command(
    'water-service <row-lengths> <sources> <reach>',
    ['S', 'C', 'c'],
    'Count uncovered cells on each row served by a single one-based source, using zero for no source.',
    (lengths, sources, reach) =>
      perRow(lengths, sources, (l, src) => {
        demand(src <= l, 'Source position exceeds row length.');
        return src === 0 ? l : l - (Math.min(l, src + reach) - Math.max(1, src - reach) + 1);
      }),
  ),
  command(
    'lamp-drop <ceiling-y> <bed-heights> <clearances>',
    ['i', 'l', 'C'],
    'Find chain lengths from the ceiling to lamps with requested air gaps over beds.',
    (ceiling, beds, clear) =>
      perRow(beds, clear, (bed, gap) => {
        const chain = ceiling - bed - gap - 2;
        demand(Number.isInteger(bed) && chain >= 0, 'Each bed needs a whole elevation and room for its lamp.');
        return chain;
      }),
  ),
  command(
    'shade-panels <row-lengths> <shaded-prefixes> <panel-width>',
    ['S', 'C', 's'],
    'Budget whole shade panels for each requested row prefix and report extra covered cells within the row.',
    (lengths, shaded, width) =>
      perRow(lengths, shaded, (l, n) => {
        demand(n <= l, 'Shaded prefix exceeds row length.');
        const panels = Math.ceil(n / width);
        return { panels, extra: Math.min(l, panels * width) - n };
      }),
  ),
  command(
    'vent-spacing <wall-width> <solid-margin> <vent-width> <min-gap>',
    ['s', 'c', 's', 'c'],
    'Fit full vents and calculate the remaining solid wall width.',
    (width, margin, vent, gap) => {
      const usable = Math.max(0, width - 2 * margin);
      const vents = Math.floor((usable + gap) / (vent + gap));
      return { vents, solid: width - vent * vents };
    },
  ),
  command(
    'glass-orders <missing-panes> <panes-per-craft> <glass-per-craft> <glass-stock>',
    ['c', 's', 's', 'c'],
    'Budget whole pane crafts and glass purchases for a repair order.',
    (missing, per, cost, stock) => {
      const crafts = Math.ceil(missing / per);
      return { crafts, sparePanes: crafts * per - missing, buyGlass: Math.max(0, crafts * cost - stock) };
    },
  ),
  command(
    'seed-trays <seed-stocks> <cells-per-tray> <seeds-per-cell>',
    ['C', 's', 'S'],
    'Count full trays, partial cells planted and unused seeds separately by variety.',
    (stocks, tray, needs) =>
      perRow(stocks, needs, (n, per) => {
        const cells = Math.floor(n / per);
        return { fullTrays: Math.floor(cells / tray), partialCells: cells % tray, looseSeeds: n % per };
      }),
  ),
  command(
    'transplant-order <ready-seedlings> <bed-capacities>',
    ['C', 'C'],
    'Move seedlings in variety order into consecutive beds, allowing shared beds.',
    (ready, capacity) => {
      const space = [...capacity];
      let bed = 0;
      const placements = [];
      for (const [i, n] of ready.entries()) {
        let remaining = n;
        while (remaining > 0 && bed < space.length) {
          const moved = Math.min(space[bed], remaining);
          if (moved > 0) placements.push({ variety: i + 1, bed: bed + 1, moved });
          remaining -= moved;
          space[bed] -= moved;
          if (space[bed] === 0) bed++;
        }
      }
      return { placements, unusedCells: sum(space), unplaced: Math.max(0, sum(ready) - sum(capacity)) };
    },
  ),
  command(
    'cycle-calendar <sow-days> <grow-days> <reset-days>',
    ['C', 'S', 'C'],
    'Find first harvest and next sowing days for independent beds.',
    (sow, grow, reset) => {
      same(sow, grow, reset);
      return sow.map((s, i) => ({ harvest: s + grow[i], resow: s + grow[i] + reset[i] }));
    },
  ),
  command(
    'crop-turns <first-ready> <regrow> <closing-day>',
    ['C', 'S', 'c'],
    'Count harvests through an inclusive closing day for regrowing crops.',
    (ready, period, end) =>
      perRow(ready, period, (start, gap) => (end < start ? 0 : 1 + Math.floor((end - start) / gap))),
  ),
  command(
    'crop-changeover <old-varieties> <new-varieties> <bed-cells>',
    ['S', 'S', 'C'],
    'Identify beds switching crop and total cells requiring replanting.',
    (old, next, cells) => {
      same(old, next, cells);
      const beds = old.flatMap((v, i) => (v === next[i] ? [] : [i + 1]));
      return { beds, cells: sum(beds.map((b) => cells[b - 1])) };
    },
  ),
  command(
    'compost-runs <surplus> <keep> <items-per-run> <yield-per-run>',
    ['C', 'C', 's', 'c'],
    'Pool interchangeable surplus after per-bin reserves and budget complete compost runs at supplied yields.',
    (surplus, keep, per, yieldPer) => {
      const items = sum(perRow(surplus, keep, (n, r) => Math.max(0, n - r)));
      const runs = Math.floor(items / per);
      return { runs, remaining: items % per, output: runs * yieldPer };
    },
  ),
  command(
    'picking-window <ready-days> <last-days> <visit-day>',
    ['C', 'C', 'c'],
    'Classify each crop lot as waiting, pickable, or overdue on the visit day.',
    (ready, last, day) =>
      perRow(ready, last, (start, end) => {
        demand(start <= end, 'The last picking day must follow or equal the first.');
        if (day < start) return 'waiting';
        if (day > end) return 'overdue';
        return 'pickable';
      }),
  ),
  command(
    'aisle-cart <widths> <cart-width> <side-clearance>',
    ['S', 's', 'c'],
    'Report the smallest widening per aisle needed to carry a cart with two side clearances.',
    (widths, cart, clear) => widths.map((w) => Math.max(0, cart + 2 * clear - w)),
  ),
];

export const gardenGroups = [
  {
    name: 'orchardplan',
    note: 'Offline orchard layout, harvest and replanting from supplied assumptions.',
    commands: orchard,
  },
  {
    name: 'greenhouse',
    note: 'Offline greenhouse construction and crop scheduling from supplied assumptions.',
    commands: greenhouse,
  },
];
