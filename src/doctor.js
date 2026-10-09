import { spawnSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { bridgeFile, projectRoot, readBridge, resolveBridgePath } from './config.js';
import { verifyModBundle } from './bundle.js';

/** Offline diagnostics: never connects to the bridge or prints its credentials. */
export async function inspectPrerequisites({ root = projectRoot, discoveryPath = bridgeFile, run = spawnSync } = {}) {
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
  const nodeSupported = Number(process.versions.node.split('.')[0]) >= 22;
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
  const next = !nodeSupported ? 'Install Node.js 22 or newer.'
    : !jdkReady ? 'Put a Java 21 or newer JDK (java, javac, and jar) on PATH before building the mod.'
      : !bundleReady ? 'Run npm run build:mod to build and verify the installation bundle.'
        : bridgeValid ? 'Run npm start -- observe to check the selected bridge.'
          : 'Install the three jars from dist/mods/ in a Fabric 1.21.1 profile, then attach its bridge file.';
  return { node: process.version, nodeSupported, java: java.version, javac: javac.version, jar: jar.version, jdkReady,
    modBuilt, bundleReady, bridgeDiscoveryExists, bridgeValid, bridgeFile: resolvedBridge, next };
}
