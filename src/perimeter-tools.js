import { numeric, positive, count, size, radians, wrap, sequence, checked } from './spatial-inputs.js';

const NOTE =
  'Offline continuous boundary and material estimates with supplied rates and dimensions. Cell quantities and counts are integers where stated; lengths measure intervals. Gates and openings must be nonoverlapping. No fences are placed or containment, visibility, safety, collision, and construction feasibility checked.';
export const PERIMETER_COMMANDS = [
  [
    'gate-remainder <boundary> <gate-width> <gates>',
    'Subtract supplied nonoverlapping gate widths from a boundary length.',
  ],
  ['fence-layers <boundary> <layers>', 'Count fence units for supplied boundary cells and vertical layers.'],
  ['post-count-open <length> <maximum-span>', 'Count endpoint posts on an open boundary measured in intervals.'],
  ['post-count-closed <length> <maximum-span>', 'Count distinct posts on a positive closed boundary.'],
  [
    'slope-post-tops <length> <maximum-span> <start-height> <end-height> <post-height>',
    'Plan evenly spaced post chain distances and tops along a linear ground slope.',
  ],
  ['post-loop <length> <maximum-span>', 'Distribute closed-boundary post distances without repeating the origin.'],
  ['wire-rolls <boundary> <strands> <roll-length>', 'Round up supplied wire rolls for multiple strands.'],
  [
    'mesh-rolls <boundary> <height> <roll-length> <roll-height>',
    'Round up mesh rolls for length and stacked height coverage.',
  ],
  [
    'paint-area <boundary> <height> <faces>',
    'Compute fence painting area from length, height, and supplied face count.',
  ],
  ['post-material <posts> <height> <cross-section>', 'Compute post material volume with supplied cross-section area.'],
  ['footing-volume <posts> <radius> <depth>', 'Estimate cylindrical footing material volume.'],
  ['brace-count <corners> <gates> <braces-per-end>', 'Count braces at corners and both ends of each supplied gate.'],
  ['panel-count <clear-length> <maximum-panel>', 'Round up equal-width panels on a clear fence run.'],
  ['panel-width <clear-length> <panels>', 'Compute equal panel width from a supplied positive panel count.'],
  [
    'overlap-panels <length> <panel-width> <overlap>',
    'Count panels with supplied overlap; first panel has full width.',
  ],
  ['picket-count <length> <picket-width> <gap>', 'Count full pickets fitting a run with gaps only between pickets.'],
  [
    'picket-gap <length> <pickets> <picket-width>',
    'Compute equal gaps between supplied pickets, rejecting excess material.',
  ],
  ['corner-diagonal <x-offset> <z-offset>', 'Compute a diagonal brace length between supplied offsets.'],
  ['offset-rectangle <width> <depth> <offset>', 'Compute perimeter of an outward-offset continuous rectangle.'],
  [
    'patrol-time <boundary> <speed> <pauses> <pause-seconds>',
    'Estimate one continuous boundary patrol plus supplied pauses.',
  ],
  [
    'patrol-coverage <boundary> <guards> <detection-range>',
    'Compare ideal uniform guard separation with twice a supplied detection range.',
  ],
  ['gate-throughput <gates> <crossing-seconds>', 'Estimate ideal crossings per minute through independent gates.'],
  ['maintenance-sections <boundary> <section-length>', 'Count bounded work sections around a boundary.'],
  [
    'repair-stock <fence-units> <damage-percent> <reserve-percent>',
    'Round up repair stock for supplied damage and contingency percentages.',
  ],
  [
    'cost-estimate <fence-units> <posts> <fence-cost> <post-cost>',
    'Compute cost from supplied fence and post quantities and unit prices.',
  ],
];

export function perimeterCalculation(command, args = []) {
  const spec = PERIMETER_COMMANDS.find(([s]) => s.split(' ')[0] === command);
  if (!spec) throw new Error(`Unknown perimeter command: ${command}.`);
  if (!Array.isArray(args) || args.length !== spec[0].split(' ').length - 1)
    throw new Error('Supply exactly the documented arguments.');
  const a = args;
  let result;
  switch (command) {
    case 'gate-remainder': {
      const n = numeric(a[0], 0),
        w = numeric(a[1], 0),
        g = count(a[2]);
      if (g * w > n) throw new Error('Gates exceed boundary.');
      result = n - g * w;
      break;
    }
    case 'fence-layers': {
      result = count(a[0]) * count(a[1]);
      break;
    }
    case 'post-count-open': {
      result = Math.ceil(numeric(a[0], 0) / positive(a[1])) + 1;
      break;
    }
    case 'post-count-closed': {
      result = Math.max(1, Math.ceil(positive(a[0]) / positive(a[1])));
      break;
    }
    case 'slope-post-tops': {
      const l = positive(a[0]),
        n = Math.ceil(l / positive(a[1])),
        lo = numeric(a[2]),
        hi = numeric(a[3]),
        h = positive(a[4]);
      result = sequence(n + 1, (i) => ({ distance: n ? (l * i) / n : 0, top: lo + (n ? ((hi - lo) * i) / n : 0) + h }));
      break;
    }
    case 'post-loop': {
      const l = positive(a[0]),
        n = Math.max(1, Math.ceil(l / positive(a[1])));
      result = sequence(n, (i) => (l * i) / n);
      break;
    }
    case 'wire-rolls': {
      result = Math.ceil((numeric(a[0], 0) * count(a[1])) / positive(a[2]));
      break;
    }
    case 'mesh-rolls': {
      result = Math.ceil(numeric(a[0], 0) / positive(a[2])) * Math.ceil(numeric(a[1], 0) / positive(a[3]));
      break;
    }
    case 'paint-area': {
      result = numeric(a[0], 0) * numeric(a[1], 0) * count(a[2]);
      break;
    }
    case 'post-material': {
      result = count(a[0]) * numeric(a[1], 0) * numeric(a[2], 0);
      break;
    }
    case 'footing-volume': {
      result = count(a[0]) * Math.PI * numeric(a[1], 0) ** 2 * numeric(a[2], 0);
      break;
    }
    case 'brace-count': {
      result = (count(a[0]) + 2 * count(a[1])) * count(a[2]);
      break;
    }
    case 'panel-count': {
      result = Math.ceil(numeric(a[0], 0) / positive(a[1]));
      break;
    }
    case 'panel-width': {
      result = numeric(a[0], 0) / size(a[1]);
      break;
    }
    case 'overlap-panels': {
      const l = numeric(a[0], 0),
        w = positive(a[1]),
        o = numeric(a[2], 0);
      if (o >= w) throw new Error('Overlap must be smaller than panel width.');
      result = l === 0 ? 0 : l <= w ? 1 : 1 + Math.ceil((l - w) / (w - o));
      break;
    }
    case 'picket-count': {
      const g = numeric(a[2], 0);
      result = Math.floor((numeric(a[0], 0) + g) / (positive(a[1]) + g));
      break;
    }
    case 'picket-gap': {
      const l = numeric(a[0], 0),
        n = numeric(a[1], 2, 1e6, true),
        w = positive(a[2]);
      if (n * w > l) throw new Error('Pickets exceed run.');
      result = (l - n * w) / (n - 1);
      break;
    }
    case 'corner-diagonal': {
      result = Math.hypot(numeric(a[0], 0), numeric(a[1], 0));
      break;
    }
    case 'offset-rectangle': {
      const w = positive(a[0]),
        d = positive(a[1]),
        o = numeric(a[2], 0);
      result = 2 * (w + d + 4 * o);
      break;
    }
    case 'patrol-time': {
      result = numeric(a[0], 0) / positive(a[1]) + count(a[2]) * numeric(a[3], 0);
      break;
    }
    case 'patrol-coverage': {
      const l = positive(a[0]),
        n = size(a[1]),
        r = numeric(a[2], 0);
      result = { separation: l / n, covered: l / n <= 2 * r };
      break;
    }
    case 'gate-throughput': {
      result = (count(a[0]) * 60) / positive(a[1]);
      break;
    }
    case 'maintenance-sections': {
      result = Math.ceil(numeric(a[0], 0) / positive(a[1]));
      break;
    }
    case 'repair-stock': {
      result = Math.ceil(((count(a[0]) * numeric(a[1], 0, 100)) / 100) * (1 + numeric(a[2], 0, 1000) / 100));
      break;
    }
    case 'cost-estimate': {
      result = count(a[0]) * numeric(a[2], 0) + count(a[1]) * numeric(a[3], 0);
      break;
    }
  }
  return checked({ result, note: NOTE });
}
export function registerPerimeterTools(program, { print }) {
  const group = program.command('perimeter').description(NOTE);
  for (const [signature, description] of PERIMETER_COMMANDS)
    group
      .command(signature)
      .description(description)
      .action((...values) => print(perimeterCalculation(signature.split(' ')[0], values.slice(0, -2))));
  return group;
}
