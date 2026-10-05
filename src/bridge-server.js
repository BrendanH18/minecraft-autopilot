import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import { bridgeFile, profileFile, writePrivateJson } from './config.js';
import { claimBridge, assertBridgeNotRunning } from './runtime.js';

export async function startBridge(harness, { discoveryPath = bridgeFile, port = 0 } = {}) {
  await assertBridgeNotRunning(discoveryPath);
  const releaseClaim = await claimBridge(discoveryPath);
  const token = randomBytes(32).toString('hex');
  const server = createServer(async (request, response) => {
    const respond = (status, value) => {
      response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(value));
    };
    const supplied = Buffer.from(request.headers.authorization || '');
    const expected = Buffer.from(`Bearer ${token}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return respond(401, { error: 'Invalid bridge token.' });
    if ('origin' in request.headers) return respond(403, { error: 'Browser-origin requests are not supported.' });
    try {
      const path = new URL(request.url, 'http://127.0.0.1').pathname;
      if (request.method !== (path === '/v1/state' ? 'GET' : 'POST')) return respond(405, { error: 'Wrong HTTP method.' });
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 8192) { respond(413, { error: 'Request is too large.' }); request.resume(); return; }
        chunks.push(chunk);
      }
      const body = size ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
      respond(200, harness.request(path, body));
    } catch (error) { respond(400, { error: error.message }); }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); }); }
  catch (error) { await releaseClaim(); throw error; }
  const config = { protocol: 1, backend: harness.driver.observe().backend, url: `http://127.0.0.1:${server.address().port}`, token, pid: process.pid };
  try {
    await writePrivateJson(discoveryPath, config);
    if (discoveryPath === bridgeFile) await unlink(profileFile).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
  catch (error) { await new Promise(resolve => server.close(resolve)); await releaseClaim(); throw error; }
  let closing;
  return {
    config,
    close() {
      closing ??= (async () => {
        await harness.close();
        await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
        try { if (JSON.parse(await readFile(discoveryPath, 'utf8')).token === token) await unlink(discoveryPath); } catch {}
        await releaseClaim();
      })();
      return closing;
    },
  };
}
