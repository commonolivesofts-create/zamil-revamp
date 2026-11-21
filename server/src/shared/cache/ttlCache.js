/**
 * In-process cache with a time-to-live per entry and least-recently-used eviction once
 * `maxEntries` is reached, so memory stays bounded. A Map keeps insertion order: reading an
 * entry moves it to the end, and the first key is always the least recently used.
 *
 * Per-process only: with several server instances each keeps its own copy, which is acceptable
 * for short-lived read caches (dashboard counts). Never cache authorization decisions here.
 */
export function createTtlCache({ ttlMs, maxEntries, now = () => Date.now() }) {
  if (!Number.isInteger(ttlMs) || ttlMs < 0)
    throw new Error('ttlMs must be a non-negative integer');
  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new Error('maxEntries must be a positive integer');
  }
  const entries = new Map();

  return Object.freeze({
    /** The live value of `key`, or undefined when missing or expired. */
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= now()) {
        entries.delete(key);
        return undefined;
      }
      entries.delete(key);
      entries.set(key, entry);
      return entry.value;
    },
    set(key, value) {
      if (ttlMs === 0) return;
      entries.delete(key);
      entries.set(key, { value, expiresAt: now() + ttlMs });
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
    },
    clear() {
      entries.clear();
    },
    get size() {
      return entries.size;
    },
  });
}
