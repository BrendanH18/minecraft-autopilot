import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { parseSnapshot, itemName, FOOD_VALUES } from '../../../src/cli-views.js';
import { parseStockKit } from './stock-tools.js';
import { dimensionId } from '../../../src/waypoints.js';
import { navNumber, navPoint } from './navigation.js';

const NOTE =
  'Saved observation only; a passing predicate does not prove current world state, task success, reachability, or safety. Unknown evidence returns passes: null. Inventory records are not physical slots; food uses the supported hunger table only.';
const BORDER = 29_999_984;
const axes = ['x', 'y', 'z'];
const distance = (a, b) => Math.hypot(...axes.map((axis) => a[axis] - b[axis]));
function number(value, min = 0, max = 1_000_000, integer = false) {
  const n = navNumber(value);
  if (n < min || n > max || (integer && !Number.isSafeInteger(n)))
    throw new Error(`Use ${integer ? 'an integer' : 'a number'} from ${min} to ${max}.`);
  return n;
}
const range = (args, min = 0, max = 1_000_000, integer = false) => {
  const minimum = number(args[0], min, max, integer),
    maximum = number(args[1], minimum, max, integer);
  return { minimum, maximum };
};
const inRange = (value, { minimum, maximum }) => value >= minimum && value <= maximum;
function timestamp(value) {
  if (!z.iso.datetime().safeParse(value).success)
    throw new Error('Use an ISO UTC timestamp, for example 2026-01-01T00:00:00Z.');
  return Date.parse(value);
}
function dimension(value) {
  if (typeof value !== 'string') throw new Error('Use a dimension id such as minecraft:overworld.');
  return dimensionId(value);
}

export const CHECKPOINT_COMMANDS = [
  ['health-range <file> <minimum> <maximum>', 'Check recorded health against an inclusive range.'],
  ['hunger-range <file> <minimum> <maximum>', 'Check recorded hunger against an inclusive range.'],
  ['alive <file>', 'Check whether recorded health is positive.'],
  ['dimension <file> <dimension>', 'Require one known player dimension.'],
  [
    'within-box <file> <dimension> <corner-a> <corner-b>',
    'Require a player position inside a dimension-qualified inclusive cuboid.',
  ],
  ['within-radius <file> <dimension> <point> <radius>', 'Require a player position in a dimension-qualified sphere.'],
  ['altitude <file> <minimum> <maximum>', 'Check player Y against an inclusive altitude band.'],
  ['home-saved <file>', 'Check whether the snapshot explicitly records a saved home.'],
  ['home-dimension <file>', 'Require matching known home and player dimensions.'],
  ['at-home <file> <radius>', 'Require a player within radius of home in its known dimension.'],
  ['item-range <file> <item> <minimum> <maximum>', 'Check a normalized carried item total against an inclusive range.'],
  ['kit <file> <entries...>', 'Require every item=count carried quota in a kit.'],
  ['allowed-items <file> <items...>', 'Check that all positive carried items belong to an explicit allowlist.'],
  [
    'item-ratio <file> <numerator> <denominator> <minimum> <maximum>',
    'Check an inclusive carried item ratio; a zero denominator is unknown.',
  ],
  ['total-items <file> <minimum> <maximum>', 'Check total positive carried quantity.'],
  ['diversity <file> <minimum> <maximum>', 'Check the number of distinct positive carried item types.'],
  ['inventory-records <file> <maximum>', 'Limit positive inventory records, without inferring slots.'],
  ['food-reserve <file> <hunger>', 'Require a supported-food hunger reserve, ignoring saturation.'],
  ['fresh <file> <seconds> <now>', 'Require age from zero to seconds relative to an explicit ISO UTC time.'],
  ['saved-between <file> <earliest> <latest>', 'Require the saved timestamp inside an inclusive ISO UTC interval.'],
  ['border-clearance <file> <blocks>', 'Require horizontal clearance from the supported coordinate border.'],
  ['chunk <file> <dimension> <x> <z>', 'Require membership in a dimension-qualified X/Z chunk.'],
  ['section <file> <y>', 'Require membership in a vertical 16-block section.'],
  ['inventory-quality <file>', 'Check explicit inventory names, integer quantities, and safe aggregation.'],
  ['vitals-quality <file>', 'Check that health and hunger are usable recorded readings.'],
];

/** Offline predicates only. Never acquires control, changes files, or executes actions. */
export function checkpointReport(value, command, args = []) {
  const state = parseSnapshot(JSON.stringify(value));
  const result = (
    passes,
    measurements = {},
    reason = passes === null ? 'Required evidence is unavailable or invalid.' : 'Recorded evidence evaluated.',
  ) => ({ check: command, savedAt: state.savedAt, passes, ...measurements, reason, note: NOTE });
  const knownDimension = (value) =>
    typeof value === 'string' && /^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(value) ? value : null;
  const playerDimension = knownDimension(state.player.dimension),
    homeDimension = knownDimension(state.home?.dimension);
  const position = state.player.position;
  const vital = (field) => {
    const n = state.player[field];
    return Number.isFinite(n) && n >= 0 && (field !== 'hunger' || (Number.isInteger(n) && n <= 20)) ? n : null;
  };
  const inventoryErrors = [];
  const items = new Map();
  if (!Array.isArray(value?.inventory)) inventoryErrors.push({ reason: 'Inventory was not recorded.' });
  else
    state.inventory.forEach((entry, i) => {
      let name;
      try {
        name = itemName(entry.name);
      } catch {
        inventoryErrors.push({ record: i + 1, reason: 'Invalid item name.' });
        return;
      }
      if (!Number.isSafeInteger(entry.count) || entry.count < 0) {
        inventoryErrors.push({ record: i + 1, reason: 'Quantity must be a nonnegative safe integer.' });
        return;
      }
      const count = (items.get(name) ?? 0) + entry.count;
      if (!Number.isSafeInteger(count)) {
        inventoryErrors.push({ record: i + 1, reason: 'Item total exceeds safe integer precision.' });
        return;
      }
      if (count > 0) items.set(name, count);
    });
  const total = [...items.values()].reduce((n, count) => n + count, 0);
  if (!Number.isSafeInteger(total)) inventoryErrors.push({ reason: 'Inventory total exceeds safe integer precision.' });
  const inventoryKnown = inventoryErrors.length === 0;
  const count = (name) => items.get(name) ?? 0;
  const sameDimension = (target) => (playerDimension === null ? null : playerDimension === target);
  switch (command) {
    case 'health-range':
    case 'hunger-range': {
      const field = command === 'health-range' ? 'health' : 'hunger',
        limits = range(args, 0, field === 'health' ? 1024 : 20),
        current = vital(field);
      return result(current === null ? null : inRange(current, limits), { current, ...limits });
    }
    case 'alive': {
      const health = vital('health');
      return result(health === null ? null : health > 0, { health });
    }
    case 'dimension': {
      const expected = dimension(args[0]);
      return result(sameDimension(expected), { current: playerDimension, expected });
    }
    case 'within-box': {
      const expectedDimension = dimension(args[0]),
        a = navPoint(args[1]),
        b = navPoint(args[2]);
      const minimum = Object.fromEntries(axes.map((axis) => [axis, Math.min(a[axis], b[axis])])),
        maximum = Object.fromEntries(axes.map((axis) => [axis, Math.max(a[axis], b[axis])]));
      const comparable = sameDimension(expectedDimension);
      return result(
        comparable === null
          ? null
          : comparable && axes.every((axis) => position[axis] >= minimum[axis] && position[axis] <= maximum[axis]),
        { position, expectedDimension, minimum, maximum },
      );
    }
    case 'within-radius': {
      const expectedDimension = dimension(args[0]),
        target = navPoint(args[1]),
        radius = number(args[2], 0, 100_000_000),
        comparable = sameDimension(expectedDimension);
      const measured = comparable ? distance(position, target) : null;
      return result(comparable === null ? null : comparable && measured <= radius, {
        expectedDimension,
        target,
        radius,
        distance: measured,
      });
    }
    case 'altitude': {
      const limits = range(args, -64, 320);
      return result(inRange(position.y, limits), { current: position.y, ...limits });
    }
    case 'home-saved':
      return result(value?.home === undefined ? null : state.home !== null, { home: state.home ?? null });
    case 'home-dimension':
      return result(!state.home || !playerDimension || !homeDimension ? null : playerDimension === homeDimension, {
        playerDimension,
        homeDimension,
      });
    case 'at-home': {
      const radius = number(args[0], 0, 100_000_000),
        comparable = state.home && playerDimension && homeDimension ? playerDimension === homeDimension : null;
      const measured = comparable ? distance(position, state.home) : null;
      return result(comparable === null ? null : comparable && measured <= radius, {
        radius,
        distance: measured,
        playerDimension,
        homeDimension,
      });
    }
    case 'item-range': {
      const name = itemName(args[0]),
        limits = range(args.slice(1), 0, 1_000_000, true),
        current = inventoryKnown ? count(name) : null;
      return result(current === null ? null : inRange(current, limits), { name, current, ...limits });
    }
    case 'kit': {
      const kit = parseStockKit(args),
        quotas = kit.map((item) => ({ ...item, current: inventoryKnown ? count(item.name) : null }));
      return result(inventoryKnown ? quotas.every((item) => item.current >= item.count) : null, { quotas });
    }
    case 'allowed-items': {
      if (!args.length || args.length > 100) throw new Error('Give 1 to 100 allowed item names.');
      const allowed = [...new Set(args.map(itemName))],
        unexpected = inventoryKnown ? [...items.keys()].filter((name) => !allowed.includes(name)).sort() : null;
      return result(unexpected === null ? null : unexpected.length === 0, { allowed, unexpected });
    }
    case 'item-ratio': {
      const numerator = itemName(args[0]),
        denominator = itemName(args[1]),
        limits = range(args.slice(2));
      const ratio = inventoryKnown && count(denominator) > 0 ? count(numerator) / count(denominator) : null;
      return result(ratio === null ? null : inRange(ratio, limits), { numerator, denominator, ratio, ...limits });
    }
    case 'total-items':
    case 'diversity': {
      const limits = range(args, 0, 1_000_000, true),
        current = inventoryKnown ? (command === 'total-items' ? total : items.size) : null;
      return result(current === null ? null : inRange(current, limits), { current, ...limits });
    }
    case 'inventory-records': {
      const maximum = number(args[0], 0, 1_000_000, true),
        current = inventoryKnown ? state.inventory.filter((entry) => entry.count > 0).length : null;
      return result(current === null ? null : current <= maximum, { current, maximum, physicalSlots: null });
    }
    case 'food-reserve': {
      const required = number(args[0]),
        supportedHunger = inventoryKnown
          ? [...items].reduce(
              (sum, [name, count]) => sum + count * (FOOD_VALUES[name.replace(/^minecraft:/, '')] ?? 0),
              0,
            )
          : null;
      return result(
        supportedHunger === null || !Number.isSafeInteger(supportedHunger) ? null : supportedHunger >= required,
        { supportedHunger, required },
      );
    }
    case 'fresh': {
      const maximumSeconds = number(args[0], 0, 315_360_000),
        now = timestamp(args[1]),
        ageSeconds = (now - Date.parse(state.savedAt)) / 1000;
      return result(ageSeconds >= 0 && ageSeconds <= maximumSeconds, { now: args[1], ageSeconds, maximumSeconds });
    }
    case 'saved-between': {
      const earliest = timestamp(args[0]),
        latest = timestamp(args[1]);
      if (latest < earliest) throw new Error('Latest timestamp must not precede earliest.');
      const saved = Date.parse(state.savedAt);
      return result(saved >= earliest && saved <= latest, { earliest: args[0], latest: args[1] });
    }
    case 'border-clearance': {
      const required = number(args[0], 0, BORDER),
        clearance = BORDER - Math.max(Math.abs(position.x), Math.abs(position.z));
      return result(clearance >= required, { clearance, required, border: BORDER });
    }
    case 'chunk': {
      const expectedDimension = dimension(args[0]),
        x = number(args[1], Math.floor(-BORDER / 16), Math.floor(BORDER / 16), true),
        z = number(args[2], Math.floor(-BORDER / 16), Math.floor(BORDER / 16), true),
        comparable = sameDimension(expectedDimension);
      const current = { x: Math.floor(position.x / 16), z: Math.floor(position.z / 16) };
      return result(comparable === null ? null : comparable && current.x === x && current.z === z, {
        expectedDimension,
        current,
        expected: { x, z },
      });
    }
    case 'section': {
      const expected = number(args[0], -4, 20, true),
        current = Math.floor(position.y / 16);
      return result(current === expected, { current, expected });
    }
    case 'inventory-quality':
      return result(Array.isArray(value?.inventory) ? inventoryKnown : null, {
        errors: inventoryErrors,
        records: Array.isArray(value?.inventory) ? state.inventory.length : null,
      });
    case 'vitals-quality': {
      const health = vital('health'),
        hunger = vital('hunger');
      const invalid = ['health', 'hunger'].some(
        (field) => state.player[field] !== null && state.player[field] !== undefined && vital(field) === null,
      );
      return result(invalid ? false : health === null || hunger === null ? null : true, { health, hunger });
    }
    default:
      throw new Error(`Unknown checkpoint: ${command}.`);
  }
}

export function registerCheckpointTools(program, { print }) {
  const group = program
    .command('checkpoint')
    .description('Offline saved-snapshot predicates; prints passes true, false, or null. Never connects to Minecraft.');
  for (const [signature, description] of CHECKPOINT_COMMANDS) {
    const name = signature.split(' ')[0];
    group
      .command(signature)
      .description(description)
      .action(async (...values) => {
        const [file, ...args] = values.slice(0, -2);
        const raw = JSON.parse(await readFile(file, 'utf8'));
        print(checkpointReport(raw, name, args.flat()));
      });
  }
  return group;
}
