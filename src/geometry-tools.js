import { navNumber, navPoint } from './navigation.js';

const NOTE = 'Offline straight-line geometry in one dimension; terrain, hazards, movement physics, and portal links are not checked.';
const axes = ['x', 'y', 'z'];
const distance = (a, b) => Math.hypot(...axes.map(axis => b[axis] - a[axis]));
const horizontal = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
const blend = (a, b, t) => Object.fromEntries(axes.map(axis => [axis, a[axis] + (b[axis] - a[axis]) * t]));
const checkedPoint = p => navPoint(axes.map(axis => p[axis]).join(','));
function route(values) {
  if (values.length < 2 || values.length > 50) throw new Error('Give 2 to 50 route points.');
  return values.map(navPoint);
}
function nonnegative(value) {
  const n = navNumber(value);
  if (n < 0 || n > 1e10) throw new Error('Use a nonnegative value no greater than 10000000000.');
  return n;
}
function degrees(value) {
  const n = navNumber(value);
  if (Math.abs(n) > 360) throw new Error('Angle must be between -360 and 360 degrees.');
  return n * Math.PI / 180;
}
function box(a, b) {
  return { min: Object.fromEntries(axes.map(axis => [axis, Math.min(a[axis], b[axis])])),
    max: Object.fromEntries(axes.map(axis => [axis, Math.max(a[axis], b[axis])])) };
}
const clamp = (p, bounds) => Object.fromEntries(axes.map(axis => [axis, Math.max(bounds.min[axis], Math.min(bounds.max[axis], p[axis]))]));
function projection(a, b, p) {
  const delta = axes.map(axis => b[axis] - a[axis]);
  const denominator = delta.reduce((sum, n) => sum + n * n, 0);
  const fraction = denominator ? Math.max(0, Math.min(1, axes.reduce((sum, axis, i) => sum + (p[axis] - a[axis]) * delta[i], 0) / denominator)) : 0;
  const point = blend(a, b, fraction);
  return { point, fraction, distance: distance(point, p) };
}
function legs(points) {
  return points.slice(1).map((to, i) => ({ leg: i + 1, from: points[i], to, distance: distance(points[i], to), horizontalDistance: horizontal(points[i], to), rise: to.y - points[i].y }));
}
function at(points, target) {
  const segments = legs(points), total = segments.reduce((sum, leg) => sum + leg.distance, 0);
  if (target > total) throw new Error('Requested distance exceeds route length.');
  let covered = 0;
  for (const leg of segments) {
    if (target <= covered + leg.distance) return { point: blend(leg.from, leg.to, leg.distance ? (target - covered) / leg.distance : 0), leg: leg.leg, distance: target, total };
    covered += leg.distance;
  }
  return { point: points.at(-1), leg: segments.length, distance: target, total };
}

/** Coordinates are protocol-bounded; no calculator connects to a backend. */
export function geometryCalculation(name, ...args) {
  let result;
  const points = () => route(args);
  const pairBox = () => box(navPoint(args[0]), navPoint(args[1]));
  switch (name) {
    case 'route-legs': result = { legs: legs(points()) }; break;
    case 'route-elevation': {
      const changes = legs(points()).map(leg => leg.rise);
      result = { ascent: changes.reduce((sum, n) => sum + Math.max(0, n), 0), descent: changes.reduce((sum, n) => sum + Math.max(0, -n), 0), net: changes.reduce((sum, n) => sum + n, 0) }; break;
    }
    case 'route-grades': result = { legs: legs(points()).map(leg => ({ leg: leg.leg, rise: leg.rise, horizontalDistance: leg.horizontalDistance,
      gradePercent: leg.horizontalDistance ? leg.rise / leg.horizontalDistance * 100 : null, vertical: !leg.horizontalDistance && leg.rise !== 0 })) }; break;
    case 'route-turns': {
      const p = points();
      result = { turns: p.slice(1, -1).map((b, i) => {
        const a = p[i], c = p[i + 2], first = horizontal(a, b), second = horizontal(b, c);
        return { waypoint: i + 2, degrees: first && second ? Math.atan2((b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x), (b.x - a.x) * (c.x - b.x) + (b.z - a.z) * (c.z - b.z)) * 180 / Math.PI : null };
      }), convention: 'Signed X/Z turn: positive rotates east toward south; vertical or zero horizontal legs produce null.' }; break;
    }
    case 'route-detour': {
      const p = points(), traveled = legs(p).reduce((sum, leg) => sum + leg.distance, 0), direct = distance(p[0], p.at(-1));
      result = { traveled, direct, excess: Math.max(0, traveled - direct), ratio: direct ? traveled / direct : null }; break;
    }
    case 'route-progress': {
      let cumulative = 0;
      result = { waypoints: points().map((point, i, p) => { if (i) cumulative += distance(p[i - 1], point); return { waypoint: i + 1, point, cumulative }; }) }; break;
    }
    case 'route-at': result = at(route(args.slice(1)), nonnegative(args[0])); break;
    case 'route-prefix': {
      const p = route(args.slice(1)), target = nonnegative(args[0]), end = at(p, target), kept = [p[0]];
      let cumulative = 0;
      for (const leg of legs(p)) { cumulative += leg.distance; if (cumulative >= target) break; kept.push(leg.to); }
      if (distance(kept.at(-1), end.point)) kept.push(end.point);
      result = { points: kept, distance: target }; break;
    }
    case 'route-dedupe': {
      const p = points(), kept = p.filter((point, i) => !i || distance(point, p[i - 1]) !== 0);
      result = { points: kept, removed: p.length - kept.length }; break;
    }
    case 'route-simplify': {
      const p = points(), kept = [];
      for (const point of p) {
        kept.push(point);
        while (kept.length >= 3 && projection(kept.at(-3), kept.at(-1), kept.at(-2)).distance <= 1e-7) kept.splice(kept.length - 2, 1);
      }
      result = { points: kept, removed: p.length - kept.length, tolerance: 1e-7 }; break;
    }
    case 'route-project': {
      const query = navPoint(args[0]), p = route(args.slice(1));
      let cumulative = 0, best;
      for (const leg of legs(p)) {
        const candidate = { ...projection(leg.from, leg.to, query), leg: leg.leg };
        candidate.alongRoute = cumulative + candidate.fraction * leg.distance;
        if (!best || candidate.distance < best.distance) best = candidate;
        cumulative += leg.distance;
      }
      result = best; break;
    }
    case 'segment-project': result = projection(navPoint(args[0]), navPoint(args[1]), navPoint(args[2])); break;
    case 'sphere-contains': {
      const center = navPoint(args[0]), radius = nonnegative(args[1]), point = navPoint(args[2]), measured = distance(center, point);
      result = { center, radius, point, distance: measured, contains: measured <= radius }; break;
    }
    case 'box-volume': {
      const bounds = pairBox(), spans = axes.map(axis => bounds.max[axis] - bounds.min[axis]);
      result = { ...bounds, volume: spans.reduce((product, n) => product * n, 1), units: 'cubic blocks (continuous volume, not inclusive block count)' }; break;
    }
    case 'box-surface': {
      const bounds = pairBox(), [x, y, z] = axes.map(axis => bounds.max[axis] - bounds.min[axis]);
      result = { ...bounds, surfaceArea: 2 * (x * y + x * z + y * z), units: 'square blocks (continuous geometry)' }; break;
    }
    case 'box-intersection': {
      const a = pairBox(), b = box(navPoint(args[2]), navPoint(args[3]));
      const min = Object.fromEntries(axes.map(axis => [axis, Math.max(a.min[axis], b.min[axis])])), max = Object.fromEntries(axes.map(axis => [axis, Math.min(a.max[axis], b.max[axis])]));
      const intersects = axes.every(axis => min[axis] <= max[axis]);
      result = { intersects, bounds: intersects ? { min, max } : null }; break;
    }
    case 'box-union': {
      const a = pairBox(), b = box(navPoint(args[2]), navPoint(args[3]));
      result = { min: Object.fromEntries(axes.map(axis => [axis, Math.min(a.min[axis], b.min[axis])])), max: Object.fromEntries(axes.map(axis => [axis, Math.max(a.max[axis], b.max[axis])])), meaning: 'Smallest enclosing axis-aligned box; may include space outside both inputs.' }; break;
    }
    case 'box-clamp': {
      const bounds = pairBox(), query = navPoint(args[2]), point = clamp(query, bounds);
      result = { point, distance: distance(query, point) }; break;
    }
    case 'sphere-box': {
      const center = navPoint(args[0]), radius = nonnegative(args[1]), bounds = box(navPoint(args[2]), navPoint(args[3])), nearest = clamp(center, bounds);
      result = { intersects: distance(center, nearest) <= radius, nearest, distance: distance(center, nearest) }; break;
    }
    case 'chunk-distance': {
      const a = navPoint(args[0]), b = navPoint(args[1]), dx = Math.abs(Math.floor(a.x / 16) - Math.floor(b.x / 16)), dz = Math.abs(Math.floor(a.z / 16) - Math.floor(b.z / 16));
      result = { dx, dz, manhattan: dx + dz, chebyshev: Math.max(dx, dz) }; break;
    }
    case 'chunk-center': {
      const p = navPoint(args[0]);
      result = { point: checkedPoint({ x: Math.floor(p.x / 16) * 16 + 8, y: p.y, z: Math.floor(p.z / 16) * 16 + 8 }) }; break;
    }
    case 'block-center': {
      const p = navPoint(args[0]);
      result = { point: checkedPoint(Object.fromEntries(axes.map(axis => [axis, Math.floor(p[axis]) + 0.5]))) }; break;
    }
    case 'bearing-target': {
      const p = navPoint(args[0]), yaw = degrees(args[1]), length = nonnegative(args[2]);
      result = { point: checkedPoint({ x: p.x - Math.sin(yaw) * length, y: p.y, z: p.z + Math.cos(yaw) * length }) }; break;
    }
    case 'rotate': {
      const p = navPoint(args[0]), pivot = navPoint(args[1]), angle = degrees(args[2]), dx = p.x - pivot.x, dz = p.z - pivot.z;
      result = { point: checkedPoint({ x: pivot.x + dx * Math.cos(angle) - dz * Math.sin(angle), y: p.y, z: pivot.z + dx * Math.sin(angle) + dz * Math.cos(angle) }) }; break;
    }
    case 'route-time': {
      const speed = navNumber(args[0]);
      if (speed <= 0 || speed > 1000) throw new Error('Speed must be greater than zero and at most 1000 blocks per second.');
      const length = legs(route(args.slice(1))).reduce((sum, leg) => sum + leg.distance, 0);
      if (!Number.isFinite(length / speed)) throw new Error('Speed is too small for a finite duration.');
      result = { distance: length, speed, seconds: length / speed, assumption: 'Constant supplied speed; stops, acceleration, vertical movement, and terrain are excluded.' }; break;
    }
    default: throw new Error(`Unknown geometry calculator: ${name}.`);
  }
  return { ...result, note: NOTE };
}

export const GEOMETRY_COMMANDS = [
  ['route-legs', ['<points...>'], 'Measure each route leg and its horizontal length and rise.'],
  ['route-elevation', ['<points...>'], 'Total ascent, descent, and net elevation change.'],
  ['route-grades', ['<points...>'], 'Report signed percent grade and vertical legs.'],
  ['route-turns', ['<points...>'], 'Measure horizontal turns at intermediate waypoints.'],
  ['route-detour', ['<points...>'], 'Compare route length with endpoint distance.'],
  ['route-progress', ['<points...>'], 'Report cumulative distance at each waypoint.'],
  ['route-at', ['<distance>', '<points...>'], 'Locate a point at a traveled distance along a route.'],
  ['route-prefix', ['<distance>', '<points...>'], 'Keep a route up to a traveled distance.'],
  ['route-dedupe', ['<points...>'], 'Remove consecutive duplicate waypoints.'],
  ['route-simplify', ['<points...>'], 'Remove collinear intermediate points within 0.0000001 block.'],
  ['route-project', ['<query>', '<points...>'], 'Find the closest point on the route and its traveled distance.'],
  ['segment-project', ['<from>', '<to>', '<query>'], 'Project a point onto a finite segment, clamping to endpoints.'],
  ['sphere-contains', ['<center>', '<radius>', '<point>'], 'Test inclusive spherical range.'],
  ['box-volume', ['<corner-a>', '<corner-b>'], 'Calculate continuous cuboid volume.'],
  ['box-surface', ['<corner-a>', '<corner-b>'], 'Calculate cuboid surface area.'],
  ['box-intersection', ['<a1>', '<a2>', '<b1>', '<b2>'], 'Find inclusive overlap of two boxes.'],
  ['box-union', ['<a1>', '<a2>', '<b1>', '<b2>'], 'Find the smallest box enclosing two boxes.'],
  ['box-clamp', ['<corner-a>', '<corner-b>', '<point>'], 'Find the nearest point within a box.'],
  ['sphere-box', ['<center>', '<radius>', '<corner-a>', '<corner-b>'], 'Check inclusive sphere/cuboid intersection.'],
  ['chunk-distance', ['<from>', '<to>'], 'Measure chunk offsets and cardinal/diagonal grid distance.'],
  ['chunk-center', ['<point>'], 'Find the horizontal center of the containing chunk.'],
  ['block-center', ['<point>'], 'Find the center of the containing block.'],
  ['bearing-target', ['<point>', '<yaw>', '<distance>'], 'Project a horizontal target using Minecraft yaw.'],
  ['rotate', ['<point>', '<pivot>', '<degrees>'], 'Rotate a point around a vertical axis through a pivot.'],
  ['route-time', ['<speed>', '<points...>'], 'Estimate route seconds at a supplied blocks-per-second speed.'],
];

export function registerGeometryTools(program, { print }) {
  const group = program.command('geometry').description('Offline route and spatial planning. Points: x,y,z. Use -- before negative arguments.');
  for (const [name, args, description] of GEOMETRY_COMMANDS) {
    let command = group.command(name).description(description);
    for (const arg of args) command = command.argument(arg);
    command.action((...values) => print(geometryCalculation(name, ...values.slice(0, args.length).flat())));
  }
  return group;
}
