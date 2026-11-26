// Process helpers for the Fabric takeover scenarios: real key presses on the client window (xdotool on the Xvfb
// display), a second CLI process that can be suspended or killed, and a local stand-in for Ollama that holds a
// planner request open so the agent stays "waiting for model inference" for as long as a scenario needs.
import { execFile, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { CLI } from './processes.js';
import { projectRoot } from '../../src/config.js';

/** Scenario key names → X keysyms. */
export const KEYS = Object.freeze({
  f8: 'F8',
  escape: 'Escape',
  inventory: 'e',
  tab: 'Tab',
  enter: 'Return',
});
// GLFW titles the development client "Minecraft* 1.21.1 - Multiplayer (3rd-party Server)".
export const WINDOW_NAME = '^Minecraft';

/**
 * The xdotool commands for one key press: find the client's visible window, then (in one xdotool process, so the
 * order is kept) give it the input focus and press and release the key through XTEST, as a keyboard would.
 */
export function keyPressCommands(key, window = null) {
  if (!Object.hasOwn(KEYS, key))
    throw new Error(`Unknown key ${JSON.stringify(key)}; use one of ${Object.keys(KEYS)}.`);
  return {
    search: ['xdotool', 'search', '--onlyvisible', '--name', WINDOW_NAME],
    press: window ? ['xdotool', 'windowfocus', String(window), 'key', KEYS[key]] : null,
  };
}

const run = (execFileImpl, [command, ...args], timeout = 10_000) =>
  new Promise((resolve, reject) => {
    execFileImpl(command, args, { timeout, encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) {
        const reason =
          error.code === 'ENOENT'
            ? `${command} is not installed. The takeover scenarios press keys with xdotool on the Xvfb display; run them through scripts/boat-check.sh, which installs it.`
            : `${[command, ...args].join(' ')} failed: ${(stderr || error.message).trim()}`;
        reject(new Error(reason));
      } else resolve(String(stdout));
    });
  });

/** Presses one key in the Minecraft client window on $DISPLAY. Returns what was sent, for the results file. */
export async function pressKey(key, { env = process.env, execFileImpl = execFile } = {}) {
  if (!env.DISPLAY)
    throw new Error(
      'No X display ($DISPLAY is unset). The takeover scenarios press keys on the headless client under Xvfb; run them through scripts/boat-check.sh.',
    );
  const { search } = keyPressCommands(key);
  let found;
  try {
    found = await run(execFileImpl, search);
  } catch (error) {
    // xdotool search exits 1 when no window matches.
    if (/not installed/.test(error.message)) throw error;
    found = '';
  }
  const window = found.split(/\s+/).find(Boolean);
  if (!window) throw new Error(`No visible window titled ${WINDOW_NAME} on display ${env.DISPLAY}.`);
  const { press } = keyPressCommands(key, window);
  await run(execFileImpl, press);
  return { key, keysym: KEYS[key], window, display: env.DISPLAY };
}

/**
 * Starts a repo CLI command as its own process (the "second terminal"), so a scenario can suspend it (SIGSTOP),
 * resume it, or kill it outright. `exited` resolves with the exit status and output.
 */
export function startCli(args, { bridge, spawnImpl = spawn } = {}) {
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
  const exited = new Promise((resolve) => {
    child.once('error', (error) => resolve({ code: null, signal: null, stdout, stderr: `${stderr}${error.message}` }));
    child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
  const send = (signal) => {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  };
  return {
    pid: child.pid,
    exited,
    output: () => ({ stdout, stderr }),
    suspend: () => send('SIGSTOP'),
    resume: () => send('SIGCONT'),
    kill: () => send('SIGKILL'),
    async stop() {
      send('SIGCONT');
      send('SIGTERM');
      const timer = setTimeout(() => send('SIGKILL'), 5000);
      try {
        return await exited;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * A loopback stand-in for Ollama's /api/chat. Every request is held until `answer()` (or `close()`), then gets the
 * next scripted decision, so the agent CLI sits in its model-inference wait while a scenario changes the game.
 */
export async function startFakeModel(decisions, { host = '127.0.0.1' } = {}) {
  let requests = 0;
  let release;
  const answered = new Promise((resolve) => {
    release = resolve;
  });
  const server = createServer((request, response) => {
    if (request.method !== 'POST' || request.url !== '/api/chat') {
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end('{"error":"not found"}');
      return;
    }
    request.resume();
    request.once('end', async () => {
      const index = requests++;
      await answered;
      const decision = decisions[Math.min(index, decisions.length - 1)];
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({
          model: 'scripted-acceptance-planner',
          message: { role: 'assistant', content: JSON.stringify(decision) },
          done: true,
        }),
      );
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, resolve);
  });
  return {
    url: `http://${host}:${server.address().port}`,
    requests: () => requests,
    answer: () => release(),
    async close() {
      release();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
