import { numeric, positive, count, size, radians, sequence, checked } from './spatial-inputs.js';

const NOTE =
  'Offline abstract railway planning. Speeds, spacing, deceleration, recipes, rates, and capacities are supplied assumptions, not Minecraft physics or recipe guarantees. Candidate placement uses zero-based track-cell indices. Does not build track or implement signaling.';
export const RAILPLAN_COMMANDS = [
  ['powered-layout <length> <interval>', 'List powered-rail candidate indices, including endpoints.'],
  ['powered-count <length> <interval>', 'Count powered candidates with endpoint coverage.'],
  ['regular-count <length> <interval>', 'Count remaining ordinary rail positions after powered candidate placement.'],
  ['track-batches <rails> <output-per-batch>', 'Plan whole supplied rail recipe batches and surplus.'],
  [
    'material-shortage <regular> <powered> <held-regular> <held-powered>',
    'Compare planned track types with held rail counts.',
  ],
  [
    'dual-track <length> <separation>',
    'Count rails and rectangular corridor width for two parallel single-cell tracks.',
  ],
  [
    'bed-shoulders <length> <tracks> <track-gap> <shoulder>',
    'Count single-layer shoulder cells outside a multi-track bed.',
  ],
  [
    'station-platforms <length> <tracks> <platform-width> <end-padding>',
    'Estimate separate full-length platforms beside each supplied track.',
  ],
  ['slope-length <horizontal> <rise>', 'Compute ideal inclined track length.'],
  ['grade-check <horizontal> <rise> <maximum-percent>', 'Check absolute ideal grade against a supplied maximum.'],
  ['ramp-run <rise> <maximum-grade-percent>', 'Compute minimum horizontal run at a supplied positive grade.'],
  ['ramp-blocks <rise> <run-per-rise>', 'Estimate stair-step rail blocks using one rising rail per rise.'],
  ['travel-time <distance> <speed> <dwell>', 'Estimate travel plus station dwell in seconds.'],
  ['roundtrip <distance> <speed> <dwell-each-end>', 'Estimate out-and-back time at a supplied constant speed.'],
  ['headway <roundtrip> <carts>', 'Estimate evenly spaced departures from a fleet cycle.'],
  ['fleet-size <roundtrip> <desired-headway>', 'Round up fleet size needed for a departure interval.'],
  ['throughput <items-per-cart> <headway>', 'Estimate items per minute at a supplied departure interval.'],
  ['cargo-trips <items> <slots> <stack-size>', 'Round up carts for uniform items and supplied cargo capacity.'],
  ['station-capacity <bays> <service-seconds>', 'Estimate maximum serviced carts per minute.'],
  [
    'queue-clearance <queued-carts> <headway>',
    'Estimate time to dispatch a waiting queue, first cart departing immediately.',
  ],
  ['signal-blocks <length> <maximum-block-length>', 'Count abstract occupancy blocks; does not design redstone.'],
  [
    'signal-boundaries <length> <maximum-block-length>',
    'List bounded evenly divided abstract signal block boundaries.',
  ],
  ['braking-distance <speed> <deceleration>', 'Estimate ideal braking distance at supplied constant deceleration.'],
  [
    'stopping-reserve <speed> <deceleration> <reaction-seconds>',
    'Estimate reaction travel plus ideal braking distance.',
  ],
  ['curve-arc <radius> <degrees>', 'Compute ideal continuous curve length, not placeable rail geometry.'],
];

export function railplanCalculation(command, args = []) {
  const spec = RAILPLAN_COMMANDS.find(([s]) => s.split(' ')[0] === command);
  if (!spec) throw new Error(`Unknown railplan command: ${command}.`);
  if (!Array.isArray(args) || args.length !== spec[0].split(' ').length - 1)
    throw new Error('Supply exactly the documented arguments.');
  const a = args;
  let result;
  switch (command) {
    case 'powered-layout': {
      const n = size(a[0]),
        gap = size(a[1]);
      result = sequence(Math.ceil((n - 1) / gap) + 1, (i) => Math.min(i * gap, n - 1)).filter(
        (v, i, all) => i === 0 || v !== all[i - 1],
      );
      break;
    }
    case 'powered-count': {
      const n = size(a[0]),
        gap = size(a[1]);
      result = n === 1 ? 1 : Math.ceil((n - 1) / gap) + 1;
      break;
    }
    case 'regular-count': {
      const n = size(a[0]),
        gap = size(a[1]);
      result = n - (n === 1 ? 1 : Math.ceil((n - 1) / gap) + 1);
      break;
    }
    case 'track-batches': {
      const n = count(a[0]),
        y = size(a[1]),
        b = Math.ceil(n / y);
      result = { batches: b, produced: b * y, surplus: b * y - n };
      break;
    }
    case 'material-shortage': {
      result = {
        regularDeficit: Math.max(0, count(a[0]) - count(a[2])),
        poweredDeficit: Math.max(0, count(a[1]) - count(a[3])),
      };
      break;
    }
    case 'dual-track': {
      result = { rails: 2 * size(a[0]), width: size(a[1]) + 1 };
      break;
    }
    case 'bed-shoulders': {
      const l = size(a[0]),
        t = size(a[1]),
        g = count(a[2]),
        s = count(a[3]);
      result = { bedWidth: t + (t - 1) * g + 2 * s, shoulderCells: 2 * s * l };
      break;
    }
    case 'station-platforms': {
      const l = size(a[0]),
        t = size(a[1]),
        w = size(a[2]),
        p = count(a[3]);
      result = { platformLength: l + 2 * p, platformCells: (l + 2 * p) * t * w };
      break;
    }
    case 'slope-length': {
      result = Math.hypot(numeric(a[0], 0), numeric(a[1]));
      break;
    }
    case 'grade-check': {
      const g = (100 * Math.abs(numeric(a[1]))) / positive(a[0]);
      result = { gradePercent: g, withinLimit: g <= numeric(a[2], 0) };
      break;
    }
    case 'ramp-run': {
      result = (Math.abs(numeric(a[0])) * 100) / positive(a[1]);
      break;
    }
    case 'ramp-blocks': {
      const r = count(a[0]),
        run = size(a[1]);
      result = { rising: r, level: r * (run - 1), total: r * run };
      break;
    }
    case 'travel-time': {
      result = numeric(a[0], 0) / positive(a[1]) + numeric(a[2], 0);
      break;
    }
    case 'roundtrip': {
      result = (2 * numeric(a[0], 0)) / positive(a[1]) + 2 * numeric(a[2], 0);
      break;
    }
    case 'headway': {
      result = positive(a[0]) / size(a[1]);
      break;
    }
    case 'fleet-size': {
      result = Math.ceil(numeric(a[0], 0) / positive(a[1]));
      break;
    }
    case 'throughput': {
      result = (count(a[0]) * 60) / positive(a[1]);
      break;
    }
    case 'cargo-trips': {
      result = Math.ceil(count(a[0]) / (size(a[1]) * size(a[2])));
      break;
    }
    case 'station-capacity': {
      result = (size(a[0]) * 60) / positive(a[1]);
      break;
    }
    case 'queue-clearance': {
      result = Math.max(0, count(a[0]) - 1) * positive(a[1]);
      break;
    }
    case 'signal-blocks': {
      result = Math.ceil(numeric(a[0], 0) / positive(a[1]));
      break;
    }
    case 'signal-boundaries': {
      const l = numeric(a[0], 0),
        n = Math.ceil(l / positive(a[1]));
      result = sequence(n + 1, (i) => (n ? (l * i) / n : 0));
      break;
    }
    case 'braking-distance': {
      result = numeric(a[0], 0) ** 2 / (2 * positive(a[1]));
      break;
    }
    case 'stopping-reserve': {
      const s = numeric(a[0], 0);
      result = s * numeric(a[2], 0) + (s * s) / (2 * positive(a[1]));
      break;
    }
    case 'curve-arc': {
      result = numeric(a[0], 0) * Math.abs(radians(numeric(a[1], -360, 360)));
      break;
    }
  }
  return checked({ result, note: NOTE });
}
export function registerRailplanTools(program, { print }) {
  const group = program.command('railplan').description(NOTE);
  for (const [signature, description] of RAILPLAN_COMMANDS)
    group
      .command(signature)
      .description(description)
      .action((...values) => print(railplanCalculation(signature.split(' ')[0], values.slice(0, -2))));
  return group;
}
