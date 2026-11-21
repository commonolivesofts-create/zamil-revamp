/**
 * Dashboard counts through the shared counts cache. Every key carries the module and the
 * signed-in user, because each module scopes its rows by user (HR sees all, others their own),
 * so one user's figures are never served to another. Only the filter sets that are not cached
 * reach `load`, in one call. `fresh` (the dashboard's Refresh) skips cached values and stores
 * the new ones. Without a cache every call loads.
 */

// The same filter set in any key order gives the same key.
const canonical = (query) =>
  JSON.stringify(
    Object.keys(query)
      .sort()
      .map((key) => [key, query[key]]),
  );

export async function cachedCounts(cache, { module, userId, queries, fresh = false }, load) {
  if (!cache) return load(queries);
  const keys = queries.map((query) => `counts:${module}:${userId}:${canonical(query)}`);
  const values = keys.map((key) => (fresh ? undefined : cache.get(key)));
  const missing = [];
  const seen = new Map();
  keys.forEach((key, index) => {
    if (values[index] !== undefined || seen.has(key)) return;
    seen.set(key, missing.length);
    missing.push(queries[index]);
  });
  if (missing.length) {
    const loaded = await load(missing);
    for (const [key, position] of seen) cache.set(key, loaded[position]);
    keys.forEach((key, index) => {
      if (values[index] === undefined) values[index] = loaded[seen.get(key)];
    });
  }
  return values;
}
