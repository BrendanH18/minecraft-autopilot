import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { parseSnapshot, itemName, FOOD_VALUES, maxStackSize } from './cli-views.js';
import { parseStockKit } from './stock-tools.js';
import { navNumber } from './navigation.js';

const NOTE =
  'Two saved observations only. Net changes do not establish collection, consumption, transfers, or task success. Food uses supported hunger values; stack estimates ignore components and merging restrictions. Missing evidence is null.';
export const SNAPSHOT_BYTES = 10 * 1024 * 1024;
export async function readLedgerSnapshot(path) {
  const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > SNAPSHOT_BYTES)
      throw new Error('Snapshot must be a regular file of at most 10 MiB.');
    const buffer = Buffer.alloc(SNAPSHOT_BYTES + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead > SNAPSHOT_BYTES) throw new Error('Snapshot must be at most 10 MiB.');
    const raw = JSON.parse(buffer.subarray(0, bytesRead).toString('utf8'));
    parseSnapshot(JSON.stringify(raw));
    return raw;
  } finally {
    await file.close();
  }
}
export function ledgerNumber(value, min = 0, max = 1_000_000, integer = false) {
  const n = navNumber(value);
  if (n < min || n > max || (integer && !Number.isSafeInteger(n)))
    throw new Error(`Use ${integer ? 'an integer' : 'a number'} from ${min} to ${max}.`);
  return n;
}
export function ledgerItems(value) {
  if (value === undefined) return null;
  if (!Array.isArray(value) || value.length > 1000)
    throw new Error('Item evidence must be an array of at most 1000 records.');
  const map = new Map();
  for (const row of value) {
    if (!row || typeof row !== 'object') throw new Error('Invalid item record.');
    const name = itemName(row.name),
      n = row.count;
    if (!Number.isSafeInteger(n) || n < 0) throw new Error('Item counts must be nonnegative safe integers.');
    const total = (map.get(name) ?? 0) + n;
    if (!Number.isSafeInteger(total)) throw new Error('Item total exceeds safe integer precision.');
    if (total > 1_000_000_000) throw new Error('Item quantity exceeds the supported one-billion-item evidence bound.');
    if (total) map.set(name, total);
  }
  const aggregate = [...map.values()].reduce((n, v) => n + v, 0);
  if (!Number.isSafeInteger(aggregate)) throw new Error('Total exceeds safe integer precision.');
  if (aggregate > 1_000_000_000) throw new Error('Item total exceeds the supported one-billion-item evidence bound.');
  return map;
}
export function ledgerPair(before, after) {
  const a = parseSnapshot(JSON.stringify(before)),
    b = parseSnapshot(JSON.stringify(after));
  const seconds = (Date.parse(b.savedAt) - Date.parse(a.savedAt)) / 1000;
  if (seconds <= 0) throw new Error('After snapshot must be later than before snapshot.');
  return { a, b, seconds };
}
const hungerEach = (name) => (Object.hasOwn(FOOD_VALUES, name.slice(10)) ? FOOD_VALUES[name.slice(10)] : 0);
export const ledgerHunger = (map) => [...map].reduce((n, [name, count]) => n + count * hungerEach(name), 0);
export const ledgerStacks = (map) =>
  [...map].reduce((n, [name, count]) => n + Math.ceil(count / maxStackSize(name).maxStack), 0);
const sum = (map) => [...map.values()].reduce((n, v) => n + v, 0);
const rows = (a, b) =>
  [...new Set([...a.keys(), ...b.keys()])]
    .sort()
    .map((name) => ({
      name,
      before: a.get(name) ?? 0,
      after: b.get(name) ?? 0,
      delta: (b.get(name) ?? 0) - (a.get(name) ?? 0),
    }));
function allowed(values) {
  if (!values.length || values.length > 100) throw new Error('Give 1 to 100 item names.');
  return new Set(values.map(itemName));
}

export const LEDGER_COMMANDS = [
  ['item-percent <before> <after> <item>', 'Report percent quantity change; a zero baseline has no percentage.'],
  ['composition-shift <before> <after>', 'Compare item shares of each inventory total.'],
  ['new-types <before> <after>', 'Find item types newly present in carried stock.'],
  ['vanished-types <before> <after>', 'Find previously carried types absent from the later inventory.'],
  ['retained-stock <before> <after>', 'Calculate quantity shared by both recorded inventories.'],
  ['replacement-load <before> <after>', 'Measure unmatched outgoing and incoming quantities.'],
  ['quota-progress <before> <after> <item> <target>', 'Compare the remaining shortfall to one carried quota.'],
  ['quota-crossings <before> <after> <entries...>', 'Find item quotas crossed upward or downward.'],
  ['kit-regressions <before> <after> <entries...>', 'Find kit shortfalls that grew.'],
  ['kit-progress <before> <after> <entries...>', 'Compare total capped progress toward a kit.'],
  ['kit-bundles <before> <after> <entries...>', 'Compare complete kit bundle counts.'],
  ['food-change <before> <after>', 'Compare supported carried hunger reserves.'],
  ['food-mix <before> <after>', 'Compare hunger contribution shares by food type.'],
  ['ration-change <before> <after> <hunger-per-day>', 'Compare estimated ration days at an explicit hunger demand.'],
  ['minimum-stacks <before> <after>', 'Compare minimum consolidated stack estimates.'],
  ['item-stacks <before> <after> <item>', 'Compare consolidated full and partial stacks for one item.'],
  ['stack-pressure <before> <after> <slot-budget>', 'Compare minimum-stack pressure against a slot budget.'],
  [
    'packing-room <before> <after> <item> <reserved-slots>',
    'Compare theoretical additional capacity after consolidation and reserved slots.',
  ],
  ['loss-budget <before> <after> <entries...>', 'Check observed item losses against per-item budgets.'],
  ['gain-budget <before> <after> <entries...>', 'Check observed item gains against per-item ceilings.'],
  ['allowed-losses <before> <after> <items...>', 'Find losses outside an explicit item allowlist.'],
  ['unchanged-except <before> <after> <items...>', 'Find quantity changes outside explicitly permitted item types.'],
  ['share-shift <before> <after> <item>', 'Measure one item share change in percentage points.'],
  ['type-similarity <before> <after>', 'Measure Jaccard similarity of carried item-type sets.'],
  ['quantity-similarity <before> <after>', 'Measure weighted Jaccard similarity using item quantities.'],
];

export function ledgerReport(before, after, command, args = []) {
  const { a: first, b: last, seconds } = ledgerPair(before, after);
  const a = ledgerItems(before.inventory),
    b = ledgerItems(after.inventory),
    known = a !== null && b !== null;
  const items = known ? rows(a, b) : null,
    totalA = known ? sum(a) : null,
    totalB = known ? sum(b) : null;
  const change = (x, y) => ({ before: x, after: y, delta: x === null || y === null ? null : y - x });
  const item = (name) =>
    known
      ? (items.find((i) => i.name === name) ?? { name, before: 0, after: 0, delta: 0 })
      : { name, before: null, after: null, delta: null };
  const kitRows = (values) =>
    parseStockKit(values).map((q) => {
      const i = item(q.name);
      return {
        ...q,
        beforeMissing: known ? Math.max(0, q.count - i.before) : null,
        afterMissing: known ? Math.max(0, q.count - i.after) : null,
        ...i,
      };
    });
  let result;
  switch (command) {
    case 'item-percent': {
      const i = item(itemName(args[0]));
      result = { ...i, percent: known && i.before ? (i.delta / i.before) * 100 : null };
      break;
    }
    case 'composition-shift':
      result = {
        items: known
          ? items.map((i) => ({
              ...i,
              beforeShare: totalA ? i.before / totalA : null,
              afterShare: totalB ? i.after / totalB : null,
            }))
          : null,
      };
      break;
    case 'new-types':
      result = { items: items?.filter((i) => i.before === 0 && i.after > 0) ?? null };
      break;
    case 'vanished-types':
      result = { items: items?.filter((i) => i.before > 0 && i.after === 0) ?? null };
      break;
    case 'retained-stock':
      result = {
        items:
          items
            ?.filter((i) => i.before && i.after)
            .map((i) => ({ name: i.name, retained: Math.min(i.before, i.after) })) ?? null,
        retained: known ? items.reduce((n, i) => n + Math.min(i.before, i.after), 0) : null,
      };
      break;
    case 'replacement-load':
      result = {
        outgoing: known ? items.reduce((n, i) => n + Math.max(0, -i.delta), 0) : null,
        incoming: known ? items.reduce((n, i) => n + Math.max(0, i.delta), 0) : null,
      };
      break;
    case 'quota-progress': {
      const name = itemName(args[0]),
        target = ledgerNumber(args[1], 0, 1_000_000, true),
        i = item(name);
      result = {
        ...i,
        target,
        beforeMissing: known ? Math.max(0, target - i.before) : null,
        afterMissing: known ? Math.max(0, target - i.after) : null,
      };
      break;
    }
    case 'quota-crossings': {
      const quotas = kitRows(args);
      result = {
        quotas: known
          ? quotas
              .filter((i) => i.before >= i.count !== i.after >= i.count)
              .map((i) => ({ ...i, direction: i.after >= i.count ? 'up' : 'down' }))
          : null,
      };
      break;
    }
    case 'kit-regressions': {
      const quotas = kitRows(args);
      result = { quotas: known ? quotas.filter((i) => i.afterMissing > i.beforeMissing) : null };
      break;
    }
    case 'kit-progress': {
      const quotas = kitRows(args),
        required = quotas.reduce((n, q) => n + q.count, 0);
      result = {
        required,
        ...change(
          known ? quotas.reduce((n, q) => n + Math.min(q.count, q.before), 0) : null,
          known ? quotas.reduce((n, q) => n + Math.min(q.count, q.after), 0) : null,
        ),
      };
      break;
    }
    case 'kit-bundles': {
      const quotas = kitRows(args).filter((q) => q.count > 0);
      if (!quotas.length) throw new Error('A bundle needs a positive quota.');
      result = change(
        known ? Math.min(...quotas.map((q) => Math.floor(q.before / q.count))) : null,
        known ? Math.min(...quotas.map((q) => Math.floor(q.after / q.count))) : null,
      );
      break;
    }
    case 'food-change':
      result = change(known ? ledgerHunger(a) : null, known ? ledgerHunger(b) : null);
      break;
    case 'food-mix': {
      const x = known ? ledgerHunger(a) : null,
        y = known ? ledgerHunger(b) : null;
      result = {
        items: known
          ? items
              .filter((i) => hungerEach(i.name))
              .map((i) => ({
                name: i.name,
                ...change(i.before * hungerEach(i.name), i.after * hungerEach(i.name)),
                beforeShare: x ? (i.before * hungerEach(i.name)) / x : null,
                afterShare: y ? (i.after * hungerEach(i.name)) / y : null,
              }))
          : null,
      };
      break;
    }
    case 'ration-change': {
      const demand = ledgerNumber(args[0], 0.000001);
      result = {
        hungerPerDay: demand,
        ...change(known ? ledgerHunger(a) / demand : null, known ? ledgerHunger(b) / demand : null),
      };
      break;
    }
    case 'minimum-stacks':
      result = change(known ? ledgerStacks(a) : null, known ? ledgerStacks(b) : null);
      break;
    case 'item-stacks': {
      const i = item(itemName(args[0])),
        sizing = maxStackSize(i.name);
      const pack = (n) =>
        known
          ? {
              full: Math.floor(n / sizing.maxStack),
              remainder: n % sizing.maxStack,
              stacks: Math.ceil(n / sizing.maxStack),
            }
          : null;
      result = { name: i.name, ...sizing, before: pack(i.before), after: pack(i.after) };
      break;
    }
    case 'stack-pressure': {
      const budget = ledgerNumber(args[0], 0, 36, true),
        x = known ? ledgerStacks(a) : null,
        y = known ? ledgerStacks(b) : null;
      result = {
        slotBudget: budget,
        beforeExcess: known ? Math.max(0, x - budget) : null,
        afterExcess: known ? Math.max(0, y - budget) : null,
        ...change(x, y),
      };
      break;
    }
    case 'packing-room': {
      const name = itemName(args[0]),
        reserved = ledgerNumber(args[1], 0, 36, true),
        sizing = maxStackSize(name);
      const capacity = (m) => {
        const occupied = ledgerStacks(m),
          n = m.get(name) ?? 0;
        if (occupied + reserved > 36) return null;
        return (
          (36 - reserved - occupied) * sizing.maxStack +
          (n ? (sizing.maxStack - (n % sizing.maxStack)) % sizing.maxStack : 0)
        );
      };
      result = {
        name,
        reservedSlots: reserved,
        ...sizing,
        ...change(known ? capacity(a) : null, known ? capacity(b) : null),
      };
      break;
    }
    case 'loss-budget':
    case 'gain-budget': {
      const budgets = parseStockKit(args).map((q) => {
        const i = item(q.name),
          observed = known ? Math.max(0, command === 'loss-budget' ? -i.delta : i.delta) : null;
        return { name: q.name, budget: q.count, observed, withinBudget: known ? observed <= q.count : null };
      });
      result = { budgets, passes: known ? budgets.every((q) => q.withinBudget) : null };
      break;
    }
    case 'allowed-losses':
    case 'unchanged-except': {
      const names = allowed(args),
        unexpected = known
          ? items.filter((i) => !names.has(i.name) && (command === 'allowed-losses' ? i.delta < 0 : i.delta !== 0))
          : null;
      result = { unexpected, passes: known ? unexpected.length === 0 : null };
      break;
    }
    case 'share-shift': {
      const i = item(itemName(args[0])),
        x = known && totalA ? (i.before / totalA) * 100 : null,
        y = known && totalB ? (i.after / totalB) * 100 : null;
      result = { name: i.name, percentagePoints: change(x, y) };
      break;
    }
    case 'type-similarity': {
      const intersection = known ? items.filter((i) => i.before && i.after).length : null;
      result = {
        intersection,
        union: known ? items.length : null,
        similarity: known ? (items.length ? intersection / items.length : 1) : null,
      };
      break;
    }
    case 'quantity-similarity': {
      const intersection = known ? items.reduce((n, i) => n + Math.min(i.before, i.after), 0) : null,
        union = known ? items.reduce((n, i) => n + Math.max(i.before, i.after), 0) : null;
      result = { intersection, union, similarity: known ? (union ? intersection / union : 1) : null };
      break;
    }
    default:
      throw new Error(`Unknown ledger command: ${command}.`);
  }
  return { from: first.savedAt, to: last.savedAt, seconds, known, ...result, note: NOTE };
}

export function registerLedgerTools(program, { print }) {
  const group = program.command('ledger').description('Offline inventory comparisons between two saved snapshots.');
  for (const [signature, description] of LEDGER_COMMANDS) {
    const command = signature.split(' ')[0];
    group
      .command(signature)
      .description(description)
      .action(async (...values) => {
        const [before, after, ...args] = values.slice(0, -2);
        const [a, b] = await Promise.all([readLedgerSnapshot(before), readLedgerSnapshot(after)]);
        print(ledgerReport(a, b, command, args.flat()));
      });
  }
  return group;
}
