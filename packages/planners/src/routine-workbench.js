import { actionSchema } from '../../../src/protocol.js';
import { parseRoutine, loadRoutine } from '../../../src/routine.js';
import { itemName } from '../../../src/cli-views.js';

const TYPES = new Set(actionSchema.options.map((schema) => schema.shape.type.value));
const axes = ['x', 'y', 'z'];
const validate = (actions) => parseRoutine(JSON.stringify(actions));
const output = (actions) => ({ actions: validate(actions) });
function type(value) {
  if (!TYPES.has(value)) throw new Error(`Unknown action type: ${value}.`);
  return value;
}
function number(value, min, max, integer = false) {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '')
    throw new Error('Expected a finite number.');
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n)))
    throw new Error(`Expected ${integer ? 'an integer' : 'a number'} from ${min} to ${max}.`);
  return n;
}
const step = (value, actions) => number(value, 1, actions.length, true) - 1;
const count = (value, max) => number(value, 1, max, true);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Static analyses and edits only. Never executes actions or writes input files. */
export function workbench(actions, command, ...args) {
  actions = validate(actions);
  switch (command) {
    case 'positions': {
      const target = type(args[0]);
      return { type: target, steps: actions.flatMap((a, i) => (a.type === target ? [i + 1] : [])) };
    }
    case 'transitions': {
      const transitions = new Map();
      actions.slice(1).forEach((a, i) => {
        const key = `${actions[i].type}:${a.type}`;
        const entry = transitions.get(key) ?? { from: actions[i].type, to: a.type, count: 0 };
        entry.count++;
        transitions.set(key, entry);
      });
      return { transitions: [...transitions.values()] };
    }
    case 'runs': {
      const runs = [];
      actions.forEach((a, i) => {
        const previous = runs.at(-1);
        if (previous?.type === a.type) {
          previous.lastStep = i + 1;
          previous.count++;
        } else runs.push({ type: a.type, firstStep: i + 1, lastStep: i + 1, count: 1 });
      });
      return { runs };
    }
    case 'duplicates':
      return {
        duplicates: actions.flatMap((action, i) => {
          const first = actions.findIndex((a) => equal(a, action));
          return first === i ? [] : [{ step: i + 1, firstStep: first + 1, action }];
        }),
        note: 'Repeated actions may be intentional; no action is removed.',
      };
    case 'home-dependencies': {
      let lastSetHome = null;
      const homes = [];
      actions.forEach((a, i) => {
        if (a.type === 'set_home') lastSetHome = i + 1;
        if (a.type === 'home')
          homes.push({ step: i + 1, setHomeStep: lastSetHome, requiresExistingHome: lastSetHome === null });
      });
      return { homes, note: 'Static order only; set_home succeeds and stays in the same dimension only at execution.' };
    }
    case 'collect-balance': {
      const items = new Map();
      for (const a of actions) {
        if (!['collect', 'deposit'].includes(a.type)) continue;
        const name = a.block ?? a.item,
          entry = items.get(name) ?? { item: name, requestedCollection: 0, explicitDeposits: 0, depositAllSteps: 0 };
        if (a.type === 'collect') entry.requestedCollection += a.count;
        else if (a.count === undefined) entry.depositAllSteps++;
        else entry.explicitDeposits += a.count;
        items.set(name, entry);
      }
      return {
        items: [...items.values()].map((a) => ({
          ...a,
          explicitDifference: a.requestedCollection - a.explicitDeposits,
        })),
        note: 'Requested counts only; deposit-all, initial inventory, failures, and collection returns prevent predicting final inventory.',
      };
    }
    case 'travel-segments': {
      const segments = [];
      for (let i = 1; i < actions.length; i++)
        if (actions[i - 1].type === 'goto' && actions[i].type === 'goto') {
          const a = actions[i - 1],
            b = actions[i];
          segments.push({ fromStep: i, toStep: i + 1, distance: Math.hypot(...axes.map((axis) => b[axis] - a[axis])) });
        }
      return {
        segments,
        distance: segments.reduce((sum, entry) => sum + entry.distance, 0),
        note: 'Straight-line distances for adjacent goto steps only; excludes initial travel, home, collection, and terrain.',
      };
    }
    case 'wait-timeline': {
      let seconds = 0;
      return {
        steps: actions.map((a, i) => {
          const before = seconds;
          if (a.type === 'wait') seconds += a.seconds;
          return { step: i + 1, before, after: seconds };
        }),
        note: 'Cumulative explicit waits only; action execution time is excluded.',
      };
    }
    case 'item-uses':
      return {
        items: [...new Set(actions.flatMap((a) => (a.block || a.item ? [a.block ?? a.item] : [])))].map((item) => ({
          item,
          steps: actions.flatMap((a, i) => ((a.block ?? a.item) === item ? [i + 1] : [])),
        })),
      };
    case 'bounds': {
      const points = actions.filter((a) => a.type === 'goto');
      return {
        points: points.length,
        bounds: points.length
          ? {
              min: Object.fromEntries(axes.map((axis) => [axis, Math.min(...points.map((p) => p[axis]))])),
              max: Object.fromEntries(axes.map((axis) => [axis, Math.max(...points.map((p) => p[axis]))])),
            }
          : null,
      };
    }
    case 'only': {
      const target = type(args[0]);
      return output(actions.filter((a) => a.type === target));
    }
    case 'without': {
      const target = type(args[0]);
      return output(actions.filter((a) => a.type !== target));
    }
    case 'swap': {
      const first = step(args[0], actions),
        second = step(args[1], actions);
      [actions[first], actions[second]] = [actions[second], actions[first]];
      return output(actions);
    }
    case 'move': {
      const from = step(args[0], actions),
        to = step(args[1], actions);
      const [action] = actions.splice(from, 1);
      actions.splice(to, 0, action);
      return output(actions);
    }
    case 'rotate': {
      const n = count(args[0], actions.length) % actions.length;
      return output([...actions.slice(n), ...actions.slice(0, n)]);
    }
    case 'interleave': {
      const other = validate(args[0]);
      return output(
        Array.from({ length: Math.max(actions.length, other.length) }, (_, i) =>
          [actions[i], other[i]].filter(Boolean),
        ).flat(),
      );
    }
    case 'scale-collect': {
      const factor = count(args[0], 64);
      return output(actions.map((a) => (a.type === 'collect' ? { ...a, count: a.count * factor } : a)));
    }
    case 'scale-waits': {
      const factor = number(args[0], 0.001, 3600);
      return output(actions.map((a) => (a.type === 'wait' ? { ...a, seconds: a.seconds * factor } : a)));
    }
    case 'cap-collect': {
      const maximum = count(args[0], 64);
      return output(actions.map((a) => (a.type === 'collect' ? { ...a, count: Math.min(a.count, maximum) } : a)));
    }
    case 'cap-waits': {
      const maximum = number(args[0], 1, 3600);
      return output(actions.map((a) => (a.type === 'wait' ? { ...a, seconds: Math.min(a.seconds, maximum) } : a)));
    }
    case 'explicit-deposits': {
      const amount = count(args[0], 2304);
      return output(actions.map((a) => (a.type === 'deposit' && a.count === undefined ? { ...a, count: amount } : a)));
    }
    case 'translate': {
      const offsets = args.map((value) => number(value, -59_999_968, 59_999_968));
      if (offsets.length !== 3) throw new Error('Use dx, dy, and dz.');
      return output(
        actions.map((a) =>
          a.type === 'goto' ? { ...a, ...Object.fromEntries(axes.map((axis, i) => [axis, a[axis] + offsets[i]])) } : a,
        ),
      );
    }
    case 'replace-item': {
      const from = itemName(args[0]),
        to = itemName(args[1]);
      return output(
        actions.map((a) => (a.block === from ? { ...a, block: to } : a.item === from ? { ...a, item: to } : a)),
      );
    }
    case 'pause-after': {
      const target = type(args[0]),
        seconds = number(args[1], 1, 3600);
      return output(actions.flatMap((a) => (a.type === target ? [a, { type: 'wait', seconds }] : [a])));
    }
    case 'bookend-home':
      return output([{ type: 'home' }, ...actions, { type: 'home' }]);
    default:
      throw new Error(`Unknown workbench command: ${command}.`);
  }
}

export const WORKBENCH_COMMANDS = [
  ['positions <file> <type>', 'Find all 1-based positions of an action type.'],
  ['transitions <file>', 'Count adjacent action-type transitions.'],
  ['runs <file>', 'Locate consecutive runs of each action type.'],
  ['duplicates <file>', 'Find exact repeated actions without removing them.'],
  ['home-dependencies <file>', 'Find which home actions require a pre-existing saved home.'],
  ['collect-balance <file>', 'Compare requested collection with explicit deposits by item.'],
  ['travel-segments <file>', 'Measure straight-line legs between adjacent goto actions.'],
  ['wait-timeline <file>', 'Show cumulative explicit wait time around each step.'],
  ['item-uses <file>', 'Locate every collect/deposit use of each item.'],
  ['bounds <file>', 'Find the bounding cuboid of goto destinations.'],
  ['only <file> <type>', 'Keep only one action type; refuse empty output.'],
  ['without <file> <type>', 'Remove one action type; refuse empty output.'],
  ['swap <file> <first> <second>', 'Swap two 1-based steps.'],
  ['move <file> <from> <to>', 'Move a step to its final 1-based position.'],
  ['rotate <file> <count>', 'Rotate the first count steps to the end.'],
  ['interleave <file> <other>', 'Alternate steps with another routine, then append its remainder.'],
  ['scale-collect <file> <factor>', 'Multiply collection quotas by an integer; reject protocol overflow.'],
  ['scale-waits <file> <factor>', 'Multiply wait durations; reject protocol underflow or overflow.'],
  ['cap-collect <file> <count>', 'Limit each collection quota to count.'],
  ['cap-waits <file> <seconds>', 'Limit each explicit wait duration.'],
  ['explicit-deposits <file> <count>', 'Replace deposit-all actions with an explicit count.'],
  ['translate <file> <dx> <dy> <dz>', 'Translate goto destinations; reject world-bound violations.'],
  ['replace-item <file> <old> <replacement>', 'Replace an item in collect and deposit actions.'],
  ['pause-after <file> <type> <seconds>', 'Insert a wait after each occurrence of an action type.'],
  ['bookend-home <file>', 'Add a home action before and after a routine.'],
];

export function registerRoutineWorkbench(program, { print }) {
  const group = program
    .command('workbench')
    .description(
      'Offline routine analysis and validated edits. Prints JSON; never executes actions or writes input files.',
    );
  for (const [signature, description] of WORKBENCH_COMMANDS) {
    const name = signature.split(' ')[0];
    group
      .command(signature)
      .description(description)
      .action(async (...values) => {
        const [file, ...args] = values.slice(0, -2);
        const actions = await loadRoutine(file);
        if (name === 'interleave') args[0] = await loadRoutine(args[0]);
        print(workbench(actions, name, ...args));
      });
  }
  return group;
}
