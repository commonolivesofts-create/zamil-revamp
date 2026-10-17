import { logger } from './shared/logger/index.js';

function closeServer(server) {
  return new Promise((resolve, reject) => {
    // close() only drops sockets idle at call time; keep-alive sockets whose in-flight
    // request finishes later would otherwise stay open until the keep-alive timeout.
    const sweep = setInterval(() => server.closeIdleConnections(), 100);
    server.close((error) => {
      clearInterval(sweep);
      if (error) reject(error);
      else resolve();
    });
  });
}

/**
 * Stops the HTTP server, then releases resources such as the Oracle pools, within a
 * bounded deadline. Resolves with the process exit code.
 */
export async function shutdownGracefully({ server, closeResources, timeoutMs }) {
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });

  try {
    const outcome = await Promise.race([closeServer(server).then(closeResources), deadline]);

    if (outcome === 'timeout') {
      logger.error({ timeoutMs }, 'Shutdown deadline exceeded; forcing exit');
      return 1;
    }
    logger.info('Graceful shutdown complete');
    return 0;
  } catch (error) {
    logger.error({ err: error }, 'Error during graceful shutdown');
    return 1;
  } finally {
    clearTimeout(timer);
  }
}
