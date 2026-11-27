import { inventoryView, playerPosition, uniqueContainers, maxStackSize, itemName } from '../../../src/cli-views.js';
import { parseStockKit } from './stock-tools.js';

const NOTE =
  'Read-only estimates. Storage is last observed and may be stale or incomplete. Item components, stack restrictions, container capacity, terrain, and reachability are not checked. No items are moved.';
const STORAGE_ESTIMATE_NOTE =
  'Physical storage stack occupancy and actual freed slots are unknown: backend item totals combine stacks. Minimum stack and consolidation estimates use item-name stack limits and ignore components and restrictions.';
const total = (items) => items.reduce((n, item) => n + item.count, 0);
const aggregate = (stacks) => inventoryView({ inventory: stacks }).items;
const quantity = (value, min = 0, max = 1_000_000) => {
  if (
    !/^\d+$/.test(String(value)) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < min ||
    Number(value) > max
  )
    throw new Error(`Use an integer from ${min} to ${max}.`);
  return Number(value);
};
const manifest = (values) => {
  const kit = parseStockKit(values);
  if (!kit.some((item) => item.count > 0)) throw new Error('A manifest needs at least one positive quantity.');
  return kit;
};
const percent = (value) => quantity(value, 0, 100);
const size = (name) => maxStackSize(name).maxStack;
const position = (c) => ({ x: c.x, y: c.y, z: c.z });

export const LOGISTICS_COMMANDS = [
  ['carried-bundles <entries...>', 'Count complete manifest bundles in inventory.'],
  ['pooled-bundles <entries...>', 'Count complete bundles across carried and observed stored stock.'],
  ['bundle-shortage <bundles> <entries...>', 'Calculate pooled shortfalls for a requested number of bundles.'],
  ['split-manifest <loads> <entries...>', 'Divide a manifest evenly into up to 100 numbered loads.'],
  ['restock-stops <entries...>', 'Combine multi-item kit withdrawals into nearest-first container stops.'],
  ['balance-item <item>', 'Plan an even distribution of one item among opened containers.'],
  ['fewest-sources <item> <count>', 'Meet a withdrawal with the fewest observed source containers.'],
  ['retain-percent <percent>', 'Plan deposits retaining a percentage of each carried item.'],
  ['withdraw-percent <percent>', 'Plan a percentage withdrawal from every observed stored item.'],
  ['stack-topups', 'Allocate stored stock to fill existing partial carried stacks.'],
  ['slot-map', 'Show all 36 main inventory slots and unlocated observations.'],
  ['full-stacks', 'Select carried stacks at their estimated maximum.'],
  ['stack-remainders', 'Show the final partial stack after consolidation by item.'],
  ['stack-size-groups', 'Group carried quantity and occupancy by estimated stack limit.'],
  ['container-loads', 'Rank opened containers by minimum estimated stacks from item totals.'],
  ['storage-redundancy <copies>', 'Find stored item types held in fewer than a requested number of containers.'],
  ['exclusive-stock', 'Locate stored item types held in exactly one observed container.'],
  ['container-overlap', 'Compare shared item types between each pair of opened containers.'],
  ['storage-fragmentation', 'Estimate minimum consolidation savings from aggregated storage totals.'],
  ['freshness-summary <seconds>', 'Classify known container observations by an explicit age threshold.'],
  ['untimed-storage', 'Locate opened containers without a finite observation timestamp.'],
  ['observation-window', 'Report the oldest and newest known storage observation times.'],
  ['kit-containers <entries...>', 'Find opened containers that individually hold a complete manifest.'],
  ['storage-stack-sizes', 'Group observed stored stock by estimated stack limit.'],
  ['source-distances <item>', 'Measure nearest, farthest, and quantity-weighted source distances.'],
];

/** Pure logistics over one snapshot; never opens storage or takes control. */
export function logisticsReport(state, command, args = [], { now = Date.now() } = {}) {
  const origin = playerPosition(state),
    items = inventoryView(state).items;
  const stacks = (state.inventory || []).filter((s) => s.count > 0);
  const known = uniqueContainers(state.containers),
    opened = known.filter((c) => Array.isArray(c.items));
  const stored = aggregate(opened.flatMap((c) => c.items)),
    pooled = aggregate([...items, ...stored]);
  const count = (list, name) => list.find((item) => item.name === name)?.count ?? 0;
  const distance = (c) => Math.hypot(c.x - origin.x, c.y - origin.y, c.z - origin.z);
  const located = (c) => ({ ...position(c), distance: distance(c) });
  const stock = (data) => ({
    supported: Array.isArray(state.containers),
    contents: 'last_observed',
    unopened: known.length - opened.length,
    ...data,
  });
  const bundle = (kit, list) => {
    const requirements = kit
      .filter((item) => item.count > 0)
      .map((item) => ({
        ...item,
        available: count(list, item.name),
        bundles: Math.floor(count(list, item.name) / item.count),
      }));
    const bundles = Math.min(...requirements.map((item) => item.bundles));
    return {
      bundles,
      requirements,
      limitingItems: requirements.filter((item) => item.bundles === bundles).map((item) => item.name),
    };
  };
  const sources = (name) =>
    opened.map((c) => ({ ...located(c), count: count(aggregate(c.items), name) })).filter((c) => c.count > 0);
  const groups = (list) =>
    [1, 16, 64]
      .map((maxStack) => ({ maxStack, items: list.filter((i) => size(i.name) === maxStack) }))
      .map((g) => ({ ...g, quantity: total(g.items) }));
  let result;
  switch (command) {
    case 'carried-bundles':
      result = bundle(manifest(args), items);
      break;
    case 'pooled-bundles':
      result = stock(bundle(manifest(args), pooled));
      break;
    case 'bundle-shortage': {
      const bundles = quantity(args[0], 1),
        kit = manifest(args.slice(1));
      result = stock({
        bundles,
        items: kit.map((item) => ({
          name: item.name,
          required: item.count * bundles,
          available: count(pooled, item.name),
          missing: Math.max(0, item.count * bundles - count(pooled, item.name)),
        })),
      });
      break;
    }
    case 'split-manifest': {
      const loads = quantity(args[0], 1, 100),
        kit = manifest(args.slice(1));
      result = {
        loads: Array.from({ length: loads }, (_, i) => ({
          load: i + 1,
          items: kit
            .map((item) => ({
              name: item.name,
              count: Math.floor(item.count / loads) + (i < item.count % loads ? 1 : 0),
            }))
            .filter((item) => item.count > 0),
        })),
        capacityChecked: false,
      };
      break;
    }
    case 'restock-stops': {
      const remaining = manifest(args).map((item) => ({
          name: item.name,
          count: Math.max(0, item.count - count(items, item.name)),
        })),
        stops = [];
      for (const c of [...opened].sort((a, b) => distance(a) - distance(b))) {
        const stockItems = aggregate(c.items),
          take = [];
        for (const item of remaining) {
          const amount = Math.min(item.count, count(stockItems, item.name));
          if (amount) {
            take.push({ name: item.name, count: amount });
            item.count -= amount;
          }
        }
        if (take.length) stops.push({ ...located(c), items: take });
      }
      result = stock({ stops, missing: remaining.filter((item) => item.count > 0) });
      break;
    }
    case 'balance-item': {
      const name = itemName(args[0]),
        amount = count(stored, name),
        containers = opened.map((c, i) => {
          const current = count(aggregate(c.items), name),
            target = Math.floor(amount / opened.length) + (i < amount % opened.length ? 1 : 0);
          return { ...located(c), current, target, change: target - current };
        });
      result = stock({ item: name, total: amount, containers });
      break;
    }
    case 'fewest-sources': {
      const name = itemName(args[0]),
        requested = quantity(args[1], 1);
      let remaining = requested;
      const selected = [];
      for (const c of sources(name).sort((a, b) => b.count - a.count || a.distance - b.distance)) {
        const take = Math.min(c.count, remaining);
        if (take) selected.push({ ...c, take });
        remaining -= take;
      }
      result = stock({ item: name, requested, sources: selected, missing: remaining });
      break;
    }
    case 'retain-percent': {
      const rate = percent(args[0]);
      result = {
        percent: rate,
        items: items.map((item) => ({
          ...item,
          keep: Math.ceil((item.count * rate) / 100),
          deposit: item.count - Math.ceil((item.count * rate) / 100),
        })),
      };
      break;
    }
    case 'withdraw-percent': {
      const rate = percent(args[0]);
      result = stock({
        percent: rate,
        containers: opened
          .map((c) => ({
            ...located(c),
            items: aggregate(c.items)
              .map((item) => ({ ...item, withdraw: Math.floor((item.count * rate) / 100) }))
              .filter((item) => item.withdraw > 0),
          }))
          .filter((c) => c.items.length),
      });
      break;
    }
    case 'stack-topups': {
      const available = new Map(stored.map((item) => [item.name, item.count]));
      result = stock({
        stacks: stacks
          .filter((s) => s.count < size(s.name))
          .map((s) => {
            const room = size(s.name) - s.count,
              take = Math.min(room, available.get(s.name) ?? 0);
            available.set(s.name, (available.get(s.name) ?? 0) - take);
            return { name: s.name, slot: s.slot ?? null, room, withdraw: take, remainingRoom: room - take };
          }),
      });
      break;
    }
    case 'slot-map': {
      // Mineflayer reports player-window slots: 36–44 are hotbar, 9–35 storage.
      const mainSlot = (s) =>
        !Number.isInteger(s.slot)
          ? null
          : state.backend === 'mineflayer'
            ? s.slot >= 36 && s.slot <= 44
              ? s.slot - 36
              : s.slot >= 9 && s.slot <= 35
                ? s.slot
                : null
            : s.slot >= 0 && s.slot <= 35
              ? s.slot
              : null;
      result = {
        slots: Array.from({ length: 36 }, (_, slot) => ({
          slot,
          stacks: stacks.filter((s) => mainSlot(s) === slot).map((s) => ({ name: s.name, count: s.count })),
        })),
        unlocated: stacks
          .filter((s) => mainSlot(s) === null)
          .map((s) => ({ name: s.name, count: s.count, slot: s.slot ?? null })),
      };
      break;
    }
    case 'full-stacks':
      result = {
        stacks: stacks.filter((s) => s.count === size(s.name)).map((s) => ({ ...s, ...maxStackSize(s.name) })),
      };
      break;
    case 'stack-remainders':
      result = {
        items: items.map((item) => ({
          ...item,
          fullStacks: Math.floor(item.count / size(item.name)),
          remainder: item.count % size(item.name),
          ...maxStackSize(item.name),
        })),
      };
      break;
    case 'stack-size-groups':
      result = {
        groups: groups(items).map((g) => ({
          ...g,
          occupiedStacks: stacks.filter((s) => size(s.name) === g.maxStack).length,
        })),
      };
      break;
    case 'container-loads':
      result = stock({
        estimateNote: STORAGE_ESTIMATE_NOTE,
        containers: opened
          .map((c) => ({
            ...located(c),
            occupiedStacks: null,
            minimumStacksEstimate: aggregate(c.items).reduce((n, i) => n + Math.ceil(i.count / size(i.name)), 0),
            quantity: total(aggregate(c.items)),
          }))
          .sort((a, b) => b.minimumStacksEstimate - a.minimumStacksEstimate || a.distance - b.distance),
      });
      break;
    case 'storage-redundancy': {
      const copies = quantity(args[0], 1, 100);
      result = stock({
        copies,
        items: stored
          .map((item) => ({ ...item, containers: sources(item.name).length }))
          .filter((item) => item.containers < copies),
      });
      break;
    }
    case 'exclusive-stock':
      result = stock({
        items: stored
          .map((item) => ({ ...item, sources: sources(item.name) }))
          .filter((item) => item.sources.length === 1),
      });
      break;
    case 'container-overlap': {
      if (opened.length > 200) throw new Error('Pair comparisons support at most 200 opened containers.');
      const contents = opened.map((c) => aggregate(c.items)),
        pairs = [];
      for (let i = 0; i < opened.length; i++)
        for (let j = i + 1; j < opened.length; j++) {
          const shared = contents[i].filter((item) => count(contents[j], item.name) > 0).map((item) => item.name);
          pairs.push({ first: position(opened[i]), second: position(opened[j]), shared, sharedTypes: shared.length });
        }
      result = stock({ pairs });
      break;
    }
    case 'storage-fragmentation': {
      const contents = opened.map((c) => aggregate(c.items));
      const estimates = stored.map((item) => ({
        ...item,
        occupiedStacks: null,
        minimumStacksEstimate: contents.reduce((n, list) => n + Math.ceil(count(list, item.name) / size(item.name)), 0),
        pooledStacksEstimate: Math.ceil(item.count / size(item.name)),
      }));
      result = stock({
        estimateNote: STORAGE_ESTIMATE_NOTE,
        items: estimates.map((item) => ({
          ...item,
          potentiallyFreed: null,
          minimumPotentiallyFreedEstimate: Math.max(0, item.minimumStacksEstimate - item.pooledStacksEstimate),
        })),
        potentiallyFreed: null,
        minimumPotentiallyFreedEstimate: estimates.reduce(
          (n, item) => n + Math.max(0, item.minimumStacksEstimate - item.pooledStacksEstimate),
          0,
        ),
      });
      break;
    }
    case 'freshness-summary': {
      const seconds = quantity(args[0]);
      if (!Number.isFinite(now)) throw new Error('Current time must be finite.');
      const timed = opened.filter((c) => Number.isFinite(c.observedAt));
      result = stock({
        seconds,
        fresh: timed.filter((c) => c.observedAt <= now && now - c.observedAt < seconds * 1000).length,
        stale: timed.filter((c) => now - c.observedAt >= seconds * 1000).length,
        future: timed.filter((c) => c.observedAt > now).length,
        untimed: opened.length - timed.length,
      });
      break;
    }
    case 'untimed-storage':
      result = stock({ containers: opened.filter((c) => !Number.isFinite(c.observedAt)).map(located) });
      break;
    case 'observation-window': {
      const times = opened.map((c) => c.observedAt).filter(Number.isFinite);
      const oldest = times.length ? Math.min(...times) : null,
        newest = times.length ? Math.max(...times) : null;
      result = stock({
        timed: times.length,
        untimed: opened.length - times.length,
        oldest,
        newest,
        spanSeconds: times.length ? (newest - oldest) / 1000 : null,
      });
      break;
    }
    case 'kit-containers': {
      const kit = manifest(args);
      result = stock({
        containers: opened
          .map((c) => ({ ...located(c), ...bundle(kit, aggregate(c.items)) }))
          .filter((c) => c.bundles > 0),
      });
      break;
    }
    case 'storage-stack-sizes':
      result = stock({ groups: groups(stored) });
      break;
    case 'source-distances': {
      const name = itemName(args[0]),
        locations = sources(name),
        amount = total(locations);
      result = stock({
        item: name,
        quantity: amount,
        sources: locations.length,
        nearest: locations.length ? Math.min(...locations.map((c) => c.distance)) : null,
        farthest: locations.length ? Math.max(...locations.map((c) => c.distance)) : null,
        quantityWeightedDistance: amount ? locations.reduce((n, c) => n + c.count * c.distance, 0) / amount : null,
      });
      break;
    }
    default:
      throw new Error(`Unknown logistics report: ${command}.`);
  }
  return { ...result, note: NOTE };
}

export function registerLogisticsTools(program, { view }) {
  const group = program
    .command('logistics')
    .description('Read-only manifest, hauling, and storage distribution estimates.');
  for (const [signature, description] of LOGISTICS_COMMANDS) {
    const name = signature.split(' ')[0];
    group
      .command(signature)
      .description(description)
      .action((...values) => view((state) => logisticsReport(state, name, values.slice(0, -2).flat())));
  }
  return group;
}
