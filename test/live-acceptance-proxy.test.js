import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { connect, createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { startProxy } from '../scripts/live-acceptance/proxy.js';

/** A loopback server that records what each connection sent and lets the test write back. */
async function target() {
  const connections = [];
  const server = createServer((socket) => {
    const entry = { socket, received: [], ended: false };
    socket.on('data', (chunk) => entry.received.push(chunk));
    socket.on('end', () => {
      entry.ended = true;
    });
    socket.on('error', () => {});
    connections.push(entry);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: server.address().port,
    connections,
    close: () => {
      for (const { socket } of connections) socket.destroy();
      return new Promise((resolve) => server.close(resolve));
    },
  };
}

async function client(port) {
  const socket = connect({ host: '127.0.0.1', port });
  const received = [];
  let ended = false;
  let closed = false;
  socket.on('data', (chunk) => received.push(chunk));
  socket.on('end', () => {
    ended = true;
  });
  socket.on('close', () => {
    closed = true;
  });
  socket.on('error', () => {});
  await new Promise((resolve) => socket.once('connect', resolve));
  return {
    socket,
    bytes: () => Buffer.concat(received),
    ended: () => ended,
    closed: () => closed,
  };
}

async function until(condition, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await delay(5);
  }
}

const joined = (chunks) => Buffer.concat(chunks);

test('the proxy forwards bytes unchanged and in order in both directions', async (t) => {
  const server = await target();
  const proxy = await startProxy({ port: server.port });
  t.after(async () => {
    await proxy.close();
    await server.close();
  });
  assert.notEqual(proxy.port, server.port);
  const peer = await client(proxy.port);
  await until(() => server.connections.length === 1);
  const upstream = server.connections[0];
  const up = randomBytes(256 * 1024);
  const down = randomBytes(512 * 1024);
  // Many small writes, so ordering across chunks matters.
  for (let offset = 0; offset < up.length; offset += 4096) peer.socket.write(up.subarray(offset, offset + 4096));
  upstream.socket.write(down);
  await until(() => joined(upstream.received).length === up.length && peer.bytes().length === down.length);
  assert.ok(joined(upstream.received).equals(up));
  assert.ok(peer.bytes().equals(down));
  const stats = proxy.stats();
  assert.deepEqual(stats.delivered, { toServer: up.length, toClient: down.length });
  assert.deepEqual(stats.held, { toServer: 0, toClient: 0 });
  assert.equal(stats.connections, 1);
  assert.equal(stats.open, 1);
});

test('a paused direction holds the server replies until resumed, then delivers them in order', async (t) => {
  const server = await target();
  const proxy = await startProxy({ port: server.port });
  t.after(async () => {
    await proxy.close();
    await server.close();
  });
  const peer = await client(proxy.port);
  await until(() => server.connections.length === 1);
  const upstream = server.connections[0];

  upstream.socket.write(Buffer.from('before'));
  await until(() => peer.bytes().toString() === 'before');
  assert.deepEqual(proxy.pause('toClient').paused, { toServer: false, toClient: true });
  upstream.socket.write(Buffer.from('-held-1'));
  upstream.socket.write(Buffer.from('-held-2'));
  // The other direction still flows while the replies are held.
  peer.socket.write(Buffer.from('click'));
  await until(() => joined(upstream.received).toString() === 'click');
  await until(() => proxy.stats().held.toClient === 14);
  await delay(50);
  assert.equal(peer.bytes().toString(), 'before');

  const released = proxy.resume('toClient');
  assert.equal(released.held.toClient, 14);
  await until(() => peer.bytes().toString() === 'before-held-1-held-2');
  upstream.socket.write(Buffer.from('-after'));
  await until(() => peer.bytes().toString() === 'before-held-1-held-2-after');
  assert.deepEqual(proxy.stats().held, { toServer: 0, toClient: 0 });
  assert.equal(proxy.stats().delivered.toClient, 'before-held-1-held-2-after'.length);
});

test('pausing toServer or both holds the client packets, and later connections start paused', async (t) => {
  const server = await target();
  const proxy = await startProxy({ port: server.port });
  t.after(async () => {
    await proxy.close();
    await server.close();
  });
  proxy.pause('both');
  const peer = await client(proxy.port);
  await until(() => server.connections.length === 1);
  const upstream = server.connections[0];
  peer.socket.write(Buffer.from('up'));
  upstream.socket.write(Buffer.from('down'));
  await until(() => proxy.stats().held.toServer === 2 && proxy.stats().held.toClient === 4);
  assert.equal(upstream.received.length, 0);
  assert.equal(peer.bytes().length, 0);
  proxy.resume('toServer');
  await until(() => joined(upstream.received).toString() === 'up');
  assert.equal(peer.bytes().length, 0);
  proxy.resume();
  await until(() => peer.bytes().toString() === 'down');
  assert.throws(() => proxy.pause('sideways'), /Unknown direction "sideways"/);
});

test('an end from the server reaches the client only after the held bytes', async (t) => {
  const server = await target();
  const proxy = await startProxy({ port: server.port });
  t.after(async () => {
    await proxy.close();
    await server.close();
  });
  const peer = await client(proxy.port);
  await until(() => server.connections.length === 1);
  proxy.pause('toClient');
  server.connections[0].socket.end(Buffer.from('bye'));
  await until(() => proxy.stats().held.toClient === 3);
  await delay(50);
  assert.equal(peer.ended(), false);
  proxy.resume('toClient');
  await until(() => peer.ended());
  assert.equal(peer.bytes().toString(), 'bye');
  await until(() => proxy.stats().open === 0);
});

test('a client that disconnects closes its upstream connection, and close() shuts everything down', async (t) => {
  const server = await target();
  t.after(() => server.close());
  const proxy = await startProxy({ port: server.port });
  t.after(() => proxy.close());
  const first = await client(proxy.port);
  await until(() => server.connections.length === 1);
  first.socket.destroy();
  await until(() => server.connections[0].ended);
  await until(() => proxy.stats().open === 0);

  const second = await client(proxy.port);
  await until(() => server.connections.length === 2 && proxy.stats().open === 1);
  proxy.pause('toClient');
  server.connections[1].socket.write(Buffer.from('never delivered'));
  await until(() => proxy.stats().held.toClient > 0);
  await proxy.close();
  await until(() => second.closed() && proxy.stats().open === 0);
  assert.equal(second.bytes().length, 0);
  // Nothing listens on the proxy port any more.
  await assert.rejects(
    new Promise((resolve, reject) => {
      const socket = connect({ host: '127.0.0.1', port: proxy.port });
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', reject);
    }),
    /ECONNREFUSED/,
  );
});

test('a client is disconnected when the server cannot be reached', async (t) => {
  const server = await target();
  const port = server.port;
  await server.close();
  const proxy = await startProxy({ port });
  t.after(() => proxy.close());
  const peer = await client(proxy.port);
  await until(() => peer.closed());
  assert.equal(proxy.stats().open, 0);
});
