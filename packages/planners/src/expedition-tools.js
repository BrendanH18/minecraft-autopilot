import {
  inventoryView,
  playerPosition,
  uniqueContainers,
  FOOD_VALUES,
  maxStackSize,
  freeSlotsView,
  itemName,
} from '../../../src/cli-views.js';
import { navNumber, navPoint } from './navigation.js';
import { parseStockKit } from './stock-tools.js';

const NOTE =
  'Planning estimates only; no actions or refreshes. Speeds, work times, rates, yields, and fuel values are supplied by you. Straight-line travel ignores terrain and hazards. Food ignores saturation, effects, and waste. Stack capacity ignores components and restrictions. Storage is last observed and may be incomplete or stale.';
const axes = ['x', 'y', 'z'];
const distance = (a, b) => Math.hypot(...axes.map((k) => a[k] - b[k]));
function number(value, min = 0, max = 1_000_000, integer = false) {
  const n = navNumber(value);
  if (n < min || n > max || (integer && !Number.isSafeInteger(n)))
    throw new Error(`Use ${integer ? 'an integer' : 'a number'} from ${min} to ${max}.`);
  return n;
}
const positive = (v) => number(v, 0.000001);
const count = (v) => number(v, 0, 1_000_000, true);
const slots = (v) => number(v, 0, 35, true);
const stackSize = (name) => maxStackSize(name).maxStack;
function foodValue(name) {
  const hunger = FOOD_VALUES[name.slice('minecraft:'.length)];
  if (!hunger) throw new Error('Choose a food from the supported food table.');
  return hunger;
}
function decimalBudget(duration, rate) {
  // Preserve decimal budgets through whole-item rounding and boundary decisions.
  const factors = [number(duration), number(rate)].map((n) => {
    const [mantissa, exponent = '0'] = String(n).split('e'),
      [whole, fraction = ''] = mantissa.split('.');
    return { units: BigInt(whole + fraction), scale: fraction.length - Number(exponent) };
  });
  const units = factors[0].units * factors[1].units,
    scale = factors[0].scale + factors[1].scale;
  const denominator = 10n ** BigInt(scale);
  return {
    units,
    denominator,
    asNumber: (n) => Number(`${n}e-${scale}`),
    portions: (remaining, hunger) => {
      const portion = BigInt(hunger) * denominator;
      return Number((remaining + portion - 1n) / portion);
    },
  };
}
function route(origin, values) {
  if (!values.length || values.length > 50) throw new Error('Give 1 to 50 destination points.');
  const points = [origin, ...values.map(navPoint)];
  let cumulative = 0;
  return points.slice(1).map((point, i) => {
    const length = distance(points[i], point);
    cumulative += length;
    return { stop: i + 1, point, distance: length, cumulative };
  });
}

export const EXPEDITION_COMMANDS = [
  ['time-to <point> <speed>', 'Estimate travel seconds from the observed position at blocks per second.'],
  ['time-home <speed>', 'Estimate travel to a home in the same known dimension.'],
  [
    'round-trip <point> <speed> <work-seconds>',
    'Budget out-and-back travel to the current position plus explicit work.',
  ],
  ['rendezvous <point> <speed> <seconds>', 'Estimate required departure delay or lateness for an arrival deadline.'],
  ['route-budget <speed> <seconds> <points...>', 'Locate the first ordered stop exceeding a travel-time budget.'],
  ['home-deadline <speed> <seconds>', 'Estimate work time remaining before departing for home.'],
  ['operating-radius <speed> <seconds> <work-seconds>', 'Calculate an out-and-back radius after reserving work time.'],
  [
    'food-load <food> <minutes> <hunger-per-minute>',
    'Calculate the chosen food quantity and carried shortfall for a trip.',
  ],
  ['food-plan <minutes> <hunger-per-minute>', 'Allocate carried food by hunger per item to a trip budget.'],
  ['food-margin <minutes> <hunger-per-minute>', 'Compare supported carried food with explicit trip demand.'],
  ['collect-time <item> <target> <items-per-minute>', 'Estimate time to fill a carried item target.'],
  ['collect-deadline <item> <target> <items-per-minute> <minutes>', 'Check a target against a collection time budget.'],
  [
    'kit-time <items-per-minute> <entries...>',
    'Budget sequential collection of carried kit shortfalls at a shared rate.',
  ],
  [
    'kit-priority <items-per-minute> <minutes> <entries...>',
    'Select whole kit shortfalls by shortest estimated completion time.',
  ],
  ['source-trips <item> <count> <speed>', 'Compare standalone out-and-back storage withdrawals by time and yield.'],
  ['resource-trips <block> <speed> <work-seconds>', 'Rank observed block positions by round-trip time plus work.'],
  [
    'refresh-budget <speed> <seconds-per-container>',
    'Estimate a nearest-neighbor tour inspecting all known containers.',
  ],
  ['payload <item> <reserved-slots>', 'Estimate an empty load with explicitly reserved inventory slots.'],
  [
    'delivery-budget <item> <count> <reserved-slots> <point> <speed>',
    'Budget repeated round-trip deliveries from the current position.',
  ],
  [
    'reserved-capacity <item> <reserved-free-slots>',
    'Estimate current additional capacity after reserving empty slots.',
  ],
  ['recipe <output> <target> <yield> <ingredients...>', 'Budget a manually supplied recipe from carried stock.'],
  ['fuel <fuel> <items-per-fuel> <items>', 'Budget whole fuel units from a supplied processing yield.'],
  [
    'smelt <input> <output> <target> <fuel> <items-per-fuel>',
    'Budget a supplied one-input-to-one-output processing job and fuel.',
  ],
  ['ration-days <days> <hunger-per-day>', 'Split supported carried hunger evenly across a requested number of days.'],
  [
    'cache-reach <speed> <seconds> <entries...>',
    'Check whether each kit shortfall has one sufficient cache within a round-trip budget.',
  ],
];

/** One observation, no lease acquisition, no inferred recipes or movement. */
export function expeditionReport(state, command, args = []) {
  const origin = playerPosition(state),
    items = inventoryView(state).items;
  const held = (name) => items.find((i) => i.name === name)?.count ?? 0;
  const foods = items
    .filter((i) => FOOD_VALUES[i.name.slice(10)])
    .map((i) => ({ ...i, hungerEach: foodValue(i.name) }));
  const totalHunger = foods.reduce((n, i) => n + i.count * i.hungerEach, 0);
  const known = uniqueContainers(state.containers),
    opened = known.filter((c) => Array.isArray(c.items));
  const home = state.home;
  const homeKnown = Boolean(
    home &&
      state.player.dimension &&
      home.dimension === state.player.dimension &&
      axes.every((k) => Number.isFinite(home[k])),
  );
  const homeDistance = homeKnown ? distance(origin, home) : null;
  const homeReason = homeKnown ? null : 'A home with coordinates in the same known dimension is required.';
  const storage = (data) => ({
    supported: Array.isArray(state.containers),
    contents: 'last_observed',
    unopened: known.length - opened.length,
    ...data,
  });
  const kit = (values) =>
    parseStockKit(values).map((i) => ({ ...i, carried: held(i.name), missing: Math.max(0, i.count - held(i.name)) }));
  const sources = (name) =>
    opened
      .map((c) => ({
        position: { x: c.x, y: c.y, z: c.z },
        available: inventoryView({ inventory: c.items }).items.find((i) => i.name === name)?.count ?? 0,
        distance: distance(origin, c),
      }))
      .filter((c) => c.available > 0);
  let result;
  switch (command) {
    case 'time-to': {
      const point = navPoint(args[0]),
        speed = positive(args[1]),
        d = distance(origin, point);
      result = { point, distance: d, seconds: d / speed };
      break;
    }
    case 'time-home': {
      const speed = positive(args[0]);
      result = {
        known: homeKnown,
        distance: homeDistance,
        seconds: homeKnown ? homeDistance / speed : null,
        reason: homeReason,
      };
      break;
    }
    case 'round-trip': {
      const point = navPoint(args[0]),
        speed = positive(args[1]),
        workSeconds = number(args[2]),
        travelSeconds = (2 * distance(origin, point)) / speed;
      result = { point, travelSeconds, workSeconds, totalSeconds: travelSeconds + workSeconds };
      break;
    }
    case 'rendezvous': {
      const point = navPoint(args[0]),
        speed = positive(args[1]),
        deadlineSeconds = number(args[2]),
        travelSeconds = distance(origin, point) / speed,
        slack = deadlineSeconds - travelSeconds;
      result = {
        point,
        travelSeconds,
        deadlineSeconds,
        feasibleEstimate: slack >= 0,
        departureDelaySeconds: Math.max(0, slack),
        lateBySeconds: Math.max(0, -slack),
      };
      break;
    }
    case 'route-budget': {
      const speed = positive(args[0]),
        budgetSeconds = number(args[1]),
        stops = route(origin, args.slice(2)).map((p) => ({
          ...p,
          arrivalSeconds: p.cumulative / speed,
          withinBudget: p.cumulative / speed <= budgetSeconds,
        }));
      result = {
        budgetSeconds,
        stops,
        firstOverBudget: stops.find((p) => !p.withinBudget)?.stop ?? null,
        totalSeconds: stops.at(-1).arrivalSeconds,
      };
      break;
    }
    case 'home-deadline': {
      const speed = positive(args[0]),
        budgetSeconds = number(args[1]),
        travelSeconds = homeKnown ? homeDistance / speed : null;
      result = {
        known: homeKnown,
        budgetSeconds,
        travelSeconds,
        workSeconds: homeKnown ? Math.max(0, budgetSeconds - travelSeconds) : null,
        lateBySeconds: homeKnown ? Math.max(0, travelSeconds - budgetSeconds) : null,
        reason: homeReason,
      };
      break;
    }
    case 'operating-radius': {
      const speed = positive(args[0]),
        budgetSeconds = number(args[1]),
        workSeconds = number(args[2]);
      result = {
        budgetSeconds,
        workSeconds,
        feasibleEstimate: workSeconds <= budgetSeconds,
        radius: workSeconds <= budgetSeconds ? ((budgetSeconds - workSeconds) * speed) / 2 : null,
      };
      break;
    }
    case 'food-load': {
      const name = itemName(args[0]),
        demand = decimalBudget(args[1], args[2]),
        hungerEach = foodValue(name),
        required = demand.portions(demand.units, hungerEach);
      result = { name, required, carried: held(name), missing: Math.max(0, required - held(name)), hungerEach };
      break;
    }
    case 'food-plan': {
      const demand = decimalBudget(args[0], args[1]),
        allocation = [];
      let remaining = demand.units;
      for (const food of [...foods].sort((a, b) => b.hungerEach - a.hungerEach || a.name.localeCompare(b.name))) {
        const take = Math.min(food.count, demand.portions(remaining, food.hungerEach));
        if (take) {
          allocation.push({ name: food.name, count: take, hunger: take * food.hungerEach });
          remaining -= BigInt(take * food.hungerEach) * demand.denominator;
          if (remaining < 0n) remaining = 0n;
        }
      }
      result = { demand: demand.asNumber(demand.units), allocation, uncoveredHunger: demand.asNumber(remaining) };
      break;
    }
    case 'food-margin': {
      const demand = decimalBudget(args[0], args[1]),
        margin = BigInt(totalHunger) * demand.denominator - demand.units;
      result = {
        demand: demand.asNumber(demand.units),
        totalHunger,
        margin: demand.asNumber(margin),
        sufficientEstimate: margin >= 0n,
      };
      break;
    }
    case 'collect-time':
    case 'collect-deadline': {
      const name = itemName(args[0]),
        target = count(args[1]),
        rate = positive(args[2]),
        missing = Math.max(0, target - held(name)),
        minutes = missing / rate;
      result = { name, target, carried: held(name), missing, minutes };
      if (command === 'collect-deadline') {
        const budgetMinutes = number(args[3]),
          budget = decimalBudget(budgetMinutes, rate);
        result = {
          ...result,
          budgetMinutes,
          feasibleEstimate: BigInt(missing) * budget.denominator <= budget.units,
          attainableCount: Math.min(target, held(name) + Number(budget.units / budget.denominator)),
        };
      }
      break;
    }
    case 'kit-time': {
      const rate = positive(args[0]),
        requirements = kit(args.slice(1)).map((i) => ({ ...i, minutes: i.missing / rate }));
      result = { requirements, minutes: requirements.reduce((n, i) => n + i.minutes, 0) };
      break;
    }
    case 'kit-priority': {
      const rate = positive(args[0]),
        budgetMinutes = number(args[1]),
        requirements = kit(args.slice(2))
          .map((i) => ({ ...i, minutes: i.missing / rate }))
          .sort((a, b) => a.minutes - b.minutes || a.name.localeCompare(b.name));
      const budget = decimalBudget(budgetMinutes, rate);
      let remaining = budget.units;
      const selected = [],
        deferred = [];
      for (const i of requirements) {
        const needed = BigInt(i.missing) * budget.denominator;
        if (needed <= remaining) {
          selected.push(i);
          remaining -= needed;
        } else deferred.push(i);
      }
      result = { budgetMinutes, selected, deferred, remainingMinutes: budget.asNumber(remaining) / rate };
      break;
    }
    case 'source-trips': {
      const name = itemName(args[0]),
        requested = count(args[1]),
        speed = positive(args[2]);
      result = storage({
        name,
        requested,
        trips: sources(name)
          .map((c) => ({
            ...c,
            take: Math.min(c.available, requested),
            missing: Math.max(0, requested - c.available),
            seconds: (2 * c.distance) / speed,
          }))
          .sort((a, b) => a.seconds - b.seconds),
      });
      break;
    }
    case 'resource-trips': {
      const name = itemName(args[0]),
        speed = positive(args[1]),
        workSeconds = number(args[2]);
      const seen = new Set();
      result = {
        supported: Array.isArray(state.blocks),
        name,
        trips: (state.blocks ?? [])
          .filter((p) => {
            const key = axes.map((k) => p[k]).join(',');
            if (p.name !== name || seen.has(key) || !axes.every((k) => Number.isFinite(p[k]))) return false;
            seen.add(key);
            return true;
          })
          .map((p) => ({
            position: { x: p.x, y: p.y, z: p.z },
            seconds: (2 * distance(origin, p)) / speed + workSeconds,
          }))
          .sort((a, b) => a.seconds - b.seconds),
      };
      break;
    }
    case 'refresh-budget': {
      const speed = positive(args[0]),
        perContainer = number(args[1]);
      if (known.length > 200) throw new Error('Refresh tours support at most 200 containers.');
      let current = origin,
        traveled = 0;
      const remaining = [...known],
        stops = [];
      while (remaining.length) {
        let nearest = 0;
        for (let i = 1; i < remaining.length; i++)
          if (distance(current, remaining[i]) < distance(current, remaining[nearest])) nearest = i;
        const [c] = remaining.splice(nearest, 1);
        const leg = distance(current, c);
        traveled += leg;
        stops.push({ position: { x: c.x, y: c.y, z: c.z }, distance: leg });
        current = c;
      }
      const returnDistance = distance(current, origin);
      result = storage({
        stops,
        distance: traveled + returnDistance,
        returnDistance,
        inspectionSeconds: stops.length * perContainer,
        totalSeconds: (traveled + returnDistance) / speed + stops.length * perContainer,
        method: 'nearest_neighbor_not_optimal',
      });
      break;
    }
    case 'payload': {
      const name = itemName(args[0]),
        reservedSlots = slots(args[1]),
        usableSlots = 36 - reservedSlots;
      result = { name, reservedSlots, usableSlots, ...maxStackSize(name), capacity: usableSlots * stackSize(name) };
      break;
    }
    case 'delivery-budget': {
      const name = itemName(args[0]),
        requested = count(args[1]),
        reservedSlots = slots(args[2]),
        point = navPoint(args[3]),
        speed = positive(args[4]),
        capacity = (36 - reservedSlots) * stackSize(name),
        trips = Math.ceil(requested / capacity),
        tripSeconds = (2 * distance(origin, point)) / speed;
      result = {
        name,
        requested,
        capacity,
        trips,
        tripSeconds,
        totalSeconds: trips * tripSeconds,
        loadingTimeIncluded: false,
      };
      break;
    }
    case 'reserved-capacity': {
      const name = itemName(args[0]),
        reserved = number(args[1], 0, 36, true),
        free = freeSlotsView(state, { item: name }),
        usableFree = Math.max(0, free.free - reserved),
        partialRoom = free.room - free.free * free.maxStack;
      result = {
        name,
        freeSlots: free.free,
        reservedFreeSlots: reserved,
        reservationMet: free.free >= reserved,
        usableFreeSlots: usableFree,
        partialRoom,
        additionalCapacityEstimate: usableFree * free.maxStack + partialRoom,
        ...maxStackSize(name),
      };
      break;
    }
    case 'recipe': {
      const name = itemName(args[0]),
        target = count(args[1]),
        yieldCount = number(args[2], 1, 1_000_000, true),
        ingredients = parseStockKit(args.slice(3)),
        batches = Math.ceil(Math.max(0, target - held(name)) / yieldCount);
      if (!ingredients.some((i) => i.count > 0) || ingredients.some((i) => i.name === name))
        throw new Error('A recipe needs positive ingredients distinct from its output.');
      result = {
        name,
        target,
        carried: held(name),
        batches,
        produced: batches * yieldCount,
        ingredients: ingredients.map((i) => ({
          name: i.name,
          required: i.count * batches,
          carried: held(i.name),
          missing: Math.max(0, i.count * batches - held(i.name)),
        })),
        recipeValidated: false,
      };
      break;
    }
    case 'fuel': {
      const name = itemName(args[0]),
        yieldCount = positive(args[1]),
        requested = count(args[2]),
        budget = decimalBudget(1, yieldCount),
        required = Number((BigInt(requested) * budget.denominator + budget.units - 1n) / budget.units);
      result = {
        name,
        requested,
        required,
        carried: held(name),
        missing: Math.max(0, required - held(name)),
        unusedProcessingCapacity: budget.asNumber(
          BigInt(required) * budget.units - BigInt(requested) * budget.denominator,
        ),
      };
      break;
    }
    case 'smelt': {
      const input = itemName(args[0]),
        output = itemName(args[1]),
        target = count(args[2]),
        fuel = itemName(args[3]),
        yieldCount = positive(args[4]),
        jobs = Math.max(0, target - held(output)),
        budget = decimalBudget(1, yieldCount),
        fuelRequired = Number((BigInt(jobs) * budget.denominator + budget.units - 1n) / budget.units);
      if (new Set([input, output, fuel]).size !== 3)
        throw new Error('Use distinct input, output, and fuel items to avoid double counting.');
      result = {
        input,
        output,
        fuel,
        target,
        jobs,
        inputMissing: Math.max(0, jobs - held(input)),
        fuelRequired,
        fuelMissing: Math.max(0, fuelRequired - held(fuel)),
        recipeValidated: false,
      };
      break;
    }
    case 'ration-days': {
      const days = number(args[0], 1, 365, true),
        demandPerDay = number(args[1]),
        demand = decimalBudget(days, demandPerDay),
        missing = demand.units - BigInt(totalHunger) * demand.denominator;
      result = {
        days,
        demandPerDay,
        totalHunger,
        dailyAllowance: totalHunger / days,
        shortfall: missing > 0n ? demand.asNumber(missing) : 0,
        sufficientEstimate: missing <= 0n,
      };
      break;
    }
    case 'cache-reach': {
      const speed = positive(args[0]),
        budgetSeconds = number(args[1]);
      result = storage({
        budgetSeconds,
        requirements: kit(args.slice(2)).map((i) => {
          const candidates = sources(i.name)
            .filter((c) => c.available >= i.missing && (2 * c.distance) / speed <= budgetSeconds)
            .sort((a, b) => a.distance - b.distance);
          return {
            ...i,
            coveredEstimate: !i.missing || candidates.length > 0,
            source: i.missing ? (candidates[0] ?? null) : null,
          };
        }),
        independentTrips: true,
      });
      break;
    }
    default:
      throw new Error(`Unknown expedition report: ${command}.`);
  }
  return { ...result, note: NOTE };
}

export function registerExpeditionTools(program, { view }) {
  const group = program
    .command('expedition')
    .description('Read-only trip, food, collection, and manual production budgets. Rates are explicit estimates.');
  for (const [signature, description] of EXPEDITION_COMMANDS) {
    const name = signature.split(' ')[0];
    group
      .command(signature)
      .description(description)
      .action((...values) => view((state) => expeditionReport(state, name, values.slice(0, -2).flat())));
  }
  return group;
}
