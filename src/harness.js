import { randomUUID } from 'node:crypto';
import { assertPlayable, normalizeAction } from './protocol.js';

/** Shared bridge lifecycle for the server bot and deterministic demo. */
export class Harness {
  constructor(driver, { now = Date.now, leaseMs = 8000, jobTimeoutMs = 180_000 } = {}) {
    this.driver = driver;
    this.now = now;
    this.leaseMs = leaseMs;
    this.jobTimeoutMs = jobTimeoutMs;
    this.owner = null;
    this.identity = null;
    this.renewedAt = 0;
    this.job = null;
    this.abortController = null;
    this.task = null;
    this.timer = setInterval(() => this.tick(), 250);
    this.timer.unref();
  }

  tick() {
    if (!this.owner) return;
    if (this.now() - this.renewedAt >= this.leaseMs) this.release('Control lease expired.');
    else {
      const state = this.driver.healthState?.() || this.driver.observe();
      if (!state.connected || state.player?.health <= 0) this.release('Disconnected or player died.');
      else if (this.identity !== null && this.driver.identity() !== this.identity) this.release('World, player, or dimension changed. Start a new session explicitly.');
    }
  }

  observe() {
    this.tick();
    const stopping = Boolean(this.task && this.abortController?.signal.aborted || this.driver.operations?.busy && !this.driver.activeAction);
    return { protocol: 1, ...this.driver.observe(), mode: this.owner ? 'agent' : 'manual', stopping, job: this.job ? { ...this.job } : null };
  }

  requireLease(leaseId) {
    this.tick();
    if (!this.owner || leaseId !== this.owner) throw new Error('Control was released or expired. Explicitly start a new session.');
  }

  acquire(leaseId) {
    this.tick();
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(leaseId)) throw new Error('leaseId must be a canonical UUID.');
    assertPlayable(this.driver.observe());
    if (this.owner) throw new Error('Another agent owns control. Stop it first.');
    if (this.task || this.driver.isBusy?.()) throw new Error('Previous activity is still stopping. Wait for it to settle before taking control.');
    this.owner = leaseId;
    this.renewedAt = this.now();
    this.identity = this.driver.identity?.() ?? null;
    this.driver.setControlled?.(true);
    return { ok: true };
  }

  heartbeat(leaseId) { this.requireLease(leaseId); this.renewedAt = this.now(); return { ok: true }; }

  start(leaseId, action) {
    this.requireLease(leaseId);
    assertPlayable(this.driver.observe());
    if (this.task || this.driver.isBusy?.()) throw new Error('An action is already running or stopping.');
    const parsed = normalizeAction(action);
    const job = { id: randomUUID(), type: parsed.type, status: 'running', message: `Started ${parsed.type}` };
    this.job = job;
    const controller = new AbortController();
    this.abortController = controller;
    const deadline = setTimeout(() => controller.abort(new Error('Action timed out.')), parsed.type === 'wait' ? parsed.seconds * 1000 + 5000 : this.jobTimeoutMs);
    deadline.unref();
    this.task = Promise.resolve().then(() => {
      controller.signal.throwIfAborted();
      this.requireLease(leaseId);
      return this.driver.execute(parsed, {
        signal: controller.signal,
        onProgress: message => { if (job.status === 'running') job.message = message; },
      });
    }).then(result => {
      if (controller.signal.aborted || job.status !== 'running') return;
      job.status = 'completed'; job.message = result?.message || 'Completed.';
    }).catch(error => {
      if (job.status === 'running') {
        job.status = controller.signal.aborted && controller.signal.reason?.message !== 'Action timed out.' ? 'cancelled' : 'failed';
        job.message = controller.signal.aborted ? controller.signal.reason?.message || error.message : error.message;
      }
    }).finally(() => {
      clearTimeout(deadline);
      if (this.abortController === controller) this.abortController = null;
      this.task = null;
    });
    return { ...job };
  }

  cancel(message = 'Cancelled by agent.') {
    this.abortController?.abort(new Error(message));
    this.driver.cancelActivities?.(message);
    this.driver.stop();
    if (this.job?.status === 'running') { this.job.status = 'cancelled'; this.job.message = message; }
    return { ok: true };
  }

  release(message = 'Agent session ended.') {
    this.cancel(message);
    this.driver.setControlled?.(false);
    this.owner = null;
    this.identity = null;
    return { ok: true };
  }

  request(path, body = {}) {
    switch (path) {
      case '/v1/state': return this.observe();
      case '/v1/stop': return this.release('Emergency stop requested.');
      case '/v1/cancel': this.requireLease(body.leaseId); return this.cancel();
      case '/v1/actions': return this.start(body.leaseId, body.action);
      case '/v1/control':
        if (body.action === 'acquire') return this.acquire(body.leaseId);
        if (body.action === 'heartbeat') return this.heartbeat(body.leaseId);
        if (body.action === 'release') { this.requireLease(body.leaseId); return this.release(); }
        throw new Error('Unknown control operation.');
      default: throw new Error('Unknown API endpoint.');
    }
  }

  async close() {
    clearInterval(this.timer);
    this.release('Bridge is closing.');
    await this.task;
    await this.driver.close?.();
  }
}
