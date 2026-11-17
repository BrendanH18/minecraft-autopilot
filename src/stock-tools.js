import {
  inventoryView,
  playerPosition,
  uniqueContainers,
  maxStackSize,
  freeSlotsView,
  FOOD_VALUES,
  itemName,
} from './cli-views.js';

const NOTE =
  'Estimates by item name only; components and stack restrictions can prevent merging. Storage is last observed and may be stale or incomplete. Plans do not move items.';
function number(value, min = 0, max = 1_000_000) {
  if (
    !/^\d+(?:\.\d+)?$/.test(String(value)) ||
    !Number.isFinite(Number(value)) ||
    Number(value) < min ||
    Number(value) > max
  )
    throw new Error(`Use a number from ${min} to ${max}.`);
  return Number(value);
}
function integer(value, min = 0) {
  const n = number(value, min);
  if (!Number.isSafeInteger(n)) throw new Error('Use an integer quantity.');
  return n;
}
export function parseStockKit(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 100)
    throw new Error('Give 1 to 100 item=count entries.');
  const seen = new Set();
  return values.map((value) => {
    const parts = String(value).split('=');
    if (parts.length !== 2) throw new Error('Use item=count entries, for example torch=32.');
    const name = itemName(parts[0]),
      count = integer(parts[1]);
    if (seen.has(name)) throw new Error(`Duplicate kit item: ${name}.`);
    seen.add(name);
    return { name, count };
  });
}
function names(values) {
  if (!values.length || values.length > 100) throw new Error('Give 1 to 100 item names.');
  return new Set(values.map(itemName));
}
const sum = (items) => items.reduce((n, item) => n + item.count, 0);
const aggregate = (stacks) => inventoryView({ inventory: stacks }).items;
const size = (item) => maxStackSize(item.name).maxStack;

export const STOCK_COMMANDS = [
  ['kit-check <entries...>', 'Check every carried quota in an item=count kit.'],
  ['kit-restock <entries...>', 'Allocate observed storage withdrawals to fill a carried kit.'],
  ['kit-deposit <entries...>', 'Plan deposits of everything above a retained kit.'],
  ['kit-capacity <entries...>', 'Estimate shared inventory space for a multi-item addition.'],
  ['kit-trips <entries...>', 'Estimate empty-inventory trips for a multi-item manifest.'],
  ['kit-scale <factor> <entries...>', 'Multiply kit quantities, rounding up to whole items.'],
  ['composition', 'Show each item quantity as a share of carried items.'],
  ['slot-pressure', 'Rank items by occupied observed inventory stacks.'],
  ['stack-histogram', 'Count stacks grouped by their current quantity.'],
  ['least-stocked <limit>', 'List the smallest carried item totals first.'],
  ['count-range <minimum> <maximum>', 'Find carried item totals in an inclusive range.'],
  ['only <items...>', 'Select a set of exact carried item names.'],
  ['exclude <items...>', 'Exclude a set of exact carried item names.'],
  ['families', 'Group carried quantities by the final underscore name component.'],
  ['food-portions <hunger>', 'Estimate complete hunger budgets covered by listed food.'],
  ['food-duration <hunger-per-hour>', 'Estimate hours of food at an explicit hunger-use rate.'],
  ['storage-only', 'Find observed stored item types absent from inventory.'],
  ['carried-only', 'Find carried item types absent from observed storage.'],
  ['shared-stock', 'Find item types present both carried and stored.'],
  ['storage-balance', 'Compare carried and stored shares of each item type.'],
  ['container-diversity', 'Rank opened containers by distinct positive item types.'],
  ['storage-within <radius>', 'Total observed stored items inside a radius.'],
  ['storage-older <seconds>', 'Find opened containers with old or unknown observation times.'],
  ['source-plan <item> <count>', 'Allocate a requested quantity across nearest known containers.'],
  ['stack-fill <percent>', 'Find carried stacks at or below a percentage of estimated capacity.'],
];

/** Pure reports over one observation; never takes control or opens a container. */
export function stockReport(state, command, args = [], { now = Date.now() } = {}) {
  const position = playerPosition(state);
  const items = inventoryView(state).items,
    stacks = (state.inventory || []).filter((item) => item.count > 0);
  const containers = uniqueContainers(state.containers),
    opened = containers.filter((c) => Array.isArray(c.items));
  const stored = aggregate(opened.flatMap((c) => c.items));
  const count = (list, name) => list.find((item) => item.name === name)?.count ?? 0;
  const distance = (c) => Math.hypot(c.x - position.x, c.y - position.y, c.z - position.z);
  const located = (c) => ({ x: c.x, y: c.y, z: c.z, distance: distance(c) });
  const storage = (result) => ({
    supported: Array.isArray(state.containers),
    contents: 'last_observed',
    unopened: containers.length - opened.length,
    ...result,
  });
  const kitStatus = (kit) =>
    kit.map((item) => ({
      ...item,
      carried: count(items, item.name),
      missing: Math.max(0, item.count - count(items, item.name)),
    }));
  const allocate = (name, requested) => {
    let remaining = requested;
    const sources = [];
    for (const c of [...opened].sort((a, b) => distance(a) - distance(b))) {
      const available = count(aggregate(c.items), name),
        take = Math.min(remaining, available);
      if (take > 0) sources.push({ ...located(c), available, take });
      remaining -= take;
    }
    return { name, requested, sources, missing: remaining };
  };
  let result;
  switch (command) {
    case 'kit-check': {
      const quotas = kitStatus(parseStockKit(args));
      result = { quotas, satisfied: quotas.every((item) => !item.missing) };
      break;
    }
    case 'kit-restock':
      result = storage({
        items: kitStatus(parseStockKit(args)).map((item) => ({ ...item, ...allocate(item.name, item.missing) })),
      });
      break;
    case 'kit-deposit': {
      const kit = parseStockKit(args);
      result = {
        items: items
          .map((item) => ({
            ...item,
            keep: count(kit, item.name),
            deposit: Math.max(0, item.count - count(kit, item.name)),
          }))
          .filter((item) => item.deposit > 0),
      };
      break;
    }
    case 'kit-capacity': {
      const kit = parseStockKit(args),
        free = freeSlotsView(state).free;
      const additions = kit.map((item) => {
        const partialRoom = stacks
          .filter((s) => s.name === item.name)
          .reduce((n, s) => n + Math.max(0, size(s) - s.count), 0);
        return { ...item, partialRoom, newSlots: Math.ceil(Math.max(0, item.count - partialRoom) / size(item)) };
      });
      const neededSlots = additions.reduce((n, item) => n + item.newSlots, 0);
      result = {
        items: additions,
        freeSlots: free,
        neededSlots,
        fitsEstimate: neededSlots <= free,
        slotShortfall: Math.max(0, neededSlots - free),
      };
      break;
    }
    case 'kit-trips': {
      const kit = parseStockKit(args);
      const slots = kit.reduce((n, item) => n + Math.ceil(item.count / size(item)), 0);
      result = { items: kit, slots, emptyInventoryTrips: Math.ceil(slots / 36) };
      break;
    }
    case 'kit-scale': {
      const factor = number(args[0]);
      const kit = parseStockKit(args.slice(1));
      result = {
        factor,
        items: kit.map((item) => ({ name: item.name, count: integer(Math.ceil(item.count * factor)) })),
      };
      break;
    }
    case 'composition': {
      const total = sum(items);
      result = { total, items: items.map((item) => ({ ...item, share: item.count / total })) };
      break;
    }
    case 'slot-pressure':
      result = {
        stacks: stacks.length,
        items: items
          .map((item) => ({
            ...item,
            stacks: stacks.filter((s) => s.name === item.name).length,
            stackShare: stacks.filter((s) => s.name === item.name).length / stacks.length,
          }))
          .sort((a, b) => b.stacks - a.stacks || a.name.localeCompare(b.name)),
      };
      break;
    case 'stack-histogram': {
      const counts = new Map();
      for (const s of stacks) counts.set(s.count, (counts.get(s.count) ?? 0) + 1);
      result = { quantities: [...counts].sort(([a], [b]) => a - b).map(([count, stacks]) => ({ count, stacks })) };
      break;
    }
    case 'least-stocked':
      result = {
        items: [...items]
          .sort((a, b) => a.count - b.count || a.name.localeCompare(b.name))
          .slice(0, integer(args[0], 1)),
      };
      break;
    case 'count-range': {
      const min = integer(args[0]),
        max = integer(args[1], min);
      result = { minimum: min, maximum: max, items: items.filter((item) => item.count >= min && item.count <= max) };
      break;
    }
    case 'only':
    case 'exclude': {
      const selected = names(args);
      result = { items: items.filter((item) => selected.has(item.name) === (command === 'only')) };
      break;
    }
    case 'families': {
      const counts = new Map();
      for (const item of items) {
        const family = item.name.split(':').at(-1).split('_').at(-1);
        counts.set(family, (counts.get(family) ?? 0) + item.count);
      }
      result = {
        families: [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([family, count]) => ({ family, count })),
        classification: 'Item-name suffix only; not a recipe or material classification.',
      };
      break;
    }
    case 'food-portions':
    case 'food-duration': {
      const budget = number(args[0], 0.000001);
      const hunger = items.reduce(
        (n, item) => n + item.count * (FOOD_VALUES[item.name.replace(/^minecraft:/, '')] ?? 0),
        0,
      );
      result =
        command === 'food-portions'
          ? { hungerPerPortion: budget, totalHunger: hunger, completePortions: Math.floor(hunger / budget) }
          : { hungerPerHour: budget, totalHunger: hunger, hoursEstimate: hunger / budget };
      result.foodNote =
        'Supported food table only; saturation, effects, and hunger lost to overfeeding are not modeled.';
      break;
    }
    case 'storage-only':
      result = storage({ items: stored.filter((item) => !count(items, item.name)) });
      break;
    case 'carried-only':
      result = storage({ items: items.filter((item) => !count(stored, item.name)) });
      break;
    case 'shared-stock':
      result = storage({
        items: items
          .filter((item) => count(stored, item.name))
          .map((item) => ({ name: item.name, carried: item.count, stored: count(stored, item.name) })),
      });
      break;
    case 'storage-balance':
      result = storage({
        items: [...new Set([...items, ...stored].map((item) => item.name))].sort().map((name) => {
          const carried = count(items, name),
            inStorage = count(stored, name);
          return {
            name,
            carried,
            stored: inStorage,
            total: carried + inStorage,
            carriedShare: carried / (carried + inStorage),
          };
        }),
      });
      break;
    case 'container-diversity':
      result = storage({
        containers: opened
          .map((c) => ({ ...located(c), distinctItems: aggregate(c.items).length, total: sum(aggregate(c.items)) }))
          .sort((a, b) => b.distinctItems - a.distinctItems || a.distance - b.distance),
      });
      break;
    case 'storage-within': {
      const radius = number(args[0]);
      const selected = opened.filter((c) => distance(c) <= radius);
      result = storage({
        radius,
        containersInRadius: selected.length,
        items: aggregate(selected.flatMap((c) => c.items)),
      });
      break;
    }
    case 'storage-older': {
      const seconds = number(args[0]);
      if (!Number.isFinite(now)) throw new Error('Current time must be finite.');
      result = storage({
        seconds,
        containers: opened
          .filter((c) => !Number.isFinite(c.observedAt) || now - c.observedAt >= seconds * 1000)
          .map((c) => ({
            ...located(c),
            ageSeconds: Number.isFinite(c.observedAt) ? (now - c.observedAt) / 1000 : null,
          })),
      });
      break;
    }
    case 'source-plan':
      result = storage(allocate(itemName(args[0]), integer(args[1], 1)));
      break;
    case 'stack-fill': {
      const percent = number(args[0], 0, 100);
      result = {
        percent,
        stacks: stacks
          .map((s) => ({ ...s, estimatedMaxStack: size(s), fillPercent: (s.count / size(s)) * 100 }))
          .filter((s) => s.fillPercent <= percent),
      };
      break;
    }
    default:
      throw new Error(`Unknown stock report: ${command}.`);
  }
  return { ...result, note: NOTE };
}

export function registerStockTools(program, { view }) {
  const group = program.command('stock').description('Read-only multi-item kit and stock planning; never moves items.');
  for (const [signature, description] of STOCK_COMMANDS) {
    const name = signature.split(' ')[0];
    group
      .command(signature)
      .description(description)
      .action((...values) => {
        const args = values.slice(0, -2).flat();
        return view((state) => stockReport(state, name, args));
      });
  }
  return group;
}
