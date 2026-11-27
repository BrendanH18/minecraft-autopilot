import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { collectProvenance } from '../src/acceptance-tools.js';
import { ARCHIVE_NAME } from '../src/bundle.js';
import {
  DEFAULT_ARCHIVE,
  PACKAGED_JARS,
  archiveNameProblem,
  checkPackagedClient,
  parseClientLog,
  preparePackagedMods,
} from '../scripts/live-acceptance/packaged.js';
import { archiveTest, candidateZip, expectedFiles, jarContents } from './acceptance-zip.js';
import { testDirectory } from './helpers.js';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

// Abridged from the packaged run's latest.log (Fabric Loader 0.20.1 in production mode, in Boat).
const LOG = `[03:39:08] [main/INFO]: Loading Minecraft 1.21.1 with Fabric Loader 0.20.1
[03:39:08] [main/INFO]: Loading 57 mods:
\t- baritone 1.11.3
\t   \\-- dev_babbaj_nether-pathfinder 1.6
\t- fabric-api 0.116.18+1.21.1
\t   |-- fabric-api-base 0.4.42+6573ed8c19
\t   \\-- fabric-screen-api-v1 2.0.25+8b68f1c719
\t- fabricloader 0.20.1
\t   \\-- mixinextras 0.5.5
\t- java 21
\t- minecraft 1.21.1
\t- minecraft_agent 0.1.0
[12:00:01] [main/INFO]: SpongePowered MIXIN Subsystem Version=0.8.7 Source=file:/loader.jar Service=Knot/Fabric Env=CLIENT
`;

test('the archive must keep its release name so its checksum and build files beside it are found', () => {
  assert.equal(archiveNameProblem(DEFAULT_ARCHIVE), null);
  assert.match(DEFAULT_ARCHIVE, /\/dist\/minecraft-agent-0\.1\.0\.zip$/);
  assert.match(archiveNameProblem('/tmp/renamed.zip'), /must point to minecraft-agent-0\.1\.0\.zip/);
});

test('latest.log parsing finds the loader, the top-level mods only, and mixin or linkage problems', () => {
  const clean = parseClientLog(LOG);
  assert.equal(clean.loaderVersion, '0.20.1');
  assert.equal(clean.minecraftVersion, '1.21.1');
  assert.deepEqual(clean.mods, {
    baritone: '1.11.3',
    'fabric-api': '0.116.18+1.21.1',
    fabricloader: '0.20.1',
    java: '21',
    minecraft: '1.21.1',
    minecraft_agent: '0.1.0',
  });
  assert.equal(clean.nested['dev_babbaj_nether-pathfinder'], '1.6');
  assert.equal(clean.nested.mixinextras, '0.5.5');
  assert.deepEqual(clean.problems, []);
  const broken = parseClientLog(
    `${LOG}[12:00:02] [main/ERROR]: Mixin apply for mod minecraft_agent failed minecraft_agent.mixins.json:KeyboardMixin\n` +
      `[12:00:02] [main/WARN]: Reference map 'minecraft-agent-refmap.json' for minecraft_agent.mixins.json could not be read.\n` +
      `java.lang.NoSuchMethodError: 'void net.minecraft.class_310.method_1507(net.minecraft.class_437)'\n`,
  );
  assert.equal(broken.problems.length, 3);
});

test('the smoke check needs production mode, every packaged mod id, and a clean log', async () => {
  const files = (log, remapped) => ({
    read: async () => log,
    list: async (path) => {
      assert.match(path, /\/game\/\.fabric\/remappedJars$/);
      if (!remapped) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return remapped;
    },
  });
  const pass = await checkPackagedClient({ gameDir: '/game' }, files(LOG, ['minecraft-1.21.1-0.20.1']));
  assert.equal(pass.pass, true, pass.problems.join('; '));
  assert.deepEqual(pass.mods, { minecraft_agent: '0.1.0', 'fabric-api': '0.116.18+1.21.1', baritone: '1.11.3' });
  assert.deepEqual(pass.nested, { 'dev_babbaj_nether-pathfinder': '1.6' });
  assert.equal(pass.log, '/game/logs/latest.log');

  const unnested = await checkPackagedClient(
    { gameDir: '/game' },
    files(LOG.replace('\t   \\-- dev_babbaj_nether-pathfinder 1.6\n', ''), ['minecraft-1.21.1-0.20.1']),
  );
  assert.equal(unnested.pass, false);
  assert.match(unnested.problems.join(), /does not list the mods dev_babbaj_nether-pathfinder \(nested\)/);

  const development = await checkPackagedClient({ gameDir: '/game' }, files(LOG, null));
  assert.equal(development.pass, false);
  assert.match(development.problems.join(), /did not run in production mode/);

  const missing = await checkPackagedClient(
    { gameDir: '/game' },
    files(LOG.replace('\t- baritone 1.11.3\n', ''), ['minecraft-1.21.1-0.20.1']),
  );
  assert.equal(missing.pass, false);
  assert.match(missing.problems.join(), /does not list the mods baritone/);

  const empty = await checkPackagedClient({ gameDir: '/game' }, { read: async () => '', list: async () => [] });
  assert.equal(empty.pass, false);
  assert.match(empty.problems.join(), /no Fabric Loader start line/);
});

test('preparing the mods folder copies exactly the archive jars and checks them with collectProvenance', async (t) => {
  const directory = await testDirectory(t, 'packaged-');
  const archive = join(directory, 'dist', ARCHIVE_NAME);
  const modsDir = join(directory, 'client', 'mods');
  const entries = Object.fromEntries(jarContents.map(([name, text]) => [`mods/${name}`, Buffer.from(text)]));
  const readEntry = async (path, name) => {
    assert.equal(path, archive);
    return entries[name];
  };
  const verified = (jars, extra = {}) => ({
    provenance: { archive: { sha256: 'c'.repeat(64), bundleVerified: true }, build: { clean: true }, mods: { jars } },
    warnings: [],
    ...extra,
  });
  let asked;
  const prepared = await preparePackagedMods(
    { archive, modsDir },
    {
      readEntry,
      collect: async (options) => {
        asked = options;
        const jars = await Promise.all(
          PACKAGED_JARS.map(async (name) => {
            const bytes = await readFile(join(modsDir, name));
            return { name, sha256: sha(bytes), expectedSha256: sha(entries[`mods/${name}`]) };
          }),
        );
        return verified(jars);
      },
    },
  );
  assert.deepEqual(asked, { candidateDir: join(directory, 'dist'), modsDir });
  assert.deepEqual((await readdir(modsDir)).sort(), [...PACKAGED_JARS].sort());
  assert.equal(prepared.archiveSha256, 'c'.repeat(64));
  assert.deepEqual(
    prepared.jars.map(({ name }) => name),
    PACKAGED_JARS,
  );

  await assert.rejects(
    preparePackagedMods(
      { archive, modsDir },
      {
        readEntry,
        collect: async () => ({
          provenance: { archive: { bundleVerified: false } },
          warnings: ['ARCHIVE_SHA256SUMS has no checksum.'],
        }),
      },
    ),
    /did not verify: ARCHIVE_SHA256SUMS has no checksum\. Run npm run build:mod first/,
  );
  await assert.rejects(
    preparePackagedMods(
      { archive, modsDir },
      {
        readEntry,
        collect: async () =>
          verified(PACKAGED_JARS.map((name) => ({ name, sha256: 'a'.repeat(64), expectedSha256: 'b'.repeat(64) }))),
      },
    ),
    /copied jars do not match the archive: minecraft-agent-0\.1\.0\.jar/,
  );
  await writeFile(join(modsDir, 'extra.jar'), 'not from the archive');
  await assert.rejects(
    preparePackagedMods({ archive, modsDir }, { readEntry, collect: async () => verified([]) }),
    /must hold only the packaged jars; found .*extra\.jar/,
  );
  await assert.rejects(
    preparePackagedMods({ archive: join(directory, 'other.zip'), modsDir }),
    /--archive must point to minecraft-agent-0\.1\.0\.zip/,
  );
});

test('a real candidate archive verifies end to end and records each jar hash', archiveTest, async (t) => {
  const directory = await testDirectory(t, 'packaged-zip-');
  const dist = join(directory, 'dist');
  await mkdir(dist, { recursive: true });
  const build = { version: '0.1.0', minecraft: '1.21.1', sourceCommit: 'f'.repeat(40), sourceModified: false };
  const bytes = candidateZip(build);
  await writeFile(join(dist, ARCHIVE_NAME), bytes);
  await writeFile(join(dist, 'BUILD.json'), JSON.stringify(build));
  await writeFile(join(dist, 'ARCHIVE_SHA256SUMS'), `${sha(bytes)}  ${ARCHIVE_NAME}\n`);
  const modsDir = join(directory, 'client', 'mods');
  // The fixture's jars are stand-ins, so the pinned third-party hashes are the fixture's.
  const collect = (options) => collectProvenance({ ...options, expectedFiles });
  const prepared = await preparePackagedMods({ archive: join(dist, ARCHIVE_NAME), modsDir }, { collect });
  assert.equal(prepared.archiveSha256, sha(bytes));
  assert.deepEqual(
    prepared.jars,
    expectedFiles.map(({ name, sha256 }) => ({ name, sha256 })),
  );
  assert.ok(prepared.warnings.some((warning) => /BUILD\.json was built from f{40}/.test(warning)));
  for (const [name, text] of jarContents) assert.equal(await readFile(join(modsDir, name), 'utf8'), text);

  await writeFile(join(dist, 'ARCHIVE_SHA256SUMS'), `${'0'.repeat(64)}  ${ARCHIVE_NAME}\n`);
  await assert.rejects(
    preparePackagedMods({ archive: join(dist, ARCHIVE_NAME), modsDir: join(directory, 'again') }, { collect }),
    /did not verify: .*does not match ARCHIVE_SHA256SUMS/,
  );
});
