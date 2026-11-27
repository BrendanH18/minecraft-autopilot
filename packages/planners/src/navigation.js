import { headingBetween } from '../../../src/cli-views.js';

const BORDER = 29_999_984;
const NOTE = 'Straight-line geometry only; terrain, hazards, and portal linking are not checked.';
const MAX_POINTS = 50;
export function navNumber(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || value.trim() === ''))
    throw new Error('Use a finite number.');
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error('Use a finite number.');
  return parsed;
}
export function navPoint(value) {
  const parts = typeof value === 'string' ? value.split(',') : null;
  if (parts?.length !== 3) throw new Error('Use a point as x,y,z.');
  return bounded(Object.fromEntries(['x', 'y', 'z'].map((axis, i) => [axis, navNumber(parts[i])])));
}
function bounded(point) {
  if (
    ![point.x, point.y, point.z].every(Number.isFinite) ||
    Math.abs(point.x) > BORDER ||
    Math.abs(point.z) > BORDER ||
    point.y < -64 ||
    point.y > 320
  ) {
    throw new Error('Point outside supported world bounds: X/Z ±29,999,984; Y -64 to 320.');
  }
  return point;
}
const mapAxes = (point, fn) => Object.fromEntries(['x', 'y', 'z'].map((axis) => [axis, fn(point[axis])]));
const vector = (from, to) => Object.fromEntries(['x', 'y', 'z'].map((axis) => [axis, to[axis] - from[axis]]));
const distance = (from, to) => Math.hypot(...Object.values(vector(from, to)));
function between(from, to, fraction) {
  return Object.fromEntries(['x', 'y', 'z'].map((axis) => [axis, from[axis] + (to[axis] - from[axis]) * fraction]));
}
function index(value, scale, axis = 'x') {
  const parsed = navNumber(value);
  const max = axis === 'y' ? 19 : Math.floor(BORDER / scale);
  const min = axis === 'y' ? -4 : Math.floor(-BORDER / scale);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max)
    throw new Error(`Use an integer index from ${min} to ${max}.`);
  return parsed;
}
function route(values) {
  if (values.length < 2 || values.length > MAX_POINTS) throw new Error(`Give 2 to ${MAX_POINTS} route points.`);
  return values.map(navPoint);
}
function cuboid(points) {
  return {
    min: Object.fromEntries(['x', 'y', 'z'].map((axis) => [axis, Math.min(...points.map((p) => p[axis]))])),
    max: Object.fromEntries(['x', 'y', 'z'].map((axis) => [axis, Math.max(...points.map((p) => p[axis]))])),
  };
}

/** Every calculator is offline and never acquires a control lease. */
export function navigationCalculation(name, ...args) {
  const point = () => navPoint(args[0]);
  const pair = () => [navPoint(args[0]), navPoint(args[1])];
  switch (name) {
    case 'block':
      return { block: mapAxes(point(), Math.floor) };
    case 'chunk': {
      const p = point();
      return { chunkX: Math.floor(p.x / 16), chunkZ: Math.floor(p.z / 16) };
    }
    case 'region': {
      const p = point();
      return {
        regionX: Math.floor(p.x / 512),
        regionZ: Math.floor(p.z / 512),
        file: `r.${Math.floor(p.x / 512)}.${Math.floor(p.z / 512)}.mca`,
      };
    }
    case 'chunk-origin': {
      const x = index(args[0], 16),
        z = index(args[1], 16);
      return { x: x * 16, z: z * 16 };
    }
    case 'region-origin': {
      const x = index(args[0], 512),
        z = index(args[1], 512);
      return { x: x * 512, z: z * 512 };
    }
    case 'chunk-local': {
      const p = point();
      return { x: ((Math.floor(p.x) % 16) + 16) % 16, y: Math.floor(p.y), z: ((Math.floor(p.z) % 16) + 16) % 16 };
    }
    case 'region-local': {
      const p = point();
      return { chunkX: ((Math.floor(p.x / 16) % 32) + 32) % 32, chunkZ: ((Math.floor(p.z / 16) % 32) + 32) % 32 };
    }
    case 'section':
      return { sectionY: Math.floor(point().y / 16) };
    case 'section-origin':
      return { y: index(args[0], 16, 'y') * 16 };
    case 'distance': {
      const [from, to] = pair();
      return { distance: distance(from, to), note: NOTE };
    }
    case 'horizontal': {
      const [from, to] = pair();
      return { horizontalDistance: Math.hypot(to.x - from.x, to.z - from.z), note: NOTE };
    }
    case 'displacement': {
      const [from, to] = pair();
      return { delta: vector(from, to) };
    }
    case 'heading': {
      const [from, to] = pair();
      return { ...headingBetween(from, to), note: NOTE };
    }
    case 'midpoint': {
      const [from, to] = pair();
      return { point: between(from, to, 0.5) };
    }
    case 'offset': {
      const p = point();
      const d = Object.fromEntries(['x', 'y', 'z'].map((axis, i) => [axis, navNumber(args[i + 1])]));
      return { point: bounded(Object.fromEntries(['x', 'y', 'z'].map((axis) => [axis, p[axis] + d[axis]]))) };
    }
    case 'interpolate': {
      const [from, to] = pair(),
        fraction = navNumber(args[2]);
      if (fraction < 0 || fraction > 1) throw new Error('Fraction must be from 0 to 1.');
      return { point: between(from, to, fraction) };
    }
    case 'nether': {
      const p = point();
      return {
        point: { x: p.x / 8, y: p.y, z: p.z / 8 },
        from: 'minecraft:overworld',
        to: 'minecraft:the_nether',
        note: NOTE,
      };
    }
    case 'overworld': {
      const p = point();
      return {
        point: bounded({ x: p.x * 8, y: p.y, z: p.z * 8 }),
        from: 'minecraft:the_nether',
        to: 'minecraft:overworld',
        note: NOTE,
      };
    }
    case 'route': {
      const points = route(args);
      return {
        points,
        distance: points.slice(1).reduce((sum, p, i) => sum + distance(points[i], p), 0),
        legs: points.length - 1,
        note: NOTE,
      };
    }
    case 'reverse-route':
      return { points: route(args).reverse() };
    case 'close-route': {
      const points = route(args);
      if (distance(points[0], points.at(-1)) !== 0) points.push({ ...points[0] });
      return { points };
    }
    case 'route-bounds':
      return cuboid(route(args));
    case 'route-sample': {
      const [from, to] = pair();
      const spacing = navNumber(args[2]);
      if (spacing <= 0) throw new Error('Spacing must be positive.');
      const count = Math.max(1, Math.ceil(distance(from, to) / spacing));
      if (count > 999) throw new Error('Sampling is limited to 1000 points; increase spacing.');
      return { points: Array.from({ length: count + 1 }, (_, i) => between(from, to, i / count)), note: NOTE };
    }
    case 'contains': {
      const [from, to] = pair(),
        p = navPoint(args[2]),
        box = cuboid([from, to]);
      return {
        ...box,
        point: p,
        contains: ['x', 'y', 'z'].every((axis) => p[axis] >= box.min[axis] && p[axis] <= box.max[axis]),
      };
    }
    case 'nearest': {
      const from = point(),
        candidates = route(args);
      candidates.shift();
      const nearest = candidates
        .map((p, i) => ({ point: p, index: i + 1, distance: distance(from, p) }))
        .sort((a, b) => a.distance - b.distance)[0];
      return { ...nearest, note: NOTE };
    }
    default:
      throw new Error(`Unknown navigation calculator: ${name}.`);
  }
}

export const NAV_COMMANDS = [
  ['block', ['<point>'], 'Floor player coordinates to block coordinates.'],
  ['chunk', ['<point>'], 'Find chunk X/Z containing a point.'],
  ['region', ['<point>'], 'Find the region indices and vanilla region filename.'],
  ['chunk-origin', ['<chunk-x>', '<chunk-z>'], 'Convert chunk indices to the northwest block corner.'],
  ['region-origin', ['<region-x>', '<region-z>'], 'Convert region indices to their northwest block corner.'],
  ['chunk-local', ['<point>'], 'Find local block X/Z (0–15) within a chunk.'],
  ['region-local', ['<point>'], 'Find local chunk X/Z (0–31) within a region.'],
  ['section', ['<point>'], 'Find the vertical section index.'],
  ['section-origin', ['<section-y>'], 'Find the bottom Y of a vertical section.'],
  ['distance', ['<from>', '<to>'], 'Measure straight-line three-dimensional distance.'],
  ['horizontal', ['<from>', '<to>'], 'Measure horizontal distance.'],
  ['displacement', ['<from>', '<to>'], 'Calculate signed X/Y/Z offsets.'],
  ['heading', ['<from>', '<to>'], 'Calculate Minecraft yaw, pitch, and compass direction.'],
  ['midpoint', ['<from>', '<to>'], 'Find the midpoint between two positions.'],
  ['offset', ['<point>', '<dx>', '<dy>', '<dz>'], 'Apply signed coordinate offsets.'],
  ['interpolate', ['<from>', '<to>', '<fraction>'], 'Find a point at fraction 0–1 along a segment.'],
  ['nether', ['<point>'], 'Scale Overworld X/Z to theoretical Nether coordinates.'],
  ['overworld', ['<point>'], 'Scale Nether X/Z to theoretical Overworld coordinates.'],
  ['route', ['<points...>'], 'Calculate total distance for 2–50 ordered points.'],
  ['reverse-route', ['<points...>'], 'Reverse a route for the return trip.'],
  ['close-route', ['<points...>'], 'Append the starting point to close a route.'],
  ['route-bounds', ['<points...>'], 'Calculate a route bounding cuboid.'],
  ['route-sample', ['<from>', '<to>', '<spacing>'], 'Sample a straight segment at no more than spacing blocks.'],
  ['contains', ['<corner-a>', '<corner-b>', '<point>'], 'Test whether a point lies within an inclusive cuboid.'],
  ['nearest', ['<points...>'], 'Choose the nearest candidate to the first point (ties keep input order).'],
];
export function registerNavigation(program, { print }) {
  const group = program
    .command('nav')
    .description(
      'Offline navigation geometry; never connects to Minecraft. Points use x,y,z; put -- before negative arguments.',
    );
  for (const [name, args, description] of NAV_COMMANDS) {
    let command = group.command(name).description(description);
    for (const arg of args) command = command.argument(arg);
    command.action((...values) => {
      const raw = values.slice(0, args.length);
      print(navigationCalculation(name, ...(args[0] === '<points...>' ? raw[0] : raw)));
    });
  }
  return group;
}
