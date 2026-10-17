import { randomUUID } from 'node:crypto';

export const REQUEST_ID_HEADER = 'X-Request-Id';

// Upstream IDs (e.g. from the gateway) are reused only when they are short and log-safe.
const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

export function requestId(req, res, next) {
  const incoming = req.get(REQUEST_ID_HEADER);
  req.id = incoming && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.set(REQUEST_ID_HEADER, req.id);
  next();
}
