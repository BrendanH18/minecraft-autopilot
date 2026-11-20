import { randomUUID } from 'node:crypto';
import mineflayer from 'mineflayer';
import pathfinderPackage from 'mineflayer-pathfinder';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dataDirectory, writePrivateJson } from './config.js';
import { Vec3 } from 'vec3';
import { OperationGate } from './operation-gate.js';
import { RECIPES, craftsFor, describeMissing, planCraft } from './recipes.js';

const { pathfinder, Movements, goals } = pathfinderPackage;
const COLLECT_BLOCKS = new Set([
  'oak_log',
  'birch_log',
  'spruce_log',
  'jungle_log',
  'acacia_log',
  'dark_oak_log',
  'cherry_log',
  'mangrove_log',
  'dirt',
  'cobblestone',
  'sand',
]);
const SAFE_FOOD = new Set([
  'bread',
  'apple',
  'golden_carrot',
  'carrot',
  'baked_potato',
  'cooked_beef',
  'cooked_porkchop',
  'cooked_chicken',
  'cooked_mutton',
  'cooked_rabbit',
  'cooked_cod',
  'cooked_salmon',
  'melon_slice',
  'beetroot',
]);
const CONTAINERS = new Set(['chest', 'trapped_chest', 'barrel']);
const AIR = new Set(['air', 'cave_air', 'void_air']);
// Neighbours of the player's feet block tried for a crafting table, sides before corners.
const BESIDE = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
];
const CLOCKWISE = { north: 'east', east: 'south', south: 'west', west: 'north' };
const OFFSETS = { north: [0, 0, -1], east: [1, 0, 0], south: [0, 0, 1], west: [-1, 0, 0] };
// Contents of an open container window, one entry per item name.
function windowContents(window) {
  const items = {};
  for (const item of window.containerItems())
    items[`minecraft:${item.name}`] = (items[`minecraft:${item.name}`] || 0) + item.count;
  return Object.entries(items).map(([name, count]) => ({ name, count }));
}
// A deposit that reached an open window reports where it went, even when it fails, so items moved before the failure are attributable.
// A new error, so abort reasons shared with later actions never carry this container.
const withContainer = (error, container) =>
  container && error instanceof Error && !error.container
    ? Object.assign(new Error(error.message, { cause: error }), { container })
    : error;
// Room for an item in the 36 main slots of an open window. bot.inventory only catches up when the window closes.
function windowRoom(window, type, stackSize) {
  let room = 0;
  for (let slot = window.inventoryStart; slot < window.inventoryEnd; slot++) {
    const item = window.slots[slot];
    if (!item) room += stackSize;
    else if (item.type === type) room += Math.max(0, stackSize - item.count);
  }
  return room;
}
const HOSTILES = new Set([
  'zombie',
  'husk',
  'drowned',
  'skeleton',
  'stray',
  'wither_skeleton',
  'creeper',
  'spider',
  'cave_spider',
  'endermite',
  'silverfish',
  'witch',
  'pillager',
  'vindicator',
  'evoker',
  'ravager',
  'guardian',
  'elder_guardian',
  'blaze',
  'ghast',
  'magma_cube',
  'slime',
  'phantom',
  'warden',
]);

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
    bot.on('end', (reason) => {
      this.connected = false;
      this.lastError = String(reason || 'Disconnected');
      this.controlController?.abort(new Error(this.lastError));
    });
    bot.on('kicked', (reason) => {
      this.connected = false;
      this.lastError = typeof reason === 'string' ? reason : JSON.stringify(reason);
      this.controlController?.abort(new Error('Disconnected.'));
    });
    bot.on('error', (error) => {
      this.lastError = error.message;
    });
    bot.on('death', () => this.controlController?.abort(new Error('Player died.')));
    this.containerTimeoutMs = 5000;
    bot.on('game', () => {
      if (this.controlIdentity && this.identity() !== this.controlIdentity)
        this.controlController?.abort(new Error('World or dimension changed.'));
    });
  }

  static async connect(
    options,
    { log = console.error, timeoutMs = 120_000, storageDirectory = dataDirectory, signal } = {},
  ) {
    signal?.throwIfAborted();
    const profilesFolder = join(storageDirectory, 'auth');
    await mkdir(profilesFolder, { recursive: true, mode: 0o700 });
    const bot = mineflayer.createBot({
      host: options.host,
      port: options.port,
      username: options.account,
      auth: options.auth,
      version: options.version,
      profilesFolder,
      respawn: false,
      logErrors: false, // Logged below to stderr; mineflayer would print raw errors to stdout.
      onMsaCode: (code) => log(`Microsoft sign-in: open ${code.verification_uri} and enter ${code.user_code}`),
    });
    bot.loadPlugin(pathfinder);
    // Keep error listeners installed throughout authentication and shutdown.
    bot.on('error', (error) => log(`Minecraft connection: ${error.message}`));
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => finish(new Error('Server connection timed out.')), timeoutMs);
        const onSpawn = () => finish();
        const onError = (error) => finish(error);
        const onEnd = (reason) => finish(new Error(`Disconnected before spawning: ${reason}`));
        const onKicked = (reason) => finish(new Error(`Server rejected the connection: ${JSON.stringify(reason)}`));
        const onAbort = () => finish(signal.reason);
        // Mineflayer never emits spawn for a character that joins dead, and this bot does not respawn on its own.
        const onDeath = () =>
          finish(
            new Error(
              'This character is dead. Respawn it in your regular Minecraft client, disconnect, then try again.',
            ),
          );
        function finish(error) {
          clearTimeout(timer);
          bot.off('spawn', onSpawn);
          bot.off('error', onError);
          bot.off('end', onEnd);
          bot.off('kicked', onKicked);
          bot.off('death', onDeath);
          signal?.removeEventListener('abort', onAbort);
          if (error) reject(error);
          else resolve();
        }
        bot.once('spawn', onSpawn);
        bot.once('error', onError);
        bot.once('end', onEnd);
        bot.once('kicked', onKicked);
        bot.once('death', onDeath);
        signal?.addEventListener('abort', onAbort, { once: true });
        if (signal?.aborted) onAbort();
      });
      const homesFile = join(storageDirectory, 'server-homes.json');
      let homes = {};
      try {
        homes = JSON.parse(await readFile(homesFile, 'utf8'));
      } catch {}
      return new MineflayerDriver(bot, options, homes, homesFile);
    } catch (error) {
      // Ending an already closed connection arms a 30-second close timer that keeps the CLI alive.
      if (!bot._client.ended) bot.quit();
      throw error;
    }
  }

  identity() {
    return `${this.options.host}:${this.options.port}|${this.bot.player?.uuid || this.bot._client.uuid}|${this.bot.game.dimension}`;
  }
  dimension() {
    const dimension = this.bot.game.dimension;
    return dimension?.includes(':') ? dimension : `minecraft:${dimension}`;
  }
  healthState() {
    return { connected: this.connected, player: { health: this.bot.health } };
  }
  isBusy() {
    return this.activeAction || !!this.idleTask || this.operations.busy;
  }

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
      if (!this.controlController || this.controlController.signal.aborted || this.identity() !== this.controlIdentity)
        return;
      if (this.isBusy() || !this.connected || this.bot.health <= 0) return;
      const controller = (this.idleController = new AbortController());
      const signal = AbortSignal.any([controller.signal, this.controlController.signal]);
      const home = this.homes[this.identity()];
      let behavior;
      if (this.bot.food <= 16 && this.bot.inventory.items().some((item) => SAFE_FOOD.has(item.name))) {
        this.survival = 'Eating';
        behavior = () => this.eat(signal);
      } else if (this.bot.health <= 8 && home && Date.now() - this.lastRetreat > 10_000) {
        this.lastRetreat = Date.now();
        this.survival = 'Low health: retreating home';
        behavior = () => this.goTo(home, AbortSignal.any([signal, AbortSignal.timeout(60_000)]));
      }
      if (!behavior) return;
      this.idleTask = Promise.resolve()
        .then(() => {
          signal.throwIfAborted();
          return behavior();
        })
        .then(
          () => {
            this.survival = 'Ready';
          },
          (error) => {
            this.survival = signal.aborted
              ? 'Survival response stopped.'
              : `Survival response failed: ${error.message}`;
          },
        )
        .finally(() => {
          this.idleTask = null;
          this.idleController = null;
        });
    }, 250);
    this.idleTimer.unref();
  }

  observe() {
    const bot = this.bot;
    if (!this.connected || !bot.entity)
      return { backend: 'mineflayer', connected: false, paused: false, error: this.lastError, player: null };
    // Crafting tables are reported too, so a planner can see where table recipes will be crafted.
    const blockIds = [...COLLECT_BLOCKS, 'crafting_table']
      .map((name) => bot.registry.blocksByName[name]?.id)
      .filter((id) => id !== undefined);
    const positions = bot.findBlocks({ matching: blockIds, maxDistance: 16, count: 24 });
    return {
      backend: 'mineflayer',
      connected: true,
      paused: false,
      survival: this.survival,
      recovering: !!this.idleTask,
      player: {
        name: bot.username,
        uuid: bot.player?.uuid || bot._client.uuid,
        health: bot.health,
        hunger: bot.food,
        dimension: this.dimension(),
        position: { x: bot.entity.position.x, y: bot.entity.position.y, z: bot.entity.position.z },
      },
      inventory: bot.inventory
        .items()
        .map((item) => ({ slot: item.slot, name: `minecraft:${item.name}`, count: item.count })),
      home: this.homes[this.identity()] || null,
      threats: Object.values(bot.entities)
        .filter(
          (entity) =>
            entity.position && HOSTILES.has(entity.name) && entity.position.distanceTo(bot.entity.position) <= 16,
        )
        .slice(0, 16)
        .map((entity) => ({
          type: `minecraft:${entity.name}`,
          distance: entity.position.distanceTo(bot.entity.position),
          x: entity.position.x,
          y: entity.position.y,
          z: entity.position.z,
        })),
      blocks: positions.map((position) => ({
        name: `minecraft:${bot.blockAt(position).name}`,
        x: position.x,
        y: position.y,
        z: position.z,
      })),
      containers: this.observeContainers(),
    };
  }

  // A double chest is one inventory; key it by its lower half so its contents are never counted twice.
  containerPosition(position) {
    const block = this.bot.blockAt(position);
    const { facing, type } = block?.getProperties?.() || {};
    if (!CLOCKWISE[facing] || !['left', 'right'].includes(type)) return position;
    const direction =
      type === 'left' ? CLOCKWISE[facing] : Object.keys(CLOCKWISE).find((key) => CLOCKWISE[key] === facing);
    const partner = position.offset(...OFFSETS[direction]);
    if (this.bot.blockAt(partner)?.name !== block.name) return position;
    return partner.x < position.x || partner.z < position.z ? partner : position;
  }

  nearbyContainers() {
    const ids = [...CONTAINERS]
      .map((name) => this.bot.registry.blocksByName[name]?.id)
      .filter((id) => id !== undefined);
    const found = new Map();
    for (const position of this.bot.findBlocks({ matching: ids, maxDistance: 16, count: 32 })) {
      const key = this.containerPosition(position);
      if (!found.has(key.toString())) found.set(key.toString(), { position: key, name: this.bot.blockAt(key).name });
    }
    return [...found.values()].sort(
      (a, b) => a.position.distanceTo(this.bot.entity.position) - b.position.distanceTo(this.bot.entity.position),
    );
  }

  containerMembers(position) {
    const canonical = this.containerPosition(position);
    const { facing, type } = this.bot.blockAt(canonical)?.getProperties?.() || {};
    const members = [canonical];
    if (CLOCKWISE[facing] && ['left', 'right'].includes(type)) {
      const direction =
        type === 'left' ? CLOCKWISE[facing] : Object.keys(CLOCKWISE).find((key) => CLOCKWISE[key] === facing);
      const partner = canonical.offset(...OFFSETS[direction]);
      if (this.bot.blockAt(partner)?.name === this.bot.blockAt(canonical)?.name) members.push(partner);
    }
    return members.map(({ x, y, z }) => ({ x, y, z }));
  }

  normalizeContainers() {
    const identity = this.identity();
    const normalized = {};
    for (const [oldKey, record] of Object.entries(this.containers[identity] || {})) {
      const candidates = new Map();
      for (const member of record.members || [record]) {
        const at = new Vec3(member.x, member.y, member.z);
        const block = this.bot.blockAt(at);
        // Preserve unloaded members until the world can confirm whether the container survived.
        if (block && `minecraft:${block.name}` !== record.name) continue;
        const position = this.containerPosition(at);
        candidates.set(position.toString(), position);
      }
      for (const [key, position] of candidates) {
        const previous = normalized[key];
        const sources = [
          ...new Map(
            [...(previous?.sources || []), ...(record.sources || [])].map((source) => [source.id, source]),
          ).values(),
        ];
        const totals = new Map();
        for (const source of sources)
          for (const item of source.items) totals.set(item.name, (totals.get(item.name) || 0) + item.count);
        const firstSeen = [...totals].map(([name, count]) => ({ name, count }));
        const members = this.containerMembers(position);
        const changed = previous || key !== oldKey || JSON.stringify(members) !== JSON.stringify(record.members);
        // Sources track historical baseline stock; members describe only the inventories shared right now.
        normalized[key] = {
          ...record,
          x: position.x,
          y: position.y,
          z: position.z,
          sources,
          members,
          firstSeen,
          items: changed ? null : record.items,
        };
      }
    }
    this.containers[identity] = normalized;
    return normalized;
  }

  observeContainers() {
    const known = this.normalizeContainers();
    // Forget a container that was broken or replaced; unloaded chunks (null) keep their last contents.
    for (const [key, record] of Object.entries(known)) {
      const block = this.bot.blockAt(new Vec3(record.x, record.y, record.z));
      if (block && `minecraft:${block.name}` !== record.name) delete known[key];
    }
    const unopened = this.nearbyContainers()
      .filter(({ position }) => !known[position.toString()])
      .slice(0, 8)
      .map(({ position, name }) => ({
        name: `minecraft:${name}`,
        x: position.x,
        y: position.y,
        z: position.z,
        items: null,
      }));
    return [...Object.values(known).map((record) => structuredClone(record)), ...unopened];
  }

  recordContainer(position, name, window) {
    const contents = windowContents(window);
    const known = this.normalizeContainers();
    position = this.containerPosition(position);
    const previous = known[position.toString()];
    // firstSeen is the contents before this session's first deposit, a baseline for independent verification.
    known[position.toString()] = {
      name: `minecraft:${name}`,
      x: position.x,
      y: position.y,
      z: position.z,
      items: contents,
      firstSeen: previous?.firstSeen ?? contents,
      observedAt: Date.now(),
      sources: previous?.sources ?? [{ id: randomUUID(), items: contents }],
      members: this.containerMembers(position),
    };
  }

  // Mineflayer cannot cancel an opening, and a blocked lid never answers, so stop waiting rather than hold the operation gate.
  // A window the server opens late performs no clicks, and the next opening replaces it.
  async openContainer(block) {
    let timer;
    try {
      return await Promise.race([
        this.bot.openContainer(block),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('The container did not open; something may be blocking its lid.')),
            this.containerTimeoutMs,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
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
    const food = this.bot.inventory.items().find((item) => SAFE_FOOD.has(item.name));
    if (!food) throw new Error('No supported food in inventory.');
    this.stop();
    await this.abortable(() => this.bot.equip(food, 'hand'), signal);
    await this.abortable(() => this.bot.consume(), signal);
  }

  async execute(action, { signal, onProgress, collectionTimeoutMs = 180_000 }) {
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
      if (this.identity() !== identity) {
        local.abort(new Error('World or dimension changed.'));
        return;
      }
      if (
        this.bot.food <= 16 &&
        action.type !== 'eat' &&
        this.bot.inventory.items().some((item) => SAFE_FOOD.has(item.name))
      ) {
        reflexBusy = true;
        interruptedForFood = true;
        local.abort(new Error('Interrupted to eat.'));
        eatingTask = this.eat(scopedSignal).finally(() => {
          reflexBusy = false;
        });
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
    const guard = setInterval(() => {
      check().catch((error) => local.abort(error));
    }, 250);
    try {
      const outcome = await this.perform(action, { signal: combined, onProgress, collectionTimeoutMs });
      return typeof outcome === 'object' && outcome ? outcome : { message: outcome || 'Completed.' };
    } catch (error) {
      if (interruptedForFood && !scopedSignal.aborted) {
        clearInterval(guard);
        await eatingTask;
        this.survival = 'Ate food; replan from current state';
        // Restart from the current inventory/position without duplicating a collection quota.
        throw withContainer(new Error('Interrupted to eat. Food consumed; replan from fresh state.'), error?.container);
      }
      if (interruptedForSurvival && !scopedSignal.aborted) {
        clearInterval(guard);
        this.stop();
        const home = this.homes[identity];
        if (home) {
          this.survival = 'Low health: retreating home';
          onProgress(this.survival);
          const retreatSignal = AbortSignal.any([scopedSignal, AbortSignal.timeout(60_000)]);
          await this.goTo(
            home,
            retreatSignal,
            action.type === 'collect' ? this.collectMovements : this.movements,
          ).catch((retreatError) => {
            if (scopedSignal.aborted) throw scopedSignal.reason;
            this.survival = `Retreat failed: ${retreatError.message}`;
          });
        } else this.survival = 'Low health; no saved shelter';
        throw withContainer(
          new Error('Action interrupted for survival. Check health and shelter before continuing.'),
          error?.container,
        );
      }
      // timers/promises rejects with a generic AbortError; report why control ended (e.g. death) instead.
      // A cancelled transfer keeps the container it reported, because items may already have moved.
      throw scopedSignal.aborted ? withContainer(scopedSignal.reason, error?.container) : error;
    } finally {
      clearInterval(guard);
      if (!eatingTask) this.stop();
      this.activeAction = false;
    }
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
        const onReset = (reason) => {
          if (reason !== 'stuck') return;
          const { x, y, z } = this.bot.entity.position.floored();
          stalled.abort(new Error(`Navigation got stuck near ${x} ${y} ${z}.`));
        };
        this.bot.on('path_reset', onReset);
        try {
          await this.abortable(() => this.bot.pathfinder.goto(goal), AbortSignal.any([signal, stalled.signal]));
          break;
        } catch (error) {
          if (signal.aborted || !stalled.signal.aborted) throw error;
          // Stalls far apart are separate obstacles; only repeated stalls in one place fail the trip.
          const here = this.bot.entity.position.clone();
          if (lastStall && lastStall.distanceTo(here) > 2) hops = 0;
          lastStall = here;
          if (hops >= 2) throw error;
        } finally {
          this.bot.off('path_reset', onReset);
        }
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
        throw new Error(
          `Could not reach ${goal.x} ${goal.y} ${goal.z}; stopped ${current.distanceTo(position).toFixed(1)} blocks away.`,
        );
      }
    } finally {
      if (movements !== this.movements) this.bot.pathfinder.setMovements(this.movements);
    }
  }

  // Unreachable blocks (high in trees) cost the pathfinder's whole planning budget; nearby reachable ones plan in well under a second.
  async approach(position, signal, patient = false) {
    const thinkTimeout = this.bot.pathfinder.thinkTimeout;
    if (!patient) this.bot.pathfinder.thinkTimeout = 2000;
    try {
      await this.abortable(
        () => this.bot.pathfinder.goto(new goals.GoalGetToBlock(position.x, position.y, position.z)),
        signal,
      );
    } finally {
      this.bot.pathfinder.thinkTimeout = thinkTimeout;
    }
  }

  // A drop falls straight down from the mined block; walk to where it lands rather than to the block, which may be in the air.
  // An uncollected drop is not a failure, so give up after a few seconds and keep collecting.
  async pickUpDrop(position, collected, signal) {
    let landing = position;
    while (landing.y > position.y - 16 && this.bot.blockAt(landing.offset(0, -1, 0))?.boundingBox === 'empty')
      landing = landing.offset(0, -1, 0);
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
    await this.goTo(landing, bounded).catch(() => signal.throwIfAborted());
    for (let waited = 0; !collected() && waited < 750; waited += 250) await delay(250, undefined, { signal });
  }

  async returnFromCollection(start, signal) {
    signal.throwIfAborted();
    if (start.distanceTo(this.bot.entity.position) <= 2) return true;
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(60_000)]);
    // Reserve time for digging out if walking stalls instead of failing promptly.
    for (const movements of [this.movements, this.collectMovements]) {
      const attempt = movements === this.movements ? AbortSignal.any([bounded, AbortSignal.timeout(20_000)]) : bounded;
      try {
        await this.goTo(start, attempt, movements);
        return true;
      } catch {
        signal.throwIfAborted();
        if (bounded.aborted) break;
      }
    }
    return false;
  }

  async perform(action, { signal, onProgress, collectionTimeoutMs = 180_000 }) {
    switch (action.type) {
      case 'set_home':
        this.homes[this.identity()] = {
          x: this.bot.entity.position.x,
          y: this.bot.entity.position.y,
          z: this.bot.entity.position.z,
        };
        await writePrivateJson(this.homesFile, this.homes);
        return;
      case 'home': {
        const home = this.homes[this.identity()];
        if (!home) throw new Error('No home saved for this server, player, and dimension.');
        await this.goTo(home, signal);
        return;
      }
      case 'goto':
        await this.goTo(action, signal);
        return;
      case 'eat':
        await this.eat(signal);
        return;
      case 'deposit':
        return this.deposit(action, signal);
      case 'withdraw':
        return this.withdraw(action, signal);
      case 'craft':
        return this.craft(action, signal, onProgress);
      case 'inspect_storage':
        return this.inspectStorage(signal, action.containers);
      case 'wait':
        await delay(action.seconds * 1000, undefined, { signal });
        return;
      case 'collect': {
        const name = action.block.replace('minecraft:', '');
        if (!COLLECT_BLOCKS.has(name))
          throw new Error(`Supported collection targets: ${[...COLLECT_BLOCKS].join(', ')}`);
        const blockId = this.bot.registry.blocksByName[name]?.id;
        if (blockId === undefined) throw new Error(`Block ${name} is unavailable in this Minecraft version.`);
        const harvestTools = this.bot.registry.blocksByName[name].harvestTools;
        const requireTool = () => {
          if (harvestTools && !this.bot.inventory.items().some((item) => harvestTools[item.type]))
            throw new Error(`A suitable harvesting tool is required to collect ${name}; cobblestone needs a pickaxe.`);
        };
        requireTool();
        const count = () =>
          this.bot.inventory
            .items()
            .filter((item) => item.name === name)
            .reduce((sum, item) => sum + item.count, 0);
        const target = count() + action.count;
        // Pickups only land in the 36 main slots (items() and emptySlotCount() exclude armor, offhand, and crafting);
        // a partial stack of the target with room still counts as space.
        const stackSize = this.bot.registry.itemsByName[name]?.stackSize ?? 64;
        const hasRoom = () => {
          const items = this.bot.inventory.items();
          const empty =
            typeof this.bot.inventory.emptySlotCount === 'function'
              ? this.bot.inventory.emptySlotCount()
              : 36 - items.length;
          return empty > 0 || items.some((item) => item.name === name && item.count < (item.stackSize ?? stackSize));
        };
        const inventoryFull = () =>
          new Error(
            `Inventory full; collected ${Math.max(0, count() - target + action.count)} of ${action.count} ${name}.`,
          );
        const start = this.bot.entity.position.clone();
        const failed = new Set();
        // Blocks whose path took too long to plan; retried with the full planning budget once quicker ones run out.
        const slow = new Set();
        let collectionError;
        // Only the mining phase expires here. The session signal still cancels both mining and recovery immediately.
        const miningDeadline = AbortSignal.timeout(collectionTimeoutMs);
        const miningSignal = AbortSignal.any([signal, miningDeadline]);
        try {
          while (count() < target) {
            miningSignal.throwIfAborted();
            requireTool();
            if (!hasRoom()) throw inventoryFull();
            const positions = this.bot.findBlocks({ matching: blockId, maxDistance: 48, count: 64 });
            positions.sort((a, b) => a.distanceTo(this.bot.entity.position) - b.distanceTo(this.bot.entity.position));
            const candidates = positions.filter((pos) => !failed.has(pos.toString()));
            const position = candidates.find((pos) => !slow.has(pos.toString())) || candidates[0];
            if (!position) throw new Error('No reachable matching blocks remain in loaded chunks.');
            const patient = slow.has(position.toString());
            // A single block can stall the pathfinder for a minute or more; skip it and try another.
            const step = AbortSignal.any([miningSignal, AbortSignal.timeout(20_000)]);
            try {
              await this.approach(position, step, patient);
              const block = this.bot.blockAt(position);
              if (!block || block.type !== blockId) continue;
              const tool = this.bot.pathfinder.bestHarvestTool(block);
              if (tool) await this.abortable(() => this.bot.equip(tool, 'hand'), step);
              if (!this.bot.canDigBlock(block)) {
                failed.add(position.toString());
                continue;
              }
              // Items picked up on the way can take the last slot; never break a block whose drop cannot be kept.
              if (!hasRoom()) continue;
              const before = count();
              await this.abortable(() => this.bot.dig(block), step);
              // A drop the inventory cannot take is not worth walking to; the next pass reports the full inventory.
              if (hasRoom()) await this.pickUpDrop(position, () => count() > before, step);
              onProgress(`Inventory: ${count()}/${target}`);
            } catch (error) {
              miningSignal.throwIfAborted();
              (!patient && /Took to long to decide path/.test(error.message) ? slow : failed).add(position.toString());
            }
          }
        } catch (error) {
          // Handoff, death, and survival interrupts must never start a recovery trip.
          signal.throwIfAborted();
          collectionError = miningDeadline.aborted
            ? new Error('Collection timed out before reaching the requested quota.')
            : error;
        }
        // Mining often digs downward; return so later navigation, which cannot dig, is not trapped in a pit.
        const moved = start.distanceTo(this.bot.entity.position) > 2;
        if (moved)
          onProgress(
            `${collectionError ? 'Collection failed' : 'Collected requested items'}; returning to where collection started.`,
          );
        const returned = await this.returnFromCollection(start, signal);
        if (collectionError)
          throw new Error(
            `${collectionError.message} Inventory: ${count()}/${target}. ${returned ? 'Returned to the starting point.' : 'Could not return to the starting point.'}`,
          );
        if (!returned)
          throw new Error(
            `Collected requested items (inventory: ${count()}/${target}), but could not return to the starting point.`,
          );
        return moved ? 'Collected requested items and returned to the starting point.' : 'Collected requested items.';
      }
    }
  }

  async reachContainer(position, signal, scoped = false) {
    const block = this.bot.blockAt(position);
    if (!block || !CONTAINERS.has(block.name))
      throw new Error(`The container at ${position.x} ${position.y} ${position.z} is gone.`);
    if (this.bot.entity.position.distanceTo(position) > 16)
      throw new Error(
        scoped
          ? `Storage inspection requires the requested containers to be within 16 blocks; the ${block.name} at ${position.x} ${position.y} ${position.z} is farther. Return near it before finishing.`
          : 'Storage inspection requires all previously opened containers to be within 16 blocks. Return near storage before finishing.',
      );
    if (!(await this.walkIntoReach(position, signal)))
      throw new Error(`Could not reach the ${block.name} at ${position.x} ${position.y} ${position.z}.`);

    signal.throwIfAborted();
    const current = this.bot.blockAt(position);
    if (!current || !CONTAINERS.has(current.name))
      throw new Error('The container disappeared before it could be opened.');
    return current;
  }

  // Walks (never digs) until the block is within reach, 4 blocks from the eyes; returns whether it is.
  async walkIntoReach(position, signal) {
    // Use the block from wherever it is in reach; a walk to an adjacent block can fail beside furniture and walls.
    const inReach = () => this.bot.entity.position.offset(0, 1.62, 0).distanceTo(position.offset(0.5, 0.5, 0.5)) <= 4;
    // The pathfinder can give up planning ("Took to long to decide path") after walking most of the way; judge by reach.
    for (let attempt = 0; attempt < 2 && !inReach(); attempt++) {
      await this.abortable(
        () => this.bot.pathfinder.goto(new goals.GoalGetToBlock(position.x, position.y, position.z)),
        signal,
      ).catch((error) => {
        if (signal.aborted) throw error;
      });
    }
    return inReach();
  }

  // A requested position names a known record by its key or any current member, so either half of a double chest selects it once.
  requestedContainers(known, requested) {
    const records = new Map();
    for (const { x, y, z } of requested) {
      const record = Object.values(known).find((candidate) =>
        [candidate, ...(candidate.members || [])].some((at) => at.x === x && at.y === y && at.z === z),
      );
      if (!record) {
        const block = this.bot.blockAt(new Vec3(x, y, z));
        if (block && !CONTAINERS.has(block.name)) throw new Error(`There is no chest or barrel at ${x} ${y} ${z}.`);
        throw new Error(
          `The container at ${x} ${y} ${z} has not been opened in this session, so it has no contents to refresh.`,
        );
      }
      records.set(`${record.x},${record.y},${record.z}`, record);
    }
    return [...records.values()];
  }

  async inspectStorage(signal, requested) {
    // Never substitute cached contents when a required container is gone, blocked, or out of reach.
    const known = this.normalizeContainers();
    const records = requested ? this.requestedContainers(known, requested) : Object.values(known);
    const start = this.bot.entity.position.clone();
    for (const record of records) {
      signal.throwIfAborted();
      const position = new Vec3(record.x, record.y, record.z);
      const block = await this.reachContainer(position, signal, !!requested);
      await this.abortable(async () => {
        const window = await this.openContainer(block);
        try {
          signal.throwIfAborted();
          this.recordContainer(position, block.name, window);
        } finally {
          window.close();
        }
      }, signal);
    }
    // Inspection must not silently invalidate a completed return-home task.
    if (start.distanceTo(this.bot.entity.position) > 2) await this.goTo(start, signal);
    return requested
      ? 'Refreshed the requested storage from the server.'
      : 'Refreshed previously opened storage from the server.';
  }

  async deposit(action, signal) {
    const name = action.item.replace('minecraft:', '');
    const type = this.bot.registry.itemsByName[name]?.id;
    if (type === undefined) throw new Error(`Unknown item ${name}.`);
    const held = () =>
      this.bot.inventory
        .items()
        .filter((item) => item.name === name)
        .reduce((sum, item) => sum + item.count, 0);
    const before = held();
    if (before === 0) throw new Error(`No ${name} in inventory to deposit.`);
    if (action.count > before) throw new Error(`Only ${before} ${name} in inventory; cannot deposit ${action.count}.`);
    const amount = action.count ?? before;
    const target = this.nearbyContainers()[0];
    if (!target) throw new Error('No chest or barrel within 16 blocks. Move near storage first.');
    const { position } = target;
    const block = await this.reachContainer(position, signal);
    let depositError;
    let deposited = 0;
    // Set once the window opens: where items went and that container's live contents just before this deposit.
    let container;
    // Count from the container: after a failed click, leftovers sit on the cursor until the window closes.
    const stored = (window) =>
      window
        .containerItems()
        .filter((item) => item.type === type)
        .reduce((sum, item) => sum + item.count, 0);
    await this.abortable(async () => {
      const window = await this.openContainer(block);
      const initial = stored(window);
      container = {
        name: `minecraft:${block.name}`,
        x: position.x,
        y: position.y,
        z: position.z,
        before: windowContents(window),
      };
      try {
        this.recordContainer(position, block.name, window);
        // Move one stack per click sequence so handoff stops the transfer between stacks (16 for pearls, 1 for tools).
        const stack = this.bot.registry.items[type].stackSize;
        for (let remaining = amount; remaining > 0; remaining -= Math.min(stack, remaining)) {
          signal.throwIfAborted();
          await window.deposit(type, null, Math.min(stack, remaining));
        }
      } catch (error) {
        depositError = error;
      } finally {
        deposited = stored(window) - initial;
        this.recordContainer(position, block.name, window);
        window.close();
      }
    }, signal).catch((error) => {
      throw withContainer(error, container);
    });
    const where = `${block.name} at ${position.x} ${position.y} ${position.z}`;
    if (depositError?.message === 'destination full')
      throw withContainer(new Error(`The ${where} is full; deposited ${deposited} of ${amount} ${name}.`), container);
    if (depositError) throw withContainer(depositError, container);
    return { message: `Deposited ${deposited} ${name} into the ${where}.`, container };
  }

  // The nearest container within 16 blocks last seen holding the item, else the nearest one whose contents are unknown.
  withdrawSource(item) {
    const here = this.bot.entity.position;
    const known = this.normalizeContainers();
    const holding = Object.values(known)
      .map((record) => ({ record, position: new Vec3(record.x, record.y, record.z) }))
      .filter(
        ({ record, position }) =>
          record.items?.some((stack) => stack.name === item && stack.count > 0) &&
          here.distanceTo(position) <= 16 &&
          CONTAINERS.has(this.bot.blockAt(position)?.name),
      )
      .sort((a, b) => here.distanceTo(a.position) - here.distanceTo(b.position));
    if (holding.length) return holding[0];
    // A record whose inventory merged or split has no current contents either, so it counts as unopened.
    return this.nearbyContainers().find(({ position }) => !known[position.toString()]?.items);
  }

  async withdraw(action, signal) {
    const name = action.item.replace('minecraft:', '');
    const type = this.bot.registry.itemsByName[name]?.id;
    if (type === undefined) throw new Error(`Unknown item ${name}.`);
    const source = this.withdrawSource(action.item);
    if (!source)
      throw new Error(
        `No chest or barrel within 16 blocks is known to hold ${name}, and none nearby is unopened. Move near storage that holds it first.`,
      );
    const { position } = source;
    const block = await this.reachContainer(position, signal);
    const where = `${block.name} at ${position.x} ${position.y} ${position.z}`;
    const stackSize = this.bot.registry.items[type].stackSize;
    let withdrawError;
    let withdrawn = 0;
    let available = 0;
    let requested = action.count;
    // Set once the window opens: where items came from and that container's live contents just before this withdrawal.
    let container;
    // Count from the container, never the click API: a failed click can leave items on the cursor until the window closes.
    const stored = (window) =>
      window
        .containerItems()
        .filter((item) => item.type === type)
        .reduce((sum, item) => sum + item.count, 0);
    await this.abortable(async () => {
      const window = await this.openContainer(block);
      available = stored(window);
      requested ??= available;
      container = {
        name: `minecraft:${block.name}`,
        x: position.x,
        y: position.y,
        z: position.z,
        before: windowContents(window),
      };
      try {
        this.recordContainer(position, block.name, window);
        const goal = Math.min(requested, available);
        // One stack per click sequence, sized to the room left, so handoff stops between stacks and no click
        // leaves items on the cursor that closing the window would drop on the ground.
        for (let moved = 0; moved < goal; moved = available - stored(window)) {
          signal.throwIfAborted();
          const room = windowRoom(window, type, stackSize);
          if (room === 0) throw new Error('inventory full');
          const batch = Math.min(stackSize, goal - moved, room);
          await this.bot.transfer({
            window,
            itemType: type,
            metadata: null,
            count: batch,
            sourceStart: 0,
            sourceEnd: window.inventoryStart,
            destStart: window.inventoryStart,
            destEnd: window.inventoryEnd,
          });
          if (available - stored(window) === moved) throw new Error(`The ${where} released no ${name}.`);
        }
      } catch (error) {
        withdrawError = error;
      } finally {
        withdrawn = available - stored(window);
        this.recordContainer(position, block.name, window);
        window.close();
      }
    }, signal).catch((error) => {
      throw withContainer(error, container);
    });
    const fail = (message) => withContainer(new Error(message), container);
    if (['inventory full', 'destination full'].includes(withdrawError?.message))
      throw fail(`Inventory full; withdrew ${withdrawn} of ${requested} ${name}.`);
    if (withdrawError) throw withContainer(withdrawError, container);
    if (available === 0)
      throw fail(
        action.count === undefined
          ? `The ${where} holds no ${name}.`
          : `The ${where} holds no ${name}; withdrew 0 of ${requested} ${name}.`,
      );
    if (withdrawn < requested)
      throw fail(`The ${where} held only ${available} ${name}; withdrew ${withdrawn} of ${requested} ${name}.`);
    return { message: `Withdrew ${withdrawn} ${name} from the ${where}.`, container };
  }

  heldStacks() {
    return this.bot.inventory
      .items()
      .map((item) => ({ slot: item.slot, name: `minecraft:${item.name}`, count: item.count }));
  }

  nearestCraftingTable() {
    const id = this.bot.registry.blocksByName.crafting_table?.id;
    if (id === undefined) return null;
    const here = this.bot.entity.position;
    const positions = this.bot.findBlocks({ matching: id, maxDistance: 16, count: 8 });
    positions.sort((a, b) => a.distanceTo(here) - b.distanceTo(here));
    return positions.find((position) => position.distanceTo(here) <= 16) ?? null;
  }

  // Places a held crafting table on an empty block beside the player's feet, standing on solid ground.
  async placeCraftingTable(signal) {
    const item = this.bot.inventory.items().find((stack) => stack.name === 'crafting_table');
    const at = this.bot.entity.position;
    const feet = at.floored();
    // The player is 0.6 wide; a block overlapping that box cannot be placed.
    const clear = (cell) =>
      at.x + 0.3 <= cell.x || at.x - 0.3 >= cell.x + 1 || at.z + 0.3 <= cell.z || at.z - 0.3 >= cell.z + 1;
    const cell = BESIDE.map(([dx, dz]) => feet.offset(dx, 0, dz)).find(
      (cell) =>
        AIR.has(this.bot.blockAt(cell)?.name) &&
        this.bot.blockAt(cell.offset(0, -1, 0))?.boundingBox === 'block' &&
        clear(cell),
    );
    if (!cell)
      throw new Error('There is no free block with solid ground next to the player to place the crafting table on.');
    await this.abortable(() => this.bot.equip(item, 'hand'), signal);
    await this.abortable(() => this.bot.placeBlock(this.bot.blockAt(cell.offset(0, -1, 0)), new Vec3(0, 1, 0)), signal);
    if (this.bot.blockAt(cell)?.name !== 'crafting_table')
      throw new Error(`The crafting table was not placed at ${cell.x} ${cell.y} ${cell.z}.`);
    return cell;
  }

  // A vanilla recipe shape for one craft, with each ingredient cell filled from the items the allowlist plan consumes.
  // minecraft-data lists one shape per material, so a mix such as oak and birch planks needs its own copy.
  craftingRecipe(recipe, consume, withTable) {
    const registry = this.bot.registry;
    const name = (id) => `minecraft:${registry.items[id]?.name}`;
    const group = (id) => recipe.ingredients.find((ingredient) => ingredient.items.includes(name(id)));
    const cells = (template) => [...(template.inShape?.flat() ?? []), ...(template.ingredients ?? [])];
    const outputId = registry.itemsByName[recipe.output.replace('minecraft:', '')].id;
    const template = this.bot
      .recipesAll(outputId, null, withTable ? true : null)
      .find(
        (candidate) =>
          candidate.result.count === recipe.yield && cells(candidate).every((cell) => cell.id === -1 || group(cell.id)),
      );
    if (!template) throw new Error(`This Minecraft version has no ${recipe.output} recipe matching the allowlist.`);
    const pool = new Map(consume.map((entry) => [entry.name, entry.count]));
    const fill = (cell) => {
      if (cell.id === -1) return cell;
      const item = group(cell.id).items.find((candidate) => pool.get(candidate) > 0);
      pool.set(item, pool.get(item) - 1);
      return { ...cell, id: registry.itemsByName[item.replace('minecraft:', '')].id, metadata: null };
    };
    return {
      ...template,
      inShape: template.inShape?.map((row) => row.map(fill)) ?? null,
      ingredients: template.ingredients?.map(fill) ?? null,
    };
  }

  // Room for one craft's output in the main slots once that craft's ingredients are used up.
  craftRoom(recipe, consume) {
    const stacks = this.heldStacks().sort((a, b) => a.slot - b.slot);
    for (const { name, count } of consume) {
      let remaining = count;
      for (const stack of stacks.filter((stack) => stack.name === name)) {
        const taken = Math.min(stack.count, remaining);
        stack.count -= taken;
        remaining -= taken;
      }
    }
    const used = stacks.filter((stack) => stack.count > 0);
    const stackSize = this.bot.registry.itemsByName[recipe.output.replace('minecraft:', '')]?.stackSize ?? 64;
    return (
      (36 - used.length) * stackSize +
      used
        .filter((stack) => stack.name === recipe.output)
        .reduce((sum, stack) => sum + Math.max(0, stackSize - stack.count), 0)
    );
  }

  async craft(action, signal, onProgress = () => {}) {
    const recipe = RECIPES[action.item];
    const name = action.item.replace('minecraft:', '');
    if (!recipe) throw new Error(`${name} is not a supported crafting output.`);
    const crafts = craftsFor(recipe, action.count);
    const plan = planCraft(recipe, crafts, this.heldStacks());
    if (!plan.ok) throw new Error(`Missing ingredients for ${action.count} ${name}: ${describeMissing(plan.missing)}.`);
    let table = null;
    let placed = '';
    if (recipe.table) {
      let position = this.nearestCraftingTable();
      if (!position) {
        if (!this.bot.inventory.items().some((item) => item.name === 'crafting_table'))
          throw new Error(`Crafting ${name} needs a crafting table; none is within 16 blocks and none is held.`);
        position = await this.placeCraftingTable(signal);
        placed = `Placed a crafting table at ${position.x} ${position.y} ${position.z}. `;
        onProgress(placed.trim());
      }
      if (!(await this.walkIntoReach(position, signal)))
        throw new Error(`${placed}Could not reach the crafting table at ${position.x} ${position.y} ${position.z}.`);
      signal.throwIfAborted();
      table = this.bot.blockAt(position);
      if (table?.name !== 'crafting_table')
        throw new Error(`${placed}The crafting table at ${position.x} ${position.y} ${position.z} is gone.`);
    }
    const count = () =>
      this.heldStacks()
        .filter((stack) => stack.name === action.item)
        .reduce((sum, stack) => sum + stack.count, 0);
    const initial = count();
    const made = () => Math.max(0, count() - initial);
    for (let done = 0; done < crafts; done++) {
      // Cancellation, takeover, expiry, and stop are checked between crafts; completed crafts stay in the inventory.
      signal.throwIfAborted();
      const once = planCraft(recipe, 1, this.heldStacks());
      if (!once.ok)
        throw new Error(
          `${placed}Ran out of ingredients; crafted ${made()} of ${action.count} ${name}: ${describeMissing(once.missing)}.`,
        );
      // A result with nowhere to go would be dropped on the ground.
      if (this.craftRoom(recipe, once.consume) < recipe.yield)
        throw new Error(`${placed}Inventory full; crafted ${made()} of ${action.count} ${name}.`);
      const shaped = this.craftingRecipe(recipe, once.consume, !!table);
      await this.abortable(() => this.bot.craft(shaped, 1, table), signal).catch((error) => {
        if (signal.aborted) throw error;
        throw new Error(`${placed}Crafting ${name} failed after ${made()} of ${action.count}: ${error.message}`);
      });
      onProgress(`Crafted ${made()} of ${action.count} ${name}.`);
    }
    // Count from the inventory, not the craft calls; the last result can land a moment after its click is confirmed.
    for (let waited = 0; made() < action.count && waited < 1000; waited += 100) await delay(100, undefined, { signal });
    if (made() < action.count) throw new Error(`${placed}Crafted only ${made()} of ${action.count} ${name}.`);
    return `${placed}Crafted ${made()} ${name}.`;
  }

  close() {
    this.closing ??= (async () => {
      this.setControlled(false);
      this.stop();
      if (this.connected) {
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, 2000);
          this.bot.once('end', () => {
            clearTimeout(timer);
            resolve();
          });
          this.bot.quit('Agent bridge stopped.');
        });
      }
      await this.idleTask;
    })();
    return this.closing;
  }
}
