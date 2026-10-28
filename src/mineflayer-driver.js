import mineflayer from 'mineflayer';
import pathfinderPackage from 'mineflayer-pathfinder';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dataDirectory, writePrivateJson } from './config.js';
import { Vec3 } from 'vec3';
import { OperationGate } from './operation-gate.js';

const { pathfinder, Movements, goals } = pathfinderPackage;
const COLLECT_BLOCKS = new Set(['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log', 'cherry_log', 'mangrove_log', 'dirt', 'cobblestone', 'sand']);
const SAFE_FOOD = new Set(['bread', 'apple', 'golden_carrot', 'carrot', 'baked_potato', 'cooked_beef', 'cooked_porkchop', 'cooked_chicken', 'cooked_mutton', 'cooked_rabbit', 'cooked_cod', 'cooked_salmon', 'melon_slice', 'beetroot']);
const CONTAINERS = new Set(['chest', 'trapped_chest', 'barrel']);
const CLOCKWISE = { north: 'east', east: 'south', south: 'west', west: 'north' };
const OFFSETS = { north: [0, 0, -1], east: [1, 0, 0], south: [0, 0, 1], west: [-1, 0, 0] };
const HOSTILES = new Set(['zombie', 'husk', 'drowned', 'skeleton', 'stray', 'wither_skeleton', 'creeper', 'spider', 'cave_spider', 'endermite', 'silverfish', 'witch', 'pillager', 'vindicator', 'evoker', 'ravager', 'guardian', 'elder_guardian', 'blaze', 'ghast', 'magma_cube', 'slime', 'phantom', 'warden']);

export class MineflayerDriver {
  constructor(bot, options, homes, homesFile) {
    this.bot = bot;
    this.options = options;
    this.homes = homes;
    this.homesFile = homesFile;
    // Last contents this session read from each opened container, per world/player/dimension.
    this.containers = {};
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
    // Collection already permits breaking blocks; it may dig back out of the pits it creates.
    this.collectMovements = new Movements(bot);
    Object.assign(this.collectMovements, { allow1by1towers: false, allowParkour: false, allowSprinting: false });
    bot.on('end', reason => { this.connected = false; this.lastError = String(reason || 'Disconnected'); this.controlController?.abort(new Error(this.lastError)); });
    bot.on('kicked', reason => { this.connected = false; this.lastError = typeof reason === 'string' ? reason : JSON.stringify(reason); this.controlController?.abort(new Error('Disconnected.')); });
    bot.on('error', error => { this.lastError = error.message; });
    bot.on('death', () => this.controlController?.abort(new Error('Player died.')));
    this.containerTimeoutMs = 5000;
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
      logErrors: false, // Logged below to stderr; mineflayer would print raw errors to stdout.
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
        // Mineflayer never emits spawn for a character that joins dead, and this bot does not respawn on its own.
        const onDeath = () => finish(new Error('This character is dead. Respawn it in your regular Minecraft client, disconnect, then try again.'));
        function finish(error) {
          clearTimeout(timer);
          bot.off('spawn', onSpawn); bot.off('error', onError); bot.off('end', onEnd); bot.off('kicked', onKicked); bot.off('death', onDeath);
          signal?.removeEventListener('abort', onAbort);
          if (error) reject(error); else resolve();
        }
        bot.once('spawn', onSpawn); bot.once('error', onError); bot.once('end', onEnd); bot.once('kicked', onKicked); bot.once('death', onDeath);
        signal?.addEventListener('abort', onAbort, { once: true });
        if (signal?.aborted) onAbort();
      });
      const homesFile = join(storageDirectory, 'server-homes.json');
      let homes = {};
      try { homes = JSON.parse(await readFile(homesFile, 'utf8')); } catch {}
      return new MineflayerDriver(bot, options, homes, homesFile);
    } catch (error) {
      // Ending an already closed connection arms a 30-second close timer that keeps the CLI alive.
      if (!bot._client.ended) bot.quit();
      throw error;
    }
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
      this.idleTask = Promise.resolve().then(() => { signal.throwIfAborted(); return behavior(); }).then(() => { this.survival = 'Ready'; }, error => {
        this.survival = signal.aborted ? 'Survival response stopped.' : `Survival response failed: ${error.message}`;
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
      containers: this.observeContainers(),
    };
  }

  // A double chest is one inventory; key it by its lower half so its contents are never counted twice.
  containerPosition(position) {
    const block = this.bot.blockAt(position);
    const { facing, type } = block?.getProperties?.() || {};
    if (!CLOCKWISE[facing] || !['left', 'right'].includes(type)) return position;
    const direction = type === 'left' ? CLOCKWISE[facing] : Object.keys(CLOCKWISE).find(key => CLOCKWISE[key] === facing);
    const partner = position.offset(...OFFSETS[direction]);
    if (this.bot.blockAt(partner)?.name !== block.name) return position;
    return partner.x < position.x || partner.z < position.z ? partner : position;
  }

  nearbyContainers() {
    const ids = [...CONTAINERS].map(name => this.bot.registry.blocksByName[name]?.id).filter(id => id !== undefined);
    const found = new Map();
    for (const position of this.bot.findBlocks({ matching: ids, maxDistance: 16, count: 32 })) {
      const key = this.containerPosition(position);
      if (!found.has(key.toString())) found.set(key.toString(), { position: key, name: this.bot.blockAt(key).name });
    }
    return [...found.values()].sort((a, b) => a.position.distanceTo(this.bot.entity.position) - b.position.distanceTo(this.bot.entity.position));
  }

  observeContainers() {
    const known = this.containers[this.identity()] || {};
    // Forget a container that was broken or replaced; unloaded chunks (null) keep their last contents.
    for (const [key, record] of Object.entries(known)) {
      const block = this.bot.blockAt(new Vec3(record.x, record.y, record.z));
      if (block && `minecraft:${block.name}` !== record.name) delete known[key];
    }
    const unopened = this.nearbyContainers().filter(({ position }) => !known[position.toString()]).slice(0, 8)
      .map(({ position, name }) => ({ name: `minecraft:${name}`, x: position.x, y: position.y, z: position.z, items: null }));
    return [...Object.values(known).map(record => structuredClone(record)), ...unopened];
  }

  recordContainer(position, name, window) {
    const items = {};
    for (const item of window.containerItems()) items[`minecraft:${item.name}`] = (items[`minecraft:${item.name}`] || 0) + item.count;
    const contents = Object.entries(items).map(([itemName, count]) => ({ name: itemName, count }));
    const known = this.containers[this.identity()] ??= {};
    const previous = known[position.toString()];
    // firstSeen is the contents before this session's first deposit, a baseline for independent verification.
    known[position.toString()] = { name: `minecraft:${name}`, x: position.x, y: position.y, z: position.z, items: contents, firstSeen: previous?.firstSeen ?? contents };
  }

  // Mineflayer cannot cancel an opening, and a blocked lid never answers, so stop waiting rather than hold the operation gate.
  // A window the server opens late performs no clicks, and the next opening replaces it.
  async openContainer(block) {
    let timer;
    try {
      return await Promise.race([this.bot.openContainer(block), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('The container did not open; something may be blocking its lid.')), this.containerTimeoutMs);
      })]);
    } finally { clearTimeout(timer); }
  }

  stop() {
    this.bot.pathfinder.setGoal(null);
    this.bot.clearControlStates();
    // clearControlStates leaves a pressed jump queued for the next physics tick.
    this.bot.jumpQueued = false;
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
      if (this.bot.food <= 16 && action.type !== 'eat' && this.bot.inventory.items().some(item => SAFE_FOOD.has(item.name))) {
        reflexBusy = true;
        interruptedForFood = true;
        local.abort(new Error('Interrupted to eat.'));
        eatingTask = this.eat(scopedSignal).finally(() => { reflexBusy = false; });
        // Observed below; prevent an unhandled rejection while the action unwinds.
        eatingTask.catch(() => {});
        return;
      }
      // Eat first when possible: health cannot regenerate while hungry, so retreating alone repeats forever.
      if (this.bot.health <= 8 && action.type !== 'eat') {
        interruptedForSurvival = true;
        local.abort(new Error('Low health: interrupted for survival.'));
      }
    };
    const guard = setInterval(() => { check().catch(error => local.abort(error)); }, 250);
    try {
      return { message: await this.perform(action, { signal: combined, onProgress }) || 'Completed.' };
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
          await this.goTo(home, retreatSignal, action.type === 'collect' ? this.collectMovements : this.movements).catch(retreatError => { if (scopedSignal.aborted) throw scopedSignal.reason; this.survival = `Retreat failed: ${retreatError.message}`; });
        } else this.survival = 'Low health; no saved shelter';
        throw new Error('Action interrupted for survival. Check health and shelter before continuing.');
      }
      // timers/promises rejects with a generic AbortError; report why control ended (e.g. death) instead.
      throw scopedSignal.aborted ? scopedSignal.reason : error;
    } finally { clearInterval(guard); if (!eatingTask) this.stop(); this.activeAction = false; }
  }

  async goTo(position, signal, movements = this.movements) {
    this.bot.pathfinder.setMovements(movements);
    try {
      const goal = new goals.GoalNear(Math.floor(position.x), Math.floor(position.y), Math.floor(position.z), 1);
      // Physics can wedge the bot against a block edge (x = 32.3 beside a block ending at 32), and the pathfinder
      // then reports `stuck` forever. A hop in place frees it; fail after repeated stalls instead of waiting out the job.
      let lastStall = null;
      for (let hops = 0; ; hops++) {
        const stalled = new AbortController();
        const onReset = reason => {
          if (reason !== 'stuck') return;
          const { x, y, z } = this.bot.entity.position.floored();
          stalled.abort(new Error(`Navigation got stuck near ${x} ${y} ${z}.`));
        };
        this.bot.on('path_reset', onReset);
        try { await this.abortable(() => this.bot.pathfinder.goto(goal), AbortSignal.any([signal, stalled.signal])); break; }
        catch (error) {
          if (signal.aborted || !stalled.signal.aborted) throw error;
          // Stalls far apart are separate obstacles; only repeated stalls in one place fail the trip.
          const here = this.bot.entity.position.clone();
          if (lastStall && lastStall.distanceTo(here) > 2) hops = 0;
          lastStall = here;
          if (hops >= 2) throw error;
        }
        finally { this.bot.off('path_reset', onReset); }
        await this.abortable(async () => {
          this.bot.setControlState('jump', true);
          await delay(400, undefined, { signal });
          this.bot.clearControlStates();
          await delay(600, undefined, { signal });
        }, signal);
      }
      // mineflayer-pathfinder resolves goto when it finds no path segment, even if the goal is unreachable.
      // Apply the pathfinder's own arrival test.
      const current = this.bot.entity.position;
      if (!goal.isEnd(current.floored()) && !goal.isEnd(current.floored().offset(0, 1, 0))) {
        throw new Error(`Could not reach ${goal.x} ${goal.y} ${goal.z}; stopped ${current.distanceTo(position).toFixed(1)} blocks away.`);
      }
    } finally { if (movements !== this.movements) this.bot.pathfinder.setMovements(this.movements); }
  }

  async returnFromCollection(start, signal) {
    signal.throwIfAborted();
    if (start.distanceTo(this.bot.entity.position) <= 2) return true;
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(60_000)]);
    // Reserve time for digging out if walking stalls instead of failing promptly.
    for (const movements of [this.movements, this.collectMovements]) {
      const attempt = movements === this.movements ? AbortSignal.any([bounded, AbortSignal.timeout(20_000)]) : bounded;
      try { await this.goTo(start, attempt, movements); return true; }
      catch { signal.throwIfAborted(); if (bounded.aborted) break; }
    }
    return false;
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
      case 'deposit': return this.deposit(action, signal);
      case 'wait': await delay(action.seconds * 1000, undefined, { signal }); return;
      case 'collect': {
        const name = action.block.replace('minecraft:', '');
        if (!COLLECT_BLOCKS.has(name)) throw new Error(`Supported collection targets: ${[...COLLECT_BLOCKS].join(', ')}`);
        const blockId = this.bot.registry.blocksByName[name]?.id;
        if (blockId === undefined) throw new Error(`Block ${name} is unavailable in this Minecraft version.`);
        const harvestTools = this.bot.registry.blocksByName[name].harvestTools;
        const requireTool = () => {
          if (harvestTools && !this.bot.inventory.items().some(item => harvestTools[item.type])) throw new Error(`A suitable harvesting tool is required to collect ${name}; cobblestone needs a pickaxe.`);
        };
        requireTool();
        const count = () => this.bot.inventory.items().filter(item => item.name === name).reduce((sum, item) => sum + item.count, 0);
        const target = count() + action.count;
        const start = this.bot.entity.position.clone();
        const failed = new Set();
        let collectionError;
        try {
          while (count() < target) {
            signal.throwIfAborted();
            requireTool();
            const positions = this.bot.findBlocks({ matching: blockId, maxDistance: 48, count: 64 });
            positions.sort((a, b) => a.distanceTo(this.bot.entity.position) - b.distanceTo(this.bot.entity.position));
            const position = positions.find(pos => !failed.has(pos.toString()));
            if (!position) throw new Error('No reachable matching blocks remain in loaded chunks.');
            // A single block can stall the pathfinder for a minute or more; skip it and try another.
            const step = AbortSignal.any([signal, AbortSignal.timeout(20_000)]);
            try {
              await this.abortable(() => this.bot.pathfinder.goto(new goals.GoalGetToBlock(position.x, position.y, position.z)), step);
              const block = this.bot.blockAt(position);
              if (!block || block.type !== blockId) continue;
              const tool = this.bot.pathfinder.bestHarvestTool(block);
              if (tool) await this.abortable(() => this.bot.equip(tool, 'hand'), step);
              if (!this.bot.canDigBlock(block)) { failed.add(position.toString()); continue; }
              await this.abortable(() => this.bot.dig(block), step);
              // Walk toward the drop; a mined block above reach is not a failure, so still wait for pickup.
              await this.goTo(position, step).catch(error => { if (step.aborted) throw error; });
              await delay(750, undefined, { signal: step });
              onProgress(`Inventory: ${count()}/${target}`);
            } catch (error) { if (signal.aborted) throw signal.reason; failed.add(position.toString()); }
          }
        } catch (error) {
          // Handoff, death, survival interrupts, and deadlines must never start a recovery trip.
          signal.throwIfAborted();
          collectionError = error;
        }
        // Mining often digs downward; return so later navigation, which cannot dig, is not trapped in a pit.
        const moved = start.distanceTo(this.bot.entity.position) > 2;
        if (moved) onProgress(`${collectionError ? 'Collection failed' : 'Collected requested items'}; returning to where collection started.`);
        const returned = await this.returnFromCollection(start, signal);
        if (collectionError) throw new Error(`${collectionError.message} Inventory: ${count()}/${target}. ${returned ? 'Returned to the starting point.' : 'Could not return to the starting point.'}`);
        if (!returned) throw new Error(`Collected requested items (inventory: ${count()}/${target}), but could not return to the starting point.`);
        return moved ? 'Collected requested items and returned to the starting point.' : 'Collected requested items.';
      }
    }
  }

  async deposit(action, signal) {
    const name = action.item.replace('minecraft:', '');
    const type = this.bot.registry.itemsByName[name]?.id;
    if (type === undefined) throw new Error(`Unknown item ${name}.`);
    const held = () => this.bot.inventory.items().filter(item => item.name === name).reduce((sum, item) => sum + item.count, 0);
    const before = held();
    if (before === 0) throw new Error(`No ${name} in inventory to deposit.`);
    if (action.count > before) throw new Error(`Only ${before} ${name} in inventory; cannot deposit ${action.count}.`);
    const amount = action.count ?? before;
    const target = this.nearbyContainers()[0];
    if (!target) throw new Error('No chest or barrel within 16 blocks. Move near storage first.');
    const { position } = target;
    // Open from wherever the chest is in reach; a walk to an adjacent block can fail beside furniture and walls.
    const inReach = () => this.bot.entity.position.offset(0, 1.62, 0).distanceTo(position.offset(0.5, 0.5, 0.5)) <= 4;
    // The pathfinder can give up planning ("Took to long to decide path") after walking most of the way; judge by reach.
    for (let attempt = 0; attempt < 2 && !inReach(); attempt++) {
      await this.abortable(() => this.bot.pathfinder.goto(new goals.GoalGetToBlock(position.x, position.y, position.z)), signal)
        .catch(error => { if (signal.aborted) throw error; });
    }
    if (!inReach()) throw new Error(`Could not reach the ${target.name} at ${position.x} ${position.y} ${position.z}.`);
    const block = this.bot.blockAt(position);
    if (!block || !CONTAINERS.has(block.name)) throw new Error(`The container at ${position.x} ${position.y} ${position.z} is gone.`);
    let depositError;
    let deposited = 0;
    // Count from the container: after a failed click, leftovers sit on the cursor until the window closes.
    const stored = window => window.containerItems().filter(item => item.type === type).reduce((sum, item) => sum + item.count, 0);
    await this.abortable(async () => {
      const window = await this.openContainer(block);
      const initial = stored(window);
      try {
        this.recordContainer(position, block.name, window);
        // Move one stack per click sequence so handoff stops the transfer between stacks (16 for pearls, 1 for tools).
        const stack = this.bot.registry.items[type].stackSize;
        for (let remaining = amount; remaining > 0; remaining -= Math.min(stack, remaining)) {
          signal.throwIfAborted();
          await window.deposit(type, null, Math.min(stack, remaining));
        }
      } catch (error) { depositError = error; }
      finally {
        deposited = stored(window) - initial;
        this.recordContainer(position, block.name, window);
        window.close();
      }
    }, signal);
    const where = `${block.name} at ${position.x} ${position.y} ${position.z}`;
    if (depositError?.message === 'destination full') throw new Error(`The ${where} is full; deposited ${deposited} of ${amount} ${name}.`);
    if (depositError) throw depositError;
    return `Deposited ${deposited} ${name} into the ${where}.`;
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
