import test from 'node:test';
import assert from 'node:assert/strict';
import { OperationGate } from '../src/operation-gate.js';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('a queued operation never dispatches after cancellation', async () => {
  const gate = new OperationGate();
  const controller = new AbortController();
  let dispatched = false;
  const result = gate.run(() => { dispatched = true; }, controller.signal);
  controller.abort(new Error('Player took control.'));
  await assert.rejects(result, /Player took control/);
  assert.equal(dispatched, false);
  assert.equal(gate.busy, false);
});

test('cancelled native work blocks follow-on operations until it settles', async () => {
  const gate = new OperationGate();
  const controller = new AbortController();
  const started = deferred();
  const native = deferred();
  let stops = 0;
  const result = gate.run(() => { started.resolve(); return native.promise; }, controller.signal, () => { stops++; });
  await started.promise;
  controller.abort(new Error('Stop.'));
  await assert.rejects(result, /Stop/);
  assert.equal(gate.busy, true);
  let nextStarted = false;
  const next = gate.run(() => { nextStarted = true; }, new AbortController().signal);
  await Promise.resolve();
  assert.equal(nextStarted, false);
  native.resolve();
  await next;
  assert.equal(nextStarted, true);
  assert.equal(gate.busy, false);
  assert.equal(stops, 2); // Stop again when a late native reply arrives.
});

test('simultaneous callers cannot start overlapping native operations', async () => {
  const gate = new OperationGate();
  const signal = new AbortController().signal;
  const native = deferred();
  const started = deferred();
  const order = [];
  const first = gate.run(() => { order.push('first'); started.resolve(); return native.promise; }, signal);
  const second = gate.run(() => { order.push('second'); }, signal);
  await started.promise;
  assert.deepEqual(order, ['first']);
  native.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(order, ['first', 'second']);
});
