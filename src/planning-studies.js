import { open } from 'node:fs/promises';
import { PLANNING_GROUPS } from './planning-tools.js';
import { demand } from './offline-kit.js';
import { checked } from './spatial-inputs.js';
import { validateRequest, resolvePlanner } from './planning-study-common.js';
import { runBatch, runCompare } from './planning-study-batch.js';
import { runSweep, runSensitivity } from './planning-study-parameters.js';
import { runRank } from './planning-study-rank.js';
import { runScreen } from './planning-study-screen.js';

export const STUDY_LIMIT_BYTES = 1_000_000;
export const STUDY_WORKFLOWS = Object.freeze({
  batch: runBatch,
  compare: runCompare,
  sweep: runSweep,
  sensitivity: runSensitivity,
  rank: runRank,
  screen: runScreen,
});
const note = 'Offline study of supplied plans only. No world observation, control, or gameplay execution; inherited planner assumptions still apply.';

export function studyCatalog(groupName) {
  const groups = groupName === undefined ? PLANNING_GROUPS : PLANNING_GROUPS.filter(g => g.name === groupName);
  demand(groups.length > 0, `Unknown planning group: ${groupName}.`);
  const workflows = Object.keys(STUDY_WORKFLOWS);
  const planners = groups.reduce((total, group) => total + group.commands.length, 0);
  return {
    planners, workflows, combinations: planners * workflows.length,
    groups: groups.map(group => ({
      name: group.name,
      commands: group.commands.map(spec => ({
        command: spec.signature.split(' ')[0], signature: spec.signature, types: [...spec.types],
      })),
    })),
    note,
  };
}

export function calculateStudy(workflow, groupName, commandName, request) {
  demand(Object.hasOwn(STUDY_WORKFLOWS, workflow), `Unknown study workflow: ${workflow}.`);
  validateRequest(request);
  const group = resolvePlanner(groupName, commandName);
  const data = STUDY_WORKFLOWS[workflow](groupName, commandName, request);
  const report = checked({ workflow, group: groupName, command: commandName, ...data, note, plannerNote: group.note });
  demand(Buffer.byteLength(JSON.stringify(report)) <= STUDY_LIMIT_BYTES, 'Study report exceeds 1,000,000 bytes. Use fewer or smaller cases.');
  return report;
}

async function readBounded(stream) {
  const chunks = [];
  let length = 0;
  for await (const chunk of stream) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.length;
    demand(length <= STUDY_LIMIT_BYTES, 'Study request exceeds 1,000,000 bytes.');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function readStudyRequest(source, { stdin = process.stdin } = {}) {
  demand(typeof source === 'string' && source.length > 0, 'Supply inline JSON, @file, or - for stdin.');
  let text;
  if (source === '-') text = await readBounded(stdin);
  else if (source.startsWith('@')) {
    demand(source.length > 1, 'Supply a filename after @.');
    const file = await open(source.slice(1), 'r');
    try { text = await readBounded(file.createReadStream({ autoClose: false })); }
    finally { await file.close(); }
  } else text = source;
  demand(Buffer.byteLength(text) <= STUDY_LIMIT_BYTES, 'Study request exceeds 1,000,000 bytes.');
  let request;
  try { request = JSON.parse(text); }
  catch { throw new Error('Study request must be valid JSON.'); }
  validateRequest(request);
  return request;
}

export function registerPlanningStudies(program, { print }) {
  const study = program.command('study').description('Batch, compare, vary, rank, and screen the 1,000 offline planners. Requests: inline JSON, @file, or - for stdin.');
  study.command('catalog [group]').description('List supported planners, argument types, and six workflows per planner.')
    .action(group => print(studyCatalog(group)));
  const descriptions = {
    batch: 'Evaluate independent argument rows: {cases:[[args],...]}.',
    compare: 'Compare candidates with a baseline: {baseline:[args],candidates:[[args],...]}.',
    sweep: 'Replace one complete argument: {args:[],index:1,values:[]}.',
    sensitivity: 'Vary arguments one at a time: {args:[],changes:[{index:1,values:[]}]}.',
    screen: 'Check candidate constraints: {cases:[[]],criteria:[{path:"",measure:"value",op:"gte",value:10}]}.',
    rank: 'Order candidates by a result pointer: {cases:[[]],path:"",direction:"min",measure:"value",limit:10}.',
  };
  for (const workflow of Object.keys(STUDY_WORKFLOWS)) {
    study.command(`${workflow} <group> <command> <request>`).description(descriptions[workflow])
      .action(async (group, command, source) => print(calculateStudy(workflow, group, command, await readStudyRequest(source))));
  }
}
