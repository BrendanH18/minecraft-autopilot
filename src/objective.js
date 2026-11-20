import { z } from 'zod';
import { normalizeAction, positionSchema } from './protocol.js';
import { freeSlotsView, MAIN_SLOTS } from './cli-views.js';
import { CRAFTABLE_ITEMS, MAX_CRAFT_COUNT, RECIPES } from './recipes.js';

export const COLLECTIBLE_BLOCKS = Object.freeze([
  'oak_log',
  'birch_log',
  'spruce_log',
  'jungle_log',
  'acacia_log',
  'dark_oak_log',
  'cherry_log',
  'mangrove_log',
  'dirt',
  'cobblestone',
  'sand',
]);
const collectible = new Set(COLLECTIBLE_BLOCKS);
const point = z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() });
const inventory = z.array(z.object({ name: z.string(), count: z.number().int().nonnegative() }));
const blockPosition = z.object({ x: z.number().int(), y: z.number().int(), z: z.number().int() });
const container = blockPosition.extend({
  items: inventory.nullable(),
  firstSeen: inventory.optional(),
  sources: z
    .array(z.object({ id: z.string().min(1), items: inventory }))
    .min(1)
    .optional(),
});
const containers = z.array(container);
// Task-scoped verification also matches by block name and current members (the bot, Fabric, and demo report both).
const scopedContainers = z.array(
  container.extend({ name: z.string().optional(), members: z.array(blockPosition).optional() }),
);
// What a deposit reports on the bot, Fabric, and demo: the container it used and that container's live contents just before the deposit.
const depositedContainer = blockPosition.extend({ name: z.string().optional(), before: inventory });
const criteriaSchema = z
  .object({
    collect: z
      .object({ block: z.string(), count: z.number().int().min(1).max(64) })
      .strict()
      .optional(),
    deposit: z
      .object({ item: z.string(), count: z.number().int().min(1).max(2304) })
      .strict()
      .optional(),
    withdraw: z
      .object({ item: z.string(), count: z.number().int().min(1).max(2304) })
      .strict()
      .optional(),
    craft: z
      .object({ item: z.string(), count: z.number().int().min(1).max(MAX_CRAFT_COUNT) })
      .strict()
      .optional(),
    returnHome: z.boolean().optional(),
    homeRadius: z.number().finite().min(0).max(64).optional(),
    minHealth: z.number().finite().min(1).max(20).optional(),
    minHunger: z.number().int().min(0).max(20).optional(),
    destination: positionSchema.extend({ radius: z.number().finite().min(0).max(64).default(2) }).optional(),
    inventory: z
      .object({ item: z.string(), count: z.number().int().min(1).max(2304) })
      .strict()
      .optional(),
    maxThreats: z.number().int().min(0).optional(),
    maxInventory: z
      .object({ item: z.string(), count: z.number().int().min(0).max(2304) })
      .strict()
      .optional(),
    maxDistance: z.number().finite().min(0).max(10_000).optional(),
    minFreeSlots: z.number().int().min(0).max(MAIN_SLOTS).optional(),
    maxHealthLoss: z.number().finite().min(0).max(20).optional(),
  })
  .strict();

export function parseCollectionCriterion(value) {
  const match = /^(?:minecraft:)?([a-z0-9_]+):([0-9]+)$/.exec(value);
  if (!match || !collectible.has(match[1]))
    throw new Error('Use a supported collection target and count, for example oak_log:8.');
  const { block, count } = normalizeAction({ type: 'collect', block: match[1], count: Number(match[2]) });
  return { block, count };
}

export function parseDepositCriterion(value) {
  const match = /^(?:minecraft:)?([a-z0-9_]+):([0-9]+)$/.exec(value);
  if (!match) throw new Error('Use an item and count, for example oak_log:8.');
  const { item, count } = normalizeAction({ type: 'deposit', item: match[1], count: Number(match[2]) });
  return { item, count };
}

export function parseWithdrawCriterion(value) {
  const match = /^(?:minecraft:)?([a-z0-9_]+):([0-9]+)$/.exec(value);
  if (!match) throw new Error('Use an item and count, for example oak_log:8.');
  const { item, count } = normalizeAction({ type: 'withdraw', item: match[1], count: Number(match[2]) });
  return { item, count };
}

export function parseCraftCriterion(value) {
  const match = /^(?:minecraft:)?([a-z0-9_]+):([0-9]+)$/.exec(value);
  if (!match || !RECIPES[`minecraft:${match[1]}`])
    throw new Error(
      `Use a craftable item and count, for example stone_pickaxe:1. Craftable: ${CRAFTABLE_ITEMS.join(', ')}.`,
    );
  const { item, count } = normalizeAction({ type: 'craft', item: match[1], count: Number(match[2]) });
  return { item, count };
}

export function parseInventoryCriterion(value) {
  return parseDepositCriterion(value);
}

/** An upper bound on held items; zero proves none remain, for example after storing everything. */
export function parseMaxInventoryCriterion(value) {
  const match = /^(?:minecraft:)?([a-z0-9_]+):([0-9]+)$/.exec(value);
  if (!match || Number(match[2]) > 2304)
    throw new Error('Use an item and a maximum count from 0 to 2304, for example oak_log:0.');
  return { item: normalizeAction({ type: 'deposit', item: match[1] }).item, count: Number(match[2]) };
}

export function parseDestinationCriterion(value) {
  const parts = value.split(',');
  if (parts.length < 3 || parts.length > 4 || parts.some((part) => !part.trim()))
    throw new Error('Use x,y,z or x,y,z,radius for a destination.');
  const [x, y, z, radius = 2] = parts.map(Number);
  return criteriaSchema.shape.destination.parse({ x, y, z, radius });
}

/**
 * Checks explicit criteria only; free-form goal text is never parsed as a contract.
 * Collect, withdraw, and craft each require a held gain: the final held count minus the count held when the task began,
 * whatever produced it. Items a later craft consumes (planks into sticks) no longer count. When deposit names the same item
 * as collect or craft, items stored during the task count toward that gain too. One item may be the target of only one of
 * collect, withdraw, and craft, and withdraw cannot share its item with deposit, because each gain would then be ambiguous.
 * With scopedStorage, deposit criteria count only containers recorded with trackDeposit, each against its contents just
 * before the task's first deposit into it, so unrelated storage opened earlier in the session is neither counted nor reopened.
 */
export function createObjective(criteria, initialState, { scopedStorage = false } = {}) {
  const parsed = criteriaSchema.parse(criteria);
  if (parsed.homeRadius !== undefined && !parsed.returnHome) throw new Error('homeRadius requires returnHome.');
  if (
    !parsed.collect &&
    !parsed.deposit &&
    !parsed.withdraw &&
    !parsed.craft &&
    !parsed.returnHome &&
    parsed.minHealth === undefined &&
    parsed.minHunger === undefined &&
    !parsed.destination &&
    !parsed.inventory &&
    parsed.maxThreats === undefined &&
    !parsed.maxInventory &&
    parsed.maxDistance === undefined &&
    parsed.minFreeSlots === undefined &&
    parsed.maxHealthLoss === undefined
  )
    return null;
  const requiredInventory = parsed.inventory
    ? parseInventoryCriterion(`${parsed.inventory.item}:${parsed.inventory.count}`)
    : null;
  const maxInventory = parsed.maxInventory
    ? parseMaxInventoryCriterion(`${parsed.maxInventory.item}:${parsed.maxInventory.count}`)
    : null;
  const player = z.object({ uuid: z.string().min(1), dimension: z.string().min(1) }).parse(initialState.player);
  let start = null;
  if (parsed.maxDistance !== undefined) {
    const position = point.safeParse(initialState.player.position);
    if (!position.success)
      throw new Error('The starting position is unavailable, so --verify-max-distance cannot be checked.');
    start = position.data;
  }
  const initialHealth = parsed.maxHealthLoss === undefined ? null : initialState.player.health;
  if (parsed.maxHealthLoss !== undefined && !Number.isFinite(initialHealth))
    throw new Error('The starting health is unavailable, so --verify-max-health-loss cannot be checked.');
  const collect = parsed.collect ? parseCollectionCriterion(`${parsed.collect.block}:${parsed.collect.count}`) : null;
  const heldCount = (state, name) =>
    inventory
      .parse(state.inventory)
      .filter((item) => item.name === name)
      .reduce((total, item) => total + item.count, 0);
  const count = (state) => heldCount(state, collect.block);
  const initialCount = collect ? count(initialState) : null;
  const deposit = parsed.deposit ? parseDepositCriterion(`${parsed.deposit.item}:${parsed.deposit.count}`) : null;
  const withdraw = parsed.withdraw ? parseWithdrawCriterion(`${parsed.withdraw.item}:${parsed.withdraw.count}`) : null;
  const craft = parsed.craft ? parseCraftCriterion(`${parsed.craft.item}:${parsed.craft.count}`) : null;
  const gains = [
    collect && ['collect', collect.block],
    withdraw && ['withdraw', withdraw.item],
    craft && ['craft', craft.item],
  ].filter(Boolean);
  for (const [index, [name, item]] of gains.entries()) {
    const other = gains.slice(index + 1).find(([, otherItem]) => otherItem === item);
    if (other)
      throw new Error(
        `The ${name} and ${other[0]} criteria both count held ${item}, so neither gain could be verified. Choose one.`,
      );
  }
  if (withdraw && deposit?.item === withdraw.item)
    throw new Error(
      `The withdraw and deposit criteria both name ${withdraw.item}; moving it out of and into storage cannot be verified together.`,
    );
  const withdrawInitial = withdraw ? heldCount(initialState, withdraw.item) : null;
  const craftInitial = craft ? heldCount(initialState, craft.item) : null;
  let initialStored;
  const initialSources = new Set();
  const discoveredSources = new Map();
  const key = (container) => `${container.x},${container.y},${container.z}`;
  const sources = (container) =>
    container.sources ?? [{ id: key(container), items: container.firstSeen ?? container.items }];
  // Task-scoped storage: [{ name, x, y, z, sources: [id], before }], in first-deposit order.
  const scope = [];
  const realSources = (container) => (container.sources || []).map((source) => source.id);
  const positions = (container) => [container, ...(container.members || [])].map(key);
  // Bot records keep source IDs across chest merges and splits; a backend without them (the demo) matches by coordinate and block.
  const tracks = (entry, container) =>
    entry.sources.length
      ? realSources(container).some((id) => entry.sources.includes(id))
      : positions(container).includes(key(entry)) && (!entry.name || !container.name || entry.name === container.name);
  const taskContainers = (list) => {
    const seen = new Set();
    return list.filter((container) => {
      if (seen.has(key(container)) || !scope.some((entry) => tracks(entry, container))) return false;
      seen.add(key(container));
      return true;
    });
  };
  if (deposit && !Array.isArray(initialState.containers))
    throw new Error(
      'This backend does not report container contents; --verify-deposit needs a bridge that reports storage.',
    );
  if (deposit && !scopedStorage) {
    // Contents known before the task are the baseline; a container first opened during the task uses what it held then.
    const seenInitial = new Set();
    initialStored = containers.parse(initialState.containers).filter((container) => {
      if (!container.items || seenInitial.has(key(container))) return false;
      seenInitial.add(key(container));
      return true;
    });
    for (const container of initialStored) for (const source of sources(container)) initialSources.add(source.id);
  }
  const held = (items, name) =>
    items.filter((item) => item.name === name).reduce((total, item) => total + item.count, 0);
  let home;
  if (parsed.returnHome) {
    if (!initialState.home) throw new Error('Save a home before using --verify-home.');
    home = point.parse(initialState.home);
  }
  return {
    description: {
      collect: collect ? { ...collect, initialCount } : null,
      deposit,
      ...(withdraw && { withdraw: { ...withdraw, initialCount: withdrawInitial } }),
      ...(craft && { craft: { ...craft, initialCount: craftInitial } }),
      home: home || null,
      ...(home && { homeRadius: parsed.homeRadius ?? 2 }),
      ...(parsed.minHealth !== undefined && { minHealth: parsed.minHealth }),
      ...(parsed.minHunger !== undefined && { minHunger: parsed.minHunger }),
      ...(parsed.destination && { destination: parsed.destination }),
      ...(requiredInventory && { inventory: requiredInventory }),
      ...(parsed.maxThreats !== undefined && { maxThreats: parsed.maxThreats }),
      ...(maxInventory && { maxInventory }),
      ...(start && { maxDistance: { start, radius: parsed.maxDistance } }),
      ...(parsed.minFreeSlots !== undefined && { minFreeSlots: parsed.minFreeSlots }),
      ...(parsed.maxHealthLoss !== undefined && {
        maxHealthLoss: { initial: initialHealth, maximum: parsed.maxHealthLoss },
      }),
    },
    check(state, { storageRefreshed = false } = {}) {
      const samePlayer =
        state.connected === true &&
        state.player?.uuid === player.uuid &&
        state.player?.dimension === player.dimension &&
        Number.isFinite(state.player.health) &&
        state.player.health > 0;
      const checks = {};
      let stored = null;
      if (deposit && scopedStorage) {
        const current = samePlayer ? taskContainers(scopedContainers.parse(state.containers || [])) : null;
        // A tracked inventory merged with other known storage holds stock whose starting amount this task never read.
        const tracked = new Set(scope.flatMap((entry) => entry.sources));
        const foreign = current?.some((container) => realSources(container).some((id) => !tracked.has(id)));
        // Another inventory already split from the receiving one shares its history, but its starting stock was never read.
        const split = scope.some((entry) => entry.split);
        const contents =
          current === null
            ? null
            : current.reduce(
                (total, container) => total + (container.items ? held(container.items, deposit.item) : 0),
                0,
              );
        stored =
          contents === null
            ? null
            : contents - scope.reduce((total, entry) => total + held(entry.before, deposit.item), 0);
        checks.deposit = {
          item: deposit.item,
          storedAdditional: stored,
          requiredAdditional: deposit.count,
          evidence: storageRefreshed ? 'refreshed' : 'last_observed',
          containers: scope.map(({ x, y, z }) => ({ x, y, z })),
          met: stored !== null && !foreign && !split && stored >= deposit.count,
          ...(foreign && {
            error:
              'Storage this task deposited into merged with other known storage whose starting contents were not read during the task.',
          }),
          ...(split &&
            !foreign && {
              error:
                'Storage this task deposited into had already split from other known storage whose starting contents were not read during the task.',
            }),
        };
      } else if (deposit) {
        const current = samePlayer
          ? containers.parse(state.containers || []).filter((container) => container.items)
          : null;
        const seen = new Set();
        const contents =
          current === null
            ? null
            : current.reduce((total, container) => {
                // Only current coordinates deduplicate inventory; historical sources never hide a separate container.
                if (seen.has(key(container))) return total;
                seen.add(key(container));
                for (const source of sources(container))
                  if (!initialSources.has(source.id) && !discoveredSources.has(source.id))
                    discoveredSources.set(source.id, source.items);
                return total + held(container.items, deposit.item);
              }, 0);
        const baseline =
          initialStored.reduce((total, container) => total + held(container.items, deposit.item), 0) +
          [...discoveredSources.values()].reduce((total, items) => total + held(items, deposit.item), 0);
        stored = contents === null ? null : contents - baseline;
        checks.deposit = {
          item: deposit.item,
          storedAdditional: stored,
          requiredAdditional: deposit.count,
          evidence: storageRefreshed ? 'refreshed' : 'last_observed',
          met: stored !== null && stored >= deposit.count,
        };
      }
      if (collect) {
        const currentCount = samePlayer ? count(state) : null;
        // For gather-and-store, moving existing inventory into a chest must not count as newly collected.
        const storedAdditional = deposit?.item === collect.block ? stored : 0;
        checks.inventory = {
          item: collect.block,
          initialCount,
          currentCount,
          requiredAdditional: collect.count,
          ...(deposit?.item === collect.block && { storedAdditional }),
          met:
            currentCount !== null &&
            storedAdditional !== null &&
            currentCount - initialCount + storedAdditional >= collect.count,
        };
      }
      if (withdraw) {
        const currentCount = samePlayer ? heldCount(state, withdraw.item) : null;
        checks.withdraw = {
          item: withdraw.item,
          initialCount: withdrawInitial,
          currentCount,
          requiredAdditional: withdraw.count,
          met: currentCount !== null && currentCount - withdrawInitial >= withdraw.count,
        };
      }
      if (craft) {
        const currentCount = samePlayer ? heldCount(state, craft.item) : null;
        // Like collect: a crafted item the task then stored still counts once.
        const storedAdditional = deposit?.item === craft.item ? stored : 0;
        checks.craft = {
          item: craft.item,
          initialCount: craftInitial,
          currentCount,
          requiredAdditional: craft.count,
          ...(deposit?.item === craft.item && { storedAdditional }),
          met:
            currentCount !== null &&
            storedAdditional !== null &&
            currentCount - craftInitial + storedAdditional >= craft.count,
        };
      }
      if (home) {
        const position = samePlayer ? point.parse(state.player.position) : null;
        const distance = position ? Math.hypot(position.x - home.x, position.y - home.y, position.z - home.z) : null;
        checks.home = {
          target: home,
          distance,
          radius: parsed.homeRadius ?? 2,
          met: distance !== null && distance <= (parsed.homeRadius ?? 2),
        };
      }
      if (parsed.minHealth !== undefined) {
        const current = samePlayer ? state.player.health : null;
        checks.health = { current, required: parsed.minHealth, met: current !== null && current >= parsed.minHealth };
      }
      if (parsed.minHunger !== undefined) {
        const current =
          samePlayer && Number.isInteger(state.player.hunger) && state.player.hunger >= 0 && state.player.hunger <= 20
            ? state.player.hunger
            : null;
        checks.hunger = { current, required: parsed.minHunger, met: current !== null && current >= parsed.minHunger };
      }
      if (parsed.destination) {
        const position = samePlayer ? point.parse(state.player.position) : null;
        const target = parsed.destination;
        const distance = position
          ? Math.hypot(position.x - target.x, position.y - target.y, position.z - target.z)
          : null;
        checks.destination = { target, distance, met: distance !== null && distance <= target.radius };
      }
      if (requiredInventory) {
        const current = samePlayer ? held(inventory.parse(state.inventory), requiredInventory.item) : null;
        checks.heldInventory = {
          item: requiredInventory.item,
          current,
          required: requiredInventory.count,
          met: current !== null && current >= requiredInventory.count,
        };
      }
      if (parsed.maxThreats !== undefined) {
        const current = samePlayer && Array.isArray(state.threats) ? state.threats.length : null;
        checks.threats = {
          observed: current,
          maximum: parsed.maxThreats,
          met: current !== null && current <= parsed.maxThreats,
        };
      }
      if (maxInventory) {
        // A missing inventory is unavailable data, not an empty one.
        const current =
          samePlayer && Array.isArray(state.inventory)
            ? held(inventory.parse(state.inventory), maxInventory.item)
            : null;
        checks.maxInventory = {
          item: maxInventory.item,
          current,
          maximum: maxInventory.count,
          met: current !== null && current <= maxInventory.count,
        };
      }
      if (start) {
        const position = samePlayer ? point.safeParse(state.player.position) : null;
        const distance = position?.success
          ? Math.hypot(position.data.x - start.x, position.data.y - start.y, position.data.z - start.z)
          : null;
        checks.maxDistance = {
          start,
          distance,
          maximum: parsed.maxDistance,
          met: distance !== null && distance <= parsed.maxDistance,
        };
      }
      if (parsed.minFreeSlots !== undefined) {
        // Distinct occupied main slots, as the free-slots command counts them; a missing inventory is unavailable.
        const free = samePlayer && Array.isArray(state.inventory) ? freeSlotsView(state).free : null;
        checks.freeSlots = { free, required: parsed.minFreeSlots, met: free !== null && free >= parsed.minFreeSlots };
      }
      if (initialHealth !== null) {
        const current = samePlayer ? state.player.health : null;
        const loss = current === null ? null : Math.max(0, initialHealth - current);
        checks.healthLoss = {
          initial: initialHealth,
          current,
          loss,
          maximum: parsed.maxHealthLoss,
          met: current !== null && current >= initialHealth - parsed.maxHealthLoss,
        };
      }
      return { met: samePlayer && Object.values(checks).every((check) => check.met), samePlayer, checks };
    },
    /** Records the container a deposit reported; only the first deposit into a container sets its baseline. */
    trackDeposit(reported, state) {
      if (!deposit || !scopedStorage) return;
      const entry = depositedContainer.parse(reported);
      const recorded = scopedContainers.safeParse(state?.containers || []).data || [];
      const record = recorded.find(
        (container) =>
          positions(container).includes(key(entry)) &&
          (!entry.name || !container.name || entry.name === container.name),
      );
      const sources = record ? realSources(record) : [];
      // Source IDs tell a replacement chest at the same coordinate apart; coordinates decide only when either side lacks them.
      const known = scope.find((existing) =>
        existing.sources.length && sources.length
          ? sources.some((id) => existing.sources.includes(id))
          : key(existing) === key(entry) && (!existing.name || !entry.name || existing.name === entry.name),
      );
      // A later deposit never adopts sources: one merged in after the first deposit has no task baseline and stays foreign.
      const split =
        record &&
        recorded.some((other) => key(other) !== key(record) && realSources(other).some((id) => sources.includes(id)));
      if (!known)
        scope.push({
          name: entry.name,
          x: entry.x,
          y: entry.y,
          z: entry.z,
          sources,
          before: entry.before.map((item) => ({ ...item })),
          ...(split && { split: true }),
        });
    },
    /** Positions a final inspection must reopen: each tracked container and every current inventory descended from one. */
    storageTargets(state) {
      const targets = new Map(scope.map(({ x, y, z }) => [key({ x, y, z }), { x, y, z }]));
      for (const { x, y, z } of taskContainers(scopedContainers.safeParse(state?.containers || []).data || []))
        targets.set(key({ x, y, z }), { x, y, z });
      return [...targets.values()];
    },
  };
}
