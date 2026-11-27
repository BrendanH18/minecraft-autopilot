import { itemName } from '../../../src/cli-views.js';
import { parseStockKit } from './stock-tools.js';
import {
  readLedgerSnapshot,
  ledgerPair,
  ledgerItems,
  ledgerNumber,
  ledgerHunger,
  ledgerStacks,
} from './ledger-tools.js';

const NOTE =
  'Saved, last-observed storage evidence only. Disappearance is not destruction, and net changes are not proof of transfers. Coordinate matching requires the same known player dimension. Unopened or missing contents never count as zero. Pooled reports cover recorded containers only.';
const dimension = (value) => (typeof value === 'string' && /^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(value) ? value : null);
const key = (c) => `${c.x},${c.y},${c.z}`;
function storage(value) {
  if (value === undefined) return null;
  if (!Array.isArray(value) || value.length > 1000)
    throw new Error('Storage evidence must be an array of at most 1000 containers.');
  const result = new Map();
  for (const c of value) {
    if (!c || !['x', 'y', 'z'].every((axis) => Number.isSafeInteger(c[axis])))
      throw new Error('Container coordinates must be safe integers.');
    const id = key(c);
    if (result.has(id)) throw new Error('Duplicate container coordinates are ambiguous.');
    const items = c.items === undefined || c.items === null ? null : ledgerItems(c.items);
    if (c.observedAt !== undefined && c.observedAt !== null && (!Number.isFinite(c.observedAt) || c.observedAt < 0))
      throw new Error('Container observedAt must be a nonnegative timestamp.');
    result.set(id, {
      position: { x: c.x, y: c.y, z: c.z },
      items,
      observedAt: Number.isFinite(c.observedAt) ? c.observedAt : null,
    });
  }
  return result;
}
function pool(containers) {
  if (containers === null || [...containers.values()].some((c) => c.items === null)) return null;
  const result = new Map();
  for (const c of containers.values())
    for (const [name, count] of c.items) result.set(name, (result.get(name) ?? 0) + count);
  if (
    ![...result.values()].every(Number.isSafeInteger) ||
    !Number.isSafeInteger([...result.values()].reduce((n, c) => n + c, 0))
  )
    throw new Error('Pooled storage exceeds safe integer precision.');
  return result;
}
const deltas = (a, b) =>
  [...new Set([...a.keys(), ...b.keys()])].sort().map((name) => ({
    name,
    before: a.get(name) ?? 0,
    after: b.get(name) ?? 0,
    delta: (b.get(name) ?? 0) - (a.get(name) ?? 0),
  }));
const total = (map) => [...map.values()].reduce((n, v) => n + v, 0);

export const DEPOT_COMMANDS = [
  ['coverage <before> <after>', 'Compare opened, unopened, and timed storage evidence counts.'],
  ['discovered <before> <after>', 'Locate container coordinates first recorded in the later observation.'],
  ['missing <before> <after>', 'Locate previously recorded coordinates omitted from the later observation.'],
  ['opened <before> <after>', 'Locate matched containers whose unknown contents became recorded.'],
  ['obscured <before> <after>', 'Locate matched containers whose recorded contents became unknown.'],
  ['refreshed <before> <after>', 'Locate matched containers with a strictly newer observation timestamp.'],
  ['aging <before> <after>', 'Compare content observation age at each snapshot save time.'],
  ['changed-containers <before> <after>', 'Locate matched opened containers with changed item quantities.'],
  ['item-changes <before> <after>', 'List per-item changes in matched opened containers.'],
  ['item-total <before> <after> <item>', 'Compare one item across fully recorded storage evidence.'],
  ['matched-item <before> <after> <item>', 'Compare one item in containers with contents known at both times.'],
  ['source-gains <before> <after> <item>', 'Locate matched containers with a positive observed change of an item.'],
  ['source-losses <before> <after> <item>', 'Locate matched containers with a negative observed change of an item.'],
  [
    'redistribution-bound <before> <after> <item>',
    'Bound potentially redistributed quantity by matched gains and losses.',
  ],
  ['newly-stocked <before> <after>', 'Locate matched containers going from explicitly empty to nonempty.'],
  ['depleted <before> <after>', 'Locate matched containers going from nonempty to explicitly empty.'],
  ['stable-stock <before> <after>', 'Find positive item quantities unchanged in each matched opened container.'],
  ['food-change <before> <after>', 'Compare hunger reserves across fully recorded storage evidence.'],
  ['stack-change <before> <after>', 'Compare minimum stacks consolidated within each recorded container.'],
  ['concentration <before> <after> <item>', 'Compare the largest-source share and concentration index for an item.'],
  ['redundancy <before> <after> <item>', 'Compare the number of recorded storage sources for one item.'],
  [
    'carried-stored <before> <after> <item>',
    'Compare carried and stored changes for one item without claiming transfers.',
  ],
  ['pooled-quota <before> <after> <item> <target>', 'Compare carried-plus-stored shortfalls for one quota.'],
  ['kit-pool <before> <after> <entries...>', 'Compare carried-plus-stored shortfalls for an explicit kit.'],
  ['refresh-order <before> <after> <seconds>', 'Prioritize later evidence that became stale or remained untimed.'],
];

export function depotReport(before, after, command, args = []) {
  const { a: first, b: last, seconds } = ledgerPair(before, after);
  const a = storage(before.containers),
    b = storage(after.containers);
  const sameDimension =
    Boolean(dimension(first.player.dimension)) &&
    dimension(first.player.dimension) === dimension(last.player.dimension);
  const known = a !== null && b !== null,
    comparable = known && sameDimension;
  const matched = comparable
    ? [...a].filter(([id]) => b.has(id)).map(([id, x]) => ({ id, before: x, after: b.get(id), position: x.position }))
    : null;
  const opened = matched?.filter((c) => c.before.items !== null && c.after.items !== null) ?? null;
  const pa = pool(a),
    pb = pool(b),
    full = pa !== null && pb !== null && sameDimension;
  const pairChange = (x, y) => ({ before: x, after: y, delta: x === null || y === null ? null : y - x });
  const count = (map, name) => (map === null ? null : (map.get(name) ?? 0));
  const perItem = (name) =>
    opened?.map((c) => ({
      position: c.position,
      ...pairChange(count(c.before.items, name), count(c.after.items, name)),
    })) ?? null;
  const pooled = (name) => pairChange(full ? count(pa, name) : null, full ? count(pb, name) : null);
  const combined = (name) => {
    const ia = ledgerItems(before.inventory),
      ib = ledgerItems(after.inventory);
    return {
      carried: pairChange(count(ia, name), count(ib, name)),
      stored: pooled(name),
      pooled: pairChange(
        full && ia !== null ? count(ia, name) + count(pa, name) : null,
        full && ib !== null ? count(ib, name) + count(pb, name) : null,
      ),
    };
  };
  let result;
  switch (command) {
    case 'coverage': {
      const coverage = (m) =>
        m === null
          ? null
          : {
              containers: m.size,
              opened: [...m.values()].filter((c) => c.items !== null).length,
              unopened: [...m.values()].filter((c) => c.items === null).length,
              timed: [...m.values()].filter((c) => c.observedAt !== null).length,
            };
      result = { before: coverage(a), after: coverage(b) };
      break;
    }
    case 'discovered':
      result = { containers: comparable ? [...b].filter(([id]) => !a.has(id)).map(([, c]) => c.position) : null };
      break;
    case 'missing':
      result = { containers: comparable ? [...a].filter(([id]) => !b.has(id)).map(([, c]) => c.position) : null };
      break;
    case 'opened':
    case 'obscured':
      result = {
        containers:
          matched
            ?.filter((c) =>
              command === 'opened'
                ? c.before.items === null && c.after.items !== null
                : c.before.items !== null && c.after.items === null,
            )
            .map((c) => c.position) ?? null,
      };
      break;
    case 'refreshed':
      result = {
        containers:
          matched
            ?.filter(
              (c) =>
                c.before.observedAt !== null && c.after.observedAt !== null && c.after.observedAt > c.before.observedAt,
            )
            .map((c) => ({ position: c.position, ...pairChange(c.before.observedAt, c.after.observedAt) })) ?? null,
      };
      break;
    case 'aging':
      result = {
        containers:
          matched?.map((c) => ({
            position: c.position,
            ...pairChange(
              c.before.observedAt === null ? null : (Date.parse(first.savedAt) - c.before.observedAt) / 1000,
              c.after.observedAt === null ? null : (Date.parse(last.savedAt) - c.after.observedAt) / 1000,
            ),
          })) ?? null,
      };
      break;
    case 'changed-containers':
      result = {
        containers:
          opened?.flatMap((c) => {
            const items = deltas(c.before.items, c.after.items).filter((i) => i.delta);
            return items.length
              ? [{ position: c.position, changedTypes: items.length, net: items.reduce((n, i) => n + i.delta, 0) }]
              : [];
          }) ?? null,
      };
      break;
    case 'item-changes':
      result = {
        containers:
          opened?.map((c) => ({
            position: c.position,
            items: deltas(c.before.items, c.after.items).filter((i) => i.delta),
          })) ?? null,
      };
      break;
    case 'item-total': {
      const name = itemName(args[0]);
      result = { name, ...pooled(name) };
      break;
    }
    case 'matched-item': {
      const name = itemName(args[0]),
        containers = perItem(name);
      result = {
        name,
        matchedOpened: opened?.length ?? null,
        ...pairChange(
          containers?.reduce((n, c) => n + c.before, 0) ?? null,
          containers?.reduce((n, c) => n + c.after, 0) ?? null,
        ),
      };
      break;
    }
    case 'source-gains':
    case 'source-losses': {
      const name = itemName(args[0]);
      result = {
        name,
        containers: perItem(name)?.filter((c) => (command === 'source-gains' ? c.delta > 0 : c.delta < 0)) ?? null,
      };
      break;
    }
    case 'redistribution-bound': {
      const name = itemName(args[0]),
        containers = perItem(name),
        gained = containers?.reduce((n, c) => n + Math.max(0, c.delta), 0) ?? null,
        lost = containers?.reduce((n, c) => n + Math.max(0, -c.delta), 0) ?? null;
      result = {
        name,
        gained,
        lost,
        potentialRedistribution: containers === null ? null : Math.min(gained, lost),
        transfersProven: false,
      };
      break;
    }
    case 'newly-stocked':
    case 'depleted':
      result = {
        containers:
          opened
            ?.filter((c) =>
              command === 'newly-stocked'
                ? total(c.before.items) === 0 && total(c.after.items) > 0
                : total(c.before.items) > 0 && total(c.after.items) === 0,
            )
            .map((c) => c.position) ?? null,
      };
      break;
    case 'stable-stock':
      result = {
        containers:
          opened?.map((c) => ({
            position: c.position,
            items: deltas(c.before.items, c.after.items)
              .filter((i) => i.before > 0 && i.delta === 0)
              .map((i) => ({ name: i.name, count: i.before })),
          })) ?? null,
      };
      break;
    case 'food-change':
      result = pairChange(full ? ledgerHunger(pa) : null, full ? ledgerHunger(pb) : null);
      break;
    case 'stack-change':
      result = pairChange(
        full ? [...a.values()].reduce((n, c) => n + ledgerStacks(c.items), 0) : null,
        full ? [...b.values()].reduce((n, c) => n + ledgerStacks(c.items), 0) : null,
      );
      break;
    case 'concentration': {
      const name = itemName(args[0]);
      const measure = (m) => {
        const counts = [...m.values()].map((c) => c.items.get(name) ?? 0),
          t = counts.reduce((n, v) => n + v, 0);
        return {
          total: t,
          largestShare: t ? Math.max(0, ...counts) / t : null,
          index: t ? counts.reduce((n, v) => n + (v / t) ** 2, 0) : null,
        };
      };
      result = { name, before: full ? measure(a) : null, after: full ? measure(b) : null };
      break;
    }
    case 'redundancy': {
      const name = itemName(args[0]),
        measure = (m) => [...m.values()].filter((c) => (c.items.get(name) ?? 0) > 0).length;
      result = { name, ...pairChange(full ? measure(a) : null, full ? measure(b) : null) };
      break;
    }
    case 'carried-stored': {
      const name = itemName(args[0]);
      result = { name, ...combined(name) };
      break;
    }
    case 'pooled-quota': {
      const name = itemName(args[0]),
        target = ledgerNumber(args[1], 0, 1_000_000, true),
        quantities = combined(name).pooled;
      result = {
        name,
        target,
        ...quantities,
        beforeMissing: quantities.before === null ? null : Math.max(0, target - quantities.before),
        afterMissing: quantities.after === null ? null : Math.max(0, target - quantities.after),
      };
      break;
    }
    case 'kit-pool': {
      const quotas = parseStockKit(args).map((q) => {
        const quantities = combined(q.name).pooled;
        return {
          ...q,
          ...quantities,
          beforeMissing: quantities.before === null ? null : Math.max(0, q.count - quantities.before),
          afterMissing: quantities.after === null ? null : Math.max(0, q.count - quantities.after),
        };
      });
      result = { quotas };
      break;
    }
    case 'refresh-order': {
      const threshold = ledgerNumber(args[0], 0, 315_360_000);
      result = {
        thresholdSeconds: threshold,
        containers:
          matched
            ?.map((c) => ({
              position: c.position,
              beforeAge: c.before.observedAt === null ? null : (Date.parse(first.savedAt) - c.before.observedAt) / 1000,
              afterAge: c.after.observedAt === null ? null : (Date.parse(last.savedAt) - c.after.observedAt) / 1000,
            }))
            .filter((c) => c.afterAge === null || c.afterAge > threshold || c.afterAge < 0)
            .sort((x, y) => (y.afterAge ?? Infinity) - (x.afterAge ?? Infinity))
            .map((c) => ({
              ...c,
              newlyStale:
                c.beforeAge === null || c.afterAge === null || c.afterAge < 0
                  ? null
                  : c.beforeAge <= threshold && c.beforeAge >= 0 && c.afterAge > threshold,
            })) ?? null,
      };
      break;
    }
    default:
      throw new Error(`Unknown depot command: ${command}.`);
  }
  return {
    from: first.savedAt,
    to: last.savedAt,
    seconds,
    storageKnown: known,
    comparable,
    fullyRecorded: full,
    matchedOpened: opened?.length ?? null,
    ...result,
    note: NOTE,
  };
}

export function registerDepotTools(program, { print }) {
  const group = program.command('depot').description('Offline comparison of storage evidence in two saved snapshots.');
  for (const [signature, description] of DEPOT_COMMANDS) {
    const command = signature.split(' ')[0];
    group
      .command(signature)
      .description(description)
      .action(async (...values) => {
        const [before, after, ...args] = values.slice(0, -2);
        const [a, b] = await Promise.all([readLedgerSnapshot(before), readLedgerSnapshot(after)]);
        print(depotReport(a, b, command, args.flat()));
      });
  }
  return group;
}
