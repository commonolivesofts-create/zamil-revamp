import { Router } from 'express';
import { sendError, sendSuccess } from '../shared/responses/apiResponse.js';

/**
 * @param {object} options
 * @param {() => Promise<Record<string, boolean>>} options.checkReadiness Per-pool availability.
 * @param {number} options.cacheMs How long a readiness result is reused.
 */
export function createHealthRouter({ checkReadiness, cacheMs }) {
  const router = Router();
  let cached;
  let cachedAt = 0;
  let inFlight;

  // Concurrent probes share one in-flight check and results are reused briefly,
  // so frequent readiness requests cannot exhaust the Oracle pools.
  function readiness() {
    if (cached && Date.now() - cachedAt < cacheMs) return cached;

    inFlight ??= checkReadiness()
      .then((result) => {
        cached = result;
        cachedAt = Date.now();
        return result;
      })
      .finally(() => {
        inFlight = undefined;
      });
    return inFlight;
  }

  // Liveness only confirms the process can respond; it must never touch Oracle.
  router.get('/health/live', (_req, res) => {
    sendSuccess(res, { status: 'UP' });
  });

  router.get('/health/ready', async (_req, res) => {
    const pools = await readiness();
    const unavailable = Object.keys(pools).filter((name) => !pools[name]);

    if (unavailable.length > 0) {
      return sendError(res, 503, {
        code: 'SERVICE_UNAVAILABLE',
        message: 'The service is not ready',
        details: unavailable.map((name) => ({
          field: `database.${name}`,
          message: 'Database pool is unavailable',
        })),
      });
    }

    const database = Object.fromEntries(Object.keys(pools).map((name) => [name, 'UP']));
    sendSuccess(res, { status: 'READY', database });
  });

  return router;
}
