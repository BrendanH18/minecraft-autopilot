import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { RELEASE, scenarios } from './scenarios.js';

const gateGroups = [
  ['collection-pit-recovery', [RELEASE.partial]],
  ['bot-mining-timeout', [RELEASE.pit]],
  ['collect-and-store-verification', [RELEASE.store]],
  ['bot-withdraw-craft', [RELEASE.withdraw, RELEASE.craft]],
];
const scenarioById = new Map(scenarios.map((scenario) => [scenario.id, scenario]));

const resultSchema = z.object({
  schema: z.literal('minecraft-agent/live-bot-acceptance/1'),
  environment: z.object({ commit: z.string().nullable(), dirty: z.boolean().nullable() }),
  finishedAt: z.iso.datetime(),
  minecraft: z.object({ serverLog: z.string().trim().min(1) }),
  options: z.object({ model: z.string().nullish() }),
  scenarios: z.array(
    z.object({
      id: z.string(),
      status: z.enum(['pass', 'fail', 'skipped']),
      reason: z.string().nullish(),
      observations: z.object({ model: z.string().nullish() }).optional(),
      checks: z.array(z.object({ pass: z.boolean() })).optional(),
    }),
  ),
  error: z.string().nullish(),
});

/** Review candidate provenance and scenario coverage without changing acceptance sessions. */
export async function reviewBotEvidence(files, commit) {
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(commit)) throw new Error('Use a full git commit SHA with --commit.');

  const runs = [];
  const rejected = [];
  const latestAttempt = new Map();
  const latestSkip = new Map();
  for (const file of files) {
    try {
      const result = resultSchema.parse(JSON.parse(await readFile(file, 'utf8')));
      if (result.environment.commit !== commit)
        throw new Error(`Recorded commit ${result.environment.commit ?? 'unknown'} does not match the candidate.`);
      if (result.environment.dirty !== false) throw new Error('The run did not record a clean worktree.');
      if (new Set(result.scenarios.map(({ id }) => id)).size !== result.scenarios.length)
        throw new Error('The run contains duplicate scenario IDs.');

      const { finishedAt, error, minecraft, options } = result;
      for (const { id, status, observations, checks } of result.scenarios) {
        const scenario = scenarioById.get(id);
        if (!scenario) throw new Error(`Unknown bot scenario: ${id}.`);
        if (status !== 'pass') continue;
        if (!checks?.length || checks.some(({ pass }) => !pass))
          throw new Error(`Passing scenario ${id} needs at least one check and all checks must pass.`);
        if (scenario.requiresModel && (!options.model?.trim() || observations?.model !== options.model))
          throw new Error(`Passing scenario ${id} did not record the configured real model.`);
      }
      runs.push({ file, finishedAt, serverLog: minecraft.serverLog, error: error ?? null });
      for (const { id, status, reason, observations } of result.scenarios) {
        const outcomes = status === 'skipped' ? latestSkip : latestAttempt;
        const previous = outcomes.get(id);
        if (!previous || Date.parse(finishedAt) >= Date.parse(previous.finishedAt)) {
          outcomes.set(id, {
            status,
            file,
            finishedAt,
            reason: reason ?? null,
            model: observations?.model === options.model ? options.model?.trim() || null : null,
          });
        }
      }
    } catch (error) {
      rejected.push({ file, reason: error.message });
    }
  }

  const outcome = ({ id, requiresModel }) => {
    const entry = latestAttempt.get(id) ?? latestSkip.get(id);
    if (!entry) return { id, status: 'missing' };
    const { model, ...evidence } = entry;
    return requiresModel ? { id, ...evidence, model } : { id, ...evidence };
  };

  return {
    commit,
    runs,
    rejected,
    gates: gateGroups.map(([gate, release]) => {
      const covered = scenarios.filter((scenario) => scenario.release?.some((entry) => release.includes(entry)));
      return {
        gate,
        offline: covered.filter((scenario) => !scenario.requiresModel).map(outcome),
        realModel: covered.filter((scenario) => scenario.requiresModel).map(outcome),
      };
    }),
    supplemental: scenarios.filter((scenario) => !scenario.release?.length).map(outcome),
    note: 'Bot runner coverage only. Review the raw results and server logs before recording acceptance separately.',
  };
}
