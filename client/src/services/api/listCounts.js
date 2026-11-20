import { ApiError } from './apiClient.js'

// The most filter sets one counts request carries (the backend's limit).
export const MAX_COUNT_QUERIES = 60

// Blank filters are left out, as in a list call, so equal filter sets look equal.
const clean = (query) =>
  Object.fromEntries(
    Object.entries(query).filter(
      ([, value]) => value !== undefined && value !== null && value !== '',
    ),
  )

// POST <base>/counts: the list total of each filter set, in order, from one backend statement
// (dashboards). Each set takes the same filters as the module's list. `fresh` skips the
// backend's short counts cache (Refresh). Read-only; POST only because the sets travel in the body.
export async function postCounts(client, base, queries, { fresh = false, signal } = {}) {
  if (!Array.isArray(queries) || !queries.length || queries.length > MAX_COUNT_QUERIES)
    throw new ApiError(`Between 1 and ${MAX_COUNT_QUERIES} counts can be requested at once.`, {
      code: 'INVALID_PARAMS',
    })
  const result = await client.post(
    `${base}/counts`,
    { queries: queries.map(clean), ...(fresh && { fresh: true }) },
    { signal },
  )
  const counts = result?.data?.counts
  if (
    !Array.isArray(counts) ||
    counts.length !== queries.length ||
    !counts.every((value) => Number.isInteger(value) && value >= 0)
  )
    throw new ApiError('The server returned unexpected counts.', { code: 'INVALID_RESPONSE' })
  return counts
}
