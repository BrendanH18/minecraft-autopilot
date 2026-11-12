import { z } from 'zod';

export function itemName(value) {
  if (!/^(?:minecraft:)?[a-z0-9_]+$/.test(value) || value.length > 100) throw new Error('Use a Minecraft item or block name, for example oak_log.');
  return value.includes(':') ? value : `minecraft:${value}`;
}

export function playerPosition(state) {
  if (!state.connected || !state.player) throw new Error('Enter a world or connect to a server first.');
  const position = state.player.position;
  if (!position || !['x', 'y', 'z'].every(axis => Number.isFinite(position[axis]))) throw new Error('Player coordinates are unavailable.');
  return { x: position.x, y: position.y, z: position.z };
}

export function distanceTo(state, target) {
  const position = playerPosition(state);
  if (!target || !['x', 'y', 'z'].every(axis => Number.isFinite(target[axis]))) throw new Error('Target coordinates are unavailable.');
  target = { x: target.x, y: target.y, z: target.z };
  return { target, distance: Math.hypot(target.x - position.x, target.y - position.y, target.z - position.z),
    horizontalDistance: Math.hypot(target.x - position.x, target.z - position.z), verticalOffset: target.y - position.y };
}

export function inventoryView(state, { item } = {}) {
  const name = item === undefined ? null : itemName(item);
  const slots = (state.inventory || []).filter(slot => slot.count > 0 && (!name || slot.name === name));
  const counts = new Map();
  for (const slot of slots) counts.set(slot.name, (counts.get(slot.name) || 0) + slot.count);
  return { items: [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([name, count]) => ({ name, count })),
    totalItems: slots.reduce((sum, slot) => sum + slot.count, 0), occupiedSlots: slots.length };
}

export function nearbyView(state, field, { name, radius = Infinity, limit = 20 } = {}) {
  playerPosition(state);
  if (name !== undefined) name = itemName(name);
  const entries = (state[field] || []).map(entry => ({ ...entry,
    distance: Number.isFinite(entry.distance) ? entry.distance : distanceTo(state, { x: entry.x, y: entry.y, z: entry.z }).distance,
  })).filter(entry => (!name || entry.name === name) && entry.distance <= radius).sort((a, b) => a.distance - b.distance);
  return { observedCount: entries.length, [field]: entries.slice(0, limit) };
}

export function homeView(state) {
  return { home: state.home || null, ...(state.home && distanceTo(state, state.home)) };
}

export function storageView(state, options) {
  if (!Array.isArray(state.containers)) return { supported: false, containers: [] };
  return { supported: true, ...nearbyView(state, 'containers', options), contents: 'last_observed' };
}

export function healthView(state) {
  if (!state.connected || !state.player) throw new Error('Enter a world or connect to a server first.');
  return { health: state.player.health, hunger: state.player.hunger, alive: state.player.health > 0,
    mode: state.mode, recovering: state.recovering ?? false, survival: state.survival ?? null };
}

const finite = value => Number.isFinite(value) ? value : null;
const round = value => Math.round(value * 10) / 10;
const sumCount = (items, name) => (items || []).filter(item => item.count > 0 && (!name || item.name === name)).reduce((sum, item) => sum + item.count, 0);

export function summaryView(state) {
  const position = playerPosition(state);
  const { totalItems, occupiedSlots } = inventoryView(state);
  return { position, dimension: state.player.dimension ?? null, health: finite(state.player.health), hunger: finite(state.player.hunger),
    mode: state.mode ?? null, job: state.job ? { type: state.job.type, status: state.job.status } : null,
    homeDistance: state.home ? distanceTo(state, state.home).distance : null,
    threats: Array.isArray(state.threats) ? state.threats.length : null, totalItems, occupiedSlots };
}

export function jobView(state) {
  const job = state.job ? { id: state.job.id, type: state.job.type, status: state.job.status, message: state.job.message ?? null } : null;
  return { mode: state.mode ?? null, stopping: state.stopping ?? false, job };
}

/** Last observation per coordinate; an opened or newer record wins over an unopened or older one. */
export function uniqueContainers(containers) {
  const byPosition = new Map();
  for (const container of containers || []) {
    const key = `${container.x},${container.y},${container.z}`;
    const previous = byPosition.get(key);
    if (!previous || !Array.isArray(previous.items) && Array.isArray(container.items)
      || Array.isArray(previous.items) === Array.isArray(container.items) && (container.observedAt ?? 0) >= (previous.observedAt ?? 0)) byPosition.set(key, container);
  }
  return [...byPosition.values()];
}

export function findItemView(state, item) {
  const name = itemName(item);
  const inventory = inventoryView(state, { item: name }).totalItems;
  const supported = Array.isArray(state.containers);
  const known = uniqueContainers(state.containers);
  const opened = known.filter(container => Array.isArray(container.items));
  const containers = opened.map(container => ({ name: container.name ?? null, x: container.x, y: container.y, z: container.z,
    count: sumCount(container.items, name), distance: distanceTo(state, container).distance })).filter(container => container.count > 0)
    .sort((a, b) => a.distance - b.distance);
  const stored = containers.reduce((sum, container) => sum + container.count, 0);
  return { item: name, inventory, stored, total: inventory + stored, containers, supported,
    unopened: known.length - opened.length, contents: 'last_observed' };
}

export function storageTotalsView(state, { item } = {}) {
  if (!Array.isArray(state.containers)) return { supported: false, items: [], totalItems: 0, containersObserved: 0, unopened: 0 };
  const name = item === undefined ? null : itemName(item);
  const containers = uniqueContainers(state.containers);
  const opened = containers.filter(container => Array.isArray(container.items));
  const counts = new Map();
  for (const entry of opened.flatMap(container => container.items)) {
    if (entry.count > 0 && (!name || entry.name === name)) counts.set(entry.name, (counts.get(entry.name) || 0) + entry.count);
  }
  const items = [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return { supported: true, items, totalItems: items.reduce((sum, entry) => sum + entry.count, 0),
    containersObserved: opened.length, unopened: containers.length - opened.length, contents: 'last_observed' };
}

const COMPASS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
/** Minecraft facing: north is -Z, east is +X; yaw 0 faces south (+Z), 90 west, ±180 north, -90 east; positive pitch looks down. */
export function directionView(state, target) {
  const measured = distanceTo(state, target);
  const position = playerPosition(state);
  const dx = measured.target.x - position.x, dz = measured.target.z - position.z;
  const level = measured.horizontalDistance === 0;
  const bearing = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
  return { ...measured, compass: level ? null : COMPASS[Math.round(bearing / 45) % 8],
    yaw: level ? null : round(Math.atan2(-dx || 0, dz) * 180 / Math.PI),
    pitch: measured.distance === 0 ? null : round(-Math.atan2(measured.verticalOffset, measured.horizontalDistance) * 180 / Math.PI) || 0 };
}

export function nearestView(state, block) {
  const name = itemName(block);
  const [nearest] = nearbyView(state, 'blocks', { name, limit: 1 }).blocks;
  if (!nearest) return { name, found: false, message: `No ${name} observed; only loaded blocks reported by the backend are searched.` };
  return { name, found: true, ...directionView(state, nearest) };
}

/** Hunger points restored by common vanilla foods; harmful foods are deliberately omitted. */
export const FOOD_VALUES = { apple: 4, baked_potato: 5, beef: 3, beetroot: 1, beetroot_soup: 6, bread: 5, carrot: 3, chicken: 2, cod: 2,
  cooked_beef: 8, cooked_chicken: 6, cooked_cod: 5, cooked_mutton: 6, cooked_porkchop: 8, cooked_rabbit: 5, cooked_salmon: 6, cookie: 2,
  dried_kelp: 1, glow_berries: 2, golden_apple: 4, golden_carrot: 6, honey_bottle: 6, melon_slice: 2, mushroom_stew: 6, mutton: 2,
  porkchop: 3, potato: 1, pumpkin_pie: 8, rabbit: 3, rabbit_stew: 10, salmon: 2, sweet_berries: 2 };

export function foodView(state) {
  const { hunger } = healthView(state);
  const items = inventoryView(state).items.filter(({ name }) => FOOD_VALUES[name.replace(/^minecraft:/, '')])
    .map(({ name, count }) => { const each = FOOD_VALUES[name.replace(/^minecraft:/, '')]; return { name, count, hungerEach: each, hungerTotal: each * count }; });
  return { hunger: finite(hunger), missingHunger: Number.isFinite(hunger) ? Math.max(0, 20 - hunger) : null, items,
    totalHunger: items.reduce((sum, item) => sum + item.hungerTotal, 0) };
}

const STACK_1 = /(?:_sword|_pickaxe|_axe|_shovel|_hoe|_helmet|_chestplate|_leggings|_boots|_bucket|potion|_stew|_soup|_bed|_boat|minecart|shulker_box|^music_disc_.*)$|^(?:bow|crossbow|trident|shield|fishing_rod|shears|flint_and_steel|elytra|totem_of_undying|saddle|cake|enchanted_book|writable_book)$/;
const STACK_16 = /(?:_sign|_banner)$|^(?:ender_pearl|snowball|egg|bucket|honey_bottle|armor_stand|written_book)$/;
const STACK_64 = /(?:_log|_planks|_wood|_ingot|_ore|_nugget|_wool)$|^(?:dirt|cobblestone|stone|sand|gravel|stick|coal|torch|diamond|emerald|redstone)$/;
export function maxStackSize(name) {
  const short = itemName(name).slice('minecraft:'.length);
  if (STACK_1.test(short)) return { maxStack: 1, stackSizeAssumed: false };
  if (STACK_16.test(short)) return { maxStack: 16, stackSizeAssumed: false };
  return { maxStack: 64, stackSizeAssumed: !STACK_64.test(short) && !FOOD_VALUES[short] };
}

export const MAIN_SLOTS = 36;
export function freeSlotsView(state, { item } = {}) {
  const stacks = (state.inventory || []).filter(stack => stack.count > 0);
  const used = Math.min(MAIN_SLOTS, new Set(stacks.map((stack, index) => stack.slot ?? `index:${index}`)).size);
  const result = { slots: MAIN_SLOTS, used, free: MAIN_SLOTS - used };
  if (item === undefined) return result;
  const name = itemName(item);
  const { maxStack, stackSizeAssumed } = maxStackSize(name);
  const partial = stacks.filter(stack => stack.name === name).reduce((sum, stack) => sum + Math.max(0, maxStack - stack.count), 0);
  return { ...result, item: name, maxStack, stackSizeAssumed, room: result.free * maxStack + partial };
}

const SECRET_KEY = /token|secret|password|credential|lease|auth|cookie|session/i;
function stripSecrets(value) {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !SECRET_KEY.test(key)).map(([key, entry]) => [key, stripSecrets(entry)]));
}

export function snapshotView(state, now = new Date()) {
  playerPosition(state);
  const { job, stopping, ...rest } = state;
  return { savedAt: now.toISOString(), ...stripSecrets(rest) };
}

const coordinates = z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() });
const snapshotSchema = z.object({
  savedAt: z.iso.datetime(),
  player: z.object({ position: coordinates, dimension: z.string().optional(), health: z.number().nullish(), hunger: z.number().nullish() }),
  inventory: z.array(z.object({ name: z.string(), count: z.number().finite() })).default([]),
  home: coordinates.extend({ dimension: z.string().optional() }).nullish(),
});

function validSnapshot(value) {
  const result = snapshotSchema.safeParse(value);
  if (!result.success) throw new Error(`Snapshot is not a valid mc-agent snapshot (${result.error.issues[0].path.join('.') || 'root'}: ${result.error.issues[0].message}).`);
  return result.data;
}

export function parseSnapshot(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('Snapshot is not valid JSON.'); }
  return validSnapshot(parsed);
}

const delta = (from, to) => ({ from: finite(from), to: finite(to), delta: Number.isFinite(from) && Number.isFinite(to) ? to - from : null });
const sameHome = (a, b) => JSON.stringify(a && [a.x, a.y, a.z, a.dimension ?? null]) === JSON.stringify(b && [b.x, b.y, b.z, b.dimension ?? null]);

export function compareView(snapshot, state, now = new Date()) {
  const before = validSnapshot(snapshot);
  const position = playerPosition(state);
  const from = before.player.position;
  const counts = new Map();
  for (const [sign, stacks] of [[-1, before.inventory], [1, state.inventory || []]]) {
    for (const stack of stacks.filter(stack => stack.count > 0)) {
      const entry = counts.get(stack.name) || { from: 0, to: 0 };
      entry[sign < 0 ? 'from' : 'to'] += stack.count;
      counts.set(stack.name, entry);
    }
  }
  const inventory = [...counts].filter(([, entry]) => entry.from !== entry.to).sort(([a], [b]) => a.localeCompare(b))
    .map(([name, entry]) => ({ name, ...entry, delta: entry.to - entry.from }));
  return { savedAt: before.savedAt, elapsedSeconds: round((now - Date.parse(before.savedAt)) / 1000),
    position: { from, to: position, delta: { x: position.x - from.x, y: position.y - from.y, z: position.z - from.z },
      distanceMoved: Math.hypot(position.x - from.x, position.y - from.y, position.z - from.z) },
    dimensionChanged: (before.player.dimension ?? null) !== (state.player.dimension ?? null),
    health: delta(before.player.health, state.player.health), hunger: delta(before.player.hunger, state.player.hunger),
    homeChanged: !sameHome(before.home ?? null, state.home ?? null), inventory };
}
