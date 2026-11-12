import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
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
  try { file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK); } catch (error) { throw new Error(`Cannot read routine file: ${error.message}`); }
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

export const MAX_ROUTINE_REPEAT = 20;

/**
 * Runs validated actions under one lease. Steps are numbered absolutely from 1; `completed` counts steps finished in this run and
 * `total` stays the routine length. Loss of control, lease errors, and cancellation always stop; other action failures stop
 * unless continueOnError records them in `errors`. Optional fields appear only when their option is used.
 */
export async function runRoutine(adapter, actions, { signal, log = () => {}, fromStep, continueOnError = false, repeat = 1, stopBelowHealth } = {}) {
  const start = fromStep ?? 1;
  if (!Number.isInteger(start) || start < 1 || start > actions.length) throw new Error(`The start step must be an integer from 1 to ${actions.length}, the routine length.`);
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > MAX_ROUTINE_REPEAT) throw new Error(`Repeat must be an integer from 1 to ${MAX_ROUTINE_REPEAT}.`);
  if (stopBelowHealth !== undefined && !(stopBelowHealth >= 1 && stopBelowHealth <= 19)) throw new Error('The health stop must be from 1 to 19.');
  const results = [];
  const errors = [];
  let step = start, iteration = 1, stepsRun = 0;
  const tag = value => repeat > 1 ? { ...value, iteration } : value;
  const label = () => `${step}/${actions.length}${repeat > 1 ? ` (iteration ${iteration}/${repeat})` : ''}`;
  const report = (status, extra) => ({ status, completed: results.length, total: actions.length, ...(fromStep !== undefined && { startStep: start }),
    ...(repeat > 1 && { iterations: repeat, stepsRun }), results, ...(continueOnError && { errors }), ...extra });
  try {
    signal?.throwIfAborted();
    await adapter.acquire();
    for (iteration = 1; iteration <= repeat; iteration++) {
      for (step = start; step <= actions.length; step++) {
        const action = actions[step - 1];
        signal?.throwIfAborted();
        const state = await adapter.observe();
        if (adapter.leaseError || state.mode !== 'agent') throw new Error('Control returned to the player.');
        if (stopBelowHealth !== undefined) {
          const health = state.player?.health;
          if (!Number.isFinite(health)) throw new Error('Health is unavailable from this backend.');
          if (health < stopBelowHealth) {
            log(`Stopped before step ${label()}: health ${health} is below ${stopBelowHealth}.`);
            return report('health_stop', tag({ stoppedBeforeStep: step, health }));
          }
        }
        log(`Step ${label()}: ${action.type}`);
        stepsRun++;
        try { results.push(tag(await adapter.execute(action, { signal, onProgress: job => log(job.message) }))); }
        catch (error) {
          if (!continueOnError || signal?.aborted || adapter.leaseError || (await adapter.observe()).mode !== 'agent') throw error;
          log(`Step ${label()} failed; continuing: ${error.message}`);
          errors.push(tag({ step, error: error.message }));
        }
      }
    }
    return report(errors.length ? 'completed_with_errors' : 'completed');
  } catch (error) {
    const reason = signal?.aborted ? signal.reason?.message || error.message : error.message;
    log(`Stopped at step ${label()}: ${reason}`);
    return report(signal?.aborted ? 'cancelled' : 'failed', { failedStep: step, ...(repeat > 1 && { failedIteration: iteration }), error: reason });
  } finally { await adapter.release(); }
}
