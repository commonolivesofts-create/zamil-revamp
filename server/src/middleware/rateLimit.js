import { AppError } from '../shared/errors/AppError.js';
import { logger } from '../shared/logger/index.js';

// Bound on tracked clients so a flood of distinct addresses cannot grow memory without limit.
const MAX_TRACKED_CLIENTS = 10000;

/**
 * Fixed-window limiter keyed by client IP (`req.ip`, which honours TRUST_PROXY_HOPS).
 *
 * State is held in this process only: each instance enforces its own limit and counts reset on
 * restart. It complements, and never replaces, the persistent per-account lockout. A shared or
 * gateway-level limiter is required when more than one instance serves traffic.
 */
export function createRateLimiter({ max, windowMs, now = Date.now }) {
  const clients = new Map();

  function prune(current) {
    for (const [key, entry] of clients) {
      if (entry.resetAt <= current) clients.delete(key);
    }
  }

  return function rateLimit(req, res, next) {
    const current = now();
    const key = req.ip ?? 'unknown';

    let entry = clients.get(key);
    if (!entry || entry.resetAt <= current) {
      if (clients.size >= MAX_TRACKED_CLIENTS) prune(current);
      if (clients.size >= MAX_TRACKED_CLIENTS) {
        // Still full of live windows: refuse rather than stop limiting.
        return next(rateLimited(res, windowMs));
      }
      entry = { count: 0, resetAt: current + windowMs };
      clients.set(key, entry);
    }

    entry.count += 1;
    if (entry.count > max) {
      if (entry.count === max + 1) {
        logger.warn({ path: req.path, correlationId: req.id }, 'Login rate limit exceeded');
      }
      return next(rateLimited(res, entry.resetAt - current));
    }
    next();
  };
}

function rateLimited(res, retryAfterMs) {
  res.set('Retry-After', String(Math.max(1, Math.ceil(retryAfterMs / 1000))));
  return new AppError(429, 'RATE_LIMITED', 'Too many attempts. Please wait and try again.');
}
