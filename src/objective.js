import { z } from 'zod';
import { normalizeAction } from './protocol.js';

const collectible = new Set(['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log', 'cherry_log', 'mangrove_log', 'dirt', 'cobblestone', 'sand']);
const point = z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() });
const inventory = z.array(z.object({ name: z.string(), count: z.number().int().nonnegative() }));
const containers = z.array(z.object({ x: z.number().int(), y: z.number().int(), z: z.number().int(),
  items: inventory.nullable(), firstSeen: inventory.optional() }));
const criteriaSchema = z.object({
  collect: z.object({ block: z.string(), count: z.number().int().min(1).max(64) }).strict().optional(),
  deposit: z.object({ item: z.string(), count: z.number().int().min(1).max(2304) }).strict().optional(),
  returnHome: z.boolean().optional(),
}).strict();

export function parseCollectionCriterion(value) {
  const match = /^(?:minecraft:)?([a-z0-9_]+):([0-9]+)$/.exec(value);
  if (!match || !collectible.has(match[1])) throw new Error('Use a supported collection target and count, for example oak_log:8.');
  const { block, count } = normalizeAction({ type: 'collect', block: match[1], count: Number(match[2]) });
  return { block, count };
}

export function parseDepositCriterion(value) {
  const match = /^(?:minecraft:)?([a-z0-9_]+):([0-9]+)$/.exec(value);
  if (!match) throw new Error('Use an item and count, for example oak_log:8.');
  const { item, count } = normalizeAction({ type: 'deposit', item: match[1], count: Number(match[2]) });
  return { item, count };
}

/** Checks explicit criteria only; free-form goal text is never parsed as a contract. */
export function createObjective(criteria, initialState) {
  const parsed = criteriaSchema.parse(criteria);
  if (!parsed.collect && !parsed.deposit && !parsed.returnHome) return null;
  const player = z.object({ uuid: z.string().min(1), dimension: z.string().min(1) }).parse(initialState.player);
  const collect = parsed.collect ? parseCollectionCriterion(`${parsed.collect.block}:${parsed.collect.count}`) : null;
  const count = state => inventory.parse(state.inventory).filter(item => item.name === collect.block).reduce((total, item) => total + item.count, 0);
  const initialCount = collect ? count(initialState) : null;
  const deposit = parsed.deposit ? parseDepositCriterion(`${parsed.deposit.item}:${parsed.deposit.count}`) : null;
  let initialStored;
  if (deposit) {
    if (!Array.isArray(initialState.containers)) throw new Error('This backend does not report container contents; --verify-deposit needs the server bot or demo.');
    // Contents known before the task are the baseline; a container first opened during the task uses what it held then.
    initialStored = new Map(containers.parse(initialState.containers).filter(container => container.items)
      .map(container => [`${container.x},${container.y},${container.z}`, container.items]));
  }
  const held = (items, name) => items.filter(item => item.name === name).reduce((total, item) => total + item.count, 0);
  let home;
  if (parsed.returnHome) {
    if (!initialState.home) throw new Error('Save a home before using --verify-home.');
    home = point.parse(initialState.home);
  }
  return {
    description: { collect: collect ? { ...collect, initialCount } : null, deposit, home: home || null },
    check(state) {
      const samePlayer = state.connected === true && state.player?.uuid === player.uuid && state.player?.dimension === player.dimension && state.player.health > 0;
      const checks = {};
      if (collect) {
        const currentCount = samePlayer ? count(state) : null;
        checks.inventory = { item: collect.block, initialCount, currentCount, requiredAdditional: collect.count,
          met: currentCount !== null && currentCount - initialCount >= collect.count };
      }
      if (deposit) {
        const current = samePlayer ? containers.parse(state.containers || []).filter(container => container.items) : null;
        const stored = current && current.reduce((total, container) => {
          const baseline = initialStored.get(`${container.x},${container.y},${container.z}`) ?? container.firstSeen ?? container.items;
          return total + held(container.items, deposit.item) - held(baseline, deposit.item);
        }, 0);
        checks.deposit = { item: deposit.item, storedAdditional: stored, requiredAdditional: deposit.count, met: stored !== null && stored >= deposit.count };
      }
      if (home) {
        const position = samePlayer ? point.parse(state.player.position) : null;
        const distance = position ? Math.hypot(position.x - home.x, position.y - home.y, position.z - home.z) : null;
        checks.home = { target: home, distance, met: distance !== null && distance <= 2 };
      }
      return { met: samePlayer && Object.values(checks).every(check => check.met), samePlayer, checks };
    },
  };
}
