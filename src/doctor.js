import { spawnSync } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bridgeFile, projectRoot, readBridge, resolveBridgePath } from './config.js';
import { verifyModBundle } from './bundle.js';

/** Accepts only credential-free HTTP(S) URLs on this machine, matching the planner's Ollama rule. */
export function localOllamaUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Use a local Ollama URL, for example http://127.0.0.1:11434.'); }
  if (url.username || url.password) throw new Error('Ollama URLs must not contain credentials.');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !['http:', 'https:'].includes(url.protocol)) throw new Error('Ollama must run on localhost.');
  return url;
}

export async function checkOllama(value, { fetchImpl = fetch, timeoutMs = 3000 } = {}) {
  const url = localOllamaUrl(value);
  try {
    const response = await fetchImpl(new URL('/api/version', url), { redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return { url: url.origin, reachable: false, error: `Ollama returned HTTP ${response.status}.` };
    const { version } = await response.json();
    if (typeof version !== 'string' || !version || version.length > 100) return { url: url.origin, reachable: false, error: 'Response did not include an Ollama version.' };
    return { url: url.origin, reachable: true, version };
  } catch (error) {
    return { url: url.origin, reachable: false, error: error.name === 'TimeoutError' ? `No reply within ${timeoutMs / 1000} seconds.`
      : error.cause?.code ? `Cannot connect (${error.cause.code}).` : error.cause?.message || error.message };
  }
}

/** Diagnostics: never connects to the bridge or prints its credentials; contacts only an explicitly requested local Ollama. */
export async function inspectPrerequisites({ root = projectRoot, discoveryPath = bridgeFile, run = spawnSync, nodeVersion = process.versions.node, ollamaUrl, fetchImpl } = {}) {
  if (ollamaUrl !== undefined) localOllamaUrl(ollamaUrl);
  const tool = name => {
    const result = run(name, [name === 'java' || name === 'javac' ? '-version' : '--version'], { encoding: 'utf8' });
    const versionPattern = /(?:version\s+"|javac\s+|jar\s+)(\d+)/;
    const version = [result.stderr, result.stdout].filter(Boolean).join('\n').split('\n').find(line => versionPattern.test(line));
    const major = Number(version?.match(versionPattern)?.[1]);
    return { available: result.status === 0, major: Number.isFinite(major) && major > 0 ? major : null,
      version: version || (result.status === 0 ? 'Version unavailable' : 'Not installed') };
  };
  const java = tool('java');
  const javac = tool('javac');
  const jar = tool('jar');
  const { engines } = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'));
  const nodeRequired = engines.node;
  const [requiredMajor, requiredMinor] = nodeRequired.match(/^>=(\d+)\.(\d+)/).slice(1).map(Number);
  const [major, minor] = nodeVersion.replace(/^v/, '').split('.').map(Number);
  const nodeSupported = major > requiredMajor || major === requiredMajor && minor >= requiredMinor;
  const jdkReady = [java, javac, jar].every(tool => tool.available && tool.major >= 21);
  let modBuilt = false;
  try { await access(join(root, 'mod/build/libs/minecraft-agent-0.1.0.jar')); modBuilt = true; } catch {}
  let bundleReady = false;
  try { await verifyModBundle(join(root, 'dist')); bundleReady = true; } catch {}
  const resolvedBridge = await resolveBridgePath(discoveryPath);
  let bridgeDiscoveryExists = false;
  let bridgeValid = false;
  try { await access(resolvedBridge); bridgeDiscoveryExists = true; } catch {}
  try { await readBridge(resolvedBridge); bridgeValid = true; } catch {}
  const ollama = ollamaUrl === undefined ? undefined : await checkOllama(ollamaUrl, fetchImpl && { fetchImpl });
  const next = !nodeSupported ? `Install Node.js ${requiredMajor}.${requiredMinor} or newer.`
    : !jdkReady ? 'Put a Java 21 or newer JDK (java, javac, and jar) on PATH before building the mod.'
      : !bundleReady ? 'Run npm run build:mod to build and verify the installation bundle.'
        : ollama && !ollama.reachable ? 'Start Ollama (ollama serve) or correct the --ollama URL before running agent tasks.'
          : bridgeValid ? 'Run npm start -- observe to check the selected bridge.'
            : 'Install the three jars from dist/mods/ in a Fabric 1.21.1 profile, then attach its bridge file.';
  return { node: `v${nodeVersion.replace(/^v/, '')}`, nodeRequired, nodeSupported, java: java.version, javac: javac.version, jar: jar.version, jdkReady,
    modBuilt, bundleReady, bridgeDiscoveryExists, bridgeValid, bridgeFile: resolvedBridge, ...(ollama && { ollama }),
    ready: nodeSupported && jdkReady && bundleReady && bridgeValid && (!ollama || ollama.reachable), next };
}
