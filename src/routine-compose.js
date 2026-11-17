import { actionSchema } from './protocol.js';
import { loadRoutine, parseRoutine, MAX_ROUTINE_STEPS } from './routine.js';
import { navPoint, navNumber } from './navigation.js';
import { itemName } from './cli-views.js';
import { COLLECTIBLE_BLOCKS } from './objective.js';

const AXES = ['x', 'y', 'z'];
const TYPES = new Set(actionSchema.options.map((schema) => schema.shape.type.value));
const validate = (actions) => parseRoutine(JSON.stringify(actions));
function length(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_ROUTINE_STEPS)
    throw new Error('The composed routine must contain 1 to 100 actions.');
}
const output = (actions) => {
  length(actions.length);
  return { actions: validate(actions) };
};
function integer(value, min, max) {
  const n = navNumber(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`Expected an integer from ${min} to ${max}.`);
  return n;
}
function numeric(value, min, max) {
  const n = navNumber(value);
  if (n < min || n > max) throw new Error(`Expected a number from ${min} to ${max}.`);
  return n;
}
function type(value) {
  if (!TYPES.has(value)) throw new Error(`Unknown action type: ${value}.`);
  return value;
}
function range(actions, first, last) {
  const start = integer(first, 1, actions.length) - 1;
  const end = integer(last, start + 1, actions.length);
  return [start, end];
}
function points(values, min = 1) {
  if (values.length < min || values.length > 50) throw new Error(`Give ${min} to 50 points as x,y,z.`);
  return values.map(navPoint);
}
const go = (point) => ({ type: 'goto', ...point });
const transform = (actions, fn) => actions.map((a) => (a.type === 'goto' ? { ...a, ...fn(a) } : a));

/** Offline composition only. Input and output are normalized copies; no actions run. */
export function composeRoutine(input, command, ...args) {
  const actions = validate(input);
  switch (command) {
    case 'replace-range': {
      const [first, end] = range(actions, args[0], args[1]),
        other = validate(args[2]);
      length(actions.length - (end - first) + other.length);
      return output([...actions.slice(0, first), ...other, ...actions.slice(end)]);
    }
    case 'reverse-range': {
      const [first, end] = range(actions, ...args);
      return output([...actions.slice(0, first), ...actions.slice(first, end).reverse(), ...actions.slice(end)]);
    }
    case 'repeat-range': {
      const [first, end] = range(actions, args[0], args[1]),
        times = integer(args[2], 1, 100);
      length(actions.length + (end - first) * (times - 1));
      return output([
        ...actions.slice(0, first),
        ...Array.from({ length: times }, () => actions.slice(first, end)).flat(),
        ...actions.slice(end),
      ]);
    }
    case 'move-range': {
      const [first, end] = range(actions, args[0], args[1]),
        rest = [...actions.slice(0, first), ...actions.slice(end)];
      const target = integer(args[2], 1, rest.length + 1) - 1;
      return output([...rest.slice(0, target), ...actions.slice(first, end), ...rest.slice(target)]);
    }
    case 'swap-ranges': {
      let a = range(actions, args[0], args[1]),
        b = range(actions, args[2], args[3]);
      if (a[0] > b[0]) [a, b] = [b, a];
      if (a[1] > b[0]) throw new Error('The two ranges must not overlap.');
      return output([
        ...actions.slice(0, a[0]),
        ...actions.slice(...b),
        ...actions.slice(a[1], b[0]),
        ...actions.slice(...a),
        ...actions.slice(b[1]),
      ]);
    }
    case 'weave-chunks': {
      const other = validate(args[0]),
        size = integer(args[1], 1, 100),
        merged = [];
      length(actions.length + other.length);
      for (let i = 0; i < Math.max(actions.length, other.length); i += size)
        merged.push(...actions.slice(i, i + size), ...other.slice(i, i + size));
      return output(merged);
    }
    case 'cycle-insert': {
      const other = validate(args[0]),
        every = integer(args[1], 1, 100);
      length(actions.length + Math.floor(actions.length / every) * other.length);
      return output(actions.flatMap((a, i) => ((i + 1) % every === 0 ? [a, ...other] : [a])));
    }
    case 'before-type':
    case 'after-type':
    case 'replace-type': {
      const target = type(args[0]),
        other = validate(args[1]),
        matches = actions.filter((a) => a.type === target).length;
      length(actions.length + matches * (other.length - (command === 'replace-type' ? 1 : 0)));
      return output(
        actions.flatMap((a) =>
          a.type !== target
            ? [a]
            : command === 'before-type'
              ? [...other, a]
              : command === 'after-type'
                ? [a, ...other]
                : other,
        ),
      );
    }
    case 'mirror-route': {
      const axis = args[0];
      if (!AXES.includes(axis)) throw new Error('Axis must be x, y, or z.');
      const pivot = navNumber(args[1]);
      return output(transform(actions, (a) => ({ [axis]: 2 * pivot - a[axis] })));
    }
    case 'rotate-route': {
      const pivot = navPoint(args[0]),
        turns = ((integer(args[1], -4, 4) % 4) + 4) % 4;
      return output(
        transform(actions, (a) => {
          let x = a.x - pivot.x,
            z = a.z - pivot.z;
          for (let i = 0; i < turns; i++) [x, z] = [-z, x];
          return { x: pivot.x + x, z: pivot.z + z };
        }),
      );
    }
    case 'scale-route': {
      const pivot = navPoint(args[0]),
        factor = numeric(args[1], 0.000001, 1_000_000);
      return output(
        transform(actions, (a) =>
          Object.fromEntries(AXES.map((axis) => [axis, pivot[axis] + (a[axis] - pivot[axis]) * factor])),
        ),
      );
    }
    case 'snap-route': {
      const grid = numeric(args[0], 0.000001, 1_000_000);
      return output(
        transform(actions, (a) => Object.fromEntries(AXES.map((axis) => [axis, Math.round(a[axis] / grid) * grid]))),
      );
    }
    case 'anchor-route': {
      const target = navPoint(args[0]),
        first = actions.find((a) => a.type === 'goto');
      if (!first) throw new Error('Anchoring requires at least one goto action.');
      return output(
        transform(actions, (a) => Object.fromEntries(AXES.map((axis) => [axis, a[axis] + target[axis] - first[axis]]))),
      );
    }
    case 'offset-range': {
      const [first, end] = range(actions, args[0], args[1]),
        offsets = args.slice(2).map(navNumber);
      if (offsets.length !== 3) throw new Error('Give dx, dy, and dz.');
      return output(
        actions.map((a, i) =>
          a.type === 'goto' && i >= first && i < end
            ? { ...a, ...Object.fromEntries(AXES.map((axis, n) => [axis, a[axis] + offsets[n]])) }
            : a,
        ),
      );
    }
    case 'set-collect':
    case 'set-deposit': {
      const name = itemName(args[0]),
        target = command === 'set-collect' ? 'collect' : 'deposit',
        key = target === 'collect' ? 'block' : 'item';
      const count = integer(args[1], 1, target === 'collect' ? 64 : 2304);
      return output(actions.map((a) => (a.type === target && a[key] === name ? { ...a, count } : a)));
    }
    case 'set-wait-range': {
      const [first, end] = range(actions, args[0], args[1]),
        seconds = numeric(args[2], 1, 3600);
      return output(actions.map((a, i) => (a.type === 'wait' && i >= first && i < end ? { ...a, seconds } : a)));
    }
    case 'waypoint-waits': {
      const seconds = numeric(args[0], 1, 3600),
        route = points(args.slice(1));
      length(actions.length + 2 * route.length);
      return output([...actions, ...route.flatMap((p) => [go(p), { type: 'wait', seconds }])]);
    }
    case 'round-trip': {
      const route = points(args, 2);
      length(actions.length + 2 * route.length - 1);
      return output([...actions, ...route.map(go), ...route.slice(0, -1).reverse().map(go)]);
    }
    case 'patrol': {
      const laps = integer(args[0], 1, 100),
        route = points(args.slice(1), 2);
      length(actions.length + 1 + laps * route.length);
      return output([
        ...actions,
        go(route[0]),
        ...Array.from({ length: laps }, () => [...route.slice(1), route[0]].map(go)).flat(),
      ]);
    }
    case 'resolve-home': {
      const target = navPoint(args[0]);
      return output(actions.map((a) => (a.type === 'home' ? go(target) : a)));
    }
    case 'storage-round': {
      const route = points(args);
      length(actions.length + 2 * route.length);
      return output([...actions, ...route.flatMap((p) => [go(p), { type: 'inspect_storage' }])]);
    }
    case 'gather-store': {
      const block = itemName(args[0]),
        count = integer(args[1], 1, 2304),
        batch = integer(args[2], 1, 64),
        source = navPoint(args[3]),
        depot = navPoint(args[4]);
      if (!COLLECTIBLE_BLOCKS.includes(block.replace(/^minecraft:/, '')))
        throw new Error(`Supported collection targets: ${COLLECTIBLE_BLOCKS.join(', ')}.`);
      const trips = Math.ceil(count / batch);
      length(actions.length + trips * 5);
      const appended = [];
      for (let left = count; left > 0; left -= batch) {
        const amount = Math.min(left, batch);
        appended.push(
          go(source),
          { type: 'collect', block, count: amount },
          go(depot),
          { type: 'inspect_storage' },
          { type: 'deposit', item: block, count: amount },
        );
      }
      return output([...actions, ...appended]);
    }
    default:
      throw new Error(`Unknown compose command: ${command}.`);
  }
}

export const COMPOSE_COMMANDS = [
  ['replace-range <file> <first> <last> <other>', 'Replace an inclusive step range with another routine.'],
  ['reverse-range <file> <first> <last>', 'Reverse action order inside one inclusive range.'],
  ['repeat-range <file> <first> <last> <times>', 'Replace a selected range with times copies.'],
  ['move-range <file> <first> <last> <target>', 'Move a range into a 1-based insertion slot in the remaining routine.'],
  [
    'swap-ranges <file> <first-a> <last-a> <first-b> <last-b>',
    'Exchange two nonoverlapping ranges, allowing unequal lengths.',
  ],
  ['weave-chunks <file> <other> <size>', 'Alternate chunks from two routines, preserving each remainder.'],
  ['cycle-insert <file> <other> <every>', 'Insert another routine after each complete group of original steps.'],
  ['before-type <file> <type> <other>', 'Insert another routine before every action of a type.'],
  ['after-type <file> <type> <other>', 'Insert another routine after every action of a type.'],
  ['replace-type <file> <type> <other>', 'Replace every action of a type with another routine.'],
  ['mirror-route <file> <axis> <pivot>', 'Reflect goto coordinates across one coordinate plane.'],
  ['rotate-route <file> <pivot> <turns>', 'Rotate goto X/Z by signed quarter turns about x,y,z.'],
  ['scale-route <file> <pivot> <factor>', 'Scale goto offsets from x,y,z by a positive factor.'],
  ['snap-route <file> <grid>', 'Round goto coordinates to the nearest origin-aligned grid multiple.'],
  ['anchor-route <file> <point>', 'Translate all goto actions so the first reaches point.'],
  ['offset-range <file> <first> <last> <dx> <dy> <dz>', 'Translate goto actions only within a selected range.'],
  ['set-collect <file> <item> <count>', 'Set each matching collection request to an explicit quota.'],
  ['set-deposit <file> <item> <count>', 'Set each matching deposit request to an explicit quota.'],
  ['set-wait-range <file> <first> <last> <seconds>', 'Set waits only within a selected range.'],
  ['waypoint-waits <file> <seconds> <points...>', 'Append a goto and wait at each waypoint.'],
  ['round-trip <file> <points...>', 'Append an outbound waypoint route and reverse route back to its first point.'],
  ['patrol <file> <laps> <points...>', 'Append closed waypoint laps, starting at the first point.'],
  ['resolve-home <file> <point>', 'Replace home actions with explicit goto coordinates.'],
  ['storage-round <file> <points...>', 'Append goto and storage inspection at each waypoint.'],
  [
    'gather-store <file> <item> <count> <batch> <source> <depot>',
    'Append bounded collect, transport, inspect, and deposit trips.',
  ],
];
const OTHER_ARGUMENT = {
  'replace-range': 2,
  'weave-chunks': 0,
  'cycle-insert': 0,
  'before-type': 1,
  'after-type': 1,
  'replace-type': 1,
};
export function registerRoutineCompose(program, { print }) {
  const group = program
    .command('compose')
    .description('Compose validated routine JSON offline; never executes or changes input files.');
  for (const [signature, description] of COMPOSE_COMMANDS) {
    const name = signature.split(' ')[0];
    group
      .command(signature)
      .description(description)
      .action(async (...values) => {
        const [file, ...params] = values.slice(0, -2);
        const args = params.flat();
        const other = OTHER_ARGUMENT[name];
        if (other !== undefined) args[other] = await loadRoutine(args[other]);
        print(composeRoutine(await loadRoutine(file), name, ...args));
      });
  }
  return group;
}
