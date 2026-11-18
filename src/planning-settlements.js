import { demand, same, sequence, sum } from './offline-kit.js';

const command = (signature, types, description, run) => ({ signature, types, description, run });
const batches = (count, capacity) => Math.ceil(count / capacity);
const mod = (value, base) => ((value % base) + base) % base;

function indices(count) {
  return sequence(count, (i) => i);
}

function scaledSpan(level) {
  demand(level <= 4, 'Map scale must be 0 through 4.');
  return 128 * 2 ** level;
}

function tileBounds(low, high, origin, side) {
  demand(low <= high, 'The bounds must be ordered.');
  return [Math.floor((low - origin) / side), Math.floor((high - origin) / side)];
}

function wallCell(number, columns) {
  return { row: Math.floor((number - 1) / columns) + 1, column: ((number - 1) % columns) + 1 };
}

function locateEntry(lengths, page) {
  let offset = page;
  for (const [index, length] of lengths.entries()) {
    if (offset <= length) return { entry: index + 1, offset };
    offset -= length;
  }
  throw new Error('Page exceeds the publication length.');
}

function countsById(ids, quantities) {
  if (quantities) same(ids, quantities);
  const counts = new Map();
  for (const [i, id] of ids.entries()) counts.set(id, (counts.get(id) ?? 0) + (quantities?.[i] ?? 1));
  return counts;
}

const mapCommands = [
  command(
    'scale-span <level>',
    ['c'],
    'Report the side in blocks and the blocks per pixel of a square map.',
    (level) => ({ blocks: scaledSpan(level), blocksPerPixel: 2 ** level }),
  ),
  command(
    'minimum-scale <width> <depth>',
    ['s', 's'],
    'Find the smallest scale whose side can contain both extents when freely positioned.',
    (width, depth) => {
      const level = [0, 1, 2, 3, 4].find((i) => scaledSpan(i) >= Math.max(width, depth));
      return level ?? null;
    },
  ),
  command(
    'tile-address <block> <grid-origin> <tile-side>',
    ['i', 'i', 's'],
    'Locate a block on one grid axis by signed tile index and zero-based local offset.',
    (block, origin, side) => ({ tile: Math.floor((block - origin) / side), offset: mod(block - origin, side) }),
  ),
  command(
    'tile-corners <tile-x> <tile-z> <origin-x> <origin-z> <side>',
    ['i', 'i', 'i', 'i', 's'],
    'Find inclusive block bounds for one tile on the supplied grid.',
    (x, z, ox, oz, side) => ({
      west: ox + x * side,
      north: oz + z * side,
      east: ox + (x + 1) * side - 1,
      south: oz + (z + 1) * side - 1,
    }),
  ),
  command(
    'region-tiles <west> <east> <north> <south> <origin-x> <origin-z> <side>',
    ['i', 'i', 'i', 'i', 'i', 'i', 's'],
    'Count the tiles touched by an inclusive block rectangle on a fixed grid.',
    (w, e, n, s, ox, oz, side) => {
      const [x0, x1] = tileBounds(w, e, ox, side);
      const [z0, z1] = tileBounds(n, s, oz, side);
      return { columns: x1 - x0 + 1, rows: z1 - z0 + 1, tiles: (x1 - x0 + 1) * (z1 - z0 + 1) };
    },
  ),
  command(
    'pixel-address <block> <tile-start> <level>',
    ['i', 'i', 'c'],
    'Return the zero-based pixel on one axis within an identified tile.',
    (block, start, level) => {
      demand(block >= start && block - start < scaledSpan(level), 'Block must lie inside the tile.');
      return Math.floor((block - start) / 2 ** level);
    },
  ),
  command(
    'pixel-footprint <pixel> <tile-start> <level>',
    ['c', 'i', 'c'],
    'Return inclusive block bounds along one axis for a pixel.',
    (pixel, start, level) => {
      demand(pixel < 128, 'Pixels range from 0 through 127.');
      const width = scaledSpan(level) / 128;
      return { first: start + pixel * width, last: start + (pixel + 1) * width - 1 };
    },
  ),
  command(
    'wall-number <row> <column> <columns>',
    ['s', 's', 's'],
    'Assign a one-based row-major frame number.',
    (row, column, columns) => {
      demand(column <= columns, 'Column exceeds wall width.');
      return (row - 1) * columns + column;
    },
  ),
  command('wall-cell <frame> <columns>', ['s', 's'], 'Locate a numbered frame on a row-major wall.', wallCell),
  command(
    'survey-order <columns> <rows>',
    ['s', 's'],
    'List wall frame numbers in alternating eastbound and westbound survey rows.',
    (columns, rows) =>
      indices(columns * rows).map((i) =>
        Math.floor(i / columns) % 2 === 0 ? i + 1 : (Math.floor(i / columns) + 1) * columns - (i % columns),
      ),
  ),
  command(
    'wall-border <columns> <rows> <thickness>',
    ['s', 's', 'c'],
    'Count backing blocks for a solid outer frame around a tiled wall.',
    (c, r, t) => (c + 2 * t) * (r + 2 * t) - c * r,
  ),
  command(
    'spare-frames <frames> <broken-ids>',
    ['s', 'indexes'],
    'Count replacement frames from a damage report with repeated frame numbers.',
    (frames, ids) => {
      demand(
        ids.every((id) => id >= 1 && id <= frames),
        'Frame IDs must lie on the wall.',
      );
      return new Set(ids).size;
    },
  ),
  command(
    'map-copies <editions> <owned>',
    ['C', 'C'],
    'Budget blank maps for additional copies of each owned original.',
    (wanted, owned) => {
      same(wanted, owned);
      demand(
        wanted.every((v, i) => !v || owned[i] > 0),
        'Each requested edition needs an existing original.',
      );
      return wanted.map((v, i) => Math.max(0, v - owned[i]));
    },
  ),
  command(
    'lock-supplies <display-counts> <already-locked>',
    ['C', 'C'],
    'Count panes for individually locking each outstanding display map.',
    (counts, locked) => {
      same(counts, locked);
      demand(
        locked.every((v, i) => v <= counts[i]),
        'Locked maps exceed display count.',
      );
      return sum(counts) - sum(locked);
    },
  ),
  command(
    'zoom-stages <levels> <target>',
    ['C', 'c'],
    'Count cartography table enlargement steps for maps moving to a shared target scale.',
    (levels, target) => {
      scaledSpan(target);
      demand(
        levels.every((level) => level <= target),
        'Existing levels must be at or below the target.',
      );
      return sum(levels.map((level) => target - level));
    },
  ),
  command(
    'atlas-pages <columns> <rows> <page-width> <page-height>',
    ['s', 's', 's', 's'],
    'Divide a rectangular atlas into rectangular print panels and count unused panel cells.',
    (c, r, w, h) => {
      const pages = batches(c, w) * batches(r, h);
      return { pages, unused: pages * w * h - c * r };
    },
  ),
  command(
    'seam-length <columns> <rows> <tile-side>',
    ['s', 's', 's'],
    'Measure internal tile boundaries in blocks, counting each shared edge once.',
    (c, r, side) => ((c - 1) * r + (r - 1) * c) * side,
  ),
  command(
    'marker-clusters <offsets> <bucket-width>',
    ['l', 's'],
    'Count markers per occupied signed strip along a survey axis in ascending strip order.',
    (offsets, w) =>
      [...countsById(offsets.map((x) => Math.floor(x / w)))]
        .sort(([a], [b]) => a - b)
        .map(([strip, markers]) => ({ strip, markers })),
  ),
  command(
    'waypoint-pages <offsets> <origin> <side>',
    ['l', 'i', 's'],
    'List distinct map strips in order of first waypoint visit.',
    (offsets, origin, side) => [...new Set(offsets.map((x) => Math.floor((x - origin) / side)))],
  ),
  command(
    'missing-tiles <wall-size> <mounted-ids>',
    ['s', 'indexes'],
    'List unmounted frame numbers in ascending order.',
    (size, ids) => {
      const mounted = new Set(ids);
      demand(
        ids.every((id) => id >= 1 && id <= size),
        'Mounted IDs must lie on the wall.',
      );
      demand(size - mounted.size <= 1000, 'Missing tile list exceeds 1000 entries.');
      const missing = [];
      for (let id = 1; id <= size; id++) if (!mounted.has(id)) missing.push(id);
      return missing;
    },
  ),
  command(
    'refresh-queue <last-surveys> <today> <max-age>',
    ['C', 'c', 'c'],
    'Return the oldest map numbers first among those older than the age limit.',
    (days, today, age) => {
      demand(
        days.every((day) => day <= today),
        'Survey dates must precede or equal today.',
      );
      return days
        .map((day, i) => ({ day, id: i + 1 }))
        .filter((row) => today - row.day > age)
        .sort((a, b) => a.day - b.day)
        .map((row) => row.id);
    },
  ),
  command(
    'tile-overlap <a-start> <a-side> <b-start> <b-side>',
    ['i', 's', 'i', 's'],
    'Measure overlap of two tile intervals in blocks along one axis.',
    (a, as, b, bs) => Math.max(0, Math.min(a + as, b + bs) - Math.max(a, b)),
  ),
  command(
    'wall-extension <columns> <rows> <west> <east> <north> <south>',
    ['s', 's', 'c', 'c', 'c', 'c'],
    'Count new frames and find the old top-left frame number after extending the wall.',
    (c, r, w, e, n, s) => ({ added: (c + w + e) * (r + n + s) - c * r, oldFirst: n * (c + w + e) + w + 1 }),
  ),
  command(
    'survey-distance <columns> <rows> <x-spacing> <z-spacing>',
    ['s', 's', 's', 's'],
    'Measure blocks walked between tile centers on a serpentine pass.',
    (c, r, x, z) => r * (c - 1) * x + (r - 1) * z,
  ),
  command(
    'orientation-turns <mounted> <wanted> <positions>',
    ['C', 'C', 's'],
    'Count forward item-frame clicks per map on a cyclic orientation dial.',
    (mounted, wanted, n) => {
      same(mounted, wanted);
      demand(
        [...mounted, ...wanted].every((v) => v < n),
        'Orientations must be below the number of positions.',
      );
      return wanted.map((v, i) => mod(v - mounted[i], n));
    },
  ),
];

const bookCommands = [
  command(
    'chapter-starts <chapter-pages> <front-pages>',
    ['S', 'c'],
    'Assign each chapter its first numbered page after the front matter.',
    (pages, front) => {
      let next = front + 1;
      return pages.map((length) => {
        const first = next;
        next += length;
        return first;
      });
    },
  ),
  command(
    'page-entry <chapter-pages> <page>',
    ['S', 's'],
    'Locate the chapter and local page of a page number.',
    locateEntry,
  ),
  command(
    'facing-starts <chapter-pages>',
    ['S'],
    'Start every chapter on an odd page and count inserted blank pages.',
    (pages) => {
      let next = 1,
        blanks = 0;
      const first = pages.map((length) => {
        if (next % 2 === 0) {
          next++;
          blanks++;
        }
        const start = next;
        next += length;
        return start;
      });
      return { first, blanks };
    },
  ),
  command(
    'volume-split <chapter-pages> <limit>',
    ['S', 's'],
    'Pack whole chapters into consecutive volumes, starting a new volume when needed.',
    (pages, limit) => {
      demand(
        pages.every((n) => n <= limit),
        'Every chapter must fit a volume.',
      );
      let used = 0,
        volume = 1;
      return pages.map((n) => {
        if (used + n > limit) {
          volume++;
          used = 0;
        }
        used += n;
        return volume;
      });
    },
  ),
  command(
    'continued-chapter <start-page> <length> <pages-per-volume>',
    ['s', 's', 's'],
    'Locate the two endpoints of a chapter allowed to span volumes.',
    (start, length, limit) => {
      const endpoint = (page) => ({ volume: batches(page, limit), page: ((page - 1) % limit) + 1 });
      return { first: endpoint(start), last: endpoint(start + length - 1) };
    },
  ),
  command(
    'paragraph-pages <lines> <page-height>',
    ['S', 's'],
    'Place unsplit paragraphs in order and report used lines on each page.',
    (lines, height) => {
      demand(
        lines.every((n) => n <= height),
        'Every paragraph must fit on one page.',
      );
      const used = [0];
      for (const n of lines) {
        if (used.at(-1) + n > height) used.push(0);
        used[used.length - 1] += n;
      }
      return used;
    },
  ),
  command(
    'contents-pages <chapters> <entries-per-page> <fixed-front-pages>',
    ['c', 's', 'c'],
    'Reserve numbered contents pages after fixed front matter and locate the first body page.',
    (chapters, per, front) => ({ contents: batches(chapters, per), bodyStart: front + batches(chapters, per) + 1 }),
  ),
  command(
    'index-hits <page-numbers>',
    ['S'],
    'Deduplicate index references, sort them and compress adjacent pages into inclusive ranges.',
    (pages) => {
      const ranges = [];
      for (const page of [...new Set(pages)].sort((a, b) => a - b)) {
        const last = ranges.at(-1);
        if (last && page === last.end + 1) last.end = page;
        else ranges.push({ start: page, end: page });
      }
      return ranges;
    },
  ),
  command(
    'errata-volumes <page-numbers> <volume-pages>',
    ['S', 'S'],
    'Identify volumes needing reissue for a list of corrected global page numbers.',
    (pages, lengths) => [...new Set(pages.map((p) => locateEntry(lengths, p).entry))].sort((a, b) => a - b),
  ),
  command(
    'signature-folds <pages> <sheets-per-signature>',
    ['s', 's'],
    'Budget four numbered faces per folded sheet and full signatures for a print mockup.',
    (pages, sheets) => {
      const signatures = batches(pages, 4 * sheets);
      return { signatures, sheets: signatures * sheets, blankFaces: 4 * sheets * signatures - pages };
    },
  ),
  command(
    'copy-materials <copies-by-title> <blank-books> <inks> <feathers>',
    ['C', 'c', 'c', 'c'],
    'Budget one writable blank per requested extra copy using the supplied material stocks.',
    (copies, books, inks, feathers) => {
      const wanted = sum(copies);
      return {
        ready: Math.min(wanted, books, inks, feathers),
        missingBooks: Math.max(0, wanted - books),
        missingInks: Math.max(0, wanted - inks),
        missingFeathers: Math.max(0, wanted - feathers),
      };
    },
  ),
  command(
    'edition-run <originals> <copies-per-operation> <orders>',
    ['c', 's', 'C'],
    'Count parallel copying rounds when each original supports one batch per round for the same title.',
    (originals, per, orders) => {
      const wanted = sum(orders);
      if (!wanted) return 0;
      return originals ? batches(wanted, originals * per) : null;
    },
  ),
  command(
    'print-priority <orders> <writable-blanks>',
    ['C', 'c'],
    'Allocate writable blanks to title orders in order, allowing partial fulfillment.',
    (orders, blanks) =>
      orders.map((n) => {
        const copies = Math.min(n, blanks);
        blanks -= copies;
        return copies;
      }),
  ),
  command(
    'library-sets <stock-per-title> <copies-per-set>',
    ['C', 'S'],
    'Count complete sets of titles and the remaining books after assembling them.',
    (stock, per) => {
      same(stock, per);
      const sets = Math.min(...stock.map((n, i) => Math.floor(n / per[i])));
      return { sets, remaining: stock.map((n, i) => n - sets * per[i]) };
    },
  ),
  command(
    'shelf-labels <volumes-per-series> <shelf-width>',
    ['S', 's'],
    'Locate the first and last shelf for each contiguous series on a shared rack.',
    (series, width) => {
      let used = 0;
      return series.map((n) => {
        const first = Math.floor(used / width) + 1;
        used += n;
        return { first, last: batches(used, width) };
      });
    },
  ),
  command(
    'chiseled-slot <book> <slots-per-shelf> <shelves-per-row>',
    ['s', 's', 's'],
    'Address a one-based book number by rack row, shelf column and slot.',
    (book, slots, shelves) => ({ ...wallCell(batches(book, slots), shelves), slot: ((book - 1) % slots) + 1 }),
  ),
  command(
    'lectern-signals <pages> <page>',
    ['s', 's'],
    'Estimate the lectern comparator signal for a specified page of a nonempty book.',
    (pages, page) => {
      demand(page <= pages, 'Page exceeds book length.');
      return pages === 1 ? 15 : 1 + Math.floor((14 * (page - 1)) / (pages - 1));
    },
  ),
  command(
    'reading-clocks <pages-per-reader> <ticks-per-page> <start>',
    ['C', 's', 'c'],
    'Schedule successive readers sharing one lectern.',
    (pages, ticks, start) => {
      let clock = start;
      return pages.map((n) => {
        const begin = clock;
        clock += n * ticks;
        return { begin, end: clock };
      });
    },
  ),
  command(
    'copy-collation <observed-pages> <expected-count>',
    ['indexes', 's'],
    'Report the first out-of-order, missing or excess page in an observed sequence.',
    (observed, count) => {
      demand(
        observed.every((page) => page > 0),
        'Page numbers must be positive.',
      );
      const mismatch = observed.findIndex((p, i) => p !== i + 1 || i >= count);
      if (mismatch >= 0)
        return { position: mismatch + 1, expected: mismatch < count ? mismatch + 1 : null, actual: observed[mismatch] };
      return observed.length < count
        ? { position: observed.length + 1, expected: observed.length + 1, actual: null }
        : null;
    },
  ),
  command(
    'revised-pagination <old-pages> <new-pages>',
    ['S', 'S'],
    'Measure chapter start shifts and the total change in pages after revision.',
    (oldPages, newPages) => {
      same(oldPages, newPages);
      let delta = 0;
      const shifts = oldPages.map((old, i) => {
        const earlier = delta;
        delta += newPages[i] - old;
        return earlier;
      });
      return { shifts, delta };
    },
  ),
  command(
    'citation-remap <old-chapters> <new-chapters> <old-page>',
    ['S', 'C', 's'],
    'Map a citation by chapter and local page when pages are added or removed at chapter ends.',
    (oldPages, newPages, page) => {
      same(oldPages, newPages);
      const { entry, offset } = locateEntry(oldPages, page);
      return offset > newPages[entry - 1] ? null : sum(newPages.slice(0, entry - 1)) + offset;
    },
  ),
  command(
    'serial-range <first> <run-sizes>',
    ['s', 'S'],
    'Reserve consecutive inclusive copy serials per edition run.',
    (first, runs) =>
      runs.map((n) => {
        const start = first;
        first += n;
        return { first: start, last: first - 1 };
      }),
  ),
  command(
    'loan-balances <shelf-counts> <returns> <requests>',
    ['C', 'C', 'C'],
    'Process returns then loans per title and report unfilled loans and stock left.',
    (stock, returns, requests) => {
      same(stock, returns, requests);
      return stock.map((n, i) => {
        const balance = n + returns[i] - requests[i];
        return { left: Math.max(0, balance), unfilled: Math.max(0, -balance) };
      });
    },
  ),
  command(
    'folio-imposition <sheets> <sheet-number>',
    ['s', 's'],
    'Pair pages on both sides of a chosen nested folded sheet, numbering sheets from the outside.',
    (sheets, sheet) => {
      demand(sheet <= sheets, 'Sheet number exceeds the signature.');
      const low = 2 * sheet - 1,
        high = 4 * sheets - low + 1;
      return { front: [high, low], back: [low + 1, high - 1] };
    },
  ),
  command(
    'abridgement <chapter-pages> <required-pages> <target>',
    ['S', 'C', 'c'],
    'Trim from the last chapters first while retaining each required minimum.',
    (pages, keep, target) => {
      same(pages, keep);
      demand(
        keep.every((n, i) => n <= pages[i]),
        'Minimum pages exceed a chapter length.',
      );
      if (sum(keep) > target) return null;
      const revised = [...pages];
      let excess = Math.max(0, sum(pages) - target);
      for (let i = pages.length - 1; i >= 0 && excess > 0; i--) {
        const cut = Math.min(excess, pages[i] - keep[i]);
        revised[i] -= cut;
        excess -= cut;
      }
      return revised;
    },
  ),
];

const bannerCommands = [
  command(
    'stripe-order <palette> <banners> <phase>',
    ['S', 'c', 'i'],
    'Assign base colors by repeating a palette with a signed starting offset.',
    (palette, n, phase) => sequence(n, (i) => palette[mod(i + phase, palette.length)]),
  ),
  command(
    'mirror-wing <left-wing> <center-color>',
    ['S', 's'],
    'Build a symmetric hanging order around a central banner.',
    (left, center) => {
      demand(left.length * 2 + 1 <= 1000, 'Mirrored hall exceeds 1000 banners.');
      return [...left, center, ...left.toReversed()];
    },
  ),
  command(
    'symmetry-repairs <color-ids>',
    ['S'],
    'List the one-based right-side positions to repaint to match the left wing.',
    (colors) =>
      indices(Math.floor(colors.length / 2))
        .filter((i) => colors[i] !== colors[colors.length - i - 1])
        .map((i) => ({ position: colors.length - i, color: colors[i] })),
  ),
  command(
    'palette-totals <color-ids> <copies>',
    ['S', 'C'],
    'Combine repeat orders by base wool color in first-seen order.',
    (colors, copies) => {
      const stock = countsById(colors, copies);
      return [...stock].map(([color, banners]) => ({ color, banners }));
    },
  ),
  command(
    'material-cuts <colors-in-stock> <wool-per-banner> <sticks>',
    ['C', 's', 'c'],
    'Count craftable plain banners with color-separated wool and shared sticks.',
    (stock, per, sticks) => Math.min(sticks, sum(stock.map((n) => Math.floor(n / per)))),
  ),
  command(
    'layer-capacity <existing-layers> <requested-layers> <limit>',
    ['C', 'C', 's'],
    'Find requested layer additions that fit on each banner and the rejected excess.',
    (used, add, limit) => {
      same(used, add);
      demand(
        used.every((n) => n <= limit),
        'Existing layers exceed the cap.',
      );
      return used.map((n, i) => {
        const accepted = Math.min(limit - n, add[i]);
        return { accepted, rejected: add[i] - accepted };
      });
    },
  ),
  command(
    'layer-prefix <first-pattern> <second-pattern>',
    ['S', 'S'],
    'Measure the common bottom-to-top prefix of two pattern recipes and the unique steps.',
    (a, b) => {
      let shared = 0;
      while (shared < Math.min(a.length, b.length) && a[shared] === b[shared]) shared++;
      return { shared, firstOnly: a.slice(shared), secondOnly: b.slice(shared) };
    },
  ),
  command(
    'wash-down <current-pattern> <target-prefix>',
    ['S', 'indexes'],
    'Count top layers to remove to reach the specified lower-layer recipe, or null if impossible.',
    (current, target) => {
      demand(
        target.every((id) => id > 0),
        'Layer IDs must be positive.',
      );
      return target.length <= current.length && target.every((v, i) => current[i] === v)
        ? current.length - target.length
        : null;
    },
  ),
  command(
    'dye-budget <layer-color-ids> <copies> <dye-stocks>',
    ['S', 'c', 'C'],
    'Return remaining dye and shortages per numbered color for repeated recipe layers.',
    (colors, copies, stocks) => {
      demand(
        colors.every((c) => c <= stocks.length),
        'Color IDs must index a supplied dye stock.',
      );
      const counts = countsById(colors);
      return stocks.map((n, i) => {
        const use = (counts.get(i + 1) ?? 0) * copies;
        return { left: Math.max(0, n - use), short: Math.max(0, use - n) };
      });
    },
  ),
  command(
    'motif-frequency <layer-ids> <motif>',
    ['S', 'S'],
    'Count all contiguous motif matches in a recipe, including overlapping occurrences.',
    (ids, motif) => ids.filter((_, i) => motif.every((v, j) => v === ids[i + j])).length,
  ),
  command(
    'palette-remap <layers> <old-ids> <new-ids>',
    ['S', 'S', 'S'],
    'Substitute dye IDs in a layer sequence in a single pass.',
    (layers, oldIds, newIds) => {
      same(oldIds, newIds);
      demand(new Set(oldIds).size === oldIds.length, 'Supply each old color exactly once.');
      const replacements = new Map(oldIds.map((v, i) => [v, newIds[i]]));
      return layers.map((id) => replacements.get(id) ?? id);
    },
  ),
  command(
    'loom-load <layers-per-design> <orders> <ticks-per-layer>',
    ['C', 'C', 's'],
    'Budget total manual loom ticks for decorating every ordered banner separately.',
    (layers, orders, ticks) => {
      same(layers, orders);
      return sum(layers.map((n, i) => n * orders[i] * ticks));
    },
  ),
  command(
    'master-copy-savings <layers-per-design> <orders>',
    ['C', 'C'],
    'Compare layering every banner with layering one master per ordered design and copying the rest.',
    (layers, orders) => {
      same(layers, orders);
      return {
        savedLayers: sum(orders.map((n, i) => Math.max(0, n - 1) * layers[i])),
        copies: sum(orders.map((n) => Math.max(0, n - 1))),
      };
    },
  ),
  command(
    'hanger-spacing <width> <edge-margin> <pitch>',
    ['s', 'c', 's'],
    'Place hangers from the left margin at a fixed pitch while preserving the right margin.',
    (width, margin, pitch) => {
      const span = width - 1 - 2 * margin;
      return span < 0 ? [] : sequence(Math.floor(span / pitch) + 1, (i) => margin + i * pitch);
    },
  ),
  command(
    'center-line <wall-width> <banner-count> <gap>',
    ['s', 's', 'c'],
    'Center a row of single-block banners and leave an odd extra block on the right.',
    (width, n, gap) => {
      const occupied = n + (n - 1) * gap;
      demand(occupied <= width, 'The row must fit on the wall.');
      const left = Math.floor((width - occupied) / 2);
      return { left, right: width - occupied - left, occupied };
    },
  ),
  command(
    'door-clearance <positions> <door-start> <door-width> <margin>',
    ['C', 'c', 's', 'c'],
    'Report hanging positions encroaching on a door or its specified side clearance.',
    (positions, start, width, margin) => positions.filter((x) => x >= start - margin && x < start + width + margin),
  ),
  command(
    'paired-standards <left-colors> <right-colors>',
    ['S', 'S'],
    'Count complete matching pairs across two unordered wings for each left-side color.',
    (left, right) => {
      const rightCounts = countsById(right);
      return [...countsById(left)].map(([color, n]) => ({ color, pairs: Math.min(n, rightCounts.get(color) ?? 0) }));
    },
  ),
  command(
    'height-profile <floor-levels> <top-level> <drop>',
    ['l', 'i', 's'],
    'Find clearance in blocks between floor tops and the lowest occupied hanging blocks.',
    (floors, top, drop) => floors.map((floor) => top - drop - floor),
  ),
  command(
    'visibility-runs <visible-flags>',
    ['C'],
    'Report consecutive runs of visible positions on a one-based banner wall.',
    (flags) => {
      demand(
        flags.every((n) => n <= 1),
        'Visibility flags must be zero or one.',
      );
      const runs = [];
      for (const [i, flag] of flags.entries()) {
        if (flag === 0) continue;
        if (i > 0 && flags[i - 1]) runs.at(-1).last = i + 1;
        else runs.push({ first: i + 1, last: i + 1 });
      }
      return runs;
    },
  ),
  command(
    'rotation-match <mounted-colors> <target-colors>',
    ['S', 'S'],
    'Find the smallest left rotation of a cyclic display that reproduces the target order.',
    (mounted, target) => {
      same(mounted, target);
      const offset = mounted.findIndex((_, i) => target.every((v, j) => mounted[(i + j) % mounted.length] === v));
      return offset === -1 ? null : offset;
    },
  ),
  command(
    'batch-changeovers <design-order> <setup-ticks>',
    ['S', 'c'],
    'Budget setup ticks for design switches after the first loom job.',
    (designs, ticks) => ticks * designs.filter((v, i) => i > 0 && v !== designs[i - 1]).length,
  ),
  command(
    'template-checkout <pattern-ids> <available-ids>',
    ['S', 'indexes'],
    'List distinct missing reusable template IDs in recipe order.',
    (patterns, available) => {
      demand(
        available.every((id) => id > 0),
        'Template IDs must be positive.',
      );
      const have = new Set(available);
      return [...new Set(patterns)].filter((id) => !have.has(id));
    },
  ),
  command(
    'packing-stacks <design-ids> <quantities> <stack-limit>',
    ['S', 'C', 's'],
    'Count slots for stackable identical banners, consolidating repeated design IDs.',
    (designs, quantities, limit) => {
      const stock = countsById(designs, quantities);
      return sum([...stock.values()].map((n) => batches(n, limit)));
    },
  ),
  command(
    'replacement-plan <mounted-designs> <desired-designs> <spare-designs>',
    ['S', 'S', 'indexes'],
    'Allocate removed banners and spare copies to mismatched positions, then list designs still needed.',
    (mounted, desired, spares) => {
      same(mounted, desired);
      demand(
        spares.every((id) => id > 0),
        'Design IDs must be positive.',
      );
      const stock = countsById(spares);
      const changes = indices(mounted.length).filter((i) => mounted[i] !== desired[i]);
      for (const i of changes) stock.set(mounted[i], (stock.get(mounted[i]) ?? 0) + 1);
      const needed = [];
      for (const i of changes) {
        const id = desired[i],
          available = stock.get(id) ?? 0;
        if (available) stock.set(id, available - 1);
        else needed.push(id);
      }
      return { moves: changes.length, needed };
    },
  ),
  command(
    'layer-diff <mounted-layers> <desired-layers>',
    ['indexes', 'indexes'],
    'List one-based differing layer positions including added and removed layers.',
    (mounted, desired) => {
      demand(
        [...mounted, ...desired].every((id) => id > 0),
        'Layer IDs must be positive.',
      );
      return indices(Math.max(mounted.length, desired.length))
        .filter((i) => mounted[i] !== desired[i])
        .map((i) => ({ position: i + 1, from: mounted[i] ?? null, to: desired[i] ?? null }));
    },
  ),
];

export const settlementGroups = [
  {
    name: 'maproom',
    note: 'Offline map tile geometry, survey routing and display planning from supplied coordinates.',
    commands: mapCommands,
  },
  {
    name: 'bookbind',
    note: 'Offline publication, copy allocation and library planning from supplied book specifications.',
    commands: bookCommands,
  },
  {
    name: 'bannerhall',
    note: 'Offline pattern design, loom supply and hanging layout from supplied banner orders.',
    commands: bannerCommands,
  },
];
