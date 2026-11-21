import { demand, same, sequence, sum } from './offline-kit.js';

const command = (signature, types, description, run) => ({ signature, types, description, run });
const mod = (value, period) => ((value % period) + period) % period;

function colors(ids) {
  demand(
    ids.every((id) => id <= 16),
    'Use at most 16 colors, numbered 1 through 16.',
  );
}

function heightOf(width, cells) {
  demand(cells.length % width === 0, 'Supply complete rows of the given width.');
  colors(cells);
  return cells.length / width;
}

function grid(width, height, colorAt) {
  return sequence(width * height, (i) => colorAt(i % width, Math.floor(i / width)));
}

function countColors(cells) {
  colors(cells);
  const totals = Array(16).fill(0);
  for (const id of cells) totals[id - 1]++;
  return totals;
}

function compactCounts(cells) {
  return countColors(cells).flatMap((count, i) => (count ? [{ color: i + 1, count }] : []));
}

function alignedShift(left, right) {
  same(left, right);
  colors(left);
  colors(right);
  let best = { shift: 0, matches: -1 };
  for (let shift = 0; shift < right.length; shift++) {
    let matches = 0;
    for (const [i, color] of left.entries()) if (color === right[(i + shift) % right.length]) matches++;
    if (matches > best.matches) best = { shift, matches };
  }
  return best;
}

const commands = [
  command(
    'stripe-layout <width> <height> <colors> <band-widths>',
    ['s', 's', 'S', 'S'],
    'Repeat vertical color bands with individually sized widths.',
    (w, h, ids, widths) => {
      same(ids, widths);
      colors(ids);
      let band = 0;
      let remaining = widths[0];
      const row = sequence(w, () => {
        const color = ids[band];
        if (--remaining === 0) {
          band = (band + 1) % ids.length;
          remaining = widths[band];
        }
        return color;
      });
      return grid(w, h, (x) => row[x]);
    },
  ),
  command(
    'checker-layout <width> <height> <tile-width> <tile-height> <colors>',
    ['s', 's', 's', 's', 'S'],
    'Alternate two colors in rectangular checks cropped at the floor edges.',
    (w, h, dx, dy, ids) => {
      colors(ids);
      demand(ids.length === 2, 'Supply two check colors.');
      return grid(w, h, (x, y) => ids[(Math.floor(x / dx) + Math.floor(y / dy)) % 2]);
    },
  ),
  command(
    'ring-layout <width> <height> <band-depth> <colors>',
    ['s', 's', 's', 'S'],
    'Lay concentric rectangular color bands inward from all four floor edges.',
    (w, h, d, ids) => {
      colors(ids);
      return grid(w, h, (x, y) => ids[Math.floor(Math.min(x, w - 1 - x, y, h - 1 - y) / d) % ids.length]);
    },
  ),
  command(
    'chevron-layout <width> <height> <rise> <colors>',
    ['s', 's', 's', 'S'],
    'Bend repeating horizontal color lines into chevrons with a supplied rise.',
    (w, h, rise, ids) => {
      colors(ids);
      return grid(w, h, (x, y) => ids[mod(y - Math.min(x % (2 * rise), 2 * rise - (x % (2 * rise))), ids.length)]);
    },
  ),
  command(
    'twill-layout <width> <height> <over> <under> <row-step> <colors>',
    ['s', 's', 's', 's', 'i', 'S'],
    'Shift a two-color over-under weave by a signed offset on successive rows.',
    (w, h, over, under, step, ids) => {
      colors(ids);
      demand(ids.length === 2, 'Supply warp and weft colors.');
      return grid(w, h, (x, y) => ids[mod(x - y * step, over + under) < over ? 0 : 1]);
    },
  ),
  command(
    'diamond-layout <width> <height> <center-column> <center-row> <colors>',
    ['s', 's', 's', 's', 'S'],
    'Alternate diamond outlines at increasing block distances from a chosen center.',
    (w, h, col, row, ids) => {
      colors(ids);
      demand(col <= w && row <= h, 'Center must lie on the floor.');
      return grid(w, h, (x, y) => ids[(Math.abs(x + 1 - col) + Math.abs(y + 1 - row)) % ids.length]);
    },
  ),
  command(
    'gingham-layout <width> <height> <band> <gap> <colors>',
    ['s', 's', 's', 's', 'S'],
    'Cross repeating warp and weft bands using ground, stripe and intersection colors.',
    (w, h, band, gap, ids) => {
      colors(ids);
      demand(ids.length === 3, 'Supply ground, stripe and intersection colors.');
      return grid(w, h, (x, y) => ids[Number(x % (band + gap) < band) + Number(y % (band + gap) < band)]);
    },
  ),
  command(
    'tile-motif <width> <height> <motif-width> <motif> <course-shift>',
    ['s', 's', 's', 'S', 'i'],
    'Tile a swatch, shifting it horizontally after each completed course of motifs.',
    (w, h, mw, cells, shift) => {
      const mh = heightOf(mw, cells);
      return grid(w, h, (x, y) => cells[(y % mh) * mw + mod(x - Math.floor(y / mh) * shift, mw)]);
    },
  ),
  command(
    'loom-draft <threading> <lift-masks> <warp-colors> <weft-colors>',
    ['S', 'C', 'S', 'S'],
    'Render a shaft-loom drawdown from column threading, lifted shafts and yarn colors.',
    (shafts, masks, warp, weft) => {
      same(shafts, warp);
      same(masks, weft);
      colors(warp);
      colors(weft);
      demand(
        shafts.every((s) => s <= 16) && masks.every((m) => m <= 65535),
        'Use shafts 1 through 16 and 16-bit lift masks.',
      );
      return grid(shafts.length, masks.length, (x, y) => (masks[y] & (1 << (shafts[x] - 1)) ? warp[x] : weft[y]));
    },
  ),
  command(
    'braid-layout <strand-colors> <rows>',
    ['S', 's'],
    'Lay a three-strand runner, alternating the left and right crossings after each row.',
    (ids, h) => {
      demand(ids.length === 3, 'Supply exactly three strand colors.');
      colors(ids);
      const strands = [...ids];
      return grid(3, h, (x, y) => {
        if (x === 0 && y > 0) {
          const side = (y - 1) % 2;
          [strands[side], strands[side + 1]] = [strands[side + 1], strands[side]];
        }
        return strands[x];
      });
    },
  ),
  command(
    'bookmatch <half-width> <half> <shared-center>',
    ['s', 'S', 'c'],
    'Reflect a half-pattern across its right edge or through its last column.',
    (w, cells, shared) => {
      const h = heightOf(w, cells);
      demand(shared <= 1, 'Use 0 for an edge or 1 for a shared center column.');
      const full = 2 * w - shared;
      return grid(full, h, (x, y) => cells[y * w + (x < w ? x : full - 1 - x)]);
    },
  ),
  command(
    'fringe-ends <width> <cells> <spacing> <fringe-color>',
    ['s', 'S', 's', 's'],
    'List fringe placements immediately above the top row and below the bottom row.',
    (w, cells, spacing, id) => {
      const h = heightOf(w, cells);
      colors([id]);
      const tassels = Math.ceil(w / spacing);
      return sequence(2 * tassels, (i) => ({
        column: 1 + (i % tassels) * spacing,
        row: i < tassels ? 0 : h + 1,
        color: id,
      }));
    },
  ),
  command(
    'palette-remap <cells> <source-colors> <target-colors>',
    ['S', 'S', 'S'],
    'Replace selected colors simultaneously, allowing swaps and palette consolidation.',
    (cells, src, dst) => {
      same(src, dst);
      colors(cells);
      colors(src);
      colors(dst);
      demand(new Set(src).size === src.length, 'Each source color must occur once.');
      const palette = new Map(src.map((id, i) => [id, dst[i]]));
      return cells.map((id) => palette.get(id) ?? id);
    },
  ),
  command(
    'color-takeoff <cells>',
    ['S'],
    'Count the carpets needed for each color appearing in the design.',
    compactCounts,
  ),
  command(
    'warp-floats <width> <cells> <warp-colors>',
    ['s', 'S', 'S'],
    'Measure the longest continuous run matching the warp color in each column.',
    (w, cells, warp) => {
      const h = heightOf(w, cells);
      demand(warp.length === w, 'Supply one warp color per column.');
      colors(warp);
      return sequence(w, (x) => {
        let longest = 0,
          current = 0;
        for (let y = 0; y < h; y++) {
          current = cells[y * w + x] === warp[x] ? current + 1 : 0;
          longest = Math.max(longest, current);
        }
        return longest;
      });
    },
  ),
  command(
    'runner-alignment <hall-widths> <runner-width> <clearance>',
    ['S', 's', 'c'],
    'Find centered runner margins in each hall section, rejecting sections below the clearance.',
    (widths, runner, clearance) => {
      // Section centers share a datum; odd spare blocks go on the right.
      return widths.map((width) => {
        const spare = width - runner;
        if (spare < 2 * clearance) return null;
        const left = Math.floor(spare / 2);
        return { left, right: spare - left };
      });
    },
  ),
  command(
    'shearing-rounds <wool-needed> <colored-sheep> <yield-per-sheep>',
    ['C', 'C', 's'],
    'Estimate flock shearing rounds per color at a caller-supplied yield per sheep per round.',
    (need, sheep, perSheep) => {
      same(need, sheep);
      demand(need.length <= 16, 'Supply at most 16 color totals.');
      return need.map((qty, i) => (qty === 0 ? 0 : sheep[i] === 0 ? null : Math.ceil(qty / (sheep[i] * perSheep))));
    },
  ),
  command(
    'reuse-balance <design> <observed>',
    ['S', 'C'],
    'Balance salvaged wrong-color carpets against replacements, excluding cells already correct.',
    (design, observed) => {
      same(design, observed);
      colors(design);
      colors(observed);
      const need = Array(16).fill(0),
        salvage = Array(16).fill(0);
      for (const [i, id] of design.entries()) {
        if (id === observed[i]) continue;
        need[id - 1]++;
        if (observed[i]) salvage[observed[i] - 1]++;
      }
      return need.flatMap((qty, i) => {
        if (!qty && !salvage[i]) return [];
        const reuse = Math.min(qty, salvage[i]);
        return [{ color: i + 1, reuse, bring: qty - reuse, return: salvage[i] - reuse }];
      });
    },
  ),
  command(
    'wool-orders <cells> <carpet-stock>',
    ['S', 'C'],
    'Budget two wool per three carpets separately by color after using loose stock.',
    (cells, stock) => {
      demand(stock.length <= 16, 'Supply stock for at most 16 colors.');
      return compactCounts(cells).map(({ color, count }) => {
        const short = Math.max(0, count - (stock[color - 1] ?? 0));
        const batches = Math.ceil(short / 3);
        return { color, batches, wool: 2 * batches, craftedSurplus: 3 * batches - short };
      });
    },
  ),
  command(
    'haul-slots <cells> <stack-limit> <slots-per-trip>',
    ['S', 's', 's'],
    'Pack same-color carpet stacks into delivery trips without combining partial stacks across colors.',
    (cells, limit, slots) => {
      const stacks = sum(compactCounts(cells).map(({ count }) => Math.ceil(count / limit)));
      return { stacks, trips: Math.ceil(stacks / slots) };
    },
  ),
  command(
    'stock-frontier <width> <cells> <stock>',
    ['s', 'S', 'C'],
    'Find the first row-major placement that runs out of its color and return the completed count.',
    (w, cells, stock) => {
      heightOf(w, cells);
      demand(stock.length <= 16, 'Supply stock for at most 16 colors.');
      const remaining = [...stock];
      for (const [i, color] of cells.entries()) {
        if (!remaining[color - 1])
          return { placed: i, blocked: { column: (i % w) + 1, row: Math.floor(i / w) + 1, color } };
        remaining[color - 1]--;
      }
      return { placed: cells.length, blocked: null };
    },
  ),
  command(
    'patch-junctions <upper-panel-widths> <lower-panel-widths>',
    ['S', 'S'],
    'Locate four-way seam junctions where adjacent patchwork rows have identical join offsets.',
    (upper, lower) => {
      demand(sum(upper) === sum(lower), 'Patchwork rows must span the same width.');
      function seams(row) {
        let end = 0;
        return row.slice(0, -1).map((width) => {
          end += width;
          return end;
        });
      }
      const top = new Set(seams(upper));
      return seams(lower).filter((offset) => top.has(offset));
    },
  ),
  command(
    'align-edges <first-edge> <second-edge>',
    ['S', 'S'],
    'Find the earliest cyclic left shift of the second edge maximizing color matches.',
    alignedShift,
  ),
  command(
    'repeat-unit <edge>',
    ['S'],
    'Recover the shortest color sequence that repeats exactly to fill a sample edge.',
    (edge) => {
      colors(edge);
      for (let period = 1; period < edge.length; period++)
        if (edge.length % period === 0 && edge.every((id, i) => id === edge[i % period])) return edge.slice(0, period);
      return edge;
    },
  ),
  command(
    'dye-lots <wool-needed> <colored-stock> <dyes> <blank-wool>',
    ['C', 'C', 'C', 'c'],
    'Assign undyed wool and matching dyes to shortages in caller-supplied color priority order.',
    (need, stock, dyes, blank) => {
      same(need, stock, dyes);
      demand(need.length <= 16, 'Supply at most 16 color totals.');
      let remaining = blank;
      const lots = need.map((qty, i) => {
        const deficit = Math.max(0, qty - stock[i]);
        const dye = Math.min(deficit, dyes[i], remaining);
        remaining -= dye;
        return { dye, missing: deficit - dye };
      });
      return { lots, blankLeft: remaining };
    },
  ),
];

export const textileGroup = {
  name: 'textile',
  note: 'Offline carpet pattern layouts, wool orders and installation checks from supplied swatches and color IDs.',
  commands,
};
