/**
 * Reads one cookie value from the raw Cookie header. Express 5 does not parse cookies, and the
 * session foundation needs only its own cookie, so no parser dependency is used. Returns
 * `undefined` when the cookie is absent; the first occurrence wins.
 */
export function readCookie(req, name) {
  const header = req.headers.cookie;
  if (typeof header !== 'string') return undefined;

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;

    const value = part.slice(separator + 1).trim();
    return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
  }
  return undefined;
}
