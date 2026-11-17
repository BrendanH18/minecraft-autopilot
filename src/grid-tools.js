import { numeric, positive, count, sequence, checked } from './spatial-inputs.js';

const NOTE =
  'Offline coordinate arithmetic. Negative coordinates use floor division. Blocks and chunk indices are integers; next-boundary and custom lattice calculations use continuous coordinates. Does not read world files or load chunks.';
export const GRID_COMMANDS = [
  ['block-address <x> <z>', 'Report chunk and local block coordinates using floor division.'],
  ['chunk-address <x> <z>', 'Report region and local chunk coordinates.'],
  ['region-header-entry <chunk-x> <chunk-z>', 'Identify an Anvil region file and both header offsets for a chunk.'],
  ['chunk-window <x> <z> <radius>', 'Report the inclusive block-coordinate bounds of a square chunk window.'],
  ['region-seam <x> <z> <dx> <dz>', 'Test whether an adjacent cardinal chunk step crosses a region-file seam.'],
  ['chunk-reconstruct <chunk> <local>', 'Reconstruct a block axis from chunk index and local offset.'],
  ['region-reconstruct <region> <local-chunk>', 'Reconstruct a chunk axis from region and local chunk index.'],
  ['section-address <y>', 'Report section index and local vertical block coordinate.'],
  ['section-reconstruct <section> <local>', 'Recover Y from a supported vertical section and local offset.'],
  ['region-slot <local-x> <local-z>', 'Compute the zero-based Anvil header slot.'],
  ['slot-address <slot>', 'Decode a zero-based Anvil header slot.'],
  ['section-index <x> <y> <z>', 'Encode local block coordinates with X fastest, then Z, then Y.'],
  ['index-address <index>', 'Decode an X/Z/Y ordered local block index.'],
  ['axis-chunks <minimum> <maximum>', 'Count chunks touched by an inclusive block-axis interval.'],
  ['axis-regions <minimum> <maximum>', 'Count regions touched by an inclusive block-axis interval.'],
  ['chunk-intersection <chunk> <minimum> <maximum>', 'Count cells of an inclusive axis interval inside one chunk.'],
  ['border-distance <coordinate>', 'Find distance from a block center to the nearest chunk boundary plane.'],
  ['next-boundary <coordinate> <direction>', 'Find the next chunk boundary plane strictly in a direction.'],
  ['snap-grid <coordinate> <spacing> <origin>', 'Snap a scalar coordinate to its nearest supplied lattice point.'],
  ['cell-center <coordinate> <spacing> <origin>', 'Find the center of the containing half-open grid cell.'],
  ['chunk-neighbors <x> <z>', 'List four orthogonally adjacent chunk indices.'],
  ['chunk-ring <radius>', 'Count chunks at an exact Chebyshev radius.'],
  ['loaded-square <radius>', 'Count chunks in a square with an inclusive chunk radius.'],
  ['axis-partitions <minimum> <maximum>', 'Partition an inclusive block-axis interval at every chunk boundary.'],
  ['region-header-offset <local-x> <local-z>', 'Report Anvil location and timestamp header byte offsets.'],
];

export function gridCalculation(command, args = []) {
  const spec = GRID_COMMANDS.find(([s]) => s.split(' ')[0] === command);
  if (!spec) throw new Error(`Unknown grid command: ${command}.`);
  if (!Array.isArray(args) || args.length !== spec[0].split(' ').length - 1)
    throw new Error('Supply exactly the documented arguments.');
  const a = args;
  let result;
  switch (command) {
    case 'block-address': {
      const x = numeric(a[0], -1e6, 1e6, true),
        z = numeric(a[1], -1e6, 1e6, true);
      result = {
        chunkX: Math.floor(x / 16),
        chunkZ: Math.floor(z / 16),
        localX: ((x % 16) + 16) % 16,
        localZ: ((z % 16) + 16) % 16,
      };
      break;
    }
    case 'chunk-address': {
      const x = numeric(a[0], -1e6, 1e6, true),
        z = numeric(a[1], -1e6, 1e6, true);
      result = {
        regionX: Math.floor(x / 32),
        regionZ: Math.floor(z / 32),
        localX: ((x % 32) + 32) % 32,
        localZ: ((z % 32) + 32) % 32,
      };
      break;
    }
    case 'region-header-entry': {
      const x = numeric(a[0], -62500, 62500, true),
        z = numeric(a[1], -62500, 62500, true),
        i = (((x % 32) + 32) % 32) + 32 * (((z % 32) + 32) % 32);
      result = {
        file: `r.${Math.floor(x / 32)}.${Math.floor(z / 32)}.mca`,
        locationOffset: 4 * i,
        timestampOffset: 4096 + 4 * i,
      };
      break;
    }
    case 'chunk-window': {
      const x = numeric(a[0], -62500, 62500, true),
        z = numeric(a[1], -62500, 62500, true),
        r = numeric(a[2], 0, 1000, true);
      result = { minX: (x - r) * 16, minZ: (z - r) * 16, maxX: (x + r) * 16 + 15, maxZ: (z + r) * 16 + 15 };
      break;
    }
    case 'region-seam': {
      const x = numeric(a[0], -62500, 62500, true),
        z = numeric(a[1], -62500, 62500, true),
        dx = numeric(a[2], -1, 1, true),
        dz = numeric(a[3], -1, 1, true);
      if (Math.abs(dx) + Math.abs(dz) !== 1) throw new Error('Use one cardinal unit step.');
      result = Math.floor(x / 32) !== Math.floor((x + dx) / 32) || Math.floor(z / 32) !== Math.floor((z + dz) / 32);
      break;
    }
    case 'chunk-reconstruct': {
      result = numeric(a[0], -62500, 62500, true) * 16 + numeric(a[1], 0, 15, true);
      break;
    }
    case 'region-reconstruct': {
      result = numeric(a[0], -31250, 31250, true) * 32 + numeric(a[1], 0, 31, true);
      break;
    }
    case 'section-address': {
      const y = numeric(a[0], -64, 319, true);
      result = { section: Math.floor(y / 16), local: ((y % 16) + 16) % 16 };
      break;
    }
    case 'section-reconstruct': {
      result = numeric(a[0], -4, 19, true) * 16 + numeric(a[1], 0, 15, true);
      break;
    }
    case 'region-slot': {
      result = numeric(a[0], 0, 31, true) + 32 * numeric(a[1], 0, 31, true);
      break;
    }
    case 'slot-address': {
      const s = numeric(a[0], 0, 1023, true);
      result = { x: s % 32, z: Math.floor(s / 32) };
      break;
    }
    case 'section-index': {
      result = numeric(a[0], 0, 15, true) + 16 * numeric(a[2], 0, 15, true) + 256 * numeric(a[1], 0, 15, true);
      break;
    }
    case 'index-address': {
      const i = numeric(a[0], 0, 4095, true);
      result = { x: i % 16, y: Math.floor(i / 256), z: Math.floor(i / 16) % 16 };
      break;
    }
    case 'axis-chunks': {
      const lo = numeric(a[0], -1e6, 1e6, true),
        hi = numeric(a[1], lo, 1e6, true);
      result = Math.floor(hi / 16) - Math.floor(lo / 16) + 1;
      break;
    }
    case 'axis-regions': {
      const lo = numeric(a[0], -1e6, 1e6, true),
        hi = numeric(a[1], lo, 1e6, true);
      result = Math.floor(hi / 512) - Math.floor(lo / 512) + 1;
      break;
    }
    case 'chunk-intersection': {
      const c = numeric(a[0], -62500, 62500, true) * 16,
        lo = numeric(a[1], -1e6, 1e6, true),
        hi = numeric(a[2], lo, 1e6, true);
      result = Math.max(0, Math.min(hi, c + 15) - Math.max(lo, c) + 1);
      break;
    }
    case 'border-distance': {
      const c = numeric(a[0], -1e6, 1e6, true),
        l = ((c % 16) + 16) % 16;
      result = Math.min(l + 0.5, 15.5 - l);
      break;
    }
    case 'next-boundary': {
      const c = numeric(a[0]),
        d = numeric(a[1], -1, 1, true);
      if (!d) throw new Error('Direction must be -1 or 1.');
      result = d === 1 ? (Math.floor(c / 16) + 1) * 16 : (Math.ceil(c / 16) - 1) * 16;
      break;
    }
    case 'snap-grid': {
      const s = positive(a[1]),
        o = numeric(a[2]);
      result = o + Math.round((numeric(a[0]) - o) / s) * s;
      break;
    }
    case 'cell-center': {
      const s = positive(a[1]),
        o = numeric(a[2]);
      result = o + (Math.floor((numeric(a[0]) - o) / s) + 0.5) * s;
      break;
    }
    case 'chunk-neighbors': {
      const x = numeric(a[0], -62500, 62500, true),
        z = numeric(a[1], -62500, 62500, true);
      result = [
        { x: x - 1, z },
        { x: x + 1, z },
        { x, z: z - 1 },
        { x, z: z + 1 },
      ];
      break;
    }
    case 'chunk-ring': {
      const r = count(a[0]);
      result = r === 0 ? 1 : 8 * r;
      break;
    }
    case 'loaded-square': {
      result = (2 * count(a[0]) + 1) ** 2;
      break;
    }
    case 'axis-partitions': {
      const lo = numeric(a[0], -1e6, 1e6, true),
        hi = numeric(a[1], lo, 1e6, true),
        first = Math.floor(lo / 16);
      result = sequence(Math.floor(hi / 16) - first + 1, (i) => ({
        chunk: first + i,
        minimum: Math.max(lo, 16 * (first + i)),
        maximum: Math.min(hi, 16 * (first + i) + 15),
      }));
      break;
    }
    case 'region-header-offset': {
      const i = numeric(a[0], 0, 31, true) + 32 * numeric(a[1], 0, 31, true);
      result = { location: 4 * i, timestamp: 4096 + 4 * i };
      break;
    }
  }
  return checked({ result, note: NOTE });
}
export function registerGridTools(program, { print }) {
  const group = program.command('grid').description(NOTE);
  for (const [signature, description] of GRID_COMMANDS)
    group
      .command(signature)
      .description(description)
      .action((...values) => print(gridCalculation(signature.split(' ')[0], values.slice(0, -2))));
  return group;
}
