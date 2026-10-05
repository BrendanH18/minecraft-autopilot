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
    this.pendingAcquire = null;
    this.releaseTask = null;
    this.sessionController = null;
    this.generation = 0;
    this.closed = false;
    this.actionInFlight = false;
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
    if (this.closed) throw new Error('Adapter is closed.');
    if (this.releaseTask) throw new Error('Control is still being released.');
    if (this.leaseId) {
      if (this.leaseError) throw this.leaseError;
      return;
    }
    if (this.pendingAcquire) return this.pendingAcquire;
    const generation = this.generation;
    this.pendingAcquire = Promise.resolve().then(async () => {
      let state = await this.observe();
      // Cancelled native work on a server bot (e.g. eating) can take a few seconds to settle after the previous command.
      for (const until = Date.now() + 10_000; state.stopping && Date.now() < until;) {
        await delay(250);
        if (generation !== this.generation || this.closed) throw new Error('Control acquisition was cancelled.');
        state = await this.observe();
      }
      assertPlayable(state);
      if (generation !== this.generation || this.closed) throw new Error('Control acquisition was cancelled.');
      const leaseId = randomUUID();
      try {
        // Await confirmation so a late reply can be released explicitly after shutdown.
        await this.request('/v1/control', { action: 'acquire', leaseId });
        if (generation !== this.generation || this.closed) throw new Error('Control acquisition was cancelled.');
      } catch (error) {
        await this.request('/v1/control', { action: 'release', leaseId }).catch(() => {});
        throw error;
      }
      this.leaseId = leaseId;
      this.leaseError = null;
      this.sessionController = new AbortController();
      this.timer = setInterval(() => {
        if (this.heartbeatInFlight) return;
        this.heartbeatInFlight = this.request('/v1/control', { action: 'heartbeat', leaseId })
          .catch(error => {
            this.leaseError = error;
            this.sessionController?.abort(error);
            clearInterval(this.timer);
          }).finally(() => { this.heartbeatInFlight = null; });
      }, 2000);
      this.timer.unref();
    }).finally(() => { this.pendingAcquire = null; });
    return this.pendingAcquire;
  }

  async execute(action, { signal, onProgress = () => {} } = {}) {
    const parsed = normalizeAction(action);
    signal?.throwIfAborted();
    if (this.actionInFlight) throw new Error('An action is already running on this adapter.');
    this.actionInFlight = true;
    const generation = this.generation;
    let leaseId;
    let submitted = false;
    try {
      await this.acquire();
      signal?.throwIfAborted();
      if (generation !== this.generation) throw new Error('Control was released.');
      if (this.leaseError) throw this.leaseError;
      signal = signal ? AbortSignal.any([signal, this.sessionController.signal]) : this.sessionController.signal;
      signal.throwIfAborted();
      leaseId = this.leaseId;
      submitted = true;
      const started = await this.request('/v1/actions', { leaseId, action: parsed }, signal);
      let previous = '';
      while (true) {
        signal.throwIfAborted();
        if (this.leaseError) throw this.leaseError;
        const state = await this.request('/v1/state', undefined, signal);
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
      if (submitted) await this.request('/v1/cancel', { leaseId }).catch(() => {});
      throw signal?.aborted ? signal.reason : error;
    } finally { this.actionInFlight = false; }
  }

  async cancel() {
    if (this.leaseId) await this.request('/v1/cancel', { leaseId: this.leaseId });
  }

  // Explicit emergency stop works even from a second CLI process.
  async emergencyStop() { return this.request('/v1/stop', {}); }

  release() {
    if (this.releaseTask) return this.releaseTask;
    this.generation++;
    clearInterval(this.timer);
    this.timer = null;
    this.sessionController?.abort(new Error('Control was released.'));
    this.releaseTask = Promise.resolve().then(async () => {
      await this.pendingAcquire?.catch(() => {});
      await this.heartbeatInFlight;
      const leaseId = this.leaseId;
      this.leaseId = null;
      this.sessionController = null;
      if (leaseId) await this.request('/v1/control', { action: 'release', leaseId }).catch(() => {});
    }).finally(() => { this.releaseTask = null; });
    return this.releaseTask;
  }

  async close() { this.closed = true; await this.release(); }
}
