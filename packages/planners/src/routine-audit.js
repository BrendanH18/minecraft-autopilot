import { actionSchema } from '../../../src/protocol.js';
import { parseRoutine, loadRoutine } from '../../../src/routine.js';

const TYPES = new Set(actionSchema.options.map((s) => s.shape.type.value));
const NOTE =
  'Static routine analysis only. Initial inventory, saved home, terrain, backend support, failures, and action duration are unknown. Edits can change execution behavior; review before running.';
const validate = (actions) => parseRoutine(JSON.stringify(actions));
const output = (actions) => ({ actions: validate(actions) });
function numeric(value, min, max, integer = false) {
  if (!['string', 'number'].includes(typeof value) || String(value).trim() === '')
    throw new Error('Use a finite number.');
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n)))
    throw new Error(`Use ${integer ? 'an integer' : 'a number'} from ${min} to ${max}.`);
  return n;
}
const quantity = (value, max) => numeric(value, 1, max, true);
function actionType(value) {
  if (!TYPES.has(value)) throw new Error(`Unknown action type: ${value}.`);
  return value;
}
function splitAmount(action, field, maximum) {
  const total = action[field];
  const count = Math.ceil(total / maximum);
  if (field === 'seconds') return Array.from({ length: count }, () => ({ ...action, seconds: total / count }));
  return Array.from({ length: count }, (_, i) => ({ ...action, [field]: Math.min(maximum, total - i * maximum) }));
}

/** Offline policy reports and validated transforms. All step numbers are one-based. */
export function routineAudit(actions, command, ...args) {
  actions = validate(actions);
  const rows = actions.map((action, i) => ({ step: i + 1, action }));
  const report = (data) => ({ ...data, note: NOTE });
  const policy = (violations) => report({ passes: violations.length === 0, violations });
  switch (command) {
    case 'allowlist': {
      if (!args.length || args.length > TYPES.size) throw new Error('Give one or more allowed action types.');
      const allowed = new Set(args.map(actionType));
      return policy(rows.filter((r) => !allowed.has(r.action.type)));
    }
    case 'collect-ceiling': {
      const max = quantity(args[0], 64);
      return policy(rows.filter((r) => r.action.type === 'collect' && r.action.count > max));
    }
    case 'wait-ceiling': {
      const max = numeric(args[0], 1, 3600);
      return policy(rows.filter((r) => r.action.type === 'wait' && r.action.seconds > max));
    }
    case 'deposit-ceiling': {
      const max = quantity(args[0], 2304);
      return policy(
        rows
          .filter((r) => r.action.type === 'deposit' && (r.action.count === undefined || r.action.count > max))
          .map((r) => ({ ...r, unboundedCount: r.action.count === undefined })),
      );
    }
    case 'travel-ceiling': {
      const max = numeric(args[0], 0, 100_000_000);
      return policy(
        rows.flatMap((r, i) => {
          const previous = actions[i - 1];
          if (previous?.type !== 'goto' || r.action.type !== 'goto') return [];
          const distance = Math.hypot(...['x', 'y', 'z'].map((axis) => r.action[axis] - previous[axis]));
          return distance > max ? [{ fromStep: i, toStep: i + 1, distance }] : [];
        }),
      );
    }
    case 'chunk-visits': {
      const chunks = new Map();
      for (const r of rows.filter((r) => r.action.type === 'goto')) {
        const x = Math.floor(r.action.x / 16),
          z = Math.floor(r.action.z / 16),
          key = `${x},${z}`;
        const entry = chunks.get(key) ?? { x, z, steps: [] };
        entry.steps.push(r.step);
        chunks.set(key, entry);
      }
      return report({ chunks: [...chunks.values()] });
    }
    case 'altitude-bands': {
      const height = quantity(args[0], 768),
        bands = new Map();
      for (const r of rows.filter((r) => r.action.type === 'goto')) {
        const lower = Math.floor(r.action.y / height) * height;
        const entry = bands.get(lower) ?? { lower, upperExclusive: lower + height, steps: [] };
        entry.steps.push(r.step);
        bands.set(lower, entry);
      }
      return report({ bands: [...bands.values()].sort((a, b) => a.lower - b.lower) });
    }
    case 'collect-streaks': {
      const max = quantity(args[0], 100),
        streaks = [];
      for (const r of rows)
        if (r.action.type === 'collect') {
          const last = streaks.at(-1);
          if (last?.lastStep === r.step - 1) {
            last.lastStep = r.step;
            last.steps++;
            last.requested += r.action.count;
          } else streaks.push({ firstStep: r.step, lastStep: r.step, steps: 1, requested: r.action.count });
        }
      return policy(streaks.filter((r) => r.steps > max));
    }
    case 'deposit-order': {
      const collections = new Map();
      return report({
        deposits: rows.flatMap((r) => {
          const a = r.action;
          if (a.type === 'collect') collections.set(a.block, r.step);
          return a.type === 'deposit'
            ? [
                {
                  step: r.step,
                  item: a.item,
                  lastMatchingCollect: collections.get(a.item) ?? null,
                  requiresInitialStockOrOtherSource: !collections.has(a.item),
                },
              ]
            : [];
        }),
      });
    }
    case 'home-overwrites': {
      let previous = null;
      return report({
        overwrites: rows.flatMap((r) => {
          if (r.action.type !== 'set_home') return [];
          const earlier = previous;
          previous = r.step;
          return earlier === null ? [] : [{ step: r.step, replacesSetHomeStep: earlier }];
        }),
      });
    }
    case 'storage-check-gaps': {
      let lastInspection = null;
      return report({
        deposits: rows.flatMap((r) => {
          if (r.action.type === 'inspect_storage') lastInspection = r.step;
          return r.action.type === 'deposit'
            ? [
                {
                  step: r.step,
                  lastInspection,
                  interveningSteps: lastInspection === null ? null : r.step - lastInspection - 1,
                },
              ]
            : [];
        }),
      });
    }
    case 'wait-budget': {
      const budget = numeric(args[0], 0, 360_000);
      let total = 0;
      const overBudget = rows.flatMap((r) => {
        if (r.action.type !== 'wait') return [];
        total += r.action.seconds;
        return total > budget ? [{ step: r.step, cumulativeSeconds: total, overBy: total - budget }] : [];
      });
      return report({ budget, total, remaining: Math.max(0, budget - total), passes: total <= budget, overBudget });
    }
    case 'item-spans': {
      const items = new Map();
      for (const r of rows) {
        const name = r.action.block ?? r.action.item;
        if (!name) continue;
        const entry = items.get(name) ?? { name, firstStep: r.step, lastStep: r.step, uses: 0 };
        entry.lastStep = r.step;
        entry.uses++;
        items.set(name, entry);
      }
      return report({ items: [...items.values()].map((r) => ({ ...r, spanSteps: r.lastStep - r.firstStep + 1 })) });
    }
    case 'return-tail': {
      const index = actions.findLastIndex((a) => a.type === 'home');
      return report({
        lastHomeStep: index < 0 ? null : index + 1,
        trailingSteps: index < 0 ? [] : rows.slice(index + 1),
        endsWithHome: index === actions.length - 1,
      });
    }
    case 'execution-sections': {
      const size = quantity(args[0], 100),
        sections = [];
      for (let i = 0; i < actions.length; i += size) {
        const slice = actions.slice(i, i + size);
        sections.push({
          firstStep: i + 1,
          lastStep: i + slice.length,
          actions: slice.length,
          waitSeconds: slice.reduce((n, a) => n + (a.type === 'wait' ? a.seconds : 0), 0),
          requestedCollection: slice.reduce((n, a) => n + (a.type === 'collect' ? a.count : 0), 0),
        });
      }
      return report({ sections });
    }
    case 'split-collect': {
      const max = quantity(args[0], 64);
      return output(actions.flatMap((a) => (a.type === 'collect' ? splitAmount(a, 'count', max) : [a])));
    }
    case 'split-waits': {
      const max = numeric(args[0], 1, 3600);
      return output(actions.flatMap((a) => (a.type === 'wait' ? splitAmount(a, 'seconds', max) : [a])));
    }
    case 'split-deposits': {
      const max = quantity(args[0], 2304);
      return output(
        actions.flatMap((a) => (a.type === 'deposit' && a.count !== undefined ? splitAmount(a, 'count', max) : [a])),
      );
    }
    case 'merge-waits':
    case 'merge-collect': {
      const merged = [],
        target = command === 'merge-waits' ? 'wait' : 'collect',
        field = target === 'wait' ? 'seconds' : 'count',
        max = target === 'wait' ? 3600 : 64;
      for (const a of actions) {
        const last = merged.at(-1);
        if (a.type === target && last?.type === target && (target === 'wait' || last.block === a.block))
          last[field] += a[field];
        else merged.push({ ...a });
      }
      return output(merged.flatMap((a) => (a.type === target ? splitAmount(a, field, max) : [a])));
    }
    case 'pause-before': {
      const target = actionType(args[0]),
        seconds = numeric(args[1], 1, 3600);
      return output(actions.flatMap((a) => (a.type === target ? [{ type: 'wait', seconds }, a] : [a])));
    }
    case 'checkpoint-after': {
      const target = actionType(args[0]);
      return output(actions.flatMap((a) => (a.type === target ? [a, { type: 'home' }] : [a])));
    }
    case 'repeat-step': {
      const index = quantity(args[0], actions.length) - 1,
        count = quantity(args[1], 100);
      return output(actions.flatMap((a, i) => (i === index ? Array.from({ length: count }, () => ({ ...a })) : [a])));
    }
    case 'remove-range': {
      const first = quantity(args[0], actions.length),
        last = numeric(args[1], first, actions.length, true);
      return output(actions.filter((_, i) => i + 1 < first || i + 1 > last));
    }
    case 'set-goto-height': {
      const y = numeric(args[0], -64, 320);
      return output(actions.map((a) => (a.type === 'goto' ? { ...a, y } : a)));
    }
    default:
      throw new Error(`Unknown audit command: ${command}.`);
  }
}

export const AUDIT_COMMANDS = [
  ['allowlist <file> <types...>', 'Report actions outside an explicit action-type allowlist.'],
  ['collect-ceiling <file> <count>', 'Check per-step collection ceilings.'],
  ['wait-ceiling <file> <seconds>', 'Check per-step wait ceilings.'],
  ['deposit-ceiling <file> <count>', 'Check explicit deposit ceilings and flag deposit-all.'],
  ['travel-ceiling <file> <distance>', 'Check straight-line distances between adjacent goto actions.'],
  ['chunk-visits <file>', 'Group goto destinations by X/Z chunk.'],
  ['altitude-bands <file> <height>', 'Group goto destinations into zero-anchored altitude bands.'],
  ['collect-streaks <file> <steps>', 'Find consecutive collection streaks longer than a step budget.'],
  ['deposit-order <file>', 'Find deposits without an earlier matching collection.'],
  ['home-overwrites <file>', 'Find set_home actions replacing earlier routine home definitions.'],
  ['storage-check-gaps <file>', 'Locate each deposit relative to the preceding explicit storage inspection.'],
  ['wait-budget <file> <seconds>', 'Check a total explicit-wait budget and locate overruns.'],
  ['item-spans <file>', 'Measure first-to-last routine spans for each mentioned item.'],
  ['return-tail <file>', 'Show actions after the final home action.'],
  ['execution-sections <file> <size>', 'Summarize fixed-size sections for manual execution planning.'],
  ['split-collect <file> <count>', 'Split collection requests into smaller quotas.'],
  ['split-waits <file> <seconds>', 'Split waits evenly under a duration ceiling.'],
  ['split-deposits <file> <count>', 'Split explicit deposit counts; preserve deposit-all actions.'],
  ['merge-waits <file>', 'Merge adjacent waits, keeping each output within protocol limits.'],
  ['merge-collect <file>', 'Merge consecutive matching collections, then split at 64.'],
  ['pause-before <file> <type> <seconds>', 'Insert a wait before every action of a given type.'],
  ['checkpoint-after <file> <type>', 'Insert a home return after every action of a given type.'],
  ['repeat-step <file> <step> <count>', 'Replace one step with count copies.'],
  ['remove-range <file> <first> <last>', 'Remove an inclusive step range; refuse empty output.'],
  ['set-goto-height <file> <y>', 'Set the Y coordinate of every goto destination.'],
];

export function registerRoutineAudit(program, { print }) {
  const group = program
    .command('audit')
    .description('Offline routine policy checks and validated edits. Prints JSON without execution.');
  for (const [signature, description] of AUDIT_COMMANDS) {
    const name = signature.split(' ')[0];
    group
      .command(signature)
      .description(description)
      .action(async (...values) => {
        const [file, ...args] = values.slice(0, -2);
        print(routineAudit(await loadRoutine(file), name, ...args.flat()));
      });
  }
  return group;
}
