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
