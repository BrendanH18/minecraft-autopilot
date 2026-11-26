import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { basename, delimiter, dirname, join, relative } from 'node:path';
import { finished } from 'node:stream/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { projectRoot } from '../../src/config.js';
import { FabricAdapter } from '../../src/fabric-adapter.js';
import { ServerConsole } from './console.js';

export const MINECRAFT_VERSION = '1.21.1';
export const SEED = 'minecraft-agent-live-acceptance';
export const WORLD_SETUP = [
  'difficulty peaceful',
  'gamerule doDaylightCycle false',
  'gamerule doWeatherCycle false',
  'gamerule doMobSpawning false',
  'gamerule doInsomnia false',
  'gamerule doPatrolSpawning false',
  'gamerule doTraderSpawning false',
  'gamerule randomTickSpeed 0',
  'gamerule doFireTick false',
  'gamerule mobGriefing false',
  'gamerule spawnRadius 0',
  'time set 1000',
  'weather clear',
];
export const DEFAULT_JAR = join(projectRoot, '.gradle-user/caches/fabric-loom/1.21.1/minecraft-server.jar');
export const RUNTIME = join(projectRoot, '.runtime/live-acceptance');
export const CLI = join(projectRoot, 'src/cli.js');
export const HELP =
  'See docs/DEVELOPMENT.md ("Setup from a fresh clone" and "Live test environment") and docs/LIVE-ACCEPTANCE.md. This runner never downloads anything.';

/** Java's `-version` banner goes to stderr: `openjdk version "21.0.4" 2024-07-16`. */
export function javaVersion(java = 'java', { spawnSyncImpl = spawnSync } = {}) {
  const result = spawnSyncImpl(java, ['-version'], { encoding: 'utf8', timeout: 15_000 });
  if (result.error)
    throw new Error(
      `Java was not found (${result.error.code || result.error.message}). Install a full Java 21 JDK and put it on PATH, or pass --java. ${HELP}`,
    );
  const text = `${result.stderr || ''}${result.stdout || ''}`;
  const match = /version "(\d+)(?:\.(\d+))?[^"]*"/.exec(text);
  if (!match)
    throw new Error(`Could not read the Java version from: ${text.trim().split('\n')[0] || '(no output)'}. ${HELP}`);
  const major = Number(match[1]) === 1 ? Number(match[2]) : Number(match[1]);
  return { banner: text.trim().split('\n')[0], major };
}

/** Refuses before touching anything when the EULA flag, jar, or Java 21 is missing. */
export function preflight({ acceptEula, jar, java = 'java' }, { exists = existsSync, spawnSyncImpl = spawnSync } = {}) {
  if (!acceptEula)
    throw new Error(
      `Running the vanilla server writes eula=true. Read https://aka.ms/MinecraftEULA and pass --accept-eula to accept it for this local test server. ${HELP}`,
    );
  if (!exists(jar))
    throw new Error(
      `The cached Minecraft ${MINECRAFT_VERSION} server jar is missing: ${jar}. Build the mod once so Loom caches it, or pass --server-jar. ${HELP}`,
    );
  const version = javaVersion(java, { spawnSyncImpl });
  if (version.major < 21)
    throw new Error(`Java ${version.major} found; Minecraft ${MINECRAFT_VERSION} needs Java 21 or newer. ${HELP}`);
  return version;
}

export async function portIsFree(port) {
  const server = createServer();
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
    return true;
  } catch {
    return false;
  } finally {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  }
}

export async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export function serverProperties({ port, seed }) {
  return [
    'online-mode=false',
    'server-ip=127.0.0.1',
    `server-port=${port}`,
    `level-seed=${seed}`,
    'level-type=minecraft\\:flat',
    'level-name=world',
    'spawn-protection=0',
    'difficulty=peaceful',
    'gamemode=survival',
    'generate-structures=false',
    'spawn-monsters=false',
    'spawn-animals=false',
    'spawn-npcs=false',
    'enforce-secure-profile=false',
    'max-players=4',
    'view-distance=8',
    'simulation-distance=6',
    // A swapping or overloaded host can stall one tick past the 60 s watchdog, which kills the server mid-run;
    // no check depends on tick timing, so the watchdog is off.
    'max-tick-time=-1',
    'enable-rcon=false',
    'enable-query=false',
    'motd=minecraft-agent live acceptance',
    '',
  ].join('\n');
}

export async function createRunDirectory(root = RUNTIME) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  return mkdtemp(join(root, 'run-'));
}

/** Copies the jar and writes eula.txt/server.properties in the new run's server directory. */
export async function prepareServerDirectory({ directory, jar, port, seed, acceptEula }) {
  if (!acceptEula) throw new Error('--accept-eula is required before writing eula=true.');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await copyFile(jar, join(directory, 'server.jar'));
  await writeFile(
    join(directory, 'eula.txt'),
    `# Accepted with --accept-eula for local acceptance testing (https://aka.ms/MinecraftEULA)\neula=true\n`,
  );
  await writeFile(join(directory, 'server.properties'), serverProperties({ port, seed }));
}

// Children run in their own process group so Ctrl+C reaches only the runner, which then stops them in order.
// Anything still alive when the runner exits (for example after a second Ctrl+C) is killed here.
const children = new Set();
function track(child) {
  if (!children.size)
    process.once('exit', () => {
      // Each child leads its own process group. A Fabric client's game JVM may sit in Gradle's single-use daemon
      // instead, which stops it when the wrapper's Gradle client goes away (see startFabricClient).
      for (const running of children)
        try {
          process.kill(-running.pid, 'SIGKILL');
        } catch {
          try {
            running.kill('SIGKILL');
          } catch {}
        }
    });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}

export class ShutdownError extends Error {}

/** Waits for a child to exit, escalating stop → SIGTERM → SIGKILL. */
export async function settle(child, exited, steps) {
  for (const [action, ms] of steps) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    action();
    // Cancel the losing timer so a prompt exit does not keep the runner alive until the escalation deadline.
    const timer = new AbortController();
    try {
      if (await Promise.race([exited.then(() => true), delay(ms, false, { signal: timer.signal })])) return;
    } finally {
      timer.abort();
    }
  }
  if (child.exitCode === null && child.signalCode === null)
    throw new ShutdownError(`Process ${child.pid} did not exit after shutdown escalation.`);
}

/** Starts `java -jar server.jar nogui` with stdin as the console; output is mirrored to server.out. */
export function startServer({ directory, java = 'java', memory = '2G', spawnImpl = spawn }) {
  const child = track(
    spawnImpl(java, [`-Xmx${memory}`, '-jar', 'server.jar', 'nogui'], {
      cwd: directory,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true,
    }),
  );
  const log = createWriteStream(join(directory, 'server.out'), { flags: 'a' });
  const serverConsole = new ServerConsole({
    write: (text) => {
      if (child.stdin.writable && !child.stdin.destroyed) child.stdin.write(text);
      else serverConsole.end('server stdin is closed.');
    },
  });
  child.stdin.on('error', (error) => serverConsole.end(`server stdin failed: ${error.message}`));
  const exited = new Promise((resolve) =>
    child.once('exit', (code, signal) => {
      serverConsole.end(`server exited (${signal || code})`);
      resolve({ code, signal });
    }),
  );
  // The process can exit before stdout and stderr have delivered their final chunks.
  child.once('close', () => log.end());
  child.once('error', (error) => serverConsole.end(`server failed to start: ${error.message}`));
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (chunk) => {
      log.write(chunk);
      serverConsole.push(chunk);
    });
  return {
    console: serverConsole,
    child,
    exited,
    async stop() {
      const steps = [
        [() => child.kill('SIGTERM'), 10_000],
        [() => child.kill('SIGKILL'), 5_000],
      ];
      if (child.stdin.writable && !child.stdin.destroyed) {
        steps.unshift([
          () => {
            try {
              serverConsole.write('stop\n');
            } catch {
              child.kill('SIGTERM');
            }
          },
          60_000,
        ]);
      }
      await settle(child, exited, steps);
      await finished(log);
    },
  };
}

export function botArguments({ port, account, bridge }) {
  return [
    CLI,
    '--bridge',
    bridge,
    'server',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--account',
    account,
    '--auth',
    'offline',
    '--version',
    MINECRAFT_VERSION,
  ];
}

/** Starts the repo CLI's server bot and waits until its bridge reports a connected player. */
export async function startBot({
  port,
  account,
  bridge,
  home,
  spawnImpl = spawn,
  connect = FabricAdapter.connect,
  timeoutMs = 120_000,
  signal,
}) {
  await rm(join(home, 'server-homes.json'), { force: true });
  const child = track(
    spawnImpl(process.execPath, botArguments({ port, account, bridge }), {
      cwd: projectRoot,
      env: { ...process.env, MC_AGENT_HOME: home },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    }),
  );
  return waitForSession({
    child,
    label: 'bot',
    bridge,
    connect,
    timeoutMs,
    signal,
    stopSteps: [
      [() => child.kill('SIGINT'), 15_000],
      [() => child.kill('SIGTERM'), 5_000],
      [() => child.kill('SIGKILL'), 5_000],
    ],
  });
}

export const GRADLE = join(projectRoot, 'scripts/gradle.js');

/**
 * Client options that keep an unattended development client in the game: no pause on focus loss, no first-run
 * screens, no sound or narrator, and a short render distance for software rendering.
 */
export const FABRIC_CLIENT_OPTIONS = [
  // 1.21.1's data version, so the game reads these options without upgrading them.
  'version:3955',
  // Without this the first-run accessibility screen blocks quick play from joining.
  'onboardAccessibility:false',
  'pauseOnLostFocus:false',
  'skipMultiplayerWarning:true',
  'joinedFirstServer:true',
  'tutorialStep:none',
  'realmsNotifications:false',
  'telemetryOptInExtra:false',
  'narrator:0',
  'soundCategory_master:0.0',
  'fullscreen:false',
  // Low settings cut an idle software-rendered client from about two cores to a fifth of one.
  'renderDistance:2',
  'simulationDistance:5',
  'maxFps:10',
  'enableVsync:false',
  'graphicsMode:0',
  'renderClouds:"false"',
  'particles:2',
  'ao:false',
  'entityShadows:false',
  'biomeBlendRadius:0',
  'mipmapLevels:0',
];

/**
 * `node scripts/gradle.js runClient` arguments that join the runner's server as `account` from `gameDir`. Loom
 * resolves the run directory against the mod project, so it is passed relative to `mod/`.
 */
export function fabricClientArguments({ port, account, gameDir }) {
  return [
    GRADLE,
    'runClient',
    `-PquickPlay=127.0.0.1:${port}`,
    `-PdevUsername=${account}`,
    `-PclientRunDir=${relative(join(projectRoot, 'mod'), gameDir)}`,
  ];
}

/** Creates the client's game directory with unattended options; Minecraft keeps its own logs under it. */
export async function prepareFabricGameDirectory({ directory }) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(join(directory, 'options.txt'), `${FABRIC_CLIENT_OPTIONS.join('\n')}\n`);
}

/**
 * Starts the Fabric development client through Gradle (offline; the cached assets are checked first) and waits
 * until the mod's bridge, written to `home`/bridge.json, reports a connected player. Each call is a fresh client,
 * so session memory such as opened containers never leaks between scenarios. Output is appended to `log`.
 */
export async function startFabricClient({
  port,
  account,
  bridge,
  home,
  gameDir,
  log,
  spawnImpl = spawn,
  connect = FabricAdapter.connect,
  timeoutMs = 600_000,
  signal,
  java = 'java',
}) {
  for (const stale of [bridge, `${bridge}.lock`, join(home, 'homes.json')]) await rm(stale, { force: true });
  // Gradle runs on JAVA_HOME or PATH, so a --java JDK has to reach it that way.
  const jdk =
    basename(java) === java
      ? {}
      : { JAVA_HOME: dirname(dirname(java)), PATH: `${dirname(java)}${delimiter}${process.env.PATH ?? ''}` };
  if (log) await mkdir(dirname(log), { recursive: true, mode: 0o700 });
  const child = track(
    spawnImpl(process.execPath, fabricClientArguments({ port, account, gameDir }), {
      cwd: projectRoot,
      // OpenAL's null driver: the client needs no sound device, and headless hosts have none.
      env: { ALSOFT_DRIVERS: 'null', ...process.env, ...jdk, MC_AGENT_HOME: home },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    }),
  );
  let logStream = null;
  if (log) {
    logStream = createWriteStream(log, { flags: 'a' });
    logStream.write(`--- ${new Date().toISOString()} start ${account} (pid ${child.pid}) ---\n`);
    for (const stream of [child.stdout, child.stderr].filter(Boolean))
      stream.on('data', (chunk) => logStream.write(chunk));
    child.once('close', () => logStream.end());
  }
  // Signals go to the wrapper's whole process group. With org.gradle.jvmargs set, Gradle may run the build in a
  // single-use daemon in its own session; that daemon cancels the build and stops the game JVM when the wrapper's
  // Gradle client goes away. Boat runs of every --fast scenario left no game JVM behind.
  const group = (signalName) => () => {
    try {
      process.kill(-child.pid, signalName);
    } catch {
      child.kill(signalName);
    }
  };
  const session = await waitForSession({
    child,
    label: 'Fabric client',
    bridge,
    connect,
    timeoutMs,
    signal,
    stopSteps: [
      [group('SIGTERM'), 30_000],
      [group('SIGKILL'), 5_000],
    ],
    // The wrapper can exit while Gradle or the game JVM lingers; nothing in the group may outlive the session.
    afterStop: group('SIGKILL'),
  });
  if (logStream) {
    const stop = session.stop;
    session.stop = async () => {
      await stop();
      if (!logStream.closed) await finished(logStream).catch(() => {});
    };
  }
  return session;
}

/** Waits until a freshly spawned session's bridge reports a connected player; stops it on failure. */
async function waitForSession({ child, label, bridge, connect, timeoutMs, signal, stopSteps, afterStop }) {
  const output = [];
  for (const stream of [child.stdout, child.stderr].filter(Boolean))
    stream.on('data', (chunk) => {
      output.push(String(chunk));
      if (output.length > 200) output.shift();
    });
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
  child.once('error', () => {});
  const bot = {
    child,
    exited,
    output,
    async stop() {
      try {
        await settle(child, exited, stopSteps);
      } finally {
        afterStop?.();
      }
    },
  };
  const deadline = Date.now() + timeoutMs;
  let lastError;
  try {
    while (Date.now() < deadline) {
      if (signal?.aborted) {
        await bot.stop();
        signal.throwIfAborted();
      }
      if (child.exitCode !== null || child.signalCode !== null) {
        // The wrapper is gone, but anything it started in its process group must not reach the next scenario.
        await bot.stop();
        throw new Error(`The ${label} exited before its bridge was ready: ${output.join('').trim().slice(-800)}`);
      }
      try {
        const adapter = await connect(bridge);
        try {
          const state = await adapter.observe();
          if (state.connected && state.player) return bot;
        } finally {
          await adapter.close();
        }
      } catch (error) {
        lastError = error;
      }
      // A local bridge read is cheap; a short interval keeps each scenario from idling after the session is ready.
      await delay(200);
    }
    await bot.stop();
    throw new Error(
      `The ${label} bridge was not ready after ${timeoutMs / 1000} s: ${lastError?.message ?? 'no player observed'}.`,
    );
  } catch (error) {
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
      botOutput: output.join('').trim().slice(-3000),
    });
  }
}

/** Runs one repo CLI command (for example `stop`) against the bot's bridge. */
export function runCli(args, { bridge, spawnImpl = spawn, timeoutMs = 30_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(process.execPath, [CLI, '--bridge', bridge, ...args], {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '',
      stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

/** Commit, dirty flag, and tool versions for the results file. */
export function environment({ java = 'java', spawnSyncImpl = spawnSync } = {}) {
  const git = (args) => {
    const result = spawnSyncImpl('git', args, { cwd: projectRoot, encoding: 'utf8' });
    return result.status === 0 ? result.stdout.trim() : null;
  };
  const status = git(['status', '--porcelain']);
  let javaBanner = null;
  try {
    javaBanner = javaVersion(java, { spawnSyncImpl }).banner;
  } catch {}
  return {
    commit: git(['rev-parse', 'HEAD']),
    dirty: status === null ? null : status.length > 0,
    node: process.version,
    java: javaBanner,
    platform: `${process.platform}-${process.arch}`,
  };
}
