import { readTranscript } from './transcript.js';

export const TRANSCRIPT_NOTE =
  'Offline recorded evidence only. Decisions are requests, not proof of execution; missing outcomes, timings, settings, and usage remain unknown. Inter-event gaps include unrecorded work and are not model latency.';
export const eventTypes = new Set(['start', 'decision', 'result', 'error', 'rejection', 'finish']);
export const actionOf = (row) => row.data.decision ?? row.data.action ?? null;
export const finite = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
export const nonnegative = (value) => (finite(value) !== null && value >= 0 ? value : null);
export function integer(value, min = 1, max = 1_000_000) {
  if ((typeof value !== 'string' && typeof value !== 'number') || String(value).trim() === '')
    throw new Error('Give a finite integer.');
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`Give an integer from ${min} to ${max}.`);
  return n;
}
export function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value))
    return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}
export function transcriptData(content) {
  if (typeof content !== 'string') throw new Error('The transcript must be text.');
  const rows = [],
    invalid = [],
    runs = [];
  let run = null;
  content.split('\n').forEach((text, i) => {
    if (!text.trim()) return;
    let data;
    try {
      data = JSON.parse(text);
    } catch {}
    const valid = data !== null && typeof data === 'object' && !Array.isArray(data) && typeof data.event === 'string';
    if (!run || (valid && (data.event === 'start' || run.finished))) {
      run = { run: runs.length + 1, rows: [], invalid: [], finished: false };
      runs.push(run);
    }
    if (!valid) {
      const row = { line: i + 1, run: run.run, text };
      invalid.push(row);
      run.invalid.push(row);
      return;
    }
    const row = { line: i + 1, run: run.run, data };
    rows.push(row);
    run.rows.push(row);
    if (data.event === 'finish') run.finished = true;
  });
  return { rows, invalid, runs };
}
export const countBy = (rows, key) => {
  const counts = new Map();
  for (const row of rows) {
    const value = key(row);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts].map(([value, count]) => ({ value, count }));
};
export const starts = (data) => data.rows.filter((r) => r.data.event === 'start');
export const finishes = (data) => data.rows.filter((r) => r.data.event === 'finish');
export const decisions = (data) => data.rows.filter((r) => r.data.event === 'decision');
export function runInfo(run) {
  const start = run.rows.find((r) => r.data.event === 'start'),
    finish = run.rows.findLast((r) => r.data.event === 'finish');
  return {
    run: run.run,
    firstLine: Math.min(run.rows[0]?.line ?? Infinity, run.invalid[0]?.line ?? Infinity),
    events: run.rows.length,
    invalidLines: run.invalid.length,
    started: Boolean(start),
    finished: Boolean(finish),
    status: typeof finish?.data.result?.status === 'string' ? finish.data.result.status : null,
    error: typeof finish?.data.error === 'string' ? finish.data.error : null,
  };
}
export function registerTranscriptGroup(program, name, description, commands, report, { print }) {
  const group = program.command(name).description(description);
  for (const [signature, help] of commands) {
    const command = signature.split(' ')[0];
    group
      .command(signature)
      .description(help)
      .action(async (file, ...values) =>
        print(report(await readTranscript(file), command, values.slice(0, -2).flat())),
      );
  }
  return group;
}
