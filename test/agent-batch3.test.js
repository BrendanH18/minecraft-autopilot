import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile, spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { projectRoot } from '../src/config.js';
import { runAgent, readGoalFile, validateGoal } from '../src/agent.js';
import { createObjective } from '../src/objective.js';
import { summarizeTranscript, readTranscript } from '../src/transcript.js';
import { Harness } from '../src/harness.js';
import { DemoDriver } from '../src/demo-driver.js';
import { startBridge } from '../src/bridge-server.js';
import { testDirectory } from './helpers.js';

const player = {
  uuid: 'test',
  dimension: 'minecraft:overworld',
  health: 20,
  hunger: 18,
  position: { x: 0, y: 64, z: 0 },
};
function fakeAdapter() {
  return {
    state: {
      connected: true,
      mode: 'manual',
      player: structuredClone(player),
      inventory: [
        { name: 'minecraft:oak_log', count: 10, slot: 0 },
        { name: 'minecraft:bread', count: 2, slot: 1 },
      ],
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
      if (action.type === 'deposit')
        this.state.inventory = this.state.inventory.filter((stack) => !stack.name.endsWith(action.item));
      if (action.type === 'wait') this.state.player.health -= 6;
      return { status: 'completed' };
    },
    async release() {
      this.releases++;
      this.state.mode = 'manual';
    },
  };
}
const raw = (content, extra = {}) => new Response(JSON.stringify({ message: { content }, ...extra }), { status: 200 });
const reply = (decision, extra) => raw(JSON.stringify(decision), extra);
const scripted =
  (replies, bodies = []) =>
  async (url, request) => {
    bodies.push(JSON.parse(request.body));
    const next = replies.shift();
    return next instanceof Response ? next : reply(next);
  };
const input = (body) => JSON.parse(body.messages[1].content);
const quiet = { model: 'test', log() {} };

test('free-slot and health-loss criteria verify completion and keep unavailable data unmet', async () => {
  const adapter = fakeAdapter();
  const decisions = [
    { type: 'deposit', item: 'oak_log' },
    { type: 'wait', seconds: 1 },
    { type: 'done', reason: 'Stored.' },
  ];
  const result = await runAgent(adapter, 'Store logs', {
    ...quiet,
    criteria: { minFreeSlots: 35, maxHealthLoss: 6 },
    fetchImpl: scripted(decisions),
  });
  assert.equal(result.status, 'criteria_met');
  assert.deepEqual(result.verification.checks.freeSlots, { free: 35, required: 35, met: true });
  assert.deepEqual(result.verification.checks.healthLoss, { initial: 20, current: 14, loss: 6, maximum: 6, met: true });

  const objective = createObjective({ minFreeSlots: 34, maxHealthLoss: 1.5 }, { ...fakeAdapter().state });
  assert.deepEqual(objective.description.maxHealthLoss, { initial: 20, maximum: 1.5 });
  assert.equal(objective.description.minFreeSlots, 34);
  const state = fakeAdapter().state;
  assert.equal(objective.check(state).met, true, 'two distinct occupied slots leave 34 free');
  assert.equal(
    objective.check({
      ...state,
      inventory: [
        ...state.inventory,
        { name: 'minecraft:dirt', count: 1, slot: 2 },
        { name: 'minecraft:dirt', count: 0, slot: 3 },
      ],
    }).checks.freeSlots.free,
    33,
  );
  const missing = objective.check({ ...state, inventory: undefined });
  assert.deepEqual([missing.checks.freeSlots.free, missing.checks.freeSlots.met], [null, false]);
  const hurt = objective.check({ ...state, player: { ...state.player, health: 18 } });
  assert.deepEqual([hurt.checks.healthLoss.loss, hurt.checks.healthLoss.met], [2, false]);
  assert.equal(
    objective.check({ ...state, player: { ...state.player, health: undefined } }).checks.healthLoss.met,
    false,
  );
  assert.throws(
    () => createObjective({ maxHealthLoss: 2 }, { ...state, player: { ...state.player, health: undefined } }),
    /starting health is unavailable/,
  );
  assert.equal(createObjective({ minFreeSlots: 0 }, state).check(state).met, true);
  for (const criteria of [
    { minFreeSlots: 37 },
    { minFreeSlots: -1 },
    { minFreeSlots: 1.5 },
    { maxHealthLoss: 21 },
    { maxHealthLoss: -0.5 },
    { maxHealthLoss: NaN },
  ]) {
    const idle = fakeAdapter();
    await assert.rejects(runAgent(idle, 'Task', { ...quiet, criteria }));
    assert.equal(idle.acquires, 0);
  }
  const noHealth = fakeAdapter();
  delete noHealth.state.player.health;
  await assert.rejects(runAgent(noHealth, 'Task', { ...quiet, criteria: { maxHealthLoss: 2 } }), /starting health/);
  assert.equal(noHealth.acquires, 0);
});

test('goal files are read as regular text with one trailing newline dropped', async (t) => {
  const directory = await testDirectory(t, 'goal-file-');
  const file = join(directory, 'goal.txt');
  await writeFile(file, 'Collect eight oak logs\nthen return home.\r\n');
  assert.equal(await readGoalFile(file), 'Collect eight oak logs\nthen return home.');
  await writeFile(file, `${'é'.repeat(16_000)}\n`);
  assert.equal((await readGoalFile(file)).length, 16_000);
  for (const [content, message] of [
    ['a'.repeat(16_001), /1 to 16000/],
    ['\n', /1 to 16000/],
    ['   ', /1 to 16000/],
    ['a'.repeat(60_000), /1 to 16000/],
  ]) {
    await writeFile(file, content);
    await assert.rejects(readGoalFile(file), message);
  }
  await assert.rejects(readGoalFile(directory), /regular file/);
  await assert.rejects(readGoalFile(join(directory, 'missing.txt')), /Cannot read goal file .*ENOENT/);
  const fifo = join(directory, 'fifo');
  if (spawnSync('mkfifo', [fifo]).status === 0)
    await assert.rejects(readGoalFile(fifo), /regular file/, 'a FIFO is refused without blocking');
  assert.throws(() => validateGoal(' '), /1 to 16000/);
});

test('stop-below-health ends the task before a decision or after an action and releases control', async () => {
  const weak = fakeAdapter();
  weak.state.player.health = 5;
  let contacted = false;
  const early = await runAgent(weak, 'Walk', {
    ...quiet,
    stopBelowHealth: 6,
    criteria: { minHealth: 10 },
    fetchImpl: async () => {
      contacted = true;
    },
  });
  assert.equal(early.status, 'health_stop');
  assert.match(early.reason, /Health 5 is below the stop threshold of 6/);
  assert.equal(early.steps, 0);
  assert.equal(early.verification.met, false);
  assert.deepEqual([contacted, weak.acquires, weak.releases, weak.state.mode], [false, 1, 1, 'manual']);

  // The wait finishes (it is not interrupted), then the drop to 14 stops the task before another decision.
  const adapter = fakeAdapter();
  const decisions = [{ type: 'wait', seconds: 5 }, { type: 'eat' }];
  const later = await runAgent(adapter, 'Wait', { ...quiet, stopBelowHealth: 15, fetchImpl: scripted(decisions) });
  assert.equal(later.status, 'health_stop');
  assert.equal(later.steps, 1);
  assert.equal('verification' in later, false);
  assert.deepEqual(adapter.actions, [{ type: 'wait', seconds: 5 }]);
  assert.equal(adapter.releases, 1);
  assert.equal(later.final.health, 14);

  // Health that falls during inference stops the task before the decision is dispatched.
  const thinking = fakeAdapter();
  const replies = [{ type: 'eat' }];
  const hurtWhileThinking = await runAgent(thinking, 'Eat', {
    ...quiet,
    stopBelowHealth: 15,
    fetchImpl: async (url, request) => {
      thinking.state.player.health = 10;
      return scripted(replies)(url, request);
    },
  });
  assert.deepEqual(
    [hurtWhileThinking.status, hurtWhileThinking.steps, thinking.actions.length, thinking.releases],
    ['health_stop', 1, 0, 1],
  );

  // The deposit baseline inspection is not started below the threshold.
  const storing = fakeAdapter();
  storing.state.player.health = 5;
  storing.state.containers = [];
  const baseline = await runAgent(storing, 'Store', {
    ...quiet,
    stopBelowHealth: 6,
    criteria: { deposit: { item: 'oak_log', count: 1 } },
    fetchImpl: async () => {
      throw new Error('No model call expected.');
    },
  });
  assert.deepEqual(
    [baseline.status, baseline.steps, storing.actions.length, storing.releases],
    ['health_stop', 0, 0, 1],
  );

  // Health that falls during the final storage verification stops instead of reporting success.
  const verifying = fakeAdapter();
  verifying.state.containers = [{ x: 0, y: 64, z: 1, items: [] }];
  const execute = verifying.execute.bind(verifying);
  let inspections = 0;
  // The final inspection finds the deposit (so criteria pass) while health has fallen.
  verifying.execute = async (action) => {
    if (action.type === 'inspect_storage' && ++inspections === 2) {
      verifying.state.player.health = 4;
      verifying.state.containers[0].items = [{ name: 'minecraft:oak_log', count: 1 }];
    }
    return execute(action);
  };
  const final = await runAgent(verifying, 'Store', {
    ...quiet,
    stopBelowHealth: 8,
    criteria: { deposit: { item: 'oak_log', count: 1 } },
    fetchImpl: scripted([{ type: 'done', reason: 'Stored.' }]),
  });
  assert.deepEqual([final.status, final.steps, inspections, verifying.releases], ['health_stop', 1, 2, 1]);

  const fine = fakeAdapter();
  const unaffected = await runAgent(fine, 'Wait', {
    ...quiet,
    stopBelowHealth: 14,
    fetchImpl: scripted([
      { type: 'wait', seconds: 1 },
      { type: 'done', reason: 'Waited.' },
    ]),
  });
  assert.equal(unaffected.status, 'model_finished', 'health equal to the threshold continues');
  for (const stopBelowHealth of [0.5, 20, NaN, '10']) {
    const idle = fakeAdapter();
    await assert.rejects(runAgent(idle, 'Task', { ...quiet, stopBelowHealth }), /stop-below health/);
    assert.equal(idle.acquires, 0);
  }
});

test('invalid model output can be refused and retried a bounded number of consecutive times', async () => {
  const adapter = fakeAdapter();
  const bodies = [];
  const replies = [
    raw('not json'),
    reply({ type: 'shell', command: 'x' }),
    reply({ type: 'eat' }),
    raw('{"type":"goto","x":1}'),
    reply({ type: 'done', reason: 'Ate.' }),
  ];
  const result = await runAgent(adapter, 'Eat', { ...quiet, retryInvalid: 2, fetchImpl: scripted(replies, bodies) });
  assert.equal(result.status, 'model_finished');
  assert.equal(result.steps, 5, 'each invalid output consumed a decision');
  assert.deepEqual(adapter.actions, [{ type: 'eat' }]);
  const history = input(bodies[2]).history;
  assert.equal(history.length, 2);
  assert.match(history[0].rejected, /^Invalid action: .*JSON/);
  assert.match(history[1].rejected, /^Invalid action: type: /);
  assert.ok(history.every((entry) => entry.rejected.length <= 316 && !('action' in entry)));
  assert.match(input(bodies[4]).history.at(-1).rejected, /^Invalid action: y: .*; z: /);

  // Valid decisions reset the count; consecutive invalid outputs beyond the limit still stop with the existing error.
  const failing = fakeAdapter();
  await assert.rejects(
    runAgent(failing, 'Eat', { ...quiet, retryInvalid: 1, fetchImpl: scripted([raw('[]'), raw('nope')]) }),
    /The model returned an invalid action/,
  );
  assert.equal(failing.releases, 1);
  await assert.rejects(
    runAgent(fakeAdapter(), 'Eat', { ...quiet, fetchImpl: scripted([raw('nope')]) }),
    /invalid action/,
    'the default stays 0 retries',
  );
  for (const retryInvalid of [-1, 6, 1.5, '2']) {
    const idle = fakeAdapter();
    await assert.rejects(runAgent(idle, 'Task', { ...quiet, retryInvalid }), /invalid-output retries/);
    assert.equal(idle.acquires, 0);
  }
});

test('temperature and seed reach Ollama options only as configured', async () => {
  const bodies = [];
  await runAgent(fakeAdapter(), 'Idle', { ...quiet, fetchImpl: scripted([{ type: 'done', reason: 'Idle.' }], bodies) });
  await runAgent(fakeAdapter(), 'Idle', {
    ...quiet,
    temperature: 0.7,
    seed: 2_147_483_647,
    fetchImpl: scripted([{ type: 'done', reason: 'Idle.' }], bodies),
  });
  assert.deepEqual(bodies[0].options, { temperature: 0, num_ctx: 8192 });
  assert.deepEqual(bodies[1].options, { temperature: 0.7, num_ctx: 8192, seed: 2_147_483_647 });
  for (const options of [
    { temperature: -0.1 },
    { temperature: 2.1 },
    { temperature: NaN },
    { temperature: '1' },
    { seed: -1 },
    { seed: 2_147_483_648 },
    { seed: 1.5 },
    { seed: '7' },
  ]) {
    const idle = fakeAdapter();
    await assert.rejects(runAgent(idle, 'Task', { ...quiet, ...options }), /temperature|seed/);
    assert.equal(idle.acquires, 0);
  }
});

test('results and transcripts report model usage from Ollama counters', async (t) => {
  const directory = await testDirectory(t, 'usage-');
  const transcript = join(directory, 'run.jsonl');
  const replies = [
    reply({ type: 'eat' }, { prompt_eval_count: 900, eval_count: 12, total_duration: 1_250_400_000 }),
    reply({ type: 'wait', seconds: 1 }, { eval_count: 'many' }),
    reply({ type: 'done', reason: 'Ate.' }, { prompt_eval_count: 950, eval_count: 8, total_duration: 749_700_000 }),
  ];
  const result = await runAgent(fakeAdapter(), 'Eat', {
    ...quiet,
    transcript,
    temperature: 1,
    seed: 7,
    retryInvalid: 1,
    stopBelowHealth: 2,
    fetchImpl: scripted(replies),
  });
  assert.deepEqual(result.model, { requests: 3, promptTokens: 1850, outputTokens: 20, modelMs: 2000 });
  const events = (await readFile(transcript, 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    [events[0].temperature, events[0].seed, events[0].retryInvalid, events[0].stopBelowHealth],
    [1, 7, 1, 2],
  );
  const decisions = events.filter((event) => event.event === 'decision');
  assert.deepEqual([decisions[0].promptTokens, decisions[0].outputTokens], [900, 12]);
  assert.equal('promptTokens' in decisions[1] || 'outputTokens' in decisions[1], false);
  assert.deepEqual(events.at(-1).result.model, result.model);
  const dry = await runAgent(fakeAdapter(), 'Eat', { ...quiet, dryRun: true });
  assert.deepEqual(dry.model, { requests: 0, promptTokens: 0, outputTokens: 0, modelMs: 0 });
});

test('show-prompt previews the exact system prompt and first message without control', async () => {
  const adapter = fakeAdapter();
  const options = { ...quiet, allowActions: 'eat,deposit', fence: 10, criteria: { minFreeSlots: 35 } };
  const preview = await runAgent(adapter, 'Store logs', {
    ...options,
    dryRun: true,
    showPrompt: true,
    fetchImpl: async () => assert.fail('no model'),
  });
  assert.equal(adapter.acquires, 0);
  assert.equal(preview.firstMessage.role, 'user');
  const bodies = [];
  await runAgent(adapter, 'Store logs', {
    ...options,
    fetchImpl: scripted(
      [
        { type: 'done', reason: 'Stop.' },
        { type: 'done', reason: 'Stop.' },
        { type: 'done', reason: 'Stop.' },
      ],
      bodies,
    ),
  });
  assert.equal(bodies[0].messages[0].content, preview.systemPrompt);
  // The real first request observes again after takeover, so only the control mode differs.
  const sent = input(bodies[0]);
  assert.equal(sent.state.mode, 'agent');
  assert.deepEqual({ ...sent, state: { ...sent.state, mode: 'manual' } }, JSON.parse(preview.firstMessage.content));
  assert.deepEqual(Object.keys(bodies[0].messages[1]), Object.keys(preview.firstMessage));
  const plain = await runAgent(adapter, 'Store logs', { ...quiet, dryRun: true });
  assert.equal('systemPrompt' in plain || 'firstMessage' in plain, false);
  const before = adapter.acquires;
  await assert.rejects(runAgent(adapter, 'Store logs', { ...quiet, showPrompt: true }), /requires a dry run/);
  await assert.rejects(runAgent(adapter, 'Store logs', { ...quiet, dryRun: true, showPrompt: 'yes' }), /boolean/);
  assert.equal(adapter.acquires, before);
});

test('transcript summaries count events per run and tolerate malformed lines', async (t) => {
  const line = (event, data = {}) =>
    JSON.stringify({ time: `2026-11-01T00:00:0${data.second ?? 0}.000Z`, event, ...data });
  const text = [
    line('start', { goal: 'First', model: 'm1' }),
    line('finish', { error: 'Stopped by user.', second: 2 }),
    line('start', { goal: 'Second', model: 'm2', second: 3 }),
    '{broken',
    line('decision', { decision: { type: 'goto' } }),
    line('result'),
    line('decision', { decision: { type: 'goto' } }),
    line('error'),
    line('decision', { decision: { type: 'done' } }),
    line('rejection'),
    line('rejection', { reason: 'Invalid action: x' }),
    '[1,2]',
    '"start"',
    '',
    line('finish', { result: { status: 'criteria_unmet', durationMs: 4321 }, second: 9 }),
    '',
  ].join('\n');
  assert.deepEqual(summarizeTranscript(text), {
    runs: 2,
    run: 2,
    events: 9,
    decisions: 3,
    decisionsByType: { goto: 2, done: 1 },
    rejections: 2,
    errors: 1,
    results: 1,
    invalidLines: 3,
    goal: 'Second',
    model: 'm2',
    started: '2026-11-01T00:00:03.000Z',
    finished: '2026-11-01T00:00:09.000Z',
    status: 'criteria_unmet',
    durationMs: 4321,
  });
  const first = summarizeTranscript(text, { run: 1 });
  assert.deepEqual(
    [first.goal, first.error, first.durationMs, 'status' in first],
    ['First', 'Stopped by user.', 2000, false],
  );
  assert.throws(() => summarizeTranscript(text, { run: 3 }), /run from 1 to 2/);
  // An attempt that failed before writing start keeps its finish out of the completed run before it.
  const orphan = [
    line('start', { goal: 'Done', model: 'm' }),
    line('finish', { result: { status: 'criteria_met', durationMs: 5 }, second: 1 }),
    line('finish', { error: 'Cannot reach the Minecraft bridge.', second: 4 }),
  ].join('\n');
  assert.deepEqual(
    [summarizeTranscript(orphan, { run: 1 }).status, summarizeTranscript(orphan, { run: 1 }).goal],
    ['criteria_met', 'Done'],
  );
  const late = summarizeTranscript(orphan);
  assert.deepEqual(
    [late.runs, late.goal, late.error, 'status' in late],
    [2, null, 'Cannot reach the Minecraft bridge.', false],
  );
  const unfinished = summarizeTranscript(`garbage\n${line('start', { goal: 'G', model: 'm' })}\n`);
  assert.deepEqual(
    [unfinished.runs, unfinished.invalidLines, unfinished.status, unfinished.finished, unfinished.durationMs],
    [2, 0, null, null, null],
  );
  assert.deepEqual(summarizeTranscript(''), {
    runs: 0,
    run: null,
    events: 0,
    decisions: 0,
    decisionsByType: {},
    rejections: 0,
    errors: 0,
    results: 0,
    invalidLines: 0,
    goal: null,
    model: null,
    started: null,
    finished: null,
    status: null,
    durationMs: null,
  });

  const directory = await testDirectory(t, 'summary-');
  await assert.rejects(readTranscript(directory), /regular file/);
  await assert.rejects(readTranscript(join(directory, 'missing.jsonl')), /ENOENT/);
  const big = join(directory, 'big.jsonl');
  await writeFile(big, Buffer.alloc(10 * 1024 * 1024 + 1, 0x20));
  await assert.rejects(readTranscript(big), /larger than 10 MiB/);
  const fifo = join(directory, 'fifo');
  if (spawnSync('mkfifo', [fifo]).status === 0) await assert.rejects(readTranscript(fifo), /regular file/);
});

function cli(args) {
  const env = { ...process.env };
  for (const name of ['MC_AGENT_MODEL', 'MC_AGENT_OLLAMA']) delete env[name];
  return new Promise((resolve) =>
    execFile(
      process.execPath,
      [join(projectRoot, 'src/cli.js'), ...args],
      { timeout: 10_000, env },
      (error, stdout, stderr) => resolve({ error, stdout, stderr }),
    ),
  );
}

test('agent CLI reads goal files, stops on low health with exit 2, and summarizes its transcript', {
  timeout: 30_000,
}, async (t) => {
  const directory = await testDirectory(t, 'batch3-cli-');
  const discoveryPath = join(directory, 'bridge.json');
  const driver = new DemoDriver();
  const harness = new Harness(driver);
  const bridge = await startBridge(harness, { discoveryPath });
  t.after(() => bridge.close());
  const bodies = [];
  let replies = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    bodies.push(JSON.parse(Buffer.concat(chunks).toString()));
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(replies.shift()));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  const goalFile = join(directory, 'goal.txt');
  await writeFile(goalFile, 'Collect one oak log.\nThen stop.\n');
  const transcript = join(directory, 'run.jsonl');
  const agent = (...args) => cli(['--bridge', discoveryPath, 'agent', '--model', 'mock', '--ollama', url, ...args]);

  replies = [
    { message: { content: 'not json' }, prompt_eval_count: 100, eval_count: 3, total_duration: 2_000_000 },
    {
      message: { content: JSON.stringify({ type: 'collect', block: 'oak_log', count: 1 }) },
      prompt_eval_count: 120,
      eval_count: 9,
      total_duration: 3_000_000,
    },
    { message: { content: JSON.stringify({ type: 'done', reason: 'Collected.' }) } },
  ];
  const completed = await agent(
    '--goal-file',
    goalFile,
    '--transcript',
    transcript,
    '--retry-invalid',
    '1',
    '--temperature',
    '0.5',
    '--seed',
    '42',
    '--verify-min-free-slots',
    '30',
    '--verify-max-health-loss',
    '0',
    '--stop-below-health',
    '10',
  );
  assert.equal(completed.error, null, completed.stderr);
  const result = JSON.parse(completed.stdout);
  assert.equal(result.status, 'criteria_met');
  assert.deepEqual(result.model, { requests: 3, promptTokens: 220, outputTokens: 12, modelMs: 5 });
  assert.equal(input(bodies[0]).goal, 'Collect one oak log.\nThen stop.');
  assert.deepEqual(bodies[0].options, { temperature: 0.5, num_ctx: 8192, seed: 42 });
  assert.equal(result.verification.checks.freeSlots.met, true);
  assert.deepEqual(result.verification.checks.healthLoss, { initial: 20, current: 20, loss: 0, maximum: 0, met: true });

  driver.player.health = 5;
  const stopped = await agent('Walk around', '--transcript', transcript, '--stop-below-health', '6');
  assert.equal(stopped.error?.code, 2, stopped.stderr);
  assert.equal(JSON.parse(stopped.stdout).status, 'health_stop');
  assert.equal(bodies.length, 3, 'the low-health stop never asked the model');
  assert.equal(harness.observe().mode, 'manual');

  await writeFile(transcript, 'not a json line\n', { flag: 'a' });
  const summary = await cli(['transcript-summary', transcript, '--run', '1']);
  assert.equal(summary.error, null, summary.stderr);
  const first = JSON.parse(summary.stdout);
  assert.deepEqual(
    { ...first, started: typeof first.started, finished: typeof first.finished, durationMs: typeof first.durationMs },
    {
      runs: 2,
      run: 1,
      events: 6,
      decisions: 2,
      decisionsByType: { collect: 1, done: 1 },
      rejections: 1,
      errors: 0,
      results: 1,
      invalidLines: 0,
      goal: 'Collect one oak log.\nThen stop.',
      model: 'mock',
      started: 'string',
      finished: 'string',
      status: 'criteria_met',
      durationMs: 'number',
    },
  );
  const last = JSON.parse((await cli(['--json', 'transcript-summary', transcript])).stdout);
  assert.deepEqual(
    [last.run, last.status, last.decisions, last.invalidLines, last.goal],
    [2, 'health_stop', 0, 1, 'Walk around'],
  );

  for (const args of [
    [],
    ['Goal', '--goal-file', goalFile],
    ['--goal-file', directory],
    ['Goal', '--show-prompt'],
    ['Goal', '--stop-below-health', '20'],
    ['Goal', '--retry-invalid', '6'],
    ['Goal', '--temperature', '2.5'],
    ['Goal', '--seed', '-1'],
    ['Goal', '--verify-min-free-slots', '37'],
    ['Goal', '--verify-max-health-loss', '21'],
  ]) {
    const invalid = await agent(...args);
    assert.equal(invalid.error?.code, 1, args.join(' '));
  }
  const preview = JSON.parse((await agent('--goal-file', goalFile, '--dry-run', '--show-prompt')).stdout);
  assert.match(preview.systemPrompt, /You control a Minecraft Java player/);
  assert.equal(JSON.parse(preview.firstMessage.content).goal, 'Collect one oak log.\nThen stop.');
  assert.equal(bodies.length, 3);
  assert.equal((await cli(['transcript-summary', join(directory, 'missing.jsonl')])).error?.code, 1);
  await mkdir(join(directory, 'dir.jsonl'));
  assert.match((await cli(['transcript-summary', join(directory, 'dir.jsonl')])).stderr, /regular file/);
  assert.equal(harness.observe().mode, 'manual');
});
