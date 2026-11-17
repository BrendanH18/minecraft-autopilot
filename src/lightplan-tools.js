import { numeric, positive, count, size, sequence, checked } from './spatial-inputs.js';

const NOTE =
  'Abstract light geometry only: maximum source level minus unobstructed Manhattan distance, floored at zero. No occlusion, skylight, game-version behavior, spawning safety, or actual light propagation is checked. Source levels and rates are supplied assumptions. No sources are placed.';
export const LIGHTPLAN_COMMANDS = [
  ['falloff <source> <distance>', 'Compute supplied source level minus Manhattan travel distance, floored at zero.'],
  ['reach <source> <minimum>', 'Compute maximum abstract Manhattan range meeting a minimum level.'],
  [
    'vertical-reach <source> <minimum> <height>',
    'Compute remaining horizontal abstract reach after a vertical offset; -1 means unreachable.',
  ],
  ['line-spacing <source> <minimum>', 'Compute maximum spacing of integer line sources without below-minimum cells.'],
  [
    'square-spacing <source> <minimum>',
    'Compute integer square-grid spacing whose Manhattan worst cell meets minimum.',
  ],
  ['diamond-cells <radius>', 'Count integer cells in a Manhattan diamond.'],
  ['diamond-ring <radius>', 'Count integer cells at an exact Manhattan radius.'],
  ['diamond-points <radius>', 'List bounded integer coordinates in a Manhattan diamond.'],
  ['line-levels <source> <length>', 'Sample abstract light levels along a line from its first cell.'],
  ['between-sources <source> <separation>', 'Sample the maximum level from equal sources at both line endpoints.'],
  [
    'line-lit-count <source> <source-index> <length> <minimum>',
    'Count line cells meeting a supplied minimum from one source.',
  ],
  [
    'line-deficits <source> <source-index> <length> <minimum>',
    'List line cells below supplied minimum and their level deficits.',
  ],
  ['grid-source-count <width> <depth> <spacing>', 'Count endpoint-inclusive source grids on a rectangle.'],
  ['grid-sources <width> <depth> <spacing>', 'List endpoint-inclusive source grid coordinates.'],
  ['single-level <source> <sx> <sz> <x> <z>', 'Evaluate an abstract point from a single horizontal source.'],
  [
    'height-level <source> <horizontal> <vertical>',
    'Evaluate an abstract point using horizontal Manhattan distance and vertical offset.',
  ],
  ['corner-worst <source> <width> <depth>', 'Compute worst level on a rectangle lit only at its four corner cells.'],
  ['center-worst <source> <width> <depth>', 'Compute worst level from one source at the lower center cell.'],
  ['hanging-limit <source> <minimum> <horizontal>', 'Compute largest whole vertical source offset meeting minimum.'],
  ['wall-row-count <length> <spacing> <rows>', 'Count sources along parallel endpoint-inclusive wall rows.'],
  [
    'fuel-budget <sources> <duration> <burn-duration>',
    'Estimate whole consumable units per source for a supplied burn duration.',
  ],
  [
    'replacement-cycle <sources> <burn-duration> <interval>',
    'Estimate whole replacements over a supplied maintenance interval.',
  ],
  [
    'coverage-lower-bound <cells> <radius>',
    'Compute ideal area-only source lower bound; overlaps and edges can require more.',
  ],
  ['level-margin <source> <distance> <minimum>', 'Compute signed margin over supplied minimum abstract level.'],
  [
    'rectangle-audit <source> <sx> <sz> <width> <depth> <minimum>',
    'Audit min/max/mean levels and below-minimum cells in a bounded abstract rectangle.',
  ],
];

export function lightplanCalculation(command, args = []) {
  const spec = LIGHTPLAN_COMMANDS.find(([s]) => s.split(' ')[0] === command);
  if (!spec) throw new Error(`Unknown lightplan command: ${command}.`);
  if (!Array.isArray(args) || args.length !== spec[0].split(' ').length - 1)
    throw new Error('Supply exactly the documented arguments.');
  const a = args;
  let result;
  switch (command) {
    case 'falloff': {
      result = Math.max(0, numeric(a[0], 0) - numeric(a[1], 0));
      break;
    }
    case 'reach': {
      const s = numeric(a[0], 0),
        m = positive(a[1]);
      result = s < m ? -1 : s - m;
      break;
    }
    case 'vertical-reach': {
      const remaining = numeric(a[0], 0) - positive(a[1]) - Math.abs(numeric(a[2]));
      result = remaining < 0 ? -1 : remaining;
      break;
    }
    case 'line-spacing': {
      const r = Math.floor(numeric(a[0], 0) - positive(a[1]));
      if (r < 0) throw new Error('Source is below minimum.');
      result = 2 * r + 1;
      break;
    }
    case 'square-spacing': {
      const r = Math.floor(numeric(a[0], 0) - positive(a[1]));
      if (r < 0) throw new Error('Source is below minimum.');
      result = 2 * Math.floor(r / 2) + 1;
      break;
    }
    case 'diamond-cells': {
      const r = count(a[0]);
      result = 1 + 2 * r * (r + 1);
      break;
    }
    case 'diamond-ring': {
      const r = count(a[0]);
      result = r === 0 ? 1 : 4 * r;
      break;
    }
    case 'diamond-points': {
      const r = count(a[0]);
      result = sequence((2 * r + 1) ** 2, (i) => ({
        x: (i % (2 * r + 1)) - r,
        z: Math.floor(i / (2 * r + 1)) - r,
      })).filter((p) => Math.abs(p.x) + Math.abs(p.z) <= r);
      break;
    }
    case 'line-levels': {
      const s = numeric(a[0], 0);
      result = sequence(size(a[1]), (i) => Math.max(0, s - i));
      break;
    }
    case 'between-sources': {
      const s = numeric(a[0], 0),
        n = count(a[1]);
      result = sequence(n + 1, (i) => Math.max(0, s - Math.min(i, n - i)));
      break;
    }
    case 'line-lit-count': {
      const s = numeric(a[0], 0),
        x = numeric(a[1]),
        n = size(a[2]),
        m = numeric(a[3], 0),
        r = s - m;
      result =
        m === 0 ? n : r < 0 ? 0 : Math.max(0, Math.min(n - 1, Math.floor(x + r)) - Math.max(0, Math.ceil(x - r)) + 1);
      break;
    }
    case 'line-deficits': {
      const s = numeric(a[0], 0),
        x = numeric(a[1]),
        m = numeric(a[3], 0);
      result = sequence(size(a[2]), (i) => ({
        index: i,
        deficit: Math.max(0, m - Math.max(0, s - Math.abs(i - x))),
      })).filter((p) => p.deficit > 0);
      break;
    }
    case 'grid-source-count': {
      const w = size(a[0]),
        d = size(a[1]),
        s = size(a[2]);
      result = (w === 1 ? 1 : Math.ceil((w - 1) / s) + 1) * (d === 1 ? 1 : Math.ceil((d - 1) / s) + 1);
      break;
    }
    case 'grid-sources': {
      const w = size(a[0]),
        d = size(a[1]),
        s = size(a[2]),
        nx = Math.ceil((w - 1) / s) + 1,
        nz = Math.ceil((d - 1) / s) + 1;
      result = sequence(nx * nz, (i) => ({
        x: Math.min((i % nx) * s, w - 1),
        z: Math.min(Math.floor(i / nx) * s, d - 1),
      }));
      break;
    }
    case 'single-level': {
      result = Math.max(
        0,
        numeric(a[0], 0) - Math.abs(numeric(a[1]) - numeric(a[3])) - Math.abs(numeric(a[2]) - numeric(a[4])),
      );
      break;
    }
    case 'height-level': {
      result = Math.max(0, numeric(a[0], 0) - numeric(a[1], 0) - Math.abs(numeric(a[2])));
      break;
    }
    case 'corner-worst': {
      result = Math.max(0, numeric(a[0], 0) - Math.floor((size(a[1]) - 1) / 2) - Math.floor((size(a[2]) - 1) / 2));
      break;
    }
    case 'center-worst': {
      result = Math.max(0, numeric(a[0], 0) - Math.ceil((size(a[1]) - 1) / 2) - Math.ceil((size(a[2]) - 1) / 2));
      break;
    }
    case 'hanging-limit': {
      result = Math.max(-1, Math.floor(numeric(a[0], 0) - positive(a[1]) - numeric(a[2], 0)));
      break;
    }
    case 'wall-row-count': {
      const l = size(a[0]),
        s = size(a[1]);
      result = (l === 1 ? 1 : Math.ceil((l - 1) / s) + 1) * count(a[2]);
      break;
    }
    case 'fuel-budget': {
      result = count(a[0]) * Math.ceil(numeric(a[1], 0) / positive(a[2]));
      break;
    }
    case 'replacement-cycle': {
      result = count(a[0]) * Math.floor(numeric(a[2], 0) / positive(a[1]));
      break;
    }
    case 'coverage-lower-bound': {
      const r = count(a[1]);
      result = Math.ceil(count(a[0]) / (1 + 2 * r * (r + 1)));
      break;
    }
    case 'level-margin': {
      result = Math.max(0, numeric(a[0], 0) - numeric(a[1], 0)) - numeric(a[2], 0);
      break;
    }
    case 'rectangle-audit': {
      const s = numeric(a[0], 0),
        x = numeric(a[1]),
        z = numeric(a[2]),
        w = size(a[3]),
        d = size(a[4]),
        m = numeric(a[5], 0),
        levels = sequence(w * d, (i) => Math.max(0, s - Math.abs((i % w) - x) - Math.abs(Math.floor(i / w) - z)));
      result = {
        minimum: Math.min(...levels),
        maximum: Math.max(...levels),
        mean: levels.reduce((v, n) => v + n, 0) / levels.length,
        belowMinimum: levels.filter((n) => n < m).length,
      };
      break;
    }
  }
  return checked({ result, note: NOTE });
}
export function registerLightplanTools(program, { print }) {
  const group = program.command('lightplan').description(NOTE);
  for (const [signature, description] of LIGHTPLAN_COMMANDS)
    group
      .command(signature)
      .description(description)
      .action((...values) => print(lightplanCalculation(signature.split(' ')[0], values.slice(0, -2))));
  return group;
}
