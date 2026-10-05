import mineflayer from 'mineflayer';
import pathfinderPackage from 'mineflayer-pathfinder';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dataDirectory, writePrivateJson } from './config.js';
import { OperationGate } from './operation-gate.js';

const { pathfinder, Movements, goals } = pathfinderPackage;
const COLLECT_BLOCKS = new Set(['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log', 'cherry_log', 'mangrove_log', 'dirt', 'cobblestone', 'sand']);
const SAFE_FOOD = new Set(['bread', 'apple', 'golden_carrot', 'carrot', 'baked_potato', 'cooked_beef', 'cooked_porkchop', 'cooked_chicken', 'cooked_mutton', 'cooked_rabbit', 'cooked_cod', 'cooked_salmon', 'melon_slice', 'beetroot']);
const HOSTILES = new Set(['zombie', 'husk', 'drowned', 'skeleton', 'stray', 'wither_skeleton', 'creeper', 'spider', 'cave_spider', 'endermite', 'silverfish', 'witch', 'pillager', 'vindicator', 'evoker', 'ravager', 'guardian', 'elder_guardian', 'blaze', 'ghast', 'magma_cube', 'slime', 'phantom', 'warden']);

export class MineflayerDriver {
  constructor(bot, options, homes, homesFile) {
    this.bot = bot;
    this.options = options;
    this.homes = homes;
    this.homesFile = homesFile;
    this.connected = true;
    this.lastError = null;
    this.survival = 'Ready';
    this.activeAction = false;
    this.idleController = null;
    this.idleTask = null;
    this.lastRetreat = 0;
    this.operations = new OperationGate();
    this.controlController = null;
    this.controlIdentity = null;
    this.movements = new Movements(bot);
    this.movements.canDig = false;
    this.movements.allow1by1towers = false;
    this.movements.allowParkour = false;
    this.movements.allowSprinting = false;
    bot.pathfinder.setMovements(this.movements);
    bot.on('end', reason => { this.connected = false; this.lastError = String(reason || 'Disconnected'); this.controlController?.abort(new Error(this.lastError)); });
    bot.on('kicked', reason => { this.connected = false; this.lastError = typeof reason === 'string' ? reason : JSON.stringify(reason); this.controlController?.abort(new Error('Disconnected.')); });
    bot.on('error', error => { this.lastError = error.message; });
    bot.on('death', () => this.controlController?.abort(new Error('Player died.')));
    bot.on('game', () => {
      if (this.controlIdentity && this.identity() !== this.controlIdentity) this.controlController?.abort(new Error('World or dimension changed.'));
    });
  }

  static async connect(options, { log = console.error, timeoutMs = 120_000, storageDirectory = dataDirectory, signal } = {}) {
    signal?.throwIfAborted();
    const profilesFolder = join(storageDirectory, 'auth');
    await mkdir(profilesFolder, { recursive: true, mode: 0o700 });
    const bot = mineflayer.createBot({
      host: options.host, port: options.port, username: options.account, auth: options.auth,
      version: options.version, profilesFolder,
      respawn: false,
      onMsaCode: code => log(`Microsoft sign-in: open ${code.verification_uri} and enter ${code.user_code}`),
    });
    bot.loadPlugin(pathfinder);
    // Keep error listeners installed throughout authentication and shutdown.
    bot.on('error', error => log(`Minecraft connection: ${error.message}`));
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => finish(new Error('Server connection timed out.')), timeoutMs);
        const onSpawn = () => finish();
        const onError = error => finish(error);
        const onEnd = reason => finish(new Error(`Disconnected before spawning: ${reason}`));
        const onKicked = reason => finish(new Error(`Server rejected the connection: ${JSON.stringify(reason)}`));
        const onAbort = () => finish(signal.reason);
        function finish(error) {
          clearTimeout(timer);
          bot.off('spawn', onSpawn); bot.off('error', onError); bot.off('end', onEnd); bot.off('kicked', onKicked);
          signal?.removeEventListener('abort', onAbort);
          if (error) reject(error); else resolve();
        }
        bot.once('spawn', onSpawn); bot.once('error', onError); bot.once('end', onEnd); bot.once('kicked', onKicked);
        signal?.addEventListener('abort', onAbort, { once: true });
        if (signal?.aborted) onAbort();
      });
      const homesFile = join(storageDirectory, 'server-homes.json');
      let homes = {};
      try { homes = JSON.parse(await readFile(homesFile, 'utf8')); } catch {}
      return new MineflayerDriver(bot, options, homes, homesFile);
    } catch (error) { bot.quit(); throw error; }
  }

  identity() { return `${this.options.host}:${this.options.port}|${this.bot.player?.uuid || this.bot._client.uuid}|${this.bot.game.dimension}`; }
  dimension() { const dimension = this.bot.game.dimension; return dimension?.includes(':') ? dimension : `minecraft:${dimension}`; }
  healthState() { return { connected: this.connected, player: { health: this.bot.health } }; }
  isBusy() { return this.activeAction || !!this.idleTask || this.operations.busy; }

  setControlled(controlled) {
    clearInterval(this.idleTimer);
    if (!controlled) {
      this.controlController?.abort(new Error('Control released.'));
      this.controlController = null;
      this.controlIdentity = null;
      this.idleController?.abort(new Error('Control released.'));
      return;
    }
    this.controlController = new AbortController();
    this.controlIdentity = this.identity();
    this.idleTimer = setInterval(() => {
      if (!this.controlController || this.controlController.signal.aborted || this.identity() !== this.controlIdentity) return;
      if (this.isBusy() || !this.connected || this.bot.health <= 0) return;
      const controller = this.idleController = new AbortController();
      const signal = AbortSignal.any([controller.signal, this.controlController.signal]);
      const home = this.homes[this.identity()];
      let behavior;
      if (this.bot.food <= 16 && this.bot.inventory.items().some(item => SAFE_FOOD.has(item.name))) {
        this.survival = 'Eating'; behavior = () => this.eat(signal);
      } else if (this.bot.health <= 8 && home && Date.now() - this.lastRetreat > 10_000) {
        this.lastRetreat = Date.now(); this.survival = 'Low health: retreating home';
        behavior = () => this.goTo(home, AbortSignal.any([signal, AbortSignal.timeout(60_000)]));
      }
      if (!behavior) return;
      this.idleTask = Promise.resolve().then(() => { signal.throwIfAborted(); return behavior(); }).catch(error => {
        if (!signal.aborted) this.survival = `Survival response failed: ${error.message}`;
      }).finally(() => { this.idleTask = null; this.idleController = null; });
    }, 250);
    this.idleTimer.unref();
  }

  observe() {
    const bot = this.bot;
    if (!this.connected || !bot.entity) return { backend: 'mineflayer', connected: false, paused: false, error: this.lastError, player: null };
    const blockIds = [...COLLECT_BLOCKS].map(name => bot.registry.blocksByName[name]?.id).filter(id => id !== undefined);
    const positions = bot.findBlocks({ matching: blockIds, maxDistance: 16, count: 24 });
    return {
      backend: 'mineflayer', connected: true, paused: false, survival: this.survival, recovering: !!this.idleTask,
      player: { name: bot.username, uuid: bot.player?.uuid || bot._client.uuid, health: bot.health, hunger: bot.food,
        dimension: this.dimension(), position: { x: bot.entity.position.x, y: bot.entity.position.y, z: bot.entity.position.z } },
      inventory: bot.inventory.items().map(item => ({ slot: item.slot, name: `minecraft:${item.name}`, count: item.count })),
      home: this.homes[this.identity()] || null,
      threats: Object.values(bot.entities).filter(entity => entity.position && HOSTILES.has(entity.name) && entity.position.distanceTo(bot.entity.position) <= 16)
        .slice(0, 16).map(entity => ({ type: `minecraft:${entity.name}`, distance: entity.position.distanceTo(bot.entity.position) })),
      blocks: positions.map(position => ({ name: `minecraft:${bot.blockAt(position).name}`, x: position.x, y: position.y, z: position.z })),
    };
  }

  stop() {
    this.bot.pathfinder.setGoal(null);
    this.bot.clearControlStates();
    this.bot.deactivateItem();
    this.bot.stopDigging();
  }

  cancelActivities(message) {
    this.idleController?.abort(new Error(message));
    this.stop();
  }

  async abortable(operation, signal) {
    return this.operations.run(operation, signal, () => this.stop());
  }

  async eat(signal) {
    if (this.bot.food >= 20) return;
    const food = this.bot.inventory.items().find(item => SAFE_FOOD.has(item.name));
    if (!food) throw new Error('No supported food in inventory.');
    this.stop();
    await this.abortable(() => this.bot.equip(food, 'hand'), signal);
    await this.abortable(() => this.bot.consume(), signal);
  }

  async execute(action, { signal, onProgress }) {
    signal.throwIfAborted();
    if (this.isBusy()) throw new Error('Previous activity is still running or stopping; wait before acting.');
    this.activeAction = true;
    const scopedSignal = this.controlController ? AbortSignal.any([signal, this.controlController.signal]) : signal;
    const identity = this.identity();
    const local = new AbortController();
    const combined = AbortSignal.any([scopedSignal, local.signal]);
    let reflexBusy = false;
    let eatingTask = null;
    let interruptedForSurvival = false;
    let interruptedForFood = false;
    const check = async () => {
      if (reflexBusy || scopedSignal.aborted || local.signal.aborted) return;
      if (this.identity() !== identity) { local.abort(new Error('World or dimension changed.')); return; }
      if (this.bot.health <= 8 && action.type !== 'eat') {
        interruptedForSurvival = true;
        local.abort(new Error('Low health: interrupted for survival.'));
        return;
      }
      if (this.bot.food <= 16 && action.type !== 'eat' && this.bot.inventory.items().some(item => SAFE_FOOD.has(item.name))) {
        reflexBusy = true;
        interruptedForFood = true;
        local.abort(new Error('Interrupted to eat.'));
        eatingTask = this.eat(scopedSignal).finally(() => { reflexBusy = false; });
        // Observed below; prevent an unhandled rejection while the action unwinds.
        eatingTask.catch(() => {});
      }
    };
    const guard = setInterval(() => { check().catch(error => local.abort(error)); }, 250);
    try {
      await this.perform(action, { signal: combined, onProgress });
      return { message: 'Completed.' };
    } catch (error) {
      if (interruptedForFood && !scopedSignal.aborted) {
        clearInterval(guard);
        await eatingTask;
        this.survival = 'Ate food; replan from current state';
        // Restart from the current inventory/position without duplicating a collection quota.
        throw new Error('Interrupted to eat. Food consumed; replan from fresh state.');
      }
      if (interruptedForSurvival && !scopedSignal.aborted) {
        clearInterval(guard);
        this.stop();
        const home = this.homes[identity];
        if (home) {
          this.survival = 'Low health: retreating home'; onProgress(this.survival);
          const retreatSignal = AbortSignal.any([scopedSignal, AbortSignal.timeout(60_000)]);
          await this.goTo(home, retreatSignal).catch(retreatError => { if (scopedSignal.aborted) throw scopedSignal.reason; this.survival = `Retreat failed: ${retreatError.message}`; });
        } else this.survival = 'Low health; no saved shelter';
        throw new Error('Action interrupted for survival. Check health and shelter before continuing.');
      }
      throw error;
    } finally { clearInterval(guard); if (!eatingTask) this.stop(); this.activeAction = false; }
  }

  async goTo(position, signal) {
    await this.abortable(() => this.bot.pathfinder.goto(new goals.GoalNear(Math.floor(position.x), Math.floor(position.y), Math.floor(position.z), 1)), signal);
  }

  async perform(action, { signal, onProgress }) {
    switch (action.type) {
      case 'set_home':
        this.homes[this.identity()] = { x: this.bot.entity.position.x, y: this.bot.entity.position.y, z: this.bot.entity.position.z };
        await writePrivateJson(this.homesFile, this.homes); return;
      case 'home': {
        const home = this.homes[this.identity()];
        if (!home) throw new Error('No home saved for this server, player, and dimension.');
        await this.goTo(home, signal); return;
      }
      case 'goto': await this.goTo(action, signal); return;
      case 'eat': await this.eat(signal); return;
      case 'wait': await delay(action.seconds * 1000, undefined, { signal }); return;
      case 'collect': {
        const name = action.block.replace('minecraft:', '');
        if (!COLLECT_BLOCKS.has(name)) throw new Error(`Supported collection targets: ${[...COLLECT_BLOCKS].join(', ')}`);
        const blockId = this.bot.registry.blocksByName[name]?.id;
        if (blockId === undefined) throw new Error(`Block ${name} is unavailable in this Minecraft version.`);
        const count = () => this.bot.inventory.items().filter(item => item.name === name).reduce((sum, item) => sum + item.count, 0);
        const target = count() + action.count;
        const failed = new Set();
        while (count() < target) {
          signal.throwIfAborted();
          const positions = this.bot.findBlocks({ matching: blockId, maxDistance: 48, count: 64 });
          positions.sort((a, b) => a.distanceTo(this.bot.entity.position) - b.distanceTo(this.bot.entity.position));
          const position = positions.find(pos => !failed.has(pos.toString()));
          if (!position) throw new Error('No reachable matching blocks remain in loaded chunks.');
          try {
            await this.abortable(() => this.bot.pathfinder.goto(new goals.GoalGetToBlock(position.x, position.y, position.z)), signal);
            const block = this.bot.blockAt(position);
            if (!block || block.type !== blockId) continue;
            const tool = this.bot.pathfinder.bestHarvestTool(block);
            if (tool) await this.abortable(() => this.bot.equip(tool, 'hand'), signal);
            if (!this.bot.canDigBlock(block)) { failed.add(position.toString()); continue; }
            await this.abortable(() => this.bot.dig(block), signal);
            await this.goTo(position, signal);
            await delay(750, undefined, { signal });
            onProgress(`Inventory: ${count()}/${target}`);
          } catch (error) { if (signal.aborted) throw signal.reason; failed.add(position.toString()); }
        }
        return;
      }
    }
  }

  close() {
    this.closing ??= (async () => {
      this.setControlled(false); this.stop();
      if (this.connected) {
        await new Promise(resolve => {
          const timer = setTimeout(resolve, 2000);
          this.bot.once('end', () => { clearTimeout(timer); resolve(); });
          this.bot.quit('Agent bridge stopped.');
        });
      }
      await this.idleTask;
    })();
    return this.closing;
  }
}
