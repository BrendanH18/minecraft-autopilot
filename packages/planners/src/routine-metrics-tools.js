import { actionSchema } from '../../../src/protocol.js';
import { RECIPES, craftsFor } from '../../../src/recipes.js';
import { parseRoutine, loadRoutine } from '../../../src/routine.js';
import { ledgerNumber } from './ledger-tools.js';
const types = actionSchema.options.map((schema) => schema.shape.type.value);
const sum = (a) => a.reduce((n, v) => n + v, 0);
const histogram = (a) => Object.fromEntries([...new Set(a)].map((v) => [v, a.filter((x) => x === v).length]));
const metricSpecs = [
  ['type-entropy', '', 'Shannon entropy in bits of requested action types.'],
  ['type-concentration', '', 'Sum of squared action-type shares.'],
  ['switch-rate', '', 'Fraction of adjacent steps changing action type.'],
  ['transition-probabilities', '', 'Conditional next-type probabilities.'],
  ['trigrams', '', 'Counts of adjacent action-type triples.'],
  ['lag-pairs', ' <lag>', 'Type-pair counts at an explicit step lag.'],
  ['type-recurrence', ' <type>', 'Gaps in step numbers between repeated types.'],
  ['item-recurrence', ' <item>', 'Gaps between any requests mentioning one item.'],
  ['prefix-diversity', '', 'Distinct action types encountered through each step.'],
  ['suffix-diversity', '', 'Distinct action types remaining from each step.'],
  ['wait-share', '', 'Explicit waits as a fraction of steps, not runtime.'],
  ['collection-concentration', '', 'Sum of squared shares of per-item requested collection quotas.'],
  ['deposit-uncertainty', '', 'Steps with deposit-all and their share of deposit requests.'],
  [
    'collection-pressure',
    '',
    'Maximum prefix collect minus explicit deposit balance; deposit-all makes subsequent balance unknown.',
  ],
  ['wait-spacing', '', 'Number of intervening steps between waits.'],
  ['inspection-spacing', '', 'Number of intervening steps between storage inspections.'],
  ['return-spacing', '', 'Number of intervening steps between home returns.'],
  ['type-coverage', ' <types...>', 'Share and missing members of an explicit action-type set.'],
  ['item-coverage', ' <items...>', 'Share and missing members of an explicit item set.'],
  ['wait-quantiles', '', 'Minimum, median, and maximum explicit wait request durations.'],
  ['collect-quantiles', '', 'Minimum, median, and maximum collection quotas.'],
  ['deposit-quantiles', '', 'Minimum, median, and maximum explicit deposit counts; deposit-all excluded.'],
  ['goto-revisit', '', 'Occurrences returning to an earlier exact requested coordinate.'],
  ['vertical-reversals', '', 'Sign changes among nonzero Y differences of consecutive goto destinations.'],
  ['step-cost', ' <costs>', 'Per-step and total supplied type=cost estimates; every used type required.'],
];
export const ROUTINE_METRICS_COMMANDS = metricSpecs.map(([n, a, d]) => [`${n} <file>${a}`, d]);
export function routineMetricsReport(input, command, args = []) {
  const actions = parseRoutine(JSON.stringify(input)),
    ts = actions.map((a) => a.type),
    counts = histogram(ts),
    n = actions.length;
  const check = (t) => {
    if (!types.includes(t)) throw new Error('Unknown action type.');
    return t;
  };
  const item = (s) => {
    if (typeof s !== 'string' || !/^(?:minecraft:)?[a-z0-9_]{1,90}$/.test(s)) throw new Error('Invalid item name.');
    return s.includes(':') ? s : `minecraft:${s}`;
  };
  const positions = (predicate) => actions.flatMap((a, i) => (predicate(a) ? [i + 1] : []));
  const gaps = (p) => p.slice(1).map((v, i) => v - p[i]);
  const quantiles = (values) => {
    values.sort((a, b) => a - b);
    const m = values.length;
    return m
      ? {
          minimum: values[0],
          median: (values[Math.floor((m - 1) / 2)] + values[Math.ceil((m - 1) / 2)]) / 2,
          maximum: values.at(-1),
        }
      : null;
  };
  let result;
  switch (command) {
    case 'type-entropy':
      result = -sum(Object.values(counts).map((c) => (c / n) * Math.log2(c / n)));
      break;
    case 'type-concentration':
      result = sum(Object.values(counts).map((c) => (c / n) ** 2));
      break;
    case 'switch-rate':
      result = n > 1 ? ts.slice(1).filter((t, i) => t !== ts[i]).length / (n - 1) : null;
      break;
    case 'transition-probabilities': {
      const pairs = histogram(ts.slice(1).map((t, i) => `${ts[i]}>${t}`));
      result = Object.entries(pairs).map(([pair, count]) => ({
        pair,
        count,
        probability: count / ts.slice(0, -1).filter((t) => t === pair.split('>')[0]).length,
      }));
      break;
    }
    case 'trigrams':
      result = histogram(ts.slice(2).map((t, i) => `${ts[i]}>${ts[i + 1]}>${t}`));
      break;
    case 'lag-pairs': {
      const lag = ledgerNumber(args[0], 1, 100, true);
      result = histogram(ts.slice(lag).map((t, i) => `${ts[i]}>${t}`));
      break;
    }
    case 'type-recurrence': {
      const t = check(args[0]);
      result = gaps(positions((a) => a.type === t));
      break;
    }
    case 'item-recurrence': {
      const name = item(args[0]);
      result = gaps(positions((a) => (a.item ?? a.block) === name));
      break;
    }
    case 'prefix-diversity':
      result = ts.map((_, i) => new Set(ts.slice(0, i + 1)).size);
      break;
    case 'suffix-diversity':
      result = ts.map((_, i) => new Set(ts.slice(i)).size);
      break;
    case 'wait-share':
      result = (counts.wait ?? 0) / n;
      break;
    case 'collection-concentration': {
      const by = new Map();
      for (const a of actions.filter((a) => a.type === 'collect')) by.set(a.block, (by.get(a.block) ?? 0) + a.count);
      const total = sum([...by.values()]);
      result = total ? sum([...by.values()].map((v) => (v / total) ** 2)) : null;
      break;
    }
    case 'deposit-uncertainty': {
      const steps = positions((a) => a.type === 'deposit' && a.count === undefined);
      result = { steps, share: counts.deposit ? steps.length / counts.deposit : null };
      break;
    }
    case 'collection-pressure': {
      const balances = new Map(),
        peaks = new Map();
      for (const a of actions) {
        const name = a.block ?? a.item;
        if (!name) continue;
        if (!balances.has(name)) balances.set(name, 0);
        const old = balances.get(name);
        if ((a.type === 'deposit' || a.type === 'withdraw') && a.count === undefined) {
          balances.set(name, null);
          peaks.set(name, null);
        } else if (old !== null) {
          // Collection, withdrawal, and crafting add the named item; a deposit removes it.
          // A craft makes whole recipes, so it can add more than its requested minimum.
          const added = a.type === 'craft' ? craftsFor(RECIPES[a.item], a.count) * RECIPES[a.item].yield : a.count;
          const v = old + (a.type === 'deposit' ? -a.count : added);
          balances.set(name, v);
          if (peaks.get(name) !== null) peaks.set(name, Math.max(peaks.get(name) ?? 0, v));
        }
      }
      result = Object.fromEntries(peaks);
      break;
    }
    case 'wait-spacing':
    case 'inspection-spacing':
    case 'return-spacing': {
      const t = { 'wait-spacing': 'wait', 'inspection-spacing': 'inspect_storage', 'return-spacing': 'home' }[command];
      result = gaps(positions((a) => a.type === t)).map((v) => v - 1);
      break;
    }
    case 'type-coverage':
    case 'item-coverage': {
      const wanted = [...new Set(args.flat().map(command === 'type-coverage' ? check : item))];
      if (!wanted.length || wanted.length > 100) throw new Error('Give 1 to 100 targets.');
      const present = command === 'type-coverage' ? ts : actions.map((a) => a.block ?? a.item);
      const missing = wanted.filter((v) => !present.includes(v));
      result = { share: (wanted.length - missing.length) / wanted.length, missing };
      break;
    }
    case 'wait-quantiles':
    case 'collect-quantiles':
    case 'deposit-quantiles': {
      const t = command.split('-')[0];
      result = quantiles(
        actions.filter((a) => a.type === t && (a.seconds ?? a.count) !== undefined).map((a) => a.seconds ?? a.count),
      );
      break;
    }
    case 'goto-revisit': {
      const seen = new Map();
      result = [];
      actions.forEach((a, i) => {
        if (a.type !== 'goto') return;
        const key = `${a.x},${a.y},${a.z}`;
        if (seen.has(key)) result.push({ step: i + 1, previousStep: seen.get(key) });
        seen.set(key, i + 1);
      });
      break;
    }
    case 'vertical-reversals': {
      const ps = actions.filter((a) => a.type === 'goto'),
        signs = ps
          .slice(1)
          .map((a, i) => Math.sign(a.y - ps[i].y))
          .filter(Boolean);
      result = signs.slice(1).filter((v, i) => v !== signs[i]).length;
      break;
    }
    case 'step-cost': {
      if (typeof args[0] !== 'string') throw new Error('Give comma-separated type=cost pairs.');
      const costs = new Map();
      for (const entry of args[0].split(',')) {
        const parts = entry.split('=');
        if (parts.length !== 2 || costs.has(parts[0])) throw new Error('Invalid or duplicate cost.');
        costs.set(check(parts[0]), ledgerNumber(parts[1], 0, 1e9));
      }
      if (ts.some((t) => !costs.has(t))) throw new Error('Every used action type needs a cost.');
      const steps = ts.map((t) => costs.get(t));
      result = { steps, total: sum(steps) };
      break;
    }
    default:
      throw new Error(`Unknown routine metric: ${command}.`);
  }
  return {
    metric: command,
    result,
    note: 'Static requested actions only. Type statistics and supplied costs do not establish execution duration, world dependencies, inventory availability, or success.',
  };
}
export function registerRoutineMetricsTools(program, { print }) {
  const group = program
    .command('routine-metrics')
    .description('Offline routine statistics and supplied cost estimates.');
  for (const [signature, description] of ROUTINE_METRICS_COMMANDS)
    group
      .command(signature)
      .description(description)
      .action(async (file, ...values) =>
        print(routineMetricsReport(await loadRoutine(file), signature.split(' ')[0], values.slice(0, -2).flat())),
      );
  return group;
}
