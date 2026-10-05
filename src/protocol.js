import { z } from 'zod';

export const positionSchema = z.object({
  x: z.number().finite().min(-29_999_984).max(29_999_984),
  y: z.number().finite().min(-64).max(320),
  z: z.number().finite().min(-29_999_984).max(29_999_984),
}).strict();

export const actionSchema = z.discriminatedUnion('type', [
  positionSchema.extend({ type: z.literal('goto') }),
  z.object({ type: z.literal('home') }).strict(),
  z.object({ type: z.literal('set_home') }).strict(),
  z.object({
    type: z.literal('collect'),
    block: z.string().regex(/^(?:minecraft:)?[a-z0-9_]+$/).max(100),
    count: z.number().int().min(1).max(64),
  }).strict(),
  z.object({ type: z.literal('eat') }).strict(),
  z.object({ type: z.literal('wait'), seconds: z.number().min(1).max(3600) }).strict(),
]);

export const terminalStatuses = new Set(['completed', 'failed', 'cancelled']);

export function normalizeAction(action) {
  const parsed = actionSchema.parse(action);
  if (parsed.type === 'collect' && !parsed.block.includes(':')) parsed.block = `minecraft:${parsed.block}`;
  return parsed;
}

export function assertPlayable(state) {
  if (!state.connected || !state.player) throw new Error('Enter a world or connect to a server first.');
  if (state.paused) throw new Error('Minecraft is paused. Resume the game before giving the agent control.');
  if (state.player.health <= 0) throw new Error('Your character is dead. Respawn manually before continuing.');
}

