import {
  transcriptData,
  runInfo,
  actionOf,
  eventTypes,
  timestamp,
  integer,
  registerTranscriptGroup,
  TRANSCRIPT_NOTE,
} from './transcript-data.js';

export const JOURNAL_COMMANDS = [
  ['runs <file>', 'Index recorded runs with start, finish, and line provenance.'],
  ['events <file>', 'List all valid recorded event objects with physical line numbers.'],
  ['run <file> <number>', 'Extract all valid events and invalid lines from one run.'],
  ['event-type <file> <event>', 'Select an exact recorded event name.'],
  ['action-type <file> <type>', 'Select records mentioning one decision or action type.'],
  ['step <file> <number>', 'Select a numbered step across runs.'],
  ['lines <file> <first> <last>', 'Select records in an inclusive physical line range.'],
  ['head <file> <count>', 'Select the first count valid events.'],
  ['tail <file> <count>', 'Select the last count valid events.'],
  ['decisions <file>', 'Extract recorded model decisions.'],
  ['results <file>', 'Extract recorded action result events.'],
  ['errors <file>', 'Extract action errors and terminal run errors.'],
  ['rejections <file>', 'Extract refused requests and invalid model replies.'],
  ['finishes <file>', 'Extract terminal run records.'],
  ['starts <file>', 'Extract recorded task starts.'],
  ['goals <file>', 'List recorded task goal text by run.'],
  ['models <file>', 'Group start records by model name, retaining unknown names.'],
  ['settings <file>', 'Extract explicitly recorded task limits and planner settings.'],
  ['criteria <file>', 'Extract recorded criteria descriptions without evaluating them.'],
  ['invalid-lines <file>', 'Show nonblank lines that are not event objects.'],
  ['unknown-events <file>', 'Show event names outside the current planner contract.'],
  ['timestamps <file>', 'Parse each event timestamp, preserving missing and invalid evidence.'],
  ['search <file> <text>', 'Find literal case-sensitive text within event JSON.'],
  ['unfinished <file>', 'Locate run segments lacking a finish record.'],
  ['dry-runs <file>', 'Locate explicitly recorded dry-run starts.'],
];
const settingKeys = [
  'dryRun',
  'maxSteps',
  'minutes',
  'modelTimeout',
  'maxFailures',
  'contextTokens',
  'history',
  'temperature',
  'seed',
  'retryInvalid',
  'stopBelowHealth',
  'allowedActions',
  'fence',
];
export function journalReport(content, command, args = []) {
  const data = transcriptData(content),
    select = (event) => data.rows.filter((r) => r.data.event === event);
  let result;
  switch (command) {
    case 'runs':
      result = { runs: data.runs.map(runInfo) };
      break;
    case 'events':
      result = { rows: data.rows };
      break;
    case 'run': {
      const n = integer(args[0], 1, data.runs.length);
      const run = data.runs[n - 1];
      result = { ...runInfo(run), rows: run.rows, invalid: run.invalid };
      break;
    }
    case 'event-type': {
      if (typeof args[0] !== 'string' || !args[0]) throw new Error('Give an event name.');
      result = { rows: select(args[0]) };
      break;
    }
    case 'action-type': {
      if (typeof args[0] !== 'string' || !args[0]) throw new Error('Give an action type.');
      result = { rows: data.rows.filter((r) => actionOf(r)?.type === args[0]) };
      break;
    }
    case 'step': {
      const n = integer(args[0]);
      result = { rows: data.rows.filter((r) => r.data.step === n) };
      break;
    }
    case 'lines': {
      const first = integer(args[0]),
        last = integer(args[1], first);
      result = {
        rows: data.rows.filter((r) => r.line >= first && r.line <= last),
        invalid: data.invalid.filter((r) => r.line >= first && r.line <= last),
      };
      break;
    }
    case 'head':
      result = { rows: data.rows.slice(0, integer(args[0])) };
      break;
    case 'tail':
      result = { rows: data.rows.slice(-integer(args[0])) };
      break;
    case 'decisions':
    case 'results':
    case 'rejections':
    case 'finishes':
    case 'starts':
      result = {
        rows: select(
          { decisions: 'decision', results: 'result', rejections: 'rejection', finishes: 'finish', starts: 'start' }[
            command
          ],
        ),
      };
      break;
    case 'errors':
      result = {
        rows: data.rows.filter(
          (r) => r.data.event === 'error' || (r.data.event === 'finish' && r.data.error !== undefined),
        ),
      };
      break;
    case 'goals':
      result = {
        goals: select('start').map((r) => ({
          line: r.line,
          run: r.run,
          goal: typeof r.data.goal === 'string' ? r.data.goal : null,
        })),
      };
      break;
    case 'models': {
      const groups = new Map();
      for (const row of select('start')) {
        const model = typeof row.data.model === 'string' ? row.data.model : null;
        if (!groups.has(model)) groups.set(model, []);
        groups.get(model).push(row.run);
      }
      result = { models: [...groups].map(([model, runs]) => ({ model, runs })) };
      break;
    }
    case 'settings':
      result = {
        settings: select('start').map((r) => ({
          line: r.line,
          run: r.run,
          settings: Object.fromEntries(settingKeys.filter((k) => Object.hasOwn(r.data, k)).map((k) => [k, r.data[k]])),
        })),
      };
      break;
    case 'criteria':
      result = {
        criteria: select('start').map((r) => ({
          line: r.line,
          run: r.run,
          recorded: Object.hasOwn(r.data, 'criteria'),
          criteria: r.data.criteria ?? null,
        })),
      };
      break;
    case 'invalid-lines':
      result = { invalid: data.invalid };
      break;
    case 'unknown-events':
      result = { rows: data.rows.filter((r) => !eventTypes.has(r.data.event)) };
      break;
    case 'timestamps':
      result = {
        timestamps: data.rows.map((r) => ({
          line: r.line,
          run: r.run,
          time: typeof r.data.time === 'string' ? r.data.time : null,
          epochMs: timestamp(r.data.time),
        })),
      };
      break;
    case 'search': {
      if (typeof args[0] !== 'string' || !args[0].trim()) throw new Error('Give nonblank literal search text.');
      result = { rows: data.rows.filter((r) => JSON.stringify(r.data).includes(args[0])) };
      break;
    }
    case 'unfinished':
      result = { runs: data.runs.filter((r) => !r.finished).map(runInfo) };
      break;
    case 'dry-runs':
      result = { rows: select('start').filter((r) => r.data.dryRun === true) };
      break;
    default:
      throw new Error(`Unknown journal report: ${command}.`);
  }
  return { ...result, note: TRANSCRIPT_NOTE };
}
export const registerJournalTools = (program, context) =>
  registerTranscriptGroup(
    program,
    'journal',
    'Inspect saved planner JSON Lines transcripts offline.',
    JOURNAL_COMMANDS,
    journalReport,
    context,
  );
