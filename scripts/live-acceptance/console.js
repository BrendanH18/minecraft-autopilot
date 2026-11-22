import { EventEmitter } from 'node:events';
import { parseDataReply, stripLogPrefix } from './nbt-parse.js';

export const READY = /^Done \(\d+(?:[.,]\d+)?s\)! For help, type "help"/;
export const VERSION = /^Starting minecraft server version (\S+)/;
export const STARTUP_FAILURES = [
  /You need to agree to the EULA/,
  /FAILED TO BIND TO PORT/,
  /Failed to start the minecraft server/,
  /Exception in server tick loop/,
];
// Only first lines of vanilla errors: the following `...<--[HERE]` line would otherwise fail the next command.
export const COMMAND_ERRORS = [
  /^Unknown or incomplete command/,
  /^Incorrect argument for command/,
  /^No (?:entity|player) was found/,
  /^That position is not loaded/,
  /^That position is out of this world/,
  /^The target block is not a block entity/,
  /^Found no elements matching /,
  /^Expected (?:whitespace|value|key|literal|integer|long|float|double|boolean|'|a |an )/,
  /^Invalid (?:integer|long|float|double|boolean|block|item|entity|position|UUID|name)/i,
  /^Unknown (?:block|item|effect|entity|game ?rule)/i,
  /^Can't insert /,
  /^Too many blocks in the specified area/,
  /^Only one (?:player|entity) is allowed/,
];
// Log noise such as "Can't keep up!" or "moved too quickly" is deliberately not an error pattern.
// Success (or harmless no-op) replies by command name, as printed by the vanilla 1.21.1 server.
export const REPLIES = {
  fill: /^(?:Successfully filled \d+ blocks?|No blocks were filled)/,
  setblock: /^(?:Changed the block at|Could not set the block)/,
  tp: /^Teleported /,
  teleport: /^Teleported /,
  give: /^Gave \d+ /,
  clear: /^(?:Removed \d+ item|No items were found on player)/,
  effect:
    /^(?:Applied effect|Removed every effect|Removed effect|Unable to apply this effect|Target has no effects|Couldn't remove)/,
  gamerule: /^Gamerule \S+ is (?:now|currently) set to/,
  difficulty: /^The difficulty (?:has been set to|did not change)/,
  time: /^Set the time to/,
  weather: /^(?:Set the weather to|Changing to)/,
  forceload: /force load/i,
  kill: /^(?:Killed |No entity was found)/,
  data: /has the following (?:block|entity) data:|^Modified (?:block|entity) data of|^Nothing changed/,
  list: /^There are \d+ of a max of \d+ players online/,
  gamemode: /^(?:Set .+ game mode to|Set own game mode to)/,
  summon: /^Summoned new /,
  'save-all': /^Saved the game/,
  // Only the test form (`execute if block ...` without `run`), whose reply is the test outcome.
  execute: /^Test (?:passed|failed)/,
};

export class CommandError extends Error {}

/**
 * Server console behind an injectable writer: feed stdout chunks with push(), send commands with command().
 * Commands are serialized so each reply belongs to the only outstanding command.
 */
export class ServerConsole extends EventEmitter {
  constructor({ write, maxLines = 5000, now = Date.now } = {}) {
    super();
    if (typeof write !== 'function') throw new Error('ServerConsole needs a write(text) function.');
    this.write = write;
    this.maxLines = maxLines;
    this.now = now;
    this.lines = [];
    this.partial = '';
    this.ended = null;
    this.queue = Promise.resolve();
    this.version = null;
    this.setMaxListeners(100);
  }

  push(chunk) {
    const parts = (this.partial + String(chunk)).split('\n');
    this.partial = parts.pop();
    for (const raw of parts) this.accept(raw);
  }

  accept(raw) {
    const message = stripLogPrefix(raw);
    if (!message.trim()) return;
    const version = VERSION.exec(message);
    if (version) this.version = version[1];
    const entry = { at: this.now(), message };
    this.lines.push(entry);
    if (this.lines.length > this.maxLines) this.lines.splice(0, this.lines.length - this.maxLines);
    this.emit('line', message, entry);
  }

  end(reason = 'Server console closed.') {
    if (this.partial) {
      this.accept(this.partial);
      this.partial = '';
    }
    this.ended ??= reason;
    this.emit('end', this.ended);
  }

  /** Resolves with the first line matching `match`; rejects on a `fail` pattern, timeout, abort, or end of output. */
  waitFor(match, { timeoutMs = 30_000, fail = [], history = false, signal, label = String(match) } = {}) {
    const matches = typeof match === 'function' ? match : (message) => match.test(message);
    return new Promise((resolve, reject) => {
      let timer;
      const finish = (error, value) => {
        clearTimeout(timer);
        this.off('line', onLine);
        this.off('end', onEnd);
        signal?.removeEventListener('abort', onAbort);
        if (error) reject(error);
        else resolve(value);
      };
      const onLine = (message) => {
        const failed = fail.find((pattern) => pattern.test(message));
        if (failed) return finish(new CommandError(message));
        if (matches(message)) finish(null, message);
      };
      const onEnd = (reason) => finish(new Error(`Server output ended while waiting for ${label}: ${reason}`));
      const onAbort = () => finish(signal.reason ?? new Error('Aborted.'));
      if (signal?.aborted) return onAbort();
      if (history)
        for (const { message } of this.lines) {
          if (fail.some((pattern) => pattern.test(message))) return finish(new CommandError(message));
          if (matches(message)) return finish(null, message);
        }
      if (this.ended) return onEnd(this.ended);
      timer = setTimeout(() => finish(new Error(`Timed out after ${timeoutMs} ms waiting for ${label}.`)), timeoutMs);
      this.on('line', onLine);
      this.on('end', onEnd);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  /** Waits for the vanilla "Done (…s)! For help" line, including one already printed. */
  ready({ timeoutMs = 300_000, signal } = {}) {
    return this.waitFor(READY, {
      timeoutMs,
      fail: STARTUP_FAILURES,
      history: true,
      signal,
      label: 'server readiness ("Done (")',
    });
  }

  /** Sends one console command and resolves with its reply line. */
  command(command, { ok, timeoutMs = 15_000, signal } = {}) {
    const text = String(command).trim().replace(/^\//, '');
    if (!text || /[\r\n]/.test(text))
      return Promise.reject(new Error(`Invalid console command ${JSON.stringify(command)}.`));
    // Dimension-scoped commands reply with the same output as the nested command.
    const verb = /^(?:execute in \S+ run )?(\S+)/.exec(text)[1];
    const expected = ok ?? REPLIES[verb];
    if (!expected) return Promise.reject(new Error(`No reply pattern is known for "${verb}"; pass { ok }.`));
    const run = async () => {
      // Subscribe before writing so a fast reply is never missed; accepted replies win over generic errors (kill → "No entity was found").
      const reply = this.waitFor(
        (message) => expected.test(message) || COMMAND_ERRORS.some((pattern) => pattern.test(message)),
        { timeoutMs, signal, label: `a reply to "${text}"` },
      );
      this.write(`${text}\n`);
      const message = await reply;
      if (!expected.test(message)) throw new CommandError(`"${text}" failed: ${message}`);
      return message;
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => {});
    return result;
  }

  /** `data get block X Y Z PATH`; a missing Items path is an empty container. */
  async blockData(x, y, z, path = 'Items', options) {
    try {
      return parseDataReply(await this.command(`data get block ${x} ${y} ${z} ${path}`, options)).value;
    } catch (error) {
      if (path === 'Items' && /Found no elements matching Items/.test(error.message)) return [];
      throw error;
    }
  }

  /** `data get entity NAME PATH` for an online player. */
  async entityData(name, path, options) {
    return parseDataReply(await this.command(`data get entity ${name} ${path}`, options)).value;
  }
}
