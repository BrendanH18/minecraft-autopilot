import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { inspectPrerequisites } from '../src/doctor.js';
import { testDirectory } from './helpers.js';
import { projectRoot } from '../src/config.js';

function jdk(name) {
  return { status: 0, stderr: name === 'java' ? 'openjdk version "21.0.8"' : '', stdout: name === 'java' ? '' : `${name} 21.0.8` };
}

test('doctor distinguishes a runtime-only Java installation from a full JDK', async t => {
  const directory = await testDirectory(t, 'doctor-');
  const result = await inspectPrerequisites({ root: directory, discoveryPath: join(directory, 'bridge.json'),
    run: name => name === 'java' ? jdk(name) : { status: null, error: new Error('ENOENT') } });
  assert.equal(result.jdkReady, false);
  assert.match(result.next, /JDK/);
  assert.equal(result.java, 'openjdk version "21.0.8"');
});

test('doctor validates discovery files offline without exposing tokens or JVM options', async t => {
  const directory = await testDirectory(t, 'doctor-');
  const discoveryPath = join(directory, 'bridge.json');
  const token = 'private-test-token'.repeat(4);
  await writeFile(discoveryPath, JSON.stringify({ protocol: 1, url: 'http://127.0.0.1:1', token }));
  const result = await inspectPrerequisites({ root: directory, discoveryPath, run: name => ({ ...jdk(name), stderr: `Picked up JAVA_TOOL_OPTIONS: hidden-test-value\n${jdk(name).stderr}` }) });
  assert.equal(result.jdkReady, true);
  assert.equal(result.bridgeDiscoveryExists, true);
  assert.equal(result.bridgeValid, true);
  assert.ok(!JSON.stringify(result).includes(token));
  assert.ok(!JSON.stringify(result).includes('hidden-test-value'));
  await writeFile(discoveryPath, '{}');
  assert.equal((await inspectPrerequisites({ root: directory, discoveryPath, run: jdk })).bridgeValid, false);
});

test('doctor follows the selected profile discovery path', async t => {
  const directory = await testDirectory(t, 'doctor-profile-');
  const discoveryPath = join(directory, 'external-bridge.json');
  await writeFile(discoveryPath, JSON.stringify({ protocol: 1, url: 'http://127.0.0.1:1', token: 'x'.repeat(64) }));
  await writeFile(join(directory, 'profile.json'), JSON.stringify({ discoveryPath }));
  const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e',
    'import { inspectPrerequisites } from "./src/doctor.js"; console.log(JSON.stringify(await inspectPrerequisites()));'],
    { cwd: projectRoot, env: { ...process.env, MC_AGENT_HOME: directory } });
  const result = JSON.parse(stdout);
  assert.equal(result.bridgeFile, discoveryPath);
  assert.equal(result.bridgeValid, true);
});
