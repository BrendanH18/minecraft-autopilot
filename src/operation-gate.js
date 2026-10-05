/** Track native operations until they settle, even when their caller cancels early. */
export class OperationGate {
  constructor() { this.pending = new Set(); }
  get busy() { return this.pending.size > 0; }

  async waitForIdle(signal) {
    while (this.busy) {
      signal.throwIfAborted();
      await this.withSignal(Promise.allSettled([...this.pending]), signal);
    }
    signal.throwIfAborted();
  }

  async run(operation, signal, onCancel = () => {}) {
    do { await this.waitForIdle(signal); } while (this.busy);
    signal.throwIfAborted();
    let tracked;
    tracked = Promise.resolve().then(() => {
      // Abort may have happened while this callback was waiting in the microtask queue.
      signal.throwIfAborted();
      return operation();
    }).finally(() => {
      try { if (signal.aborted) onCancel(); }
      finally { this.pending.delete(tracked); }
    });
    this.pending.add(tracked);
    const value = await this.withSignal(tracked, signal, onCancel);
    signal.throwIfAborted();
    return value;
  }

  async withSignal(promise, signal, onCancel = () => {}) {
    signal.throwIfAborted();
    let onAbort;
    const interrupted = new Promise((_, reject) => {
      onAbort = () => { try { onCancel(); } finally { reject(signal.reason); } };
      signal.addEventListener('abort', onAbort, { once: true });
    });
    try { return await Promise.race([promise, interrupted]); }
    finally { signal.removeEventListener('abort', onAbort); }
  }
}
