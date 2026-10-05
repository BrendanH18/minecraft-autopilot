import { readFile, open, unlink, mkdir, rm, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { dataDirectory, projectRoot, profileFile, readBridge, writePrivateJson } from './config.js';

export function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code !== 'ESRCH'; }
}

export async function claimBridge(discoveryPath) {
  const path = `${discoveryPath}.lock`;
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const record = { pid: process.pid, nonce: randomUUID() };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const file = await open(path, 'wx', 0o600);
      try { await file.writeFile(JSON.stringify(record)); } finally { await file.close(); }
      return async () => {
        try { if (JSON.parse(await readFile(path, 'utf8')).nonce === record.nonce) await unlink(path); } catch {}
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let previous;
      try { previous = JSON.parse(await readFile(path, 'utf8')); }
      catch { throw new Error(`Bridge lock is unreadable or another bridge is starting: ${path}`); }
      if (!Number.isSafeInteger(previous.pid) || processIsAlive(previous.pid)) throw new Error(`A bridge is already running for ${discoveryPath}. Close it before starting another.`);
      // Refuse to remove a lock replaced by another process while we were checking it.
      if (JSON.stringify(previous) !== JSON.stringify(JSON.parse(await readFile(path, 'utf8')))) throw new Error('Bridge ownership changed; retry.');
      await unlink(path);
    }
  }
  throw new Error('Could not claim bridge ownership.');
}

export async function assertBridgeNotRunning(path) {
  let lock;
  try { lock = JSON.parse(await readFile(`${path}.lock`, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error(`Cannot verify bridge ownership at ${path}.lock`); }
  if (lock && processIsAlive(lock.pid)) throw new Error('Close the game/bridge process before cleaning runtime files.');
  let config;
  try { config = await readBridge(path); } catch { return; }
  try {
    const response = await fetch(new URL('/v1/state', config.url), { headers: { Authorization: `Bearer ${config.token}` }, signal: AbortSignal.timeout(1000) });
    if (response.ok) throw new Error('LIVE_BRIDGE');
  } catch (error) {
    if (error.message === 'LIVE_BRIDGE') throw new Error('Close the game/bridge process before cleaning runtime files.');
  }
}

export async function attachBridge(path) {
  const discoveryPath = resolve(path);
  // Validate the file before recording its location; do not copy the token.
  await readBridge(discoveryPath);
  await writePrivateJson(profileFile, { discoveryPath });
  return { discoveryPath, profileFile };
}

export async function cleanupRuntime({ directory = dataDirectory, root = projectRoot, includeAuth = false, includeHomes = false, caches = false, dryRun = false } = {}) {
  await assertBridgeNotRunning(join(directory, 'bridge.json'));
  const paths = ['bridge.json', 'bridge.json.lock', 'profile.json', 'tests', 'tmp'].map(name => join(directory, name));
  if (includeAuth) paths.push(join(directory, 'auth'));
  if (includeHomes) paths.push(join(directory, 'server-homes.json'), join(directory, 'homes.json'));
  if (caches) paths.push(...['.gradle-user', '.npm-cache', '.deps', 'mod/.gradle', 'mod/build', 'dist'].map(name => join(root, name)));
  const existing = [];
  for (const path of paths) { try { await access(path); existing.push(path); } catch {} }
  if (!dryRun) for (const path of existing) await rm(path, { recursive: true, force: true });
  return { dryRun, paths: existing, preserved: [!includeAuth && 'auth', !includeHomes && 'saved homes', 'development worlds in mod/run'].filter(Boolean) };
}
