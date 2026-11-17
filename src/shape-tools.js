import { numeric, positive, count, size, radians, wrap, sequence, checked } from './spatial-inputs.js';

function polygon(value) {
  const ps = String(value)
    .split(';')
    .map((s) => {
      const v = s.split(',');
      if (v.length !== 2) throw new Error('Use x,z;x,z;...');
      return { x: numeric(v[0]), z: numeric(v[1]) };
    });
  if (ps.length < 3 || ps.length > 100) throw new Error('Supply 3 to 100 vertices without repeating the first.');
  if (new Set(ps.map((p) => `${p.x},${p.z}`)).size !== ps.length) throw new Error('Vertices must be distinct.');
  const orient = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
  const on = (a, b, c) =>
    orient(a, b, c) === 0 &&
    c.x >= Math.min(a.x, b.x) &&
    c.x <= Math.max(a.x, b.x) &&
    c.z >= Math.min(a.z, b.z) &&
    c.z <= Math.max(a.z, b.z);
  const hit = (a, b, c, d) => {
    const p = orient(a, b, c),
      q = orient(a, b, d),
      r = orient(c, d, a),
      s = orient(c, d, b);
    return (p * q < 0 && r * s < 0) || on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b);
  };
  for (let i = 0; i < ps.length; i++)
    for (let j = i + 1; j < ps.length; j++)
      if (
        j !== i + 1 &&
        !(i === 0 && j === ps.length - 1) &&
        hit(ps[i], ps[(i + 1) % ps.length], ps[j], ps[(j + 1) % ps.length])
      )
        throw new Error('Polygon must be simple.');
  if (Math.abs(signed(ps)) < 1e-9) throw new Error('Polygon must have nonzero area.');
  return ps;
}
const edges = (ps) => ps.map((p, i) => ({ from: p, to: ps[(i + 1) % ps.length] }));
const cross = (p, q) => p.x * q.z - q.x * p.z;
const signed = (ps) => edges(ps).reduce((s, e) => s + cross(e.from, e.to), 0) / 2;
const area = (ps) => Math.abs(signed(ps));
const boundary = (ps) => edges(ps).reduce((s, e) => s + Math.hypot(e.to.x - e.from.x, e.to.z - e.from.z), 0);
const bounds = (ps) => ({
  minX: Math.min(...ps.map((p) => p.x)),
  maxX: Math.max(...ps.map((p) => p.x)),
  minZ: Math.min(...ps.map((p) => p.z)),
  maxZ: Math.max(...ps.map((p) => p.z)),
});
function centroid(ps) {
  const s = 6 * signed(ps);
  return {
    x: edges(ps).reduce((n, e) => n + (e.from.x + e.to.x) * cross(e.from, e.to), 0) / s,
    z: edges(ps).reduce((n, e) => n + (e.from.z + e.to.z) * cross(e.from, e.to), 0) / s,
  };
}
function contains(ps, x, z) {
  let inside = false;
  for (const e of edges(ps)) {
    const { from: p, to: q } = e;
    if (
      Math.abs((q.x - p.x) * (z - p.z) - (q.z - p.z) * (x - p.x)) < 1e-9 &&
      x >= Math.min(p.x, q.x) &&
      x <= Math.max(p.x, q.x) &&
      z >= Math.min(p.z, q.z) &&
      z <= Math.max(p.z, q.z)
    )
      return true;
    if (p.z > z !== q.z > z && x < ((q.x - p.x) * (z - p.z)) / (q.z - p.z) + p.x) inside = !inside;
  }
  return inside;
}

const NOTE =
  'Continuous X/Z polygon geometry, not placed block counts. Vertices are x,z pairs separated by semicolons, with 3 to 100 distinct vertices, no repeated closing vertex, no self-intersections, and nonzero area. Quote the vertex argument in your shell. Rasterization tests cell centers and is capped at 1000 candidate cells.';
export const SHAPE_COMMANDS = [
  ['signed-area <vertices>', 'Compute signed continuous X/Z area; positive is counterclockwise.'],
  ['winding <vertices>', 'Report vertex winding.'],
  ['centroid <vertices>', 'Compute the area-weighted polygon centroid.'],
  ['edge-lengths <vertices>', 'List continuous edge lengths including the closing edge.'],
  ['compactness <vertices>', 'Compute 4 pi area divided by squared perimeter.'],
  ['bounds-fill <vertices>', 'Compute polygon area divided by its axis-aligned bounding rectangle.'],
  ['contains <vertices> <x> <z>', 'Test continuous point inclusion including the boundary.'],
  ['translate <vertices> <x> <z>', 'Translate all vertices by supplied offsets.'],
  ['scale-centroid <vertices> <factor>', 'Scale vertices around the area centroid by a positive factor.'],
  ['rotate-centroid <vertices> <degrees>', 'Rotate vertices in the X/Z plane around their area centroid.'],
  ['reverse-winding <vertices>', 'Reverse a polygon while preserving its first vertex.'],
  ['vertex-mean <vertices>', 'Compute the unweighted vertex mean for comparison with area centroid.'],
  ['convex <vertices>', 'Check that all noncollinear turns share a sign.'],
  ['edge-headings <vertices>', 'List Minecraft yaw headings of polygon edges.'],
  ['edge-midpoints <vertices>', 'List edge midpoint coordinates.'],
  ['prism-volume <vertices> <height>', 'Compute a continuous vertical prism volume.'],
  ['side-area <vertices> <height>', 'Compute lateral surface area of a vertical polygon prism.'],
  ['surface-area <vertices> <height>', 'Compute closed prism continuous surface area.'],
  ['extrusion-material <vertices> <height> <density>', 'Estimate supplied units per continuous volume.'],
  [
    'paint-budget <vertices> <coats> <coverage>',
    'Round up containers needed for polygon area at supplied coverage per coat.',
  ],
  [
    'raster-centers <vertices>',
    'List integer block cells whose centers lie inside the polygon, capped at 1000 candidates.',
  ],
  ['nearest-vertex <vertices> <x> <z>', 'Choose the first nearest vertex to a point.'],
  ['nearest-edge <vertices> <x> <z>', 'Compute shortest continuous distance to a polygon boundary.'],
  ['diagonals <vertices>', 'Count combinatorial vertex diagonals; diagonals may leave concave polygons.'],
  ['vertex-angle-sum <vertices>', 'Compute the interior-angle sum of a simple polygon in degrees.'],
];

export function shapeCalculation(command, args = []) {
  const spec = SHAPE_COMMANDS.find(([s]) => s.split(' ')[0] === command);
  if (!spec) throw new Error(`Unknown shape command: ${command}.`);
  if (!Array.isArray(args) || args.length !== spec[0].split(' ').length - 1)
    throw new Error('Supply exactly the documented arguments.');
  const a = args;
  let result;
  switch (command) {
    case 'signed-area': {
      result = signed(polygon(a[0]));
      break;
    }
    case 'winding': {
      result = signed(polygon(a[0])) > 0 ? 'counterclockwise' : 'clockwise';
      break;
    }
    case 'centroid': {
      result = centroid(polygon(a[0]));
      break;
    }
    case 'edge-lengths': {
      result = edges(polygon(a[0])).map((e) => Math.hypot(e.to.x - e.from.x, e.to.z - e.from.z));
      break;
    }
    case 'compactness': {
      const ps = polygon(a[0]);
      result = (4 * Math.PI * area(ps)) / boundary(ps) ** 2;
      break;
    }
    case 'bounds-fill': {
      const ps = polygon(a[0]),
        b = bounds(ps);
      result = area(ps) / ((b.maxX - b.minX) * (b.maxZ - b.minZ));
      break;
    }
    case 'contains': {
      result = contains(polygon(a[0]), numeric(a[1]), numeric(a[2]));
      break;
    }
    case 'translate': {
      result = polygon(a[0]).map((p) => ({ x: p.x + numeric(a[1]), z: p.z + numeric(a[2]) }));
      break;
    }
    case 'scale-centroid': {
      const ps = polygon(a[0]),
        c = centroid(ps),
        f = positive(a[1]);
      result = ps.map((p) => ({ x: c.x + (p.x - c.x) * f, z: c.z + (p.z - c.z) * f }));
      break;
    }
    case 'rotate-centroid': {
      const ps = polygon(a[0]),
        c = centroid(ps),
        t = radians(a[1]);
      result = ps.map((p) => ({
        x: c.x + (p.x - c.x) * Math.cos(t) - (p.z - c.z) * Math.sin(t),
        z: c.z + (p.x - c.x) * Math.sin(t) + (p.z - c.z) * Math.cos(t),
      }));
      break;
    }
    case 'reverse-winding': {
      const ps = polygon(a[0]);
      result = [ps[0], ...ps.slice(1).reverse()];
      break;
    }
    case 'vertex-mean': {
      const ps = polygon(a[0]);
      result = { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, z: ps.reduce((s, p) => s + p.z, 0) / ps.length };
      break;
    }
    case 'convex': {
      const ps = polygon(a[0]);
      result =
        new Set(
          ps
            .map((p, i) => {
              const q = ps[(i + 1) % ps.length],
                r = ps[(i + 2) % ps.length];
              return Math.sign((q.x - p.x) * (r.z - q.z) - (q.z - p.z) * (r.x - q.x));
            })
            .filter(Boolean),
        ).size === 1;
      break;
    }
    case 'edge-headings': {
      result = edges(polygon(a[0])).map((e) =>
        wrap((Math.atan2(e.from.x - e.to.x, e.to.z - e.from.z) * 180) / Math.PI),
      );
      break;
    }
    case 'edge-midpoints': {
      result = edges(polygon(a[0])).map((e) => ({ x: (e.from.x + e.to.x) / 2, z: (e.from.z + e.to.z) / 2 }));
      break;
    }
    case 'prism-volume': {
      result = area(polygon(a[0])) * numeric(a[1], 0);
      break;
    }
    case 'side-area': {
      result = boundary(polygon(a[0])) * numeric(a[1], 0);
      break;
    }
    case 'surface-area': {
      const ps = polygon(a[0]);
      result = 2 * area(ps) + boundary(ps) * numeric(a[1], 0);
      break;
    }
    case 'extrusion-material': {
      result = area(polygon(a[0])) * numeric(a[1], 0) * numeric(a[2], 0);
      break;
    }
    case 'paint-budget': {
      result = Math.ceil((area(polygon(a[0])) * count(a[1])) / positive(a[2]));
      break;
    }
    case 'raster-centers': {
      const ps = polygon(a[0]),
        b = bounds(ps),
        x = Math.floor(b.minX),
        z = Math.floor(b.minZ),
        nx = Math.ceil(b.maxX) - x,
        nz = Math.ceil(b.maxZ) - z;
      result = sequence(nx * nz, (i) => ({ x: x + (i % nx), z: z + Math.floor(i / nx) })).filter((p) =>
        contains(ps, p.x + 0.5, p.z + 0.5),
      );
      break;
    }
    case 'nearest-vertex': {
      const ps = polygon(a[0]),
        x = numeric(a[1]),
        z = numeric(a[2]);
      result = ps
        .map((p, i) => ({ vertex: i + 1, distance: Math.hypot(p.x - x, p.z - z) }))
        .reduce((p, q) => (q.distance < p.distance ? q : p));
      break;
    }
    case 'nearest-edge': {
      const ps = polygon(a[0]),
        x = numeric(a[1]),
        z = numeric(a[2]);
      result = Math.min(
        ...edges(ps).map((e) => {
          const dx = e.to.x - e.from.x,
            dz = e.to.z - e.from.z,
            t = Math.max(0, Math.min(1, ((x - e.from.x) * dx + (z - e.from.z) * dz) / (dx * dx + dz * dz)));
          return Math.hypot(x - e.from.x - t * dx, z - e.from.z - t * dz);
        }),
      );
      break;
    }
    case 'diagonals': {
      const n = polygon(a[0]).length;
      result = (n * (n - 3)) / 2;
      break;
    }
    case 'vertex-angle-sum': {
      result = (polygon(a[0]).length - 2) * 180;
      break;
    }
  }
  return checked({ result, note: NOTE });
}
export function registerShapeTools(program, { print }) {
  const group = program.command('shape').description(NOTE);
  for (const [signature, description] of SHAPE_COMMANDS)
    group
      .command(signature)
      .description(description)
      .action((...values) => print(shapeCalculation(signature.split(' ')[0], values.slice(0, -2))));
  return group;
}
