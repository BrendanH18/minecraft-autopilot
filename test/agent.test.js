import test from 'node:test';
import assert from 'node:assert/strict';
import { runAgent } from '../src/agent.js';

function fakeAdapter() {
  return {
    state: { connected: true, mode: 'manual', player: { health: 20 }, inventory: [] },
    actions: [], releases: 0,
    async observe() { return structuredClone(this.state); },
    async acquire() { this.state.mode = 'agent'; },
    async execute(action) { this.actions.push(action); return { status: 'completed' }; },
    async release() { this.releases++; this.state.mode = 'manual'; },
  };
}
const reply = decision => new Response(JSON.stringify({ message: { content: JSON.stringify(decision) } }), { status: 200 });

test('local planner executes structured actions and releases control', async () => {
  const adapter = fakeAdapter();
  const decisions = [{ type: 'eat' }, { type: 'done', reason: 'Observed hunger satisfied.' }];
  const result = await runAgent(adapter, 'Eat food', { model: 'test', log: () => {}, fetchImpl: async () => reply(decisions.shift()) });
  assert.equal(result.status, 'model_finished');
  assert.deepEqual(adapter.actions, [{ type: 'eat' }]);
  assert.equal(adapter.releases, 1);
});

test('manual takeover during slow inference prevents a delayed action', async () => {
  const adapter = fakeAdapter();
  await assert.rejects(runAgent(adapter, 'Walk', { model: 'test', log: () => {}, fetchImpl: async () => {
    adapter.state.mode = 'manual'; return reply({ type: 'goto', x: 10, y: 64, z: 0 });
  } }), /returned to the player/);
  assert.deepEqual(adapter.actions, []);
  assert.equal(adapter.releases, 1);
});

test('invalid model output never executes game actions', async () => {
  const adapter = fakeAdapter();
  await assert.rejects(runAgent(adapter, 'Anything', { model: 'test', log: () => {}, fetchImpl: async () => reply({ type: 'shell', command: 'bad' }) }), /invalid action/);
  assert.deepEqual(adapter.actions, []);
  assert.equal(adapter.releases, 1);
});

test('step limits bound the autonomous loop', async () => {
  const adapter = fakeAdapter();
  const result = await runAgent(adapter, 'Guard', { model: 'test', maxSteps: 2, log: () => {}, fetchImpl: async () => reply({ type: 'wait', seconds: 1 }) });
  assert.equal(result.status, 'step_limit');
  assert.equal(adapter.actions.length, 2);
  assert.equal(adapter.releases, 1);
});
