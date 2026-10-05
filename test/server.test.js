import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import minecraftProtocol from 'minecraft-protocol';
import minecraftData from 'minecraft-data';
import { MineflayerDriver } from '../src/mineflayer-driver.js';
import { Harness } from '../src/harness.js';
import { testDirectory } from './helpers.js';

test('standalone driver authenticates to a local protocol fixture, observes identity, saves home, and releases on death', { timeout: 15_000 }, async t => {
  const directory = await testDirectory(t, 'server-');
  const data = minecraftData('1.21.1');
  const server = minecraftProtocol.createServer({ host: '127.0.0.1', port: 0, version: '1.21.1', 'online-mode': false, keepAlive: false, registryCodec: data.loginPacket.dimensionCodec });
  let peer;
  server.on('playerJoin', client => {
    peer = client;
    client.on('error', () => {});
    client.write('login', { ...data.loginPacket, entityId: 1 });
    client.write('position', { x: 0, y: 64, z: 0, yaw: 0, pitch: 0, flags: 0, teleportId: 1 });
    client.write('update_health', { health: 20, food: 20, foodSaturation: 5 });
  });
  await once(server, 'listening');
  let driver;
  let harness;
  t.after(async () => {
    if (harness) await harness.close(); else await driver?.close();
    for (const client of Object.values(server.clients)) client.socket.destroy();
    server.close();
    await rm(directory, { recursive: true, force: true });
  });
  driver = await MineflayerDriver.connect({ host: '127.0.0.1', port: server.socketServer.address().port, account: 'HarnessTest', auth: 'offline', version: '1.21.1' },
    { log: () => {}, timeoutMs: 5000, storageDirectory: directory });
  const state = driver.observe();
  assert.equal(state.player.name, 'HarnessTest');
  assert.equal(state.player.dimension, 'minecraft:overworld');
  assert.equal(state.player.health, 20);
  assert.equal(state.connected, true);
  const controller = new AbortController();
  await driver.execute({ type: 'set_home' }, { signal: controller.signal, onProgress: () => {} });
  assert.deepEqual(driver.observe().home, state.player.position);
  const saved = JSON.parse(await readFile(join(directory, 'server-homes.json'), 'utf8'));
  assert.equal(Object.keys(saved).length, 1);
  harness = new Harness(driver);
  const { randomUUID } = await import('node:crypto');
  harness.acquire(randomUUID());
  peer.write('update_health', { health: 0, food: 20, foodSaturation: 5 });
  await once(driver.bot, 'death');
  assert.equal(harness.observe().mode, 'manual');
  assert.equal(driver.bot.isAlive, false);
});
