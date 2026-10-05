import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = `${root}/dist/mods`;
const fabricName = 'fabric-api-0.116.17+1.21.1.jar';
const fabricHash = '79ac44b40780acbd884b34c50be1e39af682847e5f5cb3b1fddeeaa768dce800';
const checksum = bytes => createHash('sha256').update(bytes).digest('hex');
await mkdir(output, { recursive: true });
let fabric;
try { fabric = await readFile(`${root}/.deps/${fabricName}`); } catch {}
if (!fabric || checksum(fabric) !== fabricHash) {
  if (!process.argv.includes('--allow-downloads')) throw new Error(`${fabricName} is missing or failed verification. No download was made. Re-run package-mod.js with --allow-downloads only after approving this dependency.`);
  const response = await fetch(`https://maven.fabricmc.net/net/fabricmc/fabric-api/fabric-api/0.116.17+1.21.1/${fabricName}`, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Fabric API download failed: HTTP ${response.status}`);
  fabric = Buffer.from(await response.arrayBuffer());
  if (checksum(fabric) !== fabricHash) throw new Error('Fabric API checksum mismatch.');
  await writeFile(`${root}/.deps/${fabricName}`, fabric);
}
const files = [
  ['mod/build/libs/minecraft-agent-0.1.0.jar', 'minecraft-agent-0.1.0.jar'],
  ['.deps/baritone-api-fabric-1.11.3.jar', 'baritone-api-fabric-1.11.3.jar'],
  [`.deps/${fabricName}`, fabricName],
];
const hashes = [];
for (const [source, name] of files) {
  await copyFile(`${root}/${source}`, `${output}/${name}`);
  hashes.push(`${checksum(await readFile(`${output}/${name}`))}  ${name}`);
}
await writeFile(`${root}/dist/SHA256SUMS`, hashes.join('\n') + '\n');
await writeFile(`${root}/dist/INSTALL.md`, `# Minecraft Agent 0.1.0\n\nInstall Minecraft Java **1.21.1** with Fabric Loader **0.16.14 or newer**. Copy all three jars from this bundle's mods directory into that profile's mods directory.\n\nStart Minecraft and enter a world or Java 1.21.1 server. In this repository run:\n\n\`\`\`sh\nnpm start -- attach /path/to/game-directory/config/minecraft-agent/bridge.json\nnpm start -- observe\nnpm start -- set-home\nnpm start -- collect oak_log 8\n\`\`\`\n\nF8 returns control immediately. See the repository README.md for the CLI, local model, and server bot setup.\n\nThird-party dependencies are unmodified official releases:\n- Baritone 1.11.3: LGPL-3.0, source and license at https://github.com/cabaletta/baritone/releases/tag/v1.11.3\n- Fabric API 0.116.17: Apache-2.0, source and license at https://github.com/FabricMC/fabric\n`);
console.log('Installable mod jars are ready in dist/mods/.');
