import { setTimeout as delay } from 'node:timers/promises';

export const demoScenarios = ['default', 'hungry', 'hostile', 'stocked', 'full'];
const MAIN_SLOTS = 36;
const STACK_SIZE = 64;
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
      blocks: [{ name: 'minecraft:oak_log', x: 5, y: 64, z: 5 }],
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
      let remaining = action.count;
      for (const stack of this.inventory.filter((stack) => stack.name === action.block)) {
        const added = Math.min(remaining, Math.max(0, STACK_SIZE - stack.count));
        stack.count += added;
        remaining -= added;
      }
      while (remaining > 0) {
        const used = new Set(this.inventory.map((stack) => stack.slot));
        const slot = Array.from({ length: MAIN_SLOTS }, (_, index) => index).find((index) => !used.has(index));
        if (slot === undefined)
          throw new Error(
            `Inventory full; collected ${action.count - remaining} of ${action.count} ${action.block.replace('minecraft:', '')}.`,
          );
        const added = Math.min(remaining, STACK_SIZE);
        this.inventory.push({ slot, name: action.block, count: added });
        remaining -= added;
      }
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
  stop() {
    this.stopCount++;
  }
}
