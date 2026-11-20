import Joi from 'joi';

import { MAX_COUNT_QUERIES } from '../../database/conditionalCounts.js';

/**
 * The body of a module's `POST …/counts`: up to MAX_COUNT_QUERIES filter sets, each validated
 * by the same rules as that filter in the module's list query (`keys` taken from `listSchema`),
 * so a count accepts exactly the filters its list accepts. Pagination, sorting, search and
 * `createdBy` are not count filters. `fresh` skips the server's counts cache (Refresh).
 */
export function countsBodySchema(listSchema, keys) {
  const query = Joi.object(Object.fromEntries(keys.map((key) => [key, listSchema.extract(key)])));
  return Joi.object({
    queries: Joi.array().items(query).min(1).max(MAX_COUNT_QUERIES).required(),
    fresh: Joi.boolean().default(false),
  });
}
