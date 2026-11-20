// Shared contract for every filtered, paginated list (replaces the CI3 get_X_list('total'|'list')
// pairs). Request: { page, limit, search, filters }. Response: { items, pagination }.
import { z } from 'zod';

export const PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 10;
/** Upper bound for one CSV export (CI3 exported without any limit). */
export const MAX_EXPORT_ROWS = 50_000;

/** Optional free-text filter: trimmed, max 100 characters, '' treated as "not set". */
export const textFilter = z
  .string()
  .trim()
  .max(100)
  .transform((value) => (value ? value : undefined))
  .optional();

/** Optional ISO date filter (YYYY-MM-DD), '' treated as "not set". */
export const dateFilter = z
  .union([z.iso.date(), z.literal('')])
  .transform((value) => (value ? value : undefined))
  .optional();

export function listQuerySchema<F extends z.ZodType>(filters: F) {
  return z.object({
    page: z.number().int().min(1).max(100_000).default(1),
    limit: z.number().int().min(1).max(100).default(DEFAULT_PAGE_SIZE),
    search: z.string().trim().max(100).default(''),
    filters: filters,
  });
}

/** Export uses the same filters and search, without paging. */
export function exportQuerySchema<F extends z.ZodType>(filters: F) {
  return z.object({
    search: z.string().trim().max(100).default(''),
    filters: filters,
  });
}

export const paginationSchema = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export type Pagination = z.infer<typeof paginationSchema>;

export function pagedSchema<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), pagination: paginationSchema });
}

export interface Paged<T> {
  items: T[];
  pagination: Pagination;
}

export function pageMeta(page: number, limit: number, total: number): Pagination {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}
