import {
  transcriptData,
  actionOf,
  countBy,
  starts,
  finishes,
  decisions,
  finite,
  nonnegative,
  timestamp,
  registerTranscriptGroup,
  TRANSCRIPT_NOTE,
} from './transcript-data.js';

export const DIAGNOSE_COMMANDS = [
  ['outcomes <file>', 'Count terminal statuses, terminal errors, and unfinished runs.'],
  ['completion-rate <file>', 'Measure finish-record coverage without equating finish with success.'],
  ['criteria-results <file>', 'List explicitly recorded final verification outcomes.'],
  ['error-reasons <file>', 'Group recorded action and finish error messages separately.'],
  ['rejection-reasons <file>', 'Count exact recorded rejection reasons.'],
  ['action-outcomes <file>', 'Group result/error/rejection events by action type.'],
  ['unresolved-decisions <file>', 'Locate non-done decisions with no matching subsequent step outcome.'],
  ['response-delays <file>', 'Measure decision-to-outcome gaps, not inference latency.'],
  ['event-gaps <file>', 'Measure adjacent event gaps within each run.'],
  ['clock-regressions <file>', 'Locate decreasing adjacent known timestamps within runs.'],
  ['missing-times <file>', 'Locate absent or unparseable event timestamps.'],
  ['token-totals <file>', 'Sum explicitly recorded decision/rejection token counts.'],
  ['token-steps <file>', 'List per-response token evidence with step provenance.'],
  ['token-efficiency <file>', 'Compare recorded response output tokens with reported requests.'],
  ['model-usage <file>', 'Extract terminal model request/token/time usage without filling missing fields.'],
  ['budget-usage <file>', 'Compare recorded run duration to the recorded time budget.'],
  ['step-usage <file>', 'Compare terminal steps against recorded decision limits.'],
  ['failure-streaks <file>', 'Locate consecutive action-error outcomes, reset by successful result records.'],
  ['rejection-streaks <file>', 'Locate consecutive rejected responses, reset by nonrejected decisions.'],
  ['repeated-decisions <file>', 'Locate adjacent identical decision objects within runs.'],
  ['goto-fence <file>', 'Compare recorded goto requests to explicitly recorded horizontal fences.'],
  ['allowlist <file>', 'Compare recorded decision types with explicitly recorded allowlists.'],
  ['collect-demand <file>', 'Sum requested collection counts, not collected items.'],
  ['deposit-demand <file>', 'Summarize explicit deposit requests and unbounded deposit-all requests.'],
  ['wait-demand <file>', 'Sum requested wait durations, not elapsed waiting.'],
];
function pairs(data) {
  const pairs = [];
  for (const run of data.runs) {
    let pending = null;
    for (const row of run.rows) {
      if (row.data.event === 'decision') {
        if (pending) pairs.push(pending);
        pending = { row, outcome: null };
      } else if (
        pending &&
        !pending.outcome &&
        ['result', 'error', 'rejection'].includes(row.data.event) &&
        Number.isSafeInteger(pending.row.data.step) &&
        pending.row.data.step >= 1 &&
        row.data.step === pending.row.data.step
      ) {
        pending.outcome = row;
      }
    }
    if (pending) pairs.push(pending);
  }
  return pairs;
}
function gaps(data) {
  return data.runs.flatMap((run) =>
    run.rows.slice(1).map((row, i) => {
      const previous = run.rows[i],
        a = timestamp(previous.data.time),
        b = timestamp(row.data.time);
      return {
        run: row.run,
        fromLine: previous.line,
        toLine: row.line,
        milliseconds: a === null || b === null ? null : b - a,
      };
    }),
  );
}
function tokens(data) {
  return data.rows
    .filter((r) => ['decision', 'rejection'].includes(r.data.event) && (r.data.event === 'decision' || !r.data.action))
    .map((r) => ({
      run: r.run,
      line: r.line,
      step: Number.isSafeInteger(r.data.step) ? r.data.step : null,
      promptTokens: nonnegative(r.data.promptTokens),
      outputTokens: nonnegative(r.data.outputTokens),
    }));
}
function requestTotals(data, type, field) {
  const groups = new Map();
  for (const row of decisions(data)) {
    const action = actionOf(row);
    if (action?.type !== type) continue;
    const name = type === 'collect' ? action.block : action.item;
    const key = typeof name === 'string' ? (name.includes(':') ? name : `minecraft:${name}`) : null;
    if (!groups.has(key))
      groups.set(key, { name: key, requested: 0, knownRequests: 0, unknownRequests: 0, allRequests: 0 });
    const group = groups.get(key),
      count = nonnegative(action[field]);
    if (type === 'deposit' && action.count === undefined) group.allRequests++;
    else if (count === null) group.unknownRequests++;
    else {
      group.requested += count;
      group.knownRequests++;
    }
  }
  return [...groups.values()];
}
export function diagnoseReport(content, command) {
  const data = transcriptData(content),
    terminal = finishes(data);
  let result;
  switch (command) {
    case 'outcomes':
      result = {
        statuses: countBy(terminal, (r) =>
          typeof r.data.result?.status === 'string'
            ? r.data.result.status
            : r.data.error !== undefined
              ? 'terminal_error'
              : null,
        ),
        unfinished: data.runs.filter((r) => !r.finished).length,
      };
      break;
    case 'completion-rate':
      result = {
        runs: data.runs.length,
        finished: terminal.length,
        finishRate: data.runs.length ? terminal.length / data.runs.length : null,
      };
      break;
    case 'criteria-results':
      result = {
        verifications: terminal.map((r) => ({
          run: r.run,
          line: r.line,
          met: typeof r.data.result?.verification?.met === 'boolean' ? r.data.result.verification.met : null,
          checks: r.data.result?.verification?.checks ?? null,
        })),
      };
      break;
    case 'error-reasons':
      result = {
        actionErrors: countBy(
          data.rows.filter((r) => r.data.event === 'error'),
          (r) => (typeof r.data.error === 'string' ? r.data.error : null),
        ),
        terminalErrors: countBy(
          terminal.filter((r) => r.data.error !== undefined),
          (r) => (typeof r.data.error === 'string' ? r.data.error : null),
        ),
      };
      break;
    case 'rejection-reasons':
      result = {
        reasons: countBy(
          data.rows.filter((r) => r.data.event === 'rejection'),
          (r) => (typeof r.data.reason === 'string' ? r.data.reason : null),
        ),
      };
      break;
    case 'action-outcomes':
      result = {
        outcomes: ['result', 'error', 'rejection'].map((event) => ({
          event,
          types: countBy(
            data.rows.filter((r) => r.data.event === event),
            (r) => (typeof actionOf(r)?.type === 'string' ? actionOf(r).type : null),
          ),
        })),
      };
      break;
    case 'unresolved-decisions':
      result = {
        rows: pairs(data)
          .filter((p) => actionOf(p.row)?.type !== 'done' && !p.outcome)
          .map((p) => p.row),
      };
      break;
    case 'response-delays':
      result = {
        delays: pairs(data)
          .filter((p) => p.outcome)
          .map(({ row, outcome }) => {
            const a = timestamp(row.data.time),
              b = timestamp(outcome.data.time);
            return {
              run: row.run,
              decisionLine: row.line,
              outcomeLine: outcome.line,
              outcome: outcome.data.event,
              milliseconds: a !== null && b !== null && b >= a ? b - a : null,
            };
          }),
      };
      break;
    case 'event-gaps':
      result = { gaps: gaps(data) };
      break;
    case 'clock-regressions':
      result = { gaps: gaps(data).filter((g) => g.milliseconds !== null && g.milliseconds < 0) };
      break;
    case 'missing-times':
      result = { rows: data.rows.filter((r) => timestamp(r.data.time) === null) };
      break;
    case 'token-steps':
      result = { responses: tokens(data) };
      break;
    case 'token-totals': {
      const rows = tokens(data);
      result = {
        responses: rows.length,
        promptTokens: rows.reduce((n, r) => n + (r.promptTokens ?? 0), 0),
        outputTokens: rows.reduce((n, r) => n + (r.outputTokens ?? 0), 0),
        unknownPrompt: rows.filter((r) => r.promptTokens === null).length,
        unknownOutput: rows.filter((r) => r.outputTokens === null).length,
      };
      break;
    }
    case 'token-efficiency': {
      const responsesByRun = new Map();
      for (const response of tokens(data)) {
        if (!responsesByRun.has(response.run)) responsesByRun.set(response.run, []);
        responsesByRun.get(response.run).push(response);
      }
      result = {
        runs: data.runs.map((run) => {
          const rows = responsesByRun.get(run.run) ?? [],
            finish = run.rows.findLast((r) => r.data.event === 'finish'),
            requests = nonnegative(finish?.data.result?.model?.requests),
            knownOutputTokens = rows.reduce((n, r) => n + (r.outputTokens ?? 0), 0),
            complete = rows.every((r) => r.outputTokens !== null) && requests !== null && requests === rows.length;
          return {
            run: run.run,
            requests,
            recordedResponses: rows.length,
            knownOutputTokens,
            complete,
            outputTokensPerRequest: complete && requests > 0 ? knownOutputTokens / requests : null,
          };
        }),
      };
      break;
    }
    case 'model-usage':
      result = {
        usage: terminal.map((r) => ({
          run: r.run,
          line: r.line,
          requests: nonnegative(r.data.result?.model?.requests),
          promptTokens: nonnegative(r.data.result?.model?.promptTokens),
          outputTokens: nonnegative(r.data.result?.model?.outputTokens),
          modelMs: nonnegative(r.data.result?.model?.modelMs),
        })),
      };
      break;
    case 'budget-usage':
    case 'step-usage':
      result = {
        runs: data.runs.map((run) => {
          const start = run.rows.find((r) => r.data.event === 'start'),
            finish = run.rows.findLast((r) => r.data.event === 'finish'),
            budget = nonnegative(start?.data[command === 'budget-usage' ? 'minutes' : 'maxSteps']),
            used = nonnegative(finish?.data.result?.[command === 'budget-usage' ? 'durationMs' : 'steps']),
            limit = budget === null ? null : command === 'budget-usage' ? budget * 60_000 : budget;
          return {
            run: run.run,
            limit,
            used,
            fraction: limit !== null && limit > 0 && used !== null ? used / limit : null,
            exceeded: limit !== null && used !== null ? used > limit : null,
          };
        }),
      };
      break;
    case 'failure-streaks': {
      const streaks = [];
      for (const run of data.runs) {
        let streak = [];
        const flush = () => {
          if (streak.length) streaks.push({ run: run.run, lines: streak, length: streak.length });
          streak = [];
        };
        for (const row of run.rows) {
          if (row.data.event === 'error') streak.push(row.line);
          else if (row.data.event === 'result') flush();
        }
        flush();
      }
      result = { streaks };
      break;
    }
    case 'rejection-streaks': {
      const streaks = [],
        rejected = new Set(
          pairs(data)
            .filter((p) => p.outcome?.data.event === 'rejection')
            .map((p) => p.row.line),
        );
      for (const run of data.runs) {
        let streak = [];
        const flush = () => {
          if (streak.length) streaks.push({ run: run.run, lines: streak, length: streak.length });
          streak = [];
        };
        for (const row of run.rows) {
          if (row.data.event === 'rejection') streak.push(row.line);
          else if (row.data.event === 'decision' && !rejected.has(row.line)) flush();
        }
        flush();
      }
      result = { streaks };
      break;
    }
    case 'repeated-decisions':
      result = {
        repeats: data.runs.flatMap((run) => {
          const rows = run.rows.filter((r) => r.data.event === 'decision');
          return rows
            .slice(1)
            .filter((r, i) => JSON.stringify(r.data.decision) === JSON.stringify(rows[i].data.decision))
            .map((r) => ({ run: r.run, line: r.line, decision: r.data.decision ?? null }));
        }),
      };
      break;
    case 'goto-fence':
      result = {
        requests: decisions(data)
          .filter((r) => actionOf(r)?.type === 'goto')
          .map((r) => {
            const fence = data.runs[r.run - 1].rows.find((s) => s.data.event === 'start')?.data.fence,
              action = actionOf(r),
              known =
                [fence?.x, fence?.z, fence?.radius, action.x, action.z].every((v) => finite(v) !== null) &&
                fence.radius >= 0,
              distance = known ? Math.hypot(action.x - fence.x, action.z - fence.z) : null;
            return {
              run: r.run,
              line: r.line,
              distance,
              radius: known ? fence.radius : null,
              outside: known ? distance > fence.radius : null,
            };
          }),
      };
      break;
    case 'allowlist':
      result = {
        requests: decisions(data).map((r) => {
          const list = data.runs[r.run - 1].rows.find((s) => s.data.event === 'start')?.data.allowedActions,
            type = actionOf(r)?.type,
            known = Array.isArray(list) && list.every((t) => typeof t === 'string') && typeof type === 'string';
          return {
            run: r.run,
            line: r.line,
            type: typeof type === 'string' ? type : null,
            permitted: type === 'done' ? true : known ? list.includes(type) : null,
          };
        }),
      };
      break;
    case 'collect-demand':
      result = { items: requestTotals(data, 'collect', 'count') };
      break;
    case 'deposit-demand':
      result = { items: requestTotals(data, 'deposit', 'count') };
      break;
    case 'wait-demand': {
      const rows = decisions(data).filter((r) => actionOf(r)?.type === 'wait'),
        values = rows.map((r) => nonnegative(actionOf(r).seconds));
      result = {
        requestedSeconds: values.reduce((n, v) => n + (v ?? 0), 0),
        knownRequests: values.filter((v) => v !== null).length,
        unknownRequests: values.filter((v) => v === null).length,
      };
      break;
    }
    default:
      throw new Error(`Unknown diagnose report: ${command}.`);
  }
  return { ...result, note: TRANSCRIPT_NOTE };
}
export const registerDiagnoseTools = (program, context) =>
  registerTranscriptGroup(
    program,
    'diagnose',
    'Analyze recorded planner reliability, costs, requests, and evidence offline.',
    DIAGNOSE_COMMANDS,
    diagnoseReport,
    context,
  );
