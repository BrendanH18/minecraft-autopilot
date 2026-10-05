import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export const dataDirectory = resolve(process.env.MC_AGENT_HOME || join(projectRoot, '.runtime'));
export const bridgeFile = join(dataDirectory, 'bridge.json');
export const profileFile = join(dataDirectory, 'profile.json');

export async function readBridge(path = bridgeFile) {
  if (path === bridgeFile) {
    let profile;
    try { profile = JSON.parse(await readFile(profileFile, 'utf8')); } catch {}
    if (profile?.discoveryPath) path = resolve(profile.discoveryPath);
  }
  let config;
  try { config = JSON.parse(await readFile(path, 'utf8')); }
  catch { throw new Error(`No readable bridge at ${path}. Start Minecraft with the agent mod, or use "mc-agent demo" / "mc-agent server".`); }
  const url = new URL(config.url);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('The bridge must use an HTTP URL on 127.0.0.1.');
  }
  if (typeof config.token !== 'string' || config.token.length < 32 || config.protocol !== 1) throw new Error('Invalid bridge credentials or protocol version.');
  return config;
}

export async function writePrivateJson(path, value) {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    await rename(temporary, path);
  } finally { await rm(temporary, { force: true }); }
}
