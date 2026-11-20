import { setTimeout as delay } from 'node:timers/promises';
import { RECIPES, craftsFor, describeMissing, planCraft } from './recipes.js';

export const demoScenarios = ['default', 'hungry', 'hostile', 'stocked', 'full'];
const MAIN_SLOTS = 36;
const STACK_SIZE = 64;
const short = (name) => name.replace('minecraft:', '');
// Tools do not stack; every other demo item stacks to 64.
const stackSize = (name) => (/_(?:pickaxe|axe|shovel)$/.test(name) ? 1 : STACK_SIZE);
/** Room for `name` in the 36 main slots: empty slots plus partial stacks of it. */
function roomFor(inventory, name) {
  const used = inventory.filter((stack) => stack.count > 0);
  const partial = used
    .filter((stack) => stack.name === name)
    .reduce((sum, stack) => sum + Math.max(0, stackSize(name) - stack.count), 0);
  return (MAIN_SLOTS - used.length) * stackSize(name) + partial;
}
/** Adds up to `count` of `name`, partial stacks first, then empty main slots; returns how many fit. */
function addItems(inventory, name, count) {
  let remaining = count;
  for (const stack of inventory.filter((stack) => stack.name === name && stack.count > 0)) {
    const added = Math.min(remaining, Math.max(0, stackSize(name) - stack.count));
    stack.count += added;
    remaining -= added;
  }
  while (remaining > 0) {
    const used = new Set(inventory.filter((stack) => stack.count > 0).map((stack) => stack.slot));
    const slot = Array.from({ length: MAIN_SLOTS }, (_, index) => index).find((index) => !used.has(index));
    if (slot === undefined) break;
    const added = Math.min(remaining, stackSize(name));
    inventory.push({ slot, name, count: added });
    remaining -= added;
  }
  return count - remaining;
}
/** Removes `count` of `name` from the inventory's stacks in slot order. */
function removeItems(inventory, name, count) {
  let remaining = count;
  for (const stack of inventory.filter((stack) => stack.name === name)) {
    const taken = Math.min(stack.count, remaining);
    stack.count -= taken;
    remaining -= taken;
  }
}
const FULL_STACKS = [
  ['minecraft:cobblestone', 20],
  ['minecraft:dirt', 10],
  ['minecraft:sand', 5],
];

/** A simulation for exercising the protocol; deliberately does not claim real gameplay. */
export class DemoDriver {
  constructor({ scenario = 'default' } = {}) {
    if (!demoScenarios.includes(scenario))
      throw new Error(`Unknown demo scenario: ${scenario}. Use ${demoScenarios.join(', ')}.`);
    this.scenario = scenario;
    this.player = {
      name: 'DemoPlayer',
      uuid: 'demo',
      health: 20,
      hunger: 14,
      dimension: 'minecraft:overworld',
      position: { x: 0, y: 64, z: 0 },
    };
    this.inventory = [{ slot: 0, name: 'minecraft:bread', count: 8 }];
    this.home = null;
    this.chest = { name: 'minecraft:chest', x: 3, y: 64, z: 3, items: null };
    // Set once a held crafting table is placed for a table recipe.
    this.craftingTable = null;
    this.threats = [];
    this.stopCount = 0;
    if (scenario === 'hungry') Object.assign(this.player, { health: 10, hunger: 4 });
    if (scenario === 'hostile') this.threats.push({ type: 'minecraft:zombie', x: 4, y: 64, z: -3 });
    if (scenario === 'full') {
      // Bread plus 35 full stacks occupies every main slot, so collection fails until a stack is stored.
      for (const [name, stacks] of FULL_STACKS)
        for (let i = 0; i < stacks; i++) this.inventory.push({ slot: this.inventory.length, name, count: 64 });
    }
    if (scenario === 'stocked')
      Object.assign(this.chest, {
        items: [
          { name: 'minecraft:oak_log', count: 12 },
          { name: 'minecraft:cobblestone', count: 5 },
        ],
        observedAt: Date.now(),
      });
  }
  observe() {
    const { x, y, z } = this.player.position;
    const threats = this.threats.map((threat) => ({
      ...threat,
      distance: Math.hypot(threat.x - x, threat.y - y, threat.z - z),
    }));
    return structuredClone({
      backend: 'demo',
      connected: true,
      paused: false,
      player: this.player,
      inventory: this.inventory,
      home: this.home,
      threats,
      survival: 'Simulation only',
      blocks: [
        { name: 'minecraft:oak_log', x: 5, y: 64, z: 5 },
        ...(this.craftingTable ? [{ name: 'minecraft:crafting_table', ...this.craftingTable }] : []),
      ],
      containers: [this.chest],
    });
  }
  async execute(action, { signal, onProgress }) {
    signal.throwIfAborted();
    if (action.type === 'inspect_storage') {
      // Scoped like the server bot: only the one demo chest, and only once it has been opened.
      for (const { x, y, z } of action.containers || []) {
        if (x !== this.chest.x || y !== this.chest.y || z !== this.chest.z)
          throw new Error(`There is no chest or barrel at ${x} ${y} ${z}.`);
        if (!this.chest.items)
          throw new Error(
            `The container at ${x} ${y} ${z} has not been opened in this session, so it has no contents to refresh.`,
          );
      }
      this.chest.observedAt = Date.now();
      return { message: action.containers ? 'Inspected the requested demo storage.' : 'Inspected demo storage.' };
    }
    if (action.type === 'set_home') {
      this.home = { ...this.player.position };
      return { message: 'Saved demo home.' };
    }
    if (action.type === 'wait') {
      await delay(action.seconds * 1000, undefined, { signal });
      return;
    }
    if (action.type === 'eat') {
      await delay(100, undefined, { signal });
      const food = this.inventory.find((item) => item.name === 'minecraft:bread' && item.count > 0);
      if (!food) throw new Error('No food.');
      food.count--;
      this.player.hunger = 20;
      return;
    }
    if (action.type === 'collect') {
      await delay(200, undefined, { signal });
      // Like the server bot: partial stacks of the target fill first, then empty main slots; what was collected stays.
      this.inventory = this.inventory.filter((stack) => stack.count > 0);
      const added = addItems(this.inventory, action.block, action.count);
      if (added < action.count)
        throw new Error(`Inventory full; collected ${added} of ${action.count} ${short(action.block)}.`);
      return { message: `Simulated collecting ${action.count} ${action.block}.` };
    }
    if (action.type === 'deposit') {
      await delay(200, undefined, { signal });
      const held = this.inventory
        .filter((item) => item.name === action.item)
        .reduce((sum, item) => sum + item.count, 0);
      if (held === 0 || action.count > held) throw new Error(`Only ${held} ${action.item} in inventory.`);
      let remaining = action.count ?? held;
      const amount = remaining;
      for (const item of this.inventory.filter((item) => item.name === action.item)) {
        const moved = Math.min(item.count, remaining);
        item.count -= moved;
        remaining -= moved;
      }
      this.inventory = this.inventory.filter((item) => item.count > 0);
      const items = this.chest.items || [];
      const before = structuredClone(items);
      this.chest.firstSeen ??= structuredClone(items);
      const stored = items.find((item) => item.name === action.item);
      if (stored) stored.count += amount;
      else items.push({ name: action.item, count: amount });
      this.chest.items = items;
      this.chest.observedAt = Date.now();
      const { name, x, y, z } = this.chest;
      return { message: `Simulated depositing ${amount} ${action.item}.`, container: { name, x, y, z, before } };
    }
    if (action.type === 'withdraw') return this.withdraw(action, signal);
    if (action.type === 'craft') return this.craft(action, signal, onProgress);
    const target = action.type === 'home' ? this.home : { x: action.x, y: action.y, z: action.z };
    if (!target) throw new Error('No home saved.');
    const start = { ...this.player.position };
    for (let step = 1; step <= 5; step++) {
      await delay(100, undefined, { signal });
      for (const axis of ['x', 'y', 'z'])
        this.player.position[axis] = start[axis] + ((target[axis] - start[axis]) * step) / 5;
      onProgress(`Moving: ${step * 20}%`);
    }
    return { message: 'Reached demo destination.' };
  }
  // The demo has one chest: it is a candidate while unopened or while its last-seen contents include the item.
  async withdraw(action, signal) {
    const name = short(action.item);
    const known = this.chest.items;
    const at = this.player.position;
    const inRange = Math.hypot(this.chest.x - at.x, this.chest.y - at.y, this.chest.z - at.z) <= 16;
    if (!inRange || (known && !known.some((item) => item.name === action.item && item.count > 0)))
      throw new Error(
        `No chest or barrel within 16 blocks is known to hold ${name}, and none nearby is unopened. Move near storage that holds it first.`,
      );
    await delay(200, undefined, { signal });
    const items = this.chest.items || [];
    const before = structuredClone(items);
    this.chest.firstSeen ??= structuredClone(items);
    const stored = items.find((item) => item.name === action.item)?.count || 0;
    const requested = action.count ?? stored;
    this.inventory = this.inventory.filter((stack) => stack.count > 0);
    const withdrawn = addItems(this.inventory, action.item, Math.min(requested, stored));
    const left = stored - withdrawn;
    this.chest.items = items
      .map((item) => (item.name === action.item ? { ...item, count: left } : item))
      .filter((item) => item.count > 0);
    this.chest.observedAt = Date.now();
    const { x, y, z } = this.chest;
    const container = { name: this.chest.name, x, y, z, before };
    const where = `demo chest at ${x} ${y} ${z}`;
    const fail = (message) => {
      throw Object.assign(new Error(message), { container });
    };
    if (withdrawn < Math.min(requested, stored)) fail(`Inventory full; withdrew ${withdrawn} of ${requested} ${name}.`);
    if (stored === 0)
      fail(
        action.count === undefined
          ? `The ${where} holds no ${name}.`
          : `The ${where} holds no ${name}; withdrew 0 of ${requested} ${name}.`,
      );
    if (stored < requested)
      fail(`The ${where} held only ${stored} ${name}; withdrew ${withdrawn} of ${requested} ${name}.`);
    return { message: `Simulated withdrawing ${withdrawn} ${name} from the ${where}.`, container };
  }
  async craft(action, signal, onProgress) {
    const recipe = RECIPES[action.item];
    const name = short(action.item);
    if (!recipe) throw new Error(`${name} is not a supported crafting output.`);
    const crafts = craftsFor(recipe, action.count);
    this.inventory = this.inventory.filter((stack) => stack.count > 0);
    const plan = planCraft(recipe, crafts, this.inventory);
    if (!plan.ok) throw new Error(`Missing ingredients for ${action.count} ${name}: ${describeMissing(plan.missing)}.`);
    let placed = '';
    if (recipe.table) {
      const { x, y, z } = this.player.position;
      const table = this.craftingTable;
      if (!table || Math.hypot(table.x - x, table.y - y, table.z - z) > 16) {
        if (!this.inventory.some((stack) => stack.name === 'minecraft:crafting_table'))
          throw new Error(`Crafting ${name} needs a crafting table; none is within 16 blocks and none is held.`);
        removeItems(this.inventory, 'minecraft:crafting_table', 1);
        this.inventory = this.inventory.filter((stack) => stack.count > 0);
        this.craftingTable = { x: Math.floor(x) + 1, y: Math.floor(y), z: Math.floor(z) };
        placed = `Placed a crafting table at ${this.craftingTable.x} ${this.craftingTable.y} ${this.craftingTable.z}. `;
        onProgress(placed.trim());
      }
    }
    let made = 0;
    for (let done = 0; done < crafts; done++) {
      // Cancellation, takeover, expiry, and stop land between crafts; completed crafts stay.
      await delay(50, undefined, { signal });
      const once = planCraft(recipe, 1, this.inventory);
      const after = structuredClone(this.inventory);
      for (const { name: item, count } of once.consume) removeItems(after, item, count);
      if (roomFor(after, recipe.output) < recipe.yield)
        throw new Error(`${placed}Inventory full; crafted ${made} of ${action.count} ${name}.`);
      this.inventory = after.filter((stack) => stack.count > 0);
      made += addItems(this.inventory, recipe.output, recipe.yield);
    }
    return { message: `${placed}Simulated crafting ${made} ${name}.` };
  }
  stop() {
    this.stopCount++;
  }
}
