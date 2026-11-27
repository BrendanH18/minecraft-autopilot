// Process helpers for the Fabric takeover scenarios: real key presses, clicks and typing in the client window
// (xdotool on the Xvfb display), a second CLI process that can be suspended or killed, and a local stand-in for Ollama that holds a
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

/** The client's visible window on $DISPLAY (the first match). */
async function findWindow(env, execFileImpl) {
  if (!env.DISPLAY)
    throw new Error(
      'No X display ($DISPLAY is unset). The takeover scenarios press keys on the headless client under Xvfb; run them through scripts/boat-check.sh.',
    );
  let found;
  try {
    found = await run(execFileImpl, keyPressCommands('f8').search);
  } catch (error) {
    // xdotool search exits 1 when no window matches.
    if (/not installed/.test(error.message)) throw error;
    found = '';
  }
  const window = found.split(/\s+/).find(Boolean);
  if (!window) throw new Error(`No visible window titled ${WINDOW_NAME} on display ${env.DISPLAY}.`);
  return window;
}

/** Presses one key in the Minecraft client window on $DISPLAY. Returns what was sent, for the results file. */
export async function pressKey(key, { env = process.env, execFileImpl = execFile } = {}) {
  const window = await findWindow(env, execFileImpl);
  const { press } = keyPressCommands(key, window);
  await run(execFileImpl, press);
  return { key, keysym: KEYS[key], window, display: env.DISPLAY };
}

/**
 * Minecraft's automatic GUI scale for a window (Window.calculateScaleFactor with guiScale 0, which the runner's
 * options.txt leaves as is): the largest factor that keeps the scaled screen at least 320 × 240. 854 × 480 gives 2.
 */
export function guiScale(width, height) {
  let scale = 1;
  while (
    scale < width &&
    scale < height &&
    Math.floor(width / (scale + 1)) >= 320 &&
    Math.floor(height / (scale + 1)) >= 240
  )
    scale++;
  return scale;
}

/**
 * The window pixel at the centre of the server list's Direct Connection button. Minecraft 1.21.1 lays the list's
 * buttons out as two 308-wide rows (20 high, 4 apart) centred in the bottom 64 scaled pixels. Direct Connection is
 * the middle of the top row (Join Server, Direct Connection, Add Server), so it is centred across the screen and its
 * centre is 44 scaled pixels above the bottom. The button is 100 × 20 scaled, so a pixel or two of rounding is safe.
 */
export function directConnectionPoint({ width, height }) {
  const scale = guiScale(width, height);
  const scaledWidth = Math.ceil(width / scale);
  const scaledHeight = Math.ceil(height / scale);
  return { x: Math.floor(scaledWidth / 2) * scale, y: (scaledHeight - 44) * scale, scale };
}

/** Points a scenario may click, each computed from the client window's size. */
export const CLICK_TARGETS = Object.freeze({ 'direct-connection': directConnectionPoint });

/** `xdotool getwindowgeometry --shell` output → { width, height }. */
export function parseWindowGeometry(text) {
  const value = (name) => Number(new RegExp(`^${name}=(\\d+)$`, 'm').exec(String(text))?.[1]);
  const width = value('WIDTH');
  const height = value('HEIGHT');
  if (!(width > 0 && height > 0)) throw new Error(`Could not read the client window size from: ${String(text).trim()}`);
  return { width, height };
}

/**
 * The xdotool commands to read the window's size and to left-click a window-relative point (focus, move, click in
 * one xdotool process, so the order is kept).
 */
export function clickCommands(window, point = null) {
  const id = String(window);
  return {
    geometry: ['xdotool', 'getwindowgeometry', '--shell', id],
    click: point
      ? ['xdotool', 'windowfocus', id, 'mousemove', '--window', id, String(point.x), String(point.y), 'click', '1']
      : null,
  };
}

/** The xdotool command that selects all in the focused text field (Ctrl+A) and types `text` over it. */
export function typeCommand(window, text) {
  if (!/^[\x20-\x7e]+$/.test(String(text)))
    throw new Error(`Only printable ASCII can be typed, got ${JSON.stringify(text)}.`);
  // `type` takes every remaining argument as text, so it comes last.
  return ['xdotool', 'windowfocus', String(window), 'key', 'ctrl+a', 'type', '--delay', '50', String(text)];
}

/** Left-clicks a named point (CLICK_TARGETS) in the client window. Returns what was clicked, for the results file. */
export async function clickTarget(target, { env = process.env, execFileImpl = execFile } = {}) {
  if (!Object.hasOwn(CLICK_TARGETS, target))
    throw new Error(`Unknown click target ${JSON.stringify(target)}; use one of ${Object.keys(CLICK_TARGETS)}.`);
  const window = await findWindow(env, execFileImpl);
  const size = parseWindowGeometry(await run(execFileImpl, clickCommands(window).geometry));
  const point = CLICK_TARGETS[target](size);
  await run(execFileImpl, clickCommands(window, point).click);
  return { target, window, size, point, display: env.DISPLAY };
}

/** Types `text` into the client's focused text field, replacing what it held. */
export async function typeText(text, { env = process.env, execFileImpl = execFile } = {}) {
  typeCommand('0', text);
  const window = await findWindow(env, execFileImpl);
  await run(execFileImpl, typeCommand(window, text), 20_000);
  return { typed: text, window, display: env.DISPLAY };
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
