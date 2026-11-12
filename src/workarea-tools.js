import { navPoint, navNumber } from './navigation.js';

const axes = ['x', 'y', 'z'];
const NOTE = 'Offline discrete block-cell geometry. Corner coordinates are floored and both endpoint cells are included. No excavation, placement, terrain, ownership, support, or safety checks. Use one dimension for all inputs.';
function integer(v, min = 0, max = 1e6) {
  const n = navNumber(v);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`Use an integer from ${min} to ${max}.`);
  return n;
}
function safe(n) { if (!Number.isSafeInteger(n) || n < 0) throw new Error('Cell count exceeds the safe integer range.'); return n; }
function box(a, b) {
  const ps = [a, b].map(navPoint).map(p => Object.fromEntries(axes.map(k => [k, Math.floor(p[k])])));
  return { min: Object.fromEntries(axes.map(k => [k, Math.min(...ps.map(p => p[k]))])), max: Object.fromEntries(axes.map(k => [k, Math.max(...ps.map(p => p[k]))])) };
}
const size = b => Object.fromEntries(axes.map(k => [k, b.max[k] - b.min[k] + 1]));
const cells = b => b ? safe(Object.values(size(b)).reduce((n, v) => safe(n * v), 1)) : 0;
const copy = b => ({ min: { ...b.min }, max: { ...b.max } });
function axis(v) { if (!axes.includes(v)) throw new Error('Choose axis x, y, or z.'); return v; }
function intersection(a, b) {
  const c = { min: Object.fromEntries(axes.map(k => [k, Math.max(a.min[k], b.min[k])])), max: Object.fromEntries(axes.map(k => [k, Math.min(a.max[k], b.max[k])])) };
  return axes.some(k => c.min[k] > c.max[k]) ? null : c;
}
function moved(b, offsets) {
  const c = copy(b); for (const end of ['min', 'max']) for (const k of axes) c[end][k] += offsets[k];
  navPoint(axes.map(k => c.min[k]).join(',')); navPoint(axes.map(k => c.max[k]).join(',')); return c;
}
function slices(b, k, width) {
  const count = Math.ceil(size(b)[k] / width); if (count > 1000) throw new Error('Output is limited to 1000 parts.');
  return Array.from({ length: count }, (_, i) => { const c = copy(b); c.min[k] = b.min[k] + i * width; c.max[k] = Math.min(b.max[k], c.min[k] + width - 1); return { ...c, cells: cells(c) }; });
}
function gridBounds(b, scales) {
  return { min: Object.fromEntries(Object.keys(scales).map(k => [k, Math.floor(b.min[k] / scales[k])])), max: Object.fromEntries(Object.keys(scales).map(k => [k, Math.floor(b.max[k] / scales[k])])) };
}
function gridCount(g) { return safe(Object.keys(g.min).reduce((n, k) => safe(n * (g.max[k] - g.min[k] + 1)), 1)); }
function subtract(a, b) {
  const overlap = intersection(a, b); if (!overlap) return [a];
  const rest = [], core = copy(a);
  for (const k of axes) {
    if (core.min[k] < overlap.min[k]) { const piece = copy(core); piece.max[k] = overlap.min[k] - 1; rest.push(piece); core.min[k] = overlap.min[k]; }
    if (core.max[k] > overlap.max[k]) { const piece = copy(core); piece.min[k] = overlap.max[k] + 1; rest.push(piece); core.max[k] = overlap.max[k]; }
  }
  return rest;
}

export const WORKAREA_COMMANDS = [
  ['size <a> <b>', 'Count inclusive block cells and axis sizes.'],
  ['layers <a> <b>', 'List horizontal layer ranges and cumulative cell counts.'],
  ['face-counts <a> <b>', 'Count directional exposed unit faces, including degenerate dimensions.'],
  ['boundary <a> <b> <thickness>', 'Count boundary and interior cells without face overlap.'],
  ['corners <a> <b>', 'Enumerate unique corner block coordinates.'],
  ['center-blocks <a> <b>', 'Enumerate central block cells, including even-size alternatives.'],
  ['chunk-cover <a> <b>', 'Count intersected horizontal chunks using negative-coordinate floor division.'],
  ['section-cover <a> <b>', 'Count intersected 16-cubed sections.'],
  ['region-cover <a> <b>', 'Count intersected horizontal region files.'],
  ['chunk-partitions <a> <b>', 'Partition the work area into clipped horizontal chunk columns.'],
  ['split-axis <a> <b> <axis> <width>', 'Split an area into nonoverlapping cell-width slabs.'],
  ['tiles <a> <b> <x-width> <z-width>', 'Split the footprint into clipped rectangular work tiles.'],
  ['expand <a> <b> <blocks>', 'Grow every face by an integer number of cells.'],
  ['inset <a> <b> <blocks>', 'Shrink every face; report an empty area if no cells remain.'],
  ['translate <a> <b> <dx> <dy> <dz>', 'Translate a block area by integer offsets.'],
  ['union-count <a> <b> <c> <d>', 'Count the exact union of two cell areas, rather than their bounding box.'],
  ['subtract <a> <b> <c> <d>', 'Partition the first area minus the second into disjoint cuboids.'],
  ['overlap-ratio <a> <b> <c> <d>', 'Measure discrete intersection-over-union and directional coverage.'],
  ['contains-box <a> <b> <c> <d>', 'Test complete cell-area containment.'],
  ['touches <a> <b> <c> <d>', 'Classify overlap, face, edge, corner adjacency, or separation.'],
  ['gap <a> <b> <c> <d>', 'Count empty cells between axis projections and their maximum separation.'],
  ['nearest-face <a> <b> <point>', 'Choose the nearest outer face plane to a point, with deterministic ties.'],
  ['boundary-distance <a> <b> <point>', 'Report interior block-layer depth, or unknown outside the area.'],
  ['layer-at <a> <b> <y>', 'Extract an integer horizontal layer if it intersects the area.'],
  ['checker-count <a> <b>', 'Count global even and odd X+Y+Z block parity cells.'],
];

export function workareaCalculation(command, args = []) {
  const a = box(args[0], args[1]), s = size(a); let result;
  const other = () => box(args[2], args[3]);
  switch (command) {
    case 'size': result = { ...a, size: s, cells: cells(a) }; break;
    case 'layers': result = { layers: slices(a, 'y', 1).map((b, i) => ({ y: b.min.y, cells: b.cells, cumulative: safe((i + 1) * b.cells) })) }; break;
    case 'face-counts': { const faces = Object.fromEntries(axes.map(k => [k, safe(axes.filter(v => v !== k).reduce((n, v) => n * s[v], 1))])); result = { perDirection: { west: faces.x, east: faces.x, bottom: faces.y, top: faces.y, north: faces.z, south: faces.z }, total: safe(2 * Object.values(faces).reduce((n, v) => n + v, 0)) }; break; }
    case 'boundary': { const thickness = integer(args[2], 1), interior = safe(axes.reduce((n, k) => safe(n * Math.max(0, s[k] - 2 * thickness)), 1)); result = { total: cells(a), interior, boundary: cells(a) - interior }; break; }
    case 'corners': case 'center-blocks': {
      const values = axes.map(k => command === 'corners' ? [...new Set([a.min[k], a.max[k]])] : [...new Set([Math.floor((a.min[k] + a.max[k]) / 2), Math.ceil((a.min[k] + a.max[k]) / 2)])]);
      result = { points: values[0].flatMap(x => values[1].flatMap(y => values[2].map(z => ({ x, y, z })))) }; break;
    }
    case 'chunk-cover': case 'section-cover': case 'region-cover': {
      const scales = command === 'section-cover' ? { x: 16, y: 16, z: 16 } : { x: command === 'chunk-cover' ? 16 : 512, z: command === 'chunk-cover' ? 16 : 512 }, grid = gridBounds(a, scales);
      result = { ...grid, count: gridCount(grid) }; break;
    }
    case 'chunk-partitions': {
      const g = gridBounds(a, { x: 16, z: 16 }); if (gridCount(g) > 1000) throw new Error('Output is limited to 1000 parts.');
      const parts = []; for (let x = g.min.x; x <= g.max.x; x++) for (let z = g.min.z; z <= g.max.z; z++) { const b = { min: { x: Math.max(a.min.x, x * 16), y: a.min.y, z: Math.max(a.min.z, z * 16) }, max: { x: Math.min(a.max.x, x * 16 + 15), y: a.max.y, z: Math.min(a.max.z, z * 16 + 15) } }; parts.push({ chunkX: x, chunkZ: z, ...b, cells: cells(b) }); }
      result = { parts, cells: cells(a) }; break;
    }
    case 'split-axis': result = { parts: slices(a, axis(args[2]), integer(args[3], 1)) }; break;
    case 'tiles': {
      const xWidth = integer(args[2], 1), zWidth = integer(args[3], 1), count = Math.ceil(s.x / xWidth) * Math.ceil(s.z / zWidth);
      if (count > 1000) throw new Error('Output is limited to 1000 parts.'); result = { parts: slices(a, 'x', xWidth).flatMap(b => slices(b, 'z', zWidth)) }; break;
    }
    case 'expand': case 'inset': {
      const amount = integer(args[2]), b = copy(a), sign = command === 'expand' ? -1 : 1;
      for (const k of axes) { b.min[k] += sign * amount; b.max[k] -= sign * amount; }
      if (axes.some(k => b.min[k] > b.max[k])) result = { area: null, cells: 0 };
      else { const area = moved(b, { x: 0, y: 0, z: 0 }); result = { area, cells: cells(area) }; } break;
    }
    case 'translate': { const b = moved(a, Object.fromEntries(axes.map((k, i) => [k, integer(args[i + 2], -1e6)]))); result = { area: b, cells: cells(b) }; break; }
    case 'union-count': case 'overlap-ratio': {
      const b = other(), first = cells(a), second = cells(b), overlap = cells(intersection(a, b)), union = safe(first - overlap + second);
      result = command === 'union-count' ? { first, second, overlap, union } : { intersection: overlap, union, intersectionOverUnion: overlap / union, firstCovered: overlap / first, secondCovered: overlap / second }; break;
    }
    case 'subtract': { const parts = subtract(a, other()).map(b => ({ ...b, cells: cells(b) })); result = { parts, cells: safe(parts.reduce((n, b) => n + b.cells, 0)) }; break; }
    case 'contains-box': { const b = other(); result = { contains: axes.every(k => a.min[k] <= b.min[k] && a.max[k] >= b.max[k]) }; break; }
    case 'touches': case 'gap': {
      const b = other(), gaps = Object.fromEntries(axes.map(k => [k, Math.max(0, a.min[k] - b.max[k] - 1, b.min[k] - a.max[k] - 1)])), separatedAxes = axes.filter(k => a.min[k] > b.max[k] || b.min[k] > a.max[k]).length;
      result = command === 'gap' ? { gaps, maximum: Math.max(...Object.values(gaps)) } : { relation: intersection(a, b) ? 'overlap' : Object.values(gaps).some(v => v > 0) ? 'separate' : ['overlap', 'face', 'edge', 'corner'][separatedAxes] }; break;
    }
    case 'nearest-face': {
      const p = navPoint(args[2]), faces = axes.flatMap(k => [{ axis: k, side: 'min', plane: a.min[k], distance: Math.abs(p[k] - a.min[k]) }, { axis: k, side: 'max', plane: a.max[k] + 1, distance: Math.abs(p[k] - (a.max[k] + 1)) }]);
      result = { face: faces.reduce((a, b) => b.distance < a.distance ? b : a), convention: 'distance_to_infinite_outer_face_plane' }; break;
    }
    case 'boundary-distance': {
      const p = Object.fromEntries(Object.entries(navPoint(args[2])).map(([k, v]) => [k, Math.floor(v)])), inside = axes.every(k => p[k] >= a.min[k] && p[k] <= a.max[k]); result = { inside, depth: inside ? Math.min(...axes.flatMap(k => [p[k] - a.min[k], a.max[k] - p[k]])) : null }; break;
    }
    case 'layer-at': { const y = integer(args[2], -64, 320), b = copy(a); b.min.y = y; b.max.y = y; const present = y >= a.min.y && y <= a.max.y; result = { area: present ? b : null, cells: present ? cells(b) : 0 }; break; }
    case 'checker-count': {
      const total = cells(a), allOdd = axes.every(k => s[k] % 2 === 1), firstEven = ((a.min.x + a.min.y + a.min.z) % 2 + 2) % 2 === 0;
      result = { even: allOdd && firstEven ? (total + 1) / 2 : Math.floor(total / 2), odd: allOdd && !firstEven ? (total + 1) / 2 : Math.floor(total / 2) }; break;
    }
    default: throw new Error(`Unknown workarea command: ${command}.`);
  }
  return { ...result, note: NOTE };
}

export function registerWorkareaTools(program, { print }) {
  const group = program.command('workarea').description('Offline inclusive block-area partitions and cell accounting.');
  for (const [signature, description] of WORKAREA_COMMANDS) group.command(signature).description(description).action((...values) => print(workareaCalculation(signature.split(' ')[0], values.slice(0, -2))));
  return group;
}
