import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { readFile, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { projectRoot } from '../src/config.js';
import { runAgent, listModels, ollamaEndpoint, parseAllowedActions, plannerActions } from '../src/agent.js';
import { Harness } from '../src/harness.js';
import { DemoDriver } from '../src/demo-driver.js';
import { startBridge } from '../src/bridge-server.js';
import { testDirectory } from './helpers.js';

function fakeAdapter() {
  return {
    state: {
      connected: true,
      mode: 'manual',
      player: {
        uuid: 'test',
        dimension: 'minecraft:overworld',
        health: 20,
        hunger: 18,
        position: { x: 0, y: 64, z: 0 },
      },
      inventory: [{ name: 'minecraft:oak_log', count: 10 }],
    },
    actions: [],
    acquires: 0,
    releases: 0,
    async observe() {
      return structuredClone(this.state);
    },
    async acquire() {
      this.acquires++;
      this.state.mode = 'agent';
    },
    async execute(action) {
      this.actions.push(action);
      if (action.type === 'goto') Object.assign(this.state.player.position, { x: action.x, y: action.y, z: action.z });
      if (action.type === 'deposit') this.state.inventory = [];
      return { status: 'completed' };
    },
    async release() {
      this.releases++;
      this.state.mode = 'manual';
    },
  };
}
const reply = (decision) =>
  new Response(JSON.stringify({ message: { content: JSON.stringify(decision) } }), { status: 200 });
const scripted =
  (decisions, bodies = []) =>
  async (url, request) => {
    bodies.push(JSON.parse(request.body));
    return reply(decisions.shift());
  };
const input = (body) => JSON.parse(body.messages[1].content);

test('dry run validates against the current observation without control or the model', async () => {
  const adapter = fakeAdapter();
  let contacted = false;
  const result = await runAgent(adapter, 'Store every log', {
    model: 'test',
    dryRun: true,
    log() {},
    fetchImpl: async () => {
      contacted = true;
    },
    criteria: { maxInventory: { item: 'oak_log', count: 0 }, maxDistance: 5 },
  });
  assert.equal(result.status, 'dry_run');
  assert.deepEqual(result.criteria.maxInventory, { item: 'minecraft:oak_log', count: 0 });
  assert.equal(result.progress.met, false);
  assert.equal(result.progress.checks.maxInventory.current, 10);
  assert.equal(result.progress.checks.maxDistance.met, true);
  assert.deepEqual(result.actionCounts, {});
  assert.equal(contacted, false);
  assert.equal(adapter.acquires, 0);
  assert.equal(adapter.releases, 0);
  const plain = await runAgent(adapter, 'Anything', { model: 'test', dryRun: true });
  assert.deepEqual([plain.criteria, plain.progress], [null, null]);
  for (const options of [
    { dryRun: 'yes' },
    { ollamaUrl: 'http://example.com:11434' },
    { maxSteps: 0 },
    { criteria: { maxDistance: -1 } },
  ]) {
    await assert.rejects(runAgent(adapter, 'Anything', { model: 'test', dryRun: true, ...options }));
  }
  assert.equal(adapter.acquires, 0);
});

test('transcripts append owner-only JSON lines for every event without credentials', async (t) => {
  const directory = await testDirectory(t, 'transcript-');
  const transcript = join(directory, 'run.jsonl');
  const adapter = fakeAdapter();
  adapter.execute = async function (action) {
    this.actions.push(action);
    if (action.type === 'eat') throw new Error('No food.');
    return { status: 'completed', message: 'Arrived.' };
  };
  const decisions = [
    { type: 'goto', x: 1, y: 64, z: 0 },
    { type: 'eat' },
    { type: 'collect', block: 'oak_log', count: 1 },
    { type: 'done', reason: 'Finished.' },
  ];
  await runAgent(adapter, 'Walk then eat', {
    model: 'test',
    ollamaUrl: 'http://localhost:11434',
    transcript,
    allowActions: ['goto', 'eat'],
    log() {},
    fetchImpl: scripted(decisions),
  });
  await runAgent(adapter, 'Check', { model: 'test', transcript, dryRun: true });
  assert.equal((await stat(transcript)).mode & 0o777, 0o600);
  const text = await readFile(transcript, 'utf8');
  assert.doesNotMatch(text, /localhost|11434|secret|password/i);
  const events = text
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    events.map((event) => event.event),
    [
      'start',
      'decision',
      'result',
      'decision',
      'error',
      'decision',
      'rejection',
      'decision',
      'finish',
      'start',
      'finish',
    ],
  );
  for (const event of events) assert.ok(!Number.isNaN(Date.parse(event.time)));
  assert.equal(events[4].error, 'No food.');
  assert.deepEqual([events[2].status, events[2].message], ['completed', 'Arrived.']);
  assert.equal(events[8].result.status, 'model_finished');
  assert.equal(events[10].result.status, 'dry_run');

  // Failures are recorded too, and symlinks or non-files are refused before any takeover.
  await assert.rejects(
    runAgent(adapter, 'Walk', { model: 'test', transcript, log() {}, fetchImpl: async () => reply({ type: 'shell' }) }),
    /invalid action/,
  );
  assert.match(
    (await readFile(transcript, 'utf8')).trim().split('\n').at(-1),
    /"error":"The model returned an invalid action/,
  );
  const target = join(directory, 'target');
  await writeFile(target, '');
  await symlink(target, join(directory, 'link'));
  const before = adapter.acquires;
  await assert.rejects(runAgent(adapter, 'Walk', { model: 'test', transcript: join(directory, 'link') }));
  await assert.rejects(runAgent(adapter, 'Walk', { model: 'test', transcript: directory }));
  await assert.rejects(runAgent(adapter, 'Walk', { model: 'test', transcript: ' ' }), /transcript path/);
  assert.equal(adapter.acquires, before);
  assert.equal(await readFile(target, 'utf8'), '');
});

test('the consecutive failure stop is configurable and its message names the limit', async () => {
  for (const [maxFailures, message] of [
    [1, /: The action failed/],
    [5, /: Five consecutive actions failed/],
  ]) {
    const adapter = fakeAdapter();
    adapter.execute = async function (action) {
      this.actions.push(action);
      return { status: 'failed', message: 'Blocked.' };
    };
    await assert.rejects(
      runAgent(adapter, 'Go home', {
        model: 'test',
        maxFailures,
        log() {},
        fetchImpl: async () => reply({ type: 'home' }),
      }),
      message,
    );
    assert.equal(adapter.actions.length, maxFailures);
    assert.equal(adapter.releases, 1);
  }
});

test('context size and history window reach Ollama', async () => {
  const bodies = [];
  const decisions = [
    ...Array.from({ length: 4 }, () => ({ type: 'wait', seconds: 1 })),
    { type: 'done', reason: 'Waited.' },
  ];
  await runAgent(fakeAdapter(), 'Wait', {
    model: 'test',
    contextTokens: 16_384,
    history: 2,
    log() {},
    fetchImpl: scripted(decisions, bodies),
  });
  assert.equal(bodies[0].options.num_ctx, 16_384);
  assert.deepEqual(
    bodies.map((body) => input(body).history.length),
    [0, 1, 2, 2, 2],
  );
});

test('API callers receive the same bounds for the new planner options', async () => {
  for (const options of [
    { maxFailures: 0 },
    { maxFailures: 11 },
    { maxFailures: 2.5 },
    { contextTokens: 2047 },
    { contextTokens: 131_073 },
    { history: 0 },
    { history: 51 },
    { fence: 0 },
    { fence: 10_001 },
    { fence: NaN },
    { allowActions: [] },
    { allowActions: ['fly'] },
    { allowActions: 'goto,' },
    { transcript: 4 },
  ]) {
    const adapter = fakeAdapter();
    await assert.rejects(runAgent(adapter, 'Task', { model: 'test', ...options }), /failures|fence|action|transcript/);
    assert.equal(adapter.acquires, 0);
  }
});

test('the fence refuses distant goto targets as failed actions and is shown to the model', async () => {
  const adapter = fakeAdapter();
  adapter.state.player.position = { x: 100, y: 64, z: -50 };
  const bodies = [];
  const decisions = [
    { type: 'goto', x: 121, y: 64, z: -50 },
    { type: 'goto', x: 100, y: 300, z: -30 },
    { type: 'goto', x: 115, y: 64, z: -38 },
    { type: 'done', reason: 'Inside.' },
  ];
  const result = await runAgent(adapter, 'Walk east', {
    model: 'test',
    fence: 20,
    log() {},
    fetchImpl: scripted(decisions, bodies),
  });
  assert.deepEqual(input(bodies[0]).fence, { x: 100, z: -50, radius: 20 });
  assert.match(input(bodies[1]).history[0].error, /outside the 20-block fence/);
  assert.deepEqual(
    adapter.actions.map((action) => action.x),
    [100, 115],
    'height is ignored; the 21-block target never ran',
  );
  assert.deepEqual(result.actionCounts, { goto: 2 });
  const failing = fakeAdapter();
  await assert.rejects(
    runAgent(failing, 'Run away', {
      model: 'test',
      fence: 5,
      maxFailures: 2,
      log() {},
      fetchImpl: async () => reply({ type: 'goto', x: 10, y: 64, z: 0 }),
    }),
    /Two consecutive/,
  );
  assert.deepEqual(failing.actions, []);
  const unknown = fakeAdapter();
  delete unknown.state.player.position;
  await assert.rejects(runAgent(unknown, 'Walk', { model: 'test', fence: 5 }), /starting position is unavailable/);
  assert.equal(unknown.acquires, 0);
});

test('allowed actions restrict the schema and refuse other decisions without execution', async () => {
  assert.deepEqual(parseAllowedActions(' goto, eat ,goto'), ['goto', 'eat']);
  assert.throws(() => parseAllowedActions('goto,done'), /Unknown planner action "done"/);
  assert.throws(() => parseAllowedActions('goto,'), /Unknown planner action ""/);
  assert.deepEqual(plannerActions, [
    'goto',
    'home',
    'set_home',
    'collect',
    'eat',
    'inspect_storage',
    'deposit',
    'wait',
  ]);
  const adapter = fakeAdapter();
  const bodies = [];
  const decisions = [
    { type: 'collect', block: 'oak_log', count: 1 },
    { type: 'eat' },
    { type: 'done', reason: 'Ate.' },
  ];
  const result = await runAgent(adapter, 'Eat', {
    model: 'test',
    allowActions: 'eat',
    log() {},
    fetchImpl: scripted(decisions, bodies),
  });
  assert.deepEqual(bodies[0].format.properties.type.enum, ['eat', 'done']);
  assert.deepEqual(input(bodies[0]).allowedActions, ['eat', 'done']);
  assert.match(input(bodies[1]).history[0].rejected, /collect is not allowed/);
  assert.deepEqual(adapter.actions, [{ type: 'eat' }]);
  assert.equal(result.status, 'model_finished');
});

test('every returned result summarizes duration, executed actions, and the final observation', async () => {
  const adapter = fakeAdapter();
  adapter.execute = async function (action) {
    this.actions.push(action);
    if (this.actions.length === 2) throw new Error('Blocked.');
    this.state.player.hunger = 20;
    return { status: 'completed' };
  };
  const decisions = [{ type: 'eat' }, { type: 'home' }, { type: 'wait', seconds: 1 }];
  const result = await runAgent(adapter, 'Eat', {
    model: 'test',
    maxSteps: 3,
    log() {},
    fetchImpl: scripted(decisions),
  });
  assert.equal(result.status, 'step_limit');
  assert.ok(Number.isInteger(result.durationMs) && result.durationMs >= 0);
  assert.deepEqual(result.actionCounts, { eat: 1, home: 1, wait: 1 });
  assert.deepEqual(result.final, { position: { x: 0, y: 64, z: 0 }, health: 20, hunger: 20 });
  const offline = fakeAdapter();
  offline.observe = async function () {
    return { ...structuredClone(this.state), ...(this.state.mode === 'agent' && { connected: false, player: null }) };
  };
  const unavailable = await runAgent(offline, 'Idle', {
    model: 'test',
    log() {},
    fetchImpl: async () => reply({ type: 'done', reason: 'Idle.' }),
  });
  assert.equal(unavailable.final, null);
});

test('maximum inventory and distance criteria verify completion and keep unavailable data unmet', async () => {
  const adapter = fakeAdapter();
  const decisions = [
    { type: 'done', reason: 'Too early.' },
    { type: 'deposit', item: 'oak_log' },
    { type: 'goto', x: 3, y: 64, z: 4 },
    { type: 'done', reason: 'Stored all.' },
  ];
  const result = await runAgent(adapter, 'Store all logs nearby', {
    model: 'test',
    log() {},
    criteria: { maxInventory: { item: 'oak_log', count: 0 }, maxDistance: 5 },
    fetchImpl: scripted(decisions),
  });
  assert.equal(result.status, 'criteria_met');
  assert.deepEqual(result.verification.checks.maxInventory, {
    item: 'minecraft:oak_log',
    current: 0,
    maximum: 0,
    met: true,
  });
  assert.equal(result.verification.checks.maxDistance.distance, 5);
  const far = fakeAdapter();
  const limited = await runAgent(far, 'Wander', {
    model: 'test',
    maxSteps: 1,
    log() {},
    criteria: { maxDistance: 4.9 },
    fetchImpl: async () => reply({ type: 'goto', x: 3, y: 64, z: 4 }),
  });
  assert.equal(limited.status, 'step_limit');
  assert.equal(limited.verification.met, false);
});

test('local Ollama URLs are validated by one shared helper', () => {
  assert.equal(ollamaEndpoint('http://[::1]:11434/ignored', '/api/tags').href, 'http://[::1]:11434/api/tags');
  assert.throws(() => ollamaEndpoint('http://user:pass@127.0.0.1:11434', '/api/tags'), /credentials/);
  assert.throws(() => ollamaEndpoint('http://192.168.1.2:11434', '/api/tags'), /localhost/);
  assert.throws(() => ollamaEndpoint('file:///etc/passwd', '/api/tags'), /localhost/);
  assert.throws(() => ollamaEndpoint('not a url', '/api/tags'), /local Ollama URL/);
});

test('model listing reports names, sizes, and dates, and explains failures', async () => {
  const urls = [];
  const models = await listModels({
    fetchImpl: async (url) => {
      urls.push(String(url));
      return new Response(
        JSON.stringify({
          models: [
            { name: 'qwen3.5:4b', size: 3_400_000_000, modified_at: '2026-10-01T10:00:00Z', digest: 'abc' },
            { name: 'granite4.2:3b', size: 512 },
          ],
        }),
      );
    },
  });
  assert.deepEqual(urls, ['http://127.0.0.1:11434/api/tags']);
  assert.deepEqual(models, [
    { name: 'granite4.2:3b', bytes: 512, size: '512 B', modifiedAt: null },
    { name: 'qwen3.5:4b', bytes: 3_400_000_000, size: '3.4 GB', modifiedAt: '2026-10-01T10:00:00Z' },
  ]);
  await assert.rejects(
    listModels({
      fetchImpl: async () => {
        throw new TypeError('fetch failed');
      },
    }),
    /Could not connect to local Ollama at http:\/\/127\.0\.0\.1:11434/,
  );
  await assert.rejects(
    listModels({ fetchImpl: async () => new Response('{"models":"none"}') }),
    /unexpected model list/,
  );
  await assert.rejects(listModels({ fetchImpl: async () => new Response('busy', { status: 503 }) }), /HTTP 503: busy/);
  // The interval stands in for the open socket that keeps a real request alive.
  await assert.rejects(
    listModels({
      timeout: 0.05,
      fetchImpl: (url, { signal }) =>
        new Promise((resolve, reject) => {
          const socket = setInterval(() => {}, 1000);
          signal.addEventListener('abort', () => {
            clearInterval(socket);
            reject(signal.reason);
          });
        }),
    }),
    /did not answer within 0.05 seconds/,
  );
  await assert.rejects(listModels({ ollamaUrl: 'http://ollama.example:11434' }), /localhost/);
});

function cli(args, overrides = {}) {
  const env = { ...process.env, ...overrides };
  for (const name of ['MC_AGENT_MODEL', 'MC_AGENT_OLLAMA']) if (!(name in overrides)) delete env[name];
  return new Promise((resolve) =>
    execFile(
      process.execPath,
      [join(projectRoot, 'src/cli.js'), ...args],
      { timeout: 10_000, env },
      (error, stdout, stderr) => resolve({ error, stdout, stderr }),
    ),
  );
}
async function fakeOllama(t, handler) {
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    response.setHeader('Content-Type', 'application/json');
    response.end(
      JSON.stringify(await handler(request, chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null)),
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return `http://127.0.0.1:${server.address().port}`;
}

test('models command lists a local server and explains an unreachable one', { timeout: 15_000 }, async (t) => {
  const url = await fakeOllama(t, (request) => {
    assert.equal(request.url, '/api/tags');
    return { models: [{ name: 'mock:latest', size: 2_000_000, modified_at: '2026-11-01T00:00:00Z' }] };
  });
  const listed = await cli(['models'], { MC_AGENT_OLLAMA: url });
  assert.equal(listed.error, null, listed.stderr);
  assert.deepEqual(JSON.parse(listed.stdout), [
    { name: 'mock:latest', bytes: 2_000_000, size: '2.0 MB', modifiedAt: '2026-11-01T00:00:00Z' },
  ]);
  const closed = await cli(['models', '--ollama', 'http://127.0.0.1:9'], { MC_AGENT_OLLAMA: url });
  assert.equal(closed.error?.code, 1);
  assert.match(closed.stderr, /Could not connect to local Ollama at http:\/\/127\.0\.0\.1:9\. Start Ollama/);
  const remote = await cli(['models', '--ollama', 'http://user:secret@127.0.0.1:11434']);
  assert.match(remote.stderr, /must not contain credentials/);
});

test('agent CLI applies environment defaults, new options, and step-limit exit 2 for new criteria', {
  timeout: 20_000,
}, async (t) => {
  const directory = await testDirectory(t, 'agent-options-cli-');
  const discoveryPath = join(directory, 'bridge.json');
  const harness = new Harness(new DemoDriver());
  const bridge = await startBridge(harness, { discoveryPath });
  t.after(() => bridge.close());
  const bodies = [];
  const url = await fakeOllama(t, (request, body) => {
    bodies.push(body);
    return { message: { content: JSON.stringify({ type: 'collect', block: 'oak_log', count: 1 }) } };
  });
  const agent = (args, env) => cli(['--bridge', discoveryPath, 'agent', 'Gather a log', ...args], env);

  const missing = await agent([]);
  assert.equal(missing.error?.code, 1);
  assert.match(missing.stderr, /model/);
  const dry = await agent(['--dry-run', '--verify-max-inventory', 'bread:8', '--verify-max-distance', '0'], {
    MC_AGENT_MODEL: 'env-model',
    MC_AGENT_OLLAMA: 'http://127.0.0.1:9',
  });
  assert.equal(dry.error, null, dry.stderr);
  const preview = JSON.parse(dry.stdout);
  assert.equal(preview.status, 'dry_run');
  assert.equal(preview.progress.met, true);
  assert.deepEqual(preview.final, { position: { x: 0, y: 64, z: 0 }, health: 20, hunger: 14 });
  assert.equal(bodies.length, 0);

  const transcript = join(directory, 'run.jsonl');
  const limited = await agent(
    [
      '--ollama',
      url,
      '--steps',
      '1',
      '--allow-actions',
      'collect,wait',
      '--fence',
      '50',
      '--history',
      '3',
      '--context-tokens',
      '4096',
      '--max-failures',
      '2',
      '--transcript',
      transcript,
      '--verify-max-inventory',
      'oak_log:0',
    ],
    { MC_AGENT_MODEL: 'env-model', MC_AGENT_OLLAMA: 'http://127.0.0.1:9' },
  );
  assert.equal(limited.error?.code, 2, limited.stderr);
  const result = JSON.parse(limited.stdout);
  assert.equal(result.status, 'step_limit');
  assert.deepEqual(result.verification.checks.maxInventory, {
    item: 'minecraft:oak_log',
    current: 1,
    maximum: 0,
    met: false,
  });
  assert.deepEqual(result.actionCounts, { collect: 1 });
  assert.equal(bodies[0].model, 'env-model');
  assert.equal(bodies[0].options.num_ctx, 4096);
  assert.deepEqual(bodies[0].format.properties.type.enum, ['collect', 'wait', 'done']);
  assert.deepEqual(JSON.parse(bodies[0].messages[1].content).fence, { x: 0, z: 0, radius: 50 });
  assert.deepEqual(
    (await readFile(transcript, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line).event),
    ['start', 'decision', 'result', 'finish'],
  );

  await agent(['--ollama', url, '--model', 'flag-model', '--steps', '1'], { MC_AGENT_MODEL: 'env-model' });
  assert.equal(bodies.at(-1).model, 'flag-model', 'explicit flags win over the environment');
  for (const flags of [
    ['--max-failures', '11'],
    ['--context-tokens', '1024'],
    ['--history', '0'],
    ['--fence', '0'],
    ['--allow-actions', 'goto,fly'],
    ['--verify-max-inventory', 'oak_log:2305'],
    ['--verify-max-distance', '10001'],
  ]) {
    const invalid = await agent(['--model', 'mock', '--ollama', url, ...flags]);
    assert.equal(invalid.error?.code, 1, flags.join(' '));
  }
  assert.equal(bodies.length, 2, 'invalid options never contact the model');
  assert.equal(harness.observe().mode, 'manual');
});

test('a step limit reports final state observed after the last action', async () => {
  const adapter = fakeAdapter();
  const result = await runAgent(adapter, 'Walk', {
    model: 'test',
    maxSteps: 1,
    log() {},
    fetchImpl: scripted([{ type: 'goto', x: 7, y: 64, z: 3 }]),
  });
  assert.equal(result.status, 'step_limit');
  assert.deepEqual(result.final.position, { x: 7, y: 64, z: 3 });
});
