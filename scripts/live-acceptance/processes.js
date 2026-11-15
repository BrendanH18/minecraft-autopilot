import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { projectRoot } from '../../src/config.js';
import { FabricAdapter } from '../../src/fabric-adapter.js';
import { ServerConsole } from './console.js';

export const MINECRAFT_VERSION = '1.21.1';
export const DEFAULT_JAR = join(projectRoot, '.gradle-user/caches/fabric-loom/1.21.1/minecraft-server.jar');
export const RUNTIME = join(projectRoot, '.runtime/live-acceptance');
export const CLI = join(projectRoot, 'src/cli.js');
export const HELP = 'See docs/DEVELOPMENT.md ("Setup from a fresh clone" and "Live test environment") and docs/LIVE-ACCEPTANCE.md. This runner never downloads anything.';

/** Java's `-version` banner goes to stderr: `openjdk version "21.0.4" 2024-07-16`. */
export function javaVersion(java = 'java', { spawnSyncImpl = spawnSync } = {}) {
  const result = spawnSyncImpl(java, ['-version'], { encoding: 'utf8', timeout: 15_000 });
  if (result.error) throw new Error(`Java was not found (${result.error.code || result.error.message}). Install a full Java 21 JDK and put it on PATH, or pass --java. ${HELP}`);
  const text = `${result.stderr || ''}${result.stdout || ''}`;
  const match = /version "(\d+)(?:\.(\d+))?[^"]*"/.exec(text);
  if (!match) throw new Error(`Could not read the Java version from: ${text.trim().split('\n')[0] || '(no output)'}. ${HELP}`);
  const major = Number(match[1]) === 1 ? Number(match[2]) : Number(match[1]);
  return { banner: text.trim().split('\n')[0], major };
}

/** Refuses before touching anything when the EULA flag, jar, or Java 21 is missing. */
export function preflight({ acceptEula, jar, java = 'java' }, { exists = existsSync, spawnSyncImpl = spawnSync } = {}) {
  if (!acceptEula) throw new Error(`Running the vanilla server writes eula=true. Read https://aka.ms/MinecraftEULA and pass --accept-eula to accept it for this local test server. ${HELP}`);
  if (!exists(jar)) throw new Error(`The cached Minecraft ${MINECRAFT_VERSION} server jar is missing: ${jar}. Build the mod once so Loom caches it, or pass --server-jar. ${HELP}`);
  const version = javaVersion(java, { spawnSyncImpl });
  if (version.major < 21) throw new Error(`Java ${version.major} found; Minecraft ${MINECRAFT_VERSION} needs Java 21 or newer. ${HELP}`);
  return version;
}

export async function portIsFree(port) {
  const server = createServer();
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    return true;
  } catch { return false; }
  finally { if (server.listening) await new Promise(resolve => server.close(resolve)); }
}

export async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export function serverProperties({ port, seed }) {
  return [
    'online-mode=false', 'server-ip=127.0.0.1', `server-port=${port}`, `level-seed=${seed}`, 'level-type=minecraft\\:flat', 'level-name=world',
    'spawn-protection=0', 'difficulty=peaceful', 'gamemode=survival', 'generate-structures=false', 'spawn-monsters=false', 'spawn-animals=false',
    'spawn-npcs=false', 'enforce-secure-profile=false', 'max-players=4', 'view-distance=8', 'simulation-distance=6', 'enable-rcon=false',
    'enable-query=false', 'motd=minecraft-agent live acceptance', '',
  ].join('\n');
}

/** Copies the jar and writes eula.txt/server.properties; the world is recreated for each run unless keepWorld. */
export async function prepareServerDirectory({ directory, jar, port, seed, acceptEula, keepWorld = false }) {
  if (!acceptEula) throw new Error('--accept-eula is required before writing eula=true.');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await copyFile(jar, join(directory, 'server.jar'));
  await writeFile(join(directory, 'eula.txt'), `# Accepted with --accept-eula for local acceptance testing (https://aka.ms/MinecraftEULA)\neula=true\n`);
  await writeFile(join(directory, 'server.properties'), serverProperties({ port, seed }));
  if (!keepWorld) await rm(join(directory, 'world'), { recursive: true, force: true });
}

// Children run in their own process group so Ctrl+C reaches only the runner, which then stops them in order.
// Anything still alive when the runner exits (for example after a second Ctrl+C) is killed here.
const children = new Set();
function track(child) {
  if (!children.size) process.once('exit', () => { for (const running of children) try { running.kill('SIGKILL'); } catch {} });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}

/** Waits for a child to exit, escalating stop → SIGTERM → SIGKILL. */
async function settle(child, exited, steps) {
  for (const [action, ms] of steps) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    action();
    if (await Promise.race([exited.then(() => true), delay(ms, false)])) return;
  }
}

/** Starts `java -jar server.jar nogui` with stdin as the console; output is mirrored to server.out. */
export function startServer({ directory, java = 'java', memory = '2G', spawnImpl = spawn }) {
  const child = track(spawnImpl(java, [`-Xmx${memory}`, '-jar', 'server.jar', 'nogui'], { cwd: directory, stdio: ['pipe', 'pipe', 'pipe'], detached: true }));
  const log = createWriteStream(join(directory, 'server.out'), { flags: 'a' });
  const serverConsole = new ServerConsole({ write: text => { if (child.stdin.writable) child.stdin.write(text); } });
  const exited = new Promise(resolve => child.once('exit', (code, signal) => { serverConsole.end(`server exited (${signal || code})`); log.end(); resolve({ code, signal }); }));
  child.once('error', error => serverConsole.end(`server failed to start: ${error.message}`));
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { log.write(chunk); serverConsole.push(chunk); });
  return {
    console: serverConsole, child, exited,
    async stop() {
      await settle(child, exited, [[() => serverConsole.write('stop\n'), 60_000], [() => child.kill('SIGTERM'), 10_000], [() => child.kill('SIGKILL'), 5_000]]);
    },
  };
}

export function botArguments({ port, account, bridge }) {
  return [CLI, '--bridge', bridge, 'server', '--host', '127.0.0.1', '--port', String(port), '--account', account, '--auth', 'offline', '--version', MINECRAFT_VERSION];
}

/** Starts the repo CLI's server bot and waits until its bridge reports a connected player. */
export async function startBot({ port, account, bridge, home, spawnImpl = spawn, connect = FabricAdapter.connect, timeoutMs = 120_000, signal }) {
  await rm(join(home, 'server-homes.json'), { force: true });
  const child = track(spawnImpl(process.execPath, botArguments({ port, account, bridge }), { cwd: projectRoot, env: { ...process.env, MC_AGENT_HOME: home }, stdio: ['ignore', 'pipe', 'pipe'], detached: true }));
  const output = [];
  for (const stream of [child.stdout, child.stderr].filter(Boolean)) stream.on('data', chunk => { output.push(String(chunk)); if (output.length > 200) output.shift(); });
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  child.once('error', () => {});
  const bot = {
    child, exited, output,
    async stop() { await settle(child, exited, [[() => child.kill('SIGINT'), 15_000], [() => child.kill('SIGTERM'), 5_000], [() => child.kill('SIGKILL'), 5_000]]); },
  };
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    if (signal?.aborted) { await bot.stop(); signal.throwIfAborted(); }
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`The bot exited before its bridge was ready: ${output.join('').trim().slice(-800)}`);
    try {
      const adapter = await connect(bridge);
      try {
        const state = await adapter.observe();
        if (state.connected && state.player) return bot;
      } finally { await adapter.close(); }
    } catch (error) { lastError = error; }
    await delay(500);
  }
  await bot.stop();
  throw new Error(`The bot bridge was not ready after ${timeoutMs / 1000} s: ${lastError?.message ?? 'no player observed'}.`);
}

/** Runs one repo CLI command (for example `stop`) against the bot's bridge. */
export function runCli(args, { bridge, spawnImpl = spawn, timeoutMs = 30_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(process.execPath, [CLI, '--bridge', bridge, ...args], { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout?.on('data', chunk => { stdout += chunk; });
    child.stderr?.on('data', chunk => { stderr += chunk; });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}

/** Commit, dirty flag, and tool versions for the results file. */
export function environment({ java = 'java', spawnSyncImpl = spawnSync } = {}) {
  const git = args => {
    const result = spawnSyncImpl('git', args, { cwd: projectRoot, encoding: 'utf8' });
    return result.status === 0 ? result.stdout.trim() : null;
  };
  const status = git(['status', '--porcelain']);
  let javaBanner = null;
  try { javaBanner = javaVersion(java, { spawnSyncImpl }).banner; } catch {}
  return { commit: git(['rev-parse', 'HEAD']), dirty: status === null ? null : status.length > 0, node: process.version, java: javaBanner, platform: `${process.platform}-${process.arch}` };
}
