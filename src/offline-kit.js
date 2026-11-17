import { checked, sequence } from './spatial-inputs.js';

// Small shared boundary for batch 10's pure, caller-supplied planning tools.
// No bridge, files, model, or mutable gameplay state is available here.
export function demand(condition, message = 'Inputs do not describe a valid plan.') {
  if (!condition) throw new Error(message);
}
export const sum = (values) => values.reduce((a, b) => a + b, 0);
// Preserve low-order terms across long sequences of receipts or durations.
export function compensatedAdder(initial = 0) {
  let total = initial,
    correction = 0;
  return (value) => {
    const adjusted = value - correction;
    const next = total + adjusted;
    correction = next - total - adjusted;
    total = next;
    return total;
  };
}
export function same(...lists) {
  demand(
    lists.every((list) => list.length === lists[0].length),
    'Lists must have equal lengths.',
  );
}
export { sequence };

function scalar(value, type) {
  demand(['number', 'string'].includes(typeof value) && String(value).trim() !== '', 'Supply a finite number.');
  const n = Number(value);
  demand(Number.isFinite(n) && Math.abs(n) <= 1e6, 'Numbers must be finite and within ±1,000,000.');
  if ('qpcrs'.includes(type)) demand(n >= 0, 'Supply a nonnegative number.');
  if ('ps'.includes(type)) demand(n > 0, 'Supply a positive number.');
  if ('ics'.includes(type)) demand(Number.isSafeInteger(n), 'Supply a whole number.');
  if (type === 'r') demand(n <= 1, 'Fractions must be between zero and one.');
  return n;
}

export function readInput(value, type) {
  if ('nqpicrs'.includes(type) && type.length === 1) return scalar(value, type);
  if (type === 'indexes') {
    demand(typeof value === 'string', 'Supply a comma-separated index list, or an empty string.');
    return value.trim() === '' ? [] : readInput(value, 'C');
  }
  if (['l', 'L', 'P', 'C', 'S'].includes(type)) {
    demand(typeof value === 'string', 'Supply a comma-separated numeric list.');
    const parts = value.split(',');
    demand(parts.length <= 1000, 'Lists are limited to 1000 entries.');
    return parts.map((part) => scalar(part, { l: 'n', L: 'q', P: 'p', C: 'c', S: 's' }[type]));
  }
  if (['points2', 'points3', 'intervals', 'edges'].includes(type)) {
    demand(typeof value === 'string' && value.length <= 100000, 'Supply a bounded JSON array.');
    const rows = JSON.parse(value);
    demand(
      Array.isArray(rows) && (type === 'edges' || rows.length > 0) && rows.length <= 1000,
      type === 'edges' ? 'Supply 0–1000 edge rows.' : 'Supply 1–1000 coordinate rows.',
    );
    const width = type === 'points3' ? 3 : 2;
    return rows.map((row) => {
      demand(Array.isArray(row) && row.length === width, `Rows need ${width} numbers.`);
      const values = row.map((v) => scalar(v, type === 'edges' ? 'c' : 'n'));
      if (type === 'intervals') demand(values[0] <= values[1], 'Interval starts must not exceed ends.');
      return values;
    });
  }
  throw new Error(`Unknown input type: ${type}.`);
}

export function calculateOffline(group, command, args = []) {
  const spec = group.commands.find((spec) => spec.signature.split(' ')[0] === command);
  demand(spec, `Unknown ${group.name} command: ${command}.`);
  demand(Array.isArray(args) && args.length === spec.types.length, 'Supply exactly the documented arguments.');
  const result = spec.run(...spec.types.map((type, i) => readInput(args[i], type)));
  demand(result !== undefined, 'Calculation produced no result.');
  boundOutput(result);
  return checked({ result, note: group.note });
}

function boundOutput(value) {
  if (Array.isArray(value)) demand(value.length <= 1000, 'Output lists are limited to 1000 entries.');
  if (value && typeof value === 'object') Object.values(value).forEach(boundOutput);
}

export function registerOfflineGroups(program, groups, { print }) {
  for (const group of groups) {
    const parent = program.command(group.name).description(group.note);
    for (const spec of group.commands) {
      demand(spec.signature.split(' ').length - 1 === spec.types.length, `Invalid signature: ${spec.signature}.`);
      parent
        .command(spec.signature)
        .description(spec.description)
        .action((...values) => print(calculateOffline(group, spec.signature.split(' ')[0], values.slice(0, -2))));
    }
  }
}
