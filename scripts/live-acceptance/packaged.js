/**
 * The packaged-jar Fabric pre-check (`npm run acceptance:fabric -- --packaged`): copies the three jars out of the
 * release archive into the client's mods folder, checks them with the acceptance provenance helpers, and reads the
 * client's latest.log to confirm Fabric Loader ran in production mode with exactly those mods and no mixin or
 * linkage errors.
 */
import { execFile } from 'node:child_process';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { collectProvenance } from '../../src/acceptance-tools.js';
import { ARCHIVE_NAME, modBundleFiles } from '../../src/bundle.js';
import { projectRoot } from '../../src/config.js';

const execFileAsync = promisify(execFile);
export const DEFAULT_ARCHIVE = join(projectRoot, 'dist', ARCHIVE_NAME);
export const PACKAGED_JARS = modBundleFiles.map(({ name }) => name);
/** The top-level mod ids the three packaged jars provide. */
export const PACKAGED_MOD_IDS = ['minecraft_agent', 'fabric-api', 'baritone'];
/** Nested jars that must load from inside a packaged jar: Baritone's nether-pathfinder library. */
export const PACKAGED_NESTED_IDS = ['dev_babbaj_nether-pathfinder'];
export const BUILD_FIRST = 'Run npm run build:mod first, or pass --archive.';

/** `--archive` names the ZIP; its ARCHIVE_SHA256SUMS and BUILD.json sit next to it, as npm run build:mod leaves them. */
export function archiveNameProblem(archive) {
  return basename(archive) === ARCHIVE_NAME
    ? null
    : `--archive must point to ${ARCHIVE_NAME}, next to its ARCHIVE_SHA256SUMS and BUILD.json (as npm run build:mod writes them in dist/).`;
}

async function unzipEntry(archive, name) {
  const { stdout } = await execFileAsync('unzip', ['-p', archive, name], {
    encoding: 'buffer',
    maxBuffer: 32 * 1024 * 1024,
    timeout: 30_000,
  });
  return stdout;
}

/**
 * Writes the archive's three jars into `modsDir` (which must hold nothing else), then checks the archive and the
 * copies with collectProvenance: ARCHIVE_SHA256SUMS, BUILD.json inside and beside the ZIP, the bundle's own
 * SHA256SUMS and pinned dependency hashes, and each copied jar against the archive entry. Throws when any of that
 * fails; commit and clean-tree findings are warnings, since a pre-check can run a candidate from another commit.
 */
export async function preparePackagedMods(
  { archive, modsDir },
  { collect = collectProvenance, readEntry = unzipEntry } = {},
) {
  const nameProblem = archiveNameProblem(archive);
  if (nameProblem) throw new Error(nameProblem);
  await mkdir(modsDir, { recursive: true, mode: 0o700 });
  try {
    for (const name of PACKAGED_JARS) await writeFile(join(modsDir, name), await readEntry(archive, `mods/${name}`));
  } catch (error) {
    throw new Error(
      `Could not copy the packaged jars out of ${archive} (${error.code === 'ENOENT' ? 'is unzip on PATH?' : error.message.split('\n')[0]}).`,
    );
  }
  const present = (await readdir(modsDir)).sort();
  if (JSON.stringify(present) !== JSON.stringify([...PACKAGED_JARS].sort()))
    throw new Error(`The client mods folder must hold only the packaged jars; found ${present.join(', ')}.`);
  const { provenance, warnings } = await collect({ candidateDir: dirname(archive), modsDir });
  if (!provenance.archive?.bundleVerified)
    throw new Error(
      `The packaged archive did not verify: ${warnings.join(' ') || 'no reason recorded'} ${BUILD_FIRST}`,
    );
  const jars = provenance.mods?.jars ?? [];
  const mismatched = PACKAGED_JARS.filter((name) => {
    const jar = jars.find((entry) => entry.name === name);
    return !jar?.sha256 || jar.sha256 !== jar.expectedSha256;
  });
  if (mismatched.length)
    throw new Error(`The copied jars do not match the archive: ${mismatched.join(', ')}. ${warnings.join(' ')}`.trim());
  return {
    archive,
    archiveSha256: provenance.archive.sha256,
    build: provenance.build,
    modsDirectory: modsDir,
    jars: jars.map(({ name, sha256 }) => ({ name, sha256 })),
    warnings,
  };
}

// Lines that mean the packaged jars did not load or link as they do in a launcher: mixin and refmap failures, and
// the linkage errors a remapping mistake throws (a name the intermediary game jar does not have).
const PROBLEM =
  /Mixin apply.*failed|Mixin.*(?:error|exception)|InvalidMixinException|MixinApplyError|MixinTransformerError|Reference map .* could not be read|refmap.*(?:not found|could not|failed)|NoSuchMethodError|NoSuchFieldError|NoClassDefFoundError|ClassNotFoundException|AbstractMethodError|IncompatibleClassChangeError|Incompatible mods? set|mod resolution|Could not execute entrypoint/i;

/** Pure: what latest.log says about the loader, the mod list and any mixin or linkage problems. */
export function parseClientLog(text) {
  const lines = text.split(/\r?\n/);
  const loader = /Loading Minecraft (\S+) with Fabric Loader (\S+)/.exec(text);
  const mods = {};
  const nested = {};
  const start = lines.findIndex((line) => /Loading \d+ mods:/.test(line));
  if (start >= 0)
    for (const line of lines.slice(start + 1)) {
      const top = /^\t- (\S+) (\S+)/.exec(line);
      const inner = /^\t\s+[|\\]-- (\S+) (\S+)/.exec(line);
      if (top) mods[top[1]] = top[2];
      else if (inner) nested[inner[1]] = inner[2];
      else if (!/^\t\s/.test(line)) break;
    }
  return {
    minecraftVersion: loader?.[1] ?? null,
    loaderVersion: loader?.[2] ?? null,
    mods,
    nested,
    problems: lines.filter((line) => PROBLEM.test(line)).slice(0, 20),
  };
}

/**
 * The packaged smoke check, run once each client's bridge is ready. Production mode shows as the game jar Fabric
 * Loader deobfuscated into `<gameDir>/.fabric/remappedJars` (a development client runs the named jar Loom built
 * and writes none), and latest.log must list each packaged mod id, Baritone's nested nether-pathfinder, and no
 * mixin or linkage problem.
 */
export async function checkPackagedClient({ gameDir }, { read = readFile, list = readdir } = {}) {
  const log = join(gameDir, 'logs', 'latest.log');
  const parsed = parseClientLog(await read(log, 'utf8').catch(() => ''));
  const remappedJars = await list(join(gameDir, '.fabric', 'remappedJars')).catch(() => []);
  const missing = [
    ...PACKAGED_MOD_IDS.filter((id) => !parsed.mods[id]),
    ...PACKAGED_NESTED_IDS.filter((id) => !parsed.nested[id]).map((id) => `${id} (nested)`),
  ];
  const problems = [
    ...(parsed.loaderVersion ? [] : [`no Fabric Loader start line in ${log}`]),
    ...(remappedJars.length
      ? []
      : ['Fabric Loader did not deobfuscate the game jar, so it did not run in production mode']),
    ...(missing.length ? [`latest.log does not list the mods ${missing.join(', ')}`] : []),
    ...parsed.problems.map((line) => `latest.log: ${line.trim().slice(0, 300)}`),
  ];
  return {
    pass: problems.length === 0,
    log,
    production: remappedJars.length > 0,
    remappedJars,
    minecraftVersion: parsed.minecraftVersion,
    loaderVersion: parsed.loaderVersion,
    mods: Object.fromEntries(PACKAGED_MOD_IDS.map((id) => [id, parsed.mods[id] ?? null])),
    nested: Object.fromEntries(PACKAGED_NESTED_IDS.map((id) => [id, parsed.nested[id] ?? null])),
    modCount: Object.keys(parsed.mods).length,
    problems,
  };
}
