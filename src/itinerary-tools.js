import { navNumber, navPoint } from './navigation.js';

const NOTE =
  'Offline straight-line route estimates. No movement, pathfinding, terrain, dimension transfer, or hazard checks. Reordering stops can change task meaning; review plans before use.';
const axes = ['x', 'y', 'z'];
const distance = (a, b) => Math.hypot(...axes.map((k) => b[k] - a[k]));
const length = (ps) => ps.slice(1).reduce((n, p, i) => n + distance(ps[i], p), 0);
function number(v, min = 0, max = 1e9, integer = false) {
  const n = navNumber(v);
  if (n < min || n > max || (integer && !Number.isSafeInteger(n)))
    throw new Error(`Use ${integer ? 'an integer' : 'a number'} from ${min} to ${max}.`);
  return n;
}
const positive = (v) => number(v, 0.000001);
function route(values) {
  if (values.length < 2 || values.length > 50) throw new Error('Give 2 to 50 route points as x,y,z.');
  return values.map(navPoint);
}
function legs(ps) {
  let cumulative = 0;
  return ps.slice(1).map((p, i) => {
    const d = distance(ps[i], p);
    cumulative += d;
    return { leg: i + 1, from: ps[i], to: p, distance: d, cumulative };
  });
}
function turn(a, b, c) {
  const u = { x: b.x - a.x, z: b.z - a.z },
    v = { x: c.x - b.x, z: c.z - b.z };
  const divisor = Math.hypot(u.x, u.z) * Math.hypot(v.x, v.z);
  return divisor ? (Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.z * v.z) / divisor))) * 180) / Math.PI : null;
}

export const ITINERARY_COMMANDS = [
  ['pace <speeds> <points...>', 'Arrival times using one comma-separated speed per leg.'],
  ['dwell <speed> <seconds> <points...>', 'Arrival and departure schedule with dwell at each destination.'],
  ['stages <maximum> <points...>', 'Pack whole legs into distance-limited stages; flag oversized legs.'],
  ['resample <spacing> <points...>', 'Sample an entire polyline at uniform traveled-distance intervals.'],
  ['stopovers <distance> <points...>', 'Select existing stops when distance since the last stop reaches a threshold.'],
  ['nearest-order <points...>', 'Greedy visit ordering from a fixed first stop.'],
  ['cheapest-insert <point> <points...>', 'Find the cheapest interior leg for adding a stop.'],
  ['remove-cost <points...>', 'Measure distance saved by omitting each intermediate stop.'],
  ['shortcut <first> <last> <points...>', 'Compare a contiguous subroute with a direct shortcut.'],
  ['two-opt <points...>', 'Choose the best single reversal of intermediate stops, preserving endpoints.'],
  ['checkpoints <every> <points...>', 'Select checkpoint stops every given number of legs, including endpoints.'],
  ['retrace <stop> <points...>', 'Plan the reverse prefix from a selected stop back to the start.'],
  ['rotate-start <stop> <points...>', 'Choose a new first stop on a closed visit cycle.'],
  ['window <first> <last> <points...>', 'Extract a numbered stop window with original cumulative start distance.'],
  [
    'elevation-cost <speed> <up-seconds> <down-seconds> <points...>',
    'Add supplied per-block ascent and descent delays to travel.',
  ],
  [
    'effort <horizontal-weight> <up-weight> <down-weight> <points...>',
    'Score legs with supplied horizontal, ascent, and descent costs.',
  ],
  [
    'deadline-stops <speed> <dwell> <budget> <points...>',
    'Find destination departures exceeding a travel and dwell budget.',
  ],
  ['return-reserve <speed> <budget> <points...>', 'Budget each prefix plus direct return to its origin.'],
  ['leg-limit <maximum> <points...>', 'Locate legs exceeding a distance limit.'],
  ['climb-limit <maximum> <points...>', 'Locate legs exceeding a positive rise limit.'],
  [
    'turn-limit <degrees> <points...>',
    'Locate horizontal turns exceeding a threshold; vertical or zero legs are unknown.',
  ],
  ['bottleneck <speed> <dwell> <points...>', 'Compare travel versus dwell and identify the slowest leg.'],
  ['distance-matrix <points...>', 'Compute all pairwise stop distances.'],
  ['hub <points...>', 'Choose the listed stop minimizing the farthest direct journey.'],
  ['rendezvous <speed> <points...>', 'Choose the listed meeting stop minimizing summed direct travel time.'],
];

export function itineraryCalculation(command, args = []) {
  let ps, result;
  const read = (offset) => (ps = route(args.slice(offset)));
  switch (command) {
    case 'pace': {
      read(1);
      const speeds = String(args[0]).split(',').map(positive);
      if (speeds.length !== ps.length - 1) throw new Error('Supply exactly one speed per route leg.');
      let seconds = 0;
      result = {
        stops: legs(ps).map((l, i) => {
          const travelSeconds = l.distance / speeds[i];
          seconds += travelSeconds;
          return { ...l, speed: speeds[i], travelSeconds, arrivalSeconds: seconds };
        }),
        seconds,
      };
      break;
    }
    case 'dwell':
    case 'deadline-stops': {
      const speed = positive(args[0]),
        dwell = number(args[1]);
      read(command === 'dwell' ? 2 : 3);
      const budget = command === 'deadline-stops' ? number(args[2]) : null;
      const stops = legs(ps).map((l, i) => ({
        ...l,
        arrivalSeconds: l.cumulative / speed + i * dwell,
        departureSeconds: l.cumulative / speed + (i + 1) * dwell,
      }));
      result = {
        stops,
        seconds: stops.at(-1).departureSeconds,
        ...(budget === null
          ? {}
          : { budget, firstOverBudget: stops.find((l) => l.departureSeconds > budget)?.leg ?? null }),
      };
      break;
    }
    case 'stages': {
      const maximum = positive(args[0]);
      read(1);
      const stages = [];
      let current = null;
      for (const l of legs(ps)) {
        if (!current || current.distance + l.distance > maximum) {
          current = { firstLeg: l.leg, lastLeg: l.leg, distance: 0, overLimit: false };
          stages.push(current);
        }
        current.lastLeg = l.leg;
        current.distance += l.distance;
        current.overLimit = current.distance > maximum;
      }
      result = { stages };
      break;
    }
    case 'resample': {
      const spacing = positive(args[0]);
      read(1);
      const ls = legs(ps),
        total = length(ps),
        count = Math.ceil(total / spacing);
      if (count > 999) throw new Error('Sampling is limited to 1000 points; increase spacing.');
      const samples = [{ distance: 0, point: ps[0] }];
      let index = 0;
      for (let i = 1; i <= count; i++) {
        const d = Math.min(i * spacing, total);
        while (index < ls.length - 1 && ls[index].cumulative < d) index++;
        const l = ls[index],
          t = l.distance ? (d - (l.cumulative - l.distance)) / l.distance : 0;
        samples.push({
          distance: d,
          point: Object.fromEntries(axes.map((k) => [k, l.from[k] + t * (l.to[k] - l.from[k])])),
        });
      }
      result = { samples, distance: total };
      break;
    }
    case 'stopovers': {
      const threshold = positive(args[0]);
      read(1);
      let lastDistance = 0;
      const stops = [{ stop: 1, point: ps[0], cumulative: 0 }];
      for (const l of legs(ps))
        if (l.cumulative - lastDistance >= threshold || l.leg === ps.length - 1) {
          stops.push({ stop: l.leg + 1, point: l.to, cumulative: l.cumulative });
          lastDistance = l.cumulative;
        }
      result = { stops };
      break;
    }
    case 'nearest-order': {
      read(0);
      const remaining = ps.slice(1).map((point, i) => ({ point, originalStop: i + 2 })),
        stops = [{ point: ps[0], originalStop: 1 }];
      while (remaining.length) {
        let index = 0;
        for (let i = 1; i < remaining.length; i++)
          if (distance(stops.at(-1).point, remaining[i].point) < distance(stops.at(-1).point, remaining[index].point))
            index = i;
        stops.push(...remaining.splice(index, 1));
      }
      result = {
        stops,
        distance: length(stops.map((s) => s.point)),
        originalDistance: length(ps),
        method: 'greedy_not_optimal',
      };
      break;
    }
    case 'cheapest-insert': {
      const point = navPoint(args[0]);
      read(1);
      const choices = legs(ps).map((l) => ({
        afterStop: l.leg,
        addedDistance: distance(l.from, point) + distance(point, l.to) - l.distance,
      }));
      const best = choices.reduce((a, b) => (b.addedDistance < a.addedDistance ? b : a));
      result = { ...best, point, totalDistance: length(ps) + best.addedDistance };
      break;
    }
    case 'remove-cost':
      read(0);
      result = {
        stops: ps
          .slice(1, -1)
          .map((p, i) => ({
            stop: i + 2,
            savedDistance: distance(ps[i], p) + distance(p, ps[i + 2]) - distance(ps[i], ps[i + 2]),
          })),
      };
      break;
    case 'shortcut':
    case 'window': {
      read(2);
      const first = number(args[0], 1, ps.length, true),
        last = number(args[1], first + 1, ps.length, true),
        points = ps.slice(first - 1, last),
        originalDistance = length(points);
      result =
        command === 'window'
          ? { points, distance: originalDistance, startDistance: length(ps.slice(0, first)) }
          : {
              first,
              last,
              originalDistance,
              directDistance: distance(points[0], points.at(-1)),
              savedDistance: originalDistance - distance(points[0], points.at(-1)),
            };
      break;
    }
    case 'two-opt': {
      read(0);
      const originalDistance = length(ps);
      let best = { points: ps, distance: originalDistance, reversed: null };
      for (let i = 1; i < ps.length - 2; i++)
        for (let j = i + 1; j < ps.length - 1; j++) {
          const candidate = [...ps.slice(0, i), ...ps.slice(i, j + 1).reverse(), ...ps.slice(j + 1)],
            d = length(candidate);
          if (d < best.distance - 1e-9) best = { points: candidate, distance: d, reversed: [i + 1, j + 1] };
        }
      result = {
        ...best,
        originalDistance,
        savedDistance: originalDistance - best.distance,
        method: 'best_single_reversal_not_optimal',
      };
      break;
    }
    case 'checkpoints': {
      const every = number(args[0], 1, 49, true);
      read(1);
      result = {
        stops: ps.map((point, i) => ({ stop: i + 1, point })).filter((s, i) => i % every === 0 || i === ps.length - 1),
      };
      break;
    }
    case 'retrace':
      read(1);
      {
        const stop = number(args[0], 2, ps.length, true),
          points = ps.slice(0, stop).reverse();
        result = { points, distance: length(points) };
      }
      break;
    case 'rotate-start': {
      read(1);
      if (distance(ps[0], ps.at(-1)) === 0) ps = ps.slice(0, -1);
      const stop = number(args[0], 1, ps.length, true),
        points = [...ps.slice(stop - 1), ...ps.slice(0, stop - 1)];
      points.push(points[0]);
      result = { points, distance: length(points) };
      break;
    }
    case 'elevation-cost':
    case 'effort': {
      const horizontal = command === 'effort' ? number(args[0]) : positive(args[0]),
        up = number(args[1]),
        down = number(args[2]);
      read(3);
      const ls = legs(ps).map((l) => {
        const rise = l.to.y - l.from.y,
          cost =
            (command === 'effort'
              ? Math.hypot(l.to.x - l.from.x, l.to.z - l.from.z) * horizontal
              : l.distance / horizontal) +
            Math.max(0, rise) * up +
            Math.max(0, -rise) * down;
        return { ...l, cost };
      });
      result = {
        legs: ls,
        totalCost: ls.reduce((n, l) => n + l.cost, 0),
        unit: command === 'effort' ? 'supplied_effort' : 'seconds',
      };
      break;
    }
    case 'return-reserve': {
      const speed = positive(args[0]),
        budget = number(args[1]);
      read(2);
      result = {
        stops: legs(ps).map((l) => {
          const returnDistance = distance(l.to, ps[0]),
            seconds = (l.cumulative + returnDistance) / speed;
          return {
            stop: l.leg + 1,
            returnDistance,
            seconds,
            remainingSeconds: budget - seconds,
            withinBudget: seconds <= budget,
          };
        }),
      };
      break;
    }
    case 'leg-limit':
    case 'climb-limit': {
      const maximum = number(args[0]);
      read(1);
      result = {
        violations: legs(ps).filter((l) => (command === 'leg-limit' ? l.distance : l.to.y - l.from.y) > maximum),
        maximum,
      };
      break;
    }
    case 'turn-limit': {
      const maximum = number(args[0], 0, 180);
      read(1);
      const turns = ps.slice(1, -1).map((p, i) => ({ stop: i + 2, degrees: turn(ps[i], p, ps[i + 2]) }));
      result = {
        violations: turns.filter((t) => t.degrees !== null && t.degrees > maximum),
        unknownStops: turns.filter((t) => t.degrees === null).map((t) => t.stop),
      };
      break;
    }
    case 'bottleneck': {
      const speed = positive(args[0]),
        dwell = number(args[1]);
      read(2);
      const ls = legs(ps),
        slowest = ls.reduce((a, b) => (b.distance > a.distance ? b : a)),
        travelSeconds = length(ps) / speed,
        dwellSeconds = ls.length * dwell;
      result = {
        slowestLeg: slowest.leg,
        slowestTravelSeconds: slowest.distance / speed,
        travelSeconds,
        dwellSeconds,
        dominant: travelSeconds === dwellSeconds ? 'equal' : travelSeconds > dwellSeconds ? 'travel' : 'dwell',
      };
      break;
    }
    case 'distance-matrix':
      read(0);
      result = { distances: ps.map((a) => ps.map((b) => distance(a, b))) };
      break;
    case 'hub':
    case 'rendezvous': {
      const speed = command === 'rendezvous' ? positive(args[0]) : 1;
      read(command === 'rendezvous' ? 1 : 0);
      const candidates = ps.map((point, i) => {
        const ds = ps.map((p) => distance(point, p));
        return {
          stop: i + 1,
          point,
          farthestDistance: Math.max(...ds),
          totalSeconds: ds.reduce((n, d) => n + d / speed, 0),
        };
      });
      const key = command === 'hub' ? 'farthestDistance' : 'totalSeconds';
      result = { chosen: candidates.reduce((a, b) => (b[key] < a[key] ? b : a)), candidates };
      break;
    }
    default:
      throw new Error(`Unknown itinerary command: ${command}.`);
  }
  return { ...result, note: NOTE };
}

export function registerItineraryTools(program, { print }) {
  const group = program
    .command('itinerary')
    .description('Offline multi-stop planning, scheduling, and route alternatives.');
  for (const [signature, description] of ITINERARY_COMMANDS)
    group
      .command(signature)
      .description(description)
      .action((...values) => print(itineraryCalculation(signature.split(' ')[0], values.slice(0, -2).flat())));
  return group;
}
