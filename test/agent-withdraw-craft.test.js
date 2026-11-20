import test from 'node:test';
import assert from 'node:assert/strict';
import { runAgent, decisionJsonSchema, parseAllowedActions } from '../src/agent.js';

const reply = (decision) =>
  new Response(JSON.stringify({ message: { content: JSON.stringify(decision) } }), { status: 200 });
const held = (inventory, name) => inventory.filter((item) => item.name === name).reduce((n, item) => n + item.count, 0);
const add = (inventory, name, count) => {
  const stack = inventory.find((item) => item.name === name);
  if (stack) stack.count += count;
  else inventory.push({ name, count });
};

// A scoped-storage backend whose withdraw and craft change inventory the way the bridge reports them.
function storageAdapter() {
  const chest = (x, items) => ({
    name: 'minecraft:chest',
    x,
    y: 64,
    z: 0,
    items,
    sources: [{ id: `chest-${x}`, items }],
    members: [{ x, y: 64, z: 0 }],
  });
  return {
    state: {
      connected: true,
      mode: 'manual',
      backend: 'mineflayer',
      player: { uuid: 'test', dimension: 'minecraft:overworld', health: 20, position: { x: 0, y: 64, z: 0 } },
      inventory: [{ name: 'minecraft:oak_log', count: 10 }],
      containers: [
        chest(1, [{ name: 'minecraft:oak_log', count: 5 }]),
        chest(2, [{ name: 'minecraft:cobblestone', count: 9 }]),
      ],
    },
    actions: [],
    inspections: [],
    releases: 0,
    async observe() {
      return structuredClone(this.state);
    },
    async acquire() {
      this.state.mode = 'agent';
    },
    async release() {
      this.releases++;
      this.state.mode = 'manual';
    },
    async execute(action) {
      this.actions.push(action);
      const inventory = this.state.inventory;
      const item = action.item?.includes(':') ? action.item : `minecraft:${action.item}`;
      if (action.type === 'inspect_storage') {
        this.inspections.push(action.containers);
        return { status: 'completed', message: 'Refreshed.' };
      }
      if (action.type === 'withdraw' || action.type === 'deposit') {
        const container = this.state.containers.find((candidate) =>
          action.type === 'deposit' ? candidate.x === 1 : held(candidate.items, item) > 0,
        );
        const before = structuredClone(container.items);
        const count = action.count ?? held(action.type === 'deposit' ? inventory : container.items, item);
        const sign = action.type === 'withdraw' ? 1 : -1;
        add(inventory, item, sign * count);
        add(container.items, item, -sign * count);
        const { name, x, y, z } = container;
        return { status: 'completed', message: `${action.type} ${count}.`, container: { name, x, y, z, before } };
      }
      if (action.type === 'craft') {
        // Two sticks per four planks is enough for these tests; planks come from logs.
        if (item === 'minecraft:oak_planks') {
          add(inventory, 'minecraft:oak_log', -Math.ceil(action.count / 4));
          add(inventory, item, Math.ceil(action.count / 4) * 4);
        } else if (item === 'minecraft:stick') {
          add(inventory, 'minecraft:oak_planks', -2 * Math.ceil(action.count / 4));
          add(inventory, item, Math.ceil(action.count / 4) * 4);
        } else add(inventory, item, action.count);
        return { status: 'completed', message: `Crafted ${action.count} ${item}.` };
      }
      return { status: 'completed' };
    },
  };
}

test('withdraw and craft are planner actions with flat-schema fields and the item alias repair', async () => {
  assert.ok(decisionJsonSchema.properties.type.enum.includes('withdraw'));
  assert.ok(decisionJsonSchema.properties.type.enum.includes('craft'));
  assert.deepEqual(parseAllowedActions('withdraw,craft'), ['withdraw', 'craft']);
  const adapter = storageAdapter();
  const decisions = [
    { type: 'withdraw', block: 'cobblestone', count: 3, x: 1 },
    { type: 'craft', block: 'oak_planks', count: 4 },
    { type: 'done', reason: 'Done.' },
  ];
  const inputs = [];
  const result = await runAgent(adapter, 'Get stone and make planks', {
    model: 'test',
    log() {},
    fetchImpl: async (_url, request) => {
      inputs.push(JSON.parse(JSON.parse(request.body).messages[1].content));
      return reply(decisions.shift());
    },
  });
  assert.equal(result.status, 'model_finished');
  assert.deepEqual(adapter.actions, [
    { type: 'withdraw', item: 'cobblestone', count: 3 },
    { type: 'craft', item: 'oak_planks', count: 4 },
  ]);
  // A withdraw reports its container, but its pre-transfer contents stay out of the model's context.
  assert.deepEqual(inputs[1].history[0].result.container, { name: 'minecraft:chest', x: 2, y: 64, z: 0 });
  assert.deepEqual(result.actionCounts, { withdraw: 1, craft: 1 });
});

test('craft decisions outside the allowlist or over 64 are invalid and never executed', async () => {
  for (const decision of [
    { type: 'craft', item: 'diamond_pickaxe', count: 1 },
    { type: 'craft', item: 'stick', count: 65 },
    { type: 'craft', item: 'stick' },
    { type: 'withdraw', item: 'Oak Log' },
  ]) {
    const adapter = storageAdapter();
    await assert.rejects(
      runAgent(adapter, 'Craft', { model: 'test', log() {}, fetchImpl: async () => reply(decision) }),
      /invalid action/,
    );
    assert.deepEqual(adapter.actions, []);
    assert.equal(adapter.releases, 1);
  }
});

test('the system prompt lists withdraw, craft, and the craftable items', async () => {
  const result = await runAgent(storageAdapter(), 'Craft a pickaxe', {
    model: 'test',
    dryRun: true,
    showPrompt: true,
    criteria: { craft: { item: 'stone_pickaxe', count: 1 } },
  });
  assert.match(result.systemPrompt, /withdraw\(item,count\), craft\(item,count\)/);
  assert.match(result.systemPrompt, /craft makes at least count of: oak_planks, .*stone_shovel\./);
  assert.match(result.systemPrompt, /a held one is placed automatically/);
  assert.match(result.systemPrompt, /Later crafts consume crafted planks and sticks/);
  assert.deepEqual(result.criteria.craft, { item: 'minecraft:stone_pickaxe', count: 1, initialCount: 0 });
  assert.equal(result.progress.checks.craft.met, false);
});

test('withdraw and craft criteria are verified from held items, not the model claim', async () => {
  const adapter = storageAdapter();
  const decisions = [
    { type: 'done', reason: 'Already done.' },
    { type: 'withdraw', item: 'cobblestone', count: 3 },
    { type: 'craft', item: 'oak_planks', count: 8 },
    { type: 'craft', item: 'stick', count: 4 },
    { type: 'done', reason: 'Have stone and planks.' },
    { type: 'craft', item: 'oak_planks', count: 4 },
    { type: 'done', reason: 'Have stone and planks.' },
  ];
  const result = await runAgent(adapter, 'Get stone and planks', {
    model: 'test',
    log() {},
    criteria: { withdraw: { item: 'cobblestone', count: 3 }, craft: { item: 'oak_planks', count: 8 } },
    fetchImpl: async () => reply(decisions.shift()),
  });
  assert.equal(result.status, 'criteria_met');
  assert.equal(result.verification.checks.withdraw.currentCount, 3);
  // Eight planks were crafted, two went into sticks, so a second planks craft was needed.
  assert.equal(result.verification.checks.craft.currentCount, 10);
  assert.equal(result.steps, 7);
});

test('a gain criterion item can come only from its own action, and deposit items are not withdrawn', async () => {
  const cases = [
    [{ collect: { block: 'cobblestone', count: 3 } }, { type: 'withdraw', item: 'cobblestone', count: 3 }, /collect/],
    [{ craft: { item: 'stick', count: 4 } }, { type: 'withdraw', item: 'minecraft:stick' }, /craft criterion/],
    [{ withdraw: { item: 'stick', count: 4 } }, { type: 'craft', item: 'stick', count: 4 }, /use withdraw/],
    [{ withdraw: { item: 'oak_log', count: 1 } }, { type: 'collect', block: 'oak_log', count: 1 }, /withdraw/],
    [{ deposit: { item: 'oak_log', count: 2 } }, { type: 'withdraw', item: 'oak_log', count: 2 }, /deposit criterion/],
  ];
  for (const [criteria, decision, reason] of cases) {
    const adapter = storageAdapter();
    const decisions = [decision, { type: 'done', reason: 'Stopping.' }];
    const inputs = [];
    await runAgent(adapter, 'Task', {
      model: 'test',
      log() {},
      criteria,
      maxSteps: 2,
      fetchImpl: async (_url, request) => {
        inputs.push(JSON.parse(JSON.parse(request.body).messages[1].content));
        return reply(decisions.shift());
      },
    });
    assert.deepEqual(
      adapter.actions.filter((action) => action.type !== 'inspect_storage'),
      [],
      JSON.stringify(decision),
    );
    assert.match(inputs[1].history[0].rejected, reason);
  }
});

test('a withdraw is not tracked as task storage, so only the deposit container is reopened', async () => {
  const adapter = storageAdapter();
  const decisions = [
    { type: 'withdraw', item: 'cobblestone', count: 2 },
    { type: 'deposit', item: 'oak_log', count: 4 },
    { type: 'done', reason: 'Stored.' },
  ];
  const result = await runAgent(adapter, 'Store logs', {
    model: 'test',
    log() {},
    criteria: { deposit: { item: 'oak_log', count: 4 } },
    fetchImpl: async () => reply(decisions.shift()),
  });
  assert.equal(result.status, 'criteria_met');
  assert.deepEqual(adapter.inspections, [[{ x: 1, y: 64, z: 0 }]]);
  assert.deepEqual(result.verification.checks.deposit.containers, [{ x: 1, y: 64, z: 0 }]);
});
