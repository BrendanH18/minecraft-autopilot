import { z } from 'zod';
import { mkdir, open, realpath, rmdir, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { execFile, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { isDeepStrictEqual, promisify } from 'node:util';
import { ARCHIVE_NAME, modBundleFiles } from './bundle.js';
import { dataDirectory, projectRoot, writePrivateJson } from './config.js';
import {
  ACCEPTANCE_GATES,
  OPEN_GATES,
  SESSION_BACKENDS,
  GATE_BACKENDS,
  findGate,
  requiredBackends,
} from './acceptance-gates.js';

export const ACCEPTANCE_FILE = 'acceptance-sessions.json';
export { ARCHIVE_NAME };
export const MAX_SESSIONS = 1000;
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_METADATA_BYTES = 64 * 1024;
const modJarNames = modBundleFiles.map(({ name }) => name);
const execFileAsync = promisify(execFile);
export const ACCEPTANCE_NOTE =
  'Records human observations only; it runs no gameplay and never edits docs/RELEASE.md. A person must review the evidence before ticking a box.';
export const UNVERIFIED = 'Not acceptance of a verified release candidate';
const CONFIG_KEYS = [
  ['launcher', 'Launcher'],
  ['server', 'Server'],
  ['model', 'Model'],
  ['mcpClient', 'MCP client'],
];

const line = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[^\n\r]*$/);
const note = z.string().min(1).max(2000);
const time = z.iso.datetime();
const revisionHash = z.string().regex(/^[0-9a-f]{40,64}$/);
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const modProvenanceSchema = z
  .object({
    archiveSha256: sha256.nullable(),
    jars: z
      .array(
        z
          .object({
            name: z
              .string()
              .max(200)
              .regex(/^[a-zA-Z0-9_.+-]+\.jar$/),
            expectedSha256: sha256.nullable(),
            sha256: sha256.nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(20)
      .refine((jars) => new Set(jars.map(({ name }) => name)).size === jars.length, 'duplicate mod jar names'),
  })
  .strict();
const sessionSchema = z
  .object({
    id: z.uuid(),
    gate: z.string().max(64),
    backend: z.enum(SESSION_BACKENDS),
    startedAt: time,
    config: z
      .object({
        launcher: line.nullable(),
        server: line.nullable(),
        model: line.nullable(),
        mcpClient: line.nullable(),
        note: note.nullable(),
      })
      .strict(),
    provenance: z
      .object({
        commit: revisionHash.nullable(),
        dirty: z.boolean().nullable(),
        node: z.string().max(64),
        build: z
          .object({
            sourceCommit: z.string().max(64).nullable(),
            sourceModified: z.boolean().nullable(),
            version: z.string().max(64).nullable(),
            commitMatches: z.boolean(),
            clean: z.boolean(),
          })
          .strict()
          .nullable(),
        archive: z
          .object({
            name: z.string().max(200),
            sha256,
            recorded: sha256.nullable(),
            matches: z.boolean(),
            predatesBuild: z.boolean(),
            manifestMatches: z.boolean().optional(),
          })
          .strict()
          .nullable(),
        mods: modProvenanceSchema.optional(),
      })
      .strict(),
    warnings: z.array(z.string().max(500)).max(20),
    steps: z
      .array(
        z
          .object({
            step: z.number().int().min(1).max(50),
            result: z.enum(['pass', 'fail']),
            note: note.nullable(),
            at: time,
          })
          .strict(),
      )
      .max(500),
    finished: z
      .object({ result: z.enum(['pass', 'fail', 'blocked']), note: note.nullable(), at: time })
      .strict()
      .nullable(),
  })
  .strict();
const fileSchema = z
  .object({ version: z.literal(1), sessions: z.array(sessionSchema).max(MAX_SESSIONS) })
  .strict()
  .refine((file) => new Set(file.sessions.map((session) => session.id)).size === file.sessions.length, {
    message: 'duplicate session ids',
    path: ['sessions'],
  });

export const acceptanceFile = (directory = dataDirectory) => join(directory, ACCEPTANCE_FILE);

async function readBounded(file, limit, label) {
  const info = await file.stat();
  if (!info.isFile()) throw new Error(`${label} is not a regular file.`);
  if (info.size > limit) throw new Error(`${label} is larger than ${limit === MAX_BYTES ? '4 MiB' : '64 KiB'}.`);
  const buffer = Buffer.alloc(info.size + 1);
  let offset = 0;
  while (offset < buffer.length) {
    const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, offset);
    if (!bytesRead) break;
    offset += bytesRead;
  }
  if (offset !== info.size) throw new Error(`${label} changed while it was being read.`);
  return buffer.subarray(0, offset).toString('utf8');
}

/** Returns recorded sessions, or [] when the file does not exist; a corrupt file is an error and is never overwritten. */
export async function readSessions(path) {
  let file;
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw new Error(`Cannot read acceptance sessions at ${path}: ${error.code || error.message}.`);
  }
  let text;
  try {
    text = await readBounded(file, MAX_BYTES, `Acceptance file ${path}`);
  } finally {
    await file.close();
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Acceptance file ${path} is not valid JSON; fix or remove it.`);
  }
  const result = fileSchema.safeParse(parsed);
  if (!result.success) {
    const [issue] = result.error.issues;
    throw new Error(
      `Acceptance file ${path} is invalid (${issue.path.join('.') || 'root'}: ${issue.message}); fix or remove it.`,
    );
  }
  return result.data.sessions;
}

export async function writeSessions(path, sessions) {
  const value = fileSchema.parse({ version: 1, sessions });
  if (Buffer.byteLength(`${JSON.stringify(value, null, 2)}\n`) > MAX_BYTES)
    throw new Error(`Acceptance file would exceed 4 MiB. Archive ${path} before adding more evidence.`);
  await writePrivateJson(path, value);
}

/** Lock only the read, edit, and replacement. Capturing provenance can run outside the lock. */
async function editSessions(path, edit) {
  await mkdir(dirname(path), { mode: 0o700, recursive: true });
  const lock = `${path}.lock`;
  const deadline = Date.now() + 5000;
  while (true) {
    try {
      await mkdir(lock, { mode: 0o700 });
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (Date.now() >= deadline)
        throw new Error(`Acceptance file is locked at ${lock}. Wait for the other writer and try again.`);
      await delay(50);
    }
  }
  try {
    const updated = edit(await readSessions(path));
    await writeSessions(path, updated.sessions);
    return updated;
  } finally {
    await rmdir(lock);
  }
}

export function defaultGit(args, cwd = projectRoot) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout ?? '' };
}

async function sha256File(path) {
  const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    if (!(await file.stat()).isFile()) throw new Error('Not a regular file.');
    const hash = createHash('sha256');
    for await (const chunk of file.createReadStream({ autoClose: false })) hash.update(chunk);
    return hash.digest('hex');
  } finally {
    await file.close();
  }
}
async function readOptional(path) {
  let file;
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
    return await readBounded(file, MAX_METADATA_BYTES, path);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  } finally {
    await file?.close();
  }
}

async function readArchiveEntry(archivePath, name, maxBuffer) {
  const { stdout } = await execFileAsync('unzip', ['-p', resolve(archivePath), name], {
    encoding: 'buffer',
    maxBuffer,
    timeout: 10_000,
  });
  return stdout;
}

async function collectModProvenance(modsDir, archivePath, archive, warnings) {
  const jars = await Promise.all(
    modJarNames.map(async (name) => ({
      name,
      expectedSha256: null,
      sha256: await sha256File(join(modsDir, name)).catch(() => null),
    })),
  );
  const result = { archiveSha256: null, jars };
  if (!archive?.manifestMatches) return result;
  try {
    for (const jar of jars) {
      const bytes = await readArchiveEntry(archivePath, `mods/${jar.name}`, 32 * 1024 * 1024);
      jar.expectedSha256 = createHash('sha256').update(bytes).digest('hex');
    }
    if ((await sha256File(archivePath)) === archive.sha256) result.archiveSha256 = archive.sha256;
    else warnings.push('The candidate archive changed while its mod jars were being checked.');
  } catch (error) {
    warnings.push(
      error.code === 'ENOENT'
        ? 'Could not run unzip or read the candidate archive. Check that unzip is on PATH and the archive exists.'
        : 'Could not read all packaged mod jars from the candidate archive.',
    );
  }
  return result;
}

/** Reads source, bundle, and optional launcher mod provenance for one acceptance session. */
export async function collectProvenance({
  root = projectRoot,
  git = defaultGit,
  node = process.version,
  modsDir,
  candidateDir,
} = {}) {
  const localDist = resolve(root, 'dist');
  const bundleDir = candidateDir === undefined ? localDist : resolve(candidateDir);
  const buildPath = join(bundleDir, 'BUILD.json');
  const sumsPath = join(bundleDir, 'ARCHIVE_SHA256SUMS');
  const warnings = [];
  const revision = git(['rev-parse', 'HEAD'], root),
    changes = git(['status', '--porcelain', '--untracked-files=normal'], root);
  const commit =
    revision.status === 0 && /^[0-9a-f]{40,64}$/.test(revision.stdout.trim()) ? revision.stdout.trim() : null;
  const dirty = changes.status === 0 ? Boolean(changes.stdout.trim()) : null;
  if (!commit) warnings.push('Could not read the git commit.');
  if (dirty === null) warnings.push('Could not read the worktree status.');
  else if (dirty) warnings.push('The worktree has uncommitted changes.');
  let build = null;
  let buildManifest;
  const buildText = await readOptional(buildPath);
  if (buildText === null) warnings.push('BUILD.json is missing from the candidate directory; use a clean mod build.');
  else {
    let data;
    try {
      data = JSON.parse(buildText);
    } catch {
      data = null;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data))
      warnings.push('BUILD.json is not valid JSON for a build manifest.');
    else {
      buildManifest = data;
      const sourceCommit = typeof data.sourceCommit === 'string' ? data.sourceCommit.slice(0, 64) : null;
      const sourceModified = typeof data.sourceModified === 'boolean' ? data.sourceModified : null;
      build = {
        sourceCommit,
        sourceModified,
        version: typeof data.version === 'string' ? data.version.slice(0, 64) : null,
        commitMatches: Boolean(commit) && sourceCommit === commit,
        clean: sourceModified === false,
      };
      if (!build.commitMatches)
        warnings.push(`BUILD.json was built from ${sourceCommit ?? 'an unknown commit'}, not the current commit.`);
      if (!build.clean) warnings.push('BUILD.json does not record a clean source tree (sourceModified is not false).');
    }
  }
  let archive = null;
  const archivePath = join(bundleDir, ARCHIVE_NAME);
  try {
    const archiveSha256 = await sha256File(archivePath);
    const sums = await readOptional(sumsPath);
    const entries =
      sums
        ?.split('\n')
        .map((text) => text.trim().split(/\s+\*?/))
        .filter(([, name]) => name === ARCHIVE_NAME) ?? [];
    const recorded = entries.length === 1 && sha256.safeParse(entries[0][0]).success ? entries[0][0] : null;
    // In the build's output directory, a newer manifest can indicate interrupted packaging.
    // Transferred bundles can get new timestamps, so verify them using the checksums and manifest contents.
    const isLocalDist =
      bundleDir === localDist || (await realpath(bundleDir)) === (await realpath(localDist).catch(() => null));
    const modified = async (path) => (await stat(path).catch(() => null))?.mtimeMs ?? null;
    const [buildAt, sumsAt] = isLocalDist ? await Promise.all([modified(buildPath), modified(sumsPath)]) : [null, null];
    archive = {
      name: ARCHIVE_NAME,
      sha256: archiveSha256,
      recorded,
      matches: recorded === archiveSha256,
      predatesBuild: buildAt !== null && sumsAt !== null && buildAt > sumsAt,
      manifestMatches: false,
    };
    if (archive.predatesBuild)
      warnings.push(
        `dist/BUILD.json is newer than dist/ARCHIVE_SHA256SUMS; packaging did not finish, so ${ARCHIVE_NAME} may be an older build.`,
      );
    if (entries.length > 1) warnings.push(`ARCHIVE_SHA256SUMS repeats the checksum for ${ARCHIVE_NAME}.`);
    else if (!recorded) warnings.push(`ARCHIVE_SHA256SUMS has no checksum for ${ARCHIVE_NAME}.`);
    else if (!archive.matches) warnings.push(`${ARCHIVE_NAME} does not match ARCHIVE_SHA256SUMS.`);
    if (archive.matches && !archive.predatesBuild && buildManifest) {
      try {
        const packed = JSON.parse(await readArchiveEntry(archivePath, 'BUILD.json', MAX_METADATA_BYTES));
        if (!isDeepStrictEqual(packed, buildManifest))
          warnings.push('The archive BUILD.json differs from the loose BUILD.json.');
        else if ((await sha256File(archivePath)) !== archiveSha256)
          warnings.push('The candidate archive changed while its BUILD.json was being checked.');
        else archive.manifestMatches = true;
      } catch (error) {
        warnings.push(
          error.code === 'ENOENT'
            ? 'Could not run unzip or read the candidate archive. Check that unzip is on PATH and the archive exists.'
            : 'Could not read BUILD.json from the candidate archive.',
        );
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    warnings.push(`${ARCHIVE_NAME} is missing from the candidate directory; no artifact checksum was recorded.`);
  }
  const provenance = { commit, dirty, node: String(node).slice(0, 64), build, archive };
  if (modsDir !== undefined) {
    provenance.mods = await collectModProvenance(modsDir, archivePath, archive, warnings);
    warnings.push(...launcherModProblems(provenance));
  }
  return { provenance, warnings };
}

const optional = (value, schema, label) => {
  if (value === undefined || value === null) return null;
  const result = schema.safeParse(String(value).trim());
  if (!result.success)
    throw new Error(
      `${label} must be 1–${schema === note ? 2000 : 200} characters${schema === line ? ' on one line' : ''}.`,
    );
  return result.data;
};

/** Pure: builds a new session after checking that the backend can exercise the gate (demo is a rehearsal only). */
export function createSession({
  gate: gateId,
  backend,
  options = {},
  provenance,
  warnings = [],
  now = new Date(),
  id = randomUUID(),
}) {
  const gate = findGate(gateId);
  if (gate.status !== 'open')
    throw new Error(`Gate ${gate.id} was closed on ${gate.closedOn} after human review; there is nothing to record.`);
  if (!SESSION_BACKENDS.includes(backend)) throw new Error(`Backend must be one of ${SESSION_BACKENDS.join(', ')}.`);
  if (backend !== 'demo' && !requiredBackends(gate).includes(backend))
    throw new Error(
      `Gate ${gate.id} needs backend ${requiredBackends(gate).join(' or ')}${gate.combined ? ' (one session exercising the client and the bot)' : ''}; use demo only to rehearse.`,
    );
  const config = Object.fromEntries(CONFIG_KEYS.map(([key, label]) => [key, optional(options[key], line, label)]));
  config.note = optional(options.note, note, 'Note');
  const allWarnings = [...warnings];
  if (backend === 'demo') allWarnings.push('The demo backend is a rehearsal and never counts as acceptance evidence.');
  if (hasFabric(backend) && !provenance.mods) allWarnings.push(...launcherModProblems(provenance));
  return {
    id,
    gate: gate.id,
    backend,
    startedAt: now.toISOString(),
    config,
    provenance,
    warnings: allWarnings,
    steps: [],
    finished: null,
  };
}

/** Resolves a full session id or an unambiguous prefix of at least six characters. */
export function resolveSession(sessions, reference) {
  const text = String(reference ?? '')
    .trim()
    .toLowerCase();
  const exact = sessions.find((session) => session.id === text);
  if (exact) return exact;
  if (text.length < 6) throw new Error('Give a session id or a prefix of at least 6 characters.');
  const matches = sessions.filter((session) => session.id.startsWith(text));
  if (!matches.length) throw new Error(`No acceptance session matches ${text}. Run "mc-agent acceptance sessions".`);
  if (matches.length > 1)
    throw new Error(`Session prefix ${text} is ambiguous (${matches.length} sessions); give more characters.`);
  return matches[0];
}

const replace = (sessions, updated) => sessions.map((session) => (session.id === updated.id ? updated : session));
const assertOpen = (session) => {
  if (session.finished)
    throw new Error(
      `Session ${session.id.slice(0, 8)} finished as ${session.finished.result}; start a new session instead.`,
    );
};

/** Latest observation per step number; earlier observations stay in the record. */
export const latestSteps = (session) => {
  const map = new Map();
  for (const entry of session.steps) map.set(entry.step, entry);
  return map;
};

/** Pure: appends an observation for step n; re-recording a step keeps the earlier observation. */
export function recordStep(sessions, reference, step, result, { note: text, now = new Date() } = {}) {
  const session = resolveSession(sessions, reference);
  assertOpen(session);
  const gate = findGate(session.gate),
    n = Number(step);
  if (!Number.isInteger(n) || n < 1 || n > gate.steps.length)
    throw new Error(`Step must be an integer from 1 to ${gate.steps.length} for gate ${gate.id}.`);
  if (!['pass', 'fail'].includes(result)) throw new Error('Step result must be pass or fail.');
  const entry = { step: n, result, note: optional(text, note, 'Note'), at: now.toISOString() };
  const updated = { ...session, steps: [...session.steps, entry] };
  return { sessions: replace(sessions, updated), session: updated, entry };
}

/** Pure: finishes a session; fail/blocked need a note, and pass is refused while a step's latest observation failed. */
export function finishSession(sessions, reference, result, { note: text, now = new Date() } = {}) {
  const session = resolveSession(sessions, reference);
  assertOpen(session);
  if (!['pass', 'fail', 'blocked'].includes(result)) throw new Error('Result must be pass, fail, or blocked.');
  const written = optional(text, note, 'Note');
  if (result !== 'pass' && !written) throw new Error(`A ${result} result needs --note describing what happened.`);
  const failed = [...latestSteps(session).values()]
    .filter((entry) => entry.result === 'fail')
    .map((entry) => entry.step);
  if (result === 'pass' && failed.length)
    throw new Error(`Step ${failed.join(', ')} last recorded fail; record a passing observation or finish as fail.`);
  const updated = { ...session, finished: { result, note: written, at: now.toISOString() } };
  return { sessions: replace(sessions, updated), session: updated };
}

const hasFabric = (backend) => backend === 'fabric' || backend === 'both';

function launcherModProblems({ mods, archive }) {
  if (!mods) return ['launcher mod jars were not checked; start with --mods-dir'];
  if (!archive || mods.archiveSha256 !== archive.sha256)
    return ['launcher mod jars were not verified against the recorded archive'];
  const problems = [];
  for (const name of modJarNames) {
    const jar = mods.jars.find((entry) => entry.name === name);
    if (!jar?.expectedSha256) problems.push(`archive hash missing for ${name}`);
    else if (!jar.sha256) problems.push(`launcher mod jar missing or unreadable: ${name}`);
    else if (jar.sha256 !== jar.expectedSha256) problems.push(`launcher mod jar differs from the archive: ${name}`);
  }
  return problems;
}

/** Provenance problems that stop a session counting as acceptance of a verified release candidate. */
export function provenanceProblems({ backend, provenance: p }) {
  const problems = [];
  if (!p.commit) problems.push('git commit unknown');
  if (p.dirty !== false) problems.push(p.dirty ? 'worktree had uncommitted changes' : 'worktree state unknown');
  if (!p.build) problems.push('BUILD.json missing or unreadable');
  else {
    if (!p.build.commitMatches) problems.push('BUILD.json commit does not match the session commit');
    if (!p.build.clean) problems.push('BUILD.json does not record sourceModified false');
  }
  if (!p.archive) problems.push('archive checksum missing');
  else if (!p.archive.matches) problems.push('archive checksum not verified against ARCHIVE_SHA256SUMS');
  else if (p.archive.predatesBuild) problems.push('archive predates BUILD.json; packaging did not finish');
  else if (p.archive.manifestMatches === false)
    problems.push('archive BUILD.json not verified against the loose BUILD.json');
  if (hasFabric(backend)) problems.push(...launcherModProblems(p));
  return problems;
}

/** Every reason a session is not eligible evidence for its gate; an empty list means eligible for human review. */
export function eligibilityProblems(session) {
  const gate = findGate(session.gate),
    problems = [];
  if (!session.finished) problems.push('session not finished');
  else if (session.finished.result !== 'pass') problems.push(`finished as ${session.finished.result}`);
  if (session.backend === 'demo') problems.push('demo backend is a rehearsal');
  else if (!requiredBackends(gate).includes(session.backend))
    problems.push(`backend ${session.backend} does not match gate backend ${gate.backend}`);
  const latest = latestSteps(session);
  const missing = gate.steps.map((_, index) => index + 1).filter((n) => latest.get(n)?.result !== 'pass');
  if (missing.length) problems.push(`steps without a passing observation: ${missing.join(', ')}`);
  return [...problems, ...provenanceProblems(session)];
}

const summary = (session) => ({
  id: session.id,
  gate: session.gate,
  backend: session.backend,
  startedAt: session.startedAt,
  commit: session.provenance.commit,
  archiveSha256: session.provenance.archive?.sha256 ?? null,
  result: session.finished?.result ?? 'unfinished',
  finishedAt: session.finished?.at ?? null,
  steps: latestSteps(session).size,
});

/** Pure: reports the latest evidence for each open gate and checks that eligible gates share one candidate. */
export function acceptanceStatus(sessions, { commit, archiveSha256 } = {}) {
  const candidateSelected = commit !== undefined || archiveSha256 !== undefined;
  if (candidateSelected && (!revisionHash.safeParse(commit).success || !sha256.safeParse(archiveSha256).success))
    throw new Error('Select a candidate with both --commit <git SHA> and --archive-sha256 <64-digit SHA-256>.');
  const evidence = candidateSelected
    ? sessions.filter(
        (session) => session.provenance.commit === commit && session.provenance.archive?.sha256 === archiveSha256,
      )
    : sessions;
  const candidates = new Map();
  const gates = OPEN_GATES.map((gate) => {
    const backends = requiredBackends(gate).map((backend) => {
      const finished = evidence
        .filter((session) => session.gate === gate.id && session.backend === backend && session.finished)
        .sort((a, b) => a.finished.at.localeCompare(b.finished.at));
      const latest = finished.at(-1);
      const problems = latest ? eligibilityProblems(latest) : ['no finished session'];
      return { backend, latest: latest ? summary(latest) : null, eligible: problems.length === 0, problems };
    });
    // Gates that need one session per backend only count when both came from the same candidate.
    const latest = backends.map((entry) => evidence.find((session) => session.id === entry.latest?.id)).filter(Boolean);
    const candidateKeys = new Set(
      latest.map((session) => `${session.provenance.commit}|${session.provenance.archive?.sha256 ?? ''}`),
    );
    const problems = candidateKeys.size > 1 ? ['backend sessions come from different commits or archives'] : [];
    const eligible = backends.every((entry) => entry.eligible) && problems.length === 0;
    if (eligible) {
      const [key] = candidateKeys;
      const { commit, archive } = latest[0].provenance;
      if (!candidates.has(key)) candidates.set(key, { commit, archiveSha256: archive.sha256, gates: [] });
      candidates.get(key).gates.push(gate.id);
    }
    return {
      id: gate.id,
      title: gate.title,
      backend: gate.backend,
      keyboard: gate.keyboard,
      owner: gate.owner,
      eligible,
      problems,
      backends,
    };
  });
  const problems = candidates.size > 1 ? ['eligible gates come from different commits or archives'] : [];
  return {
    ...(candidateSelected ? { selectedCandidate: { commit, archiveSha256 } } : {}),
    gates,
    candidates: [...candidates.values()],
    problems,
    eligible: problems.length ? 0 : gates.filter((gate) => gate.eligible).length,
    open: gates.length,
    note: `${ACCEPTANCE_NOTE} Gate eligibility requires passing steps and verified candidate provenance for the latest finished sessions. The total counts eligible gates when they share one candidate.`,
  };
}

const longDate = (iso) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const flat = (text) => String(text).replace(/\s+/g, ' ').trim();

/** Pure: a Markdown block per session for docs/DEVELOPMENT.md Validation. */
export function renderMarkdown(sessions) {
  if (!sessions.length) return 'No acceptance sessions recorded.\n';
  const blocks = sessions.map((session) => {
    const gate = findGate(session.gate),
      p = session.provenance,
      problems = provenanceProblems(session),
      latest = latestSteps(session);
    const config = CONFIG_KEYS.filter(([key]) => session.config[key]).map(
      ([key, label]) => `${label}: ${flat(session.config[key])}`,
    );
    const result = session.finished
      ? `**${session.finished.result}** (${session.finished.at})${session.finished.note ? ` — ${flat(session.finished.note)}` : ''}`
      : '**unfinished**';
    const archive = p.archive
      ? `\`${p.archive.name}\` sha256 \`${p.archive.sha256}\` (${p.archive.matches ? 'matches ARCHIVE_SHA256SUMS' : p.archive.recorded ? 'does not match ARCHIVE_SHA256SUMS' : 'no recorded checksum'})`
      : 'missing; no checksum recorded';
    const build = p.build
      ? `sourceCommit \`${p.build.sourceCommit ?? 'unknown'}\`, sourceModified ${p.build.sourceModified}${p.build.commitMatches ? '' : ' (does not match the session commit)'}`
      : 'missing';
    const lines = [
      `**Acceptance session ${longDate(session.startedAt)} — ${gate.title}** (\`${gate.id}\`, session \`${session.id.slice(0, 8)}\`)`,
      '',
      `- Result: ${result}`,
      `- Backend: ${session.backend}${config.length ? `; ${config.join('; ')}` : ''}`,
      `- Commit: \`${p.commit ?? 'unknown'}\` (${p.dirty === false ? 'clean worktree' : p.dirty ? 'dirty worktree' : 'worktree state unknown'}); Node ${p.node}`,
      `- BUILD.json: ${build}`,
      `- Artifact: ${archive}`,
      ...(p.archive?.manifestMatches === true ? ['- Archive BUILD.json: matches the loose BUILD.json.'] : []),
      problems.length
        ? `- Provenance: **${UNVERIFIED}:** ${problems.join('; ')}.`
        : '- Provenance: clean commit, BUILD.json matches with sourceModified false, archive checksum verified.',
    ];
    if (p.mods)
      lines.push(
        '- Launcher mods at session start:',
        ...p.mods.jars.map(
          (jar) =>
            `  - \`${jar.name}\` installed SHA-256 \`${jar.sha256 ?? 'unavailable'}\`, archive SHA-256 \`${jar.expectedSha256 ?? 'unavailable'}\``,
        ),
      );
    if (session.backend === 'demo') lines.push(`- **${UNVERIFIED}:** the demo backend is a rehearsal.`);
    lines.push(
      '- Steps:',
      ...gate.steps.map((text, index) => {
        const all = session.steps.filter((entry) => entry.step === index + 1),
          last = latest.get(index + 1);
        const earlier =
          all.length > 1
            ? ` (earlier: ${all
                .slice(0, -1)
                .map((entry) => entry.result)
                .join(', ')})`
            : '';
        return `  ${index + 1}. ${last ? last.result : 'not recorded'}${earlier} — ${text}${last?.note ? ` — ${flat(last.note)}` : ''}`;
      }),
    );
    if (session.config.note) lines.push(`- Notes: ${flat(session.config.note)}`);
    return lines.join('\n');
  });
  const header = `_Recorded with \`mc-agent acceptance\`. ${ACCEPTANCE_NOTE}_`;
  return `${[header, ...blocks].join('\n\n')}\n`;
}

const gateView = (gate) => ({
  id: gate.id,
  title: gate.title,
  status: gate.status,
  backend: gate.backend,
  keyboard: gate.keyboard,
  owner: gate.owner,
  ...(gate.closedOn ? { closedOn: gate.closedOn } : {}),
});

/** Pure: lists catalog gates, optionally only open ones or those a backend can exercise. */
export function listGates({ open: onlyOpen = false, backend } = {}) {
  if (backend !== undefined && !GATE_BACKENDS.includes(backend))
    throw new Error(`Backend filter must be one of ${GATE_BACKENDS.join(', ')}.`);
  // A fabric or mineflayer filter includes gates that need both; "both" shows only those.
  const gates = ACCEPTANCE_GATES.filter(
    (gate) =>
      (!onlyOpen || gate.status === 'open') && (!backend || gate.backend === backend || gate.backend === 'both'),
  );
  return { gates: gates.map(gateView), note: ACCEPTANCE_NOTE };
}

export function registerAcceptanceTools(
  program,
  {
    print,
    write = (text) => process.stdout.write(text),
    directory = dataDirectory,
    root = projectRoot,
    git = defaultGit,
    now = () => new Date(),
    node = process.version,
  } = {},
) {
  const path = acceptanceFile(directory);
  const group = program
    .command('acceptance')
    .description(
      'Record live release-gate acceptance sessions with commit and artifact provenance; never edits RELEASE.md.',
    );
  const readCandidate = (options) =>
    collectProvenance({ root, git, node, modsDir: options.modsDir, candidateDir: options.candidateDir });
  group
    .command('list')
    .description('List live release gates from docs/RELEASE.md, open and closed.')
    .option('--open', 'show only open gates')
    .option('--backend <backend>', 'only gates for fabric, mineflayer, or both')
    .action((options) => print(listGates(options)));
  group
    .command('show <gate>')
    .description('Show a gate with prerequisites, numbered steps, and evidence to record.')
    .action((id) => print({ gate: findGate(id), note: ACCEPTANCE_NOTE }));
  group
    .command('preflight')
    .description('Verify source, archive, and launcher mod provenance without opening a session.')
    .requiredOption('--backend <backend>', `backend under test: ${GATE_BACKENDS.join(', ')}`)
    .option('--candidate-dir <path>', 'read the bundle and its metadata from this directory (default: dist)')
    .option('--mods-dir <path>', 'hash packaged jars in the launcher profile mods directory (uses unzip)')
    .action(async (options) => {
      const { backend } = options;
      if (!GATE_BACKENDS.includes(backend)) throw new Error(`Use a live backend: ${GATE_BACKENDS.join(', ')}.`);
      const { provenance, warnings } = await readCandidate(options);
      const problems = provenanceProblems({ backend, provenance });
      print({ backend, verified: problems.length === 0, provenance, problems, warnings });
      if (problems.length) throw new Error('Candidate verification failed.');
    });
  group
    .command('start <gate>')
    .description('Start a session and record source, archive, and optional launcher mod provenance.')
    .requiredOption('--backend <backend>', `backend under test: ${SESSION_BACKENDS.join(', ')}`)
    .option('--candidate-dir <path>', 'read the bundle and its metadata from this directory (default: dist)')
    .option('--require-candidate', 'refuse to start unless candidate provenance is verified')
    .option('--mods-dir <path>', 'hash packaged jars in the launcher profile mods directory (uses unzip)')
    .option('--launcher <text>', 'launcher and profile, for example "Minecraft Launcher, Fabric Loader 0.16.14"')
    .option('--server <text>', 'world or server, for example "single-player" or "vanilla 1.21.1, offline"')
    .option('--model <text>', 'model name and version')
    .option('--mcp-client <text>', 'MCP client name and version')
    .option('--note <text>', 'free-form setup notes')
    .action(async (gateId, options) => {
      const gate = findGate(gateId);
      const { provenance, warnings } = await readCandidate(options);
      const session = createSession({
        gate: gateId,
        backend: options.backend,
        options,
        provenance,
        warnings,
        now: now(),
      });
      if (options.requireCandidate) {
        if (session.backend === 'demo') throw new Error('Use a live backend with --require-candidate.');
        const problems = provenanceProblems(session);
        if (problems.length) throw new Error(`Candidate verification failed:\n- ${problems.join('\n- ')}`);
      }
      await editSessions(path, (sessions) => {
        if (sessions.length >= MAX_SESSIONS)
          throw new Error(`At most ${MAX_SESSIONS} sessions can be recorded; archive ${path} first.`);
        return { sessions: [...sessions, session] };
      });
      print({
        session,
        file: path,
        steps: gate.steps.map((text, index) => `${index + 1}. ${text}`),
        next: `mc-agent acceptance step ${session.id.slice(0, 8)} <n> pass|fail --note <observation>`,
        note: ACCEPTANCE_NOTE,
      });
    });
  group
    .command('step <session> <n> <result>')
    .description('Record a pass or fail observation for one numbered step.')
    .option('--note <text>', 'what was observed, such as an independent data get read')
    .action(async (reference, n, result, options) => {
      const { session, entry } = await editSessions(path, (sessions) =>
        recordStep(sessions, reference, n, result, { note: options.note, now: now() }),
      );
      print({
        session: session.id,
        gate: session.gate,
        recorded: entry,
        recordedSteps: latestSteps(session).size,
        totalSteps: findGate(session.gate).steps.length,
      });
    });
  group
    .command('finish <session> <result>')
    .description('Finish a session as pass, fail, or blocked; fail and blocked need --note.')
    .option('--note <text>', 'result notes; required for fail or blocked')
    .action(async (reference, result, options) => {
      const { session } = await editSessions(path, (sessions) =>
        finishSession(sessions, reference, result, { note: options.note, now: now() }),
      );
      const problems = eligibilityProblems(session);
      print({ session: summary(session), eligible: problems.length === 0, problems, note: ACCEPTANCE_NOTE });
    });
  group
    .command('sessions')
    .description('List recorded sessions, newest last.')
    .option('--gate <gate>', 'only sessions for one gate')
    .action(async (options) => {
      if (options.gate) findGate(options.gate);
      const sessions = (await readSessions(path)).filter((session) => !options.gate || session.gate === options.gate);
      print({
        sessions: sessions.map((session) => ({
          ...summary(session),
          eligible: eligibilityProblems(session).length === 0,
        })),
        file: path,
      });
    });
  group
    .command('report')
    .description('Render sessions as Markdown for docs/DEVELOPMENT.md Validation, or as JSON.')
    .option('--gate <gate>', 'only sessions for one gate')
    .option('--session <id>', 'report one session by id or unique prefix')
    .option('--format <format>', 'markdown or json', 'markdown')
    .action(async (options) => {
      if (!['markdown', 'json'].includes(options.format)) throw new Error('Format must be markdown or json.');
      if (options.gate) findGate(options.gate);
      const recorded = await readSessions(path);
      const selected = options.session ? [resolveSession(recorded, options.session)] : recorded;
      const sessions = selected.filter((session) => !options.gate || session.gate === options.gate);
      if (options.format === 'json')
        print({
          sessions: sessions.map((session) => ({
            ...session,
            provenanceProblems: provenanceProblems(session),
            eligibilityProblems: eligibilityProblems(session),
          })),
          note: ACCEPTANCE_NOTE,
        });
      else write(renderMarkdown(sessions));
    });
  group
    .command('review-bot <results...>')
    .description('Review bot runner results grouped by release gate for one clean source commit.')
    .requiredOption('--commit <sha>', 'full source commit SHA of the release candidate')
    .action(async (files, { commit }) => {
      const { reviewBotEvidence } = await import('../scripts/live-acceptance/review.js');
      const report = await reviewBotEvidence(files, commit);
      print(report);
      if (report.rejected.length) throw new Error(`${report.rejected.length} bot result file(s) rejected.`);
    });
  group
    .command('status')
    .description('Show the latest evidence for each open gate and whether eligible gates share one candidate.')
    .option('--commit <sha>', 'inspect one candidate, paired with --archive-sha256')
    .option('--archive-sha256 <sha>', 'inspect one candidate, paired with --commit')
    .option('--require-eligible', 'exit unsuccessfully if any open gate lacks eligible evidence')
    .action(async (options) => {
      const status = acceptanceStatus(await readSessions(path), options);
      print(status);
      if (options.requireEligible && status.eligible !== status.open)
        throw new Error(
          `Only ${status.eligible} of ${status.open} open gates have eligible evidence on one candidate.`,
        );
    });
  return group;
}
