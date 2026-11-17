import { wholeFloor, budgetFits } from './resource-rounding.js';
// Pure offline calculations. All quantities and rates are supplied by the caller.
const MAX = 1_000_000;
function scalar(value, kind) {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '')
    throw new Error('Expected a finite numeric value.');
  const n = Number(value);
  if (
    !Number.isFinite(n) ||
    n < 0 ||
    n > MAX ||
    ('PJW'.includes(kind) && n <= 0) ||
    ('IJ'.includes(kind) && !Number.isSafeInteger(n)) ||
    (kind === 'R' && n > 1)
  )
    throw new Error('Quantity outside the supported finite range.');
  return n;
}
function read(value, kind) {
  if (!['L', 'W', 'C'].includes(kind)) return scalar(value, kind);
  if (typeof value !== 'string') throw new Error('Expected a comma-separated list.');
  const parts = value.split(',');
  if (!parts.length || parts.length > 1000) throw new Error('Lists are limited to 1000 entries.');
  return parts.map((v) => scalar(v, kind === 'C' ? 'I' : kind === 'W' ? 'P' : 'N'));
}
const sum = (values) => values.reduce((n, v) => n + v, 0);
function same(a, b) {
  if (a.length !== b.length) throw new Error('Lists must have equal lengths.');
}
function demand(ok, message) {
  if (!ok) throw new Error(message);
}
function checked(value) {
  if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER))
    throw new Error('Result exceeds supported numeric range.');
  if (Array.isArray(value)) {
    if (value.length > 1000) throw new Error('Output is limited to 1000 entries.');
    value.forEach(checked);
  } else if (value && typeof value === 'object') Object.values(value).forEach(checked);
  return value;
}

const NOTE =
  'Offline allocation using explicit positional demands, capacities, priorities, and weights. Reports are mathematical plans; no storage compatibility, item movement, or fairness policy is inferred.';
export const ALLOCATION_COMMANDS = [
  ['priority <demands> <budget>', 'Fulfill continuous demands in original priority order.'],
  ['proportional <demands> <budget>', 'Scale all continuous demands by a shared fulfillment fraction.'],
  ['weighted <weights> <budget>', 'Split a continuous budget by positive caller-supplied weights.'],
  ['equal-cap <demands> <budget>', 'Water-fill continuous grants equally up to each demand cap.'],
  ['minimum-first <minimums> <demands> <budget>', 'Fund minima first, then distribute residual demand proportionally.'],
  ['whole-jobs <costs> <budget>', 'Admit indivisible jobs in source order, skipping jobs that do not fit.'],
  ['cheapest-jobs <costs> <budget>', 'Admit the maximum-count cheapest indivisible jobs with stable tie order.'],
  ['value-order <costs> <values>', 'Rank indivisible jobs by supplied value per unit cost.'],
  ['coverage <grants> <demands>', 'Report per-item fulfillment ratios, leaving zero demand undefined.'],
  ['shortages <stocks> <demands>', 'Compute independent item shortfalls and surpluses.'],
  ['reserve-items <stocks> <reserves>', 'Separate per-item protected reserves from allocatable stock.'],
  ['cap-grants <requested> <caps>', 'Apply independent per-item grant ceilings.'],
  ['kit-limit <stocks> <per-kit> <maximum-kits>', 'Bound complete mixed-item kits by stock and an external cap.'],
  ['weighted-rounds <weights> <rounds>', 'Budget discrete grants when each full round follows integer weights.'],
  ['round-limit <stock> <costs-per-round>', 'Bound complete rounds that simultaneously fund every supplied job.'],
  ['reconcile <planned> <actual>', 'Compare actual positional grants with their plan.'],
  ['rebalance <stocks> <targets>', 'Report positional donor and receiver amounts without assuming interchangeability.'],
  [
    'shared-capacity <counts> <unit-sizes> <capacity>',
    'Scale an entire continuous load proportionally to one shared volume limit.',
  ],
  [
    'priority-capacity <counts> <unit-sizes> <capacity>',
    'Pack whole units in priority order against a continuous size limit.',
  ],
  ['workers <workloads> <workers>', 'Allocate integer workers proportionally by largest remainder.'],
  ['capacity-gap <demands> <capacities>', 'Compare per-item demand against separately available capacities.'],
  [
    'priority-floor <demands> <budget> <minimum-grant>',
    'Grant in order only when at least a minimum viable amount can be supplied.',
  ],
  [
    'budget-sensitivity <demands> <current-budget> <extra-budget>',
    'Measure additional common proportional fulfillment from a budget increase.',
  ],
  ['minimum-budget <demands> <minimum-coverage>', 'Budget a common minimum fraction of every continuous demand.'],
  ['funding-order <demands> <budget>', 'Report cumulative funding milestones and the first incompletely funded item.'],
];
const SPECS = {
  priority: ['L', 'N'],
  proportional: ['L', 'N'],
  weighted: ['W', 'N'],
  'equal-cap': ['L', 'N'],
  'minimum-first': ['L', 'L', 'N'],
  'whole-jobs': ['W', 'N'],
  'cheapest-jobs': ['W', 'N'],
  'value-order': ['W', 'L'],
  coverage: ['L', 'L'],
  shortages: ['L', 'L'],
  'reserve-items': ['L', 'L'],
  'cap-grants': ['L', 'L'],
  'kit-limit': ['C', 'C', 'I'],
  'weighted-rounds': ['C', 'I'],
  'round-limit': ['N', 'W'],
  reconcile: ['L', 'L'],
  rebalance: ['L', 'L'],
  'shared-capacity': ['L', 'W', 'N'],
  'priority-capacity': ['C', 'W', 'N'],
  workers: ['L', 'J'],
  'capacity-gap': ['L', 'L'],
  'priority-floor': ['L', 'N', 'P'],
  'budget-sensitivity': ['L', 'N', 'N'],
  'minimum-budget': ['L', 'R'],
  'funding-order': ['L', 'N'],
};

export function allocationCalculation(command, args = []) {
  if (!Object.hasOwn(SPECS, command)) throw new Error(`Unknown allocation command: ${command}.`);
  const spec = SPECS[command];
  if (args.length !== spec.length) throw new Error(`Expected ${spec.length} arguments.`);
  const values = spec.map((kind, i) => read(args[i], kind));
  let result;
  switch (command) {
    case 'priority': {
      const [a, b] = values;
      let left = b;
      const granted = a.map((v) => {
        const n = Math.min(v, left);
        left -= n;
        return n;
      });
      result = { granted, unspent: left, unfilled: a.map((v, i) => v - granted[i]) };
      break;
    }
    case 'proportional': {
      const [a, b] = values;
      const total = sum(a);
      result = { granted: a.map((v) => v * (total ? Math.min(1, b / total) : 0)), unspent: Math.max(0, b - total) };
      break;
    }
    case 'weighted': {
      const [a, b] = values;
      const total = sum(a);
      result = { granted: a.map((v) => (b * v) / total) };
      break;
    }
    case 'equal-cap': {
      const [a, b] = values;
      const total = sum(a),
        target = Math.min(b, total),
        sorted = [...a].sort((x, y) => x - y);
      let remaining = target,
        level = 0;
      for (let i = 0; i < sorted.length; i++) {
        const fair = remaining / (sorted.length - i);
        if (fair <= sorted[i]) {
          level = fair;
          break;
        }
        remaining -= sorted[i];
      }
      const granted = budgetFits(total, b) ? [...a] : a.map((v) => Math.min(v, level));
      result = { granted, unspent: Math.max(0, b - total) };
      break;
    }
    case 'minimum-first': {
      const [a, b, c] = values;
      same(a, b);
      demand(
        a.every((v, i) => v <= b[i]),
        'Minimum exceeds demand.',
      );
      const minima = sum(a);
      demand(budgetFits(minima, c), 'Budget cannot cover minimums.');
      const residual = b.map((v, i) => v - a[i]),
        total = sum(residual),
        fraction = total ? Math.max(0, Math.min(1, (c - minima) / total)) : 0;
      result = { granted: a.map((v, i) => v + residual[i] * fraction), unspent: Math.max(0, c - sum(b)) };
      break;
    }
    case 'whole-jobs': {
      const [a, b] = values;
      let left = b;
      const accepted = [];
      a.forEach((v, i) => {
        if (budgetFits(v, left)) {
          accepted.push(i + 1);
          left = Math.max(0, left - v);
        }
      });
      result = { accepted, unspent: left };
      break;
    }
    case 'cheapest-jobs': {
      const [a, b] = values;
      let left = b;
      const accepted = [];
      for (const v of a
        .map((cost, i) => ({ cost, index: i + 1 }))
        .sort((x, y) => x.cost - y.cost || x.index - y.index)) {
        if (budgetFits(v.cost, left)) {
          accepted.push(v.index);
          left = Math.max(0, left - v.cost);
        }
      }
      result = { accepted, unspent: left };
      break;
    }
    case 'value-order': {
      const [a, b] = values;
      same(a, b);
      result = {
        ranked: a
          .map((cost, i) => ({ job: i + 1, ratio: b[i] / cost }))
          .sort((x, y) => y.ratio - x.ratio || x.job - y.job),
      };
      break;
    }
    case 'coverage': {
      const [a, b] = values;
      same(a, b);
      result = {
        coverage: a.map((v, i) => (b[i] ? v / b[i] : null)),
        fullyCovered: a.flatMap((v, i) => (v >= b[i] ? [i + 1] : [])),
      };
      break;
    }
    case 'shortages': {
      const [a, b] = values;
      same(a, b);
      result = { shortages: a.map((v, i) => Math.max(0, b[i] - v)), surpluses: a.map((v, i) => Math.max(0, v - b[i])) };
      break;
    }
    case 'reserve-items': {
      const [a, b] = values;
      same(a, b);
      result = {
        available: a.map((v, i) => Math.max(0, v - b[i])),
        reserveShortfalls: a.map((v, i) => Math.max(0, b[i] - v)),
      };
      break;
    }
    case 'cap-grants': {
      const [a, b] = values;
      same(a, b);
      result = { granted: a.map((v, i) => Math.min(v, b[i])), cut: a.map((v, i) => Math.max(0, v - b[i])) };
      break;
    }
    case 'kit-limit': {
      const [a, b, c] = values;
      same(a, b);
      demand(
        b.every((v) => v > 0),
        'Kit costs must be positive.',
      );
      const kits = Math.min(c, ...a.map((v, i) => wholeFloor(v / b[i])));
      result = { kits, remaining: a.map((v, i) => v - kits * b[i]) };
      break;
    }
    case 'weighted-rounds': {
      const [a, b] = values;
      result = { granted: a.map((v) => v * b), total: sum(a) * b };
      break;
    }
    case 'round-limit': {
      const [a, b] = values;
      const cost = sum(b),
        rounds = wholeFloor(a / cost);
      result = { rounds, costPerRound: cost, remaining: a - rounds * cost };
      break;
    }
    case 'reconcile': {
      const [a, b] = values;
      same(a, b);
      result = { changes: a.map((v, i) => b[i] - v), totalChange: sum(b) - sum(a) };
      break;
    }
    case 'rebalance': {
      const [a, b] = values;
      same(a, b);
      result = {
        donors: a.flatMap((v, i) => (v > b[i] ? [{ item: i + 1, amount: v - b[i] }] : [])),
        receivers: a.flatMap((v, i) => (v < b[i] ? [{ item: i + 1, amount: b[i] - v }] : [])),
      };
      break;
    }
    case 'shared-capacity': {
      const [a, b, c] = values;
      same(a, b);
      const size = sum(a.map((v, i) => v * b[i])),
        fraction = size ? Math.min(1, c / size) : 1;
      result = { fraction, granted: a.map((v) => v * fraction), usedCapacity: size * fraction };
      break;
    }
    case 'priority-capacity': {
      const [a, b, c] = values;
      same(a, b);
      let left = c;
      const granted = a.map((v, i) => {
        const n = Math.min(v, wholeFloor(left / b[i]));
        left = Math.max(0, left - n * b[i]);
        return n;
      });
      result = { granted, unusedCapacity: left };
      break;
    }
    case 'workers': {
      const [a, b] = values;
      demand(b <= 1000, 'Too many workers.');
      const total = sum(a);
      demand(total > 0, 'At least one workload must be positive.');
      const ideal = a.map((v) => (b * v) / total),
        counts = ideal.map(Math.floor),
        order = ideal.map((v, i) => ({ i, r: v - counts[i] })).sort((x, y) => y.r - x.r || x.i - y.i);
      for (let n = b - sum(counts), i = 0; i < n; i++) counts[order[i].i]++;
      result = { workers: counts };
      break;
    }
    case 'capacity-gap': {
      const [a, b] = values;
      same(a, b);
      result = {
        overloaded: a.flatMap((v, i) => (v > b[i] ? [i + 1] : [])),
        spare: b.map((v, i) => Math.max(0, v - a[i])),
      };
      break;
    }
    case 'priority-floor': {
      const [a, b, c] = values;
      let left = b;
      const granted = a.map((v) => {
        const amount = Math.min(v, left);
        if (amount < c) return 0;
        left -= amount;
        return amount;
      });
      result = { granted, unspent: left };
      break;
    }
    case 'budget-sensitivity': {
      const [a, b, c] = values;
      const total = sum(a),
        before = total ? Math.min(1, b / total) : 1,
        after = total ? Math.min(1, (b + c) / total) : 1;
      result = { beforeFraction: before, afterFraction: after, additionalGrants: a.map((v) => v * (after - before)) };
      break;
    }
    case 'minimum-budget': {
      const [a, b] = values;
      result = { budget: sum(a) * b, minimumGrants: a.map((v) => v * b) };
      break;
    }
    case 'funding-order': {
      const [a, b] = values;
      let cumulative = 0;
      const milestones = a.map((v, i) => ({ item: i + 1, cumulative: (cumulative += v) }));
      result = { milestones, firstUnfunded: milestones.find((v) => !budgetFits(v.cumulative, b))?.item ?? null };
      break;
    }
  }
  return checked({ ...result, note: NOTE });
}

export function registerAllocationTools(program, { print }) {
  const group = program.command('allocation').description('Multi-item allocation');
  for (const [signature, description] of ALLOCATION_COMMANDS)
    group
      .command(signature)
      .description(description)
      .action((...values) => print(allocationCalculation(signature.split(' ')[0], values.slice(0, -2))));
  return group;
}
