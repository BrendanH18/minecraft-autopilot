import { playerPosition, uniqueContainers, itemName } from './cli-views.js';
import { navNumber, navPoint } from './navigation.js';

const axes = ['x', 'y', 'z'];
const located = (p) => p && axes.every((axis) => Number.isFinite(p[axis]));
const distance = (a, b) => Math.hypot(...axes.map((axis) => a[axis] - b[axis]));
const key = (p) => axes.map((axis) => p[axis]).join(',');
const block = (p) => Object.fromEntries(axes.map((axis) => [axis, Math.floor(p[axis])]));
const note =
  'Partial observation only: missing entries do not prove absence, exposed faces, connectivity of the world, or safety. Distances and corridors are geometry, not paths. Container contents are last observed.';
function bounded(value, minimum = 0, maximum = 60_000_000) {
  const n = navNumber(value);
  if (n < minimum || n > maximum) throw new Error(`Use a number from ${minimum} to ${maximum}.`);
  return n;
}
function axis(value) {
  if (!axes.includes(value)) throw new Error('Axis must be x, y, or z.');
  return value;
}
function projection(p, a, b) {
  const delta = axes.map((k) => b[k] - a[k]);
  const lengthSquared = delta.reduce((sum, n) => sum + n * n, 0);
  const fraction = lengthSquared
    ? Math.max(0, Math.min(1, axes.reduce((sum, k, i) => sum + (p[k] - a[k]) * delta[i], 0) / lengthSquared))
    : 0;
  const point = Object.fromEntries(axes.map((k, i) => [k, a[k] + fraction * delta[i]]));
  return { point, fraction, distance: distance(p, point) };
}
const descriptions = {
  cylinder: [
    '<radius> <minimum-rise> <maximum-rise>',
    'Select by horizontal radius and signed height relative to the player.',
  ],
  corridor: ['<from> <to> <width>', 'Select within width of a finite three-dimensional segment.'],
  'nearest-k': ['<point> <limit>', 'Select at most limit entries nearest an arbitrary point.'],
  grid: ['<size>', 'Count occupied three-dimensional grid cells aligned to the world origin.'],
  spread: ['', 'Measure centroid, mean radius, and maximum radius of observed positions.'],
  projection: ['<from> <to>', 'Project each observed position onto a finite segment.'],
};
export const TERRAIN_COMMANDS = ['blocks', 'threats', 'containers']
  .flatMap((field) =>
    Object.entries(descriptions).map(([kind, [args, description]]) => [
      `${field}-${kind}${args ? ` ${args}` : ''}`,
      description,
    ]),
  )
  .concat([
    ['block-columns', 'List distinct observed block heights per X/Z column.'],
    ['block-components <item>', 'Find face-connected components of observed blocks of one type.'],
    ['block-surface <item>', 'Count faces without an adjacent observed block, for one block type.'],
    ['block-neighbors <point>', 'List observed blocks in the six face-neighbor cells of a point.'],
    ['block-duplicates', 'Find coordinates reported more than once in the block observation.'],
    ['block-height-profile <axis>', 'Show observed minimum and maximum block Y grouped along X or Z.'],
    ['block-cross-section <axis> <coordinate>', 'Select observed blocks in a floored coordinate slice.'],
  ]);

/** Read-only reports over one observation. No control, refresh, or world scan. */
export function terrainReport(state, command, args = []) {
  const player = playerPosition(state);
  if (!TERRAIN_COMMANDS.some(([signature]) => signature.split(' ')[0] === command))
    throw new Error(`Unknown terrain query: ${command}.`);
  const match = /^(blocks|threats|containers)-(.+)$/.exec(command);
  const field = match?.[1] ?? 'blocks';
  const raw = Array.isArray(state[field]) ? state[field] : [];
  const source = field === 'containers' ? uniqueContainers(raw) : raw;
  const entries = source.filter(located);
  const result = (data) => ({
    supported: Array.isArray(state[field]),
    unlocated: source.length - entries.length,
    scope: 'partial_observation',
    ...data,
    note,
  });
  if (match) {
    switch (match[2]) {
      case 'cylinder': {
        const radius = bounded(args[0]),
          min = bounded(args[1], -384, 384),
          max = bounded(args[2], min, 384);
        return result({
          radius,
          minimumRise: min,
          maximumRise: max,
          entries: entries.filter(
            (p) =>
              Math.hypot(p.x - player.x, p.z - player.z) <= radius && p.y - player.y >= min && p.y - player.y <= max,
          ),
        });
      }
      case 'corridor': {
        const from = navPoint(args[0]),
          to = navPoint(args[1]),
          width = bounded(args[2]);
        return result({
          from,
          to,
          width,
          entries: entries
            .map((p) => ({ ...p, segmentDistance: projection(p, from, to).distance }))
            .filter((p) => p.segmentDistance <= width)
            .sort((a, b) => a.segmentDistance - b.segmentDistance),
        });
      }
      case 'nearest-k': {
        const point = navPoint(args[0]),
          limit = bounded(args[1], 1, 1000);
        if (!Number.isInteger(limit)) throw new Error('Limit must be an integer from 1 to 1000.');
        return result({
          point,
          limit,
          entries: entries
            .map((p) => ({ ...p, distance: distance(p, point) }))
            .sort((a, b) => a.distance - b.distance)
            .slice(0, limit),
        });
      }
      case 'grid': {
        const size = bounded(args[0], 1, 60_000_000),
          groups = new Map();
        for (const p of entries) {
          const cell = Object.fromEntries(axes.map((k) => [k, Math.floor(p[k] / size)])),
            id = key(cell);
          if (!groups.has(id)) groups.set(id, { cell, count: 0 });
          groups.get(id).count++;
        }
        return result({
          size,
          cells: [...groups.values()].sort((a, b) => a.cell.x - b.cell.x || a.cell.y - b.cell.y || a.cell.z - b.cell.z),
        });
      }
      case 'spread': {
        const center = entries.length
          ? Object.fromEntries(axes.map((k) => [k, entries.reduce((sum, p) => sum + p[k], 0) / entries.length]))
          : null;
        const radii = center ? entries.map((p) => distance(p, center)) : [];
        return result({
          count: entries.length,
          center,
          meanRadius: radii.length ? radii.reduce((sum, n) => sum + n, 0) / radii.length : null,
          maximumRadius: radii.length ? radii.reduce((max, n) => Math.max(max, n), 0) : null,
        });
      }
      case 'projection': {
        const from = navPoint(args[0]),
          to = navPoint(args[1]);
        return result({ from, to, entries: entries.map((p) => ({ ...p, projection: projection(p, from, to) })) });
      }
    }
  }
  const byCell = new Map();
  for (const p of entries) {
    const cell = block(p),
      id = key(cell);
    if (!byCell.has(id)) byCell.set(id, { ...p, ...cell });
  }
  const cells = [...byCell.values()];
  const neighbors = (p) =>
    axes.flatMap((k) => [-1, 1].map((d) => ({ ...Object.fromEntries(axes.map((a) => [a, p[a]])), [k]: p[k] + d })));
  switch (command) {
    case 'block-columns': {
      const columns = new Map();
      for (const p of cells) {
        const id = `${p.x},${p.z}`;
        if (!columns.has(id)) columns.set(id, { x: p.x, z: p.z, heights: [] });
        columns.get(id).heights.push(p.y);
      }
      return result({
        columns: [...columns.values()].map((column) => ({ ...column, heights: column.heights.sort((a, b) => a - b) })),
      });
    }
    case 'block-components': {
      const name = itemName(args[0]),
        remaining = new Map(cells.filter((p) => p.name === name).map((p) => [key(p), p])),
        components = [];
      while (remaining.size) {
        const first = remaining.values().next().value,
          points = [first];
        remaining.delete(key(first));
        for (let i = 0; i < points.length; i++)
          for (const next of neighbors(points[i])) {
            const id = key(next);
            if (remaining.has(id)) {
              points.push(remaining.get(id));
              remaining.delete(id);
            }
          }
        components.push({ count: points.length, blocks: points });
      }
      return result({
        name,
        components: components.sort((a, b) => b.count - a.count),
        adjacency: 'six face neighbors among observed cells only',
      });
    }
    case 'block-surface': {
      const name = itemName(args[0]);
      const faces = cells
        .filter((p) => p.name === name)
        .map((p) => ({ ...p, unobservedNeighborFaces: neighbors(p).filter((n) => !byCell.has(key(n))).length }));
      return result({
        name,
        blocks: faces,
        unobservedNeighborFaces: faces.reduce((sum, p) => sum + p.unobservedNeighborFaces, 0),
      });
    }
    case 'block-neighbors': {
      const point = block(navPoint(args[0]));
      return result({
        point,
        blocks: neighbors(point)
          .map((p) => byCell.get(key(p)))
          .filter(Boolean),
      });
    }
    case 'block-duplicates': {
      const groups = new Map();
      for (const p of entries) {
        const point = block(p),
          id = key(point);
        if (!groups.has(id)) groups.set(id, { point, count: 0, names: new Set() });
        const group = groups.get(id);
        group.count++;
        group.names.add(p.name ?? 'unknown');
      }
      return result({
        duplicates: [...groups.values()].filter((g) => g.count > 1).map((g) => ({ ...g, names: [...g.names].sort() })),
      });
    }
    case 'block-height-profile': {
      const direction = axis(args[0]);
      if (direction === 'y') throw new Error('Height-profile axis must be x or z.');
      const groups = new Map();
      for (const p of cells) {
        const value = p[direction];
        if (!groups.has(value)) groups.set(value, { coordinate: value, minY: p.y, maxY: p.y, count: 0 });
        const g = groups.get(value);
        g.minY = Math.min(g.minY, p.y);
        g.maxY = Math.max(g.maxY, p.y);
        g.count++;
      }
      return result({ axis: direction, profile: [...groups.values()].sort((a, b) => a.coordinate - b.coordinate) });
    }
    case 'block-cross-section': {
      const direction = axis(args[0]),
        coordinate = bounded(args[1], direction === 'y' ? -64 : -29_999_984, direction === 'y' ? 320 : 29_999_984);
      if (!Number.isInteger(coordinate)) throw new Error('Slice coordinate must be an integer.');
      return result({ axis: direction, coordinate, blocks: cells.filter((p) => p[direction] === coordinate) });
    }
  }
}

export function registerTerrainTools(program, { view }) {
  const group = program
    .command('terrain')
    .description('Read-only analysis of partial observed positions; points use x,y,z.');
  for (const [signature, description] of TERRAIN_COMMANDS) {
    const [name, ...args] = signature.split(' ');
    group
      .command(signature)
      .description(description)
      .action((...values) => view((state) => terrainReport(state, name, values.slice(0, args.length))));
  }
  return group;
}
