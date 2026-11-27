import { actionSchema } from '../../../src/protocol.js';
import { loadRoutine, parseRoutine } from '../../../src/routine.js';
import { navNumber, navPoint } from './navigation.js';
import { itemName } from '../../../src/cli-views.js';

const TYPES = new Set(actionSchema.options.map((s) => s.shape.type.value));
const axes = ['x', 'y', 'z'];
const validate = (actions) => parseRoutine(JSON.stringify(actions));
function type(value) {
  if (!TYPES.has(value)) throw new Error(`Unknown action type: ${value}.`);
  return value;
}
function number(value, min, max, integer = false) {
  const n = navNumber(value);
  if (n < min || n > max || (integer && !Number.isSafeInteger(n)))
    throw new Error(`Expected ${integer ? 'an integer' : 'a number'} from ${min} to ${max}.`);
  return n;
}
function interval(args, min, max) {
  const first = number(args[0], min, max),
    last = number(args[1], first, max);
  return [first, last];
}

/** Preserves source ordering and prints only protocol-valid nonempty action arrays. Static selections can lose world dependencies. */
export function selectRoutine(actions, command, ...args) {
  actions = validate(actions);
  const indices = (predicate) => actions.flatMap((a, i) => (predicate(a, i) ? [i] : []));
  const occurrence = (target, value) => {
    const found = indices((a) => a.type === type(target));
    return found[number(value, 1, found.length, true) - 1];
  };
  let selected;
  switch (command) {
    case 'item':
    case 'except-item': {
      const name = itemName(args[0]);
      selected = indices((a) => ((a.block ?? a.item) === name) === (command === 'item'));
      break;
    }
    case 'types': {
      const types = new Set(args.flat().map(type));
      if (!types.size) throw new Error('Give at least one action type.');
      selected = indices((a) => types.has(a.type));
      break;
    }
    case 'between-types': {
      const start = actions.findIndex((a) => a.type === type(args[0])),
        endType = type(args[1]);
      const end = actions.findIndex((a, i) => i >= start && a.type === endType);
      if (start < 0 || end < start) throw new Error('No ordered start/end type pair exists.');
      selected = indices((_, i) => i >= start && i <= end);
      break;
    }
    case 'before-match':
    case 'after-match': {
      const index = occurrence(args[0], args[1]);
      selected = indices((_, i) => (command === 'before-match' ? i < index : i > index));
      break;
    }
    case 'match-context': {
      const target = type(args[0]),
        before = number(args[1], 0, 100, true),
        after = number(args[2], 0, 100, true),
        matches = indices((a) => a.type === target);
      selected = indices((_, i) => matches.some((j) => i >= j - before && i <= j + after));
      break;
    }
    case 'nth-type':
      selected = [occurrence(args[0], args[1])];
      break;
    case 'occurrences': {
      const target = type(args[0]),
        matches = indices((a) => a.type === target),
        first = number(args[1], 1, matches.length, true),
        last = number(args[2], first, matches.length, true);
      selected = matches.slice(first - 1, last);
      break;
    }
    case 'collect-range':
    case 'deposit-range':
    case 'wait-range': {
      const target = command.split('-')[0],
        field = target === 'wait' ? 'seconds' : 'count',
        limits = interval(args, target === 'wait' ? 1 : 1, target === 'wait' ? 3600 : target === 'collect' ? 64 : 2304);
      selected = indices(
        (a) => a.type === target && a[field] !== undefined && a[field] >= limits[0] && a[field] <= limits[1],
      );
      break;
    }
    case 'goto-box': {
      const a = navPoint(args[0]),
        b = navPoint(args[1]);
      selected = indices(
        (p) => p.type === 'goto' && axes.every((k) => p[k] >= Math.min(a[k], b[k]) && p[k] <= Math.max(a[k], b[k])),
      );
      break;
    }
    case 'goto-sphere': {
      const center = navPoint(args[0]),
        radius = number(args[1], 0, 100_000_000);
      selected = indices((p) => p.type === 'goto' && Math.hypot(...axes.map((k) => p[k] - center[k])) <= radius);
      break;
    }
    case 'goto-chunk': {
      const x = number(args[0], -1874999, 1874999, true),
        z = number(args[1], -1874999, 1874999, true);
      selected = indices((p) => p.type === 'goto' && Math.floor(p.x / 16) === x && Math.floor(p.z / 16) === z);
      break;
    }
    case 'goto-altitude': {
      const [min, max] = interval(args, -64, 320);
      selected = indices((p) => p.type === 'goto' && p.y >= min && p.y <= max);
      break;
    }
    case 'first-per-item':
    case 'last-per-item': {
      const found = new Map();
      for (let i = 0; i < actions.length; i++) {
        const a = actions[i],
          name = a.block ?? a.item;
        if (name && (command === 'last-per-item' || !found.has(`${a.type}:${name}`))) found.set(`${a.type}:${name}`, i);
      }
      selected = [...found.values()].sort((a, b) => a - b);
      break;
    }
    case 'every-nth': {
      const start = number(args[0], 1, actions.length, true) - 1,
        stride = number(args[1], 1, 100, true);
      selected = indices((_, i) => i >= start && (i - start) % stride === 0);
      break;
    }
    case 'indices':
    case 'exclude-indices': {
      const values = args.flat().map((v) => number(v, 1, actions.length, true) - 1);
      if (!values.length || new Set(values).size !== values.length) throw new Error('Give distinct 1-based steps.');
      const wanted = new Set(values);
      selected = indices((_, i) => wanted.has(i) === (command === 'indices'));
      break;
    }
    case 'home-section': {
      const starts = indices((a) => a.type === 'set_home'),
        which = number(args[0], 1, starts.length, true) - 1,
        first = starts[which],
        last = starts[which + 1] ?? actions.length;
      selected = indices((_, i) => i >= first && i < last);
      break;
    }
    case 'collection-cycle': {
      const name = itemName(args[0]),
        starts = indices((a) => a.type === 'collect' && a.block === name),
        first = starts[number(args[1], 1, starts.length, true) - 1],
        last = actions.findIndex((a, i) => i > first && a.type === 'deposit' && a.item === name);
      if (last < 0) throw new Error('The chosen collection has no subsequent matching deposit.');
      selected = indices((_, i) => i >= first && i <= last);
      break;
    }
    case 'wait-window': {
      const [start, end] = interval(args, 0, 360000);
      if (start === end) throw new Error('The wait window must have positive duration.');
      let elapsed = 0;
      selected = indices((a) => {
        if (a.type !== 'wait') return false;
        const from = elapsed;
        elapsed += a.seconds;
        return from < end && elapsed > start;
      });
      break;
    }
    case 'dependency-window': {
      let first = number(args[0], 1, actions.length, true) - 1;
      const last = number(args[1], first + 1, actions.length, true) - 1;
      const home = actions.findIndex((a, i) => i >= first && i <= last && a.type === 'home');
      if (home >= 0 && !actions.slice(first, home).some((a) => a.type === 'set_home')) {
        const prior = actions.slice(0, first).findLastIndex((a) => a.type === 'set_home');
        if (prior >= 0) first = prior;
      }
      selected = indices((_, i) => i >= first && i <= last);
      break;
    }
    default:
      throw new Error(`Unknown routine selection: ${command}.`);
  }
  if (!selected.length) throw new Error('Selection contains no actions; no empty routine was emitted.');
  return { actions: validate(selected.map((i) => actions[i])) };
}

export const SELECT_ROUTINE_COMMANDS = [
  ['item <file> <item>', 'Keep all collect/deposit requests mentioning one item.'],
  ['except-item <file> <item>', 'Remove requests mentioning one item.'],
  ['types <file> <types...>', 'Keep an explicit set of action types.'],
  ['between-types <file> <start-type> <end-type>', 'Extract the first inclusive ordered type-delimited section.'],
  ['before-match <file> <type> <occurrence>', 'Extract the prefix before a chosen occurrence of a type.'],
  ['after-match <file> <type> <occurrence>', 'Extract the suffix after a chosen occurrence of a type.'],
  ['match-context <file> <type> <before> <after>', 'Keep merged step contexts around every matching type.'],
  ['nth-type <file> <type> <occurrence>', 'Extract one occurrence of an action type.'],
  ['occurrences <file> <type> <first> <last>', 'Keep an inclusive occurrence range of one type.'],
  ['collect-range <file> <minimum> <maximum>', 'Keep collection requests with quotas in a range.'],
  ['deposit-range <file> <minimum> <maximum>', 'Keep explicit deposits with counts in a range; omit deposit-all.'],
  ['wait-range <file> <minimum> <maximum>', 'Keep waits with durations in a range.'],
  ['goto-box <file> <corner-a> <corner-b>', 'Keep goto destinations inside an inclusive box.'],
  ['goto-sphere <file> <center> <radius>', 'Keep goto destinations inside an inclusive sphere.'],
  ['goto-chunk <file> <chunk-x> <chunk-z>', 'Keep goto destinations in one horizontal chunk.'],
  ['goto-altitude <file> <minimum> <maximum>', 'Keep goto destinations in an inclusive altitude range.'],
  ['first-per-item <file>', 'Keep the first collect and first deposit request for each item.'],
  ['last-per-item <file>', 'Keep the last collect and last deposit request for each item.'],
  ['every-nth <file> <start> <stride>', 'Keep periodically spaced original steps.'],
  ['indices <file> <steps...>', 'Keep distinct selected steps in original order.'],
  ['exclude-indices <file> <steps...>', 'Remove distinct selected steps.'],
  ['home-section <file> <occurrence>', 'Keep a set_home section through before its next redefinition.'],
  [
    'collection-cycle <file> <item> <occurrence>',
    'Keep a collection through the next matching deposit, including intervening steps.',
  ],
  [
    'wait-window <file> <start-seconds> <end-seconds>',
    'Keep whole waits intersecting a half-open cumulative explicit-wait interval.',
  ],
  [
    'dependency-window <file> <first> <last>',
    'Extract a range, expanding to a preceding home definition when available and needed.',
  ],
];
export function registerRoutineSelect(program, { print }) {
  const group = program
    .command('select-routine')
    .description('Extract validated routine JSON offline in source order. Selection does not establish executability.');
  for (const [signature, description] of SELECT_ROUTINE_COMMANDS) {
    const name = signature.split(' ')[0];
    group
      .command(signature)
      .description(description)
      .action(async (...values) => {
        const [file, ...args] = values.slice(0, -2);
        print(selectRoutine(await loadRoutine(file), name, ...args.flat()));
      });
  }
  return group;
}
