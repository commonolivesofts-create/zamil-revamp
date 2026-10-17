import assert from 'node:assert/strict';
import { once } from 'node:events';
import { describe, it, mock } from 'node:test';
import express from 'express';
import { shutdownGracefully } from '../src/shutdown.js';

async function startServer() {
  let releaseRequest;
  const app = express();
  app.get('/slow', (_req, res) => {
    releaseRequest = () => res.json({ done: true });
  });
  const server = app.listen(0);
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/slow`;
  return { server, url, release: () => releaseRequest() };
}

describe('graceful shutdown', () => {
  it('lets in-flight requests finish, then closes resources and exits 0', async () => {
    const { server, url, release } = await startServer();
    const order = [];
    const inFlight = fetch(url).then(async (res) => {
      order.push('request-completed');
      return res.json();
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const closeResources = mock.fn(async () => order.push('resources-closed'));
    const exitCode = shutdownGracefully({ server, closeResources, timeoutMs: 2000 });
    setTimeout(release, 50);

    assert.deepEqual(await inFlight, { done: true });
    assert.equal(await exitCode, 0);
    assert.deepEqual(order, ['request-completed', 'resources-closed']);
    assert.equal(server.listening, false);
  });

  it('exits 1 when the deadline is exceeded', async () => {
    const { server } = await startServer();

    const exitCode = await shutdownGracefully({
      server,
      closeResources: () => new Promise(() => {}),
      timeoutMs: 50,
    });

    assert.equal(exitCode, 1);
  });

  it('exits 1 when closing resources fails', async () => {
    const { server } = await startServer();

    const exitCode = await shutdownGracefully({
      server,
      closeResources: async () => {
        throw new Error('pool close failed');
      },
      timeoutMs: 1000,
    });

    assert.equal(exitCode, 1);
  });
});
