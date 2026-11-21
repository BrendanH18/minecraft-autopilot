import { demand, same, sequence } from './offline-kit.js';

// Every operation uses the same bounded row-major raster.
function planner(signature, types, description, calculate) {
  const [name, ...parameters] = signature.split(' ');
  return {
    signature: [name, '<width>', '<pixels>', ...parameters].join(' '),
    types: ['s', 'C', ...types],
    description,
    run(width, pixels, ...args) {
      demand(pixels.length % width === 0, 'Width must divide the number of pixels.');
      const height = pixels.length / width;
      return calculate({ width, height, pixels, at: (x, y) => pixels[y * width + x] }, ...args);
    },
  };
}

function raster(width, height, color) {
  return { width, height, pixels: sequence(width * height, (i) => color(i % width, Math.floor(i / width))) };
}

function inside(m, x, y) {
  return x >= 0 && y >= 0 && x < m.width && y < m.height;
}

function neighbors(m, x, y) {
  return [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
  ].filter(([a, b]) => inside(m, a, b));
}

// Flood orthogonally through pixels of one color. Sharing visited also allows a full region census.
function component(m, seed, visited) {
  const cells = [seed];
  visited.add(seed);
  for (const index of cells) {
    for (const [x, y] of neighbors(m, index % m.width, Math.floor(index / m.width))) {
      const next = y * m.width + x;
      if (!visited.has(next) && m.pixels[next] === m.pixels[seed]) {
        visited.add(next);
        cells.push(next);
      }
    }
  }
  return cells;
}

const commands = [
  planner('turn-right', [], 'Rotate the mural clockwise by a quarter turn.', (m) =>
    raster(m.height, m.width, (x, y) => m.at(y, m.height - 1 - x)),
  ),
  planner('mirror-proof', [], 'Preview the reverse face of a freestanding mural.', (m) =>
    raster(m.width, m.height, (x, y) => m.at(m.width - 1 - x, y)),
  ),
  planner(
    'cut-panel <x> <y> <columns> <rows>',
    ['c', 'c', 's', 's'],
    'Extract a rectangular panel starting at zero-based coordinates.',
    (m, x, y, w, h) => {
      demand(x + w <= m.width && y + h <= m.height, 'Panel exceeds the mural.');
      return raster(w, h, (a, b) => m.at(x + a, y + b));
    },
  ),
  planner('magnify <factor>', ['s'], 'Enlarge each pixel to a square of blocks.', (m, k) =>
    raster(m.width * k, m.height * k, (x, y) => m.at(Math.floor(x / k), Math.floor(y / k))),
  ),
  planner('repeat-field <across> <down>', ['s', 's'], 'Tile the motif across a larger field.', (m, a, d) =>
    raster(m.width * a, m.height * d, (x, y) => m.at(x % m.width, y % m.height)),
  ),
  planner('mat-border <thickness> <color>', ['c', 'c'], 'Surround the art with a solid mat.', (m, t, c) =>
    raster(m.width + 2 * t, m.height + 2 * t, (x, y) => (inside(m, x - t, y - t) ? m.at(x - t, y - t) : c)),
  ),
  planner('trim-ground <ground>', ['c'], 'Crop background-only margins, returning null for blank art.', (m, g) => {
    const ink = m.pixels.flatMap((v, i) => (v === g ? [] : [i]));
    if (!ink.length) return null;
    const xs = ink.map((i) => i % m.width),
      left = Math.min(...xs),
      top = Math.floor(ink[0] / m.width);
    return raster(Math.max(...xs) - left + 1, Math.floor(ink.at(-1) / m.width) - top + 1, (x, y) =>
      m.at(left + x, top + y),
    );
  }),
  planner(
    'stencil-overlay <stencil-width> <stencil> <left> <top> <transparent>',
    ['s', 'C', 'i', 'i', 'c'],
    'Stamp a clipped stencil, skipping its transparent color.',
    (m, w, stencil, left, top, clear) => {
      demand(stencil.length % w === 0, 'Stencil width must divide its pixel count.');
      return raster(m.width, m.height, (x, y) => {
        const a = x - left,
          b = y - top;
        if (a < 0 || a >= w || b < 0 || b >= stencil.length / w) return m.at(x, y);
        const ink = stencil[b * w + a];
        return ink === clear ? m.at(x, y) : ink;
      });
    },
  ),
  planner(
    'flood-recolor <x> <y> <color>',
    ['c', 'c', 'c'],
    'Replace the connected patch containing a chosen pixel.',
    (m, x, y, c) => {
      demand(inside(m, x, y), 'Seed must be on the mural.');
      const visited = new Set();
      component(m, y * m.width + x, visited);
      return raster(m.width, m.height, (a, b) => (visited.has(b * m.width + a) ? c : m.at(a, b)));
    },
  ),
  planner('patch-census', [], 'List each connected patch with color, first pixel index and area.', (m) => {
    const visited = new Set(),
      patches = [];
    for (const [i, color] of m.pixels.entries())
      if (!visited.has(i)) patches.push({ color, first: i, area: component(m, i, visited).length });
    return patches;
  }),
  planner('outline-mask <ground>', ['c'], 'Mark foreground pixels touching ground or the exterior.', (m, g) =>
    raster(m.width, m.height, (x, y) => {
      const adjacent = neighbors(m, x, y);
      return Number(m.at(x, y) !== g && (adjacent.length < 4 || adjacent.some(([a, b]) => m.at(a, b) === g)));
    }),
  ),
  planner('color-seams', [], 'Count shared edges between each distinct pair of colors.', (m) => {
    const pairs = new Map();
    for (const [i, v] of m.pixels.entries()) {
      const x = i % m.width,
        y = Math.floor(i / m.width);
      for (const [a, b] of [
        [x + 1, y],
        [x, y + 1],
      ])
        if (inside(m, a, b) && m.at(a, b) !== v) {
          const low = Math.min(v, m.at(a, b)),
            high = Math.max(v, m.at(a, b)),
            key = `${low},${high}`;
          const entry = pairs.get(key) ?? { low, high, edges: 0 };
          entry.edges++;
          pairs.set(key, entry);
        }
    }
    demand(pairs.size <= 1000, 'Too many distinct seam pairs.');
    return [...pairs.values()];
  }),
  planner('layer-stencil <color>', ['c'], 'Produce a placement mask for one material.', (m, c) =>
    raster(m.width, m.height, (x, y) => Number(m.at(x, y) === c)),
  ),
  planner(
    'repair-list <installed>',
    ['C'],
    'List zero-based coordinates and target colors of mismatched blocks.',
    (m, installed) => {
      same(m.pixels, installed);
      return m.pixels.flatMap((color, i) =>
        color === installed[i] ? [] : [{ x: i % m.width, y: Math.floor(i / m.width), color }],
      );
    },
  ),
  planner('row-runs <row>', ['c'], 'Read a row as consecutive same-material placement runs.', (m, y) => {
    demand(y < m.height, 'Row exceeds the mural.');
    const runs = [];
    for (let x = 0; x < m.width; x++) {
      const color = m.at(x, y);
      if (runs.at(-1)?.color === color) runs.at(-1).length++;
      else runs.push({ x, color, length: 1 });
    }
    return runs;
  }),
  planner('color-bounds <color>', ['c'], 'Find the inclusive bounding box for a material.', (m, c) => {
    const hits = m.pixels.flatMap((v, i) => (v === c ? [i] : []));
    if (!hits.length) return null;
    const xs = hits.map((i) => i % m.width);
    return {
      left: Math.min(...xs),
      right: Math.max(...xs),
      top: Math.floor(hits[0] / m.width),
      bottom: Math.floor(hits.at(-1) / m.width),
    };
  }),
  planner('snake-loadout', [], 'Order placement materials along alternating row directions.', (m) =>
    m.pixels.map((_, i) => {
      const y = Math.floor(i / m.width),
        x = i % m.width;
      return m.at(y % 2 ? m.width - 1 - x : x, y);
    }),
  ),
  planner(
    'coarsen <factor>',
    ['s'],
    'Choose the most common color in each clipped square, with first-seen ties.',
    (m, k) =>
      raster(Math.ceil(m.width / k), Math.ceil(m.height / k), (x, y) => {
        const counts = new Map();
        for (let b = y * k; b < Math.min(m.height, (y + 1) * k); b++)
          for (let a = x * k; a < Math.min(m.width, (x + 1) * k); a++) {
            const color = m.at(a, b);
            counts.set(color, (counts.get(color) ?? 0) + 1);
          }
        let best,
          maximum = 0;
        for (const [color, count] of counts)
          if (count > maximum) {
            best = color;
            maximum = count;
          }
        return best;
      }),
  ),
  planner(
    'relief-layers <heights>',
    ['C'],
    'Translate indexed colors into column heights and total fill blocks.',
    (m, heights) => {
      demand(
        m.pixels.every((c) => c < heights.length),
        'Every color needs a height.',
      );
      const columns = m.pixels.map((c) => heights[c]);
      return { columns, blocks: columns.reduce((a, b) => a + b, 0) };
    },
  ),
  planner('half-turn-errors', [], 'List opposed pixel index pairs that break half-turn symmetry.', (m) =>
    m.pixels.flatMap((v, i) => {
      const j = m.pixels.length - 1 - i;
      return i < j && v !== m.pixels[j] ? [[i, j]] : [];
    }),
  ),
  planner(
    'panel-palette <panel-width> <panel-height>',
    ['s', 's'],
    'List the materials required in each clipped panel in reading order.',
    (m, w, h) => {
      const panels = [];
      for (let y = 0; y < m.height; y += h)
        for (let x = 0; x < m.width; x += w) {
          const colors = new Set();
          for (let b = y; b < Math.min(y + h, m.height); b++)
            for (let a = x; a < Math.min(x + w, m.width); a++) colors.add(m.at(a, b));
          panels.push({ x, y, colors: [...colors] });
        }
      return panels;
    },
  ),
  planner(
    'shift-art <dx> <dy> <ground>',
    ['i', 'i', 'c'],
    'Move art inside its frame, filling exposed cells.',
    (m, dx, dy, g) => raster(m.width, m.height, (x, y) => (inside(m, x - dx, y - dy) ? m.at(x - dx, y - dy) : g)),
  ),
  planner(
    'dither-mix <first> <second> <target>',
    ['c', 'c', 'c'],
    'Split one material into two alternating checkerboard shades.',
    (m, a, b, t) => raster(m.width, m.height, (x, y) => (m.at(x, y) === t ? ((x + y) % 2 ? b : a) : m.at(x, y))),
  ),
  planner('registration-marks <ground>', ['c'], 'Locate the first and last inked pixel on each row.', (m, g) =>
    sequence(m.height, (y) => {
      const row = m.pixels.slice(y * m.width, (y + 1) * m.width);
      const first = row.findIndex((c) => c !== g);
      return first < 0 ? null : { first, last: row.findLastIndex((c) => c !== g) };
    }),
  ),
  planner(
    'palette-kits <stack-size>',
    ['s'],
    'Pack each mural material into full stacks and loose blocks.',
    (m, size) => {
      const counts = new Map();
      for (const c of m.pixels) counts.set(c, (counts.get(c) ?? 0) + 1);
      return [...counts].map(([color, n]) => ({ color, stacks: Math.floor(n / size), loose: n % size }));
    },
  ),
];

export const muralGroup = {
  name: 'mural',
  note: 'Offline pixel mural plans using integer material IDs and zero-based coordinates.',
  commands,
};
