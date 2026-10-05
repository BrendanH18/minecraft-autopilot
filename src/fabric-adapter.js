import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { readBridge } from './config.js';
import { assertPlayable, normalizeAction, terminalStatuses } from './protocol.js';

export class FabricAdapter {
  constructor(config) {
    this.config = config;
    this.leaseId = null;
    this.leaseError = null;
    this.timer = null;
    this.heartbeatInFlight = null;
  }

  static async connect(path) { return new FabricAdapter(await readBridge(path)); }

  async request(path, body, signal) {
    let response;
    try {
      response = await fetch(new URL(path, this.config.url), {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Authorization: `Bearer ${this.config.token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000),
      });
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      throw new Error(`Cannot reach the Minecraft bridge: ${error.message}`);
    }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Bridge returned HTTP ${response.status}`);
    return result;
  }

  async observe() { return this.request('/v1/state'); }

  async acquire() {
    if (this.leaseId) {
      if (this.leaseError) throw this.leaseError;
      return;
    }
    assertPlayable(await this.observe());
    const leaseId = randomUUID();
    await this.request('/v1/control', { action: 'acquire', leaseId });
    this.leaseId = leaseId;
    this.leaseError = null;
    this.timer = setInterval(() => {
      if (this.heartbeatInFlight) return;
      this.heartbeatInFlight = this.request('/v1/control', { action: 'heartbeat', leaseId })
        .catch(error => { this.leaseError = error; clearInterval(this.timer); })
        .finally(() => { this.heartbeatInFlight = null; });
    }, 2000);
    this.timer.unref();
  }

  async execute(action, { signal, onProgress = () => {} } = {}) {
    const parsed = normalizeAction(action);
    signal?.throwIfAborted();
    await this.acquire();
    if (this.leaseError) throw this.leaseError;
    const started = await this.request('/v1/actions', { leaseId: this.leaseId, action: parsed }, signal);
    let previous = '';
    try {
      while (true) {
        signal?.throwIfAborted();
        if (this.leaseError) throw this.leaseError;
        const state = await this.observe();
        const job = state.job;
        if (job?.id !== started.id) throw new Error('Action was interrupted by another controller.');
        if (JSON.stringify(job) !== previous) { onProgress(job); previous = JSON.stringify(job); }
        if (terminalStatuses.has(job.status)) {
          if (job.status !== 'completed') throw new Error(job.message || `Action ${job.status}`);
          return job;
        }
        if (state.mode !== 'agent') throw new Error('Control was returned to the player.');
        await delay(250, undefined, { signal });
      }
    } catch (error) {
      await this.cancel().catch(() => {});
      throw error;
    }
  }

  async cancel() {
    if (this.leaseId) await this.request('/v1/cancel', { leaseId: this.leaseId });
  }

  // Explicit emergency stop works even from a second CLI process.
  async emergencyStop() { return this.request('/v1/stop', {}); }

  async release() {
    clearInterval(this.timer);
    await this.heartbeatInFlight;
    const leaseId = this.leaseId;
    this.leaseId = null;
    if (leaseId) await this.request('/v1/control', { action: 'release', leaseId }).catch(() => {});
  }

  async close() { await this.release(); }
}
