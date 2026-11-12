import { open } from 'node:fs/promises';
import { constants } from 'node:fs';

export const maxTranscriptBytes = 10 * 1024 * 1024;

/** Reads a planner transcript from a regular file of at most 10 MiB without blocking on a FIFO or device. */
export async function readTranscript(path) {
  let file;
  try { file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK); }
  catch (error) { throw new Error(`Cannot read transcript ${path}: ${error.code || error.message}.`); }
  try {
    const info = await file.stat();
    if (!info.isFile()) throw new Error('The transcript must be a regular file.');
    if (info.size > maxTranscriptBytes) throw new Error('The transcript is larger than 10 MiB.');
    const buffer = Buffer.alloc(maxTranscriptBytes + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead > maxTranscriptBytes) throw new Error('The transcript is larger than 10 MiB.');
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally { await file.close(); }
}

const text = value => typeof value === 'string' ? value : null;

/**
 * Summarizes one run of a JSON Lines planner transcript; runs start at each `start` event and the last is the default.
 * Lines that are not JSON objects with a string `event` count as invalid, never as an error.
 */
export function summarizeTranscript(content, { run } = {}) {
  if (typeof content !== 'string') throw new Error('The transcript must be text.');
  const runs = [];
  let current = null;
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    let event;
    try { event = JSON.parse(line); } catch { event = null; }
    const valid = event && typeof event === 'object' && !Array.isArray(event) && typeof event.event === 'string';
    if (!current || valid && event.event === 'start') runs.push(current = { events: [], invalidLines: 0 });
    if (valid) current.events.push(event);
    else current.invalidLines++;
  }
  if (run !== undefined && !(Number.isInteger(run) && run >= 1 && run <= runs.length)) throw new Error(`Choose a run from 1 to ${runs.length}.`);
  const index = run === undefined ? runs.length - 1 : run - 1;
  const { events, invalidLines } = runs[index] ?? { events: [], invalidLines: 0 };
  const start = events.find(event => event.event === 'start');
  const finish = events.findLast(event => event.event === 'finish');
  const count = name => events.filter(event => event.event === name).length;
  const decisionsByType = {};
  for (const event of events) {
    const type = event.event === 'decision' && text(event.decision?.type);
    if (type) decisionsByType[type] = (decisionsByType[type] ?? 0) + 1;
  }
  const started = text(start?.time);
  const finished = text(finish?.time);
  const result = finish?.result && typeof finish.result === 'object' ? finish.result : null;
  const elapsed = started && finished ? Date.parse(finished) - Date.parse(started) : NaN;
  return { runs: runs.length, run: runs.length ? index + 1 : null, events: events.length, decisions: count('decision'), decisionsByType,
    rejections: count('rejection'), errors: count('error'), results: count('result'), invalidLines,
    goal: text(start?.goal), model: text(start?.model), started, finished,
    ...(finish && finish.error !== undefined ? { error: String(finish.error) } : { status: text(result?.status) }),
    durationMs: Number.isFinite(result?.durationMs) ? result.durationMs : Number.isFinite(elapsed) ? elapsed : null };
}
