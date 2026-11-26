// A pausable loopback TCP forwarder between the Fabric development client and the runner's offline test server.
// The server runs in offline mode, so the stream is unencrypted, but nothing here parses it: bytes are forwarded in
// order, and a paused direction queues them until it is resumed. Holding the server's replies is how the takeover
// scenarios leave a container opening unanswered, which a loopback server otherwise answers within a tick.
import { connect as netConnect, createServer } from 'node:net';

/** `toServer` carries the client's packets; `toClient` carries the server's replies. */
export const DIRECTIONS = Object.freeze(['toServer', 'toClient']);

const directionsOf = (direction) => {
  if (direction === undefined || direction === 'both') return DIRECTIONS;
  if (!DIRECTIONS.includes(direction))
    throw new Error(`Unknown direction ${JSON.stringify(direction)}; use ${DIRECTIONS.join(', ')} or both.`);
  return [direction];
};

/**
 * Listens on `host` (an ephemeral port unless `listenPort` is given) and forwards each connection to
 * `targetHost`:`port`. `pause(direction)` holds that direction for every open and later connection; `resume`
 * delivers what was held, in order. When one side closes, the other side is ended once its held bytes are delivered.
 * `close()` stops listening and closes every connection at once.
 */
export async function startProxy({ port, targetHost = '127.0.0.1', host = '127.0.0.1', listenPort = 0 }) {
  const paused = { toServer: false, toClient: false };
  const delivered = { toServer: 0, toClient: 0 };
  const lanes = new Set();
  const sockets = new Set();
  let connections = 0;
  let open = 0;

  // One direction of one connection: source → destination, queued while paused or behind a queue.
  const lane = (direction, source, destination) => {
    const queue = [];
    let ended = false;
    let draining = false;
    const write = (chunk) => {
      delivered[direction] += chunk.length;
      // Backpressure: stop reading until the destination drains.
      if (!destination.write(chunk) && !draining) {
        draining = true;
        source.pause();
        destination.once('drain', () => {
          draining = false;
          source.resume();
        });
      }
    };
    const self = {
      direction,
      held: () => queue.reduce((sum, chunk) => sum + chunk.length, 0),
      flush() {
        if (destination.destroyed || destination.writableEnded) {
          queue.length = 0;
          return;
        }
        while (queue.length && !paused[direction]) write(queue.shift());
        if (ended && !queue.length && !paused[direction]) destination.end();
      },
    };
    source.on('data', (chunk) => {
      if (paused[direction] || queue.length) queue.push(chunk);
      else write(chunk);
    });
    // The source is done (an orderly end, a reset, or a failed connect): end the destination after the queue.
    const done = () => {
      if (ended) return;
      ended = true;
      self.flush();
    };
    source.on('end', done);
    source.on('close', done);
    lanes.add(self);
    return self;
  };

  const server = createServer((client) => {
    connections++;
    open++;
    const upstream = netConnect({ host: targetHost, port });
    const pair = [client, upstream];
    const own = [lane('toServer', client, upstream), lane('toClient', upstream, client)];
    let closing = pair.length;
    for (const socket of pair) {
      sockets.add(socket);
      socket.setNoDelay(true);
      socket.on('error', () => {});
      socket.on('close', () => {
        sockets.delete(socket);
        if (--closing > 0) return;
        open--;
        for (const each of own) lanes.delete(each);
      });
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(listenPort, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const stats = () => {
    const held = { toServer: 0, toClient: 0 };
    for (const each of lanes) held[each.direction] += each.held();
    return { connections, open, paused: { ...paused }, delivered: { ...delivered }, held };
  };
  return {
    host,
    port: server.address().port,
    target: { host: targetHost, port },
    /** Holds `toServer`, `toClient`, or both (the default). Returns the stats at the pause. */
    pause(direction) {
      for (const each of directionsOf(direction)) paused[each] = true;
      return stats();
    },
    /** Delivers what was held and forwards again. Returns the stats just before the release (what was held). */
    resume(direction) {
      const before = stats();
      for (const each of directionsOf(direction)) paused[each] = false;
      for (const each of lanes) each.flush();
      return before;
    },
    stats,
    async close() {
      paused.toServer = paused.toClient = false;
      const closed = new Promise((resolve) => server.close(() => resolve()));
      for (const socket of sockets) socket.destroy();
      await closed;
    },
  };
}
