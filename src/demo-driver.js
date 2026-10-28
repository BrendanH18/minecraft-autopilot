import { setTimeout as delay } from 'node:timers/promises';

/** A simulation for exercising the protocol; deliberately does not claim real gameplay. */
export class DemoDriver {
  constructor() {
    this.player = { name: 'DemoPlayer', uuid: 'demo', health: 20, hunger: 14, dimension: 'minecraft:overworld', position: { x: 0, y: 64, z: 0 } };
    this.inventory = [{ slot: 0, name: 'minecraft:bread', count: 8 }];
    this.home = null;
    this.chest = { name: 'minecraft:chest', x: 3, y: 64, z: 3, items: null };
    this.stopCount = 0;
  }
  observe() {
    return structuredClone({ backend: 'demo', connected: true, paused: false, player: this.player, inventory: this.inventory,
      home: this.home, threats: [], survival: 'Simulation only', blocks: [{ name: 'minecraft:oak_log', x: 5, y: 64, z: 5 }], containers: [this.chest] });
  }
  async execute(action, { signal, onProgress }) {
    signal.throwIfAborted();
    if (action.type === 'set_home') { this.home = { ...this.player.position }; return { message: 'Saved demo home.' }; }
    if (action.type === 'wait') { await delay(action.seconds * 1000, undefined, { signal }); return; }
    if (action.type === 'eat') {
      await delay(100, undefined, { signal });
      const food = this.inventory.find(item => item.name === 'minecraft:bread' && item.count > 0);
      if (!food) throw new Error('No food.');
      food.count--; this.player.hunger = 20; return;
    }
    if (action.type === 'collect') {
      await delay(200, undefined, { signal });
      let item = this.inventory.find(item => item.name === action.block);
      if (!item) { item = { slot: this.inventory.length, name: action.block, count: 0 }; this.inventory.push(item); }
      item.count += action.count;
      return { message: `Simulated collecting ${action.count} ${action.block}.` };
    }
    if (action.type === 'deposit') {
      await delay(200, undefined, { signal });
      const held = this.inventory.filter(item => item.name === action.item).reduce((sum, item) => sum + item.count, 0);
      if (held === 0 || action.count > held) throw new Error(`Only ${held} ${action.item} in inventory.`);
      let remaining = action.count ?? held;
      const amount = remaining;
      for (const item of this.inventory.filter(item => item.name === action.item)) {
        const moved = Math.min(item.count, remaining); item.count -= moved; remaining -= moved;
      }
      this.inventory = this.inventory.filter(item => item.count > 0);
      const items = this.chest.items || [];
      this.chest.firstSeen ??= structuredClone(items);
      const stored = items.find(item => item.name === action.item);
      if (stored) stored.count += amount; else items.push({ name: action.item, count: amount });
      this.chest.items = items;
      return { message: `Simulated depositing ${amount} ${action.item}.` };
    }
    const target = action.type === 'home' ? this.home : { x: action.x, y: action.y, z: action.z };
    if (!target) throw new Error('No home saved.');
    const start = { ...this.player.position };
    for (let step = 1; step <= 5; step++) {
      await delay(100, undefined, { signal });
      for (const axis of ['x', 'y', 'z']) this.player.position[axis] = start[axis] + (target[axis] - start[axis]) * step / 5;
      onProgress(`Moving: ${step * 20}%`);
    }
    return { message: 'Reached demo destination.' };
  }
  stop() { this.stopCount++; }
}
