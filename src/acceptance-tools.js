import { z } from 'zod';
import { open, readFile } from 'node:fs/promises';
import { createReadStream, constants } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { dataDirectory, projectRoot, writePrivateJson } from './config.js';
import { ACCEPTANCE_GATES, OPEN_GATES, SESSION_BACKENDS, GATE_BACKENDS, findGate, requiredBackends } from './acceptance-gates.js';

export const ACCEPTANCE_FILE = 'acceptance-sessions.json';
export const ARCHIVE_NAME = 'minecraft-agent-0.1.0.zip';
export const MAX_SESSIONS = 1000;
const MAX_BYTES = 4 * 1024 * 1024;
export const ACCEPTANCE_NOTE = 'Records human observations only; it runs no gameplay and never edits docs/RELEASE.md. A person must review the evidence before ticking a box.';
export const UNVERIFIED = 'Not acceptance of a verified release candidate';
const CONFIG_KEYS = [['launcher', 'Launcher'], ['server', 'Server'], ['model', 'Model'], ['mcpClient', 'MCP client']];

const line = z.string().min(1).max(200).regex(/^[^\n\r]*$/);
const note = z.string().min(1).max(2000);
const time = z.iso.datetime();
const sessionSchema = z.object({
  id: z.uuid(), gate: z.string().max(64), backend: z.enum(SESSION_BACKENDS), startedAt: time,
  config: z.object({ launcher: line.nullable(), server: line.nullable(), model: line.nullable(), mcpClient: line.nullable(), note: note.nullable() }).strict(),
  provenance: z.object({
    commit: z.string().regex(/^[0-9a-f]{40,64}$/).nullable(), dirty: z.boolean().nullable(), node: z.string().max(64),
    build: z.object({ sourceCommit: z.string().max(64).nullable(), sourceModified: z.boolean().nullable(), version: z.string().max(64).nullable(), commitMatches: z.boolean(), clean: z.boolean() }).strict().nullable(),
    archive: z.object({ name: z.string().max(200), sha256: z.string().regex(/^[0-9a-f]{64}$/), recorded: z.string().regex(/^[0-9a-f]{64}$/).nullable(), matches: z.boolean() }).strict().nullable(),
  }).strict(),
  warnings: z.array(z.string().max(500)).max(20),
  steps: z.array(z.object({ step: z.number().int().min(1).max(50), result: z.enum(['pass', 'fail']), note: note.nullable(), at: time }).strict()).max(500),
  finished: z.object({ result: z.enum(['pass', 'fail', 'blocked']), note: note.nullable(), at: time }).strict().nullable(),
}).strict();
const fileSchema = z.object({ version: z.literal(1), sessions: z.array(sessionSchema).max(MAX_SESSIONS) }).strict()
  .refine(file => new Set(file.sessions.map(session => session.id)).size === file.sessions.length, { message: 'duplicate session ids', path: ['sessions'] });

export const acceptanceFile = (directory = dataDirectory) => join(directory, ACCEPTANCE_FILE);

/** Returns recorded sessions, or [] when the file does not exist; a corrupt file is an error and is never overwritten. */
export async function readSessions(path) {
  let file;
  try { file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK); }
  catch (error) {
    if (error.code === 'ENOENT') return [];
    throw new Error(`Cannot read acceptance sessions at ${path}: ${error.code || error.message}.`);
  }
  let text;
  try {
    if (!(await file.stat()).isFile()) throw new Error(`Acceptance file ${path} is not a regular file; fix or remove it.`);
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead > MAX_BYTES) throw new Error(`Acceptance file ${path} is larger than 4 MiB; fix or remove it.`);
    text = buffer.subarray(0, bytesRead).toString('utf8');
  } finally { await file.close(); }
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error(`Acceptance file ${path} is not valid JSON; fix or remove it.`); }
  const result = fileSchema.safeParse(parsed);
  if (!result.success) {
    const [issue] = result.error.issues;
    throw new Error(`Acceptance file ${path} is invalid (${issue.path.join('.') || 'root'}: ${issue.message}); fix or remove it.`);
  }
  return result.data.sessions;
}

export async function writeSessions(path, sessions) {
  await writePrivateJson(path, fileSchema.parse({ version: 1, sessions }));
}

export function defaultGit(args, cwd = projectRoot) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout ?? '' };
}

async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
async function readOptional(path) {
  try { return await readFile(path, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

/** Reads the git commit, worktree state, dist/BUILD.json, and archive checksum; missing pieces become null with a warning. */
export async function collectProvenance({ root = projectRoot, git = defaultGit, node = process.version } = {}) {
  const warnings = [];
  const revision = git(['rev-parse', 'HEAD']), changes = git(['status', '--porcelain', '--untracked-files=normal']);
  const commit = revision.status === 0 && /^[0-9a-f]{40,64}$/.test(revision.stdout.trim()) ? revision.stdout.trim() : null;
  const dirty = changes.status === 0 ? Boolean(changes.stdout.trim()) : null;
  if (!commit) warnings.push('Could not read the git commit.');
  if (dirty === null) warnings.push('Could not read the worktree status.');
  else if (dirty) warnings.push('The worktree has uncommitted changes.');
  let build = null;
  const buildText = await readOptional(join(root, 'dist/BUILD.json'));
  if (buildText === null) warnings.push('dist/BUILD.json is missing; run npm run build:mod from a clean commit.');
  else {
    let data;
    try { data = JSON.parse(buildText); } catch { data = null; }
    if (!data || typeof data !== 'object') warnings.push('dist/BUILD.json is not valid JSON.');
    else {
      const sourceCommit = typeof data.sourceCommit === 'string' ? data.sourceCommit.slice(0, 64) : null;
      const sourceModified = typeof data.sourceModified === 'boolean' ? data.sourceModified : null;
      build = { sourceCommit, sourceModified, version: typeof data.version === 'string' ? data.version.slice(0, 64) : null, commitMatches: Boolean(commit) && sourceCommit === commit, clean: sourceModified === false };
      if (!build.commitMatches) warnings.push(`dist/BUILD.json was built from ${sourceCommit ?? 'an unknown commit'}, not the current commit.`);
      if (!build.clean) warnings.push('dist/BUILD.json does not record a clean source tree (sourceModified is not false).');
    }
  }
  let archive = null;
  try {
    const sha256 = await sha256File(join(root, 'dist', ARCHIVE_NAME));
    const sums = await readOptional(join(root, 'dist/ARCHIVE_SHA256SUMS'));
    const entry = sums?.split('\n').map(text => text.trim().split(/\s+\*?/)).find(([, name]) => name === ARCHIVE_NAME);
    const recorded = entry && /^[0-9a-f]{64}$/.test(entry[0]) ? entry[0] : null;
    archive = { name: ARCHIVE_NAME, sha256, recorded, matches: recorded === sha256 };
    if (!recorded) warnings.push(`dist/ARCHIVE_SHA256SUMS has no checksum for ${ARCHIVE_NAME}.`);
    else if (!archive.matches) warnings.push(`dist/${ARCHIVE_NAME} does not match dist/ARCHIVE_SHA256SUMS.`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    warnings.push(`dist/${ARCHIVE_NAME} is missing; no artifact checksum was recorded.`);
  }
  return { provenance: { commit, dirty, node: String(node).slice(0, 64), build, archive }, warnings };
}

const optional = (value, schema, label) => {
  if (value === undefined || value === null) return null;
  const result = schema.safeParse(String(value).trim());
  if (!result.success) throw new Error(`${label} must be 1–${schema === note ? 2000 : 200} characters${schema === line ? ' on one line' : ''}.`);
  return result.data;
};

/** Pure: builds a new session after checking that the backend can exercise the gate (demo is a rehearsal only). */
export function createSession({ gate: gateId, backend, options = {}, provenance, warnings = [], now = new Date(), id = randomUUID() }) {
  const gate = findGate(gateId);
  if (gate.status !== 'open') throw new Error(`Gate ${gate.id} was closed on ${gate.closedOn} after human review; there is nothing to record.`);
  if (!SESSION_BACKENDS.includes(backend)) throw new Error(`Backend must be one of ${SESSION_BACKENDS.join(', ')}.`);
  if (backend !== 'demo' && !requiredBackends(gate).includes(backend)) throw new Error(`Gate ${gate.id} needs backend ${requiredBackends(gate).join(' or ')}${gate.combined ? ' (one session exercising the client and the bot)' : ''}; use demo only to rehearse.`);
  const config = Object.fromEntries(CONFIG_KEYS.map(([key, label]) => [key, optional(options[key], line, label)]));
  config.note = optional(options.note, note, 'Note');
  const allWarnings = [...warnings];
  if (backend === 'demo') allWarnings.push('The demo backend is a rehearsal and never counts as acceptance evidence.');
  return { id, gate: gate.id, backend, startedAt: now.toISOString(), config, provenance, warnings: allWarnings, steps: [], finished: null };
}

/** Resolves a full session id or an unambiguous prefix of at least six characters. */
export function resolveSession(sessions, reference) {
  const text = String(reference ?? '').trim().toLowerCase();
  const exact = sessions.find(session => session.id === text);
  if (exact) return exact;
  if (text.length < 6) throw new Error('Give a session id or a prefix of at least 6 characters.');
  const matches = sessions.filter(session => session.id.startsWith(text));
  if (!matches.length) throw new Error(`No acceptance session matches ${text}. Run "mc-agent acceptance sessions".`);
  if (matches.length > 1) throw new Error(`Session prefix ${text} is ambiguous (${matches.length} sessions); give more characters.`);
  return matches[0];
}

const replace = (sessions, updated) => sessions.map(session => session.id === updated.id ? updated : session);
const assertOpen = session => { if (session.finished) throw new Error(`Session ${session.id.slice(0, 8)} finished as ${session.finished.result}; start a new session instead.`); };

/** Latest observation per step number; earlier observations stay in the record. */
export const latestSteps = session => { const map = new Map(); for (const entry of session.steps) map.set(entry.step, entry); return map; };

/** Pure: appends an observation for step n; re-recording a step keeps the earlier observation. */
export function recordStep(sessions, reference, step, result, { note: text, now = new Date() } = {}) {
  const session = resolveSession(sessions, reference); assertOpen(session);
  const gate = findGate(session.gate), n = Number(step);
  if (!Number.isInteger(n) || n < 1 || n > gate.steps.length) throw new Error(`Step must be an integer from 1 to ${gate.steps.length} for gate ${gate.id}.`);
  if (!['pass', 'fail'].includes(result)) throw new Error('Step result must be pass or fail.');
  const entry = { step: n, result, note: optional(text, note, 'Note'), at: now.toISOString() };
  const updated = { ...session, steps: [...session.steps, entry] };
  return { sessions: replace(sessions, updated), session: updated, entry };
}

/** Pure: finishes a session; fail/blocked need a note, and pass is refused while a step's latest observation failed. */
export function finishSession(sessions, reference, result, { note: text, now = new Date() } = {}) {
  const session = resolveSession(sessions, reference); assertOpen(session);
  if (!['pass', 'fail', 'blocked'].includes(result)) throw new Error('Result must be pass, fail, or blocked.');
  const written = optional(text, note, 'Note');
  if (result !== 'pass' && !written) throw new Error(`A ${result} result needs --note describing what happened.`);
  const failed = [...latestSteps(session).values()].filter(entry => entry.result === 'fail').map(entry => entry.step);
  if (result === 'pass' && failed.length) throw new Error(`Step ${failed.join(', ')} last recorded fail; record a passing observation or finish as fail.`);
  const updated = { ...session, finished: { result, note: written, at: now.toISOString() } };
  return { sessions: replace(sessions, updated), session: updated };
}

/** Provenance problems that stop a session counting as acceptance of a verified release candidate. */
export function provenanceProblems({ provenance: p }) {
  const problems = [];
  if (!p.commit) problems.push('git commit unknown');
  if (p.dirty !== false) problems.push(p.dirty ? 'worktree had uncommitted changes' : 'worktree state unknown');
  if (!p.build) problems.push('dist/BUILD.json missing or unreadable');
  else {
    if (!p.build.commitMatches) problems.push('BUILD.json commit does not match the session commit');
    if (!p.build.clean) problems.push('BUILD.json does not record sourceModified false');
  }
  if (!p.archive) problems.push('archive checksum missing');
  else if (!p.archive.matches) problems.push('archive checksum not verified against ARCHIVE_SHA256SUMS');
  return problems;
}

/** Every reason a session is not eligible evidence for its gate; an empty list means eligible for human review. */
export function eligibilityProblems(session) {
  const gate = findGate(session.gate), problems = [];
  if (!session.finished) problems.push('session not finished');
  else if (session.finished.result !== 'pass') problems.push(`finished as ${session.finished.result}`);
  if (session.backend === 'demo') problems.push('demo backend is a rehearsal');
  else if (!requiredBackends(gate).includes(session.backend)) problems.push(`backend ${session.backend} does not match gate backend ${gate.backend}`);
  const latest = latestSteps(session);
  const missing = gate.steps.map((_, index) => index + 1).filter(n => latest.get(n)?.result !== 'pass');
  if (missing.length) problems.push(`steps without a passing observation: ${missing.join(', ')}`);
  return [...problems, ...provenanceProblems(session)];
}

const summary = session => ({ id: session.id, gate: session.gate, backend: session.backend, startedAt: session.startedAt, commit: session.provenance.commit, result: session.finished?.result ?? 'unfinished', finishedAt: session.finished?.at ?? null, steps: latestSteps(session).size });

/** Pure: per open gate and required backend, the latest finished session and whether it is eligible evidence. */
export function acceptanceStatus(sessions) {
  const gates = OPEN_GATES.map(gate => {
    const backends = requiredBackends(gate).map(backend => {
      const finished = sessions.filter(session => session.gate === gate.id && session.backend === backend && session.finished)
        .sort((a, b) => a.finished.at.localeCompare(b.finished.at));
      const latest = finished.at(-1);
      const problems = latest ? eligibilityProblems(latest) : ['no finished session'];
      return { backend, latest: latest ? summary(latest) : null, eligible: problems.length === 0, problems };
    });
    // Gates that need one session per backend only count when both came from the same candidate.
    const latest = backends.map(entry => sessions.find(session => session.id === entry.latest?.id)).filter(Boolean);
    const candidates = new Set(latest.map(session => `${session.provenance.commit}|${session.provenance.archive?.sha256 ?? ''}`));
    const problems = latest.length > 1 && candidates.size > 1 ? ['backend sessions come from different commits or archives'] : [];
    return { id: gate.id, title: gate.title, backend: gate.backend, keyboard: gate.keyboard, owner: gate.owner,
      eligible: backends.every(entry => entry.eligible) && problems.length === 0, problems, backends };
  });
  return { gates, eligible: gates.filter(gate => gate.eligible).length, open: gates.length,
    note: `${ACCEPTANCE_NOTE} "Eligible" means the latest finished session passed every step on a clean commit with a matching BUILD.json and verified archive; it does not close the gate.` };
}

const longDate = iso => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const flat = text => String(text).replace(/\s+/g, ' ').trim();

/** Pure: a Markdown block per session for docs/DEVELOPMENT.md Validation. */
export function renderMarkdown(sessions) {
  if (!sessions.length) return 'No acceptance sessions recorded.\n';
  const blocks = sessions.map(session => {
    const gate = findGate(session.gate), p = session.provenance, problems = provenanceProblems(session), latest = latestSteps(session);
    const config = CONFIG_KEYS.filter(([key]) => session.config[key]).map(([key, label]) => `${label}: ${flat(session.config[key])}`);
    const result = session.finished ? `**${session.finished.result}** (${session.finished.at})${session.finished.note ? ` — ${flat(session.finished.note)}` : ''}` : '**unfinished**';
    const archive = p.archive ? `\`${p.archive.name}\` sha256 \`${p.archive.sha256}\` (${p.archive.matches ? 'matches ARCHIVE_SHA256SUMS' : p.archive.recorded ? 'does not match ARCHIVE_SHA256SUMS' : 'no recorded checksum'})` : 'missing; no checksum recorded';
    const build = p.build ? `sourceCommit \`${p.build.sourceCommit ?? 'unknown'}\`, sourceModified ${p.build.sourceModified}${p.build.commitMatches ? '' : ' (does not match the session commit)'}` : 'missing';
    const lines = [
      `**Acceptance session ${longDate(session.startedAt)} — ${gate.title}** (\`${gate.id}\`, session \`${session.id.slice(0, 8)}\`)`, '',
      `- Result: ${result}`,
      `- Backend: ${session.backend}${config.length ? `; ${config.join('; ')}` : ''}`,
      `- Commit: \`${p.commit ?? 'unknown'}\` (${p.dirty === false ? 'clean worktree' : p.dirty ? 'dirty worktree' : 'worktree state unknown'}); Node ${p.node}`,
      `- BUILD.json: ${build}`,
      `- Artifact: ${archive}`,
      problems.length ? `- Provenance: **${UNVERIFIED}:** ${problems.join('; ')}.` : '- Provenance: clean commit, BUILD.json matches with sourceModified false, archive checksum verified.',
    ];
    if (session.backend === 'demo') lines.push(`- **${UNVERIFIED}:** the demo backend is a rehearsal.`);
    lines.push('- Steps:', ...gate.steps.map((text, index) => {
      const all = session.steps.filter(entry => entry.step === index + 1), last = latest.get(index + 1);
      const earlier = all.length > 1 ? ` (earlier: ${all.slice(0, -1).map(entry => entry.result).join(', ')})` : '';
      return `  ${index + 1}. ${last ? last.result : 'not recorded'}${earlier} — ${text}${last?.note ? ` — ${flat(last.note)}` : ''}`;
    }));
    if (session.config.note) lines.push(`- Notes: ${flat(session.config.note)}`);
    return lines.join('\n');
  });
  return [`_Recorded with \`mc-agent acceptance\`. ${ACCEPTANCE_NOTE}_`, ...blocks].join('\n\n') + '\n';
}

const gateView = gate => ({ id: gate.id, title: gate.title, status: gate.status, backend: gate.backend, keyboard: gate.keyboard, owner: gate.owner, ...(gate.closedOn ? { closedOn: gate.closedOn } : {}) });

/** Pure: lists catalog gates, optionally only open ones or those a backend can exercise. */
export function listGates({ open: onlyOpen = false, backend } = {}) {
  if (backend !== undefined && !GATE_BACKENDS.includes(backend)) throw new Error(`Backend filter must be one of ${GATE_BACKENDS.join(', ')}.`);
  // A fabric or mineflayer filter includes gates that need both; "both" shows only those.
  const gates = ACCEPTANCE_GATES.filter(gate => (!onlyOpen || gate.status === 'open') && (!backend || gate.backend === backend || gate.backend === 'both'));
  return { gates: gates.map(gateView), note: ACCEPTANCE_NOTE };
}

export function registerAcceptanceTools(program, { print, write = text => process.stdout.write(text), directory = dataDirectory, root = projectRoot, git = defaultGit, now = () => new Date(), node = process.version } = {}) {
  const path = acceptanceFile(directory);
  const group = program.command('acceptance').description('Record live release-gate acceptance sessions with commit and artifact provenance; never edits RELEASE.md.');
  group.command('list').description('List live release gates from docs/RELEASE.md, open and closed.')
    .option('--open', 'show only open gates').option('--backend <backend>', 'only gates for fabric, mineflayer, or both')
    .action(options => print(listGates(options)));
  group.command('show <gate>').description('Show a gate with prerequisites, numbered steps, and evidence to record.')
    .action(id => print({ gate: findGate(id), note: ACCEPTANCE_NOTE }));
  group.command('start <gate>').description('Start a session recording the commit, worktree state, BUILD.json, and archive checksum.')
    .requiredOption('--backend <backend>', `backend under test: ${SESSION_BACKENDS.join(', ')}`)
    .option('--launcher <text>', 'launcher and profile, for example "Minecraft Launcher, Fabric Loader 0.16.14"')
    .option('--server <text>', 'world or server, for example "single-player" or "vanilla 1.21.1, offline"')
    .option('--model <text>', 'model name and version').option('--mcp-client <text>', 'MCP client name and version')
    .option('--note <text>', 'free-form setup notes')
    .action(async (gateId, options) => {
      const sessions = await readSessions(path);
      if (sessions.length >= MAX_SESSIONS) throw new Error(`At most ${MAX_SESSIONS} sessions can be recorded; archive ${path} first.`);
      findGate(gateId);
      const { provenance, warnings } = await collectProvenance({ root, git, node });
      const session = createSession({ gate: gateId, backend: options.backend, options, provenance, warnings, now: now() });
      await writeSessions(path, [...sessions, session]);
      const gate = findGate(gateId);
      print({ session, file: path, steps: gate.steps.map((text, index) => `${index + 1}. ${text}`), next: `mc-agent acceptance step ${session.id.slice(0, 8)} <n> pass|fail --note <observation>`, note: ACCEPTANCE_NOTE });
    });
  group.command('step <session> <n> <result>').description('Record a pass or fail observation for one numbered step.')
    .option('--note <text>', 'what was observed, such as an independent data get read')
    .action(async (reference, n, result, options) => {
      const { sessions, session, entry } = recordStep(await readSessions(path), reference, n, result, { note: options.note, now: now() });
      await writeSessions(path, sessions);
      print({ session: session.id, gate: session.gate, recorded: entry, recordedSteps: latestSteps(session).size, totalSteps: findGate(session.gate).steps.length });
    });
  group.command('finish <session> <result>').description('Finish a session as pass, fail, or blocked; fail and blocked need --note.')
    .option('--note <text>', 'result notes; required for fail or blocked')
    .action(async (reference, result, options) => {
      const { sessions, session } = finishSession(await readSessions(path), reference, result, { note: options.note, now: now() });
      await writeSessions(path, sessions);
      const problems = eligibilityProblems(session);
      print({ session: summary(session), eligible: problems.length === 0, problems, note: ACCEPTANCE_NOTE });
    });
  group.command('sessions').description('List recorded sessions, newest last.').option('--gate <gate>', 'only sessions for one gate')
    .action(async options => {
      if (options.gate) findGate(options.gate);
      const sessions = (await readSessions(path)).filter(session => !options.gate || session.gate === options.gate);
      print({ sessions: sessions.map(session => ({ ...summary(session), eligible: eligibilityProblems(session).length === 0 })), file: path });
    });
  group.command('report').description('Render sessions as Markdown for docs/DEVELOPMENT.md Validation, or as JSON.')
    .option('--gate <gate>', 'only sessions for one gate').option('--format <format>', 'markdown or json', 'markdown')
    .action(async options => {
      if (!['markdown', 'json'].includes(options.format)) throw new Error('Format must be markdown or json.');
      if (options.gate) findGate(options.gate);
      const sessions = (await readSessions(path)).filter(session => !options.gate || session.gate === options.gate);
      if (options.format === 'json') print({ sessions: sessions.map(session => ({ ...session, provenanceProblems: provenanceProblems(session), eligibilityProblems: eligibilityProblems(session) })), note: ACCEPTANCE_NOTE });
      else write(renderMarkdown(sessions));
    });
  group.command('status').description('Show, per open gate, the latest finished session and whether it is eligible evidence.')
    .action(async () => print(acceptanceStatus(await readSessions(path))));
  return group;
}
