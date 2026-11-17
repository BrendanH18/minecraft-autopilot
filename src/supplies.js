import { COLLECTIBLE_BLOCKS } from './objective.js';
import {
  inventoryView,
  itemName,
  playerPosition,
  foodView,
  freeSlotsView,
  maxStackSize,
  uniqueContainers,
  distanceTo,
} from './cli-views.js';

const short = (name) => name.replace(/^minecraft:/, '');
const tool = (name) =>
  /_(?:sword|pickaxe|axe|shovel|hoe)$/.test(name) ||
  /^(?:bow|crossbow|trident|shield|shears|fishing_rod|flint_and_steel)$/.test(short(name));
const armor = (name) => /_(?:helmet|chestplate|leggings|boots)$/.test(name) || short(name) === 'elytra';
const counts = (stacks) => inventoryView({ inventory: stacks }).items;
const total = (stacks) => stacks.reduce((sum, stack) => sum + stack.count, 0);
const quantity = (value, minimum = 1) => {
  const number = Number(value);
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(number) || number < minimum || number > 1_000_000)
    throw new Error(`Count must be an integer from ${minimum} to 1000000.`);
  return number;
};
const storageNote =
  'Contents are last observed, may be stale, and omit unopened containers and containers outside the backend observation.';
const packingNote =
  'Estimate by item name only; components, enchantments, and other stack restrictions can prevent merging.';

export const supplyCommands = [
  ['overview', 'Summarize item diversity and inventory occupancy.'],
  ['ranked [limit]', 'Rank carried items by quantity (default 10).'],
  ['matching <text>', 'Search carried item names by substring.'],
  ['stacks <item>', 'Locate every carried stack of an item.'],
  ['need <item> <count>', 'Calculate an inventory quota shortage.'],
  ['reserve <item> <count>', 'Calculate the quantity above a carried reserve.'],
  ['capacity <item> <count>', 'Estimate whether an additional quantity fits.'],
  ['packing <item> <count>', 'Estimate stack count for a planned quantity.'],
  ['tools', 'List carried tools and weapons by item name.'],
  ['armor', 'List carried armor and elytra by item name.'],
  ['food-ranked', 'Rank supported foods by hunger restored per item.'],
  ['meal <target>', 'Compare single supported meals for a hunger target.'],
  ['collectables', 'List carried materials supported by collection actions.'],
  ['deposit-plan <item> <keep>', 'Plan a deposit while keeping a carried reserve.'],
  ['storage-health', 'Report opened, unopened, and observed-empty containers.'],
  ['storage-matching <text>', 'Search names in last-observed storage contents.'],
  ['storage-need <item> <count>', 'Calculate a quota shortage using carried and known stored items.'],
  ['storage-richest <item>', 'Rank observed containers by quantity of an item.'],
  ['storage-empty', 'Locate containers last observed empty.'],
  ['storage-unopened', 'Locate containers whose contents are unknown.'],
  ['storage-spread <item>', 'Measure how many observed containers hold an item.'],
  ['compare <first> <second>', 'Compare carried quantities of two items.'],
  ['nonstackable', 'List carried items estimated to have stack size one.'],
  ['partial-stacks', 'List carried stacks below their estimated maximum.'],
  ['consolidation', 'Estimate slot savings from merging stacks by item name.'],
];

/** All reports use one observation and never acquire control or inspect a container. */
export function suppliesReport(state, command, args = []) {
  playerPosition(state);
  const items = inventoryView(state).items;
  const stacks = (state.inventory || []).filter((stack) => stack.count > 0);
  const count = (name) => items.find((item) => item.name === name)?.count || 0;
  const named = () => itemName(args[0]);
  const requested = (minimum = 1) => quantity(args[1], minimum);
  const known = uniqueContainers(state.containers);
  const opened = known.filter((container) => Array.isArray(container.items));
  const storage = (extra) => ({
    supported: Array.isArray(state.containers),
    contents: 'last_observed',
    note: storageNote,
    ...extra,
  });
  const located = (containers) =>
    containers.map((container) => ({
      name: container.name ?? null,
      x: container.x,
      y: container.y,
      z: container.z,
      distance: distanceTo(state, container).distance,
      observedAt: container.observedAt ?? null,
    }));
  const storedMatches = (name) =>
    opened
      .map((container) => ({
        ...located([container])[0],
        count: total((container.items || []).filter((item) => item.count > 0 && item.name === name)),
      }))
      .filter((container) => container.count > 0)
      .sort((a, b) => b.count - a.count || a.distance - b.distance);
  const match = (input) => {
    const text = String(input || '');
    if (!/^[a-z0-9_:]{1,100}$/.test(text))
      throw new Error('Search text must contain 1–100 lowercase letters, digits, underscores, or colons.');
    return text;
  };
  switch (command) {
    case 'overview':
      return { ...inventoryView(state), distinctItems: items.length, ...freeSlotsView(state) };
    case 'ranked':
      return {
        items: [...items]
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
          .slice(0, args[0] === undefined ? 10 : quantity(args[0])),
        distinctItems: items.length,
      };
    case 'matching': {
      const text = match(args[0]);
      return { text, items: items.filter((item) => item.name.includes(text)) };
    }
    case 'stacks': {
      const item = named();
      return {
        item,
        total: count(item),
        stacks: stacks
          .filter((stack) => stack.name === item)
          .map((stack) => ({ slot: stack.slot ?? null, count: stack.count })),
      };
    }
    case 'need': {
      const item = named(),
        target = requested(),
        carried = count(item);
      return { item, target, carried, missing: Math.max(0, target - carried), satisfied: carried >= target };
    }
    case 'reserve': {
      const item = named(),
        reserve = requested(0),
        carried = count(item);
      return {
        item,
        reserve,
        carried,
        surplus: Math.max(0, carried - reserve),
        reserveShortfall: Math.max(0, reserve - carried),
      };
    }
    case 'capacity': {
      const item = named(),
        additional = requested(),
        capacity = freeSlotsView(state, { item });
      return {
        ...capacity,
        additional,
        fitsEstimate: additional <= capacity.room,
        overflow: Math.max(0, additional - capacity.room),
        note: packingNote,
      };
    }
    case 'packing': {
      const item = named(),
        count = requested(),
        size = maxStackSize(item);
      return {
        item,
        count,
        ...size,
        stacks: Math.ceil(count / size.maxStack),
        finalStack: ((count - 1) % size.maxStack) + 1,
        note: packingNote,
      };
    }
    case 'tools':
      return {
        items: items.filter((item) => tool(item.name)),
        note: 'Classification by item name; durability and equipment state are not observed.',
      };
    case 'armor':
      return {
        items: items.filter((item) => armor(item.name)),
        note: 'Carried inventory only; equipped armor may not be included by the backend.',
      };
    case 'food-ranked':
      return {
        ...foodView(state),
        items: foodView(state).items.sort((a, b) => b.hungerEach - a.hungerEach || a.name.localeCompare(b.name)),
      };
    case 'meal': {
      const target = quantity(args[0]);
      if (target > 20) throw new Error('Hunger target must be from 1 to 20.');
      const food = foodView(state);
      if (!Number.isFinite(food.hunger)) return { target, hunger: null, meals: [], reason: 'Hunger is unavailable.' };
      return {
        target,
        hunger: food.hunger,
        satisfied: food.hunger >= target,
        meals: food.items
          .map((item) => ({
            name: item.name,
            hungerAfter: Math.min(20, food.hunger + item.hungerEach),
            reachesTarget: Math.min(20, food.hunger + item.hungerEach) >= target,
            wastedHunger: Math.max(0, food.hunger + item.hungerEach - 20),
          }))
          .sort(
            (a, b) =>
              Number(b.reachesTarget) - Number(a.reachesTarget) ||
              a.wastedHunger - b.wastedHunger ||
              a.name.localeCompare(b.name),
          ),
        note: 'Single-meal comparison; saturation and effects are not modeled.',
      };
    }
    case 'collectables':
      return { items: items.filter((item) => COLLECTIBLE_BLOCKS.some((block) => item.name === `minecraft:${block}`)) };
    case 'deposit-plan': {
      const item = named(),
        keep = requested(0),
        carried = count(item);
      return {
        item,
        keep,
        carried,
        deposit: Math.max(0, carried - keep),
        note: 'Plan only; no container capacity or reachability guarantee.',
      };
    }
    case 'storage-health':
      return storage({
        known: known.length,
        opened: opened.length,
        unopened: known.length - opened.length,
        observedEmpty: opened.filter((container) => !container.items.some((item) => item.count > 0)).length,
      });
    case 'storage-matching': {
      const text = match(args[0]);
      return storage({
        text,
        items: counts(opened.flatMap((container) => container.items)).filter((item) => item.name.includes(text)),
      });
    }
    case 'storage-need': {
      const item = named(),
        target = requested(),
        carried = count(item),
        stored = total(storedMatches(item)),
        available = carried + stored;
      return storage({
        item,
        target,
        carried,
        stored,
        available,
        missing: Math.max(0, target - available),
        observedQuotaMet: available >= target,
      });
    }
    case 'storage-richest': {
      const item = named();
      return storage({ item, containers: storedMatches(item) });
    }
    case 'storage-empty':
      return storage({
        containers: located(opened.filter((container) => !container.items.some((item) => item.count > 0))).sort(
          (a, b) => a.distance - b.distance,
        ),
      });
    case 'storage-unopened':
      return storage({
        containers: located(known.filter((container) => !Array.isArray(container.items))).sort(
          (a, b) => a.distance - b.distance,
        ),
      });
    case 'storage-spread': {
      const item = named(),
        containers = storedMatches(item);
      return storage({
        item,
        containersHolding: containers.length,
        total: total(containers),
        largestShare: containers.length ? containers[0].count / total(containers) : null,
      });
    }
    case 'compare': {
      const first = itemName(args[0]),
        second = itemName(args[1]);
      return {
        first: { item: first, count: count(first) },
        second: { item: second, count: count(second) },
        difference: count(first) - count(second),
        ratio: count(second) ? count(first) / count(second) : null,
      };
    }
    case 'nonstackable':
      return { items: items.filter((item) => maxStackSize(item.name).maxStack === 1), note: packingNote };
    case 'partial-stacks':
      return {
        stacks: stacks
          .map((stack) => ({
            name: stack.name,
            slot: stack.slot ?? null,
            count: stack.count,
            ...maxStackSize(stack.name),
          }))
          .filter((stack) => stack.count < stack.maxStack)
          .map((stack) => ({ ...stack, remaining: stack.maxStack - stack.count })),
        note: packingNote,
      };
    case 'consolidation': {
      const estimates = items.map((item) => {
        const size = maxStackSize(item.name),
          occupied = stacks.filter((stack) => stack.name === item.name).length;
        return {
          ...item,
          ...size,
          occupied,
          minimumSlots: Math.ceil(item.count / size.maxStack),
          potentiallyFreed: Math.max(0, occupied - Math.ceil(item.count / size.maxStack)),
        };
      });
      return {
        items: estimates,
        potentiallyFreed: estimates.reduce((sum, item) => sum + item.potentiallyFreed, 0),
        note: packingNote,
      };
    }
    default:
      throw new Error(`Unknown supplies report: ${command}.`);
  }
}

export function registerSupplies(program, { view }) {
  const group = program
    .command('supplies')
    .description('Read-only inventory and last-observed storage planning reports.');
  for (const [signature, description] of supplyCommands) {
    const name = signature.split(' ')[0];
    group
      .command(signature)
      .description(description)
      .action((...values) => view((state) => suppliesReport(state, name, values.slice(0, -2))));
  }
  return group;
}
