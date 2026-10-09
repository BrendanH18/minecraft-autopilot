import { z } from 'zod';
import { normalizeAction } from './protocol.js';

const collectible = new Set(['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log', 'cherry_log', 'mangrove_log', 'dirt', 'cobblestone', 'sand']);
const point = z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() });
const inventory = z.array(z.object({ name: z.string(), count: z.number().int().nonnegative() }));
const criteriaSchema = z.object({
  collect: z.object({ block: z.string(), count: z.number().int().min(1).max(64) }).strict().optional(),
  returnHome: z.boolean().optional(),
}).strict();

export function parseCollectionCriterion(value) {
  const match = /^(?:minecraft:)?([a-z0-9_]+):([0-9]+)$/.exec(value);
  if (!match || !collectible.has(match[1])) throw new Error('Use a supported collection target and count, for example oak_log:8.');
  const { block, count } = normalizeAction({ type: 'collect', block: match[1], count: Number(match[2]) });
  return { block, count };
}

/** Checks explicit criteria only; free-form goal text is never parsed as a contract. */
export function createObjective(criteria, initialState) {
  const parsed = criteriaSchema.parse(criteria);
  if (!parsed.collect && !parsed.returnHome) return null;
  const player = z.object({ uuid: z.string().min(1), dimension: z.string().min(1) }).parse(initialState.player);
  const collect = parsed.collect ? parseCollectionCriterion(`${parsed.collect.block}:${parsed.collect.count}`) : null;
  const count = state => inventory.parse(state.inventory).filter(item => item.name === collect.block).reduce((total, item) => total + item.count, 0);
  const initialCount = collect ? count(initialState) : null;
  let home;
  if (parsed.returnHome) {
    if (!initialState.home) throw new Error('Save a home before using --verify-home.');
    home = point.parse(initialState.home);
  }
  return {
    description: { collect: collect ? { ...collect, initialCount } : null, home: home || null },
    check(state) {
      const samePlayer = state.connected === true && state.player?.uuid === player.uuid && state.player?.dimension === player.dimension && state.player.health > 0;
      const checks = {};
      if (collect) {
        const currentCount = samePlayer ? count(state) : null;
        checks.inventory = { item: collect.block, initialCount, currentCount, requiredAdditional: collect.count,
          met: currentCount !== null && currentCount - initialCount >= collect.count };
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
