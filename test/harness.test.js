import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Harness } from '../src/harness.js';
import { DemoDriver } from '../src/demo-driver.js';

test('lease cannot be stolen, expires, and never accepts a delayed heartbeat', async t => {
  let now = 0;
  const driver = new DemoDriver();
  const harness = new Harness(driver, { now: () => now });
  t.after(() => harness.close());
  const owner = randomUUID();
  harness.acquire(owner);
  assert.throws(() => harness.acquire(randomUUID()), /Another agent/);
  now = 7000; harness.heartbeat(owner);
  now = 14_000; assert.equal(harness.observe().mode, 'agent');
  now = 15_000; assert.equal(harness.observe().mode, 'manual');
  assert.throws(() => harness.heartbeat(owner), /released or expired/);
  assert.throws(() => harness.start(owner, { type: 'goto', x: 10, y: 64, z: 0 }), /released or expired/);
  assert.ok(driver.stopCount > 0);
});

test('emergency stop interrupts movement without later changing position', async t => {
  const driver = new DemoDriver();
  const harness = new Harness(driver);
  t.after(() => harness.close());
  const owner = randomUUID(); harness.acquire(owner);
  harness.start(owner, { type: 'goto', x: 50, y: 64, z: 0 });
  await delay(130);
  harness.release('Player took control.');
  const stoppedPosition = { ...driver.player.position };
  await harness.task;
  await delay(150);
  assert.deepEqual(driver.player.position, stoppedPosition);
  assert.equal(harness.observe().job.status, 'cancelled');
  assert.equal(harness.observe().mode, 'manual');
});

test('invalid actions do not start jobs or mutate the player', async t => {
  const driver = new DemoDriver(); const harness = new Harness(driver);
  t.after(() => harness.close());
  const owner = randomUUID(); harness.acquire(owner);
  assert.throws(() => harness.start(owner, { type: 'goto', x: NaN, y: 64, z: 0 }));
  assert.throws(() => harness.start(owner, { type: 'collect', block: 'oak_log', count: 1000 }));
  assert.throws(() => harness.start(owner, { type: 'shell', command: 'anything' }));
  assert.equal(harness.observe().job, null);
  assert.deepEqual(driver.player.position, { x: 0, y: 64, z: 0 });
});

test('deadline stops an action that does not finish', async t => {
  const harness = new Harness(new DemoDriver(), { jobTimeoutMs: 30 });
  t.after(() => harness.close());
  const owner = randomUUID(); harness.acquire(owner);
  harness.start(owner, { type: 'goto', x: 50, y: 64, z: 0 });
  await harness.task;
  assert.equal(harness.observe().job.status, 'failed');
  assert.match(harness.observe().job.message, /timed out/);
});

test('a second action cannot replace a running action', async t => {
  const harness = new Harness(new DemoDriver());
  t.after(() => harness.close());
  const owner = randomUUID(); harness.acquire(owner);
  harness.start(owner, { type: 'wait', seconds: 10 });
  assert.throws(() => harness.start(owner, { type: 'eat' }), /already running/);
  harness.cancel(); await harness.task;
});
