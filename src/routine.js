import { open } from 'node:fs/promises';
import { normalizeAction } from './protocol.js';

export const MAX_ROUTINE_BYTES = 1024 * 1024;
export const MAX_ROUTINE_STEPS = 100;

/** Validates every step before anything takes control, so a typo cannot strand a half-run routine. */
export function parseRoutine(text) {
  let data;
  try { data = JSON.parse(text); } catch (error) { throw new Error(`Routine is not valid JSON: ${error.message}`); }
  if (data && !Array.isArray(data) && typeof data === 'object') {
    const extra = Object.keys(data).filter(key => key !== 'actions');
    if (extra.length) throw new Error(`Unknown routine field: ${extra.join(', ')}. Use { "actions": [ ... ] }.`);
    data = data.actions;
  }
  if (!Array.isArray(data)) throw new Error('A routine must be { "actions": [ ... ] } or an array of actions.');
  if (data.length < 1 || data.length > MAX_ROUTINE_STEPS) throw new Error(`A routine must contain 1 to ${MAX_ROUTINE_STEPS} actions; found ${data.length}.`);
  return data.map((action, index) => {
    try { return normalizeAction(action); } catch (error) {
      const detail = error.issues?.map(issue => `${issue.path.join('.') || 'action'}: ${issue.message}`).join('; ') || error.message;
      throw new Error(`Routine step ${index + 1} (index ${index}) is invalid: ${detail}`);
    }
  });
}

export async function loadRoutine(path) {
  let file;
  try { file = await open(path, 'r'); } catch (error) { throw new Error(`Cannot read routine file: ${error.message}`); }
  try {
    const info = await file.stat();
    if (!info.isFile()) throw new Error('The routine path must be a regular file.');
    if (info.size > MAX_ROUTINE_BYTES) throw new Error(`Routine files must be at most 1 MiB; this one is ${info.size} bytes.`);
    // Read one byte past the limit so a file that grows after stat is still refused.
    const buffer = Buffer.alloc(MAX_ROUTINE_BYTES + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead > MAX_ROUTINE_BYTES) throw new Error('Routine files must be at most 1 MiB.');
    return parseRoutine(buffer.subarray(0, bytesRead).toString('utf8'));
  } finally { await file.close(); }
}

/** Runs validated actions under one lease and stops at the first failure or loss of control. */
export async function runRoutine(adapter, actions, { signal, log = () => {} } = {}) {
  const results = [];
  const report = (status, extra) => ({ status, completed: results.length, total: actions.length, results, ...extra });
  try {
    await adapter.acquire();
    for (const [index, action] of actions.entries()) {
      signal?.throwIfAborted();
      if (adapter.leaseError || (await adapter.observe()).mode !== 'agent') throw new Error('Control returned to the player.');
      log(`Step ${index + 1}/${actions.length}: ${action.type}`);
      results.push(await adapter.execute(action, { signal, onProgress: job => log(job.message) }));
    }
    return report('completed');
  } catch (error) {
    const reason = signal?.aborted ? signal.reason?.message || error.message : error.message;
    log(`Stopped at step ${results.length + 1}/${actions.length}: ${reason}`);
    return report(signal?.aborted ? 'cancelled' : 'failed', { failedStep: results.length + 1, error: reason });
  }
}
