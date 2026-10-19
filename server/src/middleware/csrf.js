import {
  ACTOR_TYPES,
  AUDIT_EVENTS,
  AUDIT_OUTCOMES,
} from '../modules/audit/securityAudit.service.js';
import { csrfTokenMatches } from '../modules/auth/session.service.js';
import { AppError } from '../shared/errors/AppError.js';
import { logger } from '../shared/logger/index.js';
import { requestContext } from './authenticate.js';

export const CSRF_HEADER = 'X-CSRF-Token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const csrfRejected = () =>
  new AppError(403, 'CSRF_REJECTED', 'The request could not be verified. Reload and try again.');

function originOf(value) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Origin verification for every state-changing request, including login (which has no session
 * yet and so cannot carry a synchronizer token). Browsers send Origin on cross-origin and
 * same-origin POSTs, so a present Origin (or Referer) must be the API's own origin or an
 * allowlisted origin, and Fetch Metadata `cross-site` is refused. Requests with neither header
 * come from non-browser clients, which cannot replay a victim's cookies.
 *
 * Behind a TLS-terminating gateway, TRUST_PROXY_HOPS must be set (or the public origin
 * allowlisted) so the API's own origin is computed with the external scheme and host.
 *
 * Rejections are logged operationally but not written to the security audit table: they carry
 * no session, and any client can forge these headers at volume.
 */
export function createOriginCheck({ allowedOrigins }) {
  const allowed = new Set(allowedOrigins);

  const reject = (req, next) => {
    logger.warn({ path: req.path, correlationId: req.id }, 'Cross-origin request rejected');
    next(csrfRejected());
  };

  return function originCheck(req, _res, next) {
    if (SAFE_METHODS.has(req.method)) return next();
    if (req.get('Sec-Fetch-Site') === 'cross-site') return reject(req, next);

    const header = req.get('Origin') ?? req.get('Referer');
    if (header === undefined) return next();

    const origin = originOf(header);
    const ownOrigin = `${req.protocol}://${req.get('host')}`;
    if (origin && (origin === ownOrigin || allowed.has(origin))) return next();
    reject(req, next);
  };
}

/**
 * Synchronizer-token check for authenticated state-changing requests. Must run after
 * `authenticate`; the expected token is derived from the session (see GET /api/v1/auth/csrf).
 * A mismatch from an authenticated session is recorded as ACCESS_DENIED.
 */
export function createRequireCsrfToken({ auditService }) {
  return async function requireCsrfToken(req, _res, next) {
    if (SAFE_METHODS.has(req.method)) return next();
    if (req.auth && csrfTokenMatches(req.auth.csrfToken, req.get(CSRF_HEADER))) return next();

    if (req.auth) {
      await auditService.recordIndependently({
        eventCode: AUDIT_EVENTS.ACCESS_DENIED,
        outcome: AUDIT_OUTCOMES.DENIED,
        actorType: ACTOR_TYPES.USER,
        actorUserId: req.auth.userId,
        subjectUserId: req.auth.userId,
        target: { type: 'USER_SESSION', id: req.auth.sessionId },
        reasonCode:
          req.get(CSRF_HEADER) === undefined ? 'CSRF_TOKEN_MISSING' : 'CSRF_TOKEN_INVALID',
        details: { method: req.method, path: req.baseUrl + req.path },
        context: requestContext(req),
      });
    }
    next(csrfRejected());
  };
}
