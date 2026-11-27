import { readFile, stat } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { z } from 'zod';
import { MINECRAFT_VERSION, sha256File } from './processes.js';
import { RELEASE, scenarios } from './scenarios.js';

const gateGroups = [
  ['collection-pit-recovery', [RELEASE.partial]],
  ['bot-mining-timeout', [RELEASE.pit]],
  ['collect-and-store-verification', [RELEASE.store]],
  ['bot-withdraw-craft', [RELEASE.withdraw, RELEASE.craft]],
  ['cobblestone-hostiles-dimension', [RELEASE.cobblestone]],
];
const scenarioById = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
const sha256 = /^[0-9a-f]{64}$/;
const sourceSchema = z.object({ commit: z.string().nullable(), dirty: z.boolean().nullable() });

const resultSchema = z.object({
  schema: z.literal('minecraft-agent/live-bot-acceptance/1'),
  environment: sourceSchema.extend({ sourceAtFinish: sourceSchema.optional() }),
  finishedAt: z.iso.datetime(),
  minecraft: z.object({
    serverLog: z.string().trim().min(1),
    serverLogSha256: z.string().regex(sha256).nullish(),
    serverVersion: z.string().nullish(),
    jarSha256: z.string().nullish(),
  }),
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

async function findServerLog(file, recorded, checksum) {
  const candidates = [resolve(recorded)];
  // The workflow and Boat both preserve this layout when copying evidence from the runner.
  if (checksum && basename(file) === 'results.json') candidates.push(resolve(dirname(file), 'server/server.out'));
  for (const path of candidates) {
    if (!(await stat(path).catch(() => null))?.isFile()) continue;
    if (!checksum || (await sha256File(path).catch(() => null)) === checksum) return path;
  }
  return null;
}

function countOutcomes(outcomes) {
  const counts = { pass: 0, fail: 0, skipped: 0, missing: 0 };
  for (const { status } of outcomes) counts[status]++;
  return counts;
}

/** Review candidate provenance and scenario coverage without changing acceptance sessions. */
export async function reviewBotEvidence(files, commit) {
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(commit)) throw new Error('Use a full git commit SHA with --commit.');

  const runs = [];
  const rejected = [];
  const serverJarSha256s = new Set();
  const latestAttempt = new Map();
  const latestSkip = new Map();
  for (const file of files) {
    try {
      const raw = JSON.parse(await readFile(file, 'utf8'));
      // Whatever its schema says, a Fabric run (development client or packaged jars on Loom's launcher) is a pre-check.
      if (raw?.backend === 'fabric' || raw?.packaged)
        throw new Error(
          'Fabric pre-check results (development client or packaged jars) are never bot or release evidence.',
        );
      const result = resultSchema.parse(raw);
      if (result.environment.commit !== commit)
        throw new Error(`Recorded commit ${result.environment.commit ?? 'unknown'} does not match the candidate.`);
      if (result.environment.dirty !== false) throw new Error('The run did not record a clean worktree.');
      const { sourceAtFinish } = result.environment;
      const hasPass = result.scenarios.some(({ status }) => status === 'pass');
      if (hasPass && !sourceAtFinish) throw new Error('Passing results need the candidate source state at finish.');
      if (sourceAtFinish && (sourceAtFinish.commit !== commit || sourceAtFinish.dirty !== false))
        throw new Error('The run did not finish on the same clean candidate commit.');
      if (new Set(result.scenarios.map(({ id }) => id)).size !== result.scenarios.length)
        throw new Error('The run contains duplicate scenario IDs.');

      const { finishedAt, error, minecraft, options } = result;
      const { serverLog, serverVersion, jarSha256, serverLogSha256 } = minecraft;
      if (hasPass && serverVersion !== MINECRAFT_VERSION)
        throw new Error(
          `Passing results need a Minecraft ${MINECRAFT_VERSION} server; recorded ${serverVersion ?? 'unknown'}.`,
        );
      if (hasPass && !sha256.test(jarSha256 ?? '')) throw new Error('Passing results need a server jar SHA-256.');
      for (const { id, status, observations, checks } of result.scenarios) {
        const scenario = scenarioById.get(id);
        if (!scenario) throw new Error(`Unknown bot scenario: ${id}.`);
        if (status !== 'pass') continue;
        if (!checks?.length || checks.some(({ pass }) => !pass))
          throw new Error(`Passing scenario ${id} needs at least one check and all checks must pass.`);
        if (scenario.requiresModel && (!options.model?.trim() || observations?.model !== options.model))
          throw new Error(`Passing scenario ${id} did not record the configured real model.`);
      }
      const serverLogPath = await findServerLog(file, serverLog, serverLogSha256);
      if (hasPass && (!serverLogSha256 || !serverLogPath))
        throw new Error('Passing results need a readable server log matching the recorded SHA-256.');
      runs.push({
        file,
        finishedAt,
        serverLog,
        serverLogPath,
        serverLogSha256: serverLogSha256 ?? null,
        serverVersion: serverVersion ?? null,
        serverJarSha256: jarSha256 ?? null,
        sourceAtFinish: sourceAtFinish ?? null,
        error: error ?? null,
      });
      if (hasPass) serverJarSha256s.add(jarSha256);
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
    serverJarSha256s: [...serverJarSha256s].sort(),
    gates: gateGroups.map(([gate, release]) => {
      const covered = scenarios.filter((scenario) => scenario.release?.some((entry) => release.includes(entry)));
      const offline = covered.filter((scenario) => !scenario.requiresModel).map(outcome);
      const realModel = covered.filter((scenario) => scenario.requiresModel).map(outcome);
      return {
        gate,
        offline,
        realModel,
        summary: { offline: countOutcomes(offline), realModel: countOutcomes(realModel) },
      };
    }),
    // Scenarios that map to no bot gate, such as the bot runs of the Fabric eating and full-inventory checks.
    supplemental: scenarios
      .filter(
        (scenario) => !gateGroups.some(([, release]) => scenario.release?.some((entry) => release.includes(entry))),
      )
      .map(outcome),
    note: 'Bot runner coverage only. Review the raw results and server logs before recording acceptance separately.',
  };
}
