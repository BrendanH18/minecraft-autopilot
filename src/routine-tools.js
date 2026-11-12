import { COLLECTIBLE_BLOCKS } from './objective.js';
import { loadRoutine, parseRoutine, MAX_ROUTINE_STEPS } from './routine.js';
import { itemName, parseRoutePoints } from './cli-views.js';

function integer(value, min = 1, max = MAX_ROUTINE_STEPS) {
  const n = Number(value);
  if (String(value).trim() === '' || !Number.isSafeInteger(n) || n < min || n > max) throw new Error(`Expected an integer from ${min} to ${max}.`);
  return n;
}
const routine = actions => ({ actions: parseRoutine(JSON.stringify(actions)) });
const aggregate = (actions, type, field) => {
  const totals = new Map();
  for (const action of actions.filter(a => a.type === type)) {
    const name = action[field];
    const entry = totals.get(name) || { name, count: 0, all: false };
    if (action.count === undefined) entry.all = true;
    else entry.count += action.count;
    totals.set(name, entry);
  }
  return [...totals.values()].sort((a, b) => a.name.localeCompare(b.name));
};

export function routineReport(actions, kind) {
  // Revalidate all caller input, including command-generated routines.
  actions = routine(actions).actions;
  switch (kind) {
    case 'validate': return { valid: true, steps: actions.length };
    case 'summary': return { steps: actions.length, types: [...new Set(actions.map(a => a.type))], waitSeconds: actions.reduce((n, a) => n + (a.type === 'wait' ? a.seconds : 0), 0), note: 'Wait duration excludes action execution time.' };
    case 'types': return { types: [...new Set(actions.map(a => a.type))].map(type => ({ type, count: actions.filter(a => a.type === type).length })) };
    case 'collection': return { items: aggregate(actions, 'collect', 'block'), meaning: 'Additional collection targets; not guaranteed yields.' };
    case 'deposits': return { items: aggregate(actions, 'deposit', 'item'), meaning: 'Explicit counts plus any deposit-all steps; availability is checked only at execution.' };
    case 'waits': return { seconds: actions.reduce((n, a) => n + (a.type === 'wait' ? a.seconds : 0), 0), steps: actions.flatMap((a, i) => a.type === 'wait' ? [{ step: i + 1, seconds: a.seconds }] : []) };
    case 'destinations': return { destinations: actions.flatMap((a, i) => a.type === 'goto' ? [{ step: i + 1, x: a.x, y: a.y, z: a.z }] : []), note: 'Home destinations resolve only at execution.' };
    case 'first': return { step: 1, action: actions[0] };
    case 'last': return { step: actions.length, action: actions.at(-1) };
    case 'numbered': return { steps: actions.map((action, i) => ({ step: i + 1, action })) };
    case 'warnings': return { warnings: actions.flatMap((a, i) => {
      const messages = [];
      if (a.type === 'collect') messages.push('Collection can modify terrain.');
      if (a.type === 'deposit' && a.count === undefined) messages.push('Deposits every available matching item.');
      if (a.type === 'home') messages.push('Requires a saved home in the current dimension.');
      if (a.type === 'set_home') messages.push('Replaces the saved home.');
      return messages.map(message => ({ step: i + 1, message }));
    }), note: 'Static warnings only; world state and backend capability are not checked.' };
    default: throw new Error(`Unknown report: ${kind}.`);
  }
}

export function editRoutine(actions, kind, ...args) {
  actions = routine(actions).actions;
  let result;
  switch (kind) {
    case 'slice': { const first = integer(args[0], 1, actions.length), last = integer(args[1], first, actions.length); result = actions.slice(first - 1, last); break; }
    case 'take': result = actions.slice(0, integer(args[0], 1, actions.length)); break;
    case 'drop':
      if (actions.length === 1) throw new Error('Dropping would leave an empty routine; a routine needs at least one step.');
      result = actions.slice(integer(args[0], 1, actions.length - 1)); break;
    case 'reverse': result = [...actions].reverse(); break;
    case 'repeat': result = Array.from({ length: integer(args[0]) }, () => actions).flat(); break;
    case 'concat': result = [...actions, ...routine(args[0]).actions]; break;
    case 'remove': {
      if (actions.length === 1) throw new Error('Removing would leave an empty routine; a routine needs at least one step.');
      const step = integer(args[0], 1, actions.length); result = actions.filter((_, i) => i !== step - 1); break; }
    case 'insert': { const step = integer(args[0], 1, actions.length + 1); result = [...actions.slice(0, step - 1), ...routine(args[1]).actions, ...actions.slice(step - 1)]; break; }
    case 'replace': { const step = integer(args[0], 1, actions.length); result = [...actions.slice(0, step - 1), ...routine(args[1]).actions, ...actions.slice(step)]; break; }
    default: throw new Error(`Unknown edit: ${kind}.`);
  }
  return routine(result);
}

export function generateRoutine(kind, ...args) {
  let actions;
  if (kind === 'collect') {
    const block = itemName(args[0]);
    if (!COLLECTIBLE_BLOCKS.includes(block.slice('minecraft:'.length))) throw new Error(`Supported collection targets: ${COLLECTIBLE_BLOCKS.join(', ')}.`);
    const count = integer(args[1], 1, 2304);
    actions = [];
    for (let left = count; left > 0; left -= 64) actions.push({ type: 'collect', block, count: Math.min(left, 64) });
  } else if (kind === 'deposit') actions = [{ type: 'deposit', item: itemName(args[0]), count: integer(args[1], 1, 2304) }];
  else if (kind === 'trip') actions = [...generateRoutine('collect', ...args).actions, { type: 'home' }];
  else if (kind === 'wait') {
    let left = integer(args[0], 1, 360000);
    actions = [];
    while (left > 0) { actions.push({ type: 'wait', seconds: Math.min(left, 3600) }); left -= 3600; }
  } else if (kind === 'route') actions = parseRoutePoints(args[0]).map(point => ({ type: 'goto', ...point }));
  else throw new Error(`Unknown generator: ${kind}.`);
  return routine(actions);
}

export function registerRoutineTools(program, { print }) {
  const group = program.command('routine').description('Inspect, edit, or generate routine JSON offline; never executes actions or overwrites input files.');
  for (const name of ['validate', 'summary', 'types', 'collection', 'deposits', 'waits', 'destinations', 'first', 'last', 'numbered', 'warnings']) {
    group.command(`${name} <file>`).description(`Report routine ${name} without connecting.`).action(async file => print(routineReport(await loadRoutine(file), name)));
  }
  group.command('slice <file> <first> <last>').description('Keep an inclusive range of 1-based steps.').action(async (file, first, last) => print(editRoutine(await loadRoutine(file), 'slice', first, last)));
  for (const name of ['take', 'drop', 'repeat', 'remove']) group.command(`${name} <file> <${name === 'remove' ? 'step' : 'count'}>`).description(`${name} steps (remove uses a 1-based step); print validated JSON.`).action(async (file, count) => print(editRoutine(await loadRoutine(file), name, count)));
  group.command('reverse <file>').description('Reverse action order; this does not undo actions.').action(async file => print(editRoutine(await loadRoutine(file), 'reverse')));
  group.command('concat <file> <other>').description('Append another routine, up to 100 total steps.').action(async (file, other) => print(editRoutine(await loadRoutine(file), 'concat', await loadRoutine(other))));
  for (const name of ['insert', 'replace']) group.command(`${name} <file> <step> <other>`).description(`${name} another routine at a 1-based step.`).action(async (file, step, other) => print(editRoutine(await loadRoutine(file), name, step, await loadRoutine(other))));
  for (const name of ['collect', 'deposit', 'trip']) group.command(`make-${name} <item> <count>`).description(`Generate a ${name} routine; print JSON only.`).action((item, count) => print(generateRoutine(name, item, count)));
  group.command('make-wait <seconds>').description('Split a long wait into steps of at most one hour.').action(seconds => print(generateRoutine('wait', seconds)));
  group.command('make-route <points...>').description('Generate goto steps from x,y,z points; coordinates do not include a dimension.').action(points => print(generateRoutine('route', points)));
}
